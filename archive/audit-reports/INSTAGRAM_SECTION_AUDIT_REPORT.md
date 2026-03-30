# INSTAGRAM SECTION — ИСЧЕРПЫВАЮЩИЙ ЭКСПЕРТНЫЙ АУДИТ
**Дата:** 2026-03-26  
**Охват:** Feed, Reels, Profile, Stories, Navigation  
**Файлов проверено:** 14 (+ дочерние компоненты)  
**Стандарт:** Instagram 2024 (нативный дизайн)

---

## ДЕФЕКТ #1

📁 **Файл:** [`src/pages/HomePage.tsx`](src/pages/HomePage.tsx:145)  
📍 **Строка:** 145  
🔴 **Severity:** КРИТИЧНО  
📋 **Категория:** Визуал / API  
❌ **Проблема:** `pravatar.cc` — внешний сервис-заглушка используется как fallback для аватаров авторов постов. В продакшне это: (1) утечка пользовательских ID на сторонний сервис; (2) нарушение GDPR/152-ФЗ; (3) при недоступности сервиса — broken images в ленте. Instagram никогда не использует внешние CDN для аватаров пользователей.

```tsx
// ❌ ТЕКУЩИЙ КОД (строка 145):
avatar: post.author?.avatar_url || `https://i.pravatar.cc/150?u=${safeAuthorId}`,

// ✅ ИСПРАВЛЕНИЕ — использовать локальный fallback без внешних запросов:
avatar: post.author?.avatar_url || '',
// В PostCard компоненте AvatarFallback уже обрабатывает пустой src через initials.
// Если нужен детерминированный цвет — использовать хэш userId для CSS-класса.
```

---

## ДЕФЕКТ #2

📁 **Файл:** [`src/pages/HomePage.tsx`](src/pages/HomePage.tsx:146)  
📍 **Строка:** 146  
🟡 **Severity:** СРЕДНЕЕ  
📋 **Категория:** Логика  
❌ **Проблема:** `verified: false` — захардкожено для всех постов в ленте. Поле `is_verified` приходит из `FeedAuthor` (строка 40 `useSmartFeed.ts`), но в `HomePage` оно игнорируется и всегда передаётся `false`. Верифицированные пользователи не получают бейдж в ленте.

```tsx
// ❌ ТЕКУЩИЙ КОД (строка 146):
verified: false,

// ✅ ИСПРАВЛЕНИЕ:
verified: post.author?.is_verified ?? false,
// FeedAuthor.is_verified уже присутствует в типе (useSmartFeed.ts:40)
// и заполняется из profiles.is_verified в fetchPublicFeedPage (строка 205)
```

---

## ДЕФЕКТ #3

📁 **Файл:** [`src/hooks/useComments.tsx`](src/hooks/useComments.tsx:156)  
📍 **Строка:** 156–186  
🔴 **Severity:** КРИТИЧНО  
📋 **Категория:** Технический / API  
❌ **Проблема:** `addComment` после успешного INSERT вызывает `await fetchComments()` — полный рефетч всего списка комментариев. Это: (1) N+1 паттерн — при каждом новом комментарии перезагружаются все комментарии + профили + лайки; (2) race condition — если пользователь быстро добавляет 2 комментария, второй `fetchComments` может вернуться раньше первого, затирая результат; (3) UX-регрессия — список мигает (loading=true → false) после каждого комментария, Instagram этого не делает.

```tsx
// ❌ ТЕКУЩИЙ КОД (строка 180-181):
// Refetch to get the updated list with author info
await fetchComments();

// ✅ ИСПРАВЛЕНИЕ — оптимистичное добавление без рефетча:
const addComment = async (content: string, parentId?: string) => {
  if (!user) return { error: "Необходимо войти в систему" };

  try {
    const hashtagVerdict = await checkHashtagsAllowedForText(String(content || "").trim());
    if (!hashtagVerdict.ok) {
      return { error: `HASHTAG_BLOCKED:${("blockedTags" in hashtagVerdict ? hashtagVerdict.blockedTags : []).join(", ")}` };
    }

    const { data, error } = await (supabase
      .from("comments" as any)
      .insert({
        post_id: postId,
        author_id: user.id,
        parent_id: parentId || null,
        content,
      })
      .select()
      .single() as any);

    if (error) throw error;

    // Оптимистичное добавление — строим объект Comment из известных данных
    const newComment: Comment = {
      id: data.id,
      post_id: postId,
      author_id: user.id,
      parent_id: parentId || null,
      content,
      likes_count: 0,
      created_at: data.created_at ?? new Date().toISOString(),
      author: {
        display_name: user.user_metadata?.display_name || user.email?.split('@')[0] || 'Вы',
        avatar_url: user.user_metadata?.avatar_url || null,
        user_id: user.id,
        verified: false,
      },
      liked_by_user: false,
      replies: [],
    };

    if (parentId) {
      // Добавляем как reply к родительскому комментарию
      setComments(prev => prev.map(c =>
        c.id === parentId
          ? { ...c, replies: [...(c.replies || []), newComment] }
          : c
      ));
    } else {
      // Добавляем в конец списка (хронологический порядок)
      setComments(prev => [...prev, newComment]);
    }

    return { error: null, comment: data };
  } catch (err: any) {
    console.error("Error adding comment:", err);
    return { error: err.message || "Ошибка добавления комментария" };
  }
};
```

---

## ДЕФЕКТ #4

📁 **Файл:** [`src/hooks/useComments.tsx`](src/hooks/useComments.tsx:46)  
📍 **Строка:** 46–148  
🔴 **Severity:** КРИТИЧНО  
📋 **Категория:** Технический  
❌ **Проблема:** `fetchComments` не имеет `ignore`-флага для предотвращения setState после unmount. Если `CommentsSheet` закрывается пока идёт запрос — React выбросит warning "Can't perform a React state update on an unmounted component". При быстром открытии/закрытии шита возможен race condition: старый запрос завершается после нового и перезаписывает актуальные данные.

```tsx
// ✅ ИСПРАВЛЕНИЕ — добавить ignore-флаг в useEffect:
useEffect(() => {
  if (!postId) return;
  let ignore = false;

  const run = async () => {
    // ... весь код fetchComments ...
    if (!ignore) {
      setComments(topLevel);
      setLoading(false);
    }
  };

  run();
  return () => { ignore = true; };
}, [postId, user?.id]); // убрать fetchComments из deps — инлайнить логику
```

---

## ДЕФЕКТ #5

📁 **Файл:** [`src/hooks/useStories.tsx`](src/hooks/useStories.tsx:211)  
📍 **Строка:** 211–226  
🔴 **Severity:** КРИТИЧНО  
📋 **Категория:** Технический  
❌ **Проблема:** Realtime-подписка на `stories-changes` имеет `[fetchStories]` в deps массиве useEffect. `fetchStories` — это `useCallback` с `[user]` в deps. При каждом ре-рендере компонента, использующего `useStories`, если `user` объект пересоздаётся (что происходит при каждом рендере `useAuth`), `fetchStories` получает новую ссылку → useEffect пересоздаёт канал → старый канал не отписывается корректно → **утечка Supabase realtime-каналов**. При 10M пользователях это критично для серверной нагрузки.

```tsx
// ✅ ИСПРАВЛЕНИЕ — стабилизировать ссылку через useRef:
const fetchStoriesRef = useRef(fetchStories);
useEffect(() => { fetchStoriesRef.current = fetchStories; }, [fetchStories]);

