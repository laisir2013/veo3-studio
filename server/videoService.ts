import { getNextApiKey, API_ENDPOINTS, STORY_MODE_PRESETS, type VideoModel, type StoryMode, RETRY_CONFIG, BACKUP_LLM_CONFIG } from "./videoConfig";
import type { SceneData } from "../drizzle/schema";
import { LLM_FALLBACK_CONFIG, VIDEO_FALLBACK_CHAIN } from "./videoConfig";

// 睡眠函數
export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// 帶重試的 API 調用 (增強版)
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retryConfig = RETRY_CONFIG
): Promise<Response> {
  let lastError: Error | null = null;
  let delay = retryConfig.retryDelay;
  const maxDelay = (retryConfig as any).maxDelay || 30000;
  
  for (let attempt = 0; attempt < retryConfig.maxRetries; attempt++) {
    try {
      console.log(`[API] 請求 ${url} (嘗試 ${attempt + 1}/${retryConfig.maxRetries})`);
      
      // 添加超時控制 (增加到 120 秒以適應較慢的 API 響應)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000); // 120秒超時
      
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      // 檢查是否需要重試的狀態碼
      const shouldRetry = 
        (response.status === 429 && (retryConfig as any).retryOn429 !== false) ||
        (response.status >= 500 && (retryConfig as any).retryOn500 !== false);
      
      if (shouldRetry && attempt < retryConfig.maxRetries - 1) {
        // 嘗試從響應頭獲取重試延遲
        const retryAfter = response.headers.get('Retry-After');
        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : delay;
        const actualWait = Math.min(waitTime, maxDelay);
        
        console.warn(`[API] ${response.status} 錯誤，等待 ${actualWait}ms 後重試 (嘗試 ${attempt + 1}/${retryConfig.maxRetries})`);
        await sleep(actualWait);
        delay = Math.min(delay * retryConfig.backoffMultiplier, maxDelay);
        continue;
      }
      
      return response;
    } catch (error) {
      lastError = error as Error;
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      // 檢查是否是超時或網絡錯誤
      const isTimeout = errorMsg.includes('abort') || errorMsg.includes('timeout');
      const isNetworkError = errorMsg.includes('network') || errorMsg.includes('ECONNREFUSED');
      
      if ((isTimeout || isNetworkError) && attempt < retryConfig.maxRetries - 1) {
        const actualWait = Math.min(delay, maxDelay);
        console.warn(`[API] ${isTimeout ? '超時' : '網絡錯誤'}，等待 ${actualWait}ms 後重試 (嘗試 ${attempt + 1}/${retryConfig.maxRetries}): ${errorMsg}`);
        await sleep(actualWait);
        delay = Math.min(delay * retryConfig.backoffMultiplier, maxDelay);
        continue;
      }
      
      console.error(`[API] 請求失敗 (嘗試 ${attempt + 1}/${retryConfig.maxRetries}):`, errorMsg);
    }
  }
  
  throw lastError || new Error('API 請求失敗，已達最大重試次數');
}

// 語言配置
type Language = "cantonese" | "mandarin" | "english";

const LANGUAGE_PROMPTS: Record<Language, { narrationStyle: string; outputLanguage: string }> = {
  cantonese: {
    narrationStyle: "使用地道粵語詞彙如「係」「唔」「嘅」「咡」「啲」「嘶」等，語氣自然口語化",
    outputLanguage: "粵語（廣東話）",
  },
  mandarin: {
    narrationStyle: "使用標準書面語，正式流暢的表達方式",
    outputLanguage: "普通話（標準中文）",
  },
  english: {
    narrationStyle: "Natural American English with conversational tone, engaging and clear",
    outputLanguage: "English",
  },
};

