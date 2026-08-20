// app.js — Main UI controller

import { AstnReader } from './astn-reader.js';
import { AstnRenderer } from './astn-renderer.js';
import { ASTN_EDIT_MODE } from './config.js';

class App {
  constructor() {
    this.reader = null;
    this.renderer = new AstnRenderer();
    this.editMode = ASTN_EDIT_MODE;
    this.darkMode = localStorage.getItem('astn-dark-mode') === 'true';
    this.selectedAssetId = null;
    this.coverAssetId = null;

    // Edit state management
    this.modifiedAssetIds = new Set();
    this.exportBtn = null;

    // Outline tree expand/collapse state
    this.expandedOutlineIds = new Set();
    this.outlineTreeCache = null;

    this.bindEvents();
    this.applyTheme();
    this.checkCryptoSupport();
    this.composeFavicon();
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
    const createNewBtn = document.getElementById('create-new-btn');

    // Show "new file" button only in edit mode
    if (this.editMode === 1) {
      const section = document.getElementById('create-new-section');
      if (section) section.classList.remove('hidden');
    }

    if (createNewBtn) {
      createNewBtn.addEventListener('click', () => this.createNewAstn());
    }

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

    // Apply edit-mode class if ASTN_EDIT_MODE is enabled
    if (this.editMode === 1) {
      document.body.classList.add('edit-mode');
    }

    // Conditionally render export button in top-bar
    if (this.editMode === 1) {
      this.renderExportButton();
    }

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

    // Make title and description editable in edit mode
    if (this.editMode === 1) {
      titleEl.setAttribute('contenteditable', 'true');
      titleEl.dataset.field = 'book-title';
      titleEl.addEventListener('input', () => {
        this.reader.index.metadata.title = titleEl.textContent;
        this.modifiedAssetIds.add('__metadata__');
        this.updateSaveButton();
      });

      descEl.setAttribute('contenteditable', 'true');
      descEl.dataset.field = 'book-description';
      descEl.classList.remove('hidden');
      descEl.addEventListener('input', () => {
        this.reader.index.metadata.description = descEl.textContent;
        this.modifiedAssetIds.add('__metadata__');
        this.updateSaveButton();
      });
    }

    this.renderCover();
    this.renderSidebar();
    this.renderAssetStats();

    // Build outline tree asynchronously (needs to decrypt all outline assets for parentId)
    this.buildOutlineTreeAsync().then(() => {
      this.refreshOutlineSidebar();
    });

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
      if (type === 'image') continue; // 图片已内嵌于封面/角色页面，不单独显示
      const assets = groups[type];
      const label = this.renderer.getTypeLabel(type);

      const groupEl = document.createElement('div');
      groupEl.className = 'sidebar-group';

      const header = document.createElement('div');
      header.className = 'sidebar-group-header';
      let headerHtml = `${label} <span class="group-count">${assets.length}</span>`;
      // Add "+" button in edit mode for creatable types
      // Chapters always creatable; characters/worldview only if type already exists
      if (this.editMode === 1 && (type === 'chapter' || (assets.length > 0 && (type === 'character' || type === 'worldview')))) {
        headerHtml += ` <button class="add-asset-btn" data-type="${type}" title="新建${label}">+</button>`;
      }
      header.innerHTML = headerHtml;
      groupEl.appendChild(header);

      // Bind "+" button events
      if (this.editMode === 1) {
        const addBtn = header.querySelector('.add-asset-btn');
        if (addBtn) {
          addBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const t = addBtn.dataset.type;
            if (t === 'chapter') this.createChapter();
            else if (t === 'character') this.createCharacter();
            else if (t === 'worldview') this.showWorldSettingCategoryPicker();
          });
        }
      }

      const list = document.createElement('div');
      list.className = 'sidebar-group-list';

      if (type === 'outline') {
        // Outline tree requires async decryption — placeholder rendered now, tree after data loads
        const placeholder = document.createElement('div');
        placeholder.className = 'sidebar-outline-placeholder';
        placeholder.textContent = '...';
        list.appendChild(placeholder);
      } else {
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
      }

      groupEl.appendChild(list);
      sidebar.appendChild(groupEl);
    }
  }

  async buildOutlineTreeAsync() {
    const outlineAssets = this.reader.getAssetsByType('outline');
    if (outlineAssets.length === 0) return;

    const nodeMap = new Map();   // key: asset.id
    const outlineIdMap = new Map(); // key: obj.id → asset.id
    const rootNodes = [];
    const orphans = []; // nodes whose parentId is dangling

    // Decrypt all outline assets to get parentId and level
    const dataList = [];
    for (const asset of outlineAssets) {
      try {
        const data = await this.reader.readAsset(asset);
        const obj = this.renderer.parseJson(data);
        dataList.push({ asset, obj });
        nodeMap.set(asset.id, { asset, children: [], obj });
        if (obj.id) {
          outlineIdMap.set(obj.id, asset.id);
        }
      } catch (e) {
        nodeMap.set(asset.id, { asset, children: [], obj: null });
      }
    }

    // Build parent-child relationships via parentId
    for (const { asset, obj } of dataList) {
      const node = nodeMap.get(asset.id);
      if (!obj || !obj.parentId) {
        rootNodes.push(node);
      } else {
        const parentAssetId = outlineIdMap.get(obj.parentId);
        if (parentAssetId) {
          const parentNode = nodeMap.get(parentAssetId);
          if (parentNode) {
            parentNode.children.push(node);
          } else {
            orphans.push(node);
          }
        } else {
          orphans.push(node);
        }
      }
    }

    // Fallback: attach orphans by level hierarchy
    // When parentId references a deleted/missing parent, find the nearest
    // preceding node at level = orphan.level - 1 and attach as its child
    if (orphans.length > 0) {
      orphans.sort((a, b) => {
        const oa = a.obj ? (a.obj.order || 0) : 0;
        const ob = b.obj ? (b.obj.order || 0) : 0;
        return oa - ob;
      });

      const flatOrdered = this._flattenTreeOrdered(rootNodes);

      for (const orphan of orphans) {
        const targetLevel = (orphan.obj?.level || 1) - 1;
        let attached = false;
        for (let i = flatOrdered.length - 1; i >= 0; i--) {
          if (flatOrdered[i].obj && flatOrdered[i].obj.level === targetLevel) {
            flatOrdered[i].children.push(orphan);
            attached = true;
            flatOrdered.push(orphan);
            break;
          }
        }
        if (!attached) {
          rootNodes.push(orphan);
          flatOrdered.push(orphan);
        }
      }
    }

    // Sort children by order
    const sortByOrder = (a, b) => {
      const orderA = a.obj ? (a.obj.order || 0) : 0;
      const orderB = b.obj ? (b.obj.order || 0) : 0;
      return orderA - orderB;
    };
    rootNodes.sort(sortByOrder);
    for (const node of nodeMap.values()) {
      node.children.sort(sortByOrder);
    }

    this.outlineTreeCache = { nodeMap, rootNodes };
    this.expandedOutlineIds.clear();
  }

  _flattenTreeOrdered(nodes) {
    const result = [];
    for (const node of nodes) {
      result.push(node);
      if (node.children.length > 0) {
        result.push(...this._flattenTreeOrdered(node.children));
      }
    }
    return result;
  }

  renderOutlineTreeNodes(container, nodes, depth) {
    for (const node of nodes) {
      const obj = node.obj || {};
      const hasChildren = node.children.length > 0;
      const isExpanded = this.expandedOutlineIds.has(node.asset.id);

      const item = document.createElement('div');
      item.className = 'sidebar-item outline-tree-item';
      item.dataset.assetId = node.asset.id;
      item.dataset.assetType = 'outline';
      item.dataset.depth = String(depth);

      const indent = document.createElement('span');
      indent.className = 'outline-tree-indent';
      indent.style.width = (depth * 24) + 'px';
      item.appendChild(indent);

      if (hasChildren) {
        const arrow = document.createElement('span');
        arrow.className = 'outline-tree-arrow';
        arrow.textContent = isExpanded ? '▾' : '▸';
        item.appendChild(arrow);
      } else {
        const spacer = document.createElement('span');
        spacer.className = 'outline-tree-arrow-spacer';
        item.appendChild(spacer);
      }

      const contentCol = document.createElement('span');
      contentCol.className = 'outline-tree-content';

      const titleRow = document.createElement('span');
      titleRow.className = 'outline-tree-title-row';

      const label = document.createElement('span');
      label.className = 'outline-tree-label';
      const title = obj.title || node.asset.name || '未命名大纲';
      label.textContent = title;
      titleRow.appendChild(label);

      const levelBadge = document.createElement('span');
      levelBadge.className = 'outline-level-badge outline-tree-level';
      const levelLabels = ['卷', '章', '节'];
      const level = obj.level !== undefined ? obj.level : 99;
      levelBadge.textContent = levelLabels[level] || '节点';
      titleRow.appendChild(levelBadge);

      contentCol.appendChild(titleRow);

      // Summary line (matching app's getSummary)
      const summary = this.getOutlineSummary(obj);
      if (summary) {
        const summaryEl = document.createElement('span');
        summaryEl.className = 'outline-tree-summary';
        summaryEl.textContent = summary;
        contentCol.appendChild(summaryEl);
      }

      item.appendChild(contentCol);

      item.addEventListener('click', () => {
        if (hasChildren) {
          this.toggleOutlineExpand(node.asset.id);
        }
        this.selectAsset(node.asset.id);
      });
      container.appendChild(item);

      if (hasChildren && isExpanded) {
        this.renderOutlineTreeNodes(container, node.children, depth + 1);
      }
    }
  }

  getOutlineSummary(obj) {
    if (obj.content && obj.content.length > 0) {
      return obj.content.length > 50 ? obj.content.substring(0, 50) + '...' : obj.content;
    }
    if (obj.notes && obj.notes.length > 0) {
      return obj.notes.length > 50 ? obj.notes.substring(0, 50) + '...' : obj.notes;
    }
    return '';
  }

  toggleOutlineExpand(nodeId) {
    if (this.expandedOutlineIds.has(nodeId)) {
      this.expandedOutlineIds.delete(nodeId);
    } else {
      this.expandedOutlineIds.add(nodeId);
    }
    // Re-render outline section of sidebar
    this.refreshOutlineSidebar();
  }

  refreshOutlineSidebar() {
    if (!this.outlineTreeCache || !this.outlineTreeCache.rootNodes.length) return;

    const outlineGroup = document.querySelector('.sidebar-group-list');
    // Find the outline group list in sidebar
    const sidebarGroups = document.querySelectorAll('.sidebar-group');
    for (const group of sidebarGroups) {
      const header = group.querySelector('.sidebar-group-header');
      if (header && header.textContent.includes('大纲')) {
        const list = group.querySelector('.sidebar-group-list');
        if (list) {
          list.innerHTML = '';
          this.renderOutlineTreeNodes(list, this.outlineTreeCache.rootNodes, 0);
          // Re-apply active state
          if (this.selectedAssetId) {
            const activeItem = list.querySelector(`.sidebar-item[data-asset-id="${this.selectedAssetId}"]`);
            if (activeItem) activeItem.classList.add('active');
          }
        }
        break;
      }
    }
  }

  renderAssetStats() {
    const statsEl = document.getElementById('asset-stats');
    if (!statsEl) return;

    const groups = this.reader.getAssetGroups();
    const stats = [];
    for (const type of Object.keys(groups)) {
      if (type === 'image') continue; // 图片已内嵌于封面/角色页面，不单独统计
      const label = this.renderer.getTypeLabel(type);
      stats.push(`${label} ${groups[type].length}`);
    }
    statsEl.textContent = stats.join(' · ');
  }

  flushCurrentEditsToCache() {
    if (!this.selectedAssetId || !this.editMode) return;
    const asset = this.reader.getAssetById(this.selectedAssetId);
    if (!asset) return;

    const mainContent = document.getElementById('main-content');
    const assetView = mainContent.querySelector('.asset-view');
    if (!assetView) return;

    const editedData = this.renderer.extractEditedData(asset.type, assetView);
    if (editedData) {
      const data = new TextEncoder().encode(JSON.stringify(editedData));
      this.reader.assetCache.set(this.selectedAssetId, data);
    }
  }

  async selectAsset(assetId) {
    // Before switching, save current asset's edits from DOM to cache
    if (this.editMode === 1 && this.selectedAssetId && this.selectedAssetId !== assetId) {
      this.flushCurrentEditsToCache();
    }

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

    const typeLabel = this.renderer.getTypeLabel(asset.type);
    toolbar.innerHTML = `<span class="asset-type-badge ${asset.type}">${typeLabel}</span><span class="asset-name">${this.renderer.escapeHtml(asset.name || asset.id)}</span>`;

    container.appendChild(toolbar);

    let contentEl;
    switch (asset.type) {
      case 'chapter':
        contentEl = this.renderer.renderChapter(data, this.editMode);
        break;
      case 'outline':
        contentEl = this.renderer.renderOutline(data, this.editMode);
        break;
      case 'worldview':
        contentEl = this.renderer.renderWorldSetting(data, this.editMode);
        break;
      case 'character':
        contentEl = this.renderer.renderCharacter(data, this.reader, this.editMode);
        break;
      case 'image':
        contentEl = this.renderer.renderImage(data, asset.name);
        break;
      default:
        contentEl = this.renderer.renderRawJson(data);
    }

    container.appendChild(contentEl);

    // Listen for input events on contentEditable elements in edit mode
    if (this.editMode === 1) {
      const editables = container.querySelectorAll('[contenteditable="true"]');
      editables.forEach(el => {
        el.addEventListener('input', () => {
          this.modifiedAssetIds.add(asset.id);
          this.updateSaveButton();
        });
      });

      // Bind outline add-child button
      const addChildBtn = container.querySelector('[data-action="add-outline-child"]');
      if (addChildBtn) {
        addChildBtn.addEventListener('click', () => {
          this.createOutlineChild(asset.id);
        });
      }
    }

    return container;
  }

  renderExportButton() {
    const topBarRight = document.querySelector('.top-bar-right');
    if (!topBarRight || this.exportBtn) return;

    this.exportBtn = document.createElement('button');
    this.exportBtn.id = 'export-asset-btn';
    this.exportBtn.className = 'btn-icon';
    this.exportBtn.title = '导出当前资产';
    this.exportBtn.textContent = '⬇️';
    // Insert before the dark-toggle button
    const darkToggle = document.getElementById('dark-toggle');
    topBarRight.insertBefore(this.exportBtn, darkToggle);
  }

  updateExportButton(asset) {
    if (!this.exportBtn) return;
    this.exportBtn.onclick = () => this.exportAsset(asset);
  }

  updateSaveButton() {
    let saveBtn = document.querySelector('.btn-save-floating');
    if (!saveBtn && this.modifiedAssetIds.size > 0 && this.editMode === 1) {
      saveBtn = document.createElement('button');
      saveBtn.className = 'btn-save-floating';
      saveBtn.textContent = '💾 保存修改';
      saveBtn.addEventListener('click', () => this.saveEdits());
      document.body.appendChild(saveBtn);
    }
    if (saveBtn) {
      if (this.modifiedAssetIds.size > 0) {
        saveBtn.classList.add('visible');
      } else {
        saveBtn.classList.remove('visible');
      }
    }
  }

  async saveEdits() {
    if (!this.reader || this.modifiedAssetIds.size === 0) return;

    // Flush current DOM edits to cache first
    if (this.editMode === 1) {
      this.flushCurrentEditsToCache();
    }

    const saveBtn = document.querySelector('.btn-save-floating');
    if (saveBtn) saveBtn.textContent = '保存中...';

    try {
      const { AstnWriter } = await import('./astn-writer.js');
      const writer = new AstnWriter(this.reader, this.renderer);

      // All modified assets are already in reader.assetCache (flushed from DOM)
      // writer.buildAstn will use readAsset which hits cache for all assets
      const astnBuffer = await writer.buildAstn(new Map());

      // Trigger download
      const blob = new Blob([astnBuffer], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const title = this.reader.index?.metadata?.title || 'output';
      a.download = title + '.astn';
      a.click();
      URL.revokeObjectURL(url);

      // Clear modifications
      this.modifiedAssetIds.clear();
      this.updateSaveButton();
      if (saveBtn) saveBtn.textContent = '💾 保存修改';

    } catch (e) {
      this.showError('保存失败: ' + e.message);
      if (saveBtn) saveBtn.textContent = '💾 保存修改';
    }
  }

  async createNewAstn() {
    try {
      const { AstnWriter } = await import('./astn-writer.js');
      const buffer = await AstnWriter.createBlank('新书', '');

      // Parse the generated blank .astn and enter the editing view
      this.reader = new AstnReader(buffer);
      const validation = this.reader.validate();
      if (!validation.valid) {
        this.showError('创建失败: ' + validation.error);
        return;
      }

      const index = await this.reader.readIndex();
      this.coverAssetId = index.metadata.cover_asset_id || null;
      this.showDecoded(index);

      // Auto-select the default outline volume
      const outlineAssets = this.reader.getAssetsByType('outline');
      if (outlineAssets.length > 0) {
        this.selectedAssetId = null; // force select even if same
        this.selectAsset(outlineAssets[0].id);
      }
    } catch (e) {
      this.showError('创建失败: ' + e.message);
    }
  }

  // ---- Asset creation methods (edit mode only) ----

  generateId(prefix) {
    return prefix + Date.now() + '_' + Math.floor(Math.random() * 10000);
  }

  addAssetToRuntime(assetId, type, name, jsonUint8Array) {
    // Add to reader cache so it can be read later
    this.reader.assetCache.set(assetId, jsonUint8Array);
    // Add to index (offset/length are 0 — they'll be properly set on save)
    this.reader.index.assets.push({ id: assetId, type, name, offset: 0, length: 0 });
    // Mark as modified so save includes it
    this.modifiedAssetIds.add(assetId);
  }

  createChapter() {
    const bookId = this._getBookId();
    const chapters = this.reader.getAssetsByType('chapter');
    const id = this.generateId('ch_');
    const obj = {
      id: id,
      bookId: bookId,
      title: '新章节',
      content: '',
      order: chapters.length,
      wordCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    const assetId = 'asset_chap_' + id;
    const data = new TextEncoder().encode(JSON.stringify(obj));
    this.addAssetToRuntime(assetId, 'chapter', '新章节', data);
    this.refreshAllAfterCreate(assetId);
  }

  createCharacter() {
    const bookId = this._getBookId();
    const id = this.generateId('char_');
    const obj = {
      id: id,
      bookId: bookId,
      name: '',
      age: '',
      gender: '',
      height: '',
      weight: '',
      race: '',
      appearance: '',
      personality: '',
      background: '',
      notes: '',
      avatarImageCount: 0,
      extraImageCount: 0
    };
    const assetId = 'asset_char_' + id;
    const data = new TextEncoder().encode(JSON.stringify(obj));
    this.addAssetToRuntime(assetId, 'character', '未命名角色', data);
    this.refreshAllAfterCreate(assetId);
  }

  createWorldSetting(category) {
    const bookId = this._getBookId();
    const id = this.generateId('ws_');
    const fields = this.getWorldSettingFieldTemplate(category);
    const obj = {
      id: id,
      bookId: bookId,
      category: category || 'OTHER',
      title: '',
      fields: fields,
      notes: ''
    };
    const assetId = 'asset_ws_' + id;
    const data = new TextEncoder().encode(JSON.stringify(obj));
    this.addAssetToRuntime(assetId, 'worldview', '', data);
    this.refreshAllAfterCreate(assetId);
  }

  createOutlineChild(parentAssetId) {
    // Create a child outline node under the specified parent
    const parentAsset = this.reader.getAssetById(parentAssetId);
    if (!parentAsset) return;

    // Read parent data to get its internal id and level
    const parentData = this.reader.assetCache.get(parentAssetId);
    if (!parentData) return;
    const parentObj = this.renderer.parseJson(parentData);

    const bookId = this._getBookId();
    const id = this.generateId('ot_');
    const childLevel = (parentObj.level || 0) + 1;
    const siblings = this._getOutlineChildren(parentObj.id);
    const obj = {
      id: id,
      bookId: bookId,
      parentId: parentObj.id,
      level: childLevel,
      title: '',
      content: '',
      notes: '',
      linkedChapterIds: [],
      linkedCharacterIds: [],
      linkedWorldEntryIds: [],
      order: siblings.length,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    const assetId = 'asset_ot_' + id;
    const data = new TextEncoder().encode(JSON.stringify(obj));
    this.addAssetToRuntime(assetId, 'outline', '', data);
    // Expand parent so child is visible
    this.expandedOutlineIds.add(parentAssetId);
    // Rebuild outline tree and refresh
    this.buildOutlineTreeAsync().then(() => {
      this.refreshAllAfterCreate(assetId);
    });
  }

  _getBookId() {
    // Derive from metadata or first asset
    return 'book_' + (this.reader.index?.metadata?.title || 'web');
  }

  _getOutlineChildren(parentInternalId) {
    // Count existing outline assets whose parentId matches
    if (!this.outlineTreeCache) return [];
    const node = this.outlineTreeCache.nodeMap;
    const children = [];
    for (const [, n] of node) {
      if (n.obj && n.obj.parentId === parentInternalId) {
        children.push(n);
      }
    }
    return children;
  }

  getWorldSettingFieldTemplate(category) {
    const templates = {
      'GEOGRAPHY': ['地区名称', '地形地貌', '气候特征', '自然资源', '居民分布', '与相邻地区关系', '备注'],
      'HISTORY': ['事件名称', '发生时间', '关键人物', '事件经过', '影响与后果', '与其他事件关联', '备注'],
      'MAGIC_SYSTEM': ['体系名称', '能量来源', '施法规则', '限制条件', '与其他体系的关系', '备注'],
      'SOCIAL_STRUCTURE': ['组织名称', '组织类型', '层级结构', '权力分布', '核心价值观', '与其他组织关系', '备注'],
      'OTHER': ['条目标题', '详细描述', '备注']
    };
    const keys = templates[category] || templates['OTHER'];
    const fields = {};
    for (const key of keys) {
      fields[key] = '';
    }
    return fields;
  }

  refreshAllAfterCreate(assetId) {
    this.renderSidebar();
    this.renderAssetStats();
    this.updateSaveButton();
    // Select the newly created asset
    this.selectedAssetId = null;
    this.selectAsset(assetId);
  }

  showWorldSettingCategoryPicker() {
    const categories = [
      { value: 'GEOGRAPHY', label: '地理' },
      { value: 'HISTORY', label: '历史' },
      { value: 'MAGIC_SYSTEM', label: '力量体系' },
      { value: 'SOCIAL_STRUCTURE', label: '社会结构' },
      { value: 'OTHER', label: '其他' }
    ];

    // Create inline picker in main content area
    const mainContent = document.getElementById('main-content');
    const container = document.createElement('div');
    container.className = 'category-picker';

    const title = document.createElement('h3');
    title.className = 'category-picker-title';
    title.textContent = '选择世界观类别';
    container.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'category-picker-grid';

    for (const cat of categories) {
      const btn = document.createElement('button');
      btn.className = 'category-picker-btn';
      btn.textContent = cat.label;
      btn.addEventListener('click', () => {
        this.createWorldSetting(cat.value);
      });
      grid.appendChild(btn);
    }

    container.appendChild(grid);
    mainContent.innerHTML = '';
    mainContent.appendChild(container);
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
    this.modifiedAssetIds.clear();
    this.exportBtn = null;
    this.expandedOutlineIds.clear();
    this.outlineTreeCache = null;

    // Remove save button
    const saveBtn = document.querySelector('.btn-save-floating');
    if (saveBtn) saveBtn.remove();

    // Remove edit-mode class
    document.body.classList.remove('edit-mode');

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

  composeFavicon() {
    const bgImg = new Image();
    const fgImg = new Image();
    let loaded = 0;

    const draw = () => {
      if (loaded < 2) return;
      const size = 192;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bgImg, 0, 0, size, size);
      ctx.drawImage(fgImg, 0, 0, size, size);

      const link = document.querySelector("link[rel*='icon']") || document.createElement('link');
      link.rel = 'icon';
      link.type = 'image/png';
      link.href = canvas.toDataURL('image/png');
      if (!link.parentNode) document.head.appendChild(link);
    };

    const onLoad = () => { loaded++; draw(); };

    bgImg.crossOrigin = 'anonymous';
    fgImg.crossOrigin = 'anonymous';
    bgImg.onload = onLoad;
    fgImg.onload = onLoad;
    bgImg.onerror = () => {}; // Fallback: keep existing SVG favicon
    fgImg.onerror = () => {};
    bgImg.src = 'background.png';
    fgImg.src = 'foreground.png';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new App();
});
