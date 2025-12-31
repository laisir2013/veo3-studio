import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  Loader2,
  Clock,
  Video,
  Volume2,
  Eye,
  Download,
  AlertTriangle,
  Play,
  Square,
  Pause,
  Edit3,
  Save,
  X,
  Wand2,
  Mic,
  ChevronDown,
  ChevronUp,
  Upload,
  FileVideo,
  ImageIcon
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

// 配音員類型
export interface VoiceActorData {
  id: string;
  name: string;
  gender: "male" | "female";
  type: "narrator" | "character";
  language: string;
  description: string;
  sampleUrl?: string;
}

// 內部使用的配音員類型別名
type VoiceActor = VoiceActorData;

// 片段數據接口
export interface SegmentData {
  id: number;
  batchIndex: number;
  status: "pending" | "generating" | "completed" | "failed";
  progress: number;
  videoUrl?: string;
  audioUrl?: string;
  error?: string;
  startTime: number;
  endTime: number;
  prompt?: string;
  narration?: string; // 保持兼容性，但現在用於顯示單個片段的旁白
  imageUrl?: string;
  description?: string;
  voiceActorId?: string;
  mediaType?: "image" | "video"; // 混合模式：圖片或視頻類型
  generatingStatus?: string; // 生成狀態詳情（如「正在生成圖片 1/3」）
}

interface SegmentListPreviewProps {
  segments: SegmentData[];
  onRegenerate?: (segmentId: number) => void;
  onRegenerateVideo?: (segmentId: number) => void;
  onRegenerateAudio?: (segmentId: number, voiceActorId: string) => void;
  onUpdateDescription?: (segmentId: number, description: string) => void;
  onUpdateNarration?: (segmentId: number, narration: string) => void;
  onRegenerateDescription?: (segmentId: number) => void;
  onRegenerateNarration?: (segmentId: number) => void;
  onUploadVideo?: (segmentId: number, file: File) => void;
  onUploadAudio?: (segmentId: number, file: File) => void;
  onUploadImage?: (segmentId: number, files: File[]) => void;
  regeneratingIds?: number[];
  regeneratingAudioIds?: number[];
  uploadingVideoIds?: number[];
  uploadingAudioIds?: number[];
  uploadingImageIds?: number[];
  voiceActors?: VoiceActor[];
  maxHeight?: string;
}

// 批次顏色配置
const BATCH_COLORS = [
  { bg: "bg-purple-500/20", border: "border-purple-500/50", text: "text-purple-400", solid: "bg-purple-500" },
  { bg: "bg-blue-500/20", border: "border-blue-500/50", text: "text-blue-400", solid: "bg-blue-500" },
  { bg: "bg-green-500/20", border: "border-green-500/50", text: "text-green-400", solid: "bg-green-500" },
  { bg: "bg-amber-500/20", border: "border-amber-500/50", text: "text-amber-400", solid: "bg-amber-500" },
  { bg: "bg-pink-500/20", border: "border-pink-500/50", text: "text-pink-400", solid: "bg-pink-500" },
  { bg: "bg-cyan-500/20", border: "border-cyan-500/50", text: "text-cyan-400", solid: "bg-cyan-500" },
  { bg: "bg-red-500/20", border: "border-red-500/50", text: "text-red-400", solid: "bg-red-500" },
  { bg: "bg-indigo-500/20", border: "border-indigo-500/50", text: "text-indigo-400", solid: "bg-indigo-500" },
  { bg: "bg-teal-500/20", border: "border-teal-500/50", text: "text-teal-400", solid: "bg-teal-500" },
  { bg: "bg-orange-500/20", border: "border-orange-500/50", text: "text-orange-400", solid: "bg-orange-500" },
];

