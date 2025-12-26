/**
 * SEO 結果展示面板組件
 */

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Copy, 
  Check, 
  Download, 
  Sparkles, 
  Hash, 
  FileText, 
  Tag, 
  Image,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { toast } from "sonner";

// SEO 結果類型
export interface SeoResult {
  titles: string[];
  description: string;
  keywords: string[];
  tags: string[];
  hashtags: string[];
  thumbnailSuggestions: string[];
}

interface SeoPanelProps {
  seoResult: SeoResult;
  language?: string;
  platform?: string;
  onRegenerate?: () => void;
}

export function SeoPanel({ seoResult, language, platform, onRegenerate }: SeoPanelProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    titles: true,
    description: true,
    keywords: false,
    tags: false,
    hashtags: false,
    thumbnails: false,
  });

  // 複製到剪貼板
  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      toast.success("已複製到剪貼板");
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      toast.error("複製失敗");
    }
  };

  // 複製所有內容
  const copyAll = async () => {
    const allContent = `
【標題選項】
${seoResult.titles.map((t, i) => `${i + 1}. ${t}`).join("\n")}

【視頻描述】
${seoResult.description}

【關鍵詞】
${seoResult.keywords.join(", ")}

【標籤】
${seoResult.tags.join(", ")}

【話題標籤】
${seoResult.hashtags.join(" ")}

【縮略圖建議】
${seoResult.thumbnailSuggestions.map((s, i) => `${i + 1}. ${s}`).join("\n")}
`.trim();

    await copyToClipboard(allContent, "all");
  };

  // 導出為文本文件
  const exportToFile = () => {
    const content = `
VEO3 SEO 優化內容
==================
平台: ${platform || "通用"}
語言: ${language || "繁體中文"}
生成時間: ${new Date().toLocaleString()}

【標題選項】
${seoResult.titles.map((t, i) => `${i + 1}. ${t}`).join("\n")}

【視頻描述】
${seoResult.description}

【關鍵詞】
${seoResult.keywords.join(", ")}

【標籤】
${seoResult.tags.join(", ")}

【話題標籤】
${seoResult.hashtags.join(" ")}

【縮略圖建議】
${seoResult.thumbnailSuggestions.map((s, i) => `${i + 1}. ${s}`).join("\n")}
`.trim();

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `seo-content-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("已導出 SEO 內容");
  };

  // 切換展開/收起
  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  // 複製按鈕組件
  const CopyButton = ({ text, field }: { text: string; field: string }) => (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => copyToClipboard(text, field)}
      className="h-8 w-8 p-0"
    >
      {copiedField === field ? (
        <Check className="h-4 w-4 text-green-500" />
      ) : (
        <Copy className="h-4 w-4" />
      )}
    </Button>
  );

  // 區塊標題組件
  const SectionHeader = ({ 
    title, 
    icon: Icon, 
    section, 
    count 
  }: { 
    title: string; 
    icon: React.ElementType; 
    section: string; 
    count?: number;
  }) => (
    <button
      onClick={() => toggleSection(section)}
      className="flex items-center justify-between w-full py-2 text-left hover:bg-white/5 rounded-lg px-2 transition-colors"
    >
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-purple-400" />
        <span className="font-medium">{title}</span>
        {count !== undefined && (
          <Badge variant="secondary" className="ml-2">{count}</Badge>
        )}
      </div>
      {expandedSections[section] ? (
        <ChevronUp className="h-4 w-4" />
      ) : (
        <ChevronDown className="h-4 w-4" />
      )}
    </button>
  );

  return (
    <Card className="border-purple-500/30 bg-gradient-to-br from-purple-500/5 to-pink-500/5">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-500" />
              SEO 優化內容
            </CardTitle>
            <CardDescription>
              為您的視頻生成的 SEO 優化建議
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={copyAll}>
              <Copy className="w-4 h-4 mr-2" />
              複製全部
            </Button>
            <Button variant="outline" size="sm" onClick={exportToFile}>
              <Download className="w-4 h-4 mr-2" />
              導出
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* 標題選項 */}
        <div className="space-y-2">
          <SectionHeader title="標題選項" icon={FileText} section="titles" count={seoResult.titles.length} />
          {expandedSections.titles && (
            <div className="space-y-2 pl-6">
              {seoResult.titles.map((title, index) => (
                <div 
                  key={index} 
                  className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/10 hover:border-purple-500/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="shrink-0">
                      {index + 1}
                    </Badge>
                    <span className="text-sm">{title}</span>
                  </div>
                  <CopyButton text={title} field={`title-${index}`} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 視頻描述 */}
        <div className="space-y-2">
          <SectionHeader title="視頻描述" icon={FileText} section="description" />
          {expandedSections.description && (
            <div className="pl-6">
              <div className="relative p-4 bg-white/5 rounded-lg border border-white/10">
                <p className="text-sm whitespace-pre-wrap pr-10">{seoResult.description}</p>
                <div className="absolute top-2 right-2">
                  <CopyButton text={seoResult.description} field="description" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 關鍵詞 */}
        <div className="space-y-2">
          <SectionHeader title="關鍵詞" icon={Tag} section="keywords" count={seoResult.keywords.length} />
          {expandedSections.keywords && (
            <div className="pl-6">
              <div className="flex flex-wrap gap-2 p-3 bg-white/5 rounded-lg border border-white/10">
                {seoResult.keywords.map((keyword, index) => (
                  <Badge 
                    key={index} 
                    variant="secondary"
                    className="cursor-pointer hover:bg-purple-500/20 transition-colors"
                    onClick={() => copyToClipboard(keyword, `keyword-${index}`)}
                  >
                    {keyword}
                  </Badge>
                ))}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={() => copyToClipboard(seoResult.keywords.join(", "), "keywords-all")}
              >
                <Copy className="w-4 h-4 mr-2" />
                複製全部關鍵詞
              </Button>
            </div>
          )}
        </div>

        {/* 標籤 */}
        <div className="space-y-2">
          <SectionHeader title="標籤" icon={Tag} section="tags" count={seoResult.tags.length} />
          {expandedSections.tags && (
            <div className="pl-6">
              <div className="flex flex-wrap gap-2 p-3 bg-white/5 rounded-lg border border-white/10">
                {seoResult.tags.map((tag, index) => (
                  <Badge 
                    key={index} 
                    variant="outline"
                    className="cursor-pointer hover:bg-purple-500/20 transition-colors"
                    onClick={() => copyToClipboard(tag, `tag-${index}`)}
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={() => copyToClipboard(seoResult.tags.join(", "), "tags-all")}
              >
                <Copy className="w-4 h-4 mr-2" />
                複製全部標籤
              </Button>
            </div>
          )}
        </div>

        {/* 話題標籤 */}
        <div className="space-y-2">
          <SectionHeader title="話題標籤" icon={Hash} section="hashtags" count={seoResult.hashtags.length} />
          {expandedSections.hashtags && (
            <div className="pl-6">
              <div className="flex flex-wrap gap-2 p-3 bg-white/5 rounded-lg border border-white/10">
                {seoResult.hashtags.map((hashtag, index) => (
                  <Badge 
                    key={index} 
                    className="bg-purple-500/20 text-purple-300 cursor-pointer hover:bg-purple-500/30 transition-colors"
                    onClick={() => copyToClipboard(hashtag, `hashtag-${index}`)}
                  >
                    {hashtag}
                  </Badge>
                ))}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={() => copyToClipboard(seoResult.hashtags.join(" "), "hashtags-all")}
              >
                <Copy className="w-4 h-4 mr-2" />
                複製全部話題標籤
              </Button>
            </div>
          )}
        </div>

        {/* 縮略圖建議 */}
        <div className="space-y-2">
          <SectionHeader title="縮略圖建議" icon={Image} section="thumbnails" count={seoResult.thumbnailSuggestions.length} />
          {expandedSections.thumbnails && (
            <div className="space-y-2 pl-6">
              {seoResult.thumbnailSuggestions.map((suggestion, index) => (
                <div 
                  key={index} 
                  className="flex items-start gap-3 p-3 bg-white/5 rounded-lg border border-white/10"
                >
                  <Badge variant="outline" className="shrink-0 mt-0.5">
                    {index + 1}
                  </Badge>
                  <span className="text-sm">{suggestion}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default SeoPanel;
