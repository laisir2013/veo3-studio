/**
 * 片段批次生成服務
 * 支持長視頻的分段生成，每批 6 個片段，輪換 API Key 組避免限流
 */

import { API_KEYS, getNextApiKey } from "./videoConfig";

// 每批次生成的片段數量
export const BATCH_SIZE = 6;

// 每個片段的時長（秒）
export const SEGMENT_DURATION = 8;

// API Key 組配置（將 13 個 Key 分成多組，每組處理一批）
export const API_KEY_GROUPS = (() => {
  const groups: string[][] = [];
  const keysPerGroup = Math.ceil(API_KEYS.length / 3); // 分成 3 組
  
  for (let i = 0; i < API_KEYS.length; i += keysPerGroup) {
    groups.push(API_KEYS.slice(i, i + keysPerGroup));
  }
  
  return groups;
})();

// 當前使用的 API Key 組索引
let currentGroupIndex = 0;

/**
 * 獲取下一個 API Key 組
 */
export function getNextApiKeyGroup(): string[] {
  const group = API_KEY_GROUPS[currentGroupIndex];
  currentGroupIndex = (currentGroupIndex + 1) % API_KEY_GROUPS.length;
  return group;
}

/**
 * 從指定組中獲取一個 API Key
 */
let groupKeyIndices: number[] = API_KEY_GROUPS.map(() => 0);

export function getApiKeyFromGroup(groupIndex: number): string {
  const group = API_KEY_GROUPS[groupIndex % API_KEY_GROUPS.length];
  const keyIndex = groupKeyIndices[groupIndex % API_KEY_GROUPS.length];
  const key = group[keyIndex % group.length];
  groupKeyIndices[groupIndex % API_KEY_GROUPS.length] = (keyIndex + 1) % group.length;
  return key;
}

/**
 * 重置 API Key 組索引
 */
export function resetApiKeyGroups(): void {
  currentGroupIndex = 0;
  groupKeyIndices = API_KEY_GROUPS.map(() => 0);
}

// 片段狀態
export interface Segment {
  id: number;
  batchIndex: number;
  status: "pending" | "generating" | "completed" | "failed";
  progress: number;
  videoUrl?: string;
  audioUrl?: string;
  imageUrl?: string; // ✅ 新增：圖片 URL（混合模式）
  imageUrls?: string[]; // ✅ 新增：多張圖片 URL（混合模式）
  narration?: string; // ✅ 新增：旁白文字
  error?: string;
  startTime: number; // 片段開始時間（秒）
  endTime: number;   // 片段結束時間（秒）
  prompt?: string;
  narrationSegmentIndex?: number;
  mediaType?: "image" | "video"; // ✅ 新增：混合模式中的媒體類型
  generatingStatus?: string; // ✅ 新增：生成狀態詳情（如「正在生成圖片 1/3」）
}

// 批次狀態
export interface Batch {
  index: number;
  segments: Segment[];
  status: "pending" | "processing" | "completed" | "failed";
  apiKeyGroupIndex: number;
  startedAt?: Date;
  completedAt?: Date;
}

// 長視頻生成任務
// 場景數據接口
export interface SceneInfo {
  id: number;
  description: string;
  narrationSegments: { segmentId: number; text: string; }[];
  imagePrompt?: string;
  status: "pending" | "generating" | "completed" | "failed";
}

