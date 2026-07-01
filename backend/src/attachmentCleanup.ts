import fs from "fs";
import path from "path";
import { prisma } from "./db";
import { config } from "./config";

// A stored file may only ever be referenced by one Attachment row now, but we
// still guard here in case that ever changes.
export async function unlinkIfOrphan(storedName: string) {
  const count = await prisma.attachment.count({ where: { storedName } });
  if (count === 0) {
    fs.promises.unlink(path.join(config.attachmentsDir, storedName)).catch(() => {});
  }
}

// Deletes a transaction (cascades its entries + attachment rows) and removes
// any attachment files from disk that are no longer referenced.
export async function deleteTransactionAndFiles(transactionId: number) {
  const tx = await prisma.transaction.findUnique({
    where: { id: transactionId },
    include: { attachments: true },
  });
  if (!tx) return;
  const storedNames = tx.attachments.map((a) => a.storedName);
  await prisma.transaction.delete({ where: { id: transactionId } });
  for (const s of new Set(storedNames)) await unlinkIfOrphan(s);
}

// Call after removing or re-pointing an entry away from a transaction. If the
// transaction has no periods left, it's meaningless, so clean it up too.
export async function cleanupTransactionIfEmpty(transactionId: number) {
  const remaining = await prisma.paymentEntry.count({ where: { transactionId } });
  if (remaining === 0) await deleteTransactionAndFiles(transactionId);
}
