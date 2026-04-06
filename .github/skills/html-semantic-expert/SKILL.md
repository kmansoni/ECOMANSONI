---
name: html-semantic-expert
description: "Семантический HTML: правильные теги, ARIA атрибуты, accessibility, heading hierarchy, landmark regions. Use when: accessibility, семантические теги, ARIA, a11y, заголовки, навигация, screen reader."
argument-hint: "[компонент: nav | form | list | dialog | all]"
---

# HTML Semantic Expert — Семантический HTML

---

## Landmark Regions

```html
<!-- Структура страницы -->
<header role="banner">         <!-- Шапка приложения -->
  <nav aria-label="Основная навигация">...</nav>
</header>

<main id="main-content">       <!-- Основной контент -->
  <article>                    <!-- Независимый контент (пост, сообщение) -->
    <header>
      <h2>Заголовок поста</h2>
      <time datetime="2024-03-15">15 марта 2024</time>
    </header>
    <p>Контент...</p>
  </article>
</main>

<aside aria-label="Боковая панель">  <!-- Дополнительный контент -->
  <section aria-labelledby="trending-heading">
    <h2 id="trending-heading">Популярное</h2>
  </section>
</aside>

<footer role="contentinfo">...</footer>
```

---

## Заголовки (heading hierarchy)

```html
<!-- ✅ Правильно: один h1, иерархия -->
<h1>Главная</h1>
  <h2>Мессенджер</h2>
    <h3>Входящие</h3>
    <h3>Избранное</h3>
  <h2>Профиль</h2>

<!-- ❌ Неправильно: пропуск уровней, несколько h1 -->
<h1>Главная</h1>
<h3>Без h2</h3>  <!-- Пропуск уровня! -->
<h1>Второй h1</h1>  <!-- Только один h1! -->
```

---

## Чат — список сообщений

```html
<!-- Список сообщений как <ul> с <li> -->
<ul role="list" aria-label="История сообщений" aria-live="polite" aria-atomic="false">
  <li aria-label="Сообщение от Иван, 14:30">
    <article>
      <header>
        <strong>Иван</strong>
        <time datetime="2024-03-15T14:30:00">14:30</time>
      </header>
      <p>Привет! Как дела?</p>
    </article>
  </li>
</ul>

<!-- aria-live=polite для новых сообщений (не перебивать текущее чтение) -->
<!-- aria-live=assertive для срочных уведомлений (звонок входящий) -->
```

---

## Диалоги и Модальные окна

```tsx
// Правильный modal с aria
function Modal({ isOpen, onClose, title, children }: ModalProps) {
  const titleId = useId();

  return (
    <dialog
      open={isOpen}
      aria-modal="true"
      aria-labelledby={titleId}
      onClose={onClose}
    >
      <h2 id={titleId}>{title}</h2>
      {children}
      <button onClick={onClose} aria-label="Закрыть диалог">✕</button>
    </dialog>
  );
}
// native <dialog> поддерживает: ESC, focus trap, aria автоматически
```

---

## Кнопки vs Ссылки

```html
<!-- Кнопка: выполняет действие на странице -->
<button type="button" onClick={handleLike}>
  <span aria-hidden="true">❤️</span>
  <span className="sr-only">Поставить лайк</span>
</button>

<!-- Ссылка: навигация на другую страницу/route -->
<a href="/profile/123">Перейти к профилю</a>

<!-- ❌ Неправильно: div/span в роли кнопки -->
<div onClick={handleClick}>Кнопка</div>  <!-- Нет keyboard support! -->

<!-- ❌ Кнопка для навигации -->
<button onClick={() => navigate('/profile')}>Профиль</button>  <!-- Используй <a>! -->
```

---

## Иконки без текста — aria-label обязателен

```tsx
// Иконки с aria-label
<button aria-label="Отправить сообщение">
  <SendIcon aria-hidden="true" />
</button>

// Декоративные иконки — aria-hidden
<img src="/decoration.svg" aria-hidden="true" alt="" />

// Информативные иконки — alt текст
<img src="/warning.svg" alt="Предупреждение" />
```

---

## Чеклист

- [ ] Один `<h1>` на страницу, без пропуска уровней
- [ ] `<main>`, `<nav>`, `<header>`, `<footer>`, `<aside>` landmarks
- [ ] `<button>` для действий, `<a>` для навигации
- [ ] `aria-label` для иконок без текста
- [ ] `aria-hidden="true"` на декоративных элементах
- [ ] `aria-live="polite"` для динамически обновляющегося контента
- [ ] `alt=""` (пустой) на декоративных изображениях
- [ ] Фокус видимый (не убирать outline без альтернативы)
