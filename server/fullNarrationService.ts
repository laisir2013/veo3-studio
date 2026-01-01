/**
 * 完整旁白 TTS 服務
 * 
 * 功能：
 * 1. 一次過生成所有片段的旁白音頻
 * 2. 使用 Whisper API 分析音頻獲取每句話的時間戳
 * 3. 根據時間戳切割音頻，分配給每個片段
 */

import { generateSpeechWithKreado } from "./kreadoTTS";
import { VoiceLanguage } from "./videoConfig";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
// Node.js 18+ 內置 fetch，不需要 node-fetch
import OpenAI from "openai";

const execAsync = promisify(exec);

// 臨時文件目錄
const TEMP_DIR = "/tmp/narration";

// 確保臨時目錄存在
async function ensureTempDir(): Promise<void> {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
}

// 清理臨時文件
async function cleanupTempFiles(files: string[]): Promise<void> {
  for (const file of files) {
    try {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    } catch (e) {
      console.warn(`[FullNarration] 清理臨時文件失敗: ${file}`, e);
    }
  }
}

/**
 * 片段旁白信息
 */
export interface SegmentNarration {
  segmentId: number;
  text: string;
  startTime?: number;  // 秒
  endTime?: number;    // 秒
  audioUrl?: string;   // 切割後的音頻 URL
}

/**
 * 完整旁白生成結果
 */
export interface FullNarrationResult {
  fullAudioUrl: string;           // 完整音頻 URL
  fullAudioDuration: number;      // 完整音頻時長（秒）
  segments: SegmentNarration[];   // 每個片段的時間戳和音頻
  success: boolean;
  error?: string;
}

/**
 * 合併所有片段的旁白文字
 */
function combineNarrationTexts(segments: SegmentNarration[]): string {
  // 使用句號或逗號分隔，確保 TTS 有適當的停頓
  return segments
    .map(seg => seg.text.trim())
    .filter(text => text.length > 0)
    .join('。');
}

/**
 * 下載音頻文件到本地
 */
async function downloadAudio(url: string, localPath: string): Promise<void> {
  console.log(`[FullNarration] 下載音頻: ${url.substring(0, 60)}...`);
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`下載音頻失敗: ${response.status}`);
  }
  
  // Node.js 內置 fetch 使用 arrayBuffer() 而不是 buffer()
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  fs.writeFileSync(localPath, buffer);
  
  console.log(`[FullNarration] 音頻已下載: ${localPath} (${buffer.length} bytes)`);
}

/**
 * 獲取音頻時長
 */
