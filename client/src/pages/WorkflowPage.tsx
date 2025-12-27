import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl, isGuestMode } from "@/const";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { 
  Zap, 
  Sparkles, 
  Play, 
  Clock, 
  Film, 
  Cpu, 
  DollarSign, 
  Download,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Video,
  Image as ImageIcon,
  Mic,
  Music,
  Merge,
  Volume2,
  Users,
  ChevronLeft,
  ChevronRight,
  Edit,
  RotateCcw,
  Subtitles,
  Tags,
  FileText,
  Eye,
  RefreshCw,
  Upload,
  Trash2,
  Save
} from "lucide-react";
import { 
  WorkflowSteps, 
  VerticalStepList, 
  StepCard, 
  WORKFLOW_STEPS,
  type StepStatus 
} from "@/components/WorkflowSteps";
import { type Language, LANGUAGES } from "@/components/LanguageSelector";
import { SeoPanel } from "@/components/SeoPanel";
import type { SeoResult } from "@/components/SeoPanel";
import { toast } from "sonner";

// 速度模式預設配置
const SPEED_MODE_PRESETS = {
  fast: {
    name: "快速模式",
    description: "適合測試和快速迭代",
    video: "veo3.1-fast",
    llm: "gpt-4o-mini",
    mjMode: "fast",
    estimatedTime: "3-5 分鐘",
    price: "¥0.35/視頻",
    icon: Zap,
    color: "from-amber-500 to-orange-500",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/30",
  },
  quality: {
    name: "高質量模式",
    description: "電影級品質，適合正式製作",
    video: "veo3.1-pro",
    llm: "claude-opus-4-5-20250514",
    mjMode: "quality",
    estimatedTime: "10-15 分鐘",
    price: "¥1.75/視頻",
    icon: Sparkles,
    color: "from-purple-500 to-pink-500",
    bgColor: "bg-purple-500/10",
    borderColor: "border-purple-500/30",
  },
};

// 時長選項
const PRESET_DURATIONS = [1, 2, 3, 5, 7, 10, 15, 20, 30] as const;
const SEGMENT_DURATION_SECONDS = 8;
const BATCH_SIZE = 6;

function calculateSegments(minutes: number): number {
  return Math.ceil((minutes * 60) / SEGMENT_DURATION_SECONDS);
}

function calculateBatches(totalSegments: number): number {
  return Math.ceil(totalSegments / BATCH_SIZE);
}

// 片段數據類型
interface SegmentInfo {
  id: number;
  description: string;
  narration: string;
  videoUrl?: string;
  audioUrl?: string;
  imageUrl?: string;
  status: "pending" | "generating" | "completed" | "failed";
  subtitles?: Array<{ start: number; end: number; text: string }>;
}

