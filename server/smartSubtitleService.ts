/**
 * 智能字幕服務
 * 使用 AI (Whisper) 識別語音時間，自動生成精確同步的字幕
 * 
 * 功能：
 * 1. 使用 Whisper API 獲取單詞級別的時間戳
 * 2. 智能分段（每 8-10 個字一段，按標點符號分割）
 * 3. 字幕與語音精確同步
 * 4. 支持 SRT 和 ASS 格式輸出
 */

import OpenAI from "openai";
import * as fs from "fs";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// ============================================
// 類型定義
// ============================================

export interface SubtitleSegment {
  id: number;
  text: string;
  startTime: number; // 秒
  endTime: number; // 秒
  duration: number; // 秒
}

export interface ProcessedSubtitles {
  segments: SubtitleSegment[];
  srtContent: string;
  assContent: string;
  totalDuration: number;
}

export interface WhisperWord {
  word: string;
  start: number;
  end: number;
}

export interface WhisperSegment {
  id: number;
  seek: number;
  start: number;
  end: number;
  text: string;
  tokens: number[];
  temperature: number;
  avg_logprob: number;
  compression_ratio: number;
  no_speech_prob: number;
}

export interface WhisperResponse {
  task: string;
  language: string;
  duration: number;
  text: string;
  words?: WhisperWord[];
  segments?: WhisperSegment[];
}

// ============================================
// 進度回調類型
// ============================================

export type ProgressCallback = (step: number, message: string) => void;

// 默認進度回調（只打印日誌）
const defaultProgressCallback: ProgressCallback = (step, message) => {
  console.log(`[SmartSubtitle] 步驟 ${step}: ${message}`);
};

// ============================================
// 主要功能函數
// ============================================

/**
 * 使用 AI 分析音頻，獲取精確的語音時間軸
 */
export async function analyzeAudioTimeline(
  audioPath: string,
  scriptSegments: string[],
  apiKey: string,
  onProgress: ProgressCallback = defaultProgressCallback
): Promise<number[]> {
  try {
    onProgress(10, "🎤 正在使用 AI 分析音頻時間軸...");
    
    // 使用 OpenAI Whisper API 獲取帶時間戳的轉錄
    const openai = new OpenAI({ 
      apiKey,
      baseURL: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"
    });
    
    // 讀取音頻文件
    const audioBuffer = fs.readFileSync(audioPath);
    const audioFile = new File([audioBuffer], path.basename(audioPath), { type: "audio/mpeg" });
    
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-1",
      response_format: "verbose_json",
      timestamp_granularities: ["word"] // ✅ 獲取單詞級別的時間戳
    }) as unknown as WhisperResponse;

    onProgress(10, "✅ AI 音頻分析完成，正在匹配字幕時間...");

    // ✅ 提取時間戳
    const wordTimestamps = transcription.words || [];
    const timestamps: number[] = [0]; // 第一段從 0 開始

    if (wordTimestamps.length === 0) {
      // 如果沒有單詞級時間戳，使用段落級時間戳
      if (transcription.segments && transcription.segments.length > 0) {
        console.log(`[SmartSubtitle] 使用段落級時間戳，共 ${transcription.segments.length} 段`);
        
        // 根據腳本段落數量均勻分配時間
        const totalDuration = transcription.duration || scriptSegments.length * 8;
        const segmentDuration = totalDuration / scriptSegments.length;
        
        for (let i = 1; i < scriptSegments.length; i++) {
          timestamps.push(i * segmentDuration);
        }
      } else {
        // 完全沒有時間戳，使用默認分配
        console.log(`[SmartSubtitle] 無時間戳數據，使用默認分配`);
        const defaultDuration = 8; // 每段 8 秒
        for (let i = 1; i < scriptSegments.length; i++) {
          timestamps.push(i * defaultDuration);
        }
      }
    } else {
      // 有單詞級時間戳，進行精確匹配
      console.log(`[SmartSubtitle] 使用單詞級時間戳，共 ${wordTimestamps.length} 個單詞`);
      
      let currentWordIndex = 0;
      let accumulatedText = "";

      for (let i = 0; i < scriptSegments.length - 1; i++) {
        const targetText = scriptSegments[i];
        const targetLength = targetText.replace(/\s/g, "").length;
        
        // 累積單詞直到匹配目標長度
        while (currentWordIndex < wordTimestamps.length) {
          const word = wordTimestamps[currentWordIndex];
          accumulatedText += word.word;
          currentWordIndex++;
          
          // 檢查是否已經匹配到目標段落
          const accumulatedLength = accumulatedText.replace(/\s/g, "").length;
          if (accumulatedLength >= targetLength * 0.8) {
            // 找到了匹配點，記錄下一段的開始時間
            if (currentWordIndex < wordTimestamps.length) {
              timestamps.push(wordTimestamps[currentWordIndex].start);
            }
            accumulatedText = "";
            break;
          }
        }
      }
    }

    console.log(`[SmartSubtitle] 時間戳分配: ${timestamps.map(t => t.toFixed(2)).join(", ")}`);
    return timestamps;
    
  } catch (error: any) {
    console.error(`[SmartSubtitle] AI 音頻分析失敗:`, error.message);
    
    // 返回默認時間戳
    const defaultTimestamps: number[] = [0];
    for (let i = 1; i < scriptSegments.length; i++) {
      defaultTimestamps.push(i * 8);
    }
    return defaultTimestamps;
  }
}

