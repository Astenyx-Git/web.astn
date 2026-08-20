# ASTN Web Decoder

浏览器端的 [AstNovel] `.astn` 格式文件查看器。

## 功能

- 文件格式校验（头部 ASTN + 尾部 OVEL 魔数验证）
- 索引表解密与展示
- 全部资产类型的浏览：
  -  **章节** — Markdown 内容渲染
  -  **角色卡** — 完整档案 + 头像/相册
  -  **世界观** — 分类字段表格
  -  **大纲** — 层级标签展示
  -  **图片** — 封面、头像、相册在线预览
- 单个资产导出（JSON / 图片下载）
- 暗色/亮色主题切换
- 响应式布局（桌面/移动端）
- GitHub Pages 兼容

## 技术细节

### 加密方案

| 组件 | 算法 |
|------|------|
| 密钥派生 | PBKDF2-HMAC-SHA256 (10000 iterations, 256-bit key) |
| 数据加密 | AES-256-GCM (12-byte nonce, 128-bit auth tag) |

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
