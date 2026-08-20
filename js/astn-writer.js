// astn-writer.js — .astn binary file reconstruction for edit-save flow

import { AstnCrypto } from './astn-crypto.js';

const C = AstnCrypto.CONSTANTS;

export class AstnWriter {
  constructor(reader, renderer) {
    this.reader = reader;
    this.renderer = renderer;
    this.crypto = new AstnCrypto();
  }

  async buildAstn(modifiedAssets) {
    // 1. Generate new 16-byte salt
    const salt = crypto.getRandomValues(new Uint8Array(C.ASTN_SALT_SIZE));

    // 2. Derive key from new salt
    const key = await this.crypto.deriveKey(salt);

    // 3. Build updated index with new offsets (will calculate after encryption)
    const originalIndex = this.reader.index;

    // 4. Encrypt all assets and collect chunk data
    const assetChunks = [];
    for (const asset of originalIndex.assets) {
      let plaintext;
      if (modifiedAssets.has(asset.id)) {
        // Use modified data
        plaintext = modifiedAssets.get(asset.id);
      } else {
        // Use cached original plaintext
        plaintext = await this.reader.readAsset(asset);
      }

      // For image assets, plaintext is already raw bytes; for text assets it's Uint8Array
      const chunkBytes = await this.crypto.encryptChunk(key, plaintext);
      assetChunks.push({ asset, chunkBytes });
    }

    // 5. Build index JSON with updated offsets
    const headerSize = 4; // "ASTN"
    const indexLengthSize = C.ASTN_INDEX_LENGTH_SIZE; // 4 bytes
    const footerSize = 4; // "OVEL"

    const indexOffset = headerSize + C.ASTN_SALT_SIZE + indexLengthSize;

    // Build the updated index object
    const updatedIndex = {
      version: originalIndex.version,
      metadata: { ...originalIndex.metadata },
      assets: []
    };

    let currentOffset = indexOffset; // Will be updated after index encryption
    // We need to encrypt index first to know its size, then calculate asset offsets

    // Build asset list without offsets first
    const assetList = originalIndex.assets.map((asset, i) => ({
      id: asset.id,
      type: asset.type,
      name: asset.name,
      _chunkIndex: i
    }));

    // Create index with placeholder offsets
    const indexObj = {
      version: originalIndex.version,
      metadata: { ...originalIndex.metadata },
      assets: assetList.map(a => ({
        id: a.id,
        type: a.type,
        name: a.name,
        offset: 0, // placeholder
        length: 0  // placeholder
      }))
    };

    // Encrypt index to get its size
    const encryptedIndex = await this.crypto.encryptIndex(key, indexObj, salt);
    const indexLength = encryptedIndex.length;

    // Now calculate actual asset offsets
    let assetOffset = indexOffset + indexLength;
    for (let i = 0; i < assetChunks.length; i++) {
      indexObj.assets[i].offset = assetOffset;
      indexObj.assets[i].length = assetChunks[i].chunkBytes.length;
      assetOffset += assetChunks[i].chunkBytes.length;
    }

    // Re-encrypt index with correct offsets
    const finalEncryptedIndex = await this.crypto.encryptIndex(key, indexObj, salt);

    // 6. Assemble full .astn binary
    // [4B "ASTN"][16B Salt][4B IndexLen][EncryptedIndex][AssetChunks...][4B "OVEL"]
    const totalSize = headerSize + C.ASTN_SALT_SIZE + indexLengthSize +
                      finalEncryptedIndex.length +
                      assetChunks.reduce((sum, ac) => sum + ac.chunkBytes.length, 0) +
                      footerSize;

    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    const uint8 = new Uint8Array(buffer);

    let pos = 0;

    // Header magic "ASTN"
    view.setUint32(pos, C.ASTN_MAGIC_HEADER, false);
    pos += 4;

    // Salt
    uint8.set(salt, pos);
    pos += C.ASTN_SALT_SIZE;

    // Index length
    view.setUint32(pos, finalEncryptedIndex.length, false);
    pos += 4;

    // Encrypted index
    uint8.set(finalEncryptedIndex, pos);
    pos += finalEncryptedIndex.length;

    // Asset chunks
    for (const { chunkBytes } of assetChunks) {
      uint8.set(chunkBytes, pos);
      pos += chunkBytes.length;
    }

    // Footer magic "OVEL"
    view.setUint32(pos, C.ASTN_MAGIC_FOOTER, false);

    return buffer;
  }
}
