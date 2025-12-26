// VectorEngine API Keys（輪流使用避免限流）
// 所有 13 個有效的 API Key
export const API_KEYS = [
  process.env.VECTORENGINE_API_KEY_1 || "sk-nwsjL79MgOjKO3UOrt1LGNoj2D5jWbcfCwoDsc8Utf2OOhUI",
  process.env.VECTORENGINE_API_KEY_2 || "sk-0WSOTsnoaf0eNstC4pJOjrLNJjBTZi0DMYsKV6jaLOV4ydfX",
  process.env.VECTORENGINE_API_KEY_3 || "sk-fX1KaFxYUxy6S7ouggSGeLLmLuoq1zDUQDGAxyVxrWJgtqQr",
  process.env.VECTORENGINE_API_KEY_4 || "sk-DaOpIa2ho5AiWbdV6mzOaFWDZH1UlgASOspMRQtXIJxQqGhN",
  process.env.VECTORENGINE_API_KEY_5 || "sk-15QTY6nSAiFca0FCP9Yks3xlmTvL2XZjck1MMPgNznGiBsXs",
  process.env.VECTORENGINE_API_KEY_6 || "sk-T0qvRM5CIInHsskdqWV0f9Te9g8FKd7dUCfljaGWpOH4Q0Rk",
  process.env.VECTORENGINE_API_KEY_7 || "sk-uNpzao62UqY6LxrFyMo3DPImXYL2wdjydEKuPWrh8EGXrvoI",
  process.env.VECTORENGINE_API_KEY_8 || "sk-2gu2bPuvn8t6AC6wzk6NmkBIXaj34Zmvt9OpgabxQFRIW71H",
  process.env.VECTORENGINE_API_KEY_9 || "sk-M6x6doe0uKMs9DpWTDIXATeSagxOwibEkBGZytl8KblvLW2U",
  process.env.VECTORENGINE_API_KEY_10 || "sk-TRgLLnSrMqI5SuM5hkBuDeSyVYhrdppsG9Vk3grADVVryhqj",
  process.env.VECTORENGINE_API_KEY_11 || "sk-YnfJNruhEpjzEOWNmIu9TjqMhOB01NLHy6thK6Zgb0bCQ5GT",
  process.env.VECTORENGINE_API_KEY_12 || "sk-R8Zkzp274XV4Ni99H6I3RaBC7yJ8wUvbYTMETbllQYTLn9HS",
  process.env.VECTORENGINE_API_KEY_13 || "sk-VC7kkQW6bxEvTvAHdsyXCWI2eyM9UIgwa9JzTXdNLP3b5yG3",
].filter(Boolean) as string[];

// API Key 輪流索引
let currentKeyIndex = 0;

export function getNextApiKey(): string {
  const key = API_KEYS[currentKeyIndex];
  currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
  return key;
}

// 重置 Key 索引（用於測試）
export function resetKeyIndex(): void {
  currentKeyIndex = 0;
}

// 獲取當前 Key 索引（用於調試）
export function getCurrentKeyIndex(): number {
  return currentKeyIndex;
}

// 圖片生成專用的 API Key 輪流索引（獨立於視頻生成）
let imageKeyIndex = 0;

export function getNextImageApiKey(): string {
  const key = API_KEYS[imageKeyIndex];
  imageKeyIndex = (imageKeyIndex + 1) % API_KEYS.length;
  return key;
}

// 重置圖片 Key 索引
export function resetImageKeyIndex(): void {
  imageKeyIndex = 0;
}

// 獲取當前圖片 Key 索引
export function getCurrentImageKeyIndex(): number {
  return imageKeyIndex;
}

// 批次獲取多個 API Key（用於並行生成）
export function getApiKeysForBatch(count: number): string[] {
  const keys: string[] = [];
  for (let i = 0; i < count; i++) {
    keys.push(getNextApiKey());
  }
  return keys;
}

// 批次獲取多個圖片 API Key
export function getImageApiKeysForBatch(count: number): string[] {
  const keys: string[] = [];
  for (let i = 0; i < count; i++) {
    keys.push(getNextImageApiKey());
  }
  return keys;
}

// LLM 模型質量排名（10 個模型按強到弱排序）
export const LLM_MODEL_RANKING = [
  "gpt-5.2",                      // 1. 最強 - OpenAI 最新
  "claude-opus-4-5-20251101",     // 2. Claude Opus 4.5
  "gpt-4o",                       // 3. GPT-4o
  "claude-3-5-sonnet-20241022",   // 4. Claude 3.5 Sonnet
  "gpt-4o-mini",                  // 5. GPT-4o Mini
  "claude-3-opus-20240229",       // 6. Claude 3 Opus
  "gpt-4-turbo",                  // 7. GPT-4 Turbo
  "claude-3-sonnet-20240229",     // 8. Claude 3 Sonnet
  "gpt-3.5-turbo",                // 9. GPT-3.5 Turbo
  "claude-3-haiku-20240307",      // 10. 最弱但最快 - Claude 3 Haiku
] as const;

// LLM 備用配置（根據排名自動生成）
export const LLM_FALLBACK_CONFIG: Record<string, string[]> = {
  "gpt-5.2": ["claude-opus-4-5-20251101", "gpt-4o", "claude-3-5-sonnet-20241022", "gpt-4o-mini", "claude-3-opus-20240229", "gpt-4-turbo", "claude-3-sonnet-20240229", "gpt-3.5-turbo", "claude-3-haiku-20240307"],
  "claude-opus-4-5-20251101": ["gpt-4o", "claude-3-5-sonnet-20241022", "gpt-4o-mini", "claude-3-opus-20240229", "gpt-4-turbo", "claude-3-sonnet-20240229", "gpt-3.5-turbo", "claude-3-haiku-20240307"],
  "gpt-4o": ["claude-3-5-sonnet-20241022", "gpt-4o-mini", "claude-3-opus-20240229", "gpt-4-turbo", "claude-3-sonnet-20240229", "gpt-3.5-turbo", "claude-3-haiku-20240307"],
  "claude-3-5-sonnet-20241022": ["gpt-4o-mini", "claude-3-opus-20240229", "gpt-4-turbo", "claude-3-sonnet-20240229", "gpt-3.5-turbo", "claude-3-haiku-20240307"],
  "gpt-4o-mini": ["claude-3-opus-20240229", "gpt-4-turbo", "claude-3-sonnet-20240229", "gpt-3.5-turbo", "claude-3-haiku-20240307"],
  "claude-3-opus-20240229": ["gpt-4-turbo", "claude-3-sonnet-20240229", "gpt-3.5-turbo", "claude-3-haiku-20240307"],
  "gpt-4-turbo": ["claude-3-sonnet-20240229", "gpt-3.5-turbo", "claude-3-haiku-20240307"],
  "claude-3-sonnet-20240229": ["gpt-3.5-turbo", "claude-3-haiku-20240307"],
  "gpt-3.5-turbo": ["claude-3-haiku-20240307"],
  "claude-3-haiku-20240307": [],
};

// 429 錯誤重試配置
export const RETRY_CONFIG = {
  maxRetries: 5,           // 每個模型最多重試次數 (增加到 5 次)
  retryDelay: 3000,        // 重試延遲（毫秒）(增加到 3 秒)
  backoffMultiplier: 2.0,  // 退避倍數 (增加到 2 倍)
  maxDelay: 30000,         // 最大延遲 30 秒
  retryOn429: true,        // 429 錯誤時重試
  retryOn500: true,        // 500 錯誤時重試
  retryOnTimeout: true,    // 超時時重試
} as const;

// 視頻生成備用鏈（按優先級排序）
export const VIDEO_FALLBACK_CHAIN = {
  "veo3.1-pro": ["veo3.1-fast", "runway", "kling"],
  "veo3.1-fast": ["runway", "kling"],
  "runway": ["kling"],
  "kling": [],
} as const;

// 圖片生成備用鏈（按質量排序：最強 -> 最弱）
export const IMAGE_FALLBACK_CHAIN = {
  // 最強：Gemini 3 Pro Image (Nano Banana 2)
  "gemini-3-pro-image-preview": ["gpt-image-1.5-all", "midjourney", "ideogram", "flux-pro", "flux-schnell", "stable-diffusion", "doubao-image"],
  // 第二強：GPT Image 1.5
  "gpt-image-1.5-all": ["midjourney", "ideogram", "flux-pro", "flux-schnell", "stable-diffusion", "doubao-image"],
  // 第三強：Midjourney
  "midjourney": ["ideogram", "flux-pro", "flux-schnell", "stable-diffusion", "doubao-image"],
  // 第四強：Ideogram (文字渲染最佳)
  "ideogram": ["flux-pro", "flux-schnell", "stable-diffusion", "doubao-image"],
  // 第五強：Flux Pro
  "flux-pro": ["flux-schnell", "stable-diffusion", "doubao-image"],
  // 第六強：Flux Schnell (最快)
  "flux-schnell": ["stable-diffusion", "doubao-image"],
  // 第七強：Stable Diffusion XL
  "stable-diffusion": ["doubao-image"],
  // 最弱：豆包圖片
  "doubao-image": [],
} as const;