useEffect(() => {
  const channel = supabase
    .channel('stories-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'stories' }, () => {
      fetchStoriesRef.current(); // всегда актуальная ссылка, канал не пересоздаётся
    })
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}, []); // пустой deps — канал создаётся один раз
```

---

## ДЕФЕКТ #6

📁 **Файл:** [`src/components/feed/PostCard.tsx`](src/components/feed/PostCard.tsx:113)  
📍 **Строка:** 113–133  
🟡 **Severity:** СРЕДНЕЕ  
📋 **Категория:** Технический  
❌ **Проблема:** 5 отдельных `useEffect` для синхронизации props → state (liked, likeCount, commentCount, shareCount, saveCount). Каждый из них имеет `[id, ...]` в deps, что означает 5 отдельных эффектов при каждом изменении `id`. Это избыточно и создаёт 5 микро-задач вместо одной. Кроме того, `PostCard` не обёрнут в `React.memo`, что означает ре-рендер при каждом изменении родительского компонента (критично для FlatList с 20+ постами).

```tsx
// ✅ ИСПРАВЛЕНИЕ — объединить в один useEffect + React.memo:
export const PostCard = memo(function PostCard({ ... }: PostCardProps) {
  // ...
  
  // Один useEffect вместо пяти
  useEffect(() => {
    if (likePending) return;
    setLiked(isLiked);
    setLikeCount(clampCounter(likes));
  }, [id, isLiked, likes, likePending]);

  useEffect(() => {
    setCommentCount(clampCounter(comments));
    setShareCount(clampCounter(shares));
    setSaveCount(clampCounter(saves));
  }, [id, comments, shares, saves]);
  
  // ...
});
```

---

## ДЕФЕКТ #7

📁 **Файл:** [`src/components/feed/PostCard.tsx`](src/components/feed/PostCard.tsx:135)  
📍 **Строка:** 135–151  
🟡 **Severity:** СРЕДНЕЕ  
📋 **Категория:** Логика  
❌ **Проблема:** `handleSave` при ошибке откатывает `saveCount`, но **не откатывает** визуальное состояние `saved` (которое управляется через `useSavedPosts.isSaved(id)`). Пользователь видит несоответствие: счётчик откатился, но иконка закладки осталась заполненной (или наоборот). Также отсутствует `toast.error` при ошибке сохранения — пользователь не знает, что действие не выполнено.

```tsx
// ✅ ИСПРАВЛЕНИЕ:
const handleSave = async () => {
  if (!id || savePending) return;

  const prevSaved = saved;
  const prevCount = saveCount;
  setSaveCount((count) => (prevSaved ? Math.max(0, count - 1) : count + 1));
  setSavePending(true);

  try {
    await toggleSave(id);
    // toggleSave обновляет useSavedPosts store — isSaved(id) изменится автоматически
  } catch (err) {
    // Откат счётчика
    setSaveCount(prevCount);
    // Показываем ошибку пользователю (Instagram показывает toast)
    toast.error('Не удалось сохранить публикацию');
    console.error('Failed to toggle save:', err);
  } finally {
    setSavePending(false);
  }
};
```

---

## ДЕФЕКТ #8

📁 **Файл:** [`src/components/feed/PostCard.tsx`](src/components/feed/PostCard.tsx:297)  
📍 **Строка:** 297–299  
🟡 **Severity:** СРЕДНЕЕ  
📋 **Категория:** Визуал / Логика  
❌ **Проблема:** Caption обрезается по 100 символам без учёта слов — обрезка происходит посередине слова. Instagram обрезает по 125 символам и всегда по границе слова. Также `content.length > 100` проверяется дважды (строки 297 и 516), что нарушает DRY.

```tsx
// ✅ ИСПРАВЛЕНИЕ — обрезка по границе слова, 125 символов (Instagram standard):
const CAPTION_LIMIT = 125;

const truncatedContent = useMemo(() => {
  if (content.length <= CAPTION_LIMIT || expanded) return content;
  // Обрезаем по последнему пробелу до лимита
  const cut = content.slice(0, CAPTION_LIMIT);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > CAPTION_LIMIT * 0.7 ? cut.slice(0, lastSpace) : cut) + '…';
}, [content, expanded]);

// В JSX:
{content.length > CAPTION_LIMIT && !expanded && (
  <button onClick={() => setExpanded(true)} className="text-muted-foreground ml-1">
    ещё
  </button>
)}
```

---

## ДЕФЕКТ #9

📁 **Файл:** [`src/components/feed/PostCard.tsx`](src/components/feed/PostCard.tsx:309)  
📍 **Строка:** 309  
🟢 **Severity:** НИЗКОЕ  
📋 **Категория:** Визуал  
❌ **Проблема:** Карточка поста использует `bg-white/50 dark:bg-card` с `backdrop-blur-sm`. Instagram использует чистый белый фон (#FFFFFF) в светлой теме и #000000 в тёмной без blur-эффекта. Blur создаёт GPU-нагрузку при скролле 20+ постов и не соответствует нативному дизайну.

```tsx
// ✅ ИСПРАВЛЕНИЕ:
// Было:
<div className="bg-white/50 dark:bg-card backdrop-blur-sm border-b border-white/60 dark:border-border">

// Стало:
<div className="bg-background border-b border-border">
// Instagram: светлая тема — #FFFFFF, тёмная — #000000, разделитель — 1px #DBDBDB
```

---

## ДЕФЕКТ #10

📁 **Файл:** [`src/components/feed/PostCard.tsx`](src/components/feed/PostCard.tsx:314)  
📍 **Строка:** 314–323  
🟡 **Severity:** СРЕДНЕЕ  
📋 **Категория:** Визуал  
❌ **Проблема:** Аватар автора поста — `<img>` без `AvatarFallback`. При ошибке загрузки (404, сетевая ошибка) отображается broken image icon браузера. Instagram всегда показывает initials-заглушку. Также `ring-2 ring-primary/20` — нестандартная рамка; Instagram не использует рамку на аватарах в ленте (только в Stories).

```tsx
// ✅ ИСПРАВЛЕНИЕ — использовать Avatar компонент с fallback:
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

// В JSX:
<div className="relative cursor-pointer" onClick={goToProfile}>
  <Avatar className="w-10 h-10">
    <AvatarImage src={author.avatar} alt={author.name} />
    <AvatarFallback className="bg-muted text-muted-foreground text-sm font-semibold">
      {author.name.charAt(0).toUpperCase()}
    </AvatarFallback>
  </Avatar>
  {author.verified && (
    <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-primary rounded-full flex items-center justify-center">
      <VerifiedBadge size="xs" className="text-primary-foreground fill-primary-foreground stroke-primary" />
    </div>
  )}