// 調用 LLM 分析故事
export async function analyzeStory(
  story: string,
  characterDescription: string | null,
  visualStyle: string | null,
  llmModel: string,
  language: Language = "cantonese"
): Promise<{ scenes: SceneData[]; characterPrompt: string }> {
  const apiKey = getNextApiKey();
  const langConfig = LANGUAGE_PROMPTS[language];
  
  const systemPrompt = `你是一個專業的視頻腳本分析師。請將用戶的故事分解為 3-5 個場景，每個場景包含：
1. 場景描述（用於生成視頻提示詞，必須用英文）
2. 旁白文字（用於語音合成）
3. 圖片提示詞（用於 Midjourney 生成角色圖片，必須用英文）

重要：
- 場景描述 (description) 必須使用英文，因為視頻生成 AI 不支援中文
- 旁白文字 (narration) 必須使用${langConfig.outputLanguage}，${langConfig.narrationStyle}
- 圖片提示詞 (imagePrompt) 必須使用英文

請以 JSON 格式返回，格式如下：
{
  "scenes": [
    {
      "id": 1,
      "description": "English scene description for video generation, detailed and vivid",
      "narration": "旁白文字（必須用${langConfig.outputLanguage}）",
      "imagePrompt": "English image prompt with character features and scene details"
    }
  ],
  "characterPrompt": "English character base image prompt for consistency"
}`;

  const userPrompt = `故事：${story}
${characterDescription ? `角色描述：${characterDescription}` : ""}
${visualStyle ? `視覺風格：${visualStyle}` : ""}

請分析這個故事並生成場景數據。記住旁白文字必須使用${langConfig.outputLanguage}。`;

  // 嘗試主要 LLM，失敗則使用備用（支援多級備用）
  const modelsToTry = [llmModel];
  const fallbackModels = LLM_FALLBACK_CONFIG[llmModel as keyof typeof LLM_FALLBACK_CONFIG];
  if (fallbackModels && Array.isArray(fallbackModels)) {
    modelsToTry.push(...fallbackModels);
  } else if (fallbackModels) {
    modelsToTry.push(fallbackModels as unknown as string);
  }

  let lastError: Error | null = null;
  let result: any = null;

  for (const model of modelsToTry) {
    try {
      console.log(`[LLM] 嘗試使用模型: ${model}`);
      
      // 每次嘗試使用新的 API Key
      const currentApiKey = getNextApiKey();
      
      const response = await fetchWithRetry(`${API_ENDPOINTS.vectorEngine}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${currentApiKey}`,
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`LLM API 調用失敗: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content;
      
      if (!content) {
        throw new Error("LLM 返回內容為空");
      }

      // 處理 LLM 可能返回的 markdown 格式
      let jsonContent = content.trim();
      // 移除 ```json 和 ``` 標記
      if (jsonContent.startsWith('```json')) {
        jsonContent = jsonContent.slice(7);
      } else if (jsonContent.startsWith('```')) {
        jsonContent = jsonContent.slice(3);
      }
      if (jsonContent.endsWith('```')) {
        jsonContent = jsonContent.slice(0, -3);
      }
      jsonContent = jsonContent.trim();
      
      result = JSON.parse(jsonContent);
      console.log(`[LLM] 模型 ${model} 成功`);
      break; // 成功，跳出循環
    } catch (error) {
      lastError = error as Error;
      console.warn(`[LLM] 模型 ${model} 失敗:`, error);
      if (model !== modelsToTry[modelsToTry.length - 1]) {
        console.log(`[LLM] 切換到備用模型...`);
      }
    }
  }

  // 如果所有 VectorEngine 模型都失敗，嘗試備用 API
  if (!result) {
    console.log(`[LLM] VectorEngine 所有模型都失敗，嘗試備用 API...`);
    
    for (const backup of BACKUP_LLM_CONFIG.backupModels) {
      try {
        const backupApiKey = backup.provider === 'openrouter' 
          ? BACKUP_LLM_CONFIG.openrouterApiKey 
          : BACKUP_LLM_CONFIG.openaiApiKey;
        
        if (!backupApiKey) {
          console.log(`[LLM] 備用 ${backup.provider} API Key 未配置，跳過`);
          continue;
        }
        
        console.log(`[LLM] 嘗試備用 API: ${backup.provider}/${backup.model}`);
        
        const response = await fetchWithRetry(backup.endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${backupApiKey}`,
            ...(backup.provider === 'openrouter' ? { "HTTP-Referer": "https://veo3-studio.onrender.com" } : {}),
          },
          body: JSON.stringify({
            model: backup.model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            response_format: { type: "json_object" },
          }),
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`備用 LLM API 調用失敗: ${response.status} - ${errorText}`);
        }
        
        const data = await response.json();
        const content = data.choices[0]?.message?.content;
        
        if (!content) {
          throw new Error("備用 LLM 返回內容為空");
        }
        
        let jsonContent = content.trim();
        if (jsonContent.startsWith('```json')) {
          jsonContent = jsonContent.slice(7);
        } else if (jsonContent.startsWith('```')) {
          jsonContent = jsonContent.slice(3);
        }
        if (jsonContent.endsWith('```')) {
          jsonContent = jsonContent.slice(0, -3);
        }
        jsonContent = jsonContent.trim();
        
        result = JSON.parse(jsonContent);
        console.log(`[LLM] 備用 API ${backup.provider}/${backup.model} 成功`);
        break;
      } catch (backupError) {
        console.warn(`[LLM] 備用 API ${backup.provider}/${backup.model} 失敗:`, backupError);
      }
    }
  }
  
  if (!result) {
    throw lastError || new Error("所有 LLM 模型和備用 API 都失敗");
  }
  
  return {
    scenes: result.scenes.map((s: any, index: number) => ({
      id: index + 1,
      description: s.description,
      narration: s.narration,
      imagePrompt: s.imagePrompt,
      status: "pending" as const,
    })),
    characterPrompt: result.characterPrompt,
  };
}

