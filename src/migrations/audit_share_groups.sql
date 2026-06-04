-- ============================================================================
-- Teammate's audit-share-groups system (create / invite / accept / members).
-- Referenced by src/routes/auditShareGroups.routes.js and joined to
-- inventory_group_reports for per-group report counts.
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_share_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_share_group_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES audit_share_groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member',
    joined_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS audit_share_group_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES audit_share_groups(id) ON DELETE CASCADE,
    invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
    invited_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW(),
    accepted_at TIMESTAMP,
    UNIQUE (group_id, email)  -- needed for the invite ON CONFLICT upsert
);

CREATE INDEX IF NOT EXISTS idx_asg_users_group ON audit_share_group_users(group_id);
CREATE INDEX IF NOT EXISTS idx_asg_users_user ON audit_share_group_users(user_id);
CREATE INDEX IF NOT EXISTS idx_asg_invites_invited_user
    ON audit_share_group_invites(invited_user_id);