</div>
```

---

## ДЕФЕКТ #11

📁 **Файл:** [`src/components/feed/FeedHeader.tsx`](src/components/feed/FeedHeader.tsx:35)  
📍 **Строка:** 35–45  
🔴 **Severity:** КРИТИЧНО  
📋 **Категория:** Функционал  
❌ **Проблема:** `handleStoryClick` при `collapseProgress > 0.1` скроллит страницу вместо открытия истории. Это означает: если пользователь немного проскроллил ленту (даже на 10% от порога коллапса) и нажимает на историю — история **не открывается**, а страница скроллится вверх. Это нарушает базовый UX: пользователь ожидает открытие истории при нажатии на аватар.

```tsx
// ✅ ИСПРАВЛЕНИЕ — истории открываются всегда, скролл — только при нажатии на заголовок:
const handleStoryClick = (index: number, user: UserWithStories) => {
  // Всегда открываем историю если она есть
  if (user.stories.length > 0) {
    setSelectedStoryIndex(index);
    setStoryViewerOpen(true);
  } else if (user.isOwn) {
    // Собственный аватар без историй → создать историю
    // (логика в Stories.tsx через fileInputRef)
  }
  // Скролл вверх — отдельный жест/кнопка, не связан с нажатием на историю
};
```

---

## ДЕФЕКТ #12

📁 **Файл:** [`src/components/feed/FeedHeader.tsx`](src/components/feed/FeedHeader.tsx:84)  
📍 **Строка:** 84–97  
🟡 **Severity:** СРЕДНЕЕ  
📋 **Категория:** Визуал  
❌ **Проблема:** В хедере отсутствует кнопка DM (Direct Messages) с badge-счётчиком непрочитанных сообщений — обязательный элемент Instagram 2024. Справа от логотипа Instagram всегда находятся иконки: сердечко (уведомления) и самолётик (DM) с badge. В текущей реализации есть только `ServicesMenu` слева.

```tsx
// ✅ ИСПРАВЛЕНИЕ — добавить DM-кнопку в хедер:
import { Send } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useUnreadCount } from "@/hooks/useUnreadCount"; // или аналог

// В компоненте:
const navigate = useNavigate();
const { unreadCount } = useUnreadCount(); // количество непрочитанных DM

