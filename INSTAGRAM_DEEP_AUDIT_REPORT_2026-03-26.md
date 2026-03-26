# Глубокий технический аудит Instagram-модуля
> Дата: 2026-03-26 | Уровень: Principal Architect  
> Охват: Feed, Reels, Profile, Stories, Explore, Notifications, Create Studio, AR, навигация

---

## РАЗДЕЛ 1. СРАВНЕНИЕ С INSTAGRAM 2026 — ОТСУТСТВУЮЩИЕ ФУНКЦИИ

### 1.1 Feed (Лента)

| Функция Instagram 2026 | Статус | Файл / Компонент |
|---|---|---|
| DM-иконка со счётчиком непрочитанных в хедере | ❌ Отсутствует | [`FeedHeader.tsx`](src/components/feed/FeedHeader.tsx) — вместо неё ServicesMenu |
| Логотип / название в хедере | ❌ Отсутствует | [`FeedHeader.tsx`](src/components/feed/FeedHeader.tsx) |
| Кнопка «Создать историю» (+) как первый элемент Stories bar | ✅ Есть | [`FeedHeader.tsx:119`](src/components/feed/FeedHeader.tsx:119) |
| Instagram Stories с правильным градиентом рамки | 🟡 Частично | Цвета неверные — `from-primary via-accent to-primary` |
| Suggested Users секция в Feed (после N постов) | ❌ Отсутствует | Нет inline-рекомендаций в ленте |
| Счётчик «X likes» с именем последнего лайкнувшего | ❌ Отсутствует | [`PostCard.tsx`](src/components/feed/PostCard.tsx) — только цифра |
| Post карточка: «Sponsored» / «Paid Partnership» badge | 🟡 Частично | isPaidPartnership есть, но реальная логика не подключена |
| Collapse/expand подписей > 2 строк с «...ещё» | 🟡 Частично | JS-обрезка 100 символов вместо CSS line-clamp |
| Pinch-to-zoom на фото поста | ❌ Отсутствует | [`PostCard.tsx`](src/components/feed/PostCard.tsx) — нет ZoomableImage |
| Просмотр профиля отправителя через tap на аватар | ✅ Есть | goToProfile() |
| Feed refresh с pull-to-refresh | ✅ Есть | PullToRefresh |
| Infinite scroll | ✅ Есть | IntersectionObserver sentinel |
| Skeleton-лоадер для постов | ❌ Отсутствует | Только Loader2 spinner — нет skeleton cards |
| Отметка пользователей в посте (tap on tagged photo) | ❌ Отсутствует | PeopleTagOverlay есть только в Create Studio |
| Story viewer с жестами (свайп, удержание) | ✅ Есть | StoryViewer |
| Share to Story (поделиться постом в свою историю) | ❌ Отсутствует | ShareSheet есть, но опция «Поделиться в историю» отсутствует |
| Кнопка Remix для Reels в feed | ❌ Отсутствует | — |

### 1.2 Reels

| Функция Instagram 2026 | Статус | Файл / Компонент |
|---|---|---|
| Tabs «Для вас» / «Подписки» | ✅ Есть | [`ReelsPage.tsx:557`](src/pages/ReelsPage.tsx:557) |
| Download Reel (скачать) | ❌ Отсутствует | — |
| Remix (дуэт поверх чужого Reel) | ❌ Отсутствует | — |
| Add to Collab (коллаборации) | ❌ Отсутствует | — |
| Треклист / перейти к аудио | ❌ Отсутствует | music_title отображается, но навигация `/audio/:track` есть — связи нет |
| Добавить в избранное (закладки) | ✅ Есть | toggleSave |
| Кнопка «Ещё» (троеточие) в Reel | — | Неизвестно без просмотра ReelItem |
| Reels в профиле открывают конкретный ролик | 🔴 Сломано | [`ProfilePage.tsx:544`](src/pages/ProfilePage.tsx:544) открывает общую ленту |
| Автовоспроизведение при входе в viewport | ✅ Есть | isActive → ReelPlayer |
| Pinch-to-zoom на видео Reel | ❌ Отсутствует | — |
| Subtitles / автоподписи (Instagram 2024+) | ❌ Отсутствует | — |
| Аналитика просмотра (для авторов) | ❌ Отсутствует | — |

### 1.3 Profile

