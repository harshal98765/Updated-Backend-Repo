import { pool } from "../config/db.js";
import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { normalizeInventoryCSV } from "../utils/inventoryNormalizer.js";

export const createAudit = async (name, userId) => {
  const result = await pool.query(
    `INSERT INTO audits (name, user_id, status)
     VALUES ($1, $2, 'started')
     RETURNING *`,
    [name, userId],
  );

  return result.rows[0];
};

const FRONT_TO_DB_KEY = {
  ndcNumber: "ndc",
  rxNumber: "rx_number",
  status: "status",
  dateFilled: "date_filled",
  drugName: "drug_name",
  quantity: "quantity",
  packageSize: "package_size",
  primaryInsuranceBinNumber: "primary_bin",
  primaryInsurancePaid: "primary_paid",
  secondaryInsuranceBinNumber: "secondary_bin",
  secondaryInsurancePaid: "secondary_paid",
  brand: "brand",
};

// ── Auto-refresh audit status based on uploaded files ──────────────────────
export const refreshAuditStatus = async (auditId) => {
  const invCheck = await pool.query(
    `SELECT COUNT(*) FROM audit_inventory_files WHERE audit_id = $1`,
    [auditId]
  );
  const wsCheck = await pool.query(
    `SELECT COUNT(*) FROM wholesaler_files WHERE audit_id = $1`,
    [auditId]
  );

  const hasInventory = parseInt(invCheck.rows[0].count) > 0;
  const hasWholesaler = parseInt(wsCheck.rows[0].count) > 0;

  const newStatus = hasInventory && hasWholesaler ? 'ready' : 'started';

  await pool.query(
    `UPDATE audits SET status = $1 WHERE id = $2`,
    [newStatus, auditId]
  );
};

function toDbHeaderMapping(frontMapping = {}) {
  const out = {};
  for (const [frontKey, selectedStandardHeader] of Object.entries(
    frontMapping,
  )) {
    const dbKey = FRONT_TO_DB_KEY[frontKey];
    if (!dbKey) continue;
    out[dbKey] = selectedStandardHeader;
  }
  return out;
}

const cleanNumber = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim();
  const n = Number(s.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

const cleanInt = (v) => {
  const n = cleanNumber(v);
  return n === null ? null : Math.trunc(n);
};

const cleanDate = (v) => {
  if (!v) return null;
  const s = String(v).trim();

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // MM/DD/YYYY
  const m4 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m4) {
    return `${m4[3]}-${String(m4[1]).padStart(2, "0")}-${String(m4[2]).padStart(2, "0")}`;
  }

  // M/D/YY (2-digit year)
  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (m2) {
    const yr = parseInt(m2[3]) >= 50 ? `19${m2[3]}` : `20${m2[3]}`;
    return `${yr}-${String(m2[1]).padStart(2, "0")}-${String(m2[2]).padStart(2, "0")}`;
  }

  // MM-DD-YYYY
  const m3 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m3) {
    return `${m3[3]}-${String(m3[1]).padStart(2, "0")}-${String(m3[2]).padStart(2, "0")}`;
  }

  // No fallback — reject anything that doesn't match a known date format
  return null;
};

export const updateAuditDates = async (auditId, dates) => {
  const {
    inventory_start_date,
    inventory_end_date,
    wholesaler_start_date,
    wholesaler_end_date,
  } = dates;

  const result = await pool.query(
    `
    UPDATE audits
    SET
      inventory_start_date = $1,
      inventory_end_date = $2,
      wholesaler_start_date = $3,
      wholesaler_end_date = $4
    WHERE id = $5
    RETURNING *
    `,
    [
      inventory_start_date,
      inventory_end_date,
      wholesaler_start_date,
      wholesaler_end_date,
      auditId,
    ],
  );

  return result.rows[0] || null;
};

export const saveInventoryFile = async (auditId, filename, headerMapping) => {
  const auditCheck = await pool.query("SELECT id FROM audits WHERE id = $1", [
    auditId,
  ]);
  if (auditCheck.rows.length === 0) throw new Error("Audit not found");

  // ✅ Clean old inventory data (replace behavior)
  await pool.query(`DELETE FROM inventory_rows WHERE audit_id = $1`, [auditId]);
  const oldInvFiles = await pool.query(
    `SELECT file_name FROM audit_inventory_files WHERE audit_id = $1`, [auditId]
  );
  for (const row of oldInvFiles.rows) {
    const oldPath = path.join(process.cwd(), "uploads/inventory", row.file_name);
    try { if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath); } catch (e) {}
  }
  await pool.query(`DELETE FROM audit_inventory_files WHERE audit_id = $1`, [auditId]);

  const result = await pool.query(
    `
    INSERT INTO audit_inventory_files (audit_id, file_name)
    VALUES ($1, $2)
    RETURNING *
    `,
    [auditId, filename],
  );

  const filePath = path.join(process.cwd(), "uploads/inventory", filename);
  const dbHeaderMapping = toDbHeaderMapping(headerMapping);
  console.log("Normalizing file:", filePath);
  console.log("Header mapping:", headerMapping);

  let normalizedPath;
  try {
    normalizedPath = await normalizeInventoryCSV(filePath, headerMapping);
    console.log("Normalized file created:", normalizedPath);
  } catch (e) {
    console.error("NORMALIZATION FAILED:", e);
    throw e;
  }

  const normalizedContent = fs.readFileSync(normalizedPath, "utf-8");
  const records = parse(normalizedContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  console.log("Total rows parsed:", records.length);
  if (records.length > 0) {
    console.log("First row sample:", JSON.stringify(records[0]));
    await insertInventoryRows(auditId, records);
  }

  await refreshAuditStatus(auditId);

  return result.rows[0];
};

