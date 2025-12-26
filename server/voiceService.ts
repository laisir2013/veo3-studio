// 配音員服務
import { getNextApiKey, VOICE_ACTORS, VOICE_MATCHING_RULES, type VoiceActorId, type VoiceLanguage } from "./videoConfig";
import { 
  ALL_VOICE_ACTORS, 
  filterVoiceActors, 
  filterByLanguage, 
  filterByGender, 
  filterByAgeGroup, 
  filterByStyle,
  getVoiceActorStats,
  type VoiceActorConfig,
  type AgeGroup,
  type VoiceStyle,
} from "./voiceActorsConfig";
import type { DialogueData, CharacterVoiceConfig } from "../drizzle/schema";

// ============================================
// 基礎配音員查詢
// ============================================

// 獲取配音員信息（兼容舊版）
export function getVoiceActor(voiceActorId: VoiceActorId) {
  return VOICE_ACTORS[voiceActorId];
}

// 獲取配音員信息（新版，包含完整配置）
export function getVoiceActorConfig(voiceActorId: string): VoiceActorConfig | undefined {
  return ALL_VOICE_ACTORS[voiceActorId];
}

// 獲取所有配音員列表（兼容舊版）
export function getAllVoiceActors() {
  return Object.values(VOICE_ACTORS);
}

// 獲取所有配音員列表（新版，包含完整配置）
export function getAllVoiceActorsConfig() {
  return Object.values(ALL_VOICE_ACTORS);
}

// ============================================
// KreadoAI 風格篩選方法
// ============================================

// 根據語言獲取配音員
export function getVoiceActorsByLanguage(language: VoiceLanguage) {
  return filterByLanguage(language);
}

// 根據性別獲取配音員
export function getVoiceActorsByGender(gender: "male" | "female") {
  return filterByGender(gender);
}

// 根據類型獲取配音員（旁白/角色）
export function getVoiceActorsByType(type: "narrator" | "character") {
  return Object.values(ALL_VOICE_ACTORS).filter(actor => actor.type === type);
}

// 根據年齡段獲取配音員
export function getVoiceActorsByAgeGroup(ageGroup: AgeGroup) {
  return filterByAgeGroup(ageGroup);
}

// 根據風格獲取配音員
export function getVoiceActorsByStyle(style: VoiceStyle) {
  return filterByStyle(style);
}

// 組合篩選配音員（KreadoAI 風格）
export function filterVoiceActorsAdvanced(options: {
  language?: VoiceLanguage;
  gender?: "male" | "female";
  ageGroup?: AgeGroup;
  style?: VoiceStyle;
  searchText?: string;
}) {
  let result = filterVoiceActors({
    language: options.language,
    gender: options.gender,
    ageGroup: options.ageGroup,
    style: options.style,
  });
  
  // 文字搜索
  if (options.searchText) {
    const searchLower = options.searchText.toLowerCase();
    result = result.filter(actor => 
      actor.name.toLowerCase().includes(searchLower) ||
      actor.description.toLowerCase().includes(searchLower) ||
      actor.tags.some(tag => tag.toLowerCase().includes(searchLower)) ||
      actor.useCases.some(useCase => useCase.toLowerCase().includes(searchLower))
    );
  }
  
  return result;
}

// 獲取配音員統計信息
export function getVoiceStats() {
  return getVoiceActorStats();
}

// ============================================
// 試聽功能
// ============================================

// 獲取配音員試聽 URL
export function getVoiceActorSampleUrl(voiceActorId: string): string | undefined {
  const actor = ALL_VOICE_ACTORS[voiceActorId];
  return actor?.sampleUrl;
}

// 獲取所有配音員的試聽 URL 列表
export function getAllSampleUrls(): Array<{ id: string; name: string; sampleUrl: string }> {
  return Object.values(ALL_VOICE_ACTORS)
    .filter(actor => actor.sampleUrl)
    .map(actor => ({
      id: actor.id,
      name: actor.name,
      sampleUrl: actor.sampleUrl!,
    }));
}

