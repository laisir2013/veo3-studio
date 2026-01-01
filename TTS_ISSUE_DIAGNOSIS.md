# TTS 音頻時長問題診斷

## 問題描述
旁白音頻只有 1-2 秒，但文字內容有 15-30 個字符。

## 相關文件

### 1. `server/kreadoTTS.ts` - KreadoAI TTS 調用

```typescript
// 第 301-318 行：API 請求構建
const requestBody = {
  languageId: langConfig.languageId,
  content: content,           // ← 這是傳入的旁白文字
  voiceId: voiceId,
  voiceSource: voiceSource,
  voiceClone: isCloneVoice ? 1 : 0,
};

const response = await fetch(KREADO_TTS_URL, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "apiToken": KREADO_CONFIG.apiKey,
  },
  body: JSON.stringify(requestBody),
});
```

**可能的問題點：**
1. `content` 是否被正確傳入？
2. `languageId` 是否正確？（粵語: `1767068435675340826`）
3. `voiceSource` 是否正確？（MiniMax: 5, 字節: 4, ElevenLabs: 21）

### 2. `server/videoService.ts` - TTS 調用入口

```typescript
// 第 883-927 行：generateSpeech 函數
export async function generateSpeech(
  text: string,                    // ← 旁白文字
  voiceActorId: string = "cantonese-male-narrator",
  language: VoiceLanguage = "cantonese"
): Promise<string> {
  // ...
  const result = await generateSpeechWithKreado(text, voiceActorId, language);
  return result.audioUrl;  // ← 只返回 URL，丟棄了 duration
}
```

### 3. `server/videoMergeService.ts` - 音頻處理

```typescript
// 第 331-380 行：ensureAudioDuration 函數
// 這個函數會檢測音頻時長，如果太短會嘗試拉伸
async function ensureAudioDuration(audioPath: string, targetDuration: number = 8): Promise<void> {
  // 使用 ffprobe 檢測實際時長
  const { stdout } = await execAsync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`);
  const actualDuration = parseFloat(stdout.trim());
  
  if (actualDuration < targetDuration - 0.5) {
    // 拉伸音頻...
  }
}
```

## 診斷步驟

### 在 Render 日誌中查找：

1. **確認文字是否完整傳入：**
   ```
   [KreadoAI TTS] 文字內容完整: "..."
   [KreadoAI TTS] 文字長度: XX 字符
   ```

2. **確認 API 返回的時長：**
   ```
   [KreadoAI TTS] API 返回時長: X秒 (Xms)
   ```

3. **確認實際下載的音頻時長：**
   ```
   [Audio] 檢測音頻時長: X秒 (目標: 8秒)
   ```

## 可能的根本原因

### 原因 1：KreadoAI API 問題
- API 可能只處理了部分文字
- 某些 voiceId 可能有問題
- 語言配置不匹配

### 原因 2：音頻文件下載問題
- 下載過程中被截斷
- 網絡問題導致不完整

### 原因 3：FFmpeg 處理問題
- 合併時音頻被截斷
- 時長檢測不準確

## 建議的修復方向

1. **在 KreadoAI 調用後立即驗證音頻時長**
2. **如果時長不足，重新調用 API**
3. **添加備用 TTS 服務（如 VectorEngine TTS）**

## 語言配置參考

```typescript
// server/kreadoTTS.ts 第 11-32 行
const LANGUAGE_CONFIG = {
  cantonese: {
    languageId: "1767068435675340826",
    voiceSource: 5,  // MiniMax
    defaultVoiceId: "ai_000046",
  },
  mandarin: {
    languageId: "1767068435675340832",
    voiceSource: 4,  // 字節
    defaultVoiceId: "zh_male_jingqiangkanye_moon_bigtts",
  },
  english: {
    languageId: "1767068435553706002",
    voiceSource: 21, // ElevenLabs
    defaultVoiceId: "1BUhH8aaMvGMUdGAmWVM",
  },
};
```
