"use client";
import { useEffect, useState, type FormEvent } from "react";
import { AnalysisView } from "./asset-research";
import type { Analysis } from "@/domain/ai";
type Message = {
  role: string;
  content: Analysis & { text?: string; generatedBy?: string };
  created_at: string;
};
export function AnalystDesk() {
  const [conversations, setConversations] = useState<
      { id: string; title: string }[]
    >([]),
    [id, setId] = useState<string | null>(null),
    [messages, setMessages] = useState<Message[]>([]),
    [text, setText] = useState(""),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false);
  async function list() {
    const r = await fetch("/api/chat");
    if (r.ok) setConversations((await r.json()).conversations);
  }
  async function load(value: string) {
    setId(value);
    const r = await fetch(`/api/chat?id=${value}`);
    if (r.ok) setMessages((await r.json()).messages);
  }
  useEffect(() => {
    void list();
  }, []);
  async function send(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus("Retrieving current evidence and asking Gemini…");
    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: id, message: text }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      if (d.conversationId) await load(d.conversationId);
      setText("");
      setStatus(d.error ?? "");
      await list();
    } catch {
      setStatus("Analyst unavailable. Your question was not answered.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">RESEARCH WITH LIVE CONTEXT</div>
          <h1>
            AI analyst<span className="accent">.</span>
          </h1>
          <p>
            Ask about markets, news, your holdings and risk plan using the
            workspace’s latest available evidence.
          </p>
        </div>
      </div>
      <div className="desk-toolbar">
        <select
          aria-label="Conversation"
          value={id ?? ""}
          disabled={busy}
          onChange={(e) =>
            e.target.value
              ? void load(e.target.value)
              : (setId(null), setMessages([]))
          }
        >
          <option value="">New conversation</option>
          {conversations.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      </div>
      <section className="panel desk-card">
        {messages.map((m, i) => (
          <article className="desk-article" key={i}>
            <small>
              {m.role === "user"
                ? "You"
                : m.content.generatedBy === "data_guard"
                  ? "Data freshness guard"
                  : "Gemini"}{" "}
              · {new Date(m.created_at).toLocaleString()}
            </small>
            {m.content.summary ? (
              <AnalysisView analysis={m.content} />
            ) : (
              <p className="desk-message">{m.content.text}</p>
            )}
          </article>
        ))}
        {!messages.length && (
          <p className="desk-empty">
            Ask about current market structure, portfolio concentration, news,
            or the evidence behind a previous watch alert.
          </p>
        )}
        <form className="desk-form" onSubmit={send}>
          <label>
            Your research question
            <textarea
              maxLength={3000}
              required
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Compare ETH and SOL using the latest closed candles and news."
            />
          </label>
          <button className="button" disabled={busy || !text.trim()}>
            Ask analyst
          </button>
        </form>
        <p role="status">{status}</p>
      </section>
    </>
  );
}
