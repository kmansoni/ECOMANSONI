/**
 * src/pages/settings/index.ts
 * Public API barrel for the settings sub-module.
 * 
 * The SettingsPage component is the main entry point.
 * It re-exports from the original SettingsPage.tsx during the migration
 * period, while individual section components are progressively extracted.
 * 
 * Migration status (as of Phase 1 extraction):
 *   [x] SettingsHelpSection
 *   [x] SettingsAboutSection
 *   [x] SettingsSavedSection  
 *   [x] SettingsArchiveSection
 *   [x] SettingsActivitySection
 *   [x] SettingsPrivacySection
 *   [x] SettingsAppearanceSection
 *   [x] SettingsCallsSection
 *   [x] SettingsDataStorageSection
 *   [ ] SettingsNotificationsSection  (inline in orchestrator)
 *   [ ] SettingsSecuritySection       (inline in orchestrator)
 *   [ ] SettingsChatFoldersSection    (inline in orchestrator)
 *   [ ] SettingsProfileStatusSection  (inline in orchestrator)
 *   [ ] SettingsLanguageSection       (inline in orchestrator)
 *   [ ] SettingsAccessibilitySection  (inline in orchestrator)
 *   [ ] SettingsStatisticsSection     (inline in orchestrator)
 *   [ ] SettingsBrandedContentSection (inline in orchestrator)
 *   [ ] SettingsCloseFriendsSection   (inline in orchestrator)
 *   [ ] SettingsMainSection           (inline in orchestrator)
 */

// Re-export the main SettingsPage component (defined in the parent for now,
// will be moved here in Phase 2 of the migration).
export { SettingsPage } from "../SettingsPage";

// Export all extracted section components for external use / testing
export { SettingsHelpSection } from "./SettingsHelpSection";
export { SettingsAboutSection } from "./SettingsAboutSection";
export { SettingsSavedSection } from "./SettingsSavedSection";
export { SettingsArchiveSection } from "./SettingsArchiveSection";
export { SettingsActivitySection } from "./SettingsActivitySection";
export { SettingsPrivacySection } from "./SettingsPrivacySection";
export { SettingsAppearanceSection } from "./SettingsAppearanceSection";
export { SettingsCallsSection } from "./SettingsCallsSection";
export { SettingsDataStorageSection } from "./SettingsDataStorageSection";

// Export shared types and utilities
export type { Screen, SectionProps, SettingsPostItem, SettingsStoryItem, SettingsLiveArchiveItem, ActivityCommentItem, ActivityRepostItem } from "./types";
export { formatCompact, formatBytes, estimateLocalStorageBytes, dayLabel } from "./helpers";
