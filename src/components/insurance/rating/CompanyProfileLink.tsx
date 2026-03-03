import { motion } from "framer-motion";
import { Bell, MessageSquare, Phone, Users, FileText, Shield } from "lucide-react";
import { Link } from "react-router-dom";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { CompanyVerificationBadge } from "./CompanyVerificationBadge";
import type { VerificationLevel } from "./CompanyVerificationBadge";

interface CompanyProfileLinkProps {
  companyId: string;
  companyName: string;
  verificationLevel?: VerificationLevel;
  followers?: number;
  posts?: number;
  policiesCount?: number;
  recentPosts?: { id: string; title: string; bg: string }[];
}

const DEFAULT_POSTS = [
  { id: "p1", title: "Новый продукт", bg: "from-violet-800 to-violet-600" },
  { id: "p2", title: "Акция", bg: "from-blue-800 to-blue-600" },
  { id: "p3", title: "Советы", bg: "from-emerald-800 to-emerald-600" },
];

function formatCount(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}М`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}К`;
  return String(n);
}

export function CompanyProfileLink({
  companyId,
  companyName,
  verificationLevel = "verified",
  followers = 12400,
  posts = 87,
  policiesCount = 15200,
  recentPosts = DEFAULT_POSTS,
}: CompanyProfileLinkProps) {
  return (
    <Card className="bg-white/[0.02] border-white/[0.06]">
      <CardContent className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Avatar className="w-12 h-12">
            <AvatarFallback className="bg-violet-500/20 text-violet-300 text-lg font-bold">
              {companyName[0]}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <Link
              to={`/insurance/companies/${companyId}`}
              className="text-sm font-semibold text-white hover:text-violet-300 transition-colors"
            >
              {companyName}
            </Link>
            <p className="text-xs text-white/40 mt-0.5">Страница компании на Mansoni</p>
            <div className="mt-1">
              <CompanyVerificationBadge level={verificationLevel} />
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { icon: Users, label: "Подписчики", value: formatCount(followers) },
            { icon: FileText, label: "Публикации", value: formatCount(posts) },
            { icon: Shield, label: "Полисов", value: formatCount(policiesCount) },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="space-y-0.5">
              <p className="text-base font-bold text-white">{value}</p>
              <p className="text-[10px] text-white/40 flex items-center justify-center gap-0.5">
                <Icon className="w-2.5 h-2.5" />
                {label}
              </p>
            </div>
          ))}
        </div>

        <Separator className="bg-white/[0.06]" />

        {/* Action buttons */}
        <div className="flex gap-2">
          <Button
            size="sm"
            className="flex-1 bg-violet-600 hover:bg-violet-500 text-xs"
            onClick={() => toast.success(`Вы подписались на ${companyName}`)}
          >
            <Bell className="w-3.5 h-3.5 mr-1" />
            Подписаться
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 border-white/10 text-white/70 text-xs"
            onClick={() => toast.info("Открываем чат...")}
          >
            <MessageSquare className="w-3.5 h-3.5 mr-1" />
            Написать
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="border-white/10 text-white/70 text-xs px-3"
            onClick={() => toast.info("Звоним...")}
          >
            <Phone className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Recent posts */}
        <div>
          <p className="text-xs text-white/40 mb-2">Последние публикации</p>
          <div className="flex gap-1.5">
            {recentPosts.map((post, idx) => (
              <motion.div
                key={post.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.06 }}
                className={`flex-1 h-16 rounded-lg bg-gradient-to-br ${post.bg} flex items-end p-1.5 cursor-pointer hover:opacity-80 transition-opacity`}
              >
                <span className="text-[9px] text-white/70 line-clamp-1">{post.title}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
