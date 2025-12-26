import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { ENV } from "./env";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

// 訪客用戶（當 OAuth 未配置時使用）
const GUEST_USER: User = {
  id: 0,
  openId: "guest",
  name: "訪客",
  email: null,
  loginMethod: "guest",
  role: "user",
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  // 檢查 OAuth 是否已配置
  const isOAuthConfigured = ENV.oAuthServerUrl && ENV.appId && ENV.cookieSecret;

  if (!isOAuthConfigured) {
    // OAuth 未配置，使用訪客模式
    console.log("[Auth] OAuth not configured, using guest mode");
    user = GUEST_USER;
  } else {
    try {
      user = await sdk.authenticateRequest(opts.req);
    } catch (error) {
      // Authentication is optional for public procedures.
      user = null;
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
