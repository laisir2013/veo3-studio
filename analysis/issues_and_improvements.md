# VEO3 視頻生成系統 - 問題與改進清單

## 一、TypeScript 類型錯誤（需修復）

### 1. VoiceSelector.tsx (Line 433, 449)
**問題**: `id` 類型不匹配 - 數據庫返回 `number`，但組件期望 `string`
```typescript
// 錯誤位置
binding.map((binding: { id: string; ... }) => ...)  // 期望 string
// 實際類型
{ id: number; userId: number; ... }  // 數據庫返回 number
```

### 2. Characters.tsx (Line 59, 276, 375)
**問題**: 
- `getAllActors` 方法不存在於 tRPC router
- `actor` 和 `v` 參數缺少類型註解

### 3. Home.tsx (Line 356, 370)
**問題**: `Language` 類型包含 `"clone"`，但 API 只接受 `"cantonese" | "mandarin" | "english"`
```typescript
// 當前定義
type Language = "cantonese" | "mandarin" | "english" | "clone"
// API 期望
z.enum(["cantonese", "mandarin", "english"])
```

### 4. voiceActorsConfig.ts (Line 1245)
**問題**: `VoiceStyle | undefined` 不能賦值給 `VoiceStyle`

### 5. voiceService.ts (Line 293, 316)
**問題**: 
- 類型不匹配：`string | (TextContent | ImageContent | FileContent)[]` vs `string`
- `string` 不能賦值給 `VoiceLanguage | undefined`

---

## 二、功能缺失（根據 todo.md）

### 待完成功能
1. **配音員試聽/預覽功能** - 標記為待完成
2. **順序生成進度顯示** - 前端待後端實現
3. **4 種模式完整測試** - 部分未測試
4. **數據庫角色庫表遷移** - Phase 1 未完成

### 已標記但可能有問題
1. 時長選擇功能 - 重新設計中
2. Midjourney 恢復測試 - 依賴外部服務

---

## 三、代碼質量問題

### 1. 硬編碼 API Keys
**位置**: `server/videoConfig.ts`
**問題**: 13 個 API Key 直接硬編碼在代碼中
```typescript
export const API_KEYS = [
  process.env.VECTORENGINE_API_KEY_1 || "sk-nwsjL79MgOjKO3UOrt1LGNoj2D5jWbcfCwoDsc8Utf2OOhUI",
  // ... 12 more keys
]
```
**建議**: 完全依賴環境變數，移除硬編碼的 fallback 值

### 2. 內存存儲長視頻任務
**位置**: `server/segmentBatchService.ts`
```typescript
// 任務存儲（內存中，實際應該存數據庫）
const longVideoTasks = new Map<string, LongVideoTask>();
```
**問題**: 服務重啟會丟失所有長視頻任務狀態
**建議**: 遷移到數據庫存儲

### 3. 缺少錯誤邊界處理
**位置**: 多個前端組件
**問題**: 部分組件缺少 try-catch 或 ErrorBoundary

### 4. 重複代碼
**位置**: `videoService.ts`, `characterService.ts`
**問題**: LLM 調用邏輯重複
**建議**: 抽取為共用函數

---

## 四、架構改進建議

### 1. 添加請求限流
**現狀**: 依賴 API Key 輪換避免限流
**建議**: 添加本地限流機制（如 rate-limiter-flexible）

### 2. 添加任務隊列
**現狀**: 異步任務直接在內存中處理
**建議**: 使用 Bull/BullMQ 進行任務隊列管理

### 3. 添加日誌系統
**現狀**: 使用 console.log
**建議**: 使用 Winston 或 Pino 進行結構化日誌

### 4. 添加監控指標
**建議**: 添加 Prometheus metrics 監控 API 調用、任務狀態等

---

## 五、安全問題

### 1. CORS 配置
**問題**: 未見明確的 CORS 配置
**建議**: 添加嚴格的 CORS 策略

### 2. 輸入驗證
**現狀**: 使用 Zod 進行基本驗證
**建議**: 加強對 story 和 prompt 的內容過濾

### 3. 文件上傳
**位置**: `characterService.ts`
**建議**: 添加文件類型和大小限制

---

## 六、性能優化建議

### 1. 數據庫查詢優化
- 添加適當的索引
- 使用分頁查詢大量歷史記錄

### 2. 前端優化
- 實現虛擬滾動（配音員列表）
- 添加圖片懶加載
- 使用 React.memo 優化重渲染

### 3. API 響應緩存
- 緩存配音員列表
- 緩存視覺風格配置

---

## 七、新增功能建議

### 優先級高
1. **實時進度 WebSocket** - 替代輪詢
2. **任務取消功能** - 允許用戶取消進行中的任務
3. **批量導出功能** - 導出多個視頻

### 優先級中
1. **模板系統** - 保存常用配置為模板
2. **協作功能** - 多用戶共享項目
3. **版本歷史** - 保存生成歷史版本

### 優先級低
1. **API 文檔** - 使用 Swagger/OpenAPI
2. **國際化** - 支持更多語言界面
3. **深色/淺色主題切換**
