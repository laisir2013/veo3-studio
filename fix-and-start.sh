#!/bin/bash

# VEO3 系統快速修復和啟動腳本
# 作者：AI 診斷系統
# 日期：2025-12-26

set -e  # 遇到錯誤立即退出

echo "============================================"
echo "VEO3 系統快速修復和啟動腳本"
echo "============================================"
echo ""

# 顏色定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 步驟 1：檢查 Node.js 和 pnpm
echo "步驟 1/7: 檢查運行環境..."
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js 未安裝${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Node.js 版本: $(node --version)${NC}"

if ! command -v pnpm &> /dev/null; then
    echo -e "${YELLOW}⚠️  pnpm 未安裝，正在安裝...${NC}"
    sudo npm install -g pnpm@10.4.1
fi
echo -e "${GREEN}✅ pnpm 版本: $(pnpm --version)${NC}"

# 步驟 2：修復 package.json
echo ""
echo "步驟 2/7: 修復 package.json..."
if grep -q '"postinstall"' package.json; then
    echo -e "${YELLOW}⚠️  發現 postinstall 腳本，正在移除...${NC}"
    # 創建備份
    cp package.json package.json.backup
    # 移除 postinstall 行
    sed -i '/"postinstall":/d' package.json
    echo -e "${GREEN}✅ postinstall 腳本已移除${NC}"
else
    echo -e "${GREEN}✅ package.json 無需修復${NC}"
fi

# 步驟 3：創建 patches 目錄
echo ""
echo "步驟 3/7: 創建必要目錄..."
mkdir -p patches
echo -e "${GREEN}✅ patches/ 目錄已創建${NC}"

# 步驟 4：清理並安裝依賴
echo ""
echo "步驟 4/7: 安裝項目依賴（這可能需要 5-10 分鐘）..."
if [ -d "node_modules" ]; then
    echo -e "${YELLOW}⚠️  清理舊的 node_modules...${NC}"
    rm -rf node_modules
fi
if [ -f "pnpm-lock.yaml" ]; then
    rm -f pnpm-lock.yaml
fi

echo "正在執行 pnpm install..."
pnpm install --force || {
    echo -e "${RED}❌ 依賴安裝失敗${NC}"
    exit 1
}
echo -e "${GREEN}✅ 依賴安裝完成${NC}"

# 步驟 5：檢查環境變量
echo ""
echo "步驟 5/7: 檢查環境變量配置..."
ENV_FILE=".env"

if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}❌ .env 文件不存在${NC}"
    exit 1
fi

# 檢查關鍵環境變量
MISSING_VARS=()

check_env_var() {
    local var_name=$1
    local var_value=$(grep "^${var_name}=" "$ENV_FILE" | cut -d'=' -f2-)
    
    if [ -z "$var_value" ] || [ "$var_value" = "" ]; then
        MISSING_VARS+=("$var_name")
        return 1
    fi
    return 0
}

echo "檢查必需的環境變量..."

# 檢查數據庫
if check_env_var "DATABASE_URL"; then
    echo -e "${GREEN}✅ DATABASE_URL 已配置${NC}"
else
    echo -e "${YELLOW}⚠️  DATABASE_URL 未配置（將使用內存存儲）${NC}"
fi

# 檢查 API Keys
API_KEY_COUNT=0
for i in {1..13}; do
    if check_env_var "VECTOR_ENGINE_API_KEY_$i"; then
        ((API_KEY_COUNT++))
    fi
done

if [ $API_KEY_COUNT -eq 0 ]; then
    echo -e "${RED}❌ 未配置任何 VectorEngine API Key${NC}"
    echo -e "${YELLOW}請在 .env 文件中添加至少一個 API Key：${NC}"
    echo "VECTOR_ENGINE_API_KEY_1=your-api-key"
    exit 1
else
    echo -e "${GREEN}✅ 已配置 $API_KEY_COUNT 個 VectorEngine API Keys${NC}"
fi

# 檢查其他 API Keys
if check_env_var "OPENAI_API_KEY"; then
    echo -e "${GREEN}✅ OPENAI_API_KEY 已配置${NC}"
else
    echo -e "${YELLOW}⚠️  OPENAI_API_KEY 未配置（故事分析功能可能無法使用）${NC}"
fi

if check_env_var "KREADO_API_KEY"; then
    echo -e "${GREEN}✅ KREADO_API_KEY 已配置${NC}"
else
    echo -e "${YELLOW}⚠️  KREADO_API_KEY 未配置（語音生成功能可能無法使用）${NC}"
fi

# 步驟 6：數據庫檢查和遷移（可選）
echo ""
echo "步驟 6/7: 檢查數據庫配置..."
if grep -q "^DATABASE_URL=mysql" "$ENV_FILE"; then
    echo -e "${YELLOW}檢測到數據庫配置，是否執行數據庫遷移？${NC}"
    read -p "執行數據庫遷移？(y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        pnpm db:push || {
            echo -e "${RED}❌ 數據庫遷移失敗${NC}"
            echo -e "${YELLOW}可能原因：數據庫未運行或連接配置錯誤${NC}"
            echo -e "${YELLOW}系統將使用內存存儲繼續運行${NC}"
        }
    else
        echo -e "${YELLOW}⏭️  跳過數據庫遷移${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  未配置數據庫，將使用內存存儲（數據不持久化）${NC}"
fi

# 步驟 7：啟動開發服務器
echo ""
echo "步驟 7/7: 啟動開發服務器..."
echo ""
echo "============================================"
echo -e "${GREEN}✅ 環境修復完成！${NC}"
echo "============================================"
echo ""
echo "系統配置摘要："
echo "- Node.js: $(node --version)"
echo "- pnpm: $(pnpm --version)"
echo "- API Keys: $API_KEY_COUNT 個 VectorEngine Keys"
echo "- 數據庫: $(grep '^DATABASE_URL=' .env | cut -d'=' -f2- | sed 's/\(.*@\).*/\1***/' || echo '內存存儲')"
echo ""
echo "正在啟動開發服務器..."
echo "服務器將在 http://0.0.0.0:3000 啟動"
echo ""
echo -e "${YELLOW}按 Ctrl+C 可以停止服務器${NC}"
echo "============================================"
echo ""

# 啟動開發服務器
pnpm dev
