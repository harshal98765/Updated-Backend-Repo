// import express from "express";
// import { pool } from "../config/db.js";

// const router = express.Router();

// // ─────────────────────────────────────────────────────────────
// // ROUTE 1: GET /api/suppliers
// // Returns the master list of all supplier names
// // ─────────────────────────────────────────────────────────────
// router.get("/suppliers", async (req, res) => {
//   try {
//     const result = await pool.query(
//       `SELECT id, name FROM suppliers ORDER BY name ASC`
//     );
//     res.status(200).json(result.rows);
//   } catch (error) {
//     console.error("Error fetching suppliers:", error);
//     res.status(500).json({ message: "Server error" });
//   }
// });

// // ─────────────────────────────────────────────────────────────
// // ROUTE 2: GET /api/user-suppliers/:userId
// // Returns the suppliers selected by a specific user
// // ─────────────────────────────────────────────────────────────
// router.get("/user-suppliers/:userId", async (req, res) => {
//   try {
//     const { userId } = req.params;
//     const result = await pool.query(
//       `SELECT s.id, s.name
//        FROM user_suppliers us
//        JOIN suppliers s ON us.supplier_id = s.id
//        WHERE us.user_id = $1
//        ORDER BY s.name ASC`,
//       [userId]
//     );
//     res.status(200).json(result.rows);
//   } catch (error) {
//     console.error("Error fetching user suppliers:", error);
//     res.status(500).json({ message: "Server error" });
//   }
// });

// // ─────────────────────────────────────────────────────────────
// // ROUTE 3: POST /api/user-suppliers/:userId
// // Saves/replaces a user's selected suppliers
// // Body: { supplierNames: ["AXIA", "MCKESSON"] }
// // ─────────────────────────────────────────────────────────────
// router.post("/user-suppliers/:userId", async (req, res) => {
//   const client = await pool.connect();
//   try {
//     const { userId } = req.params;
//     const { supplierNames } = req.body;

//     if (!Array.isArray(supplierNames)) {
//       return res.status(400).json({ message: "supplierNames must be an array" });
//     }

//     await client.query("BEGIN");

//     // Delete old selections for this user
//     await client.query(
//       "DELETE FROM user_suppliers WHERE user_id = $1",
//       [userId]
//     );

//     // Insert new selections
//     let insertedCount = 0;
//     for (const name of supplierNames) {
//       const result = await client.query(
//         `INSERT INTO user_suppliers (id, user_id, supplier_id)
//          SELECT gen_random_uuid(), $1, s.id
//          FROM suppliers s
//          WHERE s.name = $2
//          ON CONFLICT (user_id, supplier_id) DO NOTHING`,
//         [userId, name]
//       );
//       insertedCount += result.rowCount;
//     }

//     await client.query("COMMIT");

//     res.status(200).json({
//       message: "Suppliers saved successfully",
//       count: insertedCount,
//     });
//   } catch (error) {
//     await client.query("ROLLBACK");
//     console.error("Error saving user suppliers:", error);
//     res.status(500).json({ message: "Server error" });
//   } finally {
//     client.release();
//   }
// });

// export default router;

import express from "express";
import { pool } from "../config/db.js";
import { v4 as uuidv4 } from "uuid";

const router = express.Router();

const REQUIRED_FIELDS = [
  "ndc_number",
  "invoice_date",
  "item_description",
  "quantity",
];

