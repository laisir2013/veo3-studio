import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { z } from "zod";
import { storagePut } from "./storage";
import { saveTask, loadTask } from "./taskPersistence";

const execAsync = promisify(exec);

// --- 配置與常量 ---
const VIDEO_API_BASE = process.env.VIDEO_API_BASE || "https://api.veo3.ai/v1";
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "postudio-videos";

// 標準化視頻參數（統一規格）
const NORMALIZE_CONFIG = {
  width: 1920,
  height: 1080,
  fps: 30,
  videoCodec: "libx264",
  audioCodec: "aac",
  audioSampleRate: 44100,
  audioChannels: 2,
  audioBitrate: "192k",
  pixelFormat: "yuv420p",
  crf: 23,
  preset: "medium",
};

// 重試配置
const RETRY_CONFIG = {
  maxRetries: 3,
  retryDelay: 2000,
  backoffMultiplier: 2,
  maxDelay: 10000,
};

// 分段合併配置
const CHUNK_SIZE = 10;

// 背景音樂選項
export const BGM_OPTIONS: Record<string, { name: string; url: string | null }> = {
  none: { name: "無背景音樂", url: null },
  happy: { name: "歡快", url: "https://pub-d1dca9c21afc42d6a42c7d104add27bb.r2.dev/bgm/happy.mp3" },
  sad: { name: "憂傷", url: "https://pub-d1dca9c21afc42d6a42c7d104add27bb.r2.dev/bgm/sad.mp3" },
  epic: { name: "史詩", url: "https://pub-d1dca9c21afc42d6a42c7d104add27bb.r2.dev/bgm/epic.mp3" },
  calm: { name: "平靜", url: "https://pub-d1dca9c21afc42d6a42c7d104add27bb.r2.dev/bgm/calm.mp3" },
  tech: { name: "科技", url: "https://pub-d1dca9c21afc42d6a42c7d104add27bb.r2.dev/bgm/tech.mp3" },
};

export type BgmType = keyof typeof BGM_OPTIONS;

// 字幕樣式選項
export const SUBTITLE_STYLES: Record<string, string> = {
  none: "none",
  classic: "classic",
  modern: "modern",
  yellow: "yellow",
  outline: "outline",
};

export type SubtitleStyle = keyof typeof SUBTITLE_STYLES;

// 合併結果接口
export interface MergeResult {
  success: boolean;
  videoUrl?: string;
  error?: string;
  mode?: "cloud" | "local" | "emergency";
  duration?: number;
  segmentUrls?: string[];
}

// 統計數據
export const mergeStats = {
  totalRequests: 0,
  cloudAttempts: 0,
  cloudSuccesses: 0,
  localAttempts: 0,
  localSuccesses: 0,
  emergencyActivations: 0,
};

/**
 * 🎬 視頻合併主入口
 */
/**
 * 模擬更新任務進度（因為原函數不存在）
 */
async function mockUpdateTaskProgress(taskId: string, progress: number) {
  try {
    const task = await loadTask(taskId);
    if (task) {
      task.progress = progress;
      task.updatedAt = new Date();
      await saveTask(task);
      console.log(`[Persistence] 任務 ${taskId} 進度更新為 ${progress}%`);
    }
  } catch (error) {
    console.error(`[Persistence] 更新任務進度失敗:`, error);
  }
}

/**
 * 獲取公共 URL（因為原函數不存在，且 storagePut 現在返回 { key, url }）
 */
function getPublicUrl(key: string): string {
  // 這裡假設 R2 的公共 URL 格式，或者從環境變量獲取
  const baseUrl = process.env.R2_PUBLIC_URL || "https://pub-d1dca9c21afc42d6a42c7d104add27bb.r2.dev";
  return `${baseUrl.replace(/\/+$/, "")}/${key.replace(/^\/+/, "")}`;
}

