CREATE TYPE "public"."conversion_criticality" AS ENUM('critical', 'high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."conversion_issue_severity" AS ENUM('critical', 'high', 'medium', 'low', 'info');--> statement-breakpoint
CREATE TYPE "public"."conversion_issue_status" AS ENUM('open', 'acknowledged', 'resolved', 'ignored');--> statement-breakpoint
CREATE TYPE "public"."conversion_provider" AS ENUM('meta_pixel', 'meta_capi', 'both', 'custom');--> statement-breakpoint
CREATE TYPE "public"."conversion_trigger_type" AS ENUM('page_load', 'element_click', 'data_attribute', 'form_submit', 'explicit_callback', 'datalayer_event', 'ecommerce_event', 'webhook', 'manual_sale');--> statement-breakpoint
CREATE TYPE "public"."cron_run_status" AS ENUM('running', 'completed', 'failed', 'timeout');--> statement-breakpoint
CREATE TYPE "public"."diag_conversion_status" AS ENUM('not_configured', 'code_not_detected', 'code_detected', 'awaiting_test', 'observed_browser', 'observed_server', 'observed_both', 'accepted_by_meta', 'misconfigured', 'duplicate_risk', 'stale', 'failed', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."expected_source" AS ENUM('browser', 'server', 'both');--> statement-breakpoint
CREATE TYPE "public"."meta_connection_mode" AS ENUM('internal_manual', 'external_oauth');--> statement-breakpoint
CREATE TYPE "public"."observation_source" AS ENUM('browser_pixel', 'server_capi', 'diagnostic_collector', 'scan');--> statement-breakpoint
CREATE TYPE "public"."qualification_profile_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."qualification_rule_action" AS ENUM('add_score', 'force_result', 'disqualify');--> statement-breakpoint
CREATE TYPE "public"."site_environment" AS ENUM('production', 'staging', 'development');--> statement-breakpoint
CREATE TYPE "public"."test_session_status" AS ENUM('pending', 'active', 'completed', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."wa_confirmation_method" AS ENUM('manual', 'provider');--> statement-breakpoint
CREATE TYPE "public"."wa_message_status" AS ENUM('link_prepared', 'marked_shared', 'provider_accepted', 'sent', 'delivered', 'read', 'contacted', 'failed');--> statement-breakpoint
ALTER TYPE "public"."import_batch_status" ADD VALUE 'dry_run' BEFORE 'processing';--> statement-breakpoint
ALTER TYPE "public"."import_batch_status" ADD VALUE 'rollback';--> statement-breakpoint
ALTER TYPE "public"."import_row_status" ADD VALUE 'skipped' BEFORE 'failed';--> statement-breakpoint
ALTER TYPE "public"."import_row_status" ADD VALUE 'warning' BEFORE 'failed';--> statement-breakpoint
ALTER TYPE "public"."lead_activity_type" ADD VALUE 'assignment_changed';--> statement-breakpoint
ALTER TYPE "public"."lead_activity_type" ADD VALUE 'wa_link_prepared';--> statement-breakpoint
ALTER TYPE "public"."lead_activity_type" ADD VALUE 'wa_marked_shared';--> statement-breakpoint
ALTER TYPE "public"."lead_activity_type" ADD VALUE 'wa_contacted';--> statement-breakpoint
ALTER TYPE "public"."lead_activity_type" ADD VALUE 'wa_provider_update';--> statement-breakpoint
ALTER TYPE "public"."lead_activity_type" ADD VALUE 'wa_correction';--> statement-breakpoint
ALTER TYPE "public"."meta_event_status" ADD VALUE 'processing' BEFORE 'sent';--> statement-breakpoint
ALTER TYPE "public"."meta_event_status" ADD VALUE 'retrying' BEFORE 'sent';--> statement-breakpoint
ALTER TYPE "public"."meta_event_status" ADD VALUE 'cancelled';--> statement-breakpoint
CREATE TABLE "conversion_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"tracking_site_id" uuid,
	"internal_key" text NOT NULL,
	"display_name" text NOT NULL,
	"provider" "conversion_provider" DEFAULT 'meta_pixel' NOT NULL,
	"provider_event_name" text NOT NULL,
	"description" text,
	"business_category" text,
	"expected_source" "expected_source" DEFAULT 'both' NOT NULL,
	"trigger_type" "conversion_trigger_type" DEFAULT 'explicit_callback' NOT NULL,
	"trigger_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"required_parameters" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"criticality" "conversion_criticality" DEFAULT 'medium' NOT NULL,
	"freshness_policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"installation_notes" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversion_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"conversion_definition_id" uuid,
	"issue_code" text NOT NULL,
	"severity" "conversion_issue_severity" DEFAULT 'medium' NOT NULL,
	"status" "conversion_issue_status" DEFAULT 'open' NOT NULL,
	"explanation" text,
	"remediation_key" text,
	"first_detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "conversion_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"tracking_site_id" uuid,
	"conversion_definition_id" uuid,
	"test_session_id" uuid,
	"source" "observation_source" NOT NULL,
	"event_name" text NOT NULL,
	"event_id_hash" text,
	"page_url" text,
	"environment" "site_environment" DEFAULT 'production' NOT NULL,
	"parameters_present" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"validation_result" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retention_expires_at" timestamp with time zone DEFAULT NOW() + INTERVAL '90 days' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversion_test_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"tracking_site_id" uuid,
	"conversion_definition_id" uuid NOT NULL,
	"public_token_hash" text NOT NULL,
	"status" "test_session_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"started_by" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "conversion_test_sessions_public_token_hash_unique" UNIQUE("public_token_hash")
);
--> statement-breakpoint
CREATE TABLE "cron_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_name" text NOT NULL,
	"correlation_id" text NOT NULL,
	"status" "cron_run_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"duration_ms" integer,
	"items_processed" integer DEFAULT 0 NOT NULL,
	"items_failed" integer DEFAULT 0 NOT NULL,
	"result" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "lead_behavior_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"lead_id" uuid,
	"event_type" text NOT NULL,
	"external_id" text,
	"product_id" text,
	"variant_id" text,
	"category" text,
	"quantity" integer,
	"value" numeric(12, 2),
	"currency" text,
	"cart_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"platform" text,
	"source" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"campaign_id" uuid,
	"name" text NOT NULL,
	"content" text NOT NULL,
	"allowed_variables" text[] DEFAULT '{}' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta_ad_account_allowlist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"ad_account_id" text NOT NULL,
	"added_by_id" text,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta_catalog_ads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"ad_account_id" text NOT NULL,
	"meta_ad_id" text NOT NULL,
	"meta_adset_id" text NOT NULL,
	"meta_campaign_id" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'UNKNOWN' NOT NULL,
	"effective_status" text,
	"creative_name" text,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta_catalog_adsets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"ad_account_id" text NOT NULL,
	"meta_adset_id" text NOT NULL,
	"meta_campaign_id" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'UNKNOWN' NOT NULL,
	"effective_status" text,
	"targeting_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta_catalog_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"ad_account_id" text NOT NULL,
	"meta_campaign_id" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'UNKNOWN' NOT NULL,
	"effective_status" text,
	"objective" text,
	"start_time" timestamp with time zone,
	"stop_time" timestamp with time zone,
	"daily_budget" numeric(18, 2),
	"lifetime_budget" numeric(18, 2),
	"internal_campaign_id" uuid,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qualification_field_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"client_id" uuid,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"data_type" text DEFAULT 'text' NOT NULL,
	"source" text DEFAULT 'standard' NOT NULL,
	"category" text DEFAULT 'other' NOT NULL,
	"is_sensitive" boolean DEFAULT false NOT NULL,
	"allowed_operators" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"normalization" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enum_options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_required_for_eval" boolean DEFAULT false NOT NULL,
	"event_config" jsonb,
	"leads_column" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qualification_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"status" "qualification_profile_status" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"initial_score" integer DEFAULT 0 NOT NULL,
	"thresholds" jsonb DEFAULT '{"hot":{"min":70},"warm":{"min":40,"max":69},"cold":{"max":39}}'::jsonb NOT NULL,
	"result_labels" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"published_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qualification_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"priority" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"conditions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"action" "qualification_rule_action" DEFAULT 'add_score' NOT NULL,
	"score_delta" integer DEFAULT 0 NOT NULL,
	"forced_result" text,
	"reason" text DEFAULT '' NOT NULL,
	"stop_processing" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracking_sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"name" text NOT NULL,
	"domain" text NOT NULL,
	"environment" "site_environment" DEFAULT 'production' NOT NULL,
	"expected_pixel_id" text,
	"allowed_origins" text[] DEFAULT '{}'::text[] NOT NULL,
	"verified_at" timestamp with time zone,
	"verification_method" text,
	"diagnostics_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wa_client_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"confirmation_mode" "wa_confirmation_method" DEFAULT 'manual' NOT NULL,
	"provider_name" text,
	"provider_config_enc" text,
	"provider_key_version" integer DEFAULT 1 NOT NULL,
	"webhook_secret_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wa_client_config_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "wa_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"assignment_id" uuid,
	"template_id" uuid,
	"sent_by_id" text,
	"sales_rep_id" uuid,
	"confirmation_mode" "wa_confirmation_method" NOT NULL,
	"status" "wa_message_status" DEFAULT 'link_prepared' NOT NULL,
	"external_message_id" text,
	"provider_name" text,
	"provider_status_raw" text,
	"confirmed_by_id" text,
	"confirmed_at" timestamp with time zone,
	"corrected_at" timestamp with time zone,
	"corrected_by_id" text,
	"correction_reason" text,
	"note" text,
	"link_opened_at" timestamp with time zone,
	"provider_accepted_at" timestamp with time zone,
	"provider_sent_at" timestamp with time zone,
	"provider_delivered_at" timestamp with time zone,
	"provider_read_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wa_provider_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"wa_message_id" uuid,
	"external_message_id" text NOT NULL,
	"provider_name" text NOT NULL,
	"event_type" text NOT NULL,
	"status_raw" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wa_provider_events_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
ALTER TABLE "lead_qualifications" ALTER COLUMN "rule_set_version" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "ad_insights_daily" ADD COLUMN "ad_account_id" text;--> statement-breakpoint
ALTER TABLE "ad_insights_daily" ADD COLUMN "level" text;--> statement-breakpoint
ALTER TABLE "ad_insights_daily" ADD COLUMN "object_id" text;--> statement-breakpoint
ALTER TABLE "ad_insights_daily" ADD COLUMN "currency" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "profile_id" uuid;--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "client_id" uuid;--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "skipped_rows" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "warning_rows" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "file_hash" text;--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "sheet_name" text;--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "original_filename" text;--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "column_mapping" jsonb;--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "dry_run_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "import_rows" ADD COLUMN "conversion_id" uuid;--> statement-breakpoint
ALTER TABLE "import_rows" ADD COLUMN "dedupe_key" text NOT NULL;--> statement-breakpoint
ALTER TABLE "import_rows" ADD COLUMN "fingerprint" text;--> statement-breakpoint
ALTER TABLE "import_rows" ADD COLUMN "warning" text;--> statement-breakpoint
ALTER TABLE "lead_assignments" ADD COLUMN "reason" text;--> statement-breakpoint
ALTER TABLE "lead_assignments" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "lead_qualifications" ADD COLUMN "profile_id" uuid;--> statement-breakpoint
ALTER TABLE "lead_qualifications" ADD COLUMN "profile_version" integer;--> statement-breakpoint
ALTER TABLE "lead_qualifications" ADD COLUMN "score_int" integer;--> statement-breakpoint
ALTER TABLE "lead_qualifications" ADD COLUMN "evaluation_trigger" text;--> statement-breakpoint
ALTER TABLE "lead_qualifications" ADD COLUMN "matched_rules" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "lead_qualifications" ADD COLUMN "missing_fields" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "lead_qualifications" ADD COLUMN "eval_duration_ms" integer;--> statement-breakpoint
ALTER TABLE "lead_qualifications" ADD COLUMN "snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "lead_qualifications" ADD COLUMN "visible_label" text;--> statement-breakpoint
ALTER TABLE "lead_qualifications" ADD COLUMN "qual_class" text DEFAULT 'unqualified' NOT NULL;--> statement-breakpoint
ALTER TABLE "lead_qualifications" ADD COLUMN "qual_type" text DEFAULT 'automatic' NOT NULL;--> statement-breakpoint
ALTER TABLE "lead_qualifications" ADD COLUMN "reasons" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "lead_qualifications" ADD COLUMN "inputs" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "lead_qualifications" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "lead_qualifications" ADD COLUMN "actor_id" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "negocio_raw" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "negocio_normalized" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "city_canonical" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "effective_qual_class" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "custom_data" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "first_contacted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "last_contacted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "next_follow_up_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "consent_given" boolean;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "legal_basis" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "consented_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "deletion_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "erased_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "meta_connections" ADD COLUMN "ad_account_id" text;--> statement-breakpoint
ALTER TABLE "meta_connections" ADD COLUMN "connection_mode" "meta_connection_mode" DEFAULT 'internal_manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "meta_connections" ADD COLUMN "meta_page_id" text;--> statement-breakpoint
ALTER TABLE "meta_connections" ADD COLUMN "webhook_verify_token" text;--> statement-breakpoint
ALTER TABLE "meta_connections" ADD COLUMN "lead_ads_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "meta_sync_runs" ADD COLUMN "ad_account_id" text;--> statement-breakpoint
ALTER TABLE "meta_sync_runs" ADD COLUMN "sync_type" text;--> statement-breakpoint
ALTER TABLE "meta_sync_runs" ADD COLUMN "locked_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "meta_sync_runs" ADD COLUMN "locked_by" text;--> statement-breakpoint
ALTER TABLE "sales_reps" ADD COLUMN "client_id" uuid;--> statement-breakpoint
ALTER TABLE "sales_reps" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "conversion_definitions" ADD CONSTRAINT "conversion_definitions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_definitions" ADD CONSTRAINT "conversion_definitions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_definitions" ADD CONSTRAINT "conversion_definitions_tracking_site_id_tracking_sites_id_fk" FOREIGN KEY ("tracking_site_id") REFERENCES "public"."tracking_sites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_definitions" ADD CONSTRAINT "conversion_definitions_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_issues" ADD CONSTRAINT "conversion_issues_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_issues" ADD CONSTRAINT "conversion_issues_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_issues" ADD CONSTRAINT "conversion_issues_conversion_definition_id_conversion_definitions_id_fk" FOREIGN KEY ("conversion_definition_id") REFERENCES "public"."conversion_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_observations" ADD CONSTRAINT "conversion_observations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_observations" ADD CONSTRAINT "conversion_observations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_observations" ADD CONSTRAINT "conversion_observations_tracking_site_id_tracking_sites_id_fk" FOREIGN KEY ("tracking_site_id") REFERENCES "public"."tracking_sites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_observations" ADD CONSTRAINT "conversion_observations_conversion_definition_id_conversion_definitions_id_fk" FOREIGN KEY ("conversion_definition_id") REFERENCES "public"."conversion_definitions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_observations" ADD CONSTRAINT "conversion_observations_test_session_id_conversion_test_sessions_id_fk" FOREIGN KEY ("test_session_id") REFERENCES "public"."conversion_test_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_test_sessions" ADD CONSTRAINT "conversion_test_sessions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_test_sessions" ADD CONSTRAINT "conversion_test_sessions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_test_sessions" ADD CONSTRAINT "conversion_test_sessions_tracking_site_id_tracking_sites_id_fk" FOREIGN KEY ("tracking_site_id") REFERENCES "public"."tracking_sites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_test_sessions" ADD CONSTRAINT "conversion_test_sessions_conversion_definition_id_conversion_definitions_id_fk" FOREIGN KEY ("conversion_definition_id") REFERENCES "public"."conversion_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_test_sessions" ADD CONSTRAINT "conversion_test_sessions_started_by_user_id_fk" FOREIGN KEY ("started_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_behavior_events" ADD CONSTRAINT "lead_behavior_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_behavior_events" ADD CONSTRAINT "lead_behavior_events_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_ad_account_allowlist" ADD CONSTRAINT "meta_ad_account_allowlist_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_ad_account_allowlist" ADD CONSTRAINT "meta_ad_account_allowlist_added_by_id_user_id_fk" FOREIGN KEY ("added_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_catalog_ads" ADD CONSTRAINT "meta_catalog_ads_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_catalog_ads" ADD CONSTRAINT "meta_catalog_ads_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_catalog_adsets" ADD CONSTRAINT "meta_catalog_adsets_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_catalog_adsets" ADD CONSTRAINT "meta_catalog_adsets_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_catalog_campaigns" ADD CONSTRAINT "meta_catalog_campaigns_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_catalog_campaigns" ADD CONSTRAINT "meta_catalog_campaigns_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_catalog_campaigns" ADD CONSTRAINT "meta_catalog_campaigns_internal_campaign_id_campaigns_id_fk" FOREIGN KEY ("internal_campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification_field_definitions" ADD CONSTRAINT "qualification_field_definitions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification_field_definitions" ADD CONSTRAINT "qualification_field_definitions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification_profiles" ADD CONSTRAINT "qualification_profiles_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification_profiles" ADD CONSTRAINT "qualification_profiles_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification_rules" ADD CONSTRAINT "qualification_rules_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification_rules" ADD CONSTRAINT "qualification_rules_profile_id_qualification_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."qualification_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_sites" ADD CONSTRAINT "tracking_sites_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_sites" ADD CONSTRAINT "tracking_sites_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_client_config" ADD CONSTRAINT "wa_client_config_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_client_config" ADD CONSTRAINT "wa_client_config_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_messages" ADD CONSTRAINT "wa_messages_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_messages" ADD CONSTRAINT "wa_messages_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_messages" ADD CONSTRAINT "wa_messages_assignment_id_lead_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."lead_assignments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_messages" ADD CONSTRAINT "wa_messages_template_id_message_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."message_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_messages" ADD CONSTRAINT "wa_messages_sent_by_id_user_id_fk" FOREIGN KEY ("sent_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_messages" ADD CONSTRAINT "wa_messages_sales_rep_id_sales_reps_id_fk" FOREIGN KEY ("sales_rep_id") REFERENCES "public"."sales_reps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_messages" ADD CONSTRAINT "wa_messages_confirmed_by_id_user_id_fk" FOREIGN KEY ("confirmed_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_messages" ADD CONSTRAINT "wa_messages_corrected_by_id_user_id_fk" FOREIGN KEY ("corrected_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_provider_events" ADD CONSTRAINT "wa_provider_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_provider_events" ADD CONSTRAINT "wa_provider_events_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_provider_events" ADD CONSTRAINT "wa_provider_events_wa_message_id_wa_messages_id_fk" FOREIGN KEY ("wa_message_id") REFERENCES "public"."wa_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversion_definitions_org_client_key_idx" ON "conversion_definitions" USING btree ("org_id","client_id","internal_key");--> statement-breakpoint
CREATE INDEX "conversion_definitions_org_id_idx" ON "conversion_definitions" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "conversion_definitions_client_id_idx" ON "conversion_definitions" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "conversion_definitions_site_id_idx" ON "conversion_definitions" USING btree ("tracking_site_id");--> statement-breakpoint
CREATE INDEX "conversion_issues_org_id_idx" ON "conversion_issues" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "conversion_issues_client_id_idx" ON "conversion_issues" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "conversion_issues_def_id_idx" ON "conversion_issues" USING btree ("conversion_definition_id");--> statement-breakpoint
CREATE INDEX "conversion_issues_open_idx" ON "conversion_issues" USING btree ("client_id","status");--> statement-breakpoint
CREATE INDEX "conversion_observations_org_id_idx" ON "conversion_observations" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "conversion_observations_client_id_idx" ON "conversion_observations" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "conversion_observations_def_id_idx" ON "conversion_observations" USING btree ("conversion_definition_id");--> statement-breakpoint
CREATE INDEX "conversion_observations_session_id_idx" ON "conversion_observations" USING btree ("test_session_id");--> statement-breakpoint
CREATE INDEX "conversion_observations_observed_at_idx" ON "conversion_observations" USING btree ("observed_at");--> statement-breakpoint
CREATE INDEX "conversion_observations_retention_idx" ON "conversion_observations" USING btree ("retention_expires_at");--> statement-breakpoint
CREATE INDEX "conversion_test_sessions_org_id_idx" ON "conversion_test_sessions" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "conversion_test_sessions_client_id_idx" ON "conversion_test_sessions" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "conversion_test_sessions_def_id_idx" ON "conversion_test_sessions" USING btree ("conversion_definition_id");--> statement-breakpoint
CREATE INDEX "conversion_test_sessions_expires_at_idx" ON "conversion_test_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "cron_runs_job_name_idx" ON "cron_runs" USING btree ("job_name");--> statement-breakpoint
CREATE INDEX "cron_runs_started_at_idx" ON "cron_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "cron_runs_status_idx" ON "cron_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "lead_behavior_events_lead_id_idx" ON "lead_behavior_events" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "lead_behavior_events_org_id_idx" ON "lead_behavior_events" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "lead_behavior_events_event_type_idx" ON "lead_behavior_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "lead_behavior_events_occurred_at_idx" ON "lead_behavior_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_behavior_events_dedup_idx" ON "lead_behavior_events" USING btree ("lead_id","external_id") WHERE external_id IS NOT NULL AND lead_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "message_templates_org_id_idx" ON "message_templates" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "message_templates_client_id_idx" ON "message_templates" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "meta_allowlist_org_id_idx" ON "meta_ad_account_allowlist" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "meta_allowlist_org_account_idx" ON "meta_ad_account_allowlist" USING btree ("org_id","ad_account_id");--> statement-breakpoint
CREATE INDEX "meta_catalog_ads_org_id_idx" ON "meta_catalog_ads" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "meta_catalog_ads_client_id_idx" ON "meta_catalog_ads" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "meta_catalog_ads_org_meta_idx" ON "meta_catalog_ads" USING btree ("org_id","meta_ad_id");--> statement-breakpoint
CREATE INDEX "meta_catalog_adsets_org_id_idx" ON "meta_catalog_adsets" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "meta_catalog_adsets_client_id_idx" ON "meta_catalog_adsets" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "meta_catalog_adsets_org_meta_idx" ON "meta_catalog_adsets" USING btree ("org_id","meta_adset_id");--> statement-breakpoint
CREATE INDEX "meta_catalog_campaigns_org_id_idx" ON "meta_catalog_campaigns" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "meta_catalog_campaigns_client_id_idx" ON "meta_catalog_campaigns" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "meta_catalog_campaigns_org_meta_idx" ON "meta_catalog_campaigns" USING btree ("org_id","meta_campaign_id");--> statement-breakpoint
CREATE INDEX "qual_field_defs_org_id_idx" ON "qualification_field_definitions" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "qual_field_defs_key_org_idx" ON "qualification_field_definitions" USING btree ("key","org_id") WHERE org_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "qual_field_defs_key_system_idx" ON "qualification_field_definitions" USING btree ("key") WHERE org_id IS NULL;--> statement-breakpoint
CREATE INDEX "qual_profiles_org_id_idx" ON "qualification_profiles" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "qual_profiles_client_id_idx" ON "qualification_profiles" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "qual_profiles_status_idx" ON "qualification_profiles" USING btree ("status");--> statement-breakpoint
CREATE INDEX "qual_rules_profile_id_idx" ON "qualification_rules" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "qual_rules_org_id_idx" ON "qualification_rules" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "qual_rules_priority_idx" ON "qualification_rules" USING btree ("profile_id","priority");--> statement-breakpoint
CREATE INDEX "tracking_sites_org_id_idx" ON "tracking_sites" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "tracking_sites_client_id_idx" ON "tracking_sites" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tracking_sites_client_domain_env_idx" ON "tracking_sites" USING btree ("client_id","domain","environment");--> statement-breakpoint
CREATE INDEX "wa_client_config_org_id_idx" ON "wa_client_config" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "wa_messages_lead_id_idx" ON "wa_messages" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "wa_messages_org_id_idx" ON "wa_messages" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "wa_messages_status_idx" ON "wa_messages" USING btree ("status");--> statement-breakpoint
CREATE INDEX "wa_messages_external_id_idx" ON "wa_messages" USING btree ("external_message_id");--> statement-breakpoint
CREATE INDEX "wa_provider_events_org_id_idx" ON "wa_provider_events" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "wa_provider_events_external_id_idx" ON "wa_provider_events" USING btree ("external_message_id");--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_conversion_id_conversions_id_fk" FOREIGN KEY ("conversion_id") REFERENCES "public"."conversions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_qualifications" ADD CONSTRAINT "lead_qualifications_profile_id_qualification_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."qualification_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_reps" ADD CONSTRAINT "sales_reps_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ad_insights_v2_unique_idx" ON "ad_insights_daily" USING btree ("org_id","ad_account_id","date","level","object_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ad_insights_adset_date_idx" ON "ad_insights_daily" USING btree ("org_id","meta_adset_id","date") WHERE meta_ad_id IS NULL AND meta_adset_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "leads_effective_qual_class_idx" ON "leads" USING btree ("effective_qual_class");--> statement-breakpoint
CREATE INDEX "leads_ip_expires_at_idx" ON "leads" USING btree ("ip_expires_at");--> statement-breakpoint
CREATE INDEX "leads_ua_expires_at_idx" ON "leads" USING btree ("ua_expires_at");--> statement-breakpoint
CREATE INDEX "leads_deletion_requested_idx" ON "leads" USING btree ("deletion_requested_at");--> statement-breakpoint
CREATE INDEX "meta_sync_runs_account_idx" ON "meta_sync_runs" USING btree ("org_id","ad_account_id");--> statement-breakpoint
CREATE INDEX "sales_reps_client_id_idx" ON "sales_reps" USING btree ("client_id");--> statement-breakpoint
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_dedupe_key_unique" UNIQUE("dedupe_key");