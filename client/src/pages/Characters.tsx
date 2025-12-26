import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl, isGuestMode } from "@/const";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Plus, 
  Upload, 
  Trash2, 
  RefreshCw, 
  User, 
  Loader2,
  ImageIcon,
  Mic,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import { toast } from "sonner";

export default function Characters() {
  const { user, loading: authLoading } = useAuth();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [newCharacter, setNewCharacter] = useState({
    name: "",
    description: "",
    voiceActorId: "",
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 獲取角色列表
  const { data: characters, isLoading, refetch } = trpc.character.list.useQuery(
    undefined,
    { enabled: !!user }
  );

  // 獲取配音員列表
  const { data: voiceData } = trpc.voice.getAll.useQuery();
  const voiceActors = voiceData?.voiceActors;

  // 創建角色
  const createMutation = trpc.character.create.useMutation({
    onSuccess: () => {
      toast.success("角色創建成功！正在分析照片...");
      setIsCreateOpen(false);
      setNewCharacter({ name: "", description: "", voiceActorId: "" });
      setSelectedImage(null);
      refetch();
    },
    onError: (error) => {
      toast.error(`創建失敗: ${error.message}`);
    },
  });

  // 刪除角色
  const deleteMutation = trpc.character.delete.useMutation({
    onSuccess: () => {
      toast.success("角色已刪除");
      refetch();
    },
    onError: (error) => {
      toast.error(`刪除失敗: ${error.message}`);
    },
  });

  // 重新生成基礎圖
  const regenerateMutation = trpc.character.regenerateBaseImage.useMutation({
    onSuccess: () => {
      toast.success("正在重新生成角色基礎圖...");
      refetch();
    },
    onError: (error) => {
      toast.error(`重新生成失敗: ${error.message}`);
    },
  });

  // 處理圖片選擇
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error("圖片大小不能超過 10MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setSelectedImage(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  // 創建角色
  const handleCreate = () => {
    if (!newCharacter.name.trim()) {
      toast.error("請輸入角色名稱");
      return;
    }

    createMutation.mutate({
      name: newCharacter.name.trim(),
      description: newCharacter.description.trim() || undefined,
      photoBase64: selectedImage || undefined,
      voiceActorId: newCharacter.voiceActorId || undefined,
    });
  };

  // 獲取狀態顏色和文字
  const getStatusInfo = (status: string) => {
    switch (status) {
      case "pending":
        return { color: "bg-yellow-500", text: "等待處理", icon: Loader2 };
      case "analyzing":
        return { color: "bg-blue-500", text: "分析中", icon: Loader2 };
      case "generating":
        return { color: "bg-purple-500", text: "生成中", icon: Loader2 };
      case "ready":
        return { color: "bg-green-500", text: "就緒", icon: CheckCircle };
      case "failed":
        return { color: "bg-red-500", text: "失敗", icon: AlertCircle };
      default:
        return { color: "bg-gray-500", text: status, icon: AlertCircle };
    }
  };

  // 未登錄 - 訪客模式下跳過
  if (!authLoading && !user && !isGuestMode()) {
    return (
      <div className="container py-12">
        <Card className="max-w-md mx-auto">
          <CardHeader className="text-center">
            <CardTitle>請先登錄</CardTitle>
            <CardDescription>登錄後可以管理您的角色庫</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button asChild>
              <a href={getLoginUrl()}>登錄</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container py-8">
      {/* 頁面標題 */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">角色庫</h1>
          <p className="text-muted-foreground mt-1">
            上傳人物照片，AI 會自動分析並生成角色基礎圖，用於視頻中保持角色一致性
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              新增角色
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>新增角色</DialogTitle>
              <DialogDescription>
                上傳人物照片，AI 會分析特徵並生成風格化的角色基礎圖
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {/* 角色名稱 */}
              <div className="space-y-2">
                <Label htmlFor="name">角色名稱 *</Label>
                <Input
                  id="name"
                  placeholder="如：小明、老闆、女主角"
                  value={newCharacter.name}
                  onChange={(e) => setNewCharacter({ ...newCharacter, name: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  在故事中使用此名稱，系統會自動識別並匹配
                </p>
              </div>

              {/* 角色簡介 */}
              <div className="space-y-2">
                <Label htmlFor="description">角色簡介</Label>
                <Textarea
                  id="description"
                  placeholder="如：25歲程序員，性格內向，喜歡穿格子衫"
                  value={newCharacter.description}
                  onChange={(e) => setNewCharacter({ ...newCharacter, description: e.target.value })}
                  rows={2}
                />
              </div>

              {/* 上傳照片 */}
              <div className="space-y-2">
                <Label>人物照片</Label>
                <div
                  className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors
                    ${selectedImage ? "border-primary" : "border-muted-foreground/25 hover:border-primary/50"}`}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {selectedImage ? (
                    <div className="relative">
                      <img
                        src={selectedImage}
                        alt="預覽"
                        className="max-h-48 mx-auto rounded-lg"
                      />
                      <Button
                        variant="destructive"
                        size="sm"
                        className="absolute top-2 right-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedImage(null);
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="py-8">
                      <Upload className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">
                        點擊上傳人物照片
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        支持 JPG、PNG，最大 10MB
                      </p>
                    </div>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleImageSelect}
                />
              </div>

              {/* 配音員選擇 */}
              <div className="space-y-2">
                <Label>綁定配音員（可選）</Label>
                <Select
                  value={newCharacter.voiceActorId}
                  onValueChange={(value) => setNewCharacter({ ...newCharacter, voiceActorId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="選擇配音員..." />
                  </SelectTrigger>
                  <SelectContent>
                    {voiceActors?.map((actor) => (
                      <SelectItem key={actor.id} value={actor.id}>
                        {actor.name} ({actor.language === "cantonese" ? "粵語" : actor.language === "mandarin" ? "普通話" : "英語"})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                取消
              </Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                創建角色
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* 角色列表 */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : characters?.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <User className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">還沒有角色</h3>
            <p className="text-muted-foreground mb-4">
              點擊「新增角色」上傳人物照片，開始創建您的角色庫
            </p>
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              新增角色
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {characters?.map((char) => {
            const statusInfo = getStatusInfo(char.status);
            const StatusIcon = statusInfo.icon;
            
            return (
              <Card key={char.id} className="overflow-hidden">
                {/* 角色圖片 */}
                <div className="aspect-square bg-muted relative">
                  {char.baseImageUrl ? (
                    <img
                      src={char.baseImageUrl}
                      alt={char.name}
                      className="w-full h-full object-cover"
                    />
                  ) : char.originalPhotoUrl ? (
                    <div className="relative w-full h-full">
                      <img
                        src={char.originalPhotoUrl}
                        alt={char.name}
                        className="w-full h-full object-cover opacity-50"
                      />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-center">
                          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                          <span className="text-sm">{statusInfo.text}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageIcon className="w-16 h-16 text-muted-foreground" />
                    </div>
                  )}
                  
                  {/* 狀態標籤 */}
                  <Badge
                    className={`absolute top-2 right-2 ${statusInfo.color}`}
                  >
                    <StatusIcon className={`w-3 h-3 mr-1 ${char.status === "pending" || char.status === "analyzing" || char.status === "generating" ? "animate-spin" : ""}`} />
                    {statusInfo.text}
                  </Badge>
                </div>

                {/* 角色信息 */}
                <CardContent className="p-4">
                  <h3 className="font-semibold text-lg mb-1">{char.name}</h3>
                  {char.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                      {char.description}
                    </p>
                  )}
                  
                  {/* 配音員 */}
                  {char.voiceActorId && (
                    <div className="flex items-center text-sm text-muted-foreground mb-3">
                      <Mic className="w-4 h-4 mr-1" />
                      {voiceActors?.find(v => v.id === char.voiceActorId)?.name || char.voiceActorId}
                    </div>
                  )}

                  {/* 錯誤信息 */}
                  {char.status === "failed" && char.errorMessage && (
                    <p className="text-sm text-red-500 mb-3">
                      {char.errorMessage}
                    </p>
                  )}

                  {/* 操作按鈕 */}
                  <div className="flex gap-2">
                    {char.originalPhotoUrl && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => regenerateMutation.mutate({ id: char.id })}
                        disabled={regenerateMutation.isPending || char.status === "analyzing" || char.status === "generating"}
                      >
                        <RefreshCw className={`w-4 h-4 mr-1 ${regenerateMutation.isPending ? "animate-spin" : ""}`} />
                        重新生成
                      </Button>
                    )}
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        if (confirm(`確定要刪除角色「${char.name}」嗎？`)) {
                          deleteMutation.mutate({ id: char.id });
                        }
                      }}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* 使用說明 */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="text-lg">使用說明</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <span className="text-primary font-semibold">1</span>
              </div>
              <div>
                <p className="font-medium text-foreground">上傳照片</p>
                <p>上傳人物照片，AI 會自動分析外觀特徵</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <span className="text-primary font-semibold">2</span>
              </div>
              <div>
                <p className="font-medium text-foreground">生成基礎圖</p>
                <p>Midjourney 根據分析結果生成風格化角色圖</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <span className="text-primary font-semibold">3</span>
              </div>
              <div>
                <p className="font-medium text-foreground">寫故事</p>
                <p>在故事中使用角色名稱，系統自動匹配並保持一致</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
