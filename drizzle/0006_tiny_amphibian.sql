CREATE TABLE "ad_research_collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ad_research_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"collection_id" uuid,
	"platform" text NOT NULL,
	"external_id" text,
	"advertiser_name" text NOT NULL,
	"advertiser_page_id" text,
	"ad_title" text,
	"ad_body" text,
	"media_type" text DEFAULT 'unknown' NOT NULL,
	"media_urls" text[] DEFAULT '{}' NOT NULL,
	"thumbnail_url" text,
	"cta_text" text,
	"landing_page_url" text,
	"search_country" text,
	"impressions_lower_bound" bigint,
	"impressions_upper_bound" bigint,
	"likes_count" bigint,
	"comments_count" bigint,
	"shares_count" bigint,
	"ad_delivery_start_time" timestamp with time zone,
	"ad_delivery_stop_time" timestamp with time zone,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"notes" text,
	"raw_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"saved_by" text,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_agent_deployments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"phone_number_id" uuid NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"paused_at" timestamp with time zone,
	"paused_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_agent_version_knowledge" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"agent_version_id" uuid NOT NULL,
	"knowledge_source_id" uuid NOT NULL,
	"knowledge_revision_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_agent_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"published_by" text,
	"archived_at" timestamp with time zone,
	"archived_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"system_prompt" text DEFAULT '' NOT NULL,
	"model" text DEFAULT 'claude-sonnet-4-6' NOT NULL,
	"ai_temperature" numeric(3, 2) DEFAULT '0.70' NOT NULL,
	"max_tokens" integer DEFAULT 1024 NOT NULL,
	"tools_enabled" text[] DEFAULT '{}' NOT NULL,
	"handoff_triggers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"greeting_message" text,
	"active" boolean DEFAULT true NOT NULL,
	"agent_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_budget_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"daily_limit_millicents" bigint,
	"monthly_limit_millicents" bigint,
	"per_conversation_limit_millicents" bigint,
	"alert_threshold_pct" integer DEFAULT 80 NOT NULL,
	"pause_on_exhaust" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_budget_limits_org_id_unique" UNIQUE("org_id")
);
--> statement-breakpoint
CREATE TABLE "ai_budget_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"queue_item_id" uuid NOT NULL,
	"episode_id" uuid,
	"reserved_millicents" bigint NOT NULL,
	"status" text DEFAULT 'reserved' NOT NULL,
	"released_reason" text,
	"reserved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone,
	"usage_record_id" uuid,
	CONSTRAINT "ai_budget_reservations_queue_item_id_unique" UNIQUE("queue_item_id")
);
--> statement-breakpoint
CREATE TABLE "ai_campaign_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"deployment_id" uuid NOT NULL,
	"campaign_id" uuid,
	"priority" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_deployment_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"deployment_id" uuid NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"windows" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_deployment_schedules_deployment_id_unique" UNIQUE("deployment_id")
);
--> statement-breakpoint
CREATE TABLE "ai_document_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"claim_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	"claimed_by" text,
	"error_last" text,
	"dead_lettered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_episodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"agent_version_id" uuid NOT NULL,
	"campaign_id" uuid,
	"knowledge_snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"trigger_message_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"exit_reason" text,
	"exit_detail" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"token_count_in" integer DEFAULT 0 NOT NULL,
	"token_count_out" integer DEFAULT 0 NOT NULL,
	"model_used" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_knowledge_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"content_length" integer DEFAULT 0 NOT NULL,
	"location_ref" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"search_vector" "tsvector",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_knowledge_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"content_hash" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_knowledge_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"source_type" text DEFAULT 'text' NOT NULL,
	"content" text,
	"url" text,
	"file_key" text,
	"status" text DEFAULT 'active' NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by" text,
	"created_by" text,
	"processing_status" text DEFAULT 'available' NOT NULL,
	"processing_error" text,
	"content_fingerprint" text,
	"page_count" integer,
	"row_count" integer,
	"file_size_bytes" bigint,
	"mime_type" text,
	"original_filename" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_media_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"wa_media_id" text NOT NULL,
	"mime_type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"claim_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	"claimed_by" text,
	"error_last" text,
	"dead_lettered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_media_queue_message_id_unique" UNIQUE("message_id")
);
--> statement-breakpoint
CREATE TABLE "ai_message_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"incoming_message_id" uuid NOT NULL,
	"status" text DEFAULT 'enqueued' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"claim_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	"claimed_by" text,
	"lease_token" uuid,
	"error_last" text,
	"dead_lettered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_pricing_tiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"display_name" text NOT NULL,
	"input_millicents_per_token" bigint NOT NULL,
	"output_millicents_per_token" bigint NOT NULL,
	"cache_read_millicents_per_token" bigint,
	"cache_write_millicents_per_token" bigint,
	"source" text DEFAULT 'anthropic_published' NOT NULL,
	"note" text,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_provider_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"key_enc" text NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_tool_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"episode_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"tool_name" text NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output" jsonb,
	"status" text DEFAULT 'success' NOT NULL,
	"duration_ms" integer,
	"error_detail" text,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"episode_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"latency_ms" integer,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cache_write_tokens" integer DEFAULT 0 NOT NULL,
	"input_cost_millicents" bigint,
	"output_cost_millicents" bigint,
	"cache_read_cost_millicents" bigint,
	"cache_write_cost_millicents" bigint,
	"total_cost_millicents" bigint,
	"pricing_tier_id" uuid,
	"is_sandbox" boolean DEFAULT false NOT NULL,
	"call_type" text DEFAULT 'inference' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingest_errors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"campaign_id" uuid,
	"client_id" uuid,
	"error_type" text NOT NULL,
	"error_detail" text,
	"source" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta_custom_audiences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"meta_connection_id" uuid NOT NULL,
	"audience_type" text NOT NULL,
	"meta_audience_id" text,
	"name" text NOT NULL,
	"member_count" integer DEFAULT 0 NOT NULL,
	"sync_enabled" boolean DEFAULT true NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta_lead_ad_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"page_id" text NOT NULL,
	"form_id" text,
	"page_access_token_enc" text,
	"key_version" integer DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_config" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb DEFAULT 'null'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wa_agent_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wa_business_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"waba_id" text NOT NULL,
	"display_name" text NOT NULL,
	"access_token_enc" text,
	"key_version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"webhook_verify_token" text,
	"connection_mode" text DEFAULT 'manual' NOT NULL,
	"connection_status" text DEFAULT 'active' NOT NULL,
	"oauth_scopes" text[] DEFAULT '{}' NOT NULL,
	"token_expires_at" timestamp with time zone,
	"connected_at" timestamp with time zone,
	"last_error" text,
	"last_error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wa_conversation_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"direction" text DEFAULT 'inbound' NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"content_type" text DEFAULT 'text' NOT NULL,
	"media_url" text,
	"external_message_id" text,
	"status" text DEFAULT 'sent' NOT NULL,
	"token_count" integer,
	"is_ai" boolean DEFAULT false NOT NULL,
	"media_processing_status" text,
	"media_storage_key" text,
	"media_size_bytes" bigint,
	"transcription_text" text,
	"image_description" text,
	"media_tokens_used" integer,
	"media_processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wa_conversation_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wa_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"phone_number_id" uuid NOT NULL,
	"customer_phone" text NOT NULL,
	"customer_name" text,
	"lead_id" uuid,
	"deployment_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"control_mode" text DEFAULT 'ai' NOT NULL,
	"closed_at" timestamp with time zone,
	"assigned_to" text,
	"summary" text,
	"message_count" integer DEFAULT 0 NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wa_oauth_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"return_path" text DEFAULT '/dashboard/settings/channels' NOT NULL,
	"waba_id_hint" text,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wa_phone_numbers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"waba_account_id" uuid NOT NULL,
	"phone_number_id" text NOT NULL,
	"display_phone_number" text NOT NULL,
	"verified_name" text,
	"quality_rating" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "ingestion_cred_active_idx";--> statement-breakpoint
