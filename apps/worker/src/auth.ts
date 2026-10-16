import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";
import { getDb } from "./db/client";
import * as schema from "./db/schema";

/**
 * Better Auth needs the request's bindings, so an instance is created per request.
 * Sign-in methods: magic link always; Google and Microsoft when their secrets are set.
 */
export function createAuth(env: Env) {
  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    basePath: "/api/auth",
    database: drizzleAdapter(getDb(env), { provider: "sqlite", schema }),
    socialProviders: {
      ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
        : {}),
      ...(env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET
        ? {
            microsoft: {
              clientId: env.MICROSOFT_CLIENT_ID,
              clientSecret: env.MICROSOFT_CLIENT_SECRET,
              tenantId: "common",
            },
          }
        : {}),
    },
    plugins: [
      magicLink({
        expiresIn: 15 * 60,
        sendMagicLink: async ({ email, url }) => {
          // Real delivery (Cloudflare Email Service) lands in M2. Until then, development and the
          // single-user staging deployment log the link (visible to the account owner via
          // `wrangler tail`), and every other environment refuses.
          if (env.ENVIRONMENT !== "development" && env.ENVIRONMENT !== "staging") {
            throw new Error("Magic-link email delivery is not configured");
          }
          console.log(`[magic-link] ${email}: ${url}`);
        },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
