/**
 * SEO 生成服務
 * 為視頻生成優化的標題、描述、關鍵詞和標籤
 * 支持 Claude 4.5、GPT 5.2、Gemini 3 Pro 模型
 */

import { API_KEYS, getNextApiKey } from "./videoConfig";

// SEO 生成結果類型
export interface SeoGenerationResult {
  titles: string[];
  description: string;
  keywords: string[];
  tags: string[];
  hashtags: string[];
  thumbnailSuggestions: string[];
}

// 平台類型
export type Platform = "youtube" | "tiktok" | "instagram" | "facebook" | "general";

// 語言類型
export type SeoLanguage = "zh-TW" | "zh-CN" | "en" | "ja" | "ko" | "cantonese" | "mandarin" | "english";

// SEO LLM 模型類型
export type SeoLlmModel = "gpt-5.2" | "claude-opus-4-5-20251101" | "gemini-3-pro-preview";

// SEO LLM 模型配置
export const SEO_LLM_MODELS = {
  "gpt-5.2": {
    name: "GPT 5.2",
    provider: "OpenAI",
    description: "快速且高質量，適合大多數場景",
    speed: "快速",
  },
  "claude-opus-4-5-20251101": {
    name: "Claude Opus 4.5",
    provider: "Anthropic",
    description: "深度理解和創意寫作，適合高質量內容",
    speed: "中等",
  },
  "gemini-3-pro-preview": {
    name: "Gemini 3 Pro",
    provider: "Google",
    description: "多語言優化，適合國際化內容",
    speed: "中等",
  },
} as const;

// 平台特定配置
const PLATFORM_CONFIG: Record<Platform, {
  titleMaxLength: number;
  descriptionMaxLength: number;
  maxTags: number;
  maxHashtags: number;
}> = {
  youtube: { titleMaxLength: 100, descriptionMaxLength: 5000, maxTags: 15, maxHashtags: 5 },
  tiktok: { titleMaxLength: 150, descriptionMaxLength: 2200, maxTags: 10, maxHashtags: 8 },
  instagram: { titleMaxLength: 125, descriptionMaxLength: 2200, maxTags: 30, maxHashtags: 30 },
  facebook: { titleMaxLength: 255, descriptionMaxLength: 63206, maxTags: 10, maxHashtags: 5 },
  general: { titleMaxLength: 100, descriptionMaxLength: 1000, maxTags: 10, maxHashtags: 5 },
};

function getPromptLanguage(language: SeoLanguage): string {
  switch (language) {
    case "zh-TW":
    case "cantonese":
      return "繁體中文（香港/台灣風格）";
    case "zh-CN":
    case "mandarin":
      return "簡體中文";
    case "en":
    case "english":
      return "English";
    case "ja":
      return "日本語";
    case "ko":
      return "한국어";
    default:
      return "繁體中文";
  }
}

function getPlatformOptimization(platform: Platform): string {
  switch (platform) {
    case "youtube":
      return "標題要包含搜索關鍵詞，使用數字和括號增加點擊率，描述前150字最重要";
    case "tiktok":
      return "標題要簡短有力製造懸念，使用流行話題標籤，描述要有互動性";
    case "instagram":
      return "標題要引發情感共鳴，使用大量相關話題標籤，描述要有故事性";
    case "facebook":
      return "標題要引發討論和分享，描述要有價值和見解，使用問句引發互動";
    default:
      return "標題清晰描述內容，描述完整有條理，關鍵詞相關性強";
  }
}

/**
 * 調用 LLM API（支持多模型）
 */
