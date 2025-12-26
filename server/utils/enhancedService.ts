/**
 * VEO3 增強版視頻服務 - 集成自動修復
 * 
 * 新增功能：
 * 1. 智能重試和降級
 * 2. 自動問題檢測和修復
 * 3. 健康監控
 * 4. 斷點續傳
 */

import { getNextApiKey, API_ENDPOINTS, LLM_FALLBACK_CONFIG } from "./videoConfig";
import { ProblemDetector, AutoFixer, healthMonitor } from "./utils/autoFix";
import { sleep } from "./videoService";

// ============================================
// 1. 增強版 API 調用（帶自動修復）
// ============================================

export interface EnhancedFetchOptions {
  url: string;
  options: RequestInit;
  maxRetries?: number;
  timeout?: number;
  enableAutoFix?: boolean;
  fallbackModels?: string[];
}

export class EnhancedApiClient {
  private autoFixer: AutoFixer;
  private apiKeyPool: string[];
  
  constructor(apiKeyPool: string[]) {
    this.apiKeyPool = apiKeyPool;
    this.autoFixer = new AutoFixer(apiKeyPool);
  }

  /**
   * 增強版 fetch 請求（帶自動修復）
   */
  async fetch(config: EnhancedFetchOptions): Promise<Response> {
    const {
      url,
      options,
      maxRetries = 5,
      timeout = 120000,
      enableAutoFix = true,
    } = config;

    let lastError: Error | null = null;
    let attempt = 0;

    while (attempt < maxRetries) {
      const startTime = Date.now();
      
      try {
        console.log(`[EnhancedAPI] 請求 ${url} (嘗試 ${attempt + 1}/${maxRetries})`);

        // 添加超時控制
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        const responseTime = Date.now() - startTime;

        // 記錄成功請求
        healthMonitor.recordRequest(true, responseTime);

        // 檢查響應狀態
        if (!response.ok) {
          const responseBody = await response.json().catch(() => ({}));
          
          // 檢測問題
          const problem = ProblemDetector.detect(null, response.status, responseBody);
          
          if (problem && enableAutoFix) {
            console.warn(`[EnhancedAPI] 檢測到問題: ${problem.type}`);
            
            // 嘗試自動修復
            const fixResult = await this.autoFixer.fix(problem);
            
            if (fixResult.success) {
              console.log(`[EnhancedAPI] 修復成功: ${fixResult.message}`);
              attempt++;
              continue; // 重試
            } else {
              console.error(`[EnhancedAPI] 修復失敗: ${fixResult.message}`);
              throw new Error(`API 請求失敗: ${problem.message}`);
            }
          }
        }

        console.log(`[EnhancedAPI] 請求成功 (${responseTime}ms)`);
        return response;

      } catch (error) {
        lastError = error as Error;
        const responseTime = Date.now() - startTime;
        
        // 記錄失敗請求
        healthMonitor.recordRequest(false, responseTime);

        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`[EnhancedAPI] 請求失敗 (嘗試 ${attempt + 1}/${maxRetries}): ${errorMsg}`);

        // 檢測問題
        const problem = ProblemDetector.detect(error as Error);

        if (problem && enableAutoFix && attempt < maxRetries - 1) {
          console.warn(`[EnhancedAPI] 檢測到問題: ${problem.type}`);
          
          // 嘗試自動修復
          const fixResult = await this.autoFixer.fix(problem);
          
          if (fixResult.success) {
            console.log(`[EnhancedAPI] 修復成功: ${fixResult.message}`);
            attempt++;
            continue; // 重試
          }
        }

        // 如果不是最後一次嘗試，等待後重試
        if (attempt < maxRetries - 1) {
          const waitTime = Math.min(3000 * Math.pow(2, attempt), 30000);
          console.log(`[EnhancedAPI] 等待 ${waitTime}ms 後重試...`);
          await sleep(waitTime);
        }

        attempt++;
      }
    }

    // 所有重試都失敗
    throw new Error(`請求失敗，已重試 ${maxRetries} 次: ${lastError?.message || '未知錯誤'}`);
  }

  /**
   * 帶模型降級的 LLM 請求
   */
  async fetchWithFallback(
    url: string,
    options: RequestInit,
    primaryModel: string,
    fallbackChain: string[]
  ): Promise<Response> {
    const models = [primaryModel, ...fallbackChain];
    
    for (let i = 0; i < models.length; i++) {
      const model = models[i];
      console.log(`[EnhancedAPI] 嘗試使用模型: ${model} (${i + 1}/${models.length})`);
      
      try {
        // 修改請求中的模型
        const body = JSON.parse(options.body as string);
        body.model = model;
        
        const modifiedOptions = {
          ...options,
          body: JSON.stringify(body),
        };
        
        const response = await this.fetch({
          url,
          options: modifiedOptions,
          maxRetries: 3, // 每個模型重試 3 次
          timeout: 120000,
          enableAutoFix: true,
        });
        
        console.log(`[EnhancedAPI] 模型 ${model} 請求成功`);
        return response;
        
      } catch (error) {
        console.warn(`[EnhancedAPI] 模型 ${model} 失敗: ${error}`);
        
        if (i === models.length - 1) {
          // 所有模型都失敗了
          throw new Error(`所有模型都失敗了: ${error}`);
        }
        
        console.log(`[EnhancedAPI] 降級到下一個模型...`);
      }
    }
    
    throw new Error('所有模型降級嘗試都失敗');
  }
}

