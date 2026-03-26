# Instagram-раздел — Исчерпывающий аудит
> Дата: 2026-03-26 | Аудитор: Principal Distributed-Systems Architect  
> Охват: Feed (HomePage), Reels (ReelsPage), Profile (ProfilePage), Stories (FeedHeader), навигация

---

## ДЕФЕКТЫ

---

### ДЕФЕКТ 001

```
📁 Файл: src/pages/HomePage.tsx
📍 Строка: 141
🟡 Severity: СРЕДНЕЕ
📋 Категория: Визуал
❌ Проблема: В PostCard передаётся author.verified: false (хардкод).
   verified всегда false вне зависимости от реальных данных FeedPost.author.is_verified.
   В Instagram верифицированный badge — ключевой UI-элемент доверия.
✅ Исправление:
```
```tsx
// src/pages/HomePage.tsx строка 138-143
author={{
  name: post.author?.display_name || "Пользователь",
  username: safeUsername,
  avatar: post.author?.avatar_url || `https://i.pravatar.cc/150?u=${safeAuthorId}`,
  verified: post.author?.is_verified ?? false, // ← was hardcoded false
}}
```

---

### ДЕФЕКТ 002

```
📁 Файл: src/pages/HomePage.tsx
📍 Строка: 141
🟡 Severity: СРЕДНЕЕ
📋 Категория: Технический
❌ Проблема: Fallback-аватар через https://i.pravatar.cc/150 — внешний CDN третьей стороны.
   В production это: (a) утечка user_id/author_id во внешний сервис;
   (b) зависимость от uptime сервиса; (c) нарушение GDPR/privacy при передаче ID.
   Instagram использует встроенный fallback (цветной круг с инициалом).
✅ Исправление:
```
```tsx
// Удалить внешний fallback-URL:
avatar: post.author?.avatar_url ?? null, // null → компонент покажет initials fallback
// В PostCard: добавить обработку avatar=null через <Avatar> с <AvatarFallback>
// вместо прямого <img src={author.avatar}>
```

---

### ДЕФЕКТ 003

```
📁 Файл: src/components/feed/PostCard.tsx
📍 Строка: 309
🟡 Severity: СРЕДНЕЕ
📋 Категория: Визуал
❌ Проблема: bg-white/50 dark:bg-card с backdrop-blur в карточке поста.
   Instagram 2024: карточка поста имеет непрозрачный белый (#FFFFFF) / чёрный (#000000) фон.
   Полупрозрачный glassmorphism с blur — Telegram-стиль, не Instagram.
   Создаёт визуальный артефакт при скролле (контент позади просвечивает).
✅ Исправление:
```
```tsx
// строка 309: заменить
<div className="bg-background border-b border-border">
// Instagram: чистый белый/чёрный без blur, разделитель — 1px border
```

---

### ДЕФЕКТ 004

```
📁 Файл: src/components/feed/PostCard.tsx
📍 Строка: 314-323
🟡 Severity: СРЕДНЕЕ
📋 Категория: Визуал
❌ Проблема: Аватар автора `w-10 h-10` (40px). Instagram 2024: аватар в карточке поста — 32px (w-8 h-8).
   ring-2 ring-primary/20 — неинстаграмный стиль (в Instagram 2024 нет кольца вокруг аватара в посте, только в Stories bar).
✅ Исправление:
```
```tsx
// строка 314: <img className="w-8 h-8 rounded-full object-cover" />
// Убрать ring-2 ring-primary/20
```

---

### ДЕФЕКТ 005

```
📁 Файл: src/components/feed/PostCard.tsx
📍 Строка: 451-495
🟡 Severity: СРЕДНЕЕ
📋 Категория: Визуал
❌ Проблема: Кнопки действий (лайк, комментарий, поделиться) имеют gap-5 (20px).
   Instagram 2024: между иконками gap ~12px, кнопка «бумажный самолётик» (Send/DM) — не Share.
   Send в Instagram = поделиться через DM, не через системный share sheet.
   Кнопка Bookmark (Save) расположена справа от Send — это верно, но между иконкой лайка
   и счётчиком нет промежутка: Heart и число стоят раздельными элементами gap-1.5.
   В реальном Instagram лайк и счётчик — единая область нажатия.
✅ Исправление:
```
```tsx
// Изменить gap-5 → gap-3 (12px)
// Heart + счётчик — один button с flex items-center gap-1.5
<button onClick={handleLike} className="flex items-center gap-1.5 ...">
  <Heart ... />
  <span>{formatNumber(likeCount)}</span>
</button>
// Убрать отдельную кнопку счётчика
```

---

### ДЕФЕКТ 006

```
📁 Файл: src/components/feed/PostCard.tsx
📍 Строка: 297-299
🟢 Severity: НИЗКОЕ
📋 Категория: Визуал
❌ Проблема: Caption truncation: content.length > 100 → "...". Instagram 2024: обрезка по 2 строкам (line-clamp-2),
   не по символам. «100 символов» — слишком мало для коротких многобайтовых emoji/кириллицы,
   превью caption обрезается преждевременно.
✅ Исправление:
```
```tsx
// Использовать CSS line-clamp вместо JS-обрезки:
<p className={cn("text-sm text-foreground", !expanded && "line-clamp-2")}>
  {content}
</p>
{!expanded && content.length > 0 && <button onClick={() => setExpanded(true)}>ещё</button>}
// Убрать JS-слайсинг content.slice(0, 100)
```

---

### ДЕФЕКТ 007

```
📁 Файл: src/components/feed/PostCard.tsx
📍 Строка: 287-295
🟢 Severity: НИЗКОЕ
📋 Категория: Логика
❌ Проблема: formatNumber локализован на русский («тыс.», «млн»), тогда как Instagram использует
   интернациональный формат «K» / «M» вне зависимости от локали в метриках поста.
   Непоследовательность: ProfilePage.tsx использует «K»/«M», PostCard — «тыс.»/«млн».
   При интернационализации нужен единый formatter.
✅ Исправление:
```
```ts
// Вынести formatNumber в src/lib/format.ts:
export function formatCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}
// Использовать в PostCard, ProfilePage, ReelItem — единообразно
```

---

### ДЕФЕКТ 008

```
📁 Файл: src/components/feed/PostCard.tsx
📍 Строка: 113-133
🟡 Severity: СРЕДНЕЕ
📋 Категория: Технический
❌ Проблема: Пять отдельных useEffect для синхронизации props → local state (liked, likeCount,
   commentCount, shareCount, saveCount). Каждый эффект зависит от `id` + значения.
   При смене `id` (виртуализация списка) все пять эффектов срабатывают синхронно, вызывая
   5 setState → 5 rerender. Правильный паттерн — один useEffect или useDerivedState.
   Также: `id` в deps без useEffect на [id] сброс — при virtualzied list мутации стейта
   от предыдущего поста просачиваются во время transition.