async function getAudioDuration(audioPath: string): Promise<number> {
  const { stdout } = await execAsync(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`
  );
  return parseFloat(stdout.trim());
}

/**
 * 使用 Whisper API 獲取音頻的時間戳
 */
async function getTimestampsWithWhisper(
  audioPath: string,
  expectedTexts: string[]
): Promise<{ text: string; start: number; end: number }[]> {
  console.log(`[FullNarration] 使用 Whisper 分析音頻時間戳...`);
  
  // 使用 VectorEngine API 端點（支持 Whisper）
  const openai = new OpenAI({
    apiKey: process.env.VECTOR_ENGINE_API_KEY || process.env.OPENAI_API_KEY,
    baseURL: process.env.VECTOR_ENGINE_BASE_URL || "https://api.vectorengine.ai/v1",
  });
  
  // 讀取音頻文件
  const audioFile = fs.createReadStream(audioPath);
  
  try {
    // 使用 Whisper API 獲取帶時間戳的轉錄
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-1",
      response_format: "verbose_json",
      timestamp_granularities: ["segment"],
    });
    
    console.log(`[FullNarration] Whisper 轉錄完成，共 ${(transcription as any).segments?.length || 0} 個片段`);
    
    // 解析時間戳
    const whisperSegments = (transcription as any).segments || [];
    const timestamps: { text: string; start: number; end: number }[] = [];
    
    // 嘗試將 Whisper 片段與預期文字對齊
    let currentExpectedIndex = 0;
    let accumulatedText = "";
    let segmentStart = 0;
    
    for (const wseg of whisperSegments) {
      if (currentExpectedIndex >= expectedTexts.length) break;
      
      const expectedText = expectedTexts[currentExpectedIndex];
      accumulatedText += wseg.text;
      
      // 檢查是否已經累積了足夠的文字來匹配當前預期片段
      // 使用模糊匹配：如果累積文字包含預期文字的大部分內容
      const similarity = calculateSimilarity(accumulatedText, expectedText);
      
      if (similarity > 0.6 || accumulatedText.length >= expectedText.length * 0.8) {
        timestamps.push({
          text: expectedText,
          start: segmentStart,
          end: wseg.end,
        });
        
        console.log(`[FullNarration] 片段 ${currentExpectedIndex + 1}: ${segmentStart.toFixed(2)}s - ${wseg.end.toFixed(2)}s`);
        
        currentExpectedIndex++;
        accumulatedText = "";
        segmentStart = wseg.end;
      }
    }
    
    // 如果還有未匹配的片段，平均分配剩餘時間
    if (currentExpectedIndex < expectedTexts.length) {
      const lastEnd = timestamps.length > 0 ? timestamps[timestamps.length - 1].end : 0;
      const totalDuration = await getAudioDuration(audioPath);
      const remainingDuration = totalDuration - lastEnd;
      const remainingSegments = expectedTexts.length - currentExpectedIndex;
      const avgDuration = remainingDuration / remainingSegments;
      
      for (let i = currentExpectedIndex; i < expectedTexts.length; i++) {
        const start = lastEnd + (i - currentExpectedIndex) * avgDuration;
        const end = start + avgDuration;
        timestamps.push({
          text: expectedTexts[i],
          start,
          end,
        });
        console.log(`[FullNarration] 片段 ${i + 1} (估算): ${start.toFixed(2)}s - ${end.toFixed(2)}s`);
      }
    }
    
    return timestamps;
    
  } catch (error) {
    console.error(`[FullNarration] Whisper 分析失敗:`, error);
    throw error;
  }
}

/**
 * 計算兩個字符串的相似度（簡單版本）
 */
function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.replace(/\s+/g, '').toLowerCase();
  const s2 = str2.replace(/\s+/g, '').toLowerCase();
  
  if (s1.length === 0 || s2.length === 0) return 0;
  
  let matches = 0;
  const shorter = s1.length < s2.length ? s1 : s2;
  const longer = s1.length < s2.length ? s2 : s1;
  
  for (const char of shorter) {
    if (longer.includes(char)) {
      matches++;
    }
  }
  
  return matches / shorter.length;
}

/**
 * 使用 FFmpeg 切割音頻
 */
async function splitAudio(
  inputPath: string,
  outputPath: string,
  startTime: number,
  endTime: number
): Promise<void> {
  const duration = endTime - startTime;
  
  const cmd = `ffmpeg -y -i "${inputPath}" -ss ${startTime} -t ${duration} -c:a libmp3lame -q:a 2 "${outputPath}"`;
  
  console.log(`[FullNarration] 切割音頻: ${startTime.toFixed(2)}s - ${endTime.toFixed(2)}s`);
  
  await execAsync(cmd);
}

/**
 * 上傳音頻到存儲服務
 */
async function uploadAudio(localPath: string, filename: string): Promise<string> {
  // 使用現有的存儲服務
  const { storagePut } = await import("./storage");
  
  const audioBuffer = fs.readFileSync(localPath);
  const key = `narration/${Date.now()}_${filename}`;
  
  const result = await storagePut(key, audioBuffer, "audio/mpeg");
  
  console.log(`[FullNarration] 音頻已上傳: ${result.url.substring(0, 60)}...`);
  
  return result.url;
}

/**
 * 簡單的時間分配方案（備用）
 * 根據文字長度按比例分配時間
 */
function allocateTimeByTextLength(
  segments: SegmentNarration[],
  totalDuration: number
): SegmentNarration[] {
  const totalChars = segments.reduce((sum, seg) => sum + seg.text.length, 0);
  
  let currentTime = 0;
  
  return segments.map((seg, index) => {
    const proportion = seg.text.length / totalChars;
    const duration = totalDuration * proportion;
    const startTime = currentTime;
    const endTime = currentTime + duration;
    
    currentTime = endTime;
    
    console.log(`[FullNarration] 片段 ${seg.segmentId} 時間分配: ${startTime.toFixed(2)}s - ${endTime.toFixed(2)}s (${seg.text.length} 字)`);
    
    return {
      ...seg,
      startTime,
      endTime,
    };
  });
}

/**
 * 主函數：生成完整旁白並分割
 */
export async function generateFullNarration(
  segments: SegmentNarration[],
  voiceActorId: string,
  language: VoiceLanguage,
  useWhisper: boolean = true
): Promise<FullNarrationResult> {
  console.log(`[FullNarration] ========== 開始生成完整旁白 ==========`);
  console.log(`[FullNarration] 片段數量: ${segments.length}`);
  console.log(`[FullNarration] 配音員: ${voiceActorId}`);
  console.log(`[FullNarration] 語言: ${language}`);
  console.log(`[FullNarration] 使用 Whisper: ${useWhisper}`);
  
  await ensureTempDir();
  const tempFiles: string[] = [];
  
  try {
    // 1. 合併所有旁白文字
    const fullText = combineNarrationTexts(segments);
    console.log(`[FullNarration] 完整旁白文字 (${fullText.length} 字): ${fullText.substring(0, 100)}...`);
    
    if (fullText.length === 0) {
      throw new Error("旁白文字為空");
    }
    
    // 2. 一次過生成完整音頻
    console.log(`[FullNarration] 調用 TTS 生成完整音頻...`);
    const ttsResult = await generateSpeechWithKreado(fullText, voiceActorId, language);
    
    if (!ttsResult.audioUrl) {
      throw new Error("TTS 生成失敗：無音頻 URL");
    }
    
    console.log(`[FullNarration] ✅ 完整音頻生成成功: ${ttsResult.audioUrl.substring(0, 60)}...`);
    console.log(`[FullNarration] API 返回時長: ${ttsResult.duration}秒`);
    
    // 3. 下載音頻到本地
    const localAudioPath = path.join(TEMP_DIR, `full_${Date.now()}.mp3`);
    tempFiles.push(localAudioPath);
    await downloadAudio(ttsResult.audioUrl, localAudioPath);
    
    // 4. 獲取實際音頻時長
    const actualDuration = await getAudioDuration(localAudioPath);
    console.log(`[FullNarration] 實際音頻時長: ${actualDuration.toFixed(2)}秒`);
    
    // 5. 獲取時間戳
    let segmentsWithTime: SegmentNarration[];
    
    if (useWhisper && (process.env.VECTOR_ENGINE_API_KEY || process.env.OPENAI_API_KEY)) {
      try {
        // 使用 Whisper 獲取精確時間戳
        const timestamps = await getTimestampsWithWhisper(
          localAudioPath,
          segments.map(s => s.text)
        );
        
        segmentsWithTime = segments.map((seg, index) => ({
          ...seg,
          startTime: timestamps[index]?.start || 0,
          endTime: timestamps[index]?.end || actualDuration,
        }));
      } catch (whisperError) {
        console.warn(`[FullNarration] Whisper 失敗，使用文字長度分配:`, whisperError);
        segmentsWithTime = allocateTimeByTextLength(segments, actualDuration);
      }
    } else {
      // 使用文字長度按比例分配時間
      console.log(`[FullNarration] 使用文字長度分配時間戳`);
      segmentsWithTime = allocateTimeByTextLength(segments, actualDuration);
    }
    
    // 6. 切割音頻並上傳
    console.log(`[FullNarration] 開始切割音頻...`);
    
    for (let i = 0; i < segmentsWithTime.length; i++) {
      const seg = segmentsWithTime[i];
      const outputPath = path.join(TEMP_DIR, `segment_${seg.segmentId}_${Date.now()}.mp3`);
      tempFiles.push(outputPath);
      
      await splitAudio(localAudioPath, outputPath, seg.startTime!, seg.endTime!);
      
      // 上傳切割後的音頻
      const audioUrl = await uploadAudio(outputPath, `segment_${seg.segmentId}.mp3`);
      segmentsWithTime[i].audioUrl = audioUrl;
      
      console.log(`[FullNarration] ✅ 片段 ${seg.segmentId} 音頻已上傳`);
    }
    
    console.log(`[FullNarration] ========== 完整旁白生成完成 ==========`);
    
    return {
      fullAudioUrl: ttsResult.audioUrl,
      fullAudioDuration: actualDuration,
      segments: segmentsWithTime,
      success: true,
    };
    
  } catch (error) {
    console.error(`[FullNarration] ❌ 生成失敗:`, error);
    
    return {
      fullAudioUrl: "",
      fullAudioDuration: 0,
      segments: segments,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
    
  } finally {
    // 清理臨時文件
    await cleanupTempFiles(tempFiles);
  }
}

/**
 * 簡化版本：只生成完整音頻，不切割
 * 適用於需要完整音頻的場景
 */
export async function generateFullAudioOnly(
  segments: SegmentNarration[],
  voiceActorId: string,
  language: VoiceLanguage
): Promise<{ audioUrl: string; duration: number }> {
  console.log(`[FullNarration] 生成完整音頻（不切割）...`);
  
  const fullText = combineNarrationTexts(segments);
  
  if (fullText.length === 0) {
    throw new Error("旁白文字為空");
  }
  
  const ttsResult = await generateSpeechWithKreado(fullText, voiceActorId, language);
  
  if (!ttsResult.audioUrl) {
    throw new Error("TTS 生成失敗");
  }
  
  console.log(`[FullNarration] ✅ 完整音頻: ${ttsResult.audioUrl}`);
  console.log(`[FullNarration] 時長: ${ttsResult.duration}秒`);
  
  return {
    audioUrl: ttsResult.audioUrl,
    duration: ttsResult.duration || 0,
  };
}
