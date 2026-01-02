import { storagePut } from "./storage";
import path from "path";
import fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import { generateFullNarration, type SegmentNarration } from "./fullNarrationService";
import type { VoiceLanguage } from "./videoConfig";

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
  // 新增：完整旁白生成參數
  narrationTexts?: string[];  // 每個片段的旁白文字
  voiceActorId?: string;      // 配音員 ID
  language?: VoiceLanguage;   // 語言
  useFullNarration?: boolean; // 是否使用完整旁白生成
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
  const { 
    videoUrls, 
    audioUrls: originalAudioUrls, 
    bgmUrl, 
    bgmVolume = 30, 
    narrationVolume = 80, 
    originalVolume = 50,
    narrationTexts,
    voiceActorId,
    language,
    useFullNarration = false
  } = params;
  const tempDir = path.join("/tmp", `veo3-merge-${taskId}`);
  
  // 最終使用的音頻 URL 列表
  let audioUrls = originalAudioUrls;
  
  try {
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    
    // 🎤 如果啟用完整旁白生成，先生成完整音頻並切割
    if (useFullNarration && narrationTexts && narrationTexts.length > 0 && voiceActorId) {
      console.log(`[MergeTask] 🎤 開始完整旁白生成...`);
      console.log(`[MergeTask] 片段數量: ${narrationTexts.length}`);
      console.log(`[MergeTask] 配音員: ${voiceActorId}`);
      console.log(`[MergeTask] 語言: ${language}`);
      
      mergeTasks.set(taskId, { 
        success: false, 
        status: "processing", 
        progress: 5, 
        taskId,
        currentStep: "🎤 正在生成完整旁白音頻..." 
      });
      
      // 準備旁白數據
      const narrationSegments: SegmentNarration[] = narrationTexts.map((text, index) => ({
        segmentId: index,
        text: text || `Scene ${index + 1}`,
      }));
      
      try {
        const narrationResult = await generateFullNarration(
          narrationSegments,
          voiceActorId,
          language || 'cantonese',
          true // 使用 Whisper 分割
        );
        
        if (narrationResult.success && narrationResult.segments.length > 0) {
          console.log(`[MergeTask] ✅ 完整旁白生成成功!`);
          console.log(`[MergeTask] 完整音頻時長: ${narrationResult.fullAudioDuration.toFixed(2)} 秒`);
          console.log(`[MergeTask] 分割片段數: ${narrationResult.segments.length}`);
          
          // 替換音頻 URL 列表
          audioUrls = narrationResult.segments.map(seg => seg.audioUrl || '');
          
          // 記錄每個片段的音頻 URL
          audioUrls.forEach((url, i) => {
            if (url) {
              console.log(`[MergeTask] 片段 ${i}: ${url.substring(0, 60)}...`);
            }
          });
        } else {
          console.error(`[MergeTask] ❌ 完整旁白生成失敗: ${narrationResult.error}`);
          console.log(`[MergeTask] 回退到原始音頻 URL`);
        }
      } catch (narrationError: any) {
        console.error(`[MergeTask] ❌ 旁白生成異常:`, narrationError.message);
        console.log(`[MergeTask] 回退到原始音頻 URL`);
      }
    }
    
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

        // 確保臨時目錄存在（修復並發問題）
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }

        // 下載素材（帶重試機制）
        await downloadFileWithRetry(url, segmentPath, 3);
        if (batchAudios[index]) {
          await downloadFileWithRetry(batchAudios[index], audioPath, 3);
          // 新增：檢測並修復音頻時長
          await ensureAudioDuration(audioPath, 8);
        }

        // 確保目錄仍然存在後再執行標準化
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
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
  
  // 確保目標目錄存在（修復並發問題）
  const destDir = path.dirname(dest);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // 再次確保目錄存在（防止並發刪除）
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      
      // 使用 AbortController 實現超時控制
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      
      try {
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();
        
        // 確保目錄仍然存在後再寫入
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true });
        }
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
 * 輔助：檢測音頻時長（僅記錄日誌，不進行拉伸）
 * 音頻時長不足時應通過增加旁白文字來解決，而不是拉伸音頻
 */