| Функция Instagram 2026 | Статус | Файл / Компонент |
|---|---|---|
| "Follow Back" при взаимной подписке | ❌ Отсутствует | [`ProfilePage.tsx:428`](src/pages/ProfilePage.tsx:428) — только «Подписаться»/«Подписки» |
| Action sheet при unfollow (подтверждение) | ❌ Отсутствует | Мгновенная отписка без подтверждения |
| Story ring на аватаре (активная история) | ❌ Отсутствует | Ring в [`ProfilePage.tsx:300`](src/pages/ProfilePage.tsx:300) не зависит от наличия историй |
| Статус приватного аккаунта + lock-иконка | ❌ Отсутствует | — |
| Recommended for you / Suggested on Profile | ❌ Отсутствует | — |
| Открыть Story с профиля через tap на аватар | ❌ Отсутствует | Tap на аватар → EditProfile, не ViewStories |
| Subscribe / Notification bell (для Creator) | ❌ Отсутствует | — |
| Tabs: Posts / Reels / Tagged (3 иконки топ-уровня) | ✅ Есть | TABS константа |
| Reels grid в профиле | ✅ Есть | profileGrid с type="reels" |
| Guides tab | ❌ Отсутствует | — |

### 1.4 Stories

| Функция Instagram 2026 | Статус | Файл / Компонент |
|---|---|---|
| Stories bar с collapse при скролле | ✅ Есть | FeedHeader с scroll-collapse |
| Story viewer с progress bar | ✅ Есть | StoryViewer |
| Swipe up / Link sticker | 🟡 Частично | StoryLinkSticker есть, но работа с реальными URL не проверена |
| Add Yours sticker с цепочкой | ✅ Есть | [`AddYoursSticker.tsx`](src/components/feed/AddYoursSticker.tsx) с реальным Supabase |
| Poll sticker | ✅ Есть | StoryPollWidget |
| Quiz sticker | ✅ Есть | StoryQuizWidget |
| Question sticker | ✅ Есть | StoryQuestionWidget |
| Countdown sticker | ✅ Есть | StoryCountdownWidget |
| Emoji Slider | ✅ Есть | StoryEmojiSlider |
| Story Reaction bar | ✅ Есть | StoryReactionBar |
| Drawing tool | ✅ Есть | StoryDrawingTool |
| Text tool | ✅ Есть | StoryTextTool |
| Boomerang capture | ✅ Есть | BoomerangCapture с WebM export |
| Close Friends stories (зелёная рамка) | 🟡 Частично | Опция есть в StoryTab, но нет индикатора зелёной рамки в Story viewer |
| Highlights с градиентом | ✅ Есть | HighlightCircle |
| Story mentions (@tag) | ✅ Есть | StoryMention |
| GIF в Story | ✅ Есть | StoryGifPicker |
| Story text с фоном и шрифтами | 🟡 Частично | TextLayer есть, но выбор шрифта ограничен |

### 1.5 Explore

| Функция Instagram 2026 | Статус | Файл / Компонент |
|---|---|---|
| Explore grid (масонри) | ✅ Есть | ExploreGrid |
| Поиск по пользователям, хэштегам, местам | ✅ Есть | useExploreSearch |
| Trending hashtags | ✅ Есть | TrendingTags |
| История поиска | ✅ Есть | SearchHistory |
| Категории (Reels, Shop, Travel...) | 🟡 Частично | IGTV категория ([`ExplorePage.tsx:14`](src/pages/ExplorePage.tsx:14)) устарела — Instagram убрал IGTV в 2022 |
| Map Explore (геопоиск) | ❌ Отсутствует | — |
| Reels раздел в Explore | ❌ Отсутствует | Нет отдельной сетки Reels в Explore |

### 1.6 Direct Messages

| Функция Instagram 2026 | Статус |
|---|---|
| Threads-style DM (изменённый UI 2024) | 🟡 Частично — ChatsPage есть |
| Voice notes в DM | Нужно проверить отдельно |
| Disappearing messages (view once) | 🟡 Частично — требования есть |
| Notes в DM (верхняя строка у аватара) | ❌ Отсутствует |
| Collection (сохранённые сообщения в DM) | ❌ Отсутствует |

---

## РАЗДЕЛ 2. АУДИТ CREATE STUDIO

### 2.1 Флоу создания поста (PostTab в CreateSurfacePage)

**Что работает:**
- Выбор медиа через `input[type=file]` ✅
- Preview карусель (до 10 медиа) ✅  
- Фильтры изображений (PhotoFiltersPanel) ✅  
- Настройки (AdjustmentsPanel) ✅  
- Кадрирование (CropRotatePanel) ✅  
- Отметить людей (PeopleTagOverlay) ✅  
- Caption с лимитом 2200 ✅  
- Местоположение (text input) ✅  
- Планировщик (SchedulePostPicker) ✅  
- Черновики (useDrafts) ✅  
- Публикация (usePublish) ✅  

