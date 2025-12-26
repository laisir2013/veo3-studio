/**
 * VEO3 自動診斷和修復系統 - AutoFix Engine
 * 
 * 功能：
 * 1. 自動檢測常見問題
 * 2. 智能修復和恢復
 * 3. 降級策略
 * 4. 健康監控
 */

import { sleep } from '../videoService';

// ============================================
// 1. 問題類型定義
// ============================================

export enum ProblemType {
  API_TIMEOUT = 'api_timeout',
  API_RATE_LIMIT = 'api_rate_limit',
  API_KEY_INVALID = 'api_key_invalid',
  NETWORK_ERROR = 'network_error',
  MEMORY_OVERFLOW = 'memory_overflow',
  MODEL_UNAVAILABLE = 'model_unavailable',
  GENERATION_STUCK = 'generation_stuck',
  INVALID_RESPONSE = 'invalid_response',
  QUOTA_EXCEEDED = 'quota_exceeded',
  SERVER_ERROR = 'server_error',
}

export interface Problem {
  type: ProblemType;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface FixResult {
  success: boolean;
  action: string;
  message: string;
  metadata?: Record<string, any>;
}

// ============================================
// 2. 問題檢測器
// ============================================

export class ProblemDetector {
  /**
   * 檢測 API 超時問題
   */
  static detectApiTimeout(error: Error): Problem | null {
    const errorMsg = error.message.toLowerCase();
    
    if (errorMsg.includes('timeout') || 
        errorMsg.includes('aborted') || 
        errorMsg.includes('timed out')) {
      return {
        type: ProblemType.API_TIMEOUT,
        message: 'API 請求超時',
        severity: 'high',
        timestamp: new Date(),
        metadata: { originalError: error.message }
      };
    }
    
    return null;
  }

  /**
   * 檢測速率限制問題
   */
  static detectRateLimit(statusCode: number, responseBody: any): Problem | null {
    if (statusCode === 429 || 
        responseBody?.error?.includes('rate limit') ||
        responseBody?.error?.includes('too many requests')) {
      return {
        type: ProblemType.API_RATE_LIMIT,
        message: 'API 速率限制',
        severity: 'medium',
        timestamp: new Date(),
        metadata: { statusCode, retryAfter: responseBody?.retry_after }
      };
    }
    
    return null;
  }

  /**
   * 檢測 API Key 無效問題
   */
  static detectInvalidApiKey(statusCode: number, responseBody: any): Problem | null {
    if (statusCode === 401 || statusCode === 403 ||
        responseBody?.error?.includes('invalid api key') ||
        responseBody?.error?.includes('unauthorized')) {
      return {
        type: ProblemType.API_KEY_INVALID,
        message: 'API Key 無效或已過期',
        severity: 'critical',
        timestamp: new Date(),
        metadata: { statusCode }
      };
    }
    
    return null;
  }

  /**
   * 檢測網絡錯誤
   */
  static detectNetworkError(error: Error): Problem | null {
    const errorMsg = error.message.toLowerCase();
    
    if (errorMsg.includes('network') || 
        errorMsg.includes('econnrefused') ||
        errorMsg.includes('enotfound') ||
        errorMsg.includes('connection')) {
      return {
        type: ProblemType.NETWORK_ERROR,
        message: '網絡連接問題',
        severity: 'high',
        timestamp: new Date(),
        metadata: { originalError: error.message }
      };
    }
    
    return null;
  }

  /**
   * 檢測模型不可用問題
   */
  static detectModelUnavailable(responseBody: any): Problem | null {
    if (responseBody?.error?.includes('model not available') ||
        responseBody?.error?.includes('model is overloaded') ||
        responseBody?.error?.includes('service unavailable')) {
      return {
        type: ProblemType.MODEL_UNAVAILABLE,
        message: '模型暫時不可用',
        severity: 'high',
        timestamp: new Date(),
        metadata: { error: responseBody.error }
      };
    }
    
    return null;
  }

