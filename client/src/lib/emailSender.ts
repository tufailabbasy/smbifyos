export type SmtpProviderPreset = {
  id: string;
  label: string;
  host: string;
  port: number;
  secure: boolean;
};

export const smtpProviderPresets: SmtpProviderPreset[] = [
  { id: "gmail", label: "Gmail", host: "smtp.gmail.com", port: 587, secure: false },
  { id: "outlook", label: "Outlook", host: "smtp.office365.com", port: 587, secure: false },
  { id: "yahoo", label: "Yahoo", host: "smtp.mail.yahoo.com", port: 465, secure: true },
  { id: "sendgrid", label: "SendGrid", host: "smtp.sendgrid.net", port: 587, secure: false },
  { id: "mailgun", label: "Mailgun", host: "smtp.mailgun.org", port: 587, secure: false },
  { id: "amazon-ses", label: "Amazon SES", host: "email-smtp.us-east-1.amazonaws.com", port: 587, secure: false },
  { id: "custom", label: "Custom", host: "", port: 587, secure: true },
];

const SPAM_KEYWORDS = [
  "free",
  "guaranteed",
  "click here",
  "urgent",
  "act now",
  "winner",
  "congratulations",
  "no obligation",
  "risk free",
  "limited time",
  "exclusive deal",
  "buy now",
  "order now",
  "don't miss",
  "100%",
  "discount",
  "earn money",
  "fast cash",
  "special promotion",
  "while supplies last",
];

export function analyzeEmailSpamRisk(subject: string, body: string): {
  level: "low" | "medium" | "high";
  keywords: string[];
} {
  const text = `${subject} ${body}`.toLowerCase();
  const found = Array.from(
    new Set(
      SPAM_KEYWORDS.filter((keyword) => text.includes(keyword.toLowerCase()))
    )
  );

  if (found.length === 0) {
    return { level: "low", keywords: [] };
  }

  if (found.length <= 2) {
    return { level: "medium", keywords: found };
  }

  return { level: "high", keywords: found };
}