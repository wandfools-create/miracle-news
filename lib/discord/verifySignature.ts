import { createPublicKey, verify } from "node:crypto";

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export function normalizeDiscordHex(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, "").replace(/\s+/g, "");
}

function isHex64(value: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(value);
}

function isHex128(value: string): boolean {
  return /^[0-9a-fA-F]{128}$/.test(value);
}

/** Discord Interaction request signature (Ed25519). */
export function verifyDiscordRequestSignature(input: {
  publicKeyHex: string;
  signatureHex: string;
  timestamp: string;
  body: string;
}): boolean {
  const publicKeyHex = normalizeDiscordHex(input.publicKeyHex);
  const signatureHex = normalizeDiscordHex(input.signatureHex);
  const { timestamp, body } = input;
  if (!isHex64(publicKeyHex) || !isHex128(signatureHex) || !timestamp) {
    return false;
  }
  if (body === undefined) return false;

  try {
    const publicKey = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(publicKeyHex, "hex")]),
      format: "der",
      type: "spki",
    });

    return verify(
      null,
      Buffer.from(timestamp + body, "utf8"),
      publicKey,
      Buffer.from(signatureHex, "hex")
    );
  } catch {
    return false;
  }
}

/**
 * Official Discord verification: Ed25519 over `timestamp + rawBody`.
 * Web Crypto first (same primitive as discord-interactions), Node crypto fallback.
 */
export async function verifyDiscordRequestSignatureAsync(input: {
  publicKeyHex: string;
  signatureHex: string;
  timestamp: string;
  body: string;
}): Promise<boolean> {
  const publicKeyHex = normalizeDiscordHex(input.publicKeyHex);
  const signatureHex = normalizeDiscordHex(input.signatureHex);
  const { timestamp, body } = input;
  if (!isHex64(publicKeyHex) || !isHex128(signatureHex) || !timestamp) {
    return false;
  }

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      Buffer.from(publicKeyHex, "hex"),
      { name: "Ed25519" },
      false,
      ["verify"]
    );
    const ok = await crypto.subtle.verify(
      { name: "Ed25519" },
      key,
      Buffer.from(signatureHex, "hex"),
      Buffer.from(timestamp + body, "utf8")
    );
    if (ok) return true;
  } catch {
    // Fall through to Node crypto (older runtimes without WebCrypto Ed25519).
  }

  return verifyDiscordRequestSignature({
    publicKeyHex,
    signatureHex,
    timestamp,
    body,
  });
}

export function verifyDiscordInteractionHeaders(input: {
  publicKeyHex: string;
  signature: string | null;
  timestamp: string | null;
  body: string;
}): boolean {
  if (!input.signature || !input.timestamp) return false;
  return verifyDiscordRequestSignature({
    publicKeyHex: input.publicKeyHex,
    signatureHex: input.signature,
    timestamp: input.timestamp,
    body: input.body,
  });
}

export async function verifyDiscordInteractionHeadersAsync(input: {
  publicKeyHex: string;
  signature: string | null;
  timestamp: string | null;
  body: string;
}): Promise<boolean> {
  if (!input.signature || !input.timestamp) return false;
  return verifyDiscordRequestSignatureAsync({
    publicKeyHex: input.publicKeyHex,
    signatureHex: input.signature,
    timestamp: input.timestamp,
    body: input.body,
  });
}
