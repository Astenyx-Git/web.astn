// astn-renderer.js — Asset type rendering
// Mirrors: entry/src/main/ets/service/AstnImportService.ets (data parsing)

import { ASTN_EDIT_MODE } from './config.js';

export class AstnRenderer {
  constructor() {
    this.imageBlobUrls = new Map();
  }

  revokeAllBlobUrls() {
    for (const url of this.imageBlobUrls.values()) {
      URL.revokeObjectURL(url);
    }
    this.imageBlobUrls.clear();
  }

  getImageBlobUrl(data) {
    const key = data.byteOffset + '_' + data.length;
    if (this.imageBlobUrls.has(key)) {
      return this.imageBlobUrls.get(key);
    }

    const mime = this.detectImageMime(data);
    const blob = new Blob([data], { type: mime });
    const url = URL.createObjectURL(blob);
    this.imageBlobUrls.set(key, url);
    return url;
  }

  detectImageMime(data) {
    if (data.length < 4) return 'image/jpeg';
    if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4E && data[3] === 0x47) {
      return 'image/png';
    }
    if (data[0] === 0xFF && data[1] === 0xD8) {
      return 'image/jpeg';
    }
    if (data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46) {
      return 'image/gif';
    }
    if (data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46) {
      return 'image/webp';
    }
    return 'image/jpeg';
  }

  decodeUtf8(data) {
    return new TextDecoder('utf-8').decode(data);
  }

  parseJson(data) {
    const text = this.decodeUtf8(data);
    return JSON.parse(text);
  }

  // Convert plain text with \n to HTML for contentEditable elements.
  // In contentEditable, \n is not rendered as a line break — need <br> instead.
  textToEditableHtml(text) {
    if (!text) return '';
    return this.escapeHtml(text).replace(/\n/g, '<br>');
  }

  renderChapter(data, editMode) {
    const obj = this.parseJson(data);
    const container = document.createElement('div');
    container.className = 'asset-chapter';
    container.dataset.assetType = 'chapter';

    const title = document.createElement('h2');
    title.className = 'chapter-title asset-content-editable';
    title.textContent = obj.title || '未命名章节';
    if (editMode === 1) {
      title.setAttribute('contenteditable', 'true');
      title.dataset.field = 'title';
    }
    container.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'chapter-meta';
    const wordCount = obj.wordCount || 0;
    const order = obj.order !== undefined ? parseInt(obj.order) + 1 : '';
    meta.innerHTML = `<span>第 ${order} 章</span><span>${wordCount} 字</span>`;
    container.appendChild(meta);

    // Always render content area (even if empty, show editable box in edit mode)
    const content = document.createElement('div');
    content.className = 'chapter-content markdown-body asset-content-editable';
    if (editMode === 1) {
      content.setAttribute('contenteditable', 'true');
      content.dataset.field = 'content';
      content.innerHTML = this.textToEditableHtml(obj.content);
      if (!obj.content) {
        content.classList.add('content-placeholder');
        content.dataset.placeholder = '输入章节内容...';
      }
    } else {
      if (obj.content) {
        content.innerHTML = this.renderMarkdown(obj.content);
      }
    }
    container.appendChild(content);

    return container;
  }

  renderOutline(data, editMode) {
    const obj = this.parseJson(data);
    const container = document.createElement('div');
    container.className = 'asset-outline';
    container.dataset.assetType = 'outline';

    const header = document.createElement('div');
    header.className = 'outline-detail-header';

    const title = document.createElement('h2');
    title.className = 'outline-detail-title asset-content-editable';
    title.textContent = obj.title || '未命名大纲';
    if (editMode === 1) {
      title.setAttribute('contenteditable', 'true');
      title.dataset.field = 'title';
    }
    header.appendChild(title);

    const levelBadge = document.createElement('span');
    levelBadge.className = 'outline-level-badge';
    const levelLabels = ['卷', '章', '节'];
    levelBadge.textContent = levelLabels[obj.level] || '节点';
    header.appendChild(levelBadge);

    container.appendChild(header);

    // Content section — always render in edit mode
    if (editMode === 1 || obj.content) {
      const contentSection = document.createElement('div');
      contentSection.className = 'outline-detail-section';

      const contentLabel = document.createElement('div');
      contentLabel.className = 'outline-detail-label';
      contentLabel.textContent = '内容';
      contentSection.appendChild(contentLabel);

      const content = document.createElement('div');
      content.className = 'outline-content asset-content-editable';
      if (editMode === 1) {
        content.setAttribute('contenteditable', 'true');
        content.dataset.field = 'content';
        content.innerHTML = this.textToEditableHtml(obj.content);
        if (!obj.content) {
          content.classList.add('content-placeholder');
          content.dataset.placeholder = '输入大纲内容...';
        }
      } else {
        content.textContent = obj.content || '';
      }
      contentSection.appendChild(content);
      container.appendChild(contentSection);
    }

    // Notes section — always render in edit mode
    if (editMode === 1 || obj.notes) {
      const notesSection = document.createElement('div');
      notesSection.className = 'outline-detail-section';

      const notesLabel = document.createElement('div');
      notesLabel.className = 'outline-detail-label';
      notesLabel.textContent = '备注';
      notesSection.appendChild(notesLabel);

      const notes = document.createElement('div');
      notes.className = 'outline-notes asset-content-editable';
      if (editMode === 1) {
        notes.setAttribute('contenteditable', 'true');
        notes.dataset.field = 'notes';
        notes.innerHTML = this.textToEditableHtml(obj.notes);
        if (!obj.notes) {
          notes.classList.add('content-placeholder');
          notes.dataset.placeholder = '输入备注...';
        }
      } else {
        notes.textContent = obj.notes || '';
      }
      notesSection.appendChild(notes);
      container.appendChild(notesSection);
    }

    // Show linked references if present
    const linkedRefs = [];
    if (obj.linkedChapterIds && obj.linkedChapterIds.length > 0) {
      linkedRefs.push({ label: '章节', ids: obj.linkedChapterIds });
    }
    if (obj.linkedCharacterIds && obj.linkedCharacterIds.length > 0) {
      linkedRefs.push({ label: '角色', ids: obj.linkedCharacterIds });
    }
    if (obj.linkedWorldEntryIds && obj.linkedWorldEntryIds.length > 0) {
      linkedRefs.push({ label: '世界观', ids: obj.linkedWorldEntryIds });
    }
    if (linkedRefs.length > 0) {
      const refsSection = document.createElement('div');
      refsSection.className = 'outline-detail-section';

      const refsLabel = document.createElement('div');
      refsLabel.className = 'outline-detail-label';
      refsLabel.textContent = '关联';
      refsSection.appendChild(refsLabel);

      const refsList = document.createElement('div');
      refsList.className = 'outline-linked-refs';
      for (const ref of linkedRefs) {
        const badge = document.createElement('span');
        badge.className = 'outline-ref-badge';
        badge.textContent = `${ref.label} ${ref.ids.length}`;
        refsList.appendChild(badge);
      }
      refsSection.appendChild(refsList);
      container.appendChild(refsSection);
    }

    // Add child outline button in edit mode (max 3 levels: 卷0 → 章1 → 节2, no children beyond 节)
    if (editMode === 1 && (obj.level || 0) < 2) {
      const addAction = document.createElement('div');
      addAction.className = 'outline-add-child-section';

      const addBtn = document.createElement('button');
      addBtn.className = 'outline-add-child-btn';
      const levelLabels = ['卷', '章', '节'];
      const childLevel = (obj.level || 0) + 1;
      addBtn.textContent = '+ 添加子' + levelLabels[childLevel];
      addBtn.dataset.action = 'add-outline-child';
      addAction.appendChild(addBtn);
      container.appendChild(addAction);
    }

    return container;
  }

  renderWorldSetting(data, editMode) {
    const obj = this.parseJson(data);
    const container = document.createElement('div');
    container.className = 'asset-worldsetting';
    container.dataset.assetType = 'worldview';

    const categoryNames = {
      'GEOGRAPHY': '地理',
      'HISTORY': '历史',
      'MAGIC_SYSTEM': '力量体系',
      'SOCIAL_STRUCTURE': '社会结构',
      'OTHER': '其他'
    };

    const header = document.createElement('div');
    header.className = 'ws-header';

    const categoryBadge = document.createElement('span');
    categoryBadge.className = 'ws-category-badge';
    categoryBadge.textContent = categoryNames[obj.category] || obj.category || '其他';
    header.appendChild(categoryBadge);

    const title = document.createElement('h2');
    title.className = 'ws-title asset-content-editable';
    title.textContent = obj.title || '未命名设定';
    if (editMode === 1) {
      title.setAttribute('contenteditable', 'true');
      title.dataset.field = 'title';
    }
    header.appendChild(title);

    container.appendChild(header);

    // Fields — render all keys in edit mode, or only non-empty in view mode
    if (editMode === 1 || (obj.fields && typeof obj.fields === 'object')) {
      const table = document.createElement('div');
      table.className = 'ws-fields';

      const keys = obj.fields && typeof obj.fields === 'object' ? Object.keys(obj.fields) : [];
      // In edit mode, always show at least one empty row for new field entry
      const displayKeys = editMode === 1 && keys.length === 0 ? [''] : keys;

      for (const key of displayKeys) {
        const value = (obj.fields && obj.fields[key]) || '';
        if (editMode === 1 || (value && value.trim())) {
          const row = document.createElement('div');
          row.className = 'ws-field-row';

          const label = document.createElement('div');
          label.className = 'ws-field-label asset-content-editable';
          label.textContent = key;
          if (editMode === 1) {
            label.setAttribute('contenteditable', 'true');
            label.dataset.field = 'ws-field-key-' + key;
          }
          row.appendChild(label);

          const val = document.createElement('div');
          val.className = 'ws-field-value asset-content-editable';
          if (editMode === 1) {
            val.setAttribute('contenteditable', 'true');
            val.dataset.field = 'ws-field-val-' + key;
            val.innerHTML = this.textToEditableHtml(value);
            if (!value) {
              val.classList.add('content-placeholder');
              val.dataset.placeholder = '输入内容...';
            }
          } else {
            val.textContent = value;
          }
          row.appendChild(val);

          table.appendChild(row);
        }
      }

      container.appendChild(table);
    }

    // Notes — always render in edit mode
    if (editMode === 1 || obj.notes) {
      const notes = document.createElement('div');
      notes.className = 'ws-notes asset-content-editable';
      if (editMode === 1) {
        const notesLabel = document.createElement('div');
        notesLabel.className = 'outline-detail-label';
        notesLabel.textContent = '备注';
        notes.appendChild(notesLabel);
        const notesContent = document.createElement('div');
        notesContent.className = 'ws-notes-content asset-content-editable';
        notesContent.innerHTML = this.textToEditableHtml(obj.notes);
        notesContent.setAttribute('contenteditable', 'true');
        notesContent.dataset.field = 'notes';
        if (!obj.notes) {
          notesContent.classList.add('content-placeholder');
          notesContent.dataset.placeholder = '输入备注...';
        }
        notes.appendChild(notesContent);
      } else {
        notes.innerHTML = `<strong>备注:</strong> ${this.escapeHtml(obj.notes)}`;
      }
      container.appendChild(notes);
    }

    return container;
  }

  renderCharacter(data, reader, editMode) {
    const obj = this.parseJson(data);
    const container = document.createElement('div');
    container.className = 'asset-character';
    container.dataset.assetType = 'character';

    const header = document.createElement('div');
    header.className = 'char-header';

    const charId = obj.id || '';

    if (reader && charId) {
      const images = reader.findCharacterImages(charId, reader.index ? reader.index.assets : []);
      if (images.avatar) {
        const avatarEl = document.createElement('div');
        avatarEl.className = 'char-avatar-placeholder';
        avatarEl.textContent = '...';
        header.appendChild(avatarEl);

        reader.readAsset(images.avatar).then(imgData => {
          const url = this.getImageBlobUrl(imgData);
          avatarEl.innerHTML = '';
          avatarEl.className = 'char-avatar';
          const img = document.createElement('img');
          img.src = url;
          img.alt = obj.name || '头像';
          avatarEl.appendChild(img);
        }).catch(() => {
          avatarEl.textContent = obj.name ? obj.name.charAt(0) : '?';
          avatarEl.className = 'char-avatar-fallback';
        });
      } else {
        const fallback = document.createElement('div');
        fallback.className = 'char-avatar-fallback';
        fallback.textContent = obj.name ? obj.name.charAt(0) : '?';
        header.appendChild(fallback);
      }
    } else {
      const fallback = document.createElement('div');
      fallback.className = 'char-avatar-fallback';
      fallback.textContent = obj.name ? obj.name.charAt(0) : '?';
      header.appendChild(fallback);
    }

    const info = document.createElement('div');
    info.className = 'char-info';

    const name = document.createElement('h2');
    name.className = 'char-name asset-content-editable';
    name.textContent = obj.name || '未命名角色';
    if (editMode === 1) {
      name.setAttribute('contenteditable', 'true');
      name.dataset.field = 'name';
    }
    info.appendChild(name);

    const quickInfo = document.createElement('div');
    quickInfo.className = 'char-quick-info asset-content-editable';
    const parts = [];
    if (obj.race) parts.push(obj.race);
    if (obj.gender) parts.push(obj.gender);
    if (obj.age) parts.push(obj.age + '岁');
    quickInfo.textContent = parts.join(' · ');
    if (editMode === 1) {
      quickInfo.setAttribute('contenteditable', 'true');
      quickInfo.dataset.field = 'quickInfo';
      if (parts.length === 0) {
        quickInfo.classList.add('content-placeholder');
        quickInfo.dataset.placeholder = '种族 · 性别 · 年龄';
      }
    }
    info.appendChild(quickInfo);

    header.appendChild(info);
    container.appendChild(header);

    const details = document.createElement('div');
    details.className = 'char-details';

    const fields = [
      { key: 'appearance', label: '外貌' },
      { key: 'personality', label: '性格' },
      { key: 'background', label: '背景' },
      { key: 'notes', label: '备注' }
    ];

    for (const field of fields) {
      // In edit mode, always render (even if empty); in view mode, only if non-empty
      if (editMode === 1 || obj[field.key]) {
        const section = document.createElement('div');
        section.className = 'char-field';

        const label = document.createElement('div');
        label.className = 'char-field-label';
        label.textContent = field.label;
        section.appendChild(label);

        const value = document.createElement('div');
        value.className = 'char-field-value asset-content-editable';
        if (editMode === 1) {
          value.setAttribute('contenteditable', 'true');
          value.dataset.field = field.key;
          value.innerHTML = this.textToEditableHtml(obj[field.key]);
          if (!obj[field.key]) {
            value.classList.add('content-placeholder');
            value.dataset.placeholder = '点击输入...';
          }
        } else {
          value.textContent = obj[field.key] || '';
        }
        section.appendChild(value);

        details.appendChild(section);
      }
    }

    const basicFields = [
      { key: 'height', label: '身高' },
      { key: 'weight', label: '体重' }
    ];

    const basicRow = document.createElement('div');
    basicRow.className = 'char-basic-row';
    for (const bf of basicFields) {
      if (obj[bf.key]) {
        const item = document.createElement('span');
        item.className = 'char-basic-item';
        item.innerHTML = `<strong>${bf.label}:</strong> ${this.escapeHtml(obj[bf.key])}`;
        basicRow.appendChild(item);
      }
    }
    if (basicRow.children.length > 0) {
      details.insertBefore(basicRow, details.firstChild);
    }

    container.appendChild(details);

    if (reader && charId) {
      const images = reader.findCharacterImages(charId, reader.index ? reader.index.assets : []);
      if (images.gallery.length > 0) {
        const gallery = document.createElement('div');
        gallery.className = 'char-gallery';

        const galleryTitle = document.createElement('div');
        galleryTitle.className = 'char-gallery-title';
        galleryTitle.textContent = `相册 (${images.gallery.length})`;
        gallery.appendChild(galleryTitle);

        const galleryGrid = document.createElement('div');
        galleryGrid.className = 'char-gallery-grid';

        for (const imgAsset of images.gallery) {
          const thumb = document.createElement('div');
          thumb.className = 'char-gallery-thumb';
          thumb.textContent = '...';

          reader.readAsset(imgAsset).then(imgData => {
            const url = this.getImageBlobUrl(imgData);
            thumb.innerHTML = '';
            const img = document.createElement('img');
            img.src = url;
            img.alt = imgAsset.name;
            img.addEventListener('click', () => {
              this.showImageModal(url, imgAsset.name);
            });
            thumb.appendChild(img);
          }).catch(() => {
            thumb.textContent = '加载失败';
          });

          galleryGrid.appendChild(thumb);
        }

        gallery.appendChild(galleryGrid);
        container.appendChild(gallery);
      }
    }

    return container;
  }

  renderImage(data, name) {
    const container = document.createElement('div');
    container.className = 'asset-image';

    const url = this.getImageBlobUrl(data);

    const img = document.createElement('img');
    img.className = 'asset-image-img';
    img.src = url;
    img.alt = name || '图片';
    container.appendChild(img);

    const info = document.createElement('div');
    info.className = 'asset-image-info';
    const mime = this.detectImageMime(data);
    const sizeKB = (data.length / 1024).toFixed(1);
    info.textContent = `${name || '图片'} · ${mime.split('/')[1].toUpperCase()} · ${sizeKB} KB`;
    container.appendChild(info);

    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'btn-download';
    downloadBtn.textContent = '下载图片';
    downloadBtn.addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = url;
      const ext = mime.split('/')[1] === 'jpeg' ? 'jpg' : mime.split('/')[1];
      a.download = (name || 'image') + '.' + ext;
      a.click();
    });
    container.appendChild(downloadBtn);

    return container;
  }

  renderRawJson(data) {
    const container = document.createElement('div');
    container.className = 'asset-raw';

    const text = this.decodeUtf8(data);
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      const pre = document.createElement('pre');
      pre.className = 'raw-text';
      pre.textContent = text;
      container.appendChild(pre);
      return container;
    }

    const pre = document.createElement('pre');
    pre.className = 'raw-json';
    pre.textContent = JSON.stringify(parsed, null, 2);
    container.appendChild(pre);

    return container;
  }

  renderMarkdown(text) {
    let html = this.escapeHtml(text);

    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    html = html.replace(/^\* (.+)$/gm, '<li>$1</li>');
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

    html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

    html = html.replace(/\n\n/g, '</p><p>');
    html = html.replace(/\n/g, '<br>');

    html = '<p>' + html + '</p>';

    html = html.replace(/<p>\s*(<h[1-3]>)/g, '$1');
    html = html.replace(/(<\/h[1-3]>)\s*<\/p>/g, '$1');
    html = html.replace(/<p>\s*(<ul>)/g, '$1');
    html = html.replace(/(<\/ul>)\s*<\/p>/g, '$1');

    return html;
  }

  showImageModal(url, name) {
    const existing = document.querySelector('.image-modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'image-modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'image-modal';

    const img = document.createElement('img');
    img.src = url;
    img.alt = name || '图片';
    modal.appendChild(img);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'image-modal-close';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', () => overlay.remove());
    modal.appendChild(closeBtn);

    overlay.appendChild(modal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    document.body.appendChild(overlay);
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  getAssetIcon(type) {
    // Emoji removed — pure text labels only
    return '';
  }

  extractEditedData(assetType, containerEl) {
    switch (assetType) {
      case 'chapter':
        return this._extractChapterData(containerEl);
      case 'outline':
        return this._extractOutlineData(containerEl);
      case 'worldview':
        return this._extractWorldSettingData(containerEl);
      case 'character':
        return this._extractCharacterData(containerEl);
      default:
        return null;
    }
  }

  _extractChapterData(containerEl) {
    const result = {};
    const titleEl = containerEl.querySelector('.chapter-title');
    if (titleEl) result.title = titleEl.textContent;

    const contentEl = containerEl.querySelector('.chapter-content[data-field="content"]');
    if (contentEl) result.content = contentEl.innerText;

    // Preserve non-editable fields from the original meta
    const metaEl = containerEl.querySelector('.chapter-meta');
    if (metaEl) {
      const spans = metaEl.querySelectorAll('span');
      if (spans.length >= 1) {
        const orderText = spans[0].textContent;
        const orderMatch = orderText.match(/(\d+)/);
        if (orderMatch) result.order = parseInt(orderMatch[1]) - 1;
      }
    }

    return result;
  }

  _extractOutlineData(containerEl) {
    const result = {};
    const titleEl = containerEl.querySelector('.outline-detail-title[data-field="title"]');
    if (titleEl) {
      result.title = titleEl.textContent;
    } else {
      // Fallback for non-edit mode
      const titleFallback = containerEl.querySelector('.outline-detail-title');
      if (titleFallback) result.title = titleFallback.textContent;
    }

    const contentEl = containerEl.querySelector('.outline-content[data-field="content"]');
    if (contentEl) result.content = contentEl.innerText;

    const notesEl = containerEl.querySelector('.outline-notes[data-field="notes"]');
    if (notesEl) result.notes = notesEl.innerText;

    const badgeEl = containerEl.querySelector('.outline-level-badge');
    if (badgeEl) {
      const levelMap = { '卷': 0, '章': 1, '节': 2 };
      result.level = levelMap[badgeEl.textContent] ?? 0;
    }

    return result;
  }

  _extractWorldSettingData(containerEl) {
    const result = {};
    const titleEl = containerEl.querySelector('.ws-title[data-field="title"]');
    if (titleEl) result.title = titleEl.textContent;

    const badgeEl = containerEl.querySelector('.ws-category-badge');
    if (badgeEl) {
      const categoryMap = {
        '地理': 'GEOGRAPHY', '历史': 'HISTORY', '力量体系': 'MAGIC_SYSTEM',
        '社会结构': 'SOCIAL_STRUCTURE', '其他': 'OTHER'
      };
      result.category = categoryMap[badgeEl.textContent] || badgeEl.textContent;
    }

    // Extract field key+value pairs from rows
    const fieldRows = containerEl.querySelectorAll('.ws-field-row');
    const fields = {};
    fieldRows.forEach(row => {
      const keyEl = row.querySelector('.ws-field-label');
      const valEl = row.querySelector('.ws-field-value');
      if (keyEl && valEl) {
        const key = keyEl.textContent.trim();
        const val = valEl.innerText.trim();
        if (key) fields[key] = val;
      }
    });
    if (Object.keys(fields).length > 0) result.fields = fields;

    // Extract notes
    const notesEl = containerEl.querySelector('.ws-notes-content[data-field="notes"]');
    if (notesEl) result.notes = notesEl.innerText;

    return result;
  }

  _extractCharacterData(containerEl) {
    const result = {};

    const nameEl = containerEl.querySelector('.char-name[data-field="name"]');
    if (nameEl) result.name = nameEl.textContent;

    const quickInfoEl = containerEl.querySelector('.char-quick-info[data-field="quickInfo"]');
    if (quickInfoEl) {
      const parts = quickInfoEl.textContent.split(' · ').map(s => s.trim()).filter(Boolean);
      // Attempt to parse race, gender, age
      const ageIdx = parts.findIndex(p => p.endsWith('岁'));
      if (ageIdx >= 0) {
        result.age = parseInt(parts[ageIdx]) || parts[ageIdx].replace('岁', '');
        parts.splice(ageIdx, 1);
      }
      if (parts.length >= 2) {
        result.race = parts[0];
        result.gender = parts[1];
      } else if (parts.length === 1) {
        result.race = parts[0];
      }
    }

    // Extract detail fields
    const detailFields = ['appearance', 'personality', 'background', 'notes'];
    for (const key of detailFields) {
      const el = containerEl.querySelector(`.char-field-value[data-field="${key}"]`);
      if (el) result[key] = el.innerText;
    }

    // Extract basic fields
    const basicItems = containerEl.querySelectorAll('.char-basic-item');
    basicItems.forEach(item => {
      const text = item.textContent;
      if (text.includes('身高:')) result.height = text.replace('身高:', '').trim();
      if (text.includes('体重:')) result.weight = text.replace('体重:', '').trim();
    });

    return result;
  }

  getTypeLabel(type) {
    const labels = {
      'chapter': '章节',
      'outline': '大纲',
      'worldview': '世界观',
      'character': '角色'
    };
    return labels[type] || type;
  }

  getTypeOrder(type) {
    const order = {
      'chapter': 0,
      'outline': 1,
      'worldview': 2,
      'character': 3
    };
    return order[type] !== undefined ? order[type] : 99;
  }
}
