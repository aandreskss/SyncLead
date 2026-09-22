ALTER TABLE "conversion_observations"
  ADD COLUMN "visitor_id" text,
  ADD COLUMN "utm_source" text,
  ADD COLUMN "utm_medium" text,
  ADD COLUMN "utm_campaign" text,
  ADD COLUMN "referrer" text;

CREATE INDEX "conversion_observations_visitor_id_idx"
  ON "conversion_observations" ("visitor_id");
