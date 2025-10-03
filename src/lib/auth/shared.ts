export const AUTH_COOKIE_NAME = 'dlg_access';

function toBase64(input: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(input).toString('base64');
  }
  let binary = '';
  for (let i = 0; i < input.length; i += 1) {
    binary += String.fromCharCode(input[i]);
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    const buf = Buffer.from(value, 'base64');
    return new Uint8Array(buf);
  }
  const binary = atob(value);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function base64UrlEncode(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export function base64UrlDecode(value: string): Uint8Array {
  const replaced = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = replaced.length % 4 === 2 ? '==' : replaced.length % 4 === 3 ? '=' : '';
  return fromBase64(replaced + padding);
}
