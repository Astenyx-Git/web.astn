// astn-reader.js — .astn binary file parser
// Mirrors: entry/src/main/ets/service/AstnFileReader.ets

import { AstnCrypto } from './astn-crypto.js';

const C = AstnCrypto.CONSTANTS;

export class AstnReader {
  constructor(arrayBuffer) {
    this.buffer = arrayBuffer;
    this.dataView = new DataView(arrayBuffer);
    this.byteLength = arrayBuffer.byteLength;
    this.uint8 = new Uint8Array(arrayBuffer);
    this.crypto = new AstnCrypto();
    this.key = null;
    this.index = null;
    this.assetCache = new Map();
  }

  validate() {
    if (this.byteLength < C.ASTN_MIN_FILE_SIZE) {
      return { valid: false, error: `文件过小 (${this.byteLength} 字节)，不是有效的 .astn 文件 (最小 ${C.ASTN_MIN_FILE_SIZE} 字节)` };
    }

    const headerMagic = this.dataView.getUint32(0, false);
    if (headerMagic !== C.ASTN_MAGIC_HEADER) {
      return { valid: false, error: '文件头部魔数不匹配 (预期 "ASTN")，不是有效的 .astn 文件' };
    }

    const footerMagic = this.dataView.getUint32(this.byteLength - 4, false);
    if (footerMagic !== C.ASTN_MAGIC_FOOTER) {
      return { valid: false, error: '文件尾部魔数不匹配 (预期 "OVEL")，文件可能已损坏或传输中断' };
    }

    return { valid: true, error: '' };
  }

  readSalt() {
    return this.uint8.slice(4, 4 + C.ASTN_SALT_SIZE);
  }

  readIndexLength() {
    return this.dataView.getUint32(4 + C.ASTN_SALT_SIZE, false);
  }

  readIndexChunkBytes() {
    const indexLength = this.readIndexLength();
    const offset = 4 + C.ASTN_SALT_SIZE + C.ASTN_INDEX_LENGTH_SIZE;
    return this.uint8.slice(offset, offset + indexLength);
  }

  async deriveKey(salt) {
    this.key = await this.crypto.deriveKey(salt);
    return this.key;
  }

  async readIndex() {
    const salt = this.readSalt();
    await this.deriveKey(salt);

    const indexChunkBytes = this.readIndexChunkBytes();
    const indexJson = await this.crypto.decryptIndex(this.key, indexChunkBytes);

    this.index = this.parseIndexJson(indexJson);
    return this.index;
  }

  async readAsset(asset) {
    if (this.assetCache.has(asset.id)) {
      return this.assetCache.get(asset.id);
    }

    const chunkBytes = this.uint8.slice(asset.offset, asset.offset + asset.length);
    const plaintext = await this.crypto.decryptAsset(this.key, chunkBytes);
    this.assetCache.set(asset.id, plaintext);
    return plaintext;
  }

  async readAllAssets() {
    if (!this.index) {
      throw new Error('索引表尚未读取，请先调用 readIndex()');
    }

    const results = new Map();
    for (const asset of this.index.assets) {
      try {
        const plaintext = await this.readAsset(asset);
        results.set(asset.id, plaintext);
      } catch (e) {
        console.warn(`资产 ${asset.id} (${asset.name}) 解密失败:`, e.message);
      }
    }
    return results;
  }

  parseIndexJson(json) {
    const obj = JSON.parse(json);
    const index = {
      version: obj.version || C.ASTN_VERSION,
      metadata: {
        title: '',
        description: '',
        cover_asset_id: ''
      },
      assets: []
    };

    if (obj.metadata) {
      index.metadata.title = obj.metadata.title || '';
      index.metadata.description = obj.metadata.description || '';
      index.metadata.cover_asset_id = obj.metadata.cover_asset_id || '';
    }

    if (Array.isArray(obj.assets)) {
      index.assets = obj.assets.map(a => ({
        id: a.id || '',
        type: a.type || '',
        name: a.name || '',
        offset: a.offset || 0,
        length: a.length || 0
      }));
    }

    return index;
  }

  getAssetsByType(type) {
    if (!this.index) return [];
    return this.index.assets.filter(a => a.type === type);
  }

  getAssetById(id) {
    if (!this.index) return null;
    return this.index.assets.find(a => a.id === id) || null;
  }

  getAssetGroups() {
    if (!this.index) return {};
    const groups = {};
    for (const asset of this.index.assets) {
      if (!groups[asset.type]) {
        groups[asset.type] = [];
      }
      groups[asset.type].push(asset);
    }
    return groups;
  }

  findCharacterImages(characterId, allAssets) {
    const images = { avatar: null, gallery: [] };

    const avatarAssetId = 'asset_img_avatar_' + characterId;
    const avatarAsset = allAssets
      ? allAssets.find(a => a.id === avatarAssetId)
      : this.getAssetById(avatarAssetId);
    if (avatarAsset) {
      images.avatar = avatarAsset;
    }

    const prefix = 'asset_img_' + characterId + '_';
    const galleryAssets = allAssets
      ? allAssets.filter(a => a.id.startsWith(prefix) && a.type === 'image')
      : this.index.assets.filter(a => a.id.startsWith(prefix) && a.type === 'image');
    for (const ga of galleryAssets) {
      images.gallery.push(ga);
    }

    return images;
  }
}
