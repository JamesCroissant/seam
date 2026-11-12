/**
 * A one-time cookie that carries an action's return value across the 303 redirect
 * (no-JS form posts only). It is read and deleted on the next GET.
 */
export interface Flash {
  id: string;
  value: unknown;
  /** React's $ACTION_KEY when the form came from useActionState. */
  key?: string;
  bound?: number;
}

export const FLASH_COOKIE = "__seam_flash";
const MAX_COOKIE_VALUE = 3800;

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): string {
  const bin = atob(s.replaceAll("-", "+").replaceAll("_", "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function serializeFlash(flash: Flash): string | null {
  let json: string;
  try {
    json = JSON.stringify(flash);
  } catch {
    console.warn(`[seam] action ${flash.id} returned a value that is not JSON; it is not kept across the redirect.`);
    return null;
  }
  const value = toBase64Url(json);
  if (value.length > MAX_COOKIE_VALUE) {
    console.warn(`[seam] action ${flash.id} returned a value too large for the flash cookie (${value.length} bytes); dropped.`);
    return null;
  }
  return `${FLASH_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=60`;
}

export function readFlash(request: Request): Flash | null {
  const cookie = request.headers.get("Cookie");
  if (!cookie) return null;
  for (const part of cookie.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k !== FLASH_COOKIE) continue;
    try {
      const f = JSON.parse(fromBase64Url(rest.join("=")));
      return typeof f?.id === "string" ? (f as Flash) : null;
    } catch {
      return null;
    }
  }
  return null;
}

export const CLEAR_FLASH = `${FLASH_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
