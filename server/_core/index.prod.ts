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
  app.post("/api/generate-segments", async (req, res) => {
    try {
      const { title, outline, language, segmentCount } = req.body;
      
      if (!title || !outline || !segmentCount) {
        return res.status(400).json({ success: false, error: "缺少必要參數" });
      }
      
      const segments = await generateSegments({
        title,
        outline,
        language: language || "cantonese",
        segmentCount: parseInt(segmentCount) || 10,
      });
      
      res.json({ success: true, segments });
    } catch (error) {
      console.error("生成片段失敗:", error);
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