// ── BULK INSERT with chunking (max 1000 rows per query to stay under 65,535 param limit) ──
export const insertInventoryRows = async (auditId, rows) => {
  if (!rows.length) return { inserted: 0 };

  const client = await pool.connect();
  const CHUNK_SIZE = 1000; // 1000 rows × 15 cols = 15,000 params — safe

  try {
    await client.query("BEGIN");

    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const values = [];

      const placeholders = chunk.map((r, idx) => {
        const base = idx * 15;
        values.push(
          auditId,
          r.ndc || null,
          r.rx_number || null,
          r.status || null,
          r.date_filled || null,
          r.drug_name || null,
          r.quantity ? parseInt(r.quantity) : null,
          r.package_size || null,
          r.primary_bin || null,
          r.primary_pcn || null,
          r.primary_group || null,
          r.primary_paid ? parseFloat(r.primary_paid) : null,
          r.secondary_bin || null,
          r.secondary_paid ? parseFloat(r.secondary_paid) : null,
          r.brand || null,
        );
        return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11},$${base + 12},$${base + 13},$${base + 14},$${base + 15})`;
      });

      await client.query(
        `INSERT INTO inventory_rows
         (audit_id, ndc, rx_number, status, date_filled, drug_name, quantity, package_size,
          primary_bin, primary_pcn, primary_group, primary_paid, secondary_bin, secondary_paid, brand)
         VALUES ${placeholders.join(",")}`,
        values,
      );

      console.log(
        `✅ Chunk ${Math.floor(i / CHUNK_SIZE) + 1}/${Math.ceil(rows.length / CHUNK_SIZE)} inserted`,
      );
    }

    await client.query("COMMIT");
    console.log(`✅ All ${rows.length} inventory rows inserted`);
    return { inserted: rows.length };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};

export const saveWholesalerFiles = async (auditId, filesArray) => {
  const auditCheck = await pool.query("SELECT id FROM audits WHERE id = $1", [
    auditId,
  ]);
  if (auditCheck.rows.length === 0) throw new Error("Audit not found");

  // ✅ Clean old wholesaler data (replace behavior)
  await pool.query(`DELETE FROM wholesaler_rows WHERE audit_id = $1`, [auditId]);
  const oldWsFiles = await pool.query(
    `SELECT file_name FROM wholesaler_files WHERE audit_id = $1`, [auditId]
  );
  for (const row of oldWsFiles.rows) {
    const oldPath = path.join(process.cwd(), "uploads/wholesalers", row.file_name);
    try { if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath); } catch (e) {}
  }
  await pool.query(`DELETE FROM wholesaler_files WHERE audit_id = $1`, [auditId]);

  const results = [];

  for (const fileObj of filesArray) {
    const fileInsert = await pool.query(
      `INSERT INTO wholesaler_files (audit_id, wholesaler_name, file_name)
       VALUES ($1, $2, $3) RETURNING *`,
      [auditId, fileObj.wholesaler_name, fileObj.file_name],
    );

    const wholesalerFileId = fileInsert.rows[0].id;

    const filePath = path.join(
      process.cwd(),
      "uploads/wholesalers",
      fileObj.file_name,
    );
    if (!fs.existsSync(filePath)) {
      console.warn("Wholesaler file not found:", filePath);
      continue;
    }

    const content = fs.readFileSync(filePath, "utf-8");
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    const mapping = fileObj.headerMapping || {};
    console.log("WHOLESALER MAPPING:", JSON.stringify(mapping));
    console.log(
      "SAMPLE ROW KEYS:",
      records.length > 0 ? Object.keys(records[0]) : [],
    );
    console.log(
      "SAMPLE ROW:",
      records.length > 0 ? JSON.stringify(records[0]) : "empty",
    );

    if (records.length === 0) {
      results.push(fileInsert.rows[0]);
      continue;
    }

    // ── BULK INSERT wholesaler rows in chunks ──
    const CHUNK_SIZE = 1000; // 1000 rows × 8 cols = 8,000 params — safe
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      for (let i = 0; i < records.length; i += CHUNK_SIZE) {
        const chunk = records.slice(i, i + CHUNK_SIZE);
        const values = [];

        const placeholders = chunk.map((row, idx) => {
          const base = idx * 8;

          const ndc = mapping.ndcNumber
            ? (row[mapping.ndcNumber] ?? null)
            : null;
          const invoiceDate = mapping.invoiceDate
            ? (row[mapping.invoiceDate] ?? null)
            : null;
          const productName = mapping.itemDescription
            ? (row[mapping.itemDescription] ?? null)
            : null;
          const quantity =
            mapping.quantity &&
            row[mapping.quantity] !== undefined &&
            row[mapping.quantity] !== ""
              ? parseInt(
                  String(row[mapping.quantity]).replace(/[^0-9-]/g, ""),
                ) || 0
              : null;
          const unitCost =
            mapping.unitPrice && row[mapping.unitPrice]
              ? parseFloat(
                  String(row[mapping.unitPrice]).replace(/[^0-9.]/g, ""),
                )
              : null;
          const totalCost =
            mapping.totalPrice && row[mapping.totalPrice]
              ? parseFloat(
                  String(row[mapping.totalPrice]).replace(/[^0-9.]/g, ""),
                )
              : null;

          values.push(
            auditId,
            wholesalerFileId,
            ndc,
            productName,
            quantity,
            unitCost,
            totalCost,
            cleanDate(invoiceDate),
          );

          return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8})`;
        });

        await client.query(
          `INSERT INTO wholesaler_rows
           (audit_id, wholesaler_file_id, ndc, product_name, quantity, unit_cost, total_cost, invoice_date)
           VALUES ${placeholders.join(",")}`,
          values,
        );

        console.log(
          `✅ Wholesaler chunk ${Math.floor(i / CHUNK_SIZE) + 1}/${Math.ceil(records.length / CHUNK_SIZE)} inserted for ${fileObj.wholesaler_name}`,
        );
      }

      await client.query("COMMIT");
      console.log(
        `✅ All ${records.length} wholesaler rows inserted for ${fileObj.wholesaler_name}`,
      );
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    results.push(fileInsert.rows[0]);
  }

  await refreshAuditStatus(auditId);

  return results;
};

