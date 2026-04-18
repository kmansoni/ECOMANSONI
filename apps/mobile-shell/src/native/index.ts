export * from "./push";
export * from "./deeplink";
export * from "./callkit";
export * from "./connectionService";

export const GEOLOCATION_KEY_MOCK = 'MOCK_AMAP_KEY';
export const ANDROID_KEY_PLACEHOLDER = 'your-android-amap-key';
export const IOS_KEY_PLACEHOLDER = 'your-ios-amap-key';

export function getAmapKey(platform: 'android' | 'ios'): string {
  if (platform === 'android') {
    return process.env.AMAP_ANDROID_KEY || ANDROID_KEY_PLACEHOLDER;
  }
  return process.env.AMAP_IOS_KEY || IOS_KEY_PLACEHOLDER;
}