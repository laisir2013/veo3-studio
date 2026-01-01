import { storagePut, getPublicUrl } from "./storage";
import path from "path";
import fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// 視頻標準化配置 - 針對 2GB RAM 優化的高質量設置
export const NORMALIZE_CONFIG = {
  width: 1280,
  height: 720,
  fps: 30,
  videoCodec: "libx264",
  audioCodec: "aac",
  audioBitrate: "192k",
  audioSampleRate: 44100,
  audioChannels: 2,
  preset: "fast", // 平衡速度與內存
  crf: 23,
  pixelFormat: "yuv420p",
  maxrate: "2M",
  bufsize: "4M"
};

export interface MergeResult {
  success: boolean;
  videoUrl?: string;
  error?: string;
  mode?: "cloud" | "local" | "emergency";
  segmentUrls?: string[];
  taskId?: string;
  status?: "pending" | "processing" | "completed" | "failed";
  progress?: number;
}

// 任務狀態管理
const mergeTasks = new Map<string, MergeResult>();

/**
 * 獲取合併任務狀態
 */
export function getMergeTaskStatus(taskId: string): MergeResult {
  return mergeTasks.get(taskId) || { success: false, error: "任務不存在", status: "failed" };
}

/**
 * 主入口：合併視頻
 */
export async function mergeVideos(params: {
  videoUrls: string[];
  audioUrls: string[];
  bgmUrl?: string;
  bgmVolume?: number;
  narrationVolume?: number;
  originalVolume?: number;
  isHybridMode?: boolean;
  taskId?: string;
}): Promise<MergeResult> {
  const taskId = params.taskId || `merge_${Date.now()}`;
  
  // 初始化任務狀態
  mergeTasks.set(taskId, { 
    success: false, 
    status: "processing", 
    progress: 0, 
    taskId 
  });

  // 異步執行合併過程
  processMerge(params, taskId).catch(err => {
    console.error(`[MergeTask] 任務 ${taskId} 失敗:`, err);
    mergeTasks.set(taskId, { 
      success: false, 
      status: "failed", 
      error: err.message, 
      taskId 
    });
  });

  // 立即返回任務 ID
  return { success: true, taskId, status: "processing" };
}

/**
 * 核心合併邏輯 (異步執行)
 */
async function processMerge(params: any, taskId: string) {
  const { videoUrls, audioUrls, bgmUrl, bgmVolume = 30, narrationVolume = 80, originalVolume = 50 } = params;
  const tempDir = path.join("/tmp", `veo3-merge-${taskId}`);
  
  try {
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    
    const totalSegments = videoUrls.length;
    const normalizedFiles: string[] = [];

    // 1. 分批處理片段 (每次處理 3 個，避免內存峰值)
    const batchSize = 3;
    for (let i = 0; i < totalSegments; i += batchSize) {
      const batch = videoUrls.slice(i, i + batchSize);
      const batchAudios = audioUrls.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (url: string, index: number) => {
        const realIndex = i + index;
        const segmentPath = path.join(tempDir, `seg_${realIndex}.mp4`);
        const audioPath = path.join(tempDir, `audio_${realIndex}.mp3`);
        const outputPath = path.join(tempDir, `norm_${realIndex}.mp4`);

        // 下載素材
        await downloadFile(url, segmentPath);
        if (batchAudios[index]) await downloadFile(batchAudios[index], audioPath);

        // 標準化片段
        await normalizeVideo(segmentPath, audioPath, outputPath, {
          narrationVolume,
          originalVolume
        });

        return outputPath;
      });

      const results = await Promise.all(batchPromises);
      normalizedFiles.push(...results);
      
      // 更新進度
      const progress = Math.round(((i + batch.length) / totalSegments) * 80);
      mergeTasks.set(taskId, { success: false, status: "processing", progress, taskId });
    }

    // 2. 處理背景音樂
    let finalInput = "";
    const listPath = path.join(tempDir, "list.txt");
    const listContent = normalizedFiles.map(f => `file '${f}'`).join("\n");
    fs.writeFileSync(listPath, listContent);

    const mergedPath = path.join(tempDir, "merged_temp.mp4");
    const finalPath = path.join(tempDir, "final_output.mp4");

    // 3. 執行合併
    console.log(`[MergeTask] 執行最終合併...`);
    let mergeCmd = "";
    if (bgmUrl) {
      const bgmPath = path.join(tempDir, "bgm.mp3");
      await downloadFile(bgmUrl, bgmPath);
      const bgmVol = bgmVolume / 100;
      
      mergeCmd = [
        "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", `"${listPath}"`,
        "-stream_loop", "-1", "-i", `"${bgmPath}"`,
        "-filter_complex", `"[0:a]volume=1.0[a0];[1:a]volume=${bgmVol},apad[a1];[a0][a1]amix=inputs=2:duration=first:dropout_transition=2[aout]"`,
        "-map", "0:v", "-map", '"[aout]"',
        "-c:v", NORMALIZE_CONFIG.videoCodec, "-preset", "ultrafast", "-crf", "28",
        "-c:a", NORMALIZE_CONFIG.audioCodec, "-shortest", `"${finalPath}"`
      ].join(" ");
    } else {
      mergeCmd = `ffmpeg -y -f concat -safe 0 -i "${listPath}" -c copy "${finalPath}"`;
    }

    await execAsync(mergeCmd, { timeout: 600000 }); // 10 分鐘超時

    // 4. 上傳結果
    mergeTasks.set(taskId, { success: false, status: "processing", progress: 90, taskId });
    const videoUrl = await uploadMergedVideo(finalPath);

    if (videoUrl) {
      mergeTasks.set(taskId, { 
        success: true, 
        status: "completed", 
        progress: 100, 
        videoUrl, 
        taskId 
      });
    } else {
      throw new Error("上傳失敗");
    }

  } catch (error: any) {
    console.error(`[MergeTask] 錯誤:`, error);
    mergeTasks.set(taskId, { 
      success: false, 
      status: "failed", 
      error: error.message, 
      taskId 
    });
  } finally {
    // 強制清理
    try {
      if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {}
  }
}

