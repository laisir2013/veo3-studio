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
  // 環境變量自檢（不打印密鑰內容，只檢查是否存在）
  console.log(`[EnvCheck] ========== 環境變量檢查 ==========`);
  console.log(`[EnvCheck] BUILT_IN_FORGE_API_URL present:`, Boolean(process.env.BUILT_IN_FORGE_API_URL));
  console.log(`[EnvCheck] BUILT_IN_FORGE_API_KEY present:`, Boolean(process.env.BUILT_IN_FORGE_API_KEY));
  console.log(`[EnvCheck] OPENAI_API_KEY present:`, Boolean(process.env.OPENAI_API_KEY));
  console.log(`[EnvCheck] ---------- R2 存儲配置 ----------`);
  console.log(`[EnvCheck] R2_ACCOUNT_ID present:`, Boolean(process.env.R2_ACCOUNT_ID));
  console.log(`[EnvCheck] R2_ACCESS_KEY_ID present:`, Boolean(process.env.R2_ACCESS_KEY_ID));
  console.log(`[EnvCheck] R2_SECRET_ACCESS_KEY present:`, Boolean(process.env.R2_SECRET_ACCESS_KEY));
  console.log(`[EnvCheck] R2_BUCKET present:`, Boolean(process.env.R2_BUCKET));
  console.log(`[EnvCheck] R2_PUBLIC_BASE_URL present:`, Boolean(process.env.R2_PUBLIC_BASE_URL));
  console.log(`[EnvCheck] ========================================`);

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
      
      // 🔧 修復：使用 parseFloat 處理小數時長（如 0.27 = 16秒）
      const durationMinutes = parseFloat(duration) || 3;
      const totalSeconds = Math.round(durationMinutes * 60);
      const calculatedSegmentCount = parseInt(segmentCount) || Math.ceil(totalSeconds / 8);
      
      console.log(`[生成大綱] 接收參數: duration=${duration}, durationMinutes=${durationMinutes}, totalSeconds=${totalSeconds}, segmentCount=${calculatedSegmentCount}`);
      
      const result = await generateOutline({
        title,
        language: language || "cantonese",
        duration: durationMinutes,
        segmentCount: calculatedSegmentCount,
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
  
  // ✅ 智能字幕 API（使用 AI 識別語音時間）
  app.post("/api/generate-smart-subtitles", async (req, res) => {
    try {
      const { taskId, segments, audioUrl, useAI } = req.body;
      
      if (!taskId || !segments || !Array.isArray(segments)) {
        return res.status(400).json({ success: false, error: "缺少必要參數" });
      }
      
      // 1. 獲取任務信息
      const { getLongVideoTask } = await import("../segmentBatchService");
      const task = getLongVideoTask(taskId);
      
      if (!task) {
        return res.status(404).json({ success: false, error: "任務不存在" });
      }
      
      // 2. 準備腳本段落
      const scriptSegments = segments.map((seg: any) => seg.narration || "").filter((t: string) => t);
      
      if (scriptSegments.length === 0) {
        return res.status(400).json({ success: false, error: "沒有有效的旁白內容" });
      }
      
      // 3. 根據是否有音頻和是否啟用 AI 選擇處理方式
      const { processSubtitlesWithAI, generateSubtitlesFromText } = await import("../smartSubtitleService");
      
      let subtitles;
      
      if (useAI && audioUrl) {
        // 使用 AI 識別語音時間
        console.log(`[SmartSubtitle] 使用 AI 模式處理字幕，音頻: ${audioUrl}`);
        
        // 下載音頻到臨時文件
        const fs = await import("fs");
        const path = await import("path");
        const audioResponse = await fetch(audioUrl);
        if (!audioResponse.ok) {
          throw new Error(`無法下載音頻: ${audioResponse.status}`);
        }
        const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
        const tempAudioPath = path.join("/tmp", `audio_${Date.now()}.mp3`);
        fs.writeFileSync(tempAudioPath, audioBuffer);
        
        try {
          // 獲取 API Key
          const apiKey = process.env.OPENAI_API_KEY || "";
          subtitles = await processSubtitlesWithAI(scriptSegments, tempAudioPath, apiKey);
        } finally {
          // 清理臨時文件
          if (fs.existsSync(tempAudioPath)) {
            fs.unlinkSync(tempAudioPath);
          }
        }
      } else {
        // 使用文本模式（固定時長分段）
        console.log(`[SmartSubtitle] 使用文本模式處理字幕`);
        const segmentDuration = 8; // 每個片段 8 秒
        subtitles = generateSubtitlesFromText(scriptSegments, segmentDuration);
      }
      
      // 4. 上傳字幕文件
      const { storagePut } = await import("../storage");
      const srtFileName = `subtitles/${taskId}_${Date.now()}.srt`;
      const assFileName = `subtitles/${taskId}_${Date.now()}.ass`;
      
      const { url: srtUrl } = await storagePut(srtFileName, Buffer.from(subtitles.srtContent, "utf-8"), "text/plain");
      const { url: assUrl } = await storagePut(assFileName, Buffer.from(subtitles.assContent, "utf-8"), "text/plain");
      
      // 5. 更新任務
      updateLongVideoTask(taskId, { 
        subtitles: {
          language: task.language || "cantonese",
          segments: subtitles.segments.map((s, i) => ({
            id: i + 1,
            startTime: Math.round(s.startTime * 1000),
            endTime: Math.round(s.endTime * 1000),
            text: s.text,
            confidence: 1.0
          }))
        }
      });
      
      res.json({
        success: true,
        subtitles: subtitles.segments,
        srtUrl,
        assUrl,
        totalDuration: subtitles.totalDuration
      });
    } catch (error) {
      console.error("智能字幕生成失敗:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "生成失敗"
      });
    }
  });
  
  // 生成字幕 API（原有 API，保持兼容）
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
      const segmentDuration = 8;
      const subtitleTrack = await generateSubtitlesFromText(narrationSegments, segmentDuration);
      
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
