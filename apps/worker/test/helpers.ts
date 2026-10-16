import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { vi } from "vitest";
import { getDb } from "../src/db/client";
import { user } from "../src/db/schema";
import worker from "../src/index";

export const BASE = "http://localhost:8787";

export async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.method && init.method !== "GET") headers.set("origin", BASE);
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`${BASE}${path}`, { ...init, headers }), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

/** Signs in through the real magic-link flow and returns the session cookie. */
export async function signIn(email: string): Promise<string> {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    const res = await call("/api/auth/sign-in/magic-link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, callbackURL: "/" }),
    });
    if (!res.ok) throw new Error(`magic link request failed: ${res.status} ${await res.text()}`);
    const line = log.mock.calls
      .map((args) => String(args[0]))
      .find((l) => l.startsWith("[magic-link]"));
    const url = line?.split(": ").slice(1).join(": ");
    if (!url) throw new Error("magic link was not logged");

    const verify = await call(new URL(url).pathname + new URL(url).search, { redirect: "manual" });
    const cookie = verify.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    if (!cookie) throw new Error(`no session cookie (status ${verify.status})`);
    return cookie;
  } finally {
    log.mockRestore();
  }
}

export async function createUser(id: string, email: string): Promise<void> {
  const now = new Date();
  await getDb(env)
    .insert(user)
    .values({ id, email, name: email, emailVerified: true, createdAt: now, updatedAt: now });
}
