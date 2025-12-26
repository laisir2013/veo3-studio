# 構建階段
FROM node:22-alpine AS builder

WORKDIR /app

# 安裝 pnpm
RUN npm install -g pnpm

# 複製依賴文件
COPY package.json pnpm-lock.yaml ./

# 安裝依賴
RUN pnpm install --frozen-lockfile

# 複製源代碼
COPY . .

# 構建應用
RUN pnpm build

# 運行階段
FROM node:22-alpine

WORKDIR /app

# 安裝 pnpm
RUN npm install -g pnpm

# 複製依賴文件
COPY package.json pnpm-lock.yaml ./

# 只安裝生產依賴
RUN pnpm install --prod --frozen-lockfile

# 複製構建結果（dist 目錄包含 index.js 和 public 文件夾）
COPY --from=builder /app/dist ./dist

# 設置環境變量
ENV NODE_ENV=production
ENV PORT=3000

# 暴露端口
EXPOSE 3000

# 啟動應用
CMD ["node", "dist/index.js"]
