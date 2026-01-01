import path from 'path';
import fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import { 
  uploadMergedVideo, 
  downloadVideoWithValidation,
  getAudioDuration,
  cleanupTempFiles
} from './storage';
import { getTask, updateTask } from './taskPersistence';
import { saveMemoryTask } from './segmentBatchService';
import { VIDEO_CONFIG } from './videoConfig';

const execAsync = promisify(exec);

// 輔助函數：檢查是否為圖片 URL
function isImageUrl(url: string): boolean {
  if (!url) return false;
  const lowerUrl = url.toLowerCase();
  return (
    lowerUrl.includes('/images/') || 
    lowerUrl.endsWith('.png') || 
    lowerUrl.endsWith('.jpg') || 
    lowerUrl.endsWith('.jpeg') || 
    lowerUrl.endsWith('.webp')
  );
}

/**
 * 使用本地 FFmpeg 將圖片和音頻轉換為視頻
 */
async function convertImageToVideoLocal(
  imagePath: string,
  audioPath: string | null,
  outputPath: string,
  duration: number = 8
): Promise<boolean> {
  try {
    console.log(`[LocalFFmpeg] 🎬 開始圖片轉視頻: ${imagePath}, 時長: ${duration}s`);
    
    let command = '';
    if (audioPath) {
      // 如果有音頻，使用音頻時長
      command = `ffmpeg -y -loop 1 -i "${imagePath}" -i "${audioPath}" -c:v libx264 -t ${duration} -pix_fmt yuv420p -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2" -c:a aac -shortest "${outputPath}"`;
    } else {
      // 如果沒音頻，使用默認時長
      command = `ffmpeg -y -loop 1 -i "${imagePath}" -c:v libx264 -t ${duration} -pix_fmt yuv420p -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2" "${outputPath}"`;
    }

    await execAsync(command);
    return true;
  } catch (error) {
    console.error(`[LocalFFmpeg] ❌ 圖片轉視頻失敗:`, error);
    return false;
  }
}

/**
 * 標準化視頻片段
 */
async function normalizeVideo(inputPath: string, outputPath: string): Promise<boolean> {
  try {
    const command = `ffmpeg -y -i "${inputPath}" -c:v libx264 -preset fast -crf 23 -r 30 -aspect 16:9 -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2" -c:a aac -ar 44100 -ac 2 "${outputPath}"`;
    await execAsync(command);
    return true;
  } catch (error) {
    console.error(`[LocalFFmpeg] ❌ 視頻標準化失敗: ${inputPath}`, error);
    return false;
  }
}

/**
 * 執行實際的合併邏輯
 */
