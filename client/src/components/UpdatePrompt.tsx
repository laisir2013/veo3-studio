import { useEffect, useState } from 'react';

interface UpdatePromptProps {
  onUpdate: () => void;
}

export function UpdatePrompt({ onUpdate }: UpdatePromptProps) {
  const [showPrompt, setShowPrompt] = useState(false);
  const [newVersion, setNewVersion] = useState<string | null>(null);

  useEffect(() => {
    // 監聽 Service Worker 更新消息
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'SW_UPDATED') {
        console.log('[PWA] New version available:', event.data.version);
        setNewVersion(event.data.version);
        setShowPrompt(true);
      }
    };

    navigator.serviceWorker?.addEventListener('message', handleMessage);

    // 檢查是否有等待中的 Service Worker
    const checkForUpdates = async () => {
      if (!('serviceWorker' in navigator)) return;

      const registration = await navigator.serviceWorker.getRegistration();
      if (registration?.waiting) {
        console.log('[PWA] Update waiting to be installed');
        setShowPrompt(true);
      }

      // 監聯新的 Service Worker 安裝
      registration?.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('[PWA] New content available');
              setShowPrompt(true);
            }
          });
        }
      });
    };

    checkForUpdates();

    // 每 5 分鐘檢查一次更新
    const interval = setInterval(async () => {
      const registration = await navigator.serviceWorker?.getRegistration();
      registration?.update();
    }, 5 * 60 * 1000);

    return () => {
      navigator.serviceWorker?.removeEventListener('message', handleMessage);
      clearInterval(interval);
    };
  }, []);

  const handleUpdate = () => {
    // 通知 Service Worker 跳過等待
    navigator.serviceWorker?.getRegistration().then((registration) => {
      if (registration?.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
    });

    // 刷新頁面
    setShowPrompt(false);
    onUpdate();
    window.location.reload();
  };

  const handleDismiss = () => {
    setShowPrompt(false);
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50 animate-slide-up">
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl shadow-2xl p-4 text-white">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-lg">發現新版本</h3>
            <p className="text-sm text-white/80 mt-1">
              {newVersion ? `版本 ${newVersion} 已準備就緒` : '有新的更新可用'}，立即刷新以獲得最新功能！
            </p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleUpdate}
                className="px-4 py-2 bg-white text-blue-600 rounded-lg font-medium text-sm hover:bg-white/90 transition-colors"
              >
                立即更新
              </button>
              <button
                onClick={handleDismiss}
                className="px-4 py-2 bg-white/20 rounded-lg font-medium text-sm hover:bg-white/30 transition-colors"
              >
                稍後
              </button>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="flex-shrink-0 text-white/60 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

export default UpdatePrompt;