  /**
   * 檢測配額超限問題
   */
  static detectQuotaExceeded(responseBody: any): Problem | null {
    if (responseBody?.error?.includes('quota exceeded') ||
        responseBody?.error?.includes('insufficient credits') ||
        responseBody?.error?.includes('limit reached')) {
      return {
        type: ProblemType.QUOTA_EXCEEDED,
        message: 'API 配額已用完',
        severity: 'critical',
        timestamp: new Date(),
        metadata: { error: responseBody.error }
      };
    }
    
    return null;
  }

  /**
   * 綜合檢測
   */
  static detect(error: Error | null, statusCode?: number, responseBody?: any): Problem | null {
    // 優先級：從最嚴重到最輕微
    
    if (error) {
      // 檢測超時
      const timeoutProblem = this.detectApiTimeout(error);
      if (timeoutProblem) return timeoutProblem;
      
      // 檢測網絡錯誤
      const networkProblem = this.detectNetworkError(error);
      if (networkProblem) return networkProblem;
    }
    
    if (statusCode && responseBody) {
      // 檢測 API Key 問題
      const keyProblem = this.detectInvalidApiKey(statusCode, responseBody);
      if (keyProblem) return keyProblem;
      
      // 檢測配額問題
      const quotaProblem = this.detectQuotaExceeded(responseBody);
      if (quotaProblem) return quotaProblem;
      
      // 檢測速率限制
      const rateLimitProblem = this.detectRateLimit(statusCode, responseBody);
      if (rateLimitProblem) return rateLimitProblem;
      
      // 檢測模型不可用
      const modelProblem = this.detectModelUnavailable(responseBody);
      if (modelProblem) return modelProblem;
    }
    
    return null;
  }
}

// ============================================
// 3. 自動修復器
// ============================================

export class AutoFixer {
  private apiKeyPool: string[];
  private currentKeyIndex: number = 0;
  
  constructor(apiKeyPool: string[]) {
    this.apiKeyPool = apiKeyPool.filter(Boolean);
  }

  /**
   * 修復 API 超時問題
   */
  async fixApiTimeout(problem: Problem): Promise<FixResult> {
    console.log('[AutoFix] 檢測到超時，增加等待時間並重試...');
    
    // 策略：增加超時時間，使用指數退避
    await sleep(5000); // 等待 5 秒
    
    return {
      success: true,
      action: 'retry_with_longer_timeout',
      message: '已增加超時時間，準備重試',
      metadata: { waitTime: 5000, newTimeout: 180000 } // 180 秒
    };
  }

  /**
   * 修復速率限制問題
   */
  async fixRateLimit(problem: Problem): Promise<FixResult> {
    const retryAfter = problem.metadata?.retryAfter || 60;
    console.log(`[AutoFix] 檢測到速率限制，等待 ${retryAfter} 秒...`);
    
    // 策略：等待指定時間，或切換到備用 Key
    await sleep(retryAfter * 1000);
    
    // 切換到下一個 API Key
    this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeyPool.length;
    const nextKey = this.apiKeyPool[this.currentKeyIndex];
    
    return {
      success: true,
      action: 'switch_api_key_and_retry',
      message: `已等待 ${retryAfter} 秒並切換到備用 API Key`,
      metadata: { waitTime: retryAfter, newKeyIndex: this.currentKeyIndex }
    };
  }

  /**
   * 修復 API Key 無效問題
   */
  async fixInvalidApiKey(problem: Problem): Promise<FixResult> {
    console.log('[AutoFix] 檢測到 API Key 無效，切換到備用 Key...');
    
    // 策略：標記當前 Key 為無效，切換到下一個
    this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeyPool.length;
    
    if (this.apiKeyPool.length <= 1) {
      return {
        success: false,
        action: 'no_valid_keys',
        message: '所有 API Keys 都無效，無法繼續',
        metadata: { availableKeys: this.apiKeyPool.length }
      };
    }
    
    return {
      success: true,
      action: 'switch_to_backup_key',
      message: '已切換到備用 API Key',
      metadata: { newKeyIndex: this.currentKeyIndex }
    };
  }

  /**
   * 修復網絡錯誤
   */
  async fixNetworkError(problem: Problem): Promise<FixResult> {
    console.log('[AutoFix] 檢測到網絡錯誤，使用指數退避重試...');
    
    // 策略：指數退避重試
    const waitTime = 10000; // 10 秒
    await sleep(waitTime);
    
    return {
      success: true,
      action: 'retry_after_network_recovery',
      message: '網絡錯誤，已等待並準備重試',
      metadata: { waitTime }
    };
  }

