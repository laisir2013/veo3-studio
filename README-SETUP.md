# VEO3-STUDIO 完整安裝指南

## 📋 系統需求

- **Node.js**: 18.x 或更高版本
- **pnpm**: 8.x 或更高版本
- **數據庫**: TiDB Cloud 或 MySQL 8.0+
- **操作系統**: Linux, macOS, Windows

## 🚀 快速開始

### 1. 解壓縮專案

```bash
unzip veo3-studio-complete.zip
cd veo3-studio
```

### 2. 安裝依賴

```bash
pnpm install
```

### 3. 配置環境變數

```bash
# 複製範例文件
cp .env.example .env

# 編輯 .env 文件，填入您的 API 密鑰
nano .env
```

### 4. 初始化數據庫

```bash
# 推送數據庫 schema
pnpm db:push
```

### 5. 啟動開發服務器

```bash
pnpm dev
```

服務器將在 http://localhost:5000 啟動

## 📁 專案結構

```
veo3-studio/
├── client/                 # 前端 React 應用
│   ├── src/
│   │   ├── components/     # UI 組件
│   │   ├── pages/          # 頁面組件
│   │   ├── hooks/          # 自定義 Hooks
│   │   ├── lib/            # 工具函數
│   │   └── main.tsx        # 入口文件
│   └── index.html
├── server/                 # 後端 Express + tRPC
│   ├── _core/              # 核心模塊
│   ├── routers.ts          # API 路由
│   ├── videoService.ts     # 視頻生成服務
│   ├── videoMergeService.ts # 視頻合併服務
│   ├── voiceService.ts     # 語音服務
│   └── ...
├── drizzle/                # 數據庫 Schema
│   └── schema.ts
├── shared/                 # 前後端共享代碼
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## 🔑 API 密鑰配置

### 必要的 API

| API | 用途 | 獲取地址 |
|-----|------|---------|
| OpenAI | LLM 文本生成 | https://platform.openai.com |
| VectorEngine | 視頻生成 | 內部 API |
| FAL.AI | 圖片生成 | https://fal.ai |

### 可選的 API

| API | 用途 | 獲取地址 |
|-----|------|---------|
| Kreado TTS | 語音合成 | https://kreado.ai |
| Fish Audio | 語音克隆 | https://fish.audio |
| Cloudflare R2 | 視頻存儲 | https://cloudflare.com |

## 🗄️ 數據庫配置

### 使用 TiDB Cloud (推薦)

1. 前往 https://tidbcloud.com 創建免費集群
2. 獲取連接字符串
3. 填入 `.env` 的 `DATABASE_URL`

### 使用本地 MySQL

```bash
# 創建數據庫
mysql -u root -p -e "CREATE DATABASE veo3studio;"

# 配置連接字符串
DATABASE_URL=mysql://root:password@localhost:3306/veo3studio
```

## 🌐 部署到生產環境

### 部署到 Render

1. 連接 GitHub 倉庫
2. 選擇 Web Service
3. 設置環境變數
4. 部署

### 部署到 Railway

```bash
railway login
railway init
railway up
```

## 📝 常用命令

```bash
# 開發模式
pnpm dev

# 構建生產版本
pnpm build

# 啟動生產服務器
pnpm start

# 數據庫遷移
pnpm db:push

# 類型檢查
pnpm typecheck

# 代碼檢查
pnpm lint
```

## 🔧 故障排除

### 問題：pnpm install 失敗

```bash
# 清除緩存
pnpm store prune
rm -rf node_modules
pnpm install
```

### 問題：數據庫連接失敗

1. 確認 DATABASE_URL 格式正確
2. 確認數據庫服務正在運行
3. 確認網絡連接正常

### 問題：視頻生成失敗

1. 確認 API 密鑰有效
2. 檢查 API 配額
3. 查看服務器日誌

## 📞 支持

如有問題，請查看日誌或聯繫開發者。

---

**版本**: 1.0.0  
**最後更新**: 2024-12-28
