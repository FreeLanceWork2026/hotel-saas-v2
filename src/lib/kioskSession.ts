// SERVER-SIDE ONLY — signed, httpOnly cookie that remembers which employee unlocked the kiosk by PIN.
// Payload is signed (HMAC-SHA256) so it can't be forged or edited client-side.
import crypto from "crypto";

export const KIOSK_COOKIE = "nl_kiosk";
export const KIOSK_SESSION_HOURS = 12;

export interface KioskSessionPayload {
  /** employees.id */
  eid: string;
  /** unix seconds */
  exp: number;
}

function secret(): string {
  // Dedicated secret if provided, else fall back to the server-only service key
  return process.env.KIOSK_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "dev-only-secret";
}

const b64 = (s: string | Buffer) => Buffer.from(s).toString("base64url");

function sign(data: string): string {
  return crypto.createHmac("sha256", secret()).update(data).digest("base64url");
}

export function createKioskToken(employeeId: string): string {
  const payload: KioskSessionPayload = {
    eid: employeeId,
    exp: Math.floor(Date.now() / 1000) + KIOSK_SESSION_HOURS * 3600,
  };
  const body = b64(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

export function readKioskToken(token: string | undefined | null): KioskSessionPayload | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;

  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as KioskSessionPayload;
    if (!payload.eid || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
