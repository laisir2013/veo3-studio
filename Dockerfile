# VEO3 Studio Dockerfile
# 包含 FFmpeg 以支援視頻合併功能

# 構建階段 - 使用 debian 以便安裝 FFmpeg
FROM node:20-bookworm AS builder

WORKDIR /app

# 安裝 pnpm
RUN corepack enable && corepack prepare pnpm@10.4.1 --activate

# 複製依賴文件
COPY package.json pnpm-lock.yaml ./

# 安裝依賴
RUN pnpm install --frozen-lockfile

# 複製源代碼
COPY . .

# 構建應用
RUN pnpm build

# 運行階段 - 使用 debian 以便安裝 FFmpeg
FROM node:20-bookworm-slim

WORKDIR /app

# 安裝 FFmpeg 和其他必要工具
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# 驗證 FFmpeg 安裝
RUN ffmpeg -version

# 安裝 pnpm
RUN corepack enable && corepack prepare pnpm@10.4.1 --activate

# 複製依賴文件
COPY package.json pnpm-lock.yaml ./

# 只安裝生產依賴
RUN pnpm install --prod --frozen-lockfile

# 複製構建結果（dist 目錄包含 index.js 和 public 文件夾）
COPY --from=builder /app/dist ./dist

# 設置環境變量
ENV NODE_ENV=production
ENV PORT=10000

# 暴露端口
EXPOSE 10000

# 啟動應用
CMD ["node", "dist/index.js"]
