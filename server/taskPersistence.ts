/**
 * 任務持久化服務
 * 使用 Render Disk 實現數據持久化
 * 所有 I/O 操作都是異步的，避免阻塞主線程
 */

import { promises as fs } from 'fs';
import path from 'path';
import type { LongVideoTask, TaskSummary } from './types/task';

// ========================================
// 數據目錄配置
// ========================================

// Render Disk 掛載路徑優先，其次是環境變量，最後是本地路徑
const DATADIR = process.env.TASKDATADIR || 
  process.env.DATA_DIR || 
  path.join(process.cwd(), 'data', 'tasks');
const INDEXFILE = path.join(DATADIR, 'index.json');

console.log(`📁 [Persistence] 初始化配置:`);
console.log(`  - TASKDATADIR: ${process.env.TASKDATADIR || '未設置'}`);
console.log(`  - DATA_DIR: ${process.env.DATA_DIR || '未設置'}`);
console.log(`  - 最終數據目錄: ${DATADIR}`);
console.log(`  - 當前工作目錄: ${process.cwd()}`);

// 初始化數據目錄
async function ensureDataDir(): Promise<void> {
  try {
    // 檢查目錄是否存在
    await fs.access(DATADIR);
    console.log(`✅ [Persistence] 數據目錄已存在: ${DATADIR}`);
  } catch (error: any) {
    // 目錄不存在，創建它
    try {
      await fs.mkdir(DATADIR, { recursive: true });
      console.log(`✅ [Persistence] 數據目錄已創建: ${DATADIR}`);
      
      // 驗證目錄是否可寫
      const testFile = path.join(DATADIR, '.test');
      await fs.writeFile(testFile, 'test', 'utf-8');
      await fs.unlink(testFile);
      console.log(`✅ [Persistence] 數據目錄可寫入`);
    } catch (createError: any) {
      console.error(`❌ [Persistence] 創建/驗證數據目錄失敗:`, createError.message);
      throw createError;
    }
  }
}

// 服務啟動時立即初始化（不使用 catch，讓錯誤顯示）
console.log(`⏳ [Persistence] 初始化數據目錄...`);
ensureDataDir()
  .then(() => {
    console.log(`✅ [Persistence] 初始化完成`);
  })
  .catch(err => {
    console.error(`❌ [Persistence] 初始化失敗:`, err.message);
    console.error(`❌ [Persistence] 堆棧跟蹤:`, err.stack);
  });

// ========================================
// 核心函數（全部異步）
// ========================================

/**
 * ✅ 保存任務（異步 + 原子寫入）
 */
export async function saveTask(task: LongVideoTask): Promise<void> {
  try {
    await ensureDataDir();

    const taskFilePath = path.join(DATADIR, `${task.taskId}.json`);
    const tempFilePath = `${taskFilePath}.tmp`;

    // 原子寫入：先寫臨時文件，再重命名
    await fs.writeFile(
      tempFilePath,
      JSON.stringify(task, null, 2),
      'utf-8'
    );

    await fs.rename(tempFilePath, taskFilePath);

    // 更新索引
    await updateIndex(task);

    console.log(`✅ [Persistence] 任務已保存: ${task.taskId} (${task.status})`);

  } catch (error: any) {
    console.error(`❌ [Persistence] 保存任務失敗:`, error.message);
    console.error(`  - taskId: ${task.taskId}`);
    console.error(`  - 目標路徑: ${path.join(DATADIR, `${task.taskId}.json`)}`);
    console.error(`  - 堆棧: ${error.stack}`);
    throw new Error(`保存任務失敗: ${error.message}`);
  }
}

/**
 * ✅ 加載任務（異步）
 */
export async function loadTask(taskId: string): Promise<LongVideoTask | null> {
  try {
    const taskFilePath = path.join(DATADIR, `${taskId}.json`);

    // 檢查文件是否存在
    try {
      await fs.access(taskFilePath);
    } catch {
      console.warn(`⚠️ [Persistence] 任務不存在: ${taskId}`);
      return null;
    }

    // 讀取文件
    const taskData = await fs.readFile(taskFilePath, 'utf-8');
    const task = JSON.parse(taskData) as LongVideoTask;

    console.log(`✅ [Persistence] 任務已加載: ${taskId}`);

    return task;

  } catch (error: any) {
    console.error(`❌ [Persistence] 加載任務失敗:`, error.message);
    return null;
  }
}

/**
 * ✅ 獲取所有任務摘要（異步 + 分頁）
 */