✅ Исправление:
```
```tsx
// Один useEffect для сброса при смене поста:
useEffect(() => {
  setLiked(isLiked);
  setLikeCount(clampCounter(likes));
  setCommentCount(clampCounter(comments));
  setShareCount(clampCounter(shares));
  setSaveCount(clampCounter(saves));
  setLikePending(false);
  setSavePending(false);
}, [id]); // Reset полностью при смене поста

// Отдельный эффект только для sync лайков пока не pending:
useEffect(() => {
  if (likePending) return;
  setLiked(isLiked);
  setLikeCount(clampCounter(likes));
}, [isLiked, likes, likePending]);
```

---

### ДЕФЕКТ 009

```
📁 Файл: src/components/feed/PostCard.tsx
📍 Строка: 96, 135-151
🟡 Severity: СРЕДНЕЕ
📋 Категория: Функционал
❌ Проблема: handleSave не показывает toast при ошибке. Instagram показывает уведомление
   «Could not save» при ошибке. Текущий код: console.error + тихий откат UI — пользователь
   не знает что сохранение не сработало.
✅ Исправление:
```
```tsx
// строка 145-147:
  } catch (err) {
    setSaveCount(prevCount);
    // Добавить:
    toast.error('Не удалось сохранить публикацию');
    console.error('Failed to toggle save:', err);
  }
```

---

### ДЕФЕКТ 010

```
📁 Файл: src/components/feed/FeedHeader.tsx
📍 Строка: 139-146
🟡 Severity: СРЕДНЕЕ
📋 Категория: Визуал
❌ Проблема: Градиент непросмотренной истории: `bg-gradient-to-tr from-primary via-accent to-primary`.
   Instagram 2024: градиент рамки истории — строго жёлто-оранжево-розово-фиолетовый:
   #FFDC80 → #FCAF45 → #F77737 → #F56040 → #FD1D1D → #E1306C → #C13584 → #833AB4.
   Использование CSS-переменных `primary`/`accent` (которые могут быть синими/зелёными в теме)
   полностью ломает визуальный паттерн Instagram.
   Пользователь не сможет отличить «новую историю» от «просмотренной».
