-- One-time, self-guarding cleanup that runs before `prisma db push`.
--
-- The payment model was redesigned (Payment/PaymentPeriod -> PaymentType/
-- PaymentEntry, and Attachment.paymentId -> Attachment.entryId). `db push`
-- cannot add the new required `entryId` column to an Attachment table that
-- still holds old rows, so we drop the obsolete tables first.
--
-- It is guarded on the OLD-schema marker column `Attachment.paymentId`, so:
--   * on the old schema  -> drops the legacy tables (disposable payment data)
--   * on the new schema  -> does nothing (new Attachment has `entryId`, so the
--                            guard is false and the real data is never touched)
--   * on a fresh database -> does nothing
--
-- Houses, Users and Settings are never dropped, so they survive the upgrade.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Attachment' AND column_name = 'paymentId'
  ) THEN
    RAISE NOTICE 'Old payment schema detected - dropping legacy tables';
    DROP TABLE IF EXISTS "Attachment" CASCADE;
    DROP TABLE IF EXISTS "PaymentPeriod" CASCADE;
    DROP TABLE IF EXISTS "Payment" CASCADE;
  END IF;
END $$;
