/**
 * KreadoAI TTS API 直接測試腳本
 * 用於診斷音頻時長問題
 */

const KREADO_API_KEY = process.env.KREADO_AI_API_KEY || "E8B341B32147B299DB8ABFE9BD077929";
const KREADO_TTS_URL = "https://api.kreadoai.com/apis/open/voice/v3/textToSpeech";

// 測試用例
const testCases = [
  {
    name: "短文字 (10字)",
    content: "今天天氣真的很好",
    languageId: "1767068435675340826", // 粵語
    voiceId: "ai_000046",
    voiceSource: 5,
  },
  {
    name: "中等文字 (20字)",
    content: "今天天氣真的很好，我們一起去公園散步吧",
    languageId: "1767068435675340826",
    voiceId: "ai_000046",
    voiceSource: 5,
  },
  {
    name: "長文字 (40字)",
    content: "今天天氣真的很好，我們一起去公園散步吧。陽光明媚，微風輕拂，是個適合戶外活動的好日子。",
    languageId: "1767068435675340826",
    voiceId: "ai_000046",
    voiceSource: 5,
  },
  {
    name: "帶換行的文字",
    content: "第一行內容\n第二行內容\n第三行內容",
    languageId: "1767068435675340826",
    voiceId: "ai_000046",
    voiceSource: 5,
  },
  {
    name: "帶特殊字符的文字",
    content: "「這是引號內的文字」，還有…省略號",
    languageId: "1767068435675340826",
    voiceId: "ai_000046",
    voiceSource: 5,
  },
];

async function testKreadoAPI() {
  console.log("========================================");
  console.log("KreadoAI TTS API 直接測試");
  console.log("========================================");
  console.log(`API Key: ${KREADO_API_KEY.substring(0, 10)}...`);
  console.log("");

  for (const testCase of testCases) {
    console.log(`\n--- 測試: ${testCase.name} ---`);
    console.log(`內容: "${testCase.content}"`);
    console.log(`字符數: ${testCase.content.length}`);

    const requestBody = {
      languageId: testCase.languageId,
      content: testCase.content,
      voiceId: testCase.voiceId,
      voiceSource: testCase.voiceSource,
      voiceClone: 0,
    };

    console.log(`請求體:`, JSON.stringify(requestBody));

    try {
      const startTime = Date.now();
      
      const response = await fetch(KREADO_TTS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "apiToken": KREADO_API_KEY,
        },
        body: JSON.stringify(requestBody),
      });

      const responseTime = Date.now() - startTime;
      console.log(`HTTP 狀態: ${response.status} (${responseTime}ms)`);

      if (!response.ok) {
        const errorText = await response.text();
        console.log(`❌ 錯誤: ${errorText}`);
        continue;
      }

      const data = await response.json();
      console.log(`API 響應碼: ${data.code}`);
      console.log(`API 消息: ${data.message}`);

      if (data.code === "200" && data.data?.textToSpeech) {
        const tts = data.data.textToSpeech;
        console.log(`✅ 音頻 URL: ${tts.audioUrl?.substring(0, 80)}...`);
        console.log(`✅ 時長: ${tts.duration}秒 (${tts.durationMs}ms)`);
        
        // 計算預期時長
        const expectedMinSeconds = testCase.content.length / 5;
        console.log(`預期最小時長: ${expectedMinSeconds.toFixed(1)}秒`);
        
        if (tts.duration < expectedMinSeconds * 0.5) {
          console.log(`⚠️ 警告: 時長異常！實際 ${tts.duration}秒 < 預期 ${expectedMinSeconds.toFixed(1)}秒 的一半`);
        }
        
        // 下載音頻並檢查實際大小
        try {
          const audioResponse = await fetch(tts.audioUrl);
          const audioBuffer = await audioResponse.arrayBuffer();
          console.log(`音頻文件大小: ${audioBuffer.byteLength} bytes (${(audioBuffer.byteLength / 1024).toFixed(2)} KB)`);
        } catch (e) {
          console.log(`無法下載音頻: ${e}`);
        }
      } else {
        console.log(`❌ 無效響應:`, JSON.stringify(data));
      }
    } catch (error) {
      console.log(`❌ 請求失敗:`, error);
    }
  }

  console.log("\n========================================");
  console.log("測試完成");
  console.log("========================================");
}

// 執行測試
testKreadoAPI().catch(console.error);
