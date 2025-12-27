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

  // 計算總秒數
  const totalSeconds = Math.round(duration * 60);
  
  console.log(`[generateOutline] 參數: title="${title}", duration=${duration}分鐘, totalSeconds=${totalSeconds}秒, segmentCount=${segmentCount}`);

  // 根據語言設置提示詞
  const languagePrompt = {
    cantonese: "請使用繁體中文（粵語風格）撰寫大綱。",
    mandarin: "請使用簡體中文撰寫大綱。",
    english: "Please write the outline in English.",
    clone: "請使用繁體中文撰寫大綱。",
  };

  // 根據時長選擇不同的提示詞策略
  let systemPrompt: string;
  let userPrompt: string;

  if (totalSeconds <= 30) {
    // 超短視頻（30秒以內）- 極簡模式
    systemPrompt = `你是一位專業的短視頻腳本策劃專家。你需要為極短的視頻（${totalSeconds}秒）生成一個簡潔有力的大綱。

${languagePrompt[language]}

【重要限制】
- 總時長只有 ${totalSeconds} 秒
- 只有 ${segmentCount} 個片段（每個片段 8 秒）
- 不要生成超過 ${segmentCount} 個內容點
- 每個內容點的描述要簡短（1-2句話）

對於這麼短的視頻，結構應該是：
- 開場（1個片段）：直接切入主題
- 主體（${Math.max(1, segmentCount - 1)}個片段）：核心內容
- 不需要單獨的結尾部分`;

    userPrompt = `視頻主題：${title}
視頻時長：${totalSeconds} 秒（只有 ${segmentCount} 個 8 秒片段）

【嚴格要求】
1. 這是一個只有 ${totalSeconds} 秒的超短視頻
2. 只能有 ${segmentCount} 個內容點
3. 每個內容點對應一個 8 秒片段
4. 不要生成任何超過 ${totalSeconds} 秒的內容

請生成一個適合 ${totalSeconds} 秒視頻的簡潔大綱。`;

  } else if (totalSeconds <= 60) {
    // 短視頻（30-60秒）- 簡化模式
    systemPrompt = `你是一位專業的短視頻腳本策劃專家。你需要為短視頻（${totalSeconds}秒）生成一個簡潔的大綱。

${languagePrompt[language]}

【重要限制】
- 總時長只有 ${totalSeconds} 秒
- 共 ${segmentCount} 個片段（每個片段 8 秒）
- 結構要簡單：開場 + 主體 + 結尾
- 每個部分的描述要簡短`;

    userPrompt = `視頻主題：${title}
視頻時長：${totalSeconds} 秒（${segmentCount} 個 8 秒片段）

請生成一個適合 ${totalSeconds} 秒視頻的簡潔大綱。
- 開場：約 ${Math.round(totalSeconds * 0.15)} 秒
- 主體：約 ${Math.round(totalSeconds * 0.7)} 秒
- 結尾：約 ${Math.round(totalSeconds * 0.15)} 秒`;

  } else {
    // 標準視頻（1分鐘以上）- 完整模式
    const durationDisplay = `${duration.toFixed(1)} 分鐘（約 ${totalSeconds} 秒）`;
    
    systemPrompt = `你是一位專業的視頻腳本策劃專家。你需要根據給定的視頻主題，生成一個結構清晰、內容豐富的故事大綱。

${languagePrompt[language]}

大綱應該包含：
1. 開場（約佔總時長的10%）：引人入勝的開頭，吸引觀眾注意力
2. 發展（約佔總時長的50%）：主要內容展開，分成多個小節
3. 高潮（約佔總時長的25%）：最精彩的部分，核心信息傳達
4. 結尾（約佔總時長的15%）：總結回顧，呼籲行動

每個部分要有具體的內容描述，不要太籠統。`;

    userPrompt = `視頻主題：${title}
視頻時長：${durationDisplay}
片段數量：${segmentCount} 個片段（每個片段約 8 秒）

請為這個視頻生成一個詳細的故事大綱。`;
  }

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

    console.log(`[generateOutline] 成功生成大綱，長度: ${content.length} 字符`);

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
