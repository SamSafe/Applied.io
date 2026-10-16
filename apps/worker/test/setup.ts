import { applyD1Migrations, reset } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, beforeEach } from "vitest";

// Every test starts from an empty, migrated database and empty buckets.
beforeEach(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

afterEach(async () => {
  await reset();
});
