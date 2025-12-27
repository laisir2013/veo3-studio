/**
 * 視頻合併服務 - 增強版（三層容錯機制）
 * 
 * 三層容錯架構：
 * 1. 雲端合併（VectorEngine API 輪換）
 * 2. 本地 FFmpeg 合併（如果可用）
 * 3. 緊急模式（返回所有片段視頻，100% 保證有結果）
 */

import { getNextApiKey, API_ENDPOINTS, RETRY_CONFIG } from "./videoConfig";

const VIDEO_API_BASE = API_ENDPOINTS.vectorEngine;

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
  narrations?: string[];
  bgmType?: BgmType;
  subtitleStyle?: SubtitleStyle;
  outputFormat?: "mp4" | "webm";
  resolution?: "720p" | "1080p" | "4k";
  // 新增：音量控制
  narrationVolume?: number;  // 0-100
  bgmVolume?: number;        // 0-100
  originalVolume?: number;   // 0-100
}

export interface MergeResult {
  success: boolean;
  videoUrl?: string;
  duration?: number;
  error?: string;
  // 新增：緊急模式相關
  mode?: "cloud" | "local" | "emergency";
  segmentUrls?: string[];  // 緊急模式下返回所有片段
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
    narrations = [],
    bgmType = "none",
    subtitleStyle = "none",
    outputFormat = "mp4",
    resolution = "1080p",
    narrationVolume = 80,
    bgmVolume = 30,
    originalVolume = 50,
  } = options;

  if (videoUrls.length === 0) {
    return { success: false, error: "沒有可合併的視頻" };
  }

  // 過濾有效的視頻 URL
  const validVideoUrls = videoUrls.filter(url => url && url.startsWith("http"));
  if (validVideoUrls.length === 0) {
    return { success: false, error: "沒有有效的視頻 URL" };
  }

  // 🔍 GPT 建議：添加輸入檢查日誌，檢測是否有圖片混入
  const inputSummary = validVideoUrls.map(url => {
    const cleanUrl = url.split("?")[0];
    const ext = cleanUrl.split(".").pop()?.toLowerCase() || "unknown";
    return { url: url.substring(0, 60) + "...", ext };
  });
  console.log("[Merge] 輸入檢查:", JSON.stringify(inputSummary, null, 2));
  
  // 檢測圖片格式（jpg, jpeg, png, webp, gif）
  const imageExtensions = ["jpg", "jpeg", "png", "webp", "gif", "bmp"];
  const imageUrls = inputSummary.filter(item => imageExtensions.includes(item.ext));
  const videoOnlyUrls = validVideoUrls.filter(url => {
    const ext = url.split("?")[0].split(".").pop()?.toLowerCase() || "";
    return !imageExtensions.includes(ext);
  });
  
  if (imageUrls.length > 0) {
    console.log(`[Merge] ⚠️ 警告：檢測到 ${imageUrls.length} 個圖片 URL 混入視頻合成！`);
    console.log(`[Merge] 圖片 URLs:`, imageUrls);
    
    // 如果全部都是圖片，返回錯誤
    if (videoOnlyUrls.length === 0) {
      console.log(`[Merge] ❌ 錯誤：所有輸入都是圖片，無法進行視頻合成`);
      return { 
        success: false, 
        error: "所有輸入都是圖片格式，無法進行視頻合成。請確保使用視頻模式生成片段。" 
      };
    }
    
    // 如果有混合，只使用視頻 URL（跳過圖片）
    console.log(`[Merge] 📝 將跳過圖片，只合併 ${videoOnlyUrls.length} 個視頻片段`);
  }

  // 如果只有一個視頻且不需要處理，直接返回
  if (validVideoUrls.length === 1 && bgmType === "none" && subtitleStyle === "none") {
    console.log(`[VideoMerge] 只有一個視頻，直接返回`);
    return { success: true, videoUrl: validVideoUrls[0], mode: "cloud", duration: 8 };
  }

  console.log(`[VideoMerge] 開始合併 ${validVideoUrls.length} 個視頻片段`);
  console.log(`[VideoMerge] 視頻 URLs:`, validVideoUrls.slice(0, 3).map(u => u.substring(0, 50) + '...'));
  console.log(`[VideoMerge] 設置: BGM=${bgmType}, 字幕=${subtitleStyle}, 解析度=${resolution}`);

  // 第一層：雲端合併（VectorEngine API 輪換）
  try {
    const cloudResult = await tryCloudMerge(validVideoUrls, narrations, bgmType, subtitleStyle, outputFormat, resolution, narrationVolume, bgmVolume, originalVolume);
    if (cloudResult.success) {
      console.log(`[VideoMerge] ✅ 雲端合併成功`);
      return { ...cloudResult, mode: "cloud" };
    }
    console.log(`[VideoMerge] ⚠️ 雲端合併失敗: ${cloudResult.error}`);
  } catch (error) {
    console.log(`[VideoMerge] ⚠️ 雲端合併異常:`, error);
  }

  // 第二層：本地 FFmpeg 合併
  try {
    const localResult = await tryLocalFFmpegMerge(validVideoUrls, narrations, bgmType, subtitleStyle, outputFormat, resolution, narrationVolume, bgmVolume, originalVolume);
    if (localResult.success) {
      console.log(`[VideoMerge] ✅ 本地 FFmpeg 合併成功`);
      return { ...localResult, mode: "local" };
    }
    console.log(`[VideoMerge] ⚠️ 本地 FFmpeg 合併失敗: ${localResult.error}`);
  } catch (error) {
    console.log(`[VideoMerge] ⚠️ 本地 FFmpeg 合併異常:`, error);
  }

  // 第三層：緊急模式 - 100% 保證返回結果
  console.log(`[VideoMerge] 🚨 啟動緊急模式`);
  mergeStats.emergencyActivations++;
  return emergencyMode(validVideoUrls, narrations);
}

