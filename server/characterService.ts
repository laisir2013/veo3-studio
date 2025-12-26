/**
 * 角色服務 - 處理角色上傳、分析和管理
 */

import { getNextApiKey, API_ENDPOINTS, LLM_FALLBACK_CONFIG } from "./videoConfig";
import { storagePut } from "./storage";
import type { CharacterAnalysis } from "../drizzle/schema";

/**
 * 使用 Claude 4.5 分析照片中的人物特徵
 */
export async function analyzeCharacterPhoto(
  photoUrl: string
): Promise<CharacterAnalysis> {
  const apiKey = getNextApiKey();
  
  const systemPrompt = `你是一個專業的人物特徵分析師。請仔細分析照片中的人物，提取詳細的外觀特徵。
你的分析將用於生成 Midjourney 提示詞，以創建風格化的角色基礎圖。

請以 JSON 格式返回分析結果，包含以下欄位：
- gender: 性別（male/female/other）
- ageRange: 年齡範圍（如 "20-25歲", "30-35歲"）
- ethnicity: 族裔外觀（如 "東亞", "歐美", "南亞"）
- hairStyle: 髮型描述（如 "短髮", "長直髮", "捲髮"）
- hairColor: 髮色（如 "黑色", "棕色", "金色"）
- facialFeatures: 面部特徵（如 "圓臉", "高鼻樑", "大眼睛"）
- bodyType: 體型（如 "苗條", "健壯", "普通"）
- clothing: 服裝描述（如果可見）
- accessories: 配件（如 "眼鏡", "耳環", "帽子"）
- overallStyle: 整體風格印象
- mjPrompt: 基於以上分析生成的 Midjourney 提示詞（英文，用於生成角色基礎圖）

mjPrompt 應該是一個詳細的英文描述，格式如：
"A [age] [ethnicity] [gender] with [hair description], [facial features], [body type], [clothing], [style], portrait, high quality, detailed face"`;

  const userPrompt = `請分析這張照片中的人物特徵：${photoUrl}`;

  // 嘗試主要 LLM，失敗則使用備用
  const modelsToTry = ["claude-opus-4-5-20251101", "gpt-5.2"];
  let lastError: Error | null = null;
  let result: CharacterAnalysis | null = null;

  for (const model of modelsToTry) {
    try {
      console.log(`[Character] 使用模型 ${model} 分析照片...`);
      
      const response = await fetch(`${API_ENDPOINTS.vectorEngine}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { 
              role: "user", 
              content: [
                { type: "text", text: userPrompt },
                { type: "image_url", image_url: { url: photoUrl } }
              ]
            },
          ],
          response_format: { type: "json_object" },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API 調用失敗: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content;
      
      if (!content) {
        throw new Error("LLM 返回內容為空");
      }

      result = JSON.parse(content);
      console.log(`[Character] 模型 ${model} 分析成功`);
      break;
    } catch (error) {
      lastError = error as Error;
      console.warn(`[Character] 模型 ${model} 失敗:`, error);
    }
  }

  if (!result) {
    throw lastError || new Error("所有 LLM 模型都失敗");
  }

  return result;
}

/**
 * 使用 Midjourney 生成角色基礎圖
 */
export async function generateCharacterBaseImage(
  mjPrompt: string,
  originalPhotoUrl?: string
): Promise<string> {
  const apiKey = getNextApiKey();
  
  // 構建完整提示詞
  let fullPrompt = `${mjPrompt} --ar 1:1 --v 6.1 --style raw`;
  
  // 如果有原始照片，使用 --cref 參考
  if (originalPhotoUrl) {
    fullPrompt = `${mjPrompt} --cref ${originalPhotoUrl} --cw 80 --ar 1:1 --v 6.1 --style raw`;
  }
  
  console.log(`[Character] 生成角色基礎圖，提示詞: ${fullPrompt}`);

  // 提交 Midjourney 任務
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
    throw new Error(`Midjourney 提交失敗: ${submitResponse.status} - ${errorText}`);
  }

  const submitData = await submitResponse.json();
  const taskId = submitData.result;

  if (!taskId) {
    throw new Error("Midjourney 任務 ID 為空");
  }

  console.log(`[Character] Midjourney 任務已提交: ${taskId}`);

  // 輪詢等待完成
  for (let i = 0; i < 60; i++) {
    await sleep(3000);
    
    const queryResponse = await fetch(
      `${API_ENDPOINTS.vectorEngine}/mj/task/${taskId}/fetch`,
      { headers: { "Authorization": `Bearer ${apiKey}` } }
    );

    if (!queryResponse.ok) continue;

    const data = await queryResponse.json();
    
    if (data.status === "SUCCESS" && data.imageUrl) {
      console.log(`[Character] 角色基礎圖生成成功: ${data.imageUrl}`);
      return data.imageUrl;
    }
    
    if (data.status === "FAILURE") {
      throw new Error(`Midjourney 任務失敗: ${data.failReason || "未知錯誤"}`);
    }
    
    console.log(`[Character] 等待中... 狀態: ${data.status}, 進度: ${data.progress || 0}%`);
  }

  throw new Error("Midjourney 任務超時");
}

/**
 * 從故事中識別角色名稱
 */
export async function identifyCharactersInStory(
  story: string,
  availableCharacters: { id: number; name: string; description?: string }[]
): Promise<{ characterName: string; characterId: number | null; scenes: number[] }[]> {
  const apiKey = getNextApiKey();
  
  const characterList = availableCharacters.map(c => 
    `- ${c.name}${c.description ? ` (${c.description})` : ""}`
  ).join("\n");

  const systemPrompt = `你是一個故事分析師。請分析故事中出現的角色，並匹配到用戶的角色庫。

用戶的角色庫：
${characterList || "（空）"}

請以 JSON 格式返回：
{
  "characters": [
    {
      "characterName": "故事中的角色名稱",
      "matchedCharacterId": 角色庫中匹配的 ID（如果沒有匹配則為 null）,
      "scenes": [出現的場景編號列表]
    }
  ]
}

注意：
1. 角色名稱可能有變體（如 "小明" 和 "明"），請智能匹配
2. 如果角色庫中沒有對應角色，matchedCharacterId 設為 null
3. scenes 是角色出現的場景編號（從 1 開始）`;

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
        { role: "user", content: `故事內容：\n${story}` },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    throw new Error(`角色識別失敗: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content;
  
  if (!content) {
    throw new Error("LLM 返回內容為空");
  }

  const result = JSON.parse(content);
  
  return result.characters.map((c: any) => ({
    characterName: c.characterName,
    characterId: c.matchedCharacterId,
    scenes: c.scenes || [],
  }));
}

/**
 * 上傳圖片到 S3
 */
export async function uploadCharacterPhoto(
  fileBuffer: Buffer,
  fileName: string,
  contentType: string,
  userId: number
): Promise<string> {
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const extension = fileName.split(".").pop() || "jpg";
  const key = `characters/${userId}/${timestamp}-${randomSuffix}.${extension}`;
  
  const { url } = await storagePut(key, fileBuffer, contentType);
  console.log(`[Character] 照片已上傳: ${url}`);
  
  return url;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
