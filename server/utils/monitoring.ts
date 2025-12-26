/**
 * VEO3 實時監控和報警系統
 * 
 * 功能：
 * 1. 實時性能監控
 * 2. 異常檢測和報警
 * 3. 資源使用監控
 * 4. 自動報告生成
 */

import { healthMonitor } from './autoFix';

// ============================================
// 1. 性能指標收集器
// ============================================

export interface PerformanceMetrics {
  // API 性能
  apiResponseTime: number[];
  apiSuccessRate: number;
  apiErrorCount: number;
  
  // 生成性能
  averageGenerationTime: number;
  totalGenerations: number;
  successfulGenerations: number;
  failedGenerations: number;
  
  // 資源使用
  memoryUsage: number;
  cpuUsage: number;
  
  // 時間戳
  timestamp: Date;
}

export class MetricsCollector {
  private metrics: PerformanceMetrics = {
    apiResponseTime: [],
    apiSuccessRate: 100,
    apiErrorCount: 0,
    averageGenerationTime: 0,
    totalGenerations: 0,
    successfulGenerations: 0,
    failedGenerations: 0,
    memoryUsage: 0,
    cpuUsage: 0,
    timestamp: new Date(),
  };

  /**
   * 記錄 API 響應時間
   */
  recordApiResponseTime(time: number) {
    this.metrics.apiResponseTime.push(time);
    
    // 只保留最近 100 個記錄
    if (this.metrics.apiResponseTime.length > 100) {
      this.metrics.apiResponseTime.shift();
    }
  }

  /**
   * 記錄 API 錯誤
   */
  recordApiError() {
    this.metrics.apiErrorCount++;
  }

  /**
   * 記錄生成結果
   */
  recordGeneration(success: boolean, duration: number) {
    this.metrics.totalGenerations++;
    
    if (success) {
      this.metrics.successfulGenerations++;
    } else {
      this.metrics.failedGenerations++;
    }
    
    // 更新平均生成時間
    const total = this.metrics.averageGenerationTime * (this.metrics.totalGenerations - 1) + duration;
    this.metrics.averageGenerationTime = total / this.metrics.totalGenerations;
  }

  /**
   * 更新資源使用
   */
  updateResourceUsage() {
    // Node.js 內存使用
    const memUsage = process.memoryUsage();
    this.metrics.memoryUsage = memUsage.heapUsed / 1024 / 1024; // MB
    
    // CPU 使用（簡化版）
    const cpuUsage = process.cpuUsage();
    this.metrics.cpuUsage = (cpuUsage.user + cpuUsage.system) / 1000000; // 秒
  }

  /**
   * 獲取當前指標
   */
  getMetrics(): PerformanceMetrics {
    this.updateResourceUsage();
    this.metrics.timestamp = new Date();
    
    // 計算 API 成功率
    const healthStatus = healthMonitor.getHealthStatus();
    this.metrics.apiSuccessRate = parseFloat(healthStatus.successRate);
    
    return { ...this.metrics };
  }

  /**
   * 獲取統計摘要
   */
  getSummary() {
    const metrics = this.getMetrics();
    
    // 計算平均 API 響應時間
    const avgApiTime = metrics.apiResponseTime.length > 0
      ? metrics.apiResponseTime.reduce((a, b) => a + b, 0) / metrics.apiResponseTime.length
      : 0;
    
    // 計算生成成功率
    const generationSuccessRate = metrics.totalGenerations > 0
      ? (metrics.successfulGenerations / metrics.totalGenerations) * 100
      : 100;
    
    return {
      api: {
        averageResponseTime: `${avgApiTime.toFixed(0)}ms`,
        successRate: `${metrics.apiSuccessRate.toFixed(1)}%`,
        errorCount: metrics.apiErrorCount,
      },
      generation: {
        total: metrics.totalGenerations,
        successful: metrics.successfulGenerations,
        failed: metrics.failedGenerations,
        successRate: `${generationSuccessRate.toFixed(1)}%`,
        averageTime: `${(metrics.averageGenerationTime / 60000).toFixed(1)} 分鐘`,
      },
      resources: {
        memory: `${metrics.memoryUsage.toFixed(0)} MB`,
        cpu: `${metrics.cpuUsage.toFixed(2)} 秒`,
      },
      timestamp: metrics.timestamp.toISOString(),
    };
  }

  /**
   * 重置指標
   */
  reset() {
    this.metrics = {
      apiResponseTime: [],
      apiSuccessRate: 100,
      apiErrorCount: 0,
      averageGenerationTime: 0,
      totalGenerations: 0,
      successfulGenerations: 0,
      failedGenerations: 0,
      memoryUsage: 0,
      cpuUsage: 0,
      timestamp: new Date(),
    };
  }
}

// ============================================
// 2. 異常檢測器
// ============================================

export interface Anomaly {
  type: 'performance' | 'error_rate' | 'resource' | 'availability';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  value: number;
  threshold: number;
  timestamp: Date;
}

export class AnomalyDetector {
  private thresholds = {
    apiResponseTime: 5000,      // 5 秒
    apiSuccessRate: 80,         // 80%
    memoryUsage: 500,           // 500 MB
    generationSuccessRate: 70,  // 70%
  };

