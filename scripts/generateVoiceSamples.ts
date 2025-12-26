// 預先生成所有配音員的試聽音頻
// 使用 KreadoAI TTS API 生成，然後下載保存到本地

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// KreadoAI TTS API 配置
const KREADO_TTS_URL = "https://api.kreadoai.com/apis/open/voice/v3/textToSpeech";
const KREADO_API_KEY = process.env.KREADO_API_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhcHBJZCI6IjE5MTk3MjQiLCJleHAiOjE3NjcwMjU2MDAsImlhdCI6MTczNTQ4OTYwMCwiaXNzIjoiS3JlYWRvQUkiLCJzdWIiOiJhcGlUb2tlbiJ9.vu4h5XAJ_fUYJPnkCLVLvxBUXYCbMJzLQGJmzNtW7qk";

// 語言配置
const LANGUAGE_CONFIG: Record<string, { languageId: string; voiceSource: number }> = {
  cantonese: { languageId: "1767068435675340826", voiceSource: 5 },
  mandarin: { languageId: "1767068435675340832", voiceSource: 4 },
  english: { languageId: "1767068435553706002", voiceSource: 21 },
};

// 需要生成試聽的配音員列表（精簡版，只包含主要配音員）
const VOICE_ACTORS_TO_GENERATE = [
  // 粵語男聲
  { id: "cantonese-male-narrator", name: "書聲儒雅", voiceId: "ai_000046", language: "cantonese", sampleText: "大家好，歡迎嚟到我嘅頻道，今日同你哋分享一個精彩嘅故事。" },
  { id: "cantonese-male-young", name: "磁性男聲", voiceId: "ai_charming_m_01", language: "cantonese", sampleText: "哎，你講嘅係唔係真㗎？我要試下先得！" },
  { id: "cantonese-male-mature", name: "成熟男聲", voiceId: "ai_000141", language: "cantonese", sampleText: "呢件事唔簡單，要諗清楚先得。" },
  { id: "cantonese-male-deep", name: "沉穩男", voiceId: "ai_charming_m_05", language: "cantonese", sampleText: "人生就係咁，有起有落，最緊要係堅持。" },
  
  // 粵語女聲
  { id: "cantonese-female-narrator", name: "灵韵", voiceId: "ai_charming_f_01", language: "cantonese", sampleText: "喺呢個美麗嘅城市入面，每日都有唔同嘅故事發生緊。" },
  { id: "cantonese-female-young", name: "灵音姬", voiceId: "ai_charming_f_22", language: "cantonese", sampleText: "嘩，好靚呀！我哋快啲去睇下啦！" },
  { id: "cantonese-female-mature", name: "灵汐", voiceId: "ai_charming_f_23", language: "cantonese", sampleText: "呢個決定好重要，你要好好考慮清楚。" },
  { id: "cantonese-female-sweet", name: "灵音妹", voiceId: "ai_charming_f_24", language: "cantonese", sampleText: "哈囉，今日天氣好好呀，一齊出去玩啦！" },
  
  // 普通話男聲
  { id: "mandarin-male-narrator", name: "京腔侃爷", voiceId: "zh_male_jingqiangkanye_moon_bigtts", language: "mandarin", sampleText: "大家好，欢迎来到我的频道，今天给大家分享一个精彩的故事。" },
  { id: "mandarin-male-young", name: "阳光青年", voiceId: "zh_male_yangguangqingnian_moon_bigtts", language: "mandarin", sampleText: "嘿，你说的是真的吗？我得试试看！" },
  { id: "mandarin-male-mature", name: "渊博小叔", voiceId: "zh_male_yuanboxiaoshu_moon_bigtts", language: "mandarin", sampleText: "这件事不简单，需要仔细考虑清楚。" },
  
  // 普通話女聲
  { id: "mandarin-female-narrator", name: "爽快思思", voiceId: "zh_female_shuangkuaisisi_moon_bigtts", language: "mandarin", sampleText: "在这个美丽的城市里，每天都有不同的故事在发生。" },
  { id: "mandarin-female-young", name: "邻家女孩", voiceId: "zh_female_linjianvhai_moon_bigtts", language: "mandarin", sampleText: "哇，好漂亮啊！我们快去看看吧！" },
  { id: "mandarin-female-mature", name: "高冷御姐", voiceId: "zh_female_gaolengyujie_moon_bigtts", language: "mandarin", sampleText: "这个决定很重要，你要好好考虑清楚。" },
  
  // 英語男聲
  { id: "english-male-narrator", name: "Alyx", voiceId: "1BUhH8aaMvGMUdGAmWVM", language: "english", sampleText: "Hello everyone, welcome to my channel. Today I'm going to share an amazing story with you." },
  { id: "english-male-young", name: "Johnny Kid", voiceId: "8JVbfL6oEdmuxKn5DK2C", language: "english", sampleText: "Hey, is that really true? I need to try it myself!" },
  
  // 英語女聲
  { id: "english-female-narrator", name: "Samara X", voiceId: "19STyYD15bswVz51nqLf", language: "english", sampleText: "In this beautiful city, different stories unfold every single day." },
  { id: "english-female-young", name: "Amelia", voiceId: "ZF6FPAbjXT4488VcRRnw", language: "english", sampleText: "Wow, that's so beautiful! Let's go check it out!" },
];

