import { storagePut } from "./storage";
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

// BGM 選項定義
export const BGM_OPTIONS = [
  { id: "none", name: "無背景音樂", url: "" },
  { id: "happy", name: "歡快", url: "https://pub-d1dca9c21afc42d6a42c7d104add27bb.r2.dev/audio/bgm/happy.mp3" },
  { id: "sad", name: "憂傷", url: "https://pub-d1dca9c21afc42d6a42c7d104add27bb.r2.dev/audio/bgm/sad.mp3" },
  { id: "epic", name: "史詩", url: "https://pub-d1dca9c21afc42d6a42c7d104add27bb.r2.dev/audio/bgm/epic.mp3" },
  { id: "lofi", name: "Lofi", url: "https://pub-d1dca9c21afc42d6a42c7d104add27bb.r2.dev/audio/bgm/lofi.mp3" },
];

// 字幕樣式定義
export const SUBTITLE_STYLES = [
  { id: "default", name: "默認", style: "FontSize=24,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=1" },
  { id: "white", name: "白底黑邊", style: "FontSize=24,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2" },
  { id: "black", name: "黑底白邊", style: "FontSize=24,PrimaryColour=&H00000000,OutlineColour=&H00FFFFFF,BorderStyle=1,Outline=2" },
  { id: "yellow", name: "黃底黑邊", style: "FontSize=24,PrimaryColour=&H0000FFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2" },
];

export type BgmType = "none" | "happy" | "sad" | "epic" | "lofi";
export type SubtitleStyle = "default" | "white" | "black" | "yellow";

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
 * 核心合併邏輯 (異步執行) - 支持 8 分鐘視頻的分段合併
 */