export interface LongVideoTask {
  id: string;
  userId: number;
  totalDurationMinutes: number;
  totalSegments: number;
  totalBatches: number;
  segments: Segment[];
  batches: Batch[];
  scenes?: SceneInfo[]; // AI 分析後的場景數據
  status: "pending" | "analyzing" | "generating" | "merging" | "completed" | "failed";
  progress: number;
  currentBatchIndex: number;
  story: string;
  characterDescription?: string;
  visualStyle?: string;
  language: "cantonese" | "mandarin" | "english";
  voiceActorId: string;
  speedMode: "fast" | "quality";
  storyMode: "character" | "scene";
  llmModel: string; // LLM 模型名稱
  videoModel: string; // 視頻生成模型
  imageModel: string; // 圖片生成模型
  bgmType?: string; // 背景音樂類型
  subtitleStyle?: string; // 字幕樣式
  // 媒體設定
  videoPercent: number; // 視頻比例
  imagePercent: number; // 圖片比例
  imageDuration: string; // 圖片顯示時長
  // 字幕設定
  subtitleEnabled: boolean; // 是否啟用字幕
  subtitleMode: "auto" | "manual" | "none"; // 字幕模式
  subtitleFont: string; // 字幕字體
  subtitleFontSize: string; // 字幕大小
  subtitleFontColor: string; // 字幕顏色
  subtitleBoxStyle: string; // 字幕框樣式
  subtitlePosition: string; // 字幕位置
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  finalVideoUrl?: string;
  error?: string;
  // 字幕數據
  subtitles?: {
    language: string;
    segments: Array<{
      id: number;
      startTime: number;
      endTime: number;
      text: string;
      confidence?: number;
    }>;
  };
}

// 任務存儲（內存中 + SQLite 持久化）
const longVideoTasks = new Map<string, LongVideoTask>();

// ========================================
// SQLite 持久化層
// ========================================

let dbModule: typeof import('./database') | null = null;
let dbInitialized = false;

// 嘗試初始化 SQLite
async function initDatabase(): Promise<void> {
  if (dbInitialized) return;
  
  try {
    dbModule = await import('./database');
    
    // 從數據庫加載現有任務到內存
    const tasks = dbModule.getAllTasks(1000, 0);
    console.log(`📦 [SQLite] 從數據庫加載 ${tasks.length} 個任務`);
    
    for (const dbTask of tasks) {
      // 轉換數據庫格式到內存格式
      const memTask = convertDbTaskToMemory(dbTask);
      longVideoTasks.set(memTask.id, memTask);
    }
    
    dbInitialized = true;
    console.log('✅ [SQLite] 持久化層已初始化');
  } catch (error) {
    console.warn('⚠️ [SQLite] 持久化層初始化失敗，使用純內存模式:', error);
    dbModule = null;
  }
}

// 轉換數據庫任務格式到內存格式
function convertDbTaskToMemory(dbTask: any): LongVideoTask {
  return {
    id: dbTask.taskId,
    userId: dbTask.userId,
    totalDurationMinutes: dbTask.duration || 1,
    totalSegments: dbTask.segments?.length || 0,
    totalBatches: dbTask.batches?.length || 0,
    segments: (dbTask.segments || []).map((s: any, i: number) => ({
      id: s.index + 1,
      batchIndex: Math.floor(i / BATCH_SIZE),
      status: s.status || 'pending',
      progress: s.progress || 0,
      videoUrl: s.videoUrl,
      audioUrl: s.audioUrl,
      imageUrl: s.imageUrl,
      imageUrls: s.imageUrls,
      narration: s.narration || s.videoDescription,
      error: s.error,
      startTime: i * SEGMENT_DURATION,
      endTime: (i + 1) * SEGMENT_DURATION,
      prompt: s.videoDescription,
      mediaType: s.mediaType || 'video',
      generatingStatus: s.generatingStatus,
    })),
    batches: (dbTask.batches || []).map((b: any) => ({
      index: b.batchIndex,
      segments: [],
      status: b.status || 'pending',
      apiKeyGroupIndex: b.batchIndex % API_KEY_GROUPS.length,
      startedAt: b.startedAt ? new Date(b.startedAt) : undefined,
      completedAt: b.completedAt ? new Date(b.completedAt) : undefined,
    })),
    status: dbTask.status === 'segments_completed' ? 'generating' : (dbTask.status || 'pending'),
    progress: dbTask.progress || 0,
    currentBatchIndex: 0,
    story: dbTask.topic || '',
    language: (dbTask.language as any) || 'cantonese',
    voiceActorId: dbTask.voiceActorId || 'cantonese-male-narrator',
    speedMode: 'fast',
    storyMode: 'character',
    llmModel: 'gpt-4o-mini',
    videoModel: 'veo-3.1',
    imageModel: 'midjourney-v6',
    bgmType: dbTask.bgmType || 'none',
    subtitleStyle: dbTask.subtitleStyle || 'none',
    videoPercent: 50,
    imagePercent: 50,
    imageDuration: '3s',
    subtitleEnabled: true,
    subtitleMode: 'auto',
    subtitleFont: 'noto-sans-tc',
    subtitleFontSize: 'medium',
    subtitleFontColor: 'white',
    subtitleBoxStyle: 'shadow',
    subtitlePosition: 'bottom-center',
    createdAt: new Date(dbTask.createdAt),
    updatedAt: new Date(dbTask.updatedAt),
    completedAt: dbTask.completedAt ? new Date(dbTask.completedAt) : undefined,
    finalVideoUrl: dbTask.finalVideoUrl,
    error: dbTask.error,
  };
}

