import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Plus, 
  Sparkles, 
  Pencil, 
  Trash2, 
  Save, 
  X, 
  GripVertical,
  Loader2,
  CheckCircle,
  AlertCircle,
  Clock,
  Film
} from "lucide-react";
import { toast } from "sonner";

export interface Scene {
  id: string;
  description: string;
  imagePrompt?: string;
  narration?: string;
  imageUrl?: string;
  videoUrl?: string;
  audioUrl?: string;
  status?: "pending" | "generating" | "completed" | "failed";
}

interface SceneManagerProps {
  scenes: Scene[];
  onScenesChange: (scenes: Scene[]) => void;
  onGenerateAIScene?: () => Promise<string>;
  language?: string;
  disabled?: boolean;
}

export function SceneManager({
  scenes,
  onScenesChange,
  onGenerateAIScene,
  language = "cantonese",
  disabled = false,
}: SceneManagerProps) {
  const [newSceneText, setNewSceneText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  // 生成唯一 ID
  const generateId = () => `scene_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // 添加新場景
  const handleAddScene = () => {
    if (!newSceneText.trim()) {
      toast.error("請輸入場景描述");
      return;
    }

    const newScene: Scene = {
      id: generateId(),
      description: newSceneText.trim(),
      status: "pending",
    };

    onScenesChange([...scenes, newScene]);
    setNewSceneText("");
    toast.success("場景已添加");
  };

  // AI 生成場景
  const handleGenerateAIScene = async () => {
    if (!onGenerateAIScene) {
      toast.error("AI 生成功能未配置");
      return;
    }

    setIsGenerating(true);
    try {
      const description = await onGenerateAIScene();
      if (description) {
        const newScene: Scene = {
          id: generateId(),
          description: description.trim(),
          status: "pending",
        };
        onScenesChange([...scenes, newScene]);
        toast.success("AI 場景已生成");
      }
    } catch (error) {
      toast.error("AI 生成失敗，請重試");
      console.error("AI scene generation error:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  // 開始編輯場景
  const handleStartEdit = (scene: Scene) => {
    setEditingId(scene.id);
    setEditingText(scene.description);
  };

  // 保存編輯
  const handleSaveEdit = () => {
    if (!editingText.trim()) {
      toast.error("場景描述不能為空");
      return;
    }

    const updatedScenes = scenes.map((scene) =>
      scene.id === editingId
        ? { ...scene, description: editingText.trim() }
        : scene
    );
    onScenesChange(updatedScenes);
    setEditingId(null);
    setEditingText("");
    toast.success("場景已更新");
  };

  // 取消編輯
  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingText("");
  };

  // 刪除場景
  const handleDeleteScene = (id: string) => {
    const updatedScenes = scenes.filter((scene) => scene.id !== id);
    onScenesChange(updatedScenes);
    toast.success("場景已刪除");
  };

  // 獲取狀態圖標和顏色
  const getStatusBadge = (status?: string) => {
    switch (status) {
      case "generating":
        return (
          <Badge variant="secondary" className="bg-blue-500/20 text-blue-400">
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            生成中
          </Badge>
        );
      case "completed":
        return (
          <Badge variant="secondary" className="bg-green-500/20 text-green-400">
            <CheckCircle className="w-3 h-3 mr-1" />
            已完成
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="secondary" className="bg-red-500/20 text-red-400">
            <AlertCircle className="w-3 h-3 mr-1" />
            失敗
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary" className="bg-gray-500/20 text-gray-400">
            <Clock className="w-3 h-3 mr-1" />
            待處理
          </Badge>
        );
    }
  };

  // 計算總時長
  const totalDuration = scenes.length * 8;
  const minutes = Math.floor(totalDuration / 60);
  const seconds = totalDuration % 60;

  return (
    <Card className="bg-gray-900/50 border-gray-800">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Film className="w-5 h-5 text-purple-400" />
            場景管理
            {scenes.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {scenes.length} 個場景
              </Badge>
            )}
          </CardTitle>
          {scenes.length > 0 && (
            <span className="text-sm text-gray-400">
              預計時長: {minutes > 0 ? `${minutes}分` : ""}{seconds > 0 ? `${seconds}秒` : ""}
              {minutes === 0 && seconds === 0 ? "0秒" : ""}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 添加新場景區域 */}
        <div className="space-y-3">
          <Textarea
            placeholder="輸入場景描述，例如：一位年輕女孩在櫻花樹下微笑，花瓣緩緩飄落..."
            value={newSceneText}
            onChange={(e) => setNewSceneText(e.target.value)}
            disabled={disabled}
            className="min-h-[80px] bg-gray-800/50 border-gray-700 resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.ctrlKey) {
                e.preventDefault();
                handleAddScene();
              }
            }}
          />
          <div className="flex gap-2">
            <Button
              onClick={handleAddScene}
              disabled={disabled || !newSceneText.trim()}
              className="flex-1 bg-purple-600 hover:bg-purple-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              添加場景
            </Button>
            <Button
              onClick={handleGenerateAIScene}
              disabled={disabled || isGenerating || !onGenerateAIScene}
              variant="outline"
              className="flex-1 border-purple-500/50 text-purple-400 hover:bg-purple-500/10"
            >
              {isGenerating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              AI 生成
            </Button>
          </div>
          <p className="text-xs text-gray-500">
            提示：按 Ctrl+Enter 快速添加場景，每個場景約 8 秒
          </p>
        </div>

        {/* 場景列表 */}
        {scenes.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Film className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>尚未添加任何場景</p>
            <p className="text-sm mt-1">添加場景來自定義您的視頻內容</p>
          </div>
        ) : (
          <div className="space-y-3">
            {scenes.map((scene, index) => (
              <div
                key={scene.id}
                className={`relative p-4 rounded-lg border transition-all ${
                  editingId === scene.id
                    ? "border-purple-500 bg-purple-500/10"
                    : "border-gray-700 bg-gray-800/30 hover:border-gray-600"
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* 拖拽手柄 */}
                  <div className="flex-shrink-0 pt-1 cursor-grab text-gray-600 hover:text-gray-400">
                    <GripVertical className="w-4 h-4" />
                  </div>

                  {/* 序號 */}
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 font-medium">
                    {index + 1}
                  </div>

                  {/* 內容區域 */}
                  <div className="flex-1 min-w-0">
                    {editingId === scene.id ? (
                      <div className="space-y-3">
                        <Textarea
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          className="min-h-[80px] bg-gray-800/50 border-gray-700 resize-none"
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={handleSaveEdit}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            <Save className="w-3 h-3 mr-1" />
                            保存
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleCancelEdit}
                          >
                            <X className="w-3 h-3 mr-1" />
                            取消
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-gray-200 leading-relaxed">
                          {scene.description}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          {getStatusBadge(scene.status)}
                          {scene.videoUrl && (
                            <Badge variant="secondary" className="bg-blue-500/20 text-blue-400">
                              <Film className="w-3 h-3 mr-1" />
                              可預覽
                            </Badge>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  {/* 操作按鈕 */}
                  {editingId !== scene.id && (
                    <div className="flex-shrink-0 flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-gray-400 hover:text-white hover:bg-gray-700"
                        onClick={() => handleStartEdit(scene)}
                        disabled={disabled}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-gray-400 hover:text-red-400 hover:bg-red-500/10"
                        onClick={() => handleDeleteScene(scene.id)}
                        disabled={disabled}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>

                {/* 視頻預覽 */}
                {scene.videoUrl && scene.status === "completed" && (
                  <div className="mt-3 ml-11">
                    <video
                      src={scene.videoUrl}
                      controls
                      className="w-full max-w-md rounded-lg"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 統計信息 */}
        {scenes.length > 0 && (
          <div className="pt-3 border-t border-gray-800">
            <div className="flex items-center justify-between text-sm text-gray-400">
              <span>
                共 {scenes.length} 個場景 · 預計 {scenes.length} 個 8 秒片段
              </span>
              <span>
                {scenes.filter((s) => s.status === "completed").length} / {scenes.length} 已完成
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default SceneManager;
