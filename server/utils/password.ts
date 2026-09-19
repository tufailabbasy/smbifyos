import crypto from "node:crypto";

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const iterations = 100000;
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 64, "sha512").toString("hex");
  return `v2:${iterations}:${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHashRecord: string): boolean {
  try {
    const parts = storedHashRecord.split(":");
    const isV2 = parts[0] === "v2";
    const iterations = isV2 ? Number(parts[1]) : 1000;
    const salt = isV2 ? parts[2] : parts[0];
    const storedHash = isV2 ? parts[3] : parts[1];
    if (!salt || !storedHash || !Number.isFinite(iterations)) return false;
    const computed = crypto.pbkdf2Sync(password, salt, iterations, 64, "sha512").toString("hex");
    const actual = Buffer.from(computed, "hex");
    const expected = Buffer.from(storedHash, "hex");
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function validatePassword(password: unknown): string | null {
  if (typeof password !== "string" || password.length < 12) return "Password must be at least 12 characters long";
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return "Password must contain letters and numbers";
  return null;
}

export function generateTemporaryPassword(): string {
  return `${crypto.randomBytes(9).toString("base64url")}Aa7!`;
}
