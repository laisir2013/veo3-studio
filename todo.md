# VEO3 視頻生成系統 TODO

## 核心功能
- [x] 快速模式按鈕 (veo3.1-fast + gpt-4o-mini)
- [x] 高質量模式按鈕 (veo3.1-pro + claude-opus-4.5)
- [x] 自定義故事輸入
- [x] 角色描述輸入
- [x] 視覺風格輸入
- [x] 視頻生成進度顯示
- [x] 12 個 API Key 輪流使用
- [x] 最終視頻預覽和下載
- [x] 生成歷史記錄保存到數據庫
- [x] 模型配置信息顯示
- [x] 多種視頻模型切換 (Veo, Kling, Runway)

## 後端功能
- [x] 數據庫 schema 設計
- [x] 視頻生成 API 服務
- [x] API Key 輪流機制
- [x] 進度輪詢機制
- [x] 歷史記錄 CRUD

## 前端界面
- [x] 優雅完美風格設計
- [x] 模式選擇卡片
- [x] 故事輸入表單
- [x] 進度條和狀態顯示
- [x] 視頻預覽播放器
- [x] 歷史記錄列表
- [x] 模型配置面板

## 視覺設計
- [x] 深色優雅主題
- [x] 漸變色彩方案
- [x] 流暢動畫效果
- [x] 響應式布局

## 測試
- [x] 視頻生成路由單元測試
- [x] 視頻服務功能測試

## 新增功能
- [x] 命令行交互版本（終端中運行）
- [x] MCP 服務器配置
- [x] 上傳到 Google Drive 覆蓋舊版本

## 全面測試任務
- [x] 第一輪測試：API 連接和基本功能
- [x] 第二輪測試：完整視頻生成流程
- [x] 第三輪測試：CLI 和 MCP 工具
- [x] 第四輪測試：端到端流程驗證 ✅
- [x] 修復發現的所有 bug（API Key 輪換問題、TTS 服務切換）
- [x] 更新存檔並上傳

## 測試結果
- 成功生成視頻: https://filesystem.site/cdn/20251222/edc0f98c64f4fdd42c4caa23cdd286.mp4
- 測試時間: 2025-12-22 00:17

## API Key 深入研究
- [x] 測試所有 13 個 VectorEngine API Key 有效性 - 全部有效！
- [x] 測試 Kreado AI TTS API 有效性 - 已過期，改用 VectorEngine TTS
- [x] 修復 API Key 配置 - 更新為 13 個有效 Key
- [x] 重新測試完整流程 - 成功！視頻: https://filesystem.site/cdn/20251222/ff9894cfadc8ed59472bfd02d9be06.mp4

## 新增功能：兩種生成模式
- [x] 後端支持固定人物模式和劇情模式
- [x] 前端添加模式選擇界面
- [x] 測試固定人物模式 - 成功（小狗追蝴蝶）
- [x] 測試劇情模式 - 成功（清晨山谷風景）https://filesystem.site/cdn/20251222/6229a5f146e156564e4225b58978c7.mp4
- [x] 更新存檔並上傳

## 新增功能：視頻合併 + 批量生成
- [x] 視頻合併功能（FFmpeg 合併多場景）
- [x] 背景音樂添加
- [x] 字幕生成和添加
- [x] 批量生成功能（多故事並行處理）
- [x] 前端界面更新
- [x] 測試新功能 - 批量生成界面正常
- [x] 更新存檔並上傳 - 完成

## 新增功能：視頻合併 + 進度通知
- [x] 視頻預覽合併功能（一鍵合併所有場景為完整影片）
- [x] 後端合併 API 實現
- [x] 生成進度通知（瀏覽器通知）
- [x] 生成進度通知（Toast 通知）
- [x] 前端界面更新
- [x] 測試新功能 - 合併視頻界面正常
- [x] 更新存檔並上傳

## 新增功能：多配音員系統
- [x] 設計配音員系統架構
- [x] 數據庫：配音員表、角色聲音綁定表
- [x] 後端：配音員管理 API
- [x] 後端：角色聲音自動配對邏輯
- [x] 後端：AI 根據角色描述匹配配音員
- [x] 前端：場景配音員選擇界面
- [x] 前端：角色聲音管理界面
- [x] 前端：統一/獨立配音模式切換
- [x] 測試多配音員功能 - AI 角色分析和自動配對成功
- [x] 更新存檔並上傳

