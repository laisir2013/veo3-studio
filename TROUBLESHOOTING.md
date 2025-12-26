# VEO3 系統故障排查手冊

## 📖 目錄
1. [常見問題快速診斷](#常見問題快速診斷)
2. [依賴安裝問題](#依賴安裝問題)
3. [環境變量問題](#環境變量問題)
4. [數據庫連接問題](#數據庫連接問題)
5. [API 調用失敗](#api-調用失敗)
6. [視頻生成失敗](#視頻生成失敗)
7. [性能問題](#性能問題)
8. [日誌分析](#日誌分析)

---

## 常見問題快速診斷

### 問題分類樹狀圖

```
系統無法啟動？
├─ pnpm install 失敗？
│  ├─ postinstall 腳本錯誤 → 見「依賴安裝問題」#1
│  ├─ 網絡連接問題 → 使用 --registry 指定鏡像源
│  └─ 權限問題 → 使用 sudo 或檢查文件權限
│
├─ pnpm dev 啟動失敗？
│  ├─ 端口被占用 → 修改 PORT 環境變量
│  ├─ 環境變量缺失 → 見「環境變量問題」
│  └─ 語法錯誤 → 檢查 TypeScript 編譯錯誤
│
└─ 服務器啟動但無響應？
   ├─ 檢查 http://localhost:3000 是否可訪問
   ├─ 查看控制台錯誤日誌
   └─ 使用 curl 測試 API 端點

視頻生成失敗？
├─ 故事分析失敗 → 檢查 LLM API Keys
├─ 圖片生成失敗 → 檢查 VectorEngine API Keys
├─ 視頻生成失敗 → 檢查 API 額度和速率限制
└─ 語音生成失敗 → 檢查 KreadoAI API Key

前端界面異常？
├─ 白屏 → 檢查瀏覽器控制台錯誤
├─ API 調用失敗 → 檢查網絡請求（F12 Network 標籤）
└─ 進度不更新 → 檢查 WebSocket/輪詢機制
```

---

## 依賴安裝問題

### 問題 #1: postinstall 腳本失敗

**症狀：**
```bash
$ pnpm install
ERR_PNPM_POSTINSTALL_SCRIPT_FAILED  Command failed with exit code 1: patch-package
```

**原因：**
- `package.json` 中配置了 `postinstall` 腳本執行 `patch-package`
- `patches/` 目錄為空，沒有補丁需要應用

**解決方案：**

**方法 1：移除 postinstall 腳本（推薦）**
```bash
# 備份 package.json
cp package.json package.json.backup

# 編輯 package.json，刪除以下行：
# "postinstall": "patch-package"

# 使用 sed 命令自動移除（Linux/Mac）
sed -i '/"postinstall":/d' package.json

# 重新安裝
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

**方法 2：創建空的 patches 目錄**
```bash
mkdir -p patches
touch patches/.gitkeep
pnpm install
```

---

### 問題 #2: 依賴版本衝突

**症狀：**
```bash
WARN  Issues with peer dependencies found
ERR_PNPM_PEER_DEP_ISSUES  Unmet peer dependencies
```

**解決方案：**
```bash
# 使用 --force 標誌強制安裝
pnpm install --force

# 或使用 --legacy-peer-deps（如果使用 npm）
npm install --legacy-peer-deps
```

---

### 問題 #3: 網絡連接超時

**症狀：**
```bash
ERR_PNPM_FETCH_TIMEOUT  Request to https://registry.npmjs.org/ timed out
```

**解決方案：**
```bash
# 使用國內鏡像源（中國大陸）
pnpm config set registry https://registry.npmmirror.com

# 或臨時使用
pnpm install --registry=https://registry.npmmirror.com

# 恢復官方源
pnpm config set registry https://registry.npmjs.org
```

---

## 環境變量問題

### 問題 #4: .env 文件未生效

**症狀：**
- 代碼中 `process.env.SOME_VAR` 返回 `undefined`
- 啟動時提示環境變量缺失

**診斷步驟：**
```bash
# 1. 確認 .env 文件存在且位於項目根目錄
ls -la .env

# 2. 檢查 .env 文件格式（不能有多餘空格）
cat .env

# 3. 檢查環境變量是否被正確讀取
node -e "require('dotenv').config(); console.log(process.env.NODE_ENV)"

# 4. 使用驗證腳本
node check-env.mjs
```

**常見格式錯誤：**
```bash
# ❌ 錯誤：多餘的空格
API_KEY = your-key-here

# ❌ 錯誤：使用引號
API_KEY="your-key-here"

# ✅ 正確：
API_KEY=your-key-here
```

---

### 問題 #5: API Keys 未正確配置

**症狀：**
- 視頻生成時提示 "API Key 無效"
- 控制台輸出 "未配置 API Key"

**完整檢查清單：**
```bash
# 運行環境驗證腳本
node check-env.mjs

# 手動檢查關鍵變量
echo "VECTOR_ENGINE_API_KEY_1: ${VECTOR_ENGINE_API_KEY_1:0:10}..."
echo "OPENAI_API_KEY: ${OPENAI_API_KEY:0:10}..."
echo "KREADO_API_KEY: ${KREADO_API_KEY:0:10}..."
```

**獲取 API Keys：**
- **VectorEngine**: https://vectorengine.ai/
- **OpenAI**: https://platform.openai.com/api-keys
- **Anthropic (Claude)**: https://console.anthropic.com/
- **KreadoAI**: https://www.kreadoai.com/
- **Google Gemini**: https://makersuite.google.com/app/apikey

---

## 數據庫連接問題

### 問題 #6: 數據庫連接失敗

**症狀：**
```bash
Error: connect ECONNREFUSED 127.0.0.1:3306
或
Error: Access denied for user 'root'@'localhost'
```

**診斷步驟：**

**1. 檢查數據庫服務是否運行**
```bash
# MySQL
sudo systemctl status mysql

# 或
mysqladmin -u root -p ping
```

**2. 檢查連接字符串格式**
```bash
# 正確格式：
# mysql://username:password@host:port/database

# 示例：
DATABASE_URL=mysql://root:mypassword@localhost:3306/veo3_db

# 如果密碼包含特殊字符，需要 URL 編碼
# 例如：密碼 "p@ss!" 應編碼為 "p%40ss%21"
```

**3. 測試數據庫連接**
```bash
# 使用 MySQL 客戶端測試
mysql -h localhost -u root -p veo3_db
```

**4. 創建數據庫（如果不存在）**
```sql
CREATE DATABASE veo3_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

**5. 執行數據庫遷移**
```bash
pnpm db:push
```

**替代方案：使用內存存儲**
```bash
# 如果暫時不需要數據持久化，可以不配置數據庫
# 將 DATABASE_URL 留空或移除
# 系統將自動使用內存存儲（memoryStore.ts）

# 注意：內存存儲的限制
# - 重啟後數據丟失
# - 無法使用需要用戶認證的功能（protectedProcedure）
# - 無法使用角色庫和歷史記錄功能
```

---

## API 調用失敗

### 問題 #7: VectorEngine API 調用失敗

**症狀：**
```bash
Error: VectorEngine API request failed with status 401
或
Error: API rate limit exceeded
```

**診斷步驟：**

**1. 驗證 API Key 有效性**
```bash
# 使用 curl 測試（替換 YOUR_API_KEY）
curl -X POST https://api.vectorengine.ai/v1/test \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json"
```

**2. 檢查 API 額度**
- 登入 VectorEngine 控制台
- 查看 API 使用量和剩餘額度
- 檢查計費狀態

**3. 檢查速率限制**
```typescript
// 如果出現 429 Too Many Requests
// 系統會自動輪換 API Keys
// 確保配置了多個 API Keys（建議 6 個以上）

// 查看 server/videoConfig.ts 中的 API_KEYS 配置
// 確認輪換邏輯是否正常工作
```

**4. 添加重試邏輯**
- 參考診斷報告中的「階段 2：代碼修復 - 2.2 添加錯誤重試機制」
- 實現自動重試和指數退避

---

### 問題 #8: LLM API 調用失敗

**症狀：**
```bash
Error: OpenAI API request failed: insufficient_quota
或
Error: Anthropic API rate limit exceeded
```

**解決方案：**

**OpenAI API 問題：**
```bash
# 1. 檢查 API Key 格式（應以 sk- 開頭）
echo $OPENAI_API_KEY | grep "^sk-"

# 2. 檢查額度
# 訪問：https://platform.openai.com/account/usage

# 3. 驗證 API Key
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

**Anthropic Claude API 問題：**
```bash
# 1. 檢查 API Key 格式（應以 sk-ant- 開頭）
echo $ANTHROPIC_API_KEY | grep "^sk-ant-"

# 2. 測試連接
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-3-opus-20240229",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

---

## 視頻生成失敗

### 問題 #9: 故事分析階段失敗

**症狀：**
- 任務卡在 "正在分析故事..." 狀態
- 控制台輸出 LLM API 錯誤

**診斷步驟：**

**1. 檢查 LLM 配置**
```javascript
// 查看 server/videoConfig.ts
// 確認 LLM_MODELS 配置正確

// 快速模式使用：gpt-4o-mini
// 高質量模式使用：claude-opus-4-5-20251101
```

**2. 檢查故事長度**
```javascript
// 故事過長可能導致 token 超限
// 建議：每個場景 100-200 字
// 總長度不超過 2000 字
```

**3. 手動測試 LLM 調用**
```bash
# 創建測試腳本 test-llm.js
node test-llm.js
```

---

### 問題 #10: 圖片生成失敗

**症狀：**
```bash
Error: Midjourney image generation failed
或
Image generation timed out
```

**常見原因：**
1. **Midjourney API 超時** - Midjourney 生成速度較慢（1-3 分鐘/張）
2. **Prompt 不合規** - 某些敏感詞彙被過濾
3. **API 額度不足** - 檢查 VectorEngine 額度

**解決方案：**
```javascript
// 增加超時時間（server/videoService.ts）
const MIDJOURNEY_TIMEOUT = 300000; // 5 分鐘

// 添加重試邏輯
async function generateSceneImage(prompt, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await callMidjourneyAPI(prompt);
    } catch (error) {
      if (i === retries - 1) throw error;
      console.log(`重試 ${i + 1}/${retries}...`);
      await sleep(5000);
    }
  }
}
```

---

### 問題 #11: 視頻生成超時

**症狀：**
```bash
Error: Video generation timeout after 300000ms
或
Task stuck at "正在生成場景 X 視頻..."
```

**診斷：**
```javascript
// Veo 3.1 生成速度：30-60 秒/個 8 秒視頻
// 如果超過 5 分鐘未響應，通常是 API 問題

// 檢查 API 狀態
// 1. VectorEngine 服務是否正常
// 2. API Key 是否被限速
// 3. 視頻 prompt 是否合規
```

**解決方案：**
```typescript
// 增加超時時間和重試次數
const VIDEO_GENERATION_CONFIG = {
  timeout: 600000, // 10 分鐘
  maxRetries: 3,
  retryDelay: 10000, // 10 秒
};
```

---

### 問題 #12: 語音生成失敗

**症狀：**
```bash
Error: KreadoAI TTS request failed
或
Voice actor not found: xxx
```

**檢查清單：**

**1. 驗證 KreadoAI API Key**
```bash
# 測試 API 連接
curl -X POST https://api.kreadoai.com/api/v1/tts \
  -H "Authorization: Bearer $KREADO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "測試",
    "voiceId": "cantonese-male-narrator"
  }'
```

**2. 檢查配音員 ID**
```javascript
// 查看 server/videoConfig.ts
// VOICE_ACTORS 配置

// 常見配音員 ID：
// - cantonese-male-narrator（粵語男聲）
// - mandarin-female-narrator（普通話女聲）
// - english-male-narrator（英語男聲）
```

**3. 檢查語言設置**
```javascript
// 語言參數必須匹配：
// "cantonese", "mandarin", "english"
// 不能使用：zh-TW, zh-CN, en
```

---

## 性能問題

### 問題 #13: 長視頻生成太慢

**症狀：**
- 生成 10 分鐘視頻需要 1 小時以上
- 任務進度長時間不更新

**優化方案：**

**1. 增加 API Key 數量**
```bash
# 配置 13 個 VectorEngine API Keys
# 可將並發從 6 提升到 12
VECTOR_ENGINE_API_KEY_1=...
VECTOR_ENGINE_API_KEY_2=...
# ... 直到 KEY_13
```

**2. 調整批次大小**
```typescript
// server/segmentBatchService.ts
export const BATCH_SIZE = 12; // 從 6 增加到 12（需要更多 API Keys）
```

**3. 使用快速模式**
```typescript
// 使用 Veo 3.1 Fast 而非 Veo 3.1 Pro
// 生成速度提升 50%，質量略有下降
speedMode: "fast"
```

**4. 預估時間計算**
```
單個片段時間 = 圖片生成(2分) + 視頻生成(1分) + 語音生成(0.5分) = 3.5分
並發數 = 6
總片段數 = 時長(分鐘) × 60 / 8
批次數 = 總片段數 / 6
總時間 = 批次數 × 3.5分

例：10 分鐘視頻
= (10×60/8) / 6 × 3.5
= 75 / 6 × 3.5
= 12.5 × 3.5
= 43.75 分鐘
```

---

### 問題 #14: 內存佔用過高

**症狀：**
```bash
FATAL ERROR: Ineffective mark-compacts near heap limit
或
JavaScript heap out of memory
```

**解決方案：**
```bash
# 增加 Node.js 堆內存限制
export NODE_OPTIONS="--max-old-space-size=4096"  # 4GB
pnpm dev

# 或在 package.json scripts 中設置
"dev": "NODE_OPTIONS=--max-old-space-size=4096 tsx watch server/_core/index.ts"
```

---

## 日誌分析

### 查看系統日誌

**開發模式日誌：**
```bash
# 啟動時會在控制台實時顯示
pnpm dev

# 如果需要保存日誌
pnpm dev 2>&1 | tee veo3-dev.log
```

**生產模式日誌：**
```bash
# 檢查是否有日誌文件
ls -la server.log *.log

# 實時查看日誌
tail -f server.log

# 搜索錯誤
grep -i "error" server.log
grep -i "failed" server.log
```

**常見日誌模式：**
```bash
# 成功的視頻生成
[任務 123] 開始分析故事...
[任務 123] 故事分析完成，生成 3 個場景
[任務 123] 正在生成場景 1 圖片...
[任務 123] 正在生成場景 1 視頻...
[任務 123] 場景 1 生成完成
[任務 123] 處理完成!

# API 限速錯誤
[API] VectorEngine Key 1 速率限制，切換到 Key 2
[API] 所有 Keys 都達到速率限制，等待 60 秒...

# 數據庫連接問題
[DB] 數據庫連接失敗，使用內存存儲
[DB] DATABASE_URL not configured, some features will be limited
```

---

## 獲取幫助

如果以上方法都無法解決問題：

1. **檢查項目文檔**
   - `LOCAL_SETUP_GUIDE.md` - 本地運行指南
   - `analysis_report/VEO3_Analysis_Report.md` - 完整技術分析
   - `/home/user/VEO3_深度診斷報告.md` - 本次診斷報告

2. **查看代碼註釋**
   - 大部分關鍵模組都有詳細的代碼註釋
   - 特別是 `server/` 目錄下的服務文件

3. **使用診斷工具**
   ```bash
   # 環境驗證
   node check-env.mjs
   
   # 快速修復
   bash fix-and-start.sh
   ```

4. **創建最小可復現案例**
   - 記錄完整的錯誤日誌
   - 記錄操作步驟
   - 記錄環境信息（Node 版本、OS 等）

---

## 快速命令參考

```bash
# 完整重置和修復
cd /home/user/veo3-work/veo3-studio-git
bash fix-and-start.sh

# 手動步驟
rm -rf node_modules pnpm-lock.yaml
pnpm install --force
node check-env.mjs
pnpm db:push  # 如果使用數據庫
pnpm dev

# 測試 API 連通性
curl http://localhost:3000/api/trpc/system.health

# 查看實時日誌
tail -f server.log

# 檢查端口占用
lsof -i :3000
netstat -tlnp | grep 3000
```

---

**最後更新：** 2025-12-26
**維護者：** VEO3 診斷系統
