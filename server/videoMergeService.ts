/**
 * 視頻合併服務 - 增強版（三層容錯機制）
 * 
 * 三層容錯架構：
 * 1. 雲端合併（VectorEngine API 輪換）
 * 2. 本地 FFmpeg 合併（標準化後再合併）
 * 3. 緊急模式（返回所有片段視頻，100% 保證有結果）
 * 
 * 🔧 修復：使用標準化轉碼後再合併，解決編碼參數不一致問題
 */

import { getNextApiKey, API_ENDPOINTS, RETRY_CONFIG } from "./videoConfig";
import { storagePut } from "./storage";
import { isR2Configured, uploadVideoToR2 } from "./r2Storage";

const VIDEO_API_BASE = API_ENDPOINTS.vectorEngine;

// 標準化視頻參數（統一規格）
const NORMALIZE_CONFIG = {
  width: 1280,
  height: 720,
  fps: 30,
  videoCodec: "libx264",
  audioCodec: "aac",
  audioBitrate: "192k",
  audioSampleRate: 48000,
  audioChannels: 2,
  preset: "veryfast",
  crf: 20,
  pixelFormat: "yuv420p",
};

// 背景音樂選項
// ✅ 修復：更新為有效的 SoundHelix 音樂 URL（免費、可直接訪問）
export const BGM_OPTIONS = {
  none: { name: "無背景音樂", url: null },
  cinematic: { name: "電影感", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3" },
  emotional: { name: "感人", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3" },
  upbeat: { name: "歡快", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3" },
  dramatic: { name: "戲劇性", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3" },
  peaceful: { name: "平靜", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3" },
} as const;

export type BgmType = keyof typeof BGM_OPTIONS;

// 字幕樣式選項
export const SUBTITLE_STYLES = {
  none: { name: "無字幕", enabled: false },
  bottom: { name: "底部字幕", position: "bottom", fontSize: 24, color: "white", bgColor: "black@0.5" },
  top: { name: "頂部字幕", position: "top", fontSize: 24, color: "white", bgColor: "black@0.5" },
  cinematic: { name: "電影字幕", position: "bottom", fontSize: 28, color: "white", bgColor: "transparent" },
} as const;

export type SubtitleStyle = keyof typeof SUBTITLE_STYLES;

export interface MergeOptions {
  videoUrls: string[];
  audioUrls?: string[];
  narrations?: string[];
  bgmType?: BgmType;
  subtitleStyle?: SubtitleStyle;
  outputFormat?: "mp4" | "webm";
  resolution?: "720p" | "1080p" | "4k";
  narrationVolume?: number;
  bgmVolume?: number;
  originalVolume?: number;
}

export interface MergeResult {
  success: boolean;
  videoUrl?: string;
  duration?: number;
  error?: string;
  mode?: "cloud" | "local" | "emergency";
  segmentUrls?: string[];
  message?: string;
}

/**
 * 防回歸 Guard：確保合併結果的語義一致性
 * - success=true → videoUrl 必須存在
 * - success=false → videoUrl 必須為 undefined，segmentUrls 必須存在
 */
function assertMergeResponse(r: MergeResult): void {
  if (r.success) {
    if (!r.videoUrl) {
      console.error("[MergeGuard] ⚠️ Invariant violated: success=true but videoUrl missing", r);
      throw new Error("Invariant violated: success=true but videoUrl missing");
    }
  } else {
    if (r.videoUrl) {
      console.error("[MergeGuard] ⚠️ Invariant violated: success=false but videoUrl is set", r);
      throw new Error("Invariant violated: success=false but videoUrl is set");
    }
    if (!r.segmentUrls || r.segmentUrls.length === 0) {
      console.warn("[MergeGuard] ⚠️ Warning: success=false but no segmentUrls provided", r);
    }
  }
}

// 合併統計
interface MergeStats {
  cloudAttempts: number;
  cloudSuccesses: number;
  localAttempts: number;
  localSuccesses: number;
  emergencyActivations: number;
}

const mergeStats: MergeStats = {
  cloudAttempts: 0,
  cloudSuccesses: 0,
  localAttempts: 0,
  localSuccesses: 0,
  emergencyActivations: 0,
};

// 睡眠函數
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 獲取合併統計信息
 */
export function getMergeStats(): MergeStats {
  return { ...mergeStats };
}

/**
 * 主要合併函數 - 三層容錯機制
 */
export async function mergeVideos(options: MergeOptions): Promise<MergeResult> {
  const {
    videoUrls,
    audioUrls = [],
    narrations = [],
    bgmType = "none",
    subtitleStyle = "none",
    outputFormat = "mp4",
    resolution = "1080p",
    narrationVolume = 80,
    bgmVolume = 30,
    originalVolume = 50,
  } = options;

  // ✅ 詳細日誌：記錄合併參數
  console.log(`[VideoMerge] 🎬 開始合併流程`, {
    videoCount: videoUrls.length,
    audioCount: audioUrls.filter(u => u && u.startsWith("http")).length,
    narrationCount: narrations.filter(n => n).length,
    bgmType,
    subtitleStyle,
    narrationVolume,
    bgmVolume,
    originalVolume,
    timestamp: new Date().toISOString(),
  });
  
  // ✅ 詳細日誌：打印每個音頻 URL
  console.log(`[VideoMerge] 🎤 音頻 URL 詳情:`);
  audioUrls.forEach((url, i) => {
    console.log(`  片段 ${i + 1}: ${url ? url.substring(0, 80) + '...' : '(空)'}`);
  });
  
  // ✅ 詳細日誌：打印每個旁白文字
  console.log(`[VideoMerge] 📝 旁白文字詳情:`);
  narrations.forEach((text, i) => {
    console.log(`  片段 ${i + 1}: ${text ? text.substring(0, 50) + '...' : '(空)'}`);
  });

  // 過濾有效的視頻 URL
  const validVideoUrls = videoUrls.filter(url => url && url.startsWith("http"));
  if (validVideoUrls.length === 0) {
    console.error(`[VideoMerge] ❌ 沒有有效的視頻 URL`);
    return { success: false, error: "沒有有效的視頻 URL" };
  }

  console.log(`[VideoMerge] ✅ 有效視頻數量: ${validVideoUrls.length}`);

  // 檢測圖片格式
  const imageExtensions = ["jpg", "jpeg", "png", "webp", "gif", "bmp"];
  const videoOnlyUrls = validVideoUrls.filter(url => {
    const ext = url.split("?")[0].split(".").pop()?.toLowerCase() || "";
    return !imageExtensions.includes(ext);
  });

  if (videoOnlyUrls.length === 0) {
    return { 
      success: false, 
      error: "所有輸入都是圖片格式，無法進行視頻合成。" 
    };
  }

  // 如果只有一個視頻且不需要處理，直接返回
  if (validVideoUrls.length === 1 && bgmType === "none" && subtitleStyle === "none") {
    console.log(`[VideoMerge] 只有一個視頻，直接返回`);
    const result: MergeResult = { success: true, videoUrl: validVideoUrls[0], mode: "cloud", duration: 8 };
    assertMergeResponse(result);
    return result;
  }

  // 第一層：雲端合併
  try {
    const cloudResult = await tryCloudMerge(validVideoUrls, audioUrls, narrations, bgmType, subtitleStyle, outputFormat, resolution, narrationVolume, bgmVolume, originalVolume);
    if (cloudResult.success) {
      console.log(`[VideoMerge] ✅ 雲端合併成功`);
      const result: MergeResult = { ...cloudResult, mode: "cloud" };
      assertMergeResponse(result);
      return result;
    }
    console.log(`[VideoMerge] ⚠️ 雲端合併失敗: ${cloudResult.error}`);
  } catch (error) {
    console.log(`[VideoMerge] ⚠️ 雲端合併異常:`, error);
  }

  // 第二層：本地 FFmpeg 合併（標準化後再合併）
  try {
    const localResult = await tryLocalFFmpegMerge(validVideoUrls, audioUrls, narrations, bgmType, subtitleStyle, outputFormat, resolution, narrationVolume, bgmVolume, originalVolume);
    if (localResult.success) {
      console.log(`[VideoMerge] ✅ 本地 FFmpeg 合併成功`);
      const result: MergeResult = { ...localResult, mode: "local" };
      assertMergeResponse(result);
      return result;
    }
    console.log(`[VideoMerge] ⚠️ 本地 FFmpeg 合併失敗: ${localResult.error}`);
  } catch (error) {
    console.log(`[VideoMerge] ⚠️ 本地 FFmpeg 合併異常:`, error);
  }

  // 第三層：緊急模式
  console.log(`[VideoMerge] 🚨 啟動緊急模式`);
  mergeStats.emergencyActivations++;
  const emergencyResult = emergencyMode(validVideoUrls, narrations);
  assertMergeResponse(emergencyResult);
  return emergencyResult;
}

/**
 * 第一層：雲端合併
 */
async function tryCloudMerge(
  videoUrls: string[],
  audioUrls: string[],
  narrations: string[],
  bgmType: BgmType,
  subtitleStyle: SubtitleStyle,
  outputFormat: string,
  resolution: string,
  narrationVolume: number,
  bgmVolume: number,
  originalVolume: number
): Promise<MergeResult> {
  mergeStats.cloudAttempts++;
  
  console.log(`[CloudMerge] 🌐 開始雲端合併`, {
    videoCount: videoUrls.length,
    audioCount: audioUrls.filter(u => u).length,
    apiBase: VIDEO_API_BASE,
  });
  
  const maxRetries = RETRY_CONFIG.maxRetries;
  let lastError = "";

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const apiKey = getNextApiKey();
      console.log(`[CloudMerge] 嘗試 ${attempt + 1}/${maxRetries}`);

      const mergeRequest = {
        videos: videoUrls.map((url, index) => ({
          url,
          audioUrl: audioUrls[index] || null,
          narration: narrations[index] || null,
        })),
        bgm: BGM_OPTIONS[bgmType].url,
        subtitle: SUBTITLE_STYLES[subtitleStyle],
        output: { format: outputFormat, resolution },
        audio: {
          narrationVolume: narrationVolume / 100,
          bgmVolume: bgmVolume / 100,
          originalVolume: originalVolume / 100,
        },
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 180000); // 3 分鐘超時

      const response = await fetch(`${VIDEO_API_BASE}/video/merge`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify(mergeRequest),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      console.log(`[CloudMerge] API 響應: ${response.status} ${response.statusText}`);

      if (response.ok) {
        const result = await response.json();
        if (result.url) {
          mergeStats.cloudSuccesses++;
          return { success: true, videoUrl: result.url, duration: result.duration };
        }
      }

      if (response.status === 429) {
        const delay = RETRY_CONFIG.retryDelay * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt);
        console.log(`[CloudMerge] 429 限流，等待 ${delay}ms`);
        await sleep(Math.min(delay, RETRY_CONFIG.maxDelay));
        continue;
      }

      const errorText = await response.text().catch(() => "");
      console.log(`[CloudMerge] 錯誤響應: ${errorText.substring(0, 200)}`);
      lastError = `API 返回 ${response.status}`;
    } catch (error: any) {
      lastError = error.message || "未知錯誤";
      console.log(`[CloudMerge] 錯誤: ${lastError}`);
    }

    if (attempt < maxRetries - 1) {
      await sleep(RETRY_CONFIG.retryDelay);
    }
  }

  return { success: false, error: lastError || "雲端合併失敗" };
}

/**
 * 第二層：本地 FFmpeg 合併（標準化後再合併）
 */
async function tryLocalFFmpegMerge(
  videoUrls: string[],
  audioUrls: string[],
  narrations: string[],
  bgmType: BgmType,
  subtitleStyle: SubtitleStyle,
  outputFormat: string,
  resolution: string,
  narrationVolume: number,
  bgmVolume: number,
  originalVolume: number
): Promise<MergeResult> {
  mergeStats.localAttempts++;
  
  console.log(`[LocalFFmpeg] 🎬 開始本地 FFmpeg 合併（標準化模式）`, {
    videoCount: videoUrls.length,
    audioCount: audioUrls.filter(u => u).length,
  });

  const { exec } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(exec);
  const fs = await import("fs");

  // 檢查 FFmpeg
  const ffmpegAvailable = await checkFFmpegAvailable();
  if (!ffmpegAvailable) {
    return { success: false, error: "FFmpeg 不可用" };
  }

  // 創建臨時目錄
  const tempDir = `/tmp/veo3-merge-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  
  try {
    fs.mkdirSync(tempDir, { recursive: true });
    console.log(`[LocalFFmpeg] 📁 臨時目錄: ${tempDir}`);
  } catch (error: any) {
    console.error(`[LocalFFmpeg] ❌ 無法創建臨時目錄:`, error.message);
    return { success: false, error: "無法創建臨時目錄" };
  }

  try {
    // 步驟 1：下載所有視頻
    console.log(`[LocalFFmpeg] 📥 下載 ${videoUrls.length} 個視頻片段...`);
    const downloadedPaths: string[] = [];
    const downloadedAudioPaths: string[] = [];

    for (let i = 0; i < videoUrls.length; i++) {
      const localPath = `${tempDir}/segment_${i}.mp4`;
      console.log(`[LocalFFmpeg] 下載視頻 ${i + 1}/${videoUrls.length}...`);
      
      const downloaded = await downloadVideoWithValidation(videoUrls[i], localPath, tempDir);
      if (downloaded) {
        downloadedPaths.push(localPath);
      } else {
        console.warn(`[LocalFFmpeg] ⚠️ 視頻 ${i + 1} 下載失敗，跳過`);
      }

      // ✅ 下載對應的音頻
      const audioUrl = audioUrls[i];
      if (audioUrl && audioUrl.startsWith("http")) {
        const audioPath = `${tempDir}/audio_${i}.mp3`;
        console.log(`[LocalFFmpeg] 🎤 下載音頻 ${i + 1}: ${audioUrl.substring(0, 60)}...`);
        const audioDownloaded = await downloadVideoWithValidation(audioUrl, audioPath, tempDir);
        if (audioDownloaded) {
          console.log(`[LocalFFmpeg] ✅ 音頻 ${i + 1} 下載成功: ${audioPath}`);
          downloadedAudioPaths.push(audioPath);
        } else {
          console.warn(`[LocalFFmpeg] ⚠️ 音頻 ${i + 1} 下載失敗`);
          downloadedAudioPaths.push("");
        }
      } else {
        console.log(`[LocalFFmpeg] ℹ️ 片段 ${i + 1} 無音頻 URL`);
        downloadedAudioPaths.push("");
      }
    }

    if (downloadedPaths.length === 0) {
      return { success: false, error: "無法下載任何視頻文件" };
    }

    console.log(`[LocalFFmpeg] ✅ 成功下載 ${downloadedPaths.length}/${videoUrls.length} 個視頻`);

    // 步驟 2：標準化每個視頻片段
    console.log(`[LocalFFmpeg] 🔄 標準化視頻片段...`);
    const normalizedPaths: string[] = [];

    for (let i = 0; i < downloadedPaths.length; i++) {
      const inputPath = downloadedPaths[i];
      const normalizedPath = `${tempDir}/normalized_${i}.mp4`;
      const audioPath = downloadedAudioPaths[i];
      
      console.log(`[LocalFFmpeg] 標準化視頻 ${i + 1}/${downloadedPaths.length}...`);
      
      // ✅ 傳遞旁白文字和字幕樣式以支持字幕燒錄
      const narrationText = narrations[i] || "";
      const normalized = await normalizeVideo(inputPath, normalizedPath, audioPath, {
        narrationVolume,
        originalVolume,
        narration: narrationText,
        subtitleStyle,
      });
      
      if (normalized) {
        normalizedPaths.push(normalizedPath);
      } else {
        console.warn(`[LocalFFmpeg] ⚠️ 視頻 ${i + 1} 標準化失敗，跳過`);
      }
    }

    if (normalizedPaths.length === 0) {
      return { success: false, error: "無法標準化任何視頻" };
    }

    console.log(`[LocalFFmpeg] ✅ 成功標準化 ${normalizedPaths.length} 個視頻`);

    // ✅ 新增：步驟 2.5 - 下載背景音樂
    console.log(`[LocalFFmpeg] 🎵 步驟 2.5: 下載背景音樂`);
    let bgmPath = "";
    if (bgmType !== "none" && BGM_OPTIONS[bgmType]?.url) {
      bgmPath = `${tempDir}/bgm.mp3`;
      console.log(`[LocalFFmpeg] 正在下載背景音樂: ${BGM_OPTIONS[bgmType].name}`);
      console.log(`[LocalFFmpeg] 背景音樂 URL: ${BGM_OPTIONS[bgmType].url}`);
      
      const bgmDownloaded = await downloadVideoWithValidation(
        BGM_OPTIONS[bgmType].url!,
        bgmPath,
        tempDir
      );
      
      if (!bgmDownloaded || !fs.existsSync(bgmPath)) {
        console.warn(`[LocalFFmpeg] ⚠️ 背景音樂下載失敗，將不使用背景音樂`);
        bgmPath = "";
      } else {
        const bgmStats = fs.statSync(bgmPath);
        console.log(`[LocalFFmpeg] ✅ 背景音樂已下載: ${(bgmStats.size / 1024).toFixed(2)} KB`);
      }
    } else {
      console.log(`[LocalFFmpeg] ℹ️ 不使用背景音樂 (bgmType: ${bgmType})`);
    }

    // 步驟 3：合併標準化後的視頻
    console.log(`[LocalFFmpeg] 🎬 合併視頻...`);
    const outputPath = `${tempDir}/merged_output.mp4`;
    
    // 創建 concat 列表
    const listPath = `${tempDir}/concat_list.txt`;
    const listContent = normalizedPaths.map(p => `file '${p}'`).join("\n");
    fs.writeFileSync(listPath, listContent);
    console.log(`[LocalFFmpeg] 📝 Concat 列表:\n${listContent}`);

    // ✅ 修復：根據是否有背景音樂選擇不同的合併命令
    let mergeCmd: string;
    
    if (bgmPath && fs.existsSync(bgmPath)) {
      // ========== 有背景音樂：混合視頻音軌和背景音樂 ==========
      console.log(`[LocalFFmpeg] 🎵 合併模式: 視頻音軌 + 背景音樂 (音量: ${bgmVolume}%)`);
      
      const bgmVol = bgmVolume / 100;
      
      mergeCmd = [
        "ffmpeg", "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", `"${listPath}"`,              // [0] 合併後的視頻
        "-stream_loop", "-1",                // 循環播放背景音樂
        "-i", `"${bgmPath}"`,                // [1] 背景音樂
        "-filter_complex",
        // 混合視頻原音軌和背景音樂
        `"[0:a]volume=1.0[a0];[1:a]volume=${bgmVol},apad[a1];[a0][a1]amix=inputs=2:duration=first:dropout_transition=2[aout]"`,
        "-map", "0:v",                       // 映射視頻
        "-map", '"[aout]"',                  // 映射混合後的音頻
        "-c:v", NORMALIZE_CONFIG.videoCodec,
        "-preset", NORMALIZE_CONFIG.preset,
        "-crf", String(NORMALIZE_CONFIG.crf),
        "-pix_fmt", NORMALIZE_CONFIG.pixelFormat,
        "-r", String(NORMALIZE_CONFIG.fps),
        "-c:a", NORMALIZE_CONFIG.audioCodec,
        "-b:a", NORMALIZE_CONFIG.audioBitrate,
        "-ar", String(NORMALIZE_CONFIG.audioSampleRate),
        "-ac", String(NORMALIZE_CONFIG.audioChannels),
        "-movflags", "+faststart",
        "-shortest",                         // 以最短流為準
        `"${outputPath}"`
      ].join(" ");
      
    } else {
      // ========== 無背景音樂：原有邏輯 ==========
      console.log(`[LocalFFmpeg] 📹 合併模式: 僅視頻音軌`);
      
      mergeCmd = [
        "ffmpeg", "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", `"${listPath}"`,
        "-c:v", NORMALIZE_CONFIG.videoCodec,
        "-preset", NORMALIZE_CONFIG.preset,
        "-crf", String(NORMALIZE_CONFIG.crf),
        "-pix_fmt", NORMALIZE_CONFIG.pixelFormat,
        "-r", String(NORMALIZE_CONFIG.fps),
        "-c:a", NORMALIZE_CONFIG.audioCodec,
        "-b:a", NORMALIZE_CONFIG.audioBitrate,
        "-ar", String(NORMALIZE_CONFIG.audioSampleRate),
        "-ac", String(NORMALIZE_CONFIG.audioChannels),
        "-movflags", "+faststart",
        `"${outputPath}"`
      ].join(" ");
    }

    console.log(`[LocalFFmpeg] 執行合併命令...`);
    
    try {
      const { stdout, stderr } = await execAsync(mergeCmd, { 
        timeout: 600000, // 10 分鐘超時
        maxBuffer: 100 * 1024 * 1024 // 100MB buffer
      });
      if (stderr) console.log(`[LocalFFmpeg] FFmpeg stderr:`, stderr.substring(0, 500));
    } catch (mergeError: any) {
      console.error(`[LocalFFmpeg] ❌ 合併失敗:`, {
        message: mergeError.message,
        stderr: mergeError.stderr?.substring(0, 500),
      });
      return { success: false, error: `合併失敗: ${mergeError.message}` };
    }

    // 驗證輸出文件
    if (!fs.existsSync(outputPath)) {
      return { success: false, error: "合併後輸出文件不存在" };
    }

    const outputStats = fs.statSync(outputPath);
    console.log(`[LocalFFmpeg] ✅ 合併完成，文件大小: ${(outputStats.size / 1024 / 1024).toFixed(2)} MB`);

    if (outputStats.size < 10000) {
      return { success: false, error: "合併後文件過小，可能失敗" };
    }

    // 步驟 4：上傳合併後的視頻
    console.log(`[LocalFFmpeg] 📤 上傳合併後的視頻...`);
    const uploadedUrl = await uploadMergedVideo(outputPath);

    // 清理臨時文件
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
      console.log(`[LocalFFmpeg] 🗑️ 清理臨時目錄`);
    } catch {}

    if (uploadedUrl) {
      mergeStats.localSuccesses++;
      return { success: true, videoUrl: uploadedUrl };
    }

    return { success: false, error: "上傳失敗" };

  } catch (error: any) {
    console.error(`[LocalFFmpeg] ❌ 合併過程錯誤:`, error.message);
    
    // 清理臨時文件
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {}

    return { success: false, error: error.message };
  }
}

/**
 * 將旁白文字轉換為字幕格式（每行 8-10 字）
 */
function formatNarrationForSubtitle(narration: string, segmentDuration: number = 8): string {
  if (!narration) return "";
  
  // 每行最多 10 個字
  const maxCharsPerLine = 10;
  const lines: string[] = [];
  
  for (let i = 0; i < narration.length; i += maxCharsPerLine) {
    lines.push(narration.substring(i, i + maxCharsPerLine));
  }
  
  // 計算每行的顯示時長
  const timePerLine = segmentDuration / lines.length;
  
  return lines.map((line, i) => {
    const startTime = i * timePerLine;
    const endTime = (i + 1) * timePerLine;
    return `${startTime.toFixed(2)}|${endTime.toFixed(2)}|${line}`;
  }).join("\n");
}

/**
 * 生成 ASS 字幕文件
 */
async function generateSubtitleFile(narration: string, outputPath: string, segmentDuration: number = 8): Promise<string | null> {
  if (!narration) return null;
  
  const fs = await import("fs");
  
  // 每行最多 10 個字
  const maxCharsPerLine = 10;
  const lines: string[] = [];
  
  for (let i = 0; i < narration.length; i += maxCharsPerLine) {
    lines.push(narration.substring(i, i + maxCharsPerLine));
  }
  
  // 計算每行的顯示時長
  const timePerLine = segmentDuration / lines.length;
  
  // 生成 ASS 字幕文件
  const assContent = `[Script Info]
Title: VEO3 Studio Subtitles
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Noto Sans CJK TC,36,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,1,2,10,10,50,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${lines.map((line, i) => {
    const startTime = i * timePerLine;
    const endTime = (i + 1) * timePerLine;
    const startStr = formatAssTime(startTime);
    const endStr = formatAssTime(endTime);
    return `Dialogue: 0,${startStr},${endStr},Default,,0,0,0,,${line}`;
  }).join("\n")}
`;

  try {
    fs.writeFileSync(outputPath, assContent, "utf-8");
    console.log(`[字幕] ✅ 生成字幕文件: ${outputPath}`);
    return outputPath;
  } catch (error: any) {
    console.error(`[字幕] ❌ 生成字幕文件失敗:`, error.message);
    return null;
  }
}

/**
 * 格式化 ASS 時間
 */
function formatAssTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.floor((seconds % 1) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

/**
 * 標準化單個視頻（包含旁白和字幕）
 */
async function normalizeVideo(
  inputPath: string,
  outputPath: string,
  audioPath: string,
  options: { narrationVolume: number; originalVolume: number; narration?: string; subtitleStyle?: string }
): Promise<boolean> {
  const { exec } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(exec);
  const fs = await import("fs");

  try {
    let cmd: string;
    const origVol = options.originalVolume / 100;
    const narrVol = options.narrationVolume / 100;
    const hasAudio = audioPath && fs.existsSync(audioPath);
    const hasSubtitle = options.subtitleStyle && options.subtitleStyle !== "none" && options.narration;
    
    // ✅ 生成字幕文件（如果需要）
    let subtitlePath = "";
    if (hasSubtitle && options.narration) {
      const tempDir = inputPath.substring(0, inputPath.lastIndexOf("/"));
      subtitlePath = `${tempDir}/subtitle_${Date.now()}.ass`;
      await generateSubtitleFile(options.narration, subtitlePath, 8);
    }
    
    // 構建視頻濾鏡
    let videoFilter = `scale=${NORMALIZE_CONFIG.width}:-2,fps=${NORMALIZE_CONFIG.fps}`;
    
    // ✅ 添加字幕濾鏡（如果有字幕文件）
    if (subtitlePath && fs.existsSync(subtitlePath)) {
      // 使用 ASS 字幕
      const escapedPath = subtitlePath.replace(/:/g, "\\:").replace(/'/g, "\\'");
      videoFilter += `,ass='${escapedPath}'`;
      console.log(`[Normalize] ✅ 添加字幕: ${subtitlePath}`);
    }

    if (hasAudio) {
      // 有旁白音頻：混合原音和旁白
      console.log(`[Normalize] 🎤 混合旁白音頻: ${audioPath}`);
      
      cmd = [
        "ffmpeg", "-y",
        "-i", `"${inputPath}"`,
        "-i", `"${audioPath}"`,
        "-filter_complex",
        `"[0:a]volume=${origVol}[a0];[1:a]volume=${narrVol}[a1];[a0][a1]amix=inputs=2:duration=first:dropout_transition=2[aout];[0:v]${videoFilter}[vout]"`,
        "-map", '"[vout]"',
        "-map", '"[aout]"',
        "-c:v", NORMALIZE_CONFIG.videoCodec,
        "-preset", NORMALIZE_CONFIG.preset,
        "-crf", String(NORMALIZE_CONFIG.crf),
        "-pix_fmt", NORMALIZE_CONFIG.pixelFormat,
        "-c:a", NORMALIZE_CONFIG.audioCodec,
        "-b:a", NORMALIZE_CONFIG.audioBitrate,
        "-ar", String(NORMALIZE_CONFIG.audioSampleRate),
        "-ac", String(NORMALIZE_CONFIG.audioChannels),
        `"${outputPath}"`
      ].join(" ");
    } else {
      // 無旁白音頻：只標準化視頻
      console.log(`[Normalize] 📹 無旁白音頻，僅標準化視頻`);
      
      cmd = [
        "ffmpeg", "-y",
        "-i", `"${inputPath}"`,
        "-vf", `"${videoFilter}"`,
        "-c:v", NORMALIZE_CONFIG.videoCodec,
        "-preset", NORMALIZE_CONFIG.preset,
        "-crf", String(NORMALIZE_CONFIG.crf),
        "-pix_fmt", NORMALIZE_CONFIG.pixelFormat,
        "-r", String(NORMALIZE_CONFIG.fps),
        "-c:a", NORMALIZE_CONFIG.audioCodec,
        "-b:a", NORMALIZE_CONFIG.audioBitrate,
        "-ar", String(NORMALIZE_CONFIG.audioSampleRate),
        "-ac", String(NORMALIZE_CONFIG.audioChannels),
        `"${outputPath}"`
      ].join(" ");
    }

    await execAsync(cmd, { timeout: 120000, maxBuffer: 50 * 1024 * 1024 });

    // 驗證輸出
    if (fs.existsSync(outputPath)) {
      const stats = fs.statSync(outputPath);
      if (stats.size > 10000) {
        return true;
      }
    }

    return false;
  } catch (error: any) {
    console.error(`[Normalize] ❌ 標準化失敗:`, error.message);
    return false;
  }
}

/**
 * 第三層：緊急模式
 * 注意：緊急模式不應設置 success: true，因為合併實際上失敗了
 */
function emergencyMode(videoUrls: string[], narrations: string[]): MergeResult {
  console.log(`[EmergencyMode] 🚨 緊急模式啟動`);
  console.log(`[EmergencyMode] 返回 ${videoUrls.length} 個獨立片段（合併失敗，僅返回原始片段）`);

  const validUrls = videoUrls.filter(url => url && url.startsWith("http"));

  if (validUrls.length === 0) {
    return { success: false, error: "沒有有效的視頻片段", mode: "emergency" };
  }

  // 重要：success: false 表示合併失敗，但仍提供 segmentUrls 讓前端可以下載
  return {
    success: false,
    videoUrl: undefined, // 不設置 videoUrl，避免前端誤用
    segmentUrls: validUrls,
    mode: "emergency",
    error: `合併失敗，返回 ${validUrls.length} 個獨立片段。您可以手動下載並合併。`,
    message: `緊急模式：合併失敗，返回 ${validUrls.length} 個獨立片段。`,
    duration: validUrls.length * 8,
  };
}

/**
 * 檢查 FFmpeg 是否可用
 */
async function checkFFmpegAvailable(): Promise<boolean> {
  try {
    console.log(`[FFmpeg] 🔍 檢查 FFmpeg 是否可用...`);
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(exec);

    const { stdout } = await execAsync("ffmpeg -version", { timeout: 5000 });
    const version = stdout.split('\n')[0];
    console.log(`[FFmpeg] ✅ FFmpeg 版本: ${version}`);
    return stdout.includes("ffmpeg version");
  } catch (error: any) {
    console.error(`[FFmpeg] ❌ FFmpeg 不可用:`, error.message);
    return false;
  }
}

/**
 * 下載視頻並驗證（帶重試和 ffprobe 校驗）
 */
async function downloadVideoWithValidation(
  url: string,
  localPath: string,
  tempDir: string
): Promise<boolean> {
  const fs = await import("fs");
  const { exec } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(exec);
  const { pipeline } = await import("stream/promises");

  console.log(`[Download] 📥 開始下載:`, url.substring(0, 80) + "...");

  // 確保目錄存在
  const dir = localPath.substring(0, localPath.lastIndexOf("/"));
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // 重試配置
  const maxRetries = 3;
  const retryDelays = [500, 1500, 3000];

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // 方案 1：curl
    try {
      await execAsync(`curl -L -f -o "${localPath}" "${url}"`, { 
        timeout: 120000,
        maxBuffer: 100 * 1024 * 1024 
      });
      
      if (fs.existsSync(localPath)) {
        const stats = fs.statSync(localPath);
        if (stats.size > 50000) { // 至少 50KB
          // 用 ffprobe 驗證
          const isValid = await validateVideoWithFFprobe(localPath);
          if (isValid) {
            console.log(`[Download] ✅ curl 下載成功: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
            return true;
          } else {
            console.log(`[Download] ⚠️ ffprobe 驗證失敗，文件可能損壞`);
            fs.unlinkSync(localPath);
          }
        } else {
          console.log(`[Download] ⚠️ 文件過小: ${stats.size} bytes`);
          fs.unlinkSync(localPath);
        }
      }
    } catch (curlError: any) {
      console.log(`[Download] curl 失敗 (嘗試 ${attempt + 1}):`, curlError.message);
    }

    // 方案 2：Node.js fetch
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(120000),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      if (!response.body) {
        throw new Error('Response body is null');
      }
      
      const fileStream = fs.createWriteStream(localPath);
      const { Readable } = await import("stream");
      const nodeStream = Readable.fromWeb(response.body as any);
      await pipeline(nodeStream, fileStream);
      
      if (fs.existsSync(localPath)) {
        const stats = fs.statSync(localPath);
        if (stats.size > 50000) {
          const isValid = await validateVideoWithFFprobe(localPath);
          if (isValid) {
            console.log(`[Download] ✅ fetch 下載成功: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
            return true;
          } else {
            fs.unlinkSync(localPath);
          }
        } else {
          fs.unlinkSync(localPath);
        }
      }
    } catch (fetchError: any) {
      console.log(`[Download] fetch 失敗 (嘗試 ${attempt + 1}):`, fetchError.message);
    }

    // 等待後重試
    if (attempt < maxRetries - 1) {
      await sleep(retryDelays[attempt]);
    }
  }

  console.error(`[Download] ❌ 所有下載方式均失敗`);
  return false;
}

/**
 * 用 ffprobe 驗證視頻文件有效性
 */
async function validateVideoWithFFprobe(filePath: string): Promise<boolean> {
  try {
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(exec);

    const { stdout } = await execAsync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
      { timeout: 10000 }
    );

    const codec = stdout.trim();
    if (codec && codec.length > 0) {
      console.log(`[FFprobe] ✅ 視頻編碼: ${codec}`);
      return true;
    }

    return false;
  } catch (error: any) {
    console.log(`[FFprobe] ❌ 驗證失敗:`, error.message);
    return false;
  }
}

/**
 * 上傳合併後的視頻 - 多重上傳方案
 * 優先順序：R2 → catbox → litterbox → file.io → 0x0.st → Manus Storage → VectorEngine
 */
async function uploadMergedVideo(localPath: string): Promise<string | null> {
  const fs = await import("fs");
  const fileBuffer = fs.readFileSync(localPath);
  const fileSizeMB = (fileBuffer.length / 1024 / 1024).toFixed(2);
  const fileName = `merged_${Date.now()}_${Math.random().toString(36).substring(7)}.mp4`;
  
  console.log(`[Upload] 📤 開始上傳合併後的視頻（${fileSizeMB} MB）...`);

  // ========================================
  // 方案 0：Cloudflare R2（主存儲，最穩定）
  // ========================================
  if (isR2Configured()) {
    try {
      console.log(`[Upload] 嘗試 Cloudflare R2...`);
      const url = await uploadVideoToR2(fileBuffer, fileName);
      console.log(`[Upload] ✅ R2 上傳成功:`, url);
      return url;
    } catch (r2Error: any) {
      console.log(`[Upload] ⚠️ R2 上傳失敗:`, r2Error.message);
    }
  } else {
    console.log(`[Upload] ⚠️ R2 未配置，跳過`);
  }

  // ========================================
  // 方案 1：catbox.moe（免費永久託管，最大 200MB）
  // ========================================
  try {
    console.log(`[Upload] 嘗試 catbox.moe...`);
    const formData = new FormData();
    const blob = new Blob([fileBuffer], { type: "video/mp4" });
    formData.append("reqtype", "fileupload");
    formData.append("fileToUpload", blob, fileName);

    const response = await fetch("https://catbox.moe/user/api.php", {
      method: "POST",
      body: formData,
    });

    const responseText = await response.text();
    if (response.ok && responseText.startsWith("https://files.catbox.moe/")) {
      console.log(`[Upload] ✅ catbox.moe 上傳成功:`, responseText.trim());
      return responseText.trim();
    }
    console.log(`[Upload] ⚠️ catbox.moe 上傳失敗: ${response.status}, 返回: ${responseText.slice(0, 200)}`);
  } catch (catboxError: any) {
    console.log(`[Upload] ⚠️ catbox.moe 錯誤:`, catboxError.message);
  }

  // ========================================
  // 方案 2：litterbox.catbox.moe（免費臨時託管，24小時有效）
  // ========================================
  try {
    console.log(`[Upload] 嘗試 litterbox.catbox.moe...`);
    const formData = new FormData();
    const blob = new Blob([fileBuffer], { type: "video/mp4" });
    formData.append("reqtype", "fileupload");
    formData.append("time", "24h");
    formData.append("fileToUpload", blob, fileName);

    const response = await fetch("https://litterbox.catbox.moe/resources/internals/api.php", {
      method: "POST",
      body: formData,
    });

    const responseText = await response.text();
    if (response.ok && responseText.startsWith("https://litter.catbox.moe/")) {
      console.log(`[Upload] ✅ litterbox 上傳成功:`, responseText.trim());
      return responseText.trim();
    }
    console.log(`[Upload] ⚠️ litterbox 上傳失敗: ${response.status}, 返回: ${responseText.slice(0, 200)}`);
  } catch (litterboxError: any) {
    console.log(`[Upload] ⚠️ litterbox 錯誤:`, litterboxError.message);
  }

  // ========================================
  // 方案 3：file.io（免費臨時託管）
  // ========================================
  try {
    console.log(`[Upload] 嘗試 file.io...`);
    const formData = new FormData();
    const blob = new Blob([fileBuffer], { type: "video/mp4" });
    formData.append("file", blob, fileName);

    const response = await fetch("https://file.io", {
      method: "POST",
      body: formData,
    });

    // 先讀取文本，再判斷是否 JSON
    const ct = response.headers.get("content-type") || "";
    const responseText = await response.text();
    if (ct.includes("application/json")) {
      try {
        const result = JSON.parse(responseText);
        if (result.success && result.link) {
          console.log(`[Upload] ✅ file.io 上傳成功:`, result.link.substring(0, 80));
          return result.link;
        }
      } catch {}
    }
    console.log(`[Upload] ⚠️ file.io 上傳失敗: ${response.status}, 返回: ${responseText.slice(0, 200)}`);
  } catch (fileioError: any) {
    console.log(`[Upload] ⚠️ file.io 錯誤:`, fileioError.message);
  }

  // ========================================
  // 方案 4：0x0.st（免費臨時託管）
  // ========================================
  try {
    console.log(`[Upload] 嘗試 0x0.st...`);
    const formData = new FormData();
    const blob = new Blob([fileBuffer], { type: "video/mp4" });
    formData.append("file", blob, fileName);

    const response = await fetch("https://0x0.st", {
      method: "POST",
      body: formData,
    });

    const responseText = (await response.text()).trim();
    if (response.ok && responseText.startsWith("http")) {
      console.log(`[Upload] ✅ 0x0.st 上傳成功:`, responseText.substring(0, 80));
      return responseText;
    }
    console.log(`[Upload] ⚠️ 0x0.st 上傳失敗: ${response.status}, 返回: ${responseText.slice(0, 200)}`);
  } catch (zeroError: any) {
    console.log(`[Upload] ⚠️ 0x0.st 錯誤:`, zeroError.message);
  }

  // ========================================
  // 方案 5：transfer.sh（免費臨時託管）
  // ========================================
  try {
    console.log(`[Upload] 嘗試 transfer.sh...`);
    const response = await fetch(`https://transfer.sh/${fileName}`, {
      method: "PUT",
      body: fileBuffer,
      headers: {
        "Content-Type": "video/mp4",
      },
    });

    const responseText = (await response.text()).trim();
    if (response.ok && responseText.startsWith("http")) {
      console.log(`[Upload] ✅ transfer.sh 上傳成功:`, responseText.substring(0, 80));
      return responseText;
    }
    console.log(`[Upload] ⚠️ transfer.sh 上傳失敗: ${response.status}, 返回: ${responseText.slice(0, 200)}`);
  } catch (transferError: any) {
    console.log(`[Upload] ⚠️ transfer.sh 錯誤:`, transferError.message);
  }

  // ========================================
  // 方案 6：Manus Storage API（如果配置了環境變量）
  // ========================================
  try {
    console.log(`[Upload] 嘗試 Manus Storage...`);
    const { url } = await storagePut(
      `videos/merged/${fileName}`,
      fileBuffer,
      "video/mp4"
    );
    console.log(`[Upload] ✅ Manus Storage 上傳成功:`, url.substring(0, 80));
    return url;
  } catch (storageError: any) {
    console.log(`[Upload] ⚠️ Manus Storage 上傳失敗:`, storageError.message);
  }

  // ========================================
  // 方案 7：VectorEngine API（最後備用）
  // ========================================
  try {
    console.log(`[Upload] 嘗試 VectorEngine...`);
    const apiKey = getNextApiKey();
    const blob = new Blob([fileBuffer], { type: "video/mp4" });

    const formData = new FormData();
    formData.append("file", blob, fileName);

    const response = await fetch(`${VIDEO_API_BASE}/upload`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}` },
      body: formData,
    });

    if (response.ok) {
      const result = await response.json();
      console.log(`[Upload] ✅ VectorEngine 上傳成功:`, result.url?.substring(0, 80));
      return result.url || null;
    }
    console.log(`[Upload] ⚠️ VectorEngine 上傳失敗: ${response.status}`);
  } catch (apiError: any) {
    console.log(`[Upload] ⚠️ VectorEngine API 錯誤:`, apiError.message);
  }

  console.log(`[Upload] ❌ 所有上傳方式均失敗`);
  return null;
}

/**
 * 生成 SRT 字幕文件內容
 */
export function generateSrtContent(narrations: string[], durations: number[]): string {
  let srtContent = "";
  let currentTime = 0;

  narrations.forEach((text, index) => {
    const duration = durations[index] || 8;
    const startTime = formatSrtTime(currentTime);
    const endTime = formatSrtTime(currentTime + duration);

    srtContent += `${index + 1}\n`;
    srtContent += `${startTime} --> ${endTime}\n`;
    srtContent += `${text}\n\n`;

    currentTime += duration;
  });

  return srtContent;
}

function formatSrtTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}
