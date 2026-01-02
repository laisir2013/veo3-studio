/**
 * Suno AI 音樂生成服務
 * 使用 VectorEngine API 生成背景音樂
 */

import { getNextApiKey, API_ENDPOINTS } from "./videoConfig";
import { sleep } from "./videoService";

// Suno 音樂風格預設
export const SUNO_MUSIC_STYLES = {
  cinematic: {
    name: "電影配樂",
    prompt: "cinematic orchestral background music, epic and emotional, no vocals",
    tags: "cinematic, orchestral, epic, emotional, instrumental",
  },
  emotional: {
    name: "感性抒情",
    prompt: "soft emotional piano background music, gentle and touching, no vocals",
    tags: "emotional, piano, gentle, touching, instrumental",
  },
  upbeat: {
    name: "歡快活潑",
    prompt: "upbeat happy background music, energetic and positive, no vocals",
    tags: "upbeat, happy, energetic, positive, instrumental",
  },
  dramatic: {
    name: "戲劇張力",
    prompt: "dramatic intense background music, suspenseful and powerful, no vocals",
    tags: "dramatic, intense, suspenseful, powerful, instrumental",
  },
  peaceful: {
    name: "平靜舒緩",
    prompt: "peaceful calm ambient background music, relaxing and serene, no vocals",
    tags: "peaceful, calm, ambient, relaxing, instrumental",
  },
  lofi: {
    name: "Lofi 放鬆",
    prompt: "lofi hip hop chill background music, relaxing beats, no vocals",
    tags: "lofi, chill, hip hop, relaxing, instrumental",
  },
} as const;

export type SunoMusicStyle = keyof typeof SUNO_MUSIC_STYLES;

interface SunoSubmitResponse {
  code: number;
  message: string;
  data?: {
    taskId: string;
  };
}

interface SunoQueryResponse {
  code: number;
  message: string;
  data?: {
    status: string;
    audioUrl?: string;
    progress?: number;
    failReason?: string;
  };
}

/**
 * 提交 Suno 音樂生成任務
 */
async function submitSunoTask(
  prompt: string,
  tags: string,
  duration: number = 60
): Promise<string> {
  const apiKey = getNextApiKey();
  
  console.log(`[Suno] 提交音樂生成任務: ${prompt.substring(0, 50)}...`);
  
  const response = await fetch(`${API_ENDPOINTS.vectorEngine}/suno/submit/music`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      prompt,
      tags,
      make_instrumental: true, // 純音樂，無人聲
      duration,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Suno 提交失敗: ${response.status} - ${errorText}`);
  }

  const data: SunoSubmitResponse = await response.json();
  
  if (data.code !== 0 || !data.data?.taskId) {
    throw new Error(`Suno 提交失敗: ${data.message}`);
  }

  console.log(`[Suno] 任務已提交，taskId: ${data.data.taskId}`);
  return data.data.taskId;
}

/**
 * 查詢 Suno 任務狀態
 */
async function querySunoTask(taskId: string): Promise<SunoQueryResponse["data"]> {
  const apiKey = getNextApiKey();
  
  const response = await fetch(`${API_ENDPOINTS.vectorEngine}/suno/task/${taskId}/fetch`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Suno 查詢失敗: ${response.status}`);
  }

  const data: SunoQueryResponse = await response.json();
  return data.data;
}

/**
 * 生成 Suno AI 背景音樂
 * @param style 音樂風格
 * @param duration 音樂時長（秒）
 * @param customPrompt 自定義提示詞（可選）
 * @returns 音樂 URL
 */
export async function generateSunoMusic(
  style: SunoMusicStyle | string,
  duration: number = 60,
  customPrompt?: string
): Promise<string> {
  // 獲取風格配置
  const styleConfig = SUNO_MUSIC_STYLES[style as SunoMusicStyle];
  
  const prompt = customPrompt || styleConfig?.prompt || "background music, instrumental, no vocals";
  const tags = styleConfig?.tags || "instrumental, background";

  console.log(`[Suno] 開始生成音樂，風格: ${style}, 時長: ${duration}秒`);

  try {
    // 提交任務
    const taskId = await submitSunoTask(prompt, tags, duration);

    // 輪詢等待完成（最多等待 5 分鐘）
    for (let i = 0; i < 60; i++) {
      await sleep(5000); // 每 5 秒查詢一次

      const result = await querySunoTask(taskId);

      if (!result) {
        continue;
      }

      if (result.status === "SUCCESS" && result.audioUrl) {
        console.log(`[Suno] ✅ 音樂生成成功: ${result.audioUrl}`);
        return result.audioUrl;
      }

      if (result.status === "FAILED") {
        throw new Error(`Suno 生成失敗: ${result.failReason || "未知錯誤"}`);
      }

      if (result.progress) {
        console.log(`[Suno] 生成進度: ${result.progress}%`);
      }
    }

    throw new Error("Suno 音樂生成超時（5分鐘）");
  } catch (error: any) {
    console.error(`[Suno] ❌ 音樂生成失敗:`, error.message);
    throw error;
  }
}

/**
 * 根據視頻主題自動選擇音樂風格
 */
export function suggestMusicStyle(topic: string): SunoMusicStyle {
  const topicLower = topic.toLowerCase();
  
  if (topicLower.includes("感人") || topicLower.includes("愛") || topicLower.includes("親情")) {
    return "emotional";
  }
  if (topicLower.includes("史詩") || topicLower.includes("戰爭") || topicLower.includes("冒險")) {
    return "cinematic";
  }
  if (topicLower.includes("歡樂") || topicLower.includes("慶祝") || topicLower.includes("派對")) {
    return "upbeat";
  }
  if (topicLower.includes("懸疑") || topicLower.includes("驚悚") || topicLower.includes("緊張")) {
    return "dramatic";
  }
  if (topicLower.includes("放鬆") || topicLower.includes("冥想") || topicLower.includes("自然")) {
    return "peaceful";
  }
  if (topicLower.includes("學習") || topicLower.includes("工作") || topicLower.includes("閱讀")) {
    return "lofi";
  }
  
  // 默認返回電影配樂
  return "cinematic";
}