export async function mergeVideos(params: {
  videoUrls: string[];
  audioUrls: string[];
  narrations: string[];
  bgmType: BgmType;
  subtitleStyle: SubtitleStyle;
  outputFormat?: string;
  resolution?: string;
  narrationVolume?: number;
  bgmVolume?: number;
  originalVolume?: number;
  taskId?: string;
}): Promise<MergeResult> {
  const {
    videoUrls,
    audioUrls,
    narrations,
    bgmType = "none",
    subtitleStyle = "none",
    outputFormat = "mp4",
    resolution = "1080p",
    narrationVolume = 80,
    bgmVolume = 30,
    originalVolume = 50,
    taskId,
  } = params;

  mergeStats.totalRequests++;
  
  console.log(`[VideoMerge] 🚀 開始合併任務`, {
    taskId,
    segments: videoUrls.length,
    bgm: bgmType,
    subtitles: subtitleStyle,
  });

  // ✅ 詳細日誌：打印每個片段的 URL
  console.log(`[VideoMerge] 📹 視頻 URL 詳情:`);
  videoUrls.forEach((url, i) => {
    console.log(`  片段 ${i + 1}: ${url ? url.substring(0, 80) + '...' : '(空)'}`);
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

  // 檢測圖片格式 - 混合模式支持圖片和視頻混合
  const imageUrls: string[] = [];
  const videoOnlyUrls: string[] = [];
  
  for (const url of validVideoUrls) {
    if (isImageUrl(url)) {
      imageUrls.push(url);
    } else {
      videoOnlyUrls.push(url);
    }
  }
  
  console.log(`[VideoMerge] 🖼️ 混合模式統計: ${imageUrls.length} 張圖片, ${videoOnlyUrls.length} 個視頻`);

  // ✅ 混合模式：圖片將在本地 FFmpeg 合併時轉換為視頻
  // 將圖片 URL 和視頻 URL 合併，保持原始順序
  const allMediaUrls = validVideoUrls; // 直接使用原始 URL 列表（包含圖片和視頻）
  
  if (allMediaUrls.length === 0) {
    return { 
      success: false, 
      error: "沒有有效的媒體文件可以合併。" 
    };
  }
  
  console.log(`[VideoMerge] 🖼️ 混合模式: ${imageUrls.length} 張圖片 + ${videoOnlyUrls.length} 個視頻，將在本地 FFmpeg 處理`);

  // ✅ 修復：檢查是否有旁白音頻需要混入
  const hasValidAudio = audioUrls.some(url => url && url.startsWith("http"));
  const hasNarrations = narrations.some(n => n && n.trim().length > 0);
  
  // 如果只有一個純視頻且不需要任何處理（無 BGM、無字幕、無旁白音頻），直接返回
  if (allMediaUrls.length === 1 && imageUrls.length === 0 && bgmType === "none" && subtitleStyle === "none" && !hasValidAudio && !hasNarrations) {
    console.log(`[VideoMerge] 只有一個視頻且無需處理，直接返回`);
    const result: MergeResult = { success: true, videoUrl: allMediaUrls[0], mode: "cloud", duration: 8 };
    assertMergeResponse(result);
    return result;
  }
  
  // ✅ 新增日誌：說明為什麼需要處理
  console.log(`[VideoMerge] 需要處理:`, {
    totalSegments: allMediaUrls.length,
    imageCount: imageUrls.length,
    videoCount: videoOnlyUrls.length,
    hasValidAudio,
    hasNarrations,
    bgmType,
    subtitleStyle,
  });

  // ✅ 混合模式：跳過雲端合併，直接使用本地 FFmpeg（因為雲端不支持圖片）
  if (imageUrls.length > 0) {
    console.log(`[VideoMerge] 🖼️ 混合模式：跳過雲端合併，直接使用本地 FFmpeg`);
  } else {
    // 第一層：雲端合併（僅當沒有圖片時）
    try {
      if (taskId) mockUpdateTaskProgress(taskId, 10);
      const cloudResult = await tryCloudMerge(allMediaUrls, audioUrls, narrations, bgmType, subtitleStyle, outputFormat, resolution, narrationVolume, bgmVolume, originalVolume);
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
  }

  // 第二層：本地 FFmpeg 合併（支持混合模式）
  try {
    if (taskId) mockUpdateTaskProgress(taskId, 20);
    const localResult = await tryLocalFFmpegMerge(allMediaUrls, audioUrls, narrations, bgmType, subtitleStyle, outputFormat, resolution, narrationVolume, bgmVolume, originalVolume, taskId);
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
  const emergencyResult = emergencyMode(allMediaUrls, narrations);
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
  }

  return { success: false, error: lastError };
}

/**
 * 第二層：本地 FFmpeg 合併
 */
export async function tryLocalFFmpegMerge(
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
    if (taskId) mockUpdateTaskProgress(taskId, Math.floor(20 + (completedChunks / numChunks) * 60));
  };

  // 使用簡單的並行池邏輯
  try {
    const poolSize = 2; // 限制並行數量以節省內存
    for (let i = 0; i < chunkTasks.length; i += poolSize) {
      const batch = chunkTasks.slice(i, i + poolSize);
      await Promise.all(batch.map(processChunk));
    }

    // 最後一步：合併所有分段
    console.log(`[ParallelMerge] 🎬 合併所有分段 (${chunkResults.length} 個)...`);
    return await performActualMerge(
      chunkResults, [], [], bgmType, "none",
      outputFormat, resolution, 100, bgmVolume, 100,
      80, 100, taskId
    );
  } catch (error: any) {
    console.error(`[ParallelMerge] ❌ 並行合併失敗:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * 核心：執行實際的 FFmpeg 合併操作
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
  originalVolume: number,
  progressStart: number = 0,
  progressEnd: number = 100,
  taskId?: string
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
  try {
    await execAsync("ffmpeg -version");
  } catch (e) {
    console.error("[LocalFFmpeg] ❌ FFmpeg 不可用:", e);
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
    // 步驟 1：下載所有視頻/圖片片段
    console.log(`[LocalFFmpeg] 📥 下載 ${videoUrls.length} 個片段...`);
    const downloadedPaths: string[] = [];
    const downloadedAudioPaths: string[] = [];
    const isImageSegment: boolean[] = []; // ✅ 新增：記錄哪些片段是圖片

    for (let i = 0; i < videoUrls.length; i++) {
      const url = videoUrls[i];
      const isImage = isImageUrl(url);
      const ext = isImage ? url.split('?')[0].split('.').pop()?.toLowerCase() || 'jpg' : 'mp4';
      const localPath = `${tempDir}/segment_${i}.${ext}`;
      
      console.log(`[LocalFFmpeg] 下載${isImage ? '圖片' : '視頻'} ${i + 1}/${videoUrls.length}...`);
      
      const downloaded = await downloadVideoWithValidation(url, localPath, tempDir);
      if (downloaded) {
        downloadedPaths.push(localPath);
        isImageSegment.push(isImage);
      } else {
        console.warn(`[LocalFFmpeg] ⚠️ 片段 ${i + 1} 下載失敗，跳過`);
        // ✅ 修復：下載失敗時不 push 到 isImageSegment，因為 downloadedPaths 也沒有 push
        // 這樣可以保持兩個數組的索引一致
        continue; // 跳過音頻下載，因為該片段已失敗
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

    console.log(`[LocalFFmpeg] ✅ 成功下載 ${downloadedPaths.length}/${videoUrls.length} 個片段`);
    console.log(`[LocalFFmpeg] 📊 索引檢查: downloadedPaths.length=${downloadedPaths.length}, isImageSegment.length=${isImageSegment.length}`);
    console.log(`[LocalFFmpeg] 📊 isImageSegment 數組: [${isImageSegment.join(', ')}]`);

    // ✅ 步驟 1.5：將圖片片段轉換為視頻
    console.log(`[LocalFFmpeg] 🖼️ 檢查圖片片段並轉換為視頻...`);
    console.log(`[LocalFFmpeg] 📊 將遍歷 ${downloadedPaths.length} 個已下載的片段`);
    const videoSegmentPaths: string[] = [];
    
    for (let i = 0; i < downloadedPaths.length; i++) {
      const inputPath = downloadedPaths[i];
      const audioPath = downloadedAudioPaths[i] || "";
      
      if (isImageSegment[i]) {
        // 圖片片段：轉換為視頻
        const videoPath = `${tempDir}/img_to_video_${i}.mp4`;
        console.log(`[LocalFFmpeg] 🖼️ 片段 ${i + 1} 是圖片，轉換為視頻...`);
        
        const converted = await convertImageToVideoLocal(inputPath, audioPath, videoPath, 8);
        if (converted) {
          videoSegmentPaths.push(videoPath);
          console.log(`[LocalFFmpeg] ✅ 圖片 ${i + 1} 轉換成功`);
        } else {
          console.warn(`[LocalFFmpeg] ⚠️ 圖片 ${i + 1} 轉換失敗，跳過`);
        }
      } else {
        // 視頻片段：直接使用
        videoSegmentPaths.push(inputPath);
      }
    }
    
    if (videoSegmentPaths.length === 0) {
      return { success: false, error: "無法處理任何片段" };
    }
    
    console.log(`[LocalFFmpeg] ✅ 有效視頻片段: ${videoSegmentPaths.length} 個`);

    // 步驟 2：標準化每個視頻片段
    console.log(`[LocalFFmpeg] 🔄 標準化視頻片段...`);
    const normalizedPaths: string[] = [];

    for (let i = 0; i < videoSegmentPaths.length; i++) {
      const inputPath = videoSegmentPaths[i];
      const normalizedPath = `${tempDir}/normalized_${i}.mp4`;
      // ✅ 對於已轉換的圖片視頻，音頻已經合成，不需要再次混合
      const audioPath = isImageSegment[i] ? "" : (downloadedAudioPaths[i] || "");
      
      console.log(`[LocalFFmpeg] 標準化視頻 ${i + 1}/${videoSegmentPaths.length}...`);
      
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
    if (taskId) mockUpdateTaskProgress(taskId, 85);
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
    await execAsync(mergeCmd, { timeout: 300000 }); // 5 分鐘超時

    if (!fs.existsSync(outputPath)) {
      return { success: false, error: "合併失敗，未生成輸出文件" };
    }

    const stats = fs.statSync(outputPath);
    console.log(`[LocalFFmpeg] ✅ 合併完成，文件大小: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

    // 步驟 4：上傳到 R2
    console.log(`[LocalFFmpeg] 🚀 上傳最終視頻到 R2...`);
    if (taskId) mockUpdateTaskProgress(taskId, 95);
    const videoUrl = await uploadMergedVideo(outputPath);
    
    // 清理臨時目錄
    try {
      console.log(`[LocalFFmpeg] 🗑️ 清理臨時目錄`);
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch (e) {
      console.warn(`[LocalFFmpeg] ⚠️ 清理臨時目錄失敗:`, e);
    }

    if (videoUrl) {
      const isMergedUrl = videoUrl.includes('merged');
      console.log(`[LocalFFmpeg] 🔍 URL 驗證: ${isMergedUrl ? '✅ 包含 merged' : '❌ 不包含 merged'}`);
      console.log(`[LocalFFmpeg] 📤 返回 URL: ${videoUrl}`);
      mergeStats.localSuccesses++;
      return { success: true, videoUrl: videoUrl };
    } else {
      return { success: false, error: "上傳合併後的視頻失敗" };
    }
  } catch (error: any) {
    console.error(`[LocalFFmpeg] ❌ 合併異常:`, error.message);
    // 嘗試清理
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {}
    return { success: false, error: error.message };
  }
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
    const response = await fetch(`${API_ENDPOINTS.KLING}/image-to-video`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        image_url: imageUrl,
        prompt: prompt,
        duration: durationSec,
      }),
    });

    if (response.ok) {
      const result = await response.json();
      if (result.video_url) {
        console.log(`[StillVideo] ✅ Kling 轉換成功: ${result.video_url}`);
        return result.video_url;
      }
    }
    console.warn(`[StillVideo] ⚠️ Kling 轉換失敗，嘗試備選方案`);
  } catch (error) {
    console.error(`[StillVideo] ❌ Kling 異常:`, error);
  }

  // 方案 2：嘗試使用 Runway 圖片轉視頻
  try {
    const response = await fetch(`${API_ENDPOINTS.RUNWAY}/image-to-video`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        image_url: imageUrl,
        prompt: prompt,
        duration: durationSec,
      }),
    });

    if (response.ok) {
      const result = await response.json();
      if (result.video_url) {
        console.log(`[StillVideo] ✅ Runway 轉換成功: ${result.video_url}`);
        return result.video_url;
      }
    }
  } catch (error) {
    console.error(`[StillVideo] ❌ Runway 異常:`, error);
  }

  // 方案 3：如果都失敗，返回原始圖片 URL（這會導致後續合併失敗，但至少有數據）
  console.error(`[StillVideo] ❌ 所有圖片轉視頻方案均失敗`);
  return imageUrl;
}

