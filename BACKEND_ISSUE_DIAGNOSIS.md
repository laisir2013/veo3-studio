# 後台問題診斷報告

## 影片生成可能失敗的關鍵位置

---

## 1. TTS 語音生成失敗

### 文件: `server/kreadoTTS.ts` (第 335-369 行)

```typescript
if (!response.ok) {
  const errorText = await response.text();
  throw new Error(`KreadoAI TTS API 調用失敗: ${response.status} - ${errorText}`);
}

const data: KreadoTTSResponse = await response.json();

if (data.code !== "200") {
  throw new Error(`KreadoAI TTS 錯誤: ${data.message}`);
}
```

**可能的錯誤:**
- API Key 無效或過期
- voiceId 不存在
- 請求頻率過高被限流
- 文字內容包含特殊字符

### 文件: `server/videoService.ts` (第 896-965 行)

```typescript
const kreadoApiKey = process.env.KREADO_API_KEY;
if (!kreadoApiKey) {
  console.error(`[TTS] ❌ KREADO_API_KEY 未設置！`);
  throw new Error("KREADO_API_KEY 未配置");
}

// 所有重試都失敗
throw new Error(`TTS 生成失敗 (已重試 ${TTS_RETRY_CONFIG.maxRetries} 次): ${errorMsg}`);
```

**日誌關鍵字:**
```
[TTS] ❌ KREADO_API_KEY 未設置
[TTS] ❌ KreadoAI 嘗試 X 失敗
[KreadoAI TTS] 錯誤:
```

---

## 2. 圖片生成失敗

### 文件: `server/videoService.ts` (第 344-410 行)

```typescript
// Midjourney 失敗
if (!submitResponse.ok) {
  throw new Error(`Midjourney 提交失敗: ${submitResponse.status}`);
}

if (submitData.code && submitData.code !== 1) {
  throw new Error(`Midjourney 錯誤: ${submitData.description || submitData.message}`);
}

// DALL-E 3 失敗
if (!response.ok) {
  throw new Error(`DALL-E 3 圖片生成失敗: ${response.status} - ${errorText}`);
}

if (!imageUrl) {
  throw new Error("DALL-E 3 未返回圖片 URL");
}
```

**可能的錯誤:**
- Midjourney API 不可用
- DALL-E 3 API Key 無效
- 提示詞被內容審核拒絕
- API 配額用盡

### Nano-Banana-2 圖片生成 (第 1079-1227 行)

```typescript
if (!response.ok) {
  throw new Error(`Nano-Banana-2 API 錯誤: ${response.status}`);
}

if (!imageUrl) {
  throw new Error("無法獲取 Nano-Banana-2 圖片 URL");
}
```

**日誌關鍵字:**
```
[Image] Midjourney 提交失敗
[Image] DALL-E 3 圖片生成失敗
[Nano-Banana-2] HTTP 錯誤
```

---

## 3. 視頻生成失敗

### 文件: `server/videoService.ts` (第 687-825 行)

```typescript
// Veo 失敗
if (!submitResponse.ok) {
  throw new Error(`Veo 提交失敗: ${submitResponse.status}`);
}

if (data.status === "failed") {
  throw new Error(`Veo 生成失敗: ${data.error || "未知錯誤"}`);
}

throw new Error("Veo 視頻生成超時");

// Kling 失敗
if (!submitResponse.ok) {
  throw new Error(`Kling 提交失敗: ${submitResponse.status}`);
}

throw new Error("Kling 視頻生成超時");

// Runway 失敗
if (!submitResponse.ok) {
  throw new Error(`Runway 提交失敗: ${submitResponse.status}`);
}

throw new Error("Runway 視頻生成超時");
```

**可能的錯誤:**
- 所有視頻生成 API 都失敗
- API 超時（輪詢超過最大次數）
- 視頻生成被拒絕

**日誌關鍵字:**
```
[Video] 模型 X 失敗
Veo 生成失敗
Kling 視頻生成超時
Runway 視頻生成超時
```

---

## 4. 視頻合併失敗

### 文件: `server/videoMergeService.ts` (第 88-263 行)

```typescript
// 下載失敗
throw new Error(`下載失敗 (${maxRetries} 次嘗試): ${url} - ${lastError.message}`);

// 上傳失敗
if (videoUrl) {
  // 成功
} else {
  throw new Error("上傳失敗");
}
```

**可能的錯誤:**
- 片段視頻 URL 無效或過期
- 下載超時
- FFmpeg 處理失敗
- R2 存儲上傳失敗

**日誌關鍵字:**
```
[MergeTask] 任務 X 失敗
[Download] 第 X 次嘗試失敗
[MergeTask] 上傳失敗
[MergeTask] 錯誤:
```

