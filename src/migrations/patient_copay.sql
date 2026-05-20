-- Adds patient_copay to inventory_rows to capture the patient copay amount
-- from the PrimeRx inventory export (PATIENTCOPAY column).
ALTER TABLE inventory_rows ADD COLUMN IF NOT EXISTS patient_copay NUMERIC;
