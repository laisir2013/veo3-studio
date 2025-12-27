import { useState, useEffect, useRef, useCallback } from "react";
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
  Save,
  Globe,
  Filter
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
import { getSessionId, setSessionId } from "@/hooks/useHistory";

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

// 配音員類型
interface VoiceActor {
  id: string;
  name: string;
  language: string;
  gender: "male" | "female";
  ageGroup?: string;
  style?: string | string[];  // 可以是字符串或數組
  sampleUrl?: string;
  type?: string;
}

export default function WorkflowPage() {
  const { user, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  
  // 當前步驟（現在是15步）
  const [currentStep, setCurrentStep] = useState(1);
  const [stepStatuses, setStepStatuses] = useState<Record<number, StepStatus>>({});
  const [isProcessing, setIsProcessing] = useState(false);

  // 步驟1：主題
  const [videoTitle, setVideoTitle] = useState("");
  const [selectedDuration, setSelectedDuration] = useState(3);

  // 步驟2：語言選擇
  const [selectedLanguage, setSelectedLanguage] = useState<Language>("cantonese");

  // 步驟3：配音員篩選
  const [selectedVoiceActor, setSelectedVoiceActor] = useState("");
  const [voiceGenderFilter, setVoiceGenderFilter] = useState<"male" | "female" | "">("");
  const [voiceAgeFilter, setVoiceAgeFilter] = useState("all");
  const [voiceStyleFilter, setVoiceStyleFilter] = useState("all");
  const [playingActorId, setPlayingActorId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // 步驟4：故事大綱
  const [storyOutline, setStoryOutline] = useState("");
  const [isGeneratingOutline, setIsGeneratingOutline] = useState(false);

  // 步驟5-6：片段描述和旁白
  const [segments, setSegments] = useState<SegmentInfo[]>([]);
  const [isGeneratingSegments, setIsGeneratingSegments] = useState(false);

  // 步驟7：編輯狀態
  const [editingSegmentId, setEditingSegmentId] = useState<number | null>(null);

  // 步驟8：生成設定
  const [selectedSpeedMode, setSelectedSpeedMode] = useState<"fast" | "quality">("fast");

  // 步驟9-11：生成狀態
  const [taskId, setTaskId] = useState<string | null>(null);
  const [generationProgress, setGenerationProgress] = useState(0);

  // 步驟12：字幕
  const [subtitles, setSubtitles] = useState<Array<{ segmentId: number; items: Array<{ start: number; end: number; text: string }> }>>([]);
  const [isGeneratingSubtitles, setIsGeneratingSubtitles] = useState(false);

  // 步驟13：音量
  const [narrationVolume, setNarrationVolume] = useState(80);
  const [bgmVolume, setBgmVolume] = useState(30);
  const [videoVolume, setVideoVolume] = useState(50);

  // 步驟14：合併
  const [isMerging, setIsMerging] = useState(false);
  const [mergedVideoUrl, setMergedVideoUrl] = useState<string | null>(null);

  // 步驟15：SEO
  const [seoResult, setSeoResult] = useState<SeoResult | null>(null);
  const [isGeneratingSeo, setIsGeneratingSeo] = useState(false);

  // API 來源提示
  const [apiProviderInfo, setApiProviderInfo] = useState<{ provider: string; name: string } | null>(null);

  // 訪客 sessionId（用於歷史記錄）
  const [sessionId, setLocalSessionId] = useState<string | null>(null);
  const generateSessionMutation = trpc.history.generateSessionId.useMutation();

  // 💾 GPT 建議：LocalStorage 持久化 Key
  const STORAGE_KEY = "veo3_workflow_state";

  // 💾 保存狀態到 LocalStorage
  const saveStateToStorage = useCallback(() => {
    if (!taskId) return; // 只有有 taskId 時才保存
    
    const stateToSave = {
      taskId,
      currentStep,
      segments,
      videoTitle,
      selectedDuration,
      selectedLanguage,
      selectedVoiceActor,
      storyOutline,
      narrationVolume,
      bgmVolume,
      videoVolume,
      stepStatuses,
      subtitles,
      mergedVideoUrl,
      savedAt: Date.now(),
    };
    
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
      console.log('[LocalStorage] 狀態已保存:', { taskId, currentStep, segmentsCount: segments.length });
    } catch (error) {
      console.error('[LocalStorage] 保存失敗:', error);
    }
  }, [taskId, currentStep, segments, videoTitle, selectedDuration, selectedLanguage, selectedVoiceActor, storyOutline, narrationVolume, bgmVolume, videoVolume, stepStatuses, subtitles, mergedVideoUrl]);

  // 💾 從 LocalStorage 恢復狀態
  const loadStateFromStorage = useCallback(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return null;
      
      const state = JSON.parse(saved);
      
      // 檢查是否過期（24 小時）
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours
      if (Date.now() - state.savedAt > maxAge) {
        console.log('[LocalStorage] 狀態已過期，清除');
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      
      return state;
    } catch (error) {
      console.error('[LocalStorage] 讀取失敗:', error);
      return null;
    }
  }, []);

  // 💾 頁面加載時恢復狀態
  useEffect(() => {
    const savedState = loadStateFromStorage();
    if (savedState && savedState.taskId) {
      console.log('[LocalStorage] 恢復已保存的狀態:', {
        taskId: savedState.taskId,
        currentStep: savedState.currentStep,
        segmentsCount: savedState.segments?.length,
      });
      
      // 恢復所有狀態
      setTaskId(savedState.taskId);
      setCurrentStep(savedState.currentStep || 1);
      setSegments(savedState.segments || []);
      setVideoTitle(savedState.videoTitle || "");
      setSelectedDuration(savedState.selectedDuration || 3);
      setSelectedLanguage(savedState.selectedLanguage || "cantonese");
      setSelectedVoiceActor(savedState.selectedVoiceActor || "");
      setStoryOutline(savedState.storyOutline || "");
      setNarrationVolume(savedState.narrationVolume ?? 80);
      setBgmVolume(savedState.bgmVolume ?? 30);
      setVideoVolume(savedState.videoVolume ?? 50);
      setStepStatuses(savedState.stepStatuses || {});
      setSubtitles(savedState.subtitles || []);
      setMergedVideoUrl(savedState.mergedVideoUrl || null);
      
      toast.info("已恢復上次的工作進度", { duration: 3000 });
    }
  }, []);

  // 💾 當關鍵狀態變化時自動保存
  useEffect(() => {
    if (taskId && segments.length > 0) {
      saveStateToStorage();
    }
  }, [taskId, currentStep, segments, stepStatuses, saveStateToStorage]);

  // 💾 清除已保存的狀態（用於開始新任務）
  const clearSavedState = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    console.log('[LocalStorage] 狀態已清除');
  }, []);

  // 初始化 sessionId
  useEffect(() => {
    const existingSessionId = getSessionId();
    if (existingSessionId) {
      setLocalSessionId(existingSessionId);
      console.log('[WorkflowPage] Using existing sessionId:', existingSessionId);
    } else {
      // 生成新的會話 ID
      console.log('[WorkflowPage] Generating new sessionId...');
      generateSessionMutation.mutate(undefined, {
        onSuccess: (data) => {
          console.log('[WorkflowPage] Generated sessionId:', data.sessionId);
          setSessionId(data.sessionId);
          setLocalSessionId(data.sessionId);
        },
        onError: (error) => {
          console.error('[WorkflowPage] Failed to generate sessionId:', error);
        },
      });
    }
  }, []);

  // 獲取配音員
  const { data: voiceData } = trpc.voice.getAll.useQuery();
  const allVoiceActors = (voiceData?.voiceActors || []) as VoiceActor[];
  
  // 根據語言和篩選條件過濾配音員
  const filteredVoiceActors = allVoiceActors.filter((actor) => {
    // 克隆聲音不需要過濾語言
    if (selectedLanguage === "clone") {
      if (actor.language !== "clone") return false;
    } else {
      if (actor.language !== selectedLanguage) return false;
    }
    if (voiceGenderFilter && actor.gender !== voiceGenderFilter) return false;
    if (voiceAgeFilter && voiceAgeFilter !== "all" && actor.ageGroup !== voiceAgeFilter) return false;
    // style 是數組，使用 includes 檢查
    if (voiceStyleFilter && voiceStyleFilter !== "all") {
      const actorStyles = Array.isArray(actor.style) ? actor.style : [actor.style];
      if (!actorStyles.includes(voiceStyleFilter)) return false;
    }
    return true;
  });

  // tRPC mutations
  const generateOutlineMutation = trpc.video.generateOutline?.useMutation?.() || null;
  const generateSegmentsMutation = trpc.video.generateSegments?.useMutation?.() || null;
  const createLongVideo = trpc.longVideo.create.useMutation();
  const generateSeo = trpc.video.generateSeo.useMutation();
  const mergeVideo = trpc.longVideo.merge.useMutation();

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

  // 步驟2：選擇語言
  const handleStep2Complete = () => {
    setStepStatuses(prev => ({ ...prev, 2: "completed" }));
    setCurrentStep(3);
  };

  // 步驟3：篩選配音員
  const handlePlaySample = (actorId: string, sampleUrl?: string) => {
    if (!sampleUrl) {
      toast.error("沒有試聽音頻");
      return;
    }

    if (playingActorId === actorId) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setPlayingActorId(null);
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      const audio = new Audio(sampleUrl);
      audio.onended = () => setPlayingActorId(null);
      audio.play();
      audioRef.current = audio;
      setPlayingActorId(actorId);
    }
  };

  const handleStep3Complete = () => {
    if (!selectedVoiceActor) {
      toast.error("請選擇配音員");
      return;
    }
    setStepStatuses(prev => ({ ...prev, 3: "completed" }));
    setCurrentStep(4);
  };

  // 步驟4：生成故事大綱
  const handleGenerateOutline = async () => {
    if (!videoTitle.trim()) {
      toast.error("請先輸入視頻主題");
      return;
    }
    setIsGeneratingOutline(true);
    setIsProcessing(true);

    try {
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
        
        // 顯示 API 來源信息
        if (data.apiProvider) {
          setApiProviderInfo({ provider: data.apiProvider, name: data.apiProviderName || data.apiProvider });
          if (data.apiProvider === "forge") {
            toast.success("故事大綱生成成功！（使用 Manus AI 後備 API）", {
              description: "您的 API 可能已用完或不可用，系統自動切換到 Manus AI",
              duration: 5000,
            });
          } else {
            toast.success(`故事大綱生成成功！（${data.apiProviderName || data.apiProvider}）`);
          }
        } else {
          toast.success("故事大綱生成成功！");
        }
      } else {
        setStoryOutline(generateLocalOutline(videoTitle, selectedDuration));
        toast.success("故事大綱生成成功！");
      }
    } catch (error) {
      setStoryOutline(generateLocalOutline(videoTitle, selectedDuration));
      toast.success("故事大綱生成成功！");
    }

    setIsGeneratingOutline(false);
    setIsProcessing(false);
  };

  const handleStep4Complete = () => {
    if (!storyOutline.trim()) {
      toast.error("請先生成或輸入故事大綱");
      return;
    }
    setStepStatuses(prev => ({ ...prev, 4: "completed" }));
    setCurrentStep(5);
  };

  // 步驟5-6：生成片段描述和旁白
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
        
        // 顯示 API 來源信息
        if (data.apiProvider) {
          setApiProviderInfo({ provider: data.apiProvider, name: data.apiProviderName || data.apiProvider });
          if (data.apiProvider === "forge") {
            toast.success("片段內容生成成功！（使用 Manus AI 後備 API）", {
              description: "您的 API 可能已用完或不可用，系統自動切換到 Manus AI",
              duration: 5000,
            });
          } else {
            toast.success(`片段內容生成成功！（${data.apiProviderName || data.apiProvider}）`);
          }
        } else {
          toast.success("片段內容生成成功！");
        }
      } else {
        console.error("API 返回空數據:", data);
        toast.error(data.error || "生成失敗，請稍後重試");
      }
    } catch (error) {
      console.error("生成片段失敗:", error);
      toast.error("生成失敗，請稍後重試");
    }

    setIsGeneratingSegments(false);
    setIsProcessing(false);
    setStepStatuses(prev => ({ ...prev, 5: "completed", 6: "completed" }));
  };

  const generateLocalSegments = () => {
    const segmentCount = calculateSegments(selectedDuration);
    const newSegments: SegmentInfo[] = [];
    
    for (let i = 0; i < segmentCount; i++) {
      newSegments.push({
        id: i + 1,
        description: "",  // 等待 AI 生成
        narration: "",     // 等待 AI 生成
        status: "pending",
      });
    }
    
    setSegments(newSegments);
  };

  const handleStep5_6Complete = () => {
    const hasContent = segments.some(s => s.description || s.narration);
    if (!hasContent) {
      toast.error("請先生成片段內容");
      return;
    }
    setStepStatuses(prev => ({ ...prev, 5: "completed", 6: "completed" }));
    setCurrentStep(7);
  };

  // 步驟7：編輯內容
  const handleUpdateSegment = (segmentId: number, field: "description" | "narration", value: string) => {
    setSegments(prev => prev.map(seg => 
      seg.id === segmentId ? { ...seg, [field]: value } : seg
    ));
  };

  const handleRegenerateSegment = async (segmentId: number, field: "description" | "narration") => {
    toast.info(`正在重新生成第 ${segmentId} 段的${field === "description" ? "場景描述" : "旁白"}...`);
    
    setTimeout(() => {
      setSegments(prev => prev.map(seg => {
        if (seg.id === segmentId) {
          if (field === "description") {
            return { ...seg, description: `場景 ${segmentId}：展示 ${videoTitle} 的核心內容，畫面充滿視覺衝擊力。` };
          } else {
            return { ...seg, narration: `（請點擊「AI 生成所有片段」按鈕生成真實旁白內容）` };
          }
        }
        return seg;
      }));
      toast.success("重新生成完成！");
    }, 1500);
  };

  const handleStep7Complete = () => {
    setStepStatuses(prev => ({ ...prev, 7: "completed" }));
    setCurrentStep(8);
  };

  // 步驟8：確認並開始生成
  const handleStartGeneration = async () => {
    if (!selectedVoiceActor) {
      toast.error("請選擇配音員");
      return;
    }

    setIsProcessing(true);
    setStepStatuses(prev => ({ ...prev, 8: "completed" }));
    setCurrentStep(9);

    try {
      // 將前端數據轉換為後端 API 期望的格式
      // story = 標題 + 大綱 + 所有片段內容
      const storyContent = [
        `標題：${videoTitle}`,
        `大綱：${storyOutline}`,
        `片段內容：`,
        ...segments.map((seg, i) => `片段${i + 1}: 場景-${seg.description} 旁白-${seg.narration}`)
      ].join('\n');

      // 處理語言類型 - clone 使用 cantonese 作為基礎語言
      const apiLanguage = selectedLanguage === "clone" ? "cantonese" : selectedLanguage;

      const result = await createLongVideo.mutateAsync({
        durationMinutes: selectedDuration,
        story: storyContent,
        language: apiLanguage as "cantonese" | "mandarin" | "english",
        voiceActorId: selectedVoiceActor,
        speedMode: selectedSpeedMode,
        sessionId: sessionId || undefined, // 訪客模式使用 sessionId 保存歷史記錄
      });

      if (result.taskId) {
        setTaskId(result.taskId);
        toast.success("視頻生成任務已創建！");
      }
    } catch (error: any) {
      toast.error("創建任務失敗：" + error.message);
      setIsProcessing(false);
    }
  };

  // 輪詢任務狀態
  const { data: taskStatus } = trpc.longVideo.getStatus.useQuery(
    { taskId: taskId! },
    { 
      enabled: !!taskId,
      refetchInterval: taskId ? 3000 : false,
    }
  );

  useEffect(() => {
    if (taskStatus) {
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

      if (taskStatus.segments) {
        const completed = taskStatus.segments.filter((s: any) => s.status === "completed").length;
        setGenerationProgress((completed / taskStatus.segments.length) * 100);
      }

      if (taskStatus.status === "completed") {
        setIsProcessing(false);
        setStepStatuses(prev => ({ ...prev, 9: "completed", 10: "completed" }));
        // 只有當 currentStep 小於 11 時才自動跳轉，避免從第 12-14 步被拉回
        if (currentStep < 11) {
          setCurrentStep(11);
          toast.success("所有片段生成完成！");
        }
      } else if (taskStatus.status === "failed") {
        setIsProcessing(false);
        setStepStatuses(prev => ({ ...prev, 9: "error" }));
        toast.error("生成過程中出現錯誤");
      }
    }
  }, [taskStatus, currentStep]);

  // 步驟11：重新生成失敗的片段
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

  const handleStep11Complete = () => {
    console.log('[handleStep11Complete] Called, currentStep before:', currentStep);
    const allCompleted = segments.every(s => s.status === "completed");
    if (!allCompleted) {
      toast.warning("還有未完成的片段，建議先重新生成");
    }
    setStepStatuses(prev => ({ ...prev, 11: "completed" }));
    setCurrentStep(12);
    console.log('[handleStep11Complete] setCurrentStep(12) called');
    toast.success('正在跳轉到步驟 12...');
  };

  // 步驟12：生成字幕
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
        text: seg.narration || "",
      }],
    }));
    setSubtitles(newSubtitles);
  };

  const handleStep12Complete = () => {
    setStepStatuses(prev => ({ ...prev, 12: "completed" }));
    setCurrentStep(13);
  };

  // 步驟13：調整音量
  const handleStep13Complete = () => {
    setStepStatuses(prev => ({ ...prev, 13: "completed" }));
    setCurrentStep(14);
  };

  // 步驟14：合併視頻（三層容錯機制）
  const handleMergeVideo = async () => {
    // 🔍 GPT 建議：添加詳細的調試日誌
    const completedSegments = segments.filter(seg => seg.status === "completed" && seg.videoUrl);
    const completedVideoUrls = completedSegments.map(seg => seg.videoUrl!);
    
    console.log("[Merge Check] 合併前檢查:", {
      taskId,
      totalSegments: segments.length,
      completedCount: completedSegments.length,
      statuses: segments.map(s => ({ id: s.id, status: s.status, hasUrl: !!s.videoUrl })),
      urls: completedVideoUrls.map(url => ({
        url: url?.substring(0, 60) + "...",
        ext: url?.split("?")[0].split(".").pop()?.toLowerCase(),
      })),
    });

    // 檢查是否有可用的視頻
    if (completedVideoUrls.length === 0) {
      toast.error("未檢測到有效片段，請確保至少有一個片段生成成功");
      console.error("[Merge Check] ❌ 沒有可用的視頻 URL");
      // 不要跳回 Step 11，讓用戶自己決定
      return;
    }

    if (!taskId) {
      // 如果沒有 taskId 但有視頻 URL，仍然嘗試合併
      console.log("[Merge Check] ⚠️ taskId 丟失，但有視頻 URL，嘗試使用備用方案");
    }

    setIsMerging(true);
    setIsProcessing(true);

    try {
      const result = await mergeVideo.mutateAsync({
        taskId: taskId || "unknown", // 即使沒有 taskId 也嘗試
        narrationVolume,
        bgmVolume,
        originalVolume: videoVolume,
        videoUrls: completedVideoUrls, // 傳遞片段 URL 作為備用
      });

      console.log("[Merge Result]", result);

      if (result.videoUrl) {
        setMergedVideoUrl(result.videoUrl);
        
        // 檢查是否為緊急模式
        if (result.mode === "emergency") {
          toast.warning(
            `緊急模式：返回 ${result.segmentUrls?.length || 1} 個獨立片段。您可以手動下載並合併。`,
            { duration: 8000 }
          );
          console.log("[EmergencyMode] 片段 URLs:", result.segmentUrls);
        } else if (result.mode === "local") {
          toast.success("視頻合併成功！（本地 FFmpeg）");
        } else {
          toast.success("視頻合併成功！");
        }
      } else if (result.error) {
        // 🔧 GPT 建議：顯示具體錯誤信息
        toast.error(`合併失敗：${result.error}`);
        console.error("[Merge Error]", result.error);
      }
    } catch (error: any) {
      console.error("[Merge Exception]", error);
      toast.error("合併失敗：" + error.message);
    }

    setIsMerging(false);
    setIsProcessing(false);
  };

  const handleStep14Complete = () => {
    setStepStatuses(prev => ({ ...prev, 14: "completed" }));
    setCurrentStep(15);
  };

  // 步驟15：SEO 優化
  const handleGenerateSeo = async () => {
    setIsGeneratingSeo(true);
    setIsProcessing(true);

    try {
      const result = await generateSeo.mutateAsync({
        title: videoTitle,
        outline: storyOutline,
        language: selectedLanguage,
      });

      if (result) {
        setSeoResult(result as SeoResult);
        toast.success("SEO 內容生成成功！");
        setStepStatuses(prev => ({ ...prev, 15: "completed" }));
      }
    } catch (error: any) {
      // 本地生成備用
      setSeoResult({
        title: `${videoTitle} | 精彩視頻`,
        description: `探索「${videoTitle}」的精彩內容，${selectedDuration}分鐘帶你了解核心要點。`,
        tags: [videoTitle, "視頻", "教程", "精彩內容", "AI生成"],
        hashtags: [`#${videoTitle.replace(/\s/g, '')}`, "#AI視頻", "#精彩內容"],
      });
      toast.success("SEO 內容生成成功！");
      setStepStatuses(prev => ({ ...prev, 15: "completed" }));
    }

    setIsGeneratingSeo(false);
    setIsProcessing(false);
  };

  // 本地生成大綱
  const generateLocalOutline = (title: string, duration: number): string => {
    const segmentCount = calculateSegments(duration);
    const lang = selectedLanguage;
    
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
    if (stepId <= currentStep || stepStatuses[stepId - 1] === "completed") {
      setCurrentStep(stepId);
    }
  };

  const handleNext = () => {
    if (currentStep < 15) {
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
                <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2">
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
                      <div className="text-base sm:text-lg font-bold text-white">{minutes}</div>
                      <div className="text-[10px] sm:text-xs text-zinc-400">分鐘</div>
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
                下一步：選擇旁白語言
              </Button>
            </div>
          </StepCard>
        );

      case 2:
        return (
          <StepCard step={step} status={status} isCurrent={true}>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Globe className="w-4 h-4" />
                  選擇旁白語言
                </Label>
                <p className="text-sm text-zinc-400">
                  不同語言會生成不同的口語化旁白，請選擇您想要的語言
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                {(Object.entries(LANGUAGES) as [Language, typeof LANGUAGES.cantonese][]).map(([key, lang]) => {
                  const isSelected = selectedLanguage === key;
                  return (
                    <div
                      key={key}
                      className={`cursor-pointer rounded-lg p-3 sm:p-4 transition-all relative ${
                        isSelected
                          ? "bg-purple-500/20 border-2 border-purple-500"
                          : "bg-zinc-800/50 border border-zinc-700 hover:border-purple-500/50"
                      }`}
                      onClick={() => setSelectedLanguage(key)}
                    >
                      <div className="flex items-center gap-2 sm:gap-3">
                        <span className="text-xl sm:text-2xl">{lang.flag}</span>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-sm sm:text-base">{lang.name}</div>
                          <div className="text-[10px] sm:text-xs text-zinc-400 truncate">{lang.description}</div>
                        </div>
                        {isSelected && (
                          <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-purple-500 flex-shrink-0" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <Button
                onClick={handleStep2Complete}
                className="w-full bg-gradient-to-r from-purple-500 to-pink-500"
              >
                <ChevronRight className="w-4 h-4 mr-2" />
                下一步：篩選配音員
              </Button>
            </div>
          </StepCard>
        );

      case 3:
        return (
          <StepCard step={step} status={status} isCurrent={true}>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  篩選配音員
                </Label>
                <p className="text-sm text-zinc-400">
                  根據性別、年齡、語氣等條件篩選配音員，並試聽語音
                </p>
              </div>

              {/* 篩選條件 - 響應式設計 */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs flex items-center gap-1">
                    <Filter className="w-3 h-3" />
                    性別
                  </Label>
                  <div className="flex gap-2">
                    <Button
                      variant={voiceGenderFilter === "male" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setVoiceGenderFilter(voiceGenderFilter === "male" ? "" : "male")}
                      className="flex-1 text-xs sm:text-sm"
                    >
                      男性
                    </Button>
                    <Button
                      variant={voiceGenderFilter === "female" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setVoiceGenderFilter(voiceGenderFilter === "female" ? "" : "female")}
                      className="flex-1 text-xs sm:text-sm"
                    >
                      女性
                    </Button>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">年齡</Label>
                  <Select value={voiceAgeFilter} onValueChange={setVoiceAgeFilter}>
                    <SelectTrigger className="h-8 text-xs sm:text-sm">
                      <SelectValue placeholder="全部" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部</SelectItem>
                      <SelectItem value="young">年輕</SelectItem>
                      <SelectItem value="adult">成年</SelectItem>
                      <SelectItem value="middle">中年</SelectItem>
                      <SelectItem value="elder">年長</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">語氣</Label>
                  <Select value={voiceStyleFilter} onValueChange={setVoiceStyleFilter}>
                    <SelectTrigger className="h-8 text-xs sm:text-sm">
                      <SelectValue placeholder="全部" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部</SelectItem>
                      <SelectItem value="narrator">旁白</SelectItem>
                      <SelectItem value="news">新聞</SelectItem>
                      <SelectItem value="storytelling">故事</SelectItem>
                      <SelectItem value="commercial">廣告</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* 配音員列表 */}
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {filteredVoiceActors.length === 0 ? (
                  <div className="text-center py-8 text-zinc-400">
                    <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>沒有符合條件的配音員</p>
                    <p className="text-xs">請調整篩選條件</p>
                  </div>
                ) : (
                  filteredVoiceActors.map((actor) => (
                    <div
                      key={actor.id}
                      className={`flex items-center justify-between p-3 rounded-lg transition-all cursor-pointer ${
                        selectedVoiceActor === actor.id
                          ? "bg-pink-500/20 border-2 border-pink-500"
                          : "bg-zinc-800/50 border border-zinc-700 hover:border-pink-500/50"
                      }`}
                      onClick={() => setSelectedVoiceActor(actor.id)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-500 to-purple-500 flex items-center justify-center">
                          <span className="text-sm font-medium text-white">
                            {actor.name.charAt(0)}
                          </span>
                        </div>
                        <div>
                          <div className="font-medium">{actor.name}</div>
                          <div className="text-xs text-zinc-400">
                            {actor.gender === "male" ? "男" : "女"} · {actor.type || "標準"}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {actor.sampleUrl && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePlaySample(actor.id, actor.sampleUrl);
                            }}
                          >
                            {playingActorId === actor.id ? (
                              <Volume2 className="w-4 h-4 animate-pulse" />
                            ) : (
                              <Play className="w-4 h-4" />
                            )}
                          </Button>
                        )}
                        {selectedVoiceActor === actor.id && (
                          <CheckCircle2 className="w-5 h-5 text-pink-500" />
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <Button
                onClick={handleStep3Complete}
                disabled={!selectedVoiceActor}
                className="w-full bg-gradient-to-r from-pink-500 to-rose-500"
              >
                <ChevronRight className="w-4 h-4 mr-2" />
                下一步：生成故事大綱
              </Button>
            </div>
          </StepCard>
        );

      case 4:
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
                onClick={handleStep4Complete}
                disabled={!storyOutline.trim()}
                className="w-full bg-gradient-to-r from-indigo-500 to-violet-500"
              >
                <ChevronRight className="w-4 h-4 mr-2" />
                下一步：生成片段內容
              </Button>
            </div>
          </StepCard>
        );

      case 5:
      case 6:
        return (
          <StepCard step={WORKFLOW_STEPS[4]} status={stepStatuses[5] || "pending"} isCurrent={true}>
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
                onClick={handleStep5_6Complete}
                disabled={!segments.some(s => s.description || s.narration)}
                className="w-full bg-gradient-to-r from-green-500 to-emerald-500"
              >
                <ChevronRight className="w-4 h-4 mr-2" />
                下一步：編輯內容
              </Button>
            </div>
          </StepCard>
        );

      case 7:
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
                onClick={handleStep7Complete}
                className="w-full bg-gradient-to-r from-rose-500 to-red-500"
              >
                <ChevronRight className="w-4 h-4 mr-2" />
                下一步：確認並生成
              </Button>
            </div>
          </StepCard>
        );

      case 8:
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

              {/* 確認信息 */}
              <div className="p-4 bg-zinc-800/50 rounded-lg">
                <h4 className="font-medium mb-3">確認生成設定</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-zinc-400">語言</span>
                    <p className="font-medium">{LANGUAGES[selectedLanguage].name}</p>
                  </div>
                  <div>
                    <span className="text-zinc-400">配音員</span>
                    <p className="font-medium">
                      {allVoiceActors.find(a => a.id === selectedVoiceActor)?.name || "未選擇"}
                    </p>
                  </div>
                  <div>
                    <span className="text-zinc-400">片段數</span>
                    <p className="font-medium">{segments.length} 個</p>
                  </div>
                  <div>
                    <span className="text-zinc-400">預計時長</span>
                    <p className="font-medium">{selectedDuration} 分鐘</p>
                  </div>
                </div>
              </div>

              <Button
                onClick={handleStartGeneration}
                disabled={isProcessing}
                className="w-full bg-gradient-to-r from-cyan-500 to-blue-500"
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

      case 9:
      case 10:
        return (
          <StepCard step={WORKFLOW_STEPS[8]} status={stepStatuses[9] || "pending"} isCurrent={true}>
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>生成進度</Label>
                  <span className="text-sm font-medium">{Math.round(generationProgress)}%</span>
                </div>
                <Progress value={generationProgress} className="h-3" />
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-1.5 sm:gap-2">
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
                        <CheckCircle2 className="w-4 h-4 sm:w-6 sm:h-6 text-green-500" />
                      )
                    ) : seg.status === "generating" ? (
                      <Loader2 className="w-4 h-4 sm:w-6 sm:h-6 text-blue-500 animate-spin" />
                    ) : seg.status === "failed" ? (
                      <XCircle className="w-4 h-4 sm:w-6 sm:h-6 text-red-500" />
                    ) : (
                      <span className="text-[10px] sm:text-xs text-zinc-500">#{seg.id}</span>
                    )}
                  </div>
                ))}
              </div>

              {taskStatus?.status === "completed" && (
                <Button
                  onClick={() => {
                    setStepStatuses(prev => ({ ...prev, 9: "completed", 10: "completed" }));
                    setCurrentStep(11);
                  }}
                  className="w-full bg-gradient-to-r from-teal-500 to-cyan-500"
                >
                  <ChevronRight className="w-4 h-4 mr-2" />
                  下一步：檢查並重新生成
                </Button>
              )}
            </div>
          </StepCard>
        );

      case 11:
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
                onClick={handleStep11Complete}
                className="w-full bg-gradient-to-r from-yellow-500 to-orange-500"
              >
                <ChevronRight className="w-4 h-4 mr-2" />
                下一步：生成字幕
              </Button>
            </div>
          </StepCard>
        );

      case 12:
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
                onClick={handleStep12Complete}
                className="w-full bg-gradient-to-r from-pink-500 to-rose-500"
              >
                <ChevronRight className="w-4 h-4 mr-2" />
                下一步：調整音量
              </Button>
            </div>
          </StepCard>
        );

      case 13:
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
                onClick={handleStep13Complete}
                className="w-full bg-gradient-to-r from-violet-500 to-purple-500"
              >
                <ChevronRight className="w-4 h-4 mr-2" />
                下一步：合併視頻
              </Button>
            </div>
          </StepCard>
        );

      case 14:
        // 下載所有片段的函數
        const handleDownloadAllSegments = async () => {
          const completedSegments = segments.filter(seg => seg.status === "completed" && seg.videoUrl);
          if (completedSegments.length === 0) {
            toast.error("沒有已完成的片段可下載");
            return;
          }

          toast.info(`開始下載 ${completedSegments.length} 個片段...`);

          // 逐個下載片段
          for (let i = 0; i < completedSegments.length; i++) {
            const seg = completedSegments[i];
            try {
              const response = await fetch(seg.videoUrl!);
              const blob = await response.blob();
              const url = window.URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `片段_${seg.id.toString().padStart(2, '0')}.mp4`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              window.URL.revokeObjectURL(url);
              
              // 每個下載間隔 500ms，避免瀏覽器阻擋
              if (i < completedSegments.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
              }
            } catch (error) {
              console.error(`下載片段 ${seg.id} 失敗:`, error);
              // 如果 fetch 失敗，嘗試直接打開連結
              window.open(seg.videoUrl, '_blank');
            }
          }

          toast.success(`已下載 ${completedSegments.length} 個片段`);
        };

        const completedSegmentsCount = segments.filter(seg => seg.status === "completed" && seg.videoUrl).length;

        return (
          <StepCard step={step} status={status} isCurrent={true}>
            <div className="space-y-4">
              {/* 下載所有片段區塊 */}
              <div className="p-3 sm:p-4 bg-zinc-800/50 rounded-lg border border-zinc-700">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium text-sm sm:text-base">下載片段</h4>
                  <Badge variant="secondary" className="text-xs">
                    {completedSegmentsCount} 個片段
                  </Badge>
                </div>
                <p className="text-xs text-zinc-400 mb-3">
                  在合併前，您可以先下載所有已生成的片段作為備份
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadAllSegments}
                  disabled={completedSegmentsCount === 0}
                  className="w-full"
                >
                  <Download className="w-4 h-4 mr-2" />
                  一次下載所有片段 ({completedSegmentsCount})
                </Button>
              </div>

              {/* 合併設定區塊 */}
              <div className="p-3 sm:p-4 bg-zinc-800/50 rounded-lg">
                <h4 className="font-medium mb-2 text-sm sm:text-base">合併設定</h4>
                <div className="grid grid-cols-3 gap-2 sm:gap-4 text-xs sm:text-sm">
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
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                      variant="outline"
                      className="flex-1 text-xs sm:text-sm"
                      onClick={() => window.open(mergedVideoUrl, '_blank')}
                    >
                      <Download className="w-4 h-4 mr-1 sm:mr-2" />
                      下載視頻
                    </Button>
                    <Button
                      className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 text-xs sm:text-sm"
                      onClick={() => {
                        setStepStatuses(prev => ({ ...prev, 14: "completed" }));
                        setCurrentStep(15);
                      }}
                    >
                      <ChevronRight className="w-4 h-4 mr-1 sm:mr-2" />
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

      case 15:
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

              {stepStatuses[15] === "completed" && (
                <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg text-center">
                  <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-2" />
                  <h3 className="text-lg font-bold text-green-400">恭喜！視頻製作完成！</h3>
                  <p className="text-sm text-zinc-400 mt-1">
                    您已完成所有 15 個步驟，視頻已準備好發布
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
    <div className="min-h-screen bg-gradient-to-b from-background to-background/95 overflow-x-hidden">
      {/* Header - 響應式設計 */}
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container px-3 sm:px-6 flex h-14 sm:h-16 items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0">
                <Film className="w-4 h-4 sm:w-6 sm:h-6 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-base sm:text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent truncate">
                  VEO3 Studio
                </h1>
                <p className="text-[10px] sm:text-xs text-muted-foreground hidden sm:block">15步工作流程</p>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4">
            {user ? (
              <div className="flex items-center gap-2 sm:gap-3">
                <span className="text-xs sm:text-sm text-muted-foreground hidden sm:inline">{user.name}</span>
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0">
                  <span className="text-[10px] sm:text-xs font-medium text-white">
                    {user.name?.charAt(0).toUpperCase()}
                  </span>
                </div>
              </div>
            ) : isGuestMode() ? (
              <div className="flex items-center gap-2 sm:gap-3">
                <span className="text-xs sm:text-sm text-muted-foreground">訪客模式</span>
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-br from-gray-500 to-gray-600 flex items-center justify-center flex-shrink-0">
                  <span className="text-[10px] sm:text-xs font-medium text-white">G</span>
                </div>
              </div>
            ) : (
              <Button 
                onClick={() => window.location.href = getLoginUrl()}
                className="bg-gradient-to-r from-purple-500 to-pink-500 hover:opacity-90 text-xs sm:text-sm px-3 sm:px-4 h-8 sm:h-10"
              >
                登入
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="container px-3 sm:px-6 py-4 sm:py-6">
        <div className="flex flex-col lg:grid lg:grid-cols-4 gap-4 sm:gap-6">
          {/* 左側：步驟導航 - 手機上可折疊 */}
          <div className="lg:col-span-1 order-2 lg:order-1">
            <Card className="lg:sticky lg:top-24">
              <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6">
                <CardTitle className="text-base sm:text-lg">工作流程</CardTitle>
                <CardDescription className="text-xs sm:text-sm">完成所有步驟以創建視頻</CardDescription>
              </CardHeader>
              <CardContent className="px-2 sm:px-6">
                <VerticalStepList
                  currentStep={currentStep}
                  stepStatuses={stepStatuses}
                  onStepClick={handleStepClick}
                />
              </CardContent>
            </Card>
          </div>

          {/* 右側：步驟內容 */}
          <div className="lg:col-span-3 space-y-4 sm:space-y-6 order-1 lg:order-2">
            {/* 頂部進度導航 */}
            <Card className="glass">
              <CardContent className="py-3 sm:py-4 px-3 sm:px-6">
                <WorkflowSteps
                  currentStep={currentStep}
                  stepStatuses={stepStatuses}
                  onStepClick={handleStepClick}
                  onNext={handleNext}
                  onPrev={handlePrev}
                  canGoNext={currentStep < 15}
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