/**
 * 智能分割字幕（每 8-10 個字一段）
 */
export function splitSubtitlesIntelligently(
  text: string,
  minChars: number = 8,
  maxChars: number = 10
): string[] {
  const segments: string[] = [];
  let currentSegment = "";

  // 按標點符號分割
  const sentences = text.split(/([，。！？；、,\.!?;：:])/);

  for (let i = 0; i < sentences.length; i++) {
    const part = sentences[i];
    if (!part) continue;
    
    // 如果是標點符號，加到當前段落
    if (/^[，。！？；、,\.!?;：:]$/.test(part)) {
      currentSegment += part;
      continue;
    }
    
    // 如果當前段落加上新內容超過最大長度，先保存當前段落
    if (currentSegment.length + part.length > maxChars && currentSegment.length >= minChars) {
      segments.push(currentSegment.trim());
      currentSegment = part;
    } else if (currentSegment.length >= maxChars) {
      // 當前段落已經達到最大長度
      segments.push(currentSegment.trim());
      currentSegment = part;
    } else {
      currentSegment += part;
    }
    
    // 如果當前段落達到最小長度且以標點結尾，保存
    if (currentSegment.length >= minChars && /[，。！？；、,\.!?;：:]$/.test(currentSegment)) {
      segments.push(currentSegment.trim());
      currentSegment = "";
    }
  }

  // 處理剩餘內容
  if (currentSegment.trim()) {
    // 如果剩餘內容太長，繼續分割
    while (currentSegment.length > maxChars) {
      segments.push(currentSegment.substring(0, maxChars).trim());
      currentSegment = currentSegment.substring(maxChars);
    }
    if (currentSegment.trim()) {
      segments.push(currentSegment.trim());
    }
  }

  return segments.filter(s => s.length > 0);
}

/**
 * 處理字幕（AI 識別時間 + 智能分段）
 */
export async function processSubtitlesWithAI(
  scriptSegments: string[],
  audioPath: string,
  apiKey: string,
  onProgress: ProgressCallback = defaultProgressCallback
): Promise<ProcessedSubtitles> {
  onProgress(10, "📝 開始處理字幕...");

  // ✅ 步驟 1：使用 AI 分析音頻獲取精確時間
  const segmentTimestamps = await analyzeAudioTimeline(audioPath, scriptSegments, apiKey, onProgress);

  // ✅ 步驟 2：智能分割每段字幕（8-10 字）
  const allSubtitles: SubtitleSegment[] = [];
  let subtitleIndex = 1;
  let totalDuration = 0;

  for (let i = 0; i < scriptSegments.length; i++) {
    const segmentText = scriptSegments[i];
    const segmentStart = segmentTimestamps[i] || (i * 8);
    const segmentEnd = segmentTimestamps[i + 1] || ((i + 1) * 8);
    const segmentDuration = segmentEnd - segmentStart;

    onProgress(10, `📝 處理第 ${i + 1}/${scriptSegments.length} 段字幕\n  ⏱️ 時間：${segmentStart.toFixed(2)}s - ${segmentEnd.toFixed(2)}s\n  📄 內容：${segmentText.substring(0, 30)}...`);

    // 智能分割這段文字
    const splitTexts = splitSubtitlesIntelligently(segmentText, 8, 10);
    
    // 計算每個小段的時長
    const timePerSplit = segmentDuration / splitTexts.length;

    for (let j = 0; j < splitTexts.length; j++) {
      const startTime = segmentStart + (j * timePerSplit);
      const endTime = segmentStart + ((j + 1) * timePerSplit);
      
      allSubtitles.push({
        id: subtitleIndex++,
        text: splitTexts[j],
        startTime,
        endTime,
        duration: endTime - startTime
      });
    }

    totalDuration = Math.max(totalDuration, segmentEnd);
  }

  onProgress(10, `✅ 字幕處理完成！共生成 ${allSubtitles.length} 條字幕`);

  // ✅ 步驟 3：生成 SRT 和 ASS 格式
  const srtContent = generateSRT(allSubtitles);
  const assContent = generateASS(allSubtitles);

  return {
    segments: allSubtitles,
    srtContent,
    assContent,
    totalDuration
  };
}

