import { Hono } from "hono";
import { z } from "zod";
import { getDb } from "../db/client";
import { type AppEnv, notFound, parseBody, requireUser } from "../http";
import {
  createForwardingSource,
  listMailSources,
  type MailSource,
  rotateForwardingSource,
  setVerifiedMailbox,
} from "../repo/mail-sources";
import { latestConfirmation } from "../repo/messages";

export const mailSources = new Hono<AppEnv>().use(requireUser);

const present = async (env: Env, userId: string, s: MailSource) => ({
  id: s.id,
  kind: s.kind,
  status: s.status,
  address: s.addressToken ? `${s.addressToken}@${env.INBOUND_DOMAIN}` : null,
  providerHint: s.providerHint,
  verifiedMailbox: s.verifiedMailbox,
  /** Gmail's forwarding confirmation code, shown during setup. */
  confirmation: s.kind === "forwarding" ? await latestConfirmation(getDb(env), userId, s.id) : null,
  lastMessageAt: s.lastMessageAt,
  createdAt: s.createdAt,
});

mailSources.get("/", async (c) => {
  const userId = c.get("userId");
  const sources = await listMailSources(getDb(c.env), userId);
  return c.json({ sources: await Promise.all(sources.map((s) => present(c.env, userId, s))) });
});

mailSources.post("/forwarding", async (c) => {
  const source = await createForwardingSource(getDb(c.env), c.get("userId"), new Date());
  return c.json({ source: await present(c.env, c.get("userId"), source) }, 201);
});

mailSources.post("/:id/rotate", async (c) => {
  const source = await rotateForwardingSource(getDb(c.env), c.get("userId"), c.req.param("id"));
  return source ? c.json({ source: await present(c.env, c.get("userId"), source) }) : notFound(c);
});

const Patch = z.object({ verifiedMailbox: z.email().toLowerCase().nullable() }).strict();

/** The mailbox that forwards here. Gmail's confirmation sets it; others enter it by hand. */
mailSources.patch("/:id", async (c) => {
  const body = await parseBody(c, Patch);
  if (!body.ok) return body.response;
  const source = await setVerifiedMailbox(
    getDb(c.env),
    c.get("userId"),
    c.req.param("id"),
    body.data.verifiedMailbox,
  );
  return source ? c.json({ source: await present(c.env, c.get("userId"), source) }) : notFound(c);
});
