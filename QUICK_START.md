# 🚀 Быстрый старт: Миграция в Timeweb Cloud за 15 минут

## 📥 Что у тебя уже готово

✅ **229 миграций** экспортированы в один файл:  
   `supabase\.temp\all-migrations.sql` (1.42 MB)

✅ **Скрипт автоустановки** готов:  
   `scripts\server-setup.sh`

---

## 🎯 Три простых шага

### Шаг 1: Подключись к серверу

```bash
ssh ubuntu@5.42.99.76
```

Пароль: `jWYTEVVE@b1c-_`

---

### Шаг 2: Скопируй и запусти скрипт установки

**На сервере** выполни одной командой:

```bash
cat > /tmp/server-setup.sh << 'SETUPSCRIPT'
```

**Затем скопируй весь текст из файла** `scripts\server-setup.sh` и вставь в терминал.

После вставки нажми Enter и введи:

```bash
SETUPSCRIPT
```

Запусти скрипт:

```bash
chmod +x /tmp/server-setup.sh
bash /tmp/server-setup.sh
```

Скрипт запросит:
- Пароль для БД `mansoni_app` (введи дважды)

**Скрипт автоматически:**
- ✅ Установит PostgreSQL 15
- ✅ Создаст БД `mansoni` и пользователя `mansoni_app`
- ✅ Установит PostgREST (REST API для БД)
- ✅ Настроит Nginx как reverse proxy
- ✅ Настроит firewall
- ✅ Настроит автоматические бэкапы (каждый день в 3:00)

**Время выполнения:** ~5 минут

---

### Шаг 3: Загрузи и примени миграции

#### 3.1 Скопируй SQL файл на сервер (ЛОКАЛЬНО на Windows)

```powershell
# В PowerShell на твоем компьютере
scp "C:\Users\manso\Desktop\разработка\your-ai-companion-main\supabase\.temp\all-migrations.sql" ubuntu@5.42.99.76:/tmp/
```

Введи пароль: `jWYTEVVE@b1c-_`

#### 3.2 Примени миграции (НА СЕРВЕРЕ)

```bash
# Подключись к серверу если отключился
ssh ubuntu@5.42.99.76

# Примени миграции (займет 1-2 минуты)
PGPASSWORD='твой_пароль_для_mansoni_app' psql -U mansoni_app -d mansoni -f /tmp/all-migrations.sql 2>&1 | tee /tmp/migration.log

# Проверь результат
echo "Ошибок при миграции: $(grep -c ERROR /tmp/migration.log)"
echo "Успешных команд: $(grep -c '^(CREATE\|ALTER\|INSERT)' /tmp/migration.log)"
```

---

## ✅ Проверка работы

### На сервере:

```bash
# 1. Проверь, что PostgREST работает
curl http://localhost:3000/

# Ожидается JSON с описанием API

# 2. Проверь таблицы в БД
PGPASSWORD='твой_пароль' psql -U mansoni_app -d mansoni -c "\dt"

# Должно быть 50+ таблиц

# 3. Проверь статус сервисов
sudo systemctl status postgresql postgrest-mansoni nginx

# Все должны быть active (running)
```

### На твоем компьютере (ЛОКАЛЬНО):

```powershell
# Проверь API через интернет
curl http://5.42.99.76/

# Должен вернуть JSON с эндпоинтами API
```

---

## 🌐 Обновление Frontend

### 1. Создай `.env.production`

```powershell
# В корне проекта создай файл .env.production
@"
# Timeweb Cloud API
VITE_API_URL=http://5.42.99.76
VITE_API_KEY=твой_JWT_secret_из_установки

# Supabase (временно для Auth и Storage)
VITE_SUPABASE_URL=https://lfkbgnbjxskspsownvjm.supabase.co
VITE_SUPABASE_ANON_KEY=твой_анонимный_ключ
"@ | Out-File -FilePath .env.production -Encoding utf8
```

### 2. Добавь GitHub Secrets

Перейди в **Settings → Secrets → Actions** и добавь:

- `VITE_API_URL`: `http://5.42.99.76`
- `VITE_API_KEY`: JWT secret из лога установки

### 3. Обнови workflow (опционально)

Если нужно, обнови `.github/workflows/deploy.yml` для использования новых переменных.

---

## 🔒 Настройка SSL и домена (опционально)

