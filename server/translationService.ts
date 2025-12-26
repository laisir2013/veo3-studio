import { getNextApiKey } from "./videoConfig";
import { API_ENDPOINTS } from "./videoConfig";

/**
 * 將影片描述翻譯為英文
 * @param text 原始文本
 * @param sourceLanguage 源語言 ('cantonese', 'mandarin', 'english')
 * @returns 英文翻譯
 */
export async function translateToEnglish(
  text: string,
  sourceLanguage: "cantonese" | "mandarin" | "english" = "mandarin"
): Promise<string> {
  // 如果已經是英文，直接返回
  if (sourceLanguage === "english") {
    return text;
  }

  // 如果文本為空，返回空字符串
  if (!text || text.trim().length === 0) {
    return "";
  }

  const apiKey = getNextApiKey();

  const systemPrompt = `你是一個專業的翻譯助手。請將用戶提供的${
    sourceLanguage === "cantonese" ? "粵語" : "中文"
  }文本翻譯為英文。

要求：
- 翻譯要準確、自然、流暢
- 保留原文的語氣和風格
- 如果是技術術語，保留英文原文
- 只返回翻譯結果，不要添加任何其他內容`;

  const userPrompt = `請將以下文本翻譯為英文：

${text}`;

  try {
    const response = await fetch(`${API_ENDPOINTS.vectorEngine}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`翻譯 API 調用失敗: ${response.status} - ${errorText}`);
      return text; // 失敗時返回原文
    }

    const data = await response.json();
    const translatedText = data.choices[0]?.message?.content?.trim();

    if (!translatedText) {
      console.warn("翻譯結果為空");
      return text;
    }

    return translatedText;
  } catch (error) {
    console.error("翻譯過程中出錯:", error);
    return text; // 出錯時返回原文
  }
}

/**
 * 批量翻譯文本
 * @param texts 文本數組
 * @param sourceLanguage 源語言
 * @returns 翻譯結果數組
 */
export async function translateMultiple(
  texts: string[],
  sourceLanguage: "cantonese" | "mandarin" | "english" = "mandarin"
): Promise<string[]> {
  return Promise.all(texts.map((text) => translateToEnglish(text, sourceLanguage)));
}

/**
 * 翻譯影片描述和旁白
 * @param description 影片描述
 * @param narration 旁白文本
 * @param sourceLanguage 源語言
 * @returns 翻譯後的描述和旁白
 */
export async function translateVideoContent(
  description: string | undefined,
  narration: string | undefined,
  sourceLanguage: "cantonese" | "mandarin" | "english" = "mandarin"
): Promise<{
  descriptionEn: string;
  narrationEn: string;
}> {
  const [descriptionEn, narrationEn] = await Promise.all([
    description ? translateToEnglish(description, sourceLanguage) : "",
    narration ? translateToEnglish(narration, sourceLanguage) : "",
  ]);

  return {
    descriptionEn,
    narrationEn,
  };
}
