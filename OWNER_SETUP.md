# Owner & Test User Setup Guide

## Актуальный статус auth

- Primary flow: `send-email-otp` + `verify-email-otp`
- Optional flow: `send-sms-otp` + `verify-sms-otp`
- Legacy `phone-auth` и `services/auth` удалены из проекта

## Шаг 1: Создать Owner через UI

1. Перейдите на `/auth`
2. Нажмите "Регистрация"
3. Укажите телефон и email Owner
4. Подтвердите вход через email OTP
5. Заполните профиль Owner

## Шаг 2: Создать Test User

1. Повторите регистрацию для тестового пользователя
2. Подтвердите вход через email OTP

## Шаг 3: Назначить Owner verification/admin

Используйте действующую админ-функцию/SQL, например через `setup-owner` (если включено в окружении), чтобы:

- добавить запись в `admin_users`
- назначить роль owner
- активировать verification badge

## Проверка

1. Вход Owner работает через email OTP
2. На `/profile` отображается badge "Владелец"
3. Owner получает доступ к `/admin`

## Примечание

Этот документ обновлён после удаления legacy стека `phone-auth`.
