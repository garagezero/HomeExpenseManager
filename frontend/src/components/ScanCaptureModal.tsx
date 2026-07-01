import { useRef, useState } from "react";
import {
  Modal,
  Stack,
  Group,
  Button,
  Text,
  SegmentedControl,
  Center,
  Loader,
} from "@mantine/core";
import { IconCamera } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { detectDocumentCorners, EnhanceMode, loadCv, Point, warpAndEnhance } from "../documentScan";

interface Props {
  opened: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
}

type Phase = "capture" | "detecting" | "adjust" | "processing";

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export default function ScanCaptureModal({ opened, onClose, onCapture }: Props) {
  const [phase, setPhase] = useState<Phase>("capture");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [corners, setCorners] = useState<[Point, Point, Point, Point] | null>(null);
  const [enhanceMode, setEnhanceMode] = useState<EnhanceMode>("color");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const cvRef = useRef<any>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function reset() {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setPhase("capture");
    setImageUrl(null);
    setCorners(null);
    setDragIndex(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function triggerCamera() {
    fileInputRef.current?.click();
  }

  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (imageUrl) URL.revokeObjectURL(imageUrl);
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    setPhase("detecting");

    const img = new Image();
    img.onload = async () => {
      imgRef.current = img;
      const full: [Point, Point, Point, Point] = [
        { x: 0, y: 0 },
        { x: img.naturalWidth, y: 0 },
        { x: img.naturalWidth, y: img.naturalHeight },
        { x: 0, y: img.naturalHeight },
      ];
      try {
        const cv = await loadCv();
        cvRef.current = cv;
        const detected = detectDocumentCorners(cv, img);
        setCorners(detected ?? full);
      } catch {
        cvRef.current = null;
        notifications.show({
          color: "yellow",
          message: "Couldn't load the auto-crop tool — attaching the photo as-is.",
        });
        onCapture(file);
        handleClose();
        return;
      }
      setPhase("adjust");
    };
    img.src = url;
  }

  function pointFromEvent(e: React.PointerEvent): Point | null {
    const img = imgRef.current;
    const svg = svgRef.current;
    if (!img || !svg) return null;
    // Always measure the SVG root, regardless of which nested element (e.g.
    // a corner handle) the event bubbled from — its box matches the <img>.
    const rect = svg.getBoundingClientRect();
    const scaleX = img.naturalWidth / rect.width;
    const scaleY = img.naturalHeight / rect.height;
    return {
      x: clamp((e.clientX - rect.left) * scaleX, 0, img.naturalWidth),
      y: clamp((e.clientY - rect.top) * scaleY, 0, img.naturalHeight),
    };
  }

  function handlePointerDown(index: number, e: React.PointerEvent) {
    (e.target as Element).setPointerCapture(e.pointerId);
    setDragIndex(index);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (dragIndex === null) return;
    const p = pointFromEvent(e);
    if (!p) return;
    setCorners((prev) => {
      if (!prev) return prev;
      const next = [...prev] as [Point, Point, Point, Point];
      next[dragIndex] = p;
      return next;
    });
  }

  function handlePointerUp() {
    setDragIndex(null);
  }

  async function confirm() {
    if (!imgRef.current || !corners || !cvRef.current) return;
    setPhase("processing");
    try {
      const canvas = warpAndEnhance(cvRef.current, imgRef.current, corners, enhanceMode);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            notifications.show({ color: "red", message: "Could not process the photo" });
            setPhase("adjust");
            return;
          }
          const file = new File([blob], `scan-${Date.now()}.jpg`, { type: "image/jpeg" });
          onCapture(file);
          handleClose();
        },
        "image/jpeg",
        0.92
      );
    } catch (err: any) {
      notifications.show({ color: "red", message: err.message || "Could not process the photo" });
      setPhase("adjust");
    }
  }

  const naturalW = imgRef.current?.naturalWidth ?? 1;
  const naturalH = imgRef.current?.naturalHeight ?? 1;
  const handleRadius = naturalW * 0.018;

  return (
    <Modal opened={opened} onClose={handleClose} title="Scan a document" size="lg" centered>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={onFileSelected}
      />

      {phase === "capture" && (
        <Stack align="center" py="xl" gap="md">
          <IconCamera size={48} opacity={0.5} />
          <Text c="dimmed" ta="center" size="sm">
            Opens your camera on a phone, or a file picker on desktop.
          </Text>
          <Button leftSection={<IconCamera size={16} />} onClick={triggerCamera}>
            Take photo
          </Button>
        </Stack>
      )}

      {phase === "detecting" && (
        <Center py="xl">
          <Stack align="center" gap="sm">
            <Loader />
            <Text size="sm" c="dimmed">
              Detecting document edges...
            </Text>
          </Stack>
        </Center>
      )}

      {phase === "adjust" && imageUrl && corners && (
        <Stack>
          <Text size="sm" c="dimmed">
            Drag the corners to match the document edges.
          </Text>
          <div style={{ position: "relative", lineHeight: 0 }}>
            <img
              src={imageUrl}
              alt="Captured document"
              style={{ width: "100%", height: "auto", display: "block", borderRadius: 8 }}
              draggable={false}
            />
            <svg
              ref={svgRef}
              viewBox={`0 0 ${naturalW} ${naturalH}`}
              preserveAspectRatio="none"
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                touchAction: "none",
              }}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            >
              <polygon
                points={corners.map((c) => `${c.x},${c.y}`).join(" ")}
                fill="rgba(34,139,230,0.25)"
                stroke="rgb(34,139,230)"
                strokeWidth={naturalW * 0.004}
              />
              {corners.map((c, i) => (
                <circle
                  key={i}
                  cx={c.x}
                  cy={c.y}
                  r={handleRadius}
                  fill="white"
                  stroke="rgb(34,139,230)"
                  strokeWidth={naturalW * 0.006}
                  onPointerDown={(e) => handlePointerDown(i, e)}
                  style={{ cursor: "grab" }}
                />
              ))}
            </svg>
          </div>

          <div>
            <Text size="sm" fw={500} mb={4}>
              Look
            </Text>
            <SegmentedControl
              fullWidth
              value={enhanceMode}
              onChange={(v) => setEnhanceMode(v as EnhanceMode)}
              data={[
                { label: "Original", value: "none" },
                { label: "Enhanced", value: "color" },
                { label: "B&W scan", value: "bw" },
              ]}
            />
          </div>

          <Group justify="space-between" mt="sm">
            <Button variant="default" onClick={triggerCamera}>
              Retake
            </Button>
            <Button onClick={confirm}>Use this photo</Button>
          </Group>
        </Stack>
      )}

      {phase === "processing" && (
        <Center py="xl">
          <Loader />
        </Center>
      )}
    </Modal>
  );
}
