import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
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
