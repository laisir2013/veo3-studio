import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Globe } from "lucide-react";

// 支持的語言類型
export type Language = "cantonese" | "mandarin" | "english" | "clone";

// 語言配置
export const LANGUAGES = {
  cantonese: {
    code: "cantonese",
    name: "粵語",
    englishName: "Cantonese",
    flag: "🇭🇰",
    description: "廣東話 / 香港話",
    scriptStyle: "使用地道粵語詞彙如「係」「唔」「嘅」「咁」「啲」「嚟」等",
  },
  mandarin: {
    code: "mandarin",
    name: "普通話",
    englishName: "Mandarin",
    flag: "🇨🇳",
    description: "標準中文 / 國語",
    scriptStyle: "使用標準書面語，正式流暢的表達方式",
  },
  english: {
    code: "english",
    name: "English",
    englishName: "English",
    flag: "🇺🇸",
    description: "American English",
    scriptStyle: "Natural American English with conversational tone",
  },
  clone: {
    code: "clone",
    name: "克隆聲音",
    englishName: "Clone Voice",
    flag: "🎭",
    description: "自定義克隆語音",
    scriptStyle: "使用克隆的真人聲音，支持粵語發音",
  },
} as const;

interface LanguageSelectorProps {
  selectedLanguage: Language;
  onLanguageChange: (language: Language) => void;
  className?: string;
}

export function LanguageSelector({
  selectedLanguage,
  onLanguageChange,
  className = "",
}: LanguageSelectorProps) {
  return (
    <Card className={`glass ${className}`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Globe className="w-4 h-4 text-primary" />
          語言選擇
        </CardTitle>
        <CardDescription className="text-xs">
          選擇視頻腳本和配音的語言
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {(Object.entries(LANGUAGES) as [Language, typeof LANGUAGES.cantonese][]).map(([key, lang]) => {
            const isSelected = selectedLanguage === key;
            const isClone = key === "clone";
            return (
              <Button
                key={key}
                variant={isSelected ? "default" : "outline"}
                size="sm"
                onClick={() => onLanguageChange(key)}
                className={`flex-1 min-w-[70px] h-auto py-2 px-3 ${
                  isSelected 
                    ? isClone
                      ? "bg-gradient-to-r from-amber-500 to-orange-500 border-0"
                      : "bg-gradient-to-r from-purple-500 to-pink-500 border-0" 
                    : isClone
                      ? "border-amber-500/50 hover:border-amber-500"
                      : "border-border hover:border-primary/50"
                }`}
              >
                <div className="flex flex-col items-center gap-1">
                  <span className="text-lg">{lang.flag}</span>
                  <span className="text-xs font-medium">{lang.name}</span>
                </div>
              </Button>
            );
          })}
        </div>
        
        {/* 顯示當前語言的腳本風格說明 */}
        <div className="mt-3 p-2 rounded-lg bg-background/50">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={`text-xs ${selectedLanguage === "clone" ? "border-amber-500/50 text-amber-500" : ""}`}>
              {LANGUAGES[selectedLanguage].flag} {LANGUAGES[selectedLanguage].name}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {LANGUAGES[selectedLanguage].scriptStyle}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default LanguageSelector;
