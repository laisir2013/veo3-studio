/**
 * Manus 後備 API 服務
 * 當系統 API 失敗時，使用 Manus 的 API 作為後備
 * 
 * 支持的服務：
 * - LLM（使用 OPENAI_API_KEY 環境變量）
 * - 圖片生成（Nano-Banana-2 / gemini-2.5-flash）
 * - 視頻生成（Veo 3.1 Fast）
 */

import OpenAI from "openai";

// Manus API 配置
const MANUS_CONFIG = {
  // LLM 配置 - 使用環境變量中的 OPENAI_API_KEY
  llm: {
    apiKey: process.env.OPENAI_API_KEY || "",
    baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    models: ["gpt-4.1-mini", "gpt-4.1-nano", "gemini-2.5-flash"],
    defaultModel: "gemini-2.5-flash",
  },
  // 圖片生成配置 - Nano-Banana-2
  image: {
    apiKey: process.env.OPENAI_API_KEY || "",
    baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    model: "gemini-2.5-flash", // 使用 Gemini 2.5 Flash 生成圖片
  },
  // 視頻生成配置 - Veo 3.1 Fast
  video: {
    // Veo 3.1 Fast 需要通過 Google API 調用
    // 這裡使用環境變量配置
    enabled: true,
  },
};

// 檢查 Manus API 是否可用
export function isManusApiAvailable(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

// 獲取 OpenAI 客戶端（用於 Manus LLM）
function getManusOpenAIClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) {
    console.log("[Manus] OPENAI_API_KEY 未設置，Manus 後備不可用");
    return null;
  }
  
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL,
  });
}

/**
 * Manus LLM 後備調用
 * 當 VectorEngine API 失敗時使用
 */
export async function callManusLLM(
  systemPrompt: string,
  userPrompt: string,
  options: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  } = {}
): Promise<{ content: string; source: "manus" }> {
  const client = getManusOpenAIClient();
  if (!client) {
    throw new Error("Manus API 不可用：OPENAI_API_KEY 未設置");
  }

  const model = options.model || MANUS_CONFIG.llm.defaultModel;
  console.log(`[Manus LLM] 使用模型: ${model}`);

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 4096,
    });

    const content = response.choices[0]?.message?.content || "";
    console.log(`[Manus LLM] ✅ 生成成功，字數: ${content.length}`);

    return {
      content,
      source: "manus",
    };
  } catch (error: any) {
    console.error(`[Manus LLM] ❌ 調用失敗:`, error.message);
    throw error;
  }
}

/**
 * Manus 圖片生成後備調用
 * 使用 Gemini 2.5 Flash 生成圖片描述，然後調用圖片生成 API
 */