// 圖片模型質量排名（用於自動選擇）
export const IMAGE_MODEL_RANKING = [
  "gemini-3-pro-image-preview",  // 1. 最強 - Google Nano Banana 2
  "gpt-image-1.5-all",           // 2. DALL-E 3
  "midjourney",                   // 3. 藝術風格最強
  "ideogram",                     // 4. 文字渲染最佳
  "flux-pro",                     // 5. 高質量 Flux
  "flux-schnell",                 // 6. 最快速
  "stable-diffusion",             // 7. 開源靈活
  "doubao-image",                 // 8. 中文理解佳
] as const;

// 速度模式預設配置
export const SPEED_MODE_PRESETS = {
  fast: {
    name: "快速模式",
    description: "適合測試和快速預覽",
    llm: "gpt-5.2",
    llmFallback: "claude-opus-4-5-20251101",
    video: "veo3.1-fast",
    videoFallback: ["runway", "kling"],
    mjMode: "fast",
    estimatedTime: "3-5 分鐘",
    quality: "標準",
    price: "￥0.35/視頻",
  },
  quality: {
    name: "高質量模式",
    description: "適合正式製作",
    llm: "claude-opus-4-5-20251101",
    llmFallback: "gpt-5.2",
    video: "veo3.1-pro",
    videoFallback: ["veo3.1-fast", "runway", "kling"],
    mjMode: "default",
    estimatedTime: "8-15 分鐘",
    quality: "電影級",
    price: "￥1.75/視頻",
  },
} as const;

// 故事模式預設配置
export const STORY_MODE_PRESETS = {
  character: {
    name: "固定人物模式",
    description: "保持角色外觀一致，適合故事片、短劇、廣告",
    icon: "👤",
    features: [
      "生成角色基礎圖",
      "使用 --cref 保持角色一致性",
      "適合有主角的故事",
    ],
    generateCharacterBase: true,
    useCref: true,
  },
  scene: {
    name: "劇情模式",
    description: "純場景敘事，適合風景片、產品展示、概念視頻",
    icon: "🎬",
    features: [
      "直接生成場景圖片",
      "無需角色一致性",
      "更快速、更低成本",
    ],
    generateCharacterBase: false,
    useCref: false,
  },
} as const;

// 合併模式預設（向後兼容）
export const MODE_PRESETS = SPEED_MODE_PRESETS;

// 可用視頻模型
export const VIDEO_MODELS = {
  "veo3.1-fast": {
    name: "Veo 3.1 Fast",
    provider: "Google",
    price: "¥0.35/次",
    quality: "標準",
    speed: "快速",
    duration: "8秒",
  },
  "veo3.1-pro": {
    name: "Veo 3.1 Pro",
    provider: "Google",
    price: "¥1.75/次",
    quality: "電影級",
    speed: "較慢",
    duration: "8秒",
  },
  "veo3.1": {
    name: "Veo 3.1",
    provider: "Google",
    price: "¥0.35/次",
    quality: "高",
    speed: "中等",
    duration: "8秒",
  },
  "kling": {
    name: "可靈 Kling 1.6",
    provider: "快手",
    price: "¥0.30/次",
    quality: "高",
    speed: "中等",
    duration: "5秒",
  },
  "runway": {
    name: "Runway Gen-3 Alpha",
    provider: "Runway",
    price: "¥0.50/次",
    quality: "高",
    speed: "快速",
    duration: "10秒",
  },
} as const;

// 可用圖片生成模型
export const IMAGE_MODELS = {
  "gpt-image-1.5-all": {
    id: "gpt-image-1.5-all",
    name: "GPT Image 1.5",
    provider: "OpenAI",
    price: "¥0.039/張",
    quality: "高",
    speed: "快速",
    description: "DALL-E 3 格式，通用場景",
    textRendering: "良好",
  },
  "gemini-3-pro-image-preview": {
    id: "gemini-3-pro-image-preview",
    name: "Gemini 3 Pro Image (Nano Banana 2)",
    provider: "Google",
    price: "¥0.159/張",
    quality: "極高",
    speed: "中等",
    description: "Google 最新圖片生成模型，支持 2K/4K 輸出",
    textRendering: "優秀",
  },
  "midjourney": {
    id: "midjourney",
    name: "Midjourney",
    provider: "Midjourney",
    price: "¥0.20/張",
    quality: "極高",
    speed: "較慢",
    description: "藝術風格強，適合創意內容",
    textRendering: "一般",
  },
  "flux-schnell": {
    id: "black-forest-labs/flux-schnell",
    name: "Flux Schnell",
    provider: "Black Forest Labs",
    price: "¥0.094/張",
    quality: "標準",
    speed: "最快",
    description: "快速生成，適合預覽",
    textRendering: "一般",
  },
  "flux-pro": {
    id: "black-forest-labs/flux-1.1-pro",
    name: "Flux 1.1 Pro",
    provider: "Black Forest Labs",
    price: "¥0.300/張",
    quality: "高",
    speed: "中等",
    description: "高質量 Flux 模型",
    textRendering: "良好",
  },
  "ideogram": {
    id: "ideogram-ai/ideogram-v3",
    name: "Ideogram V3",
    provider: "Ideogram",
    price: "¥0.15/張",
    quality: "高",
    speed: "中等",
    description: "文字渲染專家，適合需要中文字的場景",
    textRendering: "最佳",
  },
  "stable-diffusion": {
    id: "stability-ai/sdxl",
    name: "Stable Diffusion XL",
    provider: "Stability AI",
    price: "¥0.10/張",
    quality: "高",
    speed: "快速",
    description: "開源靈活，支持多種風格",
    textRendering: "一般",
  },
  "doubao-image": {
    id: "doubao-image",
    name: "豆包圖片",
    provider: "字節跳動",
    price: "¥0.08/張",
    quality: "高",
    speed: "快速",
    description: "中國本土模型，中文理解佳",
    textRendering: "良好",
  },
} as const;

// 圖片/視頻比例預設
export const MEDIA_RATIO_PRESETS = {
  "all-video": {
    name: "全視頻",
    videoPercent: 100,
    imagePercent: 0,
    description: "所有片段都使用視頻",
  },
  "all-image": {
    name: "全圖片",
    videoPercent: 0,
    imagePercent: 100,
    description: "所有片段都使用圖片輪播",
  },
  "video-70-image-30": {
    name: "70% 視頻 + 30% 圖片",
    videoPercent: 70,
    imagePercent: 30,
    description: "主要使用視頻，部分使用圖片",
  },
  "video-50-image-50": {
    name: "50% 視頻 + 50% 圖片",
    videoPercent: 50,
    imagePercent: 50,
    description: "視頻和圖片各佔一半",
  },
  "video-30-image-70": {
    name: "30% 視頻 + 70% 圖片",
    videoPercent: 30,
    imagePercent: 70,
    description: "主要使用圖片，部分使用視頻",
  },
  "custom": {
    name: "自定義",
    videoPercent: 50,
    imagePercent: 50,
    description: "自定義視頻和圖片比例",
  },
} as const;

// 圖片時長預設（秒）
export const IMAGE_DURATION_PRESETS = {
  "2s": { name: "2 秒/張", duration: 2, imagesPerSegment: 4 },
  "3s": { name: "3 秒/張", duration: 3, imagesPerSegment: 3 },
  "4s": { name: "4 秒/張", duration: 4, imagesPerSegment: 2 },
  "custom": { name: "自定義", duration: 3, imagesPerSegment: 3 },
} as const;

