import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl, isGuestMode } from "@/const";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Zap, 
  Sparkles, 
  Play, 
  Plus,
  Trash2,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Video,
  ArrowLeft,
  Download
} from "lucide-react";

// 速度模式預設配置
const SPEED_MODE_PRESETS = {
  fast: {
    name: "快速模式",
    description: "適合測試和快速迭代",
    icon: Zap,
    color: "from-amber-500 to-orange-500",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/30",
  },
  quality: {
    name: "高質量模式",
    description: "電影級品質，適合正式製作",
    icon: Sparkles,
    color: "from-purple-500 to-pink-500",
    bgColor: "bg-purple-500/10",
    borderColor: "border-purple-500/30",
  },
};

// 故事模式預設配置
const STORY_MODE_PRESETS = {
  character: {
    name: "固定人物模式",
    icon: "👤",
  },
  scene: {
    name: "劇情模式",
    icon: "🎬",
  },
};

interface StoryInput {
  id: string;
  story: string;
  characterDescription?: string;
  visualStyle?: string;
}

export default function BatchGenerate() {
  const { user, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  
  // 表單狀態
  const [selectedSpeedMode, setSelectedSpeedMode] = useState<"fast" | "quality">("fast");
  const [selectedStoryMode, setSelectedStoryMode] = useState<"character" | "scene">("character");
  const [stories, setStories] = useState<StoryInput[]>([
    { id: "1", story: "", characterDescription: "", visualStyle: "" },
  ]);
  
  // 批量任務狀態
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // tRPC mutations
  const createBatch = trpc.batch.create.useMutation({
    onSuccess: (data) => {
      setActiveJobId(data.jobId);
    },
  });

  // 獲取批量任務狀態
  const { data: jobStatus, refetch: refetchStatus } = trpc.batch.getStatus.useQuery(
    { jobId: activeJobId! },
    { enabled: !!activeJobId }
  );

  // 獲取批量配置
  const { data: batchConfig } = trpc.batch.getConfig.useQuery();

  // 輪詢任務狀態
  useEffect(() => {
    if (activeJobId && jobStatus?.status !== "completed" && jobStatus?.status !== "failed") {
      pollingRef.current = setInterval(() => {
        refetchStatus();
      }, 5000);
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [activeJobId, jobStatus?.status, refetchStatus]);

  // 添加故事
  const addStory = () => {
    if (stories.length < (batchConfig?.maxStories || 20)) {
      setStories([
        ...stories,
        { id: Date.now().toString(), story: "", characterDescription: "", visualStyle: "" },
      ]);
    }
  };

  // 刪除故事
  const removeStory = (id: string) => {
    if (stories.length > 1) {
      setStories(stories.filter(s => s.id !== id));
    }
  };

  // 更新故事
  const updateStory = (id: string, field: keyof StoryInput, value: string) => {
    setStories(stories.map(s => 
      s.id === id ? { ...s, [field]: value } : s
    ));
  };

  // 提交批量任務
  const handleSubmit = () => {
    const validStories = stories.filter(s => s.story.trim().length >= 10);
    if (validStories.length === 0) return;

    createBatch.mutate({
      stories: validStories.map(s => ({
        story: s.story,
        characterDescription: s.characterDescription || undefined,
        visualStyle: s.visualStyle || undefined,
      })),
      speedMode: selectedSpeedMode,
      storyMode: selectedStoryMode,
    });
  };

  // 未登錄提示 - 訪客模式下跳過
  if (!authLoading && !user && !isGuestMode()) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-gray-800/50 border-gray-700">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl text-white">請先登錄</CardTitle>
            <CardDescription className="text-gray-400">
              登錄後即可使用批量視頻生成功能
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              className="w-full bg-gradient-to-r from-purple-500 to-pink-500"
              onClick={() => window.location.href = getLoginUrl()}
            >
              立即登錄
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const speedPreset = SPEED_MODE_PRESETS[selectedSpeedMode];
  const storyPreset = STORY_MODE_PRESETS[selectedStoryMode];
  const validStoriesCount = stories.filter(s => s.story.trim().length >= 10).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => navigate("/")}
              className="text-gray-400 hover:text-white"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              返回
            </Button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                <Video className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">批量生成</h1>
                <p className="text-sm text-gray-400">一次生成多個視頻</p>
              </div>
            </div>
          </div>
          <Badge variant="outline" className="border-purple-500/50 text-purple-400">
            最多 {batchConfig?.maxStories || 20} 個故事
          </Badge>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* 如果有進行中的任務，顯示進度 */}
        {activeJobId && jobStatus && (
          <Card className="mb-8 bg-gray-800/50 border-gray-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                {jobStatus.status === "completed" ? (
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                ) : jobStatus.status === "failed" ? (
                  <XCircle className="w-5 h-5 text-red-500" />
                ) : (
                  <Loader2 className="w-5 h-5 text-purple-500 animate-spin" />
                )}
                批量任務進度
              </CardTitle>
              <CardDescription className="text-gray-400">
                {jobStatus.completedTasks}/{jobStatus.totalTasks} 個任務完成
                {jobStatus.failedTasks > 0 && ` (${jobStatus.failedTasks} 個失敗)`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Progress value={jobStatus.progress} className="h-3 mb-4" />
              
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {jobStatus.tasks.map((task, index) => (
                  <div 
                    key={task.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-gray-900/50"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-gray-500 text-sm">#{index + 1}</span>
                      <span className="text-white text-sm truncate max-w-xs">
                        {stories[index]?.story.slice(0, 50)}...
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      {task.status === "completed" && task.result?.videoUrl && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-green-400"
                          onClick={() => window.open(task.result?.videoUrl, "_blank")}
                        >
                          <Download className="w-4 h-4 mr-1" />
                          下載
                        </Button>
                      )}
                      <Badge
                        variant={
                          task.status === "completed" ? "default" :
                          task.status === "failed" ? "destructive" :
                          task.status === "processing" ? "secondary" :
                          "outline"
                        }
                      >
                        {task.status === "completed" ? "完成" :
                         task.status === "failed" ? "失敗" :
                         task.status === "processing" ? `${task.progress}%` :
                         "等待中"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>

              {jobStatus.status === "completed" && (
                <Button
                  className="w-full mt-4 bg-gradient-to-r from-purple-500 to-pink-500"
                  onClick={() => {
                    setActiveJobId(null);
                    setStories([{ id: "1", story: "", characterDescription: "", visualStyle: "" }]);
                  }}
                >
                  開始新的批量任務
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* 批量輸入表單 */}
        {!activeJobId && (
          <>
            {/* 模式選擇 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              {/* 速度模式 */}
              <div className="space-y-3">
                <h3 className="text-white font-medium">速度模式</h3>
                <div className="grid grid-cols-2 gap-3">
                  {(Object.entries(SPEED_MODE_PRESETS) as [keyof typeof SPEED_MODE_PRESETS, typeof SPEED_MODE_PRESETS[keyof typeof SPEED_MODE_PRESETS]][]).map(([key, preset]) => {
                    const Icon = preset.icon;
                    const isSelected = selectedSpeedMode === key;
                    return (
                      <button
                        key={key}
                        onClick={() => setSelectedSpeedMode(key)}
                        className={`p-4 rounded-xl border-2 transition-all ${
                          isSelected 
                            ? `${preset.borderColor} ${preset.bgColor}` 
                            : "border-gray-700 bg-gray-800/30 hover:border-gray-600"
                        }`}
                      >
                        <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${preset.color} flex items-center justify-center mb-2`}>
                          <Icon className="w-4 h-4 text-white" />
                        </div>
                        <div className="text-white font-medium text-sm">{preset.name}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 故事模式 */}
              <div className="space-y-3">
                <h3 className="text-white font-medium">故事模式</h3>
                <div className="grid grid-cols-2 gap-3">
                  {(Object.entries(STORY_MODE_PRESETS) as [keyof typeof STORY_MODE_PRESETS, typeof STORY_MODE_PRESETS[keyof typeof STORY_MODE_PRESETS]][]).map(([key, preset]) => {
                    const isSelected = selectedStoryMode === key;
                    return (
                      <button
                        key={key}
                        onClick={() => setSelectedStoryMode(key)}
                        className={`p-4 rounded-xl border-2 transition-all ${
                          isSelected 
                            ? "border-purple-500/50 bg-purple-500/10" 
                            : "border-gray-700 bg-gray-800/30 hover:border-gray-600"
                        }`}
                      >
                        <div className="text-2xl mb-2">{preset.icon}</div>
                        <div className="text-white font-medium text-sm">{preset.name}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 故事列表 */}
            <div className="space-y-4 mb-8">
              <div className="flex items-center justify-between">
                <h3 className="text-white font-medium">故事列表 ({stories.length})</h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addStory}
                  disabled={stories.length >= (batchConfig?.maxStories || 20)}
                  className="border-gray-600 text-gray-300"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  添加故事
                </Button>
              </div>

              {stories.map((storyInput, index) => (
                <Card key={storyInput.id} className="bg-gray-800/50 border-gray-700">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-white text-base">故事 #{index + 1}</CardTitle>
                      {stories.length > 1 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeStory(storyInput.id)}
                          className="text-red-400 hover:text-red-300"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Textarea
                      placeholder="描述您想要生成的視頻故事，AI 將自動分析並生成多個場景..."
                      value={storyInput.story}
                      onChange={(e) => updateStory(storyInput.id, "story", e.target.value)}
                      className="min-h-24 bg-gray-900/50 border-gray-600 text-white placeholder:text-gray-500"
                    />
                    {selectedStoryMode === "character" && (
                      <Textarea
                        placeholder="角色描述（可選）：描述主要角色的外觀特徵..."
                        value={storyInput.characterDescription}
                        onChange={(e) => updateStory(storyInput.id, "characterDescription", e.target.value)}
                        className="min-h-16 bg-gray-900/50 border-gray-600 text-white placeholder:text-gray-500"
                      />
                    )}
                    <Textarea
                      placeholder="視覺風格（可選）：如電影感、動畫風格、復古等..."
                      value={storyInput.visualStyle}
                      onChange={(e) => updateStory(storyInput.id, "visualStyle", e.target.value)}
                      className="min-h-16 bg-gray-900/50 border-gray-600 text-white placeholder:text-gray-500"
                    />
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* 提交按鈕 */}
            <Card className="bg-gray-800/50 border-gray-700">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-gray-400">
                    <span className="text-white font-medium">{validStoriesCount}</span> 個有效故事
                    {batchConfig && (
                      <span className="ml-2">
                        · 最大並行數: <span className="text-white">{batchConfig.maxConcurrency}</span>
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-gray-400">
                    <Clock className="w-4 h-4" />
                    預估時間: {selectedSpeedMode === "fast" ? "3-5" : "10-15"} 分鐘/個
                  </div>
                </div>
                <Button
                  className="w-full h-12 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-medium"
                  disabled={validStoriesCount === 0 || createBatch.isPending}
                  onClick={handleSubmit}
                >
                  {createBatch.isPending ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      創建任務中...
                    </>
                  ) : (
                    <>
                      <Play className="w-5 h-5 mr-2" />
                      開始批量生成 ({validStoriesCount} 個視頻)
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
