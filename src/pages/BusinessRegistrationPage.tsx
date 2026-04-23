import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Briefcase, UserRound, Building2, Plus, Clock, CheckCircle2, XCircle, AlertTriangle, ListTree } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type BizLegalApplication,
  type BizLegalKind,
  KIND_TITLES,
  STATUS_TITLES,
  listOwnApplications,
} from "@/lib/bizRegistrationApi";
import { RegistrationWizard } from "@/components/business-registration/RegistrationWizard";
import { StatusTimeline } from "@/components/business-registration/StatusTimeline";
import { getApplication } from "@/lib/bizRegistrationApi";
import { toast } from "sonner";

const KIND_ICON: Record<BizLegalKind, React.ComponentType<{ className?: string }>> = {
  self_employed: UserRound,
  entrepreneur: Briefcase,
  legal_entity: Building2,
};

const STATUS_BADGE: Partial<Record<BizLegalApplication["status"], "default" | "secondary" | "outline" | "destructive">> = {
  approved: "default",
  rejected: "destructive",
  needs_fixes: "outline",
  draft: "secondary",
};

export default function BusinessRegistrationPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [apps, setApps] = useState<BizLegalApplication[]>([]);
  const [loading, setLoading] = useState(true);

  const currentKind = searchParams.get("new") as BizLegalKind | null;
  const editId = searchParams.get("edit");
  const detailId = searchParams.get("id");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listOwnApplications()
      .then((rows) => {
        if (!cancelled) setApps(rows);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Ошибка"))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentKind, editId]);

  if (currentKind) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6">
        <Button variant="ghost" onClick={() => setSearchParams({})} className="mb-4">← К моим заявкам</Button>
        <RegistrationWizard kind={currentKind} />
      </div>
    );
  }

  if (editId) {
    const existing = apps.find((a) => a.id === editId);
    const kind = existing?.kind ?? "self_employed";
    return (
      <div className="max-w-4xl mx-auto px-4 py-6">
        <Button variant="ghost" onClick={() => setSearchParams({})} className="mb-4">← К моим заявкам</Button>
        <RegistrationWizard kind={kind as BizLegalKind} existingId={editId} />
      </div>
    );
  }

  if (detailId) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6">
        <Button variant="ghost" onClick={() => setSearchParams({})} className="mb-4">← К моим заявкам</Button>
        <ApplicationDetail id={detailId} />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Регистрация бизнеса</h1>
        <p className="text-muted-foreground">
          Оформите Самозанятого, ИП или ООО. Мы подготовим пакет документов, проверим
          данные и передадим заявление в ФНС.
        </p>
      </header>

      <section>
        <h2 className="text-lg font-semibold mb-3">Выберите форму</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(Object.keys(KIND_TITLES) as BizLegalKind[]).map((k) => {
            const Icon = KIND_ICON[k];
            return (
              <Card key={k} className="glass-window border cursor-pointer hover:scale-[1.01] transition" onClick={() => setSearchParams({ new: k })}>
                <CardHeader className="flex-row items-center gap-3 space-y-0">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Icon className="w-5 h-5" />
                  </div>
                  <CardTitle className="text-base">{KIND_TITLES[k]}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {k === "self_employed" && "Паспорт и телефон. Без госпошлины."}
                  {k === "entrepreneur" && "Р21001, ОКВЭД, квитанция. Госпошлина 800 ₽."}
                  {k === "legal_entity" && "Р11001, устав, решение учредителя. Госпошлина 4 000 ₽."}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Мои заявки</h2>
          <Button variant="secondary" className="gap-1" onClick={() => setSearchParams({ new: "self_employed" })}>
            <Plus className="w-4 h-4" /> Новая
          </Button>
        </div>
        {loading ? (
          <div className="text-muted-foreground text-sm">Загрузка…</div>
        ) : apps.length === 0 ? (
          <div className="text-muted-foreground text-sm">Пока заявок нет.</div>
        ) : (
          <ul className="space-y-2">
            {apps.map((app) => {
              const Icon = KIND_ICON[app.kind];
              return (
                <li
                  key={app.id}
                  className="glass-window rounded-2xl border p-4 flex items-center justify-between gap-3 cursor-pointer hover:bg-background/30 transition"
                  onClick={() => {
                    if (app.status === "draft" || app.status === "needs_fixes") {
                      setSearchParams({ edit: app.id });
                    } else {
                      setSearchParams({ id: app.id });
                    }
                  }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon className="w-5 h-5 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-medium truncate">
                        {KIND_TITLES[app.kind]}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Обновлено {new Date(app.updated_at).toLocaleString("ru-RU")}
                      </div>
                    </div>
                  </div>
                  <Badge variant={STATUS_BADGE[app.status] ?? "outline"}>
                    {STATUS_TITLES[app.status]}
                  </Badge>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function ApplicationDetail({ id }: { id: string }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof getApplication>> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getApplication(id)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Ошибка"))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    // polling каждые 15 сек
    const iv = window.setInterval(() => {
      getApplication(id)
        .then((res) => {
          if (!cancelled) setData(res);
        })
        .catch(() => {});
    }, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(iv);
    };
  }, [id]);

  if (loading || !data) return <div className="text-muted-foreground">Загрузка…</div>;
  const { application, documents, log } = data;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">{KIND_TITLES[application.kind]}</h1>
        <div className="text-xs text-muted-foreground">ID заявки: {application.id}</div>
      </header>

      <div className="glass-window rounded-2xl border p-4">
        <StatusTimeline currentStatus={application.status} log={log} />
      </div>

      {application.rejection_reason && (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/5 p-4">
          <div className="flex items-center gap-2 text-red-500 font-medium">
            <XCircle className="w-4 h-4" /> Причина отказа
          </div>
          <div className="text-sm mt-1">{application.rejection_reason}</div>
        </div>
      )}
      {application.review_comment && application.status === "needs_fixes" && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4">
          <div className="flex items-center gap-2 text-amber-500 font-medium">
            <AlertTriangle className="w-4 h-4" /> Комментарий модератора
          </div>
          <div className="text-sm mt-1">{application.review_comment}</div>
        </div>
      )}

      <div className="glass-window rounded-2xl border p-4">
        <div className="font-medium mb-2 flex items-center gap-2"><ListTree className="w-4 h-4" /> Документы</div>
        <ul className="space-y-1 text-sm">
          {documents.map((d) => (
            <li key={d.id} className="flex items-center justify-between">
              <span>{d.file_name}</span>
              <span className="text-muted-foreground">{d.doc_type}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
