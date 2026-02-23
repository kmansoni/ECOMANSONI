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
  const rpc = supabase.rpc as unknown as (
    fn: "upsert_device_token",
    args: {
      p_device_id: string;
      p_platform: "ios" | "android" | "web";
      p_provider: "apns" | "fcm";
      p_token: string;
      p_app_build: number | null;
      p_app_version: string | null;
      p_locale: string | null;
      p_timezone: string | null;
    }
  ) => Promise<{ error: { message: string } | null }>;

  const { error } = await rpc("upsert_device_token", {
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
