import "dotenv/config";
import express from "express";
import { createServer } from "http";
import path from "path";
import fs from "fs";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { generateSegments } from "../segmentGenerationService";
import { generateOutline } from "../outlineGenerationService";
import { updateLongVideoTask } from "../segmentBatchService";

function serveStatic(app: express.Express) {
  const distPath = path.resolve(process.cwd(), "dist", "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  // BUT exclude API routes from this fallback
  app.use("*", (req, res, next) => {
    // Skip API routes - let them 404 properly if not found
    if (req.originalUrl.startsWith("/api/")) {
      return next();
    }
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  
  // Custom API routes - MUST be before tRPC and static files
  
  // 生成故事大綱 API
  app.post("/api/generate-outline", async (req, res) => {
    try {
      const { title, language, duration, segmentCount } = req.body;
      
      if (!title) {
        return res.status(400).json({ success: false, error: "缺少視頻主題" });
      }
      
      const result = await generateOutline({
        title,
        language: language || "cantonese",
        duration: parseInt(duration) || 3,
        segmentCount: parseInt(segmentCount) || 10,
      });
      
      res.json({ 
        success: true, 
        outline: result.outline,
        apiProvider: result.apiProvider,
        apiProviderName: result.apiProviderName,
      });
    } catch (error) {
      console.error("生成大綱失敗:", error);
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : "生成失敗" 
      });
    }
  });
  
  // 生成片段內容 API
  app.post("/api/generate-segments", async (req, res) => {
    try {
      const { title, outline, language, segmentCount } = req.body;
      
      if (!title || !outline || !segmentCount) {
        return res.status(400).json({ success: false, error: "缺少必要參數" });
      }
      
      const result = await generateSegments({
        title,
        outline,
        language: language || "cantonese",
        segmentCount: parseInt(segmentCount) || 10,
      });
      
      res.json({ 
        success: true, 
        segments: result.segments,
        apiProvider: result.apiProvider,
        apiProviderName: result.apiProviderName,
      });
    } catch (error) {
      console.error("生成片段失敗:", error);
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : "生成失敗" 
      });
    }
  });
  
  // 生成字幕 API
  app.post("/api/generate-subtitles", async (req, res) => {
    try {
      const { taskId, segments } = req.body;
      
      if (!taskId || !segments || !Array.isArray(segments)) {
        return res.status(400).json({ success: false, error: "缺少必要參數" });
      }
      
      // 1. 獲取任務信息以確定語言
      const { getLongVideoTask } = await import("../segmentBatchService");
      const task = getLongVideoTask(taskId);
      
      if (!task) {
        return res.status(404).json({ success: false, error: "任務不存在" });
      }
      
      const language = task.language || "cantonese";
      
      // 2. 準備 narrationSegments
      const narrationSegments = segments.map((seg: any) => ({
        segmentId: seg.id,
        text: seg.narration || "",
      }));
      
      // 3. 調用字幕生成服務
      const { generateSubtitlesFromText } = await import("../subtitleService");
      // 這裡假設前端傳遞的 segments 已經是最終的片段，每個片段時長 8 秒
      // 由於 segments 中沒有 duration，我們從 task 中獲取
      const segmentDuration = task.segmentDuration || 8;
      const subtitleTrack = await generateSubtitlesFromText(narrationSegments, segmentDuration, language);
      
      // 4. 上傳字幕檔案
      const { uploadSubtitleFile } = await import("../subtitleMergeService");
      const subtitleUrl = await uploadSubtitleFile(subtitleTrack, "srt"); // 默認上傳 srt 格式
      
      // 5. 更新任務中的字幕數據
      if (task) {
        updateLongVideoTask(taskId, { subtitles: subtitleTrack });
      }
      
      res.json({ 
        success: true, 
        subtitleUrl, 
        subtitles: subtitleTrack.segments, // 返回 segments 供前端使用
      });
    } catch (error) {
      console.error("生成字幕失敗:", error);
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : "生成失敗" 
      });
    }
  });
  
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  
  // Serve static files in production
  serveStatic(app);

  const port = parseInt(process.env.PORT || "3000");

  server.listen(port, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${port}/`);
  });
}

startServer().catch(console.error);
