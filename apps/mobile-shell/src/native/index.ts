export * from "./push";
export * from "./deeplink";
export * from "./callkit";
export * from "./connectionService";

export const GEOLOCATION_KEY_MOCK = 'MOCK_AMAP_KEY';
export const ANDROID_KEY_PLACEHOLDER = 'your-android-amap-key';
export const IOS_KEY_PLACEHOLDER = 'your-ios-amap-key';

export function getAmapKey(platform: 'android' | 'ios'): string {
  const env = (typeof import.meta !== 'undefined' && (import.meta as any).env) || {};
  if (platform === 'android') {
    return env.VITE_AMAP_ANDROID_KEY || ANDROID_KEY_PLACEHOLDER;
  }
  return env.VITE_AMAP_IOS_KEY || IOS_KEY_PLACEHOLDER;
}