/**
 * VEO3 API 限流專用處理器
 * 
 * 專門解決短時間內大量訪問造成的 API 限流問題
 * 
 * 核心功能：
 * 1. 智能請求隊列（控制並發數）
 * 2. 動態速率限制（根據 API 響應調整）
 * 3. 請求優先級管理
 * 4. 自適應等待時間
 * 5. API Key 負載均衡
 */

import { getNextApiKey, API_KEYS } from "../videoConfig";
import { sleep } from "../videoService";

// ============================================
// 1. 限流配置
// ============================================

interface RateLimitConfig {
  // 基礎配置
  maxConcurrent: number;           // 最大並發請求數
  minInterval: number;              // 最小請求間隔（毫秒）
  maxRequestsPerMinute: number;     // 每分鐘最大請求數
  
  // 動態調整配置
  enableDynamicAdjust: boolean;     // 是否啟用動態調整
  adjustMultiplier: number;         // 調整倍數（遇到限流時）
  maxWaitTime: number;              // 最大等待時間（毫秒）
  
  // 重試配置
  maxRetries: number;               // 最大重試次數
  retryDelay: number;               // 重試延遲（毫秒）
  backoffMultiplier: number;        // 退避倍數
}

// 默認限流配置（保守策略）
const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  maxConcurrent: 3,                 // 最多同時 3 個請求
  minInterval: 2000,                // 至少間隔 2 秒
  maxRequestsPerMinute: 20,         // 每分鐘最多 20 個請求
  
  enableDynamicAdjust: true,        // 啟用動態調整
  adjustMultiplier: 2.0,            // 遇到限流時等待時間翻倍
  maxWaitTime: 60000,               // 最多等待 60 秒
  
  maxRetries: 5,                    // 最多重試 5 次
  retryDelay: 5000,                 // 重試延遲 5 秒
  backoffMultiplier: 1.5,           // 指數退避倍數
};

// 激進配置（當 API 限制較寬鬆時）
const AGGRESSIVE_RATE_LIMIT_CONFIG: RateLimitConfig = {
  maxConcurrent: 5,
  minInterval: 1000,
  maxRequestsPerMinute: 30,
  
  enableDynamicAdjust: true,
  adjustMultiplier: 1.5,
  maxWaitTime: 30000,
  
  maxRetries: 3,
  retryDelay: 3000,
  backoffMultiplier: 1.5,
};

// ============================================
// 2. 請求隊列管理器
// ============================================

interface QueuedRequest {
  id: string;
  priority: number;                 // 優先級（越大越優先）
  execute: () => Promise<any>;      // 執行函數
  resolve: (value: any) => void;    // Promise resolve
  reject: (reason: any) => void;    // Promise reject
  apiKey: string;                   // 使用的 API Key
  timestamp: number;                // 入隊時間
}

class RequestQueue {
  private queue: QueuedRequest[] = [];
  private running: number = 0;
  private config: RateLimitConfig;
  private lastRequestTime: number = 0;
  private requestHistory: number[] = [];  // 請求時間戳歷史
  
  // 動態調整參數
  private currentMinInterval: number;
  private rateLimitCount: number = 0;
  
  constructor(config: RateLimitConfig = DEFAULT_RATE_LIMIT_CONFIG) {
    this.config = config;
    this.currentMinInterval = config.minInterval;
  }
  
