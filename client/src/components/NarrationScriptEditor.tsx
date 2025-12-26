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
  Volume2,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  FileText
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "sonner";

interface NarrationSegment {
  segmentId: number;
  text: string;
}

interface NarrationScriptEditorProps {
  sceneId: number;
  taskId: string;
  story: string;
  sceneDescription: string;
  narrationSegments: NarrationSegment[];
  llmModel: string;
  language: "cantonese" | "mandarin" | "english";
  onNarrationUpdate?: (segments: NarrationSegment[]) => void;
  onRegenerateNarration?: (segments: NarrationSegment[]) => void;
  onSceneDescriptionUpdate?: (description: string) => void;
  isRegenerating?: boolean;
}

export function NarrationScriptEditor({
  sceneId,
  taskId,
  story,
  sceneDescription,
  narrationSegments,
  llmModel,
  language,
  onNarrationUpdate,
  onRegenerateNarration,
  onSceneDescriptionUpdate,
  isRegenerating = false,
}: NarrationScriptEditorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [editedSegments, setEditedSegments] = useState<NarrationSegment[]>(narrationSegments);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState<number | null>(null);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [editedDescription, setEditedDescription] = useState(sceneDescription);

  // 當 narrationSegments 更新時，同步編輯狀態
  useEffect(() => {
    setEditedSegments(narrationSegments);
  }, [narrationSegments]);

  // 當 sceneDescription 更新時，同步編輯狀態
  useEffect(() => {
    setEditedDescription(sceneDescription);
  }, [sceneDescription]);

  // 計算總字數
  const totalCharacters = editedSegments.reduce((sum, seg) => sum + seg.text.length, 0);
  const totalSeconds = editedSegments.length * 8; // 每段 8 秒

  // 更新單個片段
  const handleSegmentChange = (segmentId: number, newText: string) => {
    setEditedSegments(prev =>
      prev.map(seg =>
        seg.segmentId === segmentId ? { ...seg, text: newText } : seg
      )
    );
  };

  // 保存編輯
  const handleSave = async () => {
    setIsSaving(true);
    try {
      // 驗證每個片段的長度
      const invalidSegments = editedSegments.filter(seg => {
        const charCount = seg.text.length;
        return charCount < 20 || charCount > 100; // 允許範圍：20-100 字
      });

      if (invalidSegments.length > 0) {
        toast.error(`片段 ${invalidSegments.map(s => s.segmentId).join(", ")} 的字數不符合要求（應為 20-100 字）`);
        setIsSaving(false);
        return;
      }

      onNarrationUpdate?.(editedSegments);
      setIsEditing(false);
      toast.success("旁白腳本已保存");
    } catch (error) {
      toast.error("保存失敗: " + (error instanceof Error ? error.message : "未知錯誤"));
    } finally {
      setIsSaving(false);
    }
  };

  // 取消編輯
  const handleCancel = () => {
    setEditedSegments(narrationSegments);
    setIsEditing(false);
  };

  // 保存場景描述
  const handleSaveDescription = async () => {
    try {
      if (!editedDescription.trim()) {
        toast.error("場景描述不能為空");
        return;
      }
      onSceneDescriptionUpdate?.(editedDescription);
      setIsEditingDescription(false);
      toast.success("場景描述已保存");
    } catch (error) {
      toast.error("保存失敗: " + (error instanceof Error ? error.message : "未知錯誤"));
    }
  };

  // 取消編輯描述
  const handleCancelDescription = () => {
    setEditedDescription(sceneDescription);
    setIsEditingDescription(false);
  };

  // 重新生成旁白
  const handleRegenerate = async () => {
    try {
      const existingNarration = narrationSegments.map(s => s.text).join(" ");
      
      // 調用 API 重新生成旁白
      const response = await fetch('/api/trpc/video.regenerateNarration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId,
          sceneId,
          story,
          sceneDescription,
          existingNarration,
          llmModel,
          language,
        }),
      });

      const data = await response.json();
      if (data.success && data.narrationSegments) {
        setEditedSegments(data.narrationSegments);
        onRegenerateNarration?.(data.narrationSegments);
        toast.success("旁白已重新生成");
      } else {
        toast.error(data.error || "重新生成失敗");
      }
    } catch (error) {
      toast.error("重新生成失敗: " + (error instanceof Error ? error.message : "未知錯誤"));
    }
  };

  // 播放旁白音頻
  const handlePlayAudio = async (segmentId: number, text: string) => {
    try {
      setIsPlayingAudio(segmentId);
      
      // 調用 TTS API 生成音頻
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          language,
          voiceActorId: `${language}-narrator`,
        }),
      });

      if (!response.ok) {
        throw new Error("TTS 生成失敗");
      }

      const data = await response.json();
      if (data.audioUrl) {
        const audio = new Audio(data.audioUrl);
        audio.play();
        audio.onended = () => setIsPlayingAudio(null);
      }
    } catch (error) {
      toast.error("播放失敗: " + (error instanceof Error ? error.message : "未知錯誤"));
      setIsPlayingAudio(null);
    }
  };

  return (
    <Card className="glass">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Volume2 className="w-5 h-5 text-primary" />
              場景 #{sceneId} - 旁白腳本與描述
            </CardTitle>
            <CardDescription>
              {editedSegments.length} 個片段 · {totalCharacters} 字 · 約 {totalSeconds} 秒
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
          {/* 場景描述編輯區 */}
          <div className="border border-zinc-800 rounded-lg p-4 bg-zinc-900/30 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-medium">場景描述（影片提示詞）</span>
              </div>
              {!isEditingDescription && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setIsEditingDescription(true)}
                  className="h-6 px-2"
                >
                  <Edit3 className="w-3 h-3" />
                </Button>
              )}
            </div>

            {isEditingDescription ? (
              <div className="space-y-2">
                <Textarea
                  value={editedDescription}
                  onChange={(e) => setEditedDescription(e.target.value)}
                  placeholder="輸入場景描述（用於生成影片）..."
                  className="min-h-[80px] text-sm"
                />
                <div className="flex gap-2">
                  <Button
                    onClick={handleSaveDescription}
                    size="sm"
                    className="flex-1"
                  >
                    <Save className="w-3 h-3 mr-1" />
                    保存描述
                  </Button>
                  <Button
                    onClick={handleCancelDescription}
                    variant="outline"
                    size="sm"
                    className="flex-1"
                  >
                    <X className="w-3 h-3 mr-1" />
                    取消
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-sm text-zinc-300 leading-relaxed bg-zinc-800/30 p-2 rounded">
                {editedDescription}
              </div>
            )}
          </div>

          {/* 旁白片段列表 */}
          <div className="space-y-3">
            <div className="text-sm font-medium text-zinc-400">旁白片段</div>
            {editedSegments.map((segment) => (
              <div key={segment.segmentId} className="border border-zinc-800 rounded-lg p-3 bg-zinc-900/30">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      片段 #{segment.segmentId}
                    </Badge>
                    <span className="text-xs text-zinc-400">
                      {segment.text.length} 字 · 約 8 秒
                    </span>
                  </div>
                  {!isEditing && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handlePlayAudio(segment.segmentId, segment.text)}
                      disabled={isPlayingAudio === segment.segmentId}
                      className="h-6 w-6 p-0"
                    >
                      {isPlayingAudio === segment.segmentId ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Volume2 className="w-4 h-4" />
                      )}
                    </Button>
                  )}
                </div>

                {isEditing ? (
                  <Textarea
                    value={segment.text}
                    onChange={(e) => handleSegmentChange(segment.segmentId, e.target.value)}
                    placeholder="輸入旁白文字..."
                    className="min-h-[60px] text-sm"
                  />
                ) : (
                  <div className="text-sm text-zinc-200 leading-relaxed">
                    {segment.text}
                  </div>
                )}

                {/* 字數提示 */}
                {isEditing && (
                  <div className="mt-2 text-xs text-zinc-400">
                    {segment.text.length < 20 && (
                      <span className="text-yellow-400">⚠️ 至少需要 20 字</span>
                    )}
                    {segment.text.length > 100 && (
                      <span className="text-red-400">❌ 超過 100 字限制</span>
                    )}
                    {segment.text.length >= 20 && segment.text.length <= 100 && (
                      <span className="text-green-400">✓ 字數符合要求</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* 操作按鈕 */}
          <div className="flex gap-2 pt-4 border-t border-zinc-800">
            {!isEditing ? (
              <>
                <Button
                  onClick={() => setIsEditing(true)}
                  variant="outline"
                  size="sm"
                  className="flex-1"
                >
                  <Edit3 className="w-4 h-4 mr-2" />
                  編輯旁白
                </Button>
                <Button
                  onClick={handleRegenerate}
                  disabled={isRegenerating}
                  variant="outline"
                  size="sm"
                  className="flex-1"
                >
                  {isRegenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      重新生成中...
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-4 h-4 mr-2" />
                      AI 重新生成
                    </>
                  )}
                </Button>
              </>
            ) : (
              <>
                <Button
                  onClick={handleSave}
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
                      保存編輯
                    </>
                  )}
                </Button>
                <Button
                  onClick={handleCancel}
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
            💡 提示：每個旁白片段應為 20-100 字，約 8 秒語音長度。您可以編輯旁白或場景描述，也可以要求 AI 重新生成。
          </div>
        </CardContent>
      </CollapsibleContent>
    </Card>
  );
}
