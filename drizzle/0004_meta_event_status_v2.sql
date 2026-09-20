-- Adds processing, retrying, and cancelled states to meta_event_status enum.
-- Required by the reliable outbox worker (Prompt 15).
-- Safe: ADD VALUE IF NOT EXISTS is non-destructive and does not rewrite rows.

ALTER TYPE "meta_event_status" ADD VALUE IF NOT EXISTS 'processing';--> statement-breakpoint
ALTER TYPE "meta_event_status" ADD VALUE IF NOT EXISTS 'retrying';--> statement-breakpoint
ALTER TYPE "meta_event_status" ADD VALUE IF NOT EXISTS 'cancelled';
