// server/taskManager.ts - 任務管理器（整合內存和 SQLite）

import * as db from './database';
import type { LongVideoTask, Segment, Batch } from './database';

// 內存緩存（用於快速訪問）
const memoryCache = new Map<string, LongVideoTask>();

// 是否啟用 SQLite 持久化
const USE_SQLITE = process.env.USE_SQLITE !== 'false';

console.log(`📦 [TaskManager] 持久化模式: ${USE_SQLITE ? 'SQLite + Memory' : 'Memory Only'}`);

// ========================================
// 初始化：從 SQLite 加載任務到內存
// ========================================

export function initializeFromDatabase(): void {
  if (!USE_SQLITE) {
    console.log('📦 [TaskManager] SQLite 已禁用，使用純內存模式');
    return;
  }

  try {
    const tasks = db.getAllTasks(1000, 0);
    for (const task of tasks) {
      memoryCache.set(task.taskId, task);
    }
    console.log(`✅ [TaskManager] 已從數據庫加載 ${tasks.length} 個任務到內存`);
  } catch (error) {
    console.error('❌ [TaskManager] 從數據庫加載任務失敗:', error);
  }
}

// 啟動時自動加載
initializeFromDatabase();

// ========================================
// 任務 CRUD 操作
// ========================================

/**
 * ✅ 創建新任務
 */
export function createLongVideoTask(task: LongVideoTask): void {
  // 寫入內存
  memoryCache.set(task.taskId, task);
  
  // 寫入 SQLite
  if (USE_SQLITE) {
    try {
      db.createTask(task);
    } catch (error) {
      console.error(`❌ [TaskManager] SQLite 寫入失敗: ${task.taskId}`, error);
    }
  }
  
  console.log(`✅ [TaskManager] 任務已創建: ${task.taskId}`);
}

/**
 * ✅ 獲取任務
 */
export function getLongVideoTask(taskId: string): LongVideoTask | null {
  // 先從內存獲取
  let task = memoryCache.get(taskId);
  
  // 如果內存沒有，嘗試從 SQLite 獲取
  if (!task && USE_SQLITE) {
    task = db.getTask(taskId) || undefined;
    if (task) {
      // 加載到內存緩存
      memoryCache.set(taskId, task);
      console.log(`📦 [TaskManager] 從數據庫恢復任務: ${taskId}`);
    }
  }
  
  return task || null;
}

/**
 * ✅ 更新任務
 */
export function updateLongVideoTask(taskId: string, updates: Partial<LongVideoTask>): void {
  const task = getLongVideoTask(taskId);
  
  if (!task) {
    console.warn(`⚠️ [TaskManager] 任務不存在: ${taskId}`);
    return;
  }
  
  // 合併更新
  const updatedTask = { ...task, ...updates };
  updatedTask.updatedAt = new Date().toISOString();
  
  // 更新內存
  memoryCache.set(taskId, updatedTask);
  
  // 更新 SQLite
  if (USE_SQLITE) {
    try {
      db.updateTask(taskId, updates);
    } catch (error) {
      console.error(`❌ [TaskManager] SQLite 更新失敗: ${taskId}`, error);
    }
  }
}

/**
 * ✅ 更新片段狀態
 */
export function updateSegment(
  taskId: string,
  segmentIndex: number,
  updates: Partial<Segment>
): void {
  const task = getLongVideoTask(taskId);
  
  if (!task) {
    console.warn(`⚠️ [TaskManager] 任務不存在: ${taskId}`);
    return;
  }
  
  // 更新指定片段
  if (task.segments[segmentIndex]) {
    task.segments[segmentIndex] = {
      ...task.segments[segmentIndex],
      ...updates
    };
  }
  
  // 計算整體進度
  const completedSegments = task.segments.filter(s => s.status === 'completed').length;
  const progress = task.segments.length > 0 
    ? Math.floor((completedSegments / task.segments.length) * 85) 
    : 0;
  
  // 更新內存
  task.progress = progress;
  task.updatedAt = new Date().toISOString();
  memoryCache.set(taskId, task);
  
  // 更新 SQLite
  if (USE_SQLITE) {
    try {
      db.updateSegment(taskId, segmentIndex, updates);
    } catch (error) {
      console.error(`❌ [TaskManager] SQLite 片段更新失敗: ${taskId}`, error);
    }
  }
}