/**
 * 輔助：下載文件
 */
async function downloadFile(url: string, dest: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`下載失敗: ${url}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(dest, buffer);
}

/**
 * 輔助：標準化視頻
 */
async function normalizeVideo(inputPath: string, audioPath: string, outputPath: string, options: any) {
  const hasAudio = audioPath && fs.existsSync(audioPath);
  const narrationVol = options.narrationVolume / 100;
  const originalVol = options.originalVolume / 100;

  let cmd = "";
  if (hasAudio) {
    cmd = [
      "ffmpeg", "-y", "-i", `"${inputPath}"`, "-i", `"${audioPath}"`,
      "-filter_complex", `"[0:a]volume=${originalVol}[a0];[1:a]volume=${narrationVol}[a1];[a0][a1]amix=inputs=2:duration=first[aout]"`,
      "-map", "0:v", "-map", '"[aout]"',
      "-s", `${NORMALIZE_CONFIG.width}x${NORMALIZE_CONFIG.height}`,
      "-r", String(NORMALIZE_CONFIG.fps),
      "-c:v", NORMALIZE_CONFIG.videoCodec, "-preset", "ultrafast", "-crf", "28",
      "-c:a", NORMALIZE_CONFIG.audioCodec, `"${outputPath}"`
    ].join(" ");
  } else {
    cmd = `ffmpeg -y -i "${inputPath}" -s ${NORMALIZE_CONFIG.width}x${NORMALIZE_CONFIG.height} -r ${NORMALIZE_CONFIG.fps} -c:v ${NORMALIZE_CONFIG.videoCodec} -preset ultrafast -crf 28 "${outputPath}"`;
  }

  await execAsync(cmd, { timeout: 180000 });
}

/**
 * 輔助：上傳合併後的視頻 (流式上傳優化)
 */
async function uploadMergedVideo(filePath: string): Promise<string | null> {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const fileName = `merged_${Date.now()}.mp4`;
    const dateStr = new Date().toISOString().split('T')[0];
    const key = `videos/merged/${dateStr}/${fileName}`;
    
    const success = await storagePut(key, fileBuffer, "video/mp4");
    return success ? getPublicUrl(key) : null;
  } catch (error) {
    return null;
  }
}

// 導出異步合併啟動函數
export function startAsyncMerge(params: any, taskId: string) {
  return mergeVideos({ ...params, taskId });
}
