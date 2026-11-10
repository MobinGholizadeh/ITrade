import webpush from "web-push";
import { getDb } from "./db";
import { readSettings } from "./settings-repository";
import { canTransition, priorityAllowed } from "../domain/alerts";
import { decryptSecret } from "./secrets";
import { marketOverview } from "./market-service";
import { runAnalysis } from "./ai-service";
import { serviceStatus } from "./market-service";
import { createAlert } from "./technical-service";
export async function transitionAlert(id: string, to: string) {
  const c = await getDb().connect();
  try {
    await c.query("BEGIN");
    const r = await c.query(
      "SELECT status FROM alerts WHERE id=$1 FOR UPDATE",
      [id],
    );
    if (!r.rows.length || !canTransition(r.rows[0].status, to))
      throw Error("Invalid lifecycle transition");
    await c.query("UPDATE alerts SET status=$2 WHERE id=$1", [id, to]);
    await c.query("INSERT INTO alert_events(alert_id,status) VALUES($1,$2)", [
      id,
      to,
    ]);
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
export async function processAlerts() {
  const { settings } = await readSettings();
  const quotes = await marketOverview();
  const alerts = await getDb().query(
    "SELECT * FROM alerts WHERE status IN('active','acknowledged') ORDER BY created_at LIMIT 200",
  );
  let aiCalls = 0;
  for (const a of alerts.rows) {
    if (new Date(a.expires_at).getTime() < Date.now()) {
      await transitionAlert(a.id, "expired").catch(() => {});
      continue;
    }
    const quote = quotes.find((q) => q.asset === a.asset);
    if (
      a.type === "macro_event_upcoming" &&
      Date.parse(a.evidence.eventAt) <= Date.now()
    ) {
      await transitionAlert(a.id, "resolved").catch(() => {});
      continue;
    }
    const independentNews =
      a.type === "important_news" &&
      a.evidence.news?.published &&
      Date.now() - Date.parse(a.evidence.news.published) < 86400000;
    const calendarFresh =
      a.type === "macro_event_upcoming" &&
      Date.now() - Date.parse(a.evidence.observedAt) < 3600000 &&
      Date.parse(a.evidence.eventAt) > Date.now();
    if (!quote?.fresh && !independentNews && !calendarFresh) continue;
    if (
      a.evidence.quote &&
      (a.evidence.quote.provider !== quote?.provider ||
        a.evidence.quote.currency !== quote?.currency)
    )
      continue;
    if (
      a.type === "zone_entered" &&
      a.evidence.rule &&
      (Number(quote?.price) < Number(a.evidence.rule.lower_price) ||
        Number(quote?.price) > Number(a.evidence.rule.upper_price))
    ) {
      await createAlert(
        `zone-exit:${a.id}`,
        a.asset,
        "zone_left",
        "medium",
        {
          quote,
          rule: a.evidence.rule,
          previousAlertId: a.id,
          note: "Price left the recorded watch area. A zone exit alone does not confirm a breakout or prescribe an action.",
        },
        settings.alertCooldownMinutes,
      );
      await transitionAlert(a.id, "resolved").catch(() => {});
      continue;
    }
    const t = a.evidence.technical;
    const latest = (
      await getDb().query(
        "SELECT data FROM technical_snapshots WHERE provider=$1 AND asset=$2 AND timeframe=$3",
        [
          quote?.provider ?? settings.marketProvider,
          a.asset,
          t?.timeframe ?? "4h",
        ],
      )
    ).rows[0]?.data;
    const close =
      latest?.ready &&
      Date.parse(latest.dataTimestamp) > Date.parse(t?.dataTimestamp ?? "")
        ? latest.close
        : null;
    const broken =
      (a.type === "breakout_watch" &&
        t?.resistance &&
        close !== null &&
        close < t.resistance) ||
      (a.type === "breakdown_watch" &&
        t?.support &&
        close !== null &&
        close > t.support);
    if (broken) {
      await transitionAlert(a.id, "invalidated").catch(() => {});
      continue;
    }
    if (
      !a.explanation &&
      a.explanation_attempts < 2 &&
      process.env.GEMINI_API_KEY &&
      aiCalls < { low: 1, balanced: 2, high: 3 }[settings.analysisIntensity] &&
      settings.dailyAiRequestBudget > 0
    ) {
      aiCalls++;
      await getDb().query(
        "UPDATE alerts SET explanation_attempts=explanation_attempts+1 WHERE id=$1",
        [a.id],
      );
      try {
        const analysis = await runAnalysis(
          {
            asset: a.asset,
            dataTimestamp: new Date(a.created_at).toISOString(),
            evidenceIds: [`alert:${a.id}`],
            alert: {
              id: a.id,
              type: a.type,
              createdAt: a.created_at,
              evidence: a.evidence,
            },
            currentQuote: quote ?? null,
          },
          "alert",
          "Explain why this recorded watch event triggered, based on its preserved evidence. Distinguish the historical trigger from current conditions. State confirmation, invalidation and risks.",
        );
        await getDb().query("UPDATE alerts SET explanation=$2 WHERE id=$1", [
          a.id,
          JSON.stringify(analysis),
        ]);
      } catch {
        /* Budget or provider failure never blocks the deterministic evidence. */
      }
    }
    if (
      settings.browserNotifications &&
      Date.now() - new Date(a.created_at).getTime() < 15 * 60000 &&
      priorityAllowed(a.priority, settings.minimumNotificationPriority) &&
      (
        await getDb().query(
          "SELECT enabled FROM asset_notification_preferences WHERE asset=$1",
          [a.asset],
        )
      ).rows[0]?.enabled !== false
    )
      await getDb().query(
        "INSERT INTO notification_deliveries(alert_id,subscription_id) SELECT $1,id FROM push_subscriptions ON CONFLICT DO NOTHING",
        [a.id],
      );
  }
  if (
    !settings.browserNotifications ||
    !process.env.VAPID_PUBLIC_KEY ||
    !process.env.VAPID_PRIVATE_KEY ||
    !process.env.VAPID_SUBJECT
  )
    return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "https://localhost",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
  const jobs = await getDb().query(
    "UPDATE notification_deliveries SET status='sending',claimed_at=now(),attempts=attempts+1 WHERE id IN (SELECT d.id FROM notification_deliveries d JOIN alerts a ON a.id=d.alert_id WHERE (d.status='pending' OR (d.status='sending' AND d.claimed_at<now()-interval '2 minutes')) AND d.next_attempt_at<=now() AND d.attempts<5 AND a.status='active' AND a.expires_at>now() AND a.created_at>now()-interval '15 minutes' ORDER BY d.id LIMIT 10 FOR UPDATE OF d SKIP LOCKED) RETURNING *",
  );
  for (const job of jobs.rows) {
    try {
      const r = await getDb().query(
        "SELECT s.data,a.asset,a.type,a.id,a.priority,a.evidence FROM push_subscriptions s JOIN alerts a ON a.id=$2 WHERE s.id=$1",
        [job.subscription_id, job.alert_id],
      );
      if (!r.rows.length) continue;
      const row = r.rows[0];
      const muted =
        (
          await getDb().query(
            "SELECT enabled FROM asset_notification_preferences WHERE asset=$1",
            [row.asset],
          )
        ).rows[0]?.enabled === false;
      const fresh = quotes.some(
        (q) =>
          q.asset === row.asset &&
          q.fresh &&
          (!row.evidence.quote ||
            (q.provider === row.evidence.quote.provider &&
              q.currency === row.evidence.quote.currency)),
      );
      const freshNews =
        row.type === "important_news" &&
        row.evidence.news?.published &&
        Date.now() - Date.parse(row.evidence.news.published) < 86400000;
      if (
        muted ||
        !priorityAllowed(row.priority, settings.minimumNotificationPriority) ||
        (!fresh && !freshNews)
      ) {
        await getDb().query(
          "UPDATE notification_deliveries SET status='pending',attempts=greatest(attempts-1,0),next_attempt_at=now()+interval '1 minute' WHERE id=$1",
          [job.id],
        );
        continue;
      }
      await webpush.sendNotification(
        decryptSecret(row.data) as webpush.PushSubscription,
        JSON.stringify({
          title: `ITrade · ${row.asset}`,
          body: row.type.replaceAll("_", " "),
          tag: row.id,
          url: "/alerts",
        }),
        { TTL: 300, timeout: 10000 },
      );
      await getDb().query(
        "UPDATE notification_deliveries SET status='delivered',delivered_at=now() WHERE id=$1",
        [job.id],
      );
      await serviceStatus(
        "notifications",
        "online",
        "Push service accepted delivery; device display depends on browser permission",
      );
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 410 || status === 404)
        await getDb().query("DELETE FROM push_subscriptions WHERE id=$1", [
          job.subscription_id,
        ]);
      else
        await getDb().query(
          "UPDATE notification_deliveries SET status=CASE WHEN attempts>=5 THEN 'failed' ELSE 'pending' END,next_attempt_at=now()+interval '1 minute'*power(2,attempts) WHERE id=$1",
          [job.id],
        );
    }
  }
}
