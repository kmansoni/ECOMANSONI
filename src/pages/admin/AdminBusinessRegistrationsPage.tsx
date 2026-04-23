import { useEffect, useMemo, useState } from "react";
import { Search, ExternalLink, Shield, Ban, CheckCircle2, RefreshCw, FilePlus2 } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { adminApi } from "@/lib/adminApi";
import {
  type BizLegalApplication,
  type BizLegalKind,
  type BizLegalStatus,
  type BizLegalDocument,
  type BizLegalStatusLogRow,
  KIND_TITLES,
  STATUS_TITLES,
  DOC_TYPE_TITLES,
} from "@/lib/bizRegistrationApi";
import { StatusTimeline } from "@/components/business-registration/StatusTimeline";
import { toast } from "sonner";

type ListResp = { items: BizLegalApplication[]; total: number };
type DetailResp = {
  application: BizLegalApplication;
  documents: BizLegalDocument[];
  log: BizLegalStatusLogRow[];
};

const STATUS_FILTERS: { value: "" | BizLegalStatus; label: string }[] = [
  { value: "", label: "Все статусы" },
  { value: "submitted", label: STATUS_TITLES.submitted },
  { value: "under_review", label: STATUS_TITLES.under_review },
  { value: "needs_fixes", label: STATUS_TITLES.needs_fixes },
  { value: "sent_to_fns", label: STATUS_TITLES.sent_to_fns },
  { value: "approved", label: STATUS_TITLES.approved },
  { value: "rejected", label: STATUS_TITLES.rejected },
  { value: "draft", label: STATUS_TITLES.draft },
];
const KIND_FILTERS: { value: "" | BizLegalKind; label: string }[] = [
  { value: "", label: "Все типы" },
  { value: "self_employed", label: KIND_TITLES.self_employed },
  { value: "entrepreneur", label: KIND_TITLES.entrepreneur },
  { value: "legal_entity", label: KIND_TITLES.legal_entity },
];

