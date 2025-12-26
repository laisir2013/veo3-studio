// KreadoAI TTS 服務
// API 文檔: https://janzlz0n1f.feishu.cn/docx/GD2MdBK9ao8jRzxStVvcKMq1nMd

import { KREADO_CONFIG, type VoiceLanguage } from "./videoConfig";

// KreadoAI TTS API 端點
const KREADO_TTS_URL = "https://api.kreadoai.com/apis/open/voice/v3/textToSpeech";
const KREADO_VOICE_LIST_URL = "https://api.kreadoai.com/apis/open/voice/v3/getVoiceList";

// 語言配置映射（使用正確的 languageId）
const LANGUAGE_CONFIG: Record<VoiceLanguage, { languageId: string; voiceSource: number; defaultVoiceId: string }> = {
  cantonese: {
    languageId: "1767068435675340826", // 粵語
    voiceSource: 5, // MiniMax
    defaultVoiceId: "ai_000046", // 書聲儒雅
  },
  mandarin: {
    languageId: "1767068435675340832", // 普通話
    voiceSource: 4, // 字節
    defaultVoiceId: "zh_male_jingqiangkanye_moon_bigtts",
  },
  english: {
    languageId: "1767068435553706002", // English (UK)
    voiceSource: 21, // ElevenLabs
    defaultVoiceId: "1BUhH8aaMvGMUdGAmWVM", // Alyx - Vibrant British Male
  },
  clone: {
    languageId: "1767068435675340826", // 克隆聲音使用粵語 languageId
    voiceSource: 5, // MiniMax
    defaultVoiceId: "Minimax919724_52965111962639", // PO 克隆聲音
  },
};