// 生成角色基礎圖片（使用 VectorEngine Midjourney API）
export async function generateCharacterImage(prompt: string, mode: string): Promise<string> {
  const apiKey = getNextApiKey();
  
  console.log(`[Image] 生成角色圖片，模式: ${mode}`);
  console.log(`[Image] 提示詞: ${prompt}`);
  
  // 嘗試使用 Midjourney
  try {
    const submitResponse = await fetch(`${API_ENDPOINTS.vectorEngine}/mj/submit/imagine`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        prompt: `${prompt} --ar 1:1 --v 6.1 ${mode === "fast" ? "--fast" : ""}`,
        notifyHook: "",
      }),
    });

    if (!submitResponse.ok) {
      const errorText = await submitResponse.text();
      console.warn(`[Image] Midjourney 提交失敗: ${submitResponse.status} - ${errorText}`);
      throw new Error(`Midjourney 提交失敗: ${submitResponse.status}`);
    }

    const submitData = await submitResponse.json();
    
    // 檢查是否有錯誤
    if (submitData.code && submitData.code !== 1) {
      console.warn(`[Image] Midjourney 返回錯誤: ${submitData.description || submitData.message}`);
      throw new Error(`Midjourney 錯誤: ${submitData.description || submitData.message}`);
    }
    
    const taskId = submitData.result;

    if (!taskId) {
      throw new Error("Midjourney 任務 ID 為空");
    }

    console.log(`[Image] Midjourney 任務已提交: ${taskId}`);
    
    return await pollMidjourneyTask(taskId);
  } catch (mjError) {
    console.warn(`[Image] Midjourney 失敗，切換到 DALL-E 3:`, mjError);
    
    // 備用方案：使用 DALL-E 3
    return await generateImageWithDallE3(prompt);
  }
}

