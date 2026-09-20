import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  timestamp,
  numeric,
  jsonb,
  index,
  uniqueIndex,
  integer,
  smallint,
  date,
  primaryKey,
} from "drizzle-orm/pg-core"
import { relations, sql } from "drizzle-orm"
import type { AdapterAccountType } from "next-auth/adapters"

// ─── Enums ────────────────────────────────────────────────────────────────────

export const memberRoleEnum = pgEnum("member_role", [
  "owner", "admin", "manager", "agent", "viewer",
])
export const metaConnectionStatusEnum = pgEnum("meta_connection_status", [
  "active", "error", "expired", "pending",
])
export const credentialTypeEnum = pgEnum("ingestion_credential_type", [
  "public_form", "server_secret",
])
export const credentialStatusEnum = pgEnum("ingestion_credential_status", [
  "active", "revoked", "expired",
])
export const touchTypeEnum = pgEnum("attribution_touch_type", [
  "first_touch", "last_touch", "assist",
])
export const conversionStatusEnum = pgEnum("conversion_status", [
  "pending", "confirmed", "cancelled", "refunded",
])
export const metaEventStatusEnum = pgEnum("meta_event_status", [
  "pending", "processing", "retrying", "sent", "failed", "skipped", "cancelled",
])
export const importBatchStatusEnum = pgEnum("import_batch_status", [
  "pending", "dry_run", "processing", "completed", "failed", "rollback",
])
export const importRowStatusEnum = pgEnum("import_row_status", [
  "pending", "imported", "duplicate", "skipped", "warning", "failed",
])
export const cronRunStatusEnum = pgEnum("cron_run_status", ["running", "completed", "failed", "timeout"])
export const auditActorTypeEnum = pgEnum("audit_actor_type", [
  "user", "system", "api",
])
export const leadActivityTypeEnum = pgEnum("lead_activity_type", [
  "created", "stage_changed", "temperature_changed", "note_added",
  "assigned", "converted", "conversion_cancelled", "meta_event_sent",
  "imported", "qualified", "tagged",
  // Prompt 17 — team & whatsapp
  "assignment_changed", "wa_link_prepared", "wa_marked_shared",
  "wa_contacted", "wa_provider_update", "wa_correction",
])
export const waMessageStatusEnum = pgEnum("wa_message_status", [
  "link_prepared", "marked_shared",
  "provider_accepted", "sent", "delivered", "read",
  "contacted", "failed",
])
export const waConfirmationMethodEnum = pgEnum("wa_confirmation_method", [
  "manual", "provider",
])
export const metaConnectionModeEnum = pgEnum("meta_connection_mode", [
  "internal_manual", "external_oauth",
])

// ─── Auth.js v5 Tables ────────────────────────────────────────────────────────

export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  password: text("password"),
})

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })]
)

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
})

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })]
)

// ─── Organizations ────────────────────────────────────────────────────────────

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  plan: text("plan").notNull().default("free"),
  onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

// P0-FIX: FK userId → users.id + enum role + unique membership
export const orgMembers = pgTable(
  "org_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRoleEnum("role").notNull().default("owner"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("org_members_org_id_idx").on(t.orgId),
    index("org_members_user_id_idx").on(t.userId),
    uniqueIndex("org_members_org_user_idx").on(t.orgId, t.userId),
  ]
)

// ─── Clients ──────────────────────────────────────────────────────────────────
// @deprecated fields: metaPixelId, metaAccessTokenEnc, metaDatasetId — use meta_connections

export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    industry: text("industry"),
    /** @deprecated use meta_connections.pixel_id */
    metaPixelId: text("meta_pixel_id"),
    /** @deprecated use meta_connections.access_token_enc */
    metaAccessTokenEnc: text("meta_access_token_enc"),
    /** @deprecated use meta_connections.dataset_id */
    metaDatasetId: text("meta_dataset_id"),
    whatsappNumbers: text("whatsapp_numbers").array().notNull().default([]),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("clients_org_id_idx").on(t.orgId)]
)

// ─── Meta Connections ─────────────────────────────────────────────────────────
// Replaces client.metaPixelId + client.metaAccessTokenEnc
// Token stored encrypted (AES-256-GCM: iv:tag:ciphertext) same format as before.
// keyVersion tracks which ENCRYPTION_KEY rotation slot was used.

export const metaConnections = pgTable(
  "meta_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    pixelId: text("pixel_id"),
    datasetId: text("dataset_id"),
    accessTokenEnc: text("access_token_enc"),
    keyVersion: integer("key_version").notNull().default(1),
    graphApiVersion: text("graph_api_version").notNull().default("v19.0"),
    status: metaConnectionStatusEnum("status").notNull().default("pending"),
    scopes: text("scopes").array().notNull().default([]),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    lastError: text("last_error"),
    // Prompt 18: Ads Insights beta
    adAccountId: text("ad_account_id"),
    connectionMode: metaConnectionModeEnum("connection_mode").notNull().default("internal_manual"),
    // Prompt 26: Meta Lead Ads webhook
    metaPageId: text("meta_page_id"),
    webhookVerifyToken: text("webhook_verify_token"),
    leadAdsEnabled: boolean("lead_ads_enabled").notNull().default(false),
    // Public key for the capture script (public_form credential, safe to embed in JS)
    captureScriptKey: text("capture_script_key"),
    // Auto-event toggles (Prompt 28)
    sendLeadEvents: boolean("send_lead_events").notNull().default(false),
    sendContactEvents: boolean("send_contact_events").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("meta_connections_org_id_idx").on(t.orgId),
    index("meta_connections_client_id_idx").on(t.clientId),
    uniqueIndex("meta_connections_client_pixel_idx")
      .on(t.clientId, t.pixelId)
      .where(sql`pixel_id IS NOT NULL`),
  ]
)

// ─── Campaigns ────────────────────────────────────────────────────────────────
// @deprecated field: apiKey — use ingestion_credentials for new keys

export const campaigns = pgTable(
  "campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    /** @deprecated use ingestion_credentials */
    apiKey: text("api_key").notNull().unique(),
    active: boolean("active").notNull().default(true),
    blueprint: text("blueprint").notNull().default("A"),
    /** Optional campaign-level profile override — takes precedence over client profile */
    profileId: uuid("profile_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("campaigns_org_id_idx").on(t.orgId),
    index("campaigns_client_id_idx").on(t.clientId),
    uniqueIndex("campaigns_api_key_idx").on(t.apiKey),
  ]
)

// ─── Ingestion Credentials ────────────────────────────────────────────────────
// v2 replacement for campaigns.api_key
// The actual secret is NEVER stored — only its SHA-256 hash.
// Lookup: hash incoming key → compare with key_hash.

export const ingestionCredentials = pgTable(
  "ingestion_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    type: credentialTypeEnum("type").notNull().default("server_secret"),
    keyHash: text("key_hash").notNull(),
    keyPrefix: text("key_prefix").notNull(),
    status: credentialStatusEnum("status").notNull().default("active"),
    // Mode A (public_form): list of allowed origins for CORS validation.
    // Empty array = allow any origin (use when Turnstile is the primary guard).
    allowedOrigins: text("allowed_origins").array().notNull().default([]),
    rotatedAt: timestamp("rotated_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ingestion_cred_org_id_idx").on(t.orgId),
    index("ingestion_cred_campaign_id_idx").on(t.campaignId),
    uniqueIndex("ingestion_cred_key_hash_idx").on(t.keyHash),
    index("ingestion_cred_active_idx")
      .on(t.campaignId)
      .where(sql`status = 'active'`),
  ]
)

// ─── Pipelines ────────────────────────────────────────────────────────────────
// Relational replacement for funnels (JSONB stages).
// clientId = null means org-wide pipeline.

export const pipelines = pgTable(
  "pipelines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .references(() => clients.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("pipelines_org_id_idx").on(t.orgId),
    index("pipelines_client_id_idx").on(t.clientId),
  ]
)

export const pipelineStages = pgTable(
  "pipeline_stages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    pipelineId: uuid("pipeline_id")
      .notNull()
      .references(() => pipelines.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull().default("#6366f1"),
    position: smallint("position").notNull().default(0),
    isWon: boolean("is_won").notNull().default(false),
    isLost: boolean("is_lost").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("pipeline_stages_pipeline_id_idx").on(t.pipelineId),
    index("pipeline_stages_org_id_idx").on(t.orgId),
  ]
)