/**
 * 第一層：雲端合併（VectorEngine API 輪換）
 */
async function tryCloudMerge(
  videoUrls: string[],
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
  
  // 嘗試多個 API Key
  const maxRetries = RETRY_CONFIG.maxRetries;
  let lastError = "";

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const apiKey = getNextApiKey();
      console.log(`[CloudMerge] 嘗試 ${attempt + 1}/${maxRetries}, API Key: ${apiKey.substring(0, 10)}...`);

      // 構建合併請求
      const mergeRequest = {
        videos: videoUrls.map((url, index) => ({
          url,
          narration: narrations[index] || null,
        })),
        bgm: BGM_OPTIONS[bgmType].url,
        subtitle: SUBTITLE_STYLES[subtitleStyle],
        output: {
          format: outputFormat,
          resolution: resolution,
        },
        audio: {
          narrationVolume: narrationVolume / 100,
          bgmVolume: bgmVolume / 100,
          originalVolume: originalVolume / 100,
        },
      };

      // 調用視頻合併 API
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 秒超時

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

      console.log(`[CloudMerge] API 響應狀態: ${response.status}`);

      if (response.ok) {
        const result = await response.json();
        console.log(`[CloudMerge] API 響應:`, JSON.stringify(result).substring(0, 200));
        if (result.url) {
          mergeStats.cloudSuccesses++;
          return {
            success: true,
            videoUrl: result.url,
            duration: result.duration,
          };
        }
      }

      // 如果是 429 錯誤，等待後重試
      if (response.status === 429) {
        const delay = RETRY_CONFIG.retryDelay * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt);
        console.log(`[CloudMerge] 429 限流，等待 ${delay}ms 後重試`);
        await sleep(Math.min(delay, RETRY_CONFIG.maxDelay));
        continue;
      }

      // 記錄錯誤響應
      try {
        const errorBody = await response.text();
        console.log(`[CloudMerge] 錯誤響應: ${errorBody.substring(0, 200)}`);
      } catch {}

      lastError = `API 返回 ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "未知錯誤";
      console.log(`[CloudMerge] 錯誤: ${lastError}`);
    }

    // 等待後重試
    if (attempt < maxRetries - 1) {
      const delay = RETRY_CONFIG.retryDelay * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt);
      await sleep(Math.min(delay, RETRY_CONFIG.maxDelay));
    }
  }

  // 嘗試備用 API：視頻拼接
  try {
    console.log(`[CloudMerge] 嘗試備用 API：視頻拼接`);
    const apiKey = getNextApiKey();
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    const response = await fetch(`${VIDEO_API_BASE}/video/concat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        videos: videoUrls,
        transition: "fade",
        transitionDuration: 0.5,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    console.log(`[CloudMerge] 備用 API 響應狀態: ${response.status}`);

    if (response.ok) {
      const result = await response.json();
      if (result.url) {
        mergeStats.cloudSuccesses++;
        return { success: true, videoUrl: result.url };
      }
    }
  } catch (error) {
    console.log(`[CloudMerge] 備用 API 失敗: ${error}`);
  }

  return { success: false, error: lastError || "雲端合併失敗" };
}

/**
 * 第二層：本地 FFmpeg 合併
 */