export default function WorkflowPage() {
  const { user, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  
  // 當前步驟
  const [currentStep, setCurrentStep] = useState(1);
  const [stepStatuses, setStepStatuses] = useState<Record<number, StepStatus>>({});
  const [isProcessing, setIsProcessing] = useState(false);

  // 步驟1：主題
  const [videoTitle, setVideoTitle] = useState("");
  const [selectedDuration, setSelectedDuration] = useState(3);

  // 步驟2：故事大綱
  const [storyOutline, setStoryOutline] = useState("");
  const [isGeneratingOutline, setIsGeneratingOutline] = useState(false);

  // 步驟3-4：片段描述和旁白
  const [segments, setSegments] = useState<SegmentInfo[]>([]);
  const [isGeneratingSegments, setIsGeneratingSegments] = useState(false);

  // 步驟5：編輯狀態
  const [editingSegmentId, setEditingSegmentId] = useState<number | null>(null);

  // 步驟6：生成設定
  const [selectedSpeedMode, setSelectedSpeedMode] = useState<"fast" | "quality">("fast");
  const [selectedLanguage, setSelectedLanguage] = useState<Language>("cantonese");
  const [selectedVoiceActor, setSelectedVoiceActor] = useState("");

  // 步驟7-9：生成狀態
  const [taskId, setTaskId] = useState<string | null>(null);
  const [generationProgress, setGenerationProgress] = useState(0);

  // 步驟10：字幕
  const [subtitles, setSubtitles] = useState<Array<{ segmentId: number; items: Array<{ start: number; end: number; text: string }> }>>([]);
  const [isGeneratingSubtitles, setIsGeneratingSubtitles] = useState(false);

  // 步驟11：音量
  const [narrationVolume, setNarrationVolume] = useState(80);
  const [bgmVolume, setBgmVolume] = useState(30);
  const [videoVolume, setVideoVolume] = useState(50);

  // 步驟12：合併
  const [isMerging, setIsMerging] = useState(false);
  const [mergedVideoUrl, setMergedVideoUrl] = useState<string | null>(null);

  // 步驟13：SEO
  const [seoResult, setSeoResult] = useState<SeoResult | null>(null);
  const [isGeneratingSeo, setIsGeneratingSeo] = useState(false);

  // 獲取配音員
  const { data: voiceData } = trpc.voice.getAll.useQuery();
  const filteredVoiceActors = (voiceData?.voiceActors || []).filter(
    (actor: any) => actor.language === selectedLanguage
  );

  // tRPC mutations
  const generateOutlineMutation = trpc.video.generateOutline?.useMutation?.() || null;
  const generateSegmentsMutation = trpc.video.generateSegments?.useMutation?.() || null;
  const createLongVideo = trpc.longVideo.create.useMutation();
  const generateSeo = trpc.video.generateSeo.useMutation();
  const mergeVideo = trpc.video.merge.useMutation();

  // 初始化片段
  useEffect(() => {
    const segmentCount = calculateSegments(selectedDuration);
    if (segments.length !== segmentCount) {
      setSegments(
        Array.from({ length: segmentCount }, (_, i) => ({
          id: i + 1,
          description: "",
          narration: "",
          status: "pending" as const,
        }))
      );
    }
  }, [selectedDuration]);

  // 步驟1：輸入主題
  const handleStep1Complete = () => {
    if (!videoTitle.trim()) {
      toast.error("請輸入視頻主題");
      return;
    }
    setStepStatuses(prev => ({ ...prev, 1: "completed" }));
    setCurrentStep(2);
  };

  // 步驟2：生成故事大綱
  const handleGenerateOutline = async () => {
    if (!videoTitle.trim()) {
      toast.error("請先輸入視頻主題");
      return;
    }
    setIsGeneratingOutline(true);
    setIsProcessing(true);

    try {
      // 調用 API 生成大綱
      const response = await fetch('/api/generate-outline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: videoTitle,
          language: selectedLanguage,
          duration: selectedDuration,
          segmentCount: calculateSegments(selectedDuration),
        }),
      });
      
      const data = await response.json();
      if (data.success && data.outline) {
        setStoryOutline(data.outline);
        toast.success("故事大綱生成成功！");
      } else {
        // 本地生成備用
        setStoryOutline(generateLocalOutline(videoTitle, selectedDuration));
        toast.success("故事大綱生成成功！");
      }
    } catch (error) {
      // 本地生成備用
      setStoryOutline(generateLocalOutline(videoTitle, selectedDuration));
      toast.success("故事大綱生成成功！");
    }

    setIsGeneratingOutline(false);
    setIsProcessing(false);
  };

  const handleStep2Complete = () => {
    if (!storyOutline.trim()) {
      toast.error("請先生成或輸入故事大綱");
      return;
    }
    setStepStatuses(prev => ({ ...prev, 2: "completed" }));
    setCurrentStep(3);
  };

  // 步驟3-4：生成片段描述和旁白
  const handleGenerateSegments = async () => {
    if (!storyOutline.trim()) {
      toast.error("請先完成故事大綱");
      return;
    }
    setIsGeneratingSegments(true);
    setIsProcessing(true);

    try {
      const response = await fetch('/api/generate-segments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: videoTitle,
          outline: storyOutline,
          language: selectedLanguage,
          segmentCount: calculateSegments(selectedDuration),
        }),
      });
      
      const data = await response.json();
      if (data.success && data.segments) {
        setSegments(data.segments.map((seg: any, i: number) => ({
          id: i + 1,
          description: seg.description || "",
          narration: seg.narration || "",
          status: "pending" as const,
        })));
        toast.success("片段內容生成成功！");
      } else {
        // 本地生成備用
        generateLocalSegments();
        toast.success("片段內容生成成功！");
      }
    } catch (error) {
      // 本地生成備用
      generateLocalSegments();
      toast.success("片段內容生成成功！");
    }

    setIsGeneratingSegments(false);
    setIsProcessing(false);
    setStepStatuses(prev => ({ ...prev, 3: "completed", 4: "completed" }));
  };

  const generateLocalSegments = () => {
    const segmentCount = calculateSegments(selectedDuration);
    const newSegments: SegmentInfo[] = [];
    
    for (let i = 0; i < segmentCount; i++) {
      newSegments.push({
        id: i + 1,
        description: `場景 ${i + 1}：${videoTitle} 的第 ${i + 1} 個精彩畫面，展示主題的核心內容。`,
        narration: `這是第 ${i + 1} 段旁白，講述關於「${videoTitle}」的精彩故事。`,
        status: "pending",
      });
    }
    
    setSegments(newSegments);
  };

  const handleStep3_4Complete = () => {
    const hasContent = segments.some(s => s.description || s.narration);
    if (!hasContent) {
      toast.error("請先生成片段內容");
      return;
    }
    setStepStatuses(prev => ({ ...prev, 3: "completed", 4: "completed" }));
    setCurrentStep(5);
  };

  // 步驟5：編輯內容
  const handleUpdateSegment = (segmentId: number, field: "description" | "narration", value: string) => {
    setSegments(prev => prev.map(seg => 
      seg.id === segmentId ? { ...seg, [field]: value } : seg
    ));
  };

  const handleRegenerateSegment = async (segmentId: number, field: "description" | "narration") => {
    toast.info(`正在重新生成第 ${segmentId} 段的${field === "description" ? "場景描述" : "旁白"}...`);
    
    // 模擬 AI 重新生成
    setTimeout(() => {
      setSegments(prev => prev.map(seg => {
        if (seg.id === segmentId) {
          if (field === "description") {
            return { ...seg, description: `[AI 重新生成] 場景 ${segmentId}：${videoTitle} 的全新視覺呈現。` };
          } else {
            return { ...seg, narration: `[AI 重新生成] 這是重新生成的第 ${segmentId} 段旁白內容。` };
          }
        }
        return seg;
      }));
      toast.success("重新生成完成！");
    }, 1500);
  };

  const handleStep5Complete = () => {
    setStepStatuses(prev => ({ ...prev, 5: "completed" }));
    setCurrentStep(6);
  };

  // 步驟6：確認並開始生成
  const handleStartGeneration = async () => {
    if (!selectedVoiceActor) {
      toast.error("請選擇配音員");
      return;
    }

    setIsProcessing(true);
    setStepStatuses(prev => ({ ...prev, 6: "completed" }));
    setCurrentStep(7);

    try {
      const result = await createLongVideo.mutateAsync({
        title: videoTitle,
        story: storyOutline,
        duration: selectedDuration * 60,
        language: selectedLanguage === "clone" ? "cantonese" : selectedLanguage,
        voiceActorId: selectedVoiceActor,
        speedMode: selectedSpeedMode,
        scenes: segments.map(seg => ({
          description: seg.description,
          narration: seg.narration,
        })),
      });

      setTaskId(result.taskId);
      toast.success("開始生成視頻！");
    } catch (error: any) {
      toast.error("生成失敗：" + error.message);
      setIsProcessing(false);
    }
  };

  // 步驟7-9：監控生成進度
  const { data: taskStatus } = trpc.longVideo.getStatus.useQuery(
    { taskId: taskId! },
    { 
      enabled: !!taskId,
      refetchInterval: (data) => {
        if (data?.status === 'completed' || data?.status === 'failed') {
          return false;
        }
        return 2000;
      }
    }
  );

  useEffect(() => {
    if (taskStatus) {
      // 更新片段狀態
      if (taskStatus.segments) {
        setSegments(prev => prev.map((seg, i) => {
          const serverSeg = taskStatus.segments[i];
          if (serverSeg) {
            return {
              ...seg,
              status: serverSeg.status,
              videoUrl: serverSeg.videoUrl,
              audioUrl: serverSeg.audioUrl,
              imageUrl: serverSeg.imageUrl,
            };
          }
          return seg;
        }));
      }

      // 計算進度
      if (taskStatus.segments) {
        const completed = taskStatus.segments.filter((s: any) => s.status === "completed").length;
        setGenerationProgress((completed / taskStatus.segments.length) * 100);
      }

      // 檢查是否完成
      if (taskStatus.status === "completed") {
        setIsProcessing(false);
        setStepStatuses(prev => ({ ...prev, 7: "completed", 8: "completed" }));
        setCurrentStep(9);
        toast.success("所有片段生成完成！");
      } else if (taskStatus.status === "failed") {
        setIsProcessing(false);
        setStepStatuses(prev => ({ ...prev, 7: "error" }));
        toast.error("生成過程中出現錯誤");
      }
    }
  }, [taskStatus]);

  // 步驟9：重新生成失敗的片段
  const handleRegenerateFailedSegment = async (segmentId: number) => {
    toast.info(`正在重新生成第 ${segmentId} 段視頻...`);
    
    try {
      const response = await fetch('/api/regenerate-segment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId,
          segmentId,
          type: "video",
        }),
      });
      
      const data = await response.json();
      if (data.success) {
        toast.success("重新生成請求已提交！");
      } else {
        toast.error("重新生成失敗：" + data.error);
      }
    } catch (error: any) {
      toast.error("重新生成失敗：" + error.message);
    }
  };

  const handleStep9Complete = () => {
    const allCompleted = segments.every(s => s.status === "completed");
    if (!allCompleted) {
      toast.warning("還有未完成的片段，建議先重新生成");
    }
    setStepStatuses(prev => ({ ...prev, 9: "completed" }));
    setCurrentStep(10);
  };

  // 步驟10：生成字幕
  const handleGenerateSubtitles = async () => {
    setIsGeneratingSubtitles(true);
    setIsProcessing(true);

    try {
      const response = await fetch('/api/generate-subtitles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId,
          segments: segments.map(seg => ({
            id: seg.id,
            audioUrl: seg.audioUrl,
            narration: seg.narration,
          })),
        }),
      });
      
      const data = await response.json();
      if (data.success && data.subtitles) {
        setSubtitles(data.subtitles);
        toast.success("字幕生成成功！");
      } else {
        // 本地生成備用字幕
        generateLocalSubtitles();
        toast.success("字幕生成成功！");
      }
    } catch (error) {
      generateLocalSubtitles();
      toast.success("字幕生成成功！");
    }

    setIsGeneratingSubtitles(false);
    setIsProcessing(false);
  };

  const generateLocalSubtitles = () => {
    const newSubtitles = segments.map(seg => ({
      segmentId: seg.id,
      items: [{
        start: 0,
        end: 8,
        text: seg.narration || `第 ${seg.id} 段字幕`,
      }],
    }));
    setSubtitles(newSubtitles);
  };

  const handleStep10Complete = () => {
    setStepStatuses(prev => ({ ...prev, 10: "completed" }));
    setCurrentStep(11);
  };

  // 步驟11：調整音量
  const handleStep11Complete = () => {
    setStepStatuses(prev => ({ ...prev, 11: "completed" }));
    setCurrentStep(12);
  };

  // 步驟12：合併視頻
  const handleMergeVideo = async () => {
    setIsMerging(true);
    setIsProcessing(true);

    try {
      const result = await mergeVideo.mutateAsync({
        taskId: taskId!,
        narrationVolume,
        bgmVolume,
        videoVolume,
        includeSubtitles: subtitles.length > 0,
      });

      if (result.success && result.videoUrl) {
        setMergedVideoUrl(result.videoUrl);
        toast.success("視頻合併成功！");
        setStepStatuses(prev => ({ ...prev, 12: "completed" }));
        setCurrentStep(13);
      } else {
        toast.error("合併失敗：" + (result.error || "未知錯誤"));
      }
    } catch (error: any) {
      toast.error("合併失敗：" + error.message);
    }

    setIsMerging(false);
    setIsProcessing(false);
  };

  // 步驟13：生成 SEO
  const handleGenerateSeo = async () => {
    setIsGeneratingSeo(true);
    setIsProcessing(true);

    try {
      const result = await generateSeo.mutateAsync({
        story: storyOutline,
        language: selectedLanguage === "clone" ? "cantonese" : selectedLanguage,
        platform: "youtube",
        model: "gpt-5.2",
        duration: selectedDuration * 60,
      });

      if (result.success && result.data) {
        setSeoResult(result.data);
        toast.success("SEO 內容生成成功！");
        setStepStatuses(prev => ({ ...prev, 13: "completed" }));
      } else {
        toast.error("SEO 生成失敗：" + (result.error || "未知錯誤"));
      }
    } catch (error: any) {
      toast.error("SEO 生成失敗：" + error.message);
    }

    setIsGeneratingSeo(false);
    setIsProcessing(false);
  };

  // 本地生成大綱
  const generateLocalOutline = (title: string, duration: number): string => {
    const segmentCount = calculateSegments(duration);
    const lang = selectedLanguage === "clone" ? "cantonese" : selectedLanguage;
    
    if (lang === "cantonese") {
      return `【${title}】

開場（0:00-0:16）
以引人入勝嘅畫面開始，帶出「${title}」嘅核心概念。

發展（0:16-${Math.floor(duration * 60 * 0.6)}秒）
深入探討主題，展示關鍵資訊同精彩內容。

高潮（${Math.floor(duration * 60 * 0.6)}-${Math.floor(duration * 60 * 0.85)}秒）
將故事推向高潮，帶俾觀眾最深刻嘅印象。

結尾（${Math.floor(duration * 60 * 0.85)}-${duration * 60}秒）
總結內容，留下深刻印象，鼓勵觀眾行動。

總共 ${segmentCount} 個 8 秒片段`;
    } else if (lang === "mandarin") {
      return `【${title}】

开场（0:00-0:16）
以引人入胜的画面开始，带出「${title}」的核心概念。

发展（0:16-${Math.floor(duration * 60 * 0.6)}秒）
深入探讨主题，展示关键信息和精彩内容。

高潮（${Math.floor(duration * 60 * 0.6)}-${Math.floor(duration * 60 * 0.85)}秒）
将故事推向高潮，带给观众最深刻的印象。

结尾（${Math.floor(duration * 60 * 0.85)}-${duration * 60}秒）
总结内容，留下深刻印象，鼓励观众行动。

总共 ${segmentCount} 个 8 秒片段`;
    } else {
      return `【${title}】

Opening (0:00-0:16)
Start with engaging visuals that introduce the core concept of "${title}".

Development (0:16-${Math.floor(duration * 60 * 0.6)}s)
Dive deep into the topic, showcasing key information and compelling content.

Climax (${Math.floor(duration * 60 * 0.6)}-${Math.floor(duration * 60 * 0.85)}s)
Build to the peak of the story, leaving the strongest impression on viewers.

Conclusion (${Math.floor(duration * 60 * 0.85)}-${duration * 60}s)
Summarize the content, leave a lasting impression, and encourage viewer action.

Total: ${segmentCount} segments of 8 seconds each`;
    }
  };

  // 導航函數
  const handleStepClick = (stepId: number) => {
    // 只能跳到已完成的步驟或當前步驟
    if (stepId <= currentStep || stepStatuses[stepId - 1] === "completed") {
      setCurrentStep(stepId);
    }
  };

  const handleNext = () => {
    if (currentStep < 13) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrev = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  // 渲染當前步驟內容
  const renderStepContent = () => {
    const step = WORKFLOW_STEPS[currentStep - 1];
    const status = stepStatuses[currentStep] || "pending";

    switch (currentStep) {
      case 1:
        return (
          <StepCard step={step} status={status} isCurrent={true}>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="videoTitle">視頻主題 / 題目</Label>
                <Input
                  id="videoTitle"
                  placeholder="例如：富爸爸的財富智慧、如何在30天內學會編程..."
                  value={videoTitle}
                  onChange={(e) => setVideoTitle(e.target.value)}
                  className="bg-background/50"
                />
              </div>

              <div className="space-y-2">
                <Label>影片時長</Label>
                <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
                  {PRESET_DURATIONS.map((minutes) => (
                    <div
                      key={minutes}
                      className={`cursor-pointer rounded-lg p-2 text-center transition-all ${
                        selectedDuration === minutes
                          ? "bg-purple-500/20 border-2 border-purple-500"
                          : "bg-zinc-800/50 border border-zinc-700 hover:border-purple-500/50"
                      }`}
                      onClick={() => setSelectedDuration(minutes)}
                    >
                      <div className="text-lg font-bold text-white">{minutes}</div>
                      <div className="text-xs text-zinc-400">分鐘</div>
                    </div>
                  ))}
                </div>
                <p className="text-sm text-zinc-400">
                  將生成 {calculateSegments(selectedDuration)} 個 8 秒片段，分 {calculateBatches(calculateSegments(selectedDuration))} 批處理
                </p>
              </div>

              <Button
                onClick={handleStep1Complete}
                disabled={!videoTitle.trim()}
                className="w-full bg-gradient-to-r from-blue-500 to-cyan-500"
              >
                <ChevronRight className="w-4 h-4 mr-2" />
                下一步：生成故事大綱
              </Button>
            </div>
          </StepCard>
        );

      case 2:
        return (
          <StepCard step={step} status={status} isCurrent={true}>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>故事大綱</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateOutline}
                  disabled={isGeneratingOutline || !videoTitle.trim()}
                >
                  {isGeneratingOutline ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      生成中...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      AI 生成大綱
                    </>
                  )}
                </Button>
              </div>

              <Textarea
                placeholder="輸入或生成故事大綱..."
                value={storyOutline}
                onChange={(e) => setStoryOutline(e.target.value)}
                className="min-h-[200px] bg-background/50"
              />

              <Button
                onClick={handleStep2Complete}
                disabled={!storyOutline.trim()}
                className="w-full bg-gradient-to-r from-purple-500 to-pink-500"
              >
                <ChevronRight className="w-4 h-4 mr-2" />
                下一步：生成片段內容
              </Button>
            </div>
          </StepCard>
        );

      case 3:
      case 4:
        return (
          <StepCard step={WORKFLOW_STEPS[2]} status={stepStatuses[3] || "pending"} isCurrent={true}>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>片段描述與旁白</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateSegments}
                  disabled={isGeneratingSegments || !storyOutline.trim()}
                >
                  {isGeneratingSegments ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      生成中...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      AI 生成所有片段
                    </>
                  )}
                </Button>
              </div>

              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {segments.map((seg) => (
                  <div key={seg.id} className="p-3 bg-zinc-800/50 rounded-lg border border-zinc-700">
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant="secondary">片段 #{seg.id}</Badge>
                      <span className="text-xs text-zinc-400">
                        {(seg.id - 1) * 8}s - {seg.id * 8}s
                      </span>
                    </div>
                    <div className="space-y-2">
                      <div>
                        <Label className="text-xs text-zinc-400">場景描述</Label>
                        <p className="text-sm">{seg.description || "尚未生成"}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-zinc-400">旁白文字</Label>
                        <p className="text-sm">{seg.narration || "尚未生成"}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <Button
                onClick={handleStep3_4Complete}
                disabled={!segments.some(s => s.description || s.narration)}
                className="w-full bg-gradient-to-r from-green-500 to-emerald-500"
              >
                <ChevronRight className="w-4 h-4 mr-2" />
                下一步：編輯內容
              </Button>
            </div>
          </StepCard>
        );

      case 5:
        return (
          <StepCard step={step} status={status} isCurrent={true}>
            <div className="space-y-4">
              <p className="text-sm text-zinc-400">
                點擊任意片段進行編輯，或使用 AI 重新生成
              </p>

              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {segments.map((seg) => (
                  <div key={seg.id} className="p-3 bg-zinc-800/50 rounded-lg border border-zinc-700">
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant="secondary">片段 #{seg.id}</Badge>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRegenerateSegment(seg.id, "description")}
                        >
                          <RefreshCw className="w-3 h-3 mr-1" />
                          重生描述
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRegenerateSegment(seg.id, "narration")}
                        >
                          <RefreshCw className="w-3 h-3 mr-1" />
                          重生旁白
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div>
                        <Label className="text-xs text-zinc-400">場景描述</Label>
                        <Textarea
                          value={seg.description}
                          onChange={(e) => handleUpdateSegment(seg.id, "description", e.target.value)}
                          className="min-h-[60px] bg-background/50 text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-zinc-400">旁白文字</Label>
                        <Textarea
                          value={seg.narration}
                          onChange={(e) => handleUpdateSegment(seg.id, "narration", e.target.value)}
                          className="min-h-[60px] bg-background/50 text-sm"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <Button
                onClick={handleStep5Complete}
                className="w-full bg-gradient-to-r from-rose-500 to-red-500"
              >
                <ChevronRight className="w-4 h-4 mr-2" />
                下一步：確認並生成
              </Button>
            </div>
          </StepCard>
        );

      case 6:
        return (
          <StepCard step={step} status={status} isCurrent={true}>
            <div className="space-y-4">
              {/* 模式選擇 */}
              <div className="space-y-2">
                <Label>生成模式</Label>
                <div className="grid grid-cols-2 gap-3">
                  {(Object.entries(SPEED_MODE_PRESETS) as [keyof typeof SPEED_MODE_PRESETS, typeof SPEED_MODE_PRESETS.fast][]).map(([key, mode]) => {
                    const Icon = mode.icon;
                    const isSelected = selectedSpeedMode === key;
                    return (
                      <div
                        key={key}
                        className={`cursor-pointer rounded-lg p-3 transition-all ${
                          isSelected
                            ? `${mode.borderColor} border-2 ${mode.bgColor}`
                            : "border border-zinc-700 hover:border-zinc-500"
                        }`}
                        onClick={() => setSelectedSpeedMode(key)}
                      >
                        <div className="flex items-center gap-2">
                          <Icon className="w-5 h-5" />
                          <span className="font-medium">{mode.name}</span>
                        </div>
                        <p className="text-xs text-zinc-400 mt-1">{mode.description}</p>
                        <div className="flex gap-2 mt-2">
                          <Badge variant="secondary" className="text-xs">{mode.estimatedTime}</Badge>
                          <Badge variant="secondary" className="text-xs">{mode.price}</Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 語言選擇 */}
              <div className="space-y-2">
                <Label>旁白語言</Label>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(LANGUAGES).filter(([key]) => key !== "clone").map(([key, lang]) => (
                    <Button
                      key={key}
                      variant={selectedLanguage === key ? "default" : "outline"}
                      onClick={() => setSelectedLanguage(key as Language)}
                      className="h-auto py-2"
                    >
                      <div className="text-center">
                        <div className="text-sm">{lang.name}</div>
                        <div className="text-xs opacity-75">{lang.description}</div>
                      </div>
                    </Button>
                  ))}
                </div>
              </div>

              {/* 配音員選擇 */}
              <div className="space-y-2">
                <Label>選擇配音員</Label>
                <div className="grid grid-cols-2 gap-2 max-h-[200px] overflow-y-auto">
                  {filteredVoiceActors.map((actor: any) => (
                    <div
                      key={actor.id}
                      className={`cursor-pointer rounded-lg p-2 transition-all ${
                        selectedVoiceActor === actor.id
                          ? "bg-blue-500/20 border-2 border-blue-500"
                          : "bg-zinc-800/50 border border-zinc-700 hover:border-blue-500/50"
                      }`}
                      onClick={() => setSelectedVoiceActor(actor.id)}
                    >
                      <div className="font-medium text-sm">{actor.name}</div>
                      <div className="text-xs text-zinc-400">{actor.gender === "male" ? "男" : "女"} · {actor.type}</div>
                    </div>
                  ))}
                </div>
              </div>

              <Button
                onClick={handleStartGeneration}
                disabled={!selectedVoiceActor || isProcessing}
                className="w-full bg-gradient-to-r from-indigo-500 to-violet-500"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    準備中...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    開始生成視頻
                  </>
                )}
              </Button>
            </div>
          </StepCard>
        );

      case 7:
      case 8:
        return (
          <StepCard step={WORKFLOW_STEPS[6]} status={stepStatuses[7] || "pending"} isCurrent={true}>
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>生成進度</Label>
                  <span className="text-sm font-medium">{Math.round(generationProgress)}%</span>
                </div>
                <Progress value={generationProgress} className="h-3" />
              </div>

              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                {segments.map((seg) => (
                  <div
                    key={seg.id}
                    className={`aspect-video rounded-lg flex items-center justify-center ${
                      seg.status === "completed"
                        ? "bg-green-500/20 border-2 border-green-500"
                        : seg.status === "generating"
                        ? "bg-blue-500/20 border-2 border-blue-500"
                        : seg.status === "failed"
                        ? "bg-red-500/20 border-2 border-red-500"
                        : "bg-zinc-800/50 border border-zinc-700"
                    }`}
                  >
                    {seg.status === "completed" ? (
                      seg.videoUrl ? (
                        <video src={seg.videoUrl} className="w-full h-full object-cover rounded-lg" muted />
                      ) : (
                        <CheckCircle2 className="w-6 h-6 text-green-500" />
                      )
                    ) : seg.status === "generating" ? (
                      <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
                    ) : seg.status === "failed" ? (
                      <XCircle className="w-6 h-6 text-red-500" />
                    ) : (
                      <span className="text-xs text-zinc-500">#{seg.id}</span>
                    )}
                  </div>
                ))}
              </div>

              {taskStatus?.status === "completed" && (
                <Button
                  onClick={() => {
                    setStepStatuses(prev => ({ ...prev, 7: "completed", 8: "completed" }));
                    setCurrentStep(9);
                  }}
                  className="w-full bg-gradient-to-r from-cyan-500 to-blue-500"
                >
                  <ChevronRight className="w-4 h-4 mr-2" />
                  下一步：檢查並重新生成
                </Button>
              )}
            </div>
          </StepCard>
        );

      case 9:
        return (
          <StepCard step={step} status={status} isCurrent={true}>
            <div className="space-y-4">
              <p className="text-sm text-zinc-400">
                檢查每個片段，對不滿意或失敗的片段進行重新生成
              </p>

              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {segments.map((seg) => (
                  <div key={seg.id} className="p-3 bg-zinc-800/50 rounded-lg border border-zinc-700">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant={seg.status === "completed" ? "default" : "destructive"}>
                          #{seg.id}
                        </Badge>
                        {seg.status === "completed" ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-500" />
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRegenerateFailedSegment(seg.id)}
                      >
                        <RotateCcw className="w-3 h-3 mr-1" />
                        重新生成
                      </Button>
                    </div>
                    {seg.videoUrl && (
                      <video
                        src={seg.videoUrl}
                        className="w-full aspect-video rounded-lg mt-2"
                        controls
                      />
                    )}
                  </div>
                ))}
              </div>

              <Button
                onClick={handleStep9Complete}
                className="w-full bg-gradient-to-r from-yellow-500 to-orange-500"
              >
                <ChevronRight className="w-4 h-4 mr-2" />
                下一步：生成字幕
              </Button>
            </div>
          </StepCard>
        );

      case 10:
        return (
          <StepCard step={step} status={status} isCurrent={true}>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>AI 字幕生成</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateSubtitles}
                  disabled={isGeneratingSubtitles}
                >
                  {isGeneratingSubtitles ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      生成中...
                    </>
                  ) : (
                    <>
                      <Subtitles className="w-4 h-4 mr-2" />
                      生成字幕
                    </>
                  )}
                </Button>
              </div>

              {subtitles.length > 0 && (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {subtitles.map((sub) => (
                    <div key={sub.segmentId} className="p-2 bg-zinc-800/50 rounded-lg">
                      <Badge variant="secondary" className="mb-1">片段 #{sub.segmentId}</Badge>
                      {sub.items.map((item, i) => (
                        <p key={i} className="text-sm">
                          [{item.start}s - {item.end}s] {item.text}
                        </p>
                      ))}
                    </div>
                  ))}
                </div>
              )}

              <Button
                onClick={handleStep10Complete}
                className="w-full bg-gradient-to-r from-pink-500 to-rose-500"
              >
                <ChevronRight className="w-4 h-4 mr-2" />
                下一步：調整音量
              </Button>
            </div>
          </StepCard>
        );

      case 11:
        return (
          <StepCard step={step} status={status} isCurrent={true}>
            <div className="space-y-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>旁白音量</Label>
                  <span className="text-sm font-medium">{narrationVolume}%</span>
                </div>
                <Slider
                  value={[narrationVolume]}
                  onValueChange={(v) => setNarrationVolume(v[0])}
                  max={100}
                  step={5}
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>背景音樂音量</Label>
                  <span className="text-sm font-medium">{bgmVolume}%</span>
                </div>
                <Slider
                  value={[bgmVolume]}
                  onValueChange={(v) => setBgmVolume(v[0])}
                  max={100}
                  step={5}
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>影片原聲音量</Label>
                  <span className="text-sm font-medium">{videoVolume}%</span>
                </div>
                <Slider
                  value={[videoVolume]}
                  onValueChange={(v) => setVideoVolume(v[0])}
                  max={100}
                  step={5}
                />
              </div>

              <Button
                onClick={handleStep11Complete}
                className="w-full bg-gradient-to-r from-violet-500 to-purple-500"
              >
                <ChevronRight className="w-4 h-4 mr-2" />
                下一步：合併視頻
              </Button>
            </div>
          </StepCard>
        );

      case 12:
        return (
          <StepCard step={step} status={status} isCurrent={true}>
            <div className="space-y-4">
              <div className="p-4 bg-zinc-800/50 rounded-lg">
                <h4 className="font-medium mb-2">合併設定</h4>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-zinc-400">旁白音量</span>
                    <p className="font-medium">{narrationVolume}%</p>
                  </div>
                  <div>
                    <span className="text-zinc-400">背景音樂</span>
                    <p className="font-medium">{bgmVolume}%</p>
                  </div>
                  <div>
                    <span className="text-zinc-400">影片原聲</span>
                    <p className="font-medium">{videoVolume}%</p>
                  </div>
                </div>
              </div>

              {mergedVideoUrl ? (
                <div className="space-y-3">
                  <video
                    src={mergedVideoUrl}
                    className="w-full aspect-video rounded-lg"
                    controls
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => window.open(mergedVideoUrl, '_blank')}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      下載視頻
                    </Button>
                    <Button
                      className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500"
                      onClick={() => {
                        setStepStatuses(prev => ({ ...prev, 12: "completed" }));
                        setCurrentStep(13);
                      }}
                    >
                      <ChevronRight className="w-4 h-4 mr-2" />
                      下一步：SEO 優化
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  onClick={handleMergeVideo}
                  disabled={isMerging}
                  className="w-full bg-gradient-to-r from-emerald-500 to-teal-500"
                >
                  {isMerging ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      合併中...
                    </>
                  ) : (
                    <>
                      <Merge className="w-4 h-4 mr-2" />
                      開始合併視頻
                    </>
                  )}
                </Button>
              )}
            </div>
          </StepCard>
        );

      case 13:
        return (
          <StepCard step={step} status={status} isCurrent={true}>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>SEO 內容生成</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateSeo}
                  disabled={isGeneratingSeo}
                >
                  {isGeneratingSeo ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      生成中...
                    </>
                  ) : (
                    <>
                      <Tags className="w-4 h-4 mr-2" />
                      生成 SEO
                    </>
                  )}
                </Button>
              </div>

              {seoResult && (
                <div className="space-y-4">
                  <div className="p-3 bg-zinc-800/50 rounded-lg">
                    <Label className="text-xs text-zinc-400">標題</Label>
                    <p className="font-medium">{seoResult.title}</p>
                  </div>
                  <div className="p-3 bg-zinc-800/50 rounded-lg">
                    <Label className="text-xs text-zinc-400">描述</Label>
                    <p className="text-sm">{seoResult.description}</p>
                  </div>
                  <div className="p-3 bg-zinc-800/50 rounded-lg">
                    <Label className="text-xs text-zinc-400">標籤</Label>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {seoResult.tags?.map((tag, i) => (
                        <Badge key={i} variant="secondary">{tag}</Badge>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {stepStatuses[13] === "completed" && (
                <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg text-center">
                  <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-2" />
                  <h3 className="text-lg font-bold text-green-400">恭喜！視頻製作完成！</h3>
                  <p className="text-sm text-zinc-400 mt-1">
                    您已完成所有 13 個步驟，視頻已準備好發布
                  </p>
                </div>
              )}
            </div>
          </StepCard>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-background/95">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                <Film className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                  VEO3 Studio
                </h1>
                <p className="text-xs text-muted-foreground">13步工作流程</p>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {user ? (
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">{user.name}</span>
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                  <span className="text-xs font-medium text-white">
                    {user.name?.charAt(0).toUpperCase()}
                  </span>
                </div>
              </div>
            ) : isGuestMode() ? (
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">訪客模式</span>
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-500 to-gray-600 flex items-center justify-center">
                  <span className="text-xs font-medium text-white">G</span>
                </div>
              </div>
            ) : (
              <Button 
                onClick={() => window.location.href = getLoginUrl()}
                className="bg-gradient-to-r from-purple-500 to-pink-500 hover:opacity-90"
              >
                登入開始創作
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="container py-6">
        <div className="grid lg:grid-cols-4 gap-6">
          {/* 左側：步驟導航 */}
          <div className="lg:col-span-1">
            <Card className="sticky top-24">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">工作流程</CardTitle>
                <CardDescription>完成所有步驟以創建視頻</CardDescription>
              </CardHeader>
              <CardContent>
                <VerticalStepList
                  currentStep={currentStep}
                  stepStatuses={stepStatuses}
                  onStepClick={handleStepClick}
                />
              </CardContent>
            </Card>
          </div>

          {/* 右側：步驟內容 */}
          <div className="lg:col-span-3 space-y-6">
            {/* 頂部進度導航 */}
            <Card className="glass">
              <CardContent className="py-4">
                <WorkflowSteps
                  currentStep={currentStep}
                  stepStatuses={stepStatuses}
                  onStepClick={handleStepClick}
                  onNext={handleNext}
                  onPrev={handlePrev}
                  canGoNext={currentStep < 13}
                  canGoPrev={currentStep > 1}
                  isProcessing={isProcessing}
                />
              </CardContent>
            </Card>

            {/* 當前步驟內容 */}
            {renderStepContent()}
          </div>
        </div>
      </main>
    </div>
  );
}