// ─── Leads ────────────────────────────────────────────────────────────────────
// Enhanced v2: new attribution fields + currentStageId FK + retention timestamps.
// Deprecated columns kept for backward compat (marked below).

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),

    // Identity
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    city: text("city"),
    negocio: boolean("negocio").notNull().default(false),
    // Qualification inputs (raw + normalized)
    negocioRaw: text("negocio_raw"),
    negocioNormalized: text("negocio_normalized"),
    cityCanonical: text("city_canonical"),
    // Cached effective qualification (manual ?? automatic) — refreshed on each eval
    effectiveQualClass: text("effective_qual_class"),
    // Custom fields from external sources (e-commerce, CRM, etc.)
    customData: jsonb("custom_data").$type<Record<string, unknown>>().notNull().default({}),

    // Pipeline v1 — @deprecated: use currentStageId
    stage: text("stage").notNull().default("new"),
    temperature: text("temperature").notNull().default("cold"),

    // Pipeline v2
    currentStageId: uuid("current_stage_id")
      .references(() => pipelineStages.id, { onDelete: "set null" }),

    // Attribution (first-touch snapshot on ingest)
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    utmContent: text("utm_content"),
    fbclid: text("fbclid"),
    fbc: text("fbc"),
    fbp: text("fbp"),
    landingUrl: text("landing_url"),
    referrerUrl: text("referrer_url"),
    metaCampaignName: text("meta_campaign_name"),
    metaAdsetName: text("meta_adset_name"),
    metaAdName: text("meta_ad_name"),

    // Device
    platform: text("platform"),
    device: text("device"),

    // PII with retention policy
    ip: text("ip"),
    ipExpiresAt: timestamp("ip_expires_at", { withTimezone: true }),
    userAgent: text("user_agent"),
    uaExpiresAt: timestamp("ua_expires_at", { withTimezone: true }),

    // Idempotency — externalEventId is the v2 canonical field
    externalEventId: text("external_event_id"),
    /** @deprecated use externalEventId */
    eventId: text("event_id"),

    // Assignment v1 — @deprecated: use lead_assignments
    assignedTo: text("assigned_to"),
    assignedAt: timestamp("assigned_at", { withTimezone: true }),

    // Notes v1 — @deprecated: use lead_notes
    notes: text("notes"),

    // Conversion v1 — @deprecated: use conversions table
    converted: boolean("converted").notNull().default(false),
    conversionAmount: numeric("conversion_amount"),
    conversionCurrency: text("conversion_currency"),
    conversionDate: timestamp("conversion_date", { withTimezone: true }),
    metaPurchaseSentAt: timestamp("meta_purchase_sent_at", { withTimezone: true }),
    metaPurchaseStatus: text("meta_purchase_status"),

    // Contact timestamps (Prompt 17)
    firstContactedAt: timestamp("first_contacted_at", { withTimezone: true }),
    lastContactedAt: timestamp("last_contacted_at", { withTimezone: true }),
    nextFollowUpAt: timestamp("next_follow_up_at", { withTimezone: true }),

    // Privacy / GDPR — Prompt 21
    consentGiven: boolean("consent_given"),
    legalBasis: text("legal_basis"),
    consentedAt: timestamp("consented_at", { withTimezone: true }),
    deletionRequestedAt: timestamp("deletion_requested_at", { withTimezone: true }),
    erasedAt: timestamp("erased_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("leads_org_id_idx").on(t.orgId),
    index("leads_campaign_id_idx").on(t.campaignId),
    index("leads_event_id_idx").on(t.eventId),
    index("leads_external_event_id_idx").on(t.externalEventId),
    index("leads_temperature_idx").on(t.temperature),
    index("leads_stage_idx").on(t.stage),
    index("leads_current_stage_id_idx").on(t.currentStageId),
    index("leads_created_at_idx").on(t.createdAt),
    index("leads_converted_idx").on(t.converted),
    index("leads_effective_qual_class_idx").on(t.effectiveQualClass),
    index("leads_ip_expires_at_idx").on(t.ipExpiresAt),
    index("leads_ua_expires_at_idx").on(t.uaExpiresAt),
    index("leads_deletion_requested_idx").on(t.deletionRequestedAt),
    // Composite for dashboard queries
    index("leads_org_campaign_created_idx").on(t.orgId, t.campaignId, t.createdAt),
  ]
)

// ─── Lead Stage History ───────────────────────────────────────────────────────

export const leadStageHistory = pgTable(
  "lead_stage_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    field: text("field").notNull(),
    fromValue: text("from_value"),
    toValue: text("to_value"),
    changedBy: text("changed_by"),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("lead_stage_history_lead_id_idx").on(t.leadId)]
)

// ─── Lead Notes ───────────────────────────────────────────────────────────────
// v2 replacement for leads.notes (single-field). Supports multiple notes per lead.

export const leadNotes = pgTable(
  "lead_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .references(() => users.id, { onDelete: "set null" }),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("lead_notes_lead_id_idx").on(t.leadId),
    index("lead_notes_org_id_idx").on(t.orgId),
  ]
)

// ─── Lead Activities ──────────────────────────────────────────────────────────
// Structured audit trail for lead lifecycle events.
// metadata is sanitized — no PII in plain text.

export const leadActivities = pgTable(
  "lead_activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    actorId: text("actor_id"),
    actorType: auditActorTypeEnum("actor_type").notNull().default("system"),
    activityType: leadActivityTypeEnum("activity_type").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("lead_activities_lead_id_idx").on(t.leadId),
    index("lead_activities_org_id_idx").on(t.orgId),
    index("lead_activities_created_at_idx").on(t.createdAt),
  ]
)

// ─── Sales Reps ───────────────────────────────────────────────────────────────

export const salesReps = pgTable(
  "sales_reps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // null = vendedor de toda la org; set = scoped a un cliente
    clientId: uuid("client_id")
      .references(() => clients.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .references(() => users.id, { onDelete: "set null" }),
    displayName: text("display_name").notNull(),
    email: text("email"),
    // Número E.164 del vendedor en WhatsApp (e.g. +58414…)
    whatsappNumber: text("whatsapp_number"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("sales_reps_org_id_idx").on(t.orgId),
    index("sales_reps_client_id_idx").on(t.clientId),
  ]
)

// ─── Lead Assignments ─────────────────────────────────────────────────────────
// Partial unique index ensures only one current assignment per lead.

export const leadAssignments = pgTable(
  "lead_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    salesRepId: uuid("sales_rep_id")
      .references(() => salesReps.id, { onDelete: "set null" }),
    assignedById: text("assigned_by_id"),
    isCurrent: boolean("is_current").notNull().default(true),
    reason: text("reason"),
    note: text("note"),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
    unassignedAt: timestamp("unassigned_at", { withTimezone: true }),
  },
  (t) => [
    index("lead_assignments_lead_id_idx").on(t.leadId),
    index("lead_assignments_org_id_idx").on(t.orgId),
    index("lead_assignments_sales_rep_id_idx").on(t.salesRepId),
    uniqueIndex("lead_assignments_current_idx")
      .on(t.leadId)
      .where(sql`is_current = true`),
  ]
)

// ─── Lead Attribution Touchpoints ─────────────────────────────────────────────
// Preserves first/last touch without overwriting the original source on leads.

export const leadAttributionTouchpoints = pgTable(
  "lead_attribution_touchpoints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .references(() => campaigns.id, { onDelete: "set null" }),
    touchType: touchTypeEnum("touch_type").notNull(),
    channel: text("channel"),
    metaCampaignId: text("meta_campaign_id"),
    metaAdsetId: text("meta_adset_id"),
    metaAdId: text("meta_ad_id"),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    utmContent: text("utm_content"),
    fbclid: text("fbclid"),
    landingUrl: text("landing_url"),
    referrerUrl: text("referrer_url"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("lead_touchpoints_lead_id_idx").on(t.leadId),
    index("lead_touchpoints_org_id_idx").on(t.orgId),
  ]
)

// ─── Qualification Rule Sets ──────────────────────────────────────────────────
// Versioned rules per org (or per client if clientId set).

export const qualificationRuleSets = pgTable(
  "qualification_rule_sets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .references(() => clients.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    version: integer("version").notNull().default(1),
    rules: jsonb("rules").$type<Record<string, unknown>>().notNull().default({}),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("qual_rule_sets_org_id_idx").on(t.orgId)]
)

// ─── Qualification Profiles ───────────────────────────────────────────────────
// Generic, versioned rule profiles — one published per client at a time.
// Replaces the monolithic SavayaRulesV1 with a configurable score-based engine.

export const qualificationProfileStatusEnum = pgEnum("qualification_profile_status", [
  "draft", "published", "archived",
])