// 字幕配置
export const SUBTITLE_CONFIG = {
  // 每行最大字數
  maxCharsPerLine: 13,
  minCharsPerLine: 10,
  
  // 可用字體
  fonts: [
    { id: "noto-sans-tc", name: "思源黑體", family: "'Noto Sans TC', sans-serif" },
    { id: "noto-serif-tc", name: "思源宋體", family: "'Noto Serif TC', serif" },
    { id: "cubic-11", name: "俊美黑體", family: "'Cubic 11', sans-serif" },
    { id: "openhuninn", name: "粉圓體", family: "'jf-openhuninn', sans-serif" },
    { id: "lxgw-wenkai", name: "霄宫文楷", family: "'LXGW WenKai TC', serif" },
    { id: "source-han-sans", name: "思源黑體 Bold", family: "'Source Han Sans TC', sans-serif" },
    { id: "pingfang", name: "蘋方黑體", family: "'PingFang TC', sans-serif" },
    { id: "microsoft-jhenghei", name: "微軟正黑體", family: "'Microsoft JhengHei', sans-serif" },
  ],
  
  // 字體大小預設
  fontSizes: [
    { id: "small", name: "小", size: 24 },
    { id: "medium", name: "中", size: 32 },
    { id: "large", name: "大", size: 40 },
    { id: "xlarge", name: "特大", size: 48 },
  ],
  
  // 字體顏色預設
  fontColors: [
    { id: "white", name: "白色", color: "#FFFFFF" },
    { id: "yellow", name: "黃色", color: "#FFFF00" },
    { id: "cyan", name: "青色", color: "#00FFFF" },
    { id: "green", name: "綠色", color: "#00FF00" },
    { id: "pink", name: "粉色", color: "#FF69B4" },
    { id: "orange", name: "橙色", color: "#FFA500" },
  ],
  
  // 字框樣式
  boxStyles: [
    { id: "none", name: "無字框", background: "transparent", padding: 0 },
    { id: "shadow", name: "陰影", background: "transparent", shadow: "2px 2px 4px rgba(0,0,0,0.8)" },
    { id: "outline", name: "描邊", background: "transparent", stroke: "#000000", strokeWidth: 2 },
    { id: "box-black", name: "黑底字框", background: "rgba(0,0,0,0.7)", padding: 8 },
    { id: "box-blue", name: "藍底字框", background: "rgba(0,0,128,0.7)", padding: 8 },
    { id: "box-gradient", name: "漸變字框", background: "linear-gradient(to right, rgba(0,0,0,0.8), rgba(0,0,0,0.4))", padding: 8 },
  ],
  
  // 字幕位置
  positions: [
    { id: "bottom-center", name: "底部居中", x: "50%", y: "90%", align: "center" },
    { id: "bottom-left", name: "底部左側", x: "10%", y: "90%", align: "left" },
    { id: "bottom-right", name: "底部右側", x: "90%", y: "90%", align: "right" },
    { id: "top-center", name: "頂部居中", x: "50%", y: "10%", align: "center" },
    { id: "middle-center", name: "中間居中", x: "50%", y: "50%", align: "center" },
  ],
  
  // 默認字幕樣式
  defaultStyle: {
    font: "noto-sans-tc",
    fontSize: "medium",
    fontColor: "white",
    boxStyle: "shadow",
    position: "bottom-center",
  },
} as const;

// 字幕生成模式
export const SUBTITLE_MODES = {
  "auto": {
    name: "AI 自動識別",
    description: "根據旁白文字自動生成字幕，每行 10-13 字",
  },
  "manual": {
    name: "手動編輯",
    description: "手動輸入或編輯字幕內容",
  },
  "none": {
    name: "無字幕",
    description: "不顯示字幕",
  },
} as const;

// 可用 LLM 模型
export const LLM_MODELS = {
  "gpt-4o-mini": {
    name: "GPT-4o Mini",
    provider: "OpenAI",
    price: "¥0.075/M",
    speed: "最快",
  },
  "gpt-4o": {
    name: "GPT-4o",
    provider: "OpenAI",
    price: "¥1.25/M",
    speed: "快速",
  },
  "claude-opus-4-5-20251101": {
    name: "Claude Opus 4.5",
    provider: "Anthropic",
    price: "¥4.00/M 輸入, ¥20.00/M 輸出",
    speed: "中等",
  },
  "gemini-3-pro-preview": {
    name: "Gemini 3 Pro",
    provider: "Google",
    price: "¥0.60/M",
    speed: "中等",
  },
  "gpt-5.2": {
    name: "GPT-5.2",
    provider: "OpenAI",
    price: "¥0.525/M",
    speed: "中等",
  },
} as const;

// API 端點
export const API_ENDPOINTS = {
  vectorEngine: "https://api.vectorengine.ai",
  kreadoAi: "https://api.kreadoai.com",
  // 備用 LLM API 端點
  openai: "https://api.openai.com",
  openrouter: "https://openrouter.ai/api",
} as const;

// 備用 LLM API Key (當 VectorEngine 不可用時使用)
export const BACKUP_LLM_CONFIG = {
  // OpenRouter API Key (支持多種模型)
  openrouterApiKey: process.env.OPENROUTER_API_KEY || "",
  // 直接 OpenAI API Key
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  // 備用模型優先級
  backupModels: [
    { provider: "openrouter", model: "openai/gpt-4o-mini", endpoint: "https://openrouter.ai/api/v1/chat/completions" },
    { provider: "openrouter", model: "anthropic/claude-3-haiku", endpoint: "https://openrouter.ai/api/v1/chat/completions" },
    { provider: "openai", model: "gpt-4o-mini", endpoint: "https://api.openai.com/v1/chat/completions" },
  ],
} as const;

// Kreado AI TTS 配置（備用，目前使用 VectorEngine TTS）
export const KREADO_CONFIG = {
  apiKey: process.env.KREADO_AI_API_KEY || "E8B341B32147B299DB8ABFE9BD077929",
  voiceId: "Minimax919724_52965111962639",
  cantonese: { languageId: "1767068435675340826", voiceSource: 5 },
  mandarin: { languageId: "1767068435675340832", voiceSource: 5 },
} as const;

// 語言類型
export type VoiceLanguage = "cantonese" | "mandarin" | "english" | "clone";

