import { useEffect, useState } from "react";
import {
  Modal,
  SegmentedControl,
  NumberInput,
  Textarea,
  Button,
  Group,
  Stack,
  Text,
  Divider,
  Anchor,
  ActionIcon,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { IconFile, IconTrash } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { api, EntryStatus, PaymentEntry, PaymentType } from "../api";
import { PeriodCell } from "../periods";
import AttachmentPicker from "./AttachmentPicker";

interface Props {
  opened: boolean;
  onClose: () => void;
  onSaved: () => void;
  type: PaymentType;
  cell: PeriodCell | null;
  entry: PaymentEntry | null;
  periodLabel: string;
}

export default function EntryModal({
  opened,
  onClose,
  onSaved,
  type,
  cell,
  entry,
  periodLabel,
}: Props) {
  const [status, setStatus] = useState<EntryStatus>("PAID");
  const [amount, setAmount] = useState<number | string>("");
  const [note, setNote] = useState("");
  const [paidOn, setPaidOn] = useState<Date | null>(new Date());
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!opened) return;
    if (entry) {
      setStatus(entry.status);
      setAmount(entry.amount ?? "");
      setNote(entry.note ?? "");
      setPaidOn(entry.paidOn ? new Date(entry.paidOn) : new Date());
    } else {
      setStatus("PAID");
      setAmount(type.defaultAmount ?? "");
      setNote("");
      setPaidOn(new Date());
    }
    setFiles([]);
  }, [opened, entry, type]);

  async function save() {
    setSaving(true);
    const amt = amount === "" ? null : Number(amount);
    try {
      if (entry) {
        await api.updateEntry(entry.id, {
          status,
          amount: amt,
          note,
          paidOn: paidOn ? paidOn.toISOString() : null,
        });
        if (files.length) {
          const fd = new FormData();
          files.forEach((f) => fd.append("attachments", f));
          await api.addEntryAttachments(entry.id, fd);
        }
      } else if (cell) {
        const fd = new FormData();
        fd.append("paymentTypeId", String(type.id));
        fd.append("periodKey", cell.key);
        fd.append("periodDate", cell.dateISO);
        fd.append("status", status);
        if (amt !== null) fd.append("amount", String(amt));
        fd.append("note", note);
        if (paidOn) fd.append("paidOn", paidOn.toISOString());
        files.forEach((f) => fd.append("attachments", f));
        await api.upsertEntry(fd);
      }
      notifications.show({ color: "green", message: "Saved" });
      onSaved();
      onClose();
    } catch (err: any) {
      notifications.show({ color: "red", message: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function removeEntry() {
    if (!entry) return;
    try {
      await api.deleteEntry(entry.id);
      notifications.show({ color: "green", message: "Marked unpaid" });
      onSaved();
      onClose();
    } catch (err: any) {
      notifications.show({ color: "red", message: err.message });
    }
  }

  async function removeAttachment(attId: number) {
    try {
      await api.deleteAttachment(attId);
      notifications.show({ color: "green", message: "Attachment removed" });
      onSaved();
    } catch (err: any) {
      notifications.show({ color: "red", message: err.message });
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title={`${type.name} — ${periodLabel}`}>
      <Stack>
        <div>
          <Text size="sm" fw={500} mb={4}>
            Status
          </Text>
          <SegmentedControl
            fullWidth
            value={status}
            onChange={(v) => setStatus(v as EntryStatus)}
            data={[
              { label: "Paid", value: "PAID" },
              { label: "Partially paid", value: "PARTIAL" },
            ]}
          />
        </div>

        <NumberInput
          label="Amount"
          description={
            type.defaultAmount != null
              ? `Default for this type is ${type.defaultAmount}`
              : "Optional — leave empty to just record it as paid"
          }
          placeholder="0.00"
          value={amount}
          onChange={setAmount}
          min={0}
          decimalScale={2}
          thousandSeparator=","
        />

        <DateInput label="Paid on" value={paidOn} onChange={setPaidOn} clearable />

        <Textarea
          label="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.currentTarget.value)}
          autosize
          minRows={2}
        />

        <Divider label="Attachments" labelPosition="center" />

        {entry && entry.attachments.length > 0 && (
          <Stack gap={4}>
            {entry.attachments.map((a) => (
              <Group key={a.id} justify="space-between">
                <Anchor href={api.attachmentUrl(a.id)} target="_blank" size="sm">
                  <Group gap={6}>
                    <IconFile size={14} />
                    {a.filename}
                  </Group>
                </Anchor>
                <ActionIcon color="red" variant="subtle" onClick={() => removeAttachment(a.id)}>
                  <IconTrash size={16} />
                </ActionIcon>
              </Group>
            ))}
          </Stack>
        )}

        <AttachmentPicker
          label={entry ? "Add more files" : "Attach receipt / check (optional)"}
          value={files}
          onChange={setFiles}
        />

        <Group justify="space-between" mt="sm">
          <div>
            {entry && (
              <Button variant="subtle" color="red" onClick={removeEntry}>
                Mark unpaid
              </Button>
            )}
          </div>
          <Group>
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={save} loading={saving}>
              Save
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
