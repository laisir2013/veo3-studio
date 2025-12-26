#!/usr/bin/env node

/**
 * VEO3 環境配置驗證腳本
 * 檢查所有必要的環境變量是否正確配置
 */

import 'dotenv/config';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 顏色輸出
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(color, symbol, message) {
  console.log(`${color}${symbol} ${message}${colors.reset}`);
}

function success(message) {
  log(colors.green, '✅', message);
}

function warning(message) {
  log(colors.yellow, '⚠️ ', message);
}

function error(message) {
  log(colors.red, '❌', message);
}

function info(message) {
  log(colors.cyan, 'ℹ️ ', message);
}

// 檢查環境變量
function checkEnvVar(name, required = false) {
  const value = process.env[name];
  const exists = value && value.trim().length > 0;
  
  if (exists) {
    // 隱藏敏感信息
    const displayValue = value.length > 20 
      ? `${value.substring(0, 10)}...${value.substring(value.length - 4)}`
      : value.substring(0, 10) + '***';
    success(`${name}: ${displayValue}`);
    return true;
  } else {
    if (required) {
      error(`${name}: 未配置（必需）`);
    } else {
      warning(`${name}: 未配置（可選）`);
    }
    return false;
  }
}

console.log('\n============================================');
console.log('VEO3 環境配置驗證');
console.log('============================================\n');

// 基本配置檢查
console.log('📋 基本配置：');
checkEnvVar('NODE_ENV');
checkEnvVar('PORT');
checkEnvVar('VITE_APP_ID');
checkEnvVar('JWT_SECRET');

// 數據庫配置
console.log('\n💾 數據庫配置：');
const hasDatabase = checkEnvVar('DATABASE_URL');
if (!hasDatabase) {
  warning('系統將使用內存存儲（數據不持久化）');
  warning('部分功能（用戶認證、角色庫、歷史記錄）將受限');
}

// OAuth 配置
console.log('\n🔐 OAuth 認證配置：');
const hasOAuth = checkEnvVar('OAUTH_SERVER_URL') && checkEnvVar('OWNER_OPEN_ID');
if (!hasOAuth) {
  warning('OAuth 未配置，將使用訪客模式');
}

// VectorEngine API Keys
console.log('\n🎬 VectorEngine API Keys（視頻/圖片生成）：');
let vectorEngineKeyCount = 0;
for (let i = 1; i <= 13; i++) {
  if (checkEnvVar(`VECTOR_ENGINE_API_KEY_${i}`, i === 1)) {
    vectorEngineKeyCount++;
  }
}

if (vectorEngineKeyCount === 0) {
  error('❌ 沒有配置任何 VectorEngine API Key！');
  error('系統無法正常工作，請至少配置一個 API Key');
  process.exit(1);
} else {
  info(`已配置 ${vectorEngineKeyCount} 個 VectorEngine API Keys`);
  if (vectorEngineKeyCount < 6) {
    warning('建議配置至少 6 個 API Keys 以提升並發能力');
  }
}

// KreadoAI TTS
console.log('\n🔊 KreadoAI TTS（語音生成）：');
const hasKreadoAI = checkEnvVar('KREADO_API_KEY', true);
if (!hasKreadoAI) {
  error('語音生成功能將無法使用');
}

// LLM APIs
console.log('\n🤖 LLM API Keys（故事分析）：');
const hasOpenAI = checkEnvVar('OPENAI_API_KEY');
const hasAnthropic = checkEnvVar('ANTHROPIC_API_KEY');
const hasGoogle = checkEnvVar('GOOGLE_API_KEY');

if (!hasOpenAI && !hasAnthropic && !hasGoogle) {
  error('沒有配置任何 LLM API Key！');
  error('故事分析功能將無法使用');
  warning('請至少配置以下之一：OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_API_KEY');
}

// AWS S3 存儲
console.log('\n☁️  AWS S3 存儲配置：');
const hasS3 = checkEnvVar('AWS_ACCESS_KEY_ID') && 
             checkEnvVar('AWS_SECRET_ACCESS_KEY') && 
             checkEnvVar('AWS_S3_BUCKET');
if (!hasS3) {
  warning('S3 存儲未配置，將使用臨時 URL（可能不持久）');
}

// 通知服務
console.log('\n📢 通知服務配置：');
checkEnvVar('NOTIFICATION_WEBHOOK_URL');

// 總結
console.log('\n============================================');
console.log('配置檢查總結');
console.log('============================================\n');

const issues = [];

if (vectorEngineKeyCount === 0) {
  issues.push('❌ 缺少 VectorEngine API Key（必需）');
}

if (!hasKreadoAI) {
  issues.push('❌ 缺少 KreadoAI API Key（必需）');
}

if (!hasOpenAI && !hasAnthropic && !hasGoogle) {
  issues.push('❌ 缺少 LLM API Key（必需）');
}

if (!hasDatabase) {
  issues.push('⚠️  未配置數據庫（推薦）');
}

if (!hasS3) {
  issues.push('⚠️  未配置 S3 存儲（推薦）');
}

if (!hasOAuth) {
  issues.push('ℹ️  未配置 OAuth（可選）');
}

if (issues.length === 0) {
  success('✨ 所有配置檢查通過！系統可以正常運行');
  console.log('\n下一步：');
  console.log('1. 執行 pnpm dev 啟動開發服務器');
  console.log('2. 訪問 http://localhost:3000');
  console.log('3. 開始創建您的第一個視頻！');
} else {
  console.log('發現以下問題：\n');
  issues.forEach(issue => console.log(`  ${issue}`));
  
  const criticalIssues = issues.filter(i => i.startsWith('❌'));
  if (criticalIssues.length > 0) {
    console.log('\n❌ 存在關鍵問題，系統可能無法正常運行');
    console.log('請修復以上問題後再次運行此腳本驗證');
    process.exit(1);
  } else {
    console.log('\n⚠️  存在一些建議改進的配置');
    console.log('系統可以基本運行，但部分功能可能受限');
    console.log('\n下一步：');
    console.log('1. （可選）根據建議完善配置');
    console.log('2. 執行 pnpm dev 啟動開發服務器');
  }
}

console.log('\n============================================\n');

// 提供配置指南鏈接
console.log('📚 相關文檔：');
console.log('- 環境配置模板：.env.template');
console.log('- 本地運行指南：LOCAL_SETUP_GUIDE.md');
console.log('- 診斷報告：/home/user/VEO3_深度診斷報告.md');
console.log('- 完整分析報告：analysis_report/VEO3_Analysis_Report.md');
console.log('');
