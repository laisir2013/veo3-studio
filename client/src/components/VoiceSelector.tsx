import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Mic, 
  Users, 
  Volume2,
  User,
  Loader2,
  Play,
  Square,
  Search,
  RotateCcw,
  Heart,
  Upload
} from "lucide-react";
import { toast } from "sonner";

// 配音模式類型
export type VoiceMode = "unified" | "perScene" | "character";

// 語言類型
export type VoiceLanguage = "cantonese" | "mandarin" | "english" | "clone";

// 配音員類型
export interface VoiceActor {
  id: string;
  name: string;
  gender: "male" | "female";
  type: "narrator" | "character";
  language: VoiceLanguage;
  voice: string;
  description: string;
  sampleText?: string;
  ageGroup?: string;
  style?: string[];
  useCases?: string[];
  tags?: string[];
  sampleUrl?: string;
  kreadoVoiceId?: string;
  kreadoVoiceSource?: number;
  avatarUrl?: string;
}

// 角色聲音配置
export interface CharacterVoiceConfig {
  characterName: string;
  characterDescription?: string;
  voiceActorId: string;
  isAutoMatched?: boolean;
}

interface VoiceSelectorProps {
  voiceMode: VoiceMode;
  onVoiceModeChange: (mode: VoiceMode) => void;
  selectedVoiceActor?: string;
  onVoiceActorChange: (voiceActorId: string) => void;
  characterVoices?: CharacterVoiceConfig[];
  onCharacterVoicesChange?: (voices: CharacterVoiceConfig[]) => void;
  story?: string;
  storyMode?: "character" | "scene";
  language?: VoiceLanguage;
}

// 配音模式配置
const VOICE_MODES = {
  unified: {
    name: "統一配音",
    description: "所有場景使用同一個配音員",
    icon: Mic,
    features: ["簡單快速", "風格統一", "適合旁白敘事"],
  },
  perScene: {
    name: "場景配音",
    description: "每個場景可選擇不同配音員",
    icon: Volume2,
    features: ["靈活多變", "場景區分", "適合多元內容"],
  },
  character: {
    name: "角色配音",
    description: "根據角色自動分配不同配音員",
    icon: Users,
    features: ["角色區分", "AI 自動配對", "適合對話故事"],
  },
};

// 年齡選項
const AGE_OPTIONS = [
  { value: "all", label: "全部年齡" },
  { value: "youth", label: "青年" },
  { value: "middle", label: "中年" },
  { value: "elderly", label: "老年" },
  { value: "child", label: "兒童" },
];

// 語氣風格選項
const STYLE_OPTIONS = [
  { value: "all", label: "全部風格" },
  { value: "happy", label: "高興" },
  { value: "sad", label: "悲傷" },
  { value: "angry", label: "憤怒" },
  { value: "gentle", label: "溫柔" },
  { value: "serious", label: "嚴肅" },
  { value: "cheerful", label: "活潑" },
  { value: "calm", label: "平靜" },
];

// 使用場景選項
const USE_CASE_OPTIONS = [
  { value: "all", label: "全部場景" },
  { value: "narration", label: "旁白敘事" },
  { value: "dialogue", label: "對話" },
  { value: "advertisement", label: "廣告" },
  { value: "education", label: "教育" },
  { value: "entertainment", label: "娛樂" },
];