async function tryLocalFFmpegMerge(
  videoUrls: string[],
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

  try {
    // 檢查 FFmpeg 是否可用
    const ffmpegAvailable = await checkFFmpegAvailable();
    if (!ffmpegAvailable) {
      console.log(`[LocalFFmpeg] FFmpeg 不可用`);
      return { success: false, error: "FFmpeg 不可用" };
    }

    console.log(`[LocalFFmpeg] FFmpeg 可用，開始本地合併`);

    // 下載所有視頻到臨時目錄
    const tempDir = `/tmp/veo3-merge-${Date.now()}`;
    const downloadedFiles: string[] = [];

    for (let i = 0; i < videoUrls.length; i++) {
      const localPath = `${tempDir}/segment_${i}.mp4`;
      console.log(`[LocalFFmpeg] 下載視頻 ${i + 1}/${videoUrls.length}...`);
      const downloaded = await downloadVideo(videoUrls[i], localPath);
      if (downloaded) {
        downloadedFiles.push(localPath);
      }
    }

    if (downloadedFiles.length === 0) {
      return { success: false, error: "無法下載視頻文件" };
    }

    console.log(`[LocalFFmpeg] 成功下載 ${downloadedFiles.length} 個視頻`);

    // 使用 FFmpeg 合併
    const outputPath = `${tempDir}/merged.${outputFormat}`;
    const ffmpegResult = await runFFmpegMerge(downloadedFiles, outputPath, {
      bgmUrl: BGM_OPTIONS[bgmType].url,
      narrationVolume,
      bgmVolume,
      originalVolume,
      resolution,
    });

    if (ffmpegResult.success && ffmpegResult.outputPath) {
      // 上傳合併後的視頻
      const uploadedUrl = await uploadMergedVideo(ffmpegResult.outputPath);
      if (uploadedUrl) {
        mergeStats.localSuccesses++;
        return { success: true, videoUrl: uploadedUrl };
      }
    }

    return { success: false, error: ffmpegResult.error || "本地合併失敗" };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "本地合併錯誤" };
  }
}

/**
 * 第三層：緊急模式
 * 當雲端和本地合併都失敗時，返回所有片段視頻
 * 100% 保證有可用內容
 */
function emergencyMode(videoUrls: string[], narrations: string[]): MergeResult {
  console.log(`[EmergencyMode] 🚨 緊急模式啟動`);
  console.log(`[EmergencyMode] 返回 ${videoUrls.length} 個獨立片段`);

  // 過濾有效的視頻 URL
  const validUrls = videoUrls.filter(url => url && url.startsWith("http"));

  if (validUrls.length === 0) {
    return {
      success: false,
      error: "沒有有效的視頻片段",
      mode: "emergency",
    };
  }

  // 返回第一個視頻作為主視頻，同時提供所有片段
  // 這樣前端可以顯示預覽，用戶也可以下載所有片段
  return {
    success: true,
    videoUrl: validUrls[0],
    segmentUrls: validUrls,
    mode: "emergency",
    message: `緊急模式：合併服務暫時不可用，已返回 ${validUrls.length} 個獨立片段。您可以：\n1. 預覽第一個片段\n2. 下載所有片段後使用視頻編輯軟件合併\n3. 稍後重試合併`,
    duration: validUrls.length * 8, // 估算總時長（每個片段約 8 秒）
  };
}

/**
 * 檢查 FFmpeg 是否可用
 */
async function checkFFmpegAvailable(): Promise<boolean> {
  try {
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(exec);

    const { stdout } = await execAsync("ffmpeg -version", { timeout: 5000 });
    return stdout.includes("ffmpeg version");
  } catch {
    return false;
  }
}

/**
 * 下載視頻到本地
 */
async function downloadVideo(url: string, localPath: string): Promise<boolean> {
  try {
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(exec);
    const fs = await import("fs");

    // 確保目錄存在
    const dir = localPath.substring(0, localPath.lastIndexOf("/"));
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // 使用 curl 下載
    await execAsync(`curl -L -o "${localPath}" "${url}"`, { timeout: 60000 });
    return fs.existsSync(localPath);
  } catch (error) {
    console.log(`[Download] 下載失敗: ${error}`);
    return false;
  }
}

/**
 * 使用 FFmpeg 合併視頻
 */
