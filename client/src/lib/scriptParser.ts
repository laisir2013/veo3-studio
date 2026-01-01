/**
 * 腳本解析器 - 解析用戶上傳的腳本文件
 * 支持 TXT 和 Markdown 格式
 */

export interface ParsedSegment {
  id: number;
  description: string;  // 視頻描述（英文，用於 AI 生成視頻）
  narration: string;    // 旁白文字（中文或其他語言）
}

export interface ParsedScript {
  title: string;
  segments: ParsedSegment[];
  error?: string;
}

/**
 * 解析腳本文件內容
 * 
 * 支持的格式：
 * 
 * # 視頻標題
 * 我的閱讀習慣養成之旅
 * 
 * # 片段 1
 * ## 視頻描述
 * A young woman sits on a cozy sofa...
 * 
 * ## 旁白
 * 在這個快節奏的時代，閱讀成為了我最珍貴的習慣...
 * 
 * # 片段 2
 * ...
 */
export function parseScript(content: string): ParsedScript {
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
    
    // 跳過空行（但保留內容中的空行）
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
      // 保存上一個片段
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
    
    // 檢測旁白
    if (line.match(/^##\s*旁白|^##\s*Narration|^##\s*Voice Over/i)) {
      currentSection = 'narration';
      continue;
    }
    
    // 收集內容
    switch (currentSection) {
      case 'title':
        if (!title && line) {
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
  
  // 驗證結果
  if (!title && segments.length === 0) {
    return {
      title: '',
      segments: [],
      error: '無法解析腳本格式。請確保使用正確的格式（# 視頻標題、# 片段 N、## 視頻描述、## 旁白）',
    };
  }
  
  // 如果沒有標題但有片段，使用默認標題
  if (!title && segments.length > 0) {
    title = '未命名視頻';
  }
  
  // 重新編號片段（確保從 1 開始連續）
  const reindexedSegments = segments.map((seg, index) => ({
    ...seg,
    id: index + 1,
  }));
  
  return {
    title,
    segments: reindexedSegments,
  };
}

/**
 * 簡化格式解析器 - 支持更簡單的格式
 * 
 * 格式：
 * 標題：我的閱讀習慣
 * 
 * ---
 * 
 * 描述：A young woman reading a book
 * 旁白：在這個快節奏的時代...
 * 
 * ---
 * 
 * 描述：Close-up of book pages
 * 旁白：書頁翻動的聲音...
 */
export function parseSimpleScript(content: string): ParsedScript {
  const sections = content.split(/---+/).map(s => s.trim()).filter(s => s);
  
  if (sections.length === 0) {
    return {
      title: '',
      segments: [],
      error: '無法解析腳本。請使用 --- 分隔每個片段。',
    };
  }
  
  let title = '';
  const segments: ParsedSegment[] = [];
  
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    
    // 檢查是否是標題部分
    const titleMatch = section.match(/^(?:標題|标题|Title)[：:]\s*(.+)/im);
    if (titleMatch && !title) {
      title = titleMatch[1].trim();
      
      // 檢查這個部分是否還有描述和旁白
      const descMatch = section.match(/(?:描述|视频描述|Description)[：:]\s*(.+?)(?=(?:旁白|Narration)[：:]|$)/is);
      const narrMatch = section.match(/(?:旁白|Narration)[：:]\s*(.+)/is);
      
      if (descMatch || narrMatch) {
        segments.push({
          id: segments.length + 1,
          description: descMatch ? descMatch[1].trim() : '',
          narration: narrMatch ? narrMatch[1].trim() : '',
        });
      }
      continue;
    }
    
    // 解析片段
    const descMatch = section.match(/(?:描述|视频描述|Description)[：:]\s*(.+?)(?=(?:旁白|Narration)[：:]|$)/is);
    const narrMatch = section.match(/(?:旁白|Narration)[：:]\s*(.+)/is);
    
    if (descMatch || narrMatch) {
      segments.push({
        id: segments.length + 1,
        description: descMatch ? descMatch[1].trim() : '',
        narration: narrMatch ? narrMatch[1].trim() : '',
      });
    }
  }
  
  if (!title) {
    title = '未命名視頻';
  }
  
  return {
    title,
    segments,
  };
}

/**
 * 自動檢測並解析腳本
 */
export function autoParseScript(content: string): ParsedScript {
  // 首先嘗試 Markdown 格式
  const mdResult = parseScript(content);
  if (mdResult.segments.length > 0) {
    return mdResult;
  }
  
  // 然後嘗試簡化格式
  const simpleResult = parseSimpleScript(content);
  if (simpleResult.segments.length > 0) {
    return simpleResult;
  }
  
  // 都失敗了
  return {
    title: '',
    segments: [],
    error: '無法解析腳本格式。請使用以下格式之一：\n\n' +
      '格式一（Markdown）：\n' +
      '# 視頻標題\n' +
      '標題文字\n\n' +
      '# 片段 1\n' +
      '## 視頻描述\n' +
      '英文描述...\n\n' +
      '## 旁白\n' +
      '中文旁白...\n\n' +
      '格式二（簡化）：\n' +
      '標題：標題文字\n' +
      '---\n' +
      '描述：英文描述\n' +
      '旁白：中文旁白\n' +
      '---\n' +
      '描述：...\n' +
      '旁白：...',
  };
}

/**
 * 生成腳本模板
 */
export function generateScriptTemplate(segmentCount: number = 8): string {
  let template = `# 視頻標題
請在此輸入您的視頻標題

`;

  for (let i = 1; i <= segmentCount; i++) {
    template += `# 片段 ${i}
## 視頻描述
Please describe the video scene in English. This will be used to generate the video.

## 旁白
請在此輸入中文旁白文字。這將用於生成語音旁白。

`;
  }

  return template;
}
