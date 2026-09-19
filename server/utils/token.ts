import crypto from "node:crypto";

let ephemeralSecret = "";

function getJwtSecret(): string {
  if (process.env.JWT_SECRET && process.env.JWT_SECRET !== "smbify_super_secret_saas_key_2026" && process.env.JWT_SECRET !== "your_super_secret_jwt_key_2026") {
    return process.env.JWT_SECRET;
  }
  if (!ephemeralSecret) {
    ephemeralSecret = crypto.randomBytes(32).toString("hex");
    if (process.env.NODE_ENV === "production") {
      console.error("[SECURITY FATAL] JWT_SECRET environment variable is not configured in production!");
    } else {
      console.warn("[SECURITY WARNING] JWT_SECRET not set in .env. Using generated ephemeral random secret for this session.");
    }
  }
  return ephemeralSecret;
}

function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(base64Url: string): string {
  let base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  return Buffer.from(base64, "base64").toString("utf8");
}

export interface TokenPayload {
  userId: string;
  tenantId: string;
  email: string;
  role: string;
  name: string;
  exp: number;
  version?: number;
}

export function generateToken(payload: Omit<TokenPayload, "exp"> & { expiresInDays?: number }): string {
  const header = { alg: "HS256", typ: "JWT" };
  const expiresInDays = payload.expiresInDays || 7;
  const exp = Math.floor(Date.now() / 1000) + expiresInDays * 24 * 60 * 60;
  
  const tokenPayload: TokenPayload = {
    userId: payload.userId,
    tenantId: payload.tenantId,
    email: payload.email,
    role: payload.role,
    name: payload.name,
    exp,
    version: 2,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(tokenPayload));
  
  const signatureInput = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto
    .createHmac("sha256", getJwtSecret())
    .update(signatureInput)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, signature] = parts;
    const signatureInput = `${encodedHeader}.${encodedPayload}`;
    
    const expectedSignature = crypto
      .createHmac("sha256", getJwtSecret())
      .update(signatureInput)
      .digest("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

    if (signature.length !== expectedSignature.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      return null;
    }

    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as TokenPayload;
    if (payload.version !== 2 || !Number.isFinite(payload.exp) || payload.exp < Date.now() / 1000 || !/^[a-zA-Z0-9_-]+$/.test(payload.tenantId) || !payload.userId) {
      return null; // Expired
    }

    return payload;
  } catch (error) {
    return null;
  }
}
