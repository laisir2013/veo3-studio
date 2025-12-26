import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { 
  Wand2, 
  Save, 
  X, 
  Edit3, 
  Loader2,
  Download,
  Eye,
  Settings,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Play,
  Pause,
  RefreshCw,
  Video,
  Mic,
  Image as ImageIcon,
  Upload,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// ... (其他導入)

// ... (其他類型定義)

// ... (其他組件)

// 單個片段詳情行組件（全展開，帶完整編輯功能）
function SegmentDetailRow({ 
  segment, 
  taskId,
  onUpdateSegment,
  isRegenerating = false,
  isRegeneratingAudio = false,
  isUploadingVideo = false,
  isUploadingAudio = false,
  isUploadingImage = false,
  voiceActors = [],
  id
}: { 
  segment: SegmentData; 
  taskId: string;
  onUpdateSegment: (segmentId: number, data: Partial<SegmentData>) => void;
  isRegenerating?: boolean;
  isRegeneratingAudio?: boolean;
  isUploadingVideo?: boolean;
  isUploadingAudio?: boolean;
  isUploadingImage?: boolean;
  voiceActors?: VoiceActor[];
  id?: string;
}) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [isEditingNarration, setIsEditingNarration] = useState(false);
  const [editedDescription, setEditedDescription] = useState(segment.description || "");
  const [editedNarration, setEditedNarration] = useState(segment.narration || "");
  const [selectedVoiceActorId, setSelectedVoiceActorId] = useState(segment.voiceActorId || "");
  
  const batchColor = BATCH_COLORS[segment.batchIndex % BATCH_COLORS.length];
  const statusConfig = STATUS_CONFIG[segment.status];
  const StatusIcon = statusConfig.icon;

  const regenerateSegmentMutation = trpc.video.regenerateSegment.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        onUpdateSegment(segment.id, {
          videoUrl: data.videoUrl,
          audioUrl: data.audioUrl,
          imageUrl: data.imageUrl,
          status: "completed",
          errorMessage: undefined,
        });
        toast.success(`片段 ${segment.id} 的 ${data.regenerateType} 已重新生成`);
      } else {
        onUpdateSegment(segment.id, {
          status: "failed",
          errorMessage: data.error,
        });
        toast.error(data.error || "重新生成失敗");
      }
    },
    onError: (error) => {
      onUpdateSegment(segment.id, {
        status: "failed",
        errorMessage: error.message,
      });
      toast.error("重新生成失敗: " + error.message);
    }
  });

  // 當 segment 更新時，同步編輯狀態
  useEffect(() => {
    setEditedDescription(segment.description || "");
    setEditedNarration(segment.narration || "");
    if (segment.voiceActorId) {
      setSelectedVoiceActorId(segment.voiceActorId);
    }
  }, [segment.description, segment.narration, segment.voiceActorId]);

  const handleRegenerate = (regenerateType: "all" | "video" | "audio" | "image") => {
    toast.info(`正在請求重新生成片段 ${segment.id} 的 ${regenerateType}...`);
    onUpdateSegment(segment.id, {
      status: "generating",
      progress: 0,
      errorMessage: undefined,
    });
    regenerateSegmentMutation.mutate({
      taskId,
      segmentId: segment.id,
      regenerateType,
    });
  };

  return (
    <div 
      id={id}
      className={`rounded-lg border ${statusConfig.borderColor} ${statusConfig.bgColor} overflow-hidden transition-all`}
    >
      {/* 頂部標題欄 */}
      <div className="flex items-center justify-between p-3 border-b border-zinc-800">
        {/* ... (頂部標題欄內容) */}

        <div className="flex items-center gap-2">
          {/* ... (批次標籤) */}

          {/* 重新生成整個片段按鈕 */}
          <Button 
            size="sm" 
            variant={segment.status === "failed" ? "destructive" : "outline"}
            className="h-8 px-3 gap-1"
            onClick={() => handleRegenerate("all")}
            disabled={regenerateSegmentMutation.isLoading || segment.status === "generating"}
          >
            {regenerateSegmentMutation.isLoading ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RefreshCw className="w-3 h-3" />
            )}
            <span className="text-xs">重新生成全部</span>
          </Button>
        </div>
      </div>

      {/* 主要內容區 */}
      <div className="p-3 space-y-4">
        {/* 視頻預覽區 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 左側：視頻預覽 */}
          <div className="space-y-2">
            {/* ... (視頻預覽內容) */}
            <div className="flex items-center gap-1">
              {/* ... (上傳視頻按鈕) */}
              <Button 
                size="sm" 
                variant="outline"
                className="h-7 px-2 gap-1"
                onClick={() => handleRegenerate("video")}
                disabled={regenerateSegmentMutation.isLoading}
              >
                <Wand2 className="w-3 h-3" />
                <span className="text-xs">AI 重做</span>
              </Button>
            </div>
          </div>

          {/* 右側：音頻預覽 */}
          <div className="space-y-2">
            {/* ... (音頻預覽內容) */}
            <div className="flex items-center gap-1">
              {/* ... (上傳音頻按鈕) */}
              <Button 
                size="sm" 
                variant="outline"
                className="h-7 px-2 gap-1"
                onClick={() => handleRegenerate("audio")}
                disabled={regenerateSegmentMutation.isLoading}
              >
                <Wand2 className="w-3 h-3" />
                <span className="text-xs">AI 重做</span>
              </Button>
            </div>
          </div>
        </div>

        {/* 圖片預覽區 */}
        <div className="space-y-2">
          {/* ... (圖片預覽內容) */}
          <div className="flex items-center gap-1">
            {/* ... (上傳圖片按鈕) */}
            <Button 
              size="sm" 
              variant="outline"
              className="h-7 px-2 gap-1"
              onClick={() => handleRegenerate("image")}
              disabled={regenerateSegmentMutation.isLoading}
            >
              <Wand2 className="w-3 h-3" />
              <span className="text-xs">AI 重做</span>
            </Button>
          </div>
        </div>

        {/* ... (其他內容) */}
      </div>
    </div>
  );
}

// ... (其他組件)
