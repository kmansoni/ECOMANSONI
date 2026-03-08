-- Service bugs registry for technical incident tracking

create table if not exists public.service_bugs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  service text not null,
  title text not null,
  symptoms text[] not null default '{}'::text[],
  root_cause text not null default '',
  tech_notes text[] not null default '{}'::text[],
  checks text[] not null default '{}'::text[],
  workaround text not null default '',
  status text not null default 'open' check (status in ('open', 'in_progress', 'fixed')),
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_service_bugs_status on public.service_bugs(status);
create index if not exists idx_service_bugs_service on public.service_bugs(service);
create index if not exists idx_service_bugs_sort_order on public.service_bugs(sort_order);

create or replace function public.set_service_bugs_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_service_bugs_updated_at on public.service_bugs;
create trigger trg_service_bugs_updated_at
before update on public.service_bugs
for each row
execute function public.set_service_bugs_updated_at();

alter table public.service_bugs enable row level security;

-- Read for authenticated users (for service diagnostic screen)
drop policy if exists "service_bugs_select_authenticated" on public.service_bugs;
create policy "service_bugs_select_authenticated"
on public.service_bugs
for select
to authenticated
using (true);

-- Admin/service-role write access only
drop policy if exists "service_bugs_insert_service_role" on public.service_bugs;
create policy "service_bugs_insert_service_role"
on public.service_bugs
for insert
to service_role
with check (true);

drop policy if exists "service_bugs_update_service_role" on public.service_bugs;
create policy "service_bugs_update_service_role"
on public.service_bugs
for update
to service_role
using (true)
with check (true);

drop policy if exists "service_bugs_delete_service_role" on public.service_bugs;
create policy "service_bugs_delete_service_role"
on public.service_bugs
for delete
to service_role
using (true);

insert into public.service_bugs (
  slug,
  service,
  title,
  symptoms,
  root_cause,
  tech_notes,
  checks,
  workaround,
  status,
  sort_order
)
values
  (
    'sms-endpoints-drift',
    'Auth + SMS',
    'Дрейф набора endpoint-ов между сборками',
    array[
      'В одной сессии виден только /send-sms-otp, в другой появляется /verify-sms-otp.',
      'Списки endpoint-ов в UI отличаются без явного деплоя клиента.'
    ],
    'Несогласованные ревизии edge-functions между окружениями или частично завершенный деплой (rolling update).',
    array[
      'Проверять hash и timestamp всех функций в проекте перед публикацией API-списка.',
      'Закрыть возможность частичного релиза функции без smoke-check полного набора endpoint-ов.'
    ],
    array[
      'Сравнить supabase functions list между окружениями.',
      'Прогнать smoke на обязательные auth/sms endpoint-ы после деплоя.'
    ],
    'Принудительно выполнить полный deploy набора функций и повторить health/smoke-проверки.',
    'in_progress',
    10
  ),
  (
    'realtime-lock-visibility',
    'Realtime',
    'Каналы подписок отображаются как недоступные (lock) при валидной сессии',
    array[
      'realtime:public:* в API-списке отмечены lock-иконкой.',
      'Подписки присутствуют, но клиент интерпретирует их как закрытые.'
    ],
    'Mismatch между JWT-аудиторией клиента и политикой доступа канала, либо stale token после смены сессии.',
    array[
      'Проверить claims токена: role, aud, sub, exp.',
      'Синхронизировать refresh токена перед созданием realtime channel.'
    ],
    array[
      'Переоткрыть канал после ручного refresh access token.',
      'Проверить RLS/Realtime policy на таблицы сообщений, звонков и уведомлений.'
    ],
    'Реинициализировать realtime-клиент после auth refresh и повторить join каналов.',
    'open',
    20
  ),
  (
    'api-index-cache-stale',
    'API Explorer',
    'Устаревший кэш индекса endpoint-ов',
    array[
      'После добавления endpoint-ов список в мобильном UI обновляется не сразу.',
      'Поиск endpoint-ов находит старую структуру секций.'
    ],
    'Кэширование метаданных API на CDN/клиенте без корректной инвалидации по версии схемы.',
    array[
      'Версионировать индекс endpoint-ов (schema_version) и включить cache-busting.',
      'Добавить ETag и forced refresh при несоответствии версии.'
    ],
    array[
      'Сверить ответ индекс-эндпоинта с текущим реестром функций.',
      'Проверить заголовки cache-control и поведение при hard reload.'
    ],
    'Очистить локальный кэш API explorer и перезапросить индекс с bypass cache.',
    'in_progress',
    30
  ),
  (
    'service-health-surface',
    'System / Health',
    'Недостаточная детализация /health для диагностики деградаций',
    array[
      '/health возвращает общий ok, но отдельные сервисы фактически деградированы.',
      'Операторы видят зеленый статус при проблемах Realtime/SMS.'
    ],
    'Агрегированный health-check без component-level breakdown и latency/error budget метрик.',
    array[
      'Расширить /health до component checks: db, auth, sms, realtime, ai.',
      'Добавить thresholds по latency и частоте ошибок на компонент.'
    ],
    array[
      'Сравнить агрегированный health со статусом компонентных probes.',
      'Проверить алерты по SLA до и после расширения health payload.'
    ],
    'Использовать отдельные probe endpoint-ы до внедрения расширенного /health.',
    'open',
    40
  ),
  (
    'image-viewer-oversize',
    'Chat Media',
    'Фото в диалоге раскрывается в чрезмерно большом размере',
    array[
      'На открытии изображения нарушается fit-to-screen и кадр выходит за границы вьюпорта.',
      'Пользователь видит гигантское изображение до ручного масштабирования.'
    ],
    'В image-viewer использовался режим без ограничения максимальной ширины по viewport.',
    array[
      'Перевести рендер в object-contain + max-width/max-height от viewport.',
      'Блокировать скролл body на время fullscreen media modal.'
    ],
    array[
      'Проверка portrait/landscape изображений на mobile/desktop.',
      'Проверка закрытия по backdrop и Escape без side-effects.'
    ],
    'Фикс уже внесен в image-viewer; требуется регрессия на медиа-галерее и каналах.',
    'fixed',
    50
  )
on conflict (slug)
do update set
  service = excluded.service,
  title = excluded.title,
  symptoms = excluded.symptoms,
  root_cause = excluded.root_cause,
  tech_notes = excluded.tech_notes,
  checks = excluded.checks,
  workaround = excluded.workaround,
  status = excluded.status,
  sort_order = excluded.sort_order,
  updated_at = now();
