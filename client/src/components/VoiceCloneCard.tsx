import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Mic, 
  Upload, 
  Play, 
  Pause, 
  Trash2, 
  CheckCircle2, 
  AlertCircle,
  Loader2,
  Volume2,
  FileAudio,
  Sparkles,
  RefreshCw
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

interface ClonedVoice {
  id: number;
  voiceId: string;
  name: string;
  description: string | null;
  originalAudioUrl: string;
  sampleDuration: number | null;
  status: "processing" | "ready" | "failed";
  usageCount: number;
  createdAt: Date;
}

interface VoiceCloneCardProps {
  onVoiceCloned?: (voice: ClonedVoice) => void;
  selectedVoiceId?: string;
  onSelectVoice?: (voiceId: string | null) => void;
}

// 獲取或創建 sessionId
function getSessionId(): string {
  let sessionId = localStorage.getItem("po_session_id");
  if (!sessionId) {
    sessionId = `session_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 12)}`;
    localStorage.setItem("po_session_id", sessionId);
  }
  return sessionId;
}

export function VoiceCloneCard({ 
  onVoiceCloned, 
  selectedVoiceId,
  onSelectVoice 
}: VoiceCloneCardProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [voiceName, setVoiceName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const sessionId = getSessionId();

  // 從數據庫獲取克隆聲音列表
  const { data: clonedVoices = [], refetch, isLoading } = trpc.clonedVoice.list.useQuery(
    { sessionId, status: "ready" },
    { 
      refetchOnWindowFocus: false,
      staleTime: 30000, // 30 秒內不重新請求
    }
  );

  // 創建克隆聲音記錄
  const createVoiceMutation = trpc.clonedVoice.create.useMutation({
    onSuccess: () => {
      refetch();
    },
  });

  // 更新克隆聲音狀態
  const updateStatusMutation = trpc.clonedVoice.updateStatus.useMutation();

  // 刪除克隆聲音
  const deleteVoiceMutation = trpc.clonedVoice.delete.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("已刪除克隆聲音");
    },
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 驗證文件類型
    const validTypes = ["audio/mp3", "audio/mpeg", "audio/wav", "audio/m4a", "audio/webm"];
    if (!validTypes.includes(file.type) && !file.name.match(/\.(mp3|wav|m4a|webm)$/i)) {
      toast.error("請上傳 MP3、WAV、M4A 或 WebM 格式的音頻文件");
      return;
    }

    // 驗證文件大小 (最大 50MB)
    if (file.size > 50 * 1024 * 1024) {
      toast.error("文件大小不能超過 50MB");
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      // 模擬上傳進度
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 200);

      // 創建 FormData 上傳文件
      const formData = new FormData();
      formData.append("file", file);
      
      // 上傳到服務器
      const uploadResponse = await fetch("/api/upload/audio", {
        method: "POST",
        body: formData,
      });

      let audioUrl = "";
      if (uploadResponse.ok) {
        const uploadResult = await uploadResponse.json();
        audioUrl = uploadResult.url || URL.createObjectURL(file);
      } else {
        // 如果上傳失敗，使用本地 URL（臨時方案）
        audioUrl = URL.createObjectURL(file);
      }

      clearInterval(progressInterval);
      setUploadProgress(100);

      // 生成唯一的 voiceId
      const voiceId = `clone_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const name = voiceName || `克隆聲音 ${(clonedVoices?.length || 0) + 1}`;

      // 創建克隆聲音記錄到數據庫
      const newVoice = await createVoiceMutation.mutateAsync({
        sessionId,
        voiceId,
        name,
        originalAudioUrl: audioUrl,
        sampleDuration: 0,
      });

      // 更新狀態為 ready
      await updateStatusMutation.mutateAsync({
        voiceId,
        status: "ready",
      });

      if (newVoice) {
        onVoiceCloned?.(newVoice as ClonedVoice);
        onSelectVoice?.(voiceId);
      }
      
      toast.success("聲音克隆成功！");
      setVoiceName("");
      refetch();
    } catch (error) {
      console.error("聲音克隆失敗:", error);
      toast.error("聲音克隆失敗，請重試");
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handlePlay = (voice: ClonedVoice) => {
    if (playingId === voice.voiceId) {
      audioRef.current?.pause();
      setPlayingId(null);
    } else {
      if (audioRef.current) {
        audioRef.current.src = voice.originalAudioUrl;
        audioRef.current.play();
        setPlayingId(voice.voiceId);
      }
    }
  };

  const handleDelete = async (voiceId: string) => {
    try {
      await deleteVoiceMutation.mutateAsync({ voiceId });
      if (selectedVoiceId === voiceId) {
        onSelectVoice?.(null);
      }
    } catch (error) {
      toast.error("刪除失敗");
    }
  };

  return (
    <Card className="glass border-amber-500/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mic className="w-5 h-5 text-amber-500" />
          克隆聲音
          <Badge variant="outline" className="text-xs border-amber-500/50 text-amber-500">
            Beta
          </Badge>
          {isLoading && <Loader2 className="w-4 h-4 animate-spin text-amber-500" />}
        </CardTitle>
        <CardDescription>
          上傳語音樣本，AI 將克隆該聲音用於視頻配音
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 上傳區域 */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="voice-name" className="text-sm">聲音名稱（可選）</Label>
            <Input
              id="voice-name"
              placeholder="例如：我的聲音、角色A"
              value={voiceName}
              onChange={(e) => setVoiceName(e.target.value)}
              className="bg-background/50"
              disabled={isUploading}
            />
          </div>

          <div 
            className={`
              relative border-2 border-dashed rounded-xl p-8 text-center transition-all
              ${isUploading 
                ? "border-amber-500/50 bg-amber-500/5" 
                : "border-zinc-700 hover:border-amber-500/50 hover:bg-amber-500/5 cursor-pointer"
              }
            `}
            onClick={() => !isUploading && fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              onChange={handleFileSelect}
              className="hidden"
              disabled={isUploading}
            />
            
            {isUploading ? (
              <div className="space-y-4">
                <Loader2 className="w-12 h-12 mx-auto text-amber-500 animate-spin" />
                <div className="space-y-2">
                  <p className="text-amber-500 font-medium">正在克隆聲音...</p>
                  <Progress value={uploadProgress} className="h-2 max-w-xs mx-auto" />
                  <p className="text-sm text-zinc-400">{uploadProgress}%</p>
                </div>
              </div>
            ) : (
              <>
                <Upload className="w-12 h-12 mx-auto text-amber-500/70 mb-4" />
                <p className="text-lg font-medium text-zinc-200 mb-2">
                  點擊上傳語音樣本
                </p>
                <p className="text-sm text-zinc-400 mb-4">
                  支持 MP3、WAV、M4A 格式，建議 30 秒 - 3 分鐘
                </p>
                <div className="flex flex-wrap justify-center gap-2 text-xs text-zinc-500">
                  <span className="px-2 py-1 bg-zinc-800 rounded">清晰語音</span>
                  <span className="px-2 py-1 bg-zinc-800 rounded">無背景噪音</span>
                  <span className="px-2 py-1 bg-zinc-800 rounded">單人說話</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* 已克隆的聲音列表 */}
        {clonedVoices && clonedVoices.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium flex items-center gap-2">
                <FileAudio className="w-4 h-4 text-amber-500" />
                已克隆的聲音 ({clonedVoices.length})
              </Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => refetch()}
                className="h-7 px-2"
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                刷新
              </Button>
            </div>
            <div className="space-y-2">
              {clonedVoices.map((voice: any) => (
                <div
                  key={voice.voiceId}
                  className={`
                    flex items-center justify-between p-3 rounded-lg border transition-all cursor-pointer
                    ${selectedVoiceId === voice.voiceId 
                      ? "border-amber-500 bg-amber-500/10" 
                      : "border-zinc-700 hover:border-amber-500/50 bg-zinc-800/50"
                    }
                  `}
                  onClick={() => onSelectVoice?.(voice.voiceId)}
                >
                  <div className="flex items-center gap-3">
                    <div className={`
                      w-10 h-10 rounded-full flex items-center justify-center
                      ${selectedVoiceId === voice.voiceId ? "bg-amber-500" : "bg-zinc-700"}
                    `}>
                      {voice.status === "processing" ? (
                        <Loader2 className="w-5 h-5 text-white animate-spin" />
                      ) : voice.status === "ready" ? (
                        <Volume2 className="w-5 h-5 text-white" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-white" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-zinc-200">{voice.name}</p>
                      <p className="text-xs text-zinc-400">
                        {voice.status === "processing" ? "處理中..." : 
                         voice.status === "ready" ? `可用 · 使用 ${voice.usageCount || 0} 次` : "失敗"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {voice.status === "ready" && voice.originalAudioUrl && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePlay(voice as ClonedVoice);
                        }}
                      >
                        {playingId === voice.voiceId ? (
                          <Pause className="w-4 h-4" />
                        ) : (
                          <Play className="w-4 h-4" />
                        )}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(voice.voiceId);
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                    {selectedVoiceId === voice.voiceId && (
                      <CheckCircle2 className="w-5 h-5 text-amber-500" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 無克隆聲音時的提示 */}
        {!isLoading && (!clonedVoices || clonedVoices.length === 0) && (
          <div className="text-center py-4 text-zinc-500">
            <FileAudio className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">尚未克隆任何聲音</p>
            <p className="text-xs">上傳語音樣本開始克隆</p>
          </div>
        )}

        {/* 提示信息 */}
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
          <div className="flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-amber-200/80">
              <p className="font-medium mb-1">克隆聲音提示</p>
              <ul className="list-disc list-inside space-y-1 text-xs text-amber-200/60">
                <li>上傳清晰、無背景噪音的語音樣本效果最佳</li>
                <li>建議樣本時長 30 秒至 3 分鐘</li>
                <li>克隆的聲音將用於視頻的旁白配音</li>
              </ul>
            </div>
          </div>
        </div>

        {/* 隱藏的音頻播放器 */}
        <audio
          ref={audioRef}
          onEnded={() => setPlayingId(null)}
          className="hidden"
        />
      </CardContent>
    </Card>
  );
}

export default VoiceCloneCard;
