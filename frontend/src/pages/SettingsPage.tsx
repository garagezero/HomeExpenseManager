import { useEffect, useState } from "react";
import {
  Title,
  Stack,
  Card,
  TextInput,
  Button,
  Group,
  Text,
  PasswordInput,
  Divider,
  Alert,
} from "@mantine/core";
import { IconDownload, IconAlertTriangle } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { modals } from "@mantine/modals";
import { api } from "../api";
import { useApp } from "../context";
import AttachmentPicker from "../components/AttachmentPicker";

export default function SettingsPage() {
  const { refreshSettings } = useApp();
  const [currency, setCurrency] = useState("");
  const [appName, setAppName] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [savingPw, setSavingPw] = useState(false);

  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    api.getSettings().then(({ settings }) => {
      setCurrency(settings.currency || "USD");
      setAppName(settings.appName || "Home Expense Manager");
    });
  }, []);

  async function saveSettings() {
    setSavingSettings(true);
    try {
      await api.updateSettings({ currency, appName });
      await refreshSettings();
      notifications.show({ color: "green", message: "Settings saved" });
    } catch (err: any) {
      notifications.show({ color: "red", message: err.message });
    } finally {
      setSavingSettings(false);
    }
  }

  async function changePassword() {
    setSavingPw(true);
    try {
      await api.changePassword(currentPw, newPw);
      setCurrentPw("");
      setNewPw("");
      notifications.show({ color: "green", message: "Password changed" });
    } catch (err: any) {
      notifications.show({ color: "red", message: err.message });
    } finally {
      setSavingPw(false);
    }
  }

  function runImport() {
    if (!importFile) return;
    modals.openConfirmModal({
      title: "Restore from backup?",
      children: (
        <Text size="sm">
          This <b>replaces all current data</b> (houses, payments, users, settings and
          attachments) with the contents of the backup. This cannot be undone.
        </Text>
      ),
      labels: { confirm: "Replace everything", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        setImporting(true);
        try {
          const fd = new FormData();
          fd.append("backup", importFile);
          const res = await api.importBackup(fd);
          notifications.show({ color: "green", message: res.message, autoClose: 6000 });
          setImportFile(null);
          // Data (and possibly the session) changed — reload the app.
          setTimeout(() => window.location.reload(), 1500);
        } catch (err: any) {
          notifications.show({ color: "red", message: err.message });
        } finally {
          setImporting(false);
        }
      },
    });
  }

  return (
    <Stack maw={640}>
      <Title order={2}>Settings</Title>

      <Card withBorder>
        <Text fw={500} mb="sm">
          General
        </Text>
        <Stack>
          <TextInput
            label="App name"
            value={appName}
            onChange={(e) => setAppName(e.currentTarget.value)}
          />
          <TextInput
            label="Currency code"
            description="ISO code such as USD, EUR, GBP, AZN"
            value={currency}
            onChange={(e) => setCurrency(e.currentTarget.value.toUpperCase())}
            maxLength={8}
          />
          <Group justify="flex-end">
            <Button onClick={saveSettings} loading={savingSettings}>
              Save
            </Button>
          </Group>
        </Stack>
      </Card>

      <Card withBorder>
        <Text fw={500} mb="sm">
          Change my password
        </Text>
        <Stack>
          <PasswordInput
            label="Current password"
            value={currentPw}
            onChange={(e) => setCurrentPw(e.currentTarget.value)}
          />
          <PasswordInput
            label="New password"
            value={newPw}
            onChange={(e) => setNewPw(e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button
              variant="light"
              onClick={changePassword}
              loading={savingPw}
              disabled={!currentPw || newPw.length < 4}
            >
              Change password
            </Button>
          </Group>
        </Stack>
      </Card>

      <Card withBorder>
        <Text fw={500} mb="sm">
          Backup &amp; restore
        </Text>
        <Stack>
          <Text size="sm" c="dimmed">
            Export downloads a single .zip with all your data and attachments. Use it to move the
            app to another machine, then import it there.
          </Text>
          <Group>
            <Button
              component="a"
              href={api.exportUrl()}
              leftSection={<IconDownload size={16} />}
              variant="light"
            >
              Export backup
            </Button>
          </Group>

          <Divider my="xs" />

          <Alert color="yellow" icon={<IconAlertTriangle size={16} />} variant="light">
            Importing replaces everything currently in the app.
          </Alert>
          <AttachmentPicker
            label="Backup file (.zip)"
            dropText="Drag a .zip backup here or click to choose"
            multiple={false}
            accept={["application/zip", "application/x-zip-compressed"]}
            allowScan={false}
            value={importFile ? [importFile] : []}
            onChange={(files) => setImportFile(files[0] ?? null)}
          />
          <Group justify="flex-end">
            <Button color="red" onClick={runImport} loading={importing} disabled={!importFile}>
              Restore from backup
            </Button>
          </Group>
        </Stack>
      </Card>
    </Stack>
  );
}
