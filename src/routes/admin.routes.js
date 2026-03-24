// ─────────────────────────────────────────────────────────────
// FILE: src/routes/admin.routes.js
// ─────────────────────────────────────────────────────────────

import express from "express";
import { pool } from "../config/db.js";   // same db.js your other routes use

const router = express.Router();

// ─────────────────────────────────────────────────────────────
// GET /admin/excel
// Returns every row from master_sheet as:
//   { sheetName, headers, rows, total }
// headers: ["id","bin","pcn","grp","pbm_name","payer_type"]
// rows:    string[][] — each row is an ordered array matching headers
// ─────────────────────────────────────────────────────────────
router.get("/excel", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, bin, pcn, grp, pbm_name, payer_type
       FROM master_sheet
       ORDER BY id ASC`
    );

    const headers = ["id", "bin", "pcn", "grp", "pbm_name", "payer_type"];

    const rows = result.rows.map((row) =>
      headers.map((col) =>
        row[col] !== null && row[col] !== undefined ? String(row[col]) : ""
      )
    );

    return res.status(200).json({
      sheetName: "master_sheet",
      headers,
      rows,
      total: result.rows.length,
    });
  } catch (err) {
    console.error("[GET /admin/excel]", err);
    return res.status(500).json({ error: "Failed to fetch master_sheet data." });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /admin/excel
// Body: { sheetName, headers, rows }
// - row with non-empty id  → UPDATE
// - row with empty id      → INSERT (bigserial auto-assigns id)
// Wrapped in a transaction — all-or-nothing
// ─────────────────────────────────────────────────────────────
router.post("/excel", async (req, res) => {
  const { headers, rows } = req.body;

  if (!Array.isArray(headers) || !Array.isArray(rows)) {
    return res.status(400).json({ error: "Invalid payload. Expected { headers: string[], rows: any[][] }." });
  }

  // Build column-index map from headers array sent by the frontend
  const idx = {};
  headers.forEach((h, i) => { idx[h] = i; });

  const client = await pool.connect();
  let updated = 0;
  let inserted = 0;

  try {
    await client.query("BEGIN");

    for (const row of rows) {
      const id         = row[idx["id"]]         ?? "";
      const bin        = row[idx["bin"]]         ?? null;
      const pcn        = row[idx["pcn"]]         ?? null;
      const grp        = row[idx["grp"]]         ?? null;
      const pbm_name   = row[idx["pbm_name"]]    ?? null;
      const payer_type = row[idx["payer_type"]]  ?? null;

      const hasId = id !== "" && id !== null && !isNaN(Number(id)) && Number(id) > 0;

      if (hasId) {
        await client.query(
          `UPDATE master_sheet
           SET bin = $1, pcn = $2, grp = $3, pbm_name = $4, payer_type = $5
           WHERE id = $6`,
          [bin || null, pcn || null, grp || null, pbm_name || null, payer_type || null, Number(id)]
        );
        updated++;
      } else {
        await client.query(
          `INSERT INTO master_sheet (bin, pcn, grp, pbm_name, payer_type)
           VALUES ($1, $2, $3, $4, $5)`,
          [bin || null, pcn || null, grp || null, pbm_name || null, payer_type || null]
        );
        inserted++;
      }
    }

    await client.query("COMMIT");
    console.log(`[POST /admin/excel] updated=${updated} inserted=${inserted}`);

    return res.status(200).json({
      success: true,
      message: `${updated} rows updated, ${inserted} rows inserted.`,
      updated,
      inserted,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[POST /admin/excel]", err);
    return res.status(500).json({ error: "Save failed. Transaction rolled back." });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────────────────────
// DELETE /admin/excel/row/:id
// Deletes a single master_sheet row by its bigint PK
// Called once per deleted row before the bulk POST save
// ─────────────────────────────────────────────────────────────
router.delete("/excel/row/:id", async (req, res) => {
  const { id } = req.params;

  if (!id || isNaN(Number(id)) || Number(id) <= 0) {
    return res.status(400).json({ error: "Invalid id. Must be a positive integer." });
  }

  try {
    const result = await pool.query(
      `DELETE FROM master_sheet WHERE id = $1 RETURNING id`,
      [Number(id)]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: `Row with id=${id} not found.` });
    }

    console.log(`[DELETE /admin/excel/row/${id}] deleted`);
    return res.status(200).json({ success: true, message: `Row ${id} deleted.` });
  } catch (err) {
    console.error(`[DELETE /admin/excel/row/${id}]`, err);
    return res.status(500).json({ error: "Failed to delete row." });
  }
});

export default router;