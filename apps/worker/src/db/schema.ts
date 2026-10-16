import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// ── Better Auth tables (field names must match Better Auth's model) ──────────────────────

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
    scope: text("scope"),
    password: text("password"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

// ── Domain tables (docs/DATA_MODEL.md). Timestamps are ISO-8601 UTC text. ────────────────

export const mailSource = sqliteTable(
  "mail_source",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["forwarding", "gmail", "graph"] }).notNull(),
    addressToken: text("address_token").unique(),
    status: text("status", { enum: ["awaiting_first_mail", "active", "revoked"] }).notNull(),
    providerHint: text("provider_hint"),
    verifiedMailbox: text("verified_mailbox"),
    credentials: text("credentials"),
    lastMessageAt: text("last_message_at"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("mail_source_user_idx").on(t.userId)],
);

export const application = sqliteTable(
  "application",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    company: text("company").notNull(),
    companyKey: text("company_key").notNull(),
    companyDomain: text("company_domain"),
    position: text("position").notNull(),
    positionKey: text("position_key").notNull(),
    reqNumber: text("req_number"),
    ats: text("ats"),
    atsJobRef: text("ats_job_ref"),
    location: text("location"),
    url: text("url"),
    source: text("source"),
    notes: text("notes"),
    createdVia: text("created_via", { enum: ["manual", "email"] }).notNull(),
    createdAt: text("created_at").notNull(),
    /** When the user last opened this application; email events recorded later are "new". */
    seenAt: text("seen_at"),
  },
  (t) => [
    index("application_user_idx").on(t.userId),
    index("application_user_company_idx").on(t.userId, t.companyKey),
  ],
);

export const message = sqliteTable(
  "message",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    sourceId: text("source_id")
      .notNull()
      .references(() => mailSource.id, { onDelete: "cascade" }),
    receivedAt: text("received_at").notNull(),
    rawKey: text("raw_key"),
    headerMessageId: text("header_message_id"),
    fromAddress: text("from_address"),
    fromDomain: text("from_domain"),
    subject: text("subject"),
    sentAt: text("sent_at"),
    senderVerified: integer("sender_verified", { mode: "boolean" }).notNull().default(false),
    status: text("status", {
      enum: ["received", "filtered_out", "needs_review", "applied", "ignored", "failed"],
    }).notNull(),
    classification: text("classification", { mode: "json" }),
    classifierVersion: text("classifier_version"),
    model: text("model"),
    evidence: text("evidence"),
    applicationId: text("application_id").references(() => application.id, {
      onDelete: "set null",
    }),
    // No FK: event.message_id already points back here, and a cycle buys nothing.
    eventId: text("event_id"),
    review: text("review", { mode: "json" }),
    failure: text("failure"),
    purgeAfter: text("purge_after").notNull(),
  },
  (t) => [
    index("message_user_status_idx").on(t.userId, t.status),
    index("message_purge_idx").on(t.purgeAfter),
    uniqueIndex("message_user_header_id_uq")
      .on(t.userId, t.headerMessageId)
      .where(sql`${t.headerMessageId} IS NOT NULL`),
  ],
);

export const event = sqliteTable(
  "event",
  {
    id: text("id").primaryKey(),
    applicationId: text("application_id")
      .notNull()
      .references(() => application.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: text("type", { enum: ["applied", "advanced", "closed", "noted", "voided"] }).notNull(),
    stage: text("stage", { enum: ["screen", "interview", "final", "offer"] }),
    outcome: text("outcome", { enum: ["rejected", "withdrawn", "accepted", "declined"] }),
    voidsEventId: text("voids_event_id"),
    occurredAt: text("occurred_at").notNull(),
    recordedAt: text("recorded_at").notNull(),
    origin: text("origin", { enum: ["manual", "email"] }).notNull(),
    messageId: text("message_id").references(() => message.id, { onDelete: "set null" }),
    certainty: text("certainty", { enum: ["high", "medium", "low"] }),
    note: text("note"),
  },
  (t) => [
    index("event_application_idx").on(t.applicationId),
    index("event_user_idx").on(t.userId),
    check(
      "event_shape",
      sql`(${t.type} = 'advanced') = (${t.stage} IS NOT NULL)
        AND (${t.type} = 'closed') = (${t.outcome} IS NOT NULL)
        AND (${t.type} = 'voided') = (${t.voidsEventId} IS NOT NULL)`,
    ),
  ],
);

export const settings = sqliteTable(
  "settings",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    ghostThresholdDays: integer("ghost_threshold_days").notNull().default(21),
    timezone: text("timezone").notNull().default("UTC"),
    rawRetentionDays: integer("raw_retention_days").notNull().default(30),
    autoApply: integer("auto_apply", { mode: "boolean" }).notNull().default(true),
    digest: text("digest", { enum: ["off", "weekly"] })
      .notNull()
      .default("off"),
  },
  (t) => [check("settings_ghost_threshold_positive", sql`${t.ghostThresholdDays} > 0`)],
);
