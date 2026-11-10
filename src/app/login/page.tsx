"use client";
import { useState, type FormEvent } from "react";
export default function Page() {
  const [status, setStatus] = useState("");
  async function login(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("Signing in…");
    try {
      const password = new FormData(e.currentTarget).get("password");
      const r = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (r.ok) location.assign("/");
      else setStatus((await r.json()).error);
    } catch {
      setStatus("Sign-in unavailable");
    }
  }
  return (
    <section className="panel desk-card">
      <h1>Sign in to ITrade</h1>
      <form className="desk-form" onSubmit={login}>
        <label>
          Workspace password
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            maxLength={200}
          />
        </label>
        <button className="button">Sign in</button>
      </form>
      <p role="status">{status}</p>
    </section>
  );
}