export const qualificationProfiles = pgTable(
  "qualification_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .references(() => clients.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    status: qualificationProfileStatusEnum("status").notNull().default("draft"),
    version: integer("version").notNull().default(1),
    initialScore: integer("initial_score").notNull().default(0),
    thresholds: jsonb("thresholds").$type<{
      hot: { min: number }
      warm: { min: number; max: number }
      cold: { max: number }
    }>().notNull().default({ hot: { min: 70 }, warm: { min: 40, max: 69 }, cold: { max: 39 } }),
    resultLabels: jsonb("result_labels").$type<{
      hot?: string; warm?: string; cold?: string; unqualified?: string
    }>().notNull().default({}),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    publishedBy: text("published_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("qual_profiles_org_id_idx").on(t.orgId),
    index("qual_profiles_client_id_idx").on(t.clientId),
    index("qual_profiles_status_idx").on(t.status),
  ]
)

// ─── Qualification Rules ──────────────────────────────────────────────────────
// Ordered, activatable rules belonging to a profile.

export const qualificationRuleActionEnum = pgEnum("qualification_rule_action", [
  "add_score", "force_result", "disqualify",
])

export const qualificationRules = pgTable(
  "qualification_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => qualificationProfiles.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    priority: integer("priority").notNull().default(0),
    active: boolean("active").notNull().default(true),
    // JSON condition tree — validated via ConditionTreeSchema + validateConditionTreeDepth()
    conditions: jsonb("conditions").$type<Record<string, unknown>>().notNull().default({}),
    action: qualificationRuleActionEnum("action").notNull().default("add_score"),
    scoreDelta: integer("score_delta").notNull().default(0),
    forcedResult: text("forced_result"),
    reason: text("reason").notNull().default(""),
    stopProcessing: boolean("stop_processing").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("qual_rules_profile_id_idx").on(t.profileId),
    index("qual_rules_org_id_idx").on(t.orgId),
    index("qual_rules_priority_idx").on(t.profileId, t.priority),
  ]
)

// ─── Qualification Field Definitions ─────────────────────────────────────────
// Catalog of fields the engine may use in conditions.
// System-wide fields have orgId=null; custom fields are org/client scoped.

export const qualificationFieldDefinitions = pgTable(
  "qualification_field_definitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** null = system-wide field available to all orgs */
    orgId: uuid("org_id")
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** null = available to all clients in the org */
    clientId: uuid("client_id")
      .references(() => clients.id, { onDelete: "cascade" }),
    /** Stable machine-readable key used in condition trees */
    key: text("key").notNull(),
    label: text("label").notNull(),
    dataType: text("data_type").notNull().default("text"),
    source: text("source").notNull().default("standard"),
    category: text("category").notNull().default("other"),
    isSensitive: boolean("is_sensitive").notNull().default(false),
    allowedOperators: jsonb("allowed_operators").$type<string[]>().notNull().default([]),
    normalization: jsonb("normalization").$type<Record<string, unknown>[]>().notNull().default([]),
    enumOptions: jsonb("enum_options").$type<string[]>().notNull().default([]),
    isRequiredForEval: boolean("is_required_for_eval").notNull().default(false),
    /** Extra config for event-sourced fields */
    eventConfig: jsonb("event_config").$type<Record<string, unknown>>(),
    /** DB column name on leads table (for standard source fields) */
    leadsColumn: text("leads_column"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("qual_field_defs_org_id_idx").on(t.orgId),
    uniqueIndex("qual_field_defs_key_org_idx")
      .on(t.key, t.orgId)
      .where(sql`org_id IS NOT NULL`),
    uniqueIndex("qual_field_defs_key_system_idx")
      .on(t.key)
      .where(sql`org_id IS NULL`),
  ]
)

// ─── Lead Behavior Events ─────────────────────────────────────────────────────
// Idempotent behavioral events (e-commerce, product views, cart, checkout).
// External ID prevents duplicate scoring. value/currency stored as snapshot.

export const leadBehaviorEvents = pgTable(
  "lead_behavior_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id")
      .references(() => leads.id, { onDelete: "set null" }),
    eventType: text("event_type").notNull(),
    /** Idempotency key — duplicate external_id + lead_id = same event */
    externalId: text("external_id"),
    productId: text("product_id"),
    variantId: text("variant_id"),
    category: text("category"),
    quantity: integer("quantity"),
    value: numeric("value", { precision: 12, scale: 2 }),
    currency: text("currency"),
    /** Snapshot of cart items at event time (array of {productId, qty, value}) */
    cartItems: jsonb("cart_items").$type<Record<string, unknown>[]>().notNull().default([]),
    /** Non-sensitive metadata snapshot (no payment card data) */
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    platform: text("platform"),
    source: text("source"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("lead_behavior_events_lead_id_idx").on(t.leadId),
    index("lead_behavior_events_org_id_idx").on(t.orgId),
    index("lead_behavior_events_event_type_idx").on(t.eventType),
    index("lead_behavior_events_occurred_at_idx").on(t.occurredAt),
    uniqueIndex("lead_behavior_events_dedup_idx")
      .on(t.leadId, t.externalId)
      .where(sql`external_id IS NOT NULL AND lead_id IS NOT NULL`),
  ]
)

// ─── Lead Qualifications ──────────────────────────────────────────────────────

export const leadQualifications = pgTable(
  "lead_qualifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // Profile-based engine (v2)
    profileId: uuid("profile_id")
      .references(() => qualificationProfiles.id, { onDelete: "set null" }),
    profileVersion: integer("profile_version"),
    scoreInt: integer("score_int"),
    evaluationTrigger: text("evaluation_trigger"),
    matchedRules: jsonb("matched_rules").$type<Record<string, unknown>[]>().notNull().default([]),
    missingFields: jsonb("missing_fields").$type<string[]>().notNull().default([]),
    evalDurationMs: integer("eval_duration_ms"),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull().default({}),
    visibleLabel: text("visible_label"),
    // Rule-set engine (v1 — backward compat)
    ruleSetId: uuid("rule_set_id")
      .references(() => qualificationRuleSets.id, { onDelete: "set null" }),
    ruleSetVersion: integer("rule_set_version").notNull().default(0),
    // Classification result
    qualClass: text("qual_class").notNull().default("unqualified"),
    qualType: text("qual_type").notNull().default("automatic"),
    reasons: jsonb("reasons").$type<string[]>().notNull().default([]),
    inputs: jsonb("inputs").$type<{
      negocioRaw: string | null
      negocioNormalized: string | null
      cityRaw: string | null
      cityCanonical: string | null
    }>().notNull().default({} as {
      negocioRaw: string | null
      negocioNormalized: string | null
      cityRaw: string | null
      cityCanonical: string | null
    }),
    // Manual override fields (qualType === "manual")
    note: text("note"),
    actorId: text("actor_id"),
    // Legacy columns — kept for migration safety; do not use in new code
    /** @deprecated use qualClass */
    score: numeric("score"),
    /** @deprecated use qualClass */
    qualified: boolean("qualified").notNull().default(false),
    /** @deprecated use actorId */
    overrideById: text("override_by_id"),
    /** @deprecated use note */
    overrideReason: text("override_reason"),
    evaluatedAt: timestamp("evaluated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("lead_qualifications_lead_id_idx").on(t.leadId),
    index("lead_qualifications_org_id_idx").on(t.orgId),
  ]
)

// ─── Conversions ──────────────────────────────────────────────────────────────
// v2: separate table — supports multiple conversions per lead, cancellations, refunds.
// Replaces leads.converted / leads.conversionAmount (those columns kept deprecated).