async function performActualMerge(
  urls: string[],
  audioUrls: (string | null)[],
  tempDir: string,
  taskId: string
): Promise<{ success: boolean; videoUrl?: string; error?: string }> {
  const downloadedPaths: string[] = [];
  const isImageSegment: boolean[] = [];
  const audioPaths: (string | null)[] = [];

  try {
    // 1. 下載所有片段
    console.log(`[LocalFFmpeg] 📥 開始下載 ${urls.length} 個片段...`);
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      const isImage = isImageUrl(url);
      const ext = isImage ? '.png' : '.mp4';
      const localPath = path.join(tempDir, `input_${i}${ext}`);
      
      // 記錄是否為圖片，確保索引與 urls 一致
      isImageSegment.push(isImage);
      console.log(`[LocalFFmpeg] 片段 ${i} 識別為圖片: ${isImage}, URL: ${url}`);

      const downloaded = await downloadVideoWithValidation(url, localPath, tempDir);
      if (downloaded) {
        downloadedPaths.push(localPath);
        
        // 下載對應的音頻
        if (audioUrls[i]) {
          const audioPath = path.join(tempDir, `audio_${i}.mp3`);
          const audioDownloaded = await downloadVideoWithValidation(audioUrls[i]!, audioPath, tempDir);
          audioPaths.push(audioDownloaded ? audioPath : null);
        } else {
          audioPaths.push(null);
        }
      } else {
        console.warn(`[LocalFFmpeg] ⚠️ 片段 ${i} 下載失敗，跳過`);
      }
    }

    if (downloadedPaths.length === 0) {
      throw new Error('沒有成功下載任何片段');
    }

    // 2. 處理圖片片段：將圖片轉換為視頻
    console.log(`[LocalFFmpeg] 🖼️ 檢查圖片片段並轉換為視頻...`);
    const processedPaths: string[] = [];
    for (let i = 0; i < downloadedPaths.length; i++) {
      const currentPath = downloadedPaths[i];
      // 注意：這裡需要對應原始 urls 的索引來判斷是否為圖片
      // 因為 downloadedPaths 可能因為下載失敗而比 urls 短
      // 簡單起見，我們假設所有片段都下載成功，或者根據文件名 input_i 判斷
      const originalIndex = parseInt(path.basename(currentPath).split('_')[1]);
      
      if (isImageSegment[originalIndex]) {
        console.log(`[LocalFFmpeg] 🖼️ 片段 ${originalIndex} 是圖片，準備轉換...`);
        const videoOutput = currentPath.replace(path.extname(currentPath), '_conv.mp4');
        const duration = audioPaths[i] ? await getAudioDuration(audioPaths[i]!) : 8;
        const success = await convertImageToVideoLocal(currentPath, audioPaths[i], videoOutput, duration);
        processedPaths.push(success ? videoOutput : currentPath);
      } else {
        processedPaths.push(currentPath);
      }
    }

    // 3. 標準化所有視頻片段
    console.log(`[LocalFFmpeg] 🔄 標準化視頻片段...`);
    const normalizedPaths: string[] = [];
    for (let i = 0; i < processedPaths.length; i++) {
      const outputPath = path.join(tempDir, `norm_${i}.mp4`);
      const success = await normalizeVideo(processedPaths[i], outputPath);
      if (success) {
        normalizedPaths.push(outputPath);
      }
    }

    if (normalizedPaths.length === 0) {
      throw new Error('視頻標準化全部失敗');
    }

    // 4. 合併視頻
    console.log(`[LocalFFmpeg] 🔗 開始合併 ${normalizedPaths.length} 個片段...`);
    const listFilePath = path.join(tempDir, 'list.txt');
    const listContent = normalizedPaths.map(p => `file '${p}'`).join('\n');
    await fs.writeFile(listFilePath, listContent);

    const finalOutputPath = path.join(tempDir, 'final_merged.mp4');
    const mergeCommand = `ffmpeg -y -f concat -safe 0 -i "${listFilePath}" -c copy "${finalOutputPath}"`;
    await execAsync(mergeCommand);

    // 5. 上傳到 R2
    console.log(`[LocalFFmpeg] 📤 上傳合併後的視頻...`);
    const videoUrl = await uploadMergedVideo(finalOutputPath);
    
    if (videoUrl) {
      console.log(`[LocalFFmpeg] ✅ 合併成功: ${videoUrl}`);
      return { success: true, videoUrl };
    } else {
      throw new Error('上傳到 R2 失敗');
    }
  } catch (error: any) {
    console.error(`[LocalFFmpeg] ❌ 合併過程出錯:`, error);
    return { success: false, error: error.message };
  } finally {
    await cleanupTempFiles(tempDir);
  }
}

/**
 * 導出的合併函數
 */
export async function mergeVideos(
  taskId: string,
  urls: string[],
  audioUrls: (string | null)[] = []
): Promise<{ success: boolean; videoUrl?: string; error?: string }> {
  const tempDir = path.join('/tmp', `merge_${taskId}_${Date.now()}`);
  await fs.mkdir(tempDir, { recursive: true });

  try {
    // 檢查 ffmpeg 是否可用
    try {
      await execAsync('ffmpeg -version');
    } catch (e) {
      console.error('[Merge] FFmpeg 不可用');
      return { success: false, error: 'FFmpeg is not installed on server' };
    }

    const result = await performActualMerge(urls, audioUrls, tempDir, taskId);
    
    if (result.success && result.videoUrl) {
      // 更新任務狀態
      const task = await getTask(taskId);
      if (task) {
        task.status = 'completed';
        task.videoUrl = result.videoUrl;
        await updateTask(taskId, task);
        await saveMemoryTask(taskId, task);
      }
    }

    return result;
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
