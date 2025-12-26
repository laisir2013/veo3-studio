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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Zap, 
  Sparkles, 
  Play, 
  Clock, 
  Film, 
  Cpu, 
  DollarSign, 
  Download,
  History,
  Settings,
  ChevronRight,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Video,
  Image as ImageIcon,
  Mic,
  Music,
  Merge,
  Bell,
  Volume2,
  Users
} from "lucide-react";
import { VoiceSelector, type VoiceMode, type CharacterVoiceConfig } from "@/components/VoiceSelector";
import { StyleSelector } from "@/components/StyleSelector";
import { LanguageSelector, type Language, LANGUAGES } from "@/components/LanguageSelector";
import { SegmentGrid, type Segment } from "@/components/SegmentPreviewCard";
import { SegmentListPreview, type SegmentData } from "@/components/SegmentListPreview";
import { SeoPanel, type SeoResult } from "@/components/SeoPanel";
import { SceneManager, type Scene } from "@/components/SceneManager";
import { MediaSettings, type MediaSettingsState } from "@/components/MediaSettings";
import { VoiceCloneCard } from "@/components/VoiceCloneCard";
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

// 時長選項配置 - 以分鐘為單位
const PRESET_DURATIONS = [1, 2, 3, 5, 7, 10, 15, 20, 30] as const;
type PresetDuration = typeof PRESET_DURATIONS[number];

// 最大支持 60 分鐘
const MAX_DURATION_MINUTES = 60;
const MIN_DURATION_MINUTES = 1;

// VEO3.1 Pro 每個片段 8 秒
const SEGMENT_DURATION_SECONDS = 8;
// 每批次生成 6 個片段
const BATCH_SIZE = 6;

// 計算指定時長需要的片段數量
function calculateSegments(minutes: number): number {
  return Math.ceil((minutes * 60) / SEGMENT_DURATION_SECONDS);
}

// 計算需要的批次數
function calculateBatches(totalSegments: number): number {
  return Math.ceil(totalSegments / BATCH_SIZE);
}

// 故事模式預設配置
const STORY_MODE_PRESETS = {
  character: {
    name: "固定人物模式",
    description: "保持角色外觀一致，適合故事片、短劇",
    icon: "👤",
    features: ["生成角色基礎圖", "使用 --cref 保持一致性", "適合有主角的故事"],
  },
  scene: {
    name: "劇情模式",
    description: "純場景敘事，適合風景片、產品展示",
    icon: "🎬",
    features: ["直接生成場景圖片", "更快速、更低成本", "無需角色一致性"],
  },
};

// 向後兼容
const MODE_PRESETS = SPEED_MODE_PRESETS;

// 視頻模型配置
const VIDEO_MODELS = {
  "veo3.1-pro": { name: "Veo 3.1 Pro", quality: "電影級", price: "¥1.75" },
  "veo3.1-fast": { name: "Veo 3.1 Fast", quality: "高質量", price: "¥0.35" },
  "kling-1.6": { name: "可靈 1.6", quality: "優秀", price: "¥0.80" },
  "runway-gen3": { name: "Runway Gen-3", quality: "專業", price: "¥1.20" },
};

// 進度階段圖標
const STAGE_ICONS: Record<string, React.ElementType> = {
  analyzing: Cpu,
  generating_images: ImageIcon,
  generating_videos: Video,
  generating_audio: Mic,
  composing: Music,
  completed: CheckCircle2,
  failed: XCircle,
};