/**
 * 生成 SRT 格式字幕
 */
export function generateSRT(subtitles: SubtitleSegment[]): string {
  let srt = "";

  for (let i = 0; i < subtitles.length; i++) {
    const sub = subtitles[i];
    const startTime = formatSRTTime(sub.startTime);
    const endTime = formatSRTTime(sub.endTime);
    
    srt += `${sub.id}\n`;
    srt += `${startTime} --> ${endTime}\n`;
    srt += `${sub.text}\n\n`;
  }

  return srt;
}

/**
 * 生成 ASS 格式字幕（支持更多樣式）
 */
export function generateASS(subtitles: SubtitleSegment[], options?: {
  fontName?: string;
  fontSize?: number;
  primaryColor?: string;
  outlineColor?: string;
  backColor?: string;
  marginV?: number;
}): string {
  const {
    fontName = "Noto Sans CJK TC",
    fontSize = 48,
    primaryColor = "&H00FFFFFF", // 白色
    outlineColor = "&H00000000", // 黑色描邊
    backColor = "&H80000000", // 半透明黑色背景
    marginV = 30
  } = options || {};

  let ass = `[Script Info]
Title: AI Generated Subtitles
ScriptType: v4.00+
WrapStyle: 0
PlayResX: 1920
PlayResY: 1080
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${fontSize},${primaryColor},&H000000FF,${outlineColor},${backColor},-1,0,0,0,100,100,0,0,1,2,1,2,10,10,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  for (const sub of subtitles) {
    const startTime = formatASSTime(sub.startTime);
    const endTime = formatASSTime(sub.endTime);
    ass += `Dialogue: 0,${startTime},${endTime},Default,,0,0,0,,${sub.text}\n`;
  }

  return ass;
}

/**
 * 格式化 SRT 時間 (00:00:00,000)
 */
function formatSRTTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

/**
 * 格式化 ASS 時間 (0:00:00.00)
 */
function formatASSTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const cs = Math.floor((seconds % 1) * 100);

  return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

/**
 * 使用 FFmpeg 將字幕嵌入視頻
 */
export async function embedSubtitlesInVideo(
  videoPath: string,
  subtitlePath: string,
  outputPath: string,
  onProgress: ProgressCallback = defaultProgressCallback
): Promise<string> {
  onProgress(11, "🎬 正在將字幕嵌入視頻...");

  // 確保字幕文件存在
  if (!fs.existsSync(subtitlePath)) {
    throw new Error(`字幕文件不存在: ${subtitlePath}`);
  }

  // 確保視頻文件存在
  if (!fs.existsSync(videoPath)) {
    throw new Error(`視頻文件不存在: ${videoPath}`);
  }

  // 構建 FFmpeg 命令
  // 使用 ass 濾鏡嵌入字幕（硬字幕）
  const escapedSubtitlePath = subtitlePath.replace(/:/g, "\\:").replace(/'/g, "\\'");
  const command = `ffmpeg -y -i "${videoPath}" -vf "ass='${escapedSubtitlePath}'" -c:a copy "${outputPath}"`;

  try {
    console.log(`[SmartSubtitle] 執行 FFmpeg 命令: ${command}`);
    const { stdout, stderr } = await execAsync(command, { timeout: 300000 }); // 5 分鐘超時
    
    if (stderr) {
      console.log(`[SmartSubtitle] FFmpeg stderr: ${stderr.substring(0, 500)}`);
    }
    
    // 驗證輸出文件
    if (fs.existsSync(outputPath)) {
      const stats = fs.statSync(outputPath);
      if (stats.size > 10000) {
        onProgress(11, "✅ 字幕嵌入完成！");
        return outputPath;
      }
    }
    
    throw new Error("輸出文件無效或太小");
  } catch (error: any) {
    console.error(`[SmartSubtitle] 字幕嵌入失敗:`, error.message);
    throw new Error(`字幕嵌入失敗: ${error.message}`);
  }
}

/**
 * 從文本直接生成字幕（不使用 AI 時間識別）
 * 適用於沒有音頻文件的情況
 */
export function generateSubtitlesFromText(
  scriptSegments: string[],
  segmentDuration: number = 8
): ProcessedSubtitles {
  const allSubtitles: SubtitleSegment[] = [];
  let subtitleIndex = 1;
  let totalDuration = 0;

  for (let i = 0; i < scriptSegments.length; i++) {
    const segmentText = scriptSegments[i];
    const segmentStart = i * segmentDuration;
    const segmentEnd = (i + 1) * segmentDuration;

    // 智能分割這段文字
    const splitTexts = splitSubtitlesIntelligently(segmentText, 8, 10);
    
    // 計算每個小段的時長
    const timePerSplit = segmentDuration / splitTexts.length;

    for (let j = 0; j < splitTexts.length; j++) {
      const startTime = segmentStart + (j * timePerSplit);
      const endTime = segmentStart + ((j + 1) * timePerSplit);
      
      allSubtitles.push({
        id: subtitleIndex++,
        text: splitTexts[j],
        startTime,
        endTime,
        duration: endTime - startTime
      });
    }

    totalDuration = segmentEnd;
  }

  const srtContent = generateSRT(allSubtitles);
  const assContent = generateASS(allSubtitles);

  return {
    segments: allSubtitles,
    srtContent,
    assContent,
    totalDuration
  };
}

/**
 * 保存字幕文件到磁盤
 */
export async function saveSubtitleFiles(
  subtitles: ProcessedSubtitles,
  outputDir: string,
  baseName: string
): Promise<{ srtPath: string; assPath: string }> {
  // 確保輸出目錄存在
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const srtPath = path.join(outputDir, `${baseName}.srt`);
  const assPath = path.join(outputDir, `${baseName}.ass`);

  fs.writeFileSync(srtPath, subtitles.srtContent, "utf-8");
  fs.writeFileSync(assPath, subtitles.assContent, "utf-8");

  console.log(`[SmartSubtitle] ✅ 字幕文件已保存:\n  📄 SRT: ${srtPath}\n  📄 ASS: ${assPath}`);

  return { srtPath, assPath };
}

/**
 * 完整的字幕處理流程
 * 包括：AI 時間識別 -> 智能分段 -> 生成字幕文件 -> 嵌入視頻
 */
export async function processAndEmbedSubtitles(
  scriptSegments: string[],
  audioPath: string,
  videoPath: string,
  outputVideoPath: string,
  apiKey: string,
  onProgress: ProgressCallback = defaultProgressCallback
): Promise<{
  success: boolean;
  videoUrl?: string;
  subtitles?: ProcessedSubtitles;
  srtPath?: string;
  assPath?: string;
  error?: string;
}> {
  try {
    // 步驟 1：處理字幕（AI 時間識別 + 智能分段）
    const subtitles = await processSubtitlesWithAI(scriptSegments, audioPath, apiKey, onProgress);

    // 步驟 2：保存字幕文件
    const outputDir = path.dirname(outputVideoPath);
    const baseName = path.basename(outputVideoPath, path.extname(outputVideoPath)) + "_subtitles";
    const { srtPath, assPath } = await saveSubtitleFiles(subtitles, outputDir, baseName);

    onProgress(10, `✅ 字幕文件已保存\n  📄 SRT: ${srtPath}\n  📄 ASS: ${assPath}`);

    // 步驟 3：將字幕嵌入視頻
    await embedSubtitlesInVideo(videoPath, assPath, outputVideoPath, onProgress);

    onProgress(12, "🎉 字幕處理完成！");

    return {
      success: true,
      videoUrl: outputVideoPath,
      subtitles,
      srtPath,
      assPath
    };
  } catch (error: any) {
    console.error(`[SmartSubtitle] 字幕處理失敗:`, error);
    return {
      success: false,
      error: error.message
    };
  }
}