// 配音員配置 - 完整版本
export const VOICE_ACTORS = {
  // ============================================
  // 粵語配音員 (Cantonese)
  // ============================================
  
  // 基礎配音員
  "cantonese-male-narrator": {
    id: "cantonese-male-narrator",
    name: "書聲儒雅",
    gender: "male" as const,
    type: "narrator" as const,
    language: "cantonese" as VoiceLanguage,
    description: "渾厚穩重的粵語男聲，適合旁白和敘述",
    voice: "alloy",
    sampleText: "大家好，歡迎嚟到我嘅頻道，今日同你哋分享一個精彩嘅故事。",
    tags: ["旁白", "敘述", "紀錄片"],
  },
  "cantonese-male-young": {
    id: "cantonese-male-young",
    name: "磁性男聲",
    gender: "male" as const,
    type: "character" as const,
    language: "cantonese" as VoiceLanguage,
    description: "年輕有活力的粵語男聲，適合年輕男性角色",
    voice: "echo",
    sampleText: "哎，你講嘅係唔係真㗎？我要試下先得！",
    tags: ["年輕", "活潑", "男主角"],
  },
  "cantonese-male-mature": {
    id: "cantonese-male-mature",
    name: "成熟男聲",
    gender: "male" as const,
    type: "character" as const,
    language: "cantonese" as VoiceLanguage,
    description: "成熟穩重的粵語男聲，適合中年男性角色",
    voice: "onyx",
    sampleText: "呢件事唔簡單，要諗清楚先得。",
    tags: ["成熟", "穩重", "父親", "老闆"],
  },
  "cantonese-female-narrator": {
    id: "cantonese-female-narrator",
    name: "靈韻",
    gender: "female" as const,
    type: "narrator" as const,
    language: "cantonese" as VoiceLanguage,
    description: "溫柔優雅的粵語女聲，適合旁白和敘述",
    voice: "nova",
    sampleText: "喺呢個安靜嘅夜晚，月光照喺小鎮嘅街道上...",
    tags: ["旁白", "敘述", "溫柔"],
  },
  "cantonese-female-young": {
    id: "cantonese-female-young",
    name: "靈音姬",
    gender: "female" as const,
    type: "character" as const,
    language: "cantonese" as VoiceLanguage,
    description: "年輕活潑的粵語女聲，適合年輕女性角色",
    voice: "shimmer",
    sampleText: "哇，真係好靚呀！我唔敢相信呀！",
    tags: ["年輕", "活潑", "女主角"],
  },
  "cantonese-female-mature": {
    id: "cantonese-female-mature",
    name: "靈汐",
    gender: "female" as const,
    type: "character" as const,
    language: "cantonese" as VoiceLanguage,
    description: "成熟優雅的粵語女聲，適合中年女性角色",
    voice: "alloy",
    sampleText: "你要記住，做人最緊要係誠實。",
    tags: ["成熟", "優雅", "母親"],
  },
  
  // 擴充粵語男聲
  "cantonese-male-deep": {
    id: "cantonese-male-deep",
    name: "沉穩男",
    gender: "male" as const,
    type: "character" as const,
    language: "cantonese" as VoiceLanguage,
    description: "深沉有磁性的男聲，適合神秘或正式場合",
    voice: "fable",
    sampleText: "命運嘅輪盤已經開始轉動...",
    tags: ["深沉", "磁性", "神秘"],
  },
  "cantonese-male-energetic": {
    id: "cantonese-male-energetic",
    name: "雲逸",
    gender: "male" as const,
    type: "character" as const,
    language: "cantonese" as VoiceLanguage,
    description: "充滿活力的男聲，適合運動或冒險角色",
    voice: "echo",
    sampleText: "衝呀！我哋一定得㗎！",
    tags: ["活力", "運動", "冒險"],
  },
  "cantonese-male-elegant": {
    id: "cantonese-male-elegant",
    name: "迪曜",
    gender: "male" as const,
    type: "character" as const,
    language: "cantonese" as VoiceLanguage,
    description: "優雅紳士的男聲，適合貴族或商務角色",
    voice: "onyx",
    sampleText: "請容許我自我介紹...",
    tags: ["優雅", "紳士", "貴族"],
  },
  "cantonese-male-dj": {
    id: "cantonese-male-dj",
    name: "音韻俊朗",
    gender: "male" as const,
    type: "character" as const,
    language: "cantonese" as VoiceLanguage,
    description: "DJ風格的男聲，適合娛樂節目",
    voice: "echo",
    sampleText: "各位觀眾朋友，準備好未？",
    tags: ["DJ", "娛樂", "活潑"],
  },
  "cantonese-male-boy": {
    id: "cantonese-male-boy",
    name: "中二君",
    gender: "male" as const,
    type: "character" as const,
    language: "cantonese" as VoiceLanguage,
    description: "中二少年風格，適合動漫角色",
    voice: "echo",
    sampleText: "見識下我嘅必殺技！",
    tags: ["中二", "少年", "動漫"],
  },
  "cantonese-male-scholar": {
    id: "cantonese-male-scholar",
    name: "博文",
    gender: "male" as const,
    type: "character" as const,
    language: "cantonese" as VoiceLanguage,
    description: "學者風格的男聲，適合知識分享",
    voice: "alloy",
    sampleText: "根據歷史記載...",
    tags: ["學者", "知識", "教育"],
  },
  "cantonese-male-hero": {
    id: "cantonese-male-hero",
    name: "凱夜",
    gender: "male" as const,
    type: "character" as const,
    language: "cantonese" as VoiceLanguage,
    description: "英雄風格的男聲，適合動作角色",
    voice: "onyx",
    sampleText: "我會保護你哋！",
    tags: ["英雄", "動作", "正義"],
  },
  "cantonese-male-cold": {
    id: "cantonese-male-cold",
    name: "冷傲青鋒",
    gender: "male" as const,
    type: "character" as const,
    language: "cantonese" as VoiceLanguage,
    description: "冷酷風格的男聲，適合反派或高冷角色",
    voice: "onyx",
    sampleText: "唔好阻住我。",
    tags: ["冷酷", "高冷", "反派"],
  },
  "cantonese-male-dragon": {
    id: "cantonese-male-dragon",
    name: "龍嘯威聲",
    gender: "male" as const,
    type: "character" as const,
    language: "cantonese" as VoiceLanguage,
    description: "霸氣威嚴的男聲，適合領袖角色",
    voice: "onyx",
    sampleText: "聽我號令！",
    tags: ["霸氣", "威嚴", "領袖"],
  },
  "cantonese-male-sunny": {
    id: "cantonese-male-sunny",
    name: "陽光健翔",
    gender: "male" as const,
    type: "character" as const,
    language: "cantonese" as VoiceLanguage,
    description: "陽光開朗的男聲，適合運動或健康主題",
    voice: "echo",
    sampleText: "今日天氣真係好！一齊做運動啦！",
    tags: ["陽光", "運動", "健康"],
  },
  
  // 擴充粵語女聲
  "cantonese-female-sweet": {
    id: "cantonese-female-sweet",
    name: "靈音妹",
    gender: "female" as const,
    type: "character" as const,
    language: "cantonese" as VoiceLanguage,
    description: "甜美可愛的女聲，適合少女角色",
    voice: "shimmer",
    sampleText: "好開心呀～",
    tags: ["甜美", "可愛", "少女"],
  },
  "cantonese-female-wise": {
    id: "cantonese-female-wise",
    name: "知薇",
    gender: "female" as const,
    type: "character" as const,
    language: "cantonese" as VoiceLanguage,
    description: "知性優雅的女聲，適合職業女性角色",
    voice: "nova",
    sampleText: "讓我分析一下呢個情況...",
    tags: ["知性", "優雅", "職業"],
  },
  "cantonese-female-dj": {
    id: "cantonese-female-dj",
    name: "星瀾",
    gender: "female" as const,
    type: "character" as const,
    language: "cantonese" as VoiceLanguage,
    description: "DJ風格的女聲，適合娛樂節目",
    voice: "shimmer",
    sampleText: "今晚嘅派對開始啦！",
    tags: ["DJ", "娛樂", "活潑"],
  },
  "cantonese-female-elegant2": {
    id: "cantonese-female-elegant2",
    name: "音韻霓裳",
    gender: "female" as const,
    type: "character" as const,
    language: "cantonese" as VoiceLanguage,
    description: "高貴典雅的女聲，適合貴族角色",
    voice: "nova",
    sampleText: "請多多指教。",
    tags: ["高貴", "典雅", "貴族"],
  },
  "cantonese-female-fairy": {
    id: "cantonese-female-fairy",
    name: "甘霓",
    gender: "female" as const,
    type: "character" as const,
    language: "cantonese" as VoiceLanguage,
    description: "仙氣飄飄的女聲，適合仙俠角色",
    voice: "nova",
    sampleText: "塵世間嘅紛擾...",
    tags: ["仙氣", "仙俠", "空靈"],
  },
  "cantonese-female-cute": {
    id: "cantonese-female-cute",
    name: "胡桃音姬",
    gender: "female" as const,
    type: "character" as const,
    language: "cantonese" as VoiceLanguage,
    description: "俏皮可愛的女聲，適合活潑角色",
    voice: "shimmer",
    sampleText: "嘻嘻，俾我捉到你啦！",
    tags: ["俏皮", "可愛", "活潑"],
  },
  "cantonese-female-clear": {
    id: "cantonese-female-clear",
    name: "清音姬",
    gender: "female" as const,
    type: "character" as const,
    language: "cantonese" as VoiceLanguage,
    description: "清澈明亮的女聲，適合純淨角色",
    voice: "nova",
    sampleText: "今日嘅天空好藍呀。",
    tags: ["清澈", "明亮", "純淨"],
  },
  "cantonese-female-loli": {
    id: "cantonese-female-loli",
    name: "可麗音",
    gender: "female" as const,
    type: "character" as const,
    language: "cantonese" as VoiceLanguage,
    description: "蘿莉風格的女聲，適合幼女角色",
    voice: "shimmer",
    sampleText: "大哥哥，陪我玩啦～",
    tags: ["蘿莉", "可愛", "幼女"],
  },
  "cantonese-female-assistant": {
    id: "cantonese-female-assistant",
    name: "晶靈助手",
    gender: "female" as const,
    type: "narrator" as const,
    language: "cantonese" as VoiceLanguage,
    description: "AI助手風格的女聲，適合智能助手",
    voice: "nova",
    sampleText: "有咩可以幫到你？",
    tags: ["助手", "AI", "智能"],
  },
  "cantonese-female-teacher": {
    id: "cantonese-female-teacher",
    name: "教導嚴音",
    gender: "female" as const,
    type: "character" as const,
    language: "cantonese" as VoiceLanguage,
    description: "嚴肅認真的女聲，適合教師角色",
    voice: "nova",
    sampleText: "同學們，注意聽講！",
    tags: ["嚴肅", "教師", "認真"],
  },
  "cantonese-female-gentle": {
    id: "cantonese-female-gentle",
    name: "璃紗",
    gender: "female" as const,
    type: "character" as const,
    language: "cantonese" as VoiceLanguage,
    description: "溫柔體貼的女聲，適合溫柔角色",
    voice: "nova",
    sampleText: "唔好擔心，我喺度。",
    tags: ["溫柔", "體貼", "溫暖"],
  },
  "cantonese-female-ice": {
    id: "cantonese-female-ice",
    name: "冰嬌夢音",
    gender: "female" as const,
    type: "character" as const,
    language: "cantonese" as VoiceLanguage,
    description: "冷艷高貴的女聲，適合冰山美人角色",
    voice: "nova",
    sampleText: "唔好靠近我。",
    tags: ["冷艷", "高貴", "冰山"],
  },
  "cantonese-female-proud": {
    id: "cantonese-female-proud",
    name: "傲嬌芳",
    gender: "female" as const,
    type: "character" as const,
    language: "cantonese" as VoiceLanguage,
    description: "傲嬌風格的女聲，適合傲嬌角色",
    voice: "shimmer",
    sampleText: "哼，唔係因為你呀！",
    tags: ["傲嬌", "可愛", "少女"],
  },
  "cantonese-female-breeze": {
    id: "cantonese-female-breeze",
    name: "輕聲清嵐",
    gender: "female" as const,
    type: "character" as const,
    language: "cantonese" as VoiceLanguage,
    description: "輕柔如風的女聲，適合文藝角色",
    voice: "nova",
    sampleText: "風輕輕咁吹過...",
    tags: ["輕柔", "文藝", "清新"],
  },
  "cantonese-female-morning": {
    id: "cantonese-female-morning",
    name: "晨曦露",
    gender: "female" as const,
    type: "character" as const,
    language: "cantonese" as VoiceLanguage,
    description: "清新明朗的女聲，適合早晨或清新主題",
    voice: "shimmer",
    sampleText: "早晨！新嘅一日開始啦！",
    tags: ["清新", "明朗", "早晨"],
  },
  
  // 粵語特殊角色
  "cantonese-child-boy": {
    id: "cantonese-child-boy",
    name: "金小猴",
    gender: "male" as const,
    type: "character" as const,
    language: "cantonese" as VoiceLanguage,
    description: "活潑可愛的男童聲音",
    voice: "echo",
    sampleText: "媽媽，我想食雪糕！",
    tags: ["兒童", "男孩", "可愛"],
  },
  "cantonese-elder-male": {
    id: "cantonese-elder-male",
    name: "老國聲",
    gender: "male" as const,
    type: "character" as const,
    language: "cantonese" as VoiceLanguage,
    description: "溫和智慧的老年男聲",
    voice: "fable",
    sampleText: "後生仔，聽阿爺講個故事你聽。",
    tags: ["老人", "爺爺", "智者"],
  },
  "cantonese-elder-female": {
    id: "cantonese-elder-female",
    name: "魏紹蘭",
    gender: "female" as const,
    type: "character" as const,
    language: "cantonese" as VoiceLanguage,
    description: "溫暖慈祥的老年女聲",
    voice: "nova",
    sampleText: "乖孫，嚟食奶奶煮嘅湯。",
    tags: ["老人", "奶奶", "溫暖"],
  },
  
  // ============================================
  // 普通話配音員 (Mandarin)
  // ============================================
  
  // 基礎配音員
  "mandarin-male-narrator": {
    id: "mandarin-male-narrator",
    name: "京腔侃爺",
    gender: "male" as const,
    type: "narrator" as const,
    language: "mandarin" as VoiceLanguage,
    description: "渾厚穩重的普通話男聲，適合旁白和敘述",
    voice: "alloy",
    sampleText: "大家好，欢迎来到我的频道，今天和大家分享一个精彩的故事。",
    tags: ["旁白", "敘述", "紀錄片"],
  },
  "mandarin-male-young": {
    id: "mandarin-male-young",
    name: "陽光青年",
    gender: "male" as const,
    type: "character" as const,
    language: "mandarin" as VoiceLanguage,
    description: "年輕有活力的普通話男聲，適合年輕男性角色",
    voice: "echo",
    sampleText: "嘿，你说的不是开玩笑吧？我要试试看！",
    tags: ["年輕", "活潑", "男主角"],
  },
  "mandarin-male-mature": {
    id: "mandarin-male-mature",
    name: "淵博小叔",
    gender: "male" as const,
    type: "character" as const,
    language: "mandarin" as VoiceLanguage,
    description: "成熟穩重的普通話男聲，適合中年男性角色",
    voice: "onyx",
    sampleText: "这件事不简单，需要仔细考虑。",
    tags: ["成熟", "穩重", "父親", "老闆"],
  },
  "mandarin-female-narrator": {
    id: "mandarin-female-narrator",
    name: "爽快思思",
    gender: "female" as const,
    type: "narrator" as const,
    language: "mandarin" as VoiceLanguage,
    description: "溫柔優雅的普通話女聲，適合旁白和敘述",
    voice: "nova",
    sampleText: "在这个安静的夜晚，月光照在小镇的街道上...",
    tags: ["旁白", "敘述", "溫柔"],
  },
  "mandarin-female-young": {
    id: "mandarin-female-young",
    name: "鄰家女孩",
    gender: "female" as const,
    type: "character" as const,
    language: "mandarin" as VoiceLanguage,
    description: "年輕活潑的普通話女聲，適合年輕女性角色",
    voice: "shimmer",
    sampleText: "哇，真的太棒了！我简直不敢相信！",
    tags: ["年輕", "活潑", "女主角"],
  },
  "mandarin-female-mature": {
    id: "mandarin-female-mature",
    name: "高冷御姐",
    gender: "female" as const,
    type: "character" as const,
    language: "mandarin" as VoiceLanguage,
    description: "成熟優雅的普通話女聲，適合中年女性角色",
    voice: "alloy",
    sampleText: "你要记住，做人最重要的是诚实。",
    tags: ["成熟", "優雅", "母親"],
  },
  
  // 擴充普通話男聲
  "mandarin-male-warm": {
    id: "mandarin-male-warm",
    name: "溫暖阿虎",
    gender: "male" as const,
    type: "character" as const,
    language: "mandarin" as VoiceLanguage,
    description: "溫暖親切的男聲，適合暖男角色",
    voice: "alloy",
    sampleText: "别担心，有我在呢。",
    tags: ["溫暖", "親切", "暖男"],
  },
  "mandarin-male-arrogant": {
    id: "mandarin-male-arrogant",
    name: "傲嬌霸總",
    gender: "male" as const,
    type: "character" as const,
    language: "mandarin" as VoiceLanguage,
    description: "霸道總裁風格的男聲",
    voice: "onyx",
    sampleText: "这个项目，我要了。",
    tags: ["霸道", "總裁", "傲嬌"],
  },
  "mandarin-male-teen": {
    id: "mandarin-male-teen",
    name: "少年梓辛",
    gender: "male" as const,
    type: "character" as const,
    language: "mandarin" as VoiceLanguage,
    description: "少年風格的男聲，適合青春角色",
    voice: "echo",
    sampleText: "我一定会变得更强的！",
    tags: ["少年", "青春", "熱血"],
  },
  "mandarin-male-news": {
    id: "mandarin-male-news",
    name: "新聞男聲",
    gender: "male" as const,
    type: "narrator" as const,
    language: "mandarin" as VoiceLanguage,
    description: "專業新聞播報風格",
    voice: "alloy",
    sampleText: "各位观众朋友们，大家好。",
    tags: ["新聞", "播報", "專業"],
  },
  "mandarin-male-magnetic": {
    id: "mandarin-male-magnetic",
    name: "磁性男聲",
    gender: "male" as const,
    type: "character" as const,
    language: "mandarin" as VoiceLanguage,
    description: "磁性迷人的男聲",
    voice: "onyx",
    sampleText: "让我来告诉你一个秘密...",
    tags: ["磁性", "迷人", "深沉"],
  },
  "mandarin-male-gentle": {
    id: "mandarin-male-gentle",
    name: "溫柔小哥",
    gender: "male" as const,
    type: "character" as const,
    language: "mandarin" as VoiceLanguage,
    description: "溫柔體貼的男聲",
    voice: "alloy",
    sampleText: "没关系，慢慢来。",
    tags: ["溫柔", "體貼", "溫暖"],
  },
  "mandarin-male-cheerful": {
    id: "mandarin-male-cheerful",
    name: "開朗青年",
    gender: "male" as const,
    type: "character" as const,
    language: "mandarin" as VoiceLanguage,
    description: "開朗樂觀的男聲",
    voice: "echo",
    sampleText: "哈哈，今天心情真好！",
    tags: ["開朗", "樂觀", "活潑"],
  },
  "mandarin-male-elegant": {
    id: "mandarin-male-elegant",
    name: "儒雅青年",
    gender: "male" as const,
    type: "character" as const,
    language: "mandarin" as VoiceLanguage,
    description: "儒雅書生風格的男聲",
    voice: "alloy",
    sampleText: "古人云...",
    tags: ["儒雅", "書生", "文雅"],
  },
  "mandarin-male-simple": {
    id: "mandarin-male-simple",
    name: "質樸青年",
    gender: "male" as const,
    type: "character" as const,
    language: "mandarin" as VoiceLanguage,
    description: "質樸真誠的男聲",
    voice: "alloy",
    sampleText: "我说的都是真心话。",
    tags: ["質樸", "真誠", "樸實"],
  },
  "mandarin-male-boss": {
    id: "mandarin-male-boss",
    name: "霸氣青叔",
    gender: "male" as const,
    type: "character" as const,
    language: "mandarin" as VoiceLanguage,
    description: "霸氣威嚴的男聲",
    voice: "onyx",
    sampleText: "这件事，就这么定了。",
    tags: ["霸氣", "威嚴", "老闆"],
  },
  "mandarin-male-commentary": {
    id: "mandarin-male-commentary",
    name: "活力解說男",
    gender: "male" as const,
    type: "narrator" as const,
    language: "mandarin" as VoiceLanguage,
    description: "充滿活力的解說風格",
    voice: "echo",
    sampleText: "精彩的一幕出现了！",
    tags: ["解說", "活力", "體育"],
  },
  "mandarin-male-steady": {
    id: "mandarin-male-steady",
    name: "沉穩解說男",
    gender: "male" as const,
    type: "narrator" as const,
    language: "mandarin" as VoiceLanguage,
    description: "沉穩專業的解說風格",
    voice: "alloy",
    sampleText: "让我们来分析一下这个局势。",
    tags: ["解說", "沉穩", "專業"],
  },
  "mandarin-male-handsome": {
    id: "mandarin-male-handsome",
    name: "解說小帥",
    gender: "male" as const,
    type: "narrator" as const,
    language: "mandarin" as VoiceLanguage,
    description: "帥氣陽光的解說風格",
    voice: "echo",
    sampleText: "大家好，我是你们的解说员。",
    tags: ["解說", "帥氣", "陽光"],
  },
  "mandarin-male-emotional": {
    id: "mandarin-male-emotional",
    name: "情感小帥",
    gender: "male" as const,
    type: "character" as const,
    language: "mandarin" as VoiceLanguage,
    description: "情感豐富的男聲",
    voice: "echo",
    sampleText: "我真的很想念你...",
    tags: ["情感", "深情", "浪漫"],
  },
  "mandarin-male-promo": {
    id: "mandarin-male-promo",
    name: "促銷男聲",
    gender: "male" as const,
    type: "narrator" as const,
    language: "mandarin" as VoiceLanguage,
    description: "促銷廣告風格的男聲",
    voice: "echo",
    sampleText: "限时特惠，不容错过！",
    tags: ["促銷", "廣告", "活力"],
  },
  "mandarin-male-dub": {
    id: "mandarin-male-dub",
    name: "譯製片男聲",
    gender: "male" as const,
    type: "narrator" as const,
    language: "mandarin" as VoiceLanguage,
    description: "經典譯製片風格的男聲",
    voice: "alloy",
    sampleText: "在那遥远的地方...",
    tags: ["譯製片", "經典", "配音"],
  },
  "mandarin-male-chongqing": {
    id: "mandarin-male-chongqing",
    name: "重慶小伙",
    gender: "male" as const,
    type: "character" as const,
    language: "mandarin" as VoiceLanguage,
    description: "重慶方言風格的男聲",
    voice: "echo",
    sampleText: "巴适得很！",
    tags: ["重慶", "方言", "活潑"],
  },
  
  // 擴充普通話女聲
  "mandarin-female-taiwan": {
    id: "mandarin-female-taiwan",
    name: "灣灣小何",
    gender: "female" as const,
    type: "character" as const,
    language: "mandarin" as VoiceLanguage,
    description: "台灣腔風格的女聲",
    voice: "shimmer",
    sampleText: "好啦好啦，我知道了啦～",
    tags: ["台灣腔", "可愛", "甜美"],
  },
  "mandarin-female-cancan": {
    id: "mandarin-female-cancan",
    name: "燦燦",
    gender: "female" as const,
    type: "character" as const,
    language: "mandarin" as VoiceLanguage,
    description: "陽光開朗的女聲",
    voice: "shimmer",
    sampleText: "今天也是元气满满的一天！",
    tags: ["陽光", "開朗", "活力"],
  },
  "mandarin-female-zizi": {
    id: "mandarin-female-zizi",
    name: "梓梓",
    gender: "female" as const,
    type: "character" as const,
    language: "mandarin" as VoiceLanguage,
    description: "溫柔甜美的女聲",
    voice: "nova",
    sampleText: "谢谢你的关心～",
    tags: ["溫柔", "甜美", "可愛"],
  },
  "mandarin-female-ranran": {
    id: "mandarin-female-ranran",
    name: "燃燃",
    gender: "female" as const,
    type: "character" as const,
    language: "mandarin" as VoiceLanguage,
    description: "熱情活力的女聲",
    voice: "shimmer",
    sampleText: "加油加油！我们一定行！",
    tags: ["熱情", "活力", "元氣"],
  },
  "mandarin-female-weiwei": {
    id: "mandarin-female-weiwei",
    name: "薇薇",
    gender: "female" as const,
    type: "character" as const,
    language: "mandarin" as VoiceLanguage,
    description: "優雅知性的女聲",
    voice: "nova",
    sampleText: "让我来为大家介绍一下。",
    tags: ["優雅", "知性", "大方"],
  },
  "mandarin-female-news": {
    id: "mandarin-female-news",
    name: "新聞女聲",
    gender: "female" as const,
    type: "narrator" as const,
    language: "mandarin" as VoiceLanguage,
    description: "專業新聞播報風格",
    voice: "nova",
    sampleText: "各位观众，现在播报今天的新闻。",
    tags: ["新聞", "播報", "專業"],
  },
  "mandarin-female-intellectual": {
    id: "mandarin-female-intellectual",
    name: "知性女聲",
    gender: "female" as const,
    type: "narrator" as const,
    language: "mandarin" as VoiceLanguage,
    description: "知性優雅的女聲",
    voice: "nova",
    sampleText: "让我们一起来探讨这个话题。",
    tags: ["知性", "優雅", "專業"],
  },
  "mandarin-female-friendly": {
    id: "mandarin-female-friendly",
    name: "親切女聲",
    gender: "female" as const,
    type: "narrator" as const,
    language: "mandarin" as VoiceLanguage,
    description: "親切溫暖的女聲",
    voice: "nova",
    sampleText: "欢迎来到我们的节目。",
    tags: ["親切", "溫暖", "友好"],
  },
  "mandarin-female-gentle": {
    id: "mandarin-female-gentle",
    name: "溫柔淑女",
    gender: "female" as const,
    type: "character" as const,
    language: "mandarin" as VoiceLanguage,
    description: "溫柔賢淑的女聲",
    voice: "nova",
    sampleText: "请慢慢说，我在听。",
    tags: ["溫柔", "賢淑", "溫暖"],
  },
  "mandarin-female-sweet": {
    id: "mandarin-female-sweet",
    name: "甜寵少御",
    gender: "female" as const,
    type: "character" as const,
    language: "mandarin" as VoiceLanguage,
    description: "甜美撒嬌的女聲",
    voice: "shimmer",
    sampleText: "人家不要嘛～",
    tags: ["甜美", "撒嬌", "可愛"],
  },
  "mandarin-female-ancient": {
    id: "mandarin-female-ancient",
    name: "古風少御",
    gender: "female" as const,
    type: "character" as const,
    language: "mandarin" as VoiceLanguage,
    description: "古風仙氣的女聲",
    voice: "nova",
    sampleText: "公子，请留步。",
    tags: ["古風", "仙氣", "優雅"],
  },
  "mandarin-female-lively": {
    id: "mandarin-female-lively",
    name: "活潑女聲",
    gender: "female" as const,
    type: "character" as const,
    language: "mandarin" as VoiceLanguage,
    description: "活潑開朗的女聲",
    voice: "shimmer",
    sampleText: "哈哈，太好玩了！",
    tags: ["活潑", "開朗", "元氣"],
  },
  "mandarin-female-promo": {
    id: "mandarin-female-promo",
    name: "促銷女聲",
    gender: "female" as const,
    type: "narrator" as const,
    language: "mandarin" as VoiceLanguage,
    description: "促銷廣告風格的女聲",
    voice: "shimmer",
    sampleText: "超值优惠，快来抢购！",
    tags: ["促銷", "廣告", "活力"],
  },
  "mandarin-female-movie": {
    id: "mandarin-female-movie",
    name: "影視小美",
    gender: "female" as const,
    type: "narrator" as const,
    language: "mandarin" as VoiceLanguage,
    description: "影視解說風格的女聲",
    voice: "nova",
    sampleText: "接下来，让我们看看这部电影的精彩片段。",
    tags: ["影視", "解說", "專業"],
  },
  "mandarin-female-anchor": {
    id: "mandarin-female-anchor",
    name: "直播一姐",
    gender: "female" as const,
    type: "narrator" as const,
    language: "mandarin" as VoiceLanguage,
    description: "直播主播風格的女聲",
    voice: "shimmer",
    sampleText: "宝宝们，点点关注不迷路！",
    tags: ["直播", "主播", "活力"],
  },
  "mandarin-female-literary": {
    id: "mandarin-female-literary",
    name: "文藝女聲",
    gender: "female" as const,
    type: "narrator" as const,
    language: "mandarin" as VoiceLanguage,
    description: "文藝清新的女聲",
    voice: "nova",
    sampleText: "岁月静好，时光温柔。",
    tags: ["文藝", "清新", "詩意"],
  },
  "mandarin-female-sister": {
    id: "mandarin-female-sister",
    name: "知性姐姐",
    gender: "female" as const,
    type: "character" as const,
    language: "mandarin" as VoiceLanguage,
    description: "知性大姐姐風格的女聲",
    voice: "nova",
    sampleText: "来，姐姐教你。",
    tags: ["知性", "姐姐", "成熟"],
  },
  "mandarin-female-sichuan": {
    id: "mandarin-female-sichuan",
    name: "四川甜妹兒",
    gender: "female" as const,
    type: "character" as const,
    language: "mandarin" as VoiceLanguage,
    description: "四川方言風格的女聲",
    voice: "shimmer",
    sampleText: "安逸得很！",
    tags: ["四川", "方言", "甜美"],
  },
  
  // 普通話特殊角色
  "mandarin-child-girl": {
    id: "mandarin-child-girl",
    name: "小蘿莉",
    gender: "female" as const,
    type: "character" as const,
    language: "mandarin" as VoiceLanguage,
    description: "甜美可愛的女童聲音",
    voice: "shimmer",
    sampleText: "谢谢叔叔阿姨！",
    tags: ["兒童", "女孩", "甜美"],
  },
  "mandarin-child-boy": {
    id: "mandarin-child-boy",
    name: "奶氣萌娃",
    gender: "male" as const,
    type: "character" as const,
    language: "mandarin" as VoiceLanguage,
    description: "奶聲奶氣的男童聲音",
    voice: "echo",
    sampleText: "妈妈，我想吃糖！",
    tags: ["兒童", "男孩", "可愛"],
  },
  "mandarin-child-genius": {
    id: "mandarin-child-genius",
    name: "天才童聲",
    gender: "male" as const,
    type: "character" as const,
    language: "mandarin" as VoiceLanguage,
    description: "聰明伶俐的童聲",
    voice: "echo",
    sampleText: "这道题我会！",
    tags: ["兒童", "聰明", "活潑"],
  },
  "mandarin-elder-male": {
    id: "mandarin-elder-male",
    name: "智慧老者",
    gender: "male" as const,
    type: "character" as const,
    language: "mandarin" as VoiceLanguage,
    description: "智慧慈祥的老年男聲",
    voice: "fable",
    sampleText: "年轻人，听老夫一言。",
    tags: ["老人", "智慧", "慈祥"],
  },
  "mandarin-elder-female": {
    id: "mandarin-elder-female",
    name: "慈愛姥姥",
    gender: "female" as const,
    type: "character" as const,
    language: "mandarin" as VoiceLanguage,
    description: "慈愛溫暖的老年女聲",
    voice: "nova",
    sampleText: "乖孙子，来吃姥姥做的饭。",
    tags: ["老人", "姥姥", "慈愛"],
  },
  "mandarin-cartoon-sponge": {
    id: "mandarin-cartoon-sponge",
    name: "動漫海綿",
    gender: "male" as const,
    type: "character" as const,
    language: "mandarin" as VoiceLanguage,
    description: "海綿寶寶風格的聲音",
    voice: "echo",
    sampleText: "我准备好了！",
    tags: ["動漫", "卡通", "搞笑"],
  },
  "mandarin-cartoon-star": {
    id: "mandarin-cartoon-star",
    name: "動漫海星",
    gender: "male" as const,
    type: "character" as const,
    language: "mandarin" as VoiceLanguage,
    description: "派大星風格的聲音",
    voice: "echo",
    sampleText: "这是什么？",
    tags: ["動漫", "卡通", "呆萌"],
  },
  "mandarin-cartoon-shin": {
    id: "mandarin-cartoon-shin",
    name: "動漫小新",
    gender: "male" as const,
    type: "character" as const,
    language: "mandarin" as VoiceLanguage,
    description: "蠟筆小新風格的聲音",
    voice: "echo",
    sampleText: "动感光波！",
    tags: ["動漫", "卡通", "搞怪"],
  },
  "mandarin-rap": {
    id: "mandarin-rap",
    name: "說唱小哥",
    gender: "male" as const,
    type: "character" as const,
    language: "mandarin" as VoiceLanguage,
    description: "說唱風格的男聲",
    voice: "echo",
    sampleText: "Yo，check it out！",
    tags: ["說唱", "嘻哈", "潮流"],
  },
  
  // ============================================
  // 英語配音員 (English)
  // ============================================
  
  // 基礎配音員
  "english-male-narrator": {
    id: "english-male-narrator",
    name: "Alyx",
    gender: "male" as const,
    type: "narrator" as const,
    language: "english" as VoiceLanguage,
    description: "Vibrant British male voice for narration",
    voice: "alloy",
    sampleText: "Welcome to our channel. Today, we're going to share an amazing story with you.",
    tags: ["narrator", "British", "professional"],
  },
  "english-male-young": {
    id: "english-male-young",
    name: "Johnny Kid",
    gender: "male" as const,
    type: "character" as const,
    language: "english" as VoiceLanguage,
    description: "Serious young male voice for youthful characters",
    voice: "echo",
    sampleText: "Hey, are you kidding me? I've got to try this!",
    tags: ["young", "serious", "protagonist"],
  },
  "english-male-mature": {
    id: "english-male-mature",
    name: "Christopher",
    gender: "male" as const,
    type: "character" as const,
    language: "english" as VoiceLanguage,
    description: "Mature and steady male voice for middle-aged characters",
    voice: "onyx",
    sampleText: "This isn't simple. We need to think it through carefully.",
    tags: ["mature", "steady", "father", "boss"],
  },
  "english-female-narrator": {
    id: "english-female-narrator",
    name: "Samara X",
    gender: "female" as const,
    type: "narrator" as const,
    language: "english" as VoiceLanguage,
    description: "Warm and elegant female voice for narration",
    voice: "nova",
    sampleText: "On this quiet evening, the moonlight shone upon the streets of the small town...",
    tags: ["narrator", "warm", "elegant"],
  },
  "english-female-young": {
    id: "english-female-young",
    name: "Amelia",
    gender: "female" as const,
    type: "character" as const,
    language: "english" as VoiceLanguage,
    description: "Lively young female voice for youthful characters",
    voice: "shimmer",
    sampleText: "Wow, this is amazing! I can't believe it!",
    tags: ["young", "lively", "protagonist"],
  },
  "english-female-mature": {
    id: "english-female-mature",
    name: "Alexis Lancaster",
    gender: "female" as const,
    type: "character" as const,
    language: "english" as VoiceLanguage,
    description: "Studio quality smooth British female voice",
    voice: "alloy",
    sampleText: "Remember, the most important thing in life is honesty.",
    tags: ["mature", "elegant", "British"],
  },
  
  // 擴充英語男聲
  "english-male-adam": {
    id: "english-male-adam",
    name: "Adam Stone",
    gender: "male" as const,
    type: "narrator" as const,
    language: "english" as VoiceLanguage,
    description: "Late night radio style voice",
    voice: "onyx",
    sampleText: "Good evening, listeners. Welcome to the late night show.",
    tags: ["radio", "deep", "smooth"],
  },
  "english-male-russell": {
    id: "english-male-russell",
    name: "Russell",
    gender: "male" as const,
    type: "narrator" as const,
    language: "english" as VoiceLanguage,
    description: "Dramatic British TV style voice",
    voice: "onyx",
    sampleText: "In a world where nothing is as it seems...",
    tags: ["dramatic", "British", "TV"],
  },
  "english-male-alexander": {
    id: "english-male-alexander",
    name: "Alexander Kensington",
    gender: "male" as const,
    type: "narrator" as const,
    language: "english" as VoiceLanguage,
    description: "Studio quality professional voice",
    voice: "alloy",
    sampleText: "Ladies and gentlemen, may I have your attention please.",
    tags: ["professional", "studio", "formal"],
  },
  "english-male-jeremy": {
    id: "english-male-jeremy",
    name: "Jeremy",
    gender: "male" as const,
    type: "character" as const,
    language: "english" as VoiceLanguage,
    description: "Friendly conversational male voice",
    voice: "echo",
    sampleText: "Hey there! Great to meet you!",
    tags: ["friendly", "casual", "conversational"],
  },
  "english-male-aaran": {
    id: "english-male-aaran",
    name: "Aaran",
    gender: "male" as const,
    type: "character" as const,
    language: "english" as VoiceLanguage,
    description: "Energetic young male voice",
    voice: "echo",
    sampleText: "Let's do this! I'm so excited!",
    tags: ["energetic", "young", "excited"],
  },
  "english-male-archer": {
    id: "english-male-archer",
    name: "Archer",
    gender: "male" as const,
    type: "character" as const,
    language: "english" as VoiceLanguage,
    description: "Cool and confident male voice",
    voice: "onyx",
    sampleText: "Trust me, I've got this under control.",
    tags: ["cool", "confident", "action"],
  },
  "english-male-nathaniel": {
    id: "english-male-nathaniel",
    name: "Nathaniel C.",
    gender: "male" as const,
    type: "narrator" as const,
    language: "english" as VoiceLanguage,
    description: "Customer care agent style voice",
    voice: "alloy",
    sampleText: "Thank you for calling. How may I assist you today?",
    tags: ["professional", "customer service", "friendly"],
  },
  
  // 擴充英語女聲
  "english-female-elli": {
    id: "english-female-elli",
    name: "Elli",
    gender: "female" as const,
    type: "character" as const,
    language: "english" as VoiceLanguage,
    description: "Sweet and gentle female voice",
    voice: "shimmer",
    sampleText: "Oh, that's so lovely!",
    tags: ["sweet", "gentle", "friendly"],
  },
  "english-female-dorothy": {
    id: "english-female-dorothy",
    name: "Dorothy",
    gender: "female" as const,
    type: "character" as const,
    language: "english" as VoiceLanguage,
    description: "Classic elegant female voice",
    voice: "nova",
    sampleText: "There's no place like home.",
    tags: ["classic", "elegant", "warm"],
  },
  "english-female-serena": {
    id: "english-female-serena",
    name: "Serena",
    gender: "female" as const,
    type: "character" as const,
    language: "english" as VoiceLanguage,
    description: "Calm and soothing female voice",
    voice: "nova",
    sampleText: "Take a deep breath and relax.",
    tags: ["calm", "soothing", "meditation"],
  },
  "english-female-jessi": {
    id: "english-female-jessi",
    name: "Jessi",
    gender: "female" as const,
    type: "character" as const,
    language: "english" as VoiceLanguage,
    description: "Energetic and fun female voice",
    voice: "shimmer",
    sampleText: "This is gonna be so much fun!",
    tags: ["energetic", "fun", "young"],
  },
  "english-female-allison": {
    id: "english-female-allison",
    name: "Allison",
    gender: "female" as const,
    type: "narrator" as const,
    language: "english" as VoiceLanguage,
    description: "Inviting velvety British accent",
    voice: "nova",
    sampleText: "Welcome to our journey through time.",
    tags: ["British", "inviting", "velvety"],
  },
  "english-female-liberty": {
    id: "english-female-liberty",
    name: "Liberty X",
    gender: "female" as const,
    type: "character" as const,
    language: "english" as VoiceLanguage,
    description: "Bold and confident female voice",
    voice: "shimmer",
    sampleText: "Nothing can stop us now!",
    tags: ["bold", "confident", "powerful"],
  },
  "english-female-shelby": {
    id: "english-female-shelby",
    name: "Shelby",
    gender: "female" as const,
    type: "character" as const,
    language: "english" as VoiceLanguage,
    description: "Warm Southern American accent",
    voice: "nova",
    sampleText: "Well, bless your heart!",
    tags: ["Southern", "warm", "friendly"],
  },
  
  // ============================================
  // 克隆聲音 (Clone Voices)
  // ============================================
  
  "clone-po": {
    id: "clone-po",
    name: "PO 克隆聲音",
    gender: "male" as const,
    type: "narrator" as const,
    language: "clone" as VoiceLanguage,
    description: "PO 的克隆語音，粵語發音，適合旁白和敘述",
    voice: "alloy",
    sampleText: "大家好，歡迎嘶到我嘅頻道。",
    tags: ["克隆", "PO", "粵語", "旁白"],
    sampleUrl: "https://aigc-cdn.kreadoai.com/default_voice/audio/2025/12/eaf6d307ffaf43a694f487dbfd138bc7.mp3",
  },
  
  // ============================================
  // 向後兼容（舊版配音員 ID）
  // ============================================
  "male-narrator": {
    id: "male-narrator",
    name: "男聲旁白",
    gender: "male" as const,
    type: "narrator" as const,
    language: "cantonese" as VoiceLanguage,
    description: "渾厚穩重的男聲，適合旁白和敘述",
    voice: "alloy",
    sampleText: "大家好，歡迎嚟到我嘅頻道。",
    tags: ["旁白", "敘述", "紀錄片"],
  },
  "male-young": {
    id: "male-young",
    name: "年輕男聲",
    gender: "male" as const,
    type: "character" as const,
    language: "cantonese" as VoiceLanguage,
    description: "年輕有活力的男聲，適合年輕男性角色",
    voice: "echo",
    sampleText: "哎，你講嘅係唔係真㗎？",
    tags: ["年輕", "活潑", "男主角"],
  },
  "male-mature": {
    id: "male-mature",
    name: "成熟男聲",
    gender: "male" as const,
    type: "character" as const,
    language: "cantonese" as VoiceLanguage,
    description: "成熟穩重的男聲，適合中年男性角色",
    voice: "onyx",
    sampleText: "呢件事唔簡單，要諗清楚先得。",
    tags: ["成熟", "穩重", "父親", "老闆"],
  },
  "male-deep": {
    id: "male-deep",
    name: "深沉男聲",
    gender: "male" as const,
    type: "character" as const,
    language: "cantonese" as VoiceLanguage,
    description: "深沉有磁性的男聲，適合神秘或正式場合",
    voice: "fable",
    sampleText: "命運嘅輪盤已經開始轉動...",
    tags: ["深沉", "磁性", "神秘"],
  },
  "female-narrator": {
    id: "female-narrator",
    name: "女聲旁白",
    gender: "female" as const,
    type: "narrator" as const,
    language: "cantonese" as VoiceLanguage,
    description: "溫柔優雅的女聲，適合旁白和敘述",
    voice: "nova",
    sampleText: "喺呢個安靜嘅夜晚...",
    tags: ["旁白", "敘述", "溫柔"],
  },
  "female-young": {
    id: "female-young",
    name: "年輕女聲",
    gender: "female" as const,
    type: "character" as const,
    language: "cantonese" as VoiceLanguage,
    description: "年輕活潑的女聲，適合年輕女性角色",
    voice: "shimmer",
    sampleText: "哇，真係好靚呀！",
    tags: ["年輕", "活潑", "女主角"],
  },
  "female-mature": {
    id: "female-mature",
    name: "成熟女聲",
    gender: "female" as const,
    type: "character" as const,
    language: "cantonese" as VoiceLanguage,
    description: "成熟優雅的女聲，適合中年女性角色",
    voice: "alloy",
    sampleText: "你要記住，做人最緊要係誠實。",
    tags: ["成熟", "優雅", "母親"],
  },
  "child-boy": {
    id: "child-boy",
    name: "男童聲",
    gender: "male" as const,
    type: "character" as const,
    language: "cantonese" as VoiceLanguage,
    description: "活潑可愛的男童聲音",
    voice: "echo",
    sampleText: "媽媽，我想食雪糕！",
    tags: ["兒童", "男孩", "可愛"],
  },
  "child-girl": {
    id: "child-girl",
    name: "女童聲",
    gender: "female" as const,
    type: "character" as const,
    language: "cantonese" as VoiceLanguage,
    description: "甜美可愛的女童聲音",
    voice: "shimmer",
    sampleText: "多謝你呀，你真係好人！",
    tags: ["兒童", "女孩", "甜美"],
  },
  "elderly-male": {
    id: "elderly-male",
    name: "老年男聲",
    gender: "male" as const,
    type: "character" as const,
    language: "cantonese" as VoiceLanguage,
    description: "溫和智慧的老年男聲",
    voice: "fable",
    sampleText: "後生仔，聽阿爺講個故事你聽。",
    tags: ["老人", "爺爺", "智者"],
  },
  "elderly-female": {
    id: "elderly-female",
    name: "老年女聲",
    gender: "female" as const,
    type: "character" as const,
    language: "cantonese" as VoiceLanguage,
    description: "溫暖慈祥的老年女聲",
    voice: "nova",
    sampleText: "乖孫，嚟食奶奶煮嘅湯。",
    tags: ["老人", "奶奶", "溫暖"],
  },
} as const;