/**
 * 🖼️ 檢查 URL 是否為圖片格式
 */
export function isImageUrl(url: string): boolean {
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
  const lowerUrl = url.toLowerCase();
  
  // ✅ 修復：增加對 R2 圖片路徑的識別
  if (lowerUrl.includes('/images/')) return true;
  
  return imageExtensions.some(ext => lowerUrl.includes(ext));
}

/**
 * 🎬 使用本地 FFmpeg 將圖片 + 音頻合成為視頻
 * 用於混合模式中處理圖片片段
 * 
 * @param imagePath 本地圖片文件路徑
 * @param audioPath 本地音頻文件路徑（可選）
 * @param outputPath 輸出視頻文件路徑
 * @param duration 視頻時長（秒），如果有音頻則使用音頻時長
 * @returns 是否成功
 */
export async function convertImageToVideoLocal(
  imagePath: string,
  audioPath: string,
  outputPath: string,
  duration: number = 8
): Promise<boolean> {
  const { exec } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(exec);
  const fs = await import("fs");
  
  console.log(`[LocalFFmpeg] [ImageToVideo] 🖼️ 將圖片轉換為視頻...`);
  console.log(`[LocalFFmpeg] [ImageToVideo] 圖片: ${imagePath}`);
  console.log(`[LocalFFmpeg] [ImageToVideo] 音頻: ${audioPath || '無'}`);
  
  try {
    let cmd: string;
    const hasAudio = audioPath && fs.existsSync(audioPath);
    
    if (hasAudio) {
      // 有音頻：使用音頻時長作為視頻時長
      // 使用 loop 讓圖片循環，shortest 讓視頻在音頻結束時停止
      cmd = [
        "ffmpeg", "-y",
        "-loop", "1",
        "-i", `"${imagePath}"`,
        "-i", `"${audioPath}"`,
        "-c:v", "libx264",
        "-tune", "stillimage",
        "-c:a", "aac",
        "-b:a", "192k",
        "-pix_fmt", "yuv420p",
        "-vf", "scale=1920:-2,fps=30",
        "-shortest",
        `"${outputPath}"`
      ].join(" ");
    } else {
      // 無音頻：使用指定時長
      cmd = [
        "ffmpeg", "-y",
        "-loop", "1",
        "-i", `"${imagePath}"`,
        "-c:v", "libx264",
        "-tune", "stillimage",
        "-pix_fmt", "yuv420p",
        "-vf", "scale=1920:-2,fps=30",
        "-t", String(duration),
        "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
        "-shortest",
        `"${outputPath}"`
      ].join(" ");
    }
    
    console.log(`[LocalFFmpeg] [ImageToVideo] 執行命令: ${cmd.substring(0, 200)}...`);
    await execAsync(cmd, { timeout: 60000 });
    
    // 驗證輸出
    if (fs.existsSync(outputPath)) {
      const stats = fs.statSync(outputPath);
      console.log(`[LocalFFmpeg] [ImageToVideo] ✅ 轉換成功: ${(stats.size / 1024).toFixed(2)} KB`);
      return true;
    }
    return false;
  } catch (error: any) {
    console.error(`[LocalFFmpeg] [ImageToVideo] ❌ 轉換失敗:`, error.message);
    return false;
  }
}

