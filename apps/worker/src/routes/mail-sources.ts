import { Hono } from "hono";
import { getDb } from "../db/client";
import { type AppEnv, notFound, requireUser } from "../http";
import {
  createForwardingSource,
  listMailSources,
  type MailSource,
  rotateForwardingSource,
} from "../repo/mail-sources";

export const mailSources = new Hono<AppEnv>().use(requireUser);

const present = (env: Env, s: MailSource) => ({
  id: s.id,
  kind: s.kind,
  status: s.status,
  address: s.addressToken ? `${s.addressToken}@${env.INBOUND_DOMAIN}` : null,
  providerHint: s.providerHint,
  lastMessageAt: s.lastMessageAt,
  createdAt: s.createdAt,
});

mailSources.get("/", async (c) => {
  const sources = await listMailSources(getDb(c.env), c.get("userId"));
  return c.json({ sources: sources.map((s) => present(c.env, s)) });
});

mailSources.post("/forwarding", async (c) => {
  const source = await createForwardingSource(getDb(c.env), c.get("userId"), new Date());
  return c.json({ source: present(c.env, source) }, 201);
});

mailSources.post("/:id/rotate", async (c) => {
  const source = await rotateForwardingSource(getDb(c.env), c.get("userId"), c.req.param("id"));
  return source ? c.json({ source: present(c.env, source) }) : notFound(c);
});
