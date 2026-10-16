import { Hono } from "hono";
import { createAuth, enabledProviders } from "./auth";
import { type AppEnv, requireUser } from "./http";
import { applications, events } from "./routes/applications";
import { insights } from "./routes/insights";
import { mailSources } from "./routes/mail-sources";
import { messages } from "./routes/messages";
import { settingsRoutes } from "./routes/settings";

export const app = new Hono<AppEnv>().basePath("/api");

app.on(["GET", "POST"], "/auth/*", (c) => createAuth(c.env).handler(c.req.raw));
app.get("/health", (c) => c.json({ ok: true }));
app.get("/config", (c) =>
  c.json({ providers: enabledProviders(c.env), classifier: Boolean(c.env.ANTHROPIC_API_KEY) }),
);
app.get("/me", requireUser, (c) => c.json({ user: c.get("user") }));

app.route("/applications", applications);
app.route("/events", events);
app.route("/mail-sources", mailSources);
app.route("/messages", messages);
app.route("/settings", settingsRoutes);
app.route("/", insights);
