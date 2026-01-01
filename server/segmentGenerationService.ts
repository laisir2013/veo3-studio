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
  fullNarration: string;  // 新增：完整旁白
  apiProvider?: string;
  apiProviderName?: string;
}

// 輔助函數：計算字數
function countWords(text: string, language: string): number {
  if (language === 'english') {
    return text.split(/\s+/).filter(w => w.length > 0).length;
  } else {
    // 中文按字數計算（排除標點符號）
    return text.replace(/[，。！？、；：「」『』（）\s\n]/g, '').length;
  }
}

export async function generateSegments(params: GenerateSegmentsParams): Promise<GenerateSegmentsResult> {
  const { title, outline, language, segmentCount } = params;

  // 語言風格設定
  const languageStyle = {
    cantonese: {
      name: '粵語',
      wordsPerSegment: '20-25個粵語字',
      totalWords: `${segmentCount * 22}個字左右`,
      style: `使用地道粵語口語，包含「係」「唔」「嘅」「咗」「啲」「嚟」「嗰」等粵語詞彙。語氣要像香港 YouTuber 講解咁自然。`,
      example: '今日我哋嚟傾下呢個話題，點解有啲人賺錢咁輕鬆呢？',
    },
    mandarin: {
      name: '普通話',
      wordsPerSegment: '20-25個中文字',
      totalWords: `${segmentCount * 22}個字左右`,
      style: `使用標準普通話，語氣像央視主持人或知識類 UP 主。`,
      example: '今天我們來聊聊這個話題，為什麼有些人賺錢看起來那麼輕鬆呢？',
    },
    english: {
      name: 'English',
      wordsPerSegment: '20-25 words',
      totalWords: `about ${segmentCount * 22} words`,
      style: `Natural, conversational English like a professional YouTuber or TED speaker.`,
      example: 'Today, let\'s explore a fascinating topic - why do some people seem to make money so effortlessly?',
    },
    clone: {
      name: '繁體中文',
      wordsPerSegment: '20-25個中文字',
      totalWords: `${segmentCount * 22}個字左右`,
      style: `自然流暢的繁體中文表達，專業講解員風格。`,
      example: '今天我們來聊聊這個話題，為什麼有些人賺錢看起來那麼輕鬆呢？',
    },
  };

  const langConfig = languageStyle[language];

  const systemPrompt = `你是一位專業的視頻腳本撰寫專家。你需要根據給定的視頻主題和故事大綱，生成：

1. **${segmentCount} 個場景描述**（description）：每個片段的視覺畫面，用於 AI 生成視頻
2. **一段完整連貫的旁白**（fullNarration）：整個視頻的旁白，約 ${langConfig.totalWords}

【語言風格】
${langConfig.style}

【重要規則】

📝 **旁白生成規則**：
- 生成一段完整、連貫、流暢的旁白
- 總字數約 ${langConfig.totalWords}
- 旁白內容要按照場景描述的順序來寫
- 每 ${langConfig.wordsPerSegment}（約 8 秒）的內容要對應一個場景
- 不需要在旁白中標記片段編號，保持自然流暢

📹 **場景描述規則**：
- 每個場景描述要具體、視覺化
- 包含：主體、動作、環境、光線、鏡頭角度
- 使用英文撰寫（AI 視頻生成效果更好）

【示例】
假設有 3 個片段：
- 片段1場景：年輕人看帳單發愁
- 片段2場景：翻開一本書
- 片段3場景：兩個人對比

對應的完整旁白（約 60-75 字）：
「${langConfig.example}其實答案就在這本書裡面。這本書講述了兩種完全不同的金錢觀念，一種讓你越來越窮，另一種讓你越來越富。」

注意：旁白是一段連貫的文字，但內容順序要對應場景順序。`;

  const userPrompt = `視頻主題：${title}

故事大綱：
${outline}

請為這個視頻生成 ${segmentCount} 個片段的內容。

⚠️ 重要：
1. 場景描述用英文
2. 旁白用${langConfig.name}，總共約 ${langConfig.totalWords}
3. 旁白要連貫流暢，但內容順序要對應場景順序
4. 每 ${langConfig.wordsPerSegment} 的旁白內容對應一個場景

請以 JSON 格式返回：
{
  "segments": [
    {
      "description": "英文場景描述...",
      "narration": "這個片段對應的旁白片段（約 ${langConfig.wordsPerSegment}）..."
    }
  ],
  "fullNarration": "完整的連貫旁白（約 ${langConfig.totalWords}）..."
}`;

  try {
    console.log(`[generateSegments] 開始生成 ${segmentCount} 個片段，語言: ${language}`);
    
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

    // 處理片段數據
    const segments: GeneratedSegment[] = parsed.segments.map((seg: any, index: number) => {
      return {
        description: seg.description || `Scene ${index + 1} description`,
        narration: seg.narration || '',
      };
    });

    // 確保返回正確數量的片段
    while (segments.length < segmentCount) {
      segments.push({
        description: `Continue the previous scene with more details`,
        narration: '',
      });
    }

    // 獲取完整旁白
    let fullNarration = parsed.fullNarration || '';
    
    // 如果沒有 fullNarration，則從各片段的 narration 組合
    if (!fullNarration) {
      fullNarration = segments.map(s => s.narration).filter(n => n).join('');
    }

    const totalWords = countWords(fullNarration, language);
    console.log(`[generateSegments] ✅ 生成完成，完整旁白字數: ${totalWords}`);
    console.log(`[generateSegments] 完整旁白預覽: ${fullNarration.substring(0, 100)}...`);

    return {
      segments: segments.slice(0, segmentCount),
      fullNarration,
      apiProvider: result.apiProvider,
      apiProviderName: result.apiProviderName,
    };
  } catch (error) {
    console.error("生成片段內容失敗:", error);
    throw error;
  }
}

