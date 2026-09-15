/**
 * Export utilities — CSV, JSON, PNG, and text downloads.
 * Everything is client-side; the data is already in memory.
 */

// ── Download primitives ───────────────────────────────────

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a tick to start the download before revoking
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(
  text: string,
  filename: string,
  mime = "text/plain",
): void {
  downloadBlob(new Blob([text], { type: `${mime};charset=utf-8` }), filename);
}

// ── CSV ───────────────────────────────────────────────────

/**
 * RFC 4180-compliant CSV escaping.
 *  - Values containing comma, quote, CR, or LF are wrapped in double quotes
 *  - Embedded double quotes are doubled
 *  - null / undefined become empty strings
 *  - Dates become ISO strings
 */
function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s: string;
  if (v instanceof Date) {
    s = v.toISOString();
  } else if (typeof v === "object") {
    try {
      s = JSON.stringify(v);
    } catch {
      s = String(v);
    }
  } else {
    s = String(v);
  }
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCSV(
  rows: Record<string, unknown>[],
  columns?: string[],
): string {
  if (!rows.length) return "";
  const cols = columns && columns.length > 0 ? columns : Object.keys(rows[0]);

  const header = cols.map(csvEscape).join(",");
  const lines = rows.map((r) => cols.map((c) => csvEscape(r[c])).join(","));
  return [header, ...lines].join("\r\n") + "\r\n";
}

export function exportCSV(
  rows: Record<string, unknown>[],
  filename: string,
  columns?: string[],
): void {
  const csv = toCSV(rows, columns);
  downloadText(csv, filename, "text/csv");
}

// ── JSON ──────────────────────────────────────────────────

export function exportJSON(data: unknown, filename: string): void {
  const json = JSON.stringify(data, null, 2);
  downloadText(json, filename, "application/json");
}

// ── SVG → PNG ─────────────────────────────────────────────

/**
 * Convert an inline SVG element to a downloadable PNG.
 *
 * Recharts renders SVG; we serialize it, paint it onto a canvas with the
 * app's background color, and export as PNG. Works entirely in the browser
 * (no external libs).
 */
export async function exportSVGAsPNG(
  svg: SVGSVGElement,
  filename: string,
  opts?: { scale?: number; background?: string },
): Promise<void> {
  const scale = opts?.scale ?? 2;
  const bg = opts?.background ?? "#0B1020";

  // Read the SVG's intrinsic size
  const rect = svg.getBoundingClientRect();
  const width = rect.width || 800;
  const height = rect.height || 400;

  // Ensure the serialized SVG has explicit width/height + viewBox
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  if (!clone.getAttribute("viewBox")) {
    clone.setAttribute("viewBox", `0 0 ${width} ${height}`);
  }

  const serializer = new XMLSerializer();
  const svgStr = serializer.serializeToString(clone);

  const svgBlob = new Blob([svgStr], {
    type: "image/svg+xml;charset=utf-8",
  });
  const url = URL.createObjectURL(svgBlob);

  try {
    const img = await loadImage(url);

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");

    // Solid background first — PNG without it is transparent, which looks
    // broken on light viewers
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, width, height);

    await new Promise<void>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error("toBlob failed"));
          downloadBlob(blob, filename);
          resolve();
        },
        "image/png",
        0.95,
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load SVG as image"));
    img.src = src;
  });
}

// ── Filenames ─────────────────────────────────────────────

/**
 * Sanitize a string into something safe for a filename.
 * Keeps letters, numbers, dash, underscore, and dot.
 */
export function safeFilename(base: string, ext: string): string {
  const cleaned = base
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 60);
  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .slice(0, 19);
  return `${cleaned || "export"}_${stamp}.${ext}`;
}