export async function listTasks(
  limit: number = 50,
  offset: number = 0
): Promise<{ tasks: TaskSummary[]; total: number }> {
  try {
    await ensureDataDir();

    // 讀取索引文件
    let index: TaskSummary[] = [];

    try {
      await fs.access(INDEXFILE);
      const indexData = await fs.readFile(INDEXFILE, 'utf-8');
      index = JSON.parse(indexData);
    } catch {
      // 索引文件不存在，返回空列表
      return { tasks: [], total: 0 };
    }

    // 按創建時間降序排序
    const sortedTasks = index.sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    // 分頁
    const paginatedTasks = sortedTasks.slice(offset, offset + limit);

    console.log(`✅ [Persistence] 獲取任務列表: ${paginatedTasks.length}/${sortedTasks.length}`);

    return {
      tasks: paginatedTasks,
      total: sortedTasks.length
    };

  } catch (error: any) {
    console.error(`❌ [Persistence] 獲取任務列表失敗:`, error.message);
    return { tasks: [], total: 0 };
  }
}

/**
 * ✅ 刪除任務（異步）
 */
export async function deleteTask(taskId: string): Promise<void> {
  try {
    const taskFilePath = path.join(DATADIR, `${taskId}.json`);

    // 刪除任務文件
    try {
      await fs.unlink(taskFilePath);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    // 從索引中移除
    await removeFromIndex(taskId);

    console.log(`✅ [Persistence] 任務已刪除: ${taskId}`);

  } catch (error: any) {
    console.error(`❌ [Persistence] 刪除任務失敗:`, error.message);
    throw new Error(`刪除任務失敗: ${error.message}`);
  }
}

/**
 * ✅ 更新索引文件（異步 + 去重）
 */
async function updateIndex(task: LongVideoTask): Promise<void> {
  try {
    let index: TaskSummary[] = [];

    // 讀取現有索引
    try {
      await fs.access(INDEXFILE);
      const indexData = await fs.readFile(INDEXFILE, 'utf-8');
      index = JSON.parse(indexData);
    } catch {
      // 索引文件不存在，創建新的
    }

    // 查找現有任務
    const existingIndex = index.findIndex(t => t.taskId === task.taskId);

    // 創建任務摘要
    const summary: TaskSummary = {
      taskId: task.taskId,
      title: task.title,
      status: task.status,
      progress: task.progress,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      segmentCount: task.segments.length,
      completedSegments: task.segments.filter(s => s.status === 'completed').length,
      thumbnailUrl: task.segments.find(s => s.imageUrl || s.videoUrl)?.imageUrl ||
        task.segments.find(s => s.imageUrl || s.videoUrl)?.videoUrl
    };

    // 更新或添加
    if (existingIndex >= 0) {
      index[existingIndex] = summary;
    } else {
      index.push(summary);
    }

    // 原子寫入索引文件
    const tempIndexFile = `${INDEXFILE}.tmp`;
    await fs.writeFile(tempIndexFile, JSON.stringify(index, null, 2), 'utf-8');
    await fs.rename(tempIndexFile, INDEXFILE);

  } catch (error: any) {
    console.error(`❌ [Persistence] 更新索引失敗:`, error.message);
  }
}

/**
 * ✅ 從索引中移除任務（異步）
 */
async function removeFromIndex(taskId: string): Promise<void> {
  try {
    try {
      await fs.access(INDEXFILE);
    } catch {
      return;
    }

    const indexData = await fs.readFile(INDEXFILE, 'utf-8');
    let index = JSON.parse(indexData) as TaskSummary[];

    // 過濾掉要刪除的任務
    index = index.filter(t => t.taskId !== taskId);

    // 原子寫入
    const tempIndexFile = `${INDEXFILE}.tmp`;
    await fs.writeFile(tempIndexFile, JSON.stringify(index, null, 2), 'utf-8');
    await fs.rename(tempIndexFile, INDEXFILE);

  } catch (error: any) {
    console.error(`❌ [Persistence] 從索引移除失敗:`, error.message);
  }
}

/**
 * ✅ 清理舊任務（異步）
 */
export async function cleanupOldTasks(daysToKeep: number = 30): Promise<number> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const { tasks } = await listTasks(1000, 0);
    let deletedCount = 0;

    for (const task of tasks) {
      const taskDate = new Date(task.createdAt);

      if (taskDate < cutoffDate) {
        try {
          await deleteTask(task.taskId);
          deletedCount++;
        } catch (error) {
          console.error(`❌ [Persistence] 刪除舊任務失敗: ${task.taskId}`);
        }
      }
    }

    console.log(`✅ [Persistence] 清理完成: 刪除 ${deletedCount} 個舊任務`);
    return deletedCount;

  } catch (error: any) {
    console.error(`❌ [Persistence] 清理舊任務失敗:`, error.message);
    return 0;
  }
}

/**
 * ✅ 健康檢查
 */
export async function healthCheck(): Promise<{ healthy: boolean; message: string }> {
  try {
    await ensureDataDir();

    // 嘗試寫入測試文件
    const testFile = path.join(DATADIR, '.healthcheck');
    await fs.writeFile(testFile, Date.now().toString(), 'utf-8');
    await fs.unlink(testFile);

    return {
      healthy: true,
      message: '存儲系統正常'
    };

  } catch (error: any) {
    return {
      healthy: false,
      message: `存儲系統異常: ${error.message}`
    };
  }
}
