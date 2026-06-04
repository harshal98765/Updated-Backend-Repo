-- Group reports now attach to the teammate's audit_share_groups instead of the
-- old inventory_groups. Drop the FK so inventory_group_reports.group_id can hold
-- an audit_share_groups id. (The audit-groups delete handler cleans up reports.)
ALTER TABLE inventory_group_reports
    DROP CONSTRAINT IF EXISTS inventory_group_reports_group_id_fkey;
