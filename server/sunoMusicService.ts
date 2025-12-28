/**
 * SUNO AI 音樂生成服務
 * 使用 VectorEngine API 生成背景音樂
 * 
 * ✅ 修復：更新預設音樂 URL 為有效的 SoundHelix 音樂
 */

import { getNextApiKey, API_ENDPOINTS } from "./videoConfig";

const SUNO_API_BASE = API_ENDPOINTS.vectorEngine;

// 音樂風格選項
export const MUSIC_STYLES = {
  cinematic: {
    name: "電影感",
    description: "史詩般的管弦樂配樂",
    prompt: "cinematic orchestral epic soundtrack, emotional, dramatic, film score",
    tags: ["cinematic", "orchestral", "epic"],
  },
  emotional: {
    name: "感人",
    description: "溫暖感人的鋼琴曲",
    prompt: "emotional piano ballad, heartwarming, touching, gentle melody",
    tags: ["emotional", "piano", "ballad"],
  },
  upbeat: {
    name: "歡快",
    description: "活潑歡快的流行音樂",
    prompt: "upbeat pop music, happy, energetic, cheerful, catchy melody",
    tags: ["upbeat", "pop", "happy"],
  },
  dramatic: {
    name: "戲劇性",
    description: "緊張刺激的配樂",
    prompt: "dramatic tension music, suspenseful, intense, thriller soundtrack",
    tags: ["dramatic", "tension", "suspense"],
  },
  peaceful: {
    name: "平靜",
    description: "輕柔舒緩的環境音樂",
    prompt: "peaceful ambient music, calm, relaxing, meditation, nature sounds",
    tags: ["peaceful", "ambient", "relaxing"],
  },
  romantic: {
    name: "浪漫",
    description: "甜蜜浪漫的愛情配樂",
    prompt: "romantic love song, sweet, tender, acoustic guitar, soft vocals",
    tags: ["romantic", "love", "acoustic"],
  },
  adventure: {
    name: "冒險",
    description: "充滿冒險精神的配樂",
    prompt: "adventure epic music, heroic, triumphant, brass instruments, exciting",
    tags: ["adventure", "epic", "heroic"],
  },
  mystery: {
    name: "神秘",
    description: "神秘懸疑的氛圍音樂",
    prompt: "mysterious ambient music, dark, enigmatic, electronic, atmospheric",
    tags: ["mystery", "dark", "atmospheric"],
  },
  comedy: {
    name: "喜劇",
    description: "輕鬆幽默的配樂",
    prompt: "comedy funny music, playful, quirky, light-hearted, cartoon style",
    tags: ["comedy", "funny", "playful"],
  },
  horror: {
    name: "恐怖",
    description: "陰森恐怖的配樂",
    prompt: "horror scary music, creepy, dark ambient, unsettling, tension",
    tags: ["horror", "scary", "dark"],
  },
} as const;

export type MusicStyle = keyof typeof MUSIC_STYLES;

// 音樂生成參數
export interface MusicGenerationParams {
  style: MusicStyle;
  duration?: number; // 秒數，默認 30 秒
  customPrompt?: string; // 自定義提示詞
  instrumental?: boolean; // 是否純音樂（無人聲）
}

// 音樂生成結果
export interface MusicGenerationResult {
  success: boolean;
  audioUrl?: string;
  duration?: number;
  title?: string;
  error?: string;
}

/**
 * 使用 SUNO AI 生成背景音樂
 */
