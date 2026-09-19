import crypto from "node:crypto";

function getEncryptionKey(): Buffer {
  const rawKey = process.env.TOKEN_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!rawKey && process.env.NODE_ENV === "production") throw new Error("TOKEN_ENCRYPTION_KEY or JWT_SECRET is required in production");
  const effectiveKey = rawKey || "development-only-smbify-key";
  return crypto.createHash("sha256").update(effectiveKey).digest();
}

/**
 * Encrypts sensitive credentials (SMTP passwords, AI API keys, OAuth secrets) at rest using AES-256-GCM.
 * Format: enc:v1:<iv_hex>:<authTag_hex>:<ciphertext_hex>
 */
export function encryptCredential(plaintext: string | null | undefined): string {
  if (!plaintext || typeof plaintext !== "string" || !plaintext.trim()) {
    return "";
  }

  // Already encrypted?
  if (plaintext.startsWith("enc:v1:")) {
    return plaintext;
  }

  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    
    let encrypted = cipher.update(plaintext, "utf8", "hex");
    encrypted += cipher.final("hex");
    
    const authTag = cipher.getAuthTag().toString("hex");
    return `enc:v1:${iv.toString("hex")}:${authTag}:${encrypted}`;
  } catch (err) {
    console.error("[encryption] Failed to encrypt credential:", err);
    return plaintext;
  }
}

/**
 * Decrypts sensitive credentials from the database.
 * If data is unencrypted (legacy format), returns it transparently.
 */
export function decryptCredential(ciphertext: string | null | undefined): string {
  if (!ciphertext || typeof ciphertext !== "string" || !ciphertext.trim()) {
    return "";
  }

  // If not encrypted with enc:v1 prefix, it's legacy plaintext
  if (!ciphertext.startsWith("enc:v1:")) {
    return ciphertext;
  }

  try {
    const parts = ciphertext.split(":");
    // Expected: ["enc", "v1", ivHex, authTagHex, encryptedHex]
    if (parts.length < 5) {
      return ciphertext;
    }

    const ivHex = parts[2];
    const authTagHex = parts[3];
    const encryptedHex = parts.slice(4).join(":");

    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");

    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (err) {
    console.error("[encryption] Failed to decrypt credential at rest:", err);
    return "";
  }
}

/**
 * Helper to mask sensitive keys for client display (e.g. sk-proj...1a2b)
 */
export function maskSecret(secret: string | null | undefined): string {
  if (!secret) return "";
  const decrypted = decryptCredential(secret);
  if (!decrypted) return "";
  if (decrypted.length <= 8) return "••••••••";
  return `${decrypted.slice(0, 4)}••••${decrypted.slice(-4)}`;
}

