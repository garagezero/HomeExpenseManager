import { Dropzone } from "@mantine/dropzone";
import { Group, Text, ActionIcon, Stack } from "@mantine/core";
import { IconUpload, IconX, IconFile } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";

const MAX_SIZE = 25 * 1024 * 1024; // matches backend maxUploadBytes

interface Props {
  value: File[];
  onChange: (files: File[]) => void;
  label?: string;
  description?: string;
  multiple?: boolean;
  accept?: string[];
  dropText?: string;
}

// Click-to-browse + drag-and-drop file picker. Replaces Mantine's FileInput,
// whose hidden <input> occasionally stopped responding to clicks inside modals.
export default function AttachmentPicker({
  value,
  onChange,
  label,
  description,
  multiple = true,
  accept,
  dropText = "Drag files here or click to choose",
}: Props) {
  function addFiles(newFiles: File[]) {
    onChange(multiple ? [...value, ...newFiles] : newFiles.slice(0, 1));
  }
  function removeFile(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }

  return (
    <Stack gap={6}>
      {label && (
        <Text size="sm" fw={500}>
          {label}
        </Text>
      )}
      {description && (
        <Text size="xs" c="dimmed" mt={-4}>
          {description}
        </Text>
      )}

      <Dropzone
        onDrop={addFiles}
        onReject={() =>
          notifications.show({ color: "red", message: "One or more files were rejected (too large or wrong type)" })
        }
        maxSize={MAX_SIZE}
        accept={accept}
        multiple={multiple}
      >
        <Group justify="center" gap="sm" py="md" style={{ pointerEvents: "none" }}>
          <IconUpload size={22} stroke={1.5} />
          <div>
            <Text size="sm" inline>
              {dropText}
            </Text>
            <Text size="xs" c="dimmed" inline mt={4}>
              {multiple ? "Receipts, checks, images or PDFs" : "Click or drop a single file"}
            </Text>
          </div>
        </Group>
      </Dropzone>

      {value.length > 0 && (
        <Stack gap={4}>
          {value.map((f, i) => (
            <Group key={`${f.name}-${i}`} justify="space-between" wrap="nowrap">
              <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
                <IconFile size={14} />
                <Text size="sm" truncate>
                  {f.name}
                </Text>
              </Group>
              <ActionIcon size="sm" variant="subtle" color="red" onClick={() => removeFile(i)}>
                <IconX size={14} />
              </ActionIcon>
            </Group>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