// В JSX (строка 94, внутри flex items-center w-full):
<div className="flex items-center w-full justify-between">
  <ServicesMenu />
  <div className="flex items-center gap-3">
    {/* Notifications */}
    <button onClick={() => navigate('/notifications')} className="relative p-2">
      <Heart className="w-6 h-6" />
    </button>
    {/* DM с badge */}
    <button onClick={() => navigate('/chat')} className="relative p-2">
      <Send className="w-6 h-6" />
      {unreadCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-destructive text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  </div>
</div>
```

---

## ДЕФЕКТ #13

📁 **Файл:** [`src/components/feed/FeedHeader.tsx`](src/components/feed/FeedHeader.tsx:142)  
📍 **Строка:** 142  
🟢 **Severity:** НИЗКОЕ  
📋 **Категория:** Визуал  
❌ **Проблема:** Градиентная рамка непросмотренной истории использует `bg-gradient-to-tr from-primary via-accent to-primary` — монотонный градиент одного цвета. Instagram использует специфический градиент: `from-[#f09433] via-[#e6683c] via-[#dc2743] via-[#cc2366] to-[#bc1888]` (жёлто-оранжево-розово-фиолетовый). Просмотренные истории — серая рамка `#C7C7C7`.

```tsx
// ✅ ИСПРАВЛЕНИЕ:
// Было:
"p-[2.5px] bg-gradient-to-tr from-primary via-accent to-primary"

// Стало (Instagram-точный градиент):
"p-[2.5px] bg-[conic-gradient(from_0deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888,#f09433)]"
// или через Tailwind custom:
// в tailwind.config.ts добавить:
// 'story-ring': 'conic-gradient(from 0deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888, #f09433)'
```

---

## ДЕФЕКТ #14

📁 **Файл:** [`src/hooks/useSmartFeed.ts`](src/hooks/useSmartFeed.ts:140)  
📍 **Строка:** 140–218  
🔴 **Severity:** КРИТИЧНО  
📋 **Категория:** API  
❌ **Проблема:** `fetchPublicFeedPage` (fallback для неавторизованных и при ошибке Edge Function) выполняет **2 последовательных запроса**: сначала посты, затем профили авторов. Это N+1 паттерн: при 20 постах от 20 разных авторов — 2 запроса (оптимально), но при ошибке профилей (строка 179: `if (!profilesError)`) — посты рендерятся без аватаров и имён. Критичнее: `is_liked` и `is_saved` всегда `false` для авторизованных пользователей в fallback-режиме (строки 199-200) — пользователь теряет состояние лайков при каждом fallback.

```tsx
// ✅ ИСПРАВЛЕНИЕ — добавить is_liked/is_saved для авторизованных в fallback:
async function fetchPublicFeedPage(
  cursor: FeedCursor | null,
  pageSize: number,
  userId?: string, // добавить параметр
): Promise<FeedResponse> {
  // ... существующий код запроса постов и профилей ...

  // Добавить запрос лайков для авторизованных пользователей
  let likedPostIds = new Set<string>();
  let savedPostIds = new Set<string>();
  
  if (userId && postRows.length > 0) {
    const postIds = postRows.map(r => r.id);
    const [likesRes, savesRes] = await Promise.all([
      (supabase as any).from('post_likes').select('post_id').eq('user_id', userId).in('post_id', postIds),
      (supabase as any).from('saved_posts').select('post_id').eq('user_id', userId).in('post_id', postIds),
    ]);
    likedPostIds = new Set((likesRes.data || []).map((l: any) => l.post_id));
    savedPostIds = new Set((savesRes.data || []).map((s: any) => s.post_id));
  }

  const posts: FeedPost[] = postRows.map((row) => {
    const profile = profilesByUserId.get(row.author_id);
    return {
      // ... существующие поля ...
      is_liked: likedPostIds.has(row.id),  // ← исправлено
      is_saved: savedPostIds.has(row.id),  // ← исправлено
    };
  });
  // ...
}
```

---

## ДЕФЕКТ #15

📁 **Файл:** [`src/hooks/useSmartFeed.ts`](src/hooks/useSmartFeed.ts:246)  
📍 **Строка:** 246–333  
🟡 **Severity:** СРЕДНЕЕ  
📋 **Категория:** Технический  
❌ **Проблема:** `fetchPosts` использует `fetchingRef.current` как mutex, но при `reset=true` (refetch) не отменяет уже выполняющийся запрос — просто возвращает `return` если `fetchingRef.current === true`. Это означает: если пользователь делает pull-to-refresh пока идёт loadMore — refetch молча игнорируется. Пользователь видит spinner pull-to-refresh, который никогда не завершится (нет `finally` для сброса UI-состояния pull-to-refresh).

```tsx
// ✅ ИСПРАВЛЕНИЕ — добавить AbortController для отмены предыдущего запроса:
const abortControllerRef = useRef<AbortController | null>(null);

const fetchPosts = useCallback(async (reset: boolean): Promise<void> => {
  if (!reset && fetchingRef.current) return; // loadMore: пропускаем если уже идёт запрос
  
  // reset: отменяем предыдущий запрос
  if (reset && abortControllerRef.current) {
    abortControllerRef.current.abort();
  }
  
  const controller = new AbortController();
  abortControllerRef.current = controller;
  
  fetchingRef.current = true;
  // ... остальной код ...
  
  // В catch:
  } catch (err) {
    if ((err as any)?.name === 'AbortError') return; // игнорируем отменённые запросы
    // ... обработка ошибок ...
  }
}, [mode, hasMore, authLoading, user]);
```

---

## ДЕФЕКТ #16

📁 **Файл:** [`src/pages/ProfilePage.tsx`](src/pages/ProfilePage.tsx:244)  
📍 **Строка:** 244–257  
🔴 **Severity:** КРИТИЧНО  
📋 **Категория:** Логика  
❌ **Проблема:** `handleFollowToggle` не реализует оптимистичное обновление. При нажатии "Подписаться": (1) кнопка не меняется мгновенно — пользователь ждёт ответа сервера (200-500ms); (2) при ошибке нет отката; (3) счётчик подписчиков не обновляется локально. Instagram обновляет кнопку и счётчик мгновенно (оптимистично), откатывает при ошибке.

```tsx
// ✅ ИСПРАВЛЕНИЕ — оптимистичное обновление follow/unfollow:
const [optimisticFollowing, setOptimisticFollowing] = useState<boolean | null>(null);
const [optimisticFollowersCount, setOptimisticFollowersCount] = useState<number | null>(null);
const [followPending, setFollowPending] = useState(false);

// Вычисляемые значения с учётом оптимистичного состояния:
const displayIsFollowing = optimisticFollowing ?? profile?.isFollowing ?? false;
const displayFollowersCount = optimisticFollowersCount ?? profile?.stats?.followersCount ?? 0;

const handleFollowToggle = async () => {
  if (followPending || !profile) return;
  
  const wasFollowing = displayIsFollowing;
  const prevCount = displayFollowersCount;
  
  // Оптимистичное обновление
  setOptimisticFollowing(!wasFollowing);
  setOptimisticFollowersCount(wasFollowing ? Math.max(0, prevCount - 1) : prevCount + 1);
  setFollowPending(true);
  
  try {
    if (wasFollowing) {
      await unfollow();
    } else {
      await follow();
    }
    // Сбрасываем оптимистичное состояние — реальные данные придут через refetch
    await refetch();
    setOptimisticFollowing(null);
    setOptimisticFollowersCount(null);
  } catch (error) {
    // Откат при ошибке
    setOptimisticFollowing(wasFollowing);
    setOptimisticFollowersCount(prevCount);
    logger.error("profile.follow_toggle_failed", { error, targetUserId, isFollowing: wasFollowing });
    toast.error("Не удалось выполнить действие");
  } finally {
    setFollowPending(false);
  }
};
```

---

## ДЕФЕКТ #17

📁 **Файл:** [`src/pages/ProfilePage.tsx`](src/pages/ProfilePage.tsx:415)  
📍 **Строка:** 415  
🟡 **Severity:** СРЕДНЕЕ  
📋 **Категория:** Логика  
❌ **Проблема:** Счётчик публикаций в профиле показывает `mediaPosts.length` (только посты с медиа) вместо реального количества публикаций. `mediaPosts` фильтрует посты без медиа (строки 88-96). Пользователь с 10 текстовыми постами и 5 медиа-постами увидит "5 публикаций" вместо "15". Instagram показывает общее количество постов.

```tsx
// ❌ ТЕКУЩИЙ КОД (строка 415):
{postsLoading ? (displayProfile?.stats?.postsCount ?? 0) : mediaPosts.length}

// ✅ ИСПРАВЛЕНИЕ — использовать реальный счётчик из профиля:
{displayProfile?.stats?.postsCount ?? posts.length}
// stats.postsCount приходит из useProfile и учитывает все опубликованные посты
// (включая текстовые, без медиа)
```

---

## ДЕФЕКТ #18

📁 **Файл:** [`src/pages/ProfilePage.tsx`](src/pages/ProfilePage.tsx:546)  
📍 **Строка:** 546  
🟡 **Severity:** СРЕДНЕЕ  
📋 **Категория:** Функционал  
❌ **Проблема:** Удаление Highlight использует `confirm()` — нативный браузерный диалог. На мобильных устройствах (iOS/Android WebView) `confirm()` может быть заблокирован или выглядит нестандартно. Instagram использует нативный bottom sheet с кнопками "Удалить" / "Отмена". Также `confirm()` блокирует JS-поток.

```tsx
// ✅ ИСПРАВЛЕНИЕ — использовать AlertDialog из shadcn/ui:
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

// Добавить state:
const [highlightToDelete, setHighlightToDelete] = useState<string | null>(null);

// В JSX вместо confirm():
onLongPress={isOwnProfile ? () => setHighlightToDelete(h.id) : undefined}

// AlertDialog:
<AlertDialog open={!!highlightToDelete} onOpenChange={(open) => !open && setHighlightToDelete(null)}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Удалить подборку?</AlertDialogTitle>
      <AlertDialogDescription>Это действие нельзя отменить.</AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Отмена</AlertDialogCancel>
      <AlertDialogAction
        className="bg-destructive text-destructive-foreground"
        onClick={() => { if (highlightToDelete) handleDeleteHighlight(highlightToDelete); setHighlightToDelete(null); }}
      >
        Удалить
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

---

## ДЕФЕКТ #19

📁 **Файл:** [`src/components/feed/StoryViewer.tsx`](src/components/feed/StoryViewer.tsx:46)  
📍 **Строка:** 46–63  
🔴 **Severity:** КРИТИЧНО  
📋 **Категория:** Технический / API  
❌ **Проблема:** `StoryWidgetsLayer` выполняет 5 параллельных Supabase-запросов (`Promise.all`) при каждой смене `storyId`. Проблемы: (1) нет `ignore`-флага — если пользователь быстро переключает истории, старые запросы завершаются после новых и перезаписывают state; (2) нет обработки ошибок — если любой из 5 запросов упадёт, `Promise.all` отклонится и все виджеты не загрузятся; (3) нет cleanup при unmount — setState вызывается на unmounted компоненте.

```tsx
// ✅ ИСПРАВЛЕНИЕ:
useEffect(() => {
  if (!storyId) return;
  let ignore = false;

  (async () => {
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const [q, c, qz, sl, st] = await Promise.allSettled([
        supabase.from('story_questions').select('*').eq('story_id', storyId),
        supabase.from('story_countdowns').select('*').eq('story_id', storyId),
        supabase.from('story_quizzes').select('*').eq('story_id', storyId),
        supabase.from('story_emoji_sliders').select('*').eq('story_id', storyId),
        supabase.from('story_stickers').select('*').eq('story_id', storyId),
      ]);
      
      if (ignore) return; // Игнорируем если storyId сменился
      
      // Promise.allSettled — каждый запрос независим, ошибка одного не блокирует остальные
      if (q.status === 'fulfilled') setQuestions(q.value.data || []);
      if (c.status === 'fulfilled') setCountdowns(c.value.data || []);
      if (qz.status === 'fulfilled') setQuizzes(qz.value.data || []);
      if (sl.status === 'fulfilled') setSliders(sl.value.data || []);
      if (st.status === 'fulfilled') setStickers(st.value.data || []);
    } catch (err) {
      if (!ignore) console.error('[StoryWidgetsLayer] Failed to load widgets:', err);
    }
  })();

  return () => { ignore = true; };
}, [storyId]);
```

---

## ДЕФЕКТ #20

📁 **Файл:** [`src/components/feed/StoryViewer.tsx`](src/components/feed/StoryViewer.tsx:353)  
📍 **Строка:** 353–391  
🔴 **Severity:** КРИТИЧНО  
📋 **Категория:** Технический  
❌ **Проблема:** Progress timer (`setInterval`) в deps массиве useEffect имеет `[isOpen, isPaused, currentUserIndex, currentStoryInUser, totalStoriesForUser, activeUsers.length, onClose, effectiveDuration]`. При каждом изменении любого из этих значений интервал пересоздаётся. Это означает: при каждом тике прогресса (каждые 50ms) `setProgress` обновляет state → компонент ре-рендерится → `currentStoryInUser` в deps меняется → интервал пересоздаётся → **бесконечный цикл пересоздания интервала**. Фактически прогресс-бар работает нестабильно.

```tsx
// ✅ ИСПРАВЛЕНИЕ — использовать refs для значений внутри интервала:
const currentStoryInUserRef = useRef(currentStoryInUser);
const totalStoriesForUserRef = useRef(totalStoriesForUser);
const currentUserIndexRef = useRef(currentUserIndex);
const activeUsersLengthRef = useRef(activeUsers.length);
const effectiveDurationRef = useRef(effectiveDuration);
const onCloseRef = useRef(onClose);

// Синхронизировать refs при изменении значений:
useEffect(() => { currentStoryInUserRef.current = currentStoryInUser; }, [currentStoryInUser]);
useEffect(() => { totalStoriesForUserRef.current = totalStoriesForUser; }, [totalStoriesForUser]);
useEffect(() => { currentUserIndexRef.current = currentUserIndex; }, [currentUserIndex]);
useEffect(() => { activeUsersLengthRef.current = activeUsers.length; }, [activeUsers.length]);
useEffect(() => { effectiveDurationRef.current = effectiveDuration; }, [effectiveDuration]);
useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

// Интервал с минимальными deps:
useEffect(() => {
  if (!isOpen || isPaused) {
    if (progressInterval.current) clearInterval(progressInterval.current);
    return;
  }

  progressInterval.current = setInterval(() => {
    setProgress(prev => {
      const delta = 100 / (effectiveDurationRef.current / PROGRESS_INTERVAL);
      const newProgress = prev + delta;
      
      if (newProgress >= 100) {
        if (currentStoryInUserRef.current < totalStoriesForUserRef.current - 1) {
          setCurrentStoryInUser(curr => curr + 1);
          return 0;
        } else if (currentUserIndexRef.current < activeUsersLengthRef.current - 1) {
          setCurrentUserIndex(curr => curr + 1);
          setCurrentStoryInUser(0);
          return 0;
        } else {
          onCloseRef.current();
          return 100;
        }
      }
      return newProgress;
    });
  }, PROGRESS_INTERVAL);

  return () => { if (progressInterval.current) clearInterval(progressInterval.current); };
}, [isOpen, isPaused]); // Только isOpen и isPaused — минимальные deps
```

---

## ДЕФЕКТ #21

📁 **Файл:** [`src/hooks/useReels.tsx`](src/hooks/useReels.tsx:341)  
📍 **Строка:** 341–383  
🟡 **Severity:** СРЕДНЕЕ  
📋 **Категория:** Технический  
❌ **Проблема:** `fetchReels` не имеет `ignore`-флага. При смене `feedMode` (for_you → friends) или `user` — старый запрос может завершиться после нового и перезаписать state. Особенно критично при переключении вкладок в ReelsPage: пользователь переключается на "Подписки", но видит "Для вас" потому что старый запрос завершился позже.

```tsx
// ✅ ИСПРАВЛЕНИЕ — добавить ignore-флаг:
const fetchReels = useCallback(async () => {
  let ignore = false;
  setLoading(true);
  
  try {
    // ... весь существующий код ...
    
    if (!ignore) {
      setReels(enriched.reels);
      setHasMore((raw?.length || 0) >= PAGE_SIZE);
      // ... остальные setState ...
    }
  } catch (error) {
    if (!ignore) {
      logger.error("[useReels] Error fetching reels", { error, feedMode, userId: user?.id ?? null });
    }
  } finally {
    if (!ignore) setLoading(false);
  }
  
  return () => { ignore = true; };
}, [user, feedMode, enrichRows, fetchRawBatch, getFollowedAuthorIdsIfNeeded]);
```

---

## ДЕФЕКТ #22

📁 **Файл:** [`src/hooks/useReels.tsx`](src/hooks/useReels.tsx:430)  
📍 **Строка:** 430–498  
🟡 **Severity:** СРЕДНЕЕ  
📋 **Категория:** Логика  
❌ **Проблема:** `toggleLike` в Reels не реализует оптимистичное обновление — сначала выполняет запрос к БД, затем обновляет UI. Это означает задержку 200-500ms между нажатием и визуальным откликом. Instagram обновляет лайк мгновенно (оптимистично) и откатывает при ошибке. Также при ошибке нет отката счётчика `likes_count`.

```tsx
// ✅ ИСПРАВЛЕНИЕ — оптимистичное обновление перед запросом:
const toggleLike = useCallback(async (reelId: string) => {
  if (!user) return;
  if (isDemoId(reelId)) { /* ... существующий код ... */ return; }

  await likeMutex.current.execute(async () => {
    const isCurrentlyLiked = likedReels.has(reelId);
    
    // ОПТИМИСТИЧНОЕ обновление ДО запроса
    setLikedReels((prev) => {
      const next = new Set(prev);
      if (isCurrentlyLiked) next.delete(reelId); else next.add(reelId);
      return next;
    });
    setReels((prev) => prev.map((r) =>
      r.id === reelId
        ? { ...r, likes_count: Math.max(0, r.likes_count + (isCurrentlyLiked ? -1 : 1)), isLiked: !isCurrentlyLiked }
        : r
    ));

    try {
      if (isCurrentlyLiked) {
        const { error } = await (supabase as any).from("reel_likes").delete().eq("reel_id", reelId).eq("user_id", user.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("reel_likes").insert({ reel_id: reelId, user_id: user.id });
        if (error) throw error;
      }
    } catch (error) {
      // ОТКАТ при ошибке
      setLikedReels((prev) => {
        const next = new Set(prev);
        if (isCurrentlyLiked) next.add(reelId); else next.delete(reelId);
        return next;
      });
      setReels((prev) => prev.map((r) =>
        r.id === reelId
          ? { ...r, likes_count: Math.max(0, r.likes_count + (isCurrentlyLiked ? 1 : -1)), isLiked: isCurrentlyLiked }
          : r
      ));
      logger.error("[useReels] Error toggling like", { error, reelId, userId: user?.id ?? null });
      showErrorToast(error, 'Не удалось обновить лайк');
    }
  });
}, [user, likedReels]);
```

---

## ДЕФЕКТ #23

📁 **Файл:** [`src/pages/ReelsPage.tsx`](src/pages/ReelsPage.tsx:95)  
📍 **Строка:** 95  
🟡 **Severity:** СРЕДНЕЕ  
📋 **Категория:** Логика  
❌ **Проблема:** `author.username` в `mapToFeedItem` захардкожен как `reel.author_id` (строка 95: `username: reel.author_id`). Это означает: в ReelItem отображается UUID вместо username пользователя. Instagram показывает `@username`. `useReels` возвращает `brief?.username` в `author` объекте (строка 322 useReels.tsx), но `Reel.author` не имеет поля `username` в интерфейсе (строки 96-100).

```tsx
// ✅ ИСПРАВЛЕНИЕ — добавить username в интерфейс Reel и mapToFeedItem:

// В useReels.tsx, интерфейс Reel (строка 96):
author?: {
  display_name: string;
  avatar_url: string;
  verified: boolean;
  username?: string; // ← добавить
};

// В enrichRows (строка 322):
author: {
  display_name: brief?.display_name ?? null,
  avatar_url: brief?.avatar_url ?? null,
  username: brief?.username ?? null, // ← добавить
  verified: verifiedMap.get(r.author_id) ?? false,
},

// В mapToFeedItem (строка 95):
username: reel.author?.username ?? reel.author_id.slice(0, 8), // fallback на первые 8 символов ID
```

---

## ДЕФЕКТ #24

📁 **Файл:** [`src/components/feed/CommentsSheet.tsx`](src/components/feed/CommentsSheet.tsx:50)  
📍 **Строка:** 50  
🟡 **Severity:** СРЕДНЕЕ  
📋 **Категория:** Технический  
❌ **Проблема:** `useComments(postId) as any` — явный cast к `any` для обхода TypeScript. Это означает: все методы хука (`addComment`, `toggleLike`, `deleteComment`) теряют типизацию. Ошибки в сигнатурах не будут пойманы компилятором. Причина — `comments` таблица не в `supabase/types.ts` (используется `"comments" as any` в хуке).

```tsx
// ✅ ИСПРАВЛЕНИЕ — убрать cast, добавить явные типы:
// Вместо:
} = useComments(postId) as any;

// Использовать:
const { comments, loading, addComment, toggleLike, deleteComment } = useComments(postId);
// Типы уже определены в useComments.tsx через интерфейс Comment
// Проблема в supabase client — нужно добавить таблицу comments в types.ts
// или использовать явный тип в хуке без as any
```

---

## ДЕФЕКТ #25

📁 **Файл:** [`src/components/feed/CommentsSheet.tsx`](src/components/feed/CommentsSheet.tsx:133)  
📍 **Строка:** 133–135  
🟡 **Severity:** СРЕДНЕЕ  
📋 **Категория:** Технический  
❌ **Проблема:** `useEffect` с `[onCommentsCountChange, totalComments]` вызывает `onCommentsCountChange` при каждом изменении `totalComments`. Если `onCommentsCountChange` — нестабильная ссылка (создаётся inline в PostCard: `onCommentsCountChange={setCommentCount}`), это вызывает бесконечный цикл: изменение count → вызов callback → ре-рендер PostCard → новая ссылка на callback → снова эффект.

```tsx
// ✅ ИСПРАВЛЕНИЕ — стабилизировать callback через useCallback в PostCard:
// В PostCard.tsx:
const handleCommentsCountChange = useCallback((count: number) => {
  setCommentCount(count);
}, []); // стабильная ссылка

// В CommentsSheet.tsx — добавить проверку:
const prevCountRef = useRef(totalComments);
useEffect(() => {
  if (prevCountRef.current === totalComments) return; // не вызывать если не изменилось
  prevCountRef.current = totalComments;
  onCommentsCountChange?.(totalComments);
}, [onCommentsCountChange, totalComments]);
```

---

## ДЕФЕКТ #26

📁 **Файл:** [`src/hooks/useProfile.tsx`](src/hooks/useProfile.tsx:41)  
📍 **Строка:** 41–48  
🟡 **Severity:** СРЕДНЕЕ  
📋 **Категория:** API  
❌ **Проблема:** `getArchivedPostIdsForUser` использует `(supabase as any)` для запроса к `archived_posts`. Это обходит RLS-проверки TypeScript-компилятора. Если RLS-политика на `archived_posts` некорректна, любой пользователь может получить список архивных постов другого пользователя через этот запрос. Нет фильтра по `user_id` на уровне кода (только RLS).

```tsx
// ✅ ИСПРАВЛЕНИЕ — явный фильтр + типизация:
async function getArchivedPostIdsForUser(userId: string): Promise<string[]> {
  const { data, error } = await (supabase as any)
    .from('archived_posts')
    .select('post_id')
    .eq('user_id', userId) // явный фильтр — defence in depth поверх RLS
    .limit(1000); // защита от неограниченного результата

  if (error) {
    // Не бросаем ошибку — архивные посты не критичны для отображения профиля
    console.warn('[useProfile] Failed to fetch archived posts:', error);
    return [];
  }
  return (data || []).map((row: any) => String(row.post_id)).filter(Boolean);
}
```

---

## ДЕФЕКТ #27

📁 **Файл:** [`src/hooks/useProfile.tsx`](src/hooks/useProfile.tsx:51)  
📍 **Строка:** 51–76  
🟡 **Severity:** СРЕДНЕЕ  
📋 **Категория:** API  
❌ **Проблема:** `getVisiblePostsCount` выполняет 2-3 последовательных запроса: (1) COUNT всех опубликованных постов, (2) получение архивных ID, (3) COUNT архивных опубликованных постов. Это N+1 паттерн для подсчёта одного числа. При каждой загрузке профиля — 3 запроса только для счётчика постов.

```tsx
// ✅ ИСПРАВЛЕНИЕ — единый RPC или один запрос:
// Вариант 1: использовать stats.postsCount из профиля (уже вычислен на сервере)
// Вариант 2: единый запрос с NOT IN:
async function getVisiblePostsCount(targetUserId: string, currentUserId?: string): Promise<number> {
  if (!currentUserId || currentUserId !== targetUserId) {
    // Для чужих профилей — просто COUNT публикаций
    const { count, error } = await supabase
      .from('posts')
      .select('*', { count: 'exact', head: true })
      .eq('author_id', targetUserId)
      .eq('is_published', true);
    if (error) throw error;
    return count || 0;
  }

  // Для своего профиля — единый запрос с подзапросом через RPC
  // или использовать profile.stats.postsCount который уже учитывает архив
  const { data, error } = await (supabase as any).rpc('get_visible_posts_count_v1', {
    p_user_id: targetUserId,
  });
  if (error) throw error;
  return Number(data ?? 0);
}
```

---

## ДЕФЕКТ #28

📁 **Файл:** [`src/components/feed/Stories.tsx`](src/components/feed/Stories.tsx:1)  
📍 **Строка:** весь файл  
🟢 **Severity:** НИЗКОЕ  
📋 **Категория:** Визуал  
❌ **Проблема:** `Stories.tsx` компонент существует параллельно с `FeedHeader.tsx`, который уже рендерит истории. Судя по коду, `Stories.tsx` не используется в `HomePage` (там используется `FeedHeader`). Это мёртвый код, который увеличивает бандл и создаёт путаницу при поддержке.

```tsx
// ✅ ИСПРАВЛЕНИЕ — проверить использование и удалить если не используется:
// Выполнить поиск:
// grep -r "from.*Stories" src/ --include="*.tsx" --include="*.ts"
// Если Stories.tsx не импортируется нигде кроме самого себя — удалить файл.
// Вся логика историй сосредоточена в FeedHeader.tsx + StoryViewer.tsx
```

---

## ДЕФЕКТ #29

📁 **Файл:** [`src/hooks/useStories.tsx`](src/hooks/useStories.tsx:75)  
📍 **Строка:** 75  
🟡 **Severity:** СРЕДНЕЕ  
📋 **Категория:** Технический  
❌ **Проблема:** `fetchUserBriefMap(authorIds, supabase as any)` — `supabase as any` передаётся как параметр. Это означает что `fetchUserBriefMap` принимает `any` вместо типизированного Supabase клиента. Если сигнатура `fetchUserBriefMap` изменится — ошибка не будет поймана компилятором. Паттерн `supabase as any` встречается в 6+ местах в Instagram-разделе.

```tsx
// ✅ ИСПРАВЛЕНИЕ — типизировать fetchUserBriefMap:
// В src/lib/users/userBriefs.ts изменить сигнатуру:
import type { SupabaseClient } from '@supabase/supabase-js';

export async function fetchUserBriefMap(
  userIds: string[],
  client: SupabaseClient // вместо any
): Promise<Map<string, UserBrief>> { ... }

// Тогда вызов:
const briefMap = await fetchUserBriefMap(authorIds, supabase);
// без as any — TypeScript проверит совместимость
```

---

## ДЕФЕКТ #30

📁 **Файл:** [`src/pages/ProfilePage.tsx`](src/pages/ProfilePage.tsx:373)  
📍 **Строка:** 373  
🟢 **Severity:** НИЗКОЕ  
📋 **Категория:** Визуал  
❌ **Проблема:** Аватар профиля обёрнут в `ring-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600` — это CSS-класс, который не существует в Tailwind по умолчанию. `ring-gradient-*` не является стандартным Tailwind-классом. Рамка аватара, вероятно, не отображается корректно. Instagram использует тот же градиент что и в Stories (жёлто-оранжево-розово-фиолетовый) только для аватаров с активными историями.

```tsx
// ✅ ИСПРАВЛЕНИЕ — использовать корректный CSS для градиентной рамки:
// Вместо ring-gradient-* (несуществующий класс):
<div className="w-20 h-20 rounded-full p-[2px] bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600">
  <div className="w-full h-full rounded-full bg-background p-[1px]">
    <Avatar className="w-full h-full">
      ...
    </Avatar>
  </div>
</div>
// Показывать градиент только если у пользователя есть активные истории
```

---

## ДЕФЕКТ #31

📁 **Файл:** [`src/components/feed/PostCard.tsx`](src/components/feed/PostCard.tsx:585)  
📍 **Строка:** 585  
🟢 **Severity:** НИЗКОЕ  
📋 **Категория:** Технический  
❌ **Проблема:** `CaptionText` — внутренний компонент, объявленный вне `PostCard` но в том же файле. Он не мемоизирован (`React.memo`). При каждом ре-рендере `PostCard` (например, при обновлении `likeCount`) `CaptionText` пересоздаётся и ре-рендерится, даже если `text` не изменился. Для длинных caption с множеством хэштегов это создаёт лишние вычисления.

```tsx
// ✅ ИСПРАВЛЕНИЕ — мемоизировать CaptionText:
const CaptionText = memo(function CaptionText({
  text,
  navigate,
}: {
  text: string;
  navigate: ReturnType<typeof import("react-router-dom").useNavigate>;
}) {
  // ... существующий код ...
});
```

---

## ДЕФЕКТ #32

📁 **Файл:** [`src/hooks/useSmartFeed.ts`](src/hooks/useSmartFeed.ts:336)  
📍 **Строка:** 336–341  
🟡 **Severity:** СРЕДНЕЕ  
📋 **Категория:** Технический  
❌ **Проблема:** `useEffect` для сброса и перезагрузки ленты при смене `mode` или `user.id` имеет `eslint-disable-next-line react-hooks/exhaustive-deps` комментарий (строка 340). Это означает что `fetchPosts` намеренно исключён из deps. Если `fetchPosts` изменится (например, при изменении `hasMore`), эффект не перезапустится. Это потенциальный источник stale closure.

```tsx
// ✅ ИСПРАВЛЕНИЕ — использовать ref для fetchPosts:
const fetchPostsRef = useRef(fetchPosts);
useEffect(() => { fetchPostsRef.current = fetchPosts; }, [fetchPosts]);

useEffect(() => {
  if (authLoading) return;
  setHasMore(true);
  void fetchPostsRef.current(true); // всегда актуальная ссылка
}, [mode, user?.id, authLoading]); // без eslint-disable
```

---

## ДЕФЕКТ #33

📁 **Файл:** [`src/pages/ReelsPage.tsx`](src/pages/ReelsPage.tsx:259)  
📍 **Строка:** 259–272  
🟡 **Severity:** СРЕДНЕЕ  
📋 **Категория:** Логика  
❌ **Проблема:** Логика определения ошибки в ReelsPage некорректна. `loadError` управляется только через `handleRetry` (строка 275: `setLoadError(false)`), но никогда не устанавливается в `true` автоматически. Комментарий на строке 270 подтверждает: "useReels не пробрасывает error". Это означает что `ReelsErrorScreen` **никогда не показывается** при реальных ошибках сети — пользователь видит пустой экран вместо сообщения об ошибке.

```tsx
// ✅ ИСПРАВЛЕНИЕ — добавить error в useReels и пробросить в ReelsPage:
// В useReels.tsx добавить:
const [error, setError] = useState<string | null>(null);

// В fetchReels catch:
} catch (error) {
  logger.error("[useReels] Error fetching reels", { error });
  setError(error instanceof Error ? error.message : 'Ошибка загрузки');
} finally {
  setLoading(false);
}

