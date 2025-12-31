/**
 * 統一的任務類型定義
 * 在後端和前端之間共享
 */

// ✅ 片段狀態
export type SegmentStatus = 'pending' | 'generating' | 'completed' | 'failed';

// ✅ 任務狀態
export type TaskStatus =
  | 'pending'
  | 'generatingscript'
  | 'generatingsegments'
  | 'segmentscompleted'
  | 'merging'
  | 'completed'
  | 'failed';

// ✅ 媒體類型
export type MediaType = 'video' | 'image';

// ✅ 任務片段
export interface TaskSegment {
  index: number;
  text: string;
  status: SegmentStatus;
  mediaType: MediaType;
  videoUrl?: string;
  imageUrl?: string;
  audioUrl?: string;
  narration?: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

// ✅ 任務配置
export interface TaskConfig {
  topic: string;
  language: string;
  voiceId: string;
  duration: number;
  segmentCount: number;
  style: 'video' | 'image' | 'mixed';
  backgroundMusic?: string;
  addSubtitles?: boolean;
}

// ✅ 完整任務對象
export interface LongVideoTask {
  taskId: string;
  title: string;
  status: TaskStatus;
  progress: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  config: TaskConfig;
  script?: string;
  segments: TaskSegment[];
  mergedVideoUrl?: string;
  error?: string;
}

// ✅ 任務摘要（用於列表顯示）
export interface TaskSummary {
  taskId: string;
  title: string;
  status: TaskStatus;
  progress: number;
  createdAt: string;
  updatedAt: string;
  segmentCount: number;
  completedSegments: number;
  thumbnailUrl?: string;
}
