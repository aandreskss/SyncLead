-- Extend import_batch_status enum
ALTER TYPE import_batch_status ADD VALUE IF NOT EXISTS 'dry_run';
ALTER TYPE import_batch_status ADD VALUE IF NOT EXISTS 'rollback';

-- Extend import_row_status enum
ALTER TYPE import_row_status ADD VALUE IF NOT EXISTS 'skipped';
ALTER TYPE import_row_status ADD VALUE IF NOT EXISTS 'warning';

-- Extend import_batches with new columns for the v2 importer
ALTER TABLE import_batches
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS file_hash text,
  ADD COLUMN IF NOT EXISTS sheet_name text,
  ADD COLUMN IF NOT EXISTS original_filename text,
  ADD COLUMN IF NOT EXISTS column_mapping jsonb,
  ADD COLUMN IF NOT EXISTS skipped_rows integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS warning_rows integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dry_run_at timestamptz;

-- Extend import_rows with idempotency fields
ALTER TABLE import_rows
  ADD COLUMN IF NOT EXISTS dedupe_key text,
  ADD COLUMN IF NOT EXISTS fingerprint text,
  ADD COLUMN IF NOT EXISTS conversion_id uuid REFERENCES conversions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS warning text;

-- Unique index: prevents reimporting the same physical row from the same file
CREATE UNIQUE INDEX IF NOT EXISTS import_rows_dedupe_key_idx
  ON import_rows (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

-- Index: fast fingerprint lookup for cross-file duplicate detection
CREATE INDEX IF NOT EXISTS import_rows_fingerprint_idx
  ON import_rows (org_id, fingerprint)
  WHERE fingerprint IS NOT NULL AND status IN ('imported', 'warning');
