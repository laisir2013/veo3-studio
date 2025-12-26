import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Play, 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  Loader2,
  Clock,
  Video,
  Volume2,
  Eye,
  Download
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

// 片段數據接口
export interface Segment {
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
  narration?: string;
  imageUrl?: string; // 預覽圖
}

interface SegmentPreviewCardProps {
  segment: Segment;
  onRegenerate?: (segmentId: number) => void;
  isRegenerating?: boolean;
  showBatchColor?: boolean;
}

// 批次顏色配置
const BATCH_COLORS = [
  { bg: "bg-purple-500/20", border: "border-purple-500/50", text: "text-purple-400" },
  { bg: "bg-blue-500/20", border: "border-blue-500/50", text: "text-blue-400" },
  { bg: "bg-green-500/20", border: "border-green-500/50", text: "text-green-400" },
  { bg: "bg-amber-500/20", border: "border-amber-500/50", text: "text-amber-400" },
  { bg: "bg-pink-500/20", border: "border-pink-500/50", text: "text-pink-400" },
  { bg: "bg-cyan-500/20", border: "border-cyan-500/50", text: "text-cyan-400" },
  { bg: "bg-red-500/20", border: "border-red-500/50", text: "text-red-400" },
  { bg: "bg-indigo-500/20", border: "border-indigo-500/50", text: "text-indigo-400" },
  { bg: "bg-teal-500/20", border: "border-teal-500/50", text: "text-teal-400" },
  { bg: "bg-orange-500/20", border: "border-orange-500/50", text: "text-orange-400" },
];

// 格式化時間
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// 狀態徽章組件
function StatusBadge({ status }: { status: Segment["status"] }) {
  const config = {
    pending: { label: "等待中", variant: "secondary" as const, icon: Clock },
    generating: { label: "生成中", variant: "default" as const, icon: Loader2 },
    completed: { label: "已完成", variant: "default" as const, icon: CheckCircle2 },
    failed: { label: "失敗", variant: "destructive" as const, icon: XCircle },
  };
  
  const { label, variant, icon: Icon } = config[status];
  const isAnimated = status === "generating";
  
  return (
    <Badge variant={variant} className="text-xs gap-1">
      <Icon className={`w-3 h-3 ${isAnimated ? "animate-spin" : ""}`} />
      {label}
    </Badge>
  );
}

