import React, { useState } from 'react';
import { 
  Image, 
  Video, 
  Upload, 
  Settings, 
  ChevronDown, 
  ChevronUp,
  Sparkles,
  Type,
  Palette,
  Move,
  Eye
} from 'lucide-react';

// 圖片生成模型配置
const IMAGE_MODELS = {
  "gemini-3-pro-image-preview": {
    id: "gemini-3-pro-image-preview",
    name: "Gemini 3 Pro Image (Nano Banana 2)",
    provider: "Google",
    price: "¥0.159/張",
    quality: "極高",
    speed: "中等",
    description: "Google 最新圖片生成模型，支持 2K/4K 輸出",
    textRendering: "優秀",
    rank: 1,
  },
  "gpt-image-1.5-all": {
    id: "gpt-image-1.5-all",
    name: "GPT Image 1.5",
    provider: "OpenAI",
    price: "¥0.039/張",
    quality: "高",
    speed: "快速",
    description: "DALL-E 3 格式，通用場景",
    textRendering: "良好",
    rank: 2,
  },
  "midjourney": {
    id: "midjourney",
    name: "Midjourney",
    provider: "Midjourney",
    price: "¥0.20/張",
    quality: "極高",
    speed: "較慢",
    description: "藝術風格強，適合創意內容",
    textRendering: "一般",
    rank: 3,
  },
  "ideogram": {
    id: "ideogram-ai/ideogram-v3",
    name: "Ideogram V3",
    provider: "Ideogram",
    price: "¥0.15/張",
    quality: "高",
    speed: "中等",
    description: "文字渲染專家，適合需要中文字的場景",
    textRendering: "最佳",
    rank: 4,
  },
  "flux-pro": {
    id: "black-forest-labs/flux-1.1-pro",
    name: "Flux 1.1 Pro",
    provider: "Black Forest Labs",
    price: "¥0.300/張",
    quality: "高",
    speed: "中等",
    description: "高質量 Flux 模型",
    textRendering: "良好",
    rank: 5,
  },
  "flux-schnell": {
    id: "black-forest-labs/flux-schnell",
    name: "Flux Schnell",
    provider: "Black Forest Labs",
    price: "¥0.094/張",
    quality: "標準",
    speed: "最快",
    description: "快速生成，適合預覽",
    textRendering: "一般",
    rank: 6,
  },
  "stable-diffusion": {
    id: "stability-ai/sdxl",
    name: "Stable Diffusion XL",
    provider: "Stability AI",
    price: "¥0.10/張",
    quality: "高",
    speed: "快速",
    description: "開源靈活，支持多種風格",
    textRendering: "一般",
    rank: 7,
  },
  "doubao-image": {
    id: "doubao-image",
    name: "豆包圖片",
    provider: "字節跳動",
    price: "¥0.08/張",
    quality: "高",
    speed: "快速",
    description: "中國本土模型，中文理解佳",
    textRendering: "良好",
    rank: 8,
  },
};

// 圖片/視頻比例預設
const MEDIA_RATIO_PRESETS = {
  "all-video": { name: "全視頻", videoPercent: 100, imagePercent: 0 },
  "all-image": { name: "全圖片", videoPercent: 0, imagePercent: 100 },
  "video-70-image-30": { name: "70% 視頻 + 30% 圖片", videoPercent: 70, imagePercent: 30 },
  "video-50-image-50": { name: "50% 視頻 + 50% 圖片", videoPercent: 50, imagePercent: 50 },
  "video-30-image-70": { name: "30% 視頻 + 70% 圖片", videoPercent: 30, imagePercent: 70 },
  "custom": { name: "自定義", videoPercent: 50, imagePercent: 50 },
};

// 圖片時長預設
const IMAGE_DURATION_PRESETS = {
  "2s": { name: "2 秒/張", duration: 2, imagesPerSegment: 4 },
  "3s": { name: "3 秒/張", duration: 3, imagesPerSegment: 3 },
  "4s": { name: "4 秒/張", duration: 4, imagesPerSegment: 2 },
};

