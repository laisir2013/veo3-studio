/**
 * VEO3 完美系統 - 集成限流處理
 * 
 * 在原有的完美自動修復系統基礎上，添加專門的限流處理能力
 */

import {
  perfectApiClient,
  PerfectProblemDetector,
  ProblemType,
  PerfectAutoFixer,
} from "./perfectAutoFix";
import { rateLimitHandler, aggressiveRateLimitHandler, RateLimitConfig } from "./rateLimitHandler";
import { API_ENDPOINTS } from "../videoConfig";
import type { SceneData } from "../../drizzle/schema";
import { sleep } from "../videoService";

// ============================================
// 1. 限流感知的 API 客戶端
// ============================================

export class RateLimitAwareApiClient {
  private useAggressiveMode: boolean = false;
  
  /**
   * 執行受限流保護的 API 調用
   */
  async fetch<T>(config: {
    url: string;
    options: RequestInit;
    priority?: number;
    maxRetries?: number;
    timeout?: number;
    useAggressiveMode?: boolean;
  }): Promise<Response> {
    const {
      url,
      options,
      priority = 0,
      maxRetries = 5,
      timeout = 120000,
      useAggressiveMode = this.useAggressiveMode,
    } = config;
    
    // 選擇限流處理器
    const handler = useAggressiveMode ? aggressiveRateLimitHandler : rateLimitHandler;
    
    console.log(`[RateLimitAwareClient] 發起請求: ${url} (優先級: ${priority}, 模式: ${useAggressiveMode ? '激進' : '保守'})`);
    
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // 使用限流處理器執行請求
        const response = await handler.executeWithRateLimit(
          async (apiKey) => {
            console.log(`[RateLimitAwareClient] 執行請求 (嘗試 ${attempt + 1}/${maxRetries}): ${url}`);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);
            
            try {
              const res = await fetch(url, {
                ...options,
                signal: controller.signal,
                headers: {
                  ...options.headers,
                  'Authorization': `Bearer ${apiKey}`,
                },
              });
              
              clearTimeout(timeoutId);
              return res;
            } catch (error) {
              clearTimeout(timeoutId);
              throw error;
            }
          },
          priority
        );
        
        // 檢查響應狀態
        if (response.ok) {
          console.log(`[RateLimitAwareClient] ✓ 請求成功: ${url}`);
          return response;
        }
        
        // 如果是 429，拋出錯誤讓限流處理器處理
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 10000;
          
          console.warn(`[RateLimitAwareClient] 觸發限流 (429)，建議等待: ${waitTime}ms`);
          
          throw new Error(`Rate limit exceeded, retry after ${waitTime}ms`);
        }
        
        // 其他錯誤狀態
        if (!response.ok) {
          console.warn(`[RateLimitAwareClient] 請求失敗: ${response.status} ${response.statusText}`);
          
          // 對於可重試的錯誤，繼續重試
          if (response.status >= 500 || response.status === 408) {
            await sleep(3000 * (attempt + 1));
            continue;
          }
          
          // 其他錯誤直接返回
          return response;
        }
        
        return response;
        
      } catch (error) {
        lastError = error as Error;
        const errorMsg = error instanceof Error ? error.message : String(error);
        
        console.error(`[RateLimitAwareClient] 請求異常 (${attempt + 1}/${maxRetries}): ${errorMsg}`);
        
        // 如果是限流錯誤，讓限流處理器自動處理（已經在隊列中重試）
        if (errorMsg.includes('rate limit') || errorMsg.includes('429')) {
          console.log('[RateLimitAwareClient] 限流錯誤已由限流處理器管理，等待重試...');
          await sleep(5000);
          continue;
        }
        
        // 其他錯誤，等待後重試
        if (attempt < maxRetries - 1) {
          const waitTime = 3000 * Math.pow(1.5, attempt);
          console.log(`[RateLimitAwareClient] 等待 ${waitTime}ms 後重試...`);
          await sleep(waitTime);
        }
      }
    }
    
    console.error('[RateLimitAwareClient] ✗ 請求失敗，已達最大重試次數');
    throw lastError || new Error('請求失敗');
  }
  
  /**
   * 設置是否使用激進模式
   */
  setAggressiveMode(enabled: boolean): void {
    this.useAggressiveMode = enabled;
    console.log(`[RateLimitAwareClient] 模式切換: ${enabled ? '激進' : '保守'}`);
  }
  
  /**
   * 獲取限流統計
   */
  getStats() {
    return {
      conservative: rateLimitHandler.getStats(),
      aggressive: aggressiveRateLimitHandler.getStats(),
    };
  }
}

// ============================================
// 2. 限流感知的視頻服務
// ============================================

const rateLimitAwareClient = new RateLimitAwareApiClient();

/**
 * LLM 分析（帶限流保護）
 */