  /**
   * 添加請求到隊列
   */
  async enqueue<T>(
    execute: () => Promise<T>,
    priority: number = 0,
    apiKey?: string
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const request: QueuedRequest = {
        id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        priority,
        execute,
        resolve,
        reject,
        apiKey: apiKey || getNextApiKey(),
        timestamp: Date.now(),
      };
      
      this.queue.push(request);
      
      // 按優先級排序（優先級高的在前）
      this.queue.sort((a, b) => b.priority - a.priority);
      
      console.log(`[RateLimitHandler] 請求入隊: ${request.id}, 優先級: ${priority}, 當前隊列長度: ${this.queue.length}`);
      
      // 嘗試處理隊列
      this.processQueue();
    });
  }
  
  /**
   * 處理隊列
   */
  private async processQueue(): Promise<void> {
    // 檢查是否可以執行更多請求
    if (this.running >= this.config.maxConcurrent) {
      console.log(`[RateLimitHandler] 已達最大並發數: ${this.running}/${this.config.maxConcurrent}`);
      return;
    }
    
    if (this.queue.length === 0) {
      return;
    }
    
    // 檢查是否需要等待（請求間隔）
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.currentMinInterval) {
      const waitTime = this.currentMinInterval - timeSinceLastRequest;
      console.log(`[RateLimitHandler] 等待請求間隔: ${waitTime}ms`);
      await sleep(waitTime);
    }
    
    // 檢查每分鐘請求數限制
    if (!this.canMakeRequest()) {
      const waitTime = this.getWaitTimeForNextRequest();
      console.log(`[RateLimitHandler] 達到每分鐘請求數限制，等待: ${waitTime}ms`);
      await sleep(waitTime);
    }
    
    // 取出第一個請求
    const request = this.queue.shift();
    if (!request) {
      return;
    }
    
    // 更新狀態
    this.running++;
    this.lastRequestTime = Date.now();
    this.recordRequest();
    
    console.log(`[RateLimitHandler] 開始執行請求: ${request.id}, 當前運行中: ${this.running}`);
    
    // 執行請求（不阻塞其他請求）
    this.executeRequest(request);
    
    // 繼續處理隊列
    this.processQueue();
  }
  
  /**
   * 執行單個請求
   */
  private async executeRequest(request: QueuedRequest): Promise<void> {
    try {
      const result = await request.execute();
      request.resolve(result);
      
      console.log(`[RateLimitHandler] 請求執行成功: ${request.id}`);
      
      // 成功後逐漸降低間隔（如果啟用動態調整）
      if (this.config.enableDynamicAdjust && this.rateLimitCount > 0) {
        this.rateLimitCount = Math.max(0, this.rateLimitCount - 1);
        this.adjustInterval();
      }
      
    } catch (error: any) {
      // 檢查是否是限流錯誤
      if (this.isRateLimitError(error)) {
        console.warn(`[RateLimitHandler] 檢測到限流錯誤: ${request.id}`);
        
        // 動態調整間隔
        this.rateLimitCount++;
        this.adjustInterval();
        
        // 重新入隊（降低優先級）
        this.queue.unshift({
          ...request,
          priority: request.priority - 1,
        });
        
        console.log(`[RateLimitHandler] 請求重新入隊: ${request.id}, 新優先級: ${request.priority - 1}`);
        
      } else {
        request.reject(error);
        console.error(`[RateLimitHandler] 請求執行失敗: ${request.id}`, error);
      }
    } finally {
      this.running--;
      
      // 繼續處理隊列
      this.processQueue();
    }
  }
  
  /**
   * 檢查是否是限流錯誤
   */
  private isRateLimitError(error: any): boolean {
    const errorMsg = error?.message || String(error);
    const statusCode = error?.response?.status || error?.status;
    
    return (
      statusCode === 429 ||
      errorMsg.includes('rate limit') ||
      errorMsg.includes('too many requests') ||
      errorMsg.includes('quota exceeded') ||
      errorMsg.includes('throttle')
    );
  }
  
  /**
   * 動態調整請求間隔
   */
  private adjustInterval(): void {
    if (!this.config.enableDynamicAdjust) {
      return;
    }
    
    if (this.rateLimitCount > 0) {
      // 增加間隔
      const newInterval = Math.min(
        this.currentMinInterval * this.config.adjustMultiplier,
        this.config.maxWaitTime
      );
      
      console.log(`[RateLimitHandler] 調整請求間隔: ${this.currentMinInterval}ms → ${newInterval}ms (限流次數: ${this.rateLimitCount})`);
      
      this.currentMinInterval = newInterval;
    } else {
      // 恢復默認間隔
      if (this.currentMinInterval > this.config.minInterval) {
        this.currentMinInterval = Math.max(
          this.currentMinInterval / this.config.adjustMultiplier,
          this.config.minInterval
        );
        
        console.log(`[RateLimitHandler] 恢復請求間隔: ${this.currentMinInterval}ms`);
      }
    }
  }
  
  /**
   * 記錄請求時間
   */
  private recordRequest(): void {
    const now = Date.now();
    this.requestHistory.push(now);
    
    // 只保留最近 1 分鐘的記錄
    this.requestHistory = this.requestHistory.filter(
      time => now - time < 60000
    );
  }
  
  /**
   * 檢查是否可以發送請求
   */
  private canMakeRequest(): boolean {
    return this.requestHistory.length < this.config.maxRequestsPerMinute;
  }
  
  /**
   * 獲取下次請求需要等待的時間
   */
  private getWaitTimeForNextRequest(): number {
    if (this.requestHistory.length === 0) {
      return 0;
    }
    
    const oldestRequest = this.requestHistory[0];
    const timeUntilOldestExpires = 60000 - (Date.now() - oldestRequest);
    
    return Math.max(0, timeUntilOldestExpires);
  }
  
  /**
   * 獲取隊列統計
   */
  getStats() {
    return {
      queueLength: this.queue.length,
      running: this.running,
      currentMinInterval: this.currentMinInterval,
      rateLimitCount: this.rateLimitCount,
      requestsInLastMinute: this.requestHistory.length,
      maxRequestsPerMinute: this.config.maxRequestsPerMinute,
    };
  }
  
  /**
   * 重置限流計數
   */
  resetRateLimitCount(): void {
    this.rateLimitCount = 0;
    this.currentMinInterval = this.config.minInterval;
    console.log('[RateLimitHandler] 限流計數已重置');
  }
}

