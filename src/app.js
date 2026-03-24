import express from "express";
import cors from "cors";
import auditRoutes from "./routes/audit.routes.js";
import authRoutes from "./routes/auth.routes.js";
// add this import near your other route imports
import adminRoutes from "./routes/admin.routes.js";


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

export default app;