export const conversions = pgTable(
  "conversions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .references(() => campaigns.id, { onDelete: "set null" }),
    orderId: text("order_id"),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("USD"),
    status: conversionStatusEnum("status").notNull().default("confirmed"),
    convertedAt: timestamp("converted_at", { withTimezone: true }).notNull().defaultNow(),
    actorId: text("actor_id"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelReason: text("cancel_reason"),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    refundAmount: numeric("refund_amount", { precision: 12, scale: 2 }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("conversions_lead_id_idx").on(t.leadId),
    index("conversions_org_id_idx").on(t.orgId),
    index("conversions_campaign_id_idx").on(t.campaignId),
    index("conversions_converted_at_idx").on(t.convertedAt),
    // Idempotency: one order_id per org (NULL excluded)
    uniqueIndex("conversions_org_order_idx")
      .on(t.orgId, t.orderId)
      .where(sql`order_id IS NOT NULL`),
  ]
)

// ─── Meta Events Outbox ───────────────────────────────────────────────────────
// Reliable delivery to Meta CAPI with retry semantics.
// payload stores pre-hashed PII — never raw PII in this table.

export const metaEvents = pgTable(
  "meta_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id")
      .references(() => leads.id, { onDelete: "set null" }),
    conversionId: uuid("conversion_id")
      .references(() => conversions.id, { onDelete: "set null" }),
    pixelId: text("pixel_id").notNull(),
    eventName: text("event_name").notNull(),
    eventId: text("event_id").notNull(),
    payloadVersion: integer("payload_version").notNull().default(1),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    status: metaEventStatusEnum("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lastResponse: text("last_response"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("meta_events_org_id_idx").on(t.orgId),
    uniqueIndex("meta_events_event_id_idx").on(t.eventId),
    index("meta_events_pending_idx")
      .on(t.nextAttemptAt)
      .where(sql`status = 'pending'`),
  ]
)

// ─── Ad Insights Daily ────────────────────────────────────────────────────────
// Daily spend + performance synced from Meta Ads Insights API.
// Unique per (org, entity_id, date) for safe upsert.

export const adInsightsDaily = pgTable(
  "ad_insights_daily",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .references(() => campaigns.id, { onDelete: "set null" }),
    metaCampaignId: text("meta_campaign_id"),
    metaAdsetId: text("meta_adset_id"),
    metaAdId: text("meta_ad_id"),
    date: date("date").notNull(),
    impressions: integer("impressions").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    spend: numeric("spend", { precision: 12, scale: 2 }).notNull().default("0"),
    reach: integer("reach"),
    conversionsCount: integer("conversions_count").notNull().default(0),
    // Prompt 18: Ads Insights v2 fields
    adAccountId: text("ad_account_id"),
    level: text("level"), // 'campaign' | 'adset' | 'ad'
    objectId: text("object_id"), // meta entity ID for this row's level
    currency: text("currency"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ad_insights_org_id_idx").on(t.orgId),
    index("ad_insights_client_id_idx").on(t.clientId),
    index("ad_insights_date_idx").on(t.date),
    uniqueIndex("ad_insights_ad_date_idx")
      .on(t.orgId, t.metaAdId, t.date)
      .where(sql`meta_ad_id IS NOT NULL`),
    uniqueIndex("ad_insights_campaign_date_idx")
      .on(t.orgId, t.metaCampaignId, t.date)
      .where(sql`meta_ad_id IS NULL AND meta_adset_id IS NULL AND meta_campaign_id IS NOT NULL`),
    // v2: idempotent upserts keyed by (org, account, date, level, object)
    // NULLs don't conflict each other so this coexists safely with legacy rows
    uniqueIndex("ad_insights_v2_unique_idx")
      .on(t.orgId, t.adAccountId, t.date, t.level, t.objectId),
    uniqueIndex("ad_insights_adset_date_idx")
      .on(t.orgId, t.metaAdsetId, t.date)
      .where(sql`meta_ad_id IS NULL AND meta_adset_id IS NOT NULL`),
  ]
)

// ─── Meta Sync Runs ───────────────────────────────────────────────────────────

export const metaSyncRuns = pgTable(
  "meta_sync_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .references(() => clients.id, { onDelete: "set null" }),
    status: text("status").notNull().default("running"),
    dateFrom: date("date_from").notNull(),
    dateTo: date("date_to").notNull(),
    recordsSynced: integer("records_synced").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    error: text("error"),
    // Prompt 18: Ads Insights beta
    adAccountId: text("ad_account_id"),
    syncType: text("sync_type"), // 'initial' | 'incremental' | 'manual'
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lockedBy: text("locked_by"), // random UUID identifying the lock holder
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("meta_sync_runs_org_id_idx").on(t.orgId),
    index("meta_sync_runs_account_idx").on(t.orgId, t.adAccountId),
  ]
)

// ─── Import Batches ───────────────────────────────────────────────────────────

export const importBatches = pgTable(
  "import_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .references(() => clients.id, { onDelete: "set null" }),
    campaignId: uuid("campaign_id")
      .references(() => campaigns.id, { onDelete: "set null" }),
    source: text("source").notNull().default("csv"),
    status: importBatchStatusEnum("status").notNull().default("pending"),
    totalRows: integer("total_rows").notNull().default(0),
    processedRows: integer("processed_rows").notNull().default(0),
    failedRows: integer("failed_rows").notNull().default(0),
    skippedRows: integer("skipped_rows").notNull().default(0),
    warningRows: integer("warning_rows").notNull().default(0),
    fileHash: text("file_hash"),
    sheetName: text("sheet_name"),
    originalFilename: text("original_filename"),
    columnMapping: jsonb("column_mapping").$type<Record<string, string>>(),
    dryRunAt: timestamp("dry_run_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("import_batches_org_id_idx").on(t.orgId)]
)

// ─── Import Rows ──────────────────────────────────────────────────────────────

export const importRows = pgTable(
  "import_rows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => importBatches.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    rowIndex: integer("row_index").notNull(),
    rawData: jsonb("raw_data").$type<Record<string, unknown>>().notNull().default({}),
    status: importRowStatusEnum("status").notNull().default("pending"),
    leadId: uuid("lead_id")
      .references(() => leads.id, { onDelete: "set null" }),
    conversionId: uuid("conversion_id")
      .references(() => conversions.id, { onDelete: "set null" }),
    dedupeKey: text("dedupe_key").notNull().unique(),
    fingerprint: text("fingerprint"),
    warning: text("warning"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("import_rows_batch_id_idx").on(t.batchId),
    index("import_rows_org_id_idx").on(t.orgId),
  ]
)

// ─── Audit Logs ───────────────────────────────────────────────────────────────
// Append-only. ip_redacted masks the last octet: 192.168.1.xxx

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .references(() => organizations.id, { onDelete: "set null" }),
    actorId: text("actor_id"),
    actorType: auditActorTypeEnum("actor_type").notNull().default("user"),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ipRedacted: text("ip_redacted"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_logs_org_id_idx").on(t.orgId),
    index("audit_logs_actor_id_idx").on(t.actorId),
    index("audit_logs_resource_idx").on(t.resourceType, t.resourceId),
    index("audit_logs_created_at_idx").on(t.createdAt),
  ]
)

// ─── Cron Runs ────────────────────────────────────────────────────────────────
// Observability record for every cron execution. Enables health dashboard and runbooks.

export const cronRuns = pgTable(
  "cron_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobName: text("job_name").notNull(),
    correlationId: text("correlation_id").notNull(),
    status: cronRunStatusEnum("status").notNull().default("running"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    itemsProcessed: integer("items_processed").notNull().default(0),
    itemsFailed: integer("items_failed").notNull().default(0),
    result: jsonb("result").$type<Record<string, unknown>>().notNull().default({}),
    error: text("error"),
  },
  (t) => [
    index("cron_runs_job_name_idx").on(t.jobName),
    index("cron_runs_started_at_idx").on(t.startedAt),
    index("cron_runs_status_idx").on(t.status),
  ]
)

// ─── Webhook Events ───────────────────────────────────────────────────────────

export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    eventId: text("event_id").notNull(),
    rawPayload: jsonb("raw_payload").notNull(),
    processed: boolean("processed").notNull().default(false),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("webhook_events_campaign_id_idx").on(t.campaignId),
    index("webhook_events_event_id_idx").on(t.eventId),
    // Unique constraint for atomic idempotency (ON CONFLICT DO NOTHING pattern)
    uniqueIndex("webhook_events_campaign_event_idx").on(t.campaignId, t.eventId),
  ]
)

// ─── Funnels (deprecated) ─────────────────────────────────────────────────────
// @deprecated: use pipelines + pipeline_stages instead.
// ─── WhatsApp Client Config ───────────────────────────────────────────────────
// One row per client. confirmation_mode decides how sends are confirmed.

