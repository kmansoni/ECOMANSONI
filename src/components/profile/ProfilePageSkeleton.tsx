import { User } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ProfilePageSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header skeleton */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />
        <div className="h-5 w-32 rounded bg-muted animate-pulse" />
        <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />
      </div>
      {/* Avatar + stats skeleton */}
      <div className="px-4 pt-2 pb-4">
        <div className="flex items-center gap-6">
          <div className="w-20 h-20 rounded-full bg-muted animate-pulse shrink-0" />
          <div className="flex-1 flex justify-around">
            {[0, 1, 2].map(i => (
              <div key={i} className="flex flex-col items-center gap-1">
                <div className="h-5 w-10 rounded bg-muted animate-pulse" />
                <div className="h-3 w-14 rounded bg-muted animate-pulse" />
              </div>
            ))}
          </div>
        </div>
        <div className="mt-3 space-y-2">
          <div className="h-4 w-36 rounded bg-muted animate-pulse" />
          <div className="h-3 w-full rounded bg-muted animate-pulse" />
          <div className="h-3 w-2/3 rounded bg-muted animate-pulse" />
        </div>
        <div className="flex gap-2 mt-4">
          <div className="flex-1 h-9 rounded-xl bg-muted animate-pulse" />
          <div className="flex-1 h-9 rounded-xl bg-muted animate-pulse" />
        </div>
      </div>
      {/* Grid skeleton */}
      <div className="grid grid-cols-3 gap-0.5">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="aspect-square bg-muted animate-pulse" />
        ))}
      </div>
    </div>
  );
}

export function ProfileLoginPrompt({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 gap-4">
      <User className="w-16 h-16 text-muted-foreground" />
      <h2 className="text-lg font-semibold">Войдите в аккаунт</h2>
      <p className="text-muted-foreground text-center text-sm">Чтобы просматривать профиль</p>
      <Button onClick={onLogin}>Войти</Button>
    </div>
  );
}