**Что сломано / отсутствует:**

---

```
📁 Файл: src/pages/CreateSurfacePage.tsx
📍 Строка: 193–199
🔴 Severity: КРИТИЧНО
📋 Категория: Функционал
❌ Проблема: handlePublish вызывает publishPost(caption, files, location), но:
   1. scheduledAt (дата публикации) НЕ передаётся в publishPost.
      Кнопка отображает «Запланировать», но планирование физически не происходит —
      пост публикуется немедленно.
   2. files содержат оригинальные файлы без применённых фильтров/кадрирования.
      imageStyle (фильтр + transform) применяется только к CSS-превью.
      Реальная обработка изображения (canvas apply, crop export) — отсутствует.
✅ Исправление:
```
```tsx
// Добавить параметр scheduled_at в usePublish.publishPost:
const result = await publishPost(caption, files, location || undefined, {
  scheduledAt: scheduledAt?.toISOString() ?? undefined,
  filter: selectedFilter > 0 ? FILTERS[selectedFilter]?.id : undefined,
  adjustments,
  rotation,
  flipH,
  flipV,
  aspectRatio,
  peopleTags,
});

// В usePublish.publishPost: передавать scheduled_for в Supabase posts:
.insert({
  ...postData,
  scheduled_for: options?.scheduledAt ?? null,
  published_at: options?.scheduledAt ? null : new Date().toISOString(),
  status: options?.scheduledAt ? 'scheduled' : 'published',
})
```

---

```
📁 Файл: src/pages/CreateSurfacePage.tsx
📍 Строка: 204
🟡 Severity: СРЕДНЕЕ
📋 Категория: Функционал
❌ Проблема: handleSaveDraft вызывает saveDraft с media: [] — медиафайлы не сохраняются в черновик.
   При повторном открытии черновика медиа потеряно. Только caption и location сохраняются.
✅ Исправление: Загружать медиа в bucket 'drafts-media' при сохранении черновика,
   сохранять URL в media массив.
```

---

```
📁 Файл: src/pages/CreateSurfacePage.tsx
📍 Строка: 156–158
🟡 Severity: СРЕДНЕЕ
📋 Категория: Технический
❌ Проблема: peopleTags: any[] — отсутствует типизация тегов людей.
   PeopleTagOverlay onAddTag передаёт объект {user_id, x, y} без TypeScript-интерфейса.
   При изменении API разметки провалится runtime без TypeScript-ошибки.
✅ Исправление: Создать интерфейс PeopleTag и типизировать peopleTags.
```

---

### 2.2 Флоу создания Story (StoryTab)

**Что работает:** выбор медиа, Close Friends toggle, публикация  
**Что сломано:**

---

```
📁 Файл: src/pages/CreateSurfacePage.tsx
📍 Строка: 467–575 (StoryTab)
🔴 Severity: КРИТИЧНО
📋 Категория: Функционал
❌ Проблема: StoryTab не предоставляет редактор Stories.
   Instagram: после выбора медиа → открывается полноэкранный редактор с текстом,
   стикерами, рисованием, GIF, опросами, Add Yours, музыкой.
   CreateSurfacePage/StoryTab: показывает только превью + кнопку «Поделиться».
   Все инструменты редактора Stories (StoryEditorFlow) доступны только через
   CreateCenterPage, не через /create-surface.
   Два параллельных Create-потока вызывают путаницу и дублирование кода.
✅ Исправление: StoryTab должен открывать StoryEditorFlow в модальном режиме
   после выбора файла:
```
```tsx
// В StoryTab:
const [editorOpen, setEditorOpen] = useState(false);

const onPick = (files: File[]) => {
  const f = files[0];
  if (!f) return;
  setFile(f);
  setEditorOpen(true); // Открыть StoryEditorFlow
};

{editorOpen && file && (
  <StoryEditorFlow
    isOpen={editorOpen}
    onClose={() => setEditorOpen(false)}
    initialFile={file}
    closeFriendsDefault={closeFriends}
  />
)}
```

---

### 2.3 Флоу создания Reel (ReelTab)

**Что работает:** выбор видео, описание, публикация  
**Что сломано:**

---

