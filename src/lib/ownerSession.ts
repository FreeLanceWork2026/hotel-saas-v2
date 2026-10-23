// Platform-owner session — password check + signed session token.
// Pure Web Crypto (no Next imports) so it runs anywhere and is unit-testable.
//
// The password lives only in the PLATFORM_OWNER_PASSWORD env var (Cloudflare secret),
// never in the database, so a client's admin cannot read or reset it.
// The signing key is derived from the password: changing it logs out every session.

export const OWNER_COOKIE = "pf_owner";
export const OWNER_SESSION_SECONDS = 12 * 60 * 60;
export const MIN_PASSWORD_LENGTH = 12;

const enc = new TextEncoder();

/** The configured password, or null when missing / too short (panel stays locked). */
export function configuredPassword(raw: string | undefined): string | null {
  return raw && raw.length >= MIN_PASSWORD_LENGTH ? raw : null;
}

async function sha256(text: string): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(text)));
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Constant-time comparison (hashing first hides the length of the real password). */
export async function passwordMatches(input: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([sha256(input), sha256(expected)]);
  return sameBytes(a, b);
}

async function sign(payload: string, password: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    await sha256(`platform-session:${password}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(payload)));
  return Buffer.from(sig).toString("base64url");
}

/** Token format: `<expiresAtSeconds>.<hmac>` */
export async function createOwnerToken(password: string, nowMs = Date.now()): Promise<string> {
  const exp = Math.floor(nowMs / 1000) + OWNER_SESSION_SECONDS;
  return `${exp}.${await sign(String(exp), password)}`;
}

export async function verifyOwnerToken(
  token: string | undefined,
  password: string | null,
  nowMs = Date.now()
): Promise<boolean> {
  if (!token || !password) return false;
  const [expStr, sig, extra] = token.split(".");
  if (!expStr || !sig || extra !== undefined || !/^\d+$/.test(expStr)) return false;
  if (Number(expStr) * 1000 <= nowMs) return false;
  const expected = await sign(expStr, password);
  return sameBytes(enc.encode(sig), enc.encode(expected));
}
