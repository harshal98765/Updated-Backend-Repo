import express from "express";
import cors from "cors";
import auditRoutes from "./routes/audit.routes.js";
import authRoutes from "./routes/auth.routes.js";
// add this import near your other route imports
import adminRoutes from "./routes/admin.routes.js";
import supplierRoutes from "./routes/supplier.routes.js"; // --- newly added supplier routes, adjust the path as needed

const app = express();

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// app.use("/auth", authRoutes);

app.get("/", (req, res) => {
  res.send("BatchRx API Running");
});

// register routes
app.use("/auth", authRoutes);
app.use("/api/audits", auditRoutes);
// add this line alongside your other app.use() calls
app.use("/admin", adminRoutes);
app.use("/api", supplierRoutes); //----- newly added supplier routes, adjust the base path as needed 

export default app;