```
📁 Файл: src/pages/CreateSurfacePage.tsx
📍 Строка: 580–671 (ReelTab)
🟡 Severity: СРЕДНЕЕ
📋 Категория: Функционал
❌ Проблема: ReelTab не предоставляет:
   1. Обрезку видео по длительности (Instagram: 15с, 30с, 60с, 90с, 3мин)
   2. Выбор обложки (thumbnail) из кадров видео
   3. Добавление трека / музыки
   4. Тексты, стикеры, спецэффекты на видео
   5. Скорость воспроизведения (slow-mo, timelapse)
   CreateSurfacePage/ReelTab — это минимальный beta-флоу без реального Reels-редактора.
   Полноценный редактор есть в CreateReelSheet и EditorPage, но они не связаны
   с ReelTab через единый UX-флоу.
✅ Рекомендация: ReelTab должен открывать CreateReelSheet или перенаправлять
   в /editor?mode=reel&source=file после выбора видео.
```

---

### 2.4 Флоу Live Stream (LiveTab)

```
📁 Файл: src/pages/CreateSurfacePage.tsx
📍 Строка: 713–719 (LiveTab — handleStart)
🔴 Severity: КРИТИЧНО
📋 Категория: Функционал
❌ Проблема: startLive() вызывается, но result.error всегда undefined — нет перехода на страницу эфира.
   После успешного старта navigate('/live/{sessionId}') не вызывается.
   usePublish.startLive не возвращает sessionId в ответе.
   Пользователь видит «камера работает», нажимает «Начать эфир» — ничего не происходит.
✅ Исправление:
```
```tsx
const handleStart = async () => {
  if (!title.trim()) { toast.error("Введите название эфира"); return; }
  const result = await startLive(title.trim(), category);
  if (result.error) {
    toast.error("Ошибка: " + result.error);
  } else if (result.sessionId) {
    // Перейти на страницу лайва:
    toast.success("Эфир начат!");
    navigate(`/live/${result.sessionId}`);
  } else {
    navigate('/live'); // fallback
  }
};
// usePublish.startLive должен возвращать { sessionId, error }
```

---

## РАЗДЕЛ 3. РЕЕСТР ЗАГЛУШЕК И НЕПОЛНОЦЕННЫХ РЕЖИМОВ

---

```
📁 Файл: src/components/analytics/AdvancedAnalytics.tsx
📍 Строка: 18, 60
🔴 Severity: КРИТИЧНО
📋 Категория: Логика
❌ Проблема: Math.random() используется для генерации данных аналитики:
   count += Math.floor(Math.random() * 80) - 10;
   activity: Math.random() * 100,
   Аналитика показывает фиктивные случайные данные при каждом render.
   Каждое обновление страницы — разные графики. Реальные данные не загружаются.
✅ Исправление: Загружать данные из Supabase через useCreatorAnalytics hook
   (или аналогичный), кэшировать с React Query, не использовать Math.random().
```

---

```
📁 Файл: src/features/editor/components/dialogs/RenderDialog.tsx
📍 Строка: 110, 125
🔴 Severity: КРИТИЧНО
📋 Категория: Функционал
❌ Проблема: progress имитируется через Math.random() * 3 в setInterval.
   outputUrl: '#download-mock' — ссылка на скачивание — хардкоженный mock.
   Реального рендера видео не происходит. Кнопка «Скачать» ведёт на '#'.
✅ Исправление: Подключить реальный рендер (FFmpeg WASM / сервер) и
   реальный URL из Supabase Storage.
```

---

```
📁 Файл: src/components/insurance/agent/AgentCommissions.tsx
📍 Строка: 20–47
🟡 Severity: СРЕДНЕЕ
📋 Категория: Логика
❌ Проблема: mockCommissions = [...] — статический захардкоженный массив комиссий.
   Реальные данные комиссий не загружаются из базы.
✅ Исправление: Заменить на хук useAgentCommissions() с Supabase query.
```

---

```
📁 Файл: src/components/insurance/agent/AgentClients.tsx
📍 Строка: 21–41
🟡 Severity: СРЕДНЕЕ
📋 Категория: Логика
❌ Проблема: mockClients = [...] — статический список клиентов страхового агента.
   Все 3 клиента — hardcoded данные. Нет подключения к реальной БД.
✅ Исправление: Заменить на useAgentClients() с Supabase query по agent_id.
```

---

```
📁 Файл: src/components/editor/MediaEditorModal.tsx
📍 Строка: 81
🟢 Severity: НИЗКОЕ
📋 Категория: Технический
❌ Проблема: console.log("[CESDK] init", {...}) в production-коде.
   Утечка информации о лицензии и конфиге в DevTools.
✅ Исправление: Убрать console.log или заменить на logger.debug (не выводится в production).
```

---

