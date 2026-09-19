function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

export function looksLikeHtml(value: unknown): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(cleanText(value));
}

export function htmlToPlainText(value: unknown): string {
  const raw = String(value ?? "");
  if (!raw.trim()) {
    return "";
  }

  const withBreaks = raw
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*\/\s*(p|div|h1|h2|h3|h4|h5|h6|blockquote|tr|table)\s*>/gi, "\n\n")
    .replace(/<\s*li[^>]*>/gi, "- ")
    .replace(/<\s*\/\s*li\s*>/gi, "\n")
    .replace(/<\s*\/\s*(ul|ol)\s*>/gi, "\n");

  return decodeEntities(withBreaks.replace(/<[^>]+>/g, " "))
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function plainTextToEmailHtml(value: unknown): string {
  const text = cleanText(value);
  if (!text) {
    return "";
  }

  const paragraphs = text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => {
      const lines = paragraph.split("\n").map((line) => line.trim()).filter(Boolean);
      const rendered = lines
        .map((line) => (line.startsWith("- ") ? `&#8226; ${escapeHtml(line.slice(2))}` : escapeHtml(line)))
        .join("<br />");

      return `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#0f172a;">${rendered}</p>`;
    })
    .join("");

  return [
    '<div style="margin:0;padding:32px 18px;background:#eef6f7;font-family:Arial,Helvetica,sans-serif;">',
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;margin:0 auto;border-collapse:collapse;">',
    '<tr><td style="padding:0;">',
    '<div style="overflow:hidden;border:1px solid #d7e4e7;border-radius:22px;background:#ffffff;box-shadow:0 18px 48px rgba(15,23,42,0.08);">',
    '<div style="padding:22px 28px;background:linear-gradient(135deg,#0f172a 0%,#0f766e 100%);">',
    '<div style="font-size:11px;letter-spacing:0.22em;text-transform:uppercase;font-weight:700;color:#99f6e4;">SMBify OS</div>',
    '<div style="margin-top:10px;font-size:24px;line-height:1.3;font-weight:700;color:#ffffff;">Local outreach message</div>',
    '</div>',
    '<div style="padding:28px 28px 12px;">',
    paragraphs,
    '<div style="margin-top:18px;padding:14px 16px;border-radius:16px;background:#f8fafc;font-size:12px;line-height:1.6;color:#475569;">',
    'This email was prepared from your saved SMBify OS campaign template. Reply directly if you want to continue the conversation.',
    '</div>',
    '</div>',
    '</div>',
    '</td></tr></table></div>',
  ].join("");
}

export function normalizeHtmlTemplate(htmlValue: unknown, plainTextFallback: unknown): string {
  const html = cleanText(htmlValue);
  if (looksLikeHtml(html)) {
    return html;
  }

  if (html) {
    return plainTextToEmailHtml(html);
  }

  return plainTextToEmailHtml(plainTextFallback);
}