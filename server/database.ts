// server/database.ts - SQLite 持久化層

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'tasks.db');

// 確保數據目錄存在
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// 初始化數據庫
const db = new Database(DB_PATH);

// 啟用 WAL 模式（提升並發性能）
db.pragma('journal_mode = WAL');

// ========================================
// 創建表結構
// ========================================

db.exec(`
  CREATE TABLE IF NOT EXISTS long_video_tasks (
    task_id TEXT PRIMARY KEY,
    user_id INTEGER DEFAULT 0,
    status TEXT NOT NULL,
    progress INTEGER DEFAULT 0,
    topic TEXT,
    duration INTEGER,
    style TEXT,
    language TEXT,
    voice_actor_id TEXT,
    script TEXT,
    segments TEXT,
    batches TEXT,
    final_video_url TEXT,
    bgm_type TEXT DEFAULT 'none',
    subtitle_style TEXT DEFAULT 'none',
    error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_status ON long_video_tasks(status);
  CREATE INDEX IF NOT EXISTS idx_user_id ON long_video_tasks(user_id);
  CREATE INDEX IF NOT EXISTS idx_created_at ON long_video_tasks(created_at);
`);

console.log(`✅ [DB] 數據庫已初始化: ${DB_PATH}`);

// ========================================
// 類型定義
// ========================================

export interface Segment {
  index: number;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  narration: string;
  videoDescription: string;
  mediaType?: 'video' | 'image';
  videoUrl?: string;
  audioUrl?: string;
  imageUrl?: string;
  imageUrls?: string[];
  generatingStatus?: string;
  progress?: number;
  error?: string;
}

export interface Batch {
  batchIndex: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  segmentIndices: number[];
  startedAt?: string;
  completedAt?: string;
}