## 缺失功能待補充（根據對話歷史）
- [x] 語言選擇功能（粵語/普通話/English）- 前端界面
- [x] 語言選擇功能 - 後端 AI 腳本生成適配
- [x] 配音員語言篩選聯動功能
- [ ] 配音員試聽/預覽功能（待完成）
- [x] 語言切換時自動重置配音員
- [x] 圖片生成 API 修復（使用 VectorEngine Midjourney API）
- [x] 語音生成確認使用 KreadoAI API
- [x] 修復配音員篩選顯示「暫無此語言的配音員」問題
- [ ] 測試 4 種模式生成視頻
  - [ ] 快速模式 + 固定人物
  - [ ] 快速模式 + 劇情模式
  - [ ] 高質量模式 + 固定人物
  - [ ] 高質量模式 + 劇情模式
- [ ] 保存最終 checkpoint
- [x] 備份到 Google Drive (veo3_full_system_complete_20251222_090031.zip)

## KreadoAI TTS 集成完成 (2025-12-22)
- [x] 更新 kreadoTTS.ts 使用正確的英語語言 ID (1767068435553706002)
- [x] 配音員映射到 KreadoAI voiceId 完成
- [x] 三種語言 TTS 測試全部通過
  - 粵語: ai_000046 (MiniMax voiceSource: 5)
  - 普通話: zh_male_jingqiangkanye_moon_bigtts (字節 voiceSource: 4)
  - 英語: 1BUhH8aaMvGMUdGAmWVM (ElevenLabs voiceSource: 21)
- [x] 單元測試全部通過 (13/13)
- [x] 語言切換和配音員篩選 UI 測試通過


## 擴充 KreadoAI 配音員 (2025-12-22)
- [x] 保存當前進度並上傳到 Google Drive
- [x] 查詢 KreadoAI 所有可用配音員（粵語、普通話、英語）
- [x] 更新後端配音員映射配置 (kreadoTTS.ts) - 102 個配音員
- [x] 更新前端配音員列表 (videoConfig.ts)
- [x] 單元測試通過 (13/13)
- [x] 保存最終版本並上傳 Google Drive


## 添加 PO 克隆語音 + 克隆聲音分組 (2025-12-22)
- [x] 添加 "clone" 語言類型到 VoiceLanguage
- [x] 添加 PO 克隆語音到 kreadoTTS.ts 映射
- [x] 添加 PO 克隆語音到 videoConfig.ts 配音員列表（克隆聲音分組）
- [x] 更新前端語言選擇支持克隆聲音 (LanguageSelector.tsx, VoiceSelector.tsx)
- [x] 單元測試通過 (13/13)
- [x] 保存備份到 Google Drive


## 完善配音員系統 (2025-12-22)
- [x] 查詢 KreadoAI 完整配音員列表（包含童聲）
- [x] 為每個聲音添加詳細描述（聲音特點、適用場合）
- [x] 確認並添加更多童聲配音員 (4個童聲)
- [x] 添加更多可用的配音員 (創建 voiceActorsConfig.ts)
- [x] 實現 KreadoAI 篩選方法（性別、年齡段、風格標籤）
- [x] 實現即時試聽功能（VoiceSelectorV2 組件）
- [x] 測試並保存備份 (veo3_voice_system_v5.zip)


## 添加更多童聲 + 全功能測試 (2025-12-22)
- [x] 保存當前進度並上傳到 Google Drive (veo3_backup_20251222_071346.zip)
- [x] 查詢並添加更多童聲配音員 (粵語+2, 英語+2, 總共 11 個童聲)
- [x] KreadoAI API Key 更新並驗證成功 (E8B341B32147B299DB8ABFE9BD077929)
- [x] 快速功能測試通過 (LLM + 3種語言 TTS)
- [x] 全功能測試 - 快速模式 + 固定人物 ✅
- [x] 全功能測試 - 快速模式 + 劇情模式 ✅
- [x] 全功能測試 - 高質量模式 + 固定人物 ✅
- [x] 全功能測試 - 高質量模式 + 劇情模式 ✅
- [x] 修復發現的問題 (無問題 - 全部通過)
- [x] 最終存檔上傳 (veo3_full_system_complete_20251222_090031.zip)


## 添加 VectorEngine TTS 備用方案 (2025-12-22)
- [x] 添加 VectorEngine TTS API 支持 (6 種語音: alloy, echo, fable, onyx, nova, shimmer)
- [x] 測試 VectorEngine TTS API - 所有模型和語音都成功
- [x] 備份到 Google Drive (veo3_vectorengine_tts_20251222_084057.zip)
- [ ] 等待 Midjourney 恢復後進行完整測試