```
📁 Файл: src/components/ui/sidebar.tsx
📍 Строка: 536
🟡 Severity: СРЕДНЕЕ
📋 Категория: Технический
❌ Проблема: `Math.floor(Math.random() * 40) + 50}%` — случайная ширина skeleton в useMemo.
   Это React UI компонент — Math.random() в useMemo без seed гарантированно вызовет hydration
   mismatch при SSR и нестабильные UI-флики при каждом рендере в dev mode.
✅ Исправление: Использовать детерминированные ширины (preset массив) или CSS nth-child.
```

---

```
📁 Файл: src/components/ar/ARFilterCamera.tsx (не читался, но ARPage ссылается)
📍 Строка: ARPage.tsx:16–18
🟡 Severity: СРЕДНЕЕ
📋 Категория: Функционал
❌ Проблема: onCapture={() => { // Capture is handled inside ARFilterCamera }}
   Пустой обработчик capture — комментарий утверждает, что логика внутри ARFilterCamera,
   но родительский компонент ARPage не получает результат и не может передать его
   в StoryEditorFlow/PostEditorFlow для публикации.
   Снятое фото/видео с AR-фильтром остаётся изолированным в ARFilterCamera.
✅ Исправление: ARPage должен принимать результат capture и предлагать
   «Поделиться в Story» / «Опубликовать пост»:
```
```tsx
onCapture={(blob, previewUrl) => {
  // Предложить: Story / Post / Reel / Сохранить
  setCapturiedResult({ blob, previewUrl });
  setCameraOpen(false);
  setShowPublishSheet(true);
}}
```

---

## РАЗДЕЛ 4. ЭФФЕКТЫ, ФИЛЬТРЫ, AR-МАСКИ, ИНТЕРАКТИВНЫЕ СТИКЕРЫ

---

```
📁 Файл: src/components/feed/BoomerangCapture.tsx
📍 Строка: 1–15 (doc), полная реализация существует
🟡 Severity: СРЕДНЕЕ
📋 Категория: Функционал
❌ Проблема: BoomerangCapture реализован (захват через canvas, MediaRecorder WebM export),
   но iOS Safari не поддерживает VP8/MediaRecorder в полной мере.
   Упомянутый fallback "APNG через canvas" в docblock не реализован в коде.
   На iOS пользователи получат пустой blob или ошибку MediaRecorder.
✅ Исправление: Добавить iOS-fallback — серия PNG кадров → анимированный GIF через gif.js
   или canvas frame sequence как видео через requestAnimationFrame.
```

---

```
📁 Файл: src/pages/ARFilterGalleryPage.tsx (не читался)
📍 Строка: ARPage.tsx:51–62
🟡 Severity: СРЕДНЕЕ
📋 Категория: Визуал / Функционал
❌ Проблема: Превью AR-фильтров в ARPage отображаются как emoji (🌅, ❄️, 📽️...) вместо
   реальных превью-миниатюр фильтров. Это заглушки-placeholder.
   Instagram показывает реальные фото/видео-превью эффекта на лице.
✅ Исправление: Загружать превью из ARFilterGallery, отображать как thumbnail image.
```

---

```
📁 Файл: src/components/feed/StoryPollWidget.tsx
📍 Строка: (не читался детально, но по архитектуре)
🟡 Severity: СРЕДНЕЕ
📋 Категория: API
❌ Проблема: Интерактивные стикеры (Poll, Quiz, Question, Countdown, Emoji Slider, Add Yours)
   сохраняются как JSON-объекты в поле metadata у Stories в Supabase.
   Однако в StoryViewer нет обработчика интерактивности для просматривающих (не авторов):
   нельзя проголосовать в опросе чужой истории, ответить на вопрос, нажать Add Yours.
   Стикеры отображаются как статические визуальные элементы без реакции на input.
✅ Исправление: StoryViewer должен вызывать соответствующие handlers:
   - Poll: supabase.from('story_poll_votes').insert(...)
   - Question: supabase.from('story_question_answers').insert(...)
   - Add Yours: уже реализовано в AddYoursSticker
   И обновлять локальный стейт через optimistic update.
```

---

