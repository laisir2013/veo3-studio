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
export const BGM_OPTIONS = {
  none: { name: "無背景音樂", url: null },
  cinematic: { name: "電影感", url: "https://cdn.pixabay.com/audio/2024/11/04/audio_4956b4edd1.mp3" },
  emotional: { name: "感人", url: "https://cdn.pixabay.com/audio/2024/02/14/audio_8f506e3e0f.mp3" },
  upbeat: { name: "歡快", url: "https://cdn.pixabay.com/audio/2024/09/12/audio_6e1d0b3a3a.mp3" },
  dramatic: { name: "戲劇性", url: "https://cdn.pixabay.com/audio/2024/04/24/audio_36e7a0e4e4.mp3" },
  peaceful: { name: "平靜", url: "https://cdn.pixabay.com/audio/2024/08/27/audio_4a1b2c3d4e.mp3" },
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

  console.log(`[VideoMerge] 🎬 開始合併流程`, {
    videoCount: videoUrls.length,
    audioCount: audioUrls.filter(u => u).length,
    timestamp: new Date().toISOString(),
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
    return { success: true, videoUrl: validVideoUrls[0], mode: "cloud", duration: 8 };
  }

  // 第一層：雲端合併
  try {
    const cloudResult = await tryCloudMerge(validVideoUrls, audioUrls, narrations, bgmType, subtitleStyle, outputFormat, resolution, narrationVolume, bgmVolume, originalVolume);
    if (cloudResult.success) {
      console.log(`[VideoMerge] ✅ 雲端合併成功`);
      return { ...cloudResult, mode: "cloud" };
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
      return { ...localResult, mode: "local" };
    }
    console.log(`[VideoMerge] ⚠️ 本地 FFmpeg 合併失敗: ${localResult.error}`);
  } catch (error) {
    console.log(`[VideoMerge] ⚠️ 本地 FFmpeg 合併異常:`, error);
  }

  // 第三層：緊急模式
  console.log(`[VideoMerge] 🚨 啟動緊急模式`);
  mergeStats.emergencyActivations++;
  return emergencyMode(validVideoUrls, narrations);
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

      // 下載對應的音頻
      if (audioUrls[i] && audioUrls[i].startsWith("http")) {
        const audioPath = `${tempDir}/audio_${i}.mp3`;
        const audioDownloaded = await downloadVideoWithValidation(audioUrls[i], audioPath, tempDir);
        downloadedAudioPaths.push(audioDownloaded ? audioPath : "");
      } else {
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
      
      const normalized = await normalizeVideo(inputPath, normalizedPath, audioPath, {
        narrationVolume,
        originalVolume,
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

    // 步驟 3：合併標準化後的視頻
    console.log(`[LocalFFmpeg] 🎬 合併視頻...`);
    const outputPath = `${tempDir}/merged_output.mp4`;
    
    // 創建 concat 列表
    const listPath = `${tempDir}/concat_list.txt`;
    const listContent = normalizedPaths.map(p => `file '${p}'`).join("\n");
    fs.writeFileSync(listPath, listContent);
    console.log(`[LocalFFmpeg] 📝 Concat 列表:\n${listContent}`);

    // 使用重編碼合併（最穩定）
    const mergeCmd = [
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
 * 標準化單個視頻
 */
async function normalizeVideo(
  inputPath: string,
  outputPath: string,
  audioPath: string,
  options: { narrationVolume: number; originalVolume: number }
): Promise<boolean> {
  const { exec } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(exec);
  const fs = await import("fs");

  try {
    let cmd: string;

    if (audioPath && fs.existsSync(audioPath)) {
      // 有旁白音頻：混合原音和旁白
      const origVol = options.originalVolume / 100;
      const narrVol = options.narrationVolume / 100;
      
      cmd = [
        "ffmpeg", "-y",
        "-i", `"${inputPath}"`,
        "-i", `"${audioPath}"`,
        "-filter_complex",
        `"[0:a]volume=${origVol}[a0];[1:a]volume=${narrVol}[a1];[a0][a1]amix=inputs=2:duration=first:dropout_transition=2[aout];[0:v]scale=${NORMALIZE_CONFIG.width}:-2,fps=${NORMALIZE_CONFIG.fps}[vout]"`,
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
      cmd = [
        "ffmpeg", "-y",
        "-i", `"${inputPath}"`,
        "-vf", `"scale=${NORMALIZE_CONFIG.width}:-2,fps=${NORMALIZE_CONFIG.fps}"`,
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
 */
function emergencyMode(videoUrls: string[], narrations: string[]): MergeResult {
  console.log(`[EmergencyMode] 🚨 緊急模式啟動`);
  console.log(`[EmergencyMode] 返回 ${videoUrls.length} 個獨立片段`);

  const validUrls = videoUrls.filter(url => url && url.startsWith("http"));

  if (validUrls.length === 0) {
    return { success: false, error: "沒有有效的視頻片段", mode: "emergency" };
  }

  return {
    success: true,
    videoUrl: validUrls[0],
    segmentUrls: validUrls,
    mode: "emergency",
    message: `緊急模式：返回 ${validUrls.length} 個獨立片段。您可以手動下載並合併。`,
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
 * 上傳合併後的視頻
 */
async function uploadMergedVideo(localPath: string): Promise<string | null> {
  try {
    const fs = await import("fs");
    const apiKey = getNextApiKey();

    console.log(`[Upload] 📤 開始上傳...`);

    const fileBuffer = fs.readFileSync(localPath);
    const blob = new Blob([fileBuffer], { type: "video/mp4" });

    const formData = new FormData();
    formData.append("file", blob, "merged.mp4");

    const response = await fetch(`${VIDEO_API_BASE}/upload`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}` },
      body: formData,
    });

    if (response.ok) {
      const result = await response.json();
      console.log(`[Upload] ✅ 上傳成功:`, result.url?.substring(0, 80));
      return result.url || null;
    }

    console.log(`[Upload] ❌ 上傳失敗: ${response.status}`);
    return null;
  } catch (error: any) {
    console.log(`[Upload] ❌ 上傳錯誤:`, error.message);
    return null;
  }
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