ALTER TABLE "ingestion_credentials" ALTER COLUMN "campaign_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "utm_campaign_key" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "channel_type" text DEFAULT 'web_form' NOT NULL;--> statement-breakpoint
ALTER TABLE "conversion_observations" ADD COLUMN "visitor_id" text;--> statement-breakpoint
ALTER TABLE "conversion_observations" ADD COLUMN "visitor_city" text;--> statement-breakpoint
ALTER TABLE "conversion_observations" ADD COLUMN "visitor_country" text;--> statement-breakpoint
ALTER TABLE "conversion_observations" ADD COLUMN "utm_source" text;--> statement-breakpoint
ALTER TABLE "conversion_observations" ADD COLUMN "utm_medium" text;--> statement-breakpoint
ALTER TABLE "conversion_observations" ADD COLUMN "utm_campaign" text;--> statement-breakpoint
ALTER TABLE "conversion_observations" ADD COLUMN "referrer" text;--> statement-breakpoint
ALTER TABLE "ingestion_credentials" ADD COLUMN "client_id" uuid;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "lead_source" text DEFAULT 'organic' NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "visitor_id" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "browser" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "ig_scoped_id" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "ctwa_clid" text;--> statement-breakpoint
ALTER TABLE "meta_connections" ADD COLUMN "send_lead_events" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "meta_connections" ADD COLUMN "send_contact_events" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "meta_connections" ADD COLUMN "send_behavior_capi" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "monthly_report_email" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "suspended" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "features" jsonb;--> statement-breakpoint
ALTER TABLE "tracking_sites" ADD COLUMN "collect_token" text;--> statement-breakpoint
ALTER TABLE "ai_agent_deployments" ADD CONSTRAINT "ai_agent_deployments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_agent_deployments" ADD CONSTRAINT "ai_agent_deployments_agent_id_ai_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."ai_agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_agent_deployments" ADD CONSTRAINT "ai_agent_deployments_phone_number_id_wa_phone_numbers_id_fk" FOREIGN KEY ("phone_number_id") REFERENCES "public"."wa_phone_numbers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_agent_deployments" ADD CONSTRAINT "ai_agent_deployments_paused_by_user_id_fk" FOREIGN KEY ("paused_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_agent_version_knowledge" ADD CONSTRAINT "ai_agent_version_knowledge_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_agent_version_knowledge" ADD CONSTRAINT "ai_agent_version_knowledge_agent_version_id_ai_agent_versions_id_fk" FOREIGN KEY ("agent_version_id") REFERENCES "public"."ai_agent_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_agent_version_knowledge" ADD CONSTRAINT "ai_agent_version_knowledge_knowledge_source_id_ai_knowledge_sources_id_fk" FOREIGN KEY ("knowledge_source_id") REFERENCES "public"."ai_knowledge_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_agent_version_knowledge" ADD CONSTRAINT "ai_agent_version_knowledge_knowledge_revision_id_ai_knowledge_revisions_id_fk" FOREIGN KEY ("knowledge_revision_id") REFERENCES "public"."ai_knowledge_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_agent_versions" ADD CONSTRAINT "ai_agent_versions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_agent_versions" ADD CONSTRAINT "ai_agent_versions_agent_id_ai_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."ai_agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_agent_versions" ADD CONSTRAINT "ai_agent_versions_published_by_user_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_agent_versions" ADD CONSTRAINT "ai_agent_versions_archived_by_user_id_fk" FOREIGN KEY ("archived_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_agents" ADD CONSTRAINT "ai_agents_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_agents" ADD CONSTRAINT "ai_agents_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_budget_limits" ADD CONSTRAINT "ai_budget_limits_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_budget_reservations" ADD CONSTRAINT "ai_budget_reservations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_budget_reservations" ADD CONSTRAINT "ai_budget_reservations_queue_item_id_ai_message_queue_id_fk" FOREIGN KEY ("queue_item_id") REFERENCES "public"."ai_message_queue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_budget_reservations" ADD CONSTRAINT "ai_budget_reservations_episode_id_ai_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."ai_episodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_budget_reservations" ADD CONSTRAINT "ai_budget_reservations_usage_record_id_ai_usage_records_id_fk" FOREIGN KEY ("usage_record_id") REFERENCES "public"."ai_usage_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_campaign_rules" ADD CONSTRAINT "ai_campaign_rules_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_campaign_rules" ADD CONSTRAINT "ai_campaign_rules_deployment_id_ai_agent_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."ai_agent_deployments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_campaign_rules" ADD CONSTRAINT "ai_campaign_rules_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_deployment_schedules" ADD CONSTRAINT "ai_deployment_schedules_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_deployment_schedules" ADD CONSTRAINT "ai_deployment_schedules_deployment_id_ai_agent_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."ai_agent_deployments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_document_queue" ADD CONSTRAINT "ai_document_queue_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_document_queue" ADD CONSTRAINT "ai_document_queue_source_id_ai_knowledge_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."ai_knowledge_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_episodes" ADD CONSTRAINT "ai_episodes_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_episodes" ADD CONSTRAINT "ai_episodes_conversation_id_wa_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."wa_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_episodes" ADD CONSTRAINT "ai_episodes_agent_version_id_ai_agent_versions_id_fk" FOREIGN KEY ("agent_version_id") REFERENCES "public"."ai_agent_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_episodes" ADD CONSTRAINT "ai_episodes_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_episodes" ADD CONSTRAINT "ai_episodes_trigger_message_id_wa_conversation_messages_id_fk" FOREIGN KEY ("trigger_message_id") REFERENCES "public"."wa_conversation_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_knowledge_chunks" ADD CONSTRAINT "ai_knowledge_chunks_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_knowledge_chunks" ADD CONSTRAINT "ai_knowledge_chunks_source_id_ai_knowledge_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."ai_knowledge_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_knowledge_chunks" ADD CONSTRAINT "ai_knowledge_chunks_revision_id_ai_knowledge_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."ai_knowledge_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_knowledge_revisions" ADD CONSTRAINT "ai_knowledge_revisions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_knowledge_revisions" ADD CONSTRAINT "ai_knowledge_revisions_source_id_ai_knowledge_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."ai_knowledge_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_knowledge_sources" ADD CONSTRAINT "ai_knowledge_sources_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_knowledge_sources" ADD CONSTRAINT "ai_knowledge_sources_revoked_by_user_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_knowledge_sources" ADD CONSTRAINT "ai_knowledge_sources_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_media_queue" ADD CONSTRAINT "ai_media_queue_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_media_queue" ADD CONSTRAINT "ai_media_queue_conversation_id_wa_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."wa_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_media_queue" ADD CONSTRAINT "ai_media_queue_message_id_wa_conversation_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."wa_conversation_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_message_queue" ADD CONSTRAINT "ai_message_queue_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_message_queue" ADD CONSTRAINT "ai_message_queue_conversation_id_wa_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."wa_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_message_queue" ADD CONSTRAINT "ai_message_queue_incoming_message_id_wa_conversation_messages_id_fk" FOREIGN KEY ("incoming_message_id") REFERENCES "public"."wa_conversation_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_provider_keys" ADD CONSTRAINT "ai_provider_keys_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_tool_executions" ADD CONSTRAINT "ai_tool_executions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_tool_executions" ADD CONSTRAINT "ai_tool_executions_episode_id_ai_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."ai_episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_tool_executions" ADD CONSTRAINT "ai_tool_executions_conversation_id_wa_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."wa_conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_records" ADD CONSTRAINT "ai_usage_records_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_records" ADD CONSTRAINT "ai_usage_records_episode_id_ai_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."ai_episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_records" ADD CONSTRAINT "ai_usage_records_conversation_id_wa_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."wa_conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_records" ADD CONSTRAINT "ai_usage_records_pricing_tier_id_ai_pricing_tiers_id_fk" FOREIGN KEY ("pricing_tier_id") REFERENCES "public"."ai_pricing_tiers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingest_errors" ADD CONSTRAINT "ingest_errors_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingest_errors" ADD CONSTRAINT "ingest_errors_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingest_errors" ADD CONSTRAINT "ingest_errors_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_custom_audiences" ADD CONSTRAINT "meta_custom_audiences_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_custom_audiences" ADD CONSTRAINT "meta_custom_audiences_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_custom_audiences" ADD CONSTRAINT "meta_custom_audiences_meta_connection_id_meta_connections_id_fk" FOREIGN KEY ("meta_connection_id") REFERENCES "public"."meta_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_lead_ad_sources" ADD CONSTRAINT "meta_lead_ad_sources_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_lead_ad_sources" ADD CONSTRAINT "meta_lead_ad_sources_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_agent_events" ADD CONSTRAINT "wa_agent_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_agent_events" ADD CONSTRAINT "wa_agent_events_conversation_id_wa_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."wa_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_business_accounts" ADD CONSTRAINT "wa_business_accounts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_conversation_messages" ADD CONSTRAINT "wa_conversation_messages_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_conversation_messages" ADD CONSTRAINT "wa_conversation_messages_conversation_id_wa_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."wa_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_conversation_notes" ADD CONSTRAINT "wa_conversation_notes_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_conversation_notes" ADD CONSTRAINT "wa_conversation_notes_conversation_id_wa_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."wa_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_conversation_notes" ADD CONSTRAINT "wa_conversation_notes_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_conversations" ADD CONSTRAINT "wa_conversations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_conversations" ADD CONSTRAINT "wa_conversations_phone_number_id_wa_phone_numbers_id_fk" FOREIGN KEY ("phone_number_id") REFERENCES "public"."wa_phone_numbers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_conversations" ADD CONSTRAINT "wa_conversations_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_conversations" ADD CONSTRAINT "wa_conversations_deployment_id_ai_agent_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."ai_agent_deployments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_conversations" ADD CONSTRAINT "wa_conversations_assigned_to_user_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_oauth_states" ADD CONSTRAINT "wa_oauth_states_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_phone_numbers" ADD CONSTRAINT "wa_phone_numbers_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_phone_numbers" ADD CONSTRAINT "wa_phone_numbers_waba_account_id_wa_business_accounts_id_fk" FOREIGN KEY ("waba_account_id") REFERENCES "public"."wa_business_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ad_research_items_org_idx" ON "ad_research_items" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "ad_research_items_platform_idx" ON "ad_research_items" USING btree ("org_id","platform");--> statement-breakpoint
CREATE INDEX "ai_agent_deployments_org_id_idx" ON "ai_agent_deployments" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "ai_agent_deployments_agent_id_idx" ON "ai_agent_deployments" USING btree ("agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_agent_deployments_phone_org_idx" ON "ai_agent_deployments" USING btree ("phone_number_id","org_id");--> statement-breakpoint
CREATE INDEX "ai_agent_version_knowledge_version_idx" ON "ai_agent_version_knowledge" USING btree ("agent_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_agent_version_knowledge_version_source_idx" ON "ai_agent_version_knowledge" USING btree ("agent_version_id","knowledge_source_id");--> statement-breakpoint
CREATE INDEX "ai_agent_versions_agent_id_idx" ON "ai_agent_versions" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "ai_agent_versions_org_id_idx" ON "ai_agent_versions" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_agent_versions_agent_version_idx" ON "ai_agent_versions" USING btree ("agent_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_agent_versions_agent_published_idx" ON "ai_agent_versions" USING btree ("agent_id") WHERE status = 'published';--> statement-breakpoint
CREATE INDEX "ai_agents_org_id_idx" ON "ai_agents" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "ai_agents_org_status_idx" ON "ai_agents" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "ai_budget_reservations_org_status_idx" ON "ai_budget_reservations" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "ai_campaign_rules_deployment_id_idx" ON "ai_campaign_rules" USING btree ("deployment_id");--> statement-breakpoint
CREATE INDEX "ai_campaign_rules_campaign_id_idx" ON "ai_campaign_rules" USING btree ("campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_campaign_rules_dep_campaign_idx" ON "ai_campaign_rules" USING btree ("deployment_id","campaign_id") WHERE campaign_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_campaign_rules_dep_catchall_idx" ON "ai_campaign_rules" USING btree ("deployment_id") WHERE campaign_id IS NULL;--> statement-breakpoint
CREATE INDEX "ai_deployment_schedules_org_id_idx" ON "ai_deployment_schedules" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "ai_document_queue_status_idx" ON "ai_document_queue" USING btree ("status","claim_at");--> statement-breakpoint
CREATE INDEX "ai_episodes_org_id_idx" ON "ai_episodes" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "ai_episodes_conversation_id_idx" ON "ai_episodes" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "ai_episodes_agent_version_id_idx" ON "ai_episodes" USING btree ("agent_version_id");--> statement-breakpoint
CREATE INDEX "ai_episodes_status_idx" ON "ai_episodes" USING btree ("org_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_knowledge_chunks_dedup_idx" ON "ai_knowledge_chunks" USING btree ("source_id","revision_id","chunk_index");--> statement-breakpoint
CREATE INDEX "ai_knowledge_chunks_source_idx" ON "ai_knowledge_chunks" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "ai_knowledge_chunks_org_idx" ON "ai_knowledge_chunks" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "ai_knowledge_revisions_source_id_idx" ON "ai_knowledge_revisions" USING btree ("source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_knowledge_revisions_source_revision_idx" ON "ai_knowledge_revisions" USING btree ("source_id","revision_number");--> statement-breakpoint
CREATE INDEX "ai_knowledge_sources_org_id_idx" ON "ai_knowledge_sources" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "ai_knowledge_sources_status_idx" ON "ai_knowledge_sources" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "ai_media_queue_status_idx" ON "ai_media_queue" USING btree ("status","claim_at");--> statement-breakpoint
CREATE INDEX "ai_media_queue_conversation_idx" ON "ai_media_queue" USING btree ("conversation_id","status");--> statement-breakpoint
CREATE INDEX "ai_message_queue_org_id_idx" ON "ai_message_queue" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "ai_message_queue_status_claim_idx" ON "ai_message_queue" USING btree ("status","claim_at");--> statement-breakpoint
CREATE INDEX "ai_message_queue_conversation_id_idx" ON "ai_message_queue" USING btree ("conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_message_queue_message_id_idx" ON "ai_message_queue" USING btree ("incoming_message_id");--> statement-breakpoint
CREATE INDEX "ai_pricing_tiers_provider_model_idx" ON "ai_pricing_tiers" USING btree ("provider","model","effective_from");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_provider_keys_org_provider_idx" ON "ai_provider_keys" USING btree ("org_id","provider");--> statement-breakpoint
CREATE INDEX "ai_tool_executions_episode_id_idx" ON "ai_tool_executions" USING btree ("episode_id");--> statement-breakpoint
CREATE INDEX "ai_tool_executions_org_id_idx" ON "ai_tool_executions" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "ai_tool_executions_conversation_id_idx" ON "ai_tool_executions" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "ai_usage_records_episode_id_idx" ON "ai_usage_records" USING btree ("episode_id");--> statement-breakpoint
CREATE INDEX "ai_usage_records_org_id_idx" ON "ai_usage_records" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "ai_usage_records_created_at_idx" ON "ai_usage_records" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_usage_records_analytics_idx" ON "ai_usage_records" USING btree ("org_id","created_at","is_sandbox");--> statement-breakpoint
CREATE INDEX "ingest_errors_org_occurred_idx" ON "ingest_errors" USING btree ("org_id","occurred_at");--> statement-breakpoint
CREATE INDEX "ingest_errors_client_idx" ON "ingest_errors" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "meta_audiences_conn_type_idx" ON "meta_custom_audiences" USING btree ("meta_connection_id","audience_type");--> statement-breakpoint
CREATE INDEX "meta_audiences_org_idx" ON "meta_custom_audiences" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "meta_audiences_client_idx" ON "meta_custom_audiences" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "meta_lead_ad_sources_org_idx" ON "meta_lead_ad_sources" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "meta_lead_ad_sources_campaign_idx" ON "meta_lead_ad_sources" USING btree ("campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "meta_lead_ad_sources_page_form_idx" ON "meta_lead_ad_sources" USING btree ("page_id","form_id");--> statement-breakpoint
CREATE INDEX "wa_agent_events_org_id_idx" ON "wa_agent_events" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "wa_agent_events_conversation_id_idx" ON "wa_agent_events" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "wa_agent_events_created_at_idx" ON "wa_agent_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "wa_business_accounts_org_id_idx" ON "wa_business_accounts" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wa_business_accounts_org_waba_idx" ON "wa_business_accounts" USING btree ("org_id","waba_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wa_business_accounts_waba_id_global_idx" ON "wa_business_accounts" USING btree ("waba_id");--> statement-breakpoint
CREATE INDEX "wa_conv_messages_conversation_id_idx" ON "wa_conversation_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "wa_conv_messages_org_id_idx" ON "wa_conversation_messages" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "wa_conv_messages_created_at_idx" ON "wa_conversation_messages" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "wa_conv_messages_external_id_idx" ON "wa_conversation_messages" USING btree ("external_message_id") WHERE external_message_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "wa_conversation_notes_conversation_id_idx" ON "wa_conversation_notes" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "wa_conversation_notes_org_id_idx" ON "wa_conversation_notes" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "wa_conversations_org_id_idx" ON "wa_conversations" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "wa_conversations_phone_number_id_idx" ON "wa_conversations" USING btree ("phone_number_id");--> statement-breakpoint
CREATE INDEX "wa_conversations_lead_id_idx" ON "wa_conversations" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "wa_conversations_last_msg_idx" ON "wa_conversations" USING btree ("last_message_at");--> statement-breakpoint
CREATE INDEX "wa_conversations_control_mode_idx" ON "wa_conversations" USING btree ("org_id","control_mode");--> statement-breakpoint
CREATE UNIQUE INDEX "wa_conversations_org_phone_customer_idx" ON "wa_conversations" USING btree ("org_id","phone_number_id","customer_phone");--> statement-breakpoint
CREATE INDEX "wa_oauth_states_org_id_idx" ON "wa_oauth_states" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "wa_oauth_states_expires_idx" ON "wa_oauth_states" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "wa_phone_numbers_org_id_idx" ON "wa_phone_numbers" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "wa_phone_numbers_waba_id_idx" ON "wa_phone_numbers" USING btree ("waba_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wa_phone_numbers_org_phone_id_idx" ON "wa_phone_numbers" USING btree ("org_id","phone_number_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wa_phone_numbers_phone_number_id_global_idx" ON "wa_phone_numbers" USING btree ("phone_number_id");--> statement-breakpoint
ALTER TABLE "ingestion_credentials" ADD CONSTRAINT "ingestion_credentials_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaigns_utm_campaign_key_idx" ON "campaigns" USING btree ("client_id","utm_campaign_key");--> statement-breakpoint
CREATE INDEX "campaigns_channel_type_idx" ON "campaigns" USING btree ("channel_type");--> statement-breakpoint
CREATE INDEX "conversion_observations_visitor_id_idx" ON "conversion_observations" USING btree ("visitor_id");--> statement-breakpoint
CREATE INDEX "ingestion_cred_client_id_idx" ON "ingestion_credentials" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "leads_lead_source_idx" ON "leads" USING btree ("lead_source");--> statement-breakpoint
ALTER TABLE "tracking_sites" ADD CONSTRAINT "tracking_sites_collect_token_unique" UNIQUE("collect_token");