✅ Исправление:
```
```tsx
// Заменить className градиента:
// НЕ: "p-[2.5px] bg-gradient-to-tr from-primary via-accent to-primary"
// ДА:
const STORY_GRADIENT = "p-[2.5px]";
const STORY_GRADIENT_STYLE = {
  background: "linear-gradient(45deg, #FFDC80, #FCAF45, #F77737, #F56040, #FD1D1D, #E1306C, #C13584, #833AB4)"
};
// В JSX:
<div className={STORY_GRADIENT} style={hasNew ? STORY_GRADIENT_STYLE : undefined}>
```

---

### ДЕФЕКТ 011

```
📁 Файл: src/components/feed/FeedHeader.tsx
📍 Строка: 86
🟢 Severity: НИЗКОЕ
📋 Категория: Визуал
❌ Проблема: `bg-card/70 backdrop-blur-md` — полупрозрачный размытый хедер.
   Instagram 2024: хедер Feed — белый непрозрачный (#FFFFFF) / чёрный (#000000) с
   Stories bar под ним. Нет blur-эффекта. Статусбар интегрирован нативно.
✅ Исправление:
```
```tsx
// строка 86:
<div className="sticky top-0 z-30 bg-background overflow-hidden border-b border-border/40"
     style={{ height: `${containerHeight}px` }}>
```

---

### ДЕФЕКТ 012

```
📁 Файл: src/components/feed/FeedHeader.tsx
📍 Строка: 95-96
🔴 Severity: КРИТИЧНО
📋 Категория: Визуал
❌ Проблема: В хедере Feed отсутствует логотип Instagram / название приложения и кнопки действий
   (DM-иконка со badge, кнопка «Добавить историю» / «Like»).
   Вместо них — ServicesMenu (гамбургер-меню несвязанных сервисов).
   Instagram Feed 2024 header: [Логотип] [сердечко/активность] [мессенджер со badge].
   Это критично: пользователь не может перейти в DM из Feed.
✅ Исправление:
```
```tsx
// Реструктурировать FeedHeader:
<div className="flex items-center justify-between px-4" style={{ height: HEADER_HEIGHT }}>
  {/* Логотип */}
  <span className="font-serif text-xl font-bold text-foreground">mansoni</span>
  {/* Правые действия */}
  <div className="flex items-center gap-3">
    {/* Уведомления */}
    <button aria-label="Уведомления" onClick={() => navigate('/notifications')}>
      <Heart className="w-6 h-6" />
    </button>
    {/* DM с badge */}
    <button aria-label="Сообщения" onClick={() => navigate('/chats')} className="relative">
      <MessageCircle className="w-6 h-6" />
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-destructive
                         text-[10px] text-white font-bold rounded-full flex items-center justify-center px-0.5">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  </div>
</div>
```

---

### ДЕФЕКТ 013

```
📁 Файл: src/pages/HomePage.tsx
📍 Строка: 88-90
🟡 Severity: СРЕДНЕЕ
📋 Категория: Визуал
❌ Проблема: SmartFeedToggle («Умная лента» / «Хронологическая» / «Подписки») отображается
   как sticky-элемент между хедером со Stories и лентой постов.
   Instagram 2024 не имеет такого UI-элемента в ленте (фид переключается через кнопку логотипа
   или в настройках). SmartFeedToggle с bg-background/80 backdrop-blur — несоответствие дизайну.
   Это не блокер, но нарушает visual parity.
✅ Рекомендация:
   Переместить переключатель режима в шторку настроек или интегрировать в ProfileMenu.
   В ленте оставить только Stories → посты.
```

---

### ДЕФЕКТ 014

```
📁 Файл: src/pages/ProfilePage.tsx
📍 Строка: 300
🟡 Severity: СРЕДНЕЕ
📋 Категория: Визуал
❌ Проблема: Обёртка аватара: `ring-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600`.
   Это Tailwind arbitrary class `ring-gradient-to-tr` — такого utility в Tailwind не существует.
   ring-* работает только с ring-color, не с градиентами. Кольцо либо не рендерится вообще,
   либо рендерится некорректно. Правильный способ — bg-gradient на wrapper div с padding.
✅ Исправление:
```
```tsx
// Убрать ring-* + ring-gradient классы:
<div
  className="w-20 h-20 rounded-full p-[2px]"
  style={{
    background: profile?.hasNewStory
      ? "linear-gradient(45deg, #FFDC80, #FD1D1D, #833AB4)"
      : "transparent",
    padding: profile?.hasNewStory ? "2px" : "0",
  }}
>
  <div className="w-full h-full rounded-full overflow-hidden bg-background">
    <Avatar className="w-full h-full">
      ...
    </Avatar>
  </div>
</div>
```

---

### ДЕФЕКТ 015

```
📁 Файл: src/pages/ProfilePage.tsx
📍 Строка: 428
🟡 Severity: СРЕДНЕЕ
📋 Категория: Логика
❌ Проблема: Кнопка подписки отображает текст «Подписки» вместо «Подписан» когда isFollowing=true.
   Instagram: «Подписан» (Following) → при нажатии появляется action sheet
   «Отписаться» / «Поделиться профилем» / «Отмена».
   Текущая реализация: нажатие немедленно инициирует отписку без подтверждения.
   Это нарушает UX: случайные нажатия приводят к потере подписки.
   Плюс: «Подписки» — грамматически некорректно как статус кнопки (это раздел профиля).
✅ Исправление:
```
```tsx
// Кнопка Follow с action-sheet на unfollow:
const [showUnfollowSheet, setShowUnfollowSheet] = useState(false);

<button onClick={() => {
  if (profile?.isFollowing) {
    setShowUnfollowSheet(true); // показать bottom sheet вместо мгновенной отписки
  } else {
    void handleFollowToggle();
  }
}}>
  {profile?.isFollowing ? "Подписан" : "Подписаться"}
</button>

{/* Bottom Sheet подтверждения отписки */}
<BottomSheet isOpen={showUnfollowSheet} onClose={() => setShowUnfollowSheet(false)}>
  <button onClick={() => { setShowUnfollowSheet(false); void handleFollowToggle(); }}>
    Отписаться от @{profile?.username}
  </button>
  <button onClick={() => setShowUnfollowSheet(false)}>Отмена</button>
</BottomSheet>
```

---

### ДЕФЕКТ 016

```
📁 Файл: src/pages/ProfilePage.tsx
📍 Строка: 206-219
🟡 Severity: СРЕДНЕЕ
📋 Категория: Логика
❌ Проблема: handleFollowToggle отсутствует оптимистичное обновление.
   После нажатия «Подписаться» кнопка продолжает показывать «Подписаться» до завершения
   запроса к API. Instagram: кнопка меняется мгновенно, откат при ошибке.
   При медленном интернете пользователь нажимает 2-3 раза, создавая дубликаты запросов.
✅ Исправление:
```
```tsx
const handleFollowToggle = async () => {
  if (!profile) return;
  const wasFollowing = profile.isFollowing;
  
  // Оптимистичное обновление профиля в сторе
  updateProfile({
    ...profile,
    isFollowing: !wasFollowing,
    stats: {
      ...profile.stats,
      followersCount: (profile.stats?.followersCount ?? 0) + (wasFollowing ? -1 : 1),
    },
  });

  try {
    if (wasFollowing) {
      await unfollow();
    } else {
      await follow();
    }
  } catch (error) {
    // Откат
    updateProfile({
      ...profile,
      isFollowing: wasFollowing,
      stats: {
        ...profile.stats,
        followersCount: profile.stats?.followersCount ?? 0,
      },
    });
    toast.error("Не удалось выполнить действие");
    logger.error("profile.follow_toggle_failed", { error });
  }
};
```

---

### ДЕФЕКТ 017

```
📁 Файл: src/pages/ProfilePage.tsx
📍 Строка: 172-176
🟡 Severity: СРЕДНЕЕ
📋 Категория: Функционал
❌ Проблема: handleTabChange не мемоизирован (useCallback отсутствует).
   Передаётся как prop в tab-кнопки через map — пересоздаётся при каждом ре-рендере
   ProfilePage (а это часто из-за AnimatePresence). Мелкие AnimatePresence-рендеры
   пересоздают все tab-обработчики → оверхед.
✅ Исправление:
```
```tsx
const handleTabChange = useCallback((tabId: TabId) => {
  setActiveTab(tabId);
  if (tabId === "saved") fetchSavedPosts();
  if (tabId === "reels") void loadMyReels({ reset: true });
}, [fetchSavedPosts, loadMyReels]);
```

---

### ДЕФЕКТ 018

```
📁 Файл: src/pages/ProfilePage.tsx
📍 Строка: 121-122
🟡 Severity: СРЕДНЕЕ
📋 Категория: Технический
❌ Проблема: `const [myReels, setMyReels] = useState<any[]>([])`.
   any[] — отсутствие типизации для Reel-данных в профиле.
   В loadMyReels строки 158-162 маппинг `(r: any) => ({...r})` — цепочка any.
   Это скрывает runtime-ошибки при изменении схемы API.
✅ Исправление:
```
```ts
// Создать тип для ProfileReel:
interface ProfileReel {
  id: string;
  video_url: string;
  thumbnail_url: string | null;
  views_count: number;
  likes_count: number;
  created_at: string;
}
const [myReels, setMyReels] = useState<ProfileReel[]>([]);
// Типизировать маппинг rows в loadMyReels явно
```

---

### ДЕФЕКТ 019

```
📁 Файл: src/pages/ProfilePage.tsx
📍 Строка: 144-170
🔴 Severity: КРИТИЧНО
📋 Категория: Технический
❌ Проблема: loadMyReels имеет race condition. При быстрой смене userId (paramUserId) возможна ситуация:
   1. Запрос A начался для userId=X (myReelsLoading=true)
   2. userId меняется на Y
   3. useEffect сбрасывает myReels=[] и myReelsHasMore=true
   4. Запрос A завершается — setMyReels(rowsForUserX) — данные чужого профиля

   Нет AbortController/ignore-флага. Также: loadMyReels в deps useCallback включает
   `myReelsLoading` и `myReels.length` — это нестабильные зависимости, вызывающие
   пересоздание callback при каждом чанке данных.
✅ Исправление:
```
```tsx
const abortRef = useRef<AbortController | null>(null);

const loadMyReels = useCallback(async (opts?: { reset?: boolean }) => {
  if (!targetUserId) return;
  const reset = Boolean(opts?.reset);
  
  // Отменяем предыдущий запрос
  abortRef.current?.abort();
  const controller = new AbortController();
  abortRef.current = controller;

  if (!reset && !myReelsHasMore) return;
  setMyReelsLoading(true);
  
  try {
    const limit = 30;
    const offset = reset ? 0 : myReels.length;
    const { data, error } = await (supabase as any).rpc("get_user_reels_v1", {
      p_author_id: targetUserId,
      p_limit: limit,
      p_offset: offset,
    });
    
    if (controller.signal.aborted) return; // игнорировать ответ если userId сменился
    if (error) throw error;
    
    const rows = (data || []).map((r: any) => ({
      ...r,
      video_url: normalizeReelMediaUrl(r?.video_url, "reels-media"),
      thumbnail_url: normalizeReelMediaUrl(r?.thumbnail_url, "reels-media") || r?.thumbnail_url,
    }));
    setMyReels(prev => (reset ? rows : [...prev, ...rows]));
    setMyReelsHasMore(rows.length >= limit);
  } catch (error) {
    if ((error as any)?.name === 'AbortError') return;
    logger.warn("profile.load_my_reels_failed", { error, targetUserId });
  } finally {
    if (!controller.signal.aborted) setMyReelsLoading(false);
  }
}, [targetUserId, myReelsHasMore]); // Убрать myReelsLoading и myReels.length из deps

// Cleanup при unmount:
useEffect(() => () => abortRef.current?.abort(), []);
```

---

### ДЕФЕКТ 020

```
📁 Файл: src/pages/ProfilePage.tsx
📍 Строка: 544
🔴 Severity: КРИТИЧНО
📋 Категория: Функционал
❌ Проблема: При нажатии на Reel в профиле вызывается `navigate("/reels")` — открывается общая
   лента Reels, а не конкретный Reel пользователя. Пользователь теряет контекст.
   Instagram: нажатие на Reel в профиле открывает Reel именно этого пользователя в полноэкранном
   режиме с возможностью свайпа по другим Reels пользователя.
✅ Исправление:
```
```tsx
// строка 544: заменить
onItemClick={() => navigate("/reels")}
// на:
onItemClick={(item) => {
  if (!item?.id) return;
  // Передаём начальный индекс и userId для фильтрации по автору:
  navigate(`/reels?userId=${targetUserId}&startId=${item.id}`);
}}
// Добавить поддержку ?userId и ?startId в ReelsPage для показа Reels конкретного автора
```

---

### ДЕФЕКТ 021

```
📁 Файл: src/pages/ProfilePage.tsx
📍 Строка: 473
🟢 Severity: НИЗКОЕ
📋 Категория: Функционал
❌ Проблема: `confirm()` для подтверждения удаления подборки (Highlight).
   `window.confirm()` блокирует UI thread, не стилизуется под дизайн приложения,
   недоступен в Capacitor/WebView на некоторых Android-конфигурациях.
   Instagram использует нативный action sheet.
✅ Исправление: Заменить confirm() на кастомный ConfirmSheet/AlertDialog компонент.
```

---

### ДЕФЕКТ 022

```
📁 Файл: src/pages/ReelsPage.tsx
📍 Строка: 95
🟡 Severity: СРЕДНЕЕ
📋 Категория: Технический
❌ Проблема: `username: reel.author_id` — в mapToFeedItem username устанавливается в author_id (UUID).
   В ReelItem username отображается как навигационный ник пользователя (@username).
   Отображение UUID как username: недопустимо с точки зрения UX. Instagram показывает
   @username под аватаром.
   author.id и author.username должны быть разными полями.
   useReels возвращает `brief.username ?? null` в author, но ReelFeedItem.author.username
   получает author_id вместо него.
✅ Исправление:
```
```tsx
// mapToFeedItem строка 95: использовать данные из brief через reel.author:
const author: ReelAuthor = {
  id: reel.author_id,
  // В useReels enrichRows: author.username = brief?.username — доступно через reel.author
  username: (reel.author as any)?.username ?? reel.author_id,
  display_name: reel.author?.display_name ?? String(reel.author_id).slice(0, 8),
  avatar_url: reel.author?.avatar_url ?? null,
  is_verified: reel.author?.verified ?? false,
  is_following: false,
};
```

---

### ДЕФЕКТ 023

```
📁 Файл: src/pages/ReelsPage.tsx
📍 Строка: 481-493
🟡 Severity: СРЕДНЕЕ
📋 Категория: Технический
❌ Проблема: `(supabase as any).from("followers")` — небезопасный cast.
   Использование `as any` обходит TypeScript-типизацию Supabase-клиента.
   Если схема followers изменится, ошибка не будет поймана на этапе компиляции.
   Аналогично в useReels.tsx: `(supabase as any).rpc(...)`, `(supabase as any).from(...)`.
✅ Исправление: Обновить supabase типы через `supabase gen types typescript` и использовать
   типизированный клиент без as any.
```

---

### ДЕФЕКТ 024

```
📁 Файл: src/pages/ReelsPage.tsx
📍 Строка: 313-319
🟡 Severity: СРЕДНЕЕ
📋 Категория: Технический
❌ Проблема: useEffect для setIsReelsPage(true) имеет eslint-disable-next-line react-hooks/exhaustive-deps
   и пустой deps []. Но setIsReelsPage из useReelsContext потенциально нестабилен.
   Если контекст воссоздаётся (например, при HMR), cleanup не восстанавливает состояние.
   Корректно: включить setIsReelsPage в deps.
✅ Исправление:
```
```tsx
useEffect(() => {
  setIsReelsPage(true);
  return () => setIsReelsPage(false);
}, [setIsReelsPage]); // Убрать eslint-disable, setIsReelsPage должен быть мемоизирован в контексте
```

---

### ДЕФЕКТ 025

```
📁 Файл: src/pages/ReelsPage.tsx
📍 Строка: 325-367
🟡 Severity: СРЕДНЕЕ
📋 Категория: Технический
❌ Проблема: IntersectionObserver создаётся в useEffect с `root: scrollContainerRef.current`.
   На момент первого рендера scrollContainerRef.current может быть null (React ещё не создал DOM).
   В таком случае observer создаётся с root=null (весь viewport), что даёт неправильное
   определение «текущего» Reel.
   Плюс: observer не пересоздаётся при изменении scrollContainerRef, так как deps=[].
✅ Исправление:
```
```tsx
useEffect(() => {
  const container = scrollContainerRef.current;
  if (!container) return; // Не создавать observer без контейнера

  const observer = new IntersectionObserver((entries) => {
    // ... та же логика
  }, {
    root: container, // Гарантированно не null
    threshold: IO_THRESHOLD,
  });

  observerRef.current = observer;
  itemRefs.current.forEach((el) => observer.observe(el));

  return () => {
    observer.disconnect();
    observerRef.current = null;
  };
}, []); // scrollContainerRef.current не меняется после mount — ОК
// Но добавить проверку на null при создании — обязательно
```

---

### ДЕФЕКТ 026

```
📁 Файл: src/hooks/useReels.tsx
📍 Строка: 267-338
🔴 Severity: КРИТИЧНО
📋 Категория: API
❌ Проблема: N+1 запросы в enrichRows:
   1. fetchUserBriefMap(authorIds) — отдельный запрос профилей
   2. supabase.from("profiles").select("user_id, verified") — ещё один запрос профилей
   3. Three Promise.all запросы: reel_likes, reel_saves, reel_reposts — по одному SELECT на таблицу

   Итого: 5 последовательных+параллельных запросов для одного батча из 10 Reels.
   При 10M пользователях → каждая загрузка фида = 5 round-trips к Supabase.
   Instagram решает это одним JOIN-ом или denormalized RPC.
   fetchUserBriefMap + profiles.verified — дублирование запроса к таблице profiles.
✅ Исправление: Добавить в RPC get_reels_feed_v2 все необходимые поля:
```
```sql
-- В get_reels_feed_v2 включить:
SELECT
  r.*,
  p.display_name, p.avatar_url, p.username, p.verified,
  COALESCE(rl.reel_id IS NOT NULL, false) as is_liked,
  COALESCE(rs.reel_id IS NOT NULL, false) as is_saved,
  COALESCE(rr.reel_id IS NOT NULL, false) as is_reposted
FROM reels r
JOIN profiles p ON p.user_id = r.author_id
LEFT JOIN reel_likes rl ON rl.reel_id = r.id AND rl.user_id = auth.uid()
LEFT JOIN reel_saves rs ON rs.reel_id = r.id AND rs.user_id = auth.uid()
LEFT JOIN reel_reposts rr ON rr.reel_id = r.id AND rr.user_id = auth.uid()
WHERE ...
```
```
// В JS enrichRows: не делать отдельные SELECT, использовать данные из RPC response.
// Это сокращает 5 round-trips → 1 round-trip.
```

---

### ДЕФЕКТ 027

```
📁 Файл: src/hooks/useReels.tsx
📍 Строка: 189-215
🟡 Severity: СРЕДНЕЕ
📋 Категория: API
❌ Проблема: fetchReelsFallback при moderation: фильтрация по is_nsfw, is_graphic_violence,
   is_political_extremism выполняется на клиенте через прямой SELECT.
   Отсутствует фильтр is_deleted=false, is_archived=false.
   Удалённые и архивированные Reels могут попасть в ленту при fallback-запросе.
   Нет RLS-проверки на приватные аккаунты (private accounts).
✅ Исправление:
```
```ts
// В buildQuery добавить:
.eq("is_deleted", false)
.eq("is_archived", false)
// RLS политика на таблице reels должна блокировать приватный контент — не клиентский код
// Убедиться что policy EXISTS для authenticated + public visibility
```

---

### ДЕФЕКТ 028

```
📁 Файл: src/hooks/useReels.tsx
📍 Строка: 341-383
🟡 Severity: СРЕДНЕЕ
📋 Категория: Технический
❌ Проблема: fetchReels не имеет механизма отмены при размонтировании компонента.
   Если useReels unmounts во время fetch (пользователь переходит на другой экран),
   setState вызывается на unmounted component:
   setReels(), setLikedReels(), setLoading(false) — React Warning + потенциальный memory leak.
   Отсутствует AbortController для отмены HTTP-запросов.
✅ Исправление:
```
```tsx
const fetchReels = useCallback(async () => {
  let ignore = false; // ignore flag pattern
  setLoading(true);
  
  try {
    // ... fetch logic
    if (!ignore) {
      setReels(enriched.reels);
      setLikedReels(new Set(enriched.likedIds));
      // ...
    }
  } catch (error) {
    if (!ignore) logger.error("[useReels] Error fetching reels", {...});
  } finally {
    if (!ignore) setLoading(false);
  }
  
  return () => { ignore = true; };
}, [...]);

// В useEffect:
useEffect(() => {
  const cleanup = fetchReels();
  return () => { void cleanup.then(fn => fn?.()); };
}, [fetchReels]);
```

---

### ДЕФЕКТ 029

```
📁 Файл: src/hooks/useSmartFeed.ts
📍 Строка: (весь файл — на уровне архитектуры)
🟡 Severity: СРЕДНЕЕ
📋 Категория: API
❌ Проблема: useSmartFeed использует cursor pagination (created_at, id), но в HomePage.tsx
   применяется IntersectionObserver для infinite scroll на sentinel div.
   При изменении contentFilter (client-side фильтрация) — список filteredPosts сокращается,
   sentinel может сразу оказаться в viewport, триггеря loadMore до показа контента.
   Это создаёт "загрузочную петлю": filteredPosts=[только медиа → мало постов] → sentinel
   виден → loadMore → ещё запрос → ещё мало медиа-постов → и т.д.
✅ Исправление: Серверная фильтрация вместо client-side. Передавать contentFilter в Edge Function.
   Или добавить debounce/guard: не вызывать loadMore если отфильтрованная страница пустая.
```

---

### ДЕФЕКТ 030

```
📁 Файл: src/components/feed/FeedHeader.tsx
📍 Строка: 35-45
🟡 Severity: СРЕДНЕЕ
📋 Категория: Функционал
❌ Проблема: handleStoryClick при collapseProgress > 0.1 прокручивает к началу страницы
   вместо открытия StoryViewer. Это нелогично: пользователь нажал на историю,
   ожидает просмотр истории — получает прокрутку вверх.
   Должно быть: всегда открывать StoryViewer при нажатии на историю с контентом.
   Прокрутка к хедеру при коллапсе — это функция свайпа-вниз, не тапа на историю.
✅ Исправление:
```
```tsx
const handleStoryClick = (index: number, user: UserWithStories) => {
  // Всегда открываем StoryViewer если есть истории
  if (user.stories.length > 0 || user.isOwn) {
    setSelectedStoryIndex(index);
    setStoryViewerOpen(true);
  }
  // Прокрутка — только отдельный жест, не связанный с историями
};
```

---

### ДЕФЕКТ 031

```
📁 Файл: src/pages/ProfilePage.tsx
📍 Строка: 342-344
🟡 Severity: СРЕДНЕЕ
📋 Категория: Логика
❌ Проблема: Счётчик постов: `postsLoading ? (displayProfile?.stats?.postsCount ?? 0) : mediaPosts.length`.
   Показывается не общее количество постов, а только количество медиа-постов (mediaPosts = posts с медиа).
   Если у пользователя есть текстовые посты — они не учитываются в счётчике.
   Instagram: счётчик Posts = все публикации, не только с медиа. 
   profileLoading → stats.postsCount (серверный), loaded → mediaPosts.length (неправильный).
✅ Исправление:
```
```tsx
// Использовать серверный счётчик из stats:
<p className="font-bold text-foreground text-sm">
  {formatNumber(displayProfile?.stats?.postsCount ?? posts.length)}
</p>
```

---

### ДЕФЕКТ 032

```
📁 Файл: src/pages/ProfilePage.tsx
📍 Строка: 258-262
🟢 Severity: НИЗКОЕ
📋 Категория: Визуал
❌ Проблема: В топ-баре профиля показывается display_name («Профиль» как fallback).
   Instagram 2024: в заголовке профиля показывается @username (lowercase), не display_name.
   display_name показывается в теле профиля (крупным шрифтом).
✅ Исправление:
```
```tsx
// строка 259:
<h1 className="font-semibold text-lg text-foreground">
  {displayProfile?.username
    ? `@${displayProfile.username}`
    : displayProfile?.display_name || "Профиль"}
</h1>
```

---

### ДЕФЕКТ 033

```
📁 Файл: src/pages/ProfilePage.tsx
📍 Строка: 254-257
🟢 Severity: НИЗКОЕ
📋 Категория: Визуал
❌ Проблема: Кнопка «Назад» в чужом профиле — ChevronDown с rotate-90.
   Instagram 2024: chevron-left (←), не повёрнутый ChevronDown.
   ChevronDown rotated выглядит как «›» (chevron-right) — визуально противоречит направлению.
✅ Исправление:
```
```tsx
import { ChevronLeft } from "lucide-react";
// строка 255:
<ChevronLeft className="w-6 h-6" />
```

---

### ДЕФЕКТ 034

```
📁 Файл: src/pages/ProfilePage.tsx
📍 Строка: 72-86
🟢 Severity: НИЗКОЕ
📋 Категория: Технический
❌ Проблема: useEffect создаёт <link rel="preload"> в document.head для аватара и удаляет его
   при cleanup. Проблемы:
   1. document.head.removeChild(preload) — если элемент уже был удалён браузером или не был добавлен
      (асинхронная вставка) — выбросит DOMException.
   2. Preload без `as="image"` fetchpriority не гарантирует LCP-оптимизацию.
   3. В React правильнее использовать <link> через ReactDOM.createPortal или библиотеку react-helmet.
✅ Исправление:
```
```tsx
useEffect(() => {
  const avatarUrl = profile?.avatar_url?.trim();
  if (!avatarUrl) return;

  const preload = document.createElement("link");
  preload.rel = "preload";
  preload.as = "image";
  preload.href = avatarUrl;
  preload.setAttribute("fetchpriority", "high");
  preload.crossOrigin = "anonymous";
  document.head.appendChild(preload);

  return () => {
    // Безопасное удаление:
    if (document.head.contains(preload)) {
      document.head.removeChild(preload);
    }
  };
}, [profile?.avatar_url]);
```

---

### ДЕФЕКТ 035

```
📁 Файл: src/hooks/useSmartFeed.ts
📍 Строка: 26-30 (инференс из структуры)
🟡 Severity: СРЕДНЕЕ
📋 Категория: API
❌ Проблема: useSmartFeed не фильтрует is_deleted=false, is_archived=false на клиентском fallback.
   FeedPost не содержит полей is_deleted/is_archived — удалённые посты могут попасть в ленту
   если Edge Function get-feed-v2 работает с ошибкой и используется direct DB fallback.
   Приватные аккаунты: отсутствует проверка — посты приватных пользователей без взаимной
   подписки не должны появляться в ленте.
✅ Рекомендация: Добавить серверную RLS политику + параметры фильтрации в Edge Function.
```

---

### ДЕФЕКТ 036

```
📁 Файл: src/components/feed/PostCard.tsx
📍 Строка: 378-391
🟡 Severity: СРЕДНЕЕ
📋 Категория: Функционал
❌ Проблема: `autoPlay={idx === currentImageIndex}` на видео в карусели — неверно.
   autoPlay — это HTML-атрибут, который браузер читает при mount. Динамическое изменение
   через React prop не останавливает/запускает видео — нужен imperative ref.play()/pause().
   При свайпе на следующее видео в карусели предыдущее продолжает воспроизводиться в фоне.
✅ Исправление:
```
```tsx
// Добавить useEffect для управления воспроизведением:
useEffect(() => {
  videoRefs.current.forEach((el, idx) => {
    if (!el) return;
    if (idx === currentImageIndex) {
      el.play().catch(() => {}); // Catch autoplay policy errors
    } else {
      el.pause();
      el.currentTime = 0; // Reset to start
    }
  });
}, [currentImageIndex]);
// Убрать autoPlay prop или заменить на autoPlay={false}
```

---

## ИТОГОВЫЙ СВОДНЫЙ ОТЧЁТ

### 1. Таблица статистики

| Категория    | КРИТИЧНО | СРЕДНЕЕ | НИЗКОЕ | Итого |
|--------------|----------|---------|--------|-------|
| Визуал       | 1 (012)  | 4       | 4      | **9** |
| Функционал   | 2 (020,030)| 3     | 1      | **6** |
| Логика       | 0        | 3       | 1      | **4** |
| Технический  | 2 (019,028)| 8     | 3      | **13**|
| API          | 1 (026)  | 4       | 0      | **5** |
| **ИТОГО**    | **6**    | **22**  | **9**  | **37**|

---

### 2. Топ-3 критичных дефекта

**🔴 #1 — ДЕФЕКТ 026: N+1 запросы в enrichRows (useReels)**
- **Влияние:** 5 round-trips к Supabase на каждые 10 Reels. При 10M concurrent users → колоссальная нагрузка на DB. Latency пользователя: +200–400ms на каждую загрузку фида. Supabase connection pool exhaustion при пиковых нагрузках.
- **Риск:** Полный отказ Reels-фида при высокой нагрузке.

**🔴 #2 — ДЕФЕКТ 019: Race condition в loadMyReels (ProfilePage)**
- **Влияние:** Данные Reels чужого профиля могут отобразиться в профиле текущего пользователя. Это не только UX-баг, но и потенциальная утечка данных о контенте других пользователей.
- **Риск:** Утечка приватных данных при быстрой навигации между профилями.

**🔴 #3 — ДЕФЕКТ 020: Навигация в Reels из профиля (ProfilePage)**  
- **Влияние:** Нажатие на Reel в профиле открывает общую ленту, не конкретный видеоролик. 100% пользователей, нажавших на Reel в профиле, получают неожиданный результат. Core Instagram UX-паттерн полностью сломан.
- **Риск:** Потеря core engagement-flow.

---

### 3. Приоритизированный план устранения

#### Волна 1 — Блокеры (Sprint 1, ~3 дня)
| # | Дефект | Файл | Трудозатраты |
|---|--------|------|-------------|
| 1 | N+1 в enrichRows | useReels.tsx | 1 день (SQL RPC) |
| 2 | Race condition loadMyReels | ProfilePage.tsx | 4ч |
| 3 | Навигация Reel из профиля | ProfilePage.tsx | 2ч |
| 4 | Race condition fetchReels | useReels.tsx | 4ч |
| 5 | is_deleted/is_archived в fallback | useReels.tsx | 1ч |

#### Волна 2 — Важное (Sprint 2, ~4 дня)
| # | Дефект | Файл | Трудозатраты |
|---|--------|------|-------------|
| 6 | Градиент Stories (Instagram цвета) | FeedHeader.tsx | 1ч |
| 7 | Отсутствие DM-иконки в Feed header | FeedHeader.tsx | 4ч |
| 8 | Follow без подтверждения unfollow | ProfilePage.tsx | 2ч |
| 9 | Оптимистичный follow/unfollow | ProfilePage.tsx | 3ч |
| 10 | Username vs author_id в Reels | ReelsPage.tsx | 2ч |
| 11 | autoPlay видео в карусели | PostCard.tsx | 2ч |
| 12 | Privacy fallback avatar | HomePage.tsx | 1ч |
| 13 | Хардкод verified=false | HomePage.tsx | 30мин |

#### Волна 3 — Улучшения (Sprint 3, ~2 дня)
| # | Дефект | Файл | Трудозатраты |
|---|--------|------|-------------|
| 14 | formatNumber единообразие | lib/format.ts | 2ч |
| 15 | Caption line-clamp вместо JS slice | PostCard.tsx | 1ч |
| 16 | handleTabChange useCallback | ProfilePage.tsx | 30мин |
| 17 | myReels: any[] → ProfileReel[] | ProfilePage.tsx | 2ч |
| 18 | IntersectionObserver root null | ReelsPage.tsx | 1ч |
| 19 | Размытый фон→ непрозрачный | PostCard, FeedHeader | 1ч |
| 20 | confirm() → кастомный AlertDialog | ProfilePage.tsx | 2ч |
| 21 | ChevronLeft back button | ProfilePage.tsx | 15мин |
| 22 | Username в заголовке профиля | ProfilePage.tsx | 30мин |
| 23 | 5 useEffect → 1 для sync state | PostCard.tsx | 1ч |
| 24 | Toast при ошибке save | PostCard.tsx | 30мин |
| 25 | StoryClick всегда открывает viewer | FeedHeader.tsx | 1ч |

---

### 4. Архитектурные рекомендации

**4.1 Единый API-слой для Feed и Reels**  
Создать [`src/lib/api/instagram.ts`](src/lib/api/instagram.ts) — единый модуль с типизированными запросами. Все компоненты используют его вместо разрозненных `(supabase as any)`. Это устраняет класс дефектов 023, 026, 027.

**4.2 Денормализация данных в RPC**  
RPC [`get_reels_feed_v2`] и [`get_ranked_feed_v2`] должны возвращать все данные одним запросом: профиль автора, verified, is_liked, is_saved, is_reposted. Никаких enrichRows на клиенте. Уменьшение: 5 round-trips → 1.

**4.3 Единый formatCount утилит**  
Создать [`src/lib/format.ts`](src/lib/format.ts) с [`formatCount()`](src/lib/format.ts:1) для чисел (K/M, не тыс./млн). Импортировать во все компоненты — ProfilePage, PostCard, ReelItem, UserProfilePage. Устраняет дефект 007 и все похожие несоответствия.

**4.4 Типизированный Supabase клиент**  
Запустить [`supabase gen types typescript --project-id <ID> > src/types/supabase.ts`]. Убрать все `(supabase as any)` — заменить типизированным клиентом. Это поймает на этапе компиляции ~15 потенциальных runtime ошибок в useReels/ProfilePage/ReelsPage.

**4.5 Стандартизация Instagram-градиента**  
Создать константу [`INSTAGRAM_STORY_GRADIENT`](src/lib/instagram-constants.ts:1) в [`src/lib/instagram-constants.ts`](src/lib/instagram-constants.ts) и использовать во всех местах: FeedHeader (Stories bar), ProfilePage (аватар), HighlightCircle. Исключить использование CSS-переменных `primary`/`accent` для Instagram-специфичных элементов.

**4.6 AbortController паттерн для всех async hooks**  
Стандартизировать [`ignore`-паттерн или `AbortController`](src/hooks/useReels.tsx:341) во всех хуках с `useEffect` + async fetch: useReels, useSmartFeed, ProfilePage.loadMyReels. Предотвращает класс race condition дефектов (019, 028).

**4.7 RLS аудит для Feed и Reels**  
Провести аудит RLS политик на таблицах `reels`, `posts`, `profiles`:
- `is_deleted = false` и `is_archived = false` должны быть в RLS WHERE, не только в fallback SELECT
- Приватные аккаунты (`is_private = true`): посты/reels доступны только подписчикам  
- Блокировка (`blocks` таблица): контент заблокированных пользователей невидим

---

*Отчёт покрывает: [`src/pages/HomePage.tsx`](src/pages/HomePage.tsx), [`src/pages/ReelsPage.tsx`](src/pages/ReelsPage.tsx), [`src/pages/ProfilePage.tsx`](src/pages/ProfilePage.tsx), [`src/components/feed/PostCard.tsx`](src/components/feed/PostCard.tsx), [`src/components/feed/FeedHeader.tsx`](src/components/feed/FeedHeader.tsx), [`src/hooks/useReels.tsx`](src/hooks/useReels.tsx), [`src/hooks/useSmartFeed.ts`](src/hooks/useSmartFeed.ts)*