// ============================================
// 3. API Key 負載均衡器
// ============================================

class ApiKeyBalancer {
  private keyStats: Map<string, {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    rateLimitCount: number;
    lastUsedTime: number;
    cooldownUntil: number;
  }> = new Map();
  
  constructor() {
    // 初始化所有 Keys 的統計
    API_KEYS.forEach(key => {
      this.keyStats.set(key, {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        rateLimitCount: 0,
        lastUsedTime: 0,
        cooldownUntil: 0,
      });
    });
  }
  
  /**
   * 選擇最佳 API Key
   */
  selectBestKey(): string {
    const now = Date.now();
    const availableKeys: Array<{ key: string; score: number }> = [];
    
    this.keyStats.forEach((stats, key) => {
      // 跳過冷卻中的 Keys
      if (stats.cooldownUntil > now) {
        console.log(`[ApiKeyBalancer] Key 冷卻中: ${key.substring(0, 10)}... 剩餘: ${Math.round((stats.cooldownUntil - now) / 1000)}s`);
        return;
      }
      
      // 計算分數（越高越好）
      const successRate = stats.totalRequests > 0
        ? stats.successfulRequests / stats.totalRequests
        : 1;
      
      const timeSinceLastUse = now - stats.lastUsedTime;
      const timeScore = Math.min(timeSinceLastUse / 10000, 1); // 最近 10 秒內使用過得分低
      
      const rateLimitPenalty = Math.max(0, 1 - (stats.rateLimitCount * 0.1));
      
      const score = successRate * 0.5 + timeScore * 0.3 + rateLimitPenalty * 0.2;
      
      availableKeys.push({ key, score });
    });
    
    // 按分數排序
    availableKeys.sort((a, b) => b.score - a.score);
    
    if (availableKeys.length === 0) {
      // 所有 Keys 都在冷卻中，選擇冷卻時間最短的
      console.warn('[ApiKeyBalancer] 所有 Keys 都在冷卻中，選擇冷卻時間最短的');
      
      let bestKey = API_KEYS[0];
      let minCooldown = Infinity;
      
      this.keyStats.forEach((stats, key) => {
        if (stats.cooldownUntil < minCooldown) {
          minCooldown = stats.cooldownUntil;
          bestKey = key;
        }
      });
      
      return bestKey;
    }
    
    const selectedKey = availableKeys[0].key;
    console.log(`[ApiKeyBalancer] 選擇 Key: ${selectedKey.substring(0, 10)}... (分數: ${availableKeys[0].score.toFixed(2)})`);
    
    return selectedKey;
  }
  
  /**
   * 記錄請求成功
   */
  recordSuccess(key: string): void {
    const stats = this.keyStats.get(key);
    if (stats) {
      stats.totalRequests++;
      stats.successfulRequests++;
      stats.lastUsedTime = Date.now();
    }
  }
  
