// astn-renderer.js — Asset type rendering
// Mirrors: entry/src/main/ets/service/AstnImportService.ets (data parsing)

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

  renderChapter(data) {
    const obj = this.parseJson(data);
    const container = document.createElement('div');
    container.className = 'asset-chapter';

    const title = document.createElement('h2');
    title.className = 'chapter-title';
    title.textContent = obj.title || '未命名章节';
    container.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'chapter-meta';
    const wordCount = obj.wordCount || 0;
    const order = obj.order !== undefined ? parseInt(obj.order) + 1 : '';
    meta.innerHTML = `<span>第 ${order} 章</span><span>${wordCount} 字</span>`;
    container.appendChild(meta);

    if (obj.content) {
      const content = document.createElement('div');
      content.className = 'chapter-content markdown-body';
      content.innerHTML = this.renderMarkdown(obj.content);
      container.appendChild(content);
    }

    return container;
  }

  renderOutline(data) {
    const obj = this.parseJson(data);
    const container = document.createElement('div');
    container.className = 'asset-outline';

    const title = document.createElement('h2');
    title.className = 'outline-title';
    title.textContent = obj.title || '未命名大纲';
    container.appendChild(title);

    const levelLabel = document.createElement('span');
    levelLabel.className = 'outline-level-badge';
    const levelLabels = ['卷', '章', '节'];
    levelLabel.textContent = levelLabels[obj.level] || '节点';
    title.appendChild(levelLabel);

    if (obj.content) {
      const content = document.createElement('div');
      content.className = 'outline-content';
      content.textContent = obj.content;
      container.appendChild(content);
    }

    if (obj.notes) {
      const notes = document.createElement('div');
      notes.className = 'outline-notes';
      notes.innerHTML = `<strong>备注:</strong> ${this.escapeHtml(obj.notes)}`;
      container.appendChild(notes);
    }

    return container;
  }

  renderWorldSetting(data) {
    const obj = this.parseJson(data);
    const container = document.createElement('div');
    container.className = 'asset-worldsetting';

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
    title.className = 'ws-title';
    title.textContent = obj.title || '未命名设定';
    header.appendChild(title);

    container.appendChild(header);

    if (obj.fields && typeof obj.fields === 'object') {
      const table = document.createElement('div');
      table.className = 'ws-fields';

      const keys = Object.keys(obj.fields);
      for (const key of keys) {
        const value = obj.fields[key];
        if (value && value.trim()) {
          const row = document.createElement('div');
          row.className = 'ws-field-row';

          const label = document.createElement('div');
          label.className = 'ws-field-label';
          label.textContent = key;
          row.appendChild(label);

          const val = document.createElement('div');
          val.className = 'ws-field-value';
          val.textContent = value;
          row.appendChild(val);

          table.appendChild(row);
        }
      }

      container.appendChild(table);
    }

    if (obj.notes) {
      const notes = document.createElement('div');
      notes.className = 'ws-notes';
      notes.innerHTML = `<strong>备注:</strong> ${this.escapeHtml(obj.notes)}`;
      container.appendChild(notes);
    }

    return container;
  }

  renderCharacter(data, reader) {
    const obj = this.parseJson(data);
    const container = document.createElement('div');
    container.className = 'asset-character';

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
    name.className = 'char-name';
    name.textContent = obj.name || '未命名角色';
    info.appendChild(name);

    const quickInfo = document.createElement('div');
    quickInfo.className = 'char-quick-info';
    const parts = [];
    if (obj.race) parts.push(obj.race);
    if (obj.gender) parts.push(obj.gender);
    if (obj.age) parts.push(obj.age + '岁');
    quickInfo.textContent = parts.join(' · ');
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
      if (obj[field.key]) {
        const section = document.createElement('div');
        section.className = 'char-field';

        const label = document.createElement('div');
        label.className = 'char-field-label';
        label.textContent = field.label;
        section.appendChild(label);

        const value = document.createElement('div');
        value.className = 'char-field-value';
        value.textContent = obj[field.key];
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
    const icons = {
      'chapter': '📝',
      'outline': '🌳',
      'worldview': '🌍',
      'character': '👤',
      'image': '🖼️'
    };
    return icons[type] || '📦';
  }

  getTypeLabel(type) {
    const labels = {
      'chapter': '章节',
      'outline': '大纲',
      'worldview': '世界观',
      'character': '角色',
      'image': '图片'
    };
    return labels[type] || type;
  }

  getTypeOrder(type) {
    const order = {
      'chapter': 0,
      'outline': 1,
      'worldview': 2,
      'character': 3,
      'image': 4
    };
    return order[type] !== undefined ? order[type] : 99;
  }
}
