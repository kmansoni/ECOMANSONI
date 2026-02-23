# Notification Router

Production skeleton for push routing:
- APNs direct for iOS
- FCM for Android
- BullMQ queueing with retries
- Dedup/collapse/policy hooks
- Supabase-backed event claim + delivery persistence

## Run

```bash
cd services/notification-router
npm i
npm run dev
```

## Env

Required:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `REDIS_URL` (default `redis://127.0.0.1:6379`)
- `NOTIF_QUEUE_PREFIX` (default `mansoni:notif`)
- `NOTIF_POLL_INTERVAL_MS` (default `1200`)
- `NOTIF_CLAIM_BATCH_SIZE` (default `100`)
- `APNS_TOPIC`
- `APNS_VOIP_TOPIC` (optional but recommended for incoming calls)
- `APNS_USE_SANDBOX=1` for dev sandbox
- `APNS_KEY_ID`
- `APNS_TEAM_ID`
- `APNS_PRIVATE_KEY` (single line with `\n` or raw PEM)
- `FCM_PROJECT_ID`
- `FCM_CLIENT_EMAIL`
- `FCM_PRIVATE_KEY` (single line with `\n` or raw PEM)

## Database

Apply migration:

- `supabase/migrations/20260222010000_notification_router_core.sql`

This creates:
- `public.device_tokens`
- `public.notification_events`
- `public.notification_deliveries`
- RPC `public.claim_notification_events(p_limit integer)`
