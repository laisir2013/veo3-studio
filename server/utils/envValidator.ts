/**
 * 環境變量驗證工具
 * 確保所有必需的環境變量都已正確配置
 */

export interface EnvValidationResult {
  isValid: boolean;
  missingRequired: string[];
  missingOptional: string[];
  warnings: string[];
  summary: string;
}

export interface EnvConfig {
  name: string;
  required: boolean;
  description: string;
  validation?: (value: string) => boolean;
}

/** 環境變量配置定義 */
const ENV_CONFIGS: EnvConfig[] = [
  // 基本配置
  {
    name: "NODE_ENV",
    required: true,
    description: "運行環境 (development/production)",
  },
  {
    name: "PORT",
    required: false,
    description: "服務器端口 (默認 3000)",
  },
  {
    name: "JWT_SECRET",
    required: true,
    description: "JWT 密鑰 (至少 32 字符)",
    validation: (val) => val.length >= 32,
  },

  // VectorEngine API Keys
  {
    name: "VECTOR_ENGINE_API_KEY_1",
    required: true,
    description: "VectorEngine API Key #1 (必須)",
  },
  {
    name: "VECTOR_ENGINE_API_KEY_2",
    required: false,
    description: "VectorEngine API Key #2 (建議配置)",
  },

  // LLM API Keys
  {
    name: "OPENAI_API_KEY",
    required: true,
    description: "OpenAI API Key (用於故事分析)",
  },
  {
    name: "ANTHROPIC_API_KEY",
    required: false,
    description: "Anthropic Claude API Key (備用)",
  },
  {
    name: "GOOGLE_API_KEY",
    required: false,
    description: "Google Gemini API Key (備用)",
  },

  // KreadoAI TTS
  {
    name: "KREADO_API_KEY",
    required: true,
    description: "KreadoAI TTS API Key (語音生成)",
  },

  // 數據庫
  {
    name: "DATABASE_URL",
    required: false,
    description: "MySQL 數據庫連接字符串 (可選，未配置時使用內存存儲)",
  },

  // S3 存儲
  {
    name: "AWS_ACCESS_KEY_ID",
    required: false,
    description: "AWS S3 訪問密鑰 (可選)",
  },
  {
    name: "AWS_SECRET_ACCESS_KEY",
    required: false,
    description: "AWS S3 私鑰 (可選)",
  },
  {
    name: "AWS_REGION",
    required: false,
    description: "AWS 區域 (可選)",
  },
  {
    name: "AWS_S3_BUCKET",
    required: false,
    description: "AWS S3 桶名稱 (可選)",
  },

  // OAuth
  {
    name: "OAUTH_SERVER_URL",
    required: false,
    description: "OAuth 服務器 URL (可選)",
  },
];

/**
 * 驗證環境變量
 */
export function validateEnv(): EnvValidationResult {
  const missingRequired: string[] = [];
  const missingOptional: string[] = [];
  const warnings: string[] = [];

  for (const config of ENV_CONFIGS) {
    const value = process.env[config.name];

    if (!value || value.trim() === "") {
      if (config.required) {
        missingRequired.push(config.name);
      } else {
        missingOptional.push(config.name);
      }
      continue;
    }

    // 自定義驗證
    if (config.validation && !config.validation(value)) {
      warnings.push(
        `${config.name}: 值不符合要求 (${config.description})`
      );
    }
  }

  // 特殊檢查: 至少需要 3 個 VectorEngine Keys
  const vectorEngineKeys = Array.from({ length: 13 }, (_, i) =>
    process.env[`VECTOR_ENGINE_API_KEY_${i + 1}`]
  ).filter((key) => key && key.trim().length > 0);

  if (vectorEngineKeys.length < 3) {
    warnings.push(
      `只配置了 ${vectorEngineKeys.length} 個 VectorEngine API Key，建議至少配置 3 個`
    );
  }

  // 生成摘要
  const isValid = missingRequired.length === 0;
  let summary = "";

  if (isValid) {
    summary = "✅ 環境配置基本滿足運行要求";
    if (missingOptional.length > 0) {
      summary += `\n⚠️  缺少 ${missingOptional.length} 個可選配置，部分功能可能受限`;
    }
    if (warnings.length > 0) {
      summary += `\n⚠️  ${warnings.length} 個配置需要注意`;
    }
  } else {
    summary = `❌ 缺少 ${missingRequired.length} 個必需的環境變量，系統無法正常運行`;
  }

  return {
    isValid,
    missingRequired,
    missingOptional,
    warnings,
    summary,
  };
}

/**
 * 打印環境變量驗證報告
 */
export function printEnvValidation(): void {
  console.log("\n============================================");
  console.log("環境變量驗證報告");
  console.log("============================================\n");

  const result = validateEnv();

  console.log(result.summary);
  console.log("");

  if (result.missingRequired.length > 0) {
    console.log("🔴 缺少必需配置:");
    for (const name of result.missingRequired) {
      const config = ENV_CONFIGS.find((c) => c.name === name);
      console.log(`   - ${name}: ${config?.description || ""}`);
    }
    console.log("");
  }

  if (result.missingOptional.length > 0 && result.missingOptional.length <= 5) {
    console.log("🟡 缺少可選配置:");
    for (const name of result.missingOptional) {
      const config = ENV_CONFIGS.find((c) => c.name === name);
      console.log(`   - ${name}: ${config?.description || ""}`);
    }
    console.log("");
  }

  if (result.warnings.length > 0) {
    console.log("⚠️  配置警告:");
    for (const warning of result.warnings) {
      console.log(`   - ${warning}`);
    }
    console.log("");
  }

  // 提供配置指南
  if (!result.isValid) {
    console.log("📖 配置指南:");
    console.log("   1. 複製 .env.template 為 .env");
    console.log("   2. 編輯 .env 文件，填寫必需的環境變量");
    console.log("   3. 運行 node check-env.mjs 驗證配置");
    console.log("   4. 重新啟動服務器");
    console.log("");
  }

  console.log("============================================\n");
}

// 自動在啟動時驗證
if (require.main === module) {
  printEnvValidation();
  const result = validateEnv();
  process.exit(result.isValid ? 0 : 1);
}