// ─────────────────────────────────────────────────────────────
// GET /api/suppliers — master list of all suppliers
// ─────────────────────────────────────────────────────────────
router.get("/suppliers", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name FROM suppliers ORDER BY name ASC`
    );
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching suppliers:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/user-suppliers/:userId — this user's selected suppliers
// ─────────────────────────────────────────────────────────────
router.get("/user-suppliers/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await pool.query(
      `SELECT s.id, s.name
       FROM user_suppliers us
       JOIN suppliers s ON us.supplier_id = s.id
       WHERE us.user_id = $1
       ORDER BY s.name ASC`,
      [userId]
    );
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching user suppliers:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/user-suppliers/:userId — save/replace user's suppliers
// ─────────────────────────────────────────────────────────────
router.post("/user-suppliers/:userId", async (req, res) => {
  const client = await pool.connect();
  try {
    const { userId } = req.params;
    const { supplierNames } = req.body;

    if (!Array.isArray(supplierNames)) {
      return res.status(400).json({ message: "supplierNames must be an array" });
    }

    await client.query("BEGIN");
    await client.query("DELETE FROM user_suppliers WHERE user_id = $1", [userId]);

    let insertedCount = 0;
    for (const name of supplierNames) {
      const result = await client.query(
        `INSERT INTO user_suppliers (id, user_id, supplier_id)
         SELECT gen_random_uuid(), $1, s.id
         FROM suppliers s
         WHERE s.name = $2
         ON CONFLICT (user_id, supplier_id) DO NOTHING`,
        [userId, name]
      );
      insertedCount += result.rowCount;
    }

    await client.query("COMMIT");
    res.status(200).json({ message: "Suppliers saved successfully", count: insertedCount });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error saving user suppliers:", error);
    res.status(500).json({ message: "Server error" });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/suppliers — add a new supplier
// ─────────────────────────────────────────────────────────────
router.post("/suppliers", async (req, res) => {
  try {
    const { name } = req.body;
    const result = await pool.query(
      `INSERT INTO suppliers (id, name) VALUES ($1, $2) RETURNING *`,
      [uuidv4(), name]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// DELETE /api/suppliers/:id — delete a supplier
// ─────────────────────────────────────────────────────────────
router.delete("/suppliers/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const existing = await pool.query("SELECT id FROM suppliers WHERE id = $1", [id]);
    if (existing.rowCount === 0) {
      return res.status(404).json({ success: false, message: "Supplier not found" });
    }
    await pool.query("DELETE FROM suppliers WHERE id = $1", [id]);
    return res.json({ success: true, message: "Supplier and its mapping deleted successfully" });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Failed to delete supplier", error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/supplier-mapping/:supplierId — get mapping by supplier ID
// ─────────────────────────────────────────────────────────────
router.get("/supplier-mapping/:supplierId", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM supplier_mappings WHERE supplier_id = $1`,
      [req.params.supplierId]
    );
    res.json(result.rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// ✅ GET /api/supplier-mapping-by-name/:supplierName
// Fetches admin's column mapping for a supplier by name
// Used by UploadWholesalersStep to auto-map columns
// ─────────────────────────────────────────────────────────────
router.get("/supplier-mapping-by-name/:supplierName", async (req, res) => {
  try {
    const { supplierName } = req.params;

    const result = await pool.query(
      `SELECT sm.mappings
       FROM supplier_mappings sm
       JOIN suppliers s ON sm.supplier_id = s.id
       WHERE s.name = $1`,
      [supplierName]
    );

    if (result.rows.length === 0) {
      return res.json({ mappings: null });
    }

    res.json({ mappings: result.rows[0].mappings });
  } catch (err) {
    console.error("Error fetching supplier mapping by name:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/supplier-mapping — save/update mapping (used by admin)
// ─────────────────────────────────────────────────────────────
router.post("/supplier-mapping", async (req, res) => {
  try {
    const { supplier_id, mappings } = req.body;
    const mappedFields = Object.values(mappings);

    for (let field of REQUIRED_FIELDS) {
      if (!mappedFields.includes(field)) {
        return res.status(400).json({ error: `${field} is required` });
      }
    }

    const result = await pool.query(
      `INSERT INTO supplier_mappings (id, supplier_id, mappings)
       VALUES ($1, $2, $3)
       ON CONFLICT (supplier_id)
       DO UPDATE SET mappings = $3
       RETURNING *`,
      [uuidv4(), supplier_id, mappings]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;