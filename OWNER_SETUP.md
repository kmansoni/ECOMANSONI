## Owner & Test User Setup Guide

Чтобы создать Owner (khan@mansoni.ru) и Test User (+79999999999), используйте следующие инструкции:

### Шаг 1: Создать Owner через phone-auth функцию

#### В консоли браузера (DevTools > Console):

```javascript
// 1. Создать Owner без пароля (phone-based registration)
const ownerResult = await fetch('https://YOUR-PROJECT.supabase.co/functions/v1/phone-auth', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'register-or-login',
    phone: '+79333222922',
    display_name: 'Мансуров Джехангир Мирзаевич',
    email: 'khan@mansoni.ru'
  })
});
const ownerData = await ownerResult.json();
console.log('Owner Created:', ownerData);
const ownerAccessToken = ownerData.accessToken;

// 2. Сохранить accessToken
localStorage.setItem('owner_token', ownerAccessToken);

// 3. Обновить Owner профиль с полной информацией
const updateResult = await fetch('https://YOUR-PROJECT.supabase.co/functions/v1/phone-auth', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${ownerAccessToken}`
  },
  body: JSON.stringify({
    action: 'update-profile',
    full_name: 'Мансуров Джехангир Мирзаевич',
    birth_date: '1996-03-24',
    bio: 'Юрист\nПредприниматель\nПросто хороший человек',
    professions: ['Юрист', 'Предприниматель', 'Просто хороший человек'],
    email: 'khan@mansoni.ru'
  })
});
const updateData = await updateResult.json();
console.log('Profile Updated:', updateData);
```

### Шаг 2: Создать Test User

```javascript
// 1. Создать test user
const testResult = await fetch('https://YOUR-PROJECT.supabase.co/functions/v1/phone-auth', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'register-or-login',
    phone: '+79999999999',
    display_name: 'Тестовый Пользователь'
  })
});
const testData = await testResult.json();
console.log('Test User Created:', testData);
```

### Шаг 3: Инициализировать Owner как Admin (опционально)

```javascript
// Если хочешь сделать Owner тоже админом:
const setupResult = await fetch('https://YOUR-PROJECT.supabase.co/functions/v1/setup-owner', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'setup-owner-and-testuser'
  })
});
const setupData = await setupResult.json();
console.log('Setup Result:', setupData);
```

### Шаг 4: Вход в приложение

1. Перейди на `/auth`
2. Нажми "Регистрация"
3. Введи номер телефона: `+79333222922`
4. Заполни все поля:
   - Email: khan@mansoni.ru
   - Full Name: Мансуров Джехангир Мирзаевич
   - Birth Date: 24.03.1996
   - Professions: Юрист, Предприниматель, Просто хороший человек
   - Bio: (опционально)

### Шаг 5: Проверить что Owner создан с галочкой

1. Войди как Owner
2. Перейди в `/profile` — должна быть галочка 👑 "Владелец"
3. Проверь что все данные заполнены

### Инструкции для UI

#### Регистрация без SMS/пароля

В **AuthPage.tsx** - уже поддерживается phone-based регистрация через `RegistrationModal`.

**Текущий flow:**
1. User вводит номер телефона
2. Нажимает "Регистрация"
3. Появляется modal с формой (name, birthdate, email, professions, bio)
4. Нажимает "Завершить регистрацию"
5. Автоматически логируется без пароля

#### Отображение Verification Badge

Галочка "Владелец" 👑 отображается:

1. **На карточке пользователя** (ProfileCard, UserCard)
   - Импортируй: `import { VerificationBadges } from '@/components/profile/VerificationBadge';`
   - Используй: `<VerificationBadges verifications={profile.verifications} />`

2. **На странице профиля** (ProfilePage.tsx)
   - После display_name:
   ```tsx
   <h1 className="text-3xl font-bold">{profile?.display_name}</h1>
   <VerificationBadges verifications={profile?.verifications} size="lg" />
   ```

3. **В search results** (useSearch.tsx)
   - Добавь поле `verified` в select
   - Отображай badge рядом с name

---

## Данные для Owner

| Field | Value |
|---|---|
| Phone | +79333222922 |
| Email | khan@mansoni.ru |
| Password | Ag121212. |
| Full Name | Мансуров Джехангир Мирзаевич |
| Date of Birth | 24.03.1996 (29 лет) |
| Professions | Юрист, Предприниматель, Просто хороший человек |
| Verification | Owner (👑 галочка) |

## Данные для Test User

| Field | Value |
|---|---|
| Phone | +79999999999 |
| Name | Тестовый Пользователь |
| Password | Не требуется (phone-based) |

---

## Автоматическое подтягивание информации о телефоне

Все пользователи автоматически загружают информацию о телефоне:

1. **При регистрации**: phone сохраняется в `profiles.phone`
2. **При входе**: phone загружается из профиля
3. **На профиль странице**: отображается как контактная информация

**Эта логика единая для всех пользователей** (нет разницы между Owner и обычным user, кроме verification badge).

---

## FAQ

**Q: Как войти если нет пароля?**
A: Phone-based authentication. На AuthPage введи номер телефона, затем заполни данные профиля в modal. Автоматически создаётся account и логинишься.

**Q: Где сохраняется пароль?**
A: Для phone-auth создаётся random пароль в Supabase Auth, но UIне требует ввода пароля. Это в порядке — можно использовать magic link для восстановления.

**Q: Как сделать Owner админом?**
A: Используй `setup-owner-and-testuser` функцию (шаг 3). Она автоматически:
- Создаёт запись в `admin_users`
- Назначает роль `owner` к админ системе
- Создаёт verification badge "owner"

**Q: Где отображается галочка?**
A: На всех карточках профиля (ProfilePage, UserCard, ContactCard, в поиске, в chat header и т.д.). Компонент `<VerificationBadges>` показывает все active verifications.

---

## Примечание: Development Mode

На время разработки:
- ✅ Регистрация без SMS (phone mock или skip)
- ✅ Вход без пароля (phone-based)
- ✅ Owner gets special verification badge
- ✅ Все данные сохраняются в Supabase

В production:
- Можно добавить real SMS verification
- Или OAuth (Google, Apple)
- Все остальное остаётся таким же
