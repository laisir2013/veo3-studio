import { useState, useEffect } from "react";
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
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface SubtitleSegment {
  id: number;
  startTime: number;
  endTime: number;
  text: string;
  confidence?: number;
}

interface SubtitleTrack {
  language: string;
  segments: SubtitleSegment[];
}

interface SubtitleEditorProps {
  taskId: string;
  narrationSegments: Array<{ segmentId: number; text: string }>;
  language: "cantonese" | "mandarin" | "english";
  onSubtitlesGenerated?: (subtitles: SubtitleTrack) => void;
  isGenerating?: boolean;
}

export function SubtitleEditor({
  taskId,
  narrationSegments,
  language,
  onSubtitlesGenerated,
  isGenerating = false,
}: SubtitleEditorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [subtitles, setSubtitles] = useState<SubtitleTrack | null>(null);
  const [editedSubtitles, setEditedSubtitles] = useState<SubtitleTrack | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [subtitleStyle, setSubtitleStyle] = useState("default");
  const [subtitlePosition, setSubtitlePosition] = useState("bottom");
  const [fontSize, setFontSize] = useState(24);
  const [isMerging, setIsMerging] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  // 生成字幕
  const handleGenerateSubtitles = async () => {
    try {
      const response = await fetch("/api/trpc/video.generateSubtitles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId,
          narrationSegments,
          language,
          format: "srt",
        }),
      });

      const data = await response.json();
      if (data.success && data.subtitleTrack) {
        setSubtitles(data.subtitleTrack);
        setEditedSubtitles(data.subtitleTrack);
        onSubtitlesGenerated?.(data.subtitleTrack);
        toast.success("字幕已生成");
      } else {
        toast.error(data.error || "生成字幕失敗");
      }
    } catch (error) {
      toast.error("生成字幕失敗: " + (error instanceof Error ? error.message : "未知錯誤"));
    }
  };

  // 編輯字幕文本
  const handleSegmentChange = (segmentId: number, newText: string) => {
    if (!editedSubtitles) return;

    setEditedSubtitles({
      ...editedSubtitles,
      segments: editedSubtitles.segments.map((seg) =>
        seg.id === segmentId ? { ...seg, text: newText } : seg
      ),
    });
  };

  // 保存字幕編輯
  const handleSaveSubtitles = () => {
    if (!editedSubtitles) return;

    // 驗證字幕
    const hasEmptySegments = editedSubtitles.segments.some((seg) => !seg.text.trim());
    if (hasEmptySegments) {
      toast.error("不能有空的字幕段");
      return;
    }

    setSubtitles(editedSubtitles);
    setIsEditing(false);
    toast.success("字幕已保存");
  };

  // 取消編輯
  const handleCancelEdit = () => {
    setEditedSubtitles(subtitles);
    setIsEditing(false);
  };

  // 刪除字幕段
  const handleDeleteSegment = (segmentId: number) => {
    if (!editedSubtitles) return;

    setEditedSubtitles({
      ...editedSubtitles,
      segments: editedSubtitles.segments.filter((seg) => seg.id !== segmentId),
    });
  };

  // 添加新字幕段
  const handleAddSegment = () => {
    if (!editedSubtitles) return;

    const lastSegment = editedSubtitles.segments[editedSubtitles.segments.length - 1];
    const newStartTime = lastSegment ? lastSegment.endTime : 0;
    const newEndTime = newStartTime + 8000; // 8 秒

    setEditedSubtitles({
      ...editedSubtitles,
      segments: [
        ...editedSubtitles.segments,
        {
          id: Math.max(...editedSubtitles.segments.map((s) => s.id), 0) + 1,
          startTime: newStartTime,
          endTime: newEndTime,
          text: "",
          confidence: 1.0,
        },
      ],
    });
  };

  // 下載字幕
  const handleDownloadSubtitles = () => {
    if (!subtitles) {
      toast.error("沒有字幕可下載");
      return;
    }

    const srtContent = convertToSRT(subtitles);
    const blob = new Blob([srtContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `subtitles-${Date.now()}.srt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("字幕已下載");
  };

  // 合併字幕到影片
  const handleMergeSubtitles = async (videoUrl: string) => {
    if (!subtitles) {
      toast.error("沒有字幕可合併");
      return;
    }

    try {
      setIsMerging(true);
      const response = await fetch("/api/trpc/video.mergeSubtitlesToVideo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId,
          videoUrl,
          style: subtitleStyle,
          fontSize,
          position: subtitlePosition,
        }),
      });

      const data = await response.json();
      if (data.success && data.mergedVideoUrl) {
        toast.success("字幕已合併到影片");
        return data.mergedVideoUrl;
      } else {
        toast.error(data.error || "合併失敗");
      }
    } catch (error) {
      toast.error("合併失敗: " + (error instanceof Error ? error.message : "未知錯誤"));
    } finally {
      setIsMerging(false);
    }
  };

  // 格式化時間
  const formatTime = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };

  return (
    <Card className="glass">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-primary" />
              字幕管理
            </CardTitle>
            <CardDescription>
              {subtitles ? `${subtitles.segments.length} 個字幕段` : "未生成字幕"}
            </CardDescription>
          </div>
          <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm">
                {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </Button>
            </CollapsibleTrigger>
          </Collapsible>
        </div>
      </CardHeader>

      <CollapsibleContent>
        <CardContent className="space-y-4">
          {!subtitles ? (
            // 生成字幕按鈕
            <div className="flex gap-2">
              <Button
                onClick={handleGenerateSubtitles}
                disabled={isGenerating}
                className="flex-1"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    生成中...
                  </>
                ) : (
                  <>
                    <Wand2 className="w-4 h-4 mr-2" />
                    AI 生成字幕
                  </>
                )}
              </Button>
            </div>
          ) : (
            <>
              {/* 字幕樣式設置 */}
              <div className="border border-zinc-800 rounded-lg p-4 bg-zinc-900/30 space-y-3">
                <div className="text-sm font-medium">字幕樣式設置</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-zinc-400 mb-1 block">字幕樣式</label>
                    <Select value={subtitleStyle} onValueChange={setSubtitleStyle}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">預設（白色邊框）</SelectItem>
                        <SelectItem value="white">白色</SelectItem>
                        <SelectItem value="black">黑色</SelectItem>
                        <SelectItem value="yellow">黃色</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-zinc-400 mb-1 block">字幕位置</label>
                    <Select value={subtitlePosition} onValueChange={setSubtitlePosition}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bottom">下方</SelectItem>
                        <SelectItem value="top">上方</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">
                    字體大小: {fontSize}px
                  </label>
                  <input
                    type="range"
                    min="16"
                    max="48"
                    value={fontSize}
                    onChange={(e) => setFontSize(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
              </div>

              {/* 字幕列表 */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-zinc-400">字幕段</span>
                  {!isEditing && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setIsEditing(true)}
                      className="h-6 px-2"
                    >
                      <Edit3 className="w-3 h-3" />
                    </Button>
                  )}
                </div>

                {editedSubtitles?.segments.map((segment) => (
                  <div
                    key={segment.id}
                    className="border border-zinc-800 rounded-lg p-3 bg-zinc-900/30"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          {formatTime(segment.startTime)} - {formatTime(segment.endTime)}
                        </Badge>
                      </div>
                      {isEditing && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteSegment(segment.id)}
                          className="h-6 w-6 p-0 text-red-400 hover:text-red-500"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>

                    {isEditing ? (
                      <Textarea
                        value={segment.text}
                        onChange={(e) => handleSegmentChange(segment.id, e.target.value)}
                        placeholder="輸入字幕文字..."
                        className="min-h-[50px] text-sm"
                      />
                    ) : (
                      <div className="text-sm text-zinc-200">{segment.text}</div>
                    )}
                  </div>
                ))}

                {isEditing && (
                  <Button
                    onClick={handleAddSegment}
                    variant="outline"
                    size="sm"
                    className="w-full"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    添加字幕段
                  </Button>
                )}
              </div>

              {/* 操作按鈕 */}
              <div className="flex gap-2 pt-4 border-t border-zinc-800">
                {!isEditing ? (
                  <>
                    <Button
                      onClick={handleDownloadSubtitles}
                      variant="outline"
                      size="sm"
                      className="flex-1"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      下載字幕
                    </Button>
                    <Button
                      onClick={() => setIsEditing(true)}
                      variant="outline"
                      size="sm"
                      className="flex-1"
                    >
                      <Edit3 className="w-4 h-4 mr-2" />
                      編輯字幕
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      onClick={handleSaveSubtitles}
                      disabled={isSaving}
                      variant="default"
                      size="sm"
                      className="flex-1"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          保存中...
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4 mr-2" />
                          保存字幕
                        </>
                      )}
                    </Button>
                    <Button
                      onClick={handleCancelEdit}
                      variant="outline"
                      size="sm"
                      className="flex-1"
                    >
                      <X className="w-4 h-4 mr-2" />
                      取消
                    </Button>
                  </>
                )}
              </div>

              {/* 提示信息 */}
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 text-xs text-blue-300">
                💡 提示：您可以編輯字幕文本、調整樣式和位置。編輯完成後，在影片預覽時可以選擇合併字幕。
              </div>
            </>
          )}
        </CardContent>
      </CollapsibleContent>
    </Card>
  );
}

// 轉換為 SRT 格式
function convertToSRT(subtitleTrack: SubtitleTrack): string {
  const lines: string[] = [];

  subtitleTrack.segments.forEach((segment) => {
    lines.push(segment.id.toString());
    lines.push(
      `${formatTimeSRT(segment.startTime)} --> ${formatTimeSRT(segment.endTime)}`
    );
    lines.push(segment.text);
    lines.push("");
  });

  return lines.join("\n");
}

function formatTimeSRT(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const milliseconds = ms % 1000;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(milliseconds).padStart(3, "0")}`;
}
