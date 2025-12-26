import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock 視頻服務
vi.mock("./videoService", () => ({
  analyzeStory: vi.fn().mockResolvedValue({
    scenes: [
      {
        id: 1,
        description: "測試場景描述",
        narration: "測試旁白",
        imagePrompt: "test image prompt",
        status: "pending",
      },
    ],
    characterPrompt: "test character prompt",
  }),
  generateCharacterImage: vi.fn().mockResolvedValue("https://example.com/character.png"),
  generateSceneImage: vi.fn().mockResolvedValue("https://example.com/scene.png"),
  generateVideo: vi.fn().mockResolvedValue("https://example.com/video.mp4"),
  generateSpeech: vi.fn().mockResolvedValue("https://example.com/audio.mp3"),
  sleep: vi.fn().mockResolvedValue(undefined),
}));

// Mock 數據庫 - 創建可重用的鏈式調用對象
const createMockQueryBuilder = (result: any[]) => {
  const builder = {
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockResolvedValue(result),
  };
  // 讓 where 返回的對象也有 orderBy, limit, offset
  builder.where.mockImplementation(() => ({
    orderBy: vi.fn().mockReturnValue({
      limit: vi.fn().mockReturnValue({
        offset: vi.fn().mockResolvedValue(result),
      }),
    }),
    limit: vi.fn().mockResolvedValue(result),
  }));
  return builder;
};

vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue({
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue([{ insertId: 1 }]),
    }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockImplementation(() => ({
        where: vi.fn().mockImplementation(() => ({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue([]),
            }),
          }),
          limit: vi.fn().mockResolvedValue([
            {
              id: 1,
              userId: 1,
              mode: "fast",
              videoModel: "veo3.1-fast",
              llmModel: "gpt-4o-mini",
              story: "測試故事",
              status: "pending",
              progress: 0,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ]),
        })),
      })),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue({}),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue({}),
    }),
  }),
}));

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(authenticated: boolean = true): TrpcContext {
  const user: AuthenticatedUser | null = authenticated ? {
    id: 1,
    openId: "test-open-id",
    name: "Test User",
    email: "test@example.com",
    loginMethod: "oauth",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  } : null;

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("Video Router", () => {
  describe("video.getConfig", () => {
    it("應該返回模式預設和模型配置", async () => {
      const ctx = createAuthContext(false);
      const caller = appRouter.createCaller(ctx);

      const result = await caller.video.getConfig();

      expect(result).toHaveProperty("speedModePresets");
      expect(result).toHaveProperty("videoModels");
      expect(result).toHaveProperty("llmModels");
      expect(result.speedModePresets).toHaveProperty("fast");
      expect(result.speedModePresets).toHaveProperty("quality");
    });

    it("快速模式應該使用 veo3.1-fast 和 gpt-4o-mini", async () => {
      const ctx = createAuthContext(false);
      const caller = appRouter.createCaller(ctx);

      const result = await caller.video.getConfig();

      expect(result.speedModePresets.fast.video).toBe("veo3.1-fast");
      expect(result.speedModePresets.fast.llm).toBe("gpt-4o-mini");
    });

    it("高質量模式應該使用 veo3.1-pro 和 claude-opus", async () => {
      const ctx = createAuthContext(false);
      const caller = appRouter.createCaller(ctx);

      const result = await caller.video.getConfig();

      expect(result.speedModePresets.quality.video).toBe("veo3.1-pro");
      expect(result.speedModePresets.quality.llm).toContain("claude-opus");
    });
  });

  describe("video.create", () => {
    it("未登入用戶應該被拒絕", async () => {
      const ctx = createAuthContext(false);
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.video.create({
          speedMode: "fast",
          story: "這是一個測試故事，描述一個探險家的冒險旅程。",
        })
      ).rejects.toThrow();
    });

    it("登入用戶應該能夠創建任務", async () => {
      const ctx = createAuthContext(true);
      const caller = appRouter.createCaller(ctx);

      const result = await caller.video.create({
        speedMode: "fast",
        story: "這是一個測試故事，描述一個探險家的冒險旅程。",
      });

      expect(result).toHaveProperty("taskId");
      expect(result).toHaveProperty("message");
      expect(result.taskId).toBe(1);
    });

    it("故事太短應該被拒絕", async () => {
      const ctx = createAuthContext(true);
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.video.create({
          speedMode: "fast",
          story: "短",
        })
      ).rejects.toThrow();
    });

    it("應該支持可選的角色描述和視覺風格", async () => {
      const ctx = createAuthContext(true);
      const caller = appRouter.createCaller(ctx);

      const result = await caller.video.create({
        speedMode: "quality",
        story: "這是一個測試故事，描述一個探險家的冒險旅程。",
        characterDescription: "25歲亞洲女性，長黑髮",
        visualStyle: "電影感，暖色調",
      });

      expect(result).toHaveProperty("taskId");
    });
  });

  describe("video.getStatus", () => {
    it("應該返回任務狀態", async () => {
      const ctx = createAuthContext(true);
      const caller = appRouter.createCaller(ctx);

      const result = await caller.video.getStatus({ taskId: 1 });

      expect(result).toHaveProperty("id");
      expect(result).toHaveProperty("status");
      expect(result).toHaveProperty("progress");
    });

    it("未登入用戶應該被拒絕", async () => {
      const ctx = createAuthContext(false);
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.video.getStatus({ taskId: 1 })
      ).rejects.toThrow();
    });
  });

  describe("video.getHistory", () => {
    it("應該返回用戶的歷史記錄", async () => {
      const ctx = createAuthContext(true);
      const caller = appRouter.createCaller(ctx);

      const result = await caller.video.getHistory({ limit: 10, offset: 0 });

      expect(Array.isArray(result)).toBe(true);
    });

    it("未登入用戶應該被拒絕", async () => {
      const ctx = createAuthContext(false);
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.video.getHistory({ limit: 10, offset: 0 })
      ).rejects.toThrow();
    });

    it("應該支持分頁參數", async () => {
      const ctx = createAuthContext(true);
      const caller = appRouter.createCaller(ctx);

      // 不應該拋出錯誤
      await expect(
        caller.video.getHistory({ limit: 5, offset: 10 })
      ).resolves.toBeDefined();
    });
  });
});
