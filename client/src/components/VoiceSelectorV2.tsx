import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Mic, 
  Users, 
  Volume2,
  User,
  Baby,
  UserCircle,
  Check,
  Play,
  Pause,
  Square,
  Search,
  Filter,
  X,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

// 語言類型
export type VoiceLanguage = "cantonese" | "mandarin" | "english" | "clone";

// 年齡段類型
export type AgeGroup = "child" | "teen" | "young" | "adult" | "middle" | "elder";

// 風格類型
export type VoiceStyle = 
  | "narrator" | "character" | "news" | "commercial" 
  | "storytelling" | "assistant" | "cartoon" | "emotional" | "professional";

// 配音員配置接口
export interface VoiceActorConfig {
  id: string;
  name: string;
  gender: "male" | "female";
  type: "narrator" | "character";
  language: VoiceLanguage;
  ageGroup: AgeGroup;
  style: VoiceStyle[];
  description: string;
  useCases: string[];
  voice: string;
  sampleText: string;
  sampleUrl?: string;
  tags: string[];
  kreadoVoiceId: string;
  kreadoVoiceSource: number;
}

interface VoiceSelectorV2Props {
  selectedVoiceActor?: string;
  onVoiceActorChange: (voiceActorId: string) => void;
  language?: VoiceLanguage;
  onLanguageChange?: (language: VoiceLanguage) => void;
  compact?: boolean;
}

// 篩選選項配置
const FILTER_OPTIONS = {
  genders: [
    { value: "male", label: "男聲", icon: "👨" },
    { value: "female", label: "女聲", icon: "👩" },
  ],
  ageGroups: [
    { value: "child", label: "童聲", icon: "👶" },
    { value: "teen", label: "少年", icon: "🧒" },
    { value: "young", label: "青年", icon: "👱" },
    { value: "adult", label: "成年", icon: "🧑" },
    { value: "middle", label: "中年", icon: "👨‍💼" },
    { value: "elder", label: "老年", icon: "👴" },
  ],
  styles: [
    { value: "narrator", label: "旁白", icon: "🎙️" },
    { value: "character", label: "角色", icon: "🎭" },
    { value: "news", label: "新聞", icon: "📰" },
    { value: "commercial", label: "廣告", icon: "📢" },
    { value: "storytelling", label: "故事", icon: "📖" },
    { value: "assistant", label: "助手", icon: "🤖" },
    { value: "cartoon", label: "卡通", icon: "🎨" },
    { value: "emotional", label: "情感", icon: "💕" },
    { value: "professional", label: "專業", icon: "💼" },
  ],
};

