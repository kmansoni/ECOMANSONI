---
name: vercel-deploy
description: >-
  Деплой проектов на Vercel без авторизации: автодетект фреймворка,
  preview URL, claim URL, поддержка Next.js/Vite/React.
  Use when: деплой, Vercel, preview, hosting, deploy frontend, CI/CD Vercel.
metadata:
  category: devops-deployment
  source:
    repository: 'https://github.com/Kilo-Org/kilo-marketplace'
    path: skills/vercel-deploy
---

# Vercel Deploy

Деплой на Vercel без необходимости авторизации — получи preview URL мгновенно.

## Когда использовать

- Быстрый деплой для демо / review
- Preview URL для PR и тестирования
- Статичные сайты и SPA
- SSR приложения (Next.js, Nuxt)
- Проверка production build

## Быстрый старт

### Установка Vercel CLI
```bash
npm i -g vercel
```

### Deploy (без авторизации)
```bash
# Из директории проекта
vercel --yes

# Результат:
# 🔗 Preview: https://project-xxx.vercel.app
# 🔗 Claim: https://vercel.com/claim/xxx
```

### Production deploy
```bash
vercel --prod --yes
```

## Framework Detection

Vercel автоматически определяет фреймворк:

| Фреймворк | Build Command | Output |
|-----------|--------------|--------|
| Next.js | `next build` | `.next/` |
| Vite | `vite build` | `dist/` |
| Create React App | `react-scripts build` | `build/` |
| Nuxt | `nuxt build` | `.output/` |
| Astro | `astro build` | `dist/` |
| SvelteKit | `vite build` | `.svelte-kit/` |

### Кастомная конфигурация
```json
// vercel.json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

## SPA Routing

Для React Router / Vue Router:
```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

## Environment Variables

```bash
# При деплое
vercel --yes -e API_URL=https://api.example.com

# Или через vercel.json
{
  "env": {
    "VITE_API_URL": "@api-url"
  }
}
```

## CI/CD Integration

### GitHub Actions
```yaml
- name: Deploy to Vercel
  run: |
    npm i -g vercel
    vercel pull --yes --environment=preview --token=${{ secrets.VERCEL_TOKEN }}
    vercel build --token=${{ secrets.VERCEL_TOKEN }}
    vercel deploy --prebuilt --token=${{ secrets.VERCEL_TOKEN }}
```

## Claim URL

После деплоя без авторизации Vercel даёт claim URL:
- Позволяет привязать деплой к аккаунту
- Настроить кастомный домен
- Включить analytics
- Настроить serverless functions

## Ограничения (бесплатный план)

- 100 GB bandwidth / месяц
- Serverless: 100 GB-hours
- Builds: 6000 минут / месяц
- 1 concurrent build
- 50 доменов

## Best Practices

✓ Используй `vercel.json` для reproducible deploys
✓ SPA routing через rewrites
✓ Environment variables через secrets, не в коде
✓ Preview deployments для каждого PR
✓ Claim URL — привязка к аккаунту для persistent deploy
✗ Не деплой secrets в preview (они публичны)
✗ Не используй бесплатный план для production с высоким трафиком
