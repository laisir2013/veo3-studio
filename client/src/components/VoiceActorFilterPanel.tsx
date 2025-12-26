import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Search, 
  Play, 
  Pause, 
  Volume2, 
  Users,
  Filter,
  X,
  Loader2,
  CheckCircle2
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

type AgeGroup = "child" | "teen" | "young" | "adult" | "middle" | "elder";
type VoiceStyle = "narrator" | "character" | "news" | "commercial" | "storytelling" | "assistant" | "cartoon" | "emotional" | "professional";

interface VoiceActorFilterPanelProps {
  language: string;
  onVoiceActorSelected: (actorId: string) => void;
  selectedVoiceActorId?: string;
}

export function VoiceActorFilterPanel({
  language,
  onVoiceActorSelected,
  selectedVoiceActorId,
}: VoiceActorFilterPanelProps) {
  const [gender, setGender] = useState<"male" | "female" | undefined>();
  const [ageGroup, setAgeGroup] = useState<AgeGroup | undefined>();
  const [style, setStyle] = useState<VoiceStyle | undefined>();
  const [searchText, setSearchText] = useState("");
  const [playingActorId, setPlayingActorId] = useState<string | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

  // 篩選配音員
  const { data: filterResult, isLoading } = trpc.voice.filterAdvanced.useQuery({
    language: language as "cantonese" | "mandarin" | "english" | "clone",
    gender,
    ageGroup,
    style,
    searchText,
  });

  const actors = filterResult?.actors || [];

  // 播放試聽音頻
  const handlePlaySample = (actorId: string, sampleUrl?: string) => {
    if (!sampleUrl) {
      toast.error("沒有試聽音頻");
      return;
    }

    if (playingActorId === actorId) {
      // 停止播放
      if (audioElement) {
        audioElement.pause();
      }
      setPlayingActorId(null);
    } else {
      // 播放新的
      if (audioElement) {
        audioElement.pause();
      }
      const audio = new Audio(sampleUrl);
      audio.onended = () => setPlayingActorId(null);
      audio.play();
      setAudioElement(audio);
      setPlayingActorId(actorId);
    }
  };

  // 清除篩選
  const clearFilters = () => {
    setGender(undefined);
    setAgeGroup(undefined);
    setStyle(undefined);
    setSearchText("");
  };

  const hasActiveFilters = gender || ageGroup || style || searchText;

  return (
    <Card className="glass">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          第 2 步：篩選配音員
        </CardTitle>
        <CardDescription>
          根據性別、年齡、語氣等條件篩選配音員，並試聽語音
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 篩選器 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* 性別篩選 */}
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Filter className="w-4 h-4" />
              性別
            </Label>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={gender === "male" ? "default" : "outline"}
                onClick={() => setGender(gender === "male" ? undefined : "male")}
                className="flex-1"
              >
                男性
              </Button>
              <Button
                size="sm"
                variant={gender === "female" ? "default" : "outline"}
                onClick={() => setGender(gender === "female" ? undefined : "female")}
                className="flex-1"
              >
                女性
              </Button>
            </div>
          </div>

          {/* 年齡篩選 */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">年齡</Label>
            <select
              value={ageGroup || ""}
              onChange={(e) => setAgeGroup((e.target.value as AgeGroup) || undefined)}
              className="w-full px-3 py-2 rounded-lg bg-background/50 border border-zinc-700 text-sm"
            >
              <option value="">全部</option>
              <option value="child">兒童</option>
              <option value="teen">青少年</option>
              <option value="young">年輕</option>
              <option value="adult">成人</option>
              <option value="middle">中年</option>
              <option value="elder">老年</option>
            </select>
          </div>

          {/* 語氣篩選 */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">語氣</Label>
            <select
              value={style || ""}
              onChange={(e) => setStyle((e.target.value as VoiceStyle) || undefined)}
              className="w-full px-3 py-2 rounded-lg bg-background/50 border border-zinc-700 text-sm"
            >
              <option value="">全部</option>
              <option value="narrator">旁白</option>
              <option value="character">角色</option>
              <option value="news">新聞</option>
              <option value="commercial">廣告</option>
              <option value="storytelling">故事講述</option>
              <option value="assistant">助手</option>
              <option value="cartoon">卡通</option>
              <option value="emotional">情感</option>
              <option value="professional">專業</option>
            </select>
          </div>

          {/* 搜索框 */}
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Search className="w-4 h-4" />
              搜索
            </Label>
            <Input
              placeholder="搜索配音員..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="bg-background/50"
            />
          </div>

          {/* 清除篩選按鈕 */}
          {hasActiveFilters && (
            <div className="flex items-end">
              <Button
                size="sm"
                variant="outline"
                onClick={clearFilters}
                className="w-full"
              >
                <X className="w-4 h-4 mr-2" />
                清除篩選
              </Button>
            </div>
          )}
        </div>

        {/* 結果計數 */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            找到 <span className="font-medium text-white">{actors.length}</span> 個配音員
          </span>
          {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
        </div>

        {/* 配音員列表 */}
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {actors.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>沒有符合條件的配音員</p>
            </div>
          ) : (
            actors.map((actor: any) => (
              <div
                key={actor.id}
                className={`p-4 rounded-lg border transition-all cursor-pointer ${ selectedVoiceActorId === actor.id
                  ? "bg-blue-500/10 border-blue-500/50"
                  : "bg-zinc-800/30 border-zinc-700 hover:border-blue-500/30"
                }`}
                onClick={() => onVoiceActorSelected(actor.id)}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-medium text-sm">{actor.name}</h4>
                      {selectedVoiceActorId === actor.id && (
                        <CheckCircle2 className="w-4 h-4 text-blue-500" />
                      )}
                    </div>
                    <p className="text-xs text-zinc-400 mb-2">{actor.description}</p>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="secondary" className="text-xs">
                        {actor.gender === "male" ? "男性" : "女性"}
                      </Badge>
                      <Badge variant="secondary" className="text-xs">
                        {actor.ageGroup}
                      </Badge>
                      {actor.styles && actor.styles.slice(0, 2).map((s: string) => (
                        <Badge key={s} variant="outline" className="text-xs">
                          {s}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePlaySample(actor.id, actor.sampleUrl);
                    }}
                    className="whitespace-nowrap"
                  >
                    {playingActorId === actor.id ? (
                      <>
                        <Pause className="w-4 h-4 mr-1" />
                        停止
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 mr-1" />
                        試聽
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
