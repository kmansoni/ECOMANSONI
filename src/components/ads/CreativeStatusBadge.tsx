/**
 * CreativeStatusBadge — бейдж статуса креатива.
 *
 * Показывает: draft, pending_review, approved, rejected, archived
 * с соответствующими цветами и иконками.
 */

import { Badge } from "@/components/ui/badge";
import { 
  FileEdit, 
  Clock, 
  CheckCircle, 
  XCircle, 
  Archive 
} from "lucide-react";
import type { AdCreativeStatus } from "@/lib/ads/types";

const statusConfig: Record<AdCreativeStatus, { label: string; color: string; icon: React.ElementType }> = {
  draft: { label: 'Черновик', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300', icon: FileEdit },
  pending_review: { label: 'На модерации', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300', icon: Clock },
  approved: { label: 'Одобрен', color: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300', icon: CheckCircle },
  rejected: { label: 'Отклонён', color: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300', icon: XCircle },
  archived: { label: 'Архив', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300', icon: Archive },
};

interface CreativeStatusBadgeProps {
  status: AdCreativeStatus;
  showIcon?: boolean;
}

export function CreativeStatusBadge({ status, showIcon = true }: CreativeStatusBadgeProps) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <Badge className={`${config.color} flex items-center gap-1 w-fit`}>
      {showIcon && <Icon className="w-3 h-3" />}
      <span>{config.label}</span>
    </Badge>
  );
}