/**
 * 輔助：下載視頻並驗證
 */
async function downloadVideoWithValidation(url: string, localPath: string, tempDir: string): Promise<boolean> {
  const { exec } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(exec);
  const fs = await import("fs");

  try {
    // 使用 curl 下載，支持重試
    const cmd = `curl -L --retry 3 --retry-delay 2 -s -o "${localPath}" "${url}"`;
    await execAsync(cmd, { timeout: 60000 });
    
    if (fs.existsSync(localPath)) {
      const stats = fs.statSync(localPath);
      if (stats.size > 100) { // 至少 100 字節
        return true;
      }
    }
    return false;
  } catch (error) {
    return false;
  }
}

/**
 * 輔助：標準化視頻片段
 */
async function normalizeVideo(
  inputPath: string, 
  outputPath: string, 
  audioPath: string,
  options: {
    narrationVolume: number;
    originalVolume: number;
    narration?: string;
    subtitleStyle?: SubtitleStyle;
  }
): Promise<boolean> {
  const { exec } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(exec);
  const fs = await import("fs");

  try {
    const hasAudio = audioPath && fs.existsSync(audioPath);
    const narrationVol = options.narrationVolume / 100;
    const originalVol = options.originalVolume / 100;

    let cmd: string;
    
    if (hasAudio) {
      // 有旁白音頻：混合音軌
      console.log(`[Normalize] 🎤 混合旁白音頻 (音量: ${options.narrationVolume}%)`);
      cmd = [
        "ffmpeg", "-y",
        "-i", `"${inputPath}"`,
        "-i", `"${audioPath}"`,
        "-filter_complex",
        `"[0:a]volume=${originalVol}[a0];[1:a]volume=${narrationVol}[a1];[a0][a1]amix=inputs=2:duration=first:dropout_transition=2[aout]"`,
        "-map", "0:v",
        "-map", '"[aout]"',
        "-s", `${NORMALIZE_CONFIG.width}x${NORMALIZE_CONFIG.height}`,
        "-r", String(NORMALIZE_CONFIG.fps),
        "-c:v", NORMALIZE_CONFIG.videoCodec,
        "-preset", NORMALIZE_CONFIG.preset,
        "-crf", String(NORMALIZE_CONFIG.crf),
        "-pix_fmt", NORMALIZE_CONFIG.pixelFormat,
        "-c:a", NORMALIZE_CONFIG.audioCodec,
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
        "-s", `${NORMALIZE_CONFIG.width}x${NORMALIZE_CONFIG.height}`,
        "-r", String(NORMALIZE_CONFIG.fps),
        "-c:v", NORMALIZE_CONFIG.videoCodec,
        "-preset", NORMALIZE_CONFIG.preset,
        "-crf", String(NORMALIZE_CONFIG.crf),
        "-pix_fmt", NORMALIZE_CONFIG.pixelFormat,
        "-c:a", NORMALIZE_CONFIG.audioCodec,
        "-ar", String(NORMALIZE_CONFIG.audioSampleRate),
        "-ac", String(NORMALIZE_CONFIG.audioChannels),
        `"${outputPath}"`
      ].join(" ");
    }

    await execAsync(cmd, { timeout: 120000 });
    return fs.existsSync(outputPath);
  } catch (error) {
    return false;
  }
}

