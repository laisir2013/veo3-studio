/**
 * 通用重試工具
 * 用於增強 API 調用的可靠性
 */

export interface RetryOptions {
  /** 最大重試次數 */
  maxRetries?: number;
  /** 初始延遲時間 (毫秒) */
  baseDelay?: number;
  /** 是否使用指數退避 */
  exponentialBackoff?: boolean;
  /** 重試前的條件檢查函數 */
  shouldRetry?: (error: any) => boolean;
  /** 每次重試前的回調 */
  onRetry?: (attempt: number, error: any) => void;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  baseDelay: 1000,
  exponentialBackoff: true,
  shouldRetry: () => true,
  onRetry: () => {},
};

/**
 * 帶重試的異步函數執行器
 * @param fn 要執行的異步函數
 * @param options 重試選項
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: any;

  for (let attempt = 1; attempt <= opts.maxRetries; attempt++) {
    try {
      // 嘗試執行函數
      return await fn();
    } catch (error) {
      lastError = error;

      // 檢查是否應該重試
      if (attempt === opts.maxRetries || !opts.shouldRetry(error)) {
        console.error(`❌ 重試失敗 (${attempt}/${opts.maxRetries})`, error);
        throw error;
      }

      // 計算延遲時間
      const delay = opts.exponentialBackoff
        ? opts.baseDelay * Math.pow(2, attempt - 1)
        : opts.baseDelay;

      // 回調
      opts.onRetry(attempt, error);
      console.warn(
        `⚠️  嘗試 ${attempt}/${opts.maxRetries} 失敗，等待 ${delay}ms 後重試...`,
        error?.message || error
      );

      // 等待後重試
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * API 調用重試 (專門用於 VectorEngine 等外部 API)
 */
export async function retryApiCall<T>(
  apiCall: () => Promise<T>,
  apiName: string = "API"
): Promise<T> {
  return retryWithBackoff(apiCall, {
    maxRetries: 3,
    baseDelay: 2000,
    exponentialBackoff: true,
    shouldRetry: (error) => {
      // 只重試網絡錯誤和 5xx 錯誤
      if (error?.response?.status) {
        const status = error.response.status;
        return status >= 500 || status === 429; // 5xx 或 rate limit
      }
      return true; // 網絡錯誤
    },
    onRetry: (attempt, error) => {
      console.log(`🔄 ${apiName} 重試 ${attempt}/3:`, error?.message || error);
    },
  });
}

/**
 * 批量重試 (帶並發控制)
 */
export async function retryBatch<T>(
  tasks: (() => Promise<T>)[],
  options: RetryOptions & { concurrency?: number } = {}
): Promise<T[]> {
  const { concurrency = 3, ...retryOpts } = options;
  const results: T[] = [];
  const queue = [...tasks];

  // 並發執行
  const workers = Array(Math.min(concurrency, queue.length))
    .fill(null)
    .map(async () => {
      while (queue.length > 0) {
        const task = queue.shift();
        if (!task) break;

        try {
          const result = await retryWithBackoff(task, retryOpts);
          results.push(result);
        } catch (error) {
          console.error("批量任務失敗:", error);
          throw error;
        }
      }
    });

  await Promise.all(workers);
  return results;
}