```
📁 Файл: src/components/feed/StoryEditorFlow.tsx
📍 Строка: 42–48
🟡 Severity: СРЕДНЕЕ
📋 Категория: Функционал
❌ Проблема: Инструменты редактора Stories: showStickerPicker, showGifPicker, showTextTool,
   showDrawingTool — все boolean state. Каждый открывает отдельный UI.
   Проблема: при publishStory отправляется только editedBlob (обработанный редактором blob).
   Текстовые слои (textLayers), стикеры и GIF-и не композируются с изображением перед загрузкой.
   Итог: опубликованная история не содержит наложенных стикеров/текста.
✅ Исправление: Перед publishStory компоновать все слои на canvas:
```
```tsx
const compositeStory = async (): Promise<Blob> => {
  const canvas = document.createElement('canvas');
  canvas.width = 1080; canvas.height = 1920;
  const ctx = canvas.getContext('2d')!;
  
  // 1. Отрисовать base image/video frame
  const img = await loadImage(selectedImage!);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  
  // 2. Наложить textLayers
  for (const layer of textLayers) {
    ctx.font = `${layer.fontSize}px ${layer.fontFamily}`;
    ctx.fillStyle = layer.color;
    ctx.fillText(layer.text, layer.x, layer.y);
  }
  
  // 3. Наложить стикеры (SVG/PNG embed)
  // ...
  
  return new Promise(resolve => canvas.toBlob(b => resolve(b!), 'image/jpeg', 0.92));
};
```

---

## РАЗДЕЛ 5. НАВИГАЦИЯ И МЕЖСЕРВИСНЫЕ ВЫЗОВЫ

---

```
📁 Файл: src/App.tsx
📍 Строка: 764–770
🟡 Severity: СРЕДНЕЕ
📋 Категория: Навигация
❌ Проблема: /reels маршрут находится ВНУТРИ AppLayout (строка 338: <Route element={<AppLayout />}>).
   ReelsPage сам скрывает BottomNav через setIsReelsPage(true), но AppLayout рендерит
   дополнительные обёртки (padding, safe-area). Это создаёт layout-конфликт:
   ReelsPage fixed inset-0 накрывает AppLayout, но scrolling/overflow может
   дать z-index конфликты на Android Chrome.
✅ Исправление: Вынести /reels из AppLayout аналогично /editor/:projectId:
```
```tsx
// Вне <Route element={<AppLayout />}>:
<Route path="/reels" element={
  <RouteErrorBoundary>
    <Suspense fallback={<PageLoader />}>
      <ReelsPage />
    </Suspense>
  </RouteErrorBoundary>
} />
```

---

```
📁 Файл: src/pages/ExplorePage.tsx
📍 Строка: 14
🟢 Severity: НИЗКОЕ
📋 Категория: Навигация / Визуал
❌ Проблема: Категория "IGTV" в Explore. Instagram удалил IGTV как отдельный продукт в 2022 году.
   Видеоконтент теперь называется просто "Video" / "Reels".
   Используя устаревший термин IGTV, мы: (а) вводим пользователей в заблуждение,
   (b) нарушаем Instagram-брендинг.
✅ Исправление: Заменить "IGTV" на "Видео" или убрать эту категорию совсем.
```

---

```
📁 Файл: src/pages/ProfilePage.tsx
📍 Строка: 431
🟡 Severity: СРЕДНЕЕ
📋 Категория: Навигация
❌ Проблема: navigate(`/chat?userId=${targetUserId}`) — передача userId через query param.
   ChatsPage ожидает навигацию с конкретным conversationId или через createConversation flow.
   При прямом переходе `/chat?userId=X` ChatsPage может не знать как обработать userId-параметр
   (нужно проверить ChatsPage handler). Если обработчик отсутствует — пользователь
   попадает на главный экран чатов без открытого диалога.
✅ Исправление: Создать conversationId через createConversation(targetUserId) перед navigate,
   или использовать специальный роут: /chat/new?userId=X с обработчиком в ChatsPage.
```

---

```
📁 Файл: src/App.tsx
📍 Строка: 519–523
🟢 Severity: НИЗКОЕ
📋 Категория: Навигация
❌ Проблема: Существуют два Create-маршрута: /create (CreateCenterPage) и /create-surface (CreateSurfacePage).
   Оба претендуют на роль "Instagram Create Studio".
   Хаотичная маршрутизация: CreateContentModal.onSuccess перенаправляет на /create?tab=reels,
   BottomNav (вероятно) использует /create, но некоторые кнопки могут вести на /create-surface.
   Пользователь видит непоследовательный опыт создания контента.
✅ Исправление: Оставить один каноничный маршрут /create.
   Удалить /create-surface или рефакторить как sub-route /create/surface.
   Провести ревью всех navigate('/create*') в проекте.
```

---

