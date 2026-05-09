import React from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useAuth } from '@/hooks/useAuth';

export default function ProfileWidget() {
  const { user } = useAuth();
  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Гость';
  const avatarUrl = user?.user_metadata?.avatar_url || undefined;

  return (
    <div className="p-3 flex items-center gap-3">
      <Avatar className="h-10 w-10 shrink-0">
        {avatarUrl ? (
          <img src={avatarUrl} alt={displayName} className="aspect-square h-full w-full rounded-full object-cover" />
        ) : null}
        <AvatarFallback className="bg-gray-700 text-white">
          {displayName.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <div className="font-medium text-sidebar-foreground truncate">{displayName}</div>
        <div className="text-xs text-muted-foreground truncate">{user?.email ?? 'Войдите в аккаунт'}</div>
      </div>
    </div>
  );
}