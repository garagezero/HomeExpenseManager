import { Router } from "express";
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import archiver from "archiver";
import unzipper from "unzipper";
import multer from "multer";
import { prisma } from "../db";
import { requireAdmin, requireAuth } from "../auth";
import { config } from "../config";

export const backupRouter = Router();

backupRouter.use(requireAuth, requireAdmin);

const EXPORT_VERSION = 1;

// ---- Export: stream a .zip containing data.json + every attachment file ----
backupRouter.get("/export", async (_req, res) => {
  const [users, houses, paymentTypes, transactions, entries, attachments, settings] =
    await Promise.all([
      prisma.user.findMany(),
      prisma.house.findMany(),
      prisma.paymentType.findMany(),
      prisma.transaction.findMany(),
      prisma.paymentEntry.findMany(),
      prisma.attachment.findMany(),
      prisma.setting.findMany(),
    ]);

  const data = {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    users: users.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() })),
    houses: houses.map((h) => ({ ...h, createdAt: h.createdAt.toISOString() })),
    paymentTypes: paymentTypes.map((t) => ({
      ...t,
      defaultAmount: t.defaultAmount != null ? Number(t.defaultAmount) : null,
      createdAt: t.createdAt.toISOString(),
    })),
    transactions: transactions.map((t) => ({
      ...t,
      amount: t.amount != null ? Number(t.amount) : null,
      paidOn: t.paidOn ? t.paidOn.toISOString() : null,
      createdAt: t.createdAt.toISOString(),
    })),
    entries: entries.map((e) => ({
      ...e,
      amount: e.amount != null ? Number(e.amount) : null,
      periodDate: e.periodDate.toISOString(),
      paidOn: e.paidOn ? e.paidOn.toISOString() : null,
      createdAt: e.createdAt.toISOString(),
    })),
    attachments: attachments.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
    settings,
  };

  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="hem-backup-${stamp}.zip"`);

  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.on("error", (err) => {
    console.error("[backup] export error", err);
    res.status(500).end();
  });
  archive.pipe(res);

  archive.append(JSON.stringify(data, null, 2), { name: "data.json" });

  // A file can be shared by several attachment rows — add each file only once.
  const seen = new Set<string>();
  for (const a of attachments) {
    if (seen.has(a.storedName)) continue;
    seen.add(a.storedName);
    const fp = path.join(config.attachmentsDir, a.storedName);
    if (fs.existsSync(fp)) archive.file(fp, { name: `files/${a.storedName}` });
  }

  await archive.finalize();
});

// ---- Import: replace everything from a previously exported .zip ----
const tmpDir = path.join(os.tmpdir(), "hem-import");
fs.mkdirSync(tmpDir, { recursive: true });
const uploadZip = multer({ dest: tmpDir, limits: { fileSize: 500 * 1024 * 1024 } });

backupRouter.post("/import", uploadZip.single("backup"), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: "No backup file uploaded" });

  const workDir = path.join(tmpDir, crypto.randomBytes(8).toString("hex"));
  try {
    fs.mkdirSync(workDir, { recursive: true });
    await fs
      .createReadStream(file.path)
      .pipe(unzipper.Extract({ path: workDir }))
      .promise();

    const dataPath = path.join(workDir, "data.json");
    if (!fs.existsSync(dataPath)) {
      return res.status(400).json({ error: "Invalid backup: data.json missing" });
    }
    const data = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
    if (typeof data.version !== "number") {
      return res.status(400).json({ error: "Invalid backup format" });
    }

    await prisma.$transaction(async (tx) => {
      // Wipe (order matters for FKs, though cascades cover most).
      await tx.attachment.deleteMany();
      await tx.paymentEntry.deleteMany();
      await tx.transaction.deleteMany();
      await tx.paymentType.deleteMany();
      await tx.house.deleteMany();
      await tx.user.deleteMany();
      await tx.setting.deleteMany();

      for (const u of data.users ?? [])
        await tx.user.create({
          data: {
            id: u.id,
            name: u.name,
            username: u.username,
            passwordHash: u.passwordHash,
            isAdmin: u.isAdmin,
            createdAt: new Date(u.createdAt),
          },
        });

      for (const h of data.houses ?? [])
        await tx.house.create({
          data: {
            id: h.id,
            name: h.name,
            location: h.location,
            createdAt: new Date(h.createdAt),
          },
        });

      for (const t of data.paymentTypes ?? [])
        await tx.paymentType.create({
          data: {
            id: t.id,
            houseId: t.houseId,
            name: t.name,
            frequency: t.frequency,
            defaultAmount: t.defaultAmount,
            createdAt: new Date(t.createdAt),
          },
        });

      for (const t of data.transactions ?? [])
        await tx.transaction.create({
          data: {
            id: t.id,
            paymentTypeId: t.paymentTypeId,
            amount: t.amount,
            status: t.status,
            note: t.note,
            paidOn: t.paidOn ? new Date(t.paidOn) : null,
            createdById: t.createdById,
            createdAt: new Date(t.createdAt),
          },
        });

      for (const e of data.entries ?? [])
        await tx.paymentEntry.create({
          data: {
            id: e.id,
            paymentTypeId: e.paymentTypeId,
            periodKey: e.periodKey,
            periodDate: new Date(e.periodDate),
            status: e.status,
            amount: e.amount,
            note: e.note,
            paidOn: e.paidOn ? new Date(e.paidOn) : null,
            transactionId: e.transactionId ?? null,
            createdById: e.createdById,
            createdAt: new Date(e.createdAt),
          },
        });

      for (const a of data.attachments ?? [])
        await tx.attachment.create({
          data: {
            id: a.id,
            entryId: a.entryId ?? null,
            transactionId: a.transactionId ?? null,
            filename: a.filename,
            storedName: a.storedName,
            mime: a.mime,
            size: a.size,
            createdAt: new Date(a.createdAt),
          },
        });

      for (const s of data.settings ?? [])
        await tx.setting.create({ data: { key: s.key, value: s.value } });

      // Reset autoincrement sequences so future inserts don't collide.
      for (const table of [
        "User",
        "House",
        "PaymentType",
        "Transaction",
        "PaymentEntry",
        "Attachment",
      ]) {
        await tx.$executeRawUnsafe(
          `SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), COALESCE((SELECT MAX(id) FROM "${table}"), 1))`
        );
      }
    });

    // Restore attachment files.
    const filesDir = path.join(workDir, "files");
    if (fs.existsSync(filesDir)) {
      for (const f of fs.readdirSync(filesDir)) {
        fs.copyFileSync(path.join(filesDir, f), path.join(config.attachmentsDir, f));
      }
    }

    res.json({ ok: true, message: "Backup restored. You may need to log in again." });
  } catch (err) {
    console.error("[backup] import error", err);
    res.status(500).json({ error: "Import failed. The backup file may be corrupt." });
  } finally {
    fs.rm(file.path, { force: true }, () => {});
    fs.rm(workDir, { recursive: true, force: true }, () => {});
  }
});