// 格式化時間
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// 狀態圖標和顏色配置
const STATUS_CONFIG = {
  pending: { 
    icon: Clock, 
    label: "等待中", 
    color: "text-zinc-400",
    bgColor: "bg-zinc-500/10",
    borderColor: "border-zinc-500/30",
    gridBg: "bg-zinc-700/50",
    gridBorder: "border-zinc-600",
    animate: false
  },
  generating: { 
    icon: Loader2, 
    label: "生成中", 
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/30",
    gridBg: "bg-blue-500/30",
    gridBorder: "border-blue-500",
    animate: true
  },
  completed: { 
    icon: CheckCircle2, 
    label: "已完成", 
    color: "text-green-400",
    bgColor: "bg-green-500/10",
    borderColor: "border-green-500/30",
    gridBg: "bg-green-500/30",
    gridBorder: "border-green-500",
    animate: false
  },
  failed: { 
    icon: XCircle, 
    label: "失敗", 
    color: "text-red-400",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/30",
    gridBg: "bg-red-500/30",
    gridBorder: "border-red-500",
    animate: false
  },
};

// 網格總覽組件 - 每行 8 格
function SegmentGridOverview({ 
  segments, 
  onRegenerate,
  regeneratingIds = [],
  onSegmentClick
}: { 
  segments: SegmentData[]; 
  onRegenerate?: (id: number) => void;
  regeneratingIds?: number[];
  onSegmentClick?: (id: number) => void;
}) {
  // 計算批次數量
  const maxBatch = Math.max(...segments.map(s => s.batchIndex)) + 1;

  // 計算圖片和視頻片段數量
  const imageCount = segments.filter(s => s.mediaType === "image").length;
  const videoCount = segments.filter(s => s.mediaType === "video").length;
  const hasMediaTypes = imageCount > 0 || videoCount > 0;

  return (
    <div className="space-y-2">
      {/* 批次圖例 */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        {Array.from({ length: maxBatch }, (_, i) => {
          const color = BATCH_COLORS[i % BATCH_COLORS.length];
          return (
            <div key={i} className="flex items-center gap-1.5">
              <div className={`w-3 h-3 rounded-full ${color.solid}`} />
              <span className="text-zinc-400">第 {i + 1} 批</span>
            </div>
          );
        })}
        {/* 混合模式圖例 */}
        {hasMediaTypes && (
          <>
            <div className="w-px h-4 bg-zinc-700 mx-1" />
            <div className="flex items-center gap-1.5">
              <div className="px-1.5 py-0.5 rounded bg-blue-500 text-[9px] font-bold text-white">圖片</div>
              <span className="text-blue-400">({imageCount})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="px-1.5 py-0.5 rounded bg-emerald-500 text-[9px] font-bold text-white">視頻</div>
              <span className="text-emerald-400">({videoCount})</span>
            </div>
          </>
        )}
      </div>

      {/* 8 列網格 - 簡化版，只顯示片段編號 */}
      <div className="grid grid-cols-8 gap-1 p-2 bg-zinc-900/50 rounded-lg">
        {segments.map((segment) => {
          const batchColor = BATCH_COLORS[segment.batchIndex % BATCH_COLORS.length];
          const statusConfig = STATUS_CONFIG[segment.status];
          
          return (
            <TooltipProvider key={segment.id}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className={`
                      rounded border cursor-pointer h-10 w-full relative
                      transition-all hover:scale-105 hover:shadow-lg flex items-center justify-center
                      ${segment.status === "failed" ? "border-red-500 bg-red-500/20" : `${batchColor.border} ${batchColor.bg}`}
                      ${segment.status === "generating" ? "animate-pulse" : ""}
                    `}
                    onClick={() => onSegmentClick?.(segment.id)}
                  >
                    {/* 圖片/視頻類型標記 - 頂部橫幅 */}
                    {segment.mediaType && (
                      <div className={`absolute -top-2 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded text-[9px] font-bold whitespace-nowrap
                        ${segment.mediaType === "image" ? "bg-blue-500 text-white" : "bg-emerald-500 text-white"}`}
                      >
                        {segment.mediaType === "image" ? "圖片" : "視頻"}
                      </div>
                    )}
                    {/* 只顯示片段編號 */}
                    <span className={`text-base font-bold ${segment.status === "failed" ? "text-red-400" : batchColor.text}`}>
                      {segment.id}
                    </span>
                    {/* 狀態圖標 - 只在完成或失敗時顯示 */}
                    {segment.status === "completed" && (
                      <CheckCircle2 className="w-3 h-3 text-green-400 ml-1" />
                    )}
                    {segment.status === "failed" && (
                      <XCircle className="w-3 h-3 text-red-400 ml-1" />
                    )}
                    {segment.status === "generating" && (
                      <Loader2 className="w-3 h-3 text-blue-400 ml-1 animate-spin" />
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="text-sm max-w-xs">
                    <div className="font-medium">片段 #{segment.id}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatTime(segment.startTime)} - {formatTime(segment.endTime)}
                    </div>
                    <div className="text-xs">第 {segment.batchIndex + 1} 批 · {statusConfig.label}</div>
                    {segment.mediaType && (
                      <div className={`text-xs font-medium ${segment.mediaType === "image" ? "text-blue-400" : "text-emerald-400"}`}>
                        {segment.mediaType === "image" ? "🖼️ 圖片模式 (Nano Banana)" : "🎬 視頻模式 (VEO)"}
                      </div>
                    )}
                    {segment.status === "generating" && (
                      <>
                        <div className="text-xs">進度: {segment.progress}%</div>
                        {segment.generatingStatus && (
                          <div className="text-xs text-yellow-400 mt-1 break-words">
                            {segment.generatingStatus}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        })}
      </div>
      
      {/* 提示 */}
      <div className="mt-2 text-xs text-zinc-500">
        💡 每個片段 8 秒，同一批次的片段會並行生成。點擊片段可跳轉到詳細信息。
      </div>
    </div>
  );
}

// 音頻播放器組件
function AudioPlayer({ src, className }: { src?: string; className?: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => setDuration(audio.duration);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [src]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio || !src) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const formatAudioTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!src) {
    return (
      <div className={`flex items-center gap-2 p-2 bg-zinc-800 rounded ${className}`}>
        <Volume2 className="w-4 h-4 text-zinc-500" />
        <span className="text-xs text-zinc-500">尚未生成音頻</span>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 p-2 bg-zinc-800 rounded ${className}`}>
      <audio ref={audioRef} src={src} />
      <Button
        size="sm"
        variant="ghost"
        className="h-7 w-7 p-0"
        onClick={togglePlay}
      >
        {isPlaying ? (
          <Pause className="w-4 h-4" />
        ) : (
          <Play className="w-4 h-4" />
        )}
      </Button>
      <div className="flex-1 h-1 bg-zinc-700 rounded-full overflow-hidden">
        <div 
          className="h-full bg-primary transition-all"
          style={{ width: duration ? `${(currentTime / duration) * 100}%` : '0%' }}
        />
      </div>
      <span className="text-xs text-zinc-400 min-w-[60px] text-right">
        {formatAudioTime(currentTime)} / {formatAudioTime(duration)}
      </span>
    </div>
  );
}

// 單個片段詳情行組件（全展開，帶完整編輯功能）
function SegmentDetailRow({ 
  segment, 
  onRegenerate,
  onRegenerateVideo,
  onRegenerateAudio,
  onUpdateDescription,
  onUpdateNarration,
  onRegenerateDescription,
  onRegenerateNarration,
  onUploadVideo,
  onUploadAudio,
  onUploadImage,
  isRegenerating = false,
  isRegeneratingAudio = false,
  isUploadingVideo = false,
  isUploadingAudio = false,
  isUploadingImage = false,
  voiceActors = [],
  id
}: { 
  segment: SegmentData; 
  onRegenerate?: (id: number) => void;
  onRegenerateVideo?: (id: number) => void;
  onRegenerateAudio?: (id: number, voiceActorId: string) => void;
  onUpdateDescription?: (id: number, description: string) => void;
  onUpdateNarration?: (id: number, narration: string) => void;
  onRegenerateDescription?: (id: number) => void;
  onRegenerateNarration?: (id: number) => void;
  onUploadVideo?: (id: number, file: File) => void;
  onUploadAudio?: (id: number, file: File) => void;
  isRegenerating?: boolean;
  isRegeneratingAudio?: boolean;
  isUploadingVideo?: boolean;
  isUploadingAudio?: boolean;
  isUploadingImage?: boolean;
  onUploadImage?: (id: number, files: File[]) => void;
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

  // 當 segment 更新時，同步編輯狀態
  useEffect(() => {
    setEditedDescription(segment.description || "");
    setEditedNarration(segment.narration || "");
    if (segment.voiceActorId) {
      setSelectedVoiceActorId(segment.voiceActorId);
    }
  }, [segment.description, segment.narration, segment.voiceActorId]);

  const handleSaveDescription = () => {
    if (onUpdateDescription) {
      onUpdateDescription(segment.id, editedDescription);
    }
    setIsEditingDescription(false);
  };

  const handleSaveNarration = () => {
    if (onUpdateNarration) {
      onUpdateNarration(segment.id, editedNarration);
    }
    setIsEditingNarration(false);
  };

  const handleRegenerateAudio = () => {
    if (onRegenerateAudio && selectedVoiceActorId) {
      onRegenerateAudio(segment.id, selectedVoiceActorId);
    }
  };

  return (
    <div 
      id={id}
      className={`rounded-lg border ${statusConfig.borderColor} ${statusConfig.bgColor} overflow-hidden transition-all`}
    >
      {/* 頂部標題欄 */}
      <div className="flex items-center justify-between p-3 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          {/* 片段編號 */}
          <div className={`flex-shrink-0 w-10 h-10 rounded-lg ${batchColor.bg} ${batchColor.border} border flex flex-col items-center justify-center`}>
            <span className={`text-lg font-bold ${batchColor.text}`}>#{segment.id}</span>
          </div>

          {/* 時間和狀態 */}
          <div>
            <div className="text-sm font-mono text-zinc-300">
              {formatTime(segment.startTime)} - {formatTime(segment.endTime)}
            </div>
            <div className={`flex items-center gap-1 text-xs ${statusConfig.color}`}>
              <StatusIcon className={`w-3 h-3 ${statusConfig.animate ? 'animate-spin' : ''}`} />
              <span>{statusConfig.label}</span>
              {segment.status === "generating" && (
                <span className="ml-1 font-medium">({segment.progress}%)</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* 批次標籤 */}
          <div className={`px-2 py-1 rounded text-xs ${batchColor.solid} text-white`}>
            第 {segment.batchIndex + 1} 批
          </div>

          {/* 重新生成整個片段按鈕 */}
          {onRegenerate && (
            <Button 
              size="sm" 
              variant={segment.status === "failed" ? "destructive" : "outline"}
              className="h-8 px-3 gap-1"
              onClick={() => onRegenerate(segment.id)}
              disabled={isRegenerating || segment.status === "generating"}
            >
              {isRegenerating ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3" />
              )}
              <span className="text-xs">重新生成全部</span>
            </Button>
          )}
        </div>
      </div>

      {/* 主要內容區 */}
      <div className="p-3 space-y-4">
        {/* 視頻預覽區 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 左側：視頻預覽 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs text-zinc-500 flex items-center gap-1">
                <Video className="w-3 h-3" />
                視頻預覽
              </span>
              <div className="flex items-center gap-1">
                {/* 上傳視頻按鈕 */}
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file && onUploadVideo) {
                        onUploadVideo(segment.id, file);
                      }
                      e.target.value = '';
                    }}
                    disabled={isUploadingVideo || segment.status === "generating"}
                  />
                  <Button 
                    size="sm" 
                    variant="outline"
                    className="h-6 px-2 text-xs border-dashed"
                    disabled={isUploadingVideo || segment.status === "generating"}
                    asChild
                  >
                    <span>
                      {isUploadingVideo ? (
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      ) : (
                        <Upload className="w-3 h-3 mr-1" />
                      )}
                      上傳視頻
                    </span>
                  </Button>
                </label>
                {/* 上傳圖片按鈕 */}
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      if (files.length > 0 && onUploadImage) {
                        onUploadImage(segment.id, files);
                      }
                      e.target.value = '';
                    }}
                    disabled={isUploadingImage || segment.status === "generating"}
                  />
                  <Button 
                    size="sm" 
                    variant="outline"
                    className="h-6 px-2 text-xs border-dashed border-green-500/50 text-green-400 hover:bg-green-500/10"
                    disabled={isUploadingImage || segment.status === "generating"}
                    asChild
                  >
                    <span>
                      {isUploadingImage ? (
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      ) : (
                        <ImageIcon className="w-3 h-3 mr-1" />
                      )}
                      上傳圖片
                    </span>
                  </Button>
                </label>
                {/* 重新生成視頻按鈕 */}
                {onRegenerateVideo && segment.status !== "generating" && (
                  <Button 
                    size="sm" 
                    variant="ghost"
                    className="h-6 px-2 text-xs"
                    onClick={() => onRegenerateVideo(segment.id)}
                    disabled={isRegenerating}
                  >
                    <RefreshCw className="w-3 h-3 mr-1" />
                    重新生成
                  </Button>
                )}
              </div>
            </div>
            <div className="aspect-video rounded-lg bg-zinc-900 overflow-hidden relative group">
              {segment.status === "completed" && segment.videoUrl ? (
                <video 
                  src={segment.videoUrl} 
                  controls
                  className="w-full h-full object-cover"
                />
              ) : segment.imageUrl ? (
                <img 
                  src={segment.imageUrl} 
                  alt={`片段 ${segment.id}`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  {segment.status === "generating" ? (
                    <div className="text-center">
                      <Loader2 className="w-10 h-10 animate-spin text-blue-400 mx-auto mb-2" />
                      <span className="text-sm text-zinc-400">生成中 {segment.progress}%</span>
                      <div className="w-24 h-1.5 bg-zinc-700 rounded-full mt-2 mx-auto">
                        <div 
                          className="h-full bg-blue-500 rounded-full transition-all"
                          style={{ width: `${segment.progress}%` }}
                        />
                      </div>
                    </div>
                  ) : segment.status === "failed" ? (
                    <div className="text-center">
                      <XCircle className="w-10 h-10 mx-auto mb-2 text-red-400" />
                      <span className="text-sm text-red-400">生成失敗</span>
                      <p className="text-xs text-zinc-500 mt-2">可以上傳外部生成的視頻</p>
                    </div>
                  ) : isUploadingVideo ? (
                    <div className="text-center">
                      <Loader2 className="w-10 h-10 animate-spin text-purple-400 mx-auto mb-2" />
                      <span className="text-sm text-zinc-400">上傳中...</span>
                    </div>
                  ) : (
                    <label className="w-full h-full flex items-center justify-center cursor-pointer hover:bg-zinc-800/50 transition-colors">
                      <input
                        type="file"
                        accept="video/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file && onUploadVideo) {
                            onUploadVideo(segment.id, file);
                          }
                          e.target.value = '';
                        }}
                        disabled={false}
                      />
                      <div className="text-center text-zinc-600">
                        <div className="w-16 h-16 mx-auto mb-2 rounded-full bg-zinc-800 flex items-center justify-center group-hover:bg-zinc-700 transition-colors">
                          <Upload className="w-8 h-8" />
                        </div>
                        <span className="text-sm">點擊上傳視頻</span>
                        <p className="text-xs text-zinc-500 mt-1">或等待系統生成</p>
                      </div>
                    </label>
                  )}
                </div>
              )}
              {/* 已有視頻時的懸浮上傳按鈕 */}
              {segment.videoUrl && (
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept="video/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file && onUploadVideo) {
                          onUploadVideo(segment.id, file);
                        }
                        e.target.value = '';
                      }}
                      disabled={isUploadingVideo}
                    />
                    <Button variant="secondary" size="sm" asChild>
                      <span>
                        <Upload className="w-4 h-4 mr-2" />
                        替換視頻
                      </span>
                    </Button>
                  </label>
                </div>
              )}
            </div>
          </div>

          {/* 右側：音頻和配音員 */}
          <div className="space-y-3">
            {/* 旁白音頻 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500 flex items-center gap-1">
                  <Volume2 className="w-3 h-3" />
                  旁白音頻
                </span>
                {/* 上傳音頻按鈕 */}
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file && onUploadAudio) {
                        onUploadAudio(segment.id, file);
                      }
                      e.target.value = '';
                    }}
                    disabled={isUploadingAudio}
                  />
                  <Button 
                    size="sm" 
                    variant="outline"
                    className="h-6 px-2 text-xs border-dashed"
                    disabled={isUploadingAudio}
                    asChild
                  >
                    <span>
                      {isUploadingAudio ? (
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      ) : (
                        <Upload className="w-3 h-3 mr-1" />
                      )}
                      上傳音頻
                    </span>
                  </Button>
                </label>
              </div>
              <AudioPlayer src={segment.audioUrl} />
            </div>

            {/* 配音員選擇 */}
            <div className="space-y-2">
              <span className="text-xs text-zinc-500 flex items-center gap-1">
                <Mic className="w-3 h-3" />
                配音員
              </span>
              <div className="flex items-center gap-2">
                <Select 
                  value={selectedVoiceActorId} 
                  onValueChange={setSelectedVoiceActorId}
                >
                  <SelectTrigger className="flex-1 h-8 text-xs">
                    <SelectValue placeholder="選擇配音員" />
                  </SelectTrigger>
                  <SelectContent>
                    {voiceActors.map((actor) => (
                      <SelectItem key={actor.id} value={actor.id}>
                        <div className="flex items-center gap-2">
                          <span>{actor.name}</span>
                          <Badge variant="outline" className="text-[10px] px-1">
                            {actor.gender === "male" ? "男" : "女"}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button 
                  size="sm" 
                  variant="outline"
                  className="h-8 px-2"
                  onClick={handleRegenerateAudio}
                  disabled={isRegeneratingAudio || !selectedVoiceActorId || !segment.narration}
                >
                  {isRegeneratingAudio ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3 h-3" />
                  )}
                  <span className="text-xs ml-1">生成音頻</span>
                </Button>
              </div>
            </div>

            {/* 錯誤信息 */}
            {segment.status === "failed" && segment.error && (
              <div className="p-2 bg-red-500/10 border border-red-500/30 rounded">
                <div className="text-xs text-red-400 mb-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  錯誤信息
                </div>
                <p className="text-xs text-red-300">{segment.error}</p>
              </div>
            )}
          </div>
        </div>

        {/* 影片描述 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500">影片描述</span>
            <div className="flex items-center gap-1">
              {onRegenerateDescription && !isEditingDescription && (
                <Button 
                  size="sm" 
                  variant="ghost"
                  className="h-6 px-2 text-xs"
                  onClick={() => onRegenerateDescription(segment.id)}
                >
                  <Wand2 className="w-3 h-3 mr-1" />
                  AI 重新生成
                </Button>
              )}
              {!isEditingDescription ? (
                <Button 
                  size="sm" 
                  variant="ghost"
                  className="h-6 px-2 text-xs"
                  onClick={() => setIsEditingDescription(true)}
                >
                  <Edit3 className="w-3 h-3 mr-1" />
                  編輯
                </Button>
              ) : (
                <>
                  <Button 
                    size="sm" 
                    variant="ghost"
                    className="h-6 px-2 text-xs text-green-400"
                    onClick={handleSaveDescription}
                  >
                    <Save className="w-3 h-3 mr-1" />
                    保存
                  </Button>
                  <Button 
                    size="sm" 
                    variant="ghost"
                    className="h-6 px-2 text-xs text-red-400"
                    onClick={() => {
                      setEditedDescription(segment.description || "");
                      setIsEditingDescription(false);
                    }}
                  >
                    <X className="w-3 h-3 mr-1" />
                    取消
                  </Button>
                </>
              )}
            </div>
          </div>
          {isEditingDescription ? (
            <Textarea 
              value={editedDescription}
              onChange={(e) => setEditedDescription(e.target.value)}
              className="min-h-[60px] text-sm bg-zinc-900 border-zinc-700"
              placeholder="輸入影片描述..."
            />
          ) : (
            <div className="p-2 bg-zinc-900 rounded text-sm text-zinc-300 min-h-[40px]">
              {segment.description || <span className="text-zinc-600 italic">尚未生成影片描述...</span>}
            </div>
          )}
        </div>

        {/* 旁白文字 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500 flex items-center gap-1">
              <Volume2 className="w-3 h-3" />
              旁白文字
            </span>
            <div className="flex items-center gap-1">
              {onRegenerateNarration && !isEditingNarration && (
                <Button 
                  size="sm" 
                  variant="ghost"
                  className="h-6 px-2 text-xs"
                  onClick={() => onRegenerateNarration(segment.id)}
                >
                  <Wand2 className="w-3 h-3 mr-1" />
                  AI 重新生成
                </Button>
              )}
              {!isEditingNarration ? (
                <Button 
                  size="sm" 
                  variant="ghost"
                  className="h-6 px-2 text-xs"
                  onClick={() => setIsEditingNarration(true)}
                >
                  <Edit3 className="w-3 h-3 mr-1" />
                  編輯
                </Button>
              ) : (
                <>
                  <Button 
                    size="sm" 
                    variant="ghost"
                    className="h-6 px-2 text-xs text-green-400"
                    onClick={handleSaveNarration}
                  >
                    <Save className="w-3 h-3 mr-1" />
                    保存
                  </Button>
                  <Button 
                    size="sm" 
                    variant="ghost"
                    className="h-6 px-2 text-xs text-red-400"
                    onClick={() => {
                      setEditedNarration(segment.narration || "");
                      setIsEditingNarration(false);
                    }}
                  >
                    <X className="w-3 h-3 mr-1" />
                    取消
                  </Button>
                </>
              )}
            </div>
          </div>
          {isEditingNarration ? (
            <Textarea 
              value={editedNarration}
              onChange={(e) => setEditedNarration(e.target.value)}
              className="min-h-[60px] text-sm bg-zinc-900 border-zinc-700"
              placeholder="輸入旁白文字..."
            />
          ) : (
            <div className="p-2 bg-zinc-900 rounded text-sm text-zinc-300 min-h-[40px]">
              {segment.narration || <span className="text-zinc-600 italic">尚未生成旁白文字...</span>}
            </div>
          )}
        </div>

        {/* 生成提示詞（可折疊） */}
        {segment.prompt && (
          <Collapsible>
            <CollapsibleTrigger className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-400">
              <ChevronDown className="w-3 h-3" />
              查看生成提示詞
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 p-2 bg-zinc-900 rounded text-xs text-zinc-400">
                {segment.prompt}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>
    </div>
  );
}

// 列表式片段預覽組件（帶網格總覽）
export function SegmentListPreview({ 
  segments, 
  onRegenerate,
  onRegenerateVideo,
  onRegenerateAudio,
  onUpdateDescription,
  onUpdateNarration,
  onRegenerateDescription,
  onRegenerateNarration,
  onUploadVideo,
  onUploadAudio,
  onUploadImage,
  regeneratingIds = [],
  regeneratingAudioIds = [],
  uploadingVideoIds = [],
  uploadingAudioIds = [],
  uploadingImageIds = [],
  voiceActors = [],
  maxHeight = "none"
}: SegmentListPreviewProps) {
  // 詳細列表展開狀態
  const [isDetailExpanded, setIsDetailExpanded] = useState(true);

  // 統計信息
  const stats = {
    total: segments.length,
    completed: segments.filter(s => s.status === "completed").length,
    generating: segments.filter(s => s.status === "generating").length,
    failed: segments.filter(s => s.status === "failed").length,
    pending: segments.filter(s => s.status === "pending").length,
  };

  // 點擊網格跳轉到對應詳情
  const handleSegmentClick = (id: number) => {
    const element = document.getElementById(`segment-detail-${id}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.classList.add('ring-2', 'ring-primary');
      setTimeout(() => {
        element.classList.remove('ring-2', 'ring-primary');
      }, 2000);
    }
  };

  return (
    <div className="space-y-4">
      {/* 標題和統計 */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Video className="w-5 h-5" />
          片段預覽
        </h3>
        <div className="text-sm text-muted-foreground">
          共 {stats.total} 個片段 · {Math.max(...segments.map(s => s.batchIndex)) + 1} 批次
        </div>
      </div>

      {/* 統計欄 */}
      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-1">
          <span className="text-zinc-500">總計:</span>
          <Badge variant="secondary">{stats.total} 個片段</Badge>
        </div>
        {stats.completed > 0 && (
          <div className="flex items-center gap-1 text-green-400">
            <CheckCircle2 className="w-4 h-4" />
            {stats.completed} 已完成
          </div>
        )}
        {stats.generating > 0 && (
          <div className="flex items-center gap-1 text-blue-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            {stats.generating} 生成中
          </div>
        )}
        {stats.failed > 0 && (
          <div className="flex items-center gap-1 text-red-400">
            <XCircle className="w-4 h-4" />
            {stats.failed} 失敗
          </div>
        )}
        {stats.pending > 0 && (
          <div className="flex items-center gap-1 text-zinc-400">
            <Clock className="w-4 h-4" />
            {stats.pending} 等待中
          </div>
        )}
      </div>

      {/* 網格總覽 */}
      <SegmentGridOverview 
        segments={segments} 
        onRegenerate={onRegenerate}
        regeneratingIds={regeneratingIds}
        onSegmentClick={handleSegmentClick}
      />

      {/* 詳細列表 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-zinc-400">詳細列表</h4>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-zinc-400 hover:text-zinc-200"
            onClick={() => setIsDetailExpanded(!isDetailExpanded)}
          >
            {isDetailExpanded ? (
              <>
                <ChevronUp className="w-4 h-4 mr-1" />
                收起
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4 mr-1" />
                展開 ({segments.length} 個片段)
              </>
            )}
          </Button>
        </div>
        {isDetailExpanded && (
          <div 
            className="space-y-3"
            style={{ maxHeight: maxHeight !== "none" ? maxHeight : undefined, overflowY: maxHeight !== "none" ? "auto" : undefined }}
          >
            {segments.map((segment) => (
              <SegmentDetailRow
                key={segment.id}
                id={`segment-detail-${segment.id}`}
                segment={segment}
                onRegenerate={onRegenerate}
                onRegenerateVideo={onRegenerateVideo}
                onRegenerateAudio={onRegenerateAudio}
                onUpdateDescription={onUpdateDescription}
                onUpdateNarration={onUpdateNarration}
                onRegenerateDescription={onRegenerateDescription}
                onRegenerateNarration={onRegenerateNarration}
                onUploadVideo={onUploadVideo}
                onUploadAudio={onUploadAudio}
                isRegenerating={regeneratingIds.includes(segment.id)}
                isRegeneratingAudio={regeneratingAudioIds?.includes(segment.id)}
                isUploadingVideo={uploadingVideoIds?.includes(segment.id)}
                isUploadingAudio={uploadingAudioIds?.includes(segment.id)}
                isUploadingImage={uploadingImageIds?.includes(segment.id)}
                onUploadImage={onUploadImage}
                voiceActors={voiceActors}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
