import { invokeLLM } from "./_core/llm";

export interface GeneratedSegment {
  description: string;
  narration: string;
}

export interface GenerateSegmentsParams {
  title: string;
  outline: string;
  language: "cantonese" | "mandarin" | "english" | "clone";
  segmentCount: number;
}

export interface GenerateSegmentsResult {
  segments: GeneratedSegment[];
  apiProvider?: string;
  apiProviderName?: string;
}

export async function generateSegments(params: GenerateSegmentsParams): Promise<GenerateSegmentsResult> {
  const { title, outline, language, segmentCount } = params;

  // 根據語言設置提示詞
  const languagePrompt = {
    cantonese: "請使用粵語（廣東話）撰寫旁白文字，語氣自然口語化。",
    mandarin: "請使用普通話撰寫旁白文字，語氣自然流暢。",
    english: "Please write the narration in natural, conversational English.",
    clone: "請使用粵語（廣東話）撰寫旁白文字，語氣自然口語化。",
  };

  const systemPrompt = `你是一位專業的視頻腳本撰寫專家。你需要根據給定的視頻主題和故事大綱，為每個8秒的視頻片段生成：
1. 場景描述（description）：詳細描述這個片段的視覺畫面，用於 AI 生成視頻
2. 旁白文字（narration）：這個片段的旁白內容，約20-30個字，適合8秒朗讀

${languagePrompt[language]}

重要規則：
- 每個片段的旁白必須控制在20-30個字左右，確保能在8秒內自然朗讀完畢
- 場景描述要具體、視覺化，便於 AI 理解並生成畫面
- 旁白要連貫，每個片段之間要有邏輯銜接
- 不要包含任何標點符號以外的特殊字符
- 不要在旁白中包含「第X段」「片段X」等編號信息`;

  const userPrompt = `視頻主題：${title}

故事大綱：
${outline}

請為這個視頻生成 ${segmentCount} 個片段的內容。每個片段8秒。

請以 JSON 格式返回，格式如下：
{
  "segments": [
    {
      "description": "場景描述...",
      "narration": "旁白文字..."
    }
  ]
}`;

  try {
    const result = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      responseFormat: { type: "json_object" },
    });

    const content = result.choices[0]?.message?.content;
    if (!content || typeof content !== "string") {
      throw new Error("LLM 返回內容為空");
    }

    // 解析 JSON 響應
    const parsed = JSON.parse(content);
    
    if (!parsed.segments || !Array.isArray(parsed.segments)) {
      throw new Error("LLM 返回格式錯誤：缺少 segments 數組");
    }

    // 驗證並清理數據
    const segments: GeneratedSegment[] = parsed.segments.map((seg: any, index: number) => ({
      description: seg.description || `片段 ${index + 1} 的場景描述`,
      narration: seg.narration || `片段 ${index + 1} 的旁白內容`,
    }));

    // 確保返回正確數量的片段
    while (segments.length < segmentCount) {
      const lastIndex = segments.length;
      segments.push({
        description: `延續上一個場景，展示更多細節`,
        narration: `繼續講述故事的發展`,
      });
    }

    return {
      segments: segments.slice(0, segmentCount),
      apiProvider: result.apiProvider,
      apiProviderName: result.apiProviderName,
    };
  } catch (error) {
    console.error("生成片段內容失敗:", error);
    throw error;
  }
}
