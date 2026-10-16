import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { z } from "zod";
import { createAuth } from "./auth";

export type SessionUser = { id: string; email: string; name: string };
export type AppEnv = { Bindings: Env; Variables: { userId: string; user: SessionUser } };

export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  const session = await createAuth(c.env).api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "unauthorized" }, 401);
  const { id, email, name } = session.user;
  c.set("userId", id);
  c.set("user", { id, email, name });
  await next();
});

/** Parses a JSON body against `schema`; on failure returns a 400 response instead. */
export async function parseBody<S extends z.ZodType>(
  c: Context<AppEnv>,
  schema: S,
): Promise<{ ok: true; data: z.output<S> } | { ok: false; response: Response }> {
  const json = await c.req.json().catch(() => undefined);
  const result = schema.safeParse(json);
  if (result.success) return { ok: true, data: result.data };
  return {
    ok: false,
    response: c.json({ error: "invalid_body", issues: result.error.issues }, 400),
  };
}

export const notFound = (c: Context<AppEnv>) => c.json({ error: "not_found" }, 404);
