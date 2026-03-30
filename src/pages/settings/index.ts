/**
 * src/pages/settings/index.ts
 * Public API barrel for the settings sub-module.
 *
 * SettingsPage (thin orchestrator) routes currentScreen to section components.
 * All 18 sections are fully extracted — nothing remains inline.
 */

export { SettingsPage } from "../SettingsPage";

// Section components
export { SettingsMainSection } from "./SettingsMainSection";
export { SettingsHelpSection } from "./SettingsHelpSection";
export { SettingsAboutSection } from "./SettingsAboutSection";
export { SettingsSavedSection } from "./SettingsSavedSection";
export { SettingsArchiveSection } from "./SettingsArchiveSection";
export { SettingsActivitySection } from "./SettingsActivitySection";
export { SettingsPrivacySection } from "./SettingsPrivacySection";
export { SettingsAppearanceSection } from "./SettingsAppearanceSection";
export { SettingsCallsSection } from "./SettingsCallsSection";
export { SettingsDataStorageSection } from "./SettingsDataStorageSection";
export { SettingsNotificationsSection } from "./SettingsNotificationsSection";
export { SettingsSecuritySection } from "./SettingsSecuritySection";
export { SettingsStatisticsSection } from "./SettingsStatisticsSection";
export { SettingsBrandedContentSection } from "./SettingsBrandedContentSection";
export { SettingsChatFoldersSection } from "./SettingsChatFoldersSection";
export { SettingsProfileStatusSection } from "./SettingsProfileStatusSection";
export { SettingsAccessibilitySection } from "./SettingsAccessibilitySection";
export { SettingsLanguageSection } from "./SettingsLanguageSection";

// Shared types and utilities
export type { Screen, SectionProps, SettingsPostItem, SettingsStoryItem, SettingsLiveArchiveItem, ActivityCommentItem, ActivityRepostItem } from "./types";
export { formatCompact, formatBytes, estimateLocalStorageBytes, dayLabel } from "./formatters";