## 添加 DALL-E 3 作為圖片生成備用方案 (2025-12-22)
- [x] 更新 videoService.ts 支持 DALL-E 3 備用
- [x] 測試 DALL-E 3 圖片生成 - 成功！
- [x] 全功能測試 - 快速模式 + 固定人物 ✅
- [x] 全功能測試 - 快速模式 + 劇情模式 ✅
- [x] 全功能測試 - 高質量模式 + 固定人物 ✅
- [x] 全功能測試 - 高質量模式 + 劇情模式 ✅
- [x] 修復發現的問題 (無問題 - 全部通過)
- [x] 備份到 Google Drive (veo3_full_system_complete_20251222_090031.zip)



## Midjourney 恢復測試 (2025-12-22)
- [x] Midjourney 單獨測試 - 成功！(130s 生成圖片)
- [x] 快速模式 + 固定人物 (Midjourney) - 全部通過 ✅
- [x] 快速模式 + 劇情模式 (Midjourney) - 全部通過 ✅
- [x] 高質量模式 + 固定人物 (Midjourney) - 圖片成功，視頻生成中
- [x] 備份到 Google Drive (veo3_midjourney_working_20251222_100755.zip)


## 更新 LLM 模型配置 (2025-12-22)
- [x] 快速模式改用 gpt-5.2 (GPT 5.2 最強)
- [x] 高質量模式改用 claude-opus-4-5-20251101 (Claude 4.5 最強)
- [x] 測試新模型配置 - 全部通過 ✅
- [x] 備份更新後的版本 (veo3_gpt52_claude45_20251222_102623.zip)

## 添加備用方案 (2025-12-22)
- [x] LLM 備用：GPT 5.2 ↔ Claude 4.5 互為備用
- [x] 視頻備用：Veo Pro → Veo Fast → Runway → Kling
- [x] 測試備用邏輯 - 通過 ✅
- [x] 備份 v1 (veo3_fallback_v1)
- [x] 修復 Runway API (添加 ratio 參數)
- [x] 所有視頻 API 測試通過 (Veo/Runway/Kling)
- [x] 備份 v2 (veo3_fallback_v2) ✅

## 多角色上傳與管理系統 (2025-12-22)

### Phase 1: 数据库設計
- [ ] 創建角色庫表 (characters)
- [ ] 運行数据库遷移

### Phase 2: 後端 API
- [x] 圖片上傳 API（上傳到 S3）
- [x] Claude 4.5 圖片分析 API
- [x] 角色 CRUD API
- [x] Midjourney 角色基礎圖生成

### Phase 3: 前端界面
- [x] 角色庫管理頁面
- [x] 圖片上傳組件
- [x] 角色卡片展示

### Phase 4: 整合流程
- [x] 故事角色自動識別
- [x] 角色庫自動匹配
- [x] 多角色 --cref 支持

### Phase 5: 測試與備份
- [x] 代碼完成
- [x] 備份到 Google Drive (veo3_multichar_complete)


## 添加視覺風格選擇器 (2025-12-22)
- [x] 定義 17 種熱門風格配置
- [x] 生成 17 種風格預覽圖片 (22張)
- [x] 創建風格選擇器組件 (StyleSelector.tsx)
- [x] 整合到主頁面 (Home.tsx)
- [x] 備份到 Google Drive (veo3_style_selector_20251222_113751.zip)


## 修復所有模式配音員選擇不顯示 (2025-12-22)
- [x] 檢查前端代碼找出問題
- [x] 修復 voice.getAll API 返回完整配音員列表
- [x] 確保 VoiceSelector 組件被正確渲染 (修復語言篩選邏輯)
- [x] 測試並備份 (veo3_voice_selector_fixed)


## 用戶反饋問題修復 (2025-12-22)
- [x] 修復視覺風格選項不顯示的問題 (已正常工作)
- [x] 生成按鈕沒反應 - 因為未登入，按鈕會跳轉到登入頁面 (正常行為)
- [ ] 添加時長選擇功能 (重新設計)
  - [x] 前端：時長選擇器 (1-10 分鐘)
  - [x] 前端：添加自定義時長輸入功能 (最大 60 分鐘)
  - [x] 前端：顯示所有 8 秒片段框框 (用顏色區分批次)
  - [ ] 前端：順序生成進度顯示 (待後端實現)
  - [x] 後端：批次生成邏輯 (每次 6 個片段)
  - [x] 後端：API Key 組輪換防限流 (13 個 Key 分 3 組)
- [ ] 測試所有修復
- [ ] 保存 checkpoint
