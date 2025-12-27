import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getSessionId, setSessionId } from "@/hooks/useHistory";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowLeft,
  Video,
  Clock,
  CheckCircle2,
  XCircle,
  Play,
  Download,
  Edit,
  Trash2,
  Calendar,
  Film,
  RefreshCw
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { SegmentListPreview, type SegmentData, type VoiceActorData } from "@/components/SegmentListPreview";

interface HistoryTask {
  id: number;
  title: string;
  status: "pending" | "generating" | "completed" | "failed";
  progress: number;
  createdAt: string;
  completedAt?: string;
  duration: number;
  segmentCount: number;
  thumbnailUrl?: string;
  videoUrl?: string;
  segments?: any[];
}

export default function History() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [selectedTask, setSelectedTask] = useState<HistoryTask | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<number | null>(null);
  
  // 訪客 sessionId
  const [sessionId, setLocalSessionId] = useState<string | null>(null);
  const generateSessionMutation = trpc.history.generateSessionId.useMutation();

  // 初始化 sessionId
  useEffect(() => {
    if (!user) {
      const existingSessionId = getSessionId();
      if (existingSessionId) {
        setLocalSessionId(existingSessionId);
        console.log('[History] Using existing sessionId:', existingSessionId);
      } else {
        // 生成新的會話 ID
        console.log('[History] Generating new sessionId...');
        generateSessionMutation.mutate(undefined, {
          onSuccess: (data) => {
            console.log('[History] Generated sessionId:', data.sessionId);
            setSessionId(data.sessionId);
            setLocalSessionId(data.sessionId);
          },
          onError: (error) => {
            console.error('[History] Failed to generate sessionId:', error);
          },
        });
      }
    }
  }, [user]);

  // 獲取歷史任務列表（使用數據庫持久化）
  // 登入用戶使用 userId，訪客使用 sessionId
  const { data: historyData, isLoading, refetch } = trpc.history.list.useQuery(
    { 
      limit: 50, 
      offset: 0,
      sessionId: !user ? sessionId || undefined : undefined,
    },
    {
      enabled: !!user || !!sessionId, // 登入用戶或有 sessionId 時才查詢
    }
  );

  // 獲取配音員列表
  const { data: voiceData } = trpc.voice.getAll.useQuery();
  const allVoiceActors = voiceData?.voiceActors || [];

  // 模擬歷史數據（實際應從 API 獲取）
  const mockHistory: HistoryTask[] = [
    {
      id: 1,
      title: "香港美食之旅",
      status: "completed",
      progress: 100,
      createdAt: "2024-12-22T10:30:00Z",
      completedAt: "2024-12-22T10:45:00Z",
      duration: 180,
      segmentCount: 23,
      thumbnailUrl: undefined,
      videoUrl: undefined,
    },
    {
      id: 2,
      title: "科技產品介紹",
      status: "failed",
      progress: 65,
      createdAt: "2024-12-22T09:00:00Z",
      duration: 120,
      segmentCount: 15,
    },
    {
      id: 3,
      title: "旅遊風景片",
      status: "generating",
      progress: 45,
      createdAt: "2024-12-22T11:00:00Z",
      duration: 300,
      segmentCount: 38,
    },
  ];

  // 映射數據庫記錄到前端格式
  const history = historyData?.length ? historyData.map((record: any) => {
    const outputUrls = record.outputUrls as any;
    const inputParams = record.inputParams as any;
    return {
      id: record.id,
      title: record.title || inputParams?.title || `任務 #${record.id}`,
      status: record.status === "processing" ? "generating" : record.status,
      progress: record.progress || 0,
      createdAt: record.createdAt,
      completedAt: record.completedAt,
      duration: record.duration || inputParams?.duration || 0,
      segmentCount: inputParams?.segmentCount || 0,
      thumbnailUrl: record.thumbnailUrl || outputUrls?.thumbnailUrl,
      videoUrl: outputUrls?.videoUrl || outputUrls?.finalVideoUrl,
      segments: outputUrls?.segments,
    };
  }) as HistoryTask[] : [];

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString("zh-HK", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            已完成
          </Badge>
        );
      case "failed":
        return (
          <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
            <XCircle className="w-3 h-3 mr-1" />
            失敗
          </Badge>
        );
      case "generating":
        return (
          <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
            <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
            生成中
          </Badge>
        );
      default:
        return (
          <Badge className="bg-zinc-500/20 text-zinc-400 border-zinc-500/30">
            <Clock className="w-3 h-3 mr-1" />
            等待中
          </Badge>
        );
    }
  };

  // 將任務片段轉換為 SegmentData 格式
  const convertToSegmentData = (task: HistoryTask): SegmentData[] => {
    if (!task.segments) {
      // 生成模擬片段數據
      return Array.from({ length: task.segmentCount }).map((_, index) => ({
        id: index + 1,
        batchIndex: Math.floor(index / 6),
        status: task.status === "completed" ? "completed" as const : 
               task.status === "failed" && index >= Math.floor(task.segmentCount * task.progress / 100) ? "failed" as const :
               task.status === "generating" && index < Math.floor(task.segmentCount * task.progress / 100) ? "completed" as const :
               task.status === "generating" && index === Math.floor(task.segmentCount * task.progress / 100) ? "generating" as const :
               "pending" as const,
        progress: task.status === "generating" && index === Math.floor(task.segmentCount * task.progress / 100) ? 50 : 0,
        startTime: index * 8,
        endTime: (index + 1) * 8,
      }));
    }
    
    return task.segments.map((segment: any, index: number) => ({
      id: segment.id || index + 1,
      batchIndex: Math.floor(index / 6),
      status: segment.status as "pending" | "generating" | "completed" | "failed",
      progress: segment.progress || 0,
      startTime: index * 8,
      endTime: (index + 1) * 8,
      videoUrl: segment.videoUrl,
      thumbnailUrl: segment.thumbnailUrl,
      description: segment.description,
      narration: segment.narration,
      audioUrl: segment.audioUrl,
      voiceActorId: segment.voiceActorId,
      prompt: segment.prompt,
      error: segment.error,
    }));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => navigate("/")}
              className="text-gray-400 hover:text-white"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              返回
            </Button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                <Clock className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">生成歷史</h1>
                <p className="text-sm text-gray-400">查看和管理您的視頻生成記錄</p>
              </div>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="border-gray-700"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            刷新
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {isLoading ? (
          <div className="text-center py-12">
            <RefreshCw className="w-8 h-8 animate-spin text-purple-400 mx-auto mb-4" />
            <p className="text-gray-400">載入中...</p>
          </div>
        ) : history.length === 0 ? (
          <Card className="bg-gray-800/50 border-gray-700">
            <CardContent className="py-12 text-center">
              <Film className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">暫無生成記錄</h3>
              <p className="text-gray-400 mb-4">開始創建您的第一個視頻吧！</p>
              <Button 
                className="bg-gradient-to-r from-purple-500 to-pink-500"
                onClick={() => navigate("/")}
              >
                開始創建
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {history.map((task) => (
              <Card 
                key={task.id} 
                className="bg-gray-800/50 border-gray-700 hover:border-gray-600 transition-colors"
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    {/* 縮略圖 */}
                    <div className="w-32 h-20 rounded-lg bg-gray-900 overflow-hidden flex-shrink-0">
                      {task.thumbnailUrl ? (
                        <img 
                          src={task.thumbnailUrl} 
                          alt={task.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Video className="w-8 h-8 text-gray-600" />
                        </div>
                      )}
                    </div>

                    {/* 信息 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="text-lg font-semibold text-white truncate">
                            {task.title || `任務 #${task.id}`}
                          </h3>
                          <div className="flex items-center gap-4 mt-1 text-sm text-gray-400">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {formatDate(task.createdAt)}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatDuration(task.duration)}
                            </span>
                            <span className="flex items-center gap-1">
                              <Film className="w-3 h-3" />
                              {task.segmentCount} 個片段
                            </span>
                          </div>
                        </div>
                        {getStatusBadge(task.status)}
                      </div>

                      {/* 進度條（生成中時顯示） */}
                      {task.status === "generating" && (
                        <div className="mt-3">
                          <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                            <span>生成進度</span>
                            <span>{task.progress}%</span>
                          </div>
                          <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-blue-500 rounded-full transition-all"
                              style={{ width: `${task.progress}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* 操作按鈕 */}
                      <div className="flex items-center gap-2 mt-3">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button 
                              variant="outline" 
                              size="sm"
                              className="border-gray-700"
                              onClick={() => setSelectedTask(task)}
                            >
                              <Play className="w-3 h-3 mr-1" />
                              查看詳情
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-gray-900 border-gray-700">
                            <DialogHeader>
                              <DialogTitle className="text-white">
                                {task.title || `任務 #${task.id}`}
                              </DialogTitle>
                            </DialogHeader>
                            <div className="mt-4">
                              <SegmentListPreview
                                segments={convertToSegmentData(task)}
                                voiceActors={allVoiceActors.map((actor: any) => ({
                                  id: actor.id,
                                  name: actor.name,
                                  gender: actor.gender,
                                  type: actor.type,
                                  language: actor.language,
                                  description: actor.description,
                                  sampleUrl: actor.sampleUrl,
                                }))}
                                maxHeight="none"
                              />
                            </div>
                          </DialogContent>
                        </Dialog>

                        {task.status === "completed" && (
                          <>
                            <Button 
                              variant="outline" 
                              size="sm"
                              className="border-gray-700"
                              onClick={() => navigate(`/edit/${task.id}`)}
                            >
                              <Edit className="w-3 h-3 mr-1" />
                              編輯
                            </Button>
                            {task.videoUrl && (
                              <Button 
                                variant="outline" 
                                size="sm"
                                className="border-gray-700"
                                onClick={() => window.open(task.videoUrl, "_blank")}
                              >
                                <Download className="w-3 h-3 mr-1" />
                                下載
                              </Button>
                            )}
                          </>
                        )}

                        {task.status === "generating" && (
                          <Button 
                            variant="outline" 
                            size="sm"
                            className="border-gray-700"
                            onClick={() => navigate(`/task/${task.id}`)}
                          >
                            <RefreshCw className="w-3 h-3 mr-1" />
                            查看進度
                          </Button>
                        )}

                        {task.status === "failed" && (
                          <Button 
                            variant="outline" 
                            size="sm"
                            className="border-gray-700 text-amber-400"
                            onClick={() => navigate(`/edit/${task.id}`)}
                          >
                            <RefreshCw className="w-3 h-3 mr-1" />
                            重試失敗片段
                          </Button>
                        )}

                        <Dialog open={showDeleteConfirm === task.id} onOpenChange={(open) => setShowDeleteConfirm(open ? task.id : null)}>
                          <DialogTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="bg-gray-900 border-gray-700">
                            <DialogHeader>
                              <DialogTitle className="text-white">確認刪除</DialogTitle>
                            </DialogHeader>
                            <p className="text-gray-400">
                              確定要刪除「{task.title || `任務 #${task.id}`}」嗎？此操作無法撤銷。
                            </p>
                            <DialogFooter>
                              <Button 
                                variant="outline" 
                                onClick={() => setShowDeleteConfirm(null)}
                                className="border-gray-700"
                              >
                                取消
                              </Button>
                              <Button 
                                variant="destructive"
                                onClick={() => {
                                  // TODO: 實現刪除功能
                                  setShowDeleteConfirm(null);
                                }}
                              >
                                刪除
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