export const waClientConfig = pgTable(
  "wa_client_config",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .unique()
      .references(() => clients.id, { onDelete: "cascade" }),
    confirmationMode: waConfirmationMethodEnum("confirmation_mode").notNull().default("manual"),
    providerName: text("provider_name"),
    // Encrypted provider credentials (AES-256-GCM versionado, misma lógica que meta_connections)
    providerConfigEnc: text("provider_config_enc"),
    providerKeyVersion: integer("provider_key_version").notNull().default(1),
    // SHA-256 of the raw webhook secret (never stored plain)
    webhookSecretHash: text("webhook_secret_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("wa_client_config_org_id_idx").on(t.orgId)]
)

// ─── Message Templates ────────────────────────────────────────────────────────
// Per-client (and optionally per-campaign) WhatsApp message templates.

export const messageTemplates = pgTable(
  "message_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .references(() => campaigns.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    // Template with {{variable}} placeholders
    content: text("content").notNull(),
    // List of variable keys allowed in this template
    allowedVariables: text("allowed_variables").array().notNull().default([]),
    isDefault: boolean("is_default").notNull().default(false),
    active: boolean("active").notNull().default(true),
    createdById: text("created_by_id")
      .references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("message_templates_org_id_idx").on(t.orgId),
    index("message_templates_client_id_idx").on(t.clientId),
  ]
)

// ─── WhatsApp Messages ────────────────────────────────────────────────────────
// One row per send attempt. confirmation_mode records how THIS send was confirmed.

export const waMessages = pgTable(
  "wa_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    assignmentId: uuid("assignment_id")
      .references(() => leadAssignments.id, { onDelete: "set null" }),
    templateId: uuid("template_id")
      .references(() => messageTemplates.id, { onDelete: "set null" }),
    sentById: text("sent_by_id")
      .references(() => users.id, { onDelete: "set null" }),
    salesRepId: uuid("sales_rep_id")
      .references(() => salesReps.id, { onDelete: "set null" }),
    confirmationMode: waConfirmationMethodEnum("confirmation_mode").notNull(),
    status: waMessageStatusEnum("status").notNull().default("link_prepared"),
    // Provider fields (only used when confirmationMode = 'provider')
    externalMessageId: text("external_message_id"),
    providerName: text("provider_name"),
    providerStatusRaw: text("provider_status_raw"),
    // Manual confirmation fields
    confirmedById: text("confirmed_by_id")
      .references(() => users.id, { onDelete: "set null" }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    // Correction / revocation
    correctedAt: timestamp("corrected_at", { withTimezone: true }),
    correctedById: text("corrected_by_id")
      .references(() => users.id, { onDelete: "set null" }),
    correctionReason: text("correction_reason"),
    note: text("note"),
    // Granular provider timestamps
    linkOpenedAt: timestamp("link_opened_at", { withTimezone: true }),
    providerAcceptedAt: timestamp("provider_accepted_at", { withTimezone: true }),
    providerSentAt: timestamp("provider_sent_at", { withTimezone: true }),
    providerDeliveredAt: timestamp("provider_delivered_at", { withTimezone: true }),
    providerReadAt: timestamp("provider_read_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    failureReason: text("failure_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("wa_messages_lead_id_idx").on(t.leadId),
    index("wa_messages_org_id_idx").on(t.orgId),
    index("wa_messages_status_idx").on(t.status),
    index("wa_messages_external_id_idx").on(t.externalMessageId),
  ]
)

// ─── WhatsApp Provider Events ─────────────────────────────────────────────────
// Raw webhook events from providers; processed idempotently.

export const waProviderEvents = pgTable(
  "wa_provider_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    waMessageId: uuid("wa_message_id")
      .references(() => waMessages.id, { onDelete: "set null" }),
    externalMessageId: text("external_message_id").notNull(),
    providerName: text("provider_name").notNull(),
    eventType: text("event_type").notNull(),
    statusRaw: text("status_raw").notNull(),
    // SHA-256(providerName + externalMessageId + eventType) — dedup key
    dedupeKey: text("dedupe_key").notNull().unique(),
    processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("wa_provider_events_org_id_idx").on(t.orgId),
    index("wa_provider_events_external_id_idx").on(t.externalMessageId),
  ]
)

// ─── Meta Ad Account Allowlist ────────────────────────────────────────────────
// Explicitly authorized Ad Account IDs for internal beta (Prompt 18).
// Access is also granted via META_ALLOWED_AD_ACCOUNTS env var (comma-separated).

export const metaAdAccountAllowlist = pgTable(
  "meta_ad_account_allowlist",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    adAccountId: text("ad_account_id").notNull(),
    addedById: text("added_by_id")
      .references(() => users.id, { onDelete: "set null" }),
    notes: text("notes"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("meta_allowlist_org_id_idx").on(t.orgId),
    uniqueIndex("meta_allowlist_org_account_idx").on(t.orgId, t.adAccountId),
  ]
)

// ─── Meta Catalog — Campaigns ─────────────────────────────────────────────────
// Mirrors Meta campaign objects; synced alongside insights.

export const metaCatalogCampaigns = pgTable(
  "meta_catalog_campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    adAccountId: text("ad_account_id").notNull(),
    metaCampaignId: text("meta_campaign_id").notNull(),
    name: text("name").notNull(),
    status: text("status").notNull().default("UNKNOWN"),
    effectiveStatus: text("effective_status"),
    objective: text("objective"),
    startTime: timestamp("start_time", { withTimezone: true }),
    stopTime: timestamp("stop_time", { withTimezone: true }),
    dailyBudget: numeric("daily_budget", { precision: 18, scale: 2 }),
    lifetimeBudget: numeric("lifetime_budget", { precision: 18, scale: 2 }),
    internalCampaignId: uuid("internal_campaign_id")
      .references(() => campaigns.id, { onDelete: "set null" }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("meta_catalog_campaigns_org_id_idx").on(t.orgId),
    index("meta_catalog_campaigns_client_id_idx").on(t.clientId),
    uniqueIndex("meta_catalog_campaigns_org_meta_idx").on(t.orgId, t.metaCampaignId),
  ]
)

// ─── Meta Catalog — Adsets ────────────────────────────────────────────────────

export const metaCatalogAdsets = pgTable(
  "meta_catalog_adsets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    adAccountId: text("ad_account_id").notNull(),
    metaAdsetId: text("meta_adset_id").notNull(),
    metaCampaignId: text("meta_campaign_id").notNull(),
    name: text("name").notNull(),
    status: text("status").notNull().default("UNKNOWN"),
    effectiveStatus: text("effective_status"),
    targetingJson: jsonb("targeting_json").$type<Record<string, unknown>>().notNull().default({}),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("meta_catalog_adsets_org_id_idx").on(t.orgId),
    index("meta_catalog_adsets_client_id_idx").on(t.clientId),
    uniqueIndex("meta_catalog_adsets_org_meta_idx").on(t.orgId, t.metaAdsetId),
  ]
)

// ─── Meta Catalog — Ads ───────────────────────────────────────────────────────

export const metaCatalogAds = pgTable(
  "meta_catalog_ads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    adAccountId: text("ad_account_id").notNull(),
    metaAdId: text("meta_ad_id").notNull(),
    metaAdsetId: text("meta_adset_id").notNull(),
    metaCampaignId: text("meta_campaign_id").notNull(),
    name: text("name").notNull(),
    status: text("status").notNull().default("UNKNOWN"),
    effectiveStatus: text("effective_status"),
    creativeName: text("creative_name"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("meta_catalog_ads_org_id_idx").on(t.orgId),
    index("meta_catalog_ads_client_id_idx").on(t.clientId),
    uniqueIndex("meta_catalog_ads_org_meta_idx").on(t.orgId, t.metaAdId),
  ]
)

// Kept for backward compatibility with existing Kanban UI.

export interface FunnelStageConfig {
  stageKey: LeadStage
  label: string
  color: string
}

export const funnels = pgTable(
  "funnels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    stages: jsonb("stages").$type<FunnelStageConfig[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("funnels_org_id_idx").on(t.orgId)]
)

// ─── Relations ────────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations, { fields: [users.id], references: [organizations.ownerId] }),
  orgMemberships: many(orgMembers),
  salesRep: one(salesReps, { fields: [users.id], references: [salesReps.userId] }),
}))

export const organizationsRelations = relations(organizations, ({ many }) => ({
  members: many(orgMembers),
  clients: many(clients),
  campaigns: many(campaigns),
  pipelines: many(pipelines),
  leads: many(leads),
  funnels: many(funnels),
  salesReps: many(salesReps),
  conversions: many(conversions),
  metaEvents: many(metaEvents),
}))

export const orgMembersRelations = relations(orgMembers, ({ one }) => ({
  organization: one(organizations, { fields: [orgMembers.orgId], references: [organizations.id] }),
  user: one(users, { fields: [orgMembers.userId], references: [users.id] }),
}))

export const clientsRelations = relations(clients, ({ one, many }) => ({
  organization: one(organizations, { fields: [clients.orgId], references: [organizations.id] }),
  campaigns: many(campaigns),
  metaConnections: many(metaConnections),
  pipelines: many(pipelines),
  salesReps: many(salesReps),
  waClientConfig: many(waClientConfig),
  messageTemplates: many(messageTemplates),
}))

