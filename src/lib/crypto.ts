// Simple AES-GCM helpers for encrypting the OpenRouter API key with a passphrase

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

async function deriveKey(passphrase: string, saltBytes: Uint8Array): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  // Ensure salt is an ArrayBuffer (not ArrayBufferLike) to satisfy TS DOM types
  const salt = saltBytes.buffer.slice(
    saltBytes.byteOffset,
    saltBytes.byteOffset + saltBytes.byteLength
  ) as ArrayBuffer;
  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 100_000,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
  return key;
}

export async function encryptString(plain: string, passphrase: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(passphrase, salt);
  const cipherbuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    textEncoder.encode(plain)
  );
  return {
    iv: Array.from(iv),
    salt: Array.from(salt),
    ciphertext: Array.from(new Uint8Array(cipherbuf)),
  };
}

export async function decryptString(
  payload: { iv: number[]; salt: number[]; ciphertext: number[] },
  passphrase: string
) {
  const iv = new Uint8Array(payload.iv);
  const salt = new Uint8Array(payload.salt);
  const key = await deriveKey(passphrase, salt);
  const cipher = new Uint8Array(payload.ciphertext);
  const plainbuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
  return textDecoder.decode(plainbuf);
}


