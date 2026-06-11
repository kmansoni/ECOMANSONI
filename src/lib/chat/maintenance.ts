import { supabase } from "@/integrations/supabase/client";

export async function checkAndVacuumIfNeeded(): Promise<void> {
  const { error } = await supabase.rpc("vacuum_chat_messages");

  if (error) {
    throw error;
  }
}