export async function rateLimitAwareAnalyzeStory(
  story: string,
  characterDescription: string | null,
  visualStyle: string | null,
  llmModel: string,
  language: "cantonese" | "mandarin" | "english" = "mandarin",
  priority: number = 10  // LLM 分析優先級較高
): Promise<{ scenes: SceneData[]; characterPrompt: string }> {
  
  console.log(`[RateLimitAwareService] 開始 LLM 分析 (優先級: ${priority})`);
  
  try {
    const languagePrompts = {
      cantonese: {
        narrationStyle: "使用地道粵語詞彙",
        outputLanguage: "粵語（廣東話）",
      },
      mandarin: {
        narrationStyle: "使用標準書面語",
        outputLanguage: "普通話（標準中文）",
      },
      english: {
        narrationStyle: "Natural American English",
        outputLanguage: "English",
      },
    };
    
    const langConfig = languagePrompts[language];
    
    const prompt = `分析故事並生成場景...`;  // 省略完整 prompt
    
    // 使用限流感知客戶端
    const response = await rateLimitAwareClient.fetch({
      url: API_ENDPOINTS.llm,
      options: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: llmModel,
          messages: [
            { role: 'system', content: '你是視頻腳本分析師' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.7,
          max_tokens: 4000,
        }),
      },
      priority,  // 高優先級
      maxRetries: 5,
      timeout: 120000,
    });
    
    const data = await response.json();
    let content = data.choices?.[0]?.message?.content || '';
    content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    const result = JSON.parse(content);
    
    const scenes: SceneData[] = result.scenes.map((scene: any, index: number) => ({
      id: index + 1,
      description: scene.description || '',
      imagePrompt: scene.imagePrompt || scene.description || '',
      narration: scene.narration || '',
      imageUrl: null,
      videoUrl: null,
      audioUrl: null,
    }));
    
    console.log(`[RateLimitAwareService] ✓ LLM 分析完成，生成 ${scenes.length} 個場景`);
    
    return {
      scenes,
      characterPrompt: result.characterPrompt || '',
    };
    
  } catch (error) {
    console.error('[RateLimitAwareService] ✗ LLM 分析失敗:', error);
    
    // 備用方案
    const fallbackScenes: SceneData[] = [{
      id: 1,
      description: story.substring(0, 200),
      imagePrompt: `A cinematic scene: ${story.substring(0, 100)}`,
      narration: story.substring(0, 100),
      imageUrl: null,
      videoUrl: null,
      audioUrl: null,
    }];
    
    return {
      scenes: fallbackScenes,
      characterPrompt: characterDescription || '',
    };
  }
}

/**
 * 圖片生成（帶限流保護）
 */
export async function rateLimitAwareGenerateImage(
  prompt: string,
  characterPrompt: string = '',
  priority: number = 5  // 中等優先級
): Promise<string> {
  
  console.log(`[RateLimitAwareService] 開始圖片生成 (優先級: ${priority})`);
  
  try {
    const fullPrompt = characterPrompt ? `${characterPrompt}, ${prompt}` : prompt;
    
    const response = await rateLimitAwareClient.fetch({
      url: API_ENDPOINTS.image,
      options: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: fullPrompt,
          n: 1,
          size: '1024x1024',
          quality: 'hd',
        }),
      },
      priority,
      maxRetries: 5,
      timeout: 120000,
    });
    
    const data = await response.json();
    const imageUrl = data.data?.[0]?.url || data.url || '';
    
    if (!imageUrl) {
      throw new Error('圖片 URL 為空');
    }
    
    console.log('[RateLimitAwareService] ✓ 圖片生成成功');
    return imageUrl;
    
  } catch (error) {
    console.error('[RateLimitAwareService] ✗ 圖片生成失敗:', error);
    return 'https://via.placeholder.com/1024x1024?text=Image+Generation+Failed';
  }
}

/**
 * 視頻生成（帶限流保護）
 */
export async function rateLimitAwareGenerateVideo(
  imageUrl: string,
  prompt: string,
  videoModel: string = 'veo3.1-fast',
  priority: number = 5  // 中等優先級
): Promise<string> {
  
  console.log(`[RateLimitAwareService] 開始視頻生成 (優先級: ${priority})`);
  
  try {
    const response = await rateLimitAwareClient.fetch({
      url: API_ENDPOINTS.video,
      options: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_url: imageUrl,
          prompt,
          model: videoModel,
          duration: 5,
        }),
      },
      priority,
      maxRetries: 5,
      timeout: 180000,
    });
    
    const data = await response.json();
    const videoUrl = data.video_url || data.url || '';
    
    if (!videoUrl) {
      throw new Error('視頻 URL 為空');
    }
    
    console.log('[RateLimitAwareService] ✓ 視頻生成成功');
    return videoUrl;
    
  } catch (error) {
    console.error('[RateLimitAwareService] ✗ 視頻生成失敗:', error);
    return imageUrl;  // 降級使用圖片
  }
}

/**
 * 音頻生成（帶限流保護）
 */
export async function rateLimitAwareGenerateAudio(
  text: string,
  voiceActorId: string = 'mandarin-female-narrator',
  language: string = 'mandarin',
  priority: number = 3  // 較低優先級
): Promise<string> {
  
  console.log(`[RateLimitAwareService] 開始音頻生成 (優先級: ${priority})`);
  
  try {
    const response = await rateLimitAwareClient.fetch({
      url: API_ENDPOINTS.tts,
      options: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          voice: voiceActorId,
          language,
        }),
      },
      priority,
      maxRetries: 5,
      timeout: 60000,
    });
    
    const data = await response.json();
    const audioUrl = data.audio_url || data.url || '';
    
    if (!audioUrl) {
      throw new Error('音頻 URL 為空');
    }
    
    console.log('[RateLimitAwareService] ✓ 音頻生成成功');
    return audioUrl;
    
  } catch (error) {
    console.error('[RateLimitAwareService] ✗ 音頻生成失敗:', error);
    return '';  // 返回空（靜音）
  }
}

/**
 * 獲取限流統計
 */
export function getRateLimitStats() {
  return rateLimitAwareClient.getStats();
}

/**
 * 切換激進/保守模式
 */
export function setAggressiveMode(enabled: boolean) {
  rateLimitAwareClient.setAggressiveMode(enabled);
}

// 導出客戶端實例
export { rateLimitAwareClient };
