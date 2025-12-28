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

// ✅ 新增：強制截斷旁白的輔助函數（導出供其他模組使用）
export function truncateNarration(narration: string, language: string, maxLength: number = 16): string {
  if (language === 'english') {
    // 英文按單詞數截斷
    const words = narration.split(/\s+/);
    if (words.length <= maxLength) return narration;
    
    // 截斷到 maxLength 個單詞，並確保句子完整
    let truncated = words.slice(0, maxLength).join(' ');
    // 如果最後不是句號，加上省略號
    if (!truncated.endsWith('.') && !truncated.endsWith('!') && !truncated.endsWith('?')) {
      truncated = truncated.replace(/[,;:]$/, '') + '.';
    }
    console.log(`[truncateNarration] 英文旁白從 ${words.length} 個單詞截斷到 ${maxLength} 個單詞`);
    return truncated;
  } else {
    // 中文按字數截斷
    // 移除標點符號計算實際字數
    const pureText = narration.replace(/[，。！？、；：「」『』（）\s]/g, '');
    if (pureText.length <= maxLength) return narration;
    
    // 截斷中文，保留標點符號的比例
    let charCount = 0;
    let truncateIndex = 0;
    for (let i = 0; i < narration.length; i++) {
      const char = narration[i];
      if (!/[，。！？、；：「」『』（）\s]/.test(char)) {
        charCount++;
      }
      if (charCount >= maxLength) {
        truncateIndex = i + 1;
        break;
      }
    }
    
    let truncated = narration.slice(0, truncateIndex);
    // 確保結尾有標點
    if (!/[。！？]$/.test(truncated)) {
      truncated = truncated.replace(/[，、；：]$/, '') + '。';
    }
    console.log(`[truncateNarration] 中文旁白從 ${pureText.length} 個字截斷到 ${maxLength} 個字`);
    return truncated;
  }
}