---

## 5. 長視頻處理失敗

### 文件: `server/routers.ts` (第 1963-2480 行)

```typescript
// 任務不存在
if (!task) {
  console.error(`[LongVideo ${taskId}] 任務不存在`);
  return;
}

// 片段生成失敗
} catch (error) {
  console.error(`[LongVideo ${taskId}] 片段 ${segment.id} 生成失敗:`, error);
  updateSegment(taskId, segment.id, {
    status: "failed",
    error: error instanceof Error ? error.message : "未知錯誤",
  });
}

// 音頻 URL 無效
if (!audioUrl || !audioUrl.startsWith("http")) {
  console.error(`[LongVideo ${taskId}] ❌ 片段 ${segment.id} 音頻 URL 無效: "${audioUrl}"`);
}

// 視頻合併失敗
} catch (error) {
  console.error(`[LongVideo ${taskId}] 視頻合併失敗:`, error);
}
```

**日誌關鍵字:**
```
[LongVideo X] 任務不存在
[LongVideo X] 片段 X 生成失敗
[LongVideo X] ❌ 片段 X 音頻 URL 無效
[LongVideo X] 視頻合併失敗
```

---

## 6. 存儲上傳失敗

### 文件: `server/storage.ts` (第 103-110 行)

```typescript
if (!response.ok) {
  const message = await response.text().catch(() => response.statusText);
  throw new Error(
    `Storage upload failed (${response.status} ${response.statusText}): ${message}`
  );
}
```

### 文件: `server/r2Storage.ts` (第 77-83 行)

```typescript
} catch (error: any) {
  console.error(`[R2] ❌ 上傳失敗:`, error.message);
  throw error;
}
```

**可能的錯誤:**
- R2 憑證無效
- 存儲配額用盡
- 網絡連接問題

**日誌關鍵字:**
```
Storage upload failed
[R2] ❌ 上傳失敗
```

---

## 7. LLM 調用失敗

### 文件: `server/videoService.ts` (第 203-304 行)

```typescript
if (!response.ok) {
  throw new Error(`LLM API 調用失敗: ${response.status} - ${errorText}`);
}

if (!content) {
  throw new Error("LLM 返回內容為空");
}
```

### 文件: `server/segmentGenerationService.ts` (第 226-237 行)

```typescript
if (!content || typeof content !== "string") {
  throw new Error("LLM 返回內容為空");
}

if (!parsed.segments || !Array.isArray(parsed.segments)) {
  throw new Error("LLM 返回格式錯誤：缺少 segments 數組");
}
```

**日誌關鍵字:**
```
[LLM] 模型 X 失敗
LLM API 調用失敗
LLM 返回內容為空
```

---

## 診斷步驟

### 1. 在 Render 日誌中搜索以下關鍵字:

```bash
# TTS 相關
grep -E "TTS|KreadoAI" 

# 圖片生成相關
grep -E "Image|Midjourney|DALL-E|Nano-Banana"

# 視頻生成相關
grep -E "Video|Veo|Kling|Runway"

# 合併相關
grep -E "MergeTask|Download"

# 存儲相關
grep -E "Storage|R2|上傳"

# 通用錯誤
grep -E "❌|失敗|Error|error"
```

### 2. 常見錯誤模式:

| 錯誤訊息 | 可能原因 | 解決方案 |
|---------|---------|---------|
| `KREADO_API_KEY 未設置` | 環境變量缺失 | 在 Render 設置 KREADO_API_KEY |
| `KreadoAI TTS 錯誤` | API 調用失敗 | 檢查 API Key 和 voiceId |
| `Midjourney 提交失敗` | Midjourney API 問題 | 檢查 API 配置 |
| `視頻生成超時` | 所有視頻 API 超時 | 增加超時時間或重試 |
| `下載失敗` | 片段 URL 過期 | 重新生成片段 |
| `上傳失敗` | 存儲服務問題 | 檢查 R2 憑證 |

---

## 環境變量檢查清單

確保以下環境變量在 Render 中正確設置:

```
KREADO_API_KEY=xxx          # KreadoAI TTS
VECTORENGINE_API_KEY=xxx    # VectorEngine (圖片/LLM)
MIDJOURNEY_API_KEY=xxx      # Midjourney
OPENAI_API_KEY=xxx          # DALL-E 3
R2_ACCESS_KEY_ID=xxx        # Cloudflare R2
R2_SECRET_ACCESS_KEY=xxx    # Cloudflare R2
R2_BUCKET_NAME=xxx          # R2 Bucket
R2_PUBLIC_URL=xxx           # R2 公開 URL
```
