/**
 * 字幕合併服務
 * 將字幕合併到影片中
 */

import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import { SubtitleTrack, convertToSRT, convertToVTT } from "./subtitleService";
import { storagePut } from "./storage";

const execAsync = promisify(exec);

/**
 * 將字幕合併到影片中
 */
export async function mergeSubtitlesToVideo(
  videoUrl: string,
  subtitleTrack: SubtitleTrack,
  options: {
    format?: "srt" | "vtt"; // 字幕格式
    style?: "default" | "white" | "black" | "yellow"; // 字幕樣式
    fontSize?: number; // 字體大小
    position?: "bottom" | "top"; // 字幕位置
  } = {}
): Promise<string> {
  const {
    format = "srt",
    style = "default",
    fontSize = 24,
    position = "bottom",
  } = options;

  try {
    console.log(`[SubtitleMerge] 開始將字幕合併到影片`);

    // 1. 下載影片
    console.log(`[SubtitleMerge] 下載影片: ${videoUrl}`);
    const videoResponse = await fetch(videoUrl);
    if (!videoResponse.ok) {
      throw new Error(`無法下載影片: ${videoResponse.status}`);
    }

    const videoBuffer = await videoResponse.arrayBuffer();
    const videoFileName = `video-${Date.now()}.mp4`;
    const videoPath = path.join("/tmp", videoFileName);
    fs.writeFileSync(videoPath, Buffer.from(videoBuffer));

    // 2. 生成字幕文件
    const subtitleContent = format === "srt" ? convertToSRT(subtitleTrack) : convertToVTT(subtitleTrack);
    const subtitleFileName = `subtitle-${Date.now()}.${format}`;
    const subtitlePath = path.join("/tmp", subtitleFileName);
    fs.writeFileSync(subtitlePath, subtitleContent, "utf-8");

    console.log(`[SubtitleMerge] 字幕文件已生成: ${subtitlePath}`);

    // 3. 使用 FFmpeg 將字幕合併到影片中
    const outputFileName = `video-with-subtitle-${Date.now()}.mp4`;
    const outputPath = path.join("/tmp", outputFileName);

    // 構建 FFmpeg 命令
    const subtitleStyle = buildSubtitleStyle(style, fontSize, position);
    const ffmpegCommand = `ffmpeg -i "${videoPath}" -vf "subtitles='${subtitlePath}':${subtitleStyle}" -c:a copy "${outputPath}" -y`;

    console.log(`[SubtitleMerge] 執行 FFmpeg 命令...`);
    await execAsync(ffmpegCommand);

    // 4. 上傳合併後的影片到 S3
    console.log(`[SubtitleMerge] 上傳合併後的影片到 S3...`);
    const mergedVideoBuffer = fs.readFileSync(outputPath);
    const { url } = await storagePut(
      `videos/with-subtitles/${outputFileName}`,
      mergedVideoBuffer,
      "video/mp4"
    );

    // 5. 清理臨時文件
    fs.unlinkSync(videoPath);
    fs.unlinkSync(subtitlePath);
    fs.unlinkSync(outputPath);

    console.log(`[SubtitleMerge] 字幕合併完成: ${url}`);

    return url;
  } catch (error) {
    console.error(`[SubtitleMerge] 字幕合併失敗:`, error);
    throw error;
  }
}

/**
 * 構建 FFmpeg 字幕樣式參數
 */
function buildSubtitleStyle(
  style: string,
  fontSize: number,
  position: string
): string {
  const styleMap: Record<string, string> = {
    default: `fontsize=${fontSize}:fontcolor=white:borderw=2:bordercolor=black`,
    white: `fontsize=${fontSize}:fontcolor=white:borderw=2:bordercolor=black`,
    black: `fontsize=${fontSize}:fontcolor=black:borderw=2:bordercolor=white`,
    yellow: `fontsize=${fontSize}:fontcolor=yellow:borderw=2:bordercolor=black`,
  };

  const baseStyle = styleMap[style] || styleMap.default;
  const positionOffset = position === "top" ? "y=h/10" : "y=h-text_h-10";

  return `${baseStyle}:${positionOffset}`;
}

/**
 * 批量將字幕合併到多個影片
 */
export async function mergeSubtitlesToMultipleVideos(
  videoUrls: string[],
  subtitleTracks: SubtitleTrack[],
  options?: {
    format?: "srt" | "vtt";
    style?: "default" | "white" | "black" | "yellow";
    fontSize?: number;
    position?: "bottom" | "top";
  }
): Promise<string[]> {
  console.log(`[SubtitleMerge] 開始批量合併字幕到 ${videoUrls.length} 個影片`);

  const results: string[] = [];

  for (let i = 0; i < videoUrls.length; i++) {
    try {
      const videoUrl = videoUrls[i];
      const subtitleTrack = subtitleTracks[i] || subtitleTracks[0];

      console.log(`[SubtitleMerge] 處理影片 ${i + 1}/${videoUrls.length}`);
      const mergedUrl = await mergeSubtitlesToVideo(videoUrl, subtitleTrack, options);
      results.push(mergedUrl);
    } catch (error) {
      console.error(`[SubtitleMerge] 影片 ${i + 1} 合併失敗:`, error);
      results.push(videoUrls[i]); // 失敗時保留原始影片 URL
    }
  }

  console.log(`[SubtitleMerge] 批量合併完成`);

  return results;
}

/**
 * 生成字幕文件並上傳到 S3
 */
export async function uploadSubtitleFile(
  subtitleTrack: SubtitleTrack,
  format: "srt" | "vtt" | "json" = "srt"
): Promise<string> {
  try {
    console.log(`[SubtitleMerge] 上傳字幕文件，格式: ${format}`);

    let subtitleContent: string;

    if (format === "srt") {
      subtitleContent = convertToSRT(subtitleTrack);
    } else if (format === "vtt") {
      const { convertToVTT } = await import("./subtitleService");
      subtitleContent = convertToVTT(subtitleTrack);
    } else {
      const { convertToJSON } = await import("./subtitleService");
      subtitleContent = convertToJSON(subtitleTrack);
    }

    const fileName = `subtitles/subtitle-${Date.now()}.${format}`;
    const { url } = await storagePut(
      fileName,
      Buffer.from(subtitleContent, "utf-8"),
      `text/${format === "json" ? "plain" : format}`
    );

    console.log(`[SubtitleMerge] 字幕文件上傳完成: ${url}`);

    return url;
  } catch (error) {
    console.error(`[SubtitleMerge] 字幕文件上傳失敗:`, error);
    throw error;
  }
}
