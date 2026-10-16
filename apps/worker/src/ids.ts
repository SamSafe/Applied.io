import { ulid } from "ulid";

/** Sortable unique id for domain rows. */
export function newId(): string {
  return ulid();
}

const TOKEN_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Local part of a forwarding address, e.g. `u_7f3k9q2m4x`. Unbiased, 10 random characters. */
export function newAddressToken(): string {
  const out: string[] = [];
  const buf = new Uint8Array(32);
  while (out.length < 10) {
    crypto.getRandomValues(buf);
    for (const b of buf) {
      // 252 is the largest multiple of 36 below 256; rejecting above it avoids modulo bias.
      if (b < 252 && out.length < 10) out.push(TOKEN_ALPHABET[b % 36] as string);
    }
  }
  return `u_${out.join("")}`;
}
