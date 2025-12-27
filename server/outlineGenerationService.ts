import { invokeLLM } from "./_core/llm";

export interface GenerateOutlineParams {
  title: string;
  language: "cantonese" | "mandarin" | "english" | "clone";
  duration: number;  // 視頻時長（分鐘）
  segmentCount: number;
}

export interface GenerateOutlineResult {
  outline: string;
  apiProvider?: string;
  apiProviderName?: string;
}

export async function generateOutline(params: GenerateOutlineParams): Promise<GenerateOutlineResult> {
  const { title, language, duration, segmentCount } = params;

  // 根據語言設置提示詞
  const languagePrompt = {
    cantonese: "請使用繁體中文撰寫大綱。",
    mandarin: "請使用簡體中文撰寫大綱。",
    english: "Please write the outline in English.",
    clone: "請使用繁體中文撰寫大綱。",
  };

  const systemPrompt = `你是一位專業的視頻腳本策劃專家。你需要根據給定的視頻主題，生成一個結構清晰、內容豐富的故事大綱。

${languagePrompt[language]}

大綱應該包含：
1. 開場（約佔總時長的10%）：引人入勝的開頭，吸引觀眾注意力
2. 發展（約佔總時長的50%）：主要內容展開，分成多個小節
3. 高潮（約佔總時長的25%）：最精彩的部分，核心信息傳達
4. 結尾（約佔總時長的15%）：總結回顧，呼籲行動

每個部分要有具體的內容描述，不要太籠統。`;

  const userPrompt = `視頻主題：${title}
視頻時長：${duration} 分鐘（約 ${segmentCount} 個 8 秒片段）

請為這個視頻生成一個詳細的故事大綱。大綱應該能夠指導後續的視頻片段生成。`;

  try {
    const result = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const content = result.choices[0]?.message?.content;
    if (!content || typeof content !== "string") {
      throw new Error("LLM 返回內容為空");
    }

    return {
      outline: content.trim(),
      apiProvider: result.apiProvider,
      apiProviderName: result.apiProviderName,
    };
  } catch (error) {
    console.error("生成大綱失敗:", error);
    throw error;
  }
}
