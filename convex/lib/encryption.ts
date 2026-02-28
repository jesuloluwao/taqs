/**
 * AES-256-GCM encryption helpers for Convex runtime (Web Crypto API).
 *
 * Format: base64(12-byte IV || ciphertext || 16-byte auth tag)
 *
 * Requires ENCRYPTION_KEY env var: 64 hex chars (32 bytes).
 */

const IV_BYTES = 12;

function getKeyHex(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length !== 64) {
    throw new Error('ENCRYPTION_KEY env var must be a 64-character hex string (32 bytes)');
  }
  return key;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

async function importKey() {
  const keyBytes = hexToBytes(getKeyHex());
  return crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts plaintext using AES-256-GCM.
 * Returns a base64 string of: 12-byte IV || ciphertext || 16-byte auth tag
 */
export async function encrypt(plaintext: string): Promise<string> {
  const key = await importKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertextBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );

  // Concatenate IV + ciphertext (which includes the auth tag appended by AES-GCM)
  const result = new Uint8Array(IV_BYTES + ciphertextBuf.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(ciphertextBuf), IV_BYTES);

  return btoa(String.fromCharCode(...result));
}

/**
 * Decrypts a base64-encoded AES-256-GCM payload.
 * Expects: 12-byte IV || ciphertext || 16-byte auth tag
 */
export async function decrypt(ciphertext: string): Promise<string> {
  const key = await importKey();
  const bytes = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0));

  if (bytes.length < IV_BYTES + 16) {
    throw new Error('Invalid ciphertext: too short');
  }

  const iv = bytes.slice(0, IV_BYTES);
  const data = bytes.slice(IV_BYTES);

  const plaintextBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );

  return new TextDecoder().decode(plaintextBuf);
}
