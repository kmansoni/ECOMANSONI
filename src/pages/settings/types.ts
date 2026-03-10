/**
 * src/pages/settings/types.ts
 * Shared types for the SettingsPage sub-system.
 * All Screen values map 1-to-1 to the original SettingsPage state machine.
 */

export type Screen =
  | "main"
  | "saved"
  | "saved_all_posts"
  | "saved_liked_posts"
  | "archive"
  | "archive_stories"
  | "archive_posts"
  | "archive_live"
  | "activity"
  | "activity_likes"
  | "activity_comments"
  | "activity_reposts"
  | "notifications"
  | "calls"
  | "data_storage"
  | "privacy"
  | "privacy_blocked"
  | "security_sites"
  | "security_passcode"
  | "security_cloud_password"
  | "security_account_protection"
  | "security"
  | "security_2fa"
  | "security_sessions"
  | "appearance"
  | "energy_saver"
  | "chat_folders"
  | "chat_folder_edit"
  | "profile_status"
  | "language"
  | "accessibility"
  | "statistics"
  | "stats_recommendations"
  | "stats_overview"
  | "stats_content"
  | "stats_followers"
  | "branded_content"
  | "branded_content_authors"
  | "branded_content_requests"
  | "branded_content_info"
  | "help"
  | "close_friends"
  | "about";

export type SettingsPostItem = {
  id: string;
  content: string | null;
  created_at: string;
  likes_count: number | null;
  comments_count: number | null;
  media_url: string | null;
};

export type SettingsStoryItem = {
  id: string;
  media_url: string | null;
  created_at: string;
  archived_at: string | null;
};

export type SettingsLiveArchiveItem = {
  id: string;
  state: string;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
};

export type ActivityCommentItem = {
  id: string;
  post_id: string;
  content: string;
  created_at: string;
};

export type ActivityRepostItem = {
  id: string;
  reel_id: string;
  created_at: string | null;
  reel_description: string | null;
  reel_thumbnail_url: string | null;
};

/** Props passed to every sub-section component */
export interface SectionProps {
  isDark: boolean;
  onNavigate: (screen: Screen) => void;
  onBack: () => void;
}