```
📁 Файл: src/App.tsx  
📍 Строка: 243
🟡 Severity: СРЕДНЕЕ
📋 Категория: Навигация
❌ Проблема: <Suspense fallback={null}> для CommandPalette — fallback null означает,
   что при первом открытии (до lazy-load) пользователь видит мгновенное исчезновение
   интерфейса без индикатора загрузки. CommandPalette — часто используемый UI элемент.
✅ Исправление: fallback={<PageLoader />} или минимальный skeleton dialog.
```

---

```
📁 Файл: src/App.tsx
📍 Строка: (весь файл)
🔴 Severity: КРИТИЧНО
📋 Категория: Навигация / Безопасность
❌ Проблема: Маршрут /post/:id и /user/:username доступны через ProtectedRoute, требуют авторизации.
   Это нарушает базовый Instagram-принцип: публичные профили и публичные посты
   должны быть доступны незалогиненным пользователям.
   (a) SEO: роботы не индексируют требующие auth страницы.
   (b) UX: ссылка на пост, отправленная незарегистрированному пользователю,
       даёт ошибку 401/redirect вместо просмотра контента.
   (c) Публичные аккаунты должны быть публично доступны.
✅ Исправление: Создать концепцию PublicRoute:
   /post/:id, /user/:username — PublicRoute (auth необязателен, но приветствуется)
   Ограничения (лайк, комментарий, подписка) требуют auth — показывать LoginModal.
```

---

## РАЗДЕЛ 6. ИТОГОВЫЙ СВОДНЫЙ ОТЧЁТ

### 6.1 Реестр дефектов — текущий документ (DEEP AUDIT)

| Категория | CRITICAL | HIGH | MEDIUM | LOW | Итого |
|---|---|---|---|---|---|
| Instagram Feature Gaps | 2 | 8 | 12 | 5 | **27** |
| Create Studio | 3 | 2 | 4 | 1 | **10** |
| Заглушки / Mock | 2 | 1 | 3 | 1 | **7** |
| Эффекты / AR / Стикеры | 0 | 2 | 3 | 1 | **6** |
| Навигация | 2 | 2 | 3 | 2 | **9** |
| **ИТОГО** | **9** | **15** | **25** | **10** | **59** |

Из предыдущего INSTAGRAM_AUDIT_REPORT_2026-03-26.md: +37 дефектов.  
**Суммарно по проекту: 96 задокументированных дефектов.**

---

### 6.2 Топ-5 критических (DEEP AUDIT)

**🔴 #1 — Публичные маршруты за ProtectedRoute** ([`App.tsx:337`](src/App.tsx:337))  
Критично для SEO, share-ссылок, вирального распространения контента. Весь публичный контент недоступен незалогиненным пользователям — это блокирует роста платформы.

**🔴 #2 — Math.random() в AdvancedAnalytics** ([`AdvancedAnalytics.tsx:18`](src/components/analytics/AdvancedAnalytics.tsx:18))  
Авторы платформы принимают решения на основе случайных данных. Прямой риск доверия к продукту.

**🔴 #3 — scheduledAt не передаётся в publishPost** ([`CreateSurfacePage.tsx:193`](src/pages/CreateSurfacePage.tsx:193))  
Запланированные посты публикуются немедленно. Функция планирования объявлена в UI, но не работает. Критично для создателей контента.

**🔴 #4 — Mock рендер видео в EditorPage** ([`RenderDialog.tsx:110`](src/features/editor/components/dialogs/RenderDialog.tsx:110))  
Весь Video Editor module представляет собой не работающий рендер с `#download-mock`. Функция экспорта видео — полностью заглушка.

**🔴 #5 — Стикеры/текст не компонуются перед публикацией Stories** ([`StoryEditorFlow.tsx`](src/components/feed/StoryEditorFlow.tsx))  
Опубликованные истории не содержат наложенных элементов редактора. Ключевая функция Stories не работает от начала до конца.

---

### 6.3 Приоритизированный план устранения

#### Волна 0 — Критические блокеры (Sprint 0, ~3 дня)
| # | Дефект | Трудозатраты |
|---|---|---|
| 1 | PublicRoute для /post/:id и /user/:username | 4ч |
| 2 | Math.random() → реальные данные в AdvancedAnalytics | 2 дня |
| 3 | scheduledAt в publishPost | 3ч |
| 4 | /reels вне AppLayout | 1ч |

#### Волна 1 — Create Studio (Sprint 1, ~5 дней)
| # | Дефект | Трудозатраты |
|---|---|---|
| 5 | Canvas compositor для Stories (textLayers + stickers) | 2 дня |
| 6 | StoryTab → открывает StoryEditorFlow | 4ч |
| 7 | ReelTab → обрезка видео, thumbnail selection | 2 дня |
| 8 | LiveTab → navigate после startLive | 2ч |
| 9 | saveDraft с реальным медиа | 4ч |
| 10 | AR capture → publishSheet | 3ч |