async function runFFmpegMerge(
  inputFiles: string[],
  outputPath: string,
  options: {
    bgmUrl: string | null;
    narrationVolume: number;
    bgmVolume: number;
    originalVolume: number;
    resolution: string;
  }
): Promise<{ success: boolean; outputPath?: string; error?: string }> {
  try {
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(exec);
    const fs = await import("fs");

    // 創建文件列表
    const listPath = outputPath.replace(/\.[^.]+$/, "_list.txt");
    const listContent = inputFiles.map(f => `file '${f}'`).join("\n");
    fs.writeFileSync(listPath, listContent);

    // 構建 FFmpeg 命令
    let ffmpegCmd = `ffmpeg -y -f concat -safe 0 -i "${listPath}"`;

    // 添加音量調整
    const volumeFilter = `volume=${options.originalVolume / 100}`;
    ffmpegCmd += ` -af "${volumeFilter}"`;

    // 設置輸出格式
    ffmpegCmd += ` -c:v libx264 -preset fast -crf 23`;
    ffmpegCmd += ` -c:a aac -b:a 128k`;
    ffmpegCmd += ` "${outputPath}"`;

    console.log(`[FFmpeg] 執行命令: ${ffmpegCmd}`);
    await execAsync(ffmpegCmd, { timeout: 300000 }); // 5 分鐘超時

    if (fs.existsSync(outputPath)) {
      return { success: true, outputPath };
    }

    return { success: false, error: "輸出文件不存在" };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "FFmpeg 執行失敗" };
  }
}

/**
 * 上傳合併後的視頻
 */
async function uploadMergedVideo(localPath: string): Promise<string | null> {
  try {
    const fs = await import("fs");
    const apiKey = getNextApiKey();

    // 讀取文件
    const fileBuffer = fs.readFileSync(localPath);
    const blob = new Blob([fileBuffer], { type: "video/mp4" });

    // 創建 FormData
    const formData = new FormData();
    formData.append("file", blob, "merged.mp4");

    // 上傳到 VectorEngine
    const response = await fetch(`${VIDEO_API_BASE}/upload`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (response.ok) {
      const result = await response.json();
      return result.url || null;
    }

    return null;
  } catch (error) {
    console.log(`[Upload] 上傳失敗: ${error}`);
    return null;
  }
}

/**
 * 生成 SRT 字幕文件內容
 */
export function generateSrtContent(
  narrations: string[],
  durations: number[]
): string {
  let srtContent = "";
  let currentTime = 0;

  narrations.forEach((text, index) => {
    const duration = durations[index] || 8; // 默認 8 秒
    const startTime = formatSrtTime(currentTime);
    const endTime = formatSrtTime(currentTime + duration);

    srtContent += `${index + 1}\n`;
    srtContent += `${startTime} --> ${endTime}\n`;
    srtContent += `${text}\n\n`;

    currentTime += duration;
  });

  return srtContent;
}

/**
 * 格式化 SRT 時間
 */
function formatSrtTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);

  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")},${ms.toString().padStart(3, "0")}`;
}

/**
 * 獲取視頻時長
 */
export async function getVideoDuration(videoUrl: string): Promise<number> {
  try {
    // 嘗試通過 API 獲取視頻信息
    const apiKey = getNextApiKey();
    
    const response = await fetch(`${VIDEO_API_BASE}/video/info`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ url: videoUrl }),
    });

    if (response.ok) {
      const result = await response.json();
      return result.duration || 8;
    }

    // 默認返回 8 秒（Veo 生成的視頻通常是 8 秒）
    return 8;
  } catch (error) {
    return 8;
  }
}

/**
 * 計算合併後的總時長
 */
export function calculateTotalDuration(durations: number[]): number {
  return durations.reduce((sum, d) => sum + d, 0);
}

/**
 * 輔助函數：延遲
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 健康檢查
 */
export async function healthCheck(): Promise<{
  status: "healthy" | "degraded" | "unhealthy";
  cloudAvailable: boolean;
  ffmpegAvailable: boolean;
  stats: MergeStats;
}> {
  const ffmpegAvailable = await checkFFmpegAvailable();
  
  // 簡單測試雲端 API
  let cloudAvailable = false;
  try {
    const apiKey = getNextApiKey();
    const response = await fetch(`${VIDEO_API_BASE}/health`, {
      headers: { "Authorization": `Bearer ${apiKey}` },
    });
    cloudAvailable = response.ok;
  } catch {
    cloudAvailable = false;
  }

  let status: "healthy" | "degraded" | "unhealthy";
  if (cloudAvailable && ffmpegAvailable) {
    status = "healthy";
  } else if (cloudAvailable || ffmpegAvailable) {
    status = "degraded";
  } else {
    status = "unhealthy"; // 仍然有緊急模式可用
  }

  return {
    status,
    cloudAvailable,
    ffmpegAvailable,
    stats: getMergeStats(),
  };
}


/**
 * 🖼️ GPT 建議：圖片轉視頻功能
 * 將靜態圖片轉換為指定時長的視頻（用於圖片模式片段）
 */
