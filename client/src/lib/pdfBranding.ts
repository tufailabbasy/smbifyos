import type { jsPDF } from "jspdf";
import { API_BASE_URL } from "./api";

export type PdfBranding = {
  agencyName: string;
  logoDataUrl: string;
};

const DEFAULT_BRANDING: PdfBranding = {
  agencyName: "SMBify OS",
  logoDataUrl: "",
};

let brandingCache: PdfBranding | null = null;
let brandingPromise: Promise<PdfBranding> | null = null;

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function resolveLogoUrl(value: string): string {
  const logoUrl = cleanText(value);
  if (!logoUrl) {
    return "";
  }

  // Already a data URL (base64-encoded image stored in DB)
  if (/^data:/i.test(logoUrl)) {
    return logoUrl;
  }

  if (/^https?:\/\//i.test(logoUrl)) {
    return logoUrl;
  }

  return `${API_BASE_URL}${logoUrl.startsWith("/") ? "" : "/"}${logoUrl}`;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to convert logo image"));
    reader.readAsDataURL(blob);
  });
}

async function fetchPdfBranding(): Promise<PdfBranding> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/settings`);
    if (!response.ok) {
      return { ...DEFAULT_BRANDING };
    }

    const payload = (await response.json()) as {
      profile?: { agencyName?: string; agencyLogoUrl?: string };
    };

    const agencyName = cleanText(payload?.profile?.agencyName) || DEFAULT_BRANDING.agencyName;
    const resolvedLogoUrl = resolveLogoUrl(payload?.profile?.agencyLogoUrl || "");
    if (!resolvedLogoUrl) {
      return {
        agencyName,
        logoDataUrl: "",
      };
    }

    // Already a data URL — no need to fetch
    if (/^data:image\//i.test(resolvedLogoUrl)) {
      return {
        agencyName,
        logoDataUrl: resolvedLogoUrl,
      };
    }

    const logoResponse = await fetch(resolvedLogoUrl);
    if (!logoResponse.ok) {
      return {
        agencyName,
        logoDataUrl: "",
      };
    }

    const blob = await logoResponse.blob();
    if (!blob.type.toLowerCase().startsWith("image/")) {
      return {
        agencyName,
        logoDataUrl: "",
      };
    }

    const logoDataUrl = await blobToDataUrl(blob);
    return {
      agencyName,
      logoDataUrl,
    };
  } catch {
    return { ...DEFAULT_BRANDING };
  }
}

export async function getPdfBranding(forceRefresh = false): Promise<PdfBranding> {
  if (!forceRefresh && brandingCache) {
    return brandingCache;
  }

  if (!forceRefresh && brandingPromise) {
    return brandingPromise;
  }

  brandingPromise = (async () => {
    const branding = await fetchPdfBranding();
    brandingCache = branding;
    return branding;
  })();

  try {
    return await brandingPromise;
  } finally {
    brandingPromise = null;
  }
}

export function drawFramedPdfLogo(
  doc: jsPDF,
  logoDataUrl: string,
  x: number,
  y: number,
  size = 34
): boolean {
  const safeLogo = cleanText(logoDataUrl);
  if (!safeLogo) {
    return false;
  }

  try {
    const radius = Math.max(5, Math.round(size * 0.2));

    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, y, size, size, radius, radius, "F");

    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.85);
    doc.roundedRect(x + 0.5, y + 0.5, size - 1, size - 1, radius, radius, "S");

    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.55);

    const innerPad = Math.max(2, Math.round(size * 0.07));
    const innerSize = size - innerPad * 2;
    const innerRadius = Math.max(3, radius - 1.5);
    doc.roundedRect(
      x + innerPad - 0.2,
      y + innerPad - 0.2,
      innerSize + 0.4,
      innerSize + 0.4,
      innerRadius,
      innerRadius,
      "S"
    );

    const imageFormat =
      safeLogo.startsWith("data:image/jpeg") || safeLogo.startsWith("data:image/jpg")
        ? "JPEG"
        : "PNG";
    const imagePad = Math.max(4, Math.round(size * 0.12));
    const imageSize = size - imagePad * 2;

    doc.addImage(safeLogo, imageFormat, x + imagePad, y + imagePad, imageSize, imageSize, undefined, "FAST");
    return true;
  } catch {
    return false;
  }
}