export function AdminBusinessRegistrationsPage() {
  const [items, setItems] = useState<BizLegalApplication[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<"" | BizLegalStatus>("submitted");
  const [kind, setKind] = useState<"" | BizLegalKind>("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    try {
      const data = await adminApi<ListResp>("biz_registration.list", {
        status: status || undefined,
        kind: kind || undefined,
        search: search.trim() || undefined,
        limit: 100,
      });
      setItems(data.items);
      setTotal(data.total);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, kind]);

  return (
    <AdminShell>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Регистрации бизнеса</h1>
            <div className="text-xs text-muted-foreground">Всего: {total}</div>
          </div>
          <Button variant="outline" onClick={reload} className="gap-1">
            <RefreshCw className="w-4 h-4" /> Обновить
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <Select value={status || "__all__"} onValueChange={(v) => setStatus(v === "__all__" ? "" : (v as BizLegalStatus))}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((f) => (
                <SelectItem key={f.value || "__all__"} value={f.value || "__all__"}>{f.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={kind || "__all__"} onValueChange={(v) => setKind(v === "__all__" ? "" : (v as BizLegalKind))}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              {KIND_FILTERS.map((f) => (
                <SelectItem key={f.value || "__all__"} value={f.value || "__all__"}>{f.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <form
            className="flex gap-2 flex-1 min-w-[240px]"
            onSubmit={(e) => { e.preventDefault(); void reload(); }}
          >
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="ФИО, ИНН или ID"
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Button type="submit" variant="secondary">Найти</Button>
          </form>
        </div>

        <div className="rounded-xl border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="px-3 py-2">Тип</th>
                <th className="px-3 py-2">ФИО / Название</th>
                <th className="px-3 py-2">ИНН</th>
                <th className="px-3 py-2">Статус</th>
                <th className="px-3 py-2">Подано</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">Загрузка…</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">Нет заявок</td></tr>
              ) : (
                items.map((row) => {
                  const fd = (row.form_data ?? {}) as Record<string, unknown>;
                  const name = row.kind === "legal_entity"
                    ? String(fd.company_name ?? "")
                    : String(fd.full_name ?? "");
                  return (
                    <tr key={row.id} className="border-t hover:bg-muted/30 cursor-pointer"
                        onClick={() => setSelectedId(row.id)}>
                      <td className="px-3 py-2">{KIND_TITLES[row.kind]}</td>
                      <td className="px-3 py-2">{name || <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-3 py-2 font-mono text-xs">{String(fd.inn ?? "")}</td>
                      <td className="px-3 py-2"><StatusBadge status={row.status} /></td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {row.submitted_at ? new Date(row.submitted_at).toLocaleString("ru-RU") : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button size="sm" variant="ghost">Открыть</Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ApplicationDrawer
        id={selectedId}
        onClose={() => setSelectedId(null)}
        onChanged={reload}
      />
    </AdminShell>
  );
}

function StatusBadge({ status }: { status: BizLegalStatus }) {
  const variant =
    status === "approved" ? "default" :
    status === "rejected" ? "destructive" :
    status === "needs_fixes" ? "outline" :
    "secondary";
  return <Badge variant={variant}>{STATUS_TITLES[status]}</Badge>;
}

function ApplicationDrawer({ id, onClose, onChanged }: {
  id: string | null;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const [data, setData] = useState<DetailResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState("");
  const [rejection, setRejection] = useState("");

  useEffect(() => {
    if (!id) { setData(null); return; }
    let cancelled = false;
    setLoading(true);
    setComment("");
    setRejection("");
    adminApi<DetailResp>("biz_registration.get", { id })
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Ошибка"))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  async function decide(decision: "take_review" | "approve" | "reject" | "request_fixes" | "send_to_fns") {
    if (!data) return;
    setBusy(true);
    try {
      await adminApi("biz_registration.review", {
        id: data.application.id,
        decision,
        comment: comment || undefined,
        rejection_reason: rejection || undefined,
      });
      toast.success("Готово");
      const refreshed = await adminApi<DetailResp>("biz_registration.get", { id: data.application.id });
      setData(refreshed);
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось");
    } finally {
      setBusy(false);
    }
  }

  async function openDoc(docId: string) {
    try {
      const res = await adminApi<{ url: string | null }>("biz_registration.document_url", { document_id: docId });
      if (res.url) window.open(res.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось");
    }
  }

  return (
    <Sheet open={!!id} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="sm:max-w-2xl w-full overflow-y-auto">
        {loading || !data ? (
          <div className="text-muted-foreground p-4">Загрузка…</div>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle>{KIND_TITLES[data.application.kind]}</SheetTitle>
              <SheetDescription>ID: {data.application.id}</SheetDescription>
            </SheetHeader>

            <div className="mt-4 space-y-4">
              <div className="rounded-2xl border p-3">
                <StatusTimeline currentStatus={data.application.status} log={data.log} />
              </div>

              <FormDataView data={data.application.form_data as Record<string, unknown>} kind={data.application.kind} />

              <div className="rounded-2xl border p-3">
                <div className="font-medium mb-2">Документы ({data.documents.length})</div>
                <ul className="space-y-1 text-sm">
                  {data.documents.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate">{d.file_name}</div>
                        <div className="text-xs text-muted-foreground">{DOC_TYPE_TITLES[d.doc_type]}</div>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => openDoc(d.id)} className="gap-1">
                        <ExternalLink className="w-4 h-4" /> Открыть
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-2xl border p-3 space-y-2">
                <div className="font-medium">Комментарий модератора</div>
                <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Необязательно" />
                <div className="font-medium">Причина отказа (только для отклонения)</div>
                <Textarea value={rejection} onChange={(e) => setRejection(e.target.value)} placeholder="Обязательно для 'Отклонить'" />
              </div>

              <div className="flex flex-wrap gap-2">
                {data.application.status === "submitted" && (
                  <Button onClick={() => decide("take_review")} disabled={busy} variant="secondary" className="gap-1">
                    <Shield className="w-4 h-4" /> Взять в работу
                  </Button>
                )}
                {(data.application.status === "submitted" || data.application.status === "under_review") && (
                  <>
                    <Button onClick={() => decide("request_fixes")} disabled={busy || !comment} variant="outline" className="gap-1">
                      <FilePlus2 className="w-4 h-4" /> Запросить правки
                    </Button>
                    <Button onClick={() => decide("send_to_fns")} disabled={busy} variant="secondary" className="gap-1">
                      Отправить в ФНС
                    </Button>
                  </>
                )}
                {data.application.status !== "approved" && data.application.status !== "rejected" && (
                  <>
                    <Button onClick={() => decide("approve")} disabled={busy} className="gap-1 bg-green-600 hover:bg-green-700">
                      <CheckCircle2 className="w-4 h-4" /> Одобрить
                    </Button>
                    <Button onClick={() => decide("reject")} disabled={busy || !rejection} variant="destructive" className="gap-1">
                      <Ban className="w-4 h-4" /> Отклонить
                    </Button>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function FormDataView({ data, kind }: { data: Record<string, unknown>; kind: BizLegalKind }) {
  const entries = useMemo(() => {
    const order = kind === "legal_entity"
      ? ["company_name", "full_name", "authorized_capital", "director_name", "founder_name", "email", "phone", "inn", "business_address", "passport_series", "passport_number", "passport_issue_date", "passport_issuer", "registration_address"]
      : ["full_name", "birth_date", "email", "phone", "inn", "passport_series", "passport_number", "passport_issue_date", "passport_issuer", "registration_address"];
    return order.map((k) => [k, data[k]] as const).filter(([, v]) => v !== undefined && v !== "");
  }, [data, kind]);

  const LABELS: Record<string, string> = {
    company_name: "Название ООО",
    full_name: "ФИО",
    birth_date: "Дата рождения",
    authorized_capital: "Уставный капитал",
    director_name: "Директор",
    founder_name: "Учредитель",
    email: "Email",
    phone: "Телефон",
    inn: "ИНН",
    business_address: "Юр. адрес",
    registration_address: "Адрес регистрации",
    passport_series: "Серия паспорта",
    passport_number: "Номер паспорта",
    passport_issue_date: "Дата выдачи",
    passport_issuer: "Кем выдан",
  };

  return (
    <div className="rounded-2xl border p-3">
      <div className="font-medium mb-2">Данные заявки</div>
      <dl className="grid grid-cols-1 md:grid-cols-2 gap-y-1 text-sm">
        {entries.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{LABELS[k] ?? k}</dt>
            <dd className="truncate">{String(v ?? "")}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
