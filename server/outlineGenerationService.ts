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
  
  console.log(`[generateOutline] ========== 開始生成大綱 ==========`);
  console.log(`[generateOutline] 主題: "${title}"`);
  console.log(`[generateOutline] 時長: ${duration} 分鐘 = ${totalSeconds} 秒`);
  console.log(`[generateOutline] 片段數: ${segmentCount}`);
  console.log(`[generateOutline] 語言: ${language}`);

  // ✅ 修復：強化語言風格差異，增加具體示例和字數要求
  const languagePrompt = {
    cantonese: `請使用地道粵語口語撰寫旁白：

【必須使用的粵語特有詞彙】
- 係（是）、唔（不）、嘅（的）、咗（了）、啲（些）、嚟（來）
- 嗰（那）、點解（為什麼）、咩（什麼）、邊度（哪裡）
- 好似（好像）、唔該（謝謝/請）、冇（沒有）、嘢（東西）
- 我哋（我們）、佢哋（他們）、你哋（你們）

【語氣要求】
- 要像香港 YouTuber 講解咁自然
- 例如：「今日我哋嚟傾下呢個話題」而唔係「今天我們來討論這個話題」
- 例如：「呢樣嘢真係好正」而唔係「這個東西真的很好」
- 例如：「點解會咁嘅呢？」而唔係「為什麼會這樣呢？」

【旁白字數】每個8秒片段需要 40-50 個中文字（粵語語速約 6-7 字/秒）`,

    mandarin: `請使用標準普通話撰寫旁白：

【語言風格】
- 使用規範的普通話表達，避免任何方言詞彙
- 語氣要像央視主持人、知識類 UP 主或 TED 演講者
- 使用「這個」「那個」「我們」「什麼」「為什麼」等標準詞彙

【表達方式】
- 例如：「今天我們來聊聊這個話題」而不是「今日我哋嚟傾下呢個話題」
- 例如：「這個東西真的很棒」而不是「呢樣嘢真係好正」
- 例如：「為什麼會這樣呢？」而不是「點解會咁嘅呢？」
- 使用過渡詞：「首先」「接下來」「那麼」「所以」「因此」

【旁白字數】每個8秒片段需要 40-50 個中文字（普通話語速約 6-7 字/秒）`,

    english: `Please write in natural, conversational English:

【Narration Style】
- Sound like a professional YouTuber or TED speaker
- Use engaging transitions: "Now, let's talk about...", "Here's the thing...", "But wait, there's more..."
- Natural and conversational, not robotic or formal

【Examples】
- Good: "Today, we're diving into this fascinating topic"
- Bad: "We will discuss this topic"
- Good: "Here's why this matters to you"
- Bad: "This is important"

【Word Count】Each 8-second segment needs 60-70 English words (speaking rate: 8-9 words/sec)`,

    clone: `請使用繁體中文撰寫旁白（語音克隆模式）：

【語言風格】
- 使用自然流暢的繁體中文表達
- 語氣要像專業講解員或知識類主播
- 可以混合使用書面語和口語，但要自然

【旁白字數】每個8秒片段需要 40-50 個中文字`,
  };

  // 根據時長選擇不同的提示詞策略
  let systemPrompt: string;
  let userPrompt: string;

  if (totalSeconds <= 30) {
    // ==================== 超短視頻（30秒以內）- 極簡模式 ====================
    console.log(`[generateOutline] 模式: 超短視頻（${totalSeconds}秒 ≤ 30秒）`);
    
    systemPrompt = `你是一位專業的短視頻腳本策劃專家。

⚠️⚠️⚠️ 極其重要的限制 ⚠️⚠️⚠️
這是一個只有 ${totalSeconds} 秒的超短視頻！
- 總時長：${totalSeconds} 秒
- 片段數量：${segmentCount} 個（每個 8 秒）
- 你必須嚴格遵守這個時長限制！
- 不要生成超過 ${segmentCount} 個內容點！

${languagePrompt[language]}

對於 ${totalSeconds} 秒的超短視頻，結構應該是：
- 直接切入主題（不需要冗長的開場）
- ${segmentCount} 個核心內容點
- 快速結束（不需要單獨的結尾部分）

輸出格式：
### 視頻大綱（${totalSeconds}秒）

#### 片段1（8秒）
- 場景描述：詳細的視覺畫面描述，包含主體、動作、環境、光線
- 旁白：40-50個中文字或60-70個英文單詞，像演講稿一樣豐富

#### 片段2（8秒）
- 場景描述：...
- 旁白：...

（最多 ${segmentCount} 個片段）

⚠️ 旁白示例：
${language === 'cantonese' ? 
`粵語示例（48字）：「今日我哋嚟傾下一個好有趣嘅話題，就係點解有啲人可以輕鬆賺錢，而有啲人就算好努力都好似冇乜進步？」✅
錯誤示例（20字）：「今日嚟傾下點解有人賺錢容易。」❌ 太簡短！` 
: language === 'mandarin' ? 
`普通話示例（48字）：「今天我們來聊一個非常有趣的話題，那就是為什麼有些人可以輕鬆賺錢，而有些人即使很努力也似乎沒什麼進步？」✅
錯誤示例（20字）：「今天來聊聊為什麼有人賺錢容易。」❌ 太簡短！`
: `English Example (65 words): "Today, we're diving into a fascinating topic that everyone's been asking about. Why is it that some people seem to make money effortlessly, while others work incredibly hard but don't see much progress? Well, it turns out there are three key factors at play here." ✅
Wrong Example (15 words): "Today we'll talk about why some people make money easily." ❌ Too short!`}`;

    userPrompt = `視頻主題：${title}

⚠️ 嚴格要求：
1. 這是一個只有 ${totalSeconds} 秒的超短視頻
2. 只能有 ${segmentCount} 個片段
3. 每個片段 8 秒
4. 每個片段的旁白需要 ${language === 'english' ? '60-70個英文單詞' : '40-50個中文字'}
5. 旁白要像演講稿一樣豐富，不要太簡短！

請生成一個適合 ${totalSeconds} 秒視頻的簡潔大綱。`;

  } else if (totalSeconds <= 60) {
    // ==================== 短視頻（30-60秒）- 簡化模式 ====================
    console.log(`[generateOutline] 模式: 短視頻（${totalSeconds}秒，30-60秒）`);
    
    systemPrompt = `你是一位專業的短視頻腳本策劃專家。

⚠️ 重要限制：
- 總時長：${totalSeconds} 秒
- 片段數量：${segmentCount} 個（每個 8 秒）
- 你必須嚴格遵守這個時長限制！

${languagePrompt[language]}

對於 ${totalSeconds} 秒的短視頻，結構應該是：
- 開場（1-2個片段）：快速引入主題
- 主體（${Math.max(1, segmentCount - 2)}個片段）：核心內容
- 結尾（1個片段）：簡短總結

輸出格式：
### 視頻大綱（${totalSeconds}秒）

#### 開場（約${Math.round(totalSeconds * 0.2)}秒）
- 場景描述：...
- 旁白：40-50個中文字或60-70個英文單詞

#### 主體（約${Math.round(totalSeconds * 0.6)}秒）
...

#### 結尾（約${Math.round(totalSeconds * 0.2)}秒）
...

⚠️ 每個片段的旁白必須有 ${language === 'english' ? '60-70個英文單詞' : '40-50個中文字'}，像演講稿一樣豐富！`;

    userPrompt = `視頻主題：${title}
視頻時長：${totalSeconds} 秒（${segmentCount} 個 8 秒片段）

⚠️ 記住：每個片段的旁白需要 ${language === 'english' ? '60-70個英文單詞' : '40-50個中文字'}！

請生成一個適合 ${totalSeconds} 秒視頻的簡潔大綱。
注意：不要生成超過 ${segmentCount} 個片段的內容！`;

  } else {
    // ==================== 標準視頻（1分鐘以上）- 完整模式 ====================
    console.log(`[generateOutline] 模式: 標準視頻（${totalSeconds}秒 > 60秒）`);
    
    const durationDisplay = `${duration.toFixed(1)} 分鐘（約 ${totalSeconds} 秒）`;
    
    systemPrompt = `你是一位專業的視頻腳本策劃專家。你需要根據給定的視頻主題，生成一個結構清晰、內容豐富的故事大綱。

${languagePrompt[language]}

視頻時長：${durationDisplay}
片段數量：${segmentCount} 個片段（每個片段約 8 秒）

大綱應該包含：
1. 開場（約佔總時長的10%）：引人入勝的開頭，吸引觀眾注意力
2. 發展（約佔總時長的50%）：主要內容展開，分成多個小節
3. 高潮（約佔總時長的25%）：最精彩的部分，核心信息傳達
4. 結尾（約佔總時長的15%）：總結回顧，呼籲行動

每個部分要有具體的內容描述，不要太籠統。

⚠️⚠️⚠️ 旁白字數要求 ⚠️⚠️⚠️
- 每個 8 秒片段的旁白需要 ${language === 'english' ? '60-70個英文單詞' : '40-50個中文字'}
- 旁白要像 YouTuber 講解、像演講稿一樣豐富有內容
- 不要太簡短，要填滿整個 8 秒的時間`;

    userPrompt = `視頻主題：${title}
視頻時長：${durationDisplay}
片段數量：${segmentCount} 個片段（每個片段約 8 秒）

⚠️ 記住：每個片段的旁白需要 ${language === 'english' ? '60-70個英文單詞' : '40-50個中文字'}，像演講稿一樣豐富！

請為這個視頻生成一個詳細的故事大綱。`;
  }

  console.log(`[generateOutline] System Prompt 長度: ${systemPrompt.length}`);
  console.log(`[generateOutline] User Prompt: ${userPrompt}`);

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
    console.log(`[generateOutline] 大綱預覽: ${content.substring(0, 200)}...`);

    return {
      outline: content.trim(),
      apiProvider: result.apiProvider,
      apiProviderName: result.apiProviderName,
    };
  } catch (error) {
    console.error("[generateOutline] 生成大綱失敗:", error);
    throw error;
  }
}