// Экспортировать:
return { reels, loading, loadingMore, hasMore, error, loadMore, toggleLike, ... };

// В ReelsPage.tsx:
const { reels: rawReels, loading, loadingMore, hasMore, error, loadMore, ... } = useReels(reelsFeedMode);

// Использовать error для показа ReelsErrorScreen:
if (!loading && error && rawReels.length === 0) {
  return <ReelsErrorScreen onRetry={handleRetry} />;
}
```

---

## ДЕФЕКТ #34

📁 **Файл:** [`src/components/feed/FeedHeader.tsx`](src/components/feed/FeedHeader.tsx:100)  
📍 **Строка:** 100–111  
🟢 **Severity:** НИЗКОЕ  
📋 **Категория:** Визуал  
❌ **Проблема:** При загрузке историй показывается `Loader2` spinner вместо skeleton-кружков. Instagram показывает 5-6 серых пульсирующих кружков (skeleton) в строке историй, а не spinner. Это нарушает визуальное соответствие.

```tsx
// ✅ ИСПРАВЛЕНИЕ — skeleton вместо spinner:
{loading && usersWithStories.length === 0 && (
  <div 
    className="absolute flex items-center gap-4"
    style={{ left: PADDING_LEFT, top: HEADER_HEIGHT }}
  >
    {Array.from({ length: 5 }).map((_, i) => (
      <div key={i} className="flex flex-col items-center gap-1">
        <div 
          className="rounded-full bg-muted animate-pulse"
          style={{ width: EXPANDED_AVATAR_SIZE, height: EXPANDED_AVATAR_SIZE }}
        />
        <div className="w-12 h-2.5 rounded bg-muted animate-pulse" />
      </div>
    ))}
  </div>
)}
```

---

## ДЕФЕКТ #35

📁 **Файл:** [`src/hooks/useComments.tsx`](src/hooks/useComments.tsx:252)  
📍 **Строка:** 252–272  
🟡 **Severity:** СРЕДНЕЕ  
📋 **Категория:** Логика  
❌ **Проблема:** `deleteComment` после успешного DELETE вызывает `await fetchComments()` — полный рефетч. Аналогично `addComment` (дефект #3). Кроме того, нет подтверждения удаления в самом хуке — это делается в `CommentsSheet` через `onDelete`, но без AlertDialog (используется прямой вызов). Instagram показывает bottom sheet с подтверждением перед удалением.

```tsx
// ✅ ИСПРАВЛЕНИЕ — оптимистичное удаление без рефетча:
const deleteComment = async (commentId: string) => {
  if (!user) return { error: "Необходимо войти в систему" };

  // Оптимистичное удаление из state
  const prevComments = comments; // сохраняем для отката
  setComments(prev => {
    // Удаляем из top-level
    const filtered = prev.filter(c => c.id !== commentId);
    // Удаляем из replies
    return filtered.map(c => ({
      ...c,
      replies: (c.replies || []).filter(r => r.id !== commentId),
    }));
  });

  try {
    const { error } = await (supabase
      .from("comments" as any)
      .delete()
      .eq("id", commentId)
      .eq("author_id", user.id) as any);

    if (error) throw error;
    return { error: null };
  } catch (err: any) {
    // Откат при ошибке
    setComments(prevComments);
    console.error("Error deleting comment:", err);
    return { error: err.message || "Ошибка удаления" };
  }
};
```

---

## ИТОГОВЫЙ СВОДНЫЙ ОТЧЁТ

### 1. Таблица статистики

| Категория | КРИТИЧНО 🔴 | СРЕДНЕЕ 🟡 | НИЗКОЕ 🟢 | Итого |
|-----------|------------|-----------|----------|-------|
| Визуал | 0 | 2 | 4 | **6** |
| Функционал | 1 | 1 | 0 | **2** |
| Логика | 2 | 5 | 0 | **7** |
| Технический | 4 | 9 | 2 | **15** |
| API | 2 | 3 | 0 | **5** |
| **ИТОГО** | **9** | **20** | **6** | **35** |

---

### 2. Топ-3 критичных дефекта

**🔴 #1 — Дефект #20: Бесконечный цикл пересоздания интервала в StoryViewer**  
[`src/components/feed/StoryViewer.tsx:353`](src/components/feed/StoryViewer.tsx:353)  
Прогресс-бар историй работает нестабильно из-за бесконечного пересоздания `setInterval`. Каждые 50ms `setProgress` вызывает ре-рендер → deps массива меняются → интервал пересоздаётся. Это приводит к: (1) неравномерному прогрессу историй; (2) CPU-нагрузке на мобильных устройствах; (3) потенциальному зависанию UI при длинных сессиях просмотра историй.

**🔴 #2 — Дефект #5: Утечка Supabase realtime-каналов в useStories**  
[`src/hooks/useStories.tsx:211`](src/hooks/useStories.tsx:211)  
При каждом ре-рендере компонента с `useStories` создаётся новый realtime-канал без корректной отписки от предыдущего. При 10M пользователях это создаёт лавинообразный рост соединений на Supabase Realtime сервере. Каждый активный пользователь может создать десятки "зомби"-каналов за сессию.

**🔴 #3 — Дефект #19: Race condition и отсутствие cleanup в StoryWidgetsLayer**  
[`src/components/feed/StoryViewer.tsx:46`](src/components/feed/StoryViewer.tsx:46)  
5 параллельных запросов без `ignore`-флага при быстром переключении историй. При быстром свайпе между историями (типичное поведение) — setState вызывается на unmounted компоненте, что приводит к memory leak и потенциальным crashes в React 18 Strict Mode.

---

### 3. Приоритизированный план устранения

#### Волна 1 — Блокеры (1-2 дня)
| # | Дефект | Файл | Трудозатраты |
|---|--------|------|-------------|
| 1 | #20 — Бесконечный цикл интервала StoryViewer | StoryViewer.tsx | 2ч |
| 2 | #5 — Утечка realtime-каналов useStories | useStories.tsx | 1ч |
| 3 | #19 — Race condition StoryWidgetsLayer | StoryViewer.tsx | 1ч |
| 4 | #11 — handleStoryClick не открывает истории | FeedHeader.tsx | 30мин |
| 5 | #1 — pravatar.cc утечка данных | HomePage.tsx | 15мин |

#### Волна 2 — Важное (2-3 дня)
| # | Дефект | Файл | Трудозатраты |
|---|--------|------|-------------|
| 6 | #16 — Нет оптимистичного follow/unfollow | ProfilePage.tsx | 2ч |
| 7 | #3 — N+1 рефетч при addComment | useComments.tsx | 2ч |
| 8 | #4 — Нет ignore-флага в fetchComments | useComments.tsx | 1ч |
| 9 | #14 — is_liked/is_saved = false в fallback | useSmartFeed.ts | 2ч |
| 10 | #22 — Нет оптимистичного лайка в Reels | useReels.tsx | 1ч |
| 11 | #33 — ReelsErrorScreen никогда не показывается | ReelsPage.tsx + useReels.tsx | 1ч |
| 12 | #2 — verified всегда false в ленте | HomePage.tsx | 15мин |

#### Волна 3 — Улучшения (3-5 дней)
| # | Дефект | Файл | Трудозатраты |
|---|--------|------|-------------|
| 13 | #12 — Отсутствует DM-кнопка в хедере | FeedHeader.tsx | 2ч |
| 14 | #6 — 5 useEffect → 2 + React.memo | PostCard.tsx | 1ч |
| 15 | #18 — confirm() → AlertDialog | ProfilePage.tsx | 1ч |
| 16 | #21 — ignore-флаг в useReels | useReels.tsx | 1ч |
| 17 | #15 — AbortController в useSmartFeed | useSmartFeed.ts | 1ч |
| 18 | #35 — Оптимистичное удаление комментария | useComments.tsx | 1ч |
| 19 | #17 — Счётчик постов в профиле | ProfilePage.tsx | 15мин |
| 20 | #23 — username вместо UUID в Reels | useReels.tsx + ReelsPage.tsx | 1ч |
| 21 | #8 — Caption 125 символов по границе слова | PostCard.tsx | 30мин |
| 22 | #34 — Skeleton вместо spinner в FeedHeader | FeedHeader.tsx | 30мин |
| 23 | #13 — Instagram-точный градиент Stories | FeedHeader.tsx | 15мин |
| 24 | #29 — Типизировать fetchUserBriefMap | userBriefs.ts | 2ч |
| 25 | #32 — Убрать eslint-disable в useSmartFeed | useSmartFeed.ts | 30мин |

---

### 4. Архитектурные рекомендации

#### A. Генерация типов Supabase
Повсеместное использование `supabase as any`, `"comments" as any`, `"comment_likes" as any` — симптом отсутствия актуальных типов. Необходимо:
```bash
supabase gen types typescript --local > src/integrations/supabase/types.ts
```
Это устранит ~15 дефектов типизации одним действием и предотвратит появление новых.

#### B. Централизованный паттерн ignore-флага
Создать утилиту для безопасных async useEffect:
```tsx
// src/lib/hooks/useAsyncEffect.ts
export function useAsyncEffect(
  effect: (signal: AbortSignal) => Promise<void>,
  deps: React.DependencyList
) {
  useEffect(() => {
    const controller = new AbortController();
    effect(controller.signal).catch(err => {
      if (err.name !== 'AbortError') console.error(err);
    });
    return () => controller.abort();
  }, deps);
}
```
Применить во всех хуках: `useStories`, `useComments`, `useReels`, `useProfile`, `useSmartFeed`.

#### C. Оптимистичные обновления — единый паттерн
Создать хук `useOptimisticAction` для стандартизации оптимистичных обновлений:
```tsx
// src/lib/hooks/useOptimisticAction.ts
export function useOptimisticAction<T>(
  initialValue: T,
  action: () => Promise<void>,
  rollback: (prev: T) => void
) { ... }
```
Применить для: лайков постов, лайков Reels, сохранений, follow/unfollow.

#### D. Realtime-подписки — единый lifecycle
Все realtime-подписки должны следовать паттерну:
```tsx
useEffect(() => {
  const handlerRef = { current: handler };
  // Обновлять ref при изменении handler
  
  const channel = supabase.channel(channelName)
    .on('postgres_changes', filter, () => handlerRef.current())
    .subscribe();
  
  return () => { supabase.removeChannel(channel); };
}, []); // ВСЕГДА пустой deps для канала
```

#### E. Supabase Image Transform API
Все аватары и медиа должны использовать трансформацию:
```tsx
// Вместо прямого URL:
const optimizedUrl = `${avatarUrl}?width=80&height=80&quality=75&format=webp`;
// Для аватаров в ленте: 80x80
// Для аватаров в профиле: 160x160  
// Для медиа постов: width=750&quality=80&format=webp
```
Это снизит трафик на ~60% и ускорит загрузку ленты.

#### F. PostCard мемоизация
`PostCard` должен быть обёрнут в `React.memo` с кастомным comparator:
```tsx
export const PostCard = memo(PostCardComponent, (prev, next) => {
  return prev.id === next.id &&
    prev.likes === next.likes &&
    prev.isLiked === next.isLiked &&
    prev.comments === next.comments;
});
```
Без этого при каждом обновлении ленты (realtime, loadMore) все 20+ карточек ре-рендерятся.
