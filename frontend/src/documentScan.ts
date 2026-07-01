// Document edge detection + perspective crop + enhance, built on OpenCV.js
// (bundled locally via @techstark/opencv-js — no CDN, works fully offline).
//
// Detection runs once on a single captured still photo (not a live video
// stream), so it needs no camera API access and works fine over plain HTTP.

export interface Point {
  x: number;
  y: number;
}

let cvPromise: Promise<any> | null = null;

// @techstark/opencv-js has shipped slightly different init shapes across
// versions (a ready object, a Promise, or one needing onRuntimeInitialized).
// Handle all three, with a timeout so the UI can fall back gracefully.
export function loadCv(): Promise<any> {
  if (cvPromise) return cvPromise;
  cvPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out loading the scanner")), 20000);
    import("@techstark/opencv-js")
      .then(async (mod: any) => {
        const cv = mod.default ?? mod;
        if (typeof cv?.then === "function") {
          const resolved = await cv;
          clearTimeout(timeout);
          resolve(resolved);
          return;
        }
        if (cv?.Mat) {
          clearTimeout(timeout);
          resolve(cv);
          return;
        }
        cv.onRuntimeInitialized = () => {
          clearTimeout(timeout);
          resolve(cv);
        };
      })
      .catch((err) => {
        clearTimeout(timeout);
        reject(err);
      });
  });
  return cvPromise;
}

function orderCorners(pts: Point[]): [Point, Point, Point, Point] {
  const bySum = [...pts].sort((a, b) => a.x + a.y - (b.x + b.y));
  const tl = bySum[0];
  const br = bySum[3];
  const byDiff = [...pts].sort((a, b) => a.x - a.y - (b.x - b.y));
  const bl = byDiff[0];
  const tr = byDiff[3];
  return [tl, tr, br, bl];
}

// Finds the largest convex quadrilateral in the image (assumed to be the
// document). Returns null if nothing confident is found, so callers can
// fall back to the full image bounds.
export function detectDocumentCorners(
  cv: any,
  img: HTMLImageElement
): [Point, Point, Point, Point] | null {
  const src = cv.imread(img);
  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const edges = new cv.Mat();
  const kernel = cv.Mat.ones(3, 3, cv.CV_8U);
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  let best: Point[] | null = null;
  let bestArea = 0;

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    cv.Canny(blurred, edges, 50, 150);
    cv.dilate(edges, edges, kernel);
    cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    const imageArea = img.naturalWidth * img.naturalHeight;
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);
      if (area < imageArea * 0.15) {
        contour.delete();
        continue;
      }
      const approx = new cv.Mat();
      cv.approxPolyDP(contour, approx, 0.02 * cv.arcLength(contour, true), true);
      if (approx.rows === 4 && cv.isContourConvex(approx) && area > bestArea) {
        bestArea = area;
        best = [];
        for (let r = 0; r < 4; r++) {
          best.push({ x: approx.data32S[r * 2], y: approx.data32S[r * 2 + 1] });
        }
      }
      approx.delete();
      contour.delete();
    }
  } finally {
    src.delete();
    gray.delete();
    blurred.delete();
    edges.delete();
    kernel.delete();
    contours.delete();
    hierarchy.delete();
  }

  return best ? orderCorners(best) : null;
}

export type EnhanceMode = "none" | "color" | "bw";

// Perspective-corrects the image to the given quad, applies the chosen
// enhancement, and returns the result as a canvas.
export function warpAndEnhance(
  cv: any,
  img: HTMLImageElement,
  corners: [Point, Point, Point, Point],
  mode: EnhanceMode
): HTMLCanvasElement {
  const [tl, tr, br, bl] = corners;
  const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
  const width = Math.round(Math.max(dist(tl, tr), dist(bl, br)));
  const height = Math.round(Math.max(dist(tl, bl), dist(tr, br)));

  const src = cv.imread(img);
  const dst = new cv.Mat();
  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y,
  ]);
  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0, 0, width, 0, width, height, 0, height,
  ]);
  const M = cv.getPerspectiveTransform(srcTri, dstTri);

  const outCanvas = document.createElement("canvas");
  try {
    cv.warpPerspective(src, dst, M, new cv.Size(width, height));

    if (mode === "bw") {
      const gray = new cv.Mat();
      const thresh = new cv.Mat();
      cv.cvtColor(dst, gray, cv.COLOR_RGBA2GRAY);
      cv.adaptiveThreshold(
        gray,
        thresh,
        255,
        cv.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv.THRESH_BINARY,
        25,
        15
      );
      cv.cvtColor(thresh, dst, cv.COLOR_GRAY2RGBA);
      gray.delete();
      thresh.delete();
    } else if (mode === "color") {
      dst.convertTo(dst, -1, 1.15, 12); // mild contrast + brightness lift
    }

    cv.imshow(outCanvas, dst);
  } finally {
    src.delete();
    dst.delete();
    srcTri.delete();
    dstTri.delete();
    M.delete();
  }

  return outCanvas;
}