// 字幕配置
const SUBTITLE_CONFIG = {
  fonts: [
    { id: "noto-sans-tc", name: "思源黑體" },
    { id: "noto-serif-tc", name: "思源宋體" },
    { id: "openhuninn", name: "粉圓體" },
    { id: "lxgw-wenkai", name: "霄宮文楷" },
    { id: "pingfang", name: "蘋方黑體" },
    { id: "microsoft-jhenghei", name: "微軟正黑體" },
  ],
  fontSizes: [
    { id: "small", name: "小", size: 24 },
    { id: "medium", name: "中", size: 32 },
    { id: "large", name: "大", size: 40 },
    { id: "xlarge", name: "特大", size: 48 },
  ],
  fontColors: [
    { id: "white", name: "白色", color: "#FFFFFF" },
    { id: "yellow", name: "黃色", color: "#FFFF00" },
    { id: "cyan", name: "青色", color: "#00FFFF" },
    { id: "green", name: "綠色", color: "#00FF00" },
    { id: "pink", name: "粉色", color: "#FF69B4" },
    { id: "orange", name: "橙色", color: "#FFA500" },
  ],
  boxStyles: [
    { id: "none", name: "無字框" },
    { id: "shadow", name: "陰影" },
    { id: "outline", name: "描邊" },
    { id: "box-black", name: "黑底字框" },
    { id: "box-blue", name: "藍底字框" },
    { id: "box-gradient", name: "漸變字框" },
  ],
  positions: [
    { id: "bottom-center", name: "底部居中" },
    { id: "bottom-left", name: "底部左側" },
    { id: "bottom-right", name: "底部右側" },
    { id: "top-center", name: "頂部居中" },
    { id: "middle-center", name: "中間居中" },
  ],
};

interface MediaSettingsProps {
  onSettingsChange?: (settings: MediaSettingsState) => void;
}

export interface MediaSettingsState {
  // 圖片/視頻比例
  mediaRatio: string;
  videoPercent: number;
  imagePercent: number;
  
  // 圖片生成模型
  imageModel: string;
  
  // 圖片時長
  imageDuration: string;
  customDuration: number;
  
  // 字幕設定
  subtitleEnabled: boolean;
  subtitleMode: 'auto' | 'manual' | 'none';
  subtitleFont: string;
  subtitleFontSize: string;
  subtitleFontColor: string;
  subtitleBoxStyle: string;
  subtitlePosition: string;
}