// KreadoAI 配音員映射（將我們的配音員 ID 映射到 KreadoAI voiceId）
// 完整版本：包含所有可用的配音員
const VOICE_ACTOR_MAPPING: Record<string, { voiceId: string; voiceSource: number }> = {
  // ============================================
  // 粵語配音員 (MiniMax voiceSource: 5)
  // ============================================
  
  // 基礎配音員（原有）
  "cantonese-male-narrator": { voiceId: "ai_000046", voiceSource: 5 }, // 書聲儒雅
  "cantonese-male-young": { voiceId: "ai_charming_m_01", voiceSource: 5 }, // 磁性男聲
  "cantonese-male-mature": { voiceId: "ai_000141", voiceSource: 5 }, // 成熟男聲
  "cantonese-female-narrator": { voiceId: "ai_charming_f_01", voiceSource: 5 }, // 灵韵
  "cantonese-female-young": { voiceId: "ai_charming_f_22", voiceSource: 5 }, // 灵音姬
  "cantonese-female-mature": { voiceId: "ai_charming_f_23", voiceSource: 5 }, // 灵汐
  
  // 擴充粵語男聲
  "cantonese-male-deep": { voiceId: "ai_charming_m_05", voiceSource: 5 }, // 沉稳男
  "cantonese-male-energetic": { voiceId: "ai_chongyun", voiceSource: 5 }, // 云逸
  "cantonese-male-elegant": { voiceId: "ai_diluke", voiceSource: 5 }, // 迪曜
  "cantonese-male-dj": { voiceId: "ai_dj_m_01", voiceSource: 5 }, // 音韵俊朗
  "cantonese-male-boy": { voiceId: "ai_bili_712", voiceSource: 5 }, // 中二君
  "cantonese-male-scholar": { voiceId: "ai_baodewen4_712", voiceSource: 5 }, // 博文
  "cantonese-male-hero": { voiceId: "ai_kaiya", voiceSource: 5 }, // 凯夜
  "cantonese-male-cold": { voiceId: "ai_lilianhua_712", voiceSource: 5 }, // 冷傲青锋
  "cantonese-male-dragon": { voiceId: "ai_longxiao_712", voiceSource: 5 }, // 龙啸威声
  "cantonese-male-sunny": { voiceId: "ai_jianshenjiaolian_712", voiceSource: 5 }, // 阳光健翔
  
  // 擴充粵語女聲
  "cantonese-female-sweet": { voiceId: "ai_charming_f_24", voiceSource: 5 }, // 灵音妹
  "cantonese-female-wise": { voiceId: "ai_charming_f_25", voiceSource: 5 }, // 知薇
  "cantonese-female-dj": { voiceId: "ai_dj_f_01", voiceSource: 5 }, // 星澜
  "cantonese-female-elegant2": { voiceId: "ai_dj_f_02", voiceSource: 5 }, // 音韵霓裳
  "cantonese-female-fairy": { voiceId: "ai_ganyu", voiceSource: 5 }, // 甘霓
  "cantonese-female-cute": { voiceId: "ai_hutao", voiceSource: 5 }, // 胡桃音姬
  "cantonese-female-clear": { voiceId: "ai_keqing", voiceSource: 5 }, // 清音姬
  "cantonese-female-loli": { voiceId: "ai_keli", voiceSource: 5 }, // 可丽音
  "cantonese-female-assistant": { voiceId: "ai_jingling", voiceSource: 5 }, // 晶灵助手
  "cantonese-female-teacher": { voiceId: "ai_jiaodaozhuren_712", voiceSource: 5 }, // 教导严音
  "cantonese-female-gentle": { voiceId: "ai_lisha", voiceSource: 5 }, // 璃纱
  "cantonese-female-ice": { voiceId: "ai_bingjiaoxuemei_712", voiceSource: 5 }, // 冰娇梦音
  "cantonese-female-proud": { voiceId: "ai_heqifang_712", voiceSource: 5 }, // 傲娇芳
  "cantonese-female-breeze": { voiceId: "ai_enina_712", voiceSource: 5 }, // 轻声清岚
  "cantonese-female-morning": { voiceId: "ai_chenguilu_712", voiceSource: 5 }, // 晨曦露
  
  // 粵語特殊角色
  "cantonese-child-boy": { voiceId: "ai_jinsihou_712", voiceSource: 5 }, // 金小猴
  "cantonese-child-girl": { voiceId: "ai_charming_f_22", voiceSource: 5 }, // 甘霓女童
  "cantonese-child-cute": { voiceId: "ai_jinsihou_712", voiceSource: 5 }, // 萌娃童音
  "cantonese-elder-male": { voiceId: "ai_laoguowang_712", voiceSource: 5 }, // 老国声
  "cantonese-elder-female": { voiceId: "ai_her_06", voiceSource: 5 }, // 魏绍兰
  
  // ============================================
  // 普通話配音員 (字節 voiceSource: 4)
  // ============================================
  
  // 基礎配音員（原有）
  "mandarin-male-narrator": { voiceId: "zh_male_jingqiangkanye_moon_bigtts", voiceSource: 4 }, // 京腔侃爷
  "mandarin-male-young": { voiceId: "zh_male_yangguangqingnian_moon_bigtts", voiceSource: 4 }, // 阳光青年
  "mandarin-male-mature": { voiceId: "zh_male_yuanboxiaoshu_moon_bigtts", voiceSource: 4 }, // 渊博小叔
  "mandarin-female-narrator": { voiceId: "zh_female_shuangkuaisisi_moon_bigtts", voiceSource: 4 }, // 爽快思思
  "mandarin-female-young": { voiceId: "zh_female_linjianvhai_moon_bigtts", voiceSource: 4 }, // 邻家女孩
  "mandarin-female-mature": { voiceId: "zh_female_gaolengyujie_moon_bigtts", voiceSource: 4 }, // 高冷御姐
  
  // 擴充普通話男聲
  "mandarin-male-warm": { voiceId: "zh_male_wennuanahu_moon_bigtts", voiceSource: 4 }, // 温暖阿虎
  "mandarin-male-arrogant": { voiceId: "zh_male_aojiaobazong_moon_bigtts", voiceSource: 4 }, // 傲娇霸总
  "mandarin-male-teen": { voiceId: "zh_male_shaonianzixin_moon_bigtts", voiceSource: 4 }, // 少年梓辛
  "mandarin-male-news": { voiceId: "BV012_streaming", voiceSource: 4 }, // 新闻男声
  "mandarin-male-magnetic": { voiceId: "BV006_streaming", voiceSource: 4 }, // 磁性男声
  "mandarin-male-gentle": { voiceId: "BV033_streaming", voiceSource: 4 }, // 温柔小哥
  "mandarin-male-cheerful": { voiceId: "BV004_streaming", voiceSource: 4 }, // 开朗青年
  "mandarin-male-elegant": { voiceId: "BV102_streaming", voiceSource: 4 }, // 儒雅青年
  "mandarin-male-simple": { voiceId: "BV100_streaming", voiceSource: 4 }, // 质朴青年
  "mandarin-male-boss": { voiceId: "BV107_streaming", voiceSource: 4 }, // 霸气青叔
  "mandarin-male-sunny2": { voiceId: "BV056_streaming", voiceSource: 4 }, // 阳光男声
  "mandarin-male-promo": { voiceId: "BV401_streaming", voiceSource: 4 }, // 促销男声
  "mandarin-male-commentary": { voiceId: "BV410_streaming", voiceSource: 4 }, // 活力解说男
  "mandarin-male-steady": { voiceId: "BV142_streaming", voiceSource: 4 }, // 沉稳解说男
  "mandarin-male-handsome": { voiceId: "BV411_streaming", voiceSource: 4 }, // 解说小帅
  "mandarin-male-emotional": { voiceId: "BV437_streaming", voiceSource: 4 }, // 情感小帅
  "mandarin-male-casual": { voiceId: "BV143_streaming", voiceSource: 4 }, // 潇洒青年
  "mandarin-male-rebel": { voiceId: "BV120_streaming", voiceSource: 4 }, // 反卷青年
  "mandarin-male-noble": { voiceId: "BV119_streaming", voiceSource: 4 }, // 通用赘婿
  "mandarin-male-dandy": { voiceId: "BV159_streaming", voiceSource: 4 }, // 纨绔青年
  "mandarin-male-crosstalk": { voiceId: "BV212_streaming", voiceSource: 4 }, // 相声演员
  "mandarin-male-chongqing": { voiceId: "BV019_streaming", voiceSource: 4 }, // 重庆小伙
  "mandarin-male-farmer": { voiceId: "BV214_streaming", voiceSource: 4 }, // 乡村企业家
  
  // 擴充普通話女聲
  "mandarin-female-taiwan": { voiceId: "zh_female_wanwanxiaohe_moon_bigtts", voiceSource: 4 }, // 湾湾小何
  "mandarin-female-cancan": { voiceId: "BV700_streaming", voiceSource: 4 }, // 灿灿
  "mandarin-female-zizi": { voiceId: "BV406_streaming", voiceSource: 4 }, // 梓梓
  "mandarin-female-ranran": { voiceId: "BV407_streaming", voiceSource: 4 }, // 燃燃
  "mandarin-female-weiwei": { voiceId: "BV001_streaming", voiceSource: 4 }, // 薇薇
  "mandarin-female-news": { voiceId: "BV011_streaming", voiceSource: 4 }, // 新闻女声
  "mandarin-female-intellectual": { voiceId: "BV009_streaming", voiceSource: 4 }, // 知性女声
  "mandarin-female-friendly": { voiceId: "BV007_streaming", voiceSource: 4 }, // 亲切女声
  "mandarin-female-gentle": { voiceId: "BV104_streaming", voiceSource: 4 }, // 温柔淑女
  "mandarin-female-sweet": { voiceId: "BV113_streaming", voiceSource: 4 }, // 甜宠少御
  "mandarin-female-ancient": { voiceId: "BV115_streaming", voiceSource: 4 }, // 古风少御
  "mandarin-female-lively": { voiceId: "BV005_streaming", voiceSource: 4 }, // 活泼女声
  "mandarin-female-promo": { voiceId: "BV402_streaming", voiceSource: 4 }, // 促销女声
  "mandarin-female-movie": { voiceId: "BV412_streaming", voiceSource: 4 }, // 影视小美
  "mandarin-female-anchor": { voiceId: "BV418_streaming", voiceSource: 4 }, // 直播一姐
  "mandarin-female-literary": { voiceId: "BV428_streaming", voiceSource: 4 }, // 文艺女声
  "mandarin-female-chicken": { voiceId: "BV403_streaming", voiceSource: 4 }, // 鸡汤女声
  "mandarin-female-sister": { voiceId: "BV034_streaming", voiceSource: 4 }, // 知性姐姐
  "mandarin-female-xiaoyuan": { voiceId: "BV405_streaming", voiceSource: 4 }, // 甜美小源
  "mandarin-female-shanghai": { voiceId: "BV217_streaming", voiceSource: 4 }, // 沪上阿姐
  "mandarin-female-sichuan": { voiceId: "BV221_streaming", voiceSource: 4 }, // 四川甜妹儿
  "mandarin-female-chongqing": { voiceId: "BV423_streaming", voiceSource: 4 }, // 重庆幺妹儿
  "mandarin-female-changsha": { voiceId: "BV216_streaming", voiceSource: 4 }, // 长沙靓女
  "mandarin-female-hunan": { voiceId: "BV226_streaming", voiceSource: 4 }, // 湖南妹坨
  
  // 普通話特殊角色
  "mandarin-child-girl": { voiceId: "BV064_streaming", voiceSource: 4 }, // 小萝莉
  "mandarin-child-boy": { voiceId: "BV051_streaming", voiceSource: 4 }, // 奶气萌娃
  "mandarin-child-genius": { voiceId: "BV061_streaming", voiceSource: 4 }, // 天才童声
  "mandarin-child-tongtong": { voiceId: "BV415_streaming", voiceSource: 4 }, // 童童
  "mandarin-child-chengcheng": { voiceId: "BV419_streaming", voiceSource: 4 }, // 诚诚
  "mandarin-elder-male": { voiceId: "BV158_streaming", voiceSource: 4 }, // 智慧老者
  "mandarin-elder-female": { voiceId: "BV157_streaming", voiceSource: 4 }, // 慈爱姥姥
  "mandarin-cartoon-sponge": { voiceId: "BV063_streaming", voiceSource: 4 }, // 动漫海绵
  "mandarin-cartoon-star": { voiceId: "BV417_streaming", voiceSource: 4 }, // 动漫海星
  "mandarin-cartoon-shin": { voiceId: "BV050_streaming", voiceSource: 4 }, // 动漫小新
  "mandarin-cartoon-sheep": { voiceId: "BV426_streaming", voiceSource: 4 }, // 懒小羊
  "mandarin-rap": { voiceId: "BR001_streaming", voiceSource: 4 }, // 说唱小哥
  "mandarin-dub": { voiceId: "BV408_streaming", voiceSource: 4 }, // 译制片男声
  
  // ============================================
  // 英語配音員 (ElevenLabs voiceSource: 21)
  // ============================================
  
  // 基礎配音員（原有）
  "english-male-narrator": { voiceId: "1BUhH8aaMvGMUdGAmWVM", voiceSource: 21 }, // Alyx - Vibrant British Male
  "english-male-young": { voiceId: "8JVbfL6oEdmuxKn5DK2C", voiceSource: 21 }, // Johnny Kid - Serious
  "english-male-mature": { voiceId: "G17SuINrv2H9FC6nvetn", voiceSource: 21 }, // Christopher
  "english-female-narrator": { voiceId: "19STyYD15bswVz51nqLf", voiceSource: 21 }, // Samara X
  "english-female-young": { voiceId: "ZF6FPAbjXT4488VcRRnw", voiceSource: 21 }, // Amelia
  "english-female-mature": { voiceId: "O4fnkotIypvedJqBp4yb", voiceSource: 21 }, // Alexis Lancaster
  
  // 擴充英語男聲
  "english-male-adam": { voiceId: "NFG5qt843uXKj4pFvR7C", voiceSource: 21 }, // Adam Stone - late night radio
  "english-male-russell": { voiceId: "NYC9WEgkq1u4jiqBseQ9", voiceSource: 21 }, // Russell - Dramatic British TV
  "english-male-alexander": { voiceId: "mZ8K1MPRiT5wDQaasg3i", voiceSource: 21 }, // Alexander Kensington
  "english-male-jeremy": { voiceId: "bVMeCyTHy58xNoL34h3p", voiceSource: 21 }, // Jeremy
  "english-male-aaran": { voiceId: "CZ1JCWXlwX5dmHx0XdiL", voiceSource: 21 }, // Aaran
  "english-male-archer": { voiceId: "L0Dsvb3SLTyegXwtm47J", voiceSource: 21 }, // Archer
  "english-male-nathaniel": { voiceId: "lnIpQcZuikKim3oNdYlP", voiceSource: 21 }, // Nathaniel C. - Customer Care
  
  // 擴充英語女聲
  "english-female-elli": { voiceId: "MF3mGyEYCl7XYWbV9V6O", voiceSource: 21 }, // Elli
  "english-female-dorothy": { voiceId: "ThT5KcBeYPX3keUQqHPh", voiceSource: 21 }, // Dorothy
  "english-female-serena": { voiceId: "pMsXgVXv3BLzUgSXRplE", voiceSource: 21 }, // Serena
  "english-female-jessi": { voiceId: "09AoN6tYyW3VSTQqCo7C", voiceSource: 21 }, // Jessi
  "english-female-allison": { voiceId: "Se2Vw1WbHmGbBbyWTuu4", voiceSource: 21 }, // Allison - British accent
  "english-female-liberty": { voiceId: "iBo5PWT1qLiEyqhM7TrG", voiceSource: 21 }, // Liberty X
  "english-female-shelby": { voiceId: "rfkTsdZrVWEVhDycUYn9", voiceSource: 21 }, // Shelby
  
  // 英語童聲
  "english-child-boy": { voiceId: "8JVbfL6oEdmuxKn5DK2C", voiceSource: 21 }, // Tommy Boy
  "english-child-girl": { voiceId: "09AoN6tYyW3VSTQqCo7C", voiceSource: 21 }, // Lily Girl
  
  // ============================================
  // 克隆聲音 (Clone Voices)
  // ============================================
  "clone-po": { voiceId: "Minimax919724_52965111962639", voiceSource: 5 }, // PO 克隆聲音 - 粵語
  "cantonese-po-clone": { voiceId: "Minimax919724_52965111962639", voiceSource: 5 }, // PO 克隆語音 - 粵語 (別名)
  "po-clone": { voiceId: "Minimax919724_52965111962639", voiceSource: 5 }, // PO 克隆語音 (別名)
  
  // ============================================
  // 向後兼容映射（舊版配音員 ID）
  // ============================================
  "male-narrator": { voiceId: "ai_000046", voiceSource: 5 },
  "male-young": { voiceId: "ai_charming_m_01", voiceSource: 5 },
  "male-mature": { voiceId: "ai_000141", voiceSource: 5 },
  "male-deep": { voiceId: "ai_charming_m_05", voiceSource: 5 },
  "female-narrator": { voiceId: "ai_charming_f_01", voiceSource: 5 },
  "female-young": { voiceId: "ai_charming_f_22", voiceSource: 5 },
  "female-mature": { voiceId: "ai_charming_f_23", voiceSource: 5 },
  "female-sweet": { voiceId: "ai_charming_f_24", voiceSource: 5 },
  "child-boy": { voiceId: "ai_jinsihou_712", voiceSource: 5 },
  "child-girl": { voiceId: "BV064_streaming", voiceSource: 4 },
  "elderly-male": { voiceId: "ai_laoguowang_712", voiceSource: 5 },
  "elderly-female": { voiceId: "BV157_streaming", voiceSource: 4 },
};

