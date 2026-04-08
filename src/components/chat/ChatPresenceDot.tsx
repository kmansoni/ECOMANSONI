import { OnlineDot } from "@/components/ui/OnlineDot";
import { useUserPresenceStatus } from "@/hooks/useUserPresenceStatus";

interface ChatPresenceDotProps {
  userId?: string | null;
}

export function ChatPresenceDot({ userId }: ChatPresenceDotProps) {
  const { isOnline } = useUserPresenceStatus(userId);
  return <OnlineDot isOnline={isOnline} size="sm" />;
}