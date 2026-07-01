import { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Stack,
  Group,
  Text,
  NumberInput,
  Select,
  SegmentedControl,
  Chip,
  Button,
  Textarea,
  Divider,
  Anchor,
  Badge,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import { api, EntryStatus, PaymentType } from "../api";
import { MONTHS } from "../context";
import { generatePeriods, needsMonthNav, needsYearNav, PeriodCell } from "../periods";
import AttachmentPicker from "./AttachmentPicker";

interface Props {
  opened: boolean;
  onClose: () => void;
  onSaved: (transactionId: number) => void;
  type: PaymentType;
  initialYear: number;
  initialMonth: number;
}

// Add one payment (with an optional shared attachment) to several periods at once.
export default function BulkEntryModal({
  opened,
  onClose,
  onSaved,
  type,
  initialYear,
  initialMonth,
}: Props) {
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [selected, setSelected] = useState<string[]>([]);
  const [status, setStatus] = useState<EntryStatus>("PAID");
  const [amount, setAmount] = useState<number | string>("");
  const [note, setNote] = useState("");
  const [paidOn, setPaidOn] = useState<Date | null>(new Date());
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!opened) return;
    setYear(initialYear);
    setMonth(initialMonth);
    setSelected([]);
    setStatus("PAID");
    setAmount(type.defaultAmount ?? "");
    setNote("");
    setPaidOn(new Date());
    setFiles([]);
  }, [opened, initialYear, initialMonth, type]);

  const cells = useMemo(
    () => generatePeriods(type.frequency, { year, month }),
    [type.frequency, year, month]
  );
  const cellByKey = useMemo(() => {
    const m: Record<string, PeriodCell> = {};
    for (const c of cells) m[c.key] = c;
    return m;
  }, [cells]);

  // Keep only selections that still exist when the range changes.
  useEffect(() => {
    setSelected((prev) => prev.filter((k) => cellByKey[k]));
  }, [cellByKey]);

  async function save() {
    if (selected.length === 0)
      return notifications.show({ color: "red", message: "Select at least one period" });
    setSaving(true);
    try {
      const periods = selected
        .map((k) => cellByKey[k])
        .filter(Boolean)
        .map((c) => ({ periodKey: c.key, periodDate: c.dateISO }));

      const fd = new FormData();
      fd.append("paymentTypeId", String(type.id));
      fd.append("periods", JSON.stringify(periods));
      fd.append("status", status);
      if (amount !== "") fd.append("amount", String(amount));
      fd.append("note", note);
      if (paidOn) fd.append("paidOn", paidOn.toISOString());
      files.forEach((f) => fd.append("attachments", f));

      const res = await api.bulkUpsert(fd);
      notifications.show({ color: "green", message: `Added to ${res.count} periods` });
      onSaved(res.transactionId);
      onClose();
    } catch (err: any) {
      notifications.show({ color: "red", message: err.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title={`${type.name} — add to multiple periods`} size="lg">
      <Stack>
        <Group>
          {needsYearNav(type.frequency) && (
            <NumberInput
              w={110}
              label="Year"
              value={year}
              onChange={(v) => setYear(Number(v) || initialYear)}
              min={1970}
              max={3000}
            />
          )}
          {needsMonthNav(type.frequency) && (
            <Select
              w={140}
              label="Month"
              data={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
              value={String(month)}
              onChange={(v) => v && setMonth(Number(v))}
              allowDeselect={false}
            />
          )}
        </Group>

        <div>
          <Group justify="space-between" mb={4}>
            <Text size="sm" fw={500}>
              Select periods ({selected.length})
            </Text>
            <Group gap="xs">
              <Anchor component="button" type="button" size="xs" onClick={() => setSelected(cells.map((c) => c.key))}>
                Select all
              </Anchor>
              <Anchor component="button" type="button" size="xs" onClick={() => setSelected([])}>
                Clear
              </Anchor>
            </Group>
          </Group>
          <Chip.Group multiple value={selected} onChange={setSelected}>
            <Group gap="xs">
              {cells.map((c) => {
                const order = selected.indexOf(c.key);
                return (
                  <div key={c.key} style={{ position: "relative" }}>
                    <Chip value={c.key} size="sm">
                      {c.label}
                    </Chip>
                    {order !== -1 && (
                      <Badge
                        size="xs"
                        circle
                        color="blue"
                        style={{ position: "absolute", top: -6, right: -6, pointerEvents: "none" }}
                      >
                        {order + 1}
                      </Badge>
                    )}
                  </div>
                );
              })}
            </Group>
          </Chip.Group>
        </div>

        <Divider />

        <Group grow align="flex-start">
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
                { label: "Partial", value: "PARTIAL" },
              ]}
            />
          </div>
          <NumberInput
            label="Amount (per period)"
            placeholder="0.00"
            value={amount}
            onChange={setAmount}
            min={0}
            decimalScale={2}
            thousandSeparator=","
          />
        </Group>

        <DateInput label="Paid on" value={paidOn} onChange={setPaidOn} clearable />

        <Textarea
          label="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.currentTarget.value)}
          autosize
          minRows={2}
        />

        <AttachmentPicker
          label="Attachment (shared across all selected periods)"
          description="The file is stored once and linked to the whole transaction."
          value={files}
          onChange={setFiles}
        />

        <Group justify="flex-end" mt="sm">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving} disabled={selected.length === 0}>
            Add to {selected.length || ""} {selected.length === 1 ? "period" : "periods"}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