async function processMerge(params: any, taskId: string) {
  const { videoUrls, audioUrls, bgmUrl, bgmVolume = 30, narrationVolume = 80, originalVolume = 50 } = params;
  const tempDir = path.join("/tmp", `veo3-merge-${taskId}`);
  
  try {
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    
    const totalSegments = videoUrls.length;
    const normalizedFiles: string[] = [];

    // 1. 分批處理片段 (每次處理 3 個，避免內存峰值)
    // 對於 8 分鐘視頻（~60-80 片段），採用兩層分段策略
    const batchSize = 3;
    const chunkSize = 15; // 每 15 個片段為一個中間合併單位
    const intermediateChunks: string[] = [];
    
    for (let i = 0; i < totalSegments; i += batchSize) {
      const batch = videoUrls.slice(i, i + batchSize);
      const batchAudios = audioUrls.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (url: string, index: number) => {
        const realIndex = i + index;
        const segmentPath = path.join(tempDir, `seg_${realIndex}.mp4`);
        const audioPath = path.join(tempDir, `audio_${realIndex}.mp3`);
        const outputPath = path.join(tempDir, `norm_${realIndex}.mp4`);

        // 下載素材（帶重試機制）
        await downloadFileWithRetry(url, segmentPath, 3);
        if (batchAudios[index]) {
          await downloadFileWithRetry(batchAudios[index], audioPath, 3);
          // 新增：檢測並修復音頻時長
          await ensureAudioDuration(audioPath, 8);
        }

        // 標準化片段
        await normalizeVideo(segmentPath, audioPath, outputPath, {
          narrationVolume,
          originalVolume
        });
        
        // 清理原始文件以節省內存
        try {
          if (fs.existsSync(segmentPath)) fs.unlinkSync(segmentPath);
          if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
        } catch (e) {}

        return outputPath;
      });

      const results = await Promise.all(batchPromises);
      normalizedFiles.push(...results);
      
      // 當達到 chunkSize 時，進行中間合併
      if (normalizedFiles.length >= chunkSize || i + batchSize >= totalSegments) {
        const chunkIndex = intermediateChunks.length;
        const chunkFiles = normalizedFiles.splice(0, chunkSize);
        
        if (chunkFiles.length > 1) {
          const intermediateOutput = path.join(tempDir, `chunk_${chunkIndex}.mp4`);
          await mergeChunk(chunkFiles, intermediateOutput);
          intermediateChunks.push(intermediateOutput);
          
          // 清理中間文件
          chunkFiles.forEach(f => {
            try {
              if (fs.existsSync(f)) fs.unlinkSync(f);
            } catch (e) {}
          });
        } else if (chunkFiles.length === 1) {
          intermediateChunks.push(chunkFiles[0]);
        }
      }
      
      // 更新進度
      const progress = Math.round(((i + batch.length) / totalSegments) * 60);
      mergeTasks.set(taskId, { success: false, status: "processing", progress, taskId });
    }
    
    // 如果還有剩餘的標準化文件，添加到中間塊
    if (normalizedFiles.length > 0) {
      if (normalizedFiles.length > 1) {
        const chunkIndex = intermediateChunks.length;
        const intermediateOutput = path.join(tempDir, `chunk_${chunkIndex}.mp4`);
        await mergeChunk(normalizedFiles, intermediateOutput);
        intermediateChunks.push(intermediateOutput);
      } else {
        intermediateChunks.push(normalizedFiles[0]);
      }
    }

    // 2. 最終合併所有中間塊
    const listPath = path.join(tempDir, "list.txt");
    const listContent = intermediateChunks.map(f => `file '${f}'`).join("\n");
    fs.writeFileSync(listPath, listContent);

    const finalPath = path.join(tempDir, "final_output.mp4");

    // 3. 執行最終合併（如果有多個中間塊）
    console.log(`[MergeTask] 執行最終合併... (中間塊數: ${intermediateChunks.length})`);
    let mergeCmd = "";
    
    if (intermediateChunks.length === 1) {
      // 只有一個中間塊，直接複製
      fs.copyFileSync(intermediateChunks[0], finalPath);
    } else if (intermediateChunks.length > 1) {
      // 多個中間塊，執行合併
      if (bgmUrl) {
        const bgmPath = path.join(tempDir, "bgm.mp3");
        await downloadFileWithRetry(bgmUrl, bgmPath, 3);
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
    }

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
 * 輔助：合併一個片段塊（內部使用）
 */
async function mergeChunk(files: string[], outputPath: string) {
  const listPath = `${outputPath}.list`;
  const listContent = files.map(f => `file '${f}'`).join("\n");
  fs.writeFileSync(listPath, listContent);
  
  const cmd = `ffmpeg -y -f concat -safe 0 -i "${listPath}" -c copy "${outputPath}"`;
  await execAsync(cmd, { timeout: 300000 });
  
  // 清理列表文件
  try {
    if (fs.existsSync(listPath)) fs.unlinkSync(listPath);
  } catch (e) {}
}

/**
 * 輔助：帶重試機制的文件下載
 */
async function downloadFileWithRetry(url: string, dest: string, maxRetries: number = 3) {
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // 使用 AbortController 實現超時控制
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      
      try {
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();
        fs.writeFileSync(dest, Buffer.from(arrayBuffer));
        return;
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      lastError = error;
      console.warn(`[Download] 第 ${attempt} 次嘗試失敗: ${url}`, error);
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // 指數退避
      }
    }
  }
  
  throw new Error(`下載失敗 (${maxRetries} 次嘗試): ${url} - ${lastError.message}`);
}

/**
 * 輔助：下載文件
 */
async function downloadFile(url: string, dest: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`下載失敗: ${url}`);
  const arrayBuffer = await response.arrayBuffer();
  fs.writeFileSync(dest, Buffer.from(arrayBuffer));
}

/**
 * 輔助：檢測並修復音頻時長（確保旁白音頻是 8 秒）
 * 使用鏈式 atempo 濾鏡突破 0.5 倍速限制
 */
