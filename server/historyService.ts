/**
 * 歷史記錄服務 - 管理用戶的生成歷史
 */

import { eq, desc, and, isNull, sql } from "drizzle-orm";
import { getDb } from "./db";
import { 
  generationHistory, 
  clonedVoices,
  type GenerationHistory, 
  type InsertGenerationHistory,
  type GenerationInputParams,
  type GenerationOutputUrls,
  type ModelsUsed,
  type ClonedVoice,
  type InsertClonedVoice
} from "../drizzle/schema";

// 生成唯一的任務 ID
export function generateTaskId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `task_${timestamp}_${random}`;
}

// 生成唯一的會話 ID（用於匿名用戶）
export function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 12);
  return `session_${timestamp}_${random}`;
}

/**
 * 創建歷史記錄
 */
export async function createHistoryRecord(data: {
  userId?: number;
  sessionId?: string;
  taskId?: string;
  taskType: "video" | "image" | "audio" | "voice_clone";
  title?: string;
  inputParams?: GenerationInputParams;
  modelsUsed?: ModelsUsed;
}): Promise<GenerationHistory | null> {
  const db = await getDb();
  if (!db) {
    console.warn("[History] 數據庫不可用，無法創建歷史記錄");
    return null;
  }

  const taskId = data.taskId || generateTaskId();
  
  try {
    await db.insert(generationHistory).values({
      userId: data.userId || null,
      sessionId: data.sessionId || null,
      taskId,
      taskType: data.taskType,
      title: data.title || null,
      inputParams: data.inputParams || null,
      modelsUsed: data.modelsUsed || null,
      status: "pending",
      progress: 0,
    });

    // 獲取插入的記錄
    const records = await db.select()
      .from(generationHistory)
      .where(eq(generationHistory.taskId, taskId))
      .limit(1);

    return records[0] || null;
  } catch (error) {
    console.error("[History] 創建歷史記錄失敗:", error);
    return null;
  }
}

/**
 * 更新歷史記錄狀態
 */
export async function updateHistoryStatus(
  taskId: string,
  updates: {
    status?: "pending" | "processing" | "completed" | "failed" | "cancelled";
    progress?: number;
    currentStep?: string;
    outputUrls?: GenerationOutputUrls;
    thumbnailUrl?: string;
    duration?: number;
    cost?: string;
    processingTime?: number;
    errorMessage?: string;
    errorCode?: string;
    metadata?: Record<string, any>;
  }
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  try {
    const updateData: any = { ...updates };
    
    // 如果狀態變為完成，設置完成時間
    if (updates.status === "completed" || updates.status === "failed") {
      updateData.completedAt = new Date();
    }

    await db.update(generationHistory)
      .set(updateData)
      .where(eq(generationHistory.taskId, taskId));

    return true;
  } catch (error) {
    console.error("[History] 更新歷史記錄失敗:", error);
    return false;
  }
}

/**
 * 獲取歷史記錄（按用戶或會話）
 */
export async function getHistoryRecords(options: {
  userId?: number;
  sessionId?: string;
  taskType?: "video" | "image" | "audio" | "voice_clone";
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<GenerationHistory[]> {
  const db = await getDb();
  if (!db) return [];

  const { userId, sessionId, taskType, status, limit = 20, offset = 0 } = options;

  // 必須有 userId 或 sessionId 才能查詢，避免返回所有記錄
  if (!userId && !sessionId) {
    console.warn("[History] 查詢歷史記錄需要 userId 或 sessionId");
    return [];
  }

  try {
    // 構建用戶/會話過濾條件
    const userOrSessionFilter = userId 
      ? eq(generationHistory.userId, userId)
      : eq(generationHistory.sessionId, sessionId!);

    let query = db.select()
      .from(generationHistory)
      .where(
        and(
          eq(generationHistory.isDeleted, 0),
          userOrSessionFilter,
          taskType ? eq(generationHistory.taskType, taskType) : undefined,
          status ? eq(generationHistory.status, status as any) : undefined
        )
      )
      .orderBy(desc(generationHistory.createdAt))
      .limit(limit)
      .offset(offset);

    return await query;
  } catch (error) {
    console.error("[History] 獲取歷史記錄失敗:", error);
    return [];
  }
}

/**
 * 獲取單個歷史記錄
 */
export async function getHistoryByTaskId(taskId: string): Promise<GenerationHistory | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    const records = await db.select()
      .from(generationHistory)
      .where(
        and(
          eq(generationHistory.taskId, taskId),
          eq(generationHistory.isDeleted, 0)
        )
      )
      .limit(1);

    return records[0] || null;
  } catch (error) {
    console.error("[History] 獲取歷史記錄失敗:", error);
    return null;
  }
}

/**
 * 軟刪除歷史記錄
 */
export async function deleteHistoryRecord(taskId: string, userId?: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  try {
    const conditions = [eq(generationHistory.taskId, taskId)];
    if (userId) {
      conditions.push(eq(generationHistory.userId, userId));
    }

    await db.update(generationHistory)
      .set({ 
        isDeleted: 1, 
        deletedAt: new Date() 
      })
      .where(and(...conditions));

    return true;
  } catch (error) {
    console.error("[History] 刪除歷史記錄失敗:", error);
    return false;
  }
}

