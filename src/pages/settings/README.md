# Settings Subsystem

This folder contains section components extracted from `src/pages/SettingsPage.tsx`.

## Goals

- Keep each section focused and maintainable.
- Reuse shared render helpers and shared types.
- Preserve existing `Screen` state-machine behavior.

## Files

- `types.ts`: shared screen/data types and `SectionProps`.
- `helpers.tsx`: reusable UI primitives for settings sections.
- `formatters.ts`: small formatting utilities.
- `index.ts`: barrel exports for the settings sub-module.
- `Settings*Section.tsx`: extracted section components.

## Section Contract

Every section component should accept `SectionProps` from `types.ts`:

- `isDark: boolean`
- `onNavigate: (screen: Screen) => void`
- `onBack: () => void`

Sections with nested screens can extend this contract with a narrowed `currentScreen` union.

## Extracted Screens

- Saved: `saved`, `saved_all_posts`, `saved_liked_posts`
- Archive: `archive`, `archive_stories`, `archive_posts`, `archive_live`
- Activity: `activity`, `activity_likes`, `activity_comments`, `activity_reposts`
- Calls: `calls`
- Data storage: `data_storage`
- Privacy: `privacy`, `privacy_blocked`
- Appearance: `appearance`, `energy_saver`
- Help: `help`
- About: `about`

## Migration Notes

The orchestrator remains in `src/pages/SettingsPage.tsx` and routes these screens to extracted components.

When extracting a new section:

1. Add a `Settings<Feature>Section.tsx` component here.
2. Use shared helpers and `SectionProps` where possible.
3. Wire the screen(s) in `SettingsPage.tsx`.
4. Remove duplicated inline `switch` cases from the orchestrator.
5. Keep behavior identical; refactor structure first, behavior second.