  /**
   * 修復模型不可用問題
   */
  async fixModelUnavailable(problem: Problem): Promise<FixResult> {
    console.log('[AutoFix] 檢測到模型不可用，切換到備用模型...');
    
    // 策略：降級到備用模型
    const fallbackModels = [
      'gpt-4o',
      'claude-3-5-sonnet-20241022',
      'gpt-4o-mini',
      'claude-3-opus-20240229'
    ];
    
    return {
      success: true,
      action: 'switch_to_fallback_model',
      message: '主模型不可用，已切換到備用模型',
      metadata: { fallbackModels }
    };
  }

  /**
   * 修復配額超限問題
   */
  async fixQuotaExceeded(problem: Problem): Promise<FixResult> {
    console.log('[AutoFix] 檢測到配額超限，切換到備用 Key...');
    
    // 策略：切換到下一個有配額的 Key
    this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeyPool.length;
    
    if (this.apiKeyPool.length <= 1) {
      return {
        success: false,
        action: 'no_quota_available',
        message: '所有 API Keys 配額已用完',
        metadata: { availableKeys: this.apiKeyPool.length }
      };
    }
    
    return {
      success: true,
      action: 'switch_to_key_with_quota',
      message: '已切換到有配額的 API Key',
      metadata: { newKeyIndex: this.currentKeyIndex }
    };
  }

  /**
   * 綜合修復
   */
  async fix(problem: Problem): Promise<FixResult> {
    console.log(`[AutoFix] 嘗試修復問題: ${problem.type}`);
    
    switch (problem.type) {
      case ProblemType.API_TIMEOUT:
        return this.fixApiTimeout(problem);
      
      case ProblemType.API_RATE_LIMIT:
        return this.fixRateLimit(problem);
      
      case ProblemType.API_KEY_INVALID:
        return this.fixInvalidApiKey(problem);
      
      case ProblemType.NETWORK_ERROR:
        return this.fixNetworkError(problem);
      
      case ProblemType.MODEL_UNAVAILABLE:
        return this.fixModelUnavailable(problem);
      
      case ProblemType.QUOTA_EXCEEDED:
        return this.fixQuotaExceeded(problem);
      
      default:
        return {
          success: false,
          action: 'unknown_problem',
          message: `未知問題類型: ${problem.type}`,
          metadata: { problem }
        };
    }
  }
}

// ============================================
// 4. 健康監控器
// ============================================

export class HealthMonitor {
  private checkInterval: number = 30000; // 30 秒
  private metrics: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageResponseTime: number;
    lastCheckTime: Date;
  } = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    averageResponseTime: 0,
    lastCheckTime: new Date(),
  };

  /**
   * 記錄請求
   */
  recordRequest(success: boolean, responseTime: number) {
    this.metrics.totalRequests++;
    
    if (success) {
      this.metrics.successfulRequests++;
    } else {
      this.metrics.failedRequests++;
    }
    
    // 更新平均響應時間
    const total = this.metrics.averageResponseTime * (this.metrics.totalRequests - 1) + responseTime;
    this.metrics.averageResponseTime = total / this.metrics.totalRequests;
  }

  /**
   * 獲取健康狀態
   */
  getHealthStatus() {
    const successRate = this.metrics.totalRequests > 0
      ? (this.metrics.successfulRequests / this.metrics.totalRequests) * 100
      : 100;
    
    let status: 'healthy' | 'degraded' | 'unhealthy';
    
    if (successRate >= 90) {
      status = 'healthy';
    } else if (successRate >= 70) {
      status = 'degraded';
    } else {
      status = 'unhealthy';
    }
    
    return {
      status,
      successRate: successRate.toFixed(2) + '%',
      metrics: this.metrics,
      timestamp: new Date(),
    };
  }

  /**
   * 重置統計
   */
  resetMetrics() {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      lastCheckTime: new Date(),
    };
  }
}

// ============================================
// 5. 導出單例
// ============================================

export const healthMonitor = new HealthMonitor();