// 保留舊的 truncateNarration 函數以保持向後兼容
export function truncateNarration(narration: string, language: string, maxLength: number = 26): string {
  if (language === 'english') {
    const words = narration.split(/\s+/);
    if (words.length <= maxLength) return narration;
    
    let truncatedWords = words.slice(0, maxLength);
    let lastPunctIndex = -1;
    for (let i = truncatedWords.length - 1; i >= Math.floor(maxLength * 0.6); i--) {
      if (/[.!?]/.test(truncatedWords[i])) {
        lastPunctIndex = i;
        break;
      }
    }
    
    if (lastPunctIndex !== -1) {
      truncatedWords = truncatedWords.slice(0, lastPunctIndex + 1);
    }
    
    let truncated = truncatedWords.join(' ');
    if (!/[.!?]$/.test(truncated)) {
      truncated = truncated.replace(/[,;:]$/, '') + '.';
    }
    return truncated;
  } else {
    const pureText = narration.replace(/[，。！？、；：「」『』（）\s]/g, '');
    if (pureText.length <= maxLength) return narration;
    
    let charCount = 0;
    let lastPunctIndex = -1;
    let truncateIndex = 0;
    
    for (let i = 0; i < narration.length; i++) {
      const char = narration[i];
      if (!/[，。！？、；：「」『』（）\s]/.test(char)) {
        charCount++;
      }
      
      if (/[，。！？、；：]/.test(char) && charCount >= Math.floor(maxLength * 0.5) && charCount <= maxLength) {
        lastPunctIndex = i;
      }
      
      if (charCount >= maxLength) {
        truncateIndex = (lastPunctIndex !== -1) ? lastPunctIndex + 1 : i + 1;
        break;
      }
    }
    
    let truncated = narration.slice(0, truncateIndex);
    if (!/[。！？]$/.test(truncated)) {
      truncated = truncated.replace(/[，、；：]$/, '') + '。';
    }
    return truncated;
  }
}
