import { getEnv } from "./env";

export function allowedMutation(request: Request): boolean {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  return (
    origin === new URL(getEnv().APP_ORIGIN).origin &&
    (!fetchSite || fetchSite === "same-origin")
  );
}
export function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
