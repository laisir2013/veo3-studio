/**
 * 內存存儲模塊 - 用於在沒有數據庫時運行系統
 * 數據在服務器重啟後會丟失
 */

export interface VideoTask {
  id: number;
  userId: number;
  mode: string;
  storyMode: string;
  videoModel: string;
  llmModel: string;
  story: string;
  characterDescription: string | null;
  visualStyle: string | null;
  language: string;
  status: "pending" | "analyzing" | "generating_images" | "generating_videos" | "generating_audio" | "merging" | "completed" | "failed";
  progress: number;
  errorMessage: string | null;
  scenes: any | null;
  finalVideoUrl: string | null;
  currentStep: string | null;
  totalScenes: number | null;
  completedScenes: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LongVideoTask {
  id: string;
  userId: number;
  status: "pending" | "processing" | "completed" | "failed";
  durationMinutes: number;
  totalSegments: number;
  completedSegments: number;
  totalBatches: number;
  currentBatch: number;
  story: string;
  characterDescription: string | null;
  visualStyle: string | null;
  language: string;
  voiceActorId: string;
  speedMode: string;
  storyMode: string;
  segments: any[];
  finalVideoUrl: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Character {
  id: number;
  userId: number;
  name: string;
  description: string | null;
  baseImageUrl: string | null;
  voiceActorId: string | null;
  status: "pending" | "ready" | "failed";
  createdAt: Date;
}

class MemoryStore {
  private videoTasks: Map<number, VideoTask> = new Map();
  private longVideoTasks: Map<string, LongVideoTask> = new Map();
  private characters: Map<number, Character> = new Map();
  private nextVideoTaskId = 1;
  private nextCharacterId = 1;

  // Video Tasks
  createVideoTask(data: Omit<VideoTask, "id" | "createdAt" | "updatedAt" | "errorMessage" | "scenes" | "finalVideoUrl" | "currentStep" | "totalScenes" | "completedScenes">): VideoTask {
    const task: VideoTask = {
      ...data,
      id: this.nextVideoTaskId++,
      errorMessage: null,
      scenes: null,
      finalVideoUrl: null,
      currentStep: null,
      totalScenes: null,
      completedScenes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.videoTasks.set(task.id, task);
    console.log(`[MemoryStore] Created video task ${task.id}`);
    return task;
  }

  getVideoTask(id: number): VideoTask | undefined {
    return this.videoTasks.get(id);
  }

  updateVideoTask(id: number, updates: Partial<VideoTask>): VideoTask | undefined {
    const task = this.videoTasks.get(id);
    if (task) {
      Object.assign(task, updates, { updatedAt: new Date() });
      this.videoTasks.set(id, task);
      console.log(`[MemoryStore] Updated video task ${id}:`, updates.status || updates.progress);
    }
    return task;
  }

  getVideoTasksByUser(userId: number): VideoTask[] {
    return Array.from(this.videoTasks.values())
      .filter(t => t.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  getAllVideoTasks(): VideoTask[] {
    return Array.from(this.videoTasks.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  // Long Video Tasks
  createLongVideoTask(data: Omit<LongVideoTask, "createdAt" | "updatedAt" | "finalVideoUrl" | "errorMessage">): LongVideoTask {
    const task: LongVideoTask = {
      ...data,
      finalVideoUrl: null,
      errorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.longVideoTasks.set(task.id, task);
    console.log(`[MemoryStore] Created long video task ${task.id}`);
    return task;
  }

  getLongVideoTask(id: string): LongVideoTask | undefined {
    return this.longVideoTasks.get(id);
  }

  updateLongVideoTask(id: string, updates: Partial<LongVideoTask>): LongVideoTask | undefined {
    const task = this.longVideoTasks.get(id);
    if (task) {
      Object.assign(task, updates, { updatedAt: new Date() });
      this.longVideoTasks.set(id, task);
      console.log(`[MemoryStore] Updated long video task ${id}:`, updates.status || updates.completedSegments);
    }
    return task;
  }

  getLongVideoTasksByUser(userId: number): LongVideoTask[] {
    return Array.from(this.longVideoTasks.values())
      .filter(t => t.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  // Characters
  createCharacter(data: Omit<Character, "id" | "createdAt">): Character {
    const character: Character = {
      ...data,
      id: this.nextCharacterId++,
      createdAt: new Date(),
    };
    this.characters.set(character.id, character);
    console.log(`[MemoryStore] Created character ${character.id}`);
    return character;
  }

  getCharacter(id: number): Character | undefined {
    return this.characters.get(id);
  }

  getCharactersByUser(userId: number): Character[] {
    return Array.from(this.characters.values())
      .filter(c => c.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  getCharactersByIds(ids: number[]): Character[] {
    return ids.map(id => this.characters.get(id)).filter((c): c is Character => c !== undefined);
  }

  updateCharacter(id: number, updates: Partial<Character>): Character | undefined {
    const character = this.characters.get(id);
    if (character) {
      Object.assign(character, updates);
      this.characters.set(id, character);
    }
    return character;
  }

  deleteCharacter(id: number): boolean {
    return this.characters.delete(id);
  }
}

// 單例模式
export const memoryStore = new MemoryStore();
