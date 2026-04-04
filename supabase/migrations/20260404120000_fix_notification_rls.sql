-- Фикс: notification_events и notification_deliveries не имели SELECT-политик
-- для authenticated пользователей — только service_role. Добавляем user-scoped SELECT.

-- notification_events: пользователь видит только свои уведомления
DROP POLICY IF EXISTS "notification_events_select_own" ON notification_events;
DO $$ BEGIN
  CREATE POLICY "notification_events_select_own" ON notification_events
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- notification_deliveries: пользователь видит доставки только своих уведомлений
DROP POLICY IF EXISTS "notification_deliveries_select_own" ON notification_deliveries;
DO $$ BEGIN
  CREATE POLICY "notification_deliveries_select_own" ON notification_deliveries
    FOR SELECT
    TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM notification_events ne
        WHERE ne.event_id = notification_deliveries.event_id
          AND ne.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
