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
} from "../controllers/audit.controller.js";

const router = express.Router();

// ============================
// CREATE & UPDATE
// ============================

router.post("/", createAudit);
router.patch("/:id/dates", updateAuditDates);

// ============================
// INVENTORY
// ============================

router.post(
  "/:id/inventory",
  (req, res, next) => {
    uploadInventory.single("file")(req, res, (err) => {
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
router.get("/:id", getAuditById);
router.get("/:id/inventory/rows", getInventoryRows);
router.get("/:id/report", getFullReport);

// ============================
// DELETE
// ============================

router.delete("/:id", deleteAudit);
router.put("/:id/dates", updateAuditDates);

export default router;