// 使用 DALL-E 3 生成圖片（備用方案）
async function generateImageWithDallE3(prompt: string): Promise<string> {
  const apiKey = getNextApiKey();
  
  console.log(`[Image] 使用 DALL-E 3 生成圖片`);
  console.log(`[Image] 提示詞: ${prompt}`);
  
  const response = await fetch(`${API_ENDPOINTS.vectorEngine}/v1/images/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "dall-e-3",
      prompt: prompt,
      n: 1,
      size: "1792x1024", // 16:9 比例
      quality: "hd",
      style: "vivid",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DALL-E 3 圖片生成失敗: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const imageUrl = data.data?.[0]?.url;
  
  if (!imageUrl) {
    throw new Error("DALL-E 3 未返回圖片 URL");
  }
  
  console.log(`[Image] DALL-E 3 圖片生成成功: ${imageUrl}`);
  return imageUrl;
}

// 生成場景圖片（支持固定人物模式和劇情模式）
export async function generateSceneImage(
  prompt: string,
  characterImageUrl: string | null,
  speedMode: string,
  storyMode: StoryMode = "character"
): Promise<string> {
  const apiKey = getNextApiKey();
  const storyConfig = STORY_MODE_PRESETS[storyMode];
  
  console.log(`[Image] 生成場景圖片，模式: ${storyMode}, 速度: ${speedMode}`);
  console.log(`[Image] 提示詞: ${prompt}`);
  
  // 嘗試使用 Midjourney
  try {
    // 根據故事模式構建提示詞
    let fullPrompt = prompt;
    
    if (storyConfig.useCref && characterImageUrl) {
      // 固定人物模式：使用 --cref 保持角色一致性
      fullPrompt = `${prompt} --cref ${characterImageUrl} --cw 100 --ar 16:9 --v 6.1 ${speedMode === "fast" ? "--fast" : ""}`;
      console.log(`[Image] 固定人物模式，參考圖片: ${characterImageUrl}`);
    } else {
      // 劇情模式：純場景生成
      fullPrompt = `${prompt} --ar 16:9 --v 6.1 ${speedMode === "fast" ? "--fast" : ""}`;
    }
    
    const submitResponse = await fetch(`${API_ENDPOINTS.vectorEngine}/mj/submit/imagine`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        prompt: fullPrompt,
        notifyHook: "",
      }),
    });

    if (!submitResponse.ok) {
      const errorText = await submitResponse.text();
      console.warn(`[Image] Midjourney 場景圖片提交失敗: ${submitResponse.status} - ${errorText}`);
      throw new Error(`Midjourney 場景圖片提交失敗: ${submitResponse.status}`);
    }

    const submitData = await submitResponse.json();
    
    // 檢查是否有錯誤
    if (submitData.code && submitData.code !== 1) {
      console.warn(`[Image] Midjourney 返回錯誤: ${submitData.description || submitData.message}`);
      throw new Error(`Midjourney 錯誤: ${submitData.description || submitData.message}`);
    }
    
    const taskId = submitData.result;
    console.log(`[Image] Midjourney 場景任務已提交: ${taskId}`);
    
    return await pollMidjourneyTask(taskId);
  } catch (mjError) {
    console.warn(`[Image] Midjourney 失敗，切換到 DALL-E 3:`, mjError);
    
    // 備用方案：使用 DALL-E 3
    // 注意：DALL-E 3 不支持 --cref，固定人物模式會降級為劇情模式
    if (storyConfig.useCref && characterImageUrl) {
      console.warn(`[Image] 注意：DALL-E 3 不支持固定人物模式，將使用劇情模式生成`);
    }
    
    return await generateImageWithDallE3(prompt);
  }
}

// 檢查是否需要生成角色基礎圖
export function shouldGenerateCharacterBase(storyMode: StoryMode): boolean {
  return STORY_MODE_PRESETS[storyMode].generateCharacterBase;
}

// 輪詢 Midjourney 任務
async function pollMidjourneyTask(taskId: string, maxAttempts = 60): Promise<string> {
  const apiKey = getNextApiKey();
  
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(5000);
    
    const response = await fetch(`${API_ENDPOINTS.vectorEngine}/mj/task/${taskId}/fetch`, {
      headers: { "Authorization": `Bearer ${apiKey}` },
    });

    if (!response.ok) continue;

    const data = await response.json();
    
    if (data.status === "SUCCESS" && data.imageUrl) {
      return data.imageUrl;
    }
    
    if (data.status === "FAILURE") {
      throw new Error(`Midjourney 任務失敗: ${data.failReason || "未知錯誤"}`);
    }
  }

  throw new Error("Midjourney 任務超時");
}

// 生成視頻（帶備用鏈：Veo Pro → Veo Fast → Runway → Kling）
export async function generateVideo(
  imageUrl: string,
  prompt: string,
  videoModel: VideoModel
): Promise<string> {
  // 構建備用鏈
  const modelsToTry: string[] = [videoModel];
  const fallbackChain = VIDEO_FALLBACK_CHAIN[videoModel as keyof typeof VIDEO_FALLBACK_CHAIN];
  if (fallbackChain) {
    modelsToTry.push(...fallbackChain);
  }

  let lastError: Error | null = null;

  for (const model of modelsToTry) {
    try {
      console.log(`[Video] 嘗試使用模型: ${model}`);
      const apiKey = getNextApiKey();
      
      let videoUrl: string;
      if (model === "kling") {
        videoUrl = await generateKlingVideo(imageUrl, prompt, apiKey);
      } else if (model === "runway") {
        videoUrl = await generateRunwayVideo(imageUrl, prompt, apiKey);
      } else {
        videoUrl = await generateVeoVideo(imageUrl, prompt, model, apiKey);
      }
      
      console.log(`[Video] 模型 ${model} 成功`);
      return videoUrl;
    } catch (error) {
      lastError = error as Error;
      console.warn(`[Video] 模型 ${model} 失敗:`, error);
      if (model !== modelsToTry[modelsToTry.length - 1]) {
        console.log(`[Video] 切換到備用模型...`);
      }
    }
  }

  throw lastError || new Error("所有視頻模型都失敗");
}

// Veo 視頻生成
async function generateVeoVideo(
  imageUrl: string,
  prompt: string,
  model: string,
  apiKey: string
): Promise<string> {
  const submitResponse = await fetch(`${API_ENDPOINTS.vectorEngine}/v1/video/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      prompt,
      image_url: imageUrl,
    }),
  });

  if (!submitResponse.ok) {
    throw new Error(`Veo 提交失敗: ${submitResponse.status}`);
  }

  const submitData = await submitResponse.json();
  const taskId = submitData.id;

  // 輪詢等待完成
  for (let i = 0; i < 60; i++) {
    await sleep(5000);
    
    const queryResponse = await fetch(
      `${API_ENDPOINTS.vectorEngine}/v1/video/query?id=${taskId}`,
      { headers: { "Authorization": `Bearer ${apiKey}` } }
    );

    if (!queryResponse.ok) continue;

    const data = await queryResponse.json();
    
    if (data.status === "completed" && data.video_url) {
      return data.video_url;
    }
    
    if (data.status === "failed") {
      throw new Error(`Veo 生成失敗: ${data.error || "未知錯誤"}`);
    }
  }

  throw new Error("Veo 視頻生成超時");
}