// 根據語言篩選配音員
export function getVoiceActorsByLanguage(language: VoiceLanguage) {
  return Object.values(VOICE_ACTORS).filter(actor => actor.language === language);
}

// 配音模式
export const VOICE_MODES = {
  unified: {
    name: "統一配音",
    description: "所有場景使用同一個配音員",
    icon: "🎙️",
  },
  perScene: {
    name: "場景配音",
    description: "每個場景可選擇不同配音員",
    icon: "🎬",
  },
  character: {
    name: "角色配音",
    description: "根據角色自動分配配音員，適合對話場景",
    icon: "👥",
  },
} as const;

// AI 配音員匹配規則
export const VOICE_MATCHING_RULES = {
  // 根據角色描述關鍵詞匹配
  keywords: {
    "男孩": "child-boy",
    "小男孩": "child-boy",
    "兒子": "child-boy",
    "女孩": "child-girl",
    "小女孩": "child-girl",
    "女兒": "child-girl",
    "年輕男": "male-young",
    "年輕女": "female-young",
    "少年": "male-young",
    "少女": "female-young",
    "中年男": "male-mature",
    "中年女": "female-mature",
    "老人": "elderly-male",
    "老爺爺": "elderly-male",
    "爺爺": "elderly-male",
    "老奶奶": "elderly-female",
    "奶奶": "elderly-female",
    "父親": "male-mature",
    "爸爸": "male-mature",
    "母親": "female-mature",
    "媽媽": "female-mature",
    "探險家": "male-young",
    "女探險家": "female-young",
  },
  // 默認配音員
  defaultNarrator: "male-narrator",
  defaultMale: "male-young",
  defaultFemale: "female-young",
} as const;

export type VoiceActorId = keyof typeof VOICE_ACTORS;
export type VoiceMode = keyof typeof VOICE_MODES;
export type VideoModel = keyof typeof VIDEO_MODELS;
export type LLMModel = keyof typeof LLM_MODELS;
export type SpeedMode = keyof typeof SPEED_MODE_PRESETS;
export type StoryMode = keyof typeof STORY_MODE_PRESETS;
export type GenerationMode = SpeedMode; // 向後兼容
