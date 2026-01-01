import OpenAI from "openai";
import fs from "fs";

const API_KEY = "sk-0WSOTsnoaf0eNstC4pJOjrLNJjBTZi0DMYsKV6jaLOV4ydfX";
const BASE_URL = "https://api.vectorengine.ai/v1";

async function testWhisper() {
  console.log("測試 Whisper API...\n");
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`API Key: ${API_KEY.slice(0, 10)}...`);
  
  const openai = new OpenAI({
    apiKey: API_KEY,
    baseURL: BASE_URL,
  });
  
  // 先列出可用的模型
  console.log("\n列出可用模型...");
  const models = await openai.models.list();
  const whisperModels = models.data.filter(m => m.id.includes("whisper"));
  
  console.log(`\n找到 ${whisperModels.length} 個 Whisper 模型:`);
  whisperModels.forEach(m => console.log(`  - ${m.id}`));
  
  if (whisperModels.length === 0) {
    console.log("\n沒有找到 Whisper 模型，列出所有模型:");
    models.data.slice(0, 20).forEach(m => console.log(`  - ${m.id}`));
  }
}

testWhisper().catch(console.error);