// 轉換內存任務格式到數據庫格式
function convertMemoryTaskToDb(memTask: LongVideoTask): any {
  return {
    taskId: memTask.id,
    userId: memTask.userId,
    status: memTask.status === 'generating' ? 'generating_segments' : memTask.status,
    progress: memTask.progress,
    topic: memTask.story,
    duration: memTask.totalDurationMinutes,
    style: memTask.videoPercent >= 100 ? 'video' : (memTask.videoPercent <= 0 ? 'image' : 'mixed'),
    language: memTask.language,
    voiceActorId: memTask.voiceActorId,
    script: memTask.story,
    segments: memTask.segments.map(s => ({
      index: s.id - 1,
      status: s.status,
      narration: s.narration,
      videoDescription: s.prompt || s.narration,
      mediaType: s.mediaType,
      videoUrl: s.videoUrl,
      audioUrl: s.audioUrl,
      imageUrl: s.imageUrl,
      imageUrls: s.imageUrls,
      generatingStatus: s.generatingStatus,
      progress: s.progress,
      error: s.error,
    })),
    batches: memTask.batches.map(b => ({
      batchIndex: b.index,
      status: b.status,
      segmentIndices: b.segments.map(s => s.id - 1),
      startedAt: b.startedAt?.toISOString(),
      completedAt: b.completedAt?.toISOString(),
    })),
    finalVideoUrl: memTask.finalVideoUrl,
    bgmType: memTask.bgmType,
    subtitleStyle: memTask.subtitleStyle,
    error: memTask.error,
    createdAt: memTask.createdAt.toISOString(),
    updatedAt: memTask.updatedAt.toISOString(),
    completedAt: memTask.completedAt?.toISOString(),
  };
}

// 同步任務到 SQLite
function syncTaskToDb(task: LongVideoTask): void {
  if (!dbModule) return;
  
  try {
    const dbTask = convertMemoryTaskToDb(task);
    
    if (dbModule.taskExists(task.id)) {
      dbModule.updateTask(task.id, dbTask);
    } else {
      dbModule.createTask(dbTask);
    }
  } catch (error) {
    console.error(`❌ [SQLite] 同步任務失敗: ${task.id}`, error);
  }
}

// 啟動時初始化數據庫
initDatabase().catch(console.error);

/**
 * 計算指定時長需要的片段數量
 */
export function calculateSegmentCount(durationMinutes: number): number {
  return Math.ceil((durationMinutes * 60) / SEGMENT_DURATION);
}

/**
 * 計算需要的批次數量
 */
export function calculateBatchCount(totalSegments: number): number {
  return Math.ceil(totalSegments / BATCH_SIZE);
}

/**
 * 創建長視頻生成任務
 */
