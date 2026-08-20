// astn-writer.js — .astn binary file reconstruction for edit-save flow

import { AstnCrypto } from './astn-crypto.js';

const C = AstnCrypto.CONSTANTS;

export class AstnWriter {
  constructor(reader, renderer) {
    this.reader = reader;
    this.renderer = renderer;
    this.crypto = new AstnCrypto();
  }

  // Create a blank .astn file from a pre-built template
  // The template is a valid v2.0 .astn containing one outline node (默认卷)
  // This avoids runtime encryption offset calculation issues
  static async createBlank(title, description) {
    // Decode the pre-built template binary
    const templateBase64 = AstnWriter.TEMPLATE_BASE64;
    const binaryStr = atob(templateBase64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    const buffer = bytes.buffer;

    // If title/description match defaults, return template as-is
    if ((!title || title === '新书') && (!description || description === '')) {
      return buffer;
    }

    // Otherwise, parse → modify metadata → rebuild
    const reader = new AstnReader(buffer);
    reader.validate();
    const key = await reader.deriveKey(reader.readSalt());
    const indexJson = await reader.crypto.decryptIndex(key, reader.readIndexChunkBytes());
    const indexObj = JSON.parse(indexJson);

    // Update metadata
    indexObj.metadata.title = title || '新书';
    indexObj.metadata.description = description || '';

    // Rebuild with updated index (same assets, same chunks, new index)
    return AstnWriter._rebuildFromModifiedIndex(reader, key, indexObj);
  }

  static async _rebuildFromModifiedIndex(reader, key, indexObj) {
    const astnCrypto = new AstnCrypto();
    const C = AstnCrypto.CONSTANTS;

    const headerSize = 4;
    const indexLengthSize = C.ASTN_INDEX_LENGTH_SIZE;
    const footerSize = 4;
    const indexOffset = headerSize + C.ASTN_SALT_SIZE + indexLengthSize;

    // Read all asset chunks from original file (still encrypted)
    const assetChunkBytes = [];
    for (const asset of indexObj.assets) {
      const chunk = reader.uint8.slice(asset.offset, asset.offset + asset.length);
      assetChunkBytes.push(chunk);
    }

    // Set placeholder offsets, encrypt index to get size
    for (const a of indexObj.assets) {
      a.offset = 0;
      a.length = 0;
    }
    const placeholderEncrypted = await astnCrypto.encryptIndex(key, indexObj, reader.readSalt());

    // Calculate actual offsets
    let offset = indexOffset + placeholderEncrypted.length;
    for (let i = 0; i < indexObj.assets.length; i++) {
      indexObj.assets[i].offset = offset;
      indexObj.assets[i].length = assetChunkBytes[i].length;
      offset += assetChunkBytes[i].length;
    }

    // Iterative convergence: re-encrypt until index size stabilizes
    let prevLen = placeholderEncrypted.length;
    let finalEncrypted;
    for (let attempt = 0; attempt < 5; attempt++) {
      finalEncrypted = await astnCrypto.encryptIndex(key, indexObj, reader.readSalt());
      if (finalEncrypted.length === prevLen) break;
      // Size changed — recalculate offsets
      prevLen = finalEncrypted.length;
      let reOffset = indexOffset + finalEncrypted.length;
      for (let i = 0; i < indexObj.assets.length; i++) {
        indexObj.assets[i].offset = reOffset;
        reOffset += assetChunkBytes[i].length;
      }
    }

    // Assemble binary
    const salt = reader.readSalt();
    const totalSize = indexOffset + finalEncrypted.length +
                      assetChunkBytes.reduce((s, c) => s + c.length, 0) + footerSize;

    const buf = new ArrayBuffer(totalSize);
    const view = new DataView(buf);
    const uint8 = new Uint8Array(buf);

    let pos = 0;
    view.setUint32(pos, C.ASTN_MAGIC_HEADER, false); pos += 4;
    uint8.set(salt, pos); pos += C.ASTN_SALT_SIZE;
    view.setUint32(pos, finalEncrypted.length, false); pos += 4;
    uint8.set(finalEncrypted, pos); pos += finalEncrypted.length;
    for (const chunk of assetChunkBytes) {
      uint8.set(chunk, pos); pos += chunk.length;
    }
    view.setUint32(pos, C.ASTN_MAGIC_FOOTER, false);

    return buf;
  }

  // Pre-built .astn template (base64 encoded)
  // Contains: v2.0 format, metadata { title: "新书", description: "" },
  // one outline asset: { id: "ot_tpl_001", level: 0, title: "默认卷" }
  // Generated offline and verified to be correctly parseable
  static get TEMPLATE_BASE64() {
    return 'QVNUTmNSw1ID16CZuzs/FXBh2E0AAADWV/OJAY5IF1Tbn3gV5CHxhRO5/SRefJzp+fInzC2LiR7ZDV0SxktpW/TUnDJUSGmApALF2CkHsp3P0DUgGakZZSSFEH2oUN3s2PVI1YNQ0w9w8lbsx7HJRMxfQqJVCzgyEftqo/6GWMHitGmJcIZsyA4NzY2L8+nmuIQzcgwXgi14ZevplG4kI/f442iYsTt9bIUv6eV1JzywdgHAD6Une7JIqsfEeFL0KVx/vH+3bFjUjv+m+3GOcri8SPp5YZag/sPv95guUrK0HEixRfFhm2QeyjpC5uOOMMj6M15j6UYMk+vJKzOhakRTOqTJYBt5wDZd9zGBh/SMPohNaR53QHBpnBtnCzFuCU5wrys1yYZf6eLJyHdv8MIlNSTOn56m557VmVevvtMZ7rvdO6MkhDBRSYUvYaEK+cxaJi1A17aGXg8BxtjmxVAwaJOBbWn2lWNtjxDZMP5tn4TkGK4EX4bOUzSK1wh7q95Q+bbi5iEe+Lhkzqb2XHulr1MJM1vPI8LWz+7ic497VHGVrnYtK4k//nOvOP4RmnsS3jaMIpKnI8op9TyBcwfDYPzzxpfXkhre+rO4uCaqSpguA5O5t00z9kTTe9yTfhjv2VuOb429oIjmALGL8Axo4Mf7eTvCUyUh75TdT1ZFTA==';
  }

  async buildAstn(modifiedAssets) {
    // 1. Generate new 16-byte salt
    const salt = self.crypto.getRandomValues(new Uint8Array(C.ASTN_SALT_SIZE));

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