// ============================================
// AI 自動匹配配音員
// ============================================

// AI 自動匹配配音員（增強版）
export function matchVoiceActorByDescription(characterDescription: string, language: VoiceLanguage = "cantonese"): string {
  const description = characterDescription.toLowerCase();
  
  // 獲取指定語言的配音員
  const languageActors = filterByLanguage(language);
  
  // 檢查關鍵詞匹配
  for (const [keyword, voiceActorId] of Object.entries(VOICE_MATCHING_RULES.keywords)) {
    if (description.includes(keyword)) {
      // 檢查是否有對應語言的版本
      const matchedActor = languageActors.find(a => a.id.includes(voiceActorId.split('-').slice(1).join('-')));
      if (matchedActor) return matchedActor.id;
    }
  }
  
  // 檢查性別和年齡關鍵詞
  const isFemale = /女|她|母|媽|姐|妹|婆|嬸|姑|姨|小姐|女士|公主|皇后|女王|female|woman|girl|queen|princess/.test(description);
  const isMale = /男|他|父|爸|哥|弟|公|叔|伯|舅|先生|王子|皇帝|國王|male|man|boy|king|prince/.test(description);
  const isChild = /小|孩|童|兒|幼|寶|child|kid|baby/.test(description);
  const isElderly = /老|年邁|年長|爺|奶|婆|公|elderly|old|senior/.test(description);
  const isTeen = /少年|少女|青年|teenager|teen|young/.test(description);
  
  // 根據特徵組合判斷
  let filteredActors = languageActors;
  
  if (isChild) {
    filteredActors = filteredActors.filter(a => a.ageGroup === "child");
  } else if (isElderly) {
    filteredActors = filteredActors.filter(a => a.ageGroup === "elder");
  } else if (isTeen) {
    filteredActors = filteredActors.filter(a => a.ageGroup === "teen" || a.ageGroup === "young");
  }
  
  if (isFemale) {
    filteredActors = filteredActors.filter(a => a.gender === "female");
  } else if (isMale) {
    filteredActors = filteredActors.filter(a => a.gender === "male");
  }
  
  // 如果有匹配的配音員，返回第一個
  if (filteredActors.length > 0) {
    return filteredActors[0].id;
  }
  
  // 默認返回語言對應的旁白
  const prefix = language === "cantonese" ? "cantonese" : language === "mandarin" ? "mandarin" : "english";
  return `${prefix}-male-narrator`;
}

// 為角色列表自動分配配音員
export function autoAssignVoiceActors(
  characters: Array<{ name: string; description?: string }>,
  existingBindings?: CharacterVoiceConfig[],
  language: VoiceLanguage = "cantonese"
): CharacterVoiceConfig[] {
  const result: CharacterVoiceConfig[] = [];
  const usedVoiceActors = new Set<string>();
  
  // 首先應用已有的綁定
  if (existingBindings) {
    for (const binding of existingBindings) {
      usedVoiceActors.add(binding.voiceActorId);
    }
  }
  
  for (const character of characters) {
    // 檢查是否已有綁定
    const existingBinding = existingBindings?.find(
      b => b.characterName.toLowerCase() === character.name.toLowerCase()
    );
    
    if (existingBinding) {
      result.push(existingBinding);
      continue;
    }
    
    // 自動匹配配音員
    let voiceActorId = matchVoiceActorByDescription(character.description || character.name, language);
    
    // 如果已被使用，嘗試找同類型的其他配音員
    if (usedVoiceActors.has(voiceActorId)) {
      const actor = ALL_VOICE_ACTORS[voiceActorId];
      if (actor) {
        const alternatives = filterVoiceActors({
          language: actor.language,
          gender: actor.gender,
          ageGroup: actor.ageGroup,
        }).filter(a => !usedVoiceActors.has(a.id));
        
        if (alternatives.length > 0) {
          voiceActorId = alternatives[0].id;
        }
      }
    }
    
    usedVoiceActors.add(voiceActorId);
    
    result.push({
      characterName: character.name,
      characterDescription: character.description,
      voiceActorId,
      isAutoMatched: true,
    });
  }
  
  return result;
}