// 單個片段預覽卡片
export function SegmentPreviewCard({ 
  segment, 
  onRegenerate, 
  isRegenerating = false,
  showBatchColor = true 
}: SegmentPreviewCardProps) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const batchColor = BATCH_COLORS[segment.batchIndex % BATCH_COLORS.length];
  
  // 預覽圖或佔位符
  const previewContent = segment.status === "completed" && segment.videoUrl ? (
    <video 
      src={segment.videoUrl} 
      className="w-full h-full object-cover"
      muted
      loop
      onMouseEnter={(e) => (e.target as HTMLVideoElement).play()}
      onMouseLeave={(e) => {
        const video = e.target as HTMLVideoElement;
        video.pause();
        video.currentTime = 0;
      }}
    />
  ) : segment.imageUrl ? (
    <img 
      src={segment.imageUrl} 
      alt={`片段 ${segment.id} 預覽`}
      className="w-full h-full object-cover"
    />
  ) : (
    <div className={`w-full h-full flex items-center justify-center ${batchColor.bg}`}>
      {segment.status === "generating" ? (
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-2" />
          <span className="text-xs text-muted-foreground">{segment.progress}%</span>
        </div>
      ) : segment.status === "failed" ? (
        <div className="text-center text-destructive">
          <XCircle className="w-8 h-8 mx-auto mb-2" />
          <span className="text-xs">生成失敗</span>
        </div>
      ) : (
        <div className="text-center text-muted-foreground">
          <Video className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <span className="text-xs">等待生成</span>
        </div>
      )}
    </div>
  );

  return (
    <Card className={`overflow-hidden transition-all hover:shadow-lg ${showBatchColor ? batchColor.border : "border-border"} border`}>
      {/* 預覽區域 */}
      <div className="relative aspect-video bg-zinc-900 overflow-hidden group">
        {previewContent}
        
        {/* 懸停時顯示的操作按鈕 */}
        {segment.status === "completed" && segment.videoUrl && (
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="secondary" className="gap-1">
                  <Eye className="w-4 h-4" />
                  預覽
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl">
                <DialogHeader>
                  <DialogTitle>片段 {segment.id} 預覽</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <video 
                    src={segment.videoUrl} 
                    controls 
                    autoPlay
                    className="w-full rounded-lg"
                  />
                  {segment.narration && (
                    <div className="p-3 bg-muted rounded-lg">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                        <Volume2 className="w-4 h-4" />
                        旁白文字
                      </div>
                      <p className="text-sm">{segment.narration}</p>
                    </div>
                  )}
                  {segment.prompt && (
                    <div className="p-3 bg-muted rounded-lg">
                      <div className="text-sm text-muted-foreground mb-1">生成提示詞</div>
                      <p className="text-xs text-muted-foreground">{segment.prompt}</p>
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>
            
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    size="sm" 
                    variant="secondary"
                    onClick={() => window.open(segment.videoUrl, "_blank")}
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>下載此片段</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}
        
        {/* 片段編號標籤 */}
        <div className="absolute top-2 left-2">
          <Badge variant="secondary" className={`text-xs ${batchColor.text}`}>
            #{segment.id}
          </Badge>
        </div>
        
        {/* 時間標籤 */}
        <div className="absolute top-2 right-2">
          <Badge variant="secondary" className="text-xs bg-black/50">
            {formatTime(segment.startTime)} - {formatTime(segment.endTime)}
          </Badge>
        </div>
      </div>
      
      {/* 底部信息和操作區 */}
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <StatusBadge status={segment.status} />
          <span className="text-xs text-muted-foreground">
            第 {segment.batchIndex + 1} 批
          </span>
        </div>
        
        {/* 旁白預覽 */}
        {segment.narration && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {segment.narration}
          </p>
        )}
        
        {/* 錯誤信息 */}
        {segment.status === "failed" && segment.error && (
          <p className="text-xs text-destructive line-clamp-2">
            {segment.error}
          </p>
        )}
        
        {/* 重新生成按鈕 */}
        {onRegenerate && (segment.status === "completed" || segment.status === "failed") && (
          <Button 
            variant="outline" 
            size="sm" 
            className="w-full gap-1"
            onClick={() => onRegenerate(segment.id)}
            disabled={isRegenerating}
          >
            {isRegenerating ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                重新生成中...
              </>
            ) : (
              <>
                <RefreshCw className="w-3 h-3" />
                重新生成
              </>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// 片段網格預覽組件
interface SegmentGridProps {
  segments: Segment[];
  onRegenerate?: (segmentId: number) => void;
  regeneratingIds?: number[];
  columns?: 2 | 3 | 4 | 5 | 6;
}

export function SegmentGrid({ 
  segments, 
  onRegenerate, 
  regeneratingIds = [],
  columns = 4 
}: SegmentGridProps) {
  const gridCols = {
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
    4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
    5: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
    6: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6",
  };

  // 統計信息
  const stats = {
    total: segments.length,
    completed: segments.filter(s => s.status === "completed").length,
    generating: segments.filter(s => s.status === "generating").length,
    failed: segments.filter(s => s.status === "failed").length,
    pending: segments.filter(s => s.status === "pending").length,
  };

  return (
    <div className="space-y-4">
      {/* 統計欄 */}
      <div className="flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">總計:</span>
          <Badge variant="outline">{stats.total} 個片段</Badge>
        </div>
        {stats.completed > 0 && (
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            <span className="text-green-500">{stats.completed} 已完成</span>
          </div>
        )}
        {stats.generating > 0 && (
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 text-primary animate-spin" />
            <span className="text-primary">{stats.generating} 生成中</span>
          </div>
        )}
        {stats.failed > 0 && (
          <div className="flex items-center gap-2">
            <XCircle className="w-4 h-4 text-destructive" />
            <span className="text-destructive">{stats.failed} 失敗</span>
          </div>
        )}
        {stats.pending > 0 && (
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">{stats.pending} 等待中</span>
          </div>
        )}
      </div>

      {/* 片段網格 */}
      <div className={`grid ${gridCols[columns]} gap-4`}>
        {segments.map((segment) => (
          <SegmentPreviewCard
            key={segment.id}
            segment={segment}
            onRegenerate={onRegenerate}
            isRegenerating={regeneratingIds.includes(segment.id)}
          />
        ))}
      </div>
    </div>
  );
}

export default SegmentPreviewCard;
