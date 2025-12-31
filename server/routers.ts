import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { eq, desc, inArray } from "drizzle-orm";
import { getDb } from "./db";
import { videoTasks, characters, type VideoTask, type SceneData, type Character, type CharacterAnalysis } from "../drizzle/schema";
import { MODE_PRESETS, STORY_MODE_PRESETS, VIDEO_MODELS, LLM_MODELS, type GenerationMode, type VideoModel, type StoryMode } from "./videoConfig";
import { analyzeStory, generateCharacterImage, generateSceneImage, generateVideo, generateSpeech, sleep, shouldGenerateCharacterBase } from "./videoService";
import { translateToEnglish, translateMultiple, translateVideoContent } from "./translationService";
import { mergeVideos, startAsyncMerge, getMergeTaskStatus, BGM_OPTIONS, SUBTITLE_STYLES, type BgmType, type SubtitleStyle } from "./videoMergeService";
import { notifyOwner } from "./_core/notification";
import { createBatchJob, getBatchJob, updateBatchTask, getAllBatchJobs, deleteBatchJob, estimateBatchTime, calculateMaxConcurrency } from "./batchService";
import { createLongVideoTask, getLongVideoTask, updateLongVideoTask, updateSegment, startNextBatch, getBatchApiKey, isTaskCompleted, getUserLongVideoTasks, deleteLongVideoTask, getTaskStats, calculateSegmentCount, calculateBatchCount, BATCH_SIZE, SEGMENT_DURATION, type LongVideoTask, type Segment, type Batch } from "./segmentBatchService";
import { truncateNarration } from "./segmentGenerationService";
import { getAllVoiceActors, getVoiceActorsByGender, getVoiceActorsByType, matchVoiceActorByDescription, autoAssignVoiceActors, analyzeCharactersFromStory, generateSceneVoice, getAllVoiceActorsConfig, getVoiceStats, getFilterOptions, filterVoiceActorsAdvanced, getVoiceActorSampleUrl, getVoiceActorConfig, getAllSampleUrls, getVoiceActorsByAgeGroup, getVoiceActorsByStyle } from "./voiceService";
import { VOICE_ACTORS, VOICE_MODES, type VoiceActorId, type VoiceMode } from "./videoConfig";
import { characterVoices, type CharacterVoiceConfig } from "../drizzle/schema";
import { analyzeCharacterPhoto, generateCharacterBaseImage, identifyCharactersInStory, uploadCharacterPhoto } from "./characterService";
import { memoryStore } from "./memoryStore";
import { 
  createHistoryRecord, 
  updateHistoryStatus, 
  getHistoryRecords, 
  getHistoryByTaskId, 
  deleteHistoryRecord, 
  deleteMultipleHistoryRecords,
  getHistoryStats,
  createClonedVoice,
  updateClonedVoiceStatus,
  getClonedVoices,
  deleteClonedVoice,
  incrementVoiceUsage,
  generateTaskId,
  generateSessionId
} from "./historyService";

