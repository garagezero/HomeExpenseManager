import { Router } from "express";
import { prisma } from "../db";
import { requireAuth } from "../auth";
import { deleteTransactionAndFiles } from "../attachmentCleanup";

export const transactionsRouter = Router();

transactionsRouter.use(requireAuth);

function serializeTransaction(t: any) {
  return {
    id: t.id,
    paymentTypeId: t.paymentTypeId,
    amount: t.amount != null ? Number(t.amount) : null,
    status: t.status,
    note: t.note,
    paidOn: t.paidOn,
    createdAt: t.createdAt,
    entries:
      t.entries?.map((e: any) => ({
        id: e.id,
        periodKey: e.periodKey,
        periodDate: e.periodDate,
        status: e.status,
        amount: e.amount != null ? Number(e.amount) : null,
      })) ?? [],
    attachments:
      t.attachments?.map((a: any) => ({
        id: a.id,
        filename: a.filename,
        mime: a.mime,
        size: a.size,
      })) ?? [],
  };
}

// Fetch a transaction with every period it covers — "which months are affected".
transactionsRouter.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const transaction = await prisma.transaction.findUnique({
    where: { id },
    include: {
      entries: { orderBy: { periodDate: "asc" } },
      attachments: true,
    },
  });
  if (!transaction) return res.status(404).json({ error: "Transaction not found" });
  res.json({ transaction: serializeTransaction(transaction) });
});

// Undo the whole payment: removes every period it covers plus its attachments.
transactionsRouter.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const exists = await prisma.transaction.findUnique({ where: { id } });
  if (!exists) return res.status(404).json({ error: "Transaction not found" });
  await deleteTransactionAndFiles(id);
  res.json({ ok: true });
});
