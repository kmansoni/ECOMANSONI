import { useMemo } from "react";
import { CheckCircle2, Circle, Clock, XCircle, FileCheck } from "lucide-react";
import {
  type BizLegalStatus,
  type BizLegalStatusLogRow,
  STATUS_TITLES,
} from "@/lib/bizRegistrationApi";

interface Props {
  currentStatus: BizLegalStatus;
  log: BizLegalStatusLogRow[];
}

const STATUS_ICON: Record<BizLegalStatus, React.ComponentType<{ className?: string }>> = {
  draft: Circle,
  submitted: Clock,
  under_review: Clock,
  needs_fixes: FileCheck,
  sent_to_fns: FileCheck,
  approved: CheckCircle2,
  rejected: XCircle,
};

const STATUS_COLOR: Record<BizLegalStatus, string> = {
  draft: "text-muted-foreground",
  submitted: "text-sky-500",
  under_review: "text-sky-500",
  needs_fixes: "text-amber-500",
  sent_to_fns: "text-violet-500",
  approved: "text-green-500",
  rejected: "text-red-500",
};

export function StatusTimeline({ currentStatus, log }: Props) {
  const sorted = useMemo(
    () => [...log].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [log],
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {(() => {
          const Icon = STATUS_ICON[currentStatus];
          return <Icon className={`w-5 h-5 ${STATUS_COLOR[currentStatus]}`} />;
        })()}
        <div className="font-semibold">{STATUS_TITLES[currentStatus]}</div>
      </div>

      <ol className="relative pl-6 border-l border-border space-y-3">
        {sorted.map((row) => {
          const Icon = STATUS_ICON[row.to_status];
          return (
            <li key={row.id} className="relative">
              <span className={`absolute -left-[27px] flex h-5 w-5 items-center justify-center rounded-full bg-background border ${STATUS_COLOR[row.to_status]}`}>
                <Icon className="w-3 h-3" />
              </span>
              <div className="text-sm">
                <span className="font-medium">{STATUS_TITLES[row.to_status]}</span>
                {row.from_status && (
                  <span className="text-muted-foreground">
                    {" "}· из «{STATUS_TITLES[row.from_status]}»
                  </span>
                )}
              </div>
              {row.comment && (
                <div className="text-sm text-muted-foreground mt-0.5">{row.comment}</div>
              )}
              <div className="text-xs text-muted-foreground">
                {new Date(row.created_at).toLocaleString("ru-RU")}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
