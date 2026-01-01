import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { 
  Upload, 
  FileText, 
  Download, 
  AlertCircle, 
  CheckCircle2,
  X,
  Eye,
  Edit,
  Loader2,
  Mic,
  Video
} from "lucide-react";
import { autoParseScript, generateScriptTemplate, type ParsedScript, type ParsedSegment } from "@/lib/scriptParser";
import { toast } from "sonner";

interface ScriptUploaderProps {
  onScriptParsed: (script: ParsedScript) => void;
  segmentCount?: number;
  disabled?: boolean;
}

export function ScriptUploader({ 
  onScriptParsed, 
  segmentCount = 8,
  disabled = false 
}: ScriptUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [parsedScript, setParsedScript] = useState<ParsedScript | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFile(files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  };

  const handleFile = async (file: File) => {
    // 檢查文件類型
    const validTypes = ['text/plain', 'text/markdown', 'text/x-markdown', ''];
    const validExtensions = ['.txt', '.md', '.markdown'];
    const extension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    
    if (!validTypes.includes(file.type) && !validExtensions.includes(extension)) {
      toast.error("請上傳 TXT 或 Markdown 文件");
      return;
    }

    setIsParsing(true);
    try {
      const content = await file.text();
      const result = autoParseScript(content);
      
      if (result.error) {
        toast.error(result.error);
        setParsedScript(null);
      } else {
        setParsedScript(result);
        setShowPreview(true);
        const hasFullNarration = result.fullNarration && result.fullNarration.length > 0;
        toast.success(`成功解析 ${result.segments.length} 個片段${hasFullNarration ? '（含完整旁白）' : ''}`);
      }
    } catch (error) {
      toast.error("讀取文件失敗");
    } finally {
      setIsParsing(false);
    }
  };

  const handleDownloadTemplate = () => {
    const template = generateScriptTemplate(segmentCount);
    const blob = new Blob([template], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `script_template_${segmentCount}segments.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("模板已下載");
  };

  const handleConfirm = () => {
    if (parsedScript && !parsedScript.error) {
      onScriptParsed(parsedScript);
      toast.success("腳本已導入");
    }
  };

  const handleEdit = () => {
    if (parsedScript) {
      // 將解析結果轉回文本格式（新格式）
      let content = `# 視頻標題\n${parsedScript.title}\n\n`;
      
      // 如果有完整旁白，使用新格式
      if (parsedScript.fullNarration) {
        content += `# 完整旁白\n${parsedScript.fullNarration}\n\n`;
        parsedScript.segments.forEach((seg, index) => {
          content += `# 片段 ${index + 1}\n`;
          content += `## 視頻描述\n${seg.description}\n\n`;
        });
      } else {
        // 舊格式
        parsedScript.segments.forEach((seg, index) => {
          content += `# 片段 ${index + 1}\n`;
          content += `## 視頻描述\n${seg.description}\n\n`;
          content += `## 旁白\n${seg.narration}\n\n`;
        });
      }
      setEditContent(content);
      setIsEditing(true);
    }
  };

  const handleSaveEdit = () => {
    const result = autoParseScript(editContent);
    if (result.error) {
      toast.error(result.error);
    } else {
      setParsedScript(result);
      setIsEditing(false);
      toast.success("編輯已保存");
    }
  };

  const handleClear = () => {
    setParsedScript(null);
    setShowPreview(false);
    setIsEditing(false);
    setEditContent("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // 計算完整旁白的字數
  const getNarrationStats = () => {
    if (!parsedScript) return { charCount: 0, estimatedDuration: 0 };
    const text = parsedScript.fullNarration || parsedScript.segments.map(s => s.narration).join('');
    const charCount = text.length;
    // 中文約每秒 4-5 個字
    const estimatedDuration = Math.round(charCount / 4.5);
    return { charCount, estimatedDuration };
  };

  return (
    <Card className="bg-zinc-900/50 border-zinc-800">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            <CardTitle className="text-lg">上傳腳本</CardTitle>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadTemplate}
            className="gap-1"
          >
            <Download className="w-4 h-4" />
            下載模板
          </Button>
        </div>
        <CardDescription>
          上傳您的腳本文件（TXT 或 Markdown 格式），系統將自動解析視頻描述和旁白
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 上傳區域 */}
        {!parsedScript && !isEditing && (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !disabled && fileInputRef.current?.click()}
            className={`
              border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all
              ${isDragging 
                ? "border-primary bg-primary/10" 
                : "border-zinc-700 hover:border-zinc-500 hover:bg-zinc-800/50"
              }
              ${disabled ? "opacity-50 cursor-not-allowed" : ""}
            `}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,.markdown"
              onChange={handleFileSelect}
              className="hidden"
              disabled={disabled}
            />
            {isParsing ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
                <p className="text-zinc-400">正在解析腳本...</p>
              </div>
            ) : (
              <>
                <Upload className="w-10 h-10 mx-auto text-zinc-500 mb-3" />
                <p className="text-zinc-300 mb-1">
                  拖放文件到此處，或點擊選擇文件
                </p>
                <p className="text-sm text-zinc-500">
                  支持 .txt 和 .md 格式
                </p>
              </>
            )}
          </div>
        )}

        {/* 編輯模式 */}
        {isEditing && (
          <div className="space-y-3">
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="min-h-[300px] font-mono text-sm bg-zinc-800 border-zinc-700"
              placeholder="在此編輯腳本內容..."
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setIsEditing(false)}>
                取消
              </Button>
              <Button onClick={handleSaveEdit}>
                <CheckCircle2 className="w-4 h-4 mr-1" />
                保存編輯
              </Button>
            </div>
          </div>
        )}

        {/* 預覽區域 */}
        {parsedScript && !isEditing && (
          <div className="space-y-4">
            {/* 標題和統計 */}
            <div className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg">
              <div>
                <h3 className="font-medium text-white">{parsedScript.title}</h3>
                <p className="text-sm text-zinc-400">
                  共 {parsedScript.segments.length} 個片段
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={handleEdit}>
                  <Edit className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={handleClear}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* 完整旁白預覽 */}
            {parsedScript.fullNarration && (
              <div className="p-4 bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-lg border border-purple-500/30">
                <div className="flex items-center gap-2 mb-3">
                  <Mic className="w-5 h-5 text-purple-400" />
                  <h4 className="font-medium text-purple-300">完整旁白</h4>
                  <Badge variant="secondary" className="ml-auto">
                    {getNarrationStats().charCount} 字 ≈ {getNarrationStats().estimatedDuration} 秒
                  </Badge>
                </div>
                <div className="max-h-[200px] overflow-y-auto">
                  <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">
                    {parsedScript.fullNarration}
                  </p>
                </div>
                <p className="text-xs text-zinc-500 mt-3">
                  💡 系統會自動使用 Whisper 分析時間戳，將旁白分配給各個片段
                </p>
              </div>
            )}

            {/* 片段預覽 */}
            {showPreview && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <Video className="w-4 h-4 text-cyan-400" />
                  <h4 className="text-sm font-medium text-cyan-300">視頻片段描述</h4>
                </div>
                <div className="max-h-[300px] overflow-y-auto space-y-2">
                  {parsedScript.segments.map((segment, index) => (
                    <SegmentPreviewItem 
                      key={index} 
                      segment={segment} 
                      showNarration={!parsedScript.fullNarration}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* 操作按鈕 */}
            <div className="flex gap-2 justify-between">
              <Button
                variant="outline"
                onClick={() => setShowPreview(!showPreview)}
              >
                <Eye className="w-4 h-4 mr-1" />
                {showPreview ? "隱藏片段" : "顯示片段"}
              </Button>
              <Button onClick={handleConfirm} disabled={disabled}>
                <CheckCircle2 className="w-4 h-4 mr-1" />
                確認導入 ({parsedScript.segments.length} 個片段)
              </Button>
            </div>
          </div>
        )}

        {/* 格式說明 */}
        <div className="text-xs text-zinc-500 space-y-1 p-3 bg-zinc-800/30 rounded-lg">
          <p className="font-medium text-zinc-400">腳本格式說明（新格式）：</p>
          <p>• 使用 <code className="bg-zinc-700 px-1 rounded"># 視頻標題</code> 定義標題</p>
          <p>• 使用 <code className="bg-zinc-700 px-1 rounded"># 完整旁白</code> 寫一大段旁白（系統自動分配）</p>
          <p>• 使用 <code className="bg-zinc-700 px-1 rounded"># 片段 N</code> + <code className="bg-zinc-700 px-1 rounded">## 視頻描述</code> 定義每個片段的視頻內容</p>
        </div>
      </CardContent>
    </Card>
  );
}