export const metaConnectionsRelations = relations(metaConnections, ({ one }) => ({
  organization: one(organizations, { fields: [metaConnections.orgId], references: [organizations.id] }),
  client: one(clients, { fields: [metaConnections.clientId], references: [clients.id] }),
}))

export const campaignsRelations = relations(campaigns, ({ one, many }) => ({
  organization: one(organizations, { fields: [campaigns.orgId], references: [organizations.id] }),
  client: one(clients, { fields: [campaigns.clientId], references: [clients.id] }),
  leads: many(leads),
  webhookEvents: many(webhookEvents),
  ingestionCredentials: many(ingestionCredentials),
  conversions: many(conversions),
}))

export const pipelinesRelations = relations(pipelines, ({ one, many }) => ({
  organization: one(organizations, { fields: [pipelines.orgId], references: [organizations.id] }),
  client: one(clients, { fields: [pipelines.clientId], references: [clients.id] }),
  stages: many(pipelineStages),
}))

export const pipelineStagesRelations = relations(pipelineStages, ({ one }) => ({
  pipeline: one(pipelines, { fields: [pipelineStages.pipelineId], references: [pipelines.id] }),
  organization: one(organizations, { fields: [pipelineStages.orgId], references: [organizations.id] }),
}))

export const leadsRelations = relations(leads, ({ one, many }) => ({
  organization: one(organizations, { fields: [leads.orgId], references: [organizations.id] }),
  campaign: one(campaigns, { fields: [leads.campaignId], references: [campaigns.id] }),
  currentStage: one(pipelineStages, { fields: [leads.currentStageId], references: [pipelineStages.id] }),
  stageHistory: many(leadStageHistory),
  notes: many(leadNotes),
  activities: many(leadActivities),
  assignments: many(leadAssignments),
  touchpoints: many(leadAttributionTouchpoints),
  qualifications: many(leadQualifications),
  behaviorEvents: many(leadBehaviorEvents),
  conversions: many(conversions),
  metaEvents: many(metaEvents),
  importRows: many(importRows),
  waMessages: many(waMessages),
}))

export const qualificationRuleSetsRelations = relations(qualificationRuleSets, ({ one, many }) => ({
  organization: one(organizations, { fields: [qualificationRuleSets.orgId], references: [organizations.id] }),
  client: one(clients, { fields: [qualificationRuleSets.clientId], references: [clients.id] }),
  qualifications: many(leadQualifications),
}))

export const qualificationProfilesRelations = relations(qualificationProfiles, ({ one, many }) => ({
  organization: one(organizations, { fields: [qualificationProfiles.orgId], references: [organizations.id] }),
  client: one(clients, { fields: [qualificationProfiles.clientId], references: [clients.id] }),
  rules: many(qualificationRules),
  qualifications: many(leadQualifications),
}))

export const qualificationRulesRelations = relations(qualificationRules, ({ one }) => ({
  organization: one(organizations, { fields: [qualificationRules.orgId], references: [organizations.id] }),
  profile: one(qualificationProfiles, { fields: [qualificationRules.profileId], references: [qualificationProfiles.id] }),
}))

export const qualificationFieldDefinitionsRelations = relations(qualificationFieldDefinitions, ({ one }) => ({
  organization: one(organizations, { fields: [qualificationFieldDefinitions.orgId], references: [organizations.id] }),
  client: one(clients, { fields: [qualificationFieldDefinitions.clientId], references: [clients.id] }),
}))

export const leadBehaviorEventsRelations = relations(leadBehaviorEvents, ({ one }) => ({
  organization: one(organizations, { fields: [leadBehaviorEvents.orgId], references: [organizations.id] }),
  lead: one(leads, { fields: [leadBehaviorEvents.leadId], references: [leads.id] }),
}))

export const leadQualificationsRelations = relations(leadQualifications, ({ one }) => ({
  lead: one(leads, { fields: [leadQualifications.leadId], references: [leads.id] }),
  organization: one(organizations, { fields: [leadQualifications.orgId], references: [organizations.id] }),
  ruleSet: one(qualificationRuleSets, { fields: [leadQualifications.ruleSetId], references: [qualificationRuleSets.id] }),
  profile: one(qualificationProfiles, { fields: [leadQualifications.profileId], references: [qualificationProfiles.id] }),
}))

export const salesRepsRelations = relations(salesReps, ({ one, many }) => ({
  organization: one(organizations, { fields: [salesReps.orgId], references: [organizations.id] }),
  client: one(clients, { fields: [salesReps.clientId], references: [clients.id] }),
  user: one(users, { fields: [salesReps.userId], references: [users.id] }),
  assignments: many(leadAssignments),
  waMessages: many(waMessages),
}))

export const waClientConfigRelations = relations(waClientConfig, ({ one }) => ({
  organization: one(organizations, { fields: [waClientConfig.orgId], references: [organizations.id] }),
  client: one(clients, { fields: [waClientConfig.clientId], references: [clients.id] }),
}))

export const messageTemplatesRelations = relations(messageTemplates, ({ one }) => ({
  organization: one(organizations, { fields: [messageTemplates.orgId], references: [organizations.id] }),
  client: one(clients, { fields: [messageTemplates.clientId], references: [clients.id] }),
  campaign: one(campaigns, { fields: [messageTemplates.campaignId], references: [campaigns.id] }),
  createdBy: one(users, { fields: [messageTemplates.createdById], references: [users.id] }),
}))

export const waMessagesRelations = relations(waMessages, ({ one }) => ({
  organization: one(organizations, { fields: [waMessages.orgId], references: [organizations.id] }),
  lead: one(leads, { fields: [waMessages.leadId], references: [leads.id] }),
  assignment: one(leadAssignments, { fields: [waMessages.assignmentId], references: [leadAssignments.id] }),
  template: one(messageTemplates, { fields: [waMessages.templateId], references: [messageTemplates.id] }),
  sentBy: one(users, { fields: [waMessages.sentById], references: [users.id] }),
  salesRep: one(salesReps, { fields: [waMessages.salesRepId], references: [salesReps.id] }),
  confirmedBy: one(users, { fields: [waMessages.confirmedById], references: [users.id] }),
}))

export const waProviderEventsRelations = relations(waProviderEvents, ({ one }) => ({
  organization: one(organizations, { fields: [waProviderEvents.orgId], references: [organizations.id] }),
  client: one(clients, { fields: [waProviderEvents.clientId], references: [clients.id] }),
  waMessage: one(waMessages, { fields: [waProviderEvents.waMessageId], references: [waMessages.id] }),
}))

export const metaAdAccountAllowlistRelations = relations(metaAdAccountAllowlist, ({ one }) => ({
  organization: one(organizations, { fields: [metaAdAccountAllowlist.orgId], references: [organizations.id] }),
  addedBy: one(users, { fields: [metaAdAccountAllowlist.addedById], references: [users.id] }),
}))

export const metaCatalogCampaignsRelations = relations(metaCatalogCampaigns, ({ one }) => ({
  organization: one(organizations, { fields: [metaCatalogCampaigns.orgId], references: [organizations.id] }),
  client: one(clients, { fields: [metaCatalogCampaigns.clientId], references: [clients.id] }),
  internalCampaign: one(campaigns, { fields: [metaCatalogCampaigns.internalCampaignId], references: [campaigns.id] }),
}))

export const metaCatalogAdsetsRelations = relations(metaCatalogAdsets, ({ one }) => ({
  organization: one(organizations, { fields: [metaCatalogAdsets.orgId], references: [organizations.id] }),
  client: one(clients, { fields: [metaCatalogAdsets.clientId], references: [clients.id] }),
}))

export const metaCatalogAdsRelations = relations(metaCatalogAds, ({ one }) => ({
  organization: one(organizations, { fields: [metaCatalogAds.orgId], references: [organizations.id] }),
  client: one(clients, { fields: [metaCatalogAds.clientId], references: [clients.id] }),
}))

export const conversionsRelations = relations(conversions, ({ one, many }) => ({
  lead: one(leads, { fields: [conversions.leadId], references: [leads.id] }),
  organization: one(organizations, { fields: [conversions.orgId], references: [organizations.id] }),
  campaign: one(campaigns, { fields: [conversions.campaignId], references: [campaigns.id] }),
  metaEvents: many(metaEvents),
}))

export const funnelsRelations = relations(funnels, ({ one }) => ({
  organization: one(organizations, { fields: [funnels.orgId], references: [organizations.id] }),
}))

