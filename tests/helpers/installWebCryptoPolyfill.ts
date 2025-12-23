import { webcrypto } from 'node:crypto';

export function installWebCryptoPolyfill() {
  if (!(globalThis as any).crypto) {
    (globalThis as any).crypto = webcrypto;
  }
}