// 片段預覽項組件
function SegmentPreviewItem({ segment, showNarration = true }: { segment: ParsedSegment; showNarration?: boolean }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div 
      className="p-3 bg-zinc-800/50 rounded-lg cursor-pointer hover:bg-zinc-800 transition-colors"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            片段 {segment.id}
          </Badge>
          <span className="text-sm text-zinc-400 truncate max-w-[200px]">
            {segment.description.substring(0, 40)}...
          </span>
        </div>
        <div className="flex items-center gap-2">
          {segment.description ? (
            <CheckCircle2 className="w-4 h-4 text-green-500" />
          ) : (
            <AlertCircle className="w-4 h-4 text-yellow-500" />
          )}
        </div>
      </div>
      
      {expanded && (
        <div className="mt-3 space-y-2 text-sm">
          <div>
            <p className="text-zinc-500 text-xs mb-1">視頻描述：</p>
            <p className="text-zinc-300 bg-zinc-900/50 p-2 rounded">
              {segment.description || <span className="text-zinc-500 italic">（未設定）</span>}
            </p>
          </div>
          {showNarration && segment.narration && (
            <div>
              <p className="text-zinc-500 text-xs mb-1">旁白：</p>
              <p className="text-zinc-300 bg-zinc-900/50 p-2 rounded">
                {segment.narration}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
