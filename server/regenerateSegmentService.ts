/**
 * 片段重新生成服務
 * 支持重新生成影片、音頻、圖片等單個片段
 */

import { generateSceneImage, generateVideo, generateSpeech } from "./videoService";
import { getLongVideoTask, updateSegment } from "./segmentBatchService";

export interface RegenerateSegmentOptions {
  taskId: string;
  segmentId: number;
  regenerateType: "all" | "video" | "audio" | "image"; // 重新生成的類型
}

/**
 * 重新生成單個片段
 */
export async function regenerateSegment(options: RegenerateSegmentOptions): Promise<{
  success: boolean;
  videoUrl?: string;
  audioUrl?: string;
  imageUrl?: string;
  error?: string;
}> {
  const { taskId, segmentId, regenerateType } = options;

  try {
    const task = getLongVideoTask(taskId);
    if (!task) {
      throw new Error(`任務 ${taskId} 不存在`);
    }

    const segment = task.segments.find(s => s.id === segmentId);
    if (!segment) {
      throw new Error(`片段 ${segmentId} 不存在`);
    }

    const sceneIndex = Math.min(segmentId - 1, (task.scenes?.length || 1) - 1);
    const scene = task.scenes?.[sceneIndex];
    if (!scene) {
      throw new Error(`場景 ${sceneIndex} 不存在`);
    }

    console.log(`[Regenerate] 開始重新生成片段 ${segmentId}，類型: ${regenerateType}`);

    let videoUrl = segment.videoUrl;
    let audioUrl = segment.audioUrl;
    let imageUrl = segment.imageUrl;

    // 重新生成圖片
    if (regenerateType === "all" || regenerateType === "image") {
      console.log(`[Regenerate] 重新生成片段 ${segmentId} 的圖片...`);
      imageUrl = await generateSceneImage(
        scene.description || `Scene ${segmentId}`,
        null,
        task.speedMode || "fast",
        task.storyMode || "scene"
      );
      console.log(`[Regenerate] 片段 ${segmentId} 圖片生成完成: ${imageUrl}`);
    }

    // 重新生成視頻
    if (regenerateType === "all" || regenerateType === "video") {
      console.log(`[Regenerate] 重新生成片段 ${segmentId} 的視頻...`);
      
      // 如果沒有圖片，先生成
      if (!imageUrl) {
        imageUrl = await generateSceneImage(
          scene.description || `Scene ${segmentId}`,
          null,
          task.speedMode || "fast",
          task.storyMode || "scene"
        );
      }

      videoUrl = await generateVideo(
        imageUrl,
        scene.description || `Video scene ${segmentId}`,
        task.videoModel as any
      );
      console.log(`[Regenerate] 片段 ${segmentId} 視頻生成完成: ${videoUrl}`);
    }

    // 重新生成音頻
    if (regenerateType === "all" || regenerateType === "audio") {
      console.log(`[Regenerate] 重新生成片段 ${segmentId} 的音頻...`);
      
      // 獲取旁白文本
      const narrationText = scene.narrationSegments
        ?.map(seg => seg.text)
        .join(" ") || `Scene ${segmentId} narration`;

      audioUrl = await generateSpeech(
        narrationText,
        task.voiceActorId || "default",
        (task.language || "cantonese") as any
      );
      console.log(`[Regenerate] 片段 ${segmentId} 音頻生成完成: ${audioUrl}`);
    }

    // 更新片段
    updateSegment(taskId, segmentId, {
      status: "completed",
      progress: 100,
      videoUrl: videoUrl,
      audioUrl: audioUrl,
      imageUrl: imageUrl,
    });

    console.log(`[Regenerate] 片段 ${segmentId} 重新生成完成`);

    return {
      success: true,
      videoUrl,
      audioUrl,
      imageUrl,
    };
  } catch (error) {
    console.error(`[Regenerate] 片段 ${segmentId} 重新生成失敗:`, error);
    
    // 更新片段狀態為失敗
    updateSegment(taskId, segmentId, {
      status: "failed",
      error: error instanceof Error ? error.message : "未知錯誤",
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : "未知錯誤",
    };
  }
}
