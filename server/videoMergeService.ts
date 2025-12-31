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
// ✅ 優化：降低分辨率和質量以減少內存使用（適應 512MB 環境）
const NORMALIZE_CONFIG = {
  width: 1280,
  height: 720,
  fps: 30,
  videoCodec: "libx264",
  audioCodec: "aac",
  audioBitrate: "128k",  // ✅ 降低音頻碼率
  audioSampleRate: 44100, // ✅ 降低採樣率
  audioChannels: 2,
  preset: "ultrafast",    // ✅ 使用最快預設，減少內存
  crf: 23,                // ✅ 稍微降低質量，減少內存
  pixelFormat: "yuv420p",
};

// ✅ 新增：FFmpeg 執行配置（適應低內存環境）

// ✅ 新增：分段合併配置

// ✅ 新增：並行分段合併配置
const CHUNK_SIZE = 15;           // 每 15 個片段為一組
const MAX_CONCURRENT_CHUNKS = 2; // 最大並行處理組數（適應 Render 512MB 內存）

const FFMPEG_EXEC_CONFIG = {
  timeout: 180000,        // 3 分鐘超時
  maxBuffer: 10 * 1024 * 1024, // ✅ 降低到 10MB（原 50MB）
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

// ✅ 新增：異步任務狀態管理
export interface MergeTaskStatus {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  videoUrl?: string;
  error?: string;
  startTime: number;
  endTime?: number;
}

const mergeTasks = new Map<string, MergeTaskStatus>();

/**
 * 獲取任務狀態
 */
export function getMergeTaskStatus(taskId: string): MergeTaskStatus | undefined {
  return mergeTasks.get(taskId);
}

/**
 * 更新任務進度
 */
function updateTaskProgress(taskId: string, progress: number, status: MergeTaskStatus['status'] = 'processing') {
  const task = mergeTasks.get(taskId);
  if (task) {
    task.progress = progress;
    task.status = status;
    console.log(`[MergeTask] 任务 ${taskId} 进度: ${progress}% (${status})`);
  }
}

// 睡眠函數
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 獲取合併統計信息
 */
export function getMergeStats(): MergeStats {
  return { ...mergeStats };
}

/**
 * ✅ 新增：異步啟動合併任務
 */
export function startAsyncMerge(options: MergeOptions, taskId: string): void {
  const task: MergeTaskStatus = {
    id: taskId,
    status: 'pending',
    progress: 0,
    startTime: Date.now(),
  };
  mergeTasks.set(taskId, task);

  // 🚀 異步執行，不阻塞主線程
  (async () => {
    try {
      updateTaskProgress(taskId, 5, 'processing');
      const result = await mergeVideos(options, taskId);
      
      if (result.success && result.videoUrl) {
        const currentTask = mergeTasks.get(taskId);
        if (currentTask) {
          currentTask.status = 'completed';
          currentTask.progress = 100;
          currentTask.videoUrl = result.videoUrl;
          currentTask.endTime = Date.now();
        }
      } else {
        const currentTask = mergeTasks.get(taskId);
        if (currentTask) {
          currentTask.status = 'failed';
          currentTask.error = result.error || '合併失敗';
          currentTask.endTime = Date.now();
        }
      }
    } catch (error) {
      console.error(`[AsyncMerge] 任務 ${taskId} 異常:`, error);
      const currentTask = mergeTasks.get(taskId);
      if (currentTask) {
        currentTask.status = 'failed';
        currentTask.error = error instanceof Error ? error.message : String(error);
        currentTask.endTime = Date.now();
      }
    }
  })();
}

/**
 * 主要合併函數 - 三層容錯機制
 */
export async function mergeVideos(options: MergeOptions, taskId?: string): Promise<MergeResult> {
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

  // ✅ 修復：檢查是否有旁白音頻需要混入
  const hasValidAudio = audioUrls.some(url => url && url.startsWith("http"));
  const hasNarrations = narrations.some(n => n && n.trim().length > 0);
  
  // 如果只有一個視頻且不需要任何處理（無 BGM、無字幕、無旁白音頻），直接返回
  if (validVideoUrls.length === 1 && bgmType === "none" && subtitleStyle === "none" && !hasValidAudio && !hasNarrations) {
    console.log(`[VideoMerge] 只有一個視頻且無需處理，直接返回`);
    const result: MergeResult = { success: true, videoUrl: validVideoUrls[0], mode: "cloud", duration: 8 };
    assertMergeResponse(result);
    return result;
  }
  
  // ✅ 新增日誌：說明為什麼需要處理
  if (validVideoUrls.length === 1) {
    console.log(`[VideoMerge] 只有一個視頻，但需要處理:`, {
      hasValidAudio,
      hasNarrations,
      bgmType,
      subtitleStyle,
    });
  }

  // 第一層：雲端合併
  try {
    if (taskId) updateTaskProgress(taskId, 10);
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
    if (taskId) updateTaskProgress(taskId, 20);
    const localResult = await tryLocalFFmpegMerge(validVideoUrls, audioUrls, narrations, bgmType, subtitleStyle, outputFormat, resolution, narrationVolume, bgmVolume, originalVolume, taskId);
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
  originalVolume: number,
  taskId?: string
): Promise<MergeResult> {
  const totalSegments = videoUrls.length;
  
  // 如果片段數量較少，直接進行常規合併
  if (totalSegments <= CHUNK_SIZE) {
    return await performActualMerge(
      videoUrls, audioUrls, narrations, bgmType, subtitleStyle, 
      outputFormat, resolution, narrationVolume, bgmVolume, originalVolume, 
      0, 100, taskId
    );
  }

  // 🚀 超長影片：執行並行分段合併邏輯
  console.log(`[ParallelMerge] 🚀 啟動並行分段合併模式 (${totalSegments} 片段)...`);
  const numChunks = Math.ceil(totalSegments / CHUNK_SIZE);
  const chunkResults: string[] = new Array(numChunks);
  
  // 分組
  const chunkTasks = [];
  for (let i = 0; i < numChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, totalSegments);
    chunkTasks.push({
      index: i,
      videoUrls: videoUrls.slice(start, end),
      audioUrls: audioUrls.slice(start, end),
      narrations: narrations.slice(start, end)
    });
  }

  // 並行執行控制
  let completedChunks = 0;
  const processChunk = async (task: any) => {
    const progressStart = 20 + (task.index / numChunks) * 60;
    const progressEnd = 20 + ((task.index + 1) / numChunks) * 60;
    
    console.log(`[ParallelMerge] 📦 正在處理第 ${task.index + 1}/${numChunks} 組...`);
    
    const result = await performActualMerge(
      task.videoUrls, task.audioUrls, task.narrations, "none", subtitleStyle,
      outputFormat, resolution, narrationVolume, 0, originalVolume,
      progressStart, progressEnd, taskId
    );

    if (!result.success || !result.videoUrl) {
      throw new Error(`第 ${task.index + 1} 組合併失敗: ${result.error}`);
    }
    
    chunkResults[task.index] = result.videoUrl;
    completedChunks++;
    if (taskId) updateTaskProgress(taskId, Math.floor(20 + (completedChunks / numChunks) * 60));
  };

  // 使用簡單的並行池邏輯
  try {
    for (let i = 0; i < chunkTasks.length; i += MAX_CONCURRENT_CHUNKS) {
      const batch = chunkTasks.slice(i, i + MAX_CONCURRENT_CHUNKS);
      await Promise.all(batch.map(task => processChunk(task)));
    }
  } catch (error: any) {
    return { success: false, error: error.message };
  }

  // 最後一步：最終匯總
  console.log(`[ParallelMerge] 🎬 正在進行最終匯總合併...`);
  if (taskId) updateTaskProgress(taskId, 85);
  
  return await performActualMerge(
    chunkResults, 
    chunkResults.map(() => ""), 
    chunkResults.map(() => ""), 
    bgmType, 
    "none", 
    outputFormat, resolution, 100, bgmVolume, 100,
    85, 95, taskId
  );
}

/**
 * 實際執行 FFmpeg 合併的內部函數
 */
async function performActualMerge(
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
    if (taskId) updateTaskProgress(taskId, 85);
    const outputPath = `${tempDir}/merged_output.mp4`;
    
    // ✅ 新增：檢查每個片段的時長和大小
    console.log(`[Concat] 📝 準備合併 ${normalizedPaths.length} 個片段`);
    let totalExpectedDuration = 0;
    for (let i = 0; i < normalizedPaths.length; i++) {
      const path = normalizedPaths[i];
      if (fs.existsSync(path)) {
        const stats = fs.statSync(path);
        try {
          const { stdout: durationStr } = await execAsync(
            `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${path}"`,
            { timeout: 10000 }
          );
          const duration = parseFloat(durationStr.trim());
          totalExpectedDuration += duration;
          console.log(`[Concat] 片段 ${i + 1}: ${path.split('/').pop()} - ${(stats.size / 1024 / 1024).toFixed(2)} MB, ${duration.toFixed(2)}秒`);
        } catch (e) {
          console.log(`[Concat] 片段 ${i + 1}: ${path.split('/').pop()} - ${(stats.size / 1024 / 1024).toFixed(2)} MB, 時長未知`);
        }
      } else {
        console.log(`[Concat] ❌ 片段 ${i + 1} 不存在: ${path}`);
      }
    }
    console.log(`[Concat] 📊 預期總時長: ${totalExpectedDuration.toFixed(2)}秒`);
    
    // 創建 concat 列表
    const listPath = `${tempDir}/concat_list.txt`;
    const validPaths = normalizedPaths.filter(p => fs.existsSync(p));
    if (validPaths.length < normalizedPaths.length) {
      console.warn(`[Concat] ⚠️ 有 ${normalizedPaths.length - validPaths.length} 個片段不存在，將被跳過`);
    }
    if (validPaths.length === 0) {
      return { success: false, error: "沒有有效的視頻片段可合併" };
    }
    const listContent = validPaths.map(p => `file '${p}'`).join("\n");
    fs.writeFileSync(listPath, listContent);
    console.log(`[LocalFFmpeg] 📝 Concat 列表 (${validPaths.length} 個有效片段):\n${listContent}`);

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
      // ✅ 優化：降低 maxBuffer 以減少內存使用
      const { stdout, stderr } = await execAsync(mergeCmd, { 
        timeout: 300000, // 5 分鐘超時
        maxBuffer: 20 * 1024 * 1024 // ✅ 降低到 20MB
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

    // 步驟 4：上傳到 R2
    console.log(`[LocalFFmpeg] 📤 上傳最終視頻到 R2...`);
    if (taskId) updateTaskProgress(taskId, 95);
    const videoUrl = await uploadMergedVideo(outputPath);

    // 清理臨時文件
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
      console.log(`[LocalFFmpeg] 🗑️ 清理臨時目錄`);
      
      // ✅ 新增：強制垃圾回收以釋放內存
      if (global.gc) {
        global.gc();
        console.log(`[LocalFFmpeg] 🧹 已觸發垃圾回收`);
      }
    } catch {}

    if (uploadedUrl) {
      // ✅ 新增：驗證上傳的 URL 是否包含 'merged'
      const isMergedUrl = uploadedUrl.includes('merged');
      console.log(`[LocalFFmpeg] 🔍 URL 驗證: ${isMergedUrl ? '✅ 包含 merged' : '⚠️ 不包含 merged'}`);
      console.log(`[LocalFFmpeg] 📤 返回 URL: ${uploadedUrl}`);
      
      mergeStats.localSuccesses++;
      return { success: true, videoUrl: uploadedUrl };
    }

    console.error(`[LocalFFmpeg] ❌ 上傳失敗，沒有獲得 URL`);
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
      // ✅ 修復：使用 duration=longest 確保旁白不被截斷，並使用 tpad 填充視頻最後一幀
      console.log(`[Normalize] 🎤 混合旁白音頻 (完整模式): ${audioPath}`);
      
      cmd = [
        "ffmpeg", "-y",
        "-i", `"${inputPath}"`,
        "-i", `"${audioPath}"`,
        "-filter_complex",
        `"[0:v]${videoFilter},tpad=stop_mode=clone:stop_duration=2[v_padded];[0:a]volume=${origVol}[a0];[1:a]volume=${narrVol}[a1];[a0][a1]amix=inputs=2:duration=longest:dropout_transition=2[aout]"`,
        "-map", '"[v_padded]"',
        "-map", '"[aout]"',
        "-shortest", // 確保在音頻結束時停止
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

    await execAsync(cmd, FFMPEG_EXEC_CONFIG);

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
      // ✅ 優化：添加 User-Agent 和更長的超時
      const curlCmd = `curl -L -f --max-time 60 --retry 3 --retry-delay 2 -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" -o "${localPath}" "${url}"`;
      await execAsync(curlCmd, { 
        timeout: 70000, // 70 秒
        maxBuffer: 20 * 1024 * 1024 // ✅ 增加到 20MB
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
 * 用 ffprobe 驗證媒體文件有效性（支持視頻和音頻）
 * ✅ 改進：先檢測音頻流，失敗則檢測視頻流（避免擴展名依賴）
 */
async function validateVideoWithFFprobe(filePath: string): Promise<boolean> {
  try {
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(exec);

    // ✅ 改進：先嘗試檢測音頻流，失敗則檢測視頻流
    try {
      const { stdout: audioCheck } = await execAsync(
        `ffprobe -v error -select_streams a:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
        { timeout: 10000 }
      );
      
      if (audioCheck.trim()) {
        console.log(`[FFprobe] ✅ 音頻編碼: ${audioCheck.trim()}`);
        return true;
      }
    } catch (audioError) {
      // 沒有音頻流，繼續嘗試視頻流
      console.log(`[FFprobe] ℹ️ 無音頻流，嘗試檢測視頻流...`);
    }

    // 檢查視頻流
    const { stdout: videoCheck } = await execAsync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
      { timeout: 10000 }
    );
    
    if (videoCheck.trim()) {
      console.log(`[FFprobe] ✅ 視頻編碼: ${videoCheck.trim()}`);
      return true;
    }

    console.log(`[FFprobe] ⚠️ 文件無有效的音頻或視頻流`);
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
  
  // ✅ 優化：先獲取文件大小，不立即讀取整個文件
  const stats = fs.statSync(localPath);
  const fileSizeMB = (stats.size / 1024 / 1024).toFixed(2);
  const fileName = `merged_${Date.now()}_${Math.random().toString(36).substring(7)}.mp4`;
  
  console.log(`[Upload] 📤 開始上傳合併後的視頻（${fileSizeMB} MB）...`);
  
  // ✅ 優化：延遲讀取文件，只在需要時才讀取
  let fileBuffer: Buffer | null = null;
  const getFileBuffer = () => {
    if (!fileBuffer) {
      fileBuffer = fs.readFileSync(localPath);
    }
    return fileBuffer;
  };

  // ========================================
  // 方案 0：Cloudflare R2（主存儲，最穩定）
  // ========================================
  if (isR2Configured()) {
    try {
      console.log(`[Upload] 嘗試 Cloudflare R2...`);
      const url = await uploadVideoToR2(getFileBuffer(), fileName);
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
    const blob = new Blob([getFileBuffer()], { type: "video/mp4" });
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
    const blob = new Blob([getFileBuffer()], { type: "video/mp4" });
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
    const blob = new Blob([getFileBuffer()], { type: "video/mp4" });
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
    const blob = new Blob([getFileBuffer()], { type: "video/mp4" });
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
      body: getFileBuffer(),
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
      getFileBuffer(),
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
    const blob = new Blob([getFileBuffer()], { type: "video/mp4" });

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


/**
 * 🖼️ 檢查 URL 是否為圖片格式
 */
export function isImageUrl(url: string): boolean {
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
  const lowerUrl = url.toLowerCase();
  return imageExtensions.some(ext => lowerUrl.includes(ext));
}

/**
 * 🎬 將單張圖片轉換為靜態視頻
 * 
 * @param imageUrl 圖片 URL
 * @param durationSec 視頻時長（秒）
 * @returns 視頻 URL
 */
export async function generateStillVideoFromImage(
  imageUrl: string,
  durationSec: number = 3,
  prompt: string = "A gentle, subtle motion with minimal movement, maintaining the original scene composition."
): Promise<string> {
  console.log(`[StillVideo] 將圖片轉換為 ${durationSec} 秒視頻...`);
  console.log(`[StillVideo] 圖片 URL: ${imageUrl.substring(0, 100)}...`);
  
  const { getNextApiKey, API_ENDPOINTS } = await import("./videoConfig");
  const apiKey = getNextApiKey();
  
  // 方案 1：嘗試使用 Kling 圖片轉視頻
  try {
    console.log(`[StillVideo] 嘗試使用 Kling 圖片轉視頻...`);
    const klingResponse = await fetch(`${API_ENDPOINTS.vectorEngine}/kling/v1/videos/image2video`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model_name: "kling-v1-6",
        image: imageUrl,
        prompt: prompt,
        duration: "5",
        mode: "std",
      }),
    });

    if (klingResponse.ok) {
      const klingData = await klingResponse.json();
      const taskId = klingData.data?.task_id;
      
      if (taskId) {
        console.log(`[StillVideo] Kling 任務已提交: ${taskId}`);
        
        // 輪詢等待完成（最多 5 分鐘）
        for (let i = 0; i < 60; i++) {
          await new Promise(resolve => setTimeout(resolve, 5000));
          
          const queryResponse = await fetch(
            `${API_ENDPOINTS.vectorEngine}/kling/v1/videos/image2video/${taskId}`,
            { headers: { "Authorization": `Bearer ${apiKey}` } }
          );

          if (queryResponse.ok) {
            const data = await queryResponse.json();
            console.log(`[StillVideo] Kling 狀態: ${data.data?.task_status}`);
            
            if (data.data?.task_status === "succeed") {
              const videoUrl = data.data.task_result?.videos?.[0]?.url;
              if (videoUrl) {
                console.log(`[StillVideo] ✅ Kling 轉換成功: ${videoUrl.substring(0, 100)}...`);
                return videoUrl;
              }
            }
            
            if (data.data?.task_status === "failed") {
              console.warn(`[StillVideo] Kling 生成失敗，嘗試 Runway...`);
              break;
            }
          }
        }
      }
    } else {
      console.warn(`[StillVideo] Kling API 返回 ${klingResponse.status}，嘗試 Runway...`);
    }
  } catch (error) {
    console.error(`[StillVideo] Kling 失敗:`, error);
  }
  
  // 方案 2：嘗試使用 Runway 圖片轉視頻
  try {
    console.log(`[StillVideo] 嘗試使用 Runway 圖片轉視頻...`);
    const runwayResponse = await fetch(`${API_ENDPOINTS.vectorEngine}/runwayml/v1/image_to_video`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gen3a_turbo",
        promptImage: imageUrl,
        promptText: prompt,
        duration: 10,
        ratio: "16:9",
      }),
    });

    if (runwayResponse.ok) {
      const runwayData = await runwayResponse.json();
      const taskId = runwayData.id;
      
      if (taskId) {
        console.log(`[StillVideo] Runway 任務已提交: ${taskId}`);
        
        // 輪詢等待完成（最多 5 分鐘）
        for (let i = 0; i < 60; i++) {
          await new Promise(resolve => setTimeout(resolve, 5000));
          
          const queryResponse = await fetch(
            `${API_ENDPOINTS.vectorEngine}/runwayml/v1/tasks/${taskId}`,
            { headers: { "Authorization": `Bearer ${apiKey}` } }
          );

          if (queryResponse.ok) {
            const data = await queryResponse.json();
            console.log(`[StillVideo] Runway 狀態: ${data.status}`);
            
            if (data.status === "SUCCEEDED" && data.output?.[0]) {
              console.log(`[StillVideo] ✅ Runway 轉換成功: ${data.output[0].substring(0, 100)}...`);
              return data.output[0];
            }
            
            if (data.status === "FAILED") {
              console.warn(`[StillVideo] Runway 生成失敗`);
              break;
            }
          }
        }
      }
    } else {
      console.warn(`[StillVideo] Runway API 返回 ${runwayResponse.status}`);
    }
  } catch (error) {
    console.error(`[StillVideo] Runway 失敗:`, error);
  }
  
  // 所有方案都失敗，返回原始圖片
  console.warn(`[StillVideo] ⚠️ 所有圖片轉視頻方案都失敗，返回原始圖片`);
  return imageUrl;
}

/**
 * 🎬 將多張圖片合併為一個視頻
 * 每張圖片顯示指定的時長
 * 
 * @param imageUrls 圖片 URL 陣列
 * @param durationPerImage 每張圖片的顯示時長（秒）
 * @returns 合併後的視頻 URL
 */
export async function generateMultiImageVideo(
  imageUrls: string[],
  durationPerImage: number = 2.67,
  prompts?: string[]
): Promise<string> {
  console.log(`[MultiImageVideo] 開始將 ${imageUrls.length} 張圖片轉換為視頻...`);
  
  if (imageUrls.length === 0) {
    throw new Error("沒有圖片可以轉換");
  }
  
  // 方案：只轉換第一張圖片為視頻（簡化方案，避免耗費過多資源）
  // 這樣可以確保混合模式能夠正常工作
  console.log(`[MultiImageVideo] 使用第一張圖片轉換為視頻...`);
  
  const prompt = prompts?.[0] || "A gentle, cinematic motion with subtle camera movement, bringing the scene to life.";
  
  try {
    const videoUrl = await generateStillVideoFromImage(imageUrls[0], durationPerImage, prompt);
    
    if (!isImageUrl(videoUrl)) {
      console.log(`[MultiImageVideo] ✅ 圖片轉視頻成功: ${videoUrl.substring(0, 100)}...`);
      return videoUrl;
    } else {
      console.warn(`[MultiImageVideo] 圖片轉視頻失敗，返回原始圖片`);
      return imageUrls[0];
    }
  } catch (error) {
    console.error(`[MultiImageVideo] 轉換失敗:`, error);
    return imageUrls[0];
  }
}
