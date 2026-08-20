// app.js — Main UI controller

import { AstnReader } from './astn-reader.js';
import { AstnRenderer } from './astn-renderer.js';

class App {
  constructor() {
    this.reader = null;
    this.renderer = new AstnRenderer();
    this.darkMode = localStorage.getItem('astn-dark-mode') === 'true';
    this.selectedAssetId = null;
    this.coverAssetId = null;

    this.bindEvents();
    this.applyTheme();
    this.checkCryptoSupport();
  }

  checkCryptoSupport() {
    if (!crypto || !crypto.subtle) {
      this.showError('您的浏览器不支持 Web Crypto API。请使用 HTTPS 访问或使用现代浏览器（Chrome、Firefox、Safari、Edge）。');
    }
  }

  bindEvents() {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const darkToggle = document.getElementById('dark-toggle');
    const closeError = document.getElementById('close-error');

    if (dropZone) {
      dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
      });
      dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
      });
      dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) this.handleFile(file);
      });
      dropZone.addEventListener('click', () => fileInput.click());
    }

    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) this.handleFile(file);
      });
    }

    if (darkToggle) {
      darkToggle.addEventListener('click', () => this.toggleTheme());
    }

    if (closeError) {
      closeError.addEventListener('click', () => {
        document.getElementById('error-banner').classList.add('hidden');
      });
    }

    const loadAnother = document.getElementById('load-another-btn');
    if (loadAnother) {
      loadAnother.addEventListener('click', () => this.reset());
    }

    const mobileTabs = document.querySelectorAll('.mobile-tab');
    mobileTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        mobileTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const target = tab.dataset.tab;
        const sidebar = document.getElementById('sidebar');
        const content = document.getElementById('main-content');
        if (target === 'sidebar') {
          sidebar.classList.remove('mobile-hidden');
          content.classList.add('mobile-hidden');
        } else {
          sidebar.classList.add('mobile-hidden');
          content.classList.remove('mobile-hidden');
        }
      });
    });
  }

  async handleFile(file) {
    if (!file.name.endsWith('.astn')) {
      this.showError('请选择 .astn 格式的文件');
      return;
    }

    this.showLoading('正在读取文件...');

    try {
      const buffer = await file.arrayBuffer();
      this.reader = new AstnReader(buffer);

      const validation = this.reader.validate();
      if (!validation.valid) {
        this.showError(validation.error);
        this.hideLoading();
        return;
      }

      this.showLoading('正在解密索引表...');

      const index = await this.reader.readIndex();

      if (index.version !== '2.0') {
        this.showError(`文件版本不兼容 (当前支持 v2.0，文件为 v${index.version})`);
        this.hideLoading();
        return;
      }

      this.coverAssetId = index.metadata.cover_asset_id || null;
      this.hideLoading();
      this.showDecoded(index);

    } catch (e) {
      console.error('文件处理失败:', e);
      let msg = e.message || '未知错误';
      if (msg.includes('decrypt') || msg.includes('OperationError') || msg.includes('auth')) {
        msg = '文件解密失败 — 数据可能已损坏或被篡改 (AuthTag 校验失败)';
      }
      this.showError(msg);
      this.hideLoading();
    }
  }

  showDecoded(index) {
    document.getElementById('landing').classList.add('hidden');
    document.getElementById('decoded').classList.remove('hidden');

    this.initMobileLayout();

    const titleEl = document.getElementById('book-title');
    titleEl.textContent = index.metadata.title || '未命名书籍';

    const descEl = document.getElementById('book-description');
    if (index.metadata.description) {
      descEl.textContent = index.metadata.description;
      descEl.classList.remove('hidden');
    } else {
      descEl.classList.add('hidden');
    }

    this.renderCover();
    this.renderSidebar();
    this.renderAssetStats();

    const firstChapter = this.reader.getAssetsByType('chapter')[0];
    if (firstChapter) {
      this.selectAsset(firstChapter.id);
    } else {
      const firstAsset = index.assets[0];
      if (firstAsset) {
        this.selectAsset(firstAsset.id);
      }
    }
  }

  renderCover() {
    const coverEl = document.getElementById('book-cover');
    if (!coverEl || !this.coverAssetId) {
      if (coverEl) coverEl.classList.add('hidden');
      return;
    }

    coverEl.classList.remove('hidden');
    coverEl.innerHTML = '<span class="cover-placeholder">...</span>';

    this.reader.readAsset(this.reader.getAssetById(this.coverAssetId))
      .then(data => {
        const url = this.renderer.getImageBlobUrl(data);
        coverEl.innerHTML = '';
        const img = document.createElement('img');
        img.src = url;
        img.alt = '封面';
        coverEl.appendChild(img);
      })
      .catch(() => {
        coverEl.classList.add('hidden');
      });
  }

  renderSidebar() {
    const sidebar = document.getElementById('sidebar-list');
    sidebar.innerHTML = '';

    const groups = this.reader.getAssetGroups();
    const sortedTypes = Object.keys(groups).sort(
      (a, b) => this.renderer.getTypeOrder(a) - this.renderer.getTypeOrder(b)
    );

    for (const type of sortedTypes) {
      const assets = groups[type];
      const icon = this.renderer.getAssetIcon(type);
      const label = this.renderer.getTypeLabel(type);

      const groupEl = document.createElement('div');
      groupEl.className = 'sidebar-group';

      const header = document.createElement('div');
      header.className = 'sidebar-group-header';
      header.innerHTML = `${icon} ${label} <span class="group-count">${assets.length}</span>`;
      groupEl.appendChild(header);

      const list = document.createElement('div');
      list.className = 'sidebar-group-list';

      for (const asset of assets) {
        const item = document.createElement('div');
        item.className = 'sidebar-item';
        item.dataset.assetId = asset.id;
        item.dataset.assetType = asset.type;

        let displayName = asset.name || asset.id;
        if (type === 'chapter') {
          displayName = asset.name || '未命名章节';
        } else if (type === 'character') {
          displayName = asset.name || '未命名角色';
        }

        item.textContent = displayName;
        item.addEventListener('click', () => this.selectAsset(asset.id));
        list.appendChild(item);
      }

      groupEl.appendChild(list);
      sidebar.appendChild(groupEl);
    }
  }

  renderAssetStats() {
    const statsEl = document.getElementById('asset-stats');
    if (!statsEl) return;

    const groups = this.reader.getAssetGroups();
    const stats = [];
    for (const type of Object.keys(groups)) {
      const label = this.renderer.getTypeLabel(type);
      stats.push(`${label} ${groups[type].length}`);
    }
    statsEl.textContent = stats.join(' · ');
  }

  async selectAsset(assetId) {
    if (this.selectedAssetId === assetId) return;
    this.selectedAssetId = assetId;

    document.querySelectorAll('.sidebar-item.active').forEach(el => el.classList.remove('active'));
    const item = document.querySelector(`.sidebar-item[data-asset-id="${assetId}"]`);
    if (item) item.classList.add('active');

    const asset = this.reader.getAssetById(assetId);
    if (!asset) return;

    const mainContent = document.getElementById('main-content');
    mainContent.innerHTML = '<div class="loading-inline">正在解密...</div>';

    try {
      const data = await this.reader.readAsset(asset);
      const element = this.renderAssetContent(asset, data);
      mainContent.innerHTML = '';
      mainContent.appendChild(element);
    } catch (e) {
      mainContent.innerHTML = `<div class="error-inline">解密失败: ${this.escapeHtml(e.message)}</div>`;
    }

    this.updateExportButton(asset);
    this.showMobileContent();
  }

  initMobileLayout() {
    const isMobile = window.innerWidth <= 768;
    if (!isMobile) return;

    const sidebar = document.getElementById('sidebar');
    const content = document.getElementById('main-content');
    sidebar.classList.remove('mobile-hidden');
    content.classList.add('mobile-hidden');

    const tabs = document.querySelectorAll('.mobile-tab');
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === 'sidebar'));
  }

  showMobileContent() {
    const isMobile = window.innerWidth <= 768;
    if (!isMobile) return;

    const sidebar = document.getElementById('sidebar');
    const content = document.getElementById('main-content');
    const tabs = document.querySelectorAll('.mobile-tab');

    sidebar.classList.add('mobile-hidden');
    content.classList.remove('mobile-hidden');

    tabs.forEach(t => {
      t.classList.toggle('active', t.dataset.tab === 'content');
    });
  }

  renderAssetContent(asset, data) {
    const container = document.createElement('div');
    container.className = 'asset-view';

    const toolbar = document.createElement('div');
    toolbar.className = 'asset-toolbar';

    const icon = this.renderer.getAssetIcon(asset.type);
    const typeLabel = this.renderer.getTypeLabel(asset.type);
    toolbar.innerHTML = `<span class="asset-type-badge ${asset.type}">${icon} ${typeLabel}</span><span class="asset-name">${this.renderer.escapeHtml(asset.name || asset.id)}</span>`;

    container.appendChild(toolbar);

    let contentEl;
    switch (asset.type) {
      case 'chapter':
        contentEl = this.renderer.renderChapter(data);
        break;
      case 'outline':
        contentEl = this.renderer.renderOutline(data);
        break;
      case 'worldview':
        contentEl = this.renderer.renderWorldSetting(data);
        break;
      case 'character':
        contentEl = this.renderer.renderCharacter(data, this.reader);
        break;
      case 'image':
        contentEl = this.renderer.renderImage(data, asset.name);
        break;
      default:
        contentEl = this.renderer.renderRawJson(data);
    }

    container.appendChild(contentEl);
    return container;
  }

  updateExportButton(asset) {
    const exportBtn = document.getElementById('export-asset-btn');
    if (!exportBtn) return;

    exportBtn.onclick = () => this.exportAsset(asset);
  }

  async exportAsset(asset) {
    try {
      const data = await this.reader.readAsset(asset);
      let blob, filename;

      if (asset.type === 'image') {
        const mime = this.renderer.detectImageMime(data);
        const ext = mime.split('/')[1] === 'jpeg' ? 'jpg' : mime.split('/')[1];
        blob = new Blob([data], { type: mime });
        filename = (asset.name || 'image') + '.' + ext;
      } else {
        const text = this.renderer.decodeUtf8(data);
        const parsed = JSON.parse(text);
        const pretty = JSON.stringify(parsed, null, 2);
        blob = new Blob([pretty], { type: 'application/json' });
        filename = (asset.name || asset.id) + '.json';
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      this.showError('导出失败: ' + e.message);
    }
  }

  toggleTheme() {
    this.darkMode = !this.darkMode;
    localStorage.setItem('astn-dark-mode', this.darkMode.toString());
    this.applyTheme();
  }

  applyTheme() {
    document.body.classList.toggle('dark', this.darkMode);
    const toggle = document.getElementById('dark-toggle');
    if (toggle) {
      toggle.textContent = this.darkMode ? '☀️' : '🌙';
    }
  }

  showLoading(message) {
    const el = document.getElementById('loading-overlay');
    const text = document.getElementById('loading-text');
    if (el) {
      el.classList.remove('hidden');
      if (text) text.textContent = message;
    }
  }

  hideLoading() {
    const el = document.getElementById('loading-overlay');
    if (el) el.classList.add('hidden');
  }

  showError(message) {
    const banner = document.getElementById('error-banner');
    const text = document.getElementById('error-text');
    if (banner && text) {
      text.textContent = message;
      banner.classList.remove('hidden');
    }
  }

  reset() {
    if (this.renderer) {
      this.renderer.revokeAllBlobUrls();
    }
    this.reader = null;
    this.selectedAssetId = null;
    this.coverAssetId = null;

    document.getElementById('landing').classList.remove('hidden');
    document.getElementById('decoded').classList.add('hidden');
    document.getElementById('file-input').value = '';

    this.renderer = new AstnRenderer();
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new App();
});