export const getAudits = async (userId) => {
  const result = await pool.query(`
    SELECT
      a.id,
      a.name,
      a.status,
      a.inventory_start_date,
      a.inventory_end_date,
      a.wholesaler_start_date,
      a.wholesaler_end_date,
      a.created_at,
      (SELECT COUNT(*) FROM audit_inventory_files f WHERE f.audit_id = a.id) AS inventory_files_count
    FROM audits a
    WHERE a.user_id = $1
    ORDER BY a.created_at DESC
  `, [userId]);

  return result.rows;
};

export const getAuditById = async (auditId) => {
  const result = await pool.query(`SELECT * FROM audits WHERE id = $1`, [
    auditId,
  ]);
  return result.rows[0] || null;
};

export const getInventoryRows = async (auditId) => {
  const result = await pool.query(
    `SELECT * FROM inventory_rows 
     WHERE audit_id = $1 
     ORDER BY id ASC`,
    [auditId],
  );

  const rows = result.rows;

  const REQUIRED_COLUMNS = [
    "ndc",
    "rx_number",
    "status",
    "date_filled",
    "drug_name",
    "quantity",
    "package_size",
    "primary_bin",
    "primary_paid",
    "secondary_bin",
    "secondary_paid",
    "brand",
  ];

  const normalized = rows.map((row) => {
    const normalizedRow = {};
    REQUIRED_COLUMNS.forEach((col) => {
      normalizedRow[col] = row[col] ?? null;
    });
    return normalizedRow;
  });

  return normalized;
};

export const deleteAudit = async (auditId) => {
  // 1. Get all physical file names BEFORE deleting DB rows
  const invFiles = await pool.query(
    `SELECT file_name FROM audit_inventory_files WHERE audit_id = $1`,
    [auditId],
  );
  const wsFiles = await pool.query(
    `SELECT file_name FROM wholesaler_files WHERE audit_id = $1`,
    [auditId],
  );

  // 2. Delete child rows explicitly (safe even with CASCADE)
  await pool.query(`DELETE FROM inventory_rows WHERE audit_id = $1`, [auditId]);
  await pool.query(`DELETE FROM wholesaler_rows WHERE audit_id = $1`, [auditId]);
  await pool.query(`DELETE FROM wholesaler_files WHERE audit_id = $1`, [auditId]);
  await pool.query(`DELETE FROM audit_inventory_files WHERE audit_id = $1`, [auditId]);

  // 3. Delete the audit itself
  const result = await pool.query(
    `DELETE FROM audits WHERE id = $1 RETURNING *`,
    [auditId],
  );

  // 4. Delete physical inventory files
  for (const row of invFiles.rows) {
    const filePath = path.join(process.cwd(), "uploads/inventory", row.file_name);
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (e) {
      console.warn("Failed to delete inventory file:", filePath, e.message);
    }
  }

  // 5. Delete physical wholesaler files
  for (const row of wsFiles.rows) {
    const filePath = path.join(process.cwd(), "uploads/wholesalers", row.file_name);
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (e) {
      console.warn("Failed to delete wholesaler file:", filePath, e.message);
    }
  }

  return result.rows[0] || null;
};