// ============================================
// 2. 進度追蹤器（精確版）
// ============================================

export class ProgressTracker {
  private taskId: number;
  private totalSteps: number;
  private currentStep: number = 0;
  private stepProgress: Map<string, number> = new Map();
  
  constructor(taskId: number, totalSteps: number) {
    this.taskId = taskId;
    this.totalSteps = totalSteps;
  }

  /**
   * 更新步驟進度
   */
  updateStepProgress(stepName: string, progress: number) {
    this.stepProgress.set(stepName, progress);
    
    // 計算總進度
    const totalProgress = this.calculateTotalProgress();
    
    console.log(`[Progress] 任務 ${this.taskId} - ${stepName}: ${progress}% (總進度: ${totalProgress}%)`);
    
    return totalProgress;
  }

  /**
   * 計算總進度
   */
  private calculateTotalProgress(): number {
    let sum = 0;
    
    this.stepProgress.forEach((progress) => {
      sum += progress;
    });
    
    return Math.round(sum / this.totalSteps);
  }

  /**
   * 完成一個步驟
   */
  completeStep(stepName: string) {
    this.stepProgress.set(stepName, 100);
    this.currentStep++;
    
    return this.calculateTotalProgress();
  }

  /**
   * 獲取當前進度
   */
  getProgress() {
    return {
      totalProgress: this.calculateTotalProgress(),
      currentStep: this.currentStep,
      totalSteps: this.totalSteps,
      stepDetails: Object.fromEntries(this.stepProgress),
    };
  }
}

// ============================================
// 3. 斷點續傳管理器
// ============================================

export interface Checkpoint {
  taskId: number;
  stage: string;
  completedScenes: number[];
  partialResults: Record<string, any>;
  timestamp: Date;
}

export class CheckpointManager {
  private checkpoints: Map<number, Checkpoint> = new Map();

  /**
   * 保存檢查點
   */
  saveCheckpoint(checkpoint: Checkpoint) {
    this.checkpoints.set(checkpoint.taskId, checkpoint);
    console.log(`[Checkpoint] 已保存檢查點 - 任務 ${checkpoint.taskId}, 階段: ${checkpoint.stage}`);
  }

  /**
   * 獲取檢查點
   */
  getCheckpoint(taskId: number): Checkpoint | null {
    return this.checkpoints.get(taskId) || null;
  }

  /**
   * 刪除檢查點
   */
  deleteCheckpoint(taskId: number) {
    this.checkpoints.delete(taskId);
    console.log(`[Checkpoint] 已刪除檢查點 - 任務 ${taskId}`);
  }

  /**
   * 從檢查點恢復
   */
  async recoverFromCheckpoint(taskId: number): Promise<Checkpoint | null> {
    const checkpoint = this.getCheckpoint(taskId);
    
    if (!checkpoint) {
      console.log(`[Checkpoint] 未找到檢查點 - 任務 ${taskId}`);
      return null;
    }
    
    console.log(`[Checkpoint] 從檢查點恢復 - 任務 ${taskId}, 階段: ${checkpoint.stage}`);
    console.log(`[Checkpoint] 已完成場景: ${checkpoint.completedScenes.join(', ')}`);
    
    return checkpoint;
  }
}

// ============================================
// 4. 智能重試策略
// ============================================

export class SmartRetryStrategy {
  /**
   * 計算重試延遲（指數退避 + 抖動）
   */
  static calculateDelay(attempt: number, baseDelay: number = 1000): number {
    // 指數退避
    const exponentialDelay = baseDelay * Math.pow(2, attempt);
    
    // 添加隨機抖動（±20%）
    const jitter = exponentialDelay * 0.2 * (Math.random() * 2 - 1);
    
    // 限制最大延遲為 30 秒
    return Math.min(exponentialDelay + jitter, 30000);
  }

  /**
   * 判斷是否應該重試
   */
  static shouldRetry(error: Error, attempt: number, maxRetries: number): boolean {
    if (attempt >= maxRetries) {
      return false;
    }
    
    const errorMsg = error.message.toLowerCase();
    
    // 可重試的錯誤類型
    const retryableErrors = [
      'timeout',
      'network',
      'econnrefused',
      'rate limit',
      'too many requests',
      '429',
      '500',
      '502',
      '503',
      '504',
    ];
    
    return retryableErrors.some(keyword => errorMsg.includes(keyword));
  }

  /**
   * 執行帶智能重試的操作
   */
  static async execute<T>(
    operation: () => Promise<T>,
    maxRetries: number = 5,
    baseDelay: number = 1000
  ): Promise<T> {
    let attempt = 0;
    let lastError: Error;
    
    while (attempt < maxRetries) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        if (!this.shouldRetry(lastError, attempt, maxRetries)) {
          throw lastError;
        }
        
        const delay = this.calculateDelay(attempt, baseDelay);
        console.log(`[SmartRetry] 重試 ${attempt + 1}/${maxRetries}，等待 ${delay}ms...`);
        
        await sleep(delay);
        attempt++;
      }
    }
    
    throw lastError!;
  }
}

// ============================================
// 5. 導出實例
// ============================================

// 需要從 videoConfig 導入 API_KEYS
// export const enhancedApiClient = new EnhancedApiClient(API_KEYS);
export const checkpointManager = new CheckpointManager();
