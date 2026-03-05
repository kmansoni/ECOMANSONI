type MaybeBoolean = boolean | null | undefined;

type ChatSettingsLike = {
  auto_download_media?: MaybeBoolean;
  media_auto_download_enabled?: MaybeBoolean;
  media_auto_download_photos?: MaybeBoolean;
  media_auto_download_videos?: MaybeBoolean;
};

type UserSettingsLike = {
  media_auto_download_enabled?: MaybeBoolean;
  media_auto_download_photos?: MaybeBoolean;
  media_auto_download_videos?: MaybeBoolean;
};

type EnergySettingsLike = {
  media_preload?: MaybeBoolean;
  autoplay_video?: MaybeBoolean;
};

function resolveBool(...values: Array<MaybeBoolean>): boolean | null {
  for (const value of values) {
    if (typeof value === "boolean") return value;
  }
  return null;
}

export function resolveChatMediaDownloadPrefs(input: {
  chatSettings?: ChatSettingsLike | null;
  userSettings?: UserSettingsLike | null;
  energy?: EnergySettingsLike | null;
}): { autoDownloadPhotos: boolean; autoDownloadVideos: boolean } {
  const chatSettings = input.chatSettings ?? null;
  const userSettings = input.userSettings ?? null;
  const energy = input.energy ?? null;

  const autoDownloadEnabled =
    resolveBool(
      chatSettings?.auto_download_media,
      chatSettings?.media_auto_download_enabled,
      userSettings?.media_auto_download_enabled,
    ) ?? true;

  const energyMediaPreload = resolveBool(energy?.media_preload) ?? true;
  const energyVideoAutoplay = resolveBool(energy?.autoplay_video) ?? true;

  const photoEnabled =
    resolveBool(
      chatSettings?.media_auto_download_photos,
      userSettings?.media_auto_download_photos,
    ) ?? true;

  const videoEnabled =
    resolveBool(
      chatSettings?.media_auto_download_videos,
      userSettings?.media_auto_download_videos,
    ) ?? true;

  return {
    autoDownloadPhotos: autoDownloadEnabled && photoEnabled && energyMediaPreload,
    autoDownloadVideos: autoDownloadEnabled && videoEnabled && energyVideoAutoplay && energyMediaPreload,
  };
}