export function MediaSettings({ onSettingsChange }: MediaSettingsProps) {
  const [expanded, setExpanded] = useState(true);
  const [subtitleExpanded, setSubtitleExpanded] = useState(false);
  const [previewSubtitle, setPreviewSubtitle] = useState(false);
  
  const [settings, setSettings] = useState<MediaSettingsState>({
    mediaRatio: 'all-video',
    videoPercent: 100,
    imagePercent: 0,
    imageModel: 'gemini-3-pro-image-preview',
    imageDuration: '3s',
    customDuration: 3,
    subtitleEnabled: true,
    subtitleMode: 'auto',
    subtitleFont: 'noto-sans-tc',
    subtitleFontSize: 'medium',
    subtitleFontColor: 'white',
    subtitleBoxStyle: 'shadow',
    subtitlePosition: 'bottom-center',
  });

  const updateSettings = (updates: Partial<MediaSettingsState>) => {
    const newSettings = { ...settings, ...updates };
    setSettings(newSettings);
    onSettingsChange?.(newSettings);
  };

  const handleRatioChange = (ratioKey: string) => {
    const preset = MEDIA_RATIO_PRESETS[ratioKey as keyof typeof MEDIA_RATIO_PRESETS];
    updateSettings({
      mediaRatio: ratioKey,
      videoPercent: preset.videoPercent,
      imagePercent: preset.imagePercent,
    });
  };

  const handleCustomRatioChange = (videoPercent: number) => {
    updateSettings({
      mediaRatio: 'custom',
      videoPercent,
      imagePercent: 100 - videoPercent,
    });
  };

  const selectedModel = IMAGE_MODELS[settings.imageModel as keyof typeof IMAGE_MODELS];
  const selectedFont = SUBTITLE_CONFIG.fonts.find(f => f.id === settings.subtitleFont);
  const selectedFontSize = SUBTITLE_CONFIG.fontSizes.find(f => f.id === settings.subtitleFontSize);
  const selectedFontColor = SUBTITLE_CONFIG.fontColors.find(f => f.id === settings.subtitleFontColor);
  const selectedBoxStyle = SUBTITLE_CONFIG.boxStyles.find(f => f.id === settings.subtitleBoxStyle);
  const selectedPosition = SUBTITLE_CONFIG.positions.find(f => f.id === settings.subtitlePosition);

  return (
    <div className="bg-gray-800/50 rounded-xl border border-gray-700 overflow-hidden">
      {/* 標題欄 */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-700/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-purple-400" />
          <span className="font-medium">媒體設定</span>
          <span className="text-xs text-gray-400 ml-2">
            {settings.videoPercent}% 視頻 + {settings.imagePercent}% 圖片
          </span>
        </div>
        {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-6">
          {/* 圖片/視頻比例選擇 */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-gray-300">
              <Video className="w-4 h-4" />
              <span>視頻/圖片比例</span>
            </div>
            
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(MEDIA_RATIO_PRESETS).filter(([key]) => key !== 'custom').map(([key, preset]) => (
                <button
                  key={key}
                  onClick={() => handleRatioChange(key)}
                  className={`px-3 py-2 rounded-lg text-sm transition-all ${
                    settings.mediaRatio === key
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {preset.name}
                </button>
              ))}
            </div>

            {/* 自定義滑桿 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">自定義比例</span>
                <span className="text-purple-400">{settings.videoPercent}% 視頻 / {settings.imagePercent}% 圖片</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={settings.videoPercent}
                onChange={(e) => handleCustomRatioChange(parseInt(e.target.value))}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
              />
              <div className="flex justify-between text-xs text-gray-500">
                <span>全圖片</span>
                <span>全視頻</span>
              </div>
            </div>
          </div>

          {/* 圖片生成模型選擇（僅當有圖片比例時顯示） */}
          {settings.imagePercent > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-gray-300">
                <Image className="w-4 h-4" />
                <span>圖片生成模型</span>
                <span className="text-xs text-gray-500">（備用模型會自動切換）</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {Object.entries(IMAGE_MODELS).map(([key, model]) => (
                  <button
                    key={key}
                    onClick={() => updateSettings({ imageModel: key })}
                    className={`p-3 rounded-lg text-left transition-all ${
                      settings.imageModel === key
                        ? 'bg-purple-600/30 border-2 border-purple-500'
                        : 'bg-gray-700/50 border border-gray-600 hover:border-gray-500'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm">{model.name}</span>
                      <span className="text-xs text-purple-400">#{model.rank}</span>
                    </div>
                    <div className="text-xs text-gray-400">{model.provider}</div>
                    <div className="flex items-center gap-2 mt-1 text-xs">
                      <span className="text-green-400">{model.price}</span>
                      <span className="text-gray-500">|</span>
                      <span className="text-blue-400">文字: {model.textRendering}</span>
                    </div>
                  </button>
                ))}
              </div>

              {/* 選中模型的詳細信息 */}
              {selectedModel && (
                <div className="bg-gray-700/30 rounded-lg p-3 text-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-4 h-4 text-yellow-400" />
                    <span className="text-yellow-400">當前選擇: {selectedModel.name}</span>
                  </div>
                  <p className="text-gray-400 text-xs">{selectedModel.description}</p>
                  <p className="text-gray-500 text-xs mt-1">
                    備用順序: {selectedModel.rank === 8 ? '無備用' : `自動切換到第 ${selectedModel.rank + 1} 強模型`}
                  </p>
                </div>
              )}

              {/* 圖片時長設定 */}
              <div className="space-y-2">
                <div className="text-sm text-gray-300">每張圖片顯示時長</div>
                <div className="flex gap-2">
                  {Object.entries(IMAGE_DURATION_PRESETS).map(([key, preset]) => (
                    <button
                      key={key}
                      onClick={() => updateSettings({ imageDuration: key })}
                      className={`px-4 py-2 rounded-lg text-sm transition-all ${
                        settings.imageDuration === key
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      {preset.name}
                      <span className="text-xs text-gray-400 ml-1">
                        ({preset.imagesPerSegment}張/段)
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 外部上傳提示 */}
              <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-3">
                <div className="flex items-center gap-2 text-blue-400 text-sm">
                  <Upload className="w-4 h-4" />
                  <span>支持外部上傳</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  當 API 生成失敗時，您可以在片段詳情中上傳自己的圖片
                </p>
              </div>
            </div>
          )}

          {/* 字幕設定 */}
          <div className="border-t border-gray-700 pt-4">
            <button
              onClick={() => setSubtitleExpanded(!subtitleExpanded)}
              className="w-full flex items-center justify-between text-sm text-gray-300 hover:text-white transition-colors"
            >
              <div className="flex items-center gap-2">
                <Type className="w-4 h-4" />
                <span>字幕設定</span>
                <span className={`text-xs px-2 py-0.5 rounded ${
                  settings.subtitleEnabled ? 'bg-green-600/30 text-green-400' : 'bg-gray-600/30 text-gray-400'
                }`}>
                  {settings.subtitleEnabled ? 'AI 自動識別' : '已關閉'}
                </span>
              </div>
              {subtitleExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {subtitleExpanded && (
              <div className="mt-4 space-y-4">
                {/* 字幕模式 */}
                <div className="flex gap-2">
                  <button
                    onClick={() => updateSettings({ subtitleEnabled: true, subtitleMode: 'auto' })}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm transition-all ${
                      settings.subtitleEnabled && settings.subtitleMode === 'auto'
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    AI 自動識別
                  </button>
                  <button
                    onClick={() => updateSettings({ subtitleEnabled: true, subtitleMode: 'manual' })}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm transition-all ${
                      settings.subtitleEnabled && settings.subtitleMode === 'manual'
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    手動編輯
                  </button>
                  <button
                    onClick={() => updateSettings({ subtitleEnabled: false, subtitleMode: 'none' })}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm transition-all ${
                      !settings.subtitleEnabled
                        ? 'bg-gray-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    無字幕
                  </button>
                </div>

                {settings.subtitleEnabled && (
                  <>
                    {/* 字體選擇 */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <Type className="w-3 h-3" />
                        <span>字體</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {SUBTITLE_CONFIG.fonts.map((font) => (
                          <button
                            key={font.id}
                            onClick={() => updateSettings({ subtitleFont: font.id })}
                            className={`px-3 py-2 rounded text-sm transition-all ${
                              settings.subtitleFont === font.id
                                ? 'bg-purple-600 text-white'
                                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                            }`}
                          >
                            {font.name}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 字體大小 */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <span>字體大小</span>
                      </div>
                      <div className="flex gap-2">
                        {SUBTITLE_CONFIG.fontSizes.map((size) => (
                          <button
                            key={size.id}
                            onClick={() => updateSettings({ subtitleFontSize: size.id })}
                            className={`flex-1 px-3 py-2 rounded text-sm transition-all ${
                              settings.subtitleFontSize === size.id
                                ? 'bg-purple-600 text-white'
                                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                            }`}
                          >
                            {size.name}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 字體顏色 */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <Palette className="w-3 h-3" />
                        <span>字體顏色</span>
                      </div>
                      <div className="flex gap-2">
                        {SUBTITLE_CONFIG.fontColors.map((color) => (
                          <button
                            key={color.id}
                            onClick={() => updateSettings({ subtitleFontColor: color.id })}
                            className={`w-10 h-10 rounded-lg border-2 transition-all ${
                              settings.subtitleFontColor === color.id
                                ? 'border-purple-500 scale-110'
                                : 'border-gray-600 hover:border-gray-500'
                            }`}
                            style={{ backgroundColor: color.color }}
                            title={color.name}
                          />
                        ))}
                      </div>
                    </div>

                    {/* 字框樣式 */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <span>字框樣式</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {SUBTITLE_CONFIG.boxStyles.map((style) => (
                          <button
                            key={style.id}
                            onClick={() => updateSettings({ subtitleBoxStyle: style.id })}
                            className={`px-3 py-2 rounded text-sm transition-all ${
                              settings.subtitleBoxStyle === style.id
                                ? 'bg-purple-600 text-white'
                                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                            }`}
                          >
                            {style.name}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 字幕位置 */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <Move className="w-3 h-3" />
                        <span>字幕位置</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {SUBTITLE_CONFIG.positions.map((pos) => (
                          <button
                            key={pos.id}
                            onClick={() => updateSettings({ subtitlePosition: pos.id })}
                            className={`px-3 py-2 rounded text-sm transition-all ${
                              settings.subtitlePosition === pos.id
                                ? 'bg-purple-600 text-white'
                                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                            }`}
                          >
                            {pos.name}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 預覽按鈕 */}
                    <button
                      onClick={() => setPreviewSubtitle(!previewSubtitle)}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm transition-colors"
                    >
                      <Eye className="w-4 h-4" />
                      <span>{previewSubtitle ? '關閉預覽' : '預覽字幕效果'}</span>
                    </button>

                    {/* 字幕預覽 */}
                    {previewSubtitle && (
                      <div className="relative bg-gray-900 rounded-lg overflow-hidden" style={{ aspectRatio: '16/9' }}>
                        {/* 模擬視頻背景 */}
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-900 to-purple-900" />
                        
                        {/* 字幕 */}
                        <div 
                          className="absolute w-full flex justify-center"
                          style={{
                            top: settings.subtitlePosition.includes('top') ? '10%' : 
                                 settings.subtitlePosition.includes('middle') ? '50%' : '85%',
                            transform: settings.subtitlePosition.includes('middle') ? 'translateY(-50%)' : 'none',
                          }}
                        >
                          <div
                            className="px-4 py-2 rounded"
                            style={{
                              fontFamily: selectedFont?.name || 'sans-serif',
                              fontSize: `${selectedFontSize?.size || 32}px`,
                              color: selectedFontColor?.color || '#FFFFFF',
                              textShadow: settings.subtitleBoxStyle === 'shadow' ? '2px 2px 4px rgba(0,0,0,0.8)' : 'none',
                              WebkitTextStroke: settings.subtitleBoxStyle === 'outline' ? '2px black' : 'none',
                              backgroundColor: settings.subtitleBoxStyle.includes('box') 
                                ? (settings.subtitleBoxStyle === 'box-black' ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,128,0.7)')
                                : 'transparent',
                            }}
                          >
                            這是字幕預覽效果
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 字幕說明 */}
                    <div className="bg-gray-700/30 rounded-lg p-3 text-xs text-gray-400">
                      <p>• AI 會自動將旁白分割成每行 10-13 字的字幕</p>
                      <p>• 字幕會與音頻同步顯示</p>
                      <p>• 生成後可在片段詳情中手動調整</p>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default MediaSettings;