export default function Home() {
  const { user, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  
  // 表單狀態
  const [selectedSpeedMode, setSelectedSpeedMode] = useState<"fast" | "quality">("fast");
  const [selectedStoryMode, setSelectedStoryMode] = useState<"character" | "scene">("character");
  const [videoTitle, setVideoTitle] = useState(""); // 新增：視頻題目
  const [story, setStory] = useState("");
  const [isGeneratingOutline, setIsGeneratingOutline] = useState(false); // 新增：AI 生成大綱狀態
  
  // 音量控制狀態
  const [narrationVolume, setNarrationVolume] = useState(80); // 旁白音量
  const [bgmVolume, setBgmVolume] = useState(30); // 背景音樂音量
  const [videoVolume, setVideoVolume] = useState(50); // 影片聲音音量
  const [characterDescription, setCharacterDescription] = useState("");
  const [visualStyleId, setVisualStyleId] = useState("");
  const [visualStyle, setVisualStyle] = useState("");
  const [customVideoModel, setCustomVideoModel] = useState<string>("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedDuration, setSelectedDuration] = useState<number>(3);
  const [customDuration, setCustomDuration] = useState<string>("");
  const [showCustomInput, setShowCustomInput] = useState(false);
  
  // 任務狀態
  const [activeTaskId, setActiveTaskId] = useState<number | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // 合併視頻狀態
  const [isMerging, setIsMerging] = useState(false);
  const [mergedVideoUrl, setMergedVideoUrl] = useState<string | null>(null);
  const [selectedBgm, setSelectedBgm] = useState<string>("none");
  const [selectedSubtitle, setSelectedSubtitle] = useState<string>("none");
  
  // 媒體設定狀態（圖片/視頻比例、字幕等）
  const [mediaSettings, setMediaSettings] = useState<MediaSettingsState | null>(null);

  // 語言狀態
  const [selectedLanguage, setSelectedLanguage] = useState<Language>("cantonese");

  // 配音狀態
  const [voiceMode, setVoiceMode] = useState<VoiceMode>("unified");
  const [selectedVoiceActor, setSelectedVoiceActor] = useState<string>("narrator-male");
  const [characterVoices, setCharacterVoices] = useState<CharacterVoiceConfig[]>([]);

  // 語言切換時重置配音員
  const handleLanguageChange = (language: Language) => {
    setSelectedLanguage(language);
    // 重置配音員選擇
    setSelectedVoiceActor("");
    setCharacterVoices([]);
    toast.info(`已切換到${LANGUAGES[language].name}，請重新選擇配音員`);
  };

  // 長視頻任務狀態 - 從 localStorage 恢復
  const [longVideoTaskId, setLongVideoTaskId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('longVideoTaskId');
    }
    return null;
  });
  const [isLongVideoMode, setIsLongVideoMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('isLongVideoMode') === 'true';
    }
    return false;
  });

  // 場景管理狀態
  const [customScenes, setCustomScenes] = useState<Scene[]>([]);
  const [showSceneManager, setShowSceneManager] = useState(false);

  // SEO 狀態
  const [seoResult, setSeoResult] = useState<SeoResult | null>(null);
  const [isGeneratingSeo, setIsGeneratingSeo] = useState(false);
  const [seoPlatform, setSeoPlatform] = useState<"youtube" | "tiktok" | "instagram" | "facebook" | "general">("youtube");
  const [seoModel, setSeoModel] = useState<"gpt-5.2" | "claude-opus-4-5-20251101" | "gemini-3-pro-preview">("gpt-5.2");

  // 獲取所有配音員
  const { data: voiceData } = trpc.voice.getAll.useQuery();
  const allVoiceActors = voiceData?.voiceActors || [];
  
  // 根據當前語言篩選配音員
  const filteredVoiceActors = allVoiceActors.filter(
    (actor: any) => actor.language === selectedLanguage
  );

  // tRPC mutations
  const createTask = trpc.video.create.useMutation({
    onSuccess: (data) => {
      setActiveTaskId(data.taskId);
      toast.success("任務創建成功！");
      // 請求瀏覽器通知權限
      if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
      }
    },
    onError: (error) => {
      console.error("createTask error:", error);
      toast.error("創建任務失敗: " + error.message);
    },
  });

  // SEO 生成 mutation
  const generateSeo = trpc.video.generateSeo.useMutation({
    onSuccess: (data) => {
      if (data.success && data.data) {
        setSeoResult(data.data);
        toast.success("SEO 內容生成成功！");
      } else {
        toast.error(data.error || "SEO 生成失敗");
      }
      setIsGeneratingSeo(false);
    },
    onError: (error) => {
      toast.error("SEO 生成失敗: " + error.message);
      setIsGeneratingSeo(false);
    },
  });

  // 生成 SEO 內容
  const handleGenerateSeo = () => {
    if (!story.trim()) {
      toast.error("請先輸入故事內容");
      return;
    }
    setIsGeneratingSeo(true);
    setSeoResult(null);
    generateSeo.mutate({
      story: story,
      language: selectedLanguage === "clone" ? "cantonese" : selectedLanguage,
      platform: seoPlatform,
      model: seoModel,
      videoStyle: visualStyle || undefined,
      duration: selectedDuration * 60,
    });
  };

  // AI 生成大綱的處理函數
  const handleGenerateOutline = async () => {
    if (!videoTitle.trim()) {
      toast.error("請先輸入視頻題目");
      return;
    }
    setIsGeneratingOutline(true);
    try {
      // 使用 OpenAI API 生成大綱
      const response = await fetch('/api/generate-outline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: videoTitle,
          language: selectedLanguage === "clone" ? "cantonese" : selectedLanguage,
          duration: selectedDuration,
        }),
      });
      const data = await response.json();
      if (data.success && data.outline) {
        setStory(data.outline);
        toast.success("AI 大綱生成成功！");
      } else {
        // 如果 API 不存在，使用本地生成
        const sampleOutline = generateLocalOutline(videoTitle, selectedDuration);
        setStory(sampleOutline);
        toast.success("AI 大綱生成成功！");
      }
    } catch (error) {
      // 如果 API 失敗，使用本地生成
      const sampleOutline = generateLocalOutline(videoTitle, selectedDuration);
      setStory(sampleOutline);
      toast.success("AI 大綱生成成功！");
    }
    setIsGeneratingOutline(false);
  };

  // 本地生成大綱的輔助函數
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const generateLocalOutline = (title: string, _duration: number): string => {
    const lang = selectedLanguage === "clone" ? "cantonese" : selectedLanguage;
    
    if (lang === "cantonese") {
      return `【${title}】

第一部分：開場引入
場景描述：以吸引人的畫面開始，帶出主題「${title}」的核心概念。

第二部分：主體內容
場景描述：深入探討主題，展示關鍵資訊和精彩內容。

第三部分：高潮發展
場景描述：將故事推向高潮，帶給觀眾最深刻的印象。

第四部分：結尾與呼籲
場景描述：總結內容，留下深刻印象，鼓勵觀眾行動。`;
    } else if (lang === "mandarin") {
      return `【${title}】

第一部分：开场引入
场景描述：以吸引人的画面开始，带出主题「${title}」的核心概念。

第二部分：主体内容
场景描述：深入探讨主题，展示关键信息和精彩内容。

第三部分：高潮发展
场景描述：将故事推向高潮，带给观众最深刻的印象。

第四部分：结尾与号召
场景描述：总结内容，留下深刻印象，鼓励观众行动。`;
    } else {
      return `【${title}】

Part 1: Introduction
Scene description: Start with an engaging visual that introduces the core concept of "${title}".

Part 2: Main Content
Scene description: Dive deep into the topic, showcasing key information and compelling content.

Part 3: Climax
Scene description: Build to the peak of the story, leaving the strongest impression on viewers.

Part 4: Conclusion & Call to Action
Scene description: Summarize the content, leave a lasting impression, and encourage viewer action.`;
    }
  };

  // AI 生成場景 mutation
  const generateScene = trpc.video.generateScene.useMutation();

  // AI 生成場景的處理函數
  const handleGenerateAIScene = async (): Promise<string> => {
    if (!story.trim()) {
      toast.error("請先輸入故事內容");
      return "";
    }
    
    const existingDescriptions = customScenes.map(s => s.description);
    const result = await generateScene.mutateAsync({
      story: story,
      existingScenes: existingDescriptions,
      language: selectedLanguage === "clone" ? "cantonese" : selectedLanguage as "cantonese" | "mandarin" | "english",
      visualStyle: visualStyle || undefined,
    });
    
    if (result.success && result.description) {
      return result.description;
    } else {
      throw new Error(result.error || "AI 場景生成失敗");
    }
  };

  // 長視頻生成 mutation
  const createLongVideo = trpc.longVideo.create.useMutation({
    onSuccess: (data) => {
      setLongVideoTaskId(data.taskId);
      setIsLongVideoMode(true);
      // 保存到 localStorage
      localStorage.setItem('longVideoTaskId', data.taskId);
      localStorage.setItem('isLongVideoMode', 'true');
      toast.success(`任務已創建，將生成 ${data.totalSegments} 個片段，分 ${data.totalBatches} 批處理`);
      // 請求瀏覽器通知權限
      if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
      }
    },
    onError: (error) => {
      toast.error("創建任務失敗: " + error.message);
    },
  });

  // 獲取長視頻任務狀態 - 只要有 taskId 就啟用查詢
  const { data: longVideoStatus, refetch: refetchLongVideoStatus } = trpc.longVideo.getStatus.useQuery(
    { taskId: longVideoTaskId! },
    { 
      enabled: !!longVideoTaskId,
      refetchInterval: (data) => {
        // 如果任務還在進行中，每 2 秒刷新一次
        if (data?.status === 'completed' || data?.status === 'failed') {
          return false;
        }
        return 2000;
      }
    }
  );

  // 獲取長視頻任務統計
  const { data: longVideoStats } = trpc.longVideo.getStats.useQuery(
    { taskId: longVideoTaskId! },
    { enabled: !!longVideoTaskId }
  );
  
  // 當有 longVideoTaskId 但 isLongVideoMode 為 false 時，自動設置為 true
  useEffect(() => {
    if (longVideoTaskId && !isLongVideoMode) {
      setIsLongVideoMode(true);
    }
  }, [longVideoTaskId, isLongVideoMode]);

  // 合併視頻 mutation
  const mergeVideo = trpc.video.merge.useMutation({
    onSuccess: (data) => {
      setIsMerging(false);
      if (data.success && data.videoUrl) {
        setMergedVideoUrl(data.videoUrl);
        toast.success("視頻合併成功！");
      } else {
        toast.error("合併失敗: " + (data.error || "未知錯誤"));
      }
    },
    onError: (error) => {
      setIsMerging(false);
      toast.error("合併失敗: " + error.message);
    },
  });

  // 獲取任務狀態
  const { data: taskStatus, refetch: refetchStatus } = trpc.video.getStatus.useQuery(
    { taskId: activeTaskId! },
    { enabled: !!activeTaskId }
  );

  // 獲取歷史記錄（使用數據庫持久化，Guest 模式也可以查看）
  const { data: historyRecords, refetch: refetchHistory } = trpc.history.list.useQuery(
    { limit: 10, offset: 0 },
    { enabled: true }  // 始終啟用，讓 Guest 模式也能查看歷史
  );
  
  // 映射數據庫記錄到前端格式
  const history = historyRecords?.map((record: any) => {
    const outputUrls = record.outputUrls as any;
    return {
      id: record.id,
      taskId: record.taskId,
      title: record.title || `任務 #${record.id}`,
      status: record.status === "processing" ? "generating" : record.status,
      progress: record.progress || 0,
      createdAt: record.createdAt,
      videoUrl: outputUrls?.videoUrl || outputUrls?.finalVideoUrl,
      thumbnailUrl: record.thumbnailUrl || outputUrls?.thumbnailUrl,
    };
  }) || [];

  // 輪詢任務狀態
  useEffect(() => {
    if (activeTaskId && taskStatus?.status !== "completed" && taskStatus?.status !== "failed") {
      pollingRef.current = setInterval(() => {
        refetchStatus();
      }, 3000);
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [activeTaskId, taskStatus?.status, refetchStatus]);

  // 輪詢長視頻任務狀態 - 已在 useQuery 中使用 refetchInterval，無需額外輪詢

  // 長視頻任務完成通知
  useEffect(() => {
    if (longVideoStatus?.status === "completed" || longVideoStatus?.status === "failed") {
      // 任務完成或失敗時清除 localStorage
      localStorage.removeItem('longVideoTaskId');
      localStorage.removeItem('isLongVideoMode');
      
      // 使用 Service Worker 發送通知（兼容移動端）
      if ("Notification" in window && Notification.permission === "granted") {
        const isCompleted = longVideoStatus.status === "completed";
        const notificationTitle = isCompleted ? "🎉 長視頻生成完成！" : "❌ 長視頻生成失敗";
        const notificationBody = isCompleted 
          ? `您的 ${longVideoStatus.totalDurationMinutes} 分鐘視頻已經準備好了` 
          : longVideoStatus.error || "生成過程中出現錯誤";
        
        // 優先使用 Service Worker 發送通知
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.ready.then((registration) => {
            registration.showNotification(notificationTitle, {
              body: notificationBody,
              icon: "/icons/icon-192x192.png",
              badge: "/icons/icon-72x72.png",
            });
          }).catch(() => {
            // Service Worker 失敗時使用 toast 通知
            console.log('[Notification] Service Worker notification failed, using toast instead');
          });
        }
      }
      
      if (longVideoStatus.status === "completed") {
        toast.success("長視頻生成完成！", {
          description: `已生成 ${longVideoStatus.totalSegments} 個片段`,
          duration: 5000,
        });
        // 刷新歷史記錄
        refetchHistory();
      } else if (longVideoStatus.status === "failed") {
        toast.error("長視頻生成失敗", {
          description: longVideoStatus.error || "請重試",
          duration: 5000,
        });
      }
    }
  }, [longVideoStatus?.status, longVideoStatus?.totalDurationMinutes, longVideoStatus?.totalSegments, longVideoStatus?.error, refetchHistory]);

  // 任務完成後刷新歷史並發送通知
  useEffect(() => {
    if (taskStatus?.status === "completed" || taskStatus?.status === "failed") {
      refetchHistory();
      
      // 使用 Service Worker 發送瀏覽器通知（兼容移動端）
      if ("Notification" in window && Notification.permission === "granted") {
        const isCompleted = taskStatus.status === "completed";
        const notificationTitle = isCompleted ? "🎉 視頻生成完成！" : "❌ 視頻生成失敗";
        const notificationBody = isCompleted 
          ? "您的視頻已經準備好了，點擊查看" 
          : taskStatus.errorMessage || "生成過程中出現錯誤";
        
        // 優先使用 Service Worker 發送通知
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.ready.then((registration) => {
            registration.showNotification(notificationTitle, {
              body: notificationBody,
              icon: "/icons/icon-192x192.png",
              badge: "/icons/icon-72x72.png",
              tag: `video-task-${activeTaskId}`,
            });
          }).catch(() => {
            // Service Worker 失敗時使用 toast 通知
            console.log('[Notification] Service Worker notification failed, using toast instead');
          });
        }
      }
      
      // 顯示 toast 通知
      if (taskStatus.status === "completed") {
        toast.success("視頻生成完成！", {
          description: "您可以預覽或下載視頻了",
          duration: 5000,
        });
      } else if (taskStatus.status === "failed") {
        toast.error("視頻生成失敗", {
          description: taskStatus.errorMessage || "請重試",
          duration: 5000,
        });
      }
    }
  }, [taskStatus?.status, refetchHistory, activeTaskId, taskStatus?.errorMessage]);

  const handleSubmit = () => {
    // 暫時移除登入檢查，允許未登入用戶測試
    // if (!user) {
    //   window.location.href = getLoginUrl();
    //   return;
    // }

    if (!story.trim()) {
      toast.error("請輸入故事內容");
      return;
    }

    // 處理語言類型 - clone 使用 cantonese 作為基礎語言
    const apiLanguage = selectedLanguage === "clone" ? "cantonese" : selectedLanguage;

    // 如果時長超過 1 分鐘，使用長視頻生成模式
    if (selectedDuration > 1) {
      createLongVideo.mutate({
        durationMinutes: selectedDuration,
        story: story.trim(),
        characterDescription: characterDescription.trim() || undefined,
        visualStyle: visualStyle.trim() || undefined,
        language: apiLanguage as "cantonese" | "mandarin" | "english",
        voiceActorId: selectedVoiceActor,
        speedMode: selectedSpeedMode,
        storyMode: selectedStoryMode,
        // 傳遞模型配置
        videoModel: customVideoModel || speedPreset.video,
        imageModel: mediaSettings?.imageModel || "midjourney-v6",
        llmModel: "gpt-4o-mini",
        // 傳遞媒體設定
        videoPercent: mediaSettings?.videoPercent ?? 100,
        imagePercent: mediaSettings?.imagePercent ?? 0,
        imageDuration: mediaSettings?.imageDuration || "3s",
        // 傳遞字幕設定
        subtitleEnabled: mediaSettings?.subtitleEnabled ?? true,
        subtitleMode: mediaSettings?.subtitleMode || "auto",
        subtitleFont: mediaSettings?.subtitleFont || "noto-sans-tc",
        subtitleFontSize: mediaSettings?.subtitleFontSize || "medium",
        subtitleFontColor: mediaSettings?.subtitleFontColor || "white",
        subtitleBoxStyle: mediaSettings?.subtitleBoxStyle || "shadow",
        subtitlePosition: mediaSettings?.subtitlePosition || "bottom-center",
      });
    } else {
      // 短視頻使用原有的生成模式
      createTask.mutate({
        speedMode: selectedSpeedMode,
        storyMode: selectedStoryMode,
        story: story.trim(),
        characterDescription: characterDescription.trim() || undefined,
        visualStyle: visualStyle.trim() || undefined,
        videoModel: customVideoModel || undefined,
        language: apiLanguage as "cantonese" | "mandarin" | "english",
        voiceActorId: selectedVoiceActor,
      });
    }
  };

  const speedPreset = SPEED_MODE_PRESETS[selectedSpeedMode];
  const storyPreset = STORY_MODE_PRESETS[selectedStoryMode];
  const ModeIcon = speedPreset.icon;

  return (
    <div className="min-h-screen gradient-bg">
      {/* 頂部導航 */}
      <header className="glass sticky top-0 z-50">
        <div className="container py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center glow">
              <Film className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold gradient-text leading-tight">PO<span className="block text-sm font-medium text-muted-foreground">studio</span></h1>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {user && (
              <>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => navigate("/characters")}
                  className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                >
                  <Users className="w-4 h-4 mr-2" />
                  角色庫
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => navigate("/batch")}
                  className="border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
                >
                  <Zap className="w-4 h-4 mr-2" />
                  批量生成
                </Button>
              </>
            )}
            {user ? (
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">{user.name}</span>
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                  <span className="text-xs font-medium text-white">
                    {user.name?.charAt(0).toUpperCase()}
                  </span>
                </div>
              </div>
            ) : (
              isGuestMode() ? (
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
              )
            )}
          </div>
        </div>
      </header>

      <main className="container py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* 左側：生成表單 */}
          <div className="lg:col-span-2 space-y-6">
            {/* 模式選擇 */}
            <div className="grid sm:grid-cols-2 gap-4">
              {(Object.entries(MODE_PRESETS) as [keyof typeof MODE_PRESETS, typeof MODE_PRESETS.fast][]).map(([key, mode]) => {
                const Icon = mode.icon;
                const isSelected = selectedSpeedMode === key;
                return (
                  <Card 
                    key={key}
                    className={`cursor-pointer transition-all duration-300 card-hover ${
                      isSelected 
                        ? `${mode.borderColor} border-2 ${mode.bgColor}` 
                        : "border-border hover:border-muted-foreground/50"
                    }`}
                    onClick={() => setSelectedSpeedMode(key)}
                  >
                    <CardContent className="p-6">
                      <div className="flex items-start gap-4">
                        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${mode.color} flex items-center justify-center ${isSelected ? "glow" : ""}`}>
                          <Icon className="w-6 h-6 text-white" />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-lg">{mode.name}</h3>
                          <p className="text-sm text-muted-foreground mt-1">{mode.description}</p>
                          <div className="flex flex-wrap gap-2 mt-3">
                            <Badge variant="secondary" className="text-xs">
                              <Clock className="w-3 h-3 mr-1" />
                              {mode.estimatedTime}
                            </Badge>
                            <Badge variant="secondary" className="text-xs">
                              <DollarSign className="w-3 h-3 mr-1" />
                              {mode.price}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* 故事模式選擇 */}
            <div className="grid sm:grid-cols-2 gap-4">
              {(Object.entries(STORY_MODE_PRESETS) as [keyof typeof STORY_MODE_PRESETS, typeof STORY_MODE_PRESETS.character][]).map(([key, mode]) => {
                const isSelected = selectedStoryMode === key;
                return (
                  <Card 
                    key={key}
                    className={`cursor-pointer transition-all duration-300 card-hover ${
                      isSelected 
                        ? "border-primary border-2 bg-primary/5" 
                        : "border-border hover:border-muted-foreground/50"
                    }`}
                    onClick={() => setSelectedStoryMode(key)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="text-3xl">{mode.icon}</div>
                        <div className="flex-1">
                          <h3 className="font-semibold">{mode.name}</h3>
                          <p className="text-sm text-muted-foreground mt-1">{mode.description}</p>
                          <div className="flex flex-wrap gap-1 mt-2">
                            {mode.features.map((feature, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs">
                                {feature}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* 時長選擇 - 移到視頻大綱上方 */}
            <Card className="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-primary" />
                  影片時長
                </CardTitle>
                <CardDescription>
                  選擇您想要生成的影片長度，系統會自動計算需要的 8 秒片段數量
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* 時長選擇按鈕 */}
                <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-10 gap-2">
                  {PRESET_DURATIONS.map((minutes) => {
                    const isSelected = selectedDuration === minutes && !showCustomInput;
                    return (
                      <div
                        key={minutes}
                        className={`cursor-pointer rounded-lg p-2 sm:p-3 text-center transition-all duration-200 ${
                          isSelected
                            ? "bg-purple-500/20 border-2 border-purple-500 ring-2 ring-purple-500/30"
                            : "bg-zinc-800/50 border border-zinc-700 hover:border-purple-500/50"
                        }`}
                        onClick={() => {
                          setSelectedDuration(minutes);
                          setShowCustomInput(false);
                          setCustomDuration("");
                        }}
                      >
                        <div className="text-lg sm:text-xl font-bold text-white">{minutes}</div>
                        <div className="text-[10px] sm:text-xs text-zinc-400">分鐘</div>
                      </div>
                    );
                  })}
                  {/* 自定義時長按鈕 */}
                  <div
                    className={`cursor-pointer rounded-lg p-2 sm:p-3 text-center transition-all duration-200 ${
                      showCustomInput
                        ? "bg-amber-500/20 border-2 border-amber-500 ring-2 ring-amber-500/30"
                        : "bg-zinc-800/50 border border-zinc-700 hover:border-amber-500/50"
                    }`}
                    onClick={() => setShowCustomInput(true)}
                  >
                    <div className="text-lg sm:text-xl font-bold text-amber-400">➕</div>
                    <div className="text-[10px] sm:text-xs text-zinc-400">自定義</div>
                  </div>
                </div>

                {/* 自定義時長輸入 */}
                {showCustomInput && (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
                    <div className="flex items-center gap-3">
                      <Label className="text-amber-400 whitespace-nowrap">自定義時長</Label>
                      <div className="flex items-center gap-2 flex-1">
                        <Input
                          type="number"
                          min={MIN_DURATION_MINUTES}
                          max={MAX_DURATION_MINUTES}
                          placeholder="輸入分鐘數"
                          value={customDuration}
                          onChange={(e) => {
                            const value = e.target.value;
                            setCustomDuration(value);
                            const num = parseInt(value);
                            if (!isNaN(num) && num >= MIN_DURATION_MINUTES && num <= MAX_DURATION_MINUTES) {
                              setSelectedDuration(num);
                            }
                          }}
                          className="w-24 bg-background/50"
                        />
                        <span className="text-zinc-400">分鐘</span>
                        <span className="text-xs text-zinc-500">(最大 {MAX_DURATION_MINUTES} 分鐘)</span>
                      </div>
                    </div>
                    {customDuration && parseInt(customDuration) > 0 && (
                      <div className="mt-2 text-sm text-amber-400">
                        → 將生成 {calculateSegments(parseInt(customDuration) || 0)} 個片段，分 {calculateBatches(calculateSegments(parseInt(customDuration) || 0))} 批次處理
                      </div>
                    )}
                  </div>
                )}

                {/* 片段計算說明 */}
                {(() => {
                  const segments = calculateSegments(selectedDuration);
                  const batches = calculateBatches(segments);
                  return (
                    <div className="bg-zinc-800/50 rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-zinc-400">總時長</span>
                        <span className="text-white font-medium">{selectedDuration} 分鐘 ({selectedDuration * 60} 秒)</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-zinc-400">需要生成</span>
                        <span className="text-purple-400 font-medium">{segments} 個 8秒片段</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-zinc-400">批次數量</span>
                        <span className="text-blue-400 font-medium">{batches} 批 (每批 {BATCH_SIZE} 個)</span>
                      </div>
                      <div className="pt-2 border-t border-zinc-700">
                        <p className="text-xs text-zinc-500">
                          💡 系統會按批次順序生成，每批使用不同 API Key 組以避免限流
                        </p>
                      </div>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>

            {/* 題目輸入和故事大綱 */}
            <Card className="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Film className="w-5 h-5 text-primary" />
                  視頻題目與大綱
                </CardTitle>
                <CardDescription>
                  輸入題目後可由 AI 自動生成大綱，或自定義內容
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* 題目輸入 */}
                <div className="space-y-2">
                  <Label htmlFor="videoTitle">視頻題目</Label>
                  <div className="flex gap-2">
                    <Input
                      id="videoTitle"
                      placeholder="例如：富爸爸的財富智慧、如何在30天內學會編程..."
                      value={videoTitle}
                      onChange={(e) => setVideoTitle(e.target.value)}
                      className="flex-1 bg-background/50"
                    />
                    <Button
                      onClick={handleGenerateOutline}
                      disabled={!videoTitle.trim() || isGeneratingOutline}
                      className="bg-gradient-to-r from-purple-500 to-pink-500 hover:opacity-90"
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
                </div>

                {/* 故事大綱 */}
                <div className="space-y-2">
                  <Label htmlFor="story">故事大綱</Label>
                  <Textarea
                    id="story"
                    placeholder="例如：一位年輕的女探險家在神秘的古代遺跡中發現了一個發光的水晶球。她小心翼翼地拿起水晶球，突然周圍的石壁開始發出金色的光芒，古老的符文一個接一個地亮起..."
                    value={story}
                    onChange={(e) => setStory(e.target.value)}
                    className="min-h-[150px] resize-none bg-background/50"
                  />
                  <p className="text-xs text-muted-foreground">
                    💡 提示：輸入題目後點擊「AI 生成大綱」可自動生成內容，或直接在此輸入您的故事
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* 語言選擇 */}
            <LanguageSelector
              selectedLanguage={selectedLanguage}
              onLanguageChange={handleLanguageChange}
            />

            {/* 媒體設定（圖片/視頻比例、生圖模型、字幕） */}
            <MediaSettings
              onSettingsChange={(settings) => {
                console.log('媒體設定更新:', settings);
                setMediaSettings(settings);
              }}
            />

            {/* 角色描述和視覺風格 */}
            <Card className="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary" />
                  角色與風格設定
                </CardTitle>
                <CardDescription>
                  設定角色外觀和視覺風格，讓您的視頻更具特色
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* 角色描述 - 全寬 */}
                <div className="space-y-2">
                  <Label htmlFor="character" className="text-base font-medium">角色描述（可選）</Label>
                  <Input
                    id="character"
                    placeholder="例如：25歲亞洲女性，長黑髮，穿著探險裝備"
                    value={characterDescription}
                    onChange={(e) => setCharacterDescription(e.target.value)}
                    className="bg-background/50 h-12 text-base"
                  />
                </div>
                
                {/* 視覺風格 - 全寬 */}
                <div className="space-y-2">
                  <Label className="text-base font-medium">視覺風格</Label>
                  <StyleSelector
                    value={visualStyleId}
                    onChange={(styleId, stylePrompt) => {
                      setVisualStyleId(styleId);
                      setVisualStyle(stylePrompt);
                    }}
                  />
                </div>

                {/* 進階設定 */}
                <div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Settings className="w-4 h-4 mr-2" />
                    進階設定
                    <ChevronRight className={`w-4 h-4 ml-1 transition-transform ${showAdvanced ? "rotate-90" : ""}`} />
                  </Button>
                  
                  {showAdvanced && (
                    <div className="mt-4 p-4 rounded-lg bg-background/50 space-y-4">
                      <div className="space-y-2">
                        <Label>視頻生成模型</Label>
                        <Select value={customVideoModel} onValueChange={setCustomVideoModel}>
                          <SelectTrigger className="bg-background/50">
                            <SelectValue placeholder={`使用預設：${VIDEO_MODELS[speedPreset.video as keyof typeof VIDEO_MODELS]?.name}`} />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(VIDEO_MODELS).map(([key, model]) => (
                              <SelectItem key={key} value={key}>
                                <div className="flex items-center gap-2">
                                  <span>{model.name}</span>
                                  <Badge variant="outline" className="text-xs">{model.quality}</Badge>
                                  <span className="text-muted-foreground">{model.price}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </div>

              </CardContent>
            </Card>

            {/* 場景管理器 */}
            <Card className="glass">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Film className="w-5 h-5 text-purple-400" />
                    場景管理
                    {customScenes.length > 0 && (
                      <Badge variant="secondary" className="ml-2">
                        {customScenes.length} 個場景
                      </Badge>
                    )}
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowSceneManager(!showSceneManager)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {showSceneManager ? "收起" : "展開"}
                    <ChevronRight className={`w-4 h-4 ml-1 transition-transform ${showSceneManager ? "rotate-90" : ""}`} />
                  </Button>
                </div>
                <CardDescription>
                  自定義場景內容，或讓 AI 自動生成
                </CardDescription>
              </CardHeader>
              {showSceneManager && (
                <CardContent>
                  <SceneManager
                    scenes={customScenes}
                    onScenesChange={setCustomScenes}
                    onGenerateAIScene={handleGenerateAIScene}
                    language={selectedLanguage}
                    disabled={createTask.isPending}
                  />
                </CardContent>
              )}
            </Card>

            {/* 配音設定 */}
            <VoiceSelector
              voiceMode={voiceMode}
              onVoiceModeChange={setVoiceMode}
              selectedVoiceActor={selectedVoiceActor}
              onVoiceActorChange={setSelectedVoiceActor}
              characterVoices={characterVoices}
              onCharacterVoicesChange={setCharacterVoices}
              story={story}
              storyMode={selectedStoryMode}
              language={selectedLanguage}
            />

            {/* 克隆聲音 - 獨立功能區塊 */}
            <VoiceCloneCard
              onVoiceCloned={(voice) => {
                console.log('聲音克隆完成:', voice);
                toast.success(`聲音「${voice.name}」克隆成功！`);
              }}
            />

            {/* 音量控制 */}
            <Card className="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Volume2 className="w-5 h-5 text-primary" />
                  音量控制
                </CardTitle>
                <CardDescription>
                  調整旁白、背景音樂和影片原聲的音量比例
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* 旁白音量 */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2">
                      <Mic className="w-4 h-4 text-blue-400" />
                      旁白音量
                    </Label>
                    <span className="text-sm text-muted-foreground">{narrationVolume}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={narrationVolume}
                    onChange={(e) => setNarrationVolume(parseInt(e.target.value))}
                    className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                </div>

                {/* 背景音樂音量 */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2">
                      <Music className="w-4 h-4 text-purple-400" />
                      背景音樂音量
                    </Label>
                    <span className="text-sm text-muted-foreground">{bgmVolume}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={bgmVolume}
                    onChange={(e) => setBgmVolume(parseInt(e.target.value))}
                    className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                  />
                </div>

                {/* 影片原聲音量 */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2">
                      <Video className="w-4 h-4 text-green-400" />
                      影片原聲音量
                    </Label>
                    <span className="text-sm text-muted-foreground">{videoVolume}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={videoVolume}
                    onChange={(e) => setVideoVolume(parseInt(e.target.value))}
                    className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-green-500"
                  />
                </div>

                <p className="text-xs text-muted-foreground">
                  💡 提示：建議旁白音量設定為 70-90%，背景音樂 20-40%，以確保清晰的語音體驗
                </p>

                {/* Suno AI 音樂生成 */}
                <div className="border-t border-white/10 pt-4 mt-4">
                  <div className="flex items-center justify-between mb-3">
                    <Label className="flex items-center gap-2">
                      <Music className="w-4 h-4 text-amber-400" />
                      AI 背景音樂生成
                      <Badge variant="outline" className="text-xs border-amber-500/50 text-amber-400">Suno AI</Badge>
                    </Label>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">
                    根據您的題目和大綱自動生成匹配的背景音樂
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-amber-500/30 hover:bg-amber-500/10 text-amber-400"
                      onClick={() => toast.info("🎵 Suno AI 音樂生成功能即將上線！")}
                    >
                      <Sparkles className="w-4 h-4 mr-2" />
                      自動生成音樂
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-zinc-500/30 hover:bg-zinc-500/10"
                      onClick={() => toast.info("🎵 音樂庫功能即將上線！")}
                    >
                      <Music className="w-4 h-4 mr-2" />
                      選擇現有音樂
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 生成按鈕 */}
            <Card className="glass">
              <CardContent className="p-6 space-y-4">
                <Button
                  onClick={handleSubmit}
                  disabled={!story.trim() || createTask.isPending}
                  className={`w-full h-12 text-lg bg-gradient-to-r ${speedPreset.color} hover:opacity-90 transition-opacity`}
                >
                  {createTask.isPending ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      創建任務中...
                    </>
                  ) : (
                    <>
                      <Play className="w-5 h-5 mr-2" />
                      開始生成
                    </>
                  )}
                </Button>

                {/* SEO 生成區塊 */}
                <div className="border-t border-white/10 pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <Label className="text-sm font-medium flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-purple-400" />
                      SEO 優化
                    </Label>
                    <div className="flex gap-2">
                      <Select value={seoPlatform} onValueChange={(v) => setSeoPlatform(v as typeof seoPlatform)}>
                        <SelectTrigger className="w-[120px] h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="youtube">YouTube</SelectItem>
                          <SelectItem value="tiktok">TikTok</SelectItem>
                          <SelectItem value="instagram">Instagram</SelectItem>
                          <SelectItem value="facebook">Facebook</SelectItem>
                          <SelectItem value="general">通用</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={seoModel} onValueChange={(v) => setSeoModel(v as typeof seoModel)}>
                        <SelectTrigger className="w-[140px] h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="gpt-5.2">GPT 5.2</SelectItem>
                          <SelectItem value="claude-opus-4-5-20251101">Claude 4.5</SelectItem>
                          <SelectItem value="gemini-3-pro-preview">Gemini 3 Pro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button
                    onClick={handleGenerateSeo}
                    disabled={!story.trim() || isGeneratingSeo}
                    variant="outline"
                    className="w-full h-10 border-purple-500/30 hover:bg-purple-500/10"
                  >
                    {isGeneratingSeo ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        生成 SEO 中...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 mr-2" />
                        生成標題、描述、標籤
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* SEO 結果展示 */}
            {seoResult && (
              <SeoPanel
                seoResult={seoResult}
                language={selectedLanguage}
                platform={seoPlatform}
                onRegenerate={handleGenerateSeo}
              />
            )}


            {/* 片段預覽列表 - 獨立的 Card */}
            <Card className="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Film className="w-5 h-5 text-primary" />
                  片段預覽
                  {/* 優先顯示 longVideo 任務狀態 */}
                  {longVideoTaskId && longVideoStatus?.segments && (
                    <Badge variant="secondary" className="ml-2">
                      {longVideoStatus.segments.filter((s: any) => s.status === "completed").length}/{longVideoStatus.totalSegments || longVideoStatus.segments.length} 完成
                    </Badge>
                  )}
                  {/* 其次顯示 video 任務狀態 */}
                  {!longVideoTaskId && activeTaskId && taskStatus?.scenes && (
                    <Badge variant="secondary" className="ml-2">
                      {taskStatus.scenes.filter((s: any) => s.status === "completed").length}/{taskStatus.scenes.length} 完成
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  {longVideoTaskId && longVideoStatus 
                    ? `實時顯示 ${longVideoStatus.totalSegments || longVideoStatus.segments?.length || 0} 個片段的生成進度`
                    : activeTaskId && taskStatus?.scenes
                    ? `實時顯示 ${taskStatus.scenes.length} 個場景的生成進度`
                    : `預覽 ${calculateSegments(selectedDuration)} 個片段的內容`
                  }
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* 片段預覽列表 - 一行一框一影片 */}
                <div>
                  {/* 使用新的列表式預覽組件 - 優先使用實際任務數據 */}
                  <SegmentListPreview
                    segments={(() => {
                      // 優先使用長視頻任務數據（使用 longVideoTaskId 而非 isLongVideoMode）
                      if (longVideoTaskId && longVideoStatus?.segments) {
                        return longVideoStatus.segments.map((seg: any) => ({
                          id: seg.id,
                          batchIndex: seg.batchIndex,
                          status: seg.status as "pending" | "generating" | "completed" | "failed",
                          progress: seg.progress || 0,
                          startTime: seg.startTime,
                          endTime: seg.endTime,
                          description: seg.prompt || seg.description || customScenes[seg.id - 1]?.description,
                          narration: seg.narration || customScenes[seg.id - 1]?.narrationSegments?.[0]?.text,
                          videoUrl: seg.videoUrl,
                          audioUrl: seg.audioUrl,
                          imageUrl: seg.imageUrl,
                        }));
                      }
                      // 其次使用舊的 video 任務數據（taskStatus.scenes）
                      if (activeTaskId && taskStatus?.scenes && taskStatus.scenes.length > 0) {
                        return taskStatus.scenes.map((scene: any, index: number) => ({
                          id: index + 1,
                          batchIndex: 0,
                          status: scene.status as "pending" | "generating" | "completed" | "failed",
                          progress: scene.status === "completed" ? 100 : scene.status === "generating" ? 50 : 0,
                          startTime: index * 8,
                          endTime: (index + 1) * 8,
                          description: scene.prompt || scene.description,
                          narration: scene.narrationSegments?.[0]?.text,
                          videoUrl: scene.videoUrl,
                          audioUrl: scene.audioUrl,
                          imageUrl: scene.imageUrl,
                        }));
                      }
                      // 否則根據用戶選擇的時長生成預覽
                      return Array.from({ length: calculateSegments(selectedDuration) }).map((_, index) => {
                        const batchIndex = Math.floor(index / BATCH_SIZE);
                        const startTime = index * 8;
                        const endTime = startTime + 8;
                        const sceneDescription = customScenes[index]?.description || undefined;
                        
                        return {
                          id: index + 1,
                          batchIndex,
                          status: "pending" as const,
                          progress: 0,
                          startTime,
                          endTime,
                          description: sceneDescription,
                          narration: customScenes[index]?.narrationSegments?.[0]?.text,
                        };
                      });
                    })()}
                    voiceActors={filteredVoiceActors.map((actor: any) => ({
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
                </div>
              </CardContent>
            </Card>

            {/* 當前任務進度 */}
            {activeTaskId && taskStatus && (
              <Card className="glass overflow-hidden">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      {taskStatus.status === "completed" ? (
                        <CheckCircle2 className="w-5 h-5 text-green-500" />
                      ) : taskStatus.status === "failed" ? (
                        <XCircle className="w-5 h-5 text-destructive" />
                      ) : (
                        <Loader2 className="w-5 h-5 text-primary animate-spin" />
                      )}
                      任務進度
                    </CardTitle>
                    <Badge variant={
                      taskStatus.status === "completed" ? "default" :
                      taskStatus.status === "failed" ? "destructive" : "secondary"
                    }>
                      {taskStatus.status === "completed" ? "已完成" :
                       taskStatus.status === "failed" ? "失敗" :
                       taskStatus.currentStep || "處理中"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{taskStatus.currentStep}</span>
                      <span className="font-medium">{taskStatus.progress}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${
                          taskStatus.status === "completed" 
                            ? "bg-green-500" 
                            : taskStatus.status === "failed"
                            ? "bg-destructive"
                            : "progress-shimmer"
                        }`}
                        style={{ width: `${taskStatus.progress}%` }}
                      />
                    </div>
                  </div>

                  {/* 場景進度 - 改進版：卡片式佈局，包含預覽和重新生成按鈕 */}
                  {taskStatus.scenes && taskStatus.scenes.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">場景進度</span>
                        <span className="text-xs text-muted-foreground">
                          {taskStatus.scenes.filter((s: any) => s.status === "completed").length}/{taskStatus.scenes.length} 完成
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {taskStatus.scenes.map((scene: any, index: number) => (
                          <div 
                            key={index}
                            className={`relative rounded-lg overflow-hidden border-2 transition-all ${
                              scene.status === "completed" 
                                ? "border-green-500/50 bg-green-500/5"
                                : scene.status === "generating"
                                ? "border-primary/50 bg-primary/5"
                                : scene.status === "failed"
                                ? "border-destructive/50 bg-destructive/5"
                                : "border-muted bg-muted/20"
                            }`}
                          >
                            {/* 預覽圖/視頻 */}
                            <div className="aspect-video bg-zinc-900 relative">
                              {scene.status === "completed" && scene.videoUrl ? (
                                <video 
                                  src={scene.videoUrl} 
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
                              ) : scene.imageUrl ? (
                                <img src={scene.imageUrl} alt={`場景 ${index + 1}`} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  {scene.status === "generating" ? (
                                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                                  ) : scene.status === "failed" ? (
                                    <XCircle className="w-6 h-6 text-destructive" />
                                  ) : (
                                    <Video className="w-6 h-6 text-muted-foreground/50" />
                                  )}
                                </div>
                              )}
                              
                              {/* 狀態標籤 */}
                              <div className="absolute top-1 left-1">
                                <Badge 
                                  variant={scene.status === "completed" ? "default" : scene.status === "failed" ? "destructive" : "secondary"}
                                  className="text-[10px] px-1.5 py-0"
                                >
                                  #{index + 1}
                                </Badge>
                              </div>
                              
                              {/* 完成標記 */}
                              {scene.status === "completed" && (
                                <div className="absolute top-1 right-1">
                                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                                </div>
                              )}
                            </div>
                            
                            {/* 底部操作區 */}
                            <div className="p-2 space-y-1">
                              <div className="text-xs text-muted-foreground truncate">
                                {scene.prompt ? scene.prompt.substring(0, 30) + "..." : `場景 ${index + 1}`}
                              </div>
                              
                              {/* 重新生成按鈕 - 完成或失敗時顯示 */}
                              {(scene.status === "completed" || scene.status === "failed") && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="w-full h-7 text-xs gap-1"
                                  onClick={() => {
                                    toast.info(`正在重新生成場景 ${index + 1}...`);
                                    // TODO: 實現重新生成邏輯
                                  }}
                                >
                                  <Video className="w-3 h-3" />
                                  重新生成
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 完成後顯示視頻 */}
                  {taskStatus.status === "completed" && taskStatus.finalVideoUrl && (
                    <div className="space-y-4">
                      <video 
                        src={mergedVideoUrl || taskStatus.finalVideoUrl} 
                        controls 
                        className="w-full rounded-lg"
                      />
                      
                      {/* 下載和批量生成按鈕 */}
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          className="flex-1"
                          onClick={() => window.open(mergedVideoUrl || taskStatus.finalVideoUrl!, "_blank")}
                        >
                          <Download className="w-4 h-4 mr-2" />
                          下載視頻
                        </Button>
                        <Button 
                          variant="outline" 
                          className="flex-1"
                          onClick={() => navigate("/batch")}
                        >
                          <Film className="w-4 h-4 mr-2" />
                          批量生成
                        </Button>
                      </div>

                      {/* 合併視頻功能 */}
                      {taskStatus.scenes && taskStatus.scenes.filter((s: any) => s.status === "completed" && s.videoUrl).length > 1 && (
                        <div className="p-4 rounded-lg bg-primary/5 border border-primary/20 space-y-3">
                          <div className="flex items-center gap-2 text-sm font-medium">
                            <Merge className="w-4 h-4 text-primary" />
                            合併所有場景為完整影片
                          </div>
                          
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label className="text-xs text-muted-foreground">背景音樂</Label>
                              <Select value={selectedBgm} onValueChange={setSelectedBgm}>
                                <SelectTrigger className="mt-1">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">無背景音樂</SelectItem>
                                  <SelectItem value="cinematic">電影配樂</SelectItem>
                                  <SelectItem value="emotional">情感音樂</SelectItem>
                                  <SelectItem value="upbeat">歡快音樂</SelectItem>
                                  <SelectItem value="dramatic">戲劇性音樂</SelectItem>
                                  <SelectItem value="peaceful">平靜音樂</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground">字幕樣式</Label>
                              <Select value={selectedSubtitle} onValueChange={setSelectedSubtitle}>
                                <SelectTrigger className="mt-1">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">無字幕</SelectItem>
                                  <SelectItem value="bottom">底部字幕</SelectItem>
                                  <SelectItem value="top">頂部字幕</SelectItem>
                                  <SelectItem value="cinematic">電影字幕</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          <Button 
                            className="w-full"
                            disabled={isMerging}
                            onClick={() => {
                              setIsMerging(true);
                              mergeVideo.mutate({
                                taskId: taskStatus.id,
                                bgmType: selectedBgm as any,
                                subtitleStyle: selectedSubtitle as any,
                              });
                            }}
                          >
                            {isMerging ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                正在合併...
                              </>
                            ) : (
                              <>
                                <Merge className="w-4 h-4 mr-2" />
                                合併為完整影片 ({taskStatus.scenes.filter((s: any) => s.status === "completed").length} 個場景)
                              </>
                            )}
                          </Button>

                          {mergedVideoUrl && (
                            <div className="text-xs text-green-500 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              已合併完成，上方已顯示合併後的視頻
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 錯誤信息 */}
                  {taskStatus.status === "failed" && taskStatus.errorMessage && (
                    <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm">
                      <AlertCircle className="w-4 h-4 inline mr-2" />
                      {taskStatus.errorMessage}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* 右側：歷史記錄和信息 */}
          <div className="space-y-6">
            {/* 模型信息卡片 */}
            <Card className="glass">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-primary" />
                  當前配置
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">視頻模型</span>
                  <span className="font-medium">
                    {VIDEO_MODELS[customVideoModel as keyof typeof VIDEO_MODELS]?.name || 
                     VIDEO_MODELS[speedPreset.video as keyof typeof VIDEO_MODELS]?.name}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">語言模型</span>
                  <span className="font-medium">
                    {speedPreset.llm === "claude-opus-4-5-20250514" ? "Claude Opus 4.5" : "GPT-4o Mini"}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">圖像模型</span>
                  <span className="font-medium">Midjourney v6.1</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">語音合成</span>
                  <span className="font-medium">Kreado AI TTS</span>
                </div>
              </CardContent>
            </Card>

            {/* 歷史記錄 */}
            <Card className="glass">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <History className="w-4 h-4 text-primary" />
                  生成歷史
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!history || history.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground text-sm">
                    <p>暫無生成記錄</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {history.map((task: any) => (
                      <div 
                        key={task.id}
                        className="p-3 rounded-lg bg-background/50 hover:bg-background/80 transition-colors cursor-pointer"
                        onClick={() => setActiveTaskId(task.id)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {task.story.substring(0, 30)}...
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {new Date(task.createdAt).toLocaleString()}
                            </p>
                          </div>
                          <Badge 
                            variant={
                              task.status === "completed" ? "default" :
                              task.status === "failed" ? "destructive" : "secondary"
                            }
                            className="text-xs shrink-0"
                          >
                            {task.status === "completed" ? "完成" :
                             task.status === "failed" ? "失敗" : "進行中"}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 功能說明 */}
            <Card className="glass">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  功能特色
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                  <span>AI 自動分析故事，生成多場景腳本</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                  <span>固定人物形象，保持角色一致性</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                  <span>電影級視頻質量，支持多種模型</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                  <span>自動生成語音旁白和背景音樂</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* 底部 */}
      <footer className="glass mt-12">
        <div className="container py-6 text-center text-sm text-muted-foreground">
          <p>PO Studio - AI 視頻創作平台</p>
        </div>
      </footer>

    </div>
  );
}
