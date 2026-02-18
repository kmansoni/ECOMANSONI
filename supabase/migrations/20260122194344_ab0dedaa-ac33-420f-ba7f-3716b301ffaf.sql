-- Create function to get or create direct message conversation atomically
CREATE OR REPLACE FUNCTION public.get_or_create_dm(target_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_conv UUID;
  new_conv UUID;
  current_user_id UUID := auth.uid();
BEGIN
  -- Check if current user is authenticated
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  -- Cannot message yourself
  IF current_user_id = target_user_id THEN
    RAISE EXCEPTION 'Cannot message yourself';
  END IF;

  -- Find existing conversation between the two users
  SELECT cp1.conversation_id INTO existing_conv
  FROM conversation_participants cp1
  JOIN conversation_participants cp2 
    ON cp1.conversation_id = cp2.conversation_id
  WHERE cp1.user_id = current_user_id 
    AND cp2.user_id = target_user_id
  LIMIT 1;
  
  IF existing_conv IS NOT NULL THEN
    RETURN existing_conv;
  END IF;
  
  -- Create new conversation
  INSERT INTO conversations DEFAULT VALUES
  RETURNING id INTO new_conv;
  
  -- Add both participants
  INSERT INTO conversation_participants (conversation_id, user_id)
  VALUES 
    (new_conv, current_user_id),
    (new_conv, target_user_id);
    
  RETURN new_conv;
END;
$$;

-- Create index on display_name for faster profile lookups
CREATE INDEX IF NOT EXISTS idx_profiles_display_name ON profiles(display_name);