/**
 * 批量刪除歷史記錄
 */
export async function deleteMultipleHistoryRecords(
  taskIds: string[], 
  userId?: number
): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  try {
    let deletedCount = 0;
    for (const taskId of taskIds) {
      const success = await deleteHistoryRecord(taskId, userId);
      if (success) deletedCount++;
    }
    return deletedCount;
  } catch (error) {
    console.error("[History] 批量刪除歷史記錄失敗:", error);
    return 0;
  }
}

/**
 * 獲取歷史記錄統計
 */
export async function getHistoryStats(userId?: number, sessionId?: string): Promise<{
  total: number;
  completed: number;
  failed: number;
  processing: number;
  byType: Record<string, number>;
}> {
  const db = await getDb();
  if (!db) {
    return { total: 0, completed: 0, failed: 0, processing: 0, byType: {} };
  }

  try {
    const conditions = [eq(generationHistory.isDeleted, 0)];
    if (userId) conditions.push(eq(generationHistory.userId, userId));
    if (sessionId) conditions.push(eq(generationHistory.sessionId, sessionId));

    const records = await db.select()
      .from(generationHistory)
      .where(and(...conditions));

    const stats = {
      total: records.length,
      completed: records.filter(r => r.status === "completed").length,
      failed: records.filter(r => r.status === "failed").length,
      processing: records.filter(r => r.status === "processing" || r.status === "pending").length,
      byType: {} as Record<string, number>,
    };

    // 按類型統計
    for (const record of records) {
      stats.byType[record.taskType] = (stats.byType[record.taskType] || 0) + 1;
    }

    return stats;
  } catch (error) {
    console.error("[History] 獲取統計失敗:", error);
    return { total: 0, completed: 0, failed: 0, processing: 0, byType: {} };
  }
}

// ============================================
// 克隆聲音相關函數
// ============================================

/**
 * 創建克隆聲音記錄
 */
export async function createClonedVoice(data: {
  userId?: number;
  sessionId?: string;
  voiceId: string;
  name: string;
  description?: string;
  originalAudioUrl: string;
  sampleDuration?: number;
}): Promise<ClonedVoice | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    await db.insert(clonedVoices).values({
      userId: data.userId || null,
      sessionId: data.sessionId || null,
      voiceId: data.voiceId,
      name: data.name,
      description: data.description || null,
      originalAudioUrl: data.originalAudioUrl,
      sampleDuration: data.sampleDuration || null,
      status: "processing",
    });

    const records = await db.select()
      .from(clonedVoices)
      .where(eq(clonedVoices.voiceId, data.voiceId))
      .limit(1);

    return records[0] || null;
  } catch (error) {
    console.error("[Voice] 創建克隆聲音記錄失敗:", error);
    return null;
  }
}

/**
 * 更新克隆聲音狀態
 */
export async function updateClonedVoiceStatus(
  voiceId: string,
  status: "processing" | "ready" | "failed",
  errorMessage?: string
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  try {
    await db.update(clonedVoices)
      .set({ 
        status, 
        errorMessage: errorMessage || null 
      })
      .where(eq(clonedVoices.voiceId, voiceId));

    return true;
  } catch (error) {
    console.error("[Voice] 更新克隆聲音狀態失敗:", error);
    return false;
  }
}

/**
 * 獲取用戶的克隆聲音列表
 */
export async function getClonedVoices(options: {
  userId?: number;
  sessionId?: string;
  status?: "processing" | "ready" | "failed";
}): Promise<ClonedVoice[]> {
  const db = await getDb();
  if (!db) return [];

  const { userId, sessionId, status } = options;

  try {
    const conditions = [eq(clonedVoices.isDeleted, 0)];
    if (userId) conditions.push(eq(clonedVoices.userId, userId));
    if (sessionId) conditions.push(eq(clonedVoices.sessionId, sessionId));
    if (status) conditions.push(eq(clonedVoices.status, status));

    return await db.select()
      .from(clonedVoices)
      .where(and(...conditions))
      .orderBy(desc(clonedVoices.createdAt));
  } catch (error) {
    console.error("[Voice] 獲取克隆聲音列表失敗:", error);
    return [];
  }
}

/**
 * 刪除克隆聲音
 */
export async function deleteClonedVoice(voiceId: string, userId?: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  try {
    const conditions = [eq(clonedVoices.voiceId, voiceId)];
    if (userId) conditions.push(eq(clonedVoices.userId, userId));

    await db.update(clonedVoices)
      .set({ 
        isDeleted: 1, 
        deletedAt: new Date() 
      })
      .where(and(...conditions));

    return true;
  } catch (error) {
    console.error("[Voice] 刪除克隆聲音失敗:", error);
    return false;
  }
}

/**
 * 增加克隆聲音使用次數
 */
export async function incrementVoiceUsage(voiceId: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  try {
    await db.update(clonedVoices)
      .set({ 
        usageCount: sql`${clonedVoices.usageCount} + 1`,
        lastUsedAt: new Date()
      })
      .where(eq(clonedVoices.voiceId, voiceId));

    return true;
  } catch (error) {
    console.error("[Voice] 更新使用次數失敗:", error);
    return false;
  }
}
