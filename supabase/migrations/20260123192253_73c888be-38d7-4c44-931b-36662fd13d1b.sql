-- Исправляем overly permissive policies

-- 1. Удаляем слишком открытую политику для commissions
DROP POLICY IF EXISTS "System can create commissions" ON public.insurance_commissions;

-- Создаём более строгую политику - только админы или через edge function (service role)
CREATE POLICY "Only admins can create commissions"
ON public.insurance_commissions FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'));

-- 2. Удаляем слишком открытую политику для renewals
DROP POLICY IF EXISTS "System can manage renewals" ON public.policy_renewals;

-- Создаём более строгие политики
CREATE POLICY "Admins can manage renewals"
ON public.policy_renewals FOR ALL
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Agents can update own renewals"
ON public.policy_renewals FOR UPDATE
USING (agent_id IN (SELECT id FROM public.agent_profiles WHERE user_id = auth.uid()));

-- 3. Проверяем и фиксим notifications (предыдущие проблемы)
-- Эти политики уже существуют, но проверим

-- 4. Фиксим post_views - это было с предыдущего проекта
-- Оставляем как есть - публичный доступ к просмотрам нормальное поведение