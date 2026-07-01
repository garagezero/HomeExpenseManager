import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth } from "../auth";

export const paymentTypesRouter = Router();

paymentTypesRouter.use(requireAuth);

function serializeType(t: any) {
  return {
    id: t.id,
    houseId: t.houseId,
    name: t.name,
    frequency: t.frequency,
    defaultAmount: t.defaultAmount != null ? Number(t.defaultAmount) : null,
    createdAt: t.createdAt,
    entryCount: t._count?.entries,
  };
}

export function serializeEntry(e: any) {
  return {
    id: e.id,
    paymentTypeId: e.paymentTypeId,
    periodKey: e.periodKey,
    periodDate: e.periodDate,
    status: e.status,
    amount: e.amount != null ? Number(e.amount) : null,
    note: e.note,
    paidOn: e.paidOn,
    createdAt: e.createdAt,
    transactionId: e.transactionId ?? null,
    attachments:
      e.attachments?.map((a: any) => ({
        id: a.id,
        filename: a.filename,
        mime: a.mime,
        size: a.size,
      })) ?? [],
  };
}

// List types for a house
paymentTypesRouter.get("/", async (req, res) => {
  const houseId = req.query.houseId ? Number(req.query.houseId) : undefined;
  const types = await prisma.paymentType.findMany({
    where: { houseId },
    include: { _count: { select: { entries: true } } },
    orderBy: { name: "asc" },
  });
  res.json({ paymentTypes: types.map(serializeType) });
});

const typeSchema = z.object({
  houseId: z.coerce.number().int(),
  name: z.string().min(1),
  frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]),
  defaultAmount: z.coerce.number().nonnegative().nullable().optional(),
});

paymentTypesRouter.post("/", async (req, res) => {
  const parsed = typeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const house = await prisma.house.findUnique({ where: { id: parsed.data.houseId } });
  if (!house) return res.status(400).json({ error: "House not found" });

  const type = await prisma.paymentType.create({
    data: {
      houseId: parsed.data.houseId,
      name: parsed.data.name,
      frequency: parsed.data.frequency,
      defaultAmount: parsed.data.defaultAmount ?? null,
    },
  });
  res.status(201).json({ paymentType: serializeType(type) });
});

const typeUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]).optional(),
  defaultAmount: z.coerce.number().nonnegative().nullable().optional(),
});

paymentTypesRouter.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const parsed = typeUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const exists = await prisma.paymentType.findUnique({ where: { id } });
  if (!exists) return res.status(404).json({ error: "Payment type not found" });

  const type = await prisma.paymentType.update({
    where: { id },
    data: {
      name: parsed.data.name,
      frequency: parsed.data.frequency,
      defaultAmount:
        parsed.data.defaultAmount === undefined ? undefined : parsed.data.defaultAmount,
    },
  });
  res.json({ paymentType: serializeType(type) });
});

paymentTypesRouter.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const exists = await prisma.paymentType.findUnique({ where: { id } });
  if (!exists) return res.status(404).json({ error: "Payment type not found" });
  await prisma.paymentType.delete({ where: { id } });
  res.json({ ok: true });
});

// Entries for a type, optionally filtered by year (matches periodDate year).
paymentTypesRouter.get("/:id/entries", async (req, res) => {
  const id = Number(req.params.id);
  const year = req.query.year ? Number(req.query.year) : undefined;

  const where: any = { paymentTypeId: id };
  if (year) {
    where.periodDate = {
      gte: new Date(Date.UTC(year, 0, 1)),
      lt: new Date(Date.UTC(year + 1, 0, 1)),
    };
  }

  const entries = await prisma.paymentEntry.findMany({
    where,
    include: { attachments: true },
    orderBy: { periodDate: "asc" },
  });
  res.json({ entries: entries.map(serializeEntry) });
});