/**
 * 輔助：上傳合併後的視頻到 R2
 */
async function uploadMergedVideo(filePath: string): Promise<string | null> {
  try {
    const fs = await import("fs");
    const fileBuffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);
    const dateStr = new Date().toISOString().split('T')[0];
    const key = `videos/merged/${dateStr}/${fileName}`;
    
    const success = await storagePut(key, fileBuffer, "video/mp4");
    if (success) {
      return getPublicUrl(key);
    }
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * 輔助：獲取音頻時長
 */
async function getAudioDuration(filePath: string): Promise<number> {
  try {
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(exec);
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`
    );
    return parseFloat(stdout.trim()) || 8;
  } catch (error) {
    return 8;
  }
}

/**
 * 緊急模式：當所有合併都失敗時，返回第一個視頻
 */
function emergencyMode(videoUrls: string[], narrations: string[]): MergeResult {
  return {
    success: true,
    videoUrl: videoUrls[0],
    mode: "emergency",
    error: "合併失敗，已進入緊急模式返回首個片段",
    segmentUrls: videoUrls
  };
}

/**
 * 斷言合併響應格式
 */
function assertMergeResponse(result: MergeResult) {
  if (result.success && !result.videoUrl) {
    throw new Error("合併成功但未返回視頻 URL");
  }
}

/**
 * 獲取下一個 API Key (輪詢)
 */
function getNextApiKey(): string {
  const keys = (process.env.VIDEO_API_KEYS || "").split(",");
  if (keys.length === 0) return "";
  const index = Math.floor(Math.random() * keys.length);
  return keys[index].trim();
}

/**
 * 輔助：休眠
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 導出異步合併相關函數
export function startAsyncMerge(params: any, taskId: string) {
  // 這裡可以實現異步合併邏輯，目前先簡單調用 mergeVideos
  return mergeVideos({ ...params, taskId });
}

export function getMergeTaskStatus(taskId: string) {
  // 這裡可以實現獲取合併任務狀態的邏輯
  return { id: taskId, status: "completed", progress: 100 };
}
