/**
 * 任務適配層
 * 將現有的 LongVideoTask 格式轉換為 JSON 持久化格式
 * 這樣可以在不修改現有業務邏輯的情況下實現持久化
 */

import type { LongVideoTask as MemoryTask, Segment } from './segmentBatchService';
import type { LongVideoTask as PersistentTask, TaskSegment, TaskConfig } from './types/task';
import { saveTask as savePersistentTask, loadTask as loadPersistentTask } from './taskPersistence';

/**
 * 將內存格式的任務轉換為持久化格式
 */
export function convertMemoryTaskToPersistent(memoryTask: MemoryTask): PersistentTask {
  return {
    taskId: memoryTask.id,
    title: memoryTask.story,
    status: mapMemoryStatusToPersistent(memoryTask.status),
    progress: memoryTask.progress,
    createdAt: memoryTask.createdAt.toISOString(),
    updatedAt: memoryTask.updatedAt.toISOString(),
    completedAt: memoryTask.completedAt?.toISOString(),
    config: {
      topic: memoryTask.story,
      language: memoryTask.language,
      voiceId: memoryTask.voiceActorId,
      duration: memoryTask.totalDurationMinutes * 60,
      segmentCount: memoryTask.totalSegments,
      style: determineStyle(memoryTask.videoPercent, memoryTask.imagePercent),
      backgroundMusic: memoryTask.bgmType,
      addSubtitles: memoryTask.subtitleEnabled
    },
    script: memoryTask.story,
    segments: memoryTask.segments.map((seg: Segment): TaskSegment => ({
      index: seg.id - 1,
      text: seg.prompt || '',
      status: mapSegmentStatus(seg.status),
      mediaType: seg.mediaType || 'video',
      videoUrl: seg.videoUrl,
      imageUrl: seg.imageUrl,
      audioUrl: seg.audioUrl,
      narration: seg.narration,
      error: seg.error,
      startedAt: undefined,
      completedAt: undefined
    })),
    mergedVideoUrl: memoryTask.finalVideoUrl,
    error: memoryTask.error
  };
}

/**
 * 將持久化格式的任務轉換為內存格式
 */
export function convertPersistentTaskToMemory(persistentTask: PersistentTask): MemoryTask {
  const segmentCount = persistentTask.segments.length;
  const batchSize = 6;
  const batchCount = Math.ceil(segmentCount / batchSize);

  return {
    id: persistentTask.taskId,
    userId: 0,
    totalDurationMinutes: persistentTask.config.duration / 60,
    totalSegments: segmentCount,
    totalBatches: batchCount,
    segments: persistentTask.segments.map((seg: TaskSegment, index: number) => ({
      id: index + 1,
      batchIndex: Math.floor(index / batchSize),
      status: mapPersistentStatusToSegment(seg.status),
      progress: seg.status === 'completed' ? 100 : 0,
      videoUrl: seg.videoUrl,
      audioUrl: seg.audioUrl,
      imageUrl: seg.imageUrl,
      narration: seg.narration,
      error: seg.error,
      startTime: index * 8,
      endTime: (index + 1) * 8,
      prompt: seg.text,
      mediaType: seg.mediaType,
      generatingStatus: seg.status === 'generating' ? '生成中...' : undefined
    })),
    batches: Array.from({ length: batchCount }, (_, i) => ({
      index: i,
      segments: [],
      status: 'pending' as const,
      apiKeyGroupIndex: i % 3,
      startedAt: undefined,
      completedAt: undefined
    })),
    status: mapPersistentStatusToMemory(persistentTask.status),
    progress: persistentTask.progress,
    currentBatchIndex: 0,
    story: persistentTask.title,
    language: persistentTask.config.language as any,
    voiceActorId: persistentTask.config.voiceId,
    speedMode: 'fast',
    storyMode: 'character',
    llmModel: 'gpt-4o-mini',
    videoModel: 'veo-3.1',
    imageModel: 'midjourney-v6',
    bgmType: persistentTask.config.backgroundMusic,
    subtitleStyle: 'none',
    videoPercent: persistentTask.config.style === 'video' ? 100 : 50,
    imagePercent: persistentTask.config.style === 'image' ? 100 : 50,
    imageDuration: '3s',
    subtitleEnabled: persistentTask.config.addSubtitles || false,
    subtitleMode: 'auto',
    subtitleFont: 'noto-sans-tc',
    subtitleFontSize: 'medium',
    subtitleFontColor: 'white',
    subtitleBoxStyle: 'shadow',
    subtitlePosition: 'bottom-center',
    createdAt: new Date(persistentTask.createdAt),
    updatedAt: new Date(persistentTask.updatedAt),
    completedAt: persistentTask.completedAt ? new Date(persistentTask.completedAt) : undefined,
    finalVideoUrl: persistentTask.mergedVideoUrl,
    error: persistentTask.error
  };
}

/**
 * 保存內存格式的任務到持久化存儲
 */
export async function saveMemoryTask(memoryTask: MemoryTask): Promise<void> {
  const persistentTask = convertMemoryTaskToPersistent(memoryTask);
  await savePersistentTask(persistentTask);
}

/**
 * 從持久化存儲加載任務
 */
export async function loadMemoryTask(taskId: string): Promise<MemoryTask | null> {
  const persistentTask = await loadPersistentTask(taskId);
  if (!persistentTask) {
    return null;
  }
  return convertPersistentTaskToMemory(persistentTask);
}

// ========================================
// 狀態映射函數
// ========================================

function mapMemoryStatusToPersistent(status: string): any {
  const mapping: Record<string, any> = {
    'pending': 'pending',
    'analyzing': 'pending',
    'generating': 'generatingsegments',
    'merging': 'merging',
    'completed': 'completed',
    'failed': 'failed'
  };
  return mapping[status] || 'pending';
}

function mapPersistentStatusToMemory(status: string): string {
  const mapping: Record<string, string> = {
    'pending': 'pending',
    'generatingscript': 'analyzing',
    'generatingsegments': 'generating',
    'segmentscompleted': 'merging',
    'merging': 'merging',
    'completed': 'completed',
    'failed': 'failed'
  };
  return mapping[status] || 'pending';
}

function mapSegmentStatus(status: string): any {
  const mapping: Record<string, any> = {
    'pending': 'pending',
    'generating': 'generating',
    'completed': 'completed',
    'failed': 'failed'
  };
  return mapping[status] || 'pending';
}

function mapPersistentStatusToSegment(status: string): string {
  const mapping: Record<string, string> = {
    'pending': 'pending',
    'generating': 'generating',
    'completed': 'completed',
    'failed': 'failed'
  };
  return mapping[status] || 'pending';
}

function determineStyle(videoPercent: number, imagePercent: number): 'video' | 'image' | 'mixed' {
  if (videoPercent === 100) return 'video';
  if (imagePercent === 100) return 'image';
  return 'mixed';
}