/**
 * ✅ 獲取用戶的所有任務
 */
export function getUserLongVideoTasks(userId: number): LongVideoTask[] {
  // 從內存獲取
  const tasks: LongVideoTask[] = [];
  
  for (const task of memoryCache.values()) {
    if (task.userId === userId) {
      tasks.push(task);
    }
  }
  
  // 如果內存為空，嘗試從 SQLite 獲取
  if (tasks.length === 0 && USE_SQLITE) {
    const dbTasks = db.getUserTasks(userId);
    for (const task of dbTasks) {
      memoryCache.set(task.taskId, task);
      tasks.push(task);
    }
  }
  
  // 按創建時間倒序排列
  return tasks.sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/**
 * ✅ 刪除任務
 */
export function deleteLongVideoTask(taskId: string): void {
  // 從內存刪除
  memoryCache.delete(taskId);
  
  // 從 SQLite 刪除
  if (USE_SQLITE) {
    try {
      db.deleteTask(taskId);
    } catch (error) {
      console.error(`❌ [TaskManager] SQLite 刪除失敗: ${taskId}`, error);
    }
  }
  
  console.log(`✅ [TaskManager] 任務已刪除: ${taskId}`);
}

/**
 * ✅ 檢查任務是否完成
 */
export function isTaskCompleted(taskId: string): boolean {
  const task = getLongVideoTask(taskId);
  if (!task) return false;
  
  return task.status === 'completed' || task.status === 'segments_completed';
}

/**
 * ✅ 獲取任務統計
 */
export function getTaskStats(taskId: string): {
  total: number;
  completed: number;
  failed: number;
  pending: number;
  generating: number;
} {
  const task = getLongVideoTask(taskId);
  
  if (!task) {
    return { total: 0, completed: 0, failed: 0, pending: 0, generating: 0 };
  }
  
  const segments = task.segments;
  
  return {
    total: segments.length,
    completed: segments.filter(s => s.status === 'completed').length,
    failed: segments.filter(s => s.status === 'failed').length,
    pending: segments.filter(s => s.status === 'pending').length,
    generating: segments.filter(s => s.status === 'generating').length
  };
}

/**
 * ✅ 啟動下一批次
 */
export function startNextBatch(taskId: string): Batch | null {
  const task = getLongVideoTask(taskId);
  
  if (!task) {
    console.warn(`⚠️ [TaskManager] 任務不存在: ${taskId}`);
    return null;
  }
  
  // 找到下一個待處理的批次
  const nextBatch = task.batches.find(b => b.status === 'pending');
  
  if (!nextBatch) {
    console.log(`📦 [TaskManager] 沒有待處理的批次: ${taskId}`);
    return null;
  }
  
  // 更新批次狀態
  nextBatch.status = 'processing';
  nextBatch.startedAt = new Date().toISOString();
  
  // 更新任務
  updateLongVideoTask(taskId, { batches: task.batches });
  
  console.log(`✅ [TaskManager] 開始批次 ${nextBatch.batchIndex + 1}: ${taskId}`);
  
  return nextBatch;
}

/**
 * ✅ 獲取批次 API Key（用於外部 API 調用）
 */
export function getBatchApiKey(): string {
  return process.env.VEO_API_KEY || process.env.OPENAI_API_KEY || '';
}

/**
 * ✅ 計算片段數量
 */
export function calculateSegmentCount(duration: number): number {
  // 每 8 秒一個片段
  const SEGMENT_DURATION = 8;
  return Math.ceil(duration / SEGMENT_DURATION);
}

/**
 * ✅ 計算批次數量
 */
export function calculateBatchCount(segmentCount: number): number {
  // 每批次 3 個片段
  const BATCH_SIZE = 3;
  return Math.ceil(segmentCount / BATCH_SIZE);
}

// 導出常量
export const BATCH_SIZE = 3;
export const SEGMENT_DURATION = 8;

// 導出類型
export type { LongVideoTask, Segment, Batch };