export interface LongVideoTask {
  taskId: string;
  userId: number;
  status: 'pending' | 'generating_script' | 'generating_segments' | 'segments_completed' | 'merging' | 'completed' | 'failed' | 'merge_failed';
  progress: number;
  topic?: string;
  duration?: number;
  style?: 'video' | 'image' | 'mixed';
  language?: string;
  voiceActorId?: string;
  script?: string;
  segments: Segment[];
  batches: Batch[];
  finalVideoUrl?: string;
  bgmType?: string;
  subtitleStyle?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

// ========================================
// 任務 CRUD 操作
// ========================================

/**
 * ✅ 創建新任務
 */
export function createTask(task: LongVideoTask): void {
  const stmt = db.prepare(`
    INSERT INTO long_video_tasks (
      task_id, user_id, status, progress, topic, duration, style, language,
      voice_actor_id, script, segments, batches, bgm_type, subtitle_style,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    task.taskId,
    task.userId,
    task.status,
    task.progress,
    task.topic || null,
    task.duration || null,
    task.style || null,
    task.language || null,
    task.voiceActorId || null,
    task.script || null,
    JSON.stringify(task.segments),
    JSON.stringify(task.batches),
    task.bgmType || 'none',
    task.subtitleStyle || 'none',
    task.createdAt,
    task.updatedAt
  );

  console.log(`✅ [DB] 任務已創建: ${task.taskId}`);
}

/**
 * ✅ 獲取任務
 */
export function getTask(taskId: string): LongVideoTask | null {
  const stmt = db.prepare(`
    SELECT * FROM long_video_tasks WHERE task_id = ?
  `);

  const row = stmt.get(taskId) as any;

  if (!row) {
    return null;
  }

  return {
    taskId: row.task_id,
    userId: row.user_id,
    status: row.status,
    progress: row.progress,
    topic: row.topic,
    duration: row.duration,
    style: row.style,
    language: row.language,
    voiceActorId: row.voice_actor_id,
    script: row.script,
    segments: JSON.parse(row.segments || '[]'),
    batches: JSON.parse(row.batches || '[]'),
    finalVideoUrl: row.final_video_url,
    bgmType: row.bgm_type,
    subtitleStyle: row.subtitle_style,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at
  };
}

/**
 * ✅ 更新任務
 */
export function updateTask(taskId: string, updates: Partial<LongVideoTask>): void {
  const task = getTask(taskId);
  
  if (!task) {
    console.warn(`⚠️ [DB] 任務不存在，跳過更新: ${taskId}`);
    return;
  }

  // 合併更新
  const updatedTask = { ...task, ...updates };
  updatedTask.updatedAt = new Date().toISOString();

  const stmt = db.prepare(`
    UPDATE long_video_tasks SET
      status = ?,
      progress = ?,
      script = ?,
      segments = ?,
      batches = ?,
      final_video_url = ?,
      bgm_type = ?,
      subtitle_style = ?,
      error = ?,
      updated_at = ?,
      completed_at = ?
    WHERE task_id = ?
  `);

  stmt.run(
    updatedTask.status,
    updatedTask.progress,
    updatedTask.script || null,
    JSON.stringify(updatedTask.segments),
    JSON.stringify(updatedTask.batches),
    updatedTask.finalVideoUrl || null,
    updatedTask.bgmType || 'none',
    updatedTask.subtitleStyle || 'none',
    updatedTask.error || null,
    updatedTask.updatedAt,
    updatedTask.completedAt || null,
    taskId
  );

  console.log(`✅ [DB] 任務已更新: ${taskId} (${updatedTask.status})`);
}

/**
 * ✅ 更新片段狀態
 */
export function updateSegment(
  taskId: string,
  segmentIndex: number,
  updates: Partial<Segment>
): void {
  const task = getTask(taskId);
  
  if (!task) {
    console.warn(`⚠️ [DB] 任務不存在，跳過片段更新: ${taskId}`);
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

  updateTask(taskId, {
    segments: task.segments,
    progress: progress
  });

  console.log(`✅ [DB] 片段已更新: ${taskId} - 片段 ${segmentIndex + 1}`);
}

/**
 * ✅ 獲取用戶的所有任務
 */
export function getUserTasks(userId: number, limit: number = 50, offset: number = 0): LongVideoTask[] {
  const stmt = db.prepare(`
    SELECT * FROM long_video_tasks
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `);

  const rows = stmt.all(userId, limit, offset) as any[];

  return rows.map(row => ({
    taskId: row.task_id,
    userId: row.user_id,
    status: row.status,
    progress: row.progress,
    topic: row.topic,
    duration: row.duration,
    style: row.style,
    language: row.language,
    voiceActorId: row.voice_actor_id,
    script: row.script,
    segments: JSON.parse(row.segments || '[]'),
    batches: JSON.parse(row.batches || '[]'),
    finalVideoUrl: row.final_video_url,
    bgmType: row.bgm_type,
    subtitleStyle: row.subtitle_style,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at
  }));
}

/**
 * ✅ 獲取所有任務（分頁）
 */
export function getAllTasks(limit: number = 50, offset: number = 0): LongVideoTask[] {
  const stmt = db.prepare(`
    SELECT * FROM long_video_tasks
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `);

  const rows = stmt.all(limit, offset) as any[];

  return rows.map(row => ({
    taskId: row.task_id,
    userId: row.user_id,
    status: row.status,
    progress: row.progress,
    topic: row.topic,
    duration: row.duration,
    style: row.style,
    language: row.language,
    voiceActorId: row.voice_actor_id,
    script: row.script,
    segments: JSON.parse(row.segments || '[]'),
    batches: JSON.parse(row.batches || '[]'),
    finalVideoUrl: row.final_video_url,
    bgmType: row.bgm_type,
    subtitleStyle: row.subtitle_style,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at
  }));
}

/**
 * ✅ 刪除任務
 */
export function deleteTask(taskId: string): void {
  const stmt = db.prepare(`DELETE FROM long_video_tasks WHERE task_id = ?`);
  stmt.run(taskId);
  console.log(`✅ [DB] 任務已刪除: ${taskId}`);
}

/**
 * ✅ 清理舊任務（保留最近 N 天）
 */
export function cleanupOldTasks(daysToKeep: number = 7): number {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
  
  const stmt = db.prepare(`
    DELETE FROM long_video_tasks
    WHERE created_at < ? AND status IN ('completed', 'failed', 'merge_failed')
  `);
  
  const result = stmt.run(cutoffDate.toISOString());
  console.log(`✅ [DB] 已清理 ${result.changes} 個舊任務`);
  return result.changes;
}

/**
 * ✅ 檢查任務是否存在
 */
export function taskExists(taskId: string): boolean {
  const stmt = db.prepare(`SELECT 1 FROM long_video_tasks WHERE task_id = ?`);
  return stmt.get(taskId) !== undefined;
}

// 導出數據庫實例（用於高級操作）
export { db };