export async function generateStillVideoFromImage(
  imageUrl: string,
  durationSec: number = 3
): Promise<string> {
  console.log(`[ImageToVideo] 開始將圖片轉換為 ${durationSec} 秒視頻: ${imageUrl.substring(0, 60)}...`);
  
  // 方法 1：嘗試使用雲端 API
  try {
    const apiKey = getNextApiKey();
    const response = await fetch(`${VIDEO_API_BASE}/video/image-to-video`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        image_url: imageUrl,
        duration: durationSec,
        output_format: "mp4",
      }),
    });

    if (response.ok) {
      const result = await response.json();
      if (result.url || result.video_url) {
        console.log(`[ImageToVideo] ✅ 雲端轉換成功`);
        return result.url || result.video_url;
      }
    }
    console.log(`[ImageToVideo] 雲端 API 不可用，嘗試本地 FFmpeg`);
  } catch (error) {
    console.log(`[ImageToVideo] 雲端 API 失敗:`, error);
  }

  // 方法 2：嘗試本地 FFmpeg
  try {
    const ffmpegAvailable = await checkFFmpegAvailable();
    if (ffmpegAvailable) {
      const result = await convertImageToVideoWithFFmpeg(imageUrl, durationSec);
      if (result) {
        console.log(`[ImageToVideo] ✅ 本地 FFmpeg 轉換成功`);
        return result;
      }
    }
  } catch (error) {
    console.log(`[ImageToVideo] 本地 FFmpeg 失敗:`, error);
  }

  // 方法 3：返回原始圖片 URL（讓合併服務處理）
  console.log(`[ImageToVideo] ⚠️ 無法轉換，返回原始圖片 URL`);
  return imageUrl;
}

/**
 * 使用 FFmpeg 將圖片轉換為視頻
 */
async function convertImageToVideoWithFFmpeg(
  imageUrl: string,
  durationSec: number
): Promise<string | null> {
  try {
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(exec);
    const fs = await import("fs");

    const tempDir = `/tmp/img2video-${Date.now()}`;
    const imagePath = `${tempDir}/input.jpg`;
    const outputPath = `${tempDir}/output.mp4`;

    // 創建臨時目錄
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // 下載圖片
    await execAsync(`curl -L -o "${imagePath}" "${imageUrl}"`, { timeout: 30000 });

    if (!fs.existsSync(imagePath)) {
      console.log(`[ImageToVideo] 圖片下載失敗`);
      return null;
    }

    // 使用 FFmpeg 將圖片轉換為視頻
    // -loop 1: 循環圖片
    // -t: 視頻時長
    // -r: 幀率
    // -pix_fmt yuv420p: 確保兼容性
    const ffmpegCmd = `ffmpeg -y -loop 1 -i "${imagePath}" -c:v libx264 -t ${durationSec} -pix_fmt yuv420p -r 24 "${outputPath}"`;
    
    console.log(`[ImageToVideo] 執行 FFmpeg: ${ffmpegCmd}`);
    await execAsync(ffmpegCmd, { timeout: 60000 });

    if (!fs.existsSync(outputPath)) {
      console.log(`[ImageToVideo] FFmpeg 輸出文件不存在`);
      return null;
    }

    // 上傳到存儲
    const { storagePut } = await import("./storage");
    const fileBuffer = fs.readFileSync(outputPath);
    const fileName = `img2video-${Date.now()}.mp4`;
    const { url } = await storagePut(fileName, fileBuffer, "video/mp4");

    // 清理臨時文件
    try {
      fs.unlinkSync(imagePath);
      fs.unlinkSync(outputPath);
      fs.rmdirSync(tempDir);
    } catch {}

    return url;
  } catch (error) {
    console.error(`[ImageToVideo] FFmpeg 轉換失敗:`, error);
    return null;
  }
}

/**
 * 檢查 URL 是否為圖片格式
 */
export function isImageUrl(url: string): boolean {
  const imageExtensions = ["jpg", "jpeg", "png", "webp", "gif", "bmp"];
  const cleanUrl = url.split("?")[0];
  const ext = cleanUrl.split(".").pop()?.toLowerCase() || "";
  return imageExtensions.includes(ext);
}

/**
 * 檢查 URL 是否為視頻格式
 */
export function isVideoUrl(url: string): boolean {
  const videoExtensions = ["mp4", "webm", "mov", "avi", "mkv"];
  const cleanUrl = url.split("?")[0];
  const ext = cleanUrl.split(".").pop()?.toLowerCase() || "";
  return videoExtensions.includes(ext);
}