export function VoiceSelector({
  voiceMode,
  onVoiceModeChange,
  selectedVoiceActor,
  onVoiceActorChange,
  characterVoices = [],
  onCharacterVoicesChange,
  story,
  storyMode,
  language = "cantonese",
}: VoiceSelectorProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isPlaying, setIsPlaying] = useState<string | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  
  // 篩選狀態
  const [searchKeyword, setSearchKeyword] = useState("");
  const [genderFilter, setGenderFilter] = useState<"all" | "male" | "female">("all");
  const [ageFilter, setAgeFilter] = useState("all");
  const [styleFilter, setStyleFilter] = useState("all");
  const [useCaseFilter, setUseCaseFilter] = useState("all");
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  const [analyzedCharacters, setAnalyzedCharacters] = useState<Array<{
    name: string;
    description: string;
    gender?: string;
  }>>([]);

  // 獲取所有配音員
  const { data: voiceData } = trpc.voice.getAll.useQuery();
  const allVoiceActors = voiceData?.voiceActors || [];

  // 根據語言篩選配音員
  const voiceActorsByLanguage = allVoiceActors.filter(
    (actor: VoiceActor) => actor.language === language
  );

  // 根據所有篩選條件過濾配音員
  const filteredVoiceActors = voiceActorsByLanguage.filter((actor: VoiceActor) => {
    // 關鍵詞搜索
    if (searchKeyword) {
      const keyword = searchKeyword.toLowerCase();
      const matchName = actor.name.toLowerCase().includes(keyword);
      const matchDesc = actor.description?.toLowerCase().includes(keyword);
      const matchTags = actor.tags?.some(tag => tag.toLowerCase().includes(keyword));
      if (!matchName && !matchDesc && !matchTags) return false;
    }
    
    // 性別篩選
    if (genderFilter !== "all" && actor.gender !== genderFilter) return false;
    
    // 年齡篩選
    if (ageFilter !== "all" && actor.ageGroup !== ageFilter) return false;
    
    // 風格篩選
    if (styleFilter !== "all" && !actor.style?.includes(styleFilter)) return false;
    
    // 使用場景篩選
    if (useCaseFilter !== "all" && !actor.useCases?.includes(useCaseFilter)) return false;
    
    // 收藏篩選
    if (showFavoritesOnly && !favorites.includes(actor.id)) return false;
    
    return true;
  });

  // 重置所有篩選
  const resetFilters = () => {
    setSearchKeyword("");
    setGenderFilter("all");
    setAgeFilter("all");
    setStyleFilter("all");
    setUseCaseFilter("all");
    setShowFavoritesOnly(false);
  };

  // 切換收藏
  const toggleFavorite = (actorId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavorites(prev => 
      prev.includes(actorId) 
        ? prev.filter(id => id !== actorId)
        : [...prev, actorId]
    );
  };

  // 試聽配音員聲音
  const handlePlaySample = (actor: VoiceActor, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!actor.sampleUrl) {
      toast.error("此配音員沒有試聽樣本");
      return;
    }

    if (isPlaying === actor.id && audioElement) {
      audioElement.pause();
      audioElement.currentTime = 0;
      setIsPlaying(null);
      setAudioElement(null);
      return;
    }

    if (audioElement) {
      audioElement.pause();
      audioElement.currentTime = 0;
    }

    const audio = new Audio(actor.sampleUrl);
    audio.onended = () => {
      setIsPlaying(null);
      setAudioElement(null);
    };
    audio.onerror = () => {
      toast.error("播放失敗，請稍後再試");
      setIsPlaying(null);
      setAudioElement(null);
    };
    audio.play();
    setIsPlaying(actor.id);
    setAudioElement(audio);
  };

  // 分析角色 mutation
  const analyzeCharacters = trpc.voice.analyzeCharacters.useMutation({
    onSuccess: (data) => {
      setAnalyzedCharacters(data);
      setIsAnalyzing(false);
      toast.success(`分析完成，發現 ${data.length} 個角色`);
    },
    onError: (error) => {
      setIsAnalyzing(false);
      toast.error("角色分析失敗: " + error.message);
    },
  });

  // 自動分配配音員 mutation
  const autoAssign = trpc.voice.autoAssign.useMutation({
    onSuccess: (data) => {
      onCharacterVoicesChange?.(data);
      toast.success("配音員自動分配完成");
    },
    onError: (error) => {
      toast.error("自動分配失敗: " + error.message);
    },
  });

  // 分析故事中的角色
  const handleAnalyzeCharacters = () => {
    if (!story) {
      toast.error("請先輸入故事內容");
      return;
    }
    setIsAnalyzing(true);
    analyzeCharacters.mutate({ story });
  };

  // 自動分配配音員
  const handleAutoAssign = () => {
    if (analyzedCharacters.length === 0) {
      toast.error("請先分析角色");
      return;
    }
    autoAssign.mutate({
      characters: analyzedCharacters.map(c => ({
        name: c.name,
        description: c.description,
      })),
    });
  };

  // 更新角色的配音員
  const updateCharacterVoice = (characterName: string, voiceActorId: string) => {
    const newVoices = [...characterVoices];
    const index = newVoices.findIndex(v => v.characterName === characterName);
    if (index >= 0) {
      newVoices[index] = { ...newVoices[index], voiceActorId, isAutoMatched: false };
    } else {
      newVoices.push({ characterName, voiceActorId, isAutoMatched: false });
    }
    onCharacterVoicesChange?.(newVoices);
  };

  // 獲取配音員頭像
  const getAvatarUrl = (actor: VoiceActor) => {
    if (actor.avatarUrl) return actor.avatarUrl;
    // 默認頭像
    return actor.gender === "male" 
      ? "https://api.dicebear.com/7.x/avataaars/svg?seed=" + actor.id + "&backgroundColor=b6e3f4"
      : "https://api.dicebear.com/7.x/avataaars/svg?seed=" + actor.id + "&backgroundColor=ffdfbf";
  };

  return (
    <Card className="glass">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mic className="w-5 h-5 text-primary" />
          配音設定
        </CardTitle>
        <CardDescription>
          選擇配音模式和配音員，讓您的視頻更生動
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 配音模式選擇 */}
        <div className="space-y-3">
          <Label>配音模式</Label>
          <div className="grid sm:grid-cols-3 gap-3">
            {(Object.entries(VOICE_MODES) as [VoiceMode, typeof VOICE_MODES.unified][]).map(([key, mode]) => {
              const isSelected = voiceMode === key;
              const ModeIcon = mode.icon;
              return (
                <Card 
                  key={key}
                  className={`cursor-pointer transition-all duration-300 ${
                    isSelected 
                      ? "border-primary border-2 bg-primary/5" 
                      : "border-border hover:border-muted-foreground/50"
                  }`}
                  onClick={() => onVoiceModeChange(key)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <ModeIcon className={`w-4 h-4 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                      <span className="font-medium text-sm">{mode.name}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{mode.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* 克隆聲音上傳區域 */}
        {language === "clone" && (
          <div className="space-y-3 p-4 border border-dashed border-amber-500/50 rounded-lg bg-amber-500/5">
            <div className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-amber-500" />
              <Label className="text-amber-500">上傳克隆聲音</Label>
            </div>
            <p className="text-sm text-muted-foreground">
              上傳一段清晰的語音樣本（30秒-3分鐘），系統將克隆該聲音用於配音
            </p>
            <div className="flex gap-2">
              <Input 
                type="file" 
                accept="audio/*"
                className="flex-1"
              />
              <Button variant="outline" className="border-amber-500/50 text-amber-500 hover:bg-amber-500/10">
                上傳
              </Button>
            </div>
          </div>
        )}

        {/* 統一配音模式 - 選擇配音員 */}
        {voiceMode === "unified" && language !== "clone" && (
          <div className="space-y-4">
            {/* 篩選器區域 - 像 KreadoAI */}
            <div className="p-4 bg-muted/30 rounded-lg space-y-4">
              {/* 第一行篩選器 */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                {/* 語言顯示 */}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">語言</Label>
                  <div className="h-9 px-3 flex items-center bg-background rounded-md border text-sm">
                    {language === "cantonese" ? "粵語" : language === "mandarin" ? "普通話" : "English"}
                  </div>
                </div>
                
                {/* 性別 */}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">性別</Label>
                  <Select value={genderFilter} onValueChange={(v) => setGenderFilter(v as any)}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部</SelectItem>
                      <SelectItem value="male">男性</SelectItem>
                      <SelectItem value="female">女性</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* 年齡 */}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">年齡</Label>
                  <Select value={ageFilter} onValueChange={setAgeFilter}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AGE_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* 語氣風格 */}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">語氣風格</Label>
                  <Select value={styleFilter} onValueChange={setStyleFilter}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STYLE_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* 使用場景 */}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">使用場景</Label>
                  <Select value={useCaseFilter} onValueChange={setUseCaseFilter}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {USE_CASE_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* 收藏篩選 */}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">收藏</Label>
                  <Button 
                    variant={showFavoritesOnly ? "default" : "outline"} 
                    className="w-full h-9"
                    onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                  >
                    <Heart className={`w-4 h-4 mr-1 ${showFavoritesOnly ? "fill-current" : ""}`} />
                    我的收藏
                  </Button>
                </div>
              </div>

              {/* 第二行：搜索和重置 */}
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="輸入關鍵詞搜索配音員..."
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Button variant="outline" onClick={resetFilters}>
                  <RotateCcw className="w-4 h-4 mr-1" />
                  重置選項
                </Button>
              </div>
            </div>

            {/* 配音員數量統計 */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                共 {filteredVoiceActors.length} 位配音員
              </span>
            </div>

            {/* 配音員列表 - 像 KreadoAI 的卡片設計 */}
            <ScrollArea className="h-[500px] pr-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredVoiceActors.length === 0 ? (
                  <div className="col-span-full text-center py-8 text-muted-foreground">
                    暫無符合條件的配音員
                  </div>
                ) : (
                  filteredVoiceActors.map((actor: VoiceActor) => {
                    const isSelected = selectedVoiceActor === actor.id;
                    const isFavorite = favorites.includes(actor.id);
                    const isCurrentlyPlaying = isPlaying === actor.id;
                    
                    return (
                      <Card
                        key={actor.id}
                        className={`cursor-pointer transition-all duration-200 hover:shadow-md ${
                          isSelected 
                            ? "border-primary border-2 bg-primary/5" 
                            : "border-border hover:border-primary/50"
                        }`}
                        onClick={() => onVoiceActorChange(actor.id)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            {/* 頭像 */}
                            <div className="relative">
                              <img 
                                src={getAvatarUrl(actor)} 
                                alt={actor.name}
                                className="w-14 h-14 rounded-full object-cover border-2 border-muted"
                              />
                              {isSelected && (
                                <div className="absolute -top-1 -right-1 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                  </svg>
                                </div>
                              )}
                            </div>

                            {/* 信息 */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <h4 className="font-medium truncate">{actor.name}</h4>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 shrink-0"
                                  onClick={(e) => toggleFavorite(actor.id, e)}
                                >
                                  <Heart className={`w-4 h-4 ${isFavorite ? "fill-red-500 text-red-500" : "text-muted-foreground"}`} />
                                </Button>
                              </div>
                              
                              <p className="text-xs text-muted-foreground mb-2">
                                {language === "cantonese" ? "粵語" : language === "mandarin" ? "普通話" : "English"}
                              </p>

                              {/* 標籤 */}
                              <div className="flex flex-wrap gap-1 mb-3">
                                <Badge variant="secondary" className="text-xs">
                                  {actor.gender === "male" ? "男性" : "女性"}
                                </Badge>
                                {actor.ageGroup && (
                                  <Badge variant="secondary" className="text-xs">
                                    {actor.ageGroup === "youth" ? "青年" : 
                                     actor.ageGroup === "middle" ? "中年" : 
                                     actor.ageGroup === "elderly" ? "老年" : "兒童"}
                                  </Badge>
                                )}
                                {actor.style?.[0] && (
                                  <Badge variant="outline" className="text-xs">
                                    {actor.style[0]}
                                  </Badge>
                                )}
                              </div>

                              {/* 試聽按鈕 */}
                              <Button
                                variant="outline"
                                size="sm"
                                className="w-full"
                                onClick={(e) => handlePlaySample(actor, e)}
                              >
                                {isCurrentlyPlaying ? (
                                  <>
                                    <Square className="w-3 h-3 mr-1 fill-current" />
                                    停止
                                  </>
                                ) : (
                                  <>
                                    <Play className="w-3 h-3 mr-1" />
                                    試聽
                                  </>
                                )}
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* 角色配音模式 */}
        {voiceMode === "character" && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button
                onClick={handleAnalyzeCharacters}
                disabled={isAnalyzing || !story}
                className="flex-1"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    分析中...
                  </>
                ) : (
                  <>
                    <Wand2 className="w-4 h-4 mr-2" />
                    分析角色
                  </>
                )}
              </Button>
              <Button
                onClick={handleAutoAssign}
                disabled={analyzedCharacters.length === 0}
                variant="outline"
              >
                <Users className="w-4 h-4 mr-2" />
                自動分配配音員
              </Button>
            </div>

            {analyzedCharacters.length > 0 && (
              <div className="space-y-3">
                <Label>角色配音分配</Label>
                {analyzedCharacters.map((char) => {
                  const voiceConfig = characterVoices.find(v => v.characterName === char.name);
                  return (
                    <div key={char.name} className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                      <div className="flex-1">
                        <p className="font-medium">{char.name}</p>
                        <p className="text-xs text-muted-foreground">{char.description}</p>
                      </div>
                      <Select
                        value={voiceConfig?.voiceActorId || ""}
                        onValueChange={(v) => updateCharacterVoice(char.name, v)}
                      >
                        <SelectTrigger className="w-[180px]">
                          <SelectValue placeholder="選擇配音員" />
                        </SelectTrigger>
                        <SelectContent>
                          {voiceActorsByLanguage.map((actor: VoiceActor) => (
                            <SelectItem key={actor.id} value={actor.id}>
                              {actor.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// 為了向後兼容，添加 Wand2 import
import { Wand2 } from "lucide-react";

export default VoiceSelector;
