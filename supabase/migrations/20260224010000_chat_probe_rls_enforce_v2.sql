-- Ensure chat core tables keep RLS enabled for schema probe v2 and security hygiene.
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