// 導出配音員映射供其他模組使用
export { VOICE_ACTOR_MAPPING };

interface KreadoTTSResponse {
  code: string;
  message: string;
  data: {
    taskId: string;
    textToSpeech: {
      fileId: number;
      duration: number;
      audioUrl: string;
      paymentMoney: string;
      durationMs?: number;
    };
  };
  requestId: string;
}

/**
 * 使用 KreadoAI TTS API 生成語音
 * @param content 要轉換的文字內容
 * @param voiceActorId 配音員 ID（如 "cantonese-male-narrator"）
 * @param language 語言（cantonese, mandarin, english）
 * @returns 音頻 URL
 */
export async function generateSpeechWithKreado(
  content: string,
  voiceActorId: string,
  language: VoiceLanguage = "cantonese"
): Promise<{ audioUrl: string; duration: number }> {
  const langConfig = LANGUAGE_CONFIG[language];
  const voiceMapping = VOICE_ACTOR_MAPPING[voiceActorId];
  
  // 使用配音員映射或默認配置
  let voiceId: string;
  let voiceSource: number;
  
  if (voiceMapping) {
    // 如果在映射表中找到，使用映射的配置
    voiceId = voiceMapping.voiceId;
    voiceSource = voiceMapping.voiceSource;
    console.log(`[KreadoAI TTS] 使用映射配音員: ${voiceActorId} -> ${voiceId}`);
  } else {
    // 檢查是否是 KreadoAI 原生 voiceId 格式
    const isMinimaxVoice = voiceActorId && voiceActorId.startsWith('Minimax');
    const isAiVoice = voiceActorId && voiceActorId.startsWith('ai_');
    const isBvVoice = voiceActorId && voiceActorId.startsWith('BV');
    const isElevenLabsVoice = voiceActorId && /^[a-zA-Z0-9]{20,}$/.test(voiceActorId);
    
    if (isMinimaxVoice || isAiVoice || isBvVoice || isElevenLabsVoice) {
      // 直接使用原生 voiceId
      voiceId = voiceActorId;
      // 根據 voiceId 格式推斷 voiceSource
      if (isMinimaxVoice) {
        voiceSource = 5; // MiniMax
      } else if (isAiVoice) {
        voiceSource = 5; // MiniMax
      } else if (isBvVoice) {
        voiceSource = 4; // ByteDance
      } else {
        voiceSource = 21; // ElevenLabs
      }
      console.log(`[KreadoAI TTS] 使用原生 voiceId: ${voiceId}, voiceSource: ${voiceSource}`);
    } else {
      // 使用語言默認配置
      voiceId = langConfig.defaultVoiceId;
      voiceSource = langConfig.voiceSource;
      console.log(`[KreadoAI TTS] 未找到映射，使用默認: ${voiceActorId} -> ${voiceId}`);
    }
  }
  
  console.log(`[KreadoAI TTS] 生成語音: language=${language}, voiceId=${voiceId}, voiceSource=${voiceSource}`);
  console.log(`[KreadoAI TTS] 文字內容: ${content.substring(0, 50)}...`);
  
  const requestBody = {
    languageId: langConfig.languageId,
    content: content,
    voiceId: voiceId,
    voiceSource: voiceSource,
    voiceClone: 0,
  };
  
  try {
    const response = await fetch(KREADO_TTS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apiToken": KREADO_CONFIG.apiKey,
      },
      body: JSON.stringify(requestBody),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`KreadoAI TTS API 調用失敗: ${response.status} - ${errorText}`);
    }
    
    const data: KreadoTTSResponse = await response.json();
    
    if (data.code !== "200") {
      throw new Error(`KreadoAI TTS 錯誤: ${data.message}`);
    }
    
    console.log(`[KreadoAI TTS] 成功生成語音: ${data.data.textToSpeech.audioUrl}`);
    console.log(`[KreadoAI TTS] 時長: ${data.data.textToSpeech.duration}秒, 消耗: ${data.data.textToSpeech.paymentMoney}點`);
    
    return {
      audioUrl: data.data.textToSpeech.audioUrl,
      duration: data.data.textToSpeech.duration,
    };
  } catch (error) {
    console.error("[KreadoAI TTS] 錯誤:", error);
    throw error;
  }
}

/**
 * 獲取 KreadoAI 語音列表
 */
export async function getKreadoVoiceList(
  language: string = "Chinese",
  voiceSource: number = 5,
  pageIndex: number = 1,
  pageSize: number = 50
): Promise<any[]> {
  try {
    const response = await fetch(KREADO_VOICE_LIST_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apiToken": KREADO_CONFIG.apiKey,
      },
      body: JSON.stringify({
        pageIndex,
        pageSize,
        language,
        voiceClone: 0,
        voiceSource,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`獲取語音列表失敗: ${response.status}`);
    }
    
    const data = await response.json();
    return data.data?.data || [];
  } catch (error) {
    console.error("[KreadoAI] 獲取語音列表錯誤:", error);
    return [];
  }
}

/**
 * 獲取所有可用的配音員 ID 列表
 */
export function getAvailableVoiceActorIds(): string[] {
  return Object.keys(VOICE_ACTOR_MAPPING);
}

/**
 * 檢查配音員 ID 是否有效
 */
export function isValidVoiceActorId(voiceActorId: string): boolean {
  return voiceActorId in VOICE_ACTOR_MAPPING;
}
