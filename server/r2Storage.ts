/**
 * Cloudflare R2 存儲服務
 * 
 * 使用 S3 相容 API 上傳文件到 R2
 * 
 * 需要的環境變量：
 * - R2_ACCOUNT_ID: Cloudflare 帳戶 ID
 * - R2_ACCESS_KEY_ID: R2 API Token 的 Access Key ID
 * - R2_SECRET_ACCESS_KEY: R2 API Token 的 Secret Access Key
 * - R2_BUCKET: R2 Bucket 名稱
 * - R2_PUBLIC_BASE_URL: 公開訪問的 Base URL
 * - R2_REGION: 區域（可選，默認 auto）
 */

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

/**
 * 檢查 R2 環境變量是否已配置
 */
export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET &&
    process.env.R2_PUBLIC_BASE_URL
  );
}

/**
 * 獲取環境變量，如果不存在則拋出錯誤
 */
function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

/**
 * 上傳文件到 Cloudflare R2
 * 
 * @param params.data - 文件數據（Buffer 或 Uint8Array）
 * @param params.key - 存儲路徑，例如 "merged/2025-12-28/abc.mp4"
 * @param params.contentType - MIME 類型，例如 "video/mp4"
 * @returns 公開可訪問的 URL
 */
export async function uploadToR2(params: {
  data: Buffer | Uint8Array;
  key: string;
  contentType?: string;
}): Promise<string> {
  const accountId = requireEnv("R2_ACCOUNT_ID");
  const accessKeyId = requireEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = requireEnv("R2_SECRET_ACCESS_KEY");
  const bucket = requireEnv("R2_BUCKET");
  const publicBase = requireEnv("R2_PUBLIC_BASE_URL").replace(/\/+$/, "");

  console.log(`[R2] 📤 開始上傳到 R2, bucket=${bucket}, key=${params.key}`);

  const client = new S3Client({
    region: process.env.R2_REGION || "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: params.key,
        Body: params.data,
        ContentType: params.contentType || "application/octet-stream",
      }),
    );

    // 回傳公開可訪問 URL：publicBase + key
    const publicUrl = `${publicBase}/${encodeURI(params.key)}`;
    console.log(`[R2] ✅ 上傳成功:`, publicUrl);
    return publicUrl;
  } catch (error: any) {
    console.error(`[R2] ❌ 上傳失敗:`, error.message);
    throw error;
  }
}

/**
 * 上傳視頻文件到 R2
 * 
 * @param fileBuffer - 視頻文件的 Buffer
 * @param fileName - 文件名（不含路徑）
 * @returns 公開可訪問的 URL
 */
export async function uploadVideoToR2(
  fileBuffer: Buffer,
  fileName: string
): Promise<string> {
  // 生成存儲路徑：videos/merged/YYYY-MM-DD/filename.mp4
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0]; // YYYY-MM-DD
  const key = `videos/merged/${dateStr}/${fileName}`;

  return uploadToR2({
    data: fileBuffer,
    key,
    contentType: "video/mp4",
  });
}
