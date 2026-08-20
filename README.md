# ASTN Web Decoder

浏览器端的 [AstNovel](https://github.com/Astenyx/AstNovel-astn) `.astn` 加密文件解码器。

完全离线运行 — 所有解密操作通过 Web Crypto API 在浏览器本地完成，文件数据不会上传至任何服务器。

## 功能

- 文件格式校验（头部 ASTN + 尾部 OVEL 魔数验证）
- 索引表解密与展示
- 全部资产类型的浏览：
  - 📝 **章节** — Markdown 内容渲染
  - 👤 **角色卡** — 完整档案 + 头像/相册
  - 🌍 **世界观** — 分类字段表格
  - 🌳 **大纲** — 层级标签展示
  - 🖼️ **图片** — 封面、头像、相册在线预览
- 单个资产导出（JSON / 图片下载）
- 暗色/亮色主题切换
- 响应式布局（桌面/移动端）
- GitHub Pages 兼容

## 使用方式

### 在线使用

直接打开 `index.html` 即可，无需服务器。

### 本地运行

由于 Web Crypto API 要求安全上下文（HTTPS 或 localhost），本地开发时需要使用本地服务器：

```bash
# 方式一：npx serve
npx serve .

# 方式二：Python
python3 -m http.server 8000

# 方式三：VS Code Live Server 插件
```

然后访问 `http://localhost:8000`（或对应端口）。

### GitHub Pages 部署

1. 将 `astn-web-decoder/` 目录推送到 GitHub 仓库
2. 进入仓库 Settings → Pages
3. Source 选择分支 + 目录（`/` 或 `/astn-web-decoder`）
4. 保存后即可通过 `https://<username>.github.io/<repo>/` 访问

## 技术细节

### .astn 文件格式

ASTN v2.0 是一种加密二进制容器格式，布局如下：

```
[4B  "ASTN"] [16B Salt] [4B IndexLen] [NB EncryptedIndex] [AssetChunks...] [4B "OVEL"]
```

每个加密 chunk：`[12B Nonce] [NB Ciphertext] [16B AuthTag]`

### 加密方案

| 组件 | 算法 |
|------|------|
| 密钥派生 | PBKDF2-HMAC-SHA256 (10000 iterations, 256-bit key) |
| 数据加密 | AES-256-GCM (12-byte nonce, 128-bit auth tag) |
| 主密钥 | 硬编码常量 (与 AstNovel 应用一致) |

### Web Crypto API 映射

ArkTS `CryptoArchitectureKit` → Web Crypto API:

- `PBKDF2` → `crypto.subtle.deriveKey({name:'PBKDF2', ...})`
- `AES-256-GCM` → `crypto.subtle.decrypt({name:'AES-GCM', tagLength:128, iv:nonce}, key, ciphertext‖authTag)`
- AuthTag 需要与密文拼接为单个 `ArrayBuffer` 传入 `decrypt()`

## 项目结构

```
astn-web-decoder/
├── index.html          # 入口页面
├── css/
│   └── style.css       # 样式 (亮/暗主题, 响应式)
├── js/
│   ├── astn-crypto.js  # 加密模块 (PBKDF2 + AES-GCM)
│   ├── astn-reader.js  # 二进制解析器
│   ├── astn-renderer.js # 资产渲染器
│   └── app.js          # 主 UI 控制器
├── favicon.svg         # 图标
└── README.md           # 本文件
```

## 浏览器兼容性

| 浏览器 | 最低版本 |
|--------|---------|
| Chrome | 37+ |
| Firefox | 34+ |
| Safari | 7+ |
| Edge | 12+ |

需要 HTTPS 或 localhost 环境以启用 `crypto.subtle`。

## 许可证

Copyright &copy; 2026 Astenyx. All rights reserved.
