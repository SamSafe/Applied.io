import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { createAuth } from "./auth";
import { getDb } from "./db/client";
import {
  createForwardingSource,
  listMailSources,
  type MailSource,
  rotateForwardingSource,
} from "./repo/mail-sources";

type SessionUser = { id: string; email: string; name: string };
type AppEnv = { Bindings: Env; Variables: { userId: string; user: SessionUser } };

const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  const session = await createAuth(c.env).api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "unauthorized" }, 401);
  const { id, email, name } = session.user;
  c.set("userId", id);
  c.set("user", { id, email, name });
  await next();
});

export const app = new Hono<AppEnv>().basePath("/api");

app.on(["GET", "POST"], "/auth/*", (c) => createAuth(c.env).handler(c.req.raw));

app.get("/health", (c) => c.json({ ok: true }));

app.get("/me", requireUser, (c) => c.json({ user: c.get("user") }));

const presentSource = (env: Env, s: MailSource) => ({
  id: s.id,
  kind: s.kind,
  status: s.status,
  address: s.addressToken ? `${s.addressToken}@${env.INBOUND_DOMAIN}` : null,
  providerHint: s.providerHint,
  lastMessageAt: s.lastMessageAt,
  createdAt: s.createdAt,
});

app.get("/mail-sources", requireUser, async (c) => {
  const sources = await listMailSources(getDb(c.env), c.get("userId"));
  return c.json({ sources: sources.map((s) => presentSource(c.env, s)) });
});

app.post("/mail-sources/forwarding", requireUser, async (c) => {
  const source = await createForwardingSource(getDb(c.env), c.get("userId"), new Date());
  return c.json({ source: presentSource(c.env, source) }, 201);
});

app.post("/mail-sources/:id/rotate", requireUser, async (c) => {
  const source = await rotateForwardingSource(getDb(c.env), c.get("userId"), c.req.param("id"));
  if (!source) return c.json({ error: "not_found" }, 404);
  return c.json({ source: presentSource(c.env, source) });
});
