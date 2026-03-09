-- MAIN AUDIT
CREATE TABLE audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    inventory_start_date DATE,
    inventory_end_date DATE,
    wholesaler_start_date DATE,
    wholesaler_end_date DATE,
    status TEXT DEFAULT 'draft',
    created_at TIMESTAMP DEFAULT NOW()
);

-- INVENTORY FILE (PrimerX upload)
CREATE TABLE audit_inventory_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_id UUID REFERENCES audits(id) ON DELETE CASCADE,
    file_name TEXT,
    uploaded_at TIMESTAMP DEFAULT NOW()
);


CREATE TABLE IF NOT EXISTS inventory_rows (
    id BIGSERIAL PRIMARY KEY,
    audit_id UUID REFERENCES audits(id) ON DELETE CASCADE,

    ndc TEXT,
    rx_number TEXT,
    status TEXT,
    date_filled DATE,
    drug_name TEXT,
    quantity INTEGER,
    package_size TEXT,

    primary_bin TEXT,
    primary_paid NUMERIC,
    secondary_bin TEXT,
    secondary_paid NUMERIC,

    brand TEXT
);


CREATE TABLE audit_wholesaler_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_id UUID REFERENCES audits(id) ON DELETE CASCADE,
    wholesaler_files JSONB NOT NULL DEFAULT '[]',
    uploaded_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wholesaler_rows (
    id BIGSERIAL PRIMARY KEY,
    audit_id UUID REFERENCES audits(id) ON DELETE CASCADE,

    ndc TEXT,
    invoice_date DATE,
    product_name TEXT,
    quantity INTEGER,
    unit_price INTEGER,
    total_price INTEGER,

);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT,
  role TEXT DEFAULT 'user',
  is_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE auth_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_user_id TEXT
);

CREATE TABLE email_otps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT,
  otp TEXT,
  expires_at TIMESTAMP
);

CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  token TEXT,
  expires_at TIMESTAMP
);

CREATE TABLE password_resets (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  token TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL
);