export const appRouter = router({
  system: systemRouter,
  
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // 視頻生成相關路由
  video: router({
    // 獲取配置信息
    getConfig: publicProcedure.query(() => ({
      speedModePresets: MODE_PRESETS,
      storyModePresets: STORY_MODE_PRESETS,
      videoModels: VIDEO_MODELS,
      llmModels: LLM_MODELS,
    })),

    // 創建視頻生成任務 (暫時改為 public 以便測試)
    create: publicProcedure
      .input(z.object({
        speedMode: z.enum(["fast", "quality"]),
        storyMode: z.enum(["character", "scene"]).default("character"),
        story: z.string().min(5, "故事至少需要 5 個字符"),
        characterDescription: z.string().optional(),
        visualStyle: z.string().optional(),
        videoModel: z.string().optional(),
        llmModel: z.string().optional(),
        language: z.enum(["cantonese", "mandarin", "english"]).default("cantonese"),
        voiceActorId: z.string().default("cantonese-male-narrator"),
        // 角色庫支持
        selectedCharacterIds: z.array(z.number()).optional(), // 選擇的角色 ID 列表
      }))
      .mutation(async ({ ctx, input }) => {
        // 未登入時使用默認用戶 ID 0
        const userId = ctx.user?.id ?? 0;
        
        const preset = MODE_PRESETS[input.speedMode];
        const videoModel = input.videoModel || preset.video;
        const llmModel = input.llmModel || preset.llm;

        // 如果選擇了角色庫角色，獲取角色信息（使用內存存儲）
        let selectedCharacters: Array<{
          id: number;
          name: string;
          description: string | null;
          baseImageUrl: string | null;
          voiceActorId: string | null;
        }> = [];
        
        if (input.selectedCharacterIds && input.selectedCharacterIds.length > 0) {
          const chars = memoryStore.getCharactersByIds(input.selectedCharacterIds);
          // 確保角色屬於當前用戶且狀態為 ready
          selectedCharacters = chars.filter(c => 
            c.userId === userId && c.status === "ready"
          ).map(c => ({
            id: c.id,
            name: c.name,
            description: c.description,
            baseImageUrl: c.baseImageUrl,
            voiceActorId: c.voiceActorId,
          }));
        }

        // 創建任務記錄（使用內存存儲）
        const task = memoryStore.createVideoTask({
          userId: userId,
          mode: input.speedMode,
          storyMode: input.storyMode,
          videoModel,
          llmModel,
          story: input.story,
          characterDescription: input.characterDescription || null,
          visualStyle: input.visualStyle || null,
          language: input.language,
          status: "pending",
          progress: 0,
        });

        const taskId = task.id;

        // 異步開始生成（不阻塞響應）
        startVideoGeneration(
          taskId, 
          { ...input, selectedCharacters }, 
          videoModel as VideoModel, 
          llmModel, 
          preset.mjMode, 
          input.storyMode, 
          input.language, 
          input.voiceActorId
        );

        return { taskId, message: "任務已創建，正在生成中..." };
      }),

    // 生成字幕
    generateSubtitles: publicProcedure
      .input(z.object({
        taskId: z.string(),
        narrationSegments: z.array(z.object({
          segmentId: z.number(),
          text: z.string(),
        })),
        language: z.enum(["cantonese", "mandarin", "english"]).default("cantonese"),
        format: z.enum(["srt", "vtt", "json"]).default("srt"),
      }))
      .mutation(async ({ input }) => {
        try {
          const { generateSubtitlesFromText, convertToSRT, convertToVTT, convertToJSON } = await import("./subtitleService");
          const subtitleTrack = await generateSubtitlesFromText(input.narrationSegments, 8);

          // 根據格式轉換字幕
          let subtitleContent: string;
          if (input.format === "srt") {
            subtitleContent = convertToSRT(subtitleTrack);
          } else if (input.format === "vtt") {
            subtitleContent = convertToVTT(subtitleTrack);
          } else {
            subtitleContent = convertToJSON(subtitleTrack);
          }

          // 上傳字幕檔案
          const { uploadSubtitleFile } = await import("./subtitleMergeService");
          const subtitleUrl = await uploadSubtitleFile(subtitleTrack, input.format);

          // 更新任務中的字幕數據
          const task = getLongVideoTask(input.taskId);
          if (task) {
            updateLongVideoTask(input.taskId, { subtitles: subtitleTrack });
          }

          return { success: true, subtitleUrl, subtitleTrack };
        } catch (error) {
          console.error("生成字幕失敗:", error);
          return { success: false, error: error instanceof Error ? error.message : "未知錯誤" };
        }
      }),

    // 合併字幕到影片
    mergeSubtitlesToVideo: publicProcedure
      .input(z.object({
        taskId: z.string(),
        videoUrl: z.string(),
        style: z.enum(["default", "white", "black", "yellow"]).default("default"),
        fontSize: z.number().default(24),
        position: z.enum(["bottom", "top"]).default("bottom"),
      }))
      .mutation(async ({ input }) => {
        try {
          const task = getLongVideoTask(input.taskId);
          if (!task || !task.subtitles) {
            return { success: false, error: "任務中沒有字幕數據" };
          }

          const { mergeSubtitlesToVideo } = await import("./subtitleMergeService");
          const mergedVideoUrl = await mergeSubtitlesToVideo(input.videoUrl, task.subtitles, {
            format: "srt",
            style: input.style,
            fontSize: input.fontSize,
            position: input.position,
          });

          return { success: true, mergedVideoUrl };
        } catch (error) {
          console.error("合併字幕到影片失敗:", error);
          return { success: false, error: error instanceof Error ? error.message : "未知錯誤" };
        }
      }),

    // 重新生成片段
    regenerateSegment: publicProcedure
      .input(z.object({
        taskId: z.string(),
        segmentId: z.number(),
        regenerateType: z.enum(["all", "video", "audio", "image"]).default("all"),
      }))
      .mutation(async ({ input }) => {
        try {
          const { regenerateSegment: regenerateSegmentFn } = await import("./regenerateSegmentService");
          const result = await regenerateSegmentFn({
            taskId: input.taskId,
            segmentId: input.segmentId,
            regenerateType: input.regenerateType,
          });

          if (result.success) {
            return { success: true, ...result };
          } else {
            return { success: false, error: result.error };
          }
        } catch (error) {
          console.error("重新生成片段失敗:", error);
          return { success: false, error: error instanceof Error ? error.message : "未知錯誤" };
        }
      }),

    // 重新生成旁白腳本
    regenerateNarration: publicProcedure
      .input(z.object({
        taskId: z.string(),
        sceneId: z.number(),
        story: z.string(),
        sceneDescription: z.string(),
        existingNarration: z.string(),
        llmModel: z.string(),
        language: z.enum(["cantonese", "mandarin", "english"]).default("cantonese"),
      }))
      .mutation(async ({ input }) => {
        try {
          const { regenerateNarrationSegments } = await import("./videoService");
          const newSegments = await regenerateNarrationSegments(
            input.story,
            input.sceneDescription,
            input.existingNarration,
            input.llmModel,
            input.language
          );

          // 更新長視頻任務中的場景數據
          const task = getLongVideoTask(input.taskId);
          if (task) {
            const scene = task.scenes?.find(s => s.id === input.sceneId);
            if (scene) {
              scene.narrationSegments = newSegments;
              updateLongVideoTask(input.taskId, { scenes: task.scenes });
            }
          }

          return { success: true, narrationSegments: newSegments };
        } catch (error) {
          console.error("重新生成旁白失敗:", error);
          return { success: false, error: error instanceof Error ? error.message : "未知錯誤" };
        }
      }),

    // 獲取任務狀態（使用內存存儲）
    getStatus: publicProcedure
      .input(z.object({ taskId: z.number() }))
      .query(async ({ ctx, input }) => {
        const task = memoryStore.getVideoTask(input.taskId);

        if (!task) {
          throw new Error("任務不存在");
        }

        // 未登入時允許查看所有任務（測試模式）
        const userId = ctx.user?.id ?? 0;
        if (userId !== 0 && task.userId !== userId) {
          throw new Error("無權訪問此任務");
        }

        return task;
      }),

    // 獲取用戶的生成歷史（使用內存存儲）
    getHistory: publicProcedure
      .input(z.object({
        limit: z.number().min(1).max(50).default(10),
        offset: z.number().min(0).default(0),
      }))
      .query(async ({ ctx, input }) => {
        const userId = ctx.user?.id ?? 0;
        // Guest 模式下（userId 為 0），返回所有任務
        const allTasks = userId === 0 
          ? memoryStore.getAllVideoTasks()
          : memoryStore.getVideoTasksByUser(userId);
        const tasks = allTasks.slice(input.offset, input.offset + input.limit);
        return tasks;
      }),

    // 刪除任務
    delete: protectedProcedure
      .input(z.object({ taskId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("數據庫不可用");

        // 先檢查權限
        const tasks = await db.select().from(videoTasks)
          .where(eq(videoTasks.id, input.taskId))
          .limit(1);

        if (tasks.length === 0 || tasks[0].userId !== ctx.user.id) {
          throw new Error("無權刪除此任務");
        }

        await db.delete(videoTasks).where(eq(videoTasks.id, input.taskId));

        return { success: true };
      }),

    // 合併視頻
    merge: protectedProcedure
      .input(z.object({
        taskId: z.number(),
        bgmType: z.enum(["none", "cinematic", "emotional", "upbeat", "dramatic", "peaceful"]).default("none"),
        subtitleStyle: z.enum(["none", "bottom", "top", "cinematic"]).default("none"),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("數據庫不可用");

        // 獲取任務
        const tasks = await db.select().from(videoTasks)
          .where(eq(videoTasks.id, input.taskId))
          .limit(1);

        if (tasks.length === 0 || tasks[0].userId !== ctx.user.id) {
          throw new Error("無權訪問此任務");
        }

        const task = tasks[0];
        const scenes = task.scenes as SceneData[] || [];
        
        // 獲取所有已完成場景的視頻 URL
        const videoUrls = scenes
          .filter(s => s.status === "completed" && s.videoUrl)
          .map(s => s.videoUrl!);
        
        const narrations = scenes
          .filter(s => s.status === "completed" && s.videoUrl)
          .map(s => s.narration);

        if (videoUrls.length === 0) {
          throw new Error("沒有可合併的視頻");
        }

        // 獲取所有已完成場景的音頻 URL
        const audioUrls = scenes
          .filter(s => s.status === "completed" && s.videoUrl)
          .map(s => s.audioUrl || "");

        // 🔍 合併診斷報告
        console.log(`========== 🔍 合併診斷報告 (trpc.longVideo.merge) ==========`);
        console.log(`任務 ID: ${input.taskId}`);
        console.log(`片段總數: ${scenes.length}`);
        console.log(`有效視頻: ${videoUrls.length}`);
        console.log(`有效音頻: ${audioUrls.filter(u => u).length}`);
        console.log(`==========================================================`);

        // 合併視頻
        const result = await mergeVideos({
          videoUrls,
          audioUrls, // ✅ 修復：傳遞音頻 URL
          narrations,
          bgmType: input.bgmType as BgmType,
          subtitleStyle: input.subtitleStyle as SubtitleStyle,
        });

        if (result.success && result.videoUrl) {
          // 更新任務的最終視頻 URL
          await db.update(videoTasks)
            .set({ finalVideoUrl: result.videoUrl })
            .where(eq(videoTasks.id, input.taskId));

          return { success: true, videoUrl: result.videoUrl };
        }

        return { success: false, error: result.error };
      }),

    // 獲取合併選項
    getMergeOptions: publicProcedure.query(() => ({
      bgmOptions: BGM_OPTIONS,
      subtitleStyles: SUBTITLE_STYLES,
    })),

    // 生成 SEO 內容
    generateSeo: publicProcedure
      .input(z.object({
        story: z.string().min(5, "故事至少需要 5 個字符"),
        language: z.enum(["zh-TW", "zh-CN", "en", "ja", "ko", "cantonese", "mandarin", "english"]).default("zh-TW"),
        platform: z.enum(["youtube", "tiktok", "instagram", "facebook", "general"]).default("youtube"),
        model: z.enum(["gpt-5.2", "claude-opus-4-5-20251101", "gemini-3-pro-preview"]).optional(),
        targetAudience: z.string().optional(),
        videoStyle: z.string().optional(),
        duration: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        try {
          console.log("[SEO] 開始生成 SEO 內容...");
          const { generateSeoWithFallback } = await import("./seoService");
          const result = await generateSeoWithFallback({
            story: input.story,
            language: input.language,
            platform: input.platform,
            model: input.model,
            targetAudience: input.targetAudience,
            videoStyle: input.videoStyle,
            duration: input.duration,
          });
          console.log("[SEO] SEO 內容生成成功");
          return { success: true, data: result };
        } catch (error) {
          console.error("[SEO] 生成失敗:", error);
          return { success: false, error: error instanceof Error ? error.message : "SEO 生成失敗" };
        }
      }),

    // 快速生成標題
    generateTitles: publicProcedure
      .input(z.object({
        story: z.string().min(5, "故事至少需要 5 個字符"),
        language: z.enum(["zh-TW", "zh-CN", "en", "ja", "ko", "cantonese", "mandarin", "english"]).default("zh-TW"),
        platform: z.enum(["youtube", "tiktok", "instagram", "facebook", "general"]).default("youtube"),
        model: z.enum(["gpt-5.2", "claude-opus-4-5-20251101", "gemini-3-pro-preview"]).optional(),
        count: z.number().min(1).max(10).default(5),
      }))
      .mutation(async ({ input }) => {
        try {
          console.log("[SEO] 開始生成標題...");
          const { generateTitlesWithFallback } = await import("./seoService");
          const titles = await generateTitlesWithFallback({
            story: input.story,
            language: input.language,
            platform: input.platform,
            model: input.model,
            count: input.count,
          });
          console.log("[SEO] 標題生成成功");
          return { success: true, titles };
        } catch (error) {
          console.error("[SEO] 標題生成失敗:", error);
          return { success: false, error: error instanceof Error ? error.message : "標題生成失敗" };
        }
      }),

    // 獲取 SEO 模型配置
    getSeoModels: publicProcedure.query(async () => {
      const { SEO_LLM_MODELS } = await import("./seoService");
      return SEO_LLM_MODELS;
    }),

    // AI 生成單個場景描述
    generateScene: publicProcedure
      .input(z.object({
        story: z.string().min(5, "故事至少需要 5 個字符"),
        existingScenes: z.array(z.string()).optional(),
        language: z.enum(["cantonese", "mandarin", "english"]).default("cantonese"),
        visualStyle: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        try {
          console.log("[Scene] 開始 AI 生成場景...");
          const { generateSceneDescription } = await import("./videoService");
          const description = await generateSceneDescription(
            input.story,
            input.existingScenes || [],
            input.language,
            input.visualStyle
          );
          console.log("[Scene] 場景生成成功");
          return { success: true, description };
        } catch (error) {
          console.error("[Scene] 場景生成失敗:", error);
          return { success: false, error: error instanceof Error ? error.message : "場景生成失敗" };
        }
      }),

    // 翻譯影片描述為英文
    translateDescription: publicProcedure
      .input(z.object({
        description: z.string().min(1, "描述不能為空"),
        sourceLanguage: z.enum(["cantonese", "mandarin", "english"]).default("mandarin"),
      }))
      .mutation(async ({ input }) => {
        try {
          console.log("[Translation] 開始翻譯影片描述...");
          const { translateToEnglish } = await import("./translationService");
          const descriptionEn = await translateToEnglish(input.description, input.sourceLanguage);
          console.log("[Translation] 翻譯完成");
          return { success: true, descriptionEn };
        } catch (error) {
          console.error("[Translation] 翻譯失敗:", error);
          return { success: false, error: error instanceof Error ? error.message : "翻譯失敗" };
        }
      }),

    // 翻譯多個文本
    translateMultiple: publicProcedure
      .input(z.object({
        texts: z.array(z.string()),
        sourceLanguage: z.enum(["cantonese", "mandarin", "english"]).default("mandarin"),
      }))
      .mutation(async ({ input }) => {
        try {
          console.log("[Translation] 開始批量翻譯...");
          const { translateMultiple } = await import("./translationService");
          const translatedTexts = await translateMultiple(input.texts, input.sourceLanguage);
          console.log("[Translation] 批量翻譯完成");
          return { success: true, translatedTexts };
        } catch (error) {
          console.error("[Translation] 批量翻譯失敗:", error);
          return { success: false, error: error instanceof Error ? error.message : "批量翻譯失敗" };
        }
      }),
  }),

  // 批量生成相關路由
  batch: router({
    // 創建批量任務
    create: protectedProcedure
      .input(z.object({
        stories: z.array(z.object({
          story: z.string().min(10),
          characterDescription: z.string().optional(),
          visualStyle: z.string().optional(),
        })).min(1).max(20),
        speedMode: z.enum(["fast", "quality"]),
        storyMode: z.enum(["character", "scene"]).default("character"),
      }))
      .mutation(async ({ ctx, input }) => {
        const job = createBatchJob(input.stories, input.speedMode, input.storyMode);
        const estimate = estimateBatchTime(input.stories.length, input.speedMode);
        const concurrency = calculateMaxConcurrency(input.stories.length);

        // 開始異步處理批量任務
        processBatchJob(job.id, ctx.user.id as number, input.speedMode, input.storyMode).catch(console.error);

        return {
          jobId: job.id,
          totalTasks: job.totalTasks,
          concurrency,
          estimatedMinutes: estimate,
        };
      }),

    // 獲取批量任務狀態
    getStatus: protectedProcedure
      .input(z.object({ jobId: z.string() }))
      .query(({ input }) => {
        const job = getBatchJob(input.jobId);
        if (!job) {
          throw new Error("批量任務不存在");
        }
        return job;
      }),

    // 獲取所有批量任務
    getAll: protectedProcedure.query(() => {
      return getAllBatchJobs();
    }),

    // 刪除批量任務
    delete: protectedProcedure
      .input(z.object({ jobId: z.string() }))
      .mutation(({ input }) => {
        const success = deleteBatchJob(input.jobId);
        return { success };
      }),

    // 獲取批量任務配置
    getConfig: publicProcedure.query(() => ({
      maxStories: 20,
      maxConcurrency: calculateMaxConcurrency(20),
    })),
  }),

  // 長視頻生成路由（按時長分段生成）
  longVideo: router({
    // 創建長視頻任務
    create: publicProcedure
      .input(z.object({
        durationMinutes: z.number(),
        story: z.string(),
        language: z.enum(["cantonese", "mandarin", "english"]).default("cantonese"),
        voiceActorId: z.string().optional(),
        speedMode: z.enum(["fast", "quality"]).default("fast"),
        sessionId: z.string().optional(),
        imagePercent: z.number().min(0).max(100).optional(),
        enableHybridMode: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user?.id ?? 0;
        const imagePercent = input.enableHybridMode ? (input.imagePercent ?? 60) : 0;
        const videoPercent = 100 - imagePercent;
        console.log(`[LongVideo] 創建任務 - 混合模式: ${input.enableHybridMode}, 圖片比例: ${imagePercent}%, 視頻比例: ${videoPercent}%`);
        const task = createLongVideoTask(userId, input.durationMinutes, input.story, {
          language: input.language,
          voiceActorId: input.voiceActorId,
          speedMode: input.speedMode,
          imagePercent: imagePercent,
          videoPercent: videoPercent,
        });
        startNextBatch(task.id);
        // 異步啟動實際的片段生成處理
        processLongVideoTask(task.id).catch(err => {
          console.error(`[LongVideo ${task.id}] 處理失敗:`, err);
        });
        return { taskId: task.id, success: true };
      }),

    // 獲取任務狀態
    getStatus: publicProcedure
      .input(z.object({ taskId: z.string() }))
      .query(({ input }) => {
        const task = getLongVideoTask(input.taskId);
        if (!task) {
          return { status: "not_found", segments: [] };
        }
        return {
          status: task.status,
          progress: task.progress,
          segments: task.segments.map(seg => ({
            id: seg.id,
            status: seg.status,
            videoUrl: seg.videoUrl,
            audioUrl: seg.audioUrl,
            imageUrl: seg.imageUrl,
          })),
        };
      }),

    // 獲取任務
    get: publicProcedure
      .input(z.object({ taskId: z.string() }))
      .query(({ input }) => {
        return getLongVideoTask(input.taskId);
      }),

    // ✅ 新增：檢查合併任務狀態
    checkMergeStatus: publicProcedure
      .input(z.object({ mergeTaskId: z.string() }))
      .query(({ input }) => {
        const status = getMergeTaskStatus(input.mergeTaskId);
        return status || { status: "failed", error: "任務不存在", progress: 0 };
      }),

    // 合併視頻 - ✅ 已改為異步模式
    merge: publicProcedure
      .input(z.object({
        taskId: z.string(),
        narrationVolume: z.number().default(80),
        bgmVolume: z.number().default(30),
        originalVolume: z.number().default(50),
        videoUrls: z.array(z.string()).optional(),
        audioUrls: z.array(z.string()).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const task = getLongVideoTask(input.taskId);
        let videoUrls: string[] = [];
        let audioUrls: string[] = [];
        let narrations: string[] = [];
        const taskIdForLog = input.taskId.substring(0, 8);

        if (task) {
          const userId = ctx.user?.id ?? 0;
          if (task.userId !== userId && task.userId !== 0) {
            throw new Error("無權訪問此任務");
          }
          const completedSegments = task.segments.filter(seg => seg.status === "completed" && seg.videoUrl);
          if (completedSegments.length === 0) {
            throw new Error("沒有已完成的片段可以合併");
          }
          videoUrls = completedSegments.map(seg => seg.videoUrl);
          const taskAudioUrls = completedSegments.map(seg => seg.audioUrl || "");
          const inputAudioUrls = input.audioUrls || [];
          if (inputAudioUrls.length === completedSegments.length) {
            audioUrls = inputAudioUrls;
          } else {
            audioUrls = taskAudioUrls;
          }
          narrations = completedSegments.map(seg => seg.narration || "");
        } else if (input.videoUrls && input.videoUrls.length > 0) {
          videoUrls = input.videoUrls;
          audioUrls = input.audioUrls || input.videoUrls.map(() => "");
          narrations = input.videoUrls.map(() => "");
        } else {
          throw new Error("任務不存在，請重新生成視頻");
        }

        const mergeTaskId = `merge_${input.taskId}_${Date.now()}`;
        
        // 🚀 啟動異步合併任務
        startAsyncMerge({
          videoUrls: videoUrls,
          audioUrls: audioUrls,
          narrations: narrations,
          bgmType: (task?.bgmType || "none") as BgmType,
          subtitleStyle: (task?.subtitleStyle || "none") as SubtitleStyle,
          narrationVolume: input.narrationVolume,
          bgmVolume: input.bgmVolume,
          originalVolume: input.originalVolume,
        }, mergeTaskId);

        console.log(`[LongVideo ${taskIdForLog}] 🚀 已啟動異步合併任務: ${mergeTaskId}`);

        return { 
          success: true, 
          mergeTaskId,
          message: "合併任務已啟動，請輪詢進度" 
        };
      }),
  }),
  // 配音員相關路由
  voice: router({
    // 獲取所有配音員（完整配置）
    getAll: publicProcedure.query(() => {
      return {
        voiceActors: getAllVoiceActorsConfig(),
        voiceModes: VOICE_MODES,
      };
    }),

    // 獲取所有配音員（完整配置）
    getAllConfig: publicProcedure.query(() => {
      return {
        voiceActors: getAllVoiceActorsConfig(),
        stats: getVoiceStats(),
        filterOptions: getFilterOptions(),
      };
    }),

    // 組合篩選配音員（KreadoAI 風格）
    filter: publicProcedure
      .input(z.object({
        language: z.enum(["cantonese", "mandarin", "english", "clone"]).optional(),
        gender: z.enum(["male", "female"]).optional(),
        ageGroup: z.enum(["child", "teen", "young", "adult", "middle", "elder"]).optional(),
        style: z.enum(["narrator", "character", "news", "commercial", "storytelling", "assistant", "cartoon", "emotional", "professional"]).optional(),
        searchText: z.string().optional(),
      }))
      .query(({ input }) => {
        return filterVoiceActorsAdvanced(input);
      }),

    // 獲取配音員試聽 URL
    getSampleUrl: publicProcedure
      .input(z.object({ voiceActorId: z.string() }))
      .query(({ input }) => {
        const actor = getVoiceActorConfig(input.voiceActorId);
        return {
          sampleUrl: getVoiceActorSampleUrl(input.voiceActorId),
          actor,
        };
      }),

    // 獲取所有試聽 URL
    getAllSampleUrls: publicProcedure.query(() => {
      return getAllSampleUrls();
    }),

    // 根據性別獲取配音員
    getByGender: publicProcedure
      .input(z.object({ gender: z.enum(["male", "female"]) }))
      .query(({ input }) => getVoiceActorsByGender(input.gender)),

    // 根據類型獲取配音員
    getByType: publicProcedure
      .input(z.object({ type: z.enum(["narrator", "character"]) }))
      .query(({ input }) => getVoiceActorsByType(input.type)),

    // 根據年齡段獲取配音員
    getByAgeGroup: publicProcedure
      .input(z.object({ ageGroup: z.enum(["child", "teen", "young", "adult", "middle", "elder"]) }))
      .query(({ input }) => {
        return getVoiceActorsByAgeGroup(input.ageGroup);
      }),

    // 根據風格獲取配音員
    getByStyle: publicProcedure
      .input(z.object({ style: z.enum(["narrator", "character", "news", "commercial", "storytelling", "assistant", "cartoon", "emotional", "professional"]) }))
      .query(({ input }) => {
        return getVoiceActorsByStyle(input.style);
      }),

    // 高級篩選配音員（根據語言、性別、年齡、語氣）
    filterAdvanced: publicProcedure
      .input(z.object({
        language: z.enum(["cantonese", "mandarin", "english", "clone"]).optional(),
        gender: z.enum(["male", "female"]).optional(),
        ageGroup: z.enum(["child", "teen", "young", "adult", "middle", "elder"]).optional(),
        style: z.enum(["narrator", "character", "news", "commercial", "storytelling", "assistant", "cartoon", "emotional", "professional"]).optional(),
        searchText: z.string().optional(),
      }))
      .query(({ input }) => {
        const allActors = getAllVoiceActorsConfig();
        let filtered = allActors;

        if (input.language && input.language !== "clone") {
          filtered = filtered.filter((actor: any) => actor.language === input.language);
        }

        if (input.gender) {
          filtered = filtered.filter((actor: any) => actor.gender === input.gender);
        }

        if (input.ageGroup) {
          filtered = filtered.filter((actor: any) => actor.ageGroup === input.ageGroup);
        }

        if (input.style) {
          filtered = filtered.filter((actor: any) => actor.styles && actor.styles.includes(input.style));
        }

        if (input.searchText) {
          const searchLower = input.searchText.toLowerCase();
          filtered = filtered.filter((actor: any) => 
            actor.name.toLowerCase().includes(searchLower) ||
            actor.description?.toLowerCase().includes(searchLower)
          );
        }

        return {
          actors: filtered,
          total: filtered.length,
          filters: {
            language: input.language,
            gender: input.gender,
            ageGroup: input.ageGroup,
            style: input.style,
          },
        };
      }),

    // AI 自動匹配配音員
    matchByDescription: publicProcedure
      .input(z.object({ description: z.string() }))
      .query(({ input }) => {
        const voiceActorId = matchVoiceActorByDescription(input.description);
        return {
          voiceActorId,
          voiceActor: VOICE_ACTORS[voiceActorId as keyof typeof VOICE_ACTORS],
        };
      }),

    // 為角色列表自動分配配音員
    autoAssign: protectedProcedure
      .input(z.object({
        characters: z.array(z.object({
          name: z.string(),
          description: z.string().optional(),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        // 獲取用戶已有的角色聲音綁定
        const db = await getDb();
        if (!db) throw new Error("數據庫不可用");

        const existingBindings = await db.select().from(characterVoices)
          .where(eq(characterVoices.userId, ctx.user.id));

        const bindings: CharacterVoiceConfig[] = existingBindings.map(b => ({
          characterName: b.characterName,
          characterDescription: b.characterDescription || undefined,
          voiceActorId: b.voiceActorId,
          isAutoMatched: b.isAutoMatched === 1,
        }));

        return autoAssignVoiceActors(input.characters, bindings);
      }),

    // 分析故事中的角色
    analyzeCharacters: protectedProcedure
      .input(z.object({
        story: z.string(),
        llmModel: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const characters = await analyzeCharactersFromStory(
          input.story,
          input.llmModel || "gpt-4o-mini"
        );
        return characters;
      }),

    // 保存角色聲音綁定
    saveCharacterVoice: protectedProcedure
      .input(z.object({
        characterName: z.string(),
        characterDescription: z.string().optional(),
        characterImageUrl: z.string().optional(),
        voiceActorId: z.string(),
        isAutoMatched: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("數據庫不可用");

        // 檢查是否已存在
        const existing = await db.select().from(characterVoices)
          .where(eq(characterVoices.userId, ctx.user.id))
          .limit(100);

        const existingBinding = existing.find(
          b => b.characterName.toLowerCase() === input.characterName.toLowerCase()
        );

        if (existingBinding) {
          // 更新現有綁定
          await db.update(characterVoices)
            .set({
              characterDescription: input.characterDescription || null,
              characterImageUrl: input.characterImageUrl || null,
              voiceActorId: input.voiceActorId,
              isAutoMatched: input.isAutoMatched ? 1 : 0,
            })
            .where(eq(characterVoices.id, existingBinding.id));
        } else {
          // 創建新綁定
          await db.insert(characterVoices).values({
            userId: ctx.user.id,
            characterName: input.characterName,
            characterDescription: input.characterDescription || null,
            characterImageUrl: input.characterImageUrl || null,
            voiceActorId: input.voiceActorId,
            isAutoMatched: input.isAutoMatched ? 1 : 0,
          });
        }

        return { success: true };
      }),

    // 獲取用戶的角色聲音綁定
    getCharacterVoices: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("數據庫不可用");

      const bindings = await db.select().from(characterVoices)
        .where(eq(characterVoices.userId, ctx.user.id))
        .orderBy(desc(characterVoices.updatedAt));

      return bindings;
    }),

    // 刪除角色聲音綁定
    deleteCharacterVoice: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("數據庫不可用");

        // 檢查權限
        const bindings = await db.select().from(characterVoices)
          .where(eq(characterVoices.id, input.id))
          .limit(1);

        if (bindings.length === 0 || bindings[0].userId !== ctx.user.id) {
          throw new Error("無權刪除此綁定");
        }

        await db.delete(characterVoices).where(eq(characterVoices.id, input.id));

        return { success: true };
      }),
  }),

  // 角色庫管理路由
  character: router({
    // 獲取用戶的角色庫
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("數據庫不可用");

      const chars = await db.select().from(characters)
        .where(eq(characters.userId, ctx.user.id))
        .orderBy(desc(characters.updatedAt));

      return chars;
    }),

    // 獲取單個角色詳情
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("數據庫不可用");

        const chars = await db.select().from(characters)
          .where(eq(characters.id, input.id))
          .limit(1);

        if (chars.length === 0 || chars[0].userId !== ctx.user.id) {
          throw new Error("角色不存在");
        }

        return chars[0];
      }),

    // 創建新角色（上傳照片）
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1, "角色名稱不能為空"),
        description: z.string().optional(),
        photoBase64: z.string().optional(), // Base64 編碼的圖片
        photoUrl: z.string().optional(), // 或者直接提供 URL
        voiceActorId: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("數據庫不可用");

        let photoUrl = input.photoUrl;

        // 如果提供了 Base64 圖片，上傳到 S3
        if (input.photoBase64 && !photoUrl) {
          const matches = input.photoBase64.match(/^data:([^;]+);base64,(.+)$/);
          if (matches) {
            const contentType = matches[1];
            const base64Data = matches[2];
            const buffer = Buffer.from(base64Data, "base64");
            const extension = contentType.split("/")[1] || "jpg";
            photoUrl = await uploadCharacterPhoto(
              buffer,
              `character.${extension}`,
              contentType,
              ctx.user.id
            );
          }
        }

        // 創建角色記錄
        const result = await db.insert(characters).values({
          userId: ctx.user.id,
          name: input.name,
          description: input.description || null,
          originalPhotoUrl: photoUrl || null,
          voiceActorId: input.voiceActorId || null,
          status: photoUrl ? "pending" : "ready",
        });

        const characterId = Number(result[0].insertId);

        // 如果有照片，異步開始分析和生成基礎圖
        if (photoUrl) {
          processCharacterPhoto(characterId, photoUrl).catch(console.error);
        }

        return { id: characterId, success: true };
      }),

    // 更新角色信息
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        voiceActorId: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("數據庫不可用");

        // 檢查權限
        const chars = await db.select().from(characters)
          .where(eq(characters.id, input.id))
          .limit(1);

        if (chars.length === 0 || chars[0].userId !== ctx.user.id) {
          throw new Error("無權更新此角色");
        }

        const updateData: any = {};
        if (input.name) updateData.name = input.name;
        if (input.description !== undefined) updateData.description = input.description;
        if (input.voiceActorId !== undefined) updateData.voiceActorId = input.voiceActorId;

        await db.update(characters)
          .set(updateData)
          .where(eq(characters.id, input.id));

        return { success: true };
      }),

    // 刪除角色
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("數據庫不可用");

        // 檢查權限
        const chars = await db.select().from(characters)
          .where(eq(characters.id, input.id))
          .limit(1);

        if (chars.length === 0 || chars[0].userId !== ctx.user.id) {
          throw new Error("無權刪除此角色");
        }

        await db.delete(characters).where(eq(characters.id, input.id));

        return { success: true };
      }),

    // 重新生成角色基礎圖
    regenerateBaseImage: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("數據庫不可用");

        // 檢查權限
        const chars = await db.select().from(characters)
          .where(eq(characters.id, input.id))
          .limit(1);

        if (chars.length === 0 || chars[0].userId !== ctx.user.id) {
          throw new Error("無權操作此角色");
        }

        const char = chars[0];
        if (!char.originalPhotoUrl) {
          throw new Error("此角色沒有原始照片");
        }

        // 更新狀態為 pending
        await db.update(characters)
          .set({ status: "pending", errorMessage: null })
          .where(eq(characters.id, input.id));

        // 異步重新生成
        processCharacterPhoto(input.id, char.originalPhotoUrl).catch(console.error);

        return { success: true };
      }),

    // 從故事中識別角色
    identifyInStory: protectedProcedure
      .input(z.object({ story: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("數據庫不可用");

        // 獲取用戶的角色庫
        const userCharacters = await db.select().from(characters)
          .where(eq(characters.userId, ctx.user.id));

        // 識別故事中的角色
        const identified = await identifyCharactersInStory(
          input.story,
          userCharacters.map(c => ({
            id: c.id,
            name: c.name,
            description: c.description || undefined,
          }))
        );

        return identified;
      }),
  }),

  // ============================================
  // 歷史記錄路由（數據庫持久化）
  // ============================================
  history: router({
    // 獲取歷史記錄列表
    list: publicProcedure
      .input(z.object({
        sessionId: z.string().optional(),
        taskType: z.enum(["video", "image", "audio", "voice_clone"]).optional(),
        status: z.string().optional(),
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      }))
      .query(async ({ ctx, input }) => {
        const userId = ctx.user?.id;
        const records = await getHistoryRecords({
          userId,
          sessionId: input.sessionId,
          taskType: input.taskType,
          status: input.status,
          limit: input.limit,
          offset: input.offset,
        });
        return records;
      }),

    // 獲取單個歷史記錄
    get: publicProcedure
      .input(z.object({ taskId: z.string() }))
      .query(async ({ input }) => {
        const record = await getHistoryByTaskId(input.taskId);
        return record;
      }),

    // 創建歷史記錄
    create: publicProcedure
      .input(z.object({
        videoPercent: z.number().default(100), // 視頻比例
        imagePercent: z.number().default(0), // 圖片比例
        imageDuration: z.string().default("3s"), // 圖片顯示時長
        subtitleEnabled: z.boolean().default(true), // 是否啟用字幕
        subtitleMode: z.enum(["auto", "manual", "none"]).default("auto"), // 字幕模式
        subtitleFont: z.string().default("noto-sans-tc"), // 字幕字體
        sessionId: z.string().optional(),
        taskType: z.enum(["video", "image", "audio", "voice_clone"]),
        title: z.string().optional(),
        inputParams: z.record(z.any()).optional(),
        modelsUsed: z.object({
          llm: z.string().optional(),
          video: z.string().optional(),
          image: z.string().optional(),
          tts: z.string().optional(),
          voiceClone: z.string().optional(),
        }).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user?.id;
        const record = await createHistoryRecord({
          userId,
          sessionId: input.sessionId,
          taskType: input.taskType,
          title: input.title,
          inputParams: input.inputParams as any,
          modelsUsed: input.modelsUsed,
        });
        return record;
      }),

    // 更新歷史記錄狀態
    update: publicProcedure
      .input(z.object({
        taskId: z.string(),
        status: z.enum(["pending", "processing", "completed", "failed", "cancelled"]).optional(),
        progress: z.number().min(0).max(100).optional(),
        currentStep: z.string().optional(),
        outputUrls: z.object({
          videoUrl: z.string().optional(),
          imageUrls: z.array(z.string()).optional(),
          audioUrl: z.string().optional(),
          subtitleUrl: z.string().optional(),
          rawFiles: z.array(z.string()).optional(),
        }).optional(),
        thumbnailUrl: z.string().optional(),
        duration: z.number().optional(),
        cost: z.string().optional(),
        processingTime: z.number().optional(),
        errorMessage: z.string().optional(),
        errorCode: z.string().optional(),
        metadata: z.record(z.any()).optional(),
      }))
      .mutation(async ({ input }) => {
        const { taskId, ...updates } = input;
        const success = await updateHistoryStatus(taskId, updates as any);
        return { success };
      }),

    // 刪除歷史記錄
    delete: publicProcedure
      .input(z.object({ taskId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user?.id;
        const success = await deleteHistoryRecord(input.taskId, userId);
        return { success };
      }),

    // 批量刪除歷史記錄
    deleteMultiple: publicProcedure
      .input(z.object({ taskIds: z.array(z.string()) }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user?.id;
        const deletedCount = await deleteMultipleHistoryRecords(input.taskIds, userId);
        return { deletedCount };
      }),

    // 獲取統計信息
    stats: publicProcedure
      .input(z.object({ sessionId: z.string().optional() }))
      .query(async ({ ctx, input }) => {
        const userId = ctx.user?.id;
        const stats = await getHistoryStats(userId, input.sessionId);
        return stats;
      }),

    // 生成會話 ID（用於匿名用戶）
    generateSessionId: publicProcedure.mutation(() => {
      return { sessionId: generateSessionId() };
    }),
  }),

  // ============================================
  // 克隆聲音路由
  // ============================================
  clonedVoice: router({
    // 獲取克隆聲音列表
    list: publicProcedure
      .input(z.object({
        sessionId: z.string().optional(),
        status: z.enum(["processing", "ready", "failed"]).optional(),
      }))
      .query(async ({ ctx, input }) => {
        const userId = ctx.user?.id;
        const voices = await getClonedVoices({
          userId,
          sessionId: input.sessionId,
          status: input.status,
        });
        return voices;
      }),

    // 創建克隆聲音記錄
    create: publicProcedure
      .input(z.object({
        sessionId: z.string().optional(),
        voiceId: z.string(),
        name: z.string(),
        description: z.string().optional(),
        originalAudioUrl: z.string(),
        sampleDuration: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user?.id;
        const voice = await createClonedVoice({
          userId,
          ...input,
        });
        return voice;
      }),

    // 更新克隆聲音狀態
    updateStatus: publicProcedure
      .input(z.object({
        voiceId: z.string(),
        status: z.enum(["processing", "ready", "failed"]),
        errorMessage: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const success = await updateClonedVoiceStatus(
          input.voiceId,
          input.status,
          input.errorMessage
        );
        return { success };
      }),

    // 刪除克隆聲音
    delete: publicProcedure
      .input(z.object({ voiceId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user?.id;
        const success = await deleteClonedVoice(input.voiceId, userId);
        return { success };
      }),

    // 增加使用次數
    incrementUsage: publicProcedure
      .input(z.object({ voiceId: z.string() }))
      .mutation(async ({ input }) => {
        const success = await incrementVoiceUsage(input.voiceId);
        return { success };
      }),
  }),
});

// 異步視頻生成函數
type Language = "cantonese" | "mandarin" | "english";

// 角色庫角色類型
type SelectedCharacter = {
  id: number;
  name: string;
  description: string | null;
  baseImageUrl: string | null;
  voiceActorId: string | null;
};

async function startVideoGeneration(
  taskId: number,
  input: {
    story: string;
    characterDescription?: string;
    visualStyle?: string;
    storyMode?: StoryMode;
    language?: Language;
    voiceActorId?: string;
    selectedCharacters?: SelectedCharacter[]; // 角色庫角色
  },
  videoModel: VideoModel,
  llmModel: string,
  mjMode: string,
  storyMode: StoryMode = "character",
  language: Language = "cantonese",
  voiceActorId: string = "cantonese-male-narrator"
) {
  // 使用內存存儲，不需要數據庫
  const db = null;

  try {
    // 更新狀態：分析中
    await updateTaskStatus(db, taskId, "analyzing", 5, "正在分析故事...");

    // 1. 分析故事
    const { scenes, characterPrompt } = await analyzeStory(
      input.story,
      input.characterDescription || null,
      input.visualStyle || null,
      llmModel,
      language
    );

    memoryStore.updateVideoTask(taskId, {
      scenes: scenes,
      progress: 10,
    });

    // 2. 根據故事模式決定是否生成角色基礎圖片
    // 支持多角色：建立角色名稱到基礎圖的映射
    let characterImageUrl: string | null = null;
    let characterImageMap: Record<string, string> = {}; // 角色名稱 -> 基礎圖 URL
    
    // 如果有選擇角色庫角色，使用角色庫的基礎圖
    if (input.selectedCharacters && input.selectedCharacters.length > 0) {
      await updateTaskStatus(db, taskId, "generating_images", 15, "正在載入角色庫角色...");
      
      for (const char of input.selectedCharacters) {
        if (char.baseImageUrl) {
          characterImageMap[char.name] = char.baseImageUrl;
          // 使用第一個角色作為主角色
          if (!characterImageUrl) {
            characterImageUrl = char.baseImageUrl;
          }
        }
      }
      
      console.log(`[任務 ${taskId}] 已載入 ${Object.keys(characterImageMap).length} 個角色庫角色`);
      
      memoryStore.updateVideoTask(taskId, { progress: 25 });
    } else if (shouldGenerateCharacterBase(storyMode)) {
      // 固定人物模式：生成角色基礎圖片
      await updateTaskStatus(db, taskId, "generating_images", 15, "正在生成角色圖片...");
      
      characterImageUrl = await generateCharacterImage(characterPrompt, mjMode);
      
      memoryStore.updateVideoTask(taskId, { progress: 25 });
    } else {
      // 劇情模式：跳過角色圖片生成
      memoryStore.updateVideoTask(taskId, { progress: 25 });
    }

    // 3. 為每個場景生成圖片和視頻
    const updatedScenes: SceneData[] = [...scenes];
    const progressPerScene = 60 / scenes.length;

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const baseProgress = 25 + (i * progressPerScene);

      // 生成場景圖片
      await updateTaskStatus(db, taskId, "generating_images", baseProgress, `正在生成場景 ${i + 1} 圖片...`);
      
      try {
        const imageUrl = await generateSceneImage(scene.imagePrompt, characterImageUrl, mjMode, storyMode);
        updatedScenes[i] = { ...scene, imageUrl, status: "generating" };
        
        memoryStore.updateVideoTask(taskId, { scenes: updatedScenes, progress: baseProgress + progressPerScene * 0.3 });

        // 生成視頻
        await updateTaskStatus(db, taskId, "generating_videos", baseProgress + progressPerScene * 0.3, `正在生成場景 ${i + 1} 視頻...`);
        
        const videoUrl = await generateVideo(imageUrl, scene.description, videoModel);
        updatedScenes[i] = { ...updatedScenes[i], videoUrl, status: "completed" };

        memoryStore.updateVideoTask(taskId, { scenes: updatedScenes, progress: baseProgress + progressPerScene * 0.7 });

      } catch (error) {
        updatedScenes[i] = { ...scene, status: "failed" };
        console.error(`場景 ${i + 1} 生成失敗:`, error);
      }
    }

    // 4. 生成語音
    await updateTaskStatus(db, taskId, "generating_audio", 85, "正在生成語音旁白...");
    
    for (let i = 0; i < updatedScenes.length; i++) {
      if (updatedScenes[i].status === "completed") {
        try {
          const audioUrl = await generateSpeech(updatedScenes[i].narration, voiceActorId, language);
          updatedScenes[i] = { ...updatedScenes[i], audioUrl };
        } catch (error) {
          console.error(`場景 ${i + 1} 語音生成失敗:`, error);
        }
      }
    }

    memoryStore.updateVideoTask(taskId, { scenes: updatedScenes, progress: 95 });

    // 5. 完成（這裡可以添加視頻合併邏輯）
    const completedScenes = updatedScenes.filter(s => s.status === "completed" && s.videoUrl);
    const finalVideoUrl = completedScenes.length > 0 ? completedScenes[0].videoUrl : null;

    memoryStore.updateVideoTask(taskId, {
      status: "completed",
      progress: 100,
      finalVideoUrl,
    });

    // 發送 Owner 通知
    try {
      await notifyOwner({
        title: "🎉 視頻生成完成",
        content: `任務 #${taskId} 已完成\n場景數: ${completedScenes.length}\n視頻連結: ${finalVideoUrl || '無'}`,
      });
    } catch (e) {
      console.warn("發送通知失敗:", e);
    }

  } catch (error) {
    console.error("視頻生成失敗:", error);
    
    memoryStore.updateVideoTask(taskId, {
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "未知錯誤",
    });
  }
}

async function updateTaskStatus(
  db: any, // 可以是數據庫或 null
  taskId: number,
  status: VideoTask["status"],
  progress: number,
  currentStep: string
) {
  // 使用內存存儲
  memoryStore.updateVideoTask(taskId, { status, progress });
}

// 批量任務處理函數
async function processBatchJob(
  jobId: string,
  userId: number,
  speedMode: "fast" | "quality",
  storyMode: StoryMode
) {
  const job = getBatchJob(jobId);
  if (!job) return;

  const db = await getDb();
  if (!db) return;

  const concurrency = calculateMaxConcurrency(job.tasks.length);
  
  // 分批處理任務
  for (let i = 0; i < job.tasks.length; i += concurrency) {
    const batch = job.tasks.slice(i, i + concurrency);
    
    // 並行處理這一批任務
    await Promise.all(batch.map(async (task) => {
      try {
        updateBatchTask(jobId, task.id, { status: "processing", progress: 5 });

        // 創建數據庫任務
        const preset = MODE_PRESETS[speedMode];
        const result = await db.insert(videoTasks).values({
          userId,
          mode: speedMode,
          storyMode,
          videoModel: preset.video,
          llmModel: preset.llm,
          story: task.story,
          characterDescription: task.characterDescription || null,
          visualStyle: task.visualStyle || null,
          status: "pending",
          progress: 0,
        });
        const dbTaskId = Number(result[0].insertId);

        updateBatchTask(jobId, task.id, { 
          progress: 10,
          result: { taskId: dbTaskId }
        });

        // 執行視頻生成
        await startVideoGeneration(
          dbTaskId,
          {
            story: task.story,
            characterDescription: task.characterDescription,
            visualStyle: task.visualStyle,
            storyMode,
          },
          preset.video as VideoModel,
          preset.llm,
          preset.mjMode as "fast" | "default",
          storyMode
        );

        // 獲取最終結果
        const [finalTask] = await db.select().from(videoTasks)
          .where(eq(videoTasks.id, dbTaskId))
          .limit(1);

        if (finalTask?.status === "completed") {
          updateBatchTask(jobId, task.id, {
            status: "completed",
            progress: 100,
            result: {
              taskId: dbTaskId,
              videoUrl: finalTask.finalVideoUrl || undefined,
            },
          });
        } else {
          updateBatchTask(jobId, task.id, {
            status: "failed",
            progress: 100,
            error: finalTask?.errorMessage || "生成失敗",
          });
        }
      } catch (error) {
        console.error(`批量任務 ${task.id} 失敗:`, error);
        updateBatchTask(jobId, task.id, {
          status: "failed",
          progress: 100,
          error: error instanceof Error ? error.message : "未知錯誤",
        });
      }
    }));
  }
}

// 異步處理角色照片（分析 + 生成基礎圖）
async function processCharacterPhoto(characterId: number, photoUrl: string) {
  const db = await getDb();
  if (!db) return;

  try {
    // 更新狀態為分析中
    await db.update(characters)
      .set({ status: "analyzing" })
      .where(eq(characters.id, characterId));

    // 使用 Claude 4.5 分析照片
    console.log(`[Character ${characterId}] 開始分析照片...`);
    const analysis = await analyzeCharacterPhoto(photoUrl);
    console.log(`[Character ${characterId}] 分析完成:`, analysis);

    // 更新分析結果
    await db.update(characters)
      .set({ 
        status: "generating",
        aiAnalysis: analysis,
      })
      .where(eq(characters.id, characterId));

    // 使用 Midjourney 生成角色基礎圖
    console.log(`[Character ${characterId}] 開始生成角色基礎圖...`);
    const baseImageUrl = await generateCharacterBaseImage(analysis.mjPrompt, photoUrl);
    console.log(`[Character ${characterId}] 基礎圖生成完成: ${baseImageUrl}`);

    // 更新最終狀態
    await db.update(characters)
      .set({ 
        status: "ready",
        baseImageUrl,
      })
      .where(eq(characters.id, characterId));

    console.log(`[Character ${characterId}] 處理完成!`);
  } catch (error) {
    console.error(`[Character ${characterId}] 處理失敗:`, error);
    await db.update(characters)
      .set({ 
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "未知錯誤",
      })
      .where(eq(characters.id, characterId));
  }
}

/**
 * 處理長視頻生成任務
 * 按批次順序生成，每批 6 個片段，輪換使用 API Key 組
 */
async function processLongVideoTask(taskId: string): Promise<void> {
  const task = getLongVideoTask(taskId);
  if (!task) {
    console.error(`[LongVideo ${taskId}] 任務不存在`);
    return;
  }

  console.log(`[LongVideo ${taskId}] 開始處理，總片段: ${task.totalSegments}，總批次: ${task.totalBatches}`);

  try {
    // 更新狀態為分析中
    updateLongVideoTask(taskId, { status: "analyzing" });

    // 分析故事，生成每個片段的提示詞和旁白
    console.log(`[LongVideo ${taskId}] 分析故事中...`);
    
    // 調用 LLM 分析故事
    const analysisResult = await analyzeStory(
      task.story,
      task.characterDescription || null,
      task.visualStyle || null,
      task.llmModel,
      (task.language || 'cantonese') as any
    );
    
    console.log(`[LongVideo ${taskId}] 故事分析完成，生成 ${analysisResult.scenes.length} 個場景`);
    
    // 為每個片段分配旁白和提示詞
    const sceneIndex = new Map<number, any>();
    analysisResult.scenes.forEach((scene, idx) => {
      sceneIndex.set(idx, scene);
    });
    
    // 更新任務的場景數據
    updateLongVideoTask(taskId, { 
      scenes: analysisResult.scenes.map((scene, idx) => ({
        id: idx + 1,
        description: scene.description,
        narrationSegments: scene.narrationSegments,
        imagePrompt: scene.imagePrompt,
        status: 'pending' as const
      }))
    });

    // 更新狀態為生成中
    updateLongVideoTask(taskId, { status: "generating" });

    // 按批次處理
    let batch = startNextBatch(taskId);
    while (batch) {
      console.log(`[LongVideo ${taskId}] 開始處理第 ${batch.index + 1} 批，使用 API Key 組 ${batch.apiKeyGroupIndex + 1}`);
      
      // 獲取此批次使用的 API Key
      const apiKey = getBatchApiKey(batch);
      console.log(`[LongVideo ${taskId}] 批次 ${batch.index + 1} 使用 API Key: ${apiKey.substring(0, 10)}...`);

      // 計算視頻和圖片的片段分配
      const videoPercent = task.videoPercent ?? 100;
      const imagePercent = task.imagePercent ?? 0;
      const totalSegments = task.totalSegments;
      const videoSegmentCount = Math.round(totalSegments * (videoPercent / 100));
      const imageSegmentCount = totalSegments - videoSegmentCount;
      
      // 計算交替間隔：每隔幾個片段插入一個圖片
      // 例如: 50% 視頻 50% 圖片 = 每 2 個片段中 1 個是圖片 (交替出現)
      const videoRatio = videoPercent / 100;
      
      // 生成交替序列：根據比例決定每個片段是視頻還是圖片
      const getMediaTypeForSegment = (segmentId: number): boolean => {
        if (videoPercent >= 100) return true; // 100% 視頻
        if (videoPercent <= 0) return false; // 0% 視頻 (全圖片)
        
        // 交替分配算法：使用比例計算每個位置應該是視頻還是圖片
        // 例如 50% 視頻: 片段 1(視頻), 2(圖片), 3(視頻), 4(圖片)...
        // 例如 70% 視頻: 片段 1(視頻), 2(視頻), 3(圖片), 4(視頻), 5(視頻), 6(圖片)...
        const expectedVideoCount = Math.round(segmentId * videoRatio);
        const previousExpectedVideoCount = Math.round((segmentId - 1) * videoRatio);
        return expectedVideoCount > previousExpectedVideoCount;
      };
      
      console.log(`[LongVideo ${taskId}] 媒體分配: 視頻 ${videoPercent}% (${videoSegmentCount}片段), 圖片 ${imagePercent}% (${imageSegmentCount}片段) - 交替模式`);
      
      // 處理批次中的每個片段
      for (const segment of batch.segments) {
        try {
          // 根據交替算法決定是生成視頻還是圖片
          const isVideoSegment = getMediaTypeForSegment(segment.id);
          const mediaType = isVideoSegment ? '視頻' : '圖片';
          
          console.log(`[LongVideo ${taskId}] 生成片段 ${segment.id}/${task.totalSegments} (類型: ${mediaType})`);
          
          // 實際生成視頻片段
          const sceneData = analysisResult.scenes[Math.min(segment.id - 1, analysisResult.scenes.length - 1)];
          
          try {
            // 1. 生成場景圖片 (參數: prompt, characterImageUrl, speedMode, storyMode)
            const imageUrl = await generateSceneImage(
              sceneData?.imagePrompt || `Scene ${segment.id}`,
              null, // characterImageUrl - 長視頻模式不使用固定人物
              task.speedMode || 'fast',
              task.storyMode || 'scene'
            );
            
            let videoUrl: string;
            
            if (isVideoSegment) {
              // 2a. 生成視頻 (參數順序: imageUrl, prompt, videoModel)
              videoUrl = await generateVideo(
                imageUrl,
                sceneData?.description || `Video scene ${segment.id}`,
                task.videoModel as any
              );
            } else {
              // 2b. 📷 圖片模式：將 1 個場景拆分為 3 張圖片
              console.log(`[LongVideo ${taskId}] 片段 ${segment.id} 使用圖片模式，正在生成 3 張遞進圖片...`);
              
              // 獲取旁白文字用於圖片描述拆分
              let narrationForSplit = `Scene ${segment.id}`;
              if (sceneData?.narrationSegments && Array.isArray(sceneData.narrationSegments)) {
                narrationForSplit = sceneData.narrationSegments.map((seg: any) => seg.text).join(' ');
              } else if (sceneData?.narration) {
                narrationForSplit = sceneData.narration;
              }
              
              try {
                // 使用新的多圖片生成功能
                const { generateMultiImageSegment } = await import("./videoService");
                const { isImageUrl } = await import("./videoMergeService");
                
                const imageDurationPerImage = 8 / 3; // 每張圖片約 2.67 秒
                const result = await generateMultiImageSegment(
                  sceneData?.description || `Scene ${segment.id}`,
                  narrationForSplit,
                  task.llmModel || 'gpt-4o-mini',
                  imageDurationPerImage
                );
                
                videoUrl = result.videoUrl;
                console.log(`[LongVideo ${taskId}] 片段 ${segment.id} 多圖片生成成功，共 ${result.imageUrls.length} 張圖片`);
                
                // 如果結果仍是圖片，嘗試轉換
                if (isImageUrl(videoUrl)) {
                  const { generateStillVideoFromImage } = await import("./videoMergeService");
                  const convertedUrl = await generateStillVideoFromImage(videoUrl, 8);
                  if (!isImageUrl(convertedUrl)) {
                    videoUrl = convertedUrl;
                  }
                }
              } catch (multiImageError) {
                console.error(`[LongVideo ${taskId}] 多圖片生成失敗，回退到單圖片模式:`, multiImageError);
                
                // 回退到原始的單圖片模式
                const { generateStillVideoFromImage, isImageUrl } = await import("./videoMergeService");
                const imageDurationSec = Number(task.imageDuration ?? 3);
                
                if (isImageUrl(imageUrl)) {
                  const convertedVideoUrl = await generateStillVideoFromImage(imageUrl, imageDurationSec);
                  if (convertedVideoUrl && !isImageUrl(convertedVideoUrl)) {
                    videoUrl = convertedVideoUrl;
                  } else {
                    videoUrl = imageUrl;
                  }
                } else {
                  videoUrl = imageUrl;
                }
              }
            }
            
            // 3. 生成語音旁白
            // 從 narrationSegments 中提取旁白文字（LLM 返回的是 narrationSegments 陣列，不是單一 narration 字段）
            let narrationText = `Scene ${segment.id} narration`;
            if (sceneData?.narrationSegments && Array.isArray(sceneData.narrationSegments)) {
              // 將所有旁白片段合併成一個完整的旁白
              narrationText = sceneData.narrationSegments.map((seg: any) => seg.text).join(' ');
              console.log(`[LongVideo ${taskId}] 片段 ${segment.id} 旁白文字: ${narrationText.substring(0, 100)}...`);
            } else if (sceneData?.narration) {
              // 備用：如果有單一 narration 字段
              narrationText = sceneData.narration;
            }
            
            // ✅ 新增：強制截斷旁白，確保旁白時長不超過影片時長
            // 8 秒影片 × 2 字/秒 = 16 字上限
            const originalLength = narrationText.length;
            narrationText = truncateNarration(narrationText, task.language || 'cantonese', 16);
            if (narrationText.length < originalLength) {
              console.log(`[LongVideo ${taskId}] ✅ 片段 ${segment.id} 旁白已截斷: ${originalLength} -> ${narrationText.length} 字`);
            }
            
            const voiceActorId = task.voiceActorId || 'default';
            let audioUrl = "";
            
            // 🔍 步驟 1：記錄 TTS 調用參數
            console.log(`[LongVideo ${taskId}] 🎤 開始生成片段 ${segment.id} 的音頻`, {
              narrationLength: narrationText.length,
              narrationPreview: narrationText.substring(0, 30) + '...',
              voiceActorId,
              language: task.language || 'cantonese',
            });
            
            try {
              // 🔍 步驟 2：調用 TTS 服務
              console.log(`[LongVideo ${taskId}] 調用 generateSpeech...`);
              audioUrl = await generateSpeech(
                narrationText,
                voiceActorId,
                (task.language || 'cantonese') as any
              );
              
              // 🔍 步驟 3：驗證返回的 URL
              console.log(`[LongVideo ${taskId}] generateSpeech 返回:`, {
                audioUrl: audioUrl?.substring(0, 80),
                isValid: Boolean(audioUrl && audioUrl.startsWith("http")),
              });
              
              // ✅ 驗證音頻 URL
              if (!audioUrl || !audioUrl.startsWith("http")) {
                console.error(`[LongVideo ${taskId}] ❌ 片段 ${segment.id} 音頻 URL 無效: "${audioUrl}"`);
                audioUrl = "";
              } else {
                console.log(`[LongVideo ${taskId}] ✅ 片段 ${segment.id} 音頻生成成功: ${audioUrl.substring(0, 60)}...`);
              }
            } catch (audioError: any) {
              // 🔍 步驟 4：詳細記錄錯誤
              console.error(`[LongVideo ${taskId}] ❌ 片段 ${segment.id} 音頻生成失敗:`, {
                message: audioError.message,
                stack: audioError.stack?.substring(0, 300),
                code: audioError.code,
                statusCode: audioError.statusCode,
              });
              // 不拋出錯誤，繼續處理（允許沒有旁白的視頻）
              audioUrl = "";
            }
            
            // 🔍 步驟 5：保存前驗證
            console.log(`[LongVideo ${taskId}] 準備保存片段 ${segment.id}:`, {
              hasVideoUrl: Boolean(videoUrl),
              hasAudioUrl: Boolean(audioUrl),
              videoUrl: videoUrl?.substring(0, 50),
              audioUrl: audioUrl?.substring(0, 50) || '(空)',
            });
            
            // 更新片段狀態（使用實際生成的 URL）
            updateSegment(taskId, segment.id, {
              status: "completed",
              progress: 100,
              videoUrl: videoUrl,
              audioUrl: audioUrl,
              narration: narrationText,
              prompt: sceneData?.description,
            });
            
            // 🔍 步驟 6：保存後驗證
            const updatedTask = getLongVideoTask(taskId);
            const updatedSegment = updatedTask?.segments.find(s => s.id === segment.id);
            console.log(`[LongVideo ${taskId}] 🔍 保存後驗證片段 ${segment.id}:`, {
              status: updatedSegment?.status,
              hasVideoUrl: Boolean(updatedSegment?.videoUrl),
              hasAudioUrl: Boolean(updatedSegment?.audioUrl),
              audioUrl: updatedSegment?.audioUrl?.substring(0, 50) || '(空)',
            });
            
            // 🚨 如果音頻保存失敗，發出警告
            if (audioUrl && !updatedSegment?.audioUrl) {
              console.error(`[LongVideo ${taskId}] 🚨 嚴重錯誤：audioUrl 保存失敗！`);
              console.error(`  生成的 audioUrl: ${audioUrl}`);
              console.error(`  保存後的 audioUrl: ${updatedSegment?.audioUrl || '(空)'}`);
            }
            
            console.log(`[LongVideo ${taskId}] 片段 ${segment.id} 生成完成 (類型: ${mediaType})`);
          } catch (error) {
            console.error(`[LongVideo ${taskId}] 片段 ${segment.id} 生成失敗:`, error);
            throw error;
          }
        } catch (error) {
          console.error(`[LongVideo ${taskId}] 片段 ${segment.id} 生成失敗:`, error);
          updateSegment(taskId, segment.id, {
            status: "failed",
            error: error instanceof Error ? error.message : "未知錯誤",
          });
        }
      }

      // 批次間等待，讓 API Key 組休息
      console.log(`[LongVideo ${taskId}] 批次 ${batch.index + 1} 完成，等待 5 秒後處理下一批...`);
      await sleep(5000);

      // 獲取下一批
      batch = startNextBatch(taskId);
    }

    // 檢查是否完成
    if (isTaskCompleted(taskId)) {
      const finalTask = getLongVideoTask(taskId);
      if (finalTask) {
        const failedCount = finalTask.segments.filter(s => s.status === "failed").length;
        if (failedCount === finalTask.totalSegments) {
          updateLongVideoTask(taskId, {
            status: "failed",
            error: "所有片段生成失敗",
          });
        } else {
          // 合併所有片段為最終視頻
          try {
            const finalTask = getLongVideoTask(taskId);
            if (finalTask) {
              const completedSegments = finalTask.segments
                .filter(seg => seg.status === 'completed' && seg.videoUrl)
                .sort((a, b) => a.id - b.id);
              
              if (completedSegments.length > 0) {
                // 🔧 完整診斷報告
                console.log(`\n========== 🔍 合併診斷報告 [${taskId}] ==========`);
                console.log(`任務 ID: ${taskId}`);
                console.log(`片段總數: ${finalTask.segments.length}`);
                console.log(`完成片段: ${completedSegments.length}`);
                
                // 顯示所有片段狀態
                console.log(`\n📋 所有片段狀態:`);
                finalTask.segments.forEach((seg, i) => {
                  console.log(`  片段 ${i + 1}: status=${seg.status}, hasVideo=${Boolean(seg.videoUrl)}, hasAudio=${Boolean(seg.audioUrl)}`);
                });
                
                // 診斷統計
                const diagnostics = {
                  hasVideo: 0,
                  hasAudio: 0,
                  hasNarration: 0,
                  issues: [] as string[],
                };
                
                completedSegments.forEach((seg, i) => {
                  if (seg.videoUrl) diagnostics.hasVideo++;
                  if (seg.audioUrl) diagnostics.hasAudio++;
                  if (seg.narration) diagnostics.hasNarration++;
                  
                  if (!seg.audioUrl && seg.narration) {
                    diagnostics.issues.push(`片段 ${i + 1}: 有旁白文字但無音頻 URL`);
                  }
                  
                  console.log(`\n🎬 片段 ${i + 1}/${completedSegments.length} 詳情:`, {
                    id: seg.id,
                    status: seg.status,
                    videoUrl: seg.videoUrl ? seg.videoUrl.substring(0, 60) + '...' : '(空)',
                    audioUrl: seg.audioUrl ? seg.audioUrl.substring(0, 60) + '...' : '(空)',
                    narration: seg.narration ? seg.narration.substring(0, 40) + '...' : '(空)',
                  });
                });
                
                console.log(`\n📊 統計結果:`);
                console.log(`  ✅ 視頻 URL: ${diagnostics.hasVideo}/${completedSegments.length}`);
                console.log(`  🎤 音頻 URL: ${diagnostics.hasAudio}/${completedSegments.length}`);
                console.log(`  📝 旁白文字: ${diagnostics.hasNarration}/${completedSegments.length}`);
                
                if (diagnostics.issues.length > 0) {
                  console.warn(`\n⚠️ 發現問題:`);
                  diagnostics.issues.forEach(issue => console.warn(`  - ${issue}`));
                }
                
                console.log(`\n🎵 BGM 類型: ${task.bgmType || 'none'}`);
                console.log(`📝 字幕樣式: ${task.subtitleStyle || 'none'}`);
                
                // 如果沒有音頻但有旁白，發出嚴重警告
                if (diagnostics.hasAudio === 0 && diagnostics.hasNarration > 0) {
                  console.error(`\n❌ 嚴重警告：所有片段都缺少音頻 URL！`);
                  console.error(`   這將導致合併後的視頻沒有旁白聲音。`);
                  console.error(`   請檢查 TTS 服務和 audioUrl 保存邏輯。`);
                }
                
                console.log(`\n========================================\n`);
                
                // 合併視頻
                const audioUrls = completedSegments.map(seg => seg.audioUrl || '');
                
                // 🔍 記錄合併前的片段 URL
                const segmentVideoUrls = completedSegments.map(seg => seg.videoUrl!);
                console.log(`\n[Merge] 🎬 合併前片段 URL:`);
                segmentVideoUrls.forEach((url, i) => {
                  console.log(`  片段 ${i + 1}: ${url?.substring(0, 80)}...`);
                });
                console.log(`[Merge] 🎤 合併前音頻 URL:`);
                audioUrls.forEach((url, i) => {
                  console.log(`  音頻 ${i + 1}: ${url ? url.substring(0, 80) + '...' : '(空)'}`);
                });
                
                const mergeResult = await mergeVideos({
                  videoUrls: completedSegments.map(seg => seg.videoUrl!),
                  audioUrls: audioUrls,
                  narrations: completedSegments.map(seg => seg.narration || ''),
                  bgmType: (task.bgmType || 'none') as any,
                  subtitleStyle: (task.subtitleStyle || 'none') as any,
                });
                
                // 關鍵結案日誌：打印合併結果結構
                console.log(`[VideoMerge][Result]`, {
                  success: mergeResult.success,
                  mode: mergeResult.mode,
                  hasVideoUrl: Boolean(mergeResult.videoUrl),
                  segmentCount: mergeResult.segmentUrls?.length ?? 0,
                  error: mergeResult.error?.slice(0, 120),
                });
                
                // 🔍 合併結果 URL 驗證
                console.log(`\n========== 📹 合併結果驗證 ==========`);
                console.log(`合併成功: ${mergeResult.success}`);
                console.log(`合併模式: ${mergeResult.mode}`);
                console.log(`返回的 videoUrl: ${mergeResult.videoUrl?.substring(0, 80) || '(空)'}`);                
                
                // 對比驗證：確保合併後的 URL 不等於任何一個片段 URL
                const isSegmentUrl = segmentVideoUrls.some(segUrl => segUrl === mergeResult.videoUrl);
                if (isSegmentUrl) {
                  console.error(`🚨 嚴重錯誤：合併後返回的是片段 URL，而不是新的合併 URL！`);
                  console.error(`  這意味著合併失敗，但錯誤地返回了原始片段。`);
                }
                
                // 檢查 URL 是否是新生成的（通過時間戳）
                if (mergeResult.videoUrl) {
                  const urlTimestamp = mergeResult.videoUrl.match(/(\d{13})/)?.[0];
                  const currentTimestamp = Date.now();
                  const urlAge = urlTimestamp ? currentTimestamp - parseInt(urlTimestamp) : null;
                  
                  console.log(`URL 時間戳: ${urlTimestamp || '(找不到)'}`);                  
                  if (urlAge !== null) {
                    console.log(`URL 年齡: ${Math.floor(urlAge / 1000)}秒前`);
                    if (urlAge > 300000) { // 超過 5 分鐘
                      console.warn(`⚠️ 警告：返回的 URL 似乎是舊的！(${Math.floor(urlAge / 60000)}分鐘前)`);
                    }
                  }
                }
                
                console.log(`\n片段 URL 列表:`);
                segmentVideoUrls.forEach((url, i) => {
                  console.log(`  片段 ${i + 1}: ${url?.substring(0, 60)}...`);
                });
                console.log(`合併後 URL: ${mergeResult.videoUrl?.substring(0, 60) || '(空)'}...`);
                console.log(`========================================\n`);
                
                // 重要修復：只有合併成功時才使用 mergedUrl，否則不設置 finalVideoUrl
                // 不要用第一個片段的 URL 假裝成合併後的視頻
                const finalVideoUrl = mergeResult.success ? mergeResult.videoUrl : undefined;
                const mergeStatus = mergeResult.success ? "completed" : "merge_failed";
                
                console.log(`[LongVideo ${taskId}] 視頻合併${mergeResult.success ? '成功' : '失敗'}: ${finalVideoUrl || '(無合併視頻)'}`);
                console.log(`[LongVideo ${taskId}] 片段 URLs: ${completedSegments.map(s => s.videoUrl?.slice(0, 50)).join(', ')}`);
                
                updateLongVideoTask(taskId, {
                  status: mergeStatus as any,
                  completedAt: new Date(),
                  finalVideoUrl,
                  // 新增：即使合併失敗也保存片段 URLs
                  segmentUrls: completedSegments.map(s => s.videoUrl!),
                });
                // 更新歷史記錄
                await updateHistoryStatus(taskId, {
                  status: mergeResult.success ? "completed" : "merge_failed",
                  progress: 100,
                  outputUrls: {
                    finalVideoUrl,
                    mergeSuccess: mergeResult.success,
                    mergeMode: mergeResult.mode,
                    mergeError: mergeResult.error,
                    segments: completedSegments.map(s => ({
                      id: s.id,
                      videoUrl: s.videoUrl,
                      audioUrl: s.audioUrl,
                      narration: s.narration,
                    })),
                  },
                });
              } else {
                updateLongVideoTask(taskId, {
                  status: "completed",
                  completedAt: new Date(),
                  finalVideoUrl: undefined,
                });
                // 更新歷史記錄
                await updateHistoryStatus(taskId, {
                  status: "completed",
                  progress: 100,
                });
              }
            }
          } catch (error) {
            console.error(`[LongVideo ${taskId}] 視頻合併失敗:`, error);
            // 即使合併失敗也標記為完成
            updateLongVideoTask(taskId, {
              status: "completed",
              completedAt: new Date(),
            });
            // 更新歷史記錄
            await updateHistoryStatus(taskId, {
              status: "completed",
              progress: 100,
            });
          }
        }
      }
    }

    console.log(`[LongVideo ${taskId}] 處理完成!`);
  } catch (error) {
    console.error(`[LongVideo ${taskId}] 處理失敗:`, error);
    updateLongVideoTask(taskId, {
      status: "failed",
      error: error instanceof Error ? error.message : "未知錯誤",
    });
    // 更新歷史記錄
    await updateHistoryStatus(taskId, {
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "未知錯誤",
    });
  }
}

export type AppRouter = typeof appRouter;
