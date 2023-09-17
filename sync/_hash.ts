import { path } from "./deps.ts";

const encoder = new TextEncoder();

export async function hash(string: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        encoder.encode(path.normalize(string)),
      ),
    ),
  ).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
