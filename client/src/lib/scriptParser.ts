/**
 * 腳本解析器 - 解析用戶上傳的腳本文件
 * 支持 TXT 和 Markdown 格式
 * 
 * 新格式支持：
 * - 完整旁白：一大段旁白文字，系統會自動用 Whisper 分割
 * - 視頻描述：每個片段的視頻場景描述
 */

export interface ParsedSegment {
  id: number;
  description: string;  // 視頻描述（英文，用於 AI 生成視頻）
  narration: string;    // 旁白文字（中文或其他語言）- 可為空，由完整旁白自動分配
}

export interface ParsedScript {
  title: string;
  fullNarration: string;  // 完整旁白（新增）
  segments: ParsedSegment[];
  error?: string;
}

/**
 * 解析新格式腳本（完整旁白 + 視頻描述分開）
 * 
 * 格式：
 * # 視頻標題
 * 富爸爸的財富智慧
 * 
 * # 完整旁白
 * 你有沒有想過，為什麼有些人工作一輩子還是窮...
 * （一大段完整的旁白文字）
 * 
 * # 片段 1
 * ## 視頻描述
 * A young man sits at a desk looking frustrated...
 * 
 * # 片段 2
 * ## 視頻描述
 * Close-up of a book being opened...
 */
export function parseNewFormatScript(content: string): ParsedScript {
  const lines = content.split('\n');
  let title = '';
  let fullNarration = '';
  const segments: ParsedSegment[] = [];
  
  let currentSegmentId = 0;
  let currentDescription = '';
  let currentSection: 'none' | 'title' | 'fullNarration' | 'description' = 'none';
  let inSegment = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // 跳過空行（但保留內容中的空行）
    if (!line && currentSection === 'none') {
      continue;
    }
    
    // 檢測視頻標題
    if (line.match(/^#\s*視頻標題|^#\s*标题|^#\s*Title/i)) {
      currentSection = 'title';
      continue;
    }
    
    // 檢測完整旁白
    if (line.match(/^#\s*完整旁白|^#\s*旁白|^#\s*Full Narration|^#\s*Narration/i)) {
      currentSection = 'fullNarration';
      continue;
    }
    
    // 檢測片段開始
    const segmentMatch = line.match(/^#\s*片段\s*(\d+)|^#\s*Segment\s*(\d+)/i);
    if (segmentMatch) {
      // 保存上一個片段
      if (inSegment && currentDescription) {
        segments.push({
          id: currentSegmentId,
          description: currentDescription.trim(),
          narration: '', // 旁白由完整旁白自動分配
        });
      }
      
      currentSegmentId = parseInt(segmentMatch[1] || segmentMatch[2]);
      currentDescription = '';
      currentSection = 'none';
      inSegment = true;
      continue;
    }
    
    // 檢測視頻描述
    if (line.match(/^##\s*視頻描述|^##\s*视频描述|^##\s*Video Description|^##\s*Description/i)) {
      currentSection = 'description';
      continue;
    }
    
    // 收集內容
    switch (currentSection) {
      case 'title':
        if (!title && line && !line.startsWith('#')) {
          title = line;
          currentSection = 'none';
        }
        break;
      case 'fullNarration':
        if (line && !line.startsWith('#')) {
          fullNarration += (fullNarration ? '\n' : '') + line;
        }
        break;
      case 'description':
        if (line && !line.startsWith('#')) {
          currentDescription += (currentDescription ? '\n' : '') + line;
        }
        break;
    }
  }
  
  // 保存最後一個片段
  if (inSegment && currentDescription) {
    segments.push({
      id: currentSegmentId,
      description: currentDescription.trim(),
      narration: '',
    });
  }
  
  // 重新編號片段（確保從 1 開始連續）
  const reindexedSegments = segments.map((seg, index) => ({
    ...seg,
    id: index + 1,
  }));
  
  return {
    title: title || '未命名視頻',
    fullNarration: fullNarration.trim(),
    segments: reindexedSegments,
  };
}

/**
 * 解析舊格式腳本（每個片段有獨立旁白）
 * 
 * 格式：
 * # 視頻標題
 * 我的閱讀習慣養成之旅
 * 
 * # 片段 1
 * ## 視頻描述
 * A young woman sits on a cozy sofa...
 * 
 * ## 旁白
 * 在這個快節奏的時代，閱讀成為了我最珍貴的習慣...
 */
export function parseOldFormatScript(content: string): ParsedScript {
  const lines = content.split('\n');
  let title = '';
  const segments: ParsedSegment[] = [];
  
  let currentSegmentId = 0;
  let currentDescription = '';
  let currentNarration = '';
  let currentSection: 'none' | 'title' | 'description' | 'narration' = 'none';
  let inSegment = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (!line && currentSection === 'none') {
      continue;
    }
    
    // 檢測視頻標題
    if (line.match(/^#\s*視頻標題|^#\s*标题|^#\s*Title/i)) {
      currentSection = 'title';
      continue;
    }
    
    // 檢測片段開始
    const segmentMatch = line.match(/^#\s*片段\s*(\d+)|^#\s*Segment\s*(\d+)/i);
    if (segmentMatch) {
      if (inSegment && (currentDescription || currentNarration)) {
        segments.push({
          id: currentSegmentId,
          description: currentDescription.trim(),
          narration: currentNarration.trim(),
        });
      }
      
      currentSegmentId = parseInt(segmentMatch[1] || segmentMatch[2]);
      currentDescription = '';
      currentNarration = '';
      currentSection = 'none';
      inSegment = true;
      continue;
    }
    
    // 檢測視頻描述
    if (line.match(/^##\s*視頻描述|^##\s*视频描述|^##\s*Video Description|^##\s*Description/i)) {
      currentSection = 'description';
      continue;
    }
    
    // 檢測旁白（片段內的旁白）
    if (line.match(/^##\s*旁白|^##\s*Narration|^##\s*Voice Over/i)) {
      currentSection = 'narration';
      continue;
    }
    
    // 收集內容
    switch (currentSection) {
      case 'title':
        if (!title && line && !line.startsWith('#')) {
          title = line;
          currentSection = 'none';
        }
        break;
      case 'description':
        if (line && !line.startsWith('#')) {
          currentDescription += (currentDescription ? '\n' : '') + line;
        }
        break;
      case 'narration':
        if (line && !line.startsWith('#')) {
          currentNarration += (currentNarration ? '\n' : '') + line;
        }
        break;
    }
  }
  
  // 保存最後一個片段
  if (inSegment && (currentDescription || currentNarration)) {
    segments.push({
      id: currentSegmentId,
      description: currentDescription.trim(),
      narration: currentNarration.trim(),
    });
  }
  
  // 合併所有旁白為完整旁白
  const fullNarration = segments.map(s => s.narration).filter(n => n).join('\n\n');
  
  // 重新編號片段
  const reindexedSegments = segments.map((seg, index) => ({
    ...seg,
    id: index + 1,
  }));
  
  return {
    title: title || '未命名視頻',
    fullNarration,
    segments: reindexedSegments,
  };
}

/**
 * 自動檢測並解析腳本
 */
export function autoParseScript(content: string): ParsedScript {
  // 檢測是否包含「完整旁白」標記
  const hasFullNarration = content.match(/^#\s*完整旁白|^#\s*Full Narration/im);
  
  if (hasFullNarration) {
    // 使用新格式解析
    const result = parseNewFormatScript(content);
    if (result.segments.length > 0 || result.fullNarration) {
      return result;
    }
  }
  
  // 使用舊格式解析
  const oldResult = parseOldFormatScript(content);
  if (oldResult.segments.length > 0) {
    return oldResult;
  }
  
  // 解析失敗
  return {
    title: '',
    fullNarration: '',
    segments: [],
    error: '無法解析腳本格式。請使用以下格式：\n\n' +
      '# 視頻標題\n' +
      '您的視頻標題\n\n' +
      '# 完整旁白\n' +
      '一大段完整的旁白文字...\n\n' +
      '# 片段 1\n' +
      '## 視頻描述\n' +
      '英文視頻場景描述...\n\n' +
      '# 片段 2\n' +
      '## 視頻描述\n' +
      '...',
  };
}

/**
 * 生成腳本模板（新格式）
 */
export function generateScriptTemplate(segmentCount: number = 8): string {
  let template = `# 視頻標題
請在此輸入您的視頻標題

# 完整旁白
請在此輸入完整的旁白文字。系統會自動根據語音時長分配給各個片段。

建議總字數：
- 1 分鐘視頻（8 片段）：約 400-500 字
- 2 分鐘視頻（15 片段）：約 800-1000 字
- 3 分鐘視頻（22 片段）：約 1200-1500 字

`;

  for (let i = 1; i <= segmentCount; i++) {
    template += `# 片段 ${i}
## 視頻描述
Please describe the video scene in English. Include details about the setting, characters, actions, and atmosphere.

`;
  }

  return template;
}

// 為了向後兼容，保留舊的函數名
export const parseScript = autoParseScript;