// ─── Conversion Diagnostics (Prompt 25) ──────────────────────────────────────

export const diagConversionStatusEnum = pgEnum("diag_conversion_status", [
  "not_configured", "code_not_detected", "code_detected", "awaiting_test",
  "observed_browser", "observed_server", "observed_both", "accepted_by_meta",
  "misconfigured", "duplicate_risk", "stale", "failed", "unknown",
])
export const conversionProviderEnum = pgEnum("conversion_provider", [
  "meta_pixel", "meta_capi", "both", "custom",
])
export const expectedSourceEnum = pgEnum("expected_source", [
  "browser", "server", "both",
])
export const conversionTriggerTypeEnum = pgEnum("conversion_trigger_type", [
  "page_load", "element_click", "data_attribute", "form_submit",
  "explicit_callback", "datalayer_event", "ecommerce_event", "webhook", "manual_sale",
])
export const conversionCriticalityEnum = pgEnum("conversion_criticality", [
  "critical", "high", "medium", "low",
])
export const observationSourceEnum = pgEnum("observation_source", [
  "browser_pixel", "server_capi", "diagnostic_collector", "scan",
])
export const conversionIssueSeverityEnum = pgEnum("conversion_issue_severity", [
  "critical", "high", "medium", "low", "info",
])
export const conversionIssueStatusEnum = pgEnum("conversion_issue_status", [
  "open", "acknowledged", "resolved", "ignored",
])
export const testSessionStatusEnum = pgEnum("test_session_status", [
  "pending", "active", "completed", "expired", "cancelled",
])
export const siteEnvironmentEnum = pgEnum("site_environment", [
  "production", "staging", "development",
])

export const trackingSites = pgTable(
  "tracking_sites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    domain: text("domain").notNull(),
    environment: siteEnvironmentEnum("environment").notNull().default("production"),
    expectedPixelId: text("expected_pixel_id"),
    allowedOrigins: text("allowed_origins").array().notNull().default(sql`'{}'::text[]`),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verificationMethod: text("verification_method"),
    diagnosticsEnabled: boolean("diagnostics_enabled").notNull().default(true),
    // Permanent site-level collect token — safe to embed in browser JS (never hashed).
    // Events fired on the real website use this token; test sessions use their own expiring token.
    collectToken: text("collect_token").unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tracking_sites_org_id_idx").on(t.orgId),
    index("tracking_sites_client_id_idx").on(t.clientId),
    uniqueIndex("tracking_sites_client_domain_env_idx").on(t.clientId, t.domain, t.environment),
  ]
)

export const conversionDefinitions = pgTable(
  "conversion_definitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    trackingSiteId: uuid("tracking_site_id").references(() => trackingSites.id, { onDelete: "set null" }),
    internalKey: text("internal_key").notNull(),
    displayName: text("display_name").notNull(),
    provider: conversionProviderEnum("provider").notNull().default("meta_pixel"),
    providerEventName: text("provider_event_name").notNull(),
    description: text("description"),
    businessCategory: text("business_category"),
    expectedSource: expectedSourceEnum("expected_source").notNull().default("both"),
    triggerType: conversionTriggerTypeEnum("trigger_type").notNull().default("explicit_callback"),
    triggerConfig: jsonb("trigger_config").$type<Record<string, unknown>>().notNull().default({}),
    requiredParameters: jsonb("required_parameters").$type<string[]>().notNull().default([]),
    criticality: conversionCriticalityEnum("criticality").notNull().default("medium"),
    freshnessPolicyJson: jsonb("freshness_policy").$type<Record<string, unknown>>().notNull().default({}),
    enabled: boolean("enabled").notNull().default(true),
    version: integer("version").notNull().default(1),
    installationNotes: text("installation_notes"),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("conversion_definitions_org_client_key_idx").on(t.orgId, t.clientId, t.internalKey),
    index("conversion_definitions_org_id_idx").on(t.orgId),
    index("conversion_definitions_client_id_idx").on(t.clientId),
    index("conversion_definitions_site_id_idx").on(t.trackingSiteId),
  ]
)

export const conversionTestSessions = pgTable(
  "conversion_test_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    trackingSiteId: uuid("tracking_site_id").references(() => trackingSites.id, { onDelete: "set null" }),
    conversionDefinitionId: uuid("conversion_definition_id").notNull().references(() => conversionDefinitions.id, { onDelete: "cascade" }),
    publicTokenHash: text("public_token_hash").notNull().unique(),
    status: testSessionStatusEnum("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    startedBy: text("started_by").references(() => users.id, { onDelete: "set null" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("conversion_test_sessions_org_id_idx").on(t.orgId),
    index("conversion_test_sessions_client_id_idx").on(t.clientId),
    index("conversion_test_sessions_def_id_idx").on(t.conversionDefinitionId),
    index("conversion_test_sessions_expires_at_idx").on(t.expiresAt),
  ]
)

export const conversionObservations = pgTable(
  "conversion_observations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    trackingSiteId: uuid("tracking_site_id").references(() => trackingSites.id, { onDelete: "set null" }),
    conversionDefinitionId: uuid("conversion_definition_id").references(() => conversionDefinitions.id, { onDelete: "set null" }),
    testSessionId: uuid("test_session_id").references(() => conversionTestSessions.id, { onDelete: "set null" }),
    source: observationSourceEnum("source").notNull(),
    eventName: text("event_name").notNull(),
    eventIdHash: text("event_id_hash"),
    pageUrl: text("page_url"),
    environment: siteEnvironmentEnum("environment").notNull().default("production"),
    parametersPresent: jsonb("parameters_present").$type<Record<string, boolean>>().notNull().default({}),
    validationResult: jsonb("validation_result").$type<Record<string, unknown>>().notNull().default({}),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
    retentionExpiresAt: timestamp("retention_expires_at", { withTimezone: true }).notNull().default(sql`NOW() + INTERVAL '90 days'`),
  },
  (t) => [
    index("conversion_observations_org_id_idx").on(t.orgId),
    index("conversion_observations_client_id_idx").on(t.clientId),
    index("conversion_observations_def_id_idx").on(t.conversionDefinitionId),
    index("conversion_observations_session_id_idx").on(t.testSessionId),
    index("conversion_observations_observed_at_idx").on(t.observedAt),
    index("conversion_observations_retention_idx").on(t.retentionExpiresAt),
  ]
)

export const conversionIssues = pgTable(
  "conversion_issues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    conversionDefinitionId: uuid("conversion_definition_id").references(() => conversionDefinitions.id, { onDelete: "cascade" }),
    issueCode: text("issue_code").notNull(),
    severity: conversionIssueSeverityEnum("severity").notNull().default("medium"),
    status: conversionIssueStatusEnum("status").notNull().default("open"),
    explanation: text("explanation"),
    remediationKey: text("remediation_key"),
    firstDetectedAt: timestamp("first_detected_at", { withTimezone: true }).notNull().defaultNow(),
    lastDetectedAt: timestamp("last_detected_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [
    index("conversion_issues_org_id_idx").on(t.orgId),
    index("conversion_issues_client_id_idx").on(t.clientId),
    index("conversion_issues_def_id_idx").on(t.conversionDefinitionId),
    index("conversion_issues_open_idx").on(t.clientId, t.status),
  ]
)

// ─── Conversion Diagnostics Relations ────────────────────────────────────────

export const trackingSitesRelations = relations(trackingSites, ({ one, many }) => ({
  organization: one(organizations, { fields: [trackingSites.orgId], references: [organizations.id] }),
  client: one(clients, { fields: [trackingSites.clientId], references: [clients.id] }),
  conversionDefinitions: many(conversionDefinitions),
  testSessions: many(conversionTestSessions),
  observations: many(conversionObservations),
}))

export const conversionDefinitionsRelations = relations(conversionDefinitions, ({ one, many }) => ({
  organization: one(organizations, { fields: [conversionDefinitions.orgId], references: [organizations.id] }),
  client: one(clients, { fields: [conversionDefinitions.clientId], references: [clients.id] }),
  trackingSite: one(trackingSites, { fields: [conversionDefinitions.trackingSiteId], references: [trackingSites.id] }),
  createdByUser: one(users, { fields: [conversionDefinitions.createdBy], references: [users.id] }),
  testSessions: many(conversionTestSessions),
  observations: many(conversionObservations),
  issues: many(conversionIssues),
}))

