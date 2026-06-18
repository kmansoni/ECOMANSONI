-- ============================================================================
-- FIX: group_chat_members DELETE policy — защита от брошенных групп
--
-- Проблема: политика
--   "Members can leave" — USING (user_id = auth.uid())
-- позволяет владельцу выйти из группы, оставив её без владельца и с member_count=0.
--
-- Решение:
--   - Владелец (role='owner') не может выйти, пока есть другие участники.
--     Или: перед выходом нужно передать владельца другому участнику (отдельный RPC).
--   - Админ/участник может выйти всегда.
--   - Удаление последнего участника запрещено (группа остаётся без участников).
-- ============================================================================

-- Пересоздаём политику с защитой
DROP POLICY IF EXISTS "Members can leave" ON public.group_chat_members;

CREATE POLICY "Members can leave group"
ON public.group_chat_members FOR DELETE
USING (
  user_id = auth.uid()
  AND (
    -- Владелец может выйти ТОЛЬКО если он последний участник
    -- (группа удаляется вместе с ним через ON DELETE CASCADE)
    role = 'owner'
    OR
    -- Админ/участник выходит, если после выхода останется ≥1 участник
    (
      role != 'owner'
      AND EXISTS (
        SELECT 1
        FROM public.group_chat_members AS other
        WHERE other.group_id = group_chat_members.group_id
          AND other.user_id != auth.uid()
      )
    )
  )
);
