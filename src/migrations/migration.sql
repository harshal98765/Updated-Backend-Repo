-- ============================================================================
-- Inventory View Network — Schema Migration
-- Run this once on your existing Postgres database.
-- ============================================================================

-- ── Inventory listings (drugs being shared on the network) ──────────────────
CREATE TABLE IF NOT EXISTS inventory_listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    pharmacy_id UUID REFERENCES pharmacy_details(id) ON DELETE CASCADE,

    ndc TEXT NOT NULL,
    drug_name TEXT NOT NULL,
    strength TEXT,
    dosage_form TEXT,
    manufacturer TEXT,
    package_size TEXT,

    quantity INTEGER NOT NULL CHECK (quantity > 0),
    lot_number TEXT,
    expiry DATE,
    acquisition_cost NUMERIC(10, 2),

    reason_code TEXT NOT NULL CHECK (reason_code IN ('shortage_relief','near_expiry','overstock')),

    is_active BOOLEAN DEFAULT true,
    auto_expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '30 days',

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_listings_active
    ON inventory_listings(is_active, auto_expires_at);
CREATE INDEX IF NOT EXISTS idx_inventory_listings_ndc
    ON inventory_listings(ndc);
CREATE INDEX IF NOT EXISTS idx_inventory_listings_user
    ON inventory_listings(user_id);

-- ── Network agreement acceptances (legal audit trail) ───────────────────────
CREATE TABLE IF NOT EXISTS inventory_agreement_acceptances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pharmacy_id UUID REFERENCES pharmacy_details(id) ON DELETE SET NULL,
    agreement_version TEXT NOT NULL,
    accepted_at TIMESTAMP DEFAULT NOW(),
    ip_address TEXT,
    user_agent TEXT,
    UNIQUE(user_id, agreement_version)
);

-- ── Connect requests (immutable audit log of all transfer inquiries) ────────
CREATE TABLE IF NOT EXISTS inventory_connect_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    listing_id UUID REFERENCES inventory_listings(id) ON DELETE SET NULL,

    -- Buyer
    buyer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    buyer_pharmacy_id UUID REFERENCES pharmacy_details(id) ON DELETE SET NULL,

    -- Seller
    seller_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    seller_pharmacy_id UUID REFERENCES pharmacy_details(id) ON DELETE SET NULL,
    seller_email TEXT,

    -- Request details
    patient_rx TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    notes TEXT,

    -- Email contents (stored for audit)
    email_subject TEXT,
    email_body TEXT,
    email_sent_at TIMESTAMP,
    email_message_id TEXT,

    status TEXT DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','accepted','declined','completed','expired')),

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_connect_requests_buyer
    ON inventory_connect_requests(buyer_user_id);
CREATE INDEX IF NOT EXISTS idx_connect_requests_seller
    ON inventory_connect_requests(seller_user_id);
CREATE INDEX IF NOT EXISTS idx_connect_requests_listing
    ON inventory_connect_requests(listing_id);

-- ── Bookmarks (saved-for-later) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_bookmarks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    listing_id UUID NOT NULL REFERENCES inventory_listings(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, listing_id)
);