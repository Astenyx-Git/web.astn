// astn-crypto.js — ASTN cryptographic operations using Web Crypto API
// Mirrors: entry/src/main/ets/service/AstnCryptoService.ets

const ASTN_MAGIC_HEADER = 0x4153544E; // "ASTN" UInt32 big-endian
const ASTN_MAGIC_FOOTER = 0x4F56454C; // "OVEL" UInt32 big-endian
const ASTN_SALT_SIZE = 16;
const ASTN_NONCE_SIZE = 12;
const ASTN_AUTH_TAG_SIZE = 16;
const ASTN_INDEX_LENGTH_SIZE = 4;
const ASTN_MIN_FILE_SIZE = 28;
const ASTN_KDF_ITERATIONS = 10000;
const ASTN_MASTER_SECRET = 'AstNovel_ASTN_v2_MasterSecret_Key_2026';
const ASTN_VERSION = '2.0';

export class AstnCrypto {
  static get CONSTANTS() {
    return {
      ASTN_MAGIC_HEADER,
      ASTN_MAGIC_FOOTER,
      ASTN_SALT_SIZE,
      ASTN_NONCE_SIZE,
      ASTN_AUTH_TAG_SIZE,
      ASTN_INDEX_LENGTH_SIZE,
      ASTN_MIN_FILE_SIZE,
      ASTN_KDF_ITERATIONS,
      ASTN_MASTER_SECRET,
      ASTN_VERSION
    };
  }

  async deriveKey(salt, password = ASTN_MASTER_SECRET) {
    const encoder = new TextEncoder();
    const passwordBytes = encoder.encode(password);

    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      passwordBytes,
      'PBKDF2',
      false,
      ['deriveKey']
    );

    const key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: ASTN_KDF_ITERATIONS,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );

    return key;
  }

  async decryptChunk(key, nonce, ciphertext, authTag) {
    const combined = new Uint8Array(ciphertext.length + authTag.length);
    combined.set(ciphertext, 0);
    combined.set(authTag, ciphertext.length);

    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: nonce,
        tagLength: 128
      },
      key,
      combined
    );

    return new Uint8Array(plaintext);
  }

  parseChunkFromBytes(bytes) {
    const totalLength = bytes.length;
    const authTagStart = totalLength - ASTN_AUTH_TAG_SIZE;
    const nonceEnd = ASTN_NONCE_SIZE;

    const nonce = bytes.slice(0, nonceEnd);
    const ciphertext = bytes.slice(nonceEnd, authTagStart);
    const authTag = bytes.slice(authTagStart, totalLength);

    return { nonce, ciphertext, authTag };
  }

  async decryptIndex(key, chunkBytes) {
    const { nonce, ciphertext, authTag } = this.parseChunkFromBytes(chunkBytes);
    const plaintext = await this.decryptChunk(key, nonce, ciphertext, authTag);
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(plaintext);
  }

  async decryptAsset(key, chunkBytes) {
    const { nonce, ciphertext, authTag } = this.parseChunkFromBytes(chunkBytes);
    return await this.decryptChunk(key, nonce, ciphertext, authTag);
  }
}