async function callLlmApi(params: {
  model: SeoLlmModel;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  const { model, systemPrompt, userPrompt, temperature = 0.8, maxTokens = 2000 } = params;
  
  const apiKey = getNextApiKey();

  console.log(`[SEO] 使用模型: ${model}`);

  const response = await fetch("https://api.vectorengine.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[SEO] API 錯誤: ${response.status} - ${errorText}`);
    throw new Error(`SEO API 調用失敗: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content;

  if (!content) {
    throw new Error("SEO 生成返回內容為空");
  }

  console.log(`[SEO] 模型 ${model} 成功返回結果`);
  return content;
}

/**
 * 解析 JSON 內容（處理 markdown 格式）
 */
function parseJsonContent<T>(content: string): T {
  let jsonContent = content.trim();
  if (jsonContent.startsWith("```json")) jsonContent = jsonContent.slice(7);
  else if (jsonContent.startsWith("```")) jsonContent = jsonContent.slice(3);
  if (jsonContent.endsWith("```")) jsonContent = jsonContent.slice(0, -3);
  jsonContent = jsonContent.trim();
  return JSON.parse(jsonContent) as T;
}

/**
 * 生成 SEO 內容
 */
export async function generateSeo(params: {
  story: string;
  language: SeoLanguage;
  platform: Platform;
  model?: SeoLlmModel;
  targetAudience?: string;
  videoStyle?: string;
  duration?: number;
}): Promise<SeoGenerationResult> {
  const { 
    story, 
    language, 
    platform, 
    model = "gpt-5.2",  // 默認使用 GPT 5.2
    targetAudience, 
    videoStyle, 
    duration 
  } = params;
  
  const config = PLATFORM_CONFIG[platform];
  const promptLanguage = getPromptLanguage(language);
  const platformOptimization = getPlatformOptimization(platform);

  const systemPrompt = `你是專業的社交媒體 SEO 專家，精通 ${platform.toUpperCase()} 平台優化。
優化建議：${platformOptimization}
輸出語言：${promptLanguage}
你必須嚴格按照 JSON 格式輸出，不要添加任何額外說明。`;

  const userPrompt = `為以下視頻生成 SEO 內容：

【故事】${story}
${targetAudience ? `【目標受眾】${targetAudience}` : ""}
${videoStyle ? `【視覺風格】${videoStyle}` : ""}
${duration ? `【時長】${duration}秒` : ""}

請生成（使用${promptLanguage}）：
1. 5個優化標題（每個≤${config.titleMaxLength}字）
   - 第1個：直接描述型
   - 第2個：數字/列表型
   - 第3個：問句型
   - 第4個：情感/故事型
   - 第5個：懸念/好奇型
2. 視頻描述（≤${config.descriptionMaxLength}字，包含關鍵詞和CTA）
3. ${config.maxTags}個關鍵詞（高搜索量、相關性強）
4. ${config.maxTags}個標籤
5. ${config.maxHashtags}個話題標籤（帶#號）
6. 3個縮略圖建議

嚴格按照以下 JSON 格式輸出：
{"titles":["標題1","標題2","標題3","標題4","標題5"],"description":"視頻描述...","keywords":["關鍵詞1","關鍵詞2"],"tags":["標籤1","標籤2"],"hashtags":["#話題1","#話題2"],"thumbnailSuggestions":["建議1","建議2","建議3"]}`;

  const content = await callLlmApi({
    model,
    systemPrompt,
    userPrompt,
    temperature: 0.8,
    maxTokens: 2000,
  });

  const result = parseJsonContent<SeoGenerationResult>(content);
  
  // 確保話題標籤帶 # 號
  result.hashtags = result.hashtags.map(tag => tag.startsWith("#") ? tag : `#${tag}`);

  return result;
}

/**
 * 快速生成標題
 */
export async function generateTitles(params: {
  story: string;
  language: SeoLanguage;
  platform: Platform;
  model?: SeoLlmModel;
  count?: number;
}): Promise<string[]> {
  const { story, language, platform, model = "gpt-5.2", count = 5 } = params;
  const config = PLATFORM_CONFIG[platform];
  const promptLanguage = getPromptLanguage(language);

  const systemPrompt = `你是${platform.toUpperCase()}標題優化專家。輸出語言：${promptLanguage}。你必須嚴格按照 JSON 數組格式輸出。`;
  
  const userPrompt = `為以下視頻生成${count}個優化標題（每個≤${config.titleMaxLength}字）：

${story}

標題類型：
1. 直接描述型
2. 數字/列表型
3. 問句型
4. 情感/故事型
5. 懸念/好奇型

嚴格按照 JSON 數組格式輸出：["標題1","標題2","標題3","標題4","標題5"]`;

  const content = await callLlmApi({
    model,
    systemPrompt,
    userPrompt,
    temperature: 0.9,
    maxTokens: 500,
  });

  return parseJsonContent<string[]>(content);
}

/**
 * 使用備用模型重試
 */
export async function generateSeoWithFallback(params: {
  story: string;
  language: SeoLanguage;
  platform: Platform;
  model?: SeoLlmModel;
  targetAudience?: string;
  videoStyle?: string;
  duration?: number;
}): Promise<SeoGenerationResult> {
  const models: SeoLlmModel[] = [
    params.model || "gpt-5.2",
    "claude-opus-4-5-20251101",
    "gemini-3-pro-preview",
  ];

  // 去重
  const uniqueModels = Array.from(new Set(models));

  for (const model of uniqueModels) {
    try {
      console.log(`[SEO] 嘗試使用模型: ${model}`);
      return await generateSeo({ ...params, model });
    } catch (error) {
      console.error(`[SEO] 模型 ${model} 失敗:`, error);
      if (model === uniqueModels[uniqueModels.length - 1]) {
        throw error; // 最後一個模型也失敗，拋出錯誤
      }
      console.log(`[SEO] 切換到下一個備用模型...`);
    }
  }

  throw new Error("所有 SEO 模型都失敗了");
}

/**
 * 使用備用模型重試生成標題
 */
export async function generateTitlesWithFallback(params: {
  story: string;
  language: SeoLanguage;
  platform: Platform;
  model?: SeoLlmModel;
  count?: number;
}): Promise<string[]> {
  const models: SeoLlmModel[] = [
    params.model || "gpt-5.2",
    "claude-opus-4-5-20251101",
    "gemini-3-pro-preview",
  ];

  const uniqueModels = Array.from(new Set(models));

  for (const model of uniqueModels) {
    try {
      console.log(`[SEO Titles] 嘗試使用模型: ${model}`);
      return await generateTitles({ ...params, model });
    } catch (error) {
      console.error(`[SEO Titles] 模型 ${model} 失敗:`, error);
      if (model === uniqueModels[uniqueModels.length - 1]) {
        throw error;
      }
      console.log(`[SEO Titles] 切換到下一個備用模型...`);
    }
  }

  throw new Error("所有標題生成模型都失敗了");
}