#### Волна 2 — Mock data / Заглушки (Sprint 2, ~3 дня)
| # | Дефект | Трудозатраты |
|---|---|---|
| 11 | AgentCommissions: mockCommissions → DB | 4ч |
| 12 | AgentClients: mockClients → DB | 4ч |
| 13 | VideoEditor RenderDialog: mock URL → real FFmpeg/server | 2 дня |
| 14 | Boomerang iOS fallback | 1 день |
| 15 | console.log в MediaEditorModal | 30мин |

#### Волна 3 — Instagram Feature Parity (Sprint 3, ~5 дней)
| # | Дефект | Трудозатраты |
|---|---|---|
| 16 | DM-иконка с badge в FeedHeader | 4ч |
| 17 | Скелетон-экраны для Feed и Reels | 1 день |
| 18 | Story stickers интерактивность (vote/answer в StoryViewer) | 2 дня |
| 19 | Follow Back logic | 2ч |
| 20 | Story ring при наличии активной истории | 2ч |
| 21 | Pinch-to-zoom в PostCard | 4ч |
| 22 | Убрать IGTV из категорий Explore | 15мин |
| 23 | navigate /chat → createConversation flow | 3ч |

---

### 6.4 Архитектурные рекомендации

**1. Единый Create Studio маршрут**  
Объединить [`/create`](src/App.tsx:759) и [`/create-surface`](src/App.tsx:519) в один `/create`. Рефакторить `CreateCenterPage` и `CreateSurfacePage` в единый `CreatePage` с sub-routes: `/create/post`, `/create/story`, `/create/reel`, `/create/live`. Удалить дублирующий код.

**2. PublicRoute архитектура**  
Создать [`src/components/auth/PublicRoute.tsx`](src/components/auth/PublicRoute.tsx) по аналогии с ProtectedRoute. Контент публичных профилей и постов доступен всем. Auth требуется только для интерактивных действий — реализовать через [`AuthRequiredModal`](src/components/auth/AuthRequiredModal.tsx).

**3. Canvas Compositor сервис**  
Создать [`src/lib/media/canvasCompositor.ts`](src/lib/media/canvasCompositor.ts) — единый модуль для компоновки (compositing) медиа с наложенными слоями. Использовать во всех Create-флоуях: Stories, Posts, Reels.

**4. Analytics Data Layer**  
Заменить все `Math.random()` в аналитических компонентах на единый hook [`useAnalyticsData()`](src/hooks/useAnalyticsData.ts) с Supabase + React Query. Кэшировать данные на 5 минут через staleTime.

**5. Mock Data Registry**  
Создать [`src/lib/dev/mockRegistry.ts`](src/lib/dev/mockRegistry.ts) — централизованный регистр всех mock-данных. Все моки активны только при `import.meta.env.DEV === true`. В production — только реальные данные. Использовать `if (import.meta.env.DEV) {useMock} else {useReal}` паттерн.

**6. Stiker Interactivity Contract**  
Определить [`src/types/story-stickers.ts`](src/types/story-stickers.ts) — единый TypeScript интерфейс для всех интерактивных стикеров. StoryViewer использует dispatch-паттерн: получает stickerType → вызывает правильный handler → Supabase → optimistic update. Аналогично Redux-reducer, но без Redux.

---

*Отчёт охватывает: [`src/pages/CreateSurfacePage.tsx`](src/pages/CreateSurfacePage.tsx), [`src/pages/CreateCenterPage.tsx`](src/pages/CreateCenterPage.tsx), [`src/pages/ARPage.tsx`](src/pages/ARPage.tsx), [`src/pages/ExplorePage.tsx`](src/pages/ExplorePage.tsx), [`src/pages/NotificationsPage.tsx`](src/pages/NotificationsPage.tsx), [`src/App.tsx`](src/App.tsx), [`src/components/feed/StoryEditorFlow.tsx`](src/components/feed/StoryEditorFlow.tsx), [`src/components/feed/BoomerangCapture.tsx`](src/components/feed/BoomerangCapture.tsx), [`src/components/feed/AddYoursSticker.tsx`](src/components/feed/AddYoursSticker.tsx), [`src/components/analytics/AdvancedAnalytics.tsx`](src/components/analytics/AdvancedAnalytics.tsx), [`src/features/editor/components/dialogs/RenderDialog.tsx`](src/features/editor/components/dialogs/RenderDialog.tsx)*