  /**
   * 記錄請求失敗
   */
  recordFailure(key: string, isRateLimit: boolean = false): void {
    const stats = this.keyStats.get(key);
    if (stats) {
      stats.totalRequests++;
      stats.failedRequests++;
      stats.lastUsedTime = Date.now();
      
      if (isRateLimit) {
        stats.rateLimitCount++;
        
        // 設置冷卻時間（指數增長）
        const cooldownTime = Math.min(5000 * Math.pow(2, stats.rateLimitCount - 1), 60000);
        stats.cooldownUntil = Date.now() + cooldownTime;
        
        console.warn(`[ApiKeyBalancer] Key 觸發限流: ${key.substring(0, 10)}... 冷卻時間: ${cooldownTime}ms`);
      }
    }
  }
  
  /**
   * 重置 Key 統計
   */
  resetKey(key: string): void {
    const stats = this.keyStats.get(key);
    if (stats) {
      stats.rateLimitCount = 0;
      stats.cooldownUntil = 0;
      console.log(`[ApiKeyBalancer] Key 統計已重置: ${key.substring(0, 10)}...`);
    }
  }
  
  /**
   * 獲取統計信息
   */
  getStats() {
    const stats: any = {};
    this.keyStats.forEach((keyStats, key) => {
      stats[key.substring(0, 10)] = {
        ...keyStats,
        successRate: keyStats.totalRequests > 0
          ? (keyStats.successfulRequests / keyStats.totalRequests * 100).toFixed(1) + '%'
          : 'N/A',
      };
    });
    return stats;
  }
}

// ============================================
// 4. 限流處理器（主類）
// ============================================

export class RateLimitHandler {
  private requestQueue: RequestQueue;
  private keyBalancer: ApiKeyBalancer;
  private config: RateLimitConfig;
  
  constructor(config: RateLimitConfig = DEFAULT_RATE_LIMIT_CONFIG) {
    this.config = config;
    this.requestQueue = new RequestQueue(config);
    this.keyBalancer = new ApiKeyBalancer();
    
    console.log('[RateLimitHandler] 初始化完成');
    console.log(`  最大並發: ${config.maxConcurrent}`);
    console.log(`  最小間隔: ${config.minInterval}ms`);
    console.log(`  每分鐘最大請求數: ${config.maxRequestsPerMinute}`);
  }
  
  /**
   * 執行受限流控制的請求
   */
  async executeWithRateLimit<T>(
    requestFn: (apiKey: string) => Promise<T>,
    priority: number = 0
  ): Promise<T> {
    // 選擇最佳 API Key
    const apiKey = this.keyBalancer.selectBestKey();
    
    // 包裝請求函數
    const wrappedFn = async () => {
      try {
        const result = await requestFn(apiKey);
        this.keyBalancer.recordSuccess(apiKey);
        return result;
      } catch (error: any) {
        const isRateLimit = this.isRateLimitError(error);
        this.keyBalancer.recordFailure(apiKey, isRateLimit);
        throw error;
      }
    };
    
    // 加入隊列執行
    return this.requestQueue.enqueue(wrappedFn, priority, apiKey);
  }
  
  /**
   * 檢查是否是限流錯誤
   */
  private isRateLimitError(error: any): boolean {
    const errorMsg = error?.message || String(error);
    const statusCode = error?.response?.status || error?.status;
    
    return (
      statusCode === 429 ||
      errorMsg.includes('rate limit') ||
      errorMsg.includes('too many requests') ||
      errorMsg.includes('quota exceeded') ||
      errorMsg.includes('throttle')
    );
  }
  
  /**
   * 獲取統計信息
   */
  getStats() {
    return {
      queue: this.requestQueue.getStats(),
      keys: this.keyBalancer.getStats(),
    };
  }
  
  /**
   * 重置所有統計
   */
  reset(): void {
    this.requestQueue.resetRateLimitCount();
    API_KEYS.forEach(key => this.keyBalancer.resetKey(key));
    console.log('[RateLimitHandler] 所有統計已重置');
  }
}

// ============================================
// 5. 導出單例實例
// ============================================

// 默認實例（保守策略）
export const rateLimitHandler = new RateLimitHandler(DEFAULT_RATE_LIMIT_CONFIG);

// 激進實例（用於限制較寬鬆的 API）
export const aggressiveRateLimitHandler = new RateLimitHandler(AGGRESSIVE_RATE_LIMIT_CONFIG);

// 導出配置類型
export type { RateLimitConfig, QueuedRequest };
export { DEFAULT_RATE_LIMIT_CONFIG, AGGRESSIVE_RATE_LIMIT_CONFIG };
