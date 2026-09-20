CREATE TYPE "public"."audit_actor_type" AS ENUM('user', 'system', 'api');--> statement-breakpoint
CREATE TYPE "public"."conversion_status" AS ENUM('pending', 'confirmed', 'cancelled', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."ingestion_credential_status" AS ENUM('active', 'revoked', 'expired');--> statement-breakpoint
CREATE TYPE "public"."ingestion_credential_type" AS ENUM('public_form', 'server_secret');--> statement-breakpoint
CREATE TYPE "public"."import_batch_status" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."import_row_status" AS ENUM('pending', 'imported', 'duplicate', 'failed');--> statement-breakpoint
CREATE TYPE "public"."lead_activity_type" AS ENUM('created', 'stage_changed', 'temperature_changed', 'note_added', 'assigned', 'converted', 'conversion_cancelled', 'meta_event_sent', 'imported', 'qualified', 'tagged');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'admin', 'manager', 'agent', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."meta_connection_status" AS ENUM('active', 'error', 'expired', 'pending');--> statement-breakpoint
CREATE TYPE "public"."meta_event_status" AS ENUM('pending', 'sent', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."attribution_touch_type" AS ENUM('first_touch', 'last_touch', 'assist');--> statement-breakpoint
CREATE TABLE "ad_insights_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"campaign_id" uuid,
	"meta_campaign_id" text,
	"meta_adset_id" text,
	"meta_ad_id" text,
	"date" date NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"spend" numeric(12, 2) DEFAULT '0' NOT NULL,
	"reach" integer,
	"conversions_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"actor_id" text,
	"actor_type" "audit_actor_type" DEFAULT 'user' NOT NULL,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip_redacted" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"campaign_id" uuid,
	"order_id" text,
	"amount" numeric(12, 2) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"status" "conversion_status" DEFAULT 'confirmed' NOT NULL,
	"converted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" text,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"refunded_at" timestamp with time zone,
	"refund_amount" numeric(12, 2),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"campaign_id" uuid,
	"source" text DEFAULT 'csv' NOT NULL,
	"status" "import_batch_status" DEFAULT 'pending' NOT NULL,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"processed_rows" integer DEFAULT 0 NOT NULL,
	"failed_rows" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"row_index" integer NOT NULL,
	"raw_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "import_row_status" DEFAULT 'pending' NOT NULL,
	"lead_id" uuid,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestion_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"type" "ingestion_credential_type" DEFAULT 'server_secret' NOT NULL,
	"key_hash" text NOT NULL,
	"key_prefix" text NOT NULL,
	"status" "ingestion_credential_status" DEFAULT 'active' NOT NULL,
	"rotated_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"actor_id" text,
	"actor_type" "audit_actor_type" DEFAULT 'system' NOT NULL,
	"activity_type" "lead_activity_type" NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"sales_rep_id" uuid,
	"assigned_by_id" text,
	"is_current" boolean DEFAULT true NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"unassigned_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "lead_attribution_touchpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"campaign_id" uuid,
	"touch_type" "attribution_touch_type" NOT NULL,
	"channel" text,
	"meta_campaign_id" text,
	"meta_adset_id" text,
	"meta_ad_id" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"utm_content" text,
	"fbclid" text,
	"landing_url" text,
	"referrer_url" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"author_id" text,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_qualifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"rule_set_id" uuid,
	"rule_set_version" integer NOT NULL,
	"score" numeric,
	"qualified" boolean DEFAULT false NOT NULL,
	"override_by_id" text,
	"override_reason" text,
	"evaluated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"pixel_id" text,
	"dataset_id" text,
	"access_token_enc" text,
	"key_version" integer DEFAULT 1 NOT NULL,
	"graph_api_version" text DEFAULT 'v19.0' NOT NULL,
	"status" "meta_connection_status" DEFAULT 'pending' NOT NULL,
	"scopes" text[] DEFAULT '{}' NOT NULL,
	"expires_at" timestamp with time zone,
	"last_verified_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"lead_id" uuid,
	"conversion_id" uuid,
	"pixel_id" text NOT NULL,
	"event_name" text NOT NULL,
	"event_id" text NOT NULL,
	"payload_version" integer DEFAULT 1 NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "meta_event_status" DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"locked_until" timestamp with time zone,
	"last_response" text,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta_sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid,
	"status" text DEFAULT 'running' NOT NULL,
	"date_from" date NOT NULL,
	"date_to" date NOT NULL,
	"records_synced" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipeline_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"pipeline_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#6366f1' NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"is_won" boolean DEFAULT false NOT NULL,
	"is_lost" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipelines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qualification_rule_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid,
	"name" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_reps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" text,
	"display_name" text NOT NULL,
	"whatsapp_number" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "org_members" ALTER COLUMN "role" SET DEFAULT 'owner'::"public"."member_role";--> statement-breakpoint
ALTER TABLE "org_members" ALTER COLUMN "role" SET DATA TYPE "public"."member_role" USING "role"::"public"."member_role";--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "industry" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "current_stage_id" uuid;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "fbclid" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "landing_url" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "referrer_url" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "meta_campaign_name" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "meta_adset_name" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "meta_ad_name" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "ip_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "ua_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "external_event_id" text;--> statement-breakpoint
ALTER TABLE "ad_insights_daily" ADD CONSTRAINT "ad_insights_daily_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_insights_daily" ADD CONSTRAINT "ad_insights_daily_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_insights_daily" ADD CONSTRAINT "ad_insights_daily_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversions" ADD CONSTRAINT "conversions_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversions" ADD CONSTRAINT "conversions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversions" ADD CONSTRAINT "conversions_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_credentials" ADD CONSTRAINT "ingestion_credentials_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_credentials" ADD CONSTRAINT "ingestion_credentials_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_assignments" ADD CONSTRAINT "lead_assignments_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_assignments" ADD CONSTRAINT "lead_assignments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_assignments" ADD CONSTRAINT "lead_assignments_sales_rep_id_sales_reps_id_fk" FOREIGN KEY ("sales_rep_id") REFERENCES "public"."sales_reps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_attribution_touchpoints" ADD CONSTRAINT "lead_attribution_touchpoints_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_attribution_touchpoints" ADD CONSTRAINT "lead_attribution_touchpoints_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_attribution_touchpoints" ADD CONSTRAINT "lead_attribution_touchpoints_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_notes" ADD CONSTRAINT "lead_notes_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_notes" ADD CONSTRAINT "lead_notes_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_notes" ADD CONSTRAINT "lead_notes_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_qualifications" ADD CONSTRAINT "lead_qualifications_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_qualifications" ADD CONSTRAINT "lead_qualifications_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_qualifications" ADD CONSTRAINT "lead_qualifications_rule_set_id_qualification_rule_sets_id_fk" FOREIGN KEY ("rule_set_id") REFERENCES "public"."qualification_rule_sets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_connections" ADD CONSTRAINT "meta_connections_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_connections" ADD CONSTRAINT "meta_connections_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_events" ADD CONSTRAINT "meta_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_events" ADD CONSTRAINT "meta_events_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_events" ADD CONSTRAINT "meta_events_conversion_id_conversions_id_fk" FOREIGN KEY ("conversion_id") REFERENCES "public"."conversions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_sync_runs" ADD CONSTRAINT "meta_sync_runs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_sync_runs" ADD CONSTRAINT "meta_sync_runs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_pipeline_id_pipelines_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipelines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipelines" ADD CONSTRAINT "pipelines_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipelines" ADD CONSTRAINT "pipelines_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification_rule_sets" ADD CONSTRAINT "qualification_rule_sets_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification_rule_sets" ADD CONSTRAINT "qualification_rule_sets_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_reps" ADD CONSTRAINT "sales_reps_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_reps" ADD CONSTRAINT "sales_reps_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ad_insights_org_id_idx" ON "ad_insights_daily" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "ad_insights_client_id_idx" ON "ad_insights_daily" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "ad_insights_date_idx" ON "ad_insights_daily" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "ad_insights_ad_date_idx" ON "ad_insights_daily" USING btree ("org_id","meta_ad_id","date") WHERE meta_ad_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "ad_insights_campaign_date_idx" ON "ad_insights_daily" USING btree ("org_id","meta_campaign_id","date") WHERE meta_ad_id IS NULL AND meta_adset_id IS NULL AND meta_campaign_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "audit_logs_org_id_idx" ON "audit_logs" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_logs_resource_idx" ON "audit_logs" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "conversions_lead_id_idx" ON "conversions" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "conversions_org_id_idx" ON "conversions" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "conversions_campaign_id_idx" ON "conversions" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "conversions_converted_at_idx" ON "conversions" USING btree ("converted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "conversions_org_order_idx" ON "conversions" USING btree ("org_id","order_id") WHERE order_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "import_batches_org_id_idx" ON "import_batches" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "import_rows_batch_id_idx" ON "import_rows" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "import_rows_org_id_idx" ON "import_rows" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "ingestion_cred_org_id_idx" ON "ingestion_credentials" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "ingestion_cred_campaign_id_idx" ON "ingestion_credentials" USING btree ("campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ingestion_cred_key_hash_idx" ON "ingestion_credentials" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "ingestion_cred_active_idx" ON "ingestion_credentials" USING btree ("campaign_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "lead_activities_lead_id_idx" ON "lead_activities" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "lead_activities_org_id_idx" ON "lead_activities" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "lead_activities_created_at_idx" ON "lead_activities" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "lead_assignments_lead_id_idx" ON "lead_assignments" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "lead_assignments_org_id_idx" ON "lead_assignments" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "lead_assignments_sales_rep_id_idx" ON "lead_assignments" USING btree ("sales_rep_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_assignments_current_idx" ON "lead_assignments" USING btree ("lead_id") WHERE is_current = true;--> statement-breakpoint
CREATE INDEX "lead_touchpoints_lead_id_idx" ON "lead_attribution_touchpoints" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "lead_touchpoints_org_id_idx" ON "lead_attribution_touchpoints" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "lead_notes_lead_id_idx" ON "lead_notes" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "lead_notes_org_id_idx" ON "lead_notes" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "lead_qualifications_lead_id_idx" ON "lead_qualifications" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "lead_qualifications_org_id_idx" ON "lead_qualifications" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "meta_connections_org_id_idx" ON "meta_connections" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "meta_connections_client_id_idx" ON "meta_connections" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "meta_connections_client_pixel_idx" ON "meta_connections" USING btree ("client_id","pixel_id") WHERE pixel_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "meta_events_org_id_idx" ON "meta_events" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "meta_events_event_id_idx" ON "meta_events" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "meta_events_pending_idx" ON "meta_events" USING btree ("next_attempt_at") WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "meta_sync_runs_org_id_idx" ON "meta_sync_runs" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "pipeline_stages_pipeline_id_idx" ON "pipeline_stages" USING btree ("pipeline_id");--> statement-breakpoint
CREATE INDEX "pipeline_stages_org_id_idx" ON "pipeline_stages" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "pipelines_org_id_idx" ON "pipelines" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "pipelines_client_id_idx" ON "pipelines" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "qual_rule_sets_org_id_idx" ON "qualification_rule_sets" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "sales_reps_org_id_idx" ON "sales_reps" USING btree ("org_id");--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_current_stage_id_pipeline_stages_id_fk" FOREIGN KEY ("current_stage_id") REFERENCES "public"."pipeline_stages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "leads_external_event_id_idx" ON "leads" USING btree ("external_event_id");--> statement-breakpoint
CREATE INDEX "leads_current_stage_id_idx" ON "leads" USING btree ("current_stage_id");--> statement-breakpoint
CREATE INDEX "leads_org_campaign_created_idx" ON "leads" USING btree ("org_id","campaign_id","created_at");--> statement-breakpoint
CREATE INDEX "org_members_org_id_idx" ON "org_members" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "org_members_user_id_idx" ON "org_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "org_members_org_user_idx" ON "org_members" USING btree ("org_id","user_id");--> statement-breakpoint
-- ─── Backfill: meta_connections from clients ─────────────────────────────────
-- Migrates existing pixel_id + access_token from clients to the new meta_connections table.
-- Clients with null pixel_id are skipped (no connection to migrate).
INSERT INTO "meta_connections" (
  "id", "org_id", "client_id", "pixel_id", "dataset_id",
  "access_token_enc", "key_version", "graph_api_version", "status",
  "created_at", "updated_at"
)
SELECT
  gen_random_uuid(),
  "org_id",
  "id",
  "meta_pixel_id",
  "meta_dataset_id",
  "meta_access_token_enc",
  1,
  'v19.0',
  CASE WHEN "meta_access_token_enc" IS NOT NULL THEN 'active'::"public"."meta_connection_status"
       ELSE 'pending'::"public"."meta_connection_status" END,
  "created_at",
  "updated_at"
FROM "clients"
WHERE "meta_pixel_id" IS NOT NULL
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- ─── Backfill: ingestion_credentials from campaigns.api_key ──────────────────
-- Stores SHA-256 hash of existing API keys. The plain-text key stays in
-- campaigns.api_key for backward compat until ingest route is migrated.
INSERT INTO "ingestion_credentials" (
  "id", "org_id", "campaign_id", "type", "key_hash", "key_prefix",
  "status", "created_at", "updated_at"
)
SELECT
  gen_random_uuid(),
  "org_id",
  "id",
  'server_secret'::"public"."ingestion_credential_type",
  encode(sha256("api_key"::bytea), 'hex'),
  substring("api_key" from 1 for 12),
  'active'::"public"."ingestion_credential_status",
  "created_at",
  "updated_at"
FROM "campaigns"
WHERE "api_key" IS NOT NULL
ON CONFLICT DO NOTHING;