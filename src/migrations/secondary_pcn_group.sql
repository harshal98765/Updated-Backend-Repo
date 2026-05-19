-- Adds secondary_pcn and secondary_group columns to inventory_rows so the
-- per-PBM Billed sidebar can render SEC PCN / SEC GROUP / SEC INSURANCE.
ALTER TABLE inventory_rows ADD COLUMN IF NOT EXISTS secondary_pcn TEXT;
ALTER TABLE inventory_rows ADD COLUMN IF NOT EXISTS secondary_group TEXT;