// 可靈 Kling 視頻生成
async function generateKlingVideo(
  imageUrl: string,
  prompt: string,
  apiKey: string
): Promise<string> {
  const submitResponse = await fetch(`${API_ENDPOINTS.vectorEngine}/kling/v1/videos/image2video`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model_name: "kling-v1-6",
      image: imageUrl,
      prompt,
      duration: "5",
      mode: "std",
    }),
  });

  if (!submitResponse.ok) {
    throw new Error(`Kling 提交失敗: ${submitResponse.status}`);
  }

  const submitData = await submitResponse.json();
  const taskId = submitData.data?.task_id;

  // 輪詢等待完成
  for (let i = 0; i < 60; i++) {
    await sleep(5000);
    
    const queryResponse = await fetch(
      `${API_ENDPOINTS.vectorEngine}/kling/v1/videos/image2video/${taskId}`,
      { headers: { "Authorization": `Bearer ${apiKey}` } }
    );

    if (!queryResponse.ok) continue;

    const data = await queryResponse.json();
    
    if (data.data?.task_status === "succeed") {
      return data.data.task_result?.videos?.[0]?.url || "";
    }
    
    if (data.data?.task_status === "failed") {
      throw new Error(`Kling 生成失敗`);
    }
  }

  throw new Error("Kling 視頻生成超時");
}

