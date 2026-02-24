import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useAdminMe } from "@/hooks/useAdminMe";
import { isOwner, hasScope } from "@/lib/adminApi";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

type NavLink = { to: string; label: string; ownerOnly?: boolean; requireScope?: string };

export function AdminShell({ children }: { children: ReactNode }) {
  const { me } = useAdminMe();
  const location = useLocation();

  const links: NavLink[] = [
    { to: "/admin", label: "Dashboard" },
    { to: "/admin/admins", label: "Админы" },
    { to: "/admin/staff-profiles", label: "Staff Profiles", requireScope: "staff.profile.read" },
    { to: "/admin/verifications", label: "Verifications", requireScope: "verification.read" },
    { to: "/admin/hashtags", label: "Hashtags", requireScope: "hashtag.status.write" },
    { to: "/admin/moderation-queue", label: "Mod Queue", requireScope: "moderation.review" },
    { to: "/admin/appeals", label: "Appeals", requireScope: "moderation.review" },
    { to: "/admin/audit", label: "Аудит" },
    { to: "/admin/approvals", label: "Approvals" },
    { to: "/admin/jit", label: "JIT", requireScope: "security.jit.request" },
    { to: "/admin/kpi-dashboard", label: "KPI Monitor" },
    { to: "/admin/owner", label: "Owner", ownerOnly: true },
  ];

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast.success("Вышли");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur border-b">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-semibold truncate">Admin Console</div>
            <div className="text-xs text-muted-foreground truncate">
              {me?.display_name} В· {me?.email}
            </div>
          </div>
          <Button variant="outline" onClick={handleSignOut}>
            Выйти
          </Button>
        </div>
        <Separator />
        <nav className="max-w-6xl mx-auto px-4 py-2 flex gap-2 overflow-x-auto">
          {links
            .filter((l) => {
              if (l.ownerOnly && !isOwner(me)) return false;
              if (l.requireScope && !hasScope(me, l.requireScope)) return false;
              return true;
            })
            .map((l) => {
              const active = location.pathname === l.to;
              return (
                <Link
                  key={l.to}
                  to={l.to}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-sm whitespace-nowrap",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted hover:bg-muted/70 text-foreground",
                  )}
                >
                  {l.label}
                </Link>
              );
            })}
        </nav>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}

