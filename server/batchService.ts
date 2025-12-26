/**
 * 批量視頻生成服務
 * 支持多故事並行處理，利用多個 API Key 提高效率
 */

import { API_KEYS } from "./videoConfig";
import type { SpeedMode, StoryMode, VideoModel } from "./videoConfig";

export interface BatchTask {
  id: string;
  story: string;
  characterDescription?: string;
  visualStyle?: string;
  speedMode: SpeedMode;
  storyMode: StoryMode;
  status: "pending" | "processing" | "completed" | "failed";
  progress: number;
  result?: {
    taskId: number;
    videoUrl?: string;
  };
  error?: string;
}

export interface BatchJob {
  id: string;
  tasks: BatchTask[];
  status: "pending" | "processing" | "completed" | "failed";
  progress: number;
  createdAt: Date;
  completedAt?: Date;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
}

// 批量任務存儲（內存中，實際應該存數據庫）
const batchJobs = new Map<string, BatchJob>();

/**
 * 創建批量生成任務
 */
export function createBatchJob(
  stories: Array<{
    story: string;
    characterDescription?: string;
    visualStyle?: string;
  }>,
  speedMode: SpeedMode,
  storyMode: StoryMode
): BatchJob {
  const jobId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const tasks: BatchTask[] = stories.map((s, index) => ({
    id: `${jobId}_task_${index}`,
    story: s.story,
    characterDescription: s.characterDescription,
    visualStyle: s.visualStyle,
    speedMode,
    storyMode,
    status: "pending",
    progress: 0,
  }));

  const job: BatchJob = {
    id: jobId,
    tasks,
    status: "pending",
    progress: 0,
    createdAt: new Date(),
    totalTasks: tasks.length,
    completedTasks: 0,
    failedTasks: 0,
  };

  batchJobs.set(jobId, job);
  return job;
}

/**
 * 獲取批量任務狀態
 */
export function getBatchJob(jobId: string): BatchJob | undefined {
  return batchJobs.get(jobId);
}

/**
 * 更新批量任務狀態
 */
export function updateBatchJob(jobId: string, updates: Partial<BatchJob>): void {
  const job = batchJobs.get(jobId);
  if (job) {
    Object.assign(job, updates);
    batchJobs.set(jobId, job);
  }
}

/**
 * 更新單個任務狀態
 */
export function updateBatchTask(
  jobId: string,
  taskId: string,
  updates: Partial<BatchTask>
): void {
  const job = batchJobs.get(jobId);
  if (job) {
    const task = job.tasks.find(t => t.id === taskId);
    if (task) {
      Object.assign(task, updates);
      
      // 重新計算任務進度
      const completedTasks = job.tasks.filter(t => t.status === "completed").length;
      const failedTasks = job.tasks.filter(t => t.status === "failed").length;
      const totalProgress = job.tasks.reduce((sum, t) => sum + t.progress, 0);
      
      job.completedTasks = completedTasks;
      job.failedTasks = failedTasks;
      job.progress = Math.round(totalProgress / job.tasks.length);
      
      // 檢查是否全部完成
      if (completedTasks + failedTasks === job.totalTasks) {
        job.status = failedTasks === job.totalTasks ? "failed" : "completed";
        job.completedAt = new Date();
      }
      
      batchJobs.set(jobId, job);
    }
  }
}

/**
 * 計算最大並行數
 * 基於可用 API Key 數量和任務數量
 */
export function calculateMaxConcurrency(taskCount: number): number {
  // 最大並行數 = min(API Key 數量, 任務數量, 5)
  // 限制最大 5 個並行，避免過度消耗資源
  return Math.min(API_KEYS.length, taskCount, 5);
}

/**
 * 獲取所有批量任務
 */
export function getAllBatchJobs(): BatchJob[] {
  return Array.from(batchJobs.values()).sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );
}

/**
 * 刪除批量任務
 */
export function deleteBatchJob(jobId: string): boolean {
  return batchJobs.delete(jobId);
}

/**
 * 清理過期的批量任務（超過 24 小時）
 */
export function cleanupExpiredJobs(): number {
  const now = Date.now();
  const expireTime = 24 * 60 * 60 * 1000; // 24 小時
  let cleaned = 0;

  const entries = Array.from(batchJobs.entries());
  for (const [jobId, job] of entries) {
    if (now - job.createdAt.getTime() > expireTime) {
      batchJobs.delete(jobId);
      cleaned++;
    }
  }

  return cleaned;
}

/**
 * 估算批量任務完成時間
 */
export function estimateBatchTime(
  taskCount: number,
  speedMode: SpeedMode
): { minMinutes: number; maxMinutes: number } {
  const concurrency = calculateMaxConcurrency(taskCount);
  const batches = Math.ceil(taskCount / concurrency);
  
  // 每個任務的預估時間（分鐘）
  const timePerTask = speedMode === "fast" ? 4 : 12;
  
  return {
    minMinutes: batches * timePerTask * 0.8,
    maxMinutes: batches * timePerTask * 1.5,
  };
}
