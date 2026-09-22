-- Add visitor geo fields to conversion_observations for live event feed
ALTER TABLE "conversion_observations"
  ADD COLUMN "visitor_city" text,
  ADD COLUMN "visitor_country" text;