// Runway 視頻生成
async function generateRunwayVideo(
  imageUrl: string,
  prompt: string,
  apiKey: string
): Promise<string> {
  const submitResponse = await fetch(`${API_ENDPOINTS.vectorEngine}/runwayml/v1/image_to_video`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gen3a_turbo",
      promptImage: imageUrl,
      promptText: prompt,
      duration: 10,
      ratio: "16:9",
    }),
  });

  if (!submitResponse.ok) {
    throw new Error(`Runway 提交失敗: ${submitResponse.status}`);
  }

  const submitData = await submitResponse.json();
  const taskId = submitData.id;

  // 輪詢等待完成
  for (let i = 0; i < 60; i++) {
    await sleep(5000);
    
    const queryResponse = await fetch(
      `${API_ENDPOINTS.vectorEngine}/runwayml/v1/tasks/${taskId}`,
      { headers: { "Authorization": `Bearer ${apiKey}` } }
    );

    if (!queryResponse.ok) continue;

    const data = await queryResponse.json();
    
    if (data.status === "SUCCEEDED" && data.output?.[0]) {
      return data.output[0];
    }
    
    if (data.status === "FAILED") {
      throw new Error(`Runway 生成失敗`);
    }
  }

  throw new Error("Runway 視頻生成超時");
}

// 使用 KreadoAI TTS API 生成語音
import { generateSpeechWithKreado } from "./kreadoTTS";
import type { VoiceLanguage } from "./videoConfig";

// VectorEngine TTS 配置
const VECTORENGINE_TTS_VOICES = {
  alloy: { name: "Alloy", gender: "neutral", description: "中性平衡的聲音" },
  echo: { name: "Echo", gender: "male", description: "低沉男聲" },
  fable: { name: "Fable", gender: "male", description: "英式口音" },
  onyx: { name: "Onyx", gender: "male", description: "深沉男聲" },
  nova: { name: "Nova", gender: "female", description: "溫暖女聲" },
  shimmer: { name: "Shimmer", gender: "female", description: "清亮女聲" },
};

// VectorEngine TTS 生成語音
export async function generateSpeechWithVectorEngine(
  text: string,
  voice: string = "alloy",
  model: string = "tts-1"
): Promise<string> {
  const apiKey = getNextApiKey();
  
  const response = await fetch(`${API_ENDPOINTS.vectorEngine}/v1/audio/speech`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: text,
      voice,
      response_format: "mp3",
    }),
  });

  if (!response.ok) {
    throw new Error(`VectorEngine TTS 失敗: ${response.status}`);
  }

  // 獲取音頻數據並上傳到 S3
  const audioBuffer = await response.arrayBuffer();
  const { storagePut } = await import("./storage");
  const fileName = `tts-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`;
  const { url } = await storagePut(fileName, Buffer.from(audioBuffer), "audio/mpeg");
  
  return url;
}

// TTS 重試配置
const TTS_RETRY_CONFIG = {
  maxRetries: 3,
  retryDelay: 2000,
  backoffMultiplier: 1.5,
};

