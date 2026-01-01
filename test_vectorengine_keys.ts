import OpenAI from "openai";

const API_KEYS = [
  "sk-0WSOTsnoaf0eNstC4pJOjrLNJjBTZi0DMYsKV6jaLOV4ydfX",
  "sk-fX1KaFxYUxy6S7ouggSGeLLmLuoq1zDUQDGAxyVxrWJgtqQr",
  "sk-nwsjL79MgOjKO3UOrt1LGNoj2D5jWbcfCwoDsc8Utf2OOhUI",
  "sk-15QTY6nSAiFca0FCP9Yks3xlmTvL2XZjck1MMPgNznGiBsXs",
  "sk-DaOpIa2ho5AiWbdV6mzOaFWDZH1UlgASOspMRQtXIJxQqGhN",
  "sk-T0qvRM5CIInHsskdqWV0f9Te9g8FKd7dUCfljaGWpOH4Q0Rk",
  "sk-uNpzao62UqY6LxrFyMo3DPImXYL2wdjydEKuPWrh8EGXrvoI",
  "sk-2gu2bPuvn8t6AC6wzk6NmkBIXaj34Zmvt9OpgabxQFRIW71H",
  "sk-M6x6doe0uKMs9DpWTDIXATeSagxOwibEkBGZytl8KblvLW2U",
  "sk-TRgLLnSrMqI5SuM5hkBuDeSyVYhrdppsG9Vk3grADVVryhqj",
  "sk-R8Zkzp274XV4Ni99H6I3RaBC7yJ8wUvbYTMETbllQYTLn9HS",
  "sk-VC7kkQW6bxEvTvAHdsyXCWI2eyM9UIgwa9JzTXdNLP3b5yG3",
];

const BASE_URL = "https://api.vectorengine.ai/v1";

async function testKey(apiKey: string): Promise<boolean> {
  try {
    const openai = new OpenAI({
      apiKey: apiKey,
      baseURL: BASE_URL,
    });
    
    // 測試簡單的 API 調用
    const response = await openai.models.list();
    console.log(`✅ Key ${apiKey.slice(0, 10)}... 有效！`);
    return true;
  } catch (error: any) {
    if (error.status === 401) {
      console.log(`❌ Key ${apiKey.slice(0, 10)}... 無效 (401)`);
    } else if (error.status === 429) {
      console.log(`⚠️ Key ${apiKey.slice(0, 10)}... 有效但限流 (429)`);
      return true;
    } else {
      console.log(`❌ Key ${apiKey.slice(0, 10)}... 錯誤: ${error.message}`);
    }
    return false;
  }
}

async function main() {
  console.log("開始測試 VectorEngine API Keys...\n");
  console.log(`Base URL: ${BASE_URL}\n`);
  
  const validKeys: string[] = [];
  
  for (const key of API_KEYS) {
    const isValid = await testKey(key);
    if (isValid) {
      validKeys.push(key);
    }
  }
  
  console.log("\n========== 測試結果 ==========");
  console.log(`有效 Keys: ${validKeys.length}/${API_KEYS.length}`);
  
  if (validKeys.length > 0) {
    console.log("\n有效的 API Keys:");
    validKeys.forEach((key, i) => {
      console.log(`${i + 1}. ${key}`);
    });
  }
}

main();
