import { NextResponse, type NextRequest } from "next/server";
import { localOrigin, validSession } from "./server/auth";
import { readyRedis, getRedis } from "./server/redis";
export async function proxy(req: NextRequest) {
  const origin = process.env.APP_ORIGIN ?? "http://127.0.0.1:3000",
    expected = new URL(origin);
  if (req.headers.get("host") !== expected.host)
    return NextResponse.json({ error: "Host rejected" }, { status: 403 });
  if (
    req.nextUrl.pathname.startsWith("/api/") &&
    req.headers.get("sec-fetch-site") === "cross-site"
  )
    return NextResponse.json(
      { error: "Cross-site access rejected" },
      { status: 403 },
    );
  const requireAuth =
    process.env.REQUIRE_AUTH === "true" || !localOrigin(origin);
  const allowRequest = async () => {
    if (
      req.nextUrl.pathname.startsWith("/api/") &&
      !["GET", "HEAD", "OPTIONS"].includes(req.method)
    ) {
      try {
        await readyRedis();
        const count = (await getRedis().eval(
          "local n=redis.call('INCR',KEYS[1]);if n==1 then redis.call('EXPIRE',KEYS[1],90) end;return n",
          1,
          `itrade:write-limit:${Math.floor(Date.now() / 60000)}`,
        )) as number;
        if (count > 60)
          return NextResponse.json(
            { error: "Request limit reached; retry shortly" },
            { status: 429 },
          );
      } catch {
        return NextResponse.json(
          { error: "Mutation guard unavailable" },
          { status: 503 },
        );
      }
    }
    return NextResponse.next();
  };
  if (!requireAuth) return allowRequest();
  if (
    !process.env.LOGIN_PASSWORD_HASH ||
    !process.env.SESSION_SECRET ||
    process.env.SESSION_SECRET.length < 32 ||
    (!localOrigin(origin) && expected.protocol !== "https:")
  )
    return NextResponse.json(
      {
        error: "Public deployment requires HTTPS and configured authentication",
      },
      { status: 503 },
    );
  if (
    req.nextUrl.pathname === "/login" ||
    req.nextUrl.pathname === "/api/login"
  )
    return allowRequest();
  if (
    validSession(
      req.cookies.get("itrade_session")?.value,
      process.env.SESSION_SECRET,
    )
  )
    return allowRequest();
  return req.nextUrl.pathname.startsWith("/api/")
    ? NextResponse.json({ error: "Authentication required" }, { status: 401 })
    : NextResponse.redirect(new URL("/login", origin));
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
