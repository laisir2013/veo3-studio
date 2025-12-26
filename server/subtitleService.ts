/**
 * AI 字幕生成服務
 * 支持從音頻或文本自動生成字幕
 */

import { fetchWithRetry } from "./videoService";
import { API_ENDPOINTS, getNextApiKey } from "./apiConfig";

export interface SubtitleSegment {
  id: number;
  startTime: number; // 毫秒
  endTime: number; // 毫秒
  text: string;
  confidence?: number; // 置信度 0-1
}

export interface SubtitleTrack {
  language: string;
  segments: SubtitleSegment[];
}

/**
 * 從音頻生成字幕（使用 Whisper API）
 */
export async function generateSubtitlesFromAudio(
  audioUrl: string,
  language: string = "cantonese"
): Promise<SubtitleTrack> {
  const apiKey = getNextApiKey();

  try {
    console.log(`[Subtitle] 開始從音頻生成字幕，語言: ${language}`);

    // 下載音頻文件
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      throw new Error(`無法下載音頻: ${audioResponse.status}`);
    }

    const audioBuffer = await audioResponse.arrayBuffer();

    // 調用 Whisper API 進行語音識別
    const formData = new FormData();
    formData.append("file", new Blob([audioBuffer], { type: "audio/mpeg" }), "audio.mp3");
    formData.append("model", "whisper-1");
    formData.append("language", mapLanguageToWhisper(language));
    formData.append("response_format", "verbose_json");

    const response = await fetchWithRetry(`${API_ENDPOINTS.vectorEngine}/v1/audio/transcriptions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Whisper API 調用失敗: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    // 將 Whisper 的輸出轉換為字幕格式
    const segments: SubtitleSegment[] = [];

    if (data.segments && Array.isArray(data.segments)) {
      data.segments.forEach((segment: any, index: number) => {
        segments.push({
          id: index + 1,
          startTime: Math.round(segment.start * 1000),
          endTime: Math.round(segment.end * 1000),
          text: segment.text.trim(),
          confidence: segment.confidence || 0.9,
        });
      });
    } else if (data.text) {
      // 如果沒有分段信息，將整個文本作為一個字幕
      segments.push({
        id: 1,
        startTime: 0,
        endTime: Math.round((data.duration || 10) * 1000),
        text: data.text.trim(),
        confidence: 0.9,
      });
    }

    console.log(`[Subtitle] 字幕生成完成，共 ${segments.length} 個字幕段`);

    return {
      language,
      segments,
    };
  } catch (error) {
    console.error(`[Subtitle] 字幕生成失敗:`, error);
    throw error;
  }
}

/**
 * 從文本和時間信息生成字幕
 */
export async function generateSubtitlesFromText(
  narrationSegments: Array<{ segmentId: number; text: string }>,
  segmentDuration: number = 8 // 每個片段的時長（秒）
): Promise<SubtitleTrack> {
  console.log(`[Subtitle] 從文本生成字幕，共 ${narrationSegments.length} 個片段`);

  const segments: SubtitleSegment[] = narrationSegments.map((segment, index) => {
    const startTime = index * segmentDuration * 1000;
    const endTime = (index + 1) * segmentDuration * 1000;

    return {
      id: segment.segmentId,
      startTime,
      endTime,
      text: segment.text,
      confidence: 1.0, // 文本生成的字幕置信度為 100%
    };
  });

  console.log(`[Subtitle] 字幕生成完成，共 ${segments.length} 個字幕段`);

  return {
    language: "cantonese",
    segments,
  };
}

/**
 * 將字幕轉換為 SRT 格式
 */
export function convertToSRT(subtitleTrack: SubtitleTrack): string {
  const lines: string[] = [];

  subtitleTrack.segments.forEach((segment) => {
    lines.push(segment.id.toString());
    lines.push(`${formatTime(segment.startTime)} --> ${formatTime(segment.endTime)}`);
    lines.push(segment.text);
    lines.push("");
  });

  return lines.join("\n");
}

/**
 * 將字幕轉換為 VTT 格式
 */
export function convertToVTT(subtitleTrack: SubtitleTrack): string {
  const lines: string[] = ["WEBVTT", ""];

  subtitleTrack.segments.forEach((segment) => {
    lines.push(`${formatTime(segment.startTime)} --> ${formatTime(segment.endTime)}`);
    lines.push(segment.text);
    lines.push("");
  });

  return lines.join("\n");
}

/**
 * 將字幕轉換為 JSON 格式
 */
export function convertToJSON(subtitleTrack: SubtitleTrack): string {
  return JSON.stringify(subtitleTrack, null, 2);
}

/**
 * 格式化時間（毫秒轉換為 HH:MM:SS,mmm 格式）
 */
function formatTime(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const ms = milliseconds % 1000;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

/**
 * 將語言代碼映射到 Whisper 支持的格式
 */
function mapLanguageToWhisper(language: string): string {
  const languageMap: Record<string, string> = {
    cantonese: "yue", // 粵語
    mandarin: "zh", // 普通話
    english: "en",
    chinese: "zh",
  };

  return languageMap[language.toLowerCase()] || language;
}

/**
 * 合併多個字幕軌道
 */
export function mergeSubtitleTracks(tracks: SubtitleTrack[]): SubtitleTrack {
  const mergedSegments: SubtitleSegment[] = [];
  let segmentId = 1;

  // 按時間順序合併所有字幕
  const allSegments = tracks.flatMap(track => track.segments);
  allSegments.sort((a, b) => a.startTime - b.startTime);

  allSegments.forEach((segment) => {
    mergedSegments.push({
      ...segment,
      id: segmentId++,
    });
  });

  return {
    language: tracks[0]?.language || "cantonese",
    segments: mergedSegments,
  };
}

/**
 * 調整字幕時間偏移
 */
export function offsetSubtitleTime(
  subtitleTrack: SubtitleTrack,
  offsetMs: number
): SubtitleTrack {
  return {
    language: subtitleTrack.language,
    segments: subtitleTrack.segments.map((segment) => ({
      ...segment,
      startTime: Math.max(0, segment.startTime + offsetMs),
      endTime: Math.max(0, segment.endTime + offsetMs),
    })),
  };
}
