import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  CheckCircle2, 
  Circle, 
  ChevronRight, 
  ChevronLeft,
  Loader2,
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  FileText,
  Video,
  Mic,
  Music,
  Subtitles,
  Volume2,
  Merge,
  Tags,
  Edit,
  Eye,
  AlertCircle
} from "lucide-react";

// 15步工作流程定義（包含語言選定和配音員篩選）
export const WORKFLOW_STEPS = [
  {
    id: 1,
    title: "輸入主題",
    description: "輸入視頻主題或題目",
    icon: FileText,
    color: "from-blue-500 to-cyan-500",
  },
  {
    id: 2,
    title: "選擇旁白語言",
    description: "選擇旁白語言（粵語、普通話、英語）",
    icon: Mic,
    color: "from-purple-500 to-pink-500",
  },
  {
    id: 3,
    title: "篩選配音員",
    description: "根據性別、年齡、語氣篩選配音員",
    icon: Mic,
    color: "from-pink-500 to-rose-500",
  },
  {
    id: 4,
    title: "生成故事大綱",
    description: "AI 根據主題生成故事大綱",
    icon: Sparkles,
    color: "from-indigo-500 to-violet-500",
  },
  {
    id: 5,
    title: "生成視頻描述",
    description: "為每個片段生成視頻場景描述",
    icon: Video,
    color: "from-green-500 to-emerald-500",
  },
  {
    id: 6,
    title: "生成旁白腳本",
    description: "為每個8秒片段生成旁白文字",
    icon: Mic,
    color: "from-orange-500 to-amber-500",
  },
  {
    id: 7,
    title: "編輯內容",
    description: "手動編輯或AI重新生成描述和旁白",
    icon: Edit,
    color: "from-rose-500 to-red-500",
  },
  {
    id: 8,
    title: "確認並生成",
    description: "選擇模型等級，開始生成視頻",
    icon: Play,
    color: "from-cyan-500 to-blue-500",
  },
  {
    id: 9,
    title: "生成片段",
    description: "系統按順序生成所有視頻片段",
    icon: Video,
    color: "from-teal-500 to-cyan-500",
  },
  {
    id: 10,
    title: "預覽片段",
    description: "預覽每個片段的視頻和旁白",
    icon: Eye,
    color: "from-teal-500 to-green-500",
  },
  {
    id: 11,
    title: "重新生成",
    description: "重新生成不滿意或失敗的片段",
    icon: RotateCcw,
    color: "from-yellow-500 to-orange-500",
  },
  {
    id: 12,
    title: "生成字幕",
    description: "AI 自動識別並生成字幕",
    icon: Subtitles,
    color: "from-pink-500 to-rose-500",
  },
  {
    id: 13,
    title: "調整音量",
    description: "調整旁白、視頻、背景音樂音量",
    icon: Volume2,
    color: "from-violet-500 to-purple-500",
  },
  {
    id: 14,
    title: "合併視頻",
    description: "將所有片段合併成最終視頻",
    icon: Merge,
    color: "from-emerald-500 to-teal-500",
  },
  {
    id: 15,
    title: "SEO 優化",
    description: "AI 生成標題、描述、SEO標籤",
    icon: Tags,
    color: "from-amber-500 to-yellow-500",
  },
];

export type StepStatus = "pending" | "current" | "completed" | "error";

interface WorkflowStepsProps {
  currentStep: number;
  stepStatuses: Record<number, StepStatus>;
  onStepClick?: (stepId: number) => void;
  onNext?: () => void;
  onPrev?: () => void;
  canGoNext?: boolean;
  canGoPrev?: boolean;
  isProcessing?: boolean;
}

