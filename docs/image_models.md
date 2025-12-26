# VectorEngine API 支持的圖片生成模型

根據 VectorEngine API Model Hub 的「繪畫」分類，共有 **120 個圖片生成模型**。

## 主要供應商和模型

### 1. OpenAI (3 個模型)
- **gpt-image-1.5** - Input ¥15.0000/M, Output ¥96.00/M (dall-e-3格式)
- **gpt-image-1.5-all** - Model price ¥0.039

### 2. Google (4 個模型)
- **gemini-3-pro-image-preview** - Model price ¥0.159 (Nano Banana 2)
- **gemini-2.5-flash-image-preview** - 新增模型

### 3. Midjourney (14 個模型)
- 支持最新版本的 Midjourney Proxy Plus
- 高並發和快速響應
- 支持中文翻譯 API

### 4. Flux (11 個模型)
- **black-forest-labs/flux-...** 系列
- Model price ¥0.094 - ¥0.300
- 支持多種變體：schnell, dev, pro, fill, canny, depth 等

### 5. Fal-ai (20 個模型)
- **fal-ai/nano-banana** - 新增模型
- 多種風格和功能

### 6. Ideogram (25 個模型)
- 專業的文字渲染能力
- 適合需要中文字的場景

### 7. Replicate (29 個模型)
- **andreasjansson/stable-diffusion-...** 系列
- Model price ¥0.488
- 支持插值和擴散

### 8. Grok/xAI (2 個模型)
- 新興的圖片生成能力

### 9. 豆包 Doubao (3 個模型)
- 字節跳動的圖片生成模型

### 10. 可靈 Kling (1 個模型)
- 快手的圖片生成模型

### 11. 即夢 Jimeng (3 個模型)
- 中國本土圖片生成模型

### 12. 阿里雲百煉 Bailian (1 個模型)
- 阿里巴巴的圖片生成服務

## 推薦用於 VEO3 系統的模型

| 模型 | 供應商 | 價格 | 特點 | 適用場景 |
|------|--------|------|------|----------|
| gpt-image-1.5-all | OpenAI | ¥0.039/張 | DALL-E 3 格式 | 通用場景 |
| gemini-3-pro-image-preview | Google | ¥0.159/張 | Nano Banana 2 | 高質量圖片 |
| midjourney | Midjourney | 按次計費 | 藝術風格強 | 藝術創作 |
| flux-schnell | Flux | ¥0.094/張 | 快速生成 | 快速預覽 |
| flux-pro | Flux | ¥0.300/張 | 高質量 | 正式製作 |
| ideogram | Ideogram | 按次計費 | 文字渲染佳 | 需要中文字 |
| stable-diffusion | Replicate | ¥0.488/張 | 開源靈活 | 自定義需求 |

## 中文字渲染推薦

對於需要顯示中文字的場景，推薦使用：
1. **Ideogram** - 專門優化文字渲染
2. **gpt-image-1.5** - DALL-E 3 的文字能力較好
3. **gemini-3-pro-image-preview** - Google 的多語言支持
