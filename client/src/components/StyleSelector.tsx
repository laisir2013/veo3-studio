import { useState } from "react";
import { VISUAL_STYLES, type VisualStyle } from "../config/visualStyles";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, ChevronUp, Sparkles, X, ZoomIn, ChevronLeft } from "lucide-react";

interface StyleSelectorProps {
  value: string;
  onChange: (styleId: string, stylePrompt: string) => void;
  className?: string;
}

export function StyleSelector({ value, onChange, className }: StyleSelectorProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [previewStyle, setPreviewStyle] = useState<VisualStyle | null>(null);
  
  const selectedStyle = VISUAL_STYLES.find(s => s.id === value);
  
  // 分類風格
  const categories = {
    realistic: VISUAL_STYLES.filter(s => ["cinematic", "documentary", "portrait"].includes(s.id)),
    animation: VISUAL_STYLES.filter(s => ["disney-pixar", "anime", "ghibli", "cartoon", "chibi"].includes(s.id)),
    artistic: VISUAL_STYLES.filter(s => ["watercolor", "oil-painting", "storybook", "ink-wash", "comic"].includes(s.id)),
    genre: VISUAL_STYLES.filter(s => ["cyberpunk", "fantasy", "retro", "minimalist", "steampunk", "horror", "romantic", "scifi", "pixel-art"].includes(s.id)),
  };
  
  const categoryNames: Record<string, string> = {
    realistic: "🎬 真人寫實",
    animation: "🎨 動畫風格",
    artistic: "🖼️ 藝術風格",
    genre: "✨ 特殊風格",
  };

  return (
    <div className={cn("space-y-3", className)}>
      {/* 已選擇的風格預覽 */}
      <div 
        className="relative cursor-pointer group"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/50 border border-zinc-700 hover:border-purple-500/50 transition-colors">
          {selectedStyle ? (
            <div className="flex items-center gap-3">
              <img 
                src={selectedStyle.previewImage} 
                alt={selectedStyle.name}
                className="w-20 h-14 object-cover rounded-lg"
              />
              <div>
                <div className="flex items-center gap-2">
                  {selectedStyle.icon && <span className="text-lg">{selectedStyle.icon}</span>}
                  <span className="font-medium text-white">{selectedStyle.name}</span>
                </div>
                <p className="text-sm text-zinc-400 line-clamp-1">{selectedStyle.description}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-zinc-400">
              <Sparkles className="w-5 h-5" />
              <span>選擇視覺風格</span>
            </div>
          )}
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-zinc-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-zinc-400" />
          )}
        </div>
      </div>

      {/* 風格選擇面板 */}
      {isExpanded && (
        <div className="rounded-xl bg-zinc-900/95 border border-zinc-700 p-4 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* 大圖預覽模式 */}
          {previewStyle && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" onClick={() => setPreviewStyle(null)}>
              <div className="relative max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
                {/* 返回按鈕 */}
                <button
                  onClick={() => setPreviewStyle(null)}
                  className="absolute -top-12 left-0 flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                  <span>收回</span>
                </button>
                
                {/* 大圖 */}
                <div className="rounded-2xl overflow-hidden border-2 border-purple-500/50 bg-zinc-900">
                  <img
                    src={previewStyle.previewImage}
                    alt={previewStyle.name}
                    className="w-full h-auto max-h-[60vh] object-contain"
                  />
                  <div className="p-6 bg-gradient-to-t from-black/95 to-zinc-900/95">
                    <div className="flex items-center gap-3 mb-3">
                      {previewStyle.icon && <span className="text-3xl">{previewStyle.icon}</span>}
                      <h3 className="text-2xl font-bold text-white">{previewStyle.name}</h3>
                    </div>
                    <p className="text-base text-zinc-300 mb-5">{previewStyle.description}</p>
                    <div className="flex gap-3">
                      <button
                        onClick={() => {
                          onChange(previewStyle.id, previewStyle.prompt);
                          setIsExpanded(false);
                          setPreviewStyle(null);
                        }}
                        className="flex-1 px-6 py-3 bg-purple-500 hover:bg-purple-600 text-white rounded-lg font-medium transition-colors text-lg"
                      >
                        選擇此風格
                      </button>
                      <button
                        onClick={() => setPreviewStyle(null)}
                        className="px-6 py-3 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg font-medium transition-colors"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                </div>
                
                {/* 右上角關閉按鈕 */}
                <button
                  onClick={() => setPreviewStyle(null)}
                  className="absolute top-2 right-2 p-2 bg-black/60 rounded-full hover:bg-black/80 transition-colors"
                >
                  <X className="w-6 h-6 text-white" />
                </button>
              </div>
            </div>
          )}

          {Object.entries(categories).map(([key, styles]) => (
            <div key={key}>
              <h3 className="text-lg font-semibold text-zinc-200 mb-4 flex items-center gap-2">
                {categoryNames[key]}
                <span className="text-sm text-zinc-500 font-normal">({styles.length} 種風格)</span>
              </h3>
              {/* 每行 2 格 - 更大的圖片 */}
              <div className="grid grid-cols-2 gap-4">
                {styles.map((style) => (
                  <div
                    key={style.id}
                    className={cn(
                      "relative cursor-pointer rounded-xl overflow-hidden border-2 transition-all duration-200 group",
                      value === style.id
                        ? "border-purple-500 ring-2 ring-purple-500/30"
                        : "border-zinc-700 hover:border-purple-400/50"
                    )}
                    onClick={() => setPreviewStyle(style)}
                  >
                    {/* 預覽圖片 - 更大的尺寸 */}
                    <div className="aspect-[4/3] relative">
                      <img
                        src={style.previewImage}
                        alt={style.name}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                      {/* 選中標記 */}
                      {value === style.id && (
                        <div className="absolute top-3 right-3 w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center shadow-lg">
                          <Check className="w-5 h-5 text-white" />
                        </div>
                      )}
                      {/* 放大提示 */}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="flex items-center gap-2 px-4 py-2 bg-black/70 rounded-lg text-white">
                          <ZoomIn className="w-5 h-5" />
                          <span>點擊放大</span>
                        </div>
                      </div>
                      {/* 漸變遮罩 */}
                      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/90 via-black/50 to-transparent" />
                    </div>
                    {/* 名稱和描述 */}
                    <div className="absolute bottom-0 left-0 right-0 p-4">
                      <div className="flex items-center gap-2 mb-1">
                        {style.icon && <span className="text-xl">{style.icon}</span>}
                        <span className="text-base font-semibold text-white">
                          {style.name}
                        </span>
                      </div>
                      <p className="text-sm text-zinc-400 line-clamp-2">
                        {style.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          
          {/* 提示信息 */}
          <div className="text-sm text-zinc-400 text-center pt-4 border-t border-zinc-800">
            💡 點擊風格卡片可放大查看，再選擇是否使用
          </div>
        </div>
      )}
    </div>
  );
}

export default StyleSelector;
