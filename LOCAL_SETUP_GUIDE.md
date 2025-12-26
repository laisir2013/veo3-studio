# VEO3 應用本地運行指南

## 📋 系統要求

- **操作系統**：Windows、macOS 或 Linux
- **Node.js**：版本 18.0 或更高
- **pnpm**：版本 8.0 或更高（包管理工具）
- **MySQL**：版本 8.0 或更高（數據庫）
- **磁盤空間**：至少 5GB

## 🚀 快速開始（5 分鐘）

### 第 1 步：安裝 Node.js

1. 訪問 [Node.js 官網](https://nodejs.org/)
2. 下載 LTS 版本（推薦 v20 或更高）
3. 按照安裝程序完成安裝
4. 驗證安裝：打開終端/命令提示符，輸入：
   ```bash
   node --version
   npm --version
   ```

### 第 2 步：安裝 pnpm

在終端/命令提示符中輸入：

```bash
npm install -g pnpm
```

驗證安裝：
```bash
pnpm --version
```

### 第 3 步：下載項目

1. 從 Google Drive 下載 `veo3-source-latest.tar.gz`
2. 解壓縮到您的電腦上（例如：`C:\veo3` 或 `~/veo3`）

### 第 4 步：安裝依賴

打開終端/命令提示符，進入項目目錄：

```bash
cd veo3-source
pnpm install
```

這個過程會自動下載所有需要的依賴包（可能需要 5-10 分鐘）。

### 第 5 步：配置環境變量

1. 在項目根目錄中找到 `.env.example` 文件
2. 複製為 `.env.local`
3. 編輯 `.env.local`，填入您的 API 密鑰：

```env
# API 配置
VITE_API_URL=http://localhost:5173
VITE_API_BASE=http://localhost:3000

# 數據庫配置（如果需要）
DATABASE_URL=mysql://user:password@localhost:3306/veo3

# API 密鑰
OPENAI_API_KEY=your_api_key_here
```

### 第 6 步：啟動應用

```bash
pnpm dev
```

應用會在以下地址啟動：
- **前端**：http://localhost:5173
- **後端**：http://localhost:3000

在瀏覽器中打開 http://localhost:5173 即可開始使用！

## 📝 詳細配置說明

### 環境變量

| 變量名 | 說明 | 示例 |
|--------|------|------|
| `VITE_API_URL` | 前端 API 地址 | `http://localhost:5173` |
| `VITE_API_BASE` | 後端 API 地址 | `http://localhost:3000` |
| `DATABASE_URL` | MySQL 數據庫連接字符串 | `mysql://user:pass@localhost:3306/veo3` |
| `OPENAI_API_KEY` | OpenAI API 密鑰 | `sk-...` |

### 數據庫設置（可選）

如果您想使用數據庫功能：

1. 安裝 MySQL：
   - Windows：下載 [MySQL Installer](https://dev.mysql.com/downloads/mysql/)
   - macOS：使用 Homebrew：`brew install mysql`
   - Linux：使用包管理器：`sudo apt install mysql-server`

2. 創建數據庫：
   ```bash
   mysql -u root -p
   CREATE DATABASE veo3;
   EXIT;
   ```

3. 運行遷移：
   ```bash
   pnpm db:push
   ```

## 🛠️ 常見命令

```bash
# 開發模式（帶熱重載）
pnpm dev

# 構建生產版本
pnpm build

# 運行生產版本
pnpm start

# 類型檢查
pnpm check

# 代碼格式化
pnpm format

# 數據庫遷移
pnpm db:push
```

## 🐛 故障排除

### 問題 1：`pnpm: command not found`

**解決方案**：確保 pnpm 已正確安裝：
```bash
npm install -g pnpm
```

### 問題 2：端口已被占用

如果 5173 或 3000 端口已被占用，您可以：

1. 查找占用端口的進程並關閉它
2. 或修改 `vite.config.ts` 中的端口配置

### 問題 3：依賴安裝失敗

**解決方案**：
```bash
# 清除緩存
pnpm store prune

# 重新安裝
pnpm install
```

### 問題 4：數據庫連接失敗

**檢查清單**：
- MySQL 服務是否正在運行
- 數據庫用戶名和密碼是否正確
- 數據庫是否已創建

## 📚 新增功能說明

### 1. AI 自動生成旁白

系統會自動分析您的故事，為每個場景生成合適的旁白文本。

**使用方法**：
1. 輸入故事
2. 選擇語言（粵語、普通話或英文）
3. 系統自動生成旁白

### 2. 影片描述自動翻譯

所有影片描述可以自動翻譯為英文，方便國際分享。

**使用方法**：
1. 輸入影片描述（支持中文或粵語）
2. 點擊「翻譯為英文」
3. 自動生成英文版本

### 3. 配音員選擇器

新的 KreadoAI 風格配音員選擇器，支持多維度篩選：
- 按語言篩選
- 按性別篩選
- 按年齡篩選
- 按風格篩選
- 按使用場景篩選

### 4. 返回頂部按鈕

頁面右下角的浮動按鈕，可快速返回頁面頂部。

## 🔐 安全建議

1. **不要在代碼中硬編碼 API 密鑰**
2. **使用 `.env.local` 文件存儲敏感信息**
3. **不要將 `.env.local` 提交到 Git**
4. **定期更新依賴包**：
   ```bash
   pnpm update
   ```

## 📞 技術支持

如果遇到問題，請：

1. 查看本指南的「故障排除」部分
2. 檢查 GitHub Issues
3. 查看應用日誌（在終端中）

## 🎉 開始使用

現在您可以開始使用 VEO3 應用了！

**提示**：
- 第一次運行可能需要下載一些模型文件（可能需要幾分鐘）
- 確保網絡連接正常
- 如果使用 GPU 加速，請確保已安裝相應的驅動程序

祝您使用愉快！