Если есть домен (например, `api.mansoni.ru`):

```bash
# На сервере
# 1. Укажи домен в Nginx
sudo nano /etc/nginx/sites-available/mansoni-api
# Измени: server_name api.mansoni.ru;

# 2. Установи certbot
sudo apt install -y certbot python3-certbot-nginx

# 3. Получи SSL сертификат
sudo certbot --nginx -d api.mansoni.ru

# 4. Обнови CORS в Nginx
sudo nano /etc/nginx/sites-available/mansoni-api
# Измени: add_header 'Access-Control-Allow-Origin' 'https://mansoni.ru';

# 5. Перезапусти Nginx
sudo systemctl restart nginx
```

Теперь используй в .env:
```
VITE_API_URL=https://api.mansoni.ru
```

---

## 📊 Мониторинг

### Просмотр логов

```bash
# PostgreSQL
sudo tail -f /var/log/postgresql/postgresql-15-main.log

# PostgREST
sudo journalctl -u postgrest-mansoni -f

# Nginx (access)
sudo tail -f /var/log/nginx/mansoni-api-access.log

# Nginx (errors)
sudo tail -f /var/log/nginx/mansoni-api-error.log
```

### Статистика БД

```bash
PGPASSWORD='твой_пароль' psql -U mansoni_app -d mansoni

# В psql:
-- Размер БД
SELECT pg_size_pretty(pg_database_size('mansoni'));

-- Топ таблиц
SELECT schemaname, tablename, 
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC LIMIT 10;

-- Активные подключения
SELECT count(*) FROM pg_stat_activity;
```

---

## 🆘 Troubleshooting

### Проблема: Миграции не применяются

```bash
# Посмотри последние 50 ошибок
grep ERROR /tmp/migration.log | tail -n 50

# Если проблема с правами:
PGPASSWORD='твой_пароль' psql -U mansoni_app -d mansoni -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO mansoni_app;"
PGPASSWORD='твой_пароль' psql -U mansoni_app -d mansoni -c "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO mansoni_app;"

# Повтори применение миграций
```

### Проблема: PostgREST не отвечает

```bash
# Проверь логи
sudo journalctl -u postgrest-mansoni -n 100

# Проверь конфигурацию
cat /etc/postgrest/mansoni.conf

# Перезапусти
sudo systemctl restart postgrest-mansoni
```

### Проблема: CORS ошибки на frontend

```bash
# Убедись, что в Nginx правильные заголовки
sudo nano /etc/nginx/sites-available/mansoni-api

# Должны быть строки:
# add_header 'Access-Control-Allow-Origin' 'https://mansoni.ru' always;
# add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, PATCH, DELETE, OPTIONS' always;
# add_header 'Access-Control-Allow-Headers' 'Authorization, Content-Type, Accept, apikey' always;

# Перезапусти Nginx
sudo systemctl restart nginx
```

### Проблема: Cannot connect to API from outside

```bash
# Проверь firewall
sudo ufw status

# Убедись, что порты 80 и 443 открыты
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Проверь, что Nginx слушает на правильном интерфейсе
sudo netstat -tlnp | grep nginx
```

---

## 📋 Чек-лист перед запуском

- [ ] PostgreSQL установлен и запущен
- [ ] База `mansoni` и пользователь `mansoni_app` созданы
- [ ] Все 229 миграций применены без критических ошибок
- [ ] PostgREST запущен (`systemctl status postgrest-mansoni`)
- [ ] Nginx запущен и настроен (`curl http://localhost:3000/`)
- [ ] Firewall настроен (порт 5432 закрыт, 80/443 открыты)
- [ ] API доступен извне (`curl http://5.42.99.76/`)
- [ ] .env.production создан с правильными переменными
- [ ] GitHub Secrets обновлены
- [ ] Автоматические бэкапы настроены (`crontab -l`)

---

## 🎉 Готово!

После выполнения всех шагов:

1. **БД работает** на Timeweb Cloud (5.42.99.76)
2. **API доступен** через PostgREST + Nginx
3. **Frontend** будет использовать новую БД после деплоя
4. **Бэкапы** создаются автоматически каждый день

**Следующий шаг:** Настрой домен и SSL для продакшена!

---

Удачи! 🚀

**P.S.** Полная документация в файле `MIGRATION_GUIDE.md`
