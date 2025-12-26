import { useState, useEffect, useRef } from "react";
import { useLocation, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  ArrowLeft,
  Video,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Play,
  RefreshCw,
  Download,
  Edit,
  Volume2
} from "lucide-react";
import { SegmentListPreview, type SegmentData, type VoiceActorData } from "@/components/SegmentListPreview";

export default function TaskProgress() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/task/:taskId");
  const taskId = params?.taskId ? parseInt(params.taskId) : null;
  
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // 獲取任務狀態
  const { data: taskStatus, refetch: refetchStatus } = trpc.video.getStatus.useQuery(
    { taskId: taskId! },
    { enabled: !!taskId }
  );

  // 獲取配音員列表
  const { data: voiceData } = trpc.voice.getAll.useQuery();
  const allVoiceActors = voiceData?.voiceActors || [];

  // 輪詢任務狀態
  useEffect(() => {
    if (taskId && taskStatus?.status !== "completed" && taskStatus?.status !== "failed") {
      pollingRef.current = setInterval(() => {
        refetchStatus();
      }, 3000);
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [taskId, taskStatus?.status, refetchStatus]);

  // 將任務片段轉換為 SegmentData 格式
  const convertToSegmentData = (): SegmentData[] => {
    // 如果沒有任務狀態，返回空數組
    if (!taskStatus) return [];
    
    // 嘗試從 taskStatus 獲取片段數據
    const segments = (taskStatus as any).segments || [];
    if (segments.length === 0) return [];
    
    return segments.map((segment: any, index: number) => ({
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

  const segments = convertToSegmentData();
  const completedCount = segments.filter(s => s.status === "completed").length;
  const failedCount = segments.filter(s => s.status === "failed").length;
  const generatingCount = segments.filter(s => s.status === "generating").length;
  const totalProgress = segments.length > 0 
    ? Math.round((completedCount / segments.length) * 100)
    : 0;

  if (!taskId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center">
        <Card className="bg-gray-800/50 border-gray-700">
          <CardContent className="p-6 text-center">
            <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <p className="text-white">無效的任務 ID</p>
            <Button 
              className="mt-4"
              onClick={() => navigate("/")}
            >
              返回首頁
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

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
                <Video className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">任務進度</h1>
                <p className="text-sm text-gray-400">任務 #{taskId}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge 
              variant={
                taskStatus?.status === "completed" ? "default" :
                taskStatus?.status === "failed" ? "destructive" :
                "secondary"
              }
              className={
                taskStatus?.status === "completed" ? "bg-green-500/20 text-green-400 border-green-500/30" :
                taskStatus?.status === "failed" ? "bg-red-500/20 text-red-400 border-red-500/30" :
                "bg-blue-500/20 text-blue-400 border-blue-500/30"
              }
            >
              {taskStatus?.status === "completed" ? (
                <><CheckCircle2 className="w-3 h-3 mr-1" /> 已完成</>
              ) : taskStatus?.status === "failed" ? (
                <><XCircle className="w-3 h-3 mr-1" /> 失敗</>
              ) : (
                <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> 生成中</>
              )}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchStatus()}
              className="border-gray-700"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* 總體進度 */}
        <Card className="mb-6 bg-gray-800/50 border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-lg flex items-center justify-between">
              <span>總體進度</span>
              <span className="text-2xl font-bold text-purple-400">{totalProgress}%</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Progress value={totalProgress} className="h-3 mb-4" />
            <div className="flex gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span className="text-gray-400">已完成: {completedCount}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse"></div>
                <span className="text-gray-400">生成中: {generatingCount}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <span className="text-gray-400">失敗: {failedCount}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-gray-500"></div>
                <span className="text-gray-400">等待中: {segments.length - completedCount - failedCount - generatingCount}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 片段預覽 */}
        <Card className="bg-gray-800/50 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Play className="w-5 h-5" />
              片段詳情
            </CardTitle>
          </CardHeader>
          <CardContent>
            {segments.length > 0 ? (
              <SegmentListPreview
                segments={segments}
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
                onRegenerateVideo={(segmentId) => {
                  console.log("Regenerate video for segment:", segmentId);
                  // TODO: 實現重新生成視頻
                }}
                onRegenerateAudio={(segmentId, voiceActorId) => {
                  console.log("Regenerate audio for segment:", segmentId, "with voice:", voiceActorId);
                  // TODO: 實現重新生成音頻
                }}
                onUpdateDescription={(segmentId, description) => {
                  console.log("Update description for segment:", segmentId, description);
                  // TODO: 實現更新描述
                }}
                onUpdateNarration={(segmentId, narration) => {
                  console.log("Update narration for segment:", segmentId, narration);
                  // TODO: 實現更新旁白
                }}
              />
            ) : (
              <div className="text-center py-12 text-gray-400">
                <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>正在載入片段信息...</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 完成後的操作 */}
        {taskStatus?.status === "completed" && (
          <Card className="mt-6 bg-gray-800/50 border-gray-700">
            <CardContent className="p-6">
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button
                  className="bg-gradient-to-r from-purple-500 to-pink-500"
                  onClick={() => navigate(`/edit/${taskId}`)}
                >
                  <Edit className="w-4 h-4 mr-2" />
                  編輯視頻
                </Button>
                <Button
                  variant="outline"
                  className="border-gray-700"
                  onClick={() => {
                    // TODO: 下載合併後的視頻
                  }}
                >
                  <Download className="w-4 h-4 mr-2" />
                  下載視頻
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
