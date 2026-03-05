import { describe, expect, it } from "vitest";
import { resolveChatMediaDownloadPrefs } from "@/lib/chat/mediaSettings";

describe("chat media settings resolver", () => {
  it("prefers chat-level canonical toggle over user-level legacy values", () => {
    const result = resolveChatMediaDownloadPrefs({
      chatSettings: { auto_download_media: false },
      userSettings: {
        media_auto_download_enabled: true,
        media_auto_download_photos: true,
        media_auto_download_videos: true,
      },
      energy: { media_preload: true, autoplay_video: true },
    });

    expect(result).toEqual({
      autoDownloadPhotos: false,
      autoDownloadVideos: false,
    });
  });

  it("falls back to legacy keys when chat canonical key is missing", () => {
    const result = resolveChatMediaDownloadPrefs({
      chatSettings: { media_auto_download_enabled: true, media_auto_download_photos: true },
      userSettings: { media_auto_download_videos: false },
      energy: { media_preload: true, autoplay_video: true },
    });

    expect(result).toEqual({
      autoDownloadPhotos: true,
      autoDownloadVideos: false,
    });
  });

  it("applies energy gates to video/photo preloading", () => {
    const result = resolveChatMediaDownloadPrefs({
      chatSettings: { auto_download_media: true },
      userSettings: {
        media_auto_download_photos: true,
        media_auto_download_videos: true,
      },
      energy: { media_preload: true, autoplay_video: false },
    });

    expect(result).toEqual({
      autoDownloadPhotos: true,
      autoDownloadVideos: false,
    });
  });
});
