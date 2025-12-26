import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  ArrowLeft,
  Video,
  Save,
  Download,
  Play,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Film,
  Wand2,
  Upload
} from "lucide-react";
import { SegmentListPreview, type SegmentData, type VoiceActorData } from "@/components/SegmentListPreview";
import { useToast } from "@/hooks/use-toast";

interface VideoTask {
  id: number;
  title: string;
  status: "pending" | "generating" | "completed" | "failed";
  progress: number;
  duration: number;
  segments: any[];
  videoUrl?: string;
}

export default function VideoEdit() {
  const [, navigate] = useLocation();
  const params = useParams();
  const taskId = params.id ? parseInt(params.id) : null;
  const { toast } = useToast();
  
  const [title, setTitle] = useState("");
  const [segments, setSegments] = useState<SegmentData[]>([]);
  const [regeneratingIds, setRegeneratingIds] = useState<number[]>([]);
  const [regeneratingAudioIds, setRegeneratingAudioIds] = useState<number[]>([]);
  const [uploadingVideoIds, setUploadingVideoIds] = useState<number[]>([]);
  const [uploadingAudioIds, setUploadingAudioIds] = useState<number[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // 獲取配音員列表
  const { data: voiceData } = trpc.voice.getAll.useQuery();
  const allVoiceActors = voiceData?.voiceActors || [];

  // 模擬獲取任務數據
  useEffect(() => {
    if (taskId) {
      // TODO: 從 API 獲取任務數據
      // 模擬數據
      setTitle(`視頻任務 #${taskId}`);
      const mockSegments: SegmentData[] = Array.from({ length: 12 }).map((_, index) => ({
        id: index + 1,
        batchIndex: Math.floor(index / 6),
        status: index < 8 ? "completed" as const : index === 8 ? "failed" as const : "pending" as const,
        progress: index < 8 ? 100 : 0,
        startTime: index * 8,
        endTime: (index + 1) * 8,
        description: `場景 ${index + 1}：這是一個示例場景描述`,
        narration: `這是場景 ${index + 1} 的旁白文字，用於配音生成。`,
        videoUrl: index < 8 ? "https://example.com/video.mp4" : undefined,
        audioUrl: index < 8 ? "https://example.com/audio.mp3" : undefined,
        error: index === 8 ? "視頻生成超時，請重試" : undefined,
      }));
      setSegments(mockSegments);
    }
  }, [taskId]);

  // 重新生成整個片段
  const handleRegenerate = async (segmentId: number) => {
    setRegeneratingIds(prev => [...prev, segmentId]);
    try {
      // TODO: 調用 API 重新生成
      await new Promise(resolve => setTimeout(resolve, 2000));
      setSegments(prev => prev.map(s => 
        s.id === segmentId 
          ? { ...s, status: "completed" as const, progress: 100, error: undefined }
          : s
      ));
      toast({
        title: "重新生成成功",
        description: `片段 #${segmentId} 已重新生成`,
      });
    } catch (error) {
      toast({
        title: "重新生成失敗",
        description: "請稍後重試",
        variant: "destructive",
      });
    } finally {
      setRegeneratingIds(prev => prev.filter(id => id !== segmentId));
    }
  };

  // 重新生成視頻
  const handleRegenerateVideo = async (segmentId: number) => {
    setRegeneratingIds(prev => [...prev, segmentId]);
    try {
      await new Promise(resolve => setTimeout(resolve, 2000));
      setSegments(prev => prev.map(s => 
        s.id === segmentId 
          ? { ...s, videoUrl: "https://example.com/new-video.mp4" }
          : s
      ));
      toast({
        title: "視頻重新生成成功",
        description: `片段 #${segmentId} 的視頻已重新生成`,
      });
    } catch (error) {
      toast({
        title: "視頻重新生成失敗",
        description: "請稍後重試",
        variant: "destructive",
      });
    } finally {
      setRegeneratingIds(prev => prev.filter(id => id !== segmentId));
    }
  };

  // 重新生成音頻
  const handleRegenerateAudio = async (segmentId: number, voiceActorId: string) => {
    setRegeneratingAudioIds(prev => [...prev, segmentId]);
    try {
      await new Promise(resolve => setTimeout(resolve, 2000));
      setSegments(prev => prev.map(s => 
        s.id === segmentId 
          ? { ...s, audioUrl: "https://example.com/new-audio.mp3", voiceActorId }
          : s
      ));
      toast({
        title: "音頻生成成功",
        description: `片段 #${segmentId} 的音頻已生成`,
      });
    } catch (error) {
      toast({
        title: "音頻生成失敗",
        description: "請稍後重試",
        variant: "destructive",
      });
    } finally {
      setRegeneratingAudioIds(prev => prev.filter(id => id !== segmentId));
    }
  };

  // 更新描述
  const handleUpdateDescription = (segmentId: number, description: string) => {
    setSegments(prev => prev.map(s => 
      s.id === segmentId ? { ...s, description } : s
    ));
  };

  // 更新旁白
  const handleUpdateNarration = (segmentId: number, narration: string) => {
    setSegments(prev => prev.map(s => 
      s.id === segmentId ? { ...s, narration } : s
    ));
  };

  // AI 重新生成描述
  const handleRegenerateDescription = async (segmentId: number) => {
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      setSegments(prev => prev.map(s => 
        s.id === segmentId 
          ? { ...s, description: `AI 重新生成的場景 ${segmentId} 描述：一個充滿活力的場景...` }
          : s
      ));
      toast({
        title: "描述已更新",
        description: "AI 已重新生成場景描述",
      });
    } catch (error) {
      toast({
        title: "生成失敗",
        description: "請稍後重試",
        variant: "destructive",
      });
    }
  };

  // AI 重新生成旁白
  const handleRegenerateNarration = async (segmentId: number) => {
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      setSegments(prev => prev.map(s => 
        s.id === segmentId 
          ? { ...s, narration: `AI 重新生成的旁白：在這個精彩的場景中...` }
          : s
      ));
      toast({
        title: "旁白已更新",
        description: "AI 已重新生成旁白文字",
      });
    } catch (error) {
      toast({
        title: "生成失敗",
        description: "請稍後重試",
        variant: "destructive",
      });
    }
  };

  // 上傳視頻
  const handleUploadVideo = async (segmentId: number, file: File) => {
    setUploadingVideoIds(prev => [...prev, segmentId]);
    try {
      // 模擬上傳
      await new Promise(resolve => setTimeout(resolve, 2000));
      const videoUrl = URL.createObjectURL(file);
      setSegments(prev => prev.map(s => 
        s.id === segmentId 
          ? { ...s, videoUrl, status: "completed" as const, error: undefined }
          : s
      ));
      toast({
        title: "視頻上傳成功",
        description: `片段 #${segmentId} 的視頻已上傳`,
      });
    } catch (error) {
      toast({
        title: "上傳失敗",
        description: "請稍後重試",
        variant: "destructive",
      });
    } finally {
      setUploadingVideoIds(prev => prev.filter(id => id !== segmentId));
    }
  };

  // 上傳音頻
  const handleUploadAudio = async (segmentId: number, file: File) => {
    setUploadingAudioIds(prev => [...prev, segmentId]);
    try {
      // 模擬上傳
      await new Promise(resolve => setTimeout(resolve, 2000));
      const audioUrl = URL.createObjectURL(file);
      setSegments(prev => prev.map(s => 
        s.id === segmentId ? { ...s, audioUrl } : s
      ));
      toast({
        title: "音頻上傳成功",
        description: `片段 #${segmentId} 的音頻已上傳`,
      });
    } catch (error) {
      toast({
        title: "上傳失敗",
        description: "請稍後重試",
        variant: "destructive",
      });
    } finally {
      setUploadingAudioIds(prev => prev.filter(id => id !== segmentId));
    }
  };

  // 保存更改
  const handleSave = async () => {
    setIsSaving(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      toast({
        title: "保存成功",
        description: "所有更改已保存",
      });
    } catch (error) {
      toast({
        title: "保存失敗",
        description: "請稍後重試",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // 導出視頻
  const handleExport = async () => {
    setIsExporting(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 3000));
      toast({
        title: "導出成功",
        description: "視頻已開始下載",
      });
    } catch (error) {
      toast({
        title: "導出失敗",
        description: "請稍後重試",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  // 統計信息
  const stats = {
    total: segments.length,
    completed: segments.filter(s => s.status === "completed").length,
    failed: segments.filter(s => s.status === "failed").length,
    pending: segments.filter(s => s.status === "pending").length,
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
              onClick={() => navigate("/history")}
              className="text-gray-400 hover:text-white"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              返回
            </Button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                <Film className="w-5 h-5 text-white" />
              </div>
              <div>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="text-xl font-bold bg-transparent border-none p-0 h-auto focus-visible:ring-0"
                  placeholder="輸入視頻標題..."
                />
                <p className="text-sm text-gray-400">編輯視頻片段</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSave}
              disabled={isSaving}
              className="border-gray-700"
            >
              {isSaving ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              保存
            </Button>
            <Button
              size="sm"
              onClick={handleExport}
              disabled={isExporting || stats.completed < stats.total}
              className="bg-gradient-to-r from-purple-500 to-pink-500"
            >
              {isExporting ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              導出視頻
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* 狀態概覽 */}
        <Card className="bg-gray-800/50 border-gray-700 mb-6">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-white">{stats.total}</div>
                  <div className="text-xs text-gray-400">總片段</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-400">{stats.completed}</div>
                  <div className="text-xs text-gray-400">已完成</div>
                </div>
                {stats.failed > 0 && (
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-400">{stats.failed}</div>
                    <div className="text-xs text-gray-400">失敗</div>
                  </div>
                )}
                {stats.pending > 0 && (
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-400">{stats.pending}</div>
                    <div className="text-xs text-gray-400">待處理</div>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-4">
                {stats.failed > 0 && (
                  <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                    <AlertTriangle className="w-3 h-3 mr-1" />
                    {stats.failed} 個片段需要處理
                  </Badge>
                )}
                {stats.completed === stats.total && (
                  <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    所有片段已完成
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 片段列表 */}
        <Card className="bg-gray-800/50 border-gray-700">
          <CardContent className="p-4">
            <SegmentListPreview
              segments={segments}
              onRegenerate={handleRegenerate}
              onRegenerateVideo={handleRegenerateVideo}
              onRegenerateAudio={handleRegenerateAudio}
              onUpdateDescription={handleUpdateDescription}
              onUpdateNarration={handleUpdateNarration}
              onRegenerateDescription={handleRegenerateDescription}
              onRegenerateNarration={handleRegenerateNarration}
              onUploadVideo={handleUploadVideo}
              onUploadAudio={handleUploadAudio}
              regeneratingIds={regeneratingIds}
              regeneratingAudioIds={regeneratingAudioIds}
              uploadingVideoIds={uploadingVideoIds}
              uploadingAudioIds={uploadingAudioIds}
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
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