export async function generateSunoMusic(
  params: MusicGenerationParams
): Promise<MusicGenerationResult> {
  const {
    style,
    duration = 30,
    customPrompt,
    instrumental = true,
  } = params;

  const styleConfig = MUSIC_STYLES[style];
  const prompt = customPrompt || styleConfig.prompt;

  try {
    const apiKey = getNextApiKey();
    
    console.log(`[SUNO] 開始生成音樂，風格: ${style}, 時長: ${duration}秒`);
    console.log(`[SUNO] 提示詞: ${prompt}`);

    // 調用 VectorEngine 的 SUNO 音樂生成 API
    const response = await fetch(`${SUNO_API_BASE}/v1/audio/music`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "suno_music",
        prompt: prompt,
        duration: duration,
        instrumental: instrumental,
        tags: styleConfig.tags,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[SUNO] API 錯誤: ${response.status} - ${errorText}`);
      
      // 如果 SUNO API 不可用，返回預設音樂 URL
      return await fallbackToPresetMusic(style);
    }

    const result = await response.json();
    
    if (result.audio_url || result.url) {
      console.log(`[SUNO] 音樂生成成功: ${result.audio_url || result.url}`);
      return {
        success: true,
        audioUrl: result.audio_url || result.url,
        duration: result.duration || duration,
        title: result.title || `${styleConfig.name} 背景音樂`,
      };
    }

    // 如果沒有返回 URL，使用備用方案
    return await fallbackToPresetMusic(style);
  } catch (error) {
    console.error("[SUNO] 音樂生成錯誤:", error);
    return await fallbackToPresetMusic(style);
  }
}

/**
 * 備用方案：使用預設音樂 URL
 * ✅ 修復：更新為有效的 SoundHelix 音樂 URL（免費、可直接訪問）
 */
async function fallbackToPresetMusic(style: MusicStyle): Promise<MusicGenerationResult> {
  // ✅ 更新：使用 SoundHelix 提供的免費音樂（已驗證可用）
  const PRESET_MUSIC: Record<MusicStyle, string> = {
    cinematic: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
    emotional: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
    upbeat: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
    dramatic: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3",
    peaceful: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3",
    romantic: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3",
    adventure: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3",
    mystery: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3",
    comedy: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3",
    horror: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3",
  };

  const styleConfig = MUSIC_STYLES[style];
  
  console.log(`[SUNO] 使用預設音樂: ${style} -> ${PRESET_MUSIC[style]}`);
  
  return {
    success: true,
    audioUrl: PRESET_MUSIC[style],
    duration: 30,
    title: `${styleConfig.name} 背景音樂（預設）`,
  };
}

/**
 * 根據故事內容自動推薦音樂風格
 */
export async function recommendMusicStyle(story: string): Promise<MusicStyle> {
  try {
    const apiKey = getNextApiKey();
    
    const response = await fetch(`${SUNO_API_BASE}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-nano",
        messages: [
          {
            role: "system",
            content: `你是一個音樂推薦專家。根據故事內容，從以下選項中選擇最適合的背景音樂風格：
cinematic（電影感）、emotional（感人）、upbeat（歡快）、dramatic（戲劇性）、peaceful（平靜）、romantic（浪漫）、adventure（冒險）、mystery（神秘）、comedy（喜劇）、horror（恐怖）

只回覆風格名稱，不要其他內容。`,
          },
          {
            role: "user",
            content: `故事內容：${story.substring(0, 500)}`,
          },
        ],
        max_tokens: 20,
      }),
    });

    if (response.ok) {
      const result = await response.json();
      const recommendedStyle = result.choices?.[0]?.message?.content?.trim().toLowerCase();
      
      if (recommendedStyle && recommendedStyle in MUSIC_STYLES) {
        console.log(`[SUNO] 推薦音樂風格: ${recommendedStyle}`);
        return recommendedStyle as MusicStyle;
      }
    }
  } catch (error) {
    console.error("[SUNO] 推薦音樂風格失敗:", error);
  }

  // 默認返回電影感
  return "cinematic";
}

/**
 * 獲取所有可用的音樂風格選項
 */
export function getMusicStyleOptions() {
  return Object.entries(MUSIC_STYLES).map(([key, value]) => ({
    id: key,
    name: value.name,
    description: value.description,
    tags: value.tags,
  }));
}