export async function callManusImageGeneration(
  prompt: string,
  options: {
    width?: number;
    height?: number;
    style?: string;
  } = {}
): Promise<{ imageUrl: string; source: "manus" }> {
  const client = getManusOpenAIClient();
  if (!client) {
    throw new Error("Manus API 不可用：OPENAI_API_KEY 未設置");
  }

  console.log(`[Manus Image] 生成圖片: ${prompt.substring(0, 50)}...`);

  try {
    // 使用 DALL-E 風格的圖片生成
    // 注意：這需要 OpenAI 的圖片生成 API 或兼容的服務
    const response = await fetch(`${process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"}/images/generations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt,
        n: 1,
        size: `${options.width || 1024}x${options.height || 1024}`,
        quality: "standard",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`圖片生成失敗: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const imageUrl = data.data?.[0]?.url;

    if (!imageUrl) {
      throw new Error("圖片生成失敗：未返回圖片 URL");
    }

    console.log(`[Manus Image] ✅ 圖片生成成功`);

    return {
      imageUrl,
      source: "manus",
    };
  } catch (error: any) {
    console.error(`[Manus Image] ❌ 生成失敗:`, error.message);
    throw error;
  }
}

/**
 * Manus 視頻生成後備調用
 * 使用 Veo 3.1 Fast 生成視頻
 */
export async function callManusVideoGeneration(
  prompt: string,
  imageUrl?: string,
  options: {
    duration?: number;
    aspectRatio?: string;
  } = {}
): Promise<{ videoUrl: string; source: "manus" }> {
  console.log(`[Manus Video] 生成視頻: ${prompt.substring(0, 50)}...`);

  // 這裡需要調用 Veo 3.1 Fast API
  // 由於 Manus 環境中可能沒有直接的 Veo API 訪問權限
  // 我們使用現有的 VectorEngine API 作為後備
  
  const apiKey = process.env.VECTOR_ENGINE_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Manus Video API 不可用：API Key 未設置");
  }

  try {
    // 調用 VectorEngine 的 Veo 3.1 Fast API
    const response = await fetch("https://api.vectorengine.ai/v1/video/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "veo-3.1-fast",
        prompt,
        image_url: imageUrl,
        duration: options.duration || 8,
        aspect_ratio: options.aspectRatio || "16:9",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`視頻生成失敗: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const videoUrl = data.data?.url || data.url;

    if (!videoUrl) {
      throw new Error("視頻生成失敗：未返回視頻 URL");
    }

    console.log(`[Manus Video] ✅ 視頻生成成功`);

    return {
      videoUrl,
      source: "manus",
    };
  } catch (error: any) {
    console.error(`[Manus Video] ❌ 生成失敗:`, error.message);
    throw error;
  }
}

/**
 * 帶後備的 LLM 調用
 * 先嘗試主 API，失敗後使用 Manus 後備
 */
export async function callLLMWithManusFallback(
  primaryCall: () => Promise<string>,
  systemPrompt: string,
  userPrompt: string,
  options: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  } = {}
): Promise<{ content: string; source: "primary" | "manus" }> {
  try {
    // 先嘗試主 API
    const content = await primaryCall();
    return { content, source: "primary" };
  } catch (primaryError: any) {
    console.log(`[Fallback] 主 API 失敗: ${primaryError.message}`);
    console.log(`[Fallback] 嘗試 Manus 後備...`);

    // 檢查 Manus API 是否可用
    if (!isManusApiAvailable()) {
      console.log(`[Fallback] Manus API 不可用，拋出原始錯誤`);
      throw primaryError;
    }

    // 使用 Manus 後備
    return await callManusLLM(systemPrompt, userPrompt, options);
  }
}

/**
 * 帶後備的圖片生成調用
 */
export async function callImageWithManusFallback(
  primaryCall: () => Promise<string>,
  prompt: string,
  options: {
    width?: number;
    height?: number;
    style?: string;
  } = {}
): Promise<{ imageUrl: string; source: "primary" | "manus" }> {
  try {
    // 先嘗試主 API
    const imageUrl = await primaryCall();
    return { imageUrl, source: "primary" };
  } catch (primaryError: any) {
    console.log(`[Fallback] 主圖片 API 失敗: ${primaryError.message}`);
    console.log(`[Fallback] 嘗試 Manus 圖片後備...`);

    // 檢查 Manus API 是否可用
    if (!isManusApiAvailable()) {
      console.log(`[Fallback] Manus API 不可用，拋出原始錯誤`);
      throw primaryError;
    }

    // 使用 Manus 後備
    return await callManusImageGeneration(prompt, options);
  }
}

/**
 * 帶後備的視頻生成調用
 */
export async function callVideoWithManusFallback(
  primaryCall: () => Promise<string>,
  prompt: string,
  imageUrl?: string,
  options: {
    duration?: number;
    aspectRatio?: string;
  } = {}
): Promise<{ videoUrl: string; source: "primary" | "manus" }> {
  try {
    // 先嘗試主 API
    const videoUrl = await primaryCall();
    return { videoUrl, source: "primary" };
  } catch (primaryError: any) {
    console.log(`[Fallback] 主視頻 API 失敗: ${primaryError.message}`);
    console.log(`[Fallback] 嘗試 Manus 視頻後備...`);

    // 檢查 Manus API 是否可用
    if (!isManusApiAvailable()) {
      console.log(`[Fallback] Manus API 不可用，拋出原始錯誤`);
      throw primaryError;
    }

    // 使用 Manus 後備
    return await callManusVideoGeneration(prompt, imageUrl, options);
  }
}

// 導出配置
export { MANUS_CONFIG };
