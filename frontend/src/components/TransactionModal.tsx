import { useEffect, useState } from "react";
import {
  Modal,
  Stack,
  Group,
  Text,
  Badge,
  Button,
  Anchor,
  Divider,
  Loader,
  Center,
  List,
} from "@mantine/core";
import { IconFile, IconCalendarStats } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { modals } from "@mantine/modals";
import { api, Frequency, Transaction } from "../api";
import { useMoney } from "../context";
import { formatPeriodLabel } from "../periods";

interface Props {
  opened: boolean;
  onClose: () => void;
  onChanged: () => void;
  transactionId: number | null;
  typeName: string;
  frequency: Frequency;
}

// Read-focused view of a bulk payment: which periods it covers, its shared
// attachment(s), and the option to undo the whole thing.
export default function TransactionModal({
  opened,
  onClose,
  onChanged,
  transactionId,
  typeName,
  frequency,
}: Props) {
  const money = useMoney();
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!opened || !transactionId) return;
    setLoading(true);
    api
      .getTransaction(transactionId)
      .then((res) => setTransaction(res.transaction))
      .catch((err: any) => notifications.show({ color: "red", message: err.message }))
      .finally(() => setLoading(false));
  }, [opened, transactionId]);

  function confirmRemoveWhole() {
    if (!transaction) return;
    modals.openConfirmModal({
      title: "Remove this payment?",
      children: (
        <Text size="sm">
          This unmarks all {transaction.entries.length} covered periods and deletes the shared
          attachment(s). This cannot be undone.
        </Text>
      ),
      labels: { confirm: "Remove", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await api.deleteTransaction(transaction.id);
          notifications.show({ color: "green", message: "Payment removed" });
          onChanged();
          onClose();
        } catch (err: any) {
          notifications.show({ color: "red", message: err.message });
        }
      },
    });
  }

  async function removeOnePeriod(entryId: number) {
    try {
      await api.deleteEntry(entryId);
    } catch (err: any) {
      notifications.show({ color: "red", message: err.message });
      return;
    }
    onChanged();
    try {
      const res = await api.getTransaction(transactionId!);
      setTransaction(res.transaction);
      notifications.show({ color: "green", message: "Period removed from this payment" });
    } catch {
      // No periods left — the backend already cleaned up the empty transaction.
      notifications.show({ color: "green", message: "Period removed" });
      onClose();
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title={`${typeName} — payment details`}>
      {loading || !transaction ? (
        <Center py="lg">
          <Loader size="sm" />
        </Center>
      ) : (
        <Stack>
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              Amount per period
            </Text>
            <Text fw={700}>{transaction.amount != null ? money(transaction.amount) : "—"}</Text>
          </Group>
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              Status
            </Text>
            <Badge color={transaction.status === "PAID" ? "green" : "orange"} variant="light">
              {transaction.status === "PAID" ? "Paid" : "Partially paid"}
            </Badge>
          </Group>
          {transaction.paidOn && (
            <Group justify="space-between">
              <Text size="sm" c="dimmed">
                Paid on
              </Text>
              <Text size="sm">{new Date(transaction.paidOn).toLocaleDateString()}</Text>
            </Group>
          )}
          {transaction.note && (
            <Group justify="space-between" align="flex-start">
              <Text size="sm" c="dimmed">
                Note
              </Text>
              <Text size="sm" ta="right" style={{ maxWidth: "70%" }}>
                {transaction.note}
              </Text>
            </Group>
          )}

          <Divider
            label={
              <Group gap={4}>
                <IconCalendarStats size={14} />
                <span>{transaction.entries.length} periods covered</span>
              </Group>
            }
            labelPosition="center"
          />

          <List spacing={4} size="sm">
            {transaction.entries.map((e) => (
              <List.Item key={e.id}>
                <Group justify="space-between">
                  <Text size="sm">{formatPeriodLabel(e.periodDate, frequency, e.periodKey)}</Text>
                  <Group gap={6}>
                    {e.status === "PARTIAL" && (
                      <Badge size="xs" color="orange" variant="light">
                        partial
                      </Badge>
                    )}
                    <Anchor
                      component="button"
                      type="button"
                      size="xs"
                      c="red"
                      onClick={() => removeOnePeriod(e.id)}
                    >
                      remove
                    </Anchor>
                  </Group>
                </Group>
              </List.Item>
            ))}
          </List>

          {transaction.attachments.length > 0 && (
            <>
              <Divider label="Attachments" labelPosition="center" />
              <Stack gap={4}>
                {transaction.attachments.map((a) => (
                  <Anchor key={a.id} href={api.attachmentUrl(a.id)} target="_blank" size="sm">
                    <Group gap={6}>
                      <IconFile size={14} />
                      {a.filename}
                    </Group>
                  </Anchor>
                ))}
              </Stack>
            </>
          )}

          <Group justify="space-between" mt="sm">
            <Button variant="subtle" color="red" onClick={confirmRemoveWhole}>
              Remove entire payment
            </Button>
            <Button variant="default" onClick={onClose}>
              Close
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
