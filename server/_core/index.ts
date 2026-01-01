import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { updateLongVideoTask } from "../segmentBatchService";
import fs from "fs";
import path from "path";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function cleanupTempFiles() {
  const tempDir = "/tmp";
  try {
    const files = fs.readdirSync(tempDir);
    const targetFolders = files.filter(f => f.startsWith("veo3-merge-"));
    
    console.log(`[Startup Cleanup] 發現 ${targetFolders.length} 個殘留臨時目錄`);
    
    for (const folder of targetFolders) {
      const fullPath = path.join(tempDir, folder);
      try {
        fs.rmSync(fullPath, { recursive: true, force: true });
        console.log(`[Startup Cleanup] 已清理: ${folder}`);
      } catch (err) {
        console.error(`[Startup Cleanup] 清理失敗 ${folder}:`, err);
      }
    }
  } catch (error) {
    console.error("[Startup Cleanup] 讀取臨時目錄失敗:", error);
  }
}

async function startServer() {
  // 啟動時執行清理
  await cleanupTempFiles();
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  
  // Custom API routes
  
  // 生成故事大綱 API
  app.post("/api/generate-outline", async (req, res) => {
    try {
      const { generateOutline } = await import("../outlineGenerationService");
      const { title, language, duration, segmentCount } = req.body;
      
      if (!title) {
        return res.status(400).json({ success: false, error: "缺少視頻主題" });
      }
      
      // 處理 duration：前端傳遞的是分鐘數（如 0.27 = 16秒，0.4 = 24秒，1 = 1分鐘）
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
      const { generateSegments } = await import("../segmentGenerationService");
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
        fullNarration: result.fullNarration,
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
  
  // 獲取合併任務狀態 API
  app.get("/api/merge-status/:taskId", async (req, res) => {
    try {
      const { getMergeTaskStatus } = await import("../videoMergeService");
      const { taskId } = req.params;
      const status = getMergeTaskStatus(taskId);
      res.json(status);
    } catch (error) {
      res.status(500).json({ success: false, error: "獲取狀態失敗" });
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
      const { processSubtitlesWithAI, generateSubtitlesFromText, generateSRT, generateASS } = await import("../smartSubtitleService");
      
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
  
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    // Dynamic import for development mode only (includes vite dependency)
    const { setupVite } = await import("./vite");
    await setupVite(app, server);
  } else {
    // Static import for production mode (no vite dependency)
    const { serveStatic } = await import("./static");
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${port}/`);
  });
}

startServer().catch(console.error);
