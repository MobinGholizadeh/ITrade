import { z } from "zod";
import { NextResponse } from "next/server";
import { allowedMutation, json } from "@/server/http";
import { readJsonBody } from "@/server/request-body";
import { readyRedis, getRedis } from "@/server/redis";
import { sessionToken, verifyPassword } from "@/server/auth";
export async function POST(req: Request) {
  if (!allowedMutation(req)) return json({ error: "Origin rejected" }, 403);
  try {
    const { password } = z
      .object({ password: z.string().min(1).max(200) })
      .strict()
      .parse(await readJsonBody(req, 2048));
    await readyRedis();
    const count = (await getRedis().eval(
      "local n=redis.call('INCR',KEYS[1]);if n==1 then redis.call('EXPIRE',KEYS[1],300) end;return n",
      1,
      "itrade:login:attempts",
    )) as number;
    if (count > 10)
      return json(
        { error: "Too many attempts. Try again in five minutes." },
        429,
      );
    if (
      !process.env.LOGIN_PASSWORD_HASH ||
      !process.env.SESSION_SECRET ||
      !verifyPassword(password, process.env.LOGIN_PASSWORD_HASH)
    )
      return json({ error: "Sign-in failed" }, 401);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(
      "itrade_session",
      sessionToken(process.env.SESSION_SECRET),
      {
        httpOnly: true,
        secure: process.env.APP_ORIGIN?.startsWith("https:") ?? false,
        sameSite: "strict",
        path: "/",
        maxAge: 8 * 3600,
      },
    );
    return response;
  } catch {
    return json({ error: "Sign-in unavailable" }, 400);
  }
}
export async function DELETE(req: Request) {
  if (!allowedMutation(req)) return json({ error: "Origin rejected" }, 403);
  const response = NextResponse.json({ ok: true });
  response.cookies.delete("itrade_session");
  return response;
}
