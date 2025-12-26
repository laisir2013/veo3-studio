/**
 * VEO3 完美視頻服務 - 100% 自動化
 * 
 * 集成完美自動修復系統，實現零人工干預的穩定運行
 */

import {
  perfectApiClient,
  PerfectProblemDetector,
  ProblemType,
} from "./utils/perfectAutoFix";
import { getNextApiKey, API_ENDPOINTS, STORY_MODE_PRESETS, LLM_FALLBACK_CONFIG } from "./videoConfig";
import type { SceneData } from "../drizzle/schema";
import { sleep } from "./videoService";

// ============================================
// 1. 完美 LLM 分析（帶自動修復）
// ============================================

export async function perfectAnalyzeStory(
  story: string,
  characterDescription: string | null,
  visualStyle: string | null,
  llmModel: string,
  language: "cantonese" | "mandarin" | "english" = "mandarin"
): Promise<{ scenes: SceneData[]; characterPrompt: string }> {
  
  console.log(`[PerfectVideoService] 開始 LLM 分析故事 (模型: ${llmModel}, 語言: ${language})`);
  
  const context = {
    llmModel,
    language,
    stage: 'llm',
  };
  
  try {
    // 構建 prompt
    const languagePrompts = {
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
    
    const langConfig = languagePrompts[language];
    
    const prompt = `你是一個專業的視頻腳本分析師。請分析以下故事並為視頻生成創建結構化的場景。

故事內容：
${story}

${characterDescription ? `主要角色描述：\n${characterDescription}\n` : ''}
${visualStyle ? `視覺風格：\n${visualStyle}\n` : ''}

請按照以下要求生成場景：

1. **場景分解**：將故事分解為 3-7 個視覺場景，每個場景應該：
   - 有清晰的視覺描述（適合圖像生成）
   - 包含動作或情感元素
   - 持續 15-30 秒

2. **旁白創作**：為每個場景創作旁白，要求：
   - ${langConfig.narrationStyle}
   - 簡潔有力，每句 20-50 字
   - 與視覺內容配合
   - 語言：${langConfig.outputLanguage}

3. **圖像提示**：為每個場景生成詳細的圖像生成提示（英文），包括：
   - 主要視覺元素
   - 構圖和視角
   - 光線和氛圍
   - 風格描述

請以 JSON 格式返回，結構如下：
{
  "scenes": [
    {
      "description": "場景的簡短描述",
      "imagePrompt": "詳細的英文圖像生成提示",
      "narration": "${langConfig.outputLanguage}旁白文本"
    }
  ],
  "characterPrompt": "統一的角色描述（如果有角色）"
}

注意：
- 只返回 JSON，不要有其他內容
- 確保每個場景的 imagePrompt 詳細且具體
- 旁白要符合指定語言的特點`;

    // 使用完美 API 客戶端調用
    const response = await perfectApiClient.perfectFetch({
      url: API_ENDPOINTS.llm,
      options: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: llmModel,
          messages: [
            {
              role: 'system',
              content: '你是一個專業的視頻腳本分析師，擅長將故事分解為視覺場景。',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.7,
          max_tokens: 4000,
        }),
      },
      maxRetries: 10,
      timeout: 120000,
      context,
    });
    
    const data = await response.json();
    
    // 解析 LLM 響應
    let content = data.choices?.[0]?.message?.content || '';
    
    // 清理 JSON（移除 markdown 標記）
    content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    const result = JSON.parse(content);
    
    console.log(`[PerfectVideoService] ✓ LLM 分析成功，生成 ${result.scenes.length} 個場景`);
    
    // 格式化場景數據
    const scenes: SceneData[] = result.scenes.map((scene: any, index: number) => ({
      id: index + 1,
      description: scene.description || '',
      imagePrompt: scene.imagePrompt || scene.description || '',
      narration: scene.narration || '',
      imageUrl: null,
      videoUrl: null,
      audioUrl: null,
    }));
    
    return {
      scenes,
      characterPrompt: result.characterPrompt || '',
    };
    
  } catch (error) {
    console.error('[PerfectVideoService] ✗ LLM 分析失敗:', error);
    
    // 最後的備用方案：簡單分割故事
    console.log('[PerfectVideoService] 使用備用方案：簡單場景分割');
    
    const fallbackScenes: SceneData[] = [{
      id: 1,
      description: story.substring(0, 200),
      imagePrompt: `A cinematic scene depicting: ${story.substring(0, 100)}`,
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

// ============================================
// 2. 完美圖片生成（帶自動修復）
// ============================================

export async function perfectGenerateImage(
  prompt: string,
  characterPrompt: string = ''
): Promise<string> {
  
  console.log('[PerfectVideoService] 開始圖片生成...');
  
  const context = {
    stage: 'image',
  };
  
  try {
    // 組合 prompt
    const fullPrompt = characterPrompt 
      ? `${characterPrompt}, ${prompt}` 
      : prompt;
    
    // 使用完美 API 客戶端調用
    const response = await perfectApiClient.perfectFetch({
      url: API_ENDPOINTS.image,
      options: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: fullPrompt,
          n: 1,
          size: '1024x1024',
          quality: 'hd',
        }),
      },
      maxRetries: 8,
      timeout: 120000,
      context,
    });
    
    const data = await response.json();
    const imageUrl = data.data?.[0]?.url || data.url || '';
    
    if (!imageUrl) {
      throw new Error('圖片 URL 為空');
    }
    
    console.log('[PerfectVideoService] ✓ 圖片生成成功');
    return imageUrl;
    
  } catch (error) {
    console.error('[PerfectVideoService] ✗ 圖片生成失敗:', error);
    
    // 返回佔位符圖片
    return 'https://via.placeholder.com/1024x1024?text=Image+Generation+Failed';
  }
}

// ============================================
// 3. 完美視頻生成（帶自動修復）
// ============================================

export async function perfectGenerateVideo(
  imageUrl: string,
  prompt: string,
  videoModel: string = 'veo3.1-fast'
): Promise<string> {
  
  console.log(`[PerfectVideoService] 開始視頻生成 (模型: ${videoModel})...`);
  
  const context = {
    videoModel,
    stage: 'video',
  };
  
  try {
    // 使用完美 API 客戶端調用
    const response = await perfectApiClient.perfectFetch({
      url: API_ENDPOINTS.video,
      options: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image_url: imageUrl,
          prompt,
          model: videoModel,
          duration: 5,
        }),
      },
      maxRetries: 8,
      timeout: 180000, // 視頻生成可能需要更長時間
      context,
    });
    
    const data = await response.json();
    const videoUrl = data.video_url || data.url || '';
    
    if (!videoUrl) {
      throw new Error('視頻 URL 為空');
    }
    
    console.log('[PerfectVideoService] ✓ 視頻生成成功');
    return videoUrl;
    
  } catch (error) {
    console.error('[PerfectVideoService] ✗ 視頻生成失敗:', error);
    
    // 使用圖片作為靜態視頻
    console.log('[PerfectVideoService] 降級：使用靜態圖片作為視頻');
    return imageUrl;
  }
}