export const conversionTestSessionsRelations = relations(conversionTestSessions, ({ one, many }) => ({
  organization: one(organizations, { fields: [conversionTestSessions.orgId], references: [organizations.id] }),
  client: one(clients, { fields: [conversionTestSessions.clientId], references: [clients.id] }),
  trackingSite: one(trackingSites, { fields: [conversionTestSessions.trackingSiteId], references: [trackingSites.id] }),
  conversionDefinition: one(conversionDefinitions, { fields: [conversionTestSessions.conversionDefinitionId], references: [conversionDefinitions.id] }),
  startedByUser: one(users, { fields: [conversionTestSessions.startedBy], references: [users.id] }),
  observations: many(conversionObservations),
}))

export const conversionObservationsRelations = relations(conversionObservations, ({ one }) => ({
  organization: one(organizations, { fields: [conversionObservations.orgId], references: [organizations.id] }),
  client: one(clients, { fields: [conversionObservations.clientId], references: [clients.id] }),
  trackingSite: one(trackingSites, { fields: [conversionObservations.trackingSiteId], references: [trackingSites.id] }),
  conversionDefinition: one(conversionDefinitions, { fields: [conversionObservations.conversionDefinitionId], references: [conversionDefinitions.id] }),
  testSession: one(conversionTestSessions, { fields: [conversionObservations.testSessionId], references: [conversionTestSessions.id] }),
}))

export const conversionIssuesRelations = relations(conversionIssues, ({ one }) => ({
  organization: one(organizations, { fields: [conversionIssues.orgId], references: [organizations.id] }),
  client: one(clients, { fields: [conversionIssues.clientId], references: [clients.id] }),
  conversionDefinition: one(conversionDefinitions, { fields: [conversionIssues.conversionDefinitionId], references: [conversionDefinitions.id] }),
}))

// ─── Exported Types ───────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect
export type Organization = typeof organizations.$inferSelect
export type NewOrganization = typeof organizations.$inferInsert
export type OrgMember = typeof orgMembers.$inferSelect
export type NewOrgMember = typeof orgMembers.$inferInsert
export type Client = typeof clients.$inferSelect
export type NewClient = typeof clients.$inferInsert
export type MetaConnection = typeof metaConnections.$inferSelect
export type NewMetaConnection = typeof metaConnections.$inferInsert
export type Campaign = typeof campaigns.$inferSelect
export type NewCampaign = typeof campaigns.$inferInsert
export type IngestionCredential = typeof ingestionCredentials.$inferSelect
export type NewIngestionCredential = typeof ingestionCredentials.$inferInsert
export type Pipeline = typeof pipelines.$inferSelect
export type NewPipeline = typeof pipelines.$inferInsert
export type PipelineStage = typeof pipelineStages.$inferSelect
export type NewPipelineStage = typeof pipelineStages.$inferInsert
export type Lead = typeof leads.$inferSelect
export type NewLead = typeof leads.$inferInsert
export type LeadStageHistory = typeof leadStageHistory.$inferSelect
export type LeadNote = typeof leadNotes.$inferSelect
export type NewLeadNote = typeof leadNotes.$inferInsert
export type LeadActivity = typeof leadActivities.$inferSelect
export type SalesRep = typeof salesReps.$inferSelect
export type NewSalesRep = typeof salesReps.$inferInsert
export type LeadAssignment = typeof leadAssignments.$inferSelect
export type LeadAttributionTouchpoint = typeof leadAttributionTouchpoints.$inferSelect
export type QualificationRuleSet = typeof qualificationRuleSets.$inferSelect
export type NewQualificationRuleSet = typeof qualificationRuleSets.$inferInsert
export type QualificationProfile = typeof qualificationProfiles.$inferSelect
export type NewQualificationProfile = typeof qualificationProfiles.$inferInsert
export type QualificationRule = typeof qualificationRules.$inferSelect
export type NewQualificationRule = typeof qualificationRules.$inferInsert
export type QualificationFieldDefinition = typeof qualificationFieldDefinitions.$inferSelect
export type NewQualificationFieldDefinition = typeof qualificationFieldDefinitions.$inferInsert
export type LeadBehaviorEvent = typeof leadBehaviorEvents.$inferSelect
export type NewLeadBehaviorEvent = typeof leadBehaviorEvents.$inferInsert
export type LeadQualification = typeof leadQualifications.$inferSelect
export type NewLeadQualification = typeof leadQualifications.$inferInsert
export type Conversion = typeof conversions.$inferSelect
export type NewConversion = typeof conversions.$inferInsert
export type MetaEvent = typeof metaEvents.$inferSelect
export type AdInsightsDaily = typeof adInsightsDaily.$inferSelect
export type ImportBatch = typeof importBatches.$inferSelect
export type ImportRow = typeof importRows.$inferSelect
export type AuditLog = typeof auditLogs.$inferSelect
export type WebhookEvent = typeof webhookEvents.$inferSelect
export type Funnel = typeof funnels.$inferSelect
export type NewFunnel = typeof funnels.$inferInsert
export type WaClientConfig = typeof waClientConfig.$inferSelect
export type NewWaClientConfig = typeof waClientConfig.$inferInsert
export type MessageTemplate = typeof messageTemplates.$inferSelect
export type NewMessageTemplate = typeof messageTemplates.$inferInsert
export type WaMessage = typeof waMessages.$inferSelect
export type NewWaMessage = typeof waMessages.$inferInsert
export type WaProviderEvent = typeof waProviderEvents.$inferSelect
export type NewWaProviderEvent = typeof waProviderEvents.$inferInsert

export type MetaAdAccountAllowlistRow = typeof metaAdAccountAllowlist.$inferSelect
export type NewMetaAdAccountAllowlistRow = typeof metaAdAccountAllowlist.$inferInsert
export type MetaCatalogCampaign = typeof metaCatalogCampaigns.$inferSelect
export type NewMetaCatalogCampaign = typeof metaCatalogCampaigns.$inferInsert
export type MetaCatalogAdset = typeof metaCatalogAdsets.$inferSelect
export type NewMetaCatalogAdset = typeof metaCatalogAdsets.$inferInsert
export type MetaCatalogAd = typeof metaCatalogAds.$inferSelect
export type NewMetaCatalogAd = typeof metaCatalogAds.$inferInsert

// Enum value types
export type MemberRole = typeof memberRoleEnum.enumValues[number]
export type MetaConnectionMode = typeof metaConnectionModeEnum.enumValues[number]
export type Temperature = "hot" | "warm" | "cold"
export type LeadStage = "new" | "contacted" | "interested" | "quoted" | "won" | "lost"
export type LeadPlatform = "facebook" | "instagram" | "meta" | "direct" | "organic"
export type LeadDevice = "mobile" | "desktop"
export type ConversionStatus = typeof conversionStatusEnum.enumValues[number]
export type MetaEventStatus = typeof metaEventStatusEnum.enumValues[number]
export type WaMessageStatus = typeof waMessageStatusEnum.enumValues[number]
export type WaConfirmationMethod = typeof waConfirmationMethodEnum.enumValues[number]

// Conversion Diagnostics types
export type TrackingSite = typeof trackingSites.$inferSelect
export type NewTrackingSite = typeof trackingSites.$inferInsert
export type ConversionDefinition = typeof conversionDefinitions.$inferSelect
export type NewConversionDefinition = typeof conversionDefinitions.$inferInsert
export type ConversionTestSession = typeof conversionTestSessions.$inferSelect
export type NewConversionTestSession = typeof conversionTestSessions.$inferInsert
export type ConversionObservation = typeof conversionObservations.$inferSelect
export type NewConversionObservation = typeof conversionObservations.$inferInsert
export type ConversionIssue = typeof conversionIssues.$inferSelect
export type NewConversionIssue = typeof conversionIssues.$inferInsert
export type DiagConversionStatus = typeof diagConversionStatusEnum.enumValues[number]
export type ConversionProvider = typeof conversionProviderEnum.enumValues[number]
export type ExpectedSource = typeof expectedSourceEnum.enumValues[number]
export type ConversionTriggerType = typeof conversionTriggerTypeEnum.enumValues[number]
export type ConversionCriticality = typeof conversionCriticalityEnum.enumValues[number]
export type ObservationSource = typeof observationSourceEnum.enumValues[number]
export type ConversionIssueSeverity = typeof conversionIssueSeverityEnum.enumValues[number]
export type ConversionIssueStatus = typeof conversionIssueStatusEnum.enumValues[number]
export type TestSessionStatus = typeof testSessionStatusEnum.enumValues[number]
export type SiteEnvironment = typeof siteEnvironmentEnum.enumValues[number]