// 輸出目錄
const OUTPUT_DIR = path.join(__dirname, "../client/public/voice-samples");

// 確保輸出目錄存在
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// 生成單個配音員的試聽音頻
async function generateSample(actor: typeof VOICE_ACTORS_TO_GENERATE[0]): Promise<string | null> {
  const langConfig = LANGUAGE_CONFIG[actor.language];
  
  console.log(`\n[${actor.id}] 正在生成 ${actor.name} 的試聽音頻...`);
  
  const requestBody = {
    languageId: langConfig.languageId,
    content: actor.sampleText,
    voiceId: actor.voiceId,
    voiceSource: langConfig.voiceSource,
    voiceClone: 0,
  };
  
  try {
    const response = await fetch(KREADO_TTS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apiToken": KREADO_API_KEY,
      },
      body: JSON.stringify(requestBody),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[${actor.id}] API 調用失敗: ${response.status} - ${errorText}`);
      return null;
    }
    
    const data = await response.json();
    
    if (data.code !== "200") {
      console.error(`[${actor.id}] 生成失敗: ${data.message}`);
      return null;
    }
    
    const audioUrl = data.data.textToSpeech.audioUrl;
    console.log(`[${actor.id}] 音頻 URL: ${audioUrl}`);
    
    // 下載音頻文件
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      console.error(`[${actor.id}] 下載音頻失敗: ${audioResponse.status}`);
      return null;
    }
    
    const audioBuffer = await audioResponse.arrayBuffer();
    const outputPath = path.join(OUTPUT_DIR, `${actor.id}.mp3`);
    fs.writeFileSync(outputPath, Buffer.from(audioBuffer));
    
    console.log(`[${actor.id}] ✅ 已保存到: ${outputPath}`);
    return `/voice-samples/${actor.id}.mp3`;
    
  } catch (error) {
    console.error(`[${actor.id}] 錯誤:`, error);
    return null;
  }
}

// 主函數
async function main() {
  console.log("=".repeat(60));
  console.log("開始生成配音員試聽音頻");
  console.log(`總共 ${VOICE_ACTORS_TO_GENERATE.length} 個配音員`);
  console.log("=".repeat(60));
  
  const results: Record<string, string> = {};
  
  for (const actor of VOICE_ACTORS_TO_GENERATE) {
    const localPath = await generateSample(actor);
    if (localPath) {
      results[actor.id] = localPath;
    }
    
    // 避免 API 限流，每次請求間隔 1 秒
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log("\n" + "=".repeat(60));
  console.log("生成完成！");
  console.log(`成功: ${Object.keys(results).length} / ${VOICE_ACTORS_TO_GENERATE.length}`);
  console.log("=".repeat(60));
  
  // 輸出結果映射，方便更新配置文件
  console.log("\n// 更新 voiceActorsConfig.ts 中的 sampleUrl:");
  for (const [id, path] of Object.entries(results)) {
    console.log(`"${id}": "${path}",`);
  }
  
  // 保存結果到 JSON 文件
  const resultsPath = path.join(OUTPUT_DIR, "sample-urls.json");
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`\n結果已保存到: ${resultsPath}`);
}

main().catch(console.error);