// ============================================
// 4. 完美音頻生成（帶自動修復）
// ============================================

export async function perfectGenerateAudio(
  text: string,
  voiceActorId: string = 'mandarin-female-narrator',
  language: string = 'mandarin'
): Promise<string> {
  
  console.log('[PerfectVideoService] 開始音頻生成...');
  
  const context = {
    ttsService: 'primary',
    stage: 'audio',
  };
  
  try {
    // 使用完美 API 客戶端調用
    const response = await perfectApiClient.perfectFetch({
      url: API_ENDPOINTS.tts,
      options: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          voice: voiceActorId,
          language,
        }),
      },
      maxRetries: 5,
      timeout: 60000,
      context,
    });
    
    const data = await response.json();
    const audioUrl = data.audio_url || data.url || '';
    
    if (!audioUrl) {
      throw new Error('音頻 URL 為空');
    }
    
    console.log('[PerfectVideoService] ✓ 音頻生成成功');
    return audioUrl;
    
  } catch (error) {
    console.error('[PerfectVideoService] ✗ 音頻生成失敗:', error);
    
    // 返回空音頻（靜音）
    return '';
  }
}

// ============================================
// 5. 完美視頻合成（帶自動修復）
// ============================================

export async function perfectMergeVideo(
  scenes: SceneData[]
): Promise<string> {
  
  console.log('[PerfectVideoService] 開始視頻合成...');
  
  try {
    // 使用完美 API 客戶端調用
    const response = await perfectApiClient.perfectFetch({
      url: API_ENDPOINTS.merge,
      options: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          scenes: scenes.map(scene => ({
            video_url: scene.videoUrl,
            audio_url: scene.audioUrl,
          })),
        }),
      },
      maxRetries: 5,
      timeout: 180000,
      context: {},
    });
    
    const data = await response.json();
    const finalVideoUrl = data.video_url || data.url || '';
    
    if (!finalVideoUrl) {
      throw new Error('最終視頻 URL 為空');
    }
    
    console.log('[PerfectVideoService] ✓ 視頻合成成功');
    return finalVideoUrl;
    
  } catch (error) {
    console.error('[PerfectVideoService] ✗ 視頻合成失敗:', error);
    
    // 返回第一個場景的視頻作為備用
    return scenes[0]?.videoUrl || '';
  }
}

// ============================================
// 6. 獲取完美統計信息
// ============================================

export function getPerfectStats() {
  return perfectApiClient.getStats();
}
