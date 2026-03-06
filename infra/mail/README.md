# Mansoni Mail Server

Production SMTP-сервер для домена `mansoni.ru` на базе [docker-mailserver](https://docker-mailserver.github.io/docker-mailserver/latest/).

## Стек

| Компонент | Роль |
|---|---|
| **Postfix** | MTA: приём и отправка почты |
| **Dovecot** | IMAP-сервер для чтения почты |
| **OpenDKIM** | DKIM-подписание исходящих писем |
| **SpamAssassin** | Фильтрация спама |
| **Fail2ban** | Защита от брутфорса |
| **email-router** | HTTP API → SMTP relay (шаблоны, валидация) |
| **Certbot** | Автообновление TLS-сертификатов |

## Быстрый старт

```bash
# 1. Клонировать репозиторий на VPS
git clone https://github.com/your-org/mansoni.git /opt/mansoni
cd /opt/mansoni/infra/mail

# 2. Создать .env
cp .env.example .env
nano .env  # Заполнить EMAIL_ROUTER_API_KEY, SMTP_ASSET_PASSWORD

# 3. Запустить setup (TLS, аккаунты, DKIM, запуск)
chmod +x setup-mail.sh
./setup-mail.sh

# 4. Добавить DNS-записи (скрипт выведет их в конце)
# 5. Дождаться propagation (15-60 минут)
# 6. Проверить
curl http://localhost:8090/health
```

## Порты

| Порт | Протокол | Описание |
|---|---|---|
| 25 | SMTP | Входящая почта от других серверов |
| 465 | SMTPS | Implicit TLS (устаревшие клиенты) |
| 587 | SMTP Submission | STARTTLS (аутентифицированные клиенты) |
| 993 | IMAPS | Dovecot IMAP over TLS |
| 8090 | HTTP | email-router API (только localhost) |

## Управление аккаунтами

```bash
# Добавить аккаунт
./dms-setup.sh email add user@mansoni.ru PASSWORD

# Список аккаунтов
./dms-setup.sh email list

# Изменить пароль
./dms-setup.sh email update user@mansoni.ru NEW_PASSWORD

# Удалить аккаунт
./dms-setup.sh email del user@mansoni.ru

# Добавить алиас
./dms-setup.sh alias add alias@mansoni.ru target@mansoni.ru
```

## Отправка письма через API

```bash
curl -X POST http://localhost:8090/send \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "recipient@example.com",
    "from": "asset@mansoni.ru",
    "template": "verification",
    "templateData": {
      "name": "Иван",
      "code": "123456",
      "link": "https://mansoni.ru/verify?code=123456"
    }
  }'
```

## Обновление

```bash
docker compose pull
docker compose up -d
```

## Ротация DKIM-ключей (ежегодно)

```bash
# 1. Сгенерировать новый ключ с новым селектором
./dms-setup.sh config dkim keysize 2048 selector mail2027

# 2. Добавить новую DNS-запись mail2027._domainkey.mansoni.ru
# 3. Подождать 48 часов propagation
# 4. Перезапустить mailserver
docker compose restart mailserver

# 5. Удалить старую DNS-запись через 30 дней
```

## Мониторинг

```bash
# Логи Postfix
docker compose logs -f mailserver

# Статус Fail2ban
docker exec mailserver fail2ban-client status

# Очередь Postfix
docker exec mailserver postqueue -p

# Health check
curl http://localhost:8090/health
```

## Структура файлов

```
infra/mail/
├── docker-compose.yml      # Основная конфигурация стека
├── mailserver.env          # Настройки docker-mailserver
├── .env.example            # Шаблон секретов (скопировать в .env)
├── .env                    # Секреты (в .gitignore!)
├── .gitignore
├── setup-mail.sh           # Скрипт первоначальной настройки
├── README.md               # Этот файл
├── config/                 # Генерируется docker-mailserver (в .gitignore)
│   ├── postfix-accounts.cf # Почтовые аккаунты
│   ├── postfix-virtual.cf  # Алиасы
│   └── opendkim/keys/      # DKIM ключи
├── data/                   # Runtime данные (в .gitignore)
│   ├── mail-data/          # Maildir хранилище
│   ├── mail-state/         # Состояние очередей
│   └── mail-logs/          # Логи
└── certs/                  # TLS сертификаты (в .gitignore)
```