export function createLongVideoTask(
  userId: number,
  durationMinutes: number,
  story: string,
  options: {
    characterDescription?: string;
    visualStyle?: string;
    language?: "cantonese" | "mandarin" | "english";
    voiceActorId?: string;
    speedMode?: "fast" | "quality";
    storyMode?: "character" | "scene";
    llmModel?: string; // LLM 模型名稱
    videoModel?: string; // 視頻生成模型
    imageModel?: string; // 圖片生成模型
    bgmType?: string; // 背景音樂類型
    subtitleStyle?: string; // 字幕樣式
    // 媒體設定
    videoPercent?: number; // 視頻比例
    imagePercent?: number; // 圖片比例
    imageDuration?: string; // 圖片顯示時長
    // 字幕設定
    subtitleEnabled?: boolean; // 是否啟用字幕
    subtitleMode?: "auto" | "manual" | "none"; // 字幕模式
    subtitleFont?: string; // 字幕字體
    subtitleFontSize?: string; // 字幕大小
    subtitleFontColor?: string; // 字幕顏色
    subtitleBoxStyle?: string; // 字幕框樣式
    subtitlePosition?: string; // 字幕位置
  } = {}
): LongVideoTask {
  const taskId = `long_video_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const totalSegments = calculateSegmentCount(durationMinutes);
  const totalBatches = calculateBatchCount(totalSegments);
  
  // 創建所有片段
  const segments: Segment[] = [];
  const videoPercent = options.videoPercent ?? 100;
  const imagePercent = options.imagePercent ?? 0;
  
  // 預先分配媒體類型的函數
  const getMediaTypeForSegment = (segmentId: number): "image" | "video" => {
    if (videoPercent >= 100) return "video"; // 100% 視頻
    if (videoPercent <= 0) return "image"; // 0% 視頻 (全圖片)
    
    // 交替分配算法：使用比例計算每個位置應該是視頻還是圖片
    const videoRatio = videoPercent / 100;
    const expectedVideoCount = Math.round(segmentId * videoRatio);
    const previousExpectedVideoCount = Math.round((segmentId - 1) * videoRatio);
    return expectedVideoCount > previousExpectedVideoCount ? "video" : "image";
  };
  
  for (let i = 0; i < totalSegments; i++) {
    const batchIndex = Math.floor(i / BATCH_SIZE);
    const segmentId = i + 1;
    segments.push({
      id: segmentId,
      batchIndex,
      status: "pending",
      progress: 0,
      startTime: i * SEGMENT_DURATION,
      endTime: Math.min((i + 1) * SEGMENT_DURATION, durationMinutes * 60),
      mediaType: getMediaTypeForSegment(segmentId), // ✅ 預先分配媒體類型
    });
  }
  
  // 創建批次
  const batches: Batch[] = [];
  for (let i = 0; i < totalBatches; i++) {
    const batchSegments = segments.filter(s => s.batchIndex === i);
    batches.push({
      index: i,
      segments: batchSegments,
      status: "pending",
      apiKeyGroupIndex: i % API_KEY_GROUPS.length, // 輪換使用 API Key 組
    });
  }
  
  const task: LongVideoTask = {
    id: taskId,
    userId,
    totalDurationMinutes: durationMinutes,
    totalSegments,
    totalBatches,
    segments,
    batches,
    status: "pending",
    progress: 0,
    currentBatchIndex: 0,
    story,
    characterDescription: options.characterDescription,
    visualStyle: options.visualStyle,
    language: options.language || "cantonese",
    voiceActorId: options.voiceActorId || "cantonese-male-narrator",
    speedMode: options.speedMode || "fast",
    storyMode: options.storyMode || "character",
    llmModel: options.llmModel || "gpt-4o-mini", // 默認使用 gpt-4o-mini
    videoModel: options.videoModel || "veo-3.1", // 默認使用 veo-3.1
    imageModel: options.imageModel || "midjourney-v6", // 默認使用 midjourney-v6
    bgmType: options.bgmType || "none", // 默認無背景音樂
    subtitleStyle: options.subtitleStyle || "none", // 默認無字幕
    // 媒體設定
    videoPercent: options.videoPercent ?? 100,
    imagePercent: options.imagePercent ?? 0,
    imageDuration: options.imageDuration || "3s",
    // 字幕設定
    subtitleEnabled: options.subtitleEnabled ?? true,
    subtitleMode: options.subtitleMode || "auto",
    subtitleFont: options.subtitleFont || "noto-sans-tc",
    subtitleFontSize: options.subtitleFontSize || "medium",
    subtitleFontColor: options.subtitleFontColor || "white",
    subtitleBoxStyle: options.subtitleBoxStyle || "shadow",
    subtitlePosition: options.subtitlePosition || "bottom-center",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  
  longVideoTasks.set(taskId, task);
  
  // ✅ 同步到 SQLite
  syncTaskToDb(task);
  
  return task;
}

/**
 * 獲取長視頻任務
 */
export function getLongVideoTask(taskId: string): LongVideoTask | undefined {
  // 先從內存獲取
  let task = longVideoTasks.get(taskId);
  
  // 如果內存沒有，嘗試從 SQLite 獲取
  if (!task && dbModule) {
    try {
      const dbTask = dbModule.getTask(taskId);
      if (dbTask) {
        task = convertDbTaskToMemory(dbTask);
        longVideoTasks.set(taskId, task);
        console.log(`📦 [SQLite] 從數據庫恢復任務: ${taskId}`);
      }
    } catch (error) {
      console.error(`❌ [SQLite] 獲取任務失敗: ${taskId}`, error);
    }
  }
  
  return task;
}

/**
 * 更新長視頻任務
 */
export function updateLongVideoTask(taskId: string, updates: Partial<LongVideoTask>): void {
  const task = longVideoTasks.get(taskId);
  if (task) {
    Object.assign(task, updates, { updatedAt: new Date() });
    longVideoTasks.set(taskId, task);
    
    // ✅ 同步到 SQLite
    syncTaskToDb(task);
  }
}

/**
 * 更新片段狀態
 */
export function updateSegment(taskId: string, segmentId: number, updates: Partial<Segment>): void {
  const task = longVideoTasks.get(taskId);
  if (task) {
    const segment = task.segments.find(s => s.id === segmentId);
    if (segment) {
      Object.assign(segment, updates);
      
      // 重新計算任務進度
      const completedSegments = task.segments.filter(s => s.status === "completed").length;
      task.progress = Math.round((completedSegments / task.totalSegments) * 100);
      
      // 更新批次狀態
      const batch = task.batches[segment.batchIndex];
      if (batch) {
        const batchSegments = task.segments.filter(s => s.batchIndex === segment.batchIndex);
        const batchCompleted = batchSegments.filter(s => s.status === "completed").length;
        const batchFailed = batchSegments.filter(s => s.status === "failed").length;
        
        if (batchCompleted + batchFailed === batchSegments.length) {
          batch.status = batchFailed === batchSegments.length ? "failed" : "completed";
          batch.completedAt = new Date();
        }
      }
      
      task.updatedAt = new Date();
      longVideoTasks.set(taskId, task);
      
      // ✅ 同步到 SQLite
      syncTaskToDb(task);
    }
  }
}

/**
 * 開始處理下一批次
 */
export function startNextBatch(taskId: string): Batch | null {
  const task = longVideoTasks.get(taskId);
  if (!task) return null;
  
  // 找到下一個待處理的批次
  const nextBatch = task.batches.find(b => b.status === "pending");
  if (!nextBatch) return null;
  
  nextBatch.status = "processing";
  nextBatch.startedAt = new Date();
  task.currentBatchIndex = nextBatch.index;
  task.status = "generating";
  task.updatedAt = new Date();
  
  // 將批次中的片段標記為生成中，並分配旁白
  nextBatch.segments.forEach(segment => {
    const taskSegment = task.segments.find(s => s.id === segment.id);
    if (taskSegment) {
      taskSegment.status = "generating";
      // 從 scenes 中獲取對應的旁白和描述
      // 找到包含此片段的場景和旁白片段
      let sceneData: SceneInfo | undefined;
    let narrationSegment: { segmentId: number; text: string; } | undefined;

    // 遍歷場景，找到包含此片段的場景
    for (const scene of task.scenes || []) {
      if (scene.narrationSegments) {
        narrationSegment = scene.narrationSegments.find(seg => seg.segmentId === taskSegment.id);
        if (narrationSegment) {
          sceneData = scene;
          break;
        }
      }
    }

    if (sceneData && narrationSegment) {
        taskSegment.narration = narrationSegment.text;
      taskSegment.narrationSegmentIndex = narrationSegment.segmentId;
        // 由於一個場景可能包含多個旁白片段，我們需要確保每個片段都使用相同的場景描述
      taskSegment.prompt = sceneData.description || sceneData.imagePrompt;
      }
    }
  });
  
  longVideoTasks.set(taskId, task);
  return nextBatch;
}

/**
 * 獲取批次應使用的 API Key
 */
export function getBatchApiKey(batch: Batch): string {
  return getApiKeyFromGroup(batch.apiKeyGroupIndex);
}

/**
 * 檢查任務是否完成
 */
export function isTaskCompleted(taskId: string): boolean {
  const task = longVideoTasks.get(taskId);
  if (!task) return false;
  
  return task.batches.every(b => b.status === "completed" || b.status === "failed");
}

/**
 * 獲取用戶的所有長視頻任務
 */
export function getUserLongVideoTasks(userId: number): LongVideoTask[] {
  return Array.from(longVideoTasks.values())
    .filter(t => t.userId === userId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/**
 * 刪除長視頻任務
 */
export function deleteLongVideoTask(taskId: string): boolean {
  return longVideoTasks.delete(taskId);
}

/**
 * 獲取任務統計信息
 */
export function getTaskStats(taskId: string): {
  totalSegments: number;
  completedSegments: number;
  failedSegments: number;
  pendingSegments: number;
  generatingSegments: number;
  totalBatches: number;
  completedBatches: number;
  currentBatch: number;
  progress: number;
  estimatedTimeRemaining: number; // 分鐘
} | null {
  const task = longVideoTasks.get(taskId);
  if (!task) return null;
  
  const completedSegments = task.segments.filter(s => s.status === "completed").length;
  const failedSegments = task.segments.filter(s => s.status === "failed").length;
  const pendingSegments = task.segments.filter(s => s.status === "pending").length;
  const generatingSegments = task.segments.filter(s => s.status === "generating").length;
  const completedBatches = task.batches.filter(b => b.status === "completed").length;
  
  // 估算剩餘時間（每個片段約 30 秒生成時間）
  const remainingSegments = pendingSegments + generatingSegments;
  const estimatedTimeRemaining = Math.ceil((remainingSegments * 30) / 60);
  
  return {
    totalSegments: task.totalSegments,
    completedSegments,
    failedSegments,
    pendingSegments,
    generatingSegments,
    totalBatches: task.totalBatches,
    completedBatches,
    currentBatch: task.currentBatchIndex,
    progress: task.progress,
    estimatedTimeRemaining,
  };
}

/**
 * 清理過期任務（超過 7 天）
 */
export function cleanupExpiredTasks(): number {
  const now = Date.now();
  const expireTime = 7 * 24 * 60 * 60 * 1000; // 7 天
  let cleaned = 0;
  
  const entries = Array.from(longVideoTasks.entries());
  for (const [taskId, task] of entries) {
    if (now - task.createdAt.getTime() > expireTime) {
      longVideoTasks.delete(taskId);
      cleaned++;
    }
  }
  
  return cleaned;
}
