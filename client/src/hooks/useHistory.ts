/**
 * 歷史記錄 Hook - 管理用戶的生成歷史（數據庫持久化）
 */

import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";

// 會話 ID 存儲 key
const SESSION_ID_KEY = "po_studio_session_id";

// 獲取或創建會話 ID
export function getSessionId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(SESSION_ID_KEY);
}

// 設置會話 ID
export function setSessionId(sessionId: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SESSION_ID_KEY, sessionId);
}

// 歷史記錄類型
export interface HistoryRecord {
  id: number;
  taskId: string;
  taskType: "video" | "image" | "audio" | "voice_clone";
  title?: string;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  progress: number;
  currentStep?: string;
  outputUrls?: {
    videoUrl?: string;
    imageUrls?: string[];
    audioUrl?: string;
    subtitleUrl?: string;
    rawFiles?: string[];
  };
  thumbnailUrl?: string;
  duration?: number;
  cost?: string;
  processingTime?: number;
  modelsUsed?: {
    llm?: string;
    video?: string;
    image?: string;
    tts?: string;
    voiceClone?: string;
  };
  errorMessage?: string;
  errorCode?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

// 統計信息類型
export interface HistoryStats {
  total: number;
  completed: number;
  failed: number;
  processing: number;
  byType: Record<string, number>;
}

/**
 * 歷史記錄 Hook
 */
export function useHistory(options?: {
  taskType?: "video" | "image" | "audio" | "voice_clone";
  status?: string;
  limit?: number;
  autoRefresh?: boolean;
  refreshInterval?: number;
}) {
  const {
    taskType,
    status,
    limit = 20,
    autoRefresh = false,
    refreshInterval = 5000,
  } = options || {};

  const [sessionId, setLocalSessionId] = useState<string | null>(null);

  // 初始化會話 ID
  const generateSessionMutation = trpc.history.generateSessionId.useMutation();

  useEffect(() => {
    const existingSessionId = getSessionId();
    if (existingSessionId) {
      setLocalSessionId(existingSessionId);
    } else {
      // 生成新的會話 ID
      generateSessionMutation.mutate(undefined, {
        onSuccess: (data) => {
          setSessionId(data.sessionId);
          setLocalSessionId(data.sessionId);
        },
      });
    }
  }, []);

  // 獲取歷史記錄列表
  const {
    data: records,
    isLoading,
    error,
    refetch,
  } = trpc.history.list.useQuery(
    {
      sessionId: sessionId || undefined,
      taskType,
      status,
      limit,
      offset: 0,
    },
    {
      enabled: !!sessionId,
      refetchInterval: autoRefresh ? refreshInterval : false,
    }
  );

  // 獲取統計信息
  const { data: stats } = trpc.history.stats.useQuery(
    { sessionId: sessionId || undefined },
    { enabled: !!sessionId }
  );

  // 創建歷史記錄
  const createMutation = trpc.history.create.useMutation({
    onSuccess: () => refetch(),
  });

  // 更新歷史記錄
  const updateMutation = trpc.history.update.useMutation({
    onSuccess: () => refetch(),
  });

  // 刪除歷史記錄
  const deleteMutation = trpc.history.delete.useMutation({
    onSuccess: () => refetch(),
  });

  // 批量刪除
  const deleteMultipleMutation = trpc.history.deleteMultiple.useMutation({
    onSuccess: () => refetch(),
  });

  // 創建新記錄
  const createRecord = useCallback(
    async (data: {
      taskType: "video" | "image" | "audio" | "voice_clone";
      title?: string;
      inputParams?: Record<string, any>;
      modelsUsed?: {
        llm?: string;
        video?: string;
        image?: string;
        tts?: string;
        voiceClone?: string;
      };
    }) => {
      return createMutation.mutateAsync({
        sessionId: sessionId || undefined,
        ...data,
      });
    },
    [sessionId, createMutation]
  );

  // 更新記錄狀態
  const updateRecord = useCallback(
    async (
      taskId: string,
      updates: {
        status?: "pending" | "processing" | "completed" | "failed" | "cancelled";
        progress?: number;
        currentStep?: string;
        outputUrls?: {
          videoUrl?: string;
          imageUrls?: string[];
          audioUrl?: string;
          subtitleUrl?: string;
          rawFiles?: string[];
        };
        thumbnailUrl?: string;
        duration?: number;
        cost?: string;
        processingTime?: number;
        errorMessage?: string;
        errorCode?: string;
        metadata?: Record<string, any>;
      }
    ) => {
      return updateMutation.mutateAsync({
        taskId,
        ...updates,
      });
    },
    [updateMutation]
  );

  // 刪除記錄
  const deleteRecord = useCallback(
    async (taskId: string) => {
      return deleteMutation.mutateAsync({ taskId });
    },
    [deleteMutation]
  );

  // 批量刪除記錄
  const deleteRecords = useCallback(
    async (taskIds: string[]) => {
      return deleteMultipleMutation.mutateAsync({ taskIds });
    },
    [deleteMultipleMutation]
  );

  return {
    // 數據
    records: records || [],
    stats: stats || { total: 0, completed: 0, failed: 0, processing: 0, byType: {} },
    sessionId,
    
    // 狀態
    isLoading,
    error,
    
    // 操作
    createRecord,
    updateRecord,
    deleteRecord,
    deleteRecords,
    refetch,
    
    // Mutation 狀態
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending || deleteMultipleMutation.isPending,
  };
}

/**
 * 克隆聲音 Hook
 */
export function useClonedVoices(options?: {
  status?: "processing" | "ready" | "failed";
}) {
  const { status } = options || {};
  const [sessionId, setLocalSessionId] = useState<string | null>(null);

  useEffect(() => {
    const existingSessionId = getSessionId();
    if (existingSessionId) {
      setLocalSessionId(existingSessionId);
    }
  }, []);

  // 獲取克隆聲音列表
  const {
    data: voices,
    isLoading,
    error,
    refetch,
  } = trpc.clonedVoice.list.useQuery(
    {
      sessionId: sessionId || undefined,
      status,
    },
    { enabled: !!sessionId }
  );

  // 創建克隆聲音
  const createMutation = trpc.clonedVoice.create.useMutation({
    onSuccess: () => refetch(),
  });

  // 更新狀態
  const updateStatusMutation = trpc.clonedVoice.updateStatus.useMutation({
    onSuccess: () => refetch(),
  });

  // 刪除
  const deleteMutation = trpc.clonedVoice.delete.useMutation({
    onSuccess: () => refetch(),
  });

  // 增加使用次數
  const incrementUsageMutation = trpc.clonedVoice.incrementUsage.useMutation();

  // 創建克隆聲音
  const createVoice = useCallback(
    async (data: {
      voiceId: string;
      name: string;
      description?: string;
      originalAudioUrl: string;
      sampleDuration?: number;
    }) => {
      return createMutation.mutateAsync({
        sessionId: sessionId || undefined,
        ...data,
      });
    },
    [sessionId, createMutation]
  );

  // 更新狀態
  const updateVoiceStatus = useCallback(
    async (
      voiceId: string,
      status: "processing" | "ready" | "failed",
      errorMessage?: string
    ) => {
      return updateStatusMutation.mutateAsync({
        voiceId,
        status,
        errorMessage,
      });
    },
    [updateStatusMutation]
  );

  // 刪除聲音
  const deleteVoice = useCallback(
    async (voiceId: string) => {
      return deleteMutation.mutateAsync({ voiceId });
    },
    [deleteMutation]
  );

  // 增加使用次數
  const incrementUsage = useCallback(
    async (voiceId: string) => {
      return incrementUsageMutation.mutateAsync({ voiceId });
    },
    [incrementUsageMutation]
  );

  return {
    // 數據
    voices: voices || [],
    sessionId,
    
    // 狀態
    isLoading,
    error,
    
    // 操作
    createVoice,
    updateVoiceStatus,
    deleteVoice,
    incrementUsage,
    refetch,
    
    // Mutation 狀態
    isCreating: createMutation.isPending,
    isUpdating: updateStatusMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

export default useHistory;
