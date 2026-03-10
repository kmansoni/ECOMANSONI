WITH parts AS (
  SELECT cp.conversation_id, COUNT(*) AS participants_total
  FROM public.conversation_participants cp
  GROUP BY cp.conversation_id
),
parts_valid AS (
  SELECT cp.conversation_id, COUNT(*) AS participants_in_auth
  FROM public.conversation_participants cp
  JOIN auth.users u ON u.id = cp.user_id
  GROUP BY cp.conversation_id
)
SELECT
  (SELECT COUNT(*) FROM public.conversations) AS conversations_total,
  (SELECT COUNT(*) FROM public.conversation_state) AS conversation_state_total,
  (SELECT COUNT(*) FROM public.chat_inbox_projection) AS inbox_projection_total,
  (SELECT COUNT(*) FROM public.conversations c LEFT JOIN parts p ON p.conversation_id = c.id WHERE COALESCE(p.participants_total,0)=0) AS conversations_without_participants,
  (SELECT COUNT(*) FROM public.conversations c LEFT JOIN parts_valid p ON p.conversation_id = c.id WHERE COALESCE(p.participants_in_auth,0)=0) AS conversations_without_valid_participants,
  (SELECT COUNT(*) FROM public.conversations c LEFT JOIN parts_valid p ON p.conversation_id = c.id WHERE COALESCE(p.participants_in_auth,0)=1) AS conversations_with_exactly_one_valid_participant;