export function WorkflowSteps({
  currentStep,
  stepStatuses,
  onStepClick,
  onNext,
  onPrev,
  canGoNext = true,
  canGoPrev = true,
  isProcessing = false,
}: WorkflowStepsProps) {
  const progress = ((currentStep - 1) / (WORKFLOW_STEPS.length - 1)) * 100;

  return (
    <div className="space-y-4">
      {/* 進度條 */}
      <div className="relative">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-white">
            步驟 {currentStep} / {WORKFLOW_STEPS.length}
          </span>
          <span className="text-sm text-zinc-400">
            {WORKFLOW_STEPS[currentStep - 1]?.title}
          </span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      {/* 步驟導航 */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={onPrev}
          disabled={!canGoPrev || currentStep === 1 || isProcessing}
          className="gap-2"
        >
          <ChevronLeft className="w-4 h-4" />
          上一步
        </Button>

        <div className="flex items-center gap-1">
          {WORKFLOW_STEPS.map((step) => {
            const status = stepStatuses[step.id] || "pending";
            const isCurrent = step.id === currentStep;
            const Icon = step.icon;

            return (
              <button
                key={step.id}
                onClick={() => onStepClick?.(step.id)}
                disabled={isProcessing}
                className={`relative group transition-all duration-200 ${
                  isCurrent ? "scale-110" : "hover:scale-105"
                }`}
                title={`${step.id}. ${step.title}`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                    status === "completed"
                      ? "bg-green-500 text-white"
                      : status === "error"
                      ? "bg-red-500 text-white"
                      : isCurrent
                      ? `bg-gradient-to-br ${step.color} text-white ring-2 ring-white/30`
                      : "bg-zinc-700 text-zinc-400"
                  }`}
                >
                  {status === "completed" ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : status === "error" ? (
                    <AlertCircle className="w-4 h-4" />
                  ) : isCurrent && isProcessing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <span className="text-xs font-bold">{step.id}</span>
                  )}
                </div>

                {/* Tooltip */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-zinc-800 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                  {step.title}
                </div>
              </button>
            );
          })}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={onNext}
          disabled={!canGoNext || currentStep === WORKFLOW_STEPS.length || isProcessing}
          className="gap-2"
        >
          下一步
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// 步驟卡片組件
interface StepCardProps {
  step: typeof WORKFLOW_STEPS[0];
  status: StepStatus;
  isCurrent: boolean;
  children: React.ReactNode;
}

export function StepCard({ step, status, isCurrent, children }: StepCardProps) {
  const Icon = step.icon;

  return (
    <Card
      className={`transition-all duration-300 ${
        isCurrent
          ? "ring-2 ring-primary/50 bg-gradient-to-br from-zinc-900 to-zinc-800"
          : status === "completed"
          ? "bg-green-500/5 border-green-500/30"
          : "bg-zinc-900/50"
      }`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center bg-gradient-to-br ${step.color}`}
          >
            <Icon className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <CardTitle className="text-lg flex items-center gap-2">
              第 {step.id} 步：{step.title}
              {status === "completed" && (
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              )}
              {status === "error" && (
                <AlertCircle className="w-5 h-5 text-red-500" />
              )}
            </CardTitle>
            <CardDescription>{step.description}</CardDescription>
          </div>
          <Badge
            variant={
              status === "completed"
                ? "default"
                : status === "error"
                ? "destructive"
                : isCurrent
                ? "secondary"
                : "outline"
            }
          >
            {status === "completed"
              ? "已完成"
              : status === "error"
              ? "錯誤"
              : isCurrent
              ? "進行中"
              : "待處理"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

// 垂直步驟列表組件（用於側邊欄）
interface VerticalStepListProps {
  currentStep: number;
  stepStatuses: Record<number, StepStatus>;
  onStepClick?: (stepId: number) => void;
}

export function VerticalStepList({
  currentStep,
  stepStatuses,
  onStepClick,
}: VerticalStepListProps) {
  return (
    <div className="space-y-1">
      {WORKFLOW_STEPS.map((step, index) => {
        const status = stepStatuses[step.id] || "pending";
        const isCurrent = step.id === currentStep;
        const Icon = step.icon;

        return (
          <button
            key={step.id}
            onClick={() => onStepClick?.(step.id)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all text-left ${
              isCurrent
                ? "bg-primary/20 text-white"
                : status === "completed"
                ? "bg-green-500/10 text-green-400 hover:bg-green-500/20"
                : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
            }`}
          >
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                status === "completed"
                  ? "bg-green-500 text-white"
                  : status === "error"
                  ? "bg-red-500 text-white"
                  : isCurrent
                  ? `bg-gradient-to-br ${step.color} text-white`
                  : "bg-zinc-700 text-zinc-400"
              }`}
            >
              {status === "completed" ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : status === "error" ? (
                <AlertCircle className="w-4 h-4" />
              ) : (
                <span className="text-xs font-bold">{step.id}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{step.title}</div>
            </div>
            {isCurrent && (
              <ChevronRight className="w-4 h-4 text-primary flex-shrink-0" />
            )}
          </button>
        );
      })}
    </div>
  );
}