async function ensureAudioDuration(audioPath: string, targetDuration: number = 8): Promise<void> {
  try {
    // 使用 ffprobe 檢測實際時長
    const { stdout } = await execAsync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`);
    const actualDuration = parseFloat(stdout.trim());
    
    console.log(`[Audio] 檢測音頻時長: ${actualDuration.toFixed(2)}秒 (目標: ${targetDuration}秒)`);
    
    if (isNaN(actualDuration) || actualDuration <= 0) {
      console.warn(`[Audio] ⚠️ 無法檢測音頻時長`);
      return;
    }
    
    if (actualDuration < targetDuration - 0.5) {
      // 僅記錄警告，不進行拉伸（拉伸會導致語速變慢，不自然）
      console.log(`[Audio] ⚠️ 音頻較短 (${actualDuration.toFixed(2)}s)，但保持原始語速（不拉伸）`);
      console.log(`[Audio] 💡 建議：增加旁白文字以獲得更長的音頻時長`);
    } else {
      console.log(`[Audio] ✅ 音頻時長正常`);
    }
  } catch (error) {
    console.warn(`[Audio] 警告：無法檢測音頻時長:`, error);
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
 * 輔助：檢測文件是否為圖片
 */
async function isImageFile(filePath: string): Promise<boolean> {
  try {
    // 使用 ffprobe 檢測文件類型
    const { stdout } = await execAsync(`ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 "${filePath}"`);
    const codec = stdout.trim().toLowerCase();
    // 常見圖片編碼
    const imageCodecs = ['mjpeg', 'png', 'webp', 'gif', 'bmp', 'tiff', 'jpeg2000'];
    return imageCodecs.some(ic => codec.includes(ic) || codec === ic);
  } catch (error) {
    // 如果 ffprobe 失敗，檢查文件擴展名
    const ext = path.extname(filePath).toLowerCase();
    return ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'].includes(ext);
  }
}

/**
 * 輔助：標準化單個片段（支持圖片和視頻）
 */
async function normalizeVideo(inputPath: string, audioPath: string, outputPath: string, options: any) {
  const hasAudio = audioPath && fs.existsSync(audioPath);
  const narrationVol = options.narrationVolume / 100;
  const originalVol = options.originalVolume / 100;
  
  // 檢測輸入是否為圖片
  const isImage = await isImageFile(inputPath);
  console.log(`[Normalize] 輸入文件類型: ${isImage ? '圖片' : '視頻'}, 路徑: ${inputPath}`);

  let cmd = "";
  
  if (isImage) {
    // 圖片輸入：使用 -loop 1 將圖片轉換為 8 秒視頻
    if (hasAudio) {
      // 有音頻：圖片 + 音頻 -> 視頻
      cmd = [
        "ffmpeg", "-y", "-threads", "1",
        "-loop", "1", "-i", `"${inputPath}"`,  // 循環圖片
        "-i", `"${audioPath}"`,                  // 音頻輸入
        "-t", "8",                               // 限制時長為 8 秒
        "-vf", `"scale=${NORMALIZE_CONFIG.width}:${NORMALIZE_CONFIG.height}:force_original_aspect_ratio=decrease,pad=${NORMALIZE_CONFIG.width}:${NORMALIZE_CONFIG.height}:(ow-iw)/2:(oh-ih)/2,fps=${NORMALIZE_CONFIG.fps}"`,
        "-c:v", NORMALIZE_CONFIG.videoCodec, "-preset", "ultrafast", "-crf", "32",
        "-c:a", NORMALIZE_CONFIG.audioCodec,
        "-map", "0:v", "-map", "1:a",
        "-shortest",
        `"${outputPath}"`
      ].join(" ");
    } else {
      // 無音頻：圖片 -> 靜音視頻
      cmd = [
        "ffmpeg", "-y", "-threads", "1",
        "-loop", "1", "-i", `"${inputPath}"`,
        "-t", "8",
        "-vf", `"scale=${NORMALIZE_CONFIG.width}:${NORMALIZE_CONFIG.height}:force_original_aspect_ratio=decrease,pad=${NORMALIZE_CONFIG.width}:${NORMALIZE_CONFIG.height}:(ow-iw)/2:(oh-ih)/2,fps=${NORMALIZE_CONFIG.fps}"`,
        "-c:v", NORMALIZE_CONFIG.videoCodec, "-preset", "ultrafast", "-crf", "32",
        "-an",  // 無音頻
        `"${outputPath}"`
      ].join(" ");
    }
  } else {
    // 視頻輸入：原有邏輯
    if (hasAudio) {
      // 檢測視頻是否有音頻流
      let hasVideoAudio = false;
      try {
        const { stdout } = await execAsync(`ffprobe -v error -select_streams a -show_entries stream=codec_type -of default=noprint_wrappers=1:nokey=1 "${inputPath}"`);
        hasVideoAudio = stdout.trim().length > 0;
      } catch (e) {
        hasVideoAudio = false;
      }
      
      if (hasVideoAudio) {
        // 視頻有音頻：混合原始音頻和旁白
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
        // 視頻無音頻：只使用旁白
        cmd = [
          "ffmpeg", "-y", "-threads", "1", "-i", `"${inputPath}"`, "-i", `"${audioPath}"`,
          "-map", "0:v", "-map", "1:a",
          "-s", `${NORMALIZE_CONFIG.width}x${NORMALIZE_CONFIG.height}`,
          "-r", String(NORMALIZE_CONFIG.fps),
          "-c:v", NORMALIZE_CONFIG.videoCodec, "-preset", "ultrafast", "-crf", "32",
          "-c:a", NORMALIZE_CONFIG.audioCodec, "-shortest", `"${outputPath}"`
        ].join(" ");
      }
    } else {
      cmd = `ffmpeg -y -threads 1 -i "${inputPath}" -s ${NORMALIZE_CONFIG.width}x${NORMALIZE_CONFIG.height} -r ${NORMALIZE_CONFIG.fps} -c:v ${NORMALIZE_CONFIG.videoCodec} -preset ultrafast -crf 32 "${outputPath}"`;
    }
  }

  console.log(`[Normalize] 執行命令: ${cmd.substring(0, 200)}...`);
  await execAsync(cmd, { timeout: 180000 });
  console.log(`[Normalize] ✅ 標準化完成: ${outputPath}`);
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