export async function generateSegments(params: GenerateSegmentsParams): Promise<GenerateSegmentsResult> {
  const { title, outline, language, segmentCount } = params;

  // ✅ 修復：強化語言風格差異
  const languagePrompt = {
    cantonese: `請使用地道粵語口語撰寫旁白：

【必須使用的粵語詞彙】
係、唔、嘅、咗、啲、嚟、嗰、點解、咩、邊度、好似、唔該、冇、嘢、我哋、佢哋

【語氣】要像香港 YouTuber 講解咁自然

【示例】
✅ 正確：「今日我哋嚟傾下呢個話題」
❌ 錯誤：「今天我們來討論這個話題」

✅ 正確：「呢樣嘢真係好正」
❌ 錯誤：「這個東西真的很好」

✅ 正確：「點解會咁嘅呢？」
❌ 錯誤：「為什麼會這樣呢？」`,

    mandarin: `請使用標準普通話撰寫旁白：

【語言風格】規範的普通話表達，避免方言詞彙

【語氣】像央視主持人或知識類 UP 主

【示例】
✅ 正確：「今天我們來聊聊這個話題」
❌ 錯誤：「今日我哋嚟傾下呢個話題」

✅ 正確：「這個東西真的很棒」
❌ 錯誤：「呢樣嘢真係好正」

✅ 正確：「為什麼會這樣呢？」
❌ 錯誤：「點解會咁嘅呢？」`,

    english: `Please write in natural, conversational English:

【Style】Professional YouTuber or TED speaker

【Transitions】"Now, let's talk about...", "Here's the thing...", "But wait..."

【Example】
✅ Good: "Today, we're diving into this fascinating topic"
❌ Bad: "We will discuss this topic"`,

    clone: `請使用繁體中文撰寫旁白（語音克隆模式）：

【語言風格】自然流暢的繁體中文表達

【語氣】專業講解員或知識類主播`,
  };

  // ✅ 修復：旁白字數要求（大幅縮短，語速要慢，留出充足停頓）
  // 8秒影片，約 2 字/秒，所以最多 16 個字
  const maxNarrationLength = 16;
  const narrationLength = language === 'english' 
    ? '12-16個英文單詞（約 2 words/秒，語速要慢）' 
    : '12-16個中文字（約 2 字/秒，語速要慢）';

  const systemPrompt = `你是一位專業的視頻腳本撰寫專家。你需要根據給定的視頻主題和故事大綱，為每個8秒的視頻片段生成：
1. 場景描述（description）：詳細描述這個片段的視覺畫面，用於 AI 生成視頻
2. 旁白文字（narration）：這個片段的旁白內容，需要 ${narrationLength}

${languagePrompt[language]}

⚠️⚠️⚠️ 重要規則 ⚠️⚠️⚠️

【旁白字數要求 - 極其重要】
- 每個片段的旁白只能有 ${narrationLength}
- ⚠️ 絕對不能超過 ${maxNarrationLength} 個字/單詞！超過會被強制截斷！
- 語速要慢，留出充足的停頓時間
- 不要說太多，簡潔有力最重要
- 每個字都要有價值，不要廢話

【旁白風格要求】
${language === 'cantonese' ? 
`粵語示例（15字）：「今日我哋嚟傾下，點解有人賺錢咁輕鬆？」✅
錯誤示例（30字）：「今日我哋嚟傾下一個好有趣嘅話題，就係點解有啲人可以輕鬆賺錢呢？」❌ 太長了！` 
: language === 'mandarin' ? 
`普通話示例（15字）：「今天我們來聊聊，為什麼有人賺錢輕鬆？」✅
錯誤示例（30字）：「今天我們來聊一個非常有趣的話題，為什麼有些人能輕鬆賺錢？」❌ 太長了！`
: `English Example (15 words): "Today, let's explore why some people make money easily." ✅
Wrong Example (30 words): "Today, we're diving into a fascinating question about why some people make money so easily." ❌ Too long!`}

【場景描述要求】
- 要具體、視覺化，便於 AI 理解並生成畫面
- 描述要包含：主體、動作、環境、光線、鏡頭角度
- 例如：「一位年輕的女性坐在現代化的辦公室裡，面帶微笑地看著電腦屏幕，陽光從落地窗灑進來，鏡頭從側面拍攝」

【連貫性要求】
- 旁白要連貫，每個片段之間要有邏輯銜接
- 使用過渡詞：「首先」「接下來」「那麼」「所以」「但是」「因此」
- 不要在旁白中包含「第X段」「片段X」等編號信息

【格式要求】
- 不要包含任何標點符號以外的特殊字符
- 旁白要自然流暢，適合朗讀

⚠️ 最後檢查清單：
✅ 每個片段的旁白是否只有 ${narrationLength}？絕對不能超過 ${maxNarrationLength}！
✅ 粵語是否使用了「係」「唔」「嘅」「咦」「啲」等詞彙？
✅ 普通話是否使用了標準書面語？
✅ 英文是否自然流暢？
✅ 旁白是否簡潔有力，而不是太長？`;

  const userPrompt = `視頻主題：${title}

故事大綱：
${outline}

請為這個視頻生成 ${segmentCount} 個片段的內容。每個片段8秒。

⚠️ 記住：每個片段的旁白只能有 ${narrationLength}，絕對不能超過 ${maxNarrationLength} 個字/單詞！語速要慢！

請以 JSON 格式返回，格式如下：
{
  "segments": [
    {
      "description": "場景描述（詳細的視覺畫面描述）...",
      "narration": "旁白文字（${narrationLength}）..."
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

    // 驗證並清理數據，✅ 新增：強制截斷過長的旁白
    const segments: GeneratedSegment[] = parsed.segments.map((seg: any, index: number) => {
      let narration = seg.narration || `片段 ${index + 1} 的旁白內容`;
      
      // 記錄原始旁白字數
      const originalWordCount = language === 'english' 
        ? narration.split(/\s+/).length 
        : narration.replace(/[，。！？、；：「」『』（）\s]/g, '').length;
      
      // ✅ 強制截斷過長的旁白
      if (originalWordCount > maxNarrationLength) {
        console.log(`[generateSegments] ⚠️ 片段 ${index + 1} 旁白過長 (${originalWordCount} ${language === 'english' ? 'words' : '字'})，正在截斷...`);
        narration = truncateNarration(narration, language, maxNarrationLength);
      }
      
      // 記錄最終旁白字數
      const finalWordCount = language === 'english' 
        ? narration.split(/\s+/).length 
        : narration.replace(/[，。！？、；：「」『』（）\s]/g, '').length;
      console.log(`[generateSegments] 片段 ${index + 1} 最終旁白字數: ${finalWordCount} ${language === 'english' ? 'words' : '字'}`);
      
      return {
        description: seg.description || `片段 ${index + 1} 的場景描述`,
        narration: narration,
      };
    });

    // 確保返回正確數量的片段
    while (segments.length < segmentCount) {
      const lastIndex = segments.length;
      segments.push({
        description: `延續上一個場景，展示更多細節`,
        narration: language === 'cantonese' 
          ? `繼續呢個故事，深入了解下。`
          : language === 'mandarin'
          ? `繼續這個故事，深入了解。`
          : `Let's continue exploring.`,
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
