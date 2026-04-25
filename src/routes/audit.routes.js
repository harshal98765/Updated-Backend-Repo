import express from "express";
import { uploadInventory, uploadWholesalers } from "../utils/multer.js";
import {
  createAudit,
  updateAuditDates,
  uploadInventoryFile,
  uploadWholesalerFiles,
  createInventoryRows,
  getAudits,
  getAuditById,
  getInventoryRows,
  deleteAudit,
  getFullReport,
  getWholesalerDetail,
  getInventoryFiles,
  getCommunityData,
  getWholesalerFiles,
  getInventoryDetail,
  getDrugLookup,
  searchDrugNames,
  getDrugLookupGlobal,   // ← ADD
  getDrugLookupLanding,
} from "../controllers/audit.controller.js";

const router = express.Router();

// ============================
// ⚡ STATIC GET ROUTES FIRST (before any /:id wildcard)
// ============================

router.get("/drug-search", searchDrugNames);
router.get("/drug-lookup-global", getDrugLookupGlobal);   // ← ADD THIS LINE
router.get("/drug-lookup-landing", getDrugLookupLanding);
router.get("/community/:ndc", getCommunityData);

// ============================
// CREATE & UPDATE
// ============================

router.post("/", createAudit);
router.patch("/:id/dates", updateAuditDates);
router.put("/:id/dates", updateAuditDates);

// ============================
// INVENTORY
// ============================

router.post(
  "/:id/inventory",
  (req, res, next) => {
    uploadInventory.fields([
      { name: "file", maxCount: 1 },
      { name: "headerMapping", maxCount: 1 },
    ])(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: err.message });
      }
      next();
    });
  },
  uploadInventoryFile,
);

router.post("/:id/inventory/rows", createInventoryRows);

// ============================
// WHOLESALERS
// ============================

router.post("/:id/wholesalers", uploadWholesalers.any(), uploadWholesalerFiles);

// ============================
// GET REPORTS
// ============================

router.get("/", getAudits);

// Specific /:id sub-routes FIRST
router.get("/:id/inventory/rows", getInventoryRows);
router.get("/:id/report", getFullReport);
router.get("/:id/inventory-files", getInventoryFiles);
router.get("/:id/wholesaler-files", getWholesalerFiles);
router.get("/:id/inventory-detail/:ndc", getInventoryDetail);
router.get("/:id/wholesaler-detail/:ndc", getWholesalerDetail);
router.get("/:id/drug-lookup", getDrugLookup);

// ⚠️ Bare /:id MUST be LAST — it's a wildcard
router.get("/:id", getAuditById);

// ============================
// DELETE
// ============================

router.delete("/:id", deleteAudit);

export default router;