  /**
   * 檢測異常
   */
  detect(metrics: PerformanceMetrics): Anomaly[] {
    const anomalies: Anomaly[] = [];
    
    // 檢測 API 響應時間
    if (metrics.apiResponseTime.length > 0) {
      const avgTime = metrics.apiResponseTime.reduce((a, b) => a + b, 0) / metrics.apiResponseTime.length;
      
      if (avgTime > this.thresholds.apiResponseTime) {
        anomalies.push({
          type: 'performance',
          severity: 'warning',
          message: `API 平均響應時間過長: ${avgTime.toFixed(0)}ms`,
          value: avgTime,
          threshold: this.thresholds.apiResponseTime,
          timestamp: new Date(),
        });
      }
    }
    
    // 檢測 API 成功率
    if (metrics.apiSuccessRate < this.thresholds.apiSuccessRate) {
      anomalies.push({
        type: 'error_rate',
        severity: 'critical',
        message: `API 成功率過低: ${metrics.apiSuccessRate.toFixed(1)}%`,
        value: metrics.apiSuccessRate,
        threshold: this.thresholds.apiSuccessRate,
        timestamp: new Date(),
      });
    }
    
    // 檢測內存使用
    if (metrics.memoryUsage > this.thresholds.memoryUsage) {
      anomalies.push({
        type: 'resource',
        severity: 'warning',
        message: `內存使用過高: ${metrics.memoryUsage.toFixed(0)} MB`,
        value: metrics.memoryUsage,
        threshold: this.thresholds.memoryUsage,
        timestamp: new Date(),
      });
    }
    
    // 檢測生成成功率
    if (metrics.totalGenerations > 0) {
      const successRate = (metrics.successfulGenerations / metrics.totalGenerations) * 100;
      
      if (successRate < this.thresholds.generationSuccessRate) {
        anomalies.push({
          type: 'availability',
          severity: 'critical',
          message: `生成成功率過低: ${successRate.toFixed(1)}%`,
          value: successRate,
          threshold: this.thresholds.generationSuccessRate,
          timestamp: new Date(),
        });
      }
    }
    
    return anomalies;
  }

  /**
   * 設置閾值
   */
  setThreshold(metric: keyof typeof this.thresholds, value: number) {
    this.thresholds[metric] = value;
  }
}

// ============================================
// 3. 報警管理器
// ============================================

export class AlertManager {
  private alerts: Anomaly[] = [];
  private maxAlerts: number = 100;

  /**
   * 添加報警
   */
  addAlert(anomaly: Anomaly) {
    this.alerts.unshift(anomaly);
    
    // 只保留最近的報警
    if (this.alerts.length > this.maxAlerts) {
      this.alerts = this.alerts.slice(0, this.maxAlerts);
    }
    
    // 打印報警
    this.printAlert(anomaly);
  }

  /**
   * 打印報警
   */
  private printAlert(anomaly: Anomaly) {
    const icon = {
      info: 'ℹ️',
      warning: '⚠️',
      critical: '🚨',
    }[anomaly.severity];
    
    console.warn(`${icon} [Alert] ${anomaly.message}`);
  }

  /**
   * 獲取所有報警
   */
  getAlerts(severity?: Anomaly['severity']): Anomaly[] {
    if (severity) {
      return this.alerts.filter(a => a.severity === severity);
    }
    return [...this.alerts];
  }

  /**
   * 清除報警
   */
  clearAlerts() {
    this.alerts = [];
  }

  /**
   * 獲取報警統計
   */
  getAlertStats() {
    const stats = {
      total: this.alerts.length,
      critical: this.alerts.filter(a => a.severity === 'critical').length,
      warning: this.alerts.filter(a => a.severity === 'warning').length,
      info: this.alerts.filter(a => a.severity === 'info').length,
    };
    
    return stats;
  }
}

// ============================================
// 4. 監控服務（整合）
// ============================================

export class MonitoringService {
  private metricsCollector: MetricsCollector;
  private anomalyDetector: AnomalyDetector;
  private alertManager: AlertManager;
  private monitoringInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.metricsCollector = new MetricsCollector();
    this.anomalyDetector = new AnomalyDetector();
    this.alertManager = new AlertManager();
  }

  /**
   * 啟動監控
   */
  start(intervalMs: number = 30000) {
    console.log('[Monitoring] 監控服務已啟動');
    
    this.monitoringInterval = setInterval(() => {
      this.check();
    }, intervalMs);
  }

  /**
   * 停止監控
   */
  stop() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      console.log('[Monitoring] 監控服務已停止');
    }
  }

  /**
   * 執行檢查
   */
  private check() {
    // 獲取當前指標
    const metrics = this.metricsCollector.getMetrics();
    
    // 檢測異常
    const anomalies = this.anomalyDetector.detect(metrics);
    
    // 添加報警
    anomalies.forEach(anomaly => {
      this.alertManager.addAlert(anomaly);
    });
    
    // 打印摘要（如果有異常）
    if (anomalies.length > 0) {
      console.log('[Monitoring] 檢測到異常:');
      anomalies.forEach(a => {
        console.log(`  - ${a.message}`);
      });
    }
  }

  /**
   * 獲取完整報告
   */
  getReport() {
    const summary = this.metricsCollector.getSummary();
    const alertStats = this.alertManager.getAlertStats();
    const recentAlerts = this.alertManager.getAlerts().slice(0, 10);
    
    return {
      summary,
      alerts: {
        stats: alertStats,
        recent: recentAlerts,
      },
      healthStatus: healthMonitor.getHealthStatus(),
    };
  }

  /**
   * 記錄事件（供外部調用）
   */
  recordApiCall(success: boolean, responseTime: number) {
    this.metricsCollector.recordApiResponseTime(responseTime);
    if (!success) {
      this.metricsCollector.recordApiError();
    }
  }

  recordGeneration(success: boolean, duration: number) {
    this.metricsCollector.recordGeneration(success, duration);
  }
}

// ============================================
// 5. 導出單例
// ============================================

export const monitoringService = new MonitoringService();
export const metricsCollector = new MetricsCollector();
export const anomalyDetector = new AnomalyDetector();
export const alertManager = new AlertManager();