async function ensureAudioDuration(audioPath: string, targetDuration: number = 8): Promise<void> {
  try {
    // 使用 ffprobe 檢測實際時長
    const { stdout } = await execAsync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`);
    const actualDuration = parseFloat(stdout.trim());
    
    console.log(`[Audio] 檢測音頻時長: ${actualDuration}秒 (目標: ${targetDuration}秒)`);
    
    if (isNaN(actualDuration) || actualDuration <= 0) {
      console.warn(`[Audio] ⚠️ 無法檢測音頻時長，跳過修復`);
      return;
    }
    
    if (actualDuration < targetDuration - 0.5) {
      // 如果實際時長少於目標時長 0.5 秒，進行拉伸
      const ratio = targetDuration / actualDuration; // 需要拉伸的倍數
      const tempPath = audioPath + '.temp.mp3';
      
      console.log(`[Audio] ⚠️ 音頻過短 (${actualDuration.toFixed(2)}s)，需要拉伸 ${ratio.toFixed(2)} 倍`);
      
      // 構建鏈式 atempo 濾鏡
      // atempo 只支持 0.5-2.0 範圍，需要鏈式調用
      // 例如：要拉伸 8 倍，需要 atempo=0.5,atempo=0.5,atempo=0.5 (0.5^3 = 0.125，即 8 倍拉伸)
      const atempoFilters = buildAtempoChain(ratio);
      
      console.log(`[Audio] 使用濾鏡鏈: ${atempoFilters}`);
      
      // 使用鏈式 atempo 濾鏡拉伸音頻
      const stretchCmd = `ffmpeg -y -i "${audioPath}" -filter:a "${atempoFilters}" -ar 44100 "${tempPath}"`;
      await execAsync(stretchCmd, { timeout: 120000 });
      
      // 驗證拉伸後的時長
      const { stdout: newDurationStr } = await execAsync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${tempPath}"`);
      const newDuration = parseFloat(newDurationStr.trim());
      console.log(`[Audio] 拉伸後時長: ${newDuration.toFixed(2)}秒`);
      
      // 替換原始文件
      fs.unlinkSync(audioPath);
      fs.renameSync(tempPath, audioPath);
      
      console.log(`[Audio] ✅ 音頻拉伸完成`);
    } else {
      console.log(`[Audio] ✅ 音頻時長正常，無需修復`);
    }
  } catch (error) {
    console.warn(`[Audio] 警告：無法檢測/修復音頻時長:`, error);
    // 不拋出錯誤，繼續處理
  }
}

/**
 * 構建鏈式 atempo 濾鏡字符串
 * atempo 範圍是 0.5-2.0，超出範圍需要鏈式調用
 * @param ratio 目標拉伸倍數（>1 表示拉長，<1 表示縮短）
 */
function buildAtempoChain(ratio: number): string {
  const filters: string[] = [];
  let remaining = ratio;
  
  // 拉伸（ratio > 1）：需要減慢速度，使用 atempo < 1
  // 每次最多減慢到 0.5 倍速（即拉伸 2 倍）
  while (remaining > 1.01) {
    if (remaining >= 2) {
      filters.push('atempo=0.5');
      remaining /= 2;
    } else {
      // 最後一個濾鏡處理剩餘部分
      const tempo = 1 / remaining;
      filters.push(`atempo=${tempo.toFixed(4)}`);
      remaining = 1;
    }
  }
  
  // 如果沒有濾鏡（ratio ≈ 1），返回一個不改變速度的濾鏡
  if (filters.length === 0) {
    return 'atempo=1.0';
  }
  
  return filters.join(',');
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
      "ffmpeg", "-y", "-threads", "1", "-i", `"${inputPath}"`, "-i", `"${audioPath}"`,
      "-filter_complex", `"[0:a]volume=${originalVol}[a0];[1:a]volume=${narrationVol}[a1];[a0][a1]amix=inputs=2:duration=first[aout]"`,
      "-map", "0:v", "-map", '"[aout]"',
      "-s", `${NORMALIZE_CONFIG.width}x${NORMALIZE_CONFIG.height}`,
      "-r", String(NORMALIZE_CONFIG.fps),
      "-c:v", NORMALIZE_CONFIG.videoCodec, "-preset", "ultrafast", "-crf", "32",
      "-c:a", NORMALIZE_CONFIG.audioCodec, `"${outputPath}"`
    ].join(" ");
  } else {
    cmd = `ffmpeg -y -threads 1 -i "${inputPath}" -s ${NORMALIZE_CONFIG.width}x${NORMALIZE_CONFIG.height} -r ${NORMALIZE_CONFIG.fps} -c:v ${NORMALIZE_CONFIG.videoCodec} -preset ultrafast -crf 32 "${outputPath}"`;
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
    
    const result = await storagePut(key, fileBuffer, "video/mp4");
    return result.url;
  } catch (error) {
    console.error("[MergeTask] 上傳失敗:", error);
    return null;
  }
}

// 導出異步合併啟動函數
export function startAsyncMerge(params: any, taskId: string) {
  return mergeVideos({ ...params, taskId });
}