export async function generateSpeech(
  text: string, 
  voiceActorId: string = "cantonese-male-narrator",
  language: VoiceLanguage = "cantonese"
): Promise<string> {
  let lastError: Error | null = null;
  let delay = TTS_RETRY_CONFIG.retryDelay;
  
  console.log(`[TTS] 開始生成語音: voiceActorId=${voiceActorId}, language=${language}`);
  console.log(`[TTS] 文字內容: ${text.substring(0, 100)}...`);
  
  // 使用 KreadoAI TTS，帶重試機制
  for (let attempt = 0; attempt < TTS_RETRY_CONFIG.maxRetries; attempt++) {
    try {
      console.log(`[TTS] KreadoAI 嘗試 ${attempt + 1}/${TTS_RETRY_CONFIG.maxRetries}`);
      const result = await generateSpeechWithKreado(text, voiceActorId, language);
      console.log(`[TTS] KreadoAI 語音生成成功: ${result.audioUrl}`);
      return result.audioUrl;
    } catch (error) {
      lastError = error as Error;
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn(`[TTS] KreadoAI 嘗試 ${attempt + 1} 失敗: ${errorMsg}`);
      
      // 如果是 voiceId 錯誤，嘗試使用默認配音員重試
      if (errorMsg.includes('voiceId') && voiceActorId !== 'cantonese-male-narrator') {
        console.log(`[TTS] voiceId 錯誤，嘗試使用默認配音員`);
        try {
          const result = await generateSpeechWithKreado(text, 'cantonese-male-narrator', language);
          console.log(`[TTS] 使用默認配音員成功: ${result.audioUrl}`);
          return result.audioUrl;
        } catch (fallbackError) {
          console.warn(`[TTS] 默認配音員也失敗:`, fallbackError);
        }
      }
      
      // 如果不是最後一次嘗試，等待後重試
      if (attempt < TTS_RETRY_CONFIG.maxRetries - 1) {
        console.log(`[TTS] 等待 ${delay}ms 後重試...`);
        await sleep(delay);
        delay *= TTS_RETRY_CONFIG.backoffMultiplier;
      }
    }
  }
  
  // 所有重試都失敗
  const errorMsg = lastError?.message || 'Unknown error';
  console.error(`[TTS] KreadoAI TTS 失敗，已達最大重試次數: ${errorMsg}`);
  throw new Error(`TTS 生成失敗 (已重試 ${TTS_RETRY_CONFIG.maxRetries} 次): ${errorMsg}`);
}



// AI 生成單個場景描述
export async function generateSceneDescription(
  story: string,
  existingScenes: string[] = [],
  language: Language = "cantonese",
  visualStyle?: string
): Promise<string> {
  const apiKey = getNextApiKey();
  const langConfig = LANGUAGE_PROMPTS[language];
  
  const existingScenesText = existingScenes.length > 0 
    ? `\n\n已有場景（請避免重複）：\n${existingScenes.map((s, i) => `${i + 1}. ${s}`).join("\n")}`
    : "";

  const systemPrompt = `你是一個專業的視頻場景設計師。請根據用戶提供的故事，生成一個新的場景描述。

要求：
1. 場景描述要具體、生動，適合用於視頻生成
2. 包含視覺元素（人物動作、環境、光線、氛圍等）
3. 與故事主題相關，但要有創意
4. 使用${langConfig.outputLanguage}描述
5. 長度控制在 50-100 字
${visualStyle ? `6. 視覺風格：${visualStyle}` : ""}

請直接返回場景描述文字，不要包含任何其他內容。`;

  const userPrompt = `故事主題：${story}${existingScenesText}

請生成一個新的、獨特的場景描述。`;

  try {
    console.log(`[AI Scene] 開始生成場景描述`);
    
    const response = await fetch(`${API_ENDPOINTS.vectorEngine}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-5.2",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 200,
        temperature: 0.8,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LLM API 調用失敗: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    let content = data.choices[0]?.message?.content;
    
    if (!content) {
      throw new Error("LLM 返回內容為空");
    }

    // 清理返回內容
    content = content.trim();
    // 移除可能的引號
    if ((content.startsWith('"') && content.endsWith('"')) || 
        (content.startsWith("'") && content.endsWith("'"))) {
      content = content.slice(1, -1);
    }
    
    console.log(`[AI Scene] 場景生成成功: ${content.substring(0, 50)}...`);
    return content;
  } catch (error) {
    console.error("[AI Scene] 場景生成失敗:", error);
    throw error;
  }
}
