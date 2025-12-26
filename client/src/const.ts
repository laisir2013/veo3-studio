export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Generate login URL at runtime so redirect URI reflects the current origin.
export const getLoginUrl = () => {
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;
  
  // 如果環境變量未設置，返回空字符串避免 URL 構建錯誤
  if (!oauthPortalUrl || oauthPortalUrl === 'undefined' || oauthPortalUrl === '') {
    console.warn('VITE_OAUTH_PORTAL_URL is not set - running in guest mode');
    return '';  // 返回空字符串，讓登入按鈕不執行任何操作
  }
  
  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const state = btoa(redirectUri);

  try {
    const url = new URL(`${oauthPortalUrl}/app-auth`);
    url.searchParams.set("appId", appId || '');
    url.searchParams.set("redirectUri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("type", "signIn");
    return url.toString();
  } catch (e) {
    console.error('Failed to construct login URL:', e);
    return '';
  }
};

// 檢查是否為訪客模式
export const isGuestMode = () => {
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  return !oauthPortalUrl || oauthPortalUrl === 'undefined' || oauthPortalUrl === '';
};
