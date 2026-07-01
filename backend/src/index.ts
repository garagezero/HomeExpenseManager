import express from "express";
import cookieParser from "cookie-parser";
import path from "path";
import fs from "fs";
import { config } from "./config";
import { bootstrap } from "./bootstrap";
import { authRouter } from "./routes/auth";
import { usersRouter } from "./routes/users";
import { housesRouter } from "./routes/houses";
import { paymentTypesRouter } from "./routes/paymentTypes";
import { entriesRouter } from "./routes/entries";
import { transactionsRouter } from "./routes/transactions";
import { statsRouter } from "./routes/stats";
import { settingsRouter } from "./routes/settings";
import { backupRouter } from "./routes/backup";

async function main() {
  await bootstrap();

  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.use("/api/auth", authRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/houses", housesRouter);
  app.use("/api/payment-types", paymentTypesRouter);
  app.use("/api/entries", entriesRouter);
  app.use("/api/transactions", transactionsRouter);
  app.use("/api/stats", statsRouter);
  app.use("/api/settings", settingsRouter);
  app.use("/api/backup", backupRouter);

  // Serve the built frontend (production). In dev, Vite serves it separately.
  if (fs.existsSync(config.publicDir)) {
    app.use(express.static(config.publicDir));
    // SPA fallback: any non-API route returns index.html
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(path.join(config.publicDir, "index.html"));
    });
  }

  // Multer / generic error handler
  app.use(
    (err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      console.error(err);
      const status = err.status || 500;
      res.status(status).json({ error: err.message || "Server error" });
    }
  );

  app.listen(config.port, () => {
    console.log(`[hem] listening on http://0.0.0.0:${config.port}`);
  });
}

main().catch((err) => {
  console.error("Fatal startup error", err);
  process.exit(1);
});