export function VoiceSelectorV2({
  selectedVoiceActor,
  onVoiceActorChange,
  language = "cantonese",
  onLanguageChange,
  compact = false,
}: VoiceSelectorV2Props) {
  // 篩選狀態
  const [searchText, setSearchText] = useState("");
  const [selectedGender, setSelectedGender] = useState<"male" | "female" | undefined>();
  const [selectedAgeGroup, setSelectedAgeGroup] = useState<AgeGroup | undefined>();
  const [selectedStyle, setSelectedStyle] = useState<VoiceStyle | undefined>();
  
  // 播放狀態
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  // 獲取配音員數據
  const { data: voiceData, isLoading: isLoadingVoices } = trpc.voice.filter.useQuery({
    language,
    gender: selectedGender,
    ageGroup: selectedAgeGroup,
    style: selectedStyle,
    searchText: searchText || undefined,
  });
  
  const voiceActors = voiceData || [];
  
  // 獲取統計數據
  const { data: statsData } = trpc.voice.getAllConfig.useQuery();
  const stats = statsData?.stats;

  // 清理音頻
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // 播放試聽
  const handlePlay = async (actor: VoiceActorConfig) => {
    // 如果正在播放同一個，則停止
    if (playingId === actor.id) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setPlayingId(null);
      return;
    }
    
    // 停止之前的播放
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    
    if (!actor.sampleUrl) {
      toast.error("此配音員暫無試聽音頻");
      return;
    }
    
    setIsLoading(actor.id);
    
    try {
      const audio = new Audio(actor.sampleUrl);
      audioRef.current = audio;
      
      audio.oncanplaythrough = () => {
        setIsLoading(null);
        setPlayingId(actor.id);
        audio.play();
      };
      
      audio.onended = () => {
        setPlayingId(null);
      };
      
      audio.onerror = () => {
        setIsLoading(null);
        setPlayingId(null);
        toast.error("音頻加載失敗");
      };
      
      audio.load();
    } catch (error) {
      setIsLoading(null);
      toast.error("播放失敗");
    }
  };

  // 停止播放
  const handleStop = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPlayingId(null);
  };

  // 清除篩選
  const clearFilters = () => {
    setSearchText("");
    setSelectedGender(undefined);
    setSelectedAgeGroup(undefined);
    setSelectedStyle(undefined);
  };

  // 是否有篩選
  const hasFilters = searchText || selectedGender || selectedAgeGroup || selectedStyle;

  // 獲取配音員圖標
  const getVoiceActorIcon = (actor: VoiceActorConfig) => {
    if (actor.type === "narrator") return Mic;
    if (actor.ageGroup === "child") return Baby;
    if (actor.ageGroup === "elder") return UserCircle;
    return User;
  };

  // 獲取年齡段標籤
  const getAgeGroupLabel = (ageGroup: AgeGroup) => {
    const option = FILTER_OPTIONS.ageGroups.find(o => o.value === ageGroup);
    return option ? `${option.icon} ${option.label}` : ageGroup;
  };

  return (
    <div className="space-y-4">
      {/* 搜索和篩選欄 */}
      <div className="flex flex-wrap gap-2">
        {/* 搜索框 */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="搜索配音員名稱、描述、標籤..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="pl-9"
          />
          {searchText && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
              onClick={() => setSearchText("")}
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>

        {/* 性別篩選 */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-2">
              {selectedGender ? (
                <>
                  {FILTER_OPTIONS.genders.find(g => g.value === selectedGender)?.icon}
                  {FILTER_OPTIONS.genders.find(g => g.value === selectedGender)?.label}
                </>
              ) : (
                <>
                  <Filter className="w-4 h-4" />
                  性別
                </>
              )}
              <ChevronDown className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>選擇性別</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={!selectedGender}
              onCheckedChange={() => setSelectedGender(undefined)}
            >
              全部
            </DropdownMenuCheckboxItem>
            {FILTER_OPTIONS.genders.map(option => (
              <DropdownMenuCheckboxItem
                key={option.value}
                checked={selectedGender === option.value}
                onCheckedChange={() => setSelectedGender(option.value as "male" | "female")}
              >
                {option.icon} {option.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* 年齡段篩選 */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-2">
              {selectedAgeGroup ? (
                <>
                  {FILTER_OPTIONS.ageGroups.find(a => a.value === selectedAgeGroup)?.icon}
                  {FILTER_OPTIONS.ageGroups.find(a => a.value === selectedAgeGroup)?.label}
                </>
              ) : (
                <>
                  <Users className="w-4 h-4" />
                  年齡
                </>
              )}
              <ChevronDown className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>選擇年齡段</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={!selectedAgeGroup}
              onCheckedChange={() => setSelectedAgeGroup(undefined)}
            >
              全部
            </DropdownMenuCheckboxItem>
            {FILTER_OPTIONS.ageGroups.map(option => (
              <DropdownMenuCheckboxItem
                key={option.value}
                checked={selectedAgeGroup === option.value}
                onCheckedChange={() => setSelectedAgeGroup(option.value as AgeGroup)}
              >
                {option.icon} {option.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* 風格篩選 */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-2">
              {selectedStyle ? (
                <>
                  {FILTER_OPTIONS.styles.find(s => s.value === selectedStyle)?.icon}
                  {FILTER_OPTIONS.styles.find(s => s.value === selectedStyle)?.label}
                </>
              ) : (
                <>
                  <Volume2 className="w-4 h-4" />
                  風格
                </>
              )}
              <ChevronDown className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>選擇風格</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={!selectedStyle}
              onCheckedChange={() => setSelectedStyle(undefined)}
            >
              全部
            </DropdownMenuCheckboxItem>
            {FILTER_OPTIONS.styles.map(option => (
              <DropdownMenuCheckboxItem
                key={option.value}
                checked={selectedStyle === option.value}
                onCheckedChange={() => setSelectedStyle(option.value as VoiceStyle)}
              >
                {option.icon} {option.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* 清除篩選 */}
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="w-4 h-4 mr-1" />
            清除篩選
          </Button>
        )}
      </div>

      {/* 統計信息 */}
      {stats && (
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>共 {voiceActors.length} 個配音員</span>
          {language && (
            <span>
              {language === "cantonese" ? "粵語" : 
               language === "mandarin" ? "普通話" : 
               language === "clone" ? "克隆聲音" : "English"}: 
              {stats.byLanguage[language]} 個
            </span>
          )}
        </div>
      )}

      {/* 配音員列表 */}
      <ScrollArea className={compact ? "h-[300px]" : "h-[400px]"}>
        {isLoadingVoices ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : voiceActors.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
            <p>沒有找到符合條件的配音員</p>
            {hasFilters && (
              <Button variant="link" size="sm" onClick={clearFilters}>
                清除篩選條件
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pr-4">
            {voiceActors.map((actor: VoiceActorConfig) => {
              const ActorIcon = getVoiceActorIcon(actor);
              const isSelected = selectedVoiceActor === actor.id;
              const isPlaying = playingId === actor.id;
              const isLoadingAudio = isLoading === actor.id;
              
              return (
                <Card 
                  key={actor.id}
                  className={`cursor-pointer transition-all duration-200 hover:shadow-md ${
                    isSelected 
                      ? "border-primary border-2 bg-primary/5 ring-2 ring-primary/20" 
                      : "border-border hover:border-primary/50"
                  } ${actor.language === "clone" ? "border-amber-500/50 bg-amber-500/5" : ""}`}
                  onClick={() => onVoiceActorChange(actor.id)}
                >
                  <CardContent className="p-3">
                    {/* 頂部：名稱和標籤 */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <ActorIcon className={`w-4 h-4 flex-shrink-0 ${isSelected ? "text-primary" : actor.language === "clone" ? "text-amber-500" : "text-muted-foreground"}`} />
                        <span className={`font-medium text-sm truncate ${actor.language === "clone" ? "text-amber-500" : ""}`}>{actor.name}</span>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-primary flex-shrink-0" />}
                    </div>
                    
                    {/* 標籤行 */}
                    <div className="flex items-center gap-1.5 mb-2">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {actor.gender === "male" ? "男" : "女"}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {actor.type === "narrator" ? "旁白" : "角色"}
                      </Badge>
                      {actor.language === "clone" && (
                        <Badge className="text-[10px] px-1.5 py-0 bg-amber-500/20 text-amber-500 border-amber-500/30">
                          克隆
                        </Badge>
                      )}
                    </div>
                    
                    {/* 描述 */}
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-2 min-h-[32px]">{actor.description}</p>
                    
                    {/* 試聽按鈕 */}
                    <Button
                      variant={isPlaying ? "default" : "outline"}
                      size="sm"
                      className={`w-full h-8 text-xs gap-1.5 ${actor.language === "clone" ? "border-amber-500/50 hover:bg-amber-500/10" : ""}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePlay(actor);
                      }}
                    >
                      {isLoadingAudio ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          載入中...
                        </>
                      ) : isPlaying ? (
                        <>
                          <Square className="w-3 h-3" />
                          停止試聽
                        </>
                      ) : (
                        <>
                          <Play className="w-3 h-3" />
                          試聽聲音
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

export default VoiceSelectorV2;