// 分析故事中的角色
export async function analyzeCharactersFromStory(
  story: string,
  llmModel: string = "gpt-4o-mini"
): Promise<Array<{ name: string; description: string }>> {
  const { invokeLLM } = await import("./_core/llm");
  
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `你是一個專業的故事分析師。請分析故事中的角色，提取角色名稱和描述。
返回 JSON 格式：
{
  "characters": [
    { "name": "角色名", "description": "角色描述（包括性別、年齡、性格特點等）" }
  ]
}
只返回 JSON，不要其他內容。`,
      },
      {
        role: "user",
        content: `請分析以下故事中的角色：\n\n${story}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "character_analysis",
        strict: true,
        schema: {
          type: "object",
          properties: {
            characters: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  description: { type: "string" },
                },
                required: ["name", "description"],
                additionalProperties: false,
              },
            },
          },
          required: ["characters"],
          additionalProperties: false,
        },
      },
    },
  });
  
  try {
    const content = response.choices[0].message.content;
    // 確保 content 是字符串類型
    const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
    const parsed = JSON.parse(contentStr);
    return parsed.characters || [];
  } catch (error) {
    console.error("解析角色分析結果失敗:", error);
    return [];
  }
}

// 為場景生成語音
export async function generateSceneVoice(
  dialogue: DialogueData,
  voiceActorId: string,
  language: VoiceLanguage = "cantonese"
): Promise<string> {
  const { generateSpeech } = await import("./videoService");
  
  // 獲取配音員配置
  const actor = ALL_VOICE_ACTORS[voiceActorId];
  if (!actor) {
    throw new Error(`配音員 ${voiceActorId} 不存在`);
  }
  
  // 獲取對話文字
  const text = typeof dialogue.text === 'string' ? dialogue.text : String(dialogue.text);
  
  // 生成語音 - 注意參數順序: text, voiceActorId, language
  const audioUrl = await generateSpeech(text, voiceActorId, language);
  return audioUrl;
}

// ============================================
// 篩選選項
// ============================================

// 獲取所有可用的篩選選項
export function getFilterOptions() {
  return {
    languages: [
      { value: "cantonese", label: "粵語", icon: "🇭🇰" },
      { value: "mandarin", label: "普通話", icon: "🇨🇳" },
      { value: "english", label: "English", icon: "🇺🇸" },
      { value: "clone", label: "克隆聲音", icon: "🎭" },
    ],
    genders: [
      { value: "male", label: "男聲", icon: "👨" },
      { value: "female", label: "女聲", icon: "👩" },
    ],
    ageGroups: [
      { value: "child", label: "童聲", icon: "👶" },
      { value: "teen", label: "少年", icon: "🧒" },
      { value: "young", label: "青年", icon: "👱" },
      { value: "adult", label: "成年", icon: "🧑" },
      { value: "middle", label: "中年", icon: "👨‍💼" },
      { value: "elder", label: "老年", icon: "👴" },
    ],
    styles: [
      { value: "narrator", label: "旁白", icon: "🎙️" },
      { value: "character", label: "角色", icon: "🎭" },
      { value: "news", label: "新聞", icon: "📰" },
      { value: "commercial", label: "廣告", icon: "📢" },
      { value: "storytelling", label: "故事", icon: "📖" },
      { value: "assistant", label: "助手", icon: "🤖" },
      { value: "cartoon", label: "卡通", icon: "🎨" },
      { value: "emotional", label: "情感", icon: "💕" },
      { value: "professional", label: "專業", icon: "💼" },
    ],
  };
}
