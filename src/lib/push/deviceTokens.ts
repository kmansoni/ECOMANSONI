import { supabase } from "@/lib/supabase";

export interface UpsertDeviceTokenInput {
  deviceId: string;
  platform: "ios" | "android" | "web";
  provider: "apns" | "fcm";
  token: string;
  appBuild?: number;
  appVersion?: string;
  locale?: string;
  timezone?: string;
}

export async function upsertDeviceToken(input: UpsertDeviceTokenInput): Promise<void> {
  const { error } = await supabase.rpc("upsert_device_token", {
    p_device_id: input.deviceId,
    p_platform: input.platform,
    p_provider: input.provider,
    p_token: input.token,
    p_app_build: input.appBuild ?? null,
    p_app_version: input.appVersion ?? null,
    p_locale: input.locale ?? null,
    p_timezone: input.timezone ?? null,
  });
  if (error) {
    throw new Error(`Failed to upsert device token: ${error.message}`);
  }
}
