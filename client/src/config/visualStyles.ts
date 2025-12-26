// 視覺風格配置
export interface VisualStyle {
  id: string;
  name: string;
  nameEn: string;
  description: string;
  prompt: string; // Midjourney 提示詞後綴
  previewImage: string; // 預覽圖片 URL
  category: "realistic" | "animation" | "artistic" | "stylized";
  icon?: string; // 風格圖標 emoji
}

// 使用 Unsplash 和其他免費圖片源作為預覽圖
export const VISUAL_STYLES: VisualStyle[] = [
  // 真實風格
  {
    id: "cinematic",
    name: "電影級真人",
    nameEn: "Cinematic Realistic",
    description: "好萊塢電影質感，逼真光影",
    prompt: "cinematic lighting, photorealistic, 8k, movie still, dramatic lighting, film grain",
    previewImage: "https://images.unsplash.com/photo-1485846234645-a62644f84728?w=400&h=225&fit=crop",
    category: "realistic",
    icon: "🎬",
  },
  {
    id: "documentary",
    name: "紀錄片風格",
    nameEn: "Documentary",
    description: "真實自然，新聞紀實感",
    prompt: "documentary style, natural lighting, authentic, candid photography, realistic",
    previewImage: "https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?w=400&h=225&fit=crop",
    category: "realistic",
    icon: "📹",
  },
  {
    id: "portrait",
    name: "人像攝影",
    nameEn: "Portrait Photography",
    description: "專業人像，柔和光線",
    prompt: "professional portrait photography, soft lighting, shallow depth of field, studio quality",
    previewImage: "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=400&h=225&fit=crop",
    category: "realistic",
    icon: "📷",
  },

  // 動畫風格
  {
    id: "disney-pixar",
    name: "迪士尼/皮克斯",
    nameEn: "Disney Pixar",
    description: "3D 動畫，溫馨可愛",
    prompt: "Disney Pixar style, 3D animated, cute characters, warm lighting, family friendly",
    previewImage: "https://images.unsplash.com/photo-1608889825103-eb5ed706fc64?w=400&h=225&fit=crop",
    category: "animation",
    icon: "🏰",
  },
  {
    id: "anime",
    name: "日式動漫",
    nameEn: "Japanese Anime",
    description: "二次元動漫風格",
    prompt: "anime style, Japanese animation, vibrant colors, detailed eyes, manga aesthetic",
    previewImage: "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=400&h=225&fit=crop",
    category: "animation",
    icon: "🎌",
  },
  {
    id: "ghibli",
    name: "吉卜力風格",
    nameEn: "Studio Ghibli",
    description: "宮崎駿風格，夢幻溫暖",
    prompt: "Studio Ghibli style, Hayao Miyazaki, hand-drawn animation, whimsical, pastoral scenery",
    previewImage: "https://images.unsplash.com/photo-1513836279014-a89f7a76ae86?w=400&h=225&fit=crop",
    category: "animation",
    icon: "🌿",
  },
  {
    id: "cartoon",
    name: "美式卡通",
    nameEn: "American Cartoon",
    description: "簡潔線條，趣味誇張",
    prompt: "cartoon style, bold outlines, vibrant colors, exaggerated expressions, fun",
    previewImage: "https://images.unsplash.com/photo-1569003339405-ea396a5a8a90?w=400&h=225&fit=crop",
    category: "animation",
    icon: "🎨",
  },
  {
    id: "chibi",
    name: "Q版可愛",
    nameEn: "Chibi Cute",
    description: "大頭小身，超萌風格",
    prompt: "chibi style, cute, big head small body, kawaii, adorable characters",
    previewImage: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=225&fit=crop",
    category: "animation",
    icon: "🥰",
  },

  // 藝術風格
  {
    id: "watercolor",
    name: "水彩插畫",
    nameEn: "Watercolor",
    description: "柔和水彩，藝術質感",
    prompt: "watercolor painting, soft colors, artistic, hand-painted, delicate brushstrokes",
    previewImage: "https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?w=400&h=225&fit=crop",
    category: "artistic",
    icon: "🎨",
  },
  {
    id: "oil-painting",
    name: "油畫風格",
    nameEn: "Oil Painting",
    description: "經典油畫，厚重質感",
    prompt: "oil painting style, classical art, rich textures, masterpiece, museum quality",
    previewImage: "https://images.unsplash.com/photo-1578301978693-85fa9c0320b9?w=400&h=225&fit=crop",
    category: "artistic",
    icon: "🖼️",
  },
  {
    id: "storybook",
    name: "繪本插畫",
    nameEn: "Storybook Illustration",
    description: "兒童繪本，溫馨童趣",
    prompt: "children's book illustration, storybook style, whimsical, warm colors, charming",
    previewImage: "https://images.unsplash.com/photo-1512820790803-83ca734da794?w=400&h=225&fit=crop",
    category: "artistic",
    icon: "📚",
  },
  {
    id: "ink-wash",
    name: "水墨畫風",
    nameEn: "Chinese Ink Wash",
    description: "中國水墨，意境深遠",
    prompt: "Chinese ink wash painting, traditional Asian art, minimalist, elegant, zen aesthetic",
    previewImage: "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=400&h=225&fit=crop",
    category: "artistic",
    icon: "🏯",
  },
  {
    id: "comic",
    name: "漫畫風格",
    nameEn: "Comic Book",
    description: "美漫風格，強烈對比",
    prompt: "comic book style, bold lines, halftone dots, dynamic poses, superhero aesthetic",
    previewImage: "https://images.unsplash.com/photo-1612036782180-6f0b6cd846fe?w=400&h=225&fit=crop",
    category: "artistic",
    icon: "💥",
  },

  // 特殊風格
  {
    id: "cyberpunk",
    name: "賽博朋克",
    nameEn: "Cyberpunk",
    description: "霓虹科幻，未來都市",
    prompt: "cyberpunk style, neon lights, futuristic, dystopian, high tech low life, blade runner",
    previewImage: "https://images.unsplash.com/photo-1515705576963-95cad62945b6?w=400&h=225&fit=crop",
    category: "stylized",
    icon: "🌃",
  },
  {
    id: "fantasy",
    name: "奇幻史詩",
    nameEn: "Epic Fantasy",
    description: "魔幻世界，史詩場景",
    prompt: "epic fantasy style, magical, mythical creatures, dramatic landscapes, lord of the rings",
    previewImage: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=400&h=225&fit=crop",
    category: "stylized",
    icon: "🐉",
  },
  {
    id: "retro",
    name: "復古懷舊",
    nameEn: "Vintage Retro",
    description: "80/90 年代復古風",
    prompt: "retro vintage style, 80s 90s aesthetic, nostalgic, film photography, warm tones",
    previewImage: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=225&fit=crop",
    category: "stylized",
    icon: "📼",
  },
  {
    id: "minimalist",
    name: "極簡主義",
    nameEn: "Minimalist",
    description: "簡約設計，留白美學",
    prompt: "minimalist style, clean design, simple shapes, negative space, modern aesthetic",
    previewImage: "https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?w=400&h=225&fit=crop",
    category: "stylized",
    icon: "⬜",
  },
  {
    id: "steampunk",
    name: "蒸汽朋克",
    nameEn: "Steampunk",
    description: "維多利亞機械美學",
    prompt: "steampunk style, Victorian era, brass and copper, gears and cogs, industrial aesthetic",
    previewImage: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=400&h=225&fit=crop",
    category: "stylized",
    icon: "⚙️",
  },
  {
    id: "horror",
    name: "恐怖驚悚",
    nameEn: "Horror",
    description: "黑暗恐怖，驚悚氛圍",
    prompt: "horror style, dark atmosphere, creepy, eerie lighting, suspenseful",
    previewImage: "https://images.unsplash.com/photo-1509248961895-b886fea5c38e?w=400&h=225&fit=crop",
    category: "stylized",
    icon: "👻",
  },
  {
    id: "romantic",
    name: "浪漫唯美",
    nameEn: "Romantic",
    description: "柔美夢幻，浪漫氛圍",
    prompt: "romantic style, soft lighting, dreamy atmosphere, pastel colors, ethereal",
    previewImage: "https://images.unsplash.com/photo-1518621736915-f3b1c41bfd00?w=400&h=225&fit=crop",
    category: "stylized",
    icon: "💕",
  },
  {
    id: "scifi",
    name: "科幻未來",
    nameEn: "Sci-Fi",
    description: "太空科技，未來世界",
    prompt: "science fiction style, futuristic technology, space, advanced civilization",
    previewImage: "https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=400&h=225&fit=crop",
    category: "stylized",
    icon: "🚀",
  },
  {
    id: "pixel-art",
    name: "像素藝術",
    nameEn: "Pixel Art",
    description: "復古遊戲，像素風格",
    prompt: "pixel art style, 8-bit, retro game aesthetic, pixelated",
    previewImage: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=400&h=225&fit=crop",
    category: "stylized",
    icon: "👾",
  },
];

// 風格分類
export const STYLE_CATEGORIES = {
  realistic: { name: "真實風格", icon: "📷" },
  animation: { name: "動畫風格", icon: "🎬" },
  artistic: { name: "藝術風格", icon: "🎨" },
  stylized: { name: "特殊風格", icon: "✨" },
};

// 獲取風格的完整提示詞
export function getStylePrompt(styleId: string): string {
  const style = VISUAL_STYLES.find(s => s.id === styleId);
  return style?.prompt || "";
}

// 根據分類獲取風格
export function getStylesByCategory(category: string): VisualStyle[] {
  return VISUAL_STYLES.filter(s => s.category === category);
}
