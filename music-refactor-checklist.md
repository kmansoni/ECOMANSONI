# Music Module Refactor — Commit Checklist

## Предварительная проверка

- [x] `tsc --noEmit` — 0 ошибок
- [x] `eslint` — 0 ошибок (4 legacy-предупреждения: `no-explicit-any` в PlaylistCard/supabase, `no-restricted-syntax` в SearchPage — допустимы)

## Ветка и стейджинг

- [ ] 1. Переключиться на `main` и выполнить `git pull`
- [ ] 2. Создать ветку: `git checkout -b feat/music-module-refactor`
- [ ] 3. Стейджить все изменённые файлы:

```
services/music/src/App.tsx
services/music/src/components/AudioPlayer.tsx
services/music/src/index.tsx
services/music/src/lib/supabase.ts
services/music/src/lib/useMusicActions.ts
services/music/src/lib/useMusicData.ts
services/music/src/module.tsx
services/music/src/pages/MusicHomePage.tsx
services/music/src/pages/PlaylistPage.tsx
services/music/src/pages/SearchPage.tsx
services/music/src/pages/TrackPage.tsx
services/music/src/store/useMusicStore.ts
services/music/src/styles/index.css
```

Команда:
```bash
git add services/music/src/App.tsx \
  services/music/src/components/AudioPlayer.tsx \
  services/music/src/index.tsx \
  services/music/src/lib/supabase.ts \
  services/music/src/lib/useMusicActions.ts \
  services/music/src/lib/useMusicData.ts \
  services/music/src/module.tsx \
  services/music/src/pages/MusicHomePage.tsx \
  services/music/src/pages/PlaylistPage.tsx \
  services/music/src/pages/SearchPage.tsx \
  services/music/src/pages/TrackPage.tsx \
  services/music/src/store/useMusicStore.ts \
  services/music/src/styles/index.css
```

## Коммит

- [ ] 4. Создать коммит:

```bash
git commit -m "feat(music): refactor music module to self-contained micro-app

- Extract BrowserRouter to module.tsx wrapper (.music-module scope)
- Remove BrowserRouter from App.tsx (now in module.tsx)
- Remove AudioPlayer from App.tsx; error handling moved to AudioPlayer
- Rewrite useMusicData: Promise.allSettled + cancelled flag, remove pendingQueries lock
- Remove demoMusicData import from store; use empty initial state
- Update getAuthToken: sessionStorage between global var and localStorage
- Simplify MusicHomePage and SearchPage to single useMusicData call
- Fix PlaylistPage TrackList import path
- Remove store dependencies from TrackPage.allTracks
- Add playbackError state and onError handler to AudioPlayer
- Add addToQueue removal in AudioPlayer
- CSS isolation via .music-module scope in index.css
"
```

## PR

- [ ] 5. Создать PR из `feat/music-module-refactor` в `main`
- [ ] 6. Заголовок PR: `feat: refactor music module to self-contained micro-app`
- [ ] 7. В описании PR указать:
  - Что: рефакторинг music-модуля в самодостаточный микро-апп
  - Зона изменений: 13 файлов (`src/`)
  - Ключевые решения: BrowserRouter вынесен в обёртку, useMusicData переписан с allSettled + cancel, CSS-изоляция через `.music-module`, убраны зависимости от стора в allTracks, error handling в AudioPlayer
  - Legacy ESLint-предупреждения: 4 (не в зоне изменений / допустимы по стандарту проекта)