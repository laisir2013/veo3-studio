// 更新配音員試聽 URL 腳本
// 從 KreadoAI API 獲取有效的 defaultVoiceUrl 並更新配置文件

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_TOKEN = "E8B341B32147B299DB8ABFE9BD077929";
const API_URL = "https://api.kreadoai.com/apis/open/voice/v3/getVoiceList";

interface VoiceData {
  voiceId: string;
  voiceName: string;
  defaultVoiceUrl: string;
  gender: string;
  ageGroup: string;
}

interface ApiResponse {
  code: string;
  message: string;
  data: {
    data: VoiceData[];
    totalCount: number;
    totalPages: number;
  };
}

// 語言配置
const LANGUAGE_CONFIGS = [
  {
    language: "Chinese",
    languageCityType: "Chinese (Cantonese, Simplified) - 粤语简体",
    voiceSource: 5,
    prefix: "cantonese"
  },
  {
    language: "Chinese", 
    languageCityType: "Chinese (Mandarin, Simplified) - 普通话",
    voiceSource: 4,
    prefix: "mandarin"
  }
];

async function fetchVoiceList(config: typeof LANGUAGE_CONFIGS[0], pageIndex: number = 1): Promise<VoiceData[]> {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apiToken': API_TOKEN
    },
    body: JSON.stringify({
      language: config.language,
      languageCityType: config.languageCityType,
      voiceClone: 0,
      voiceSource: config.voiceSource,
      pageIndex,
      pageSize: 100
    })
  });

  const data = await response.json() as ApiResponse;
  
  if (data.code !== "200") {
    console.error(`API Error: ${data.message}`);
    return [];
  }

  return data.data.data;
}

async function getAllVoices(): Promise<Map<string, string>> {
  const voiceUrlMap = new Map<string, string>();

  for (const config of LANGUAGE_CONFIGS) {
    console.log(`Fetching ${config.prefix} voices...`);
    
    let pageIndex = 1;
    let hasMore = true;
    
    while (hasMore) {
      const voices = await fetchVoiceList(config, pageIndex);
      
      if (voices.length === 0) {
        hasMore = false;
        break;
      }

      for (const voice of voices) {
        if (voice.defaultVoiceUrl) {
          voiceUrlMap.set(voice.voiceId, voice.defaultVoiceUrl);
          console.log(`  Found: ${voice.voiceName} (${voice.voiceId})`);
        }
      }

      pageIndex++;
      
      // 限制頁數避免太多請求
      if (pageIndex > 20) {
        hasMore = false;
      }
      
      // 延遲避免限流
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  return voiceUrlMap;
}

async function updateConfigFile(voiceUrlMap: Map<string, string>) {
  const configPath = path.join(__dirname, '../server/voiceActorsConfig.ts');
  let content = fs.readFileSync(configPath, 'utf-8');

  let updatedCount = 0;

  for (const [voiceId, newUrl] of voiceUrlMap) {
    // 轉義特殊字符
    const escapedVoiceId = voiceId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // 找到對應的 kreadoVoiceId 並更新 sampleUrl
    try {
      const regex = new RegExp(
        `(kreadoVoiceId:\\s*["']${escapedVoiceId}["'][^}]*sampleUrl:\\s*["'])[^"']+["']`,
        'g'
      );
      
      // 也嘗試反向匹配（sampleUrl 在 kreadoVoiceId 之前）
      const regex2 = new RegExp(
        `(sampleUrl:\\s*["'])[^"']+(["'][^}]*kreadoVoiceId:\\s*["']${escapedVoiceId}["'])`,
        'g'
      );

      if (content.match(regex)) {
        content = content.replace(regex, `$1${newUrl}"`);
        updatedCount++;
      } else if (content.match(regex2)) {
        content = content.replace(regex2, `$1${newUrl}$2`);
        updatedCount++;
      }
    } catch (e) {
      // 跳過無法處理的 voiceId
      continue;
    }
  }

  fs.writeFileSync(configPath, content);
  console.log(`\nUpdated ${updatedCount} voice sample URLs`);
}

async function main() {
  console.log('Starting voice sample URL update...\n');
  
  const voiceUrlMap = await getAllVoices();
  console.log(`\nTotal voices found: ${voiceUrlMap.size}`);
  
  // 保存 URL 映射到 JSON 文件供參考
  const mapObj: Record<string, string> = {};
  for (const [key, value] of voiceUrlMap) {
    mapObj[key] = value;
  }
  fs.writeFileSync(
    path.join(__dirname, 'voiceUrlMap.json'),
    JSON.stringify(mapObj, null, 2)
  );
  console.log('Saved URL map to voiceUrlMap.json');

  // 更新配置文件
  await updateConfigFile(voiceUrlMap);
  
  console.log('\nDone!');
}

main().catch(console.error);
