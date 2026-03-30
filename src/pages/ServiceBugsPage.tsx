import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, AlertTriangle, Bug, CheckCircle2, RefreshCw, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { dbLoose } from "@/lib/supabase";
import { useAdminMe } from "@/hooks/useAdminMe";
import { adminApi, hasScope, isOwner } from "@/lib/adminApi";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

type BugStatus = "open" | "in_progress" | "fixed";

type ServiceBug = {
  id: string;
  slug?: string;
  service: string;
  bug: string;
  symptoms: string[];
  rootCause: string;
  techNotes: string[];
  checks: string[];
  workaround: string;
  status: BugStatus;
  sortOrder?: number;
  updatedAt?: string;
};

interface ServiceBugRow {
  id: string | number;
  slug?: string | null;
  service?: string | null;
  title?: string | null;
  symptoms?: unknown;
  root_cause?: string | null;
  tech_notes?: unknown;
  checks?: unknown;
  workaround?: string | null;
  status?: string | null;
  sort_order?: number | null;
  updated_at?: string | null;
}

const FALLBACK_BUGS: ServiceBug[] = [
  {
    id: "sms-endpoints-drift",
    slug: "sms-endpoints-drift",
    service: "Auth + SMS",
    bug: "Дрейф набора endpoint-ов между сборками",
    symptoms: [
      "В одной сессии виден только /send-sms-otp, в другой появляется /verify-sms-otp.",
      "Списки endpoint-ов в UI отличаются без явного деплоя клиента.",
    ],
    rootCause:
      "Несогласованные ревизии edge-functions между окружениями или частично завершенный деплой (rolling update).",
    techNotes: [
      "Проверять hash и timestamp всех функций в проекте перед публикацией API-списка.",
      "Закрыть возможность частичного релиза функции без smoke-check полного набора endpoint-ов.",
    ],
    checks: [
      "Сравнить `supabase functions list` между окружениями.",
      "Прогнать smoke на обязательные auth/sms endpoint-ы после деплоя.",
    ],
    workaround:
      "Принудительно выполнить полный deploy набора функций и повторить health/smoke-проверки.",
    status: "in_progress",
  },
  {
    id: "realtime-lock-visibility",
    slug: "realtime-lock-visibility",
    service: "Realtime",
    bug: "Каналы подписок отображаются как недоступные (lock) при валидной сессии",
    symptoms: [
      "`realtime:public:*` в API-списке отмечены lock-иконкой.",
      "Подписки присутствуют, но клиент интерпретирует их как закрытые.",
    ],
    rootCause:
      "Мismatch между JWT-аудиторией клиента и политикой доступа канала, либо stale token после смены сессии.",
    techNotes: [
      "Проверить claims токена: `role`, `aud`, `sub`, `exp`.",
      "Синхронизировать refresh токена перед созданием realtime channel.",
    ],
    checks: [
      "Переоткрыть канал после ручного refresh access token.",
      "Проверить RLS/Realtime policy на таблицы сообщений, звонков и уведомлений.",
    ],
    workaround:
      "Реинициализировать realtime-клиент после auth refresh и повторить join каналов.",
    status: "open",
  },
  {
    id: "api-index-cache-stale",
    slug: "api-index-cache-stale",
    service: "API Explorer",
    bug: "Устаревший кэш индекса endpoint-ов",
    symptoms: [
      "После добавления endpoint-ов список в мобильном UI обновляется не сразу.",
      "Поиск endpoint-ов находит старую структуру секций.",
    ],
    rootCause:
      "Кэширование метаданных API на CDN/клиенте без корректной инвалидации по версии схемы.",
    techNotes: [
      "Версионировать индекс endpoint-ов (`schema_version`) и включить cache-busting.",
      "Добавить `ETag` + forced refresh при несоответствии версии.",
    ],
    checks: [
      "Сверить ответ индекс-эндпоинта с текущим реестром функций.",
      "Проверить заголовки cache-control и поведение при hard reload.",
    ],
    workaround:
      "Очистить локальный кэш API explorer и перезапросить индекс с bypass cache.",
    status: "in_progress",
  },
  {
    id: "service-health-surface",
    slug: "service-health-surface",
    service: "System / Health",
    bug: "Недостаточная детализация /health для диагностики деградаций",
    symptoms: [
      "`/health` возвращает общий ok, но отдельные сервисы фактически деградированы.",
      "Операторы видят \"зелёный\" статус при проблемах Realtime/SMS.",
    ],
    rootCause:
      "Агрегированный health-check без component-level breakdown и latency/error budget метрик.",
    techNotes: [
      "Расширить `/health` до component checks: db, auth, sms, realtime, ai.",
      "Добавить thresholds по latency и частоте ошибок на компонент.",
    ],
    checks: [
      "Сравнить агрегированный health со статусом компонентных probes.",
      "Проверить алерты по SLA до и после расширения health payload.",
    ],
    workaround:
      "Использовать отдельные probe endpoint-ы до внедрения расширенного `/health`.",
    status: "open",
  },
  {
    id: "image-viewer-oversize",
    slug: "image-viewer-oversize",
    service: "Chat Media",
    bug: "Фото в диалоге раскрывается в чрезмерно большом размере",
    symptoms: [
      "На открытии изображения нарушается fit-to-screen и кадр выходит за границы вьюпорта.",
      "Пользователь видит гигантское изображение до ручного масштабирования.",
    ],
    rootCause:
      "В image-viewer использовался режим без ограничения максимальной ширины по viewport.",
    techNotes: [
      "Перевести рендер в object-contain + max-width/max-height от viewport.",
      "Блокировать скролл body на время fullscreen media modal.",
    ],
    checks: [
      "Проверка portrait/landscape изображений на mobile/desktop.",
      "Проверка закрытия по backdrop и Escape без side-effects.",
    ],
    workaround:
      "Фикс уже внесен в image-viewer; требуется регрессия на медиа-галерее и каналах.",
    status: "fixed",
  },
];

function statusLabel(status: BugStatus): string {
  if (status === "fixed") return "Исправлено";
  if (status === "in_progress") return "В работе";
  return "Открыт";
}

function statusClasses(status: BugStatus): string {
  if (status === "fixed") return "bg-emerald-500/15 text-emerald-300 border-emerald-500/40";
  if (status === "in_progress") return "bg-amber-500/15 text-amber-300 border-amber-500/40";
  return "bg-rose-500/15 text-rose-300 border-rose-500/40";
}

export function ServiceBugsPage() {
  const navigate = useNavigate();
  const { me } = useAdminMe();
  const [bugs, setBugs] = useState<ServiceBug[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isFallback, setIsFallback] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [statusFilter, setStatusFilter] = useState<BugStatus | "all">("all");
  const [serviceFilter, setServiceFilter] = useState<string>("all");

  const canManage = isOwner(me) || hasScope(me, "hashtag.status.write");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [slugInput, setSlugInput] = useState("");
  const [serviceInput, setServiceInput] = useState("");
  const [titleInput, setTitleInput] = useState("");
  const [statusInput, setStatusInput] = useState<BugStatus>("open");
  const [sortOrderInput, setSortOrderInput] = useState("100");
  const [symptomsInput, setSymptomsInput] = useState("");
  const [rootCauseInput, setRootCauseInput] = useState("");
  const [techNotesInput, setTechNotesInput] = useState("");
  const [checksInput, setChecksInput] = useState("");
  const [workaroundInput, setWorkaroundInput] = useState("");

  const loadBugs = useCallback(async () => {
    setLoading(true);
    setErrorText("");

    try {
      const { data, error } = await dbLoose
        .from("service_bugs")
        .select("id, slug, service, title, symptoms, root_cause, tech_notes, checks, workaround, status, sort_order, updated_at")
        .order("sort_order", { ascending: true })
        .order("updated_at", { ascending: false });

      if (error) throw error;

      const rows = Array.isArray(data) ? (data as unknown as ServiceBugRow[]) : [];
      const normalized: ServiceBug[] = rows.map((row) => ({
        id: String(row.id),
        slug: row.slug ? String(row.slug) : undefined,
        service: String(row.service ?? "Unknown"),
        bug: String(row.title ?? "Без названия"),
        symptoms: Array.isArray(row.symptoms) ? row.symptoms.map((x: unknown) => String(x)) : [],
        rootCause: String(row.root_cause ?? ""),
        techNotes: Array.isArray(row.tech_notes) ? row.tech_notes.map((x: unknown) => String(x)) : [],
        checks: Array.isArray(row.checks) ? row.checks.map((x: unknown) => String(x)) : [],
        workaround: String(row.workaround ?? ""),
        status: (row.status === "open" || row.status === "in_progress" || row.status === "fixed")
          ? row.status
          : "open",
        sortOrder: typeof row.sort_order === "number" ? row.sort_order : undefined,
        updatedAt: row.updated_at ? String(row.updated_at) : undefined,
      }));

      if (normalized.length === 0) {
        setBugs(FALLBACK_BUGS);
        setIsFallback(true);
      } else {
        setBugs(normalized);
        setIsFallback(false);
      }
    } catch (err) {
      setBugs(FALLBACK_BUGS);
      setIsFallback(true);
      setErrorText(err instanceof Error ? err.message : "Не удалось загрузить service_bugs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBugs();
  }, [loadBugs]);

  const serviceOptions = useMemo(() => {
    return ["all", ...Array.from(new Set(bugs.map((b) => b.service))).sort((a, b) => a.localeCompare(b))];
  }, [bugs]);

  const filteredBugs = useMemo(() => {
    return bugs.filter((b) => {
      const statusOk = statusFilter === "all" ? true : b.status === statusFilter;
      const serviceOk = serviceFilter === "all" ? true : b.service === serviceFilter;
      return statusOk && serviceOk;
    });
  }, [bugs, serviceFilter, statusFilter]);

  const totals = useMemo(() => {
    const open = bugs.filter((b) => b.status === "open").length;
    const progress = bugs.filter((b) => b.status === "in_progress").length;
    const fixed = bugs.filter((b) => b.status === "fixed").length;
    return { open, progress, fixed };
  }, [bugs]);

  const resetEditor = useCallback(() => {
    setEditingId(null);
    setSlugInput("");
    setServiceInput("");
    setTitleInput("");
    setStatusInput("open");
    setSortOrderInput("100");
    setSymptomsInput("");
    setRootCauseInput("");
    setTechNotesInput("");
    setChecksInput("");
    setWorkaroundInput("");
  }, []);

  const toLines = (value: string) =>
    value
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

  const startEdit = useCallback((item: ServiceBug) => {
    setEditingId(item.id);
    setSlugInput(item.slug ?? "");
    setServiceInput(item.service);
    setTitleInput(item.bug);
    setStatusInput(item.status);
    setSortOrderInput(String(item.sortOrder ?? 100));
    setSymptomsInput(item.symptoms.join("\n"));
    setRootCauseInput(item.rootCause);
    setTechNotesInput(item.techNotes.join("\n"));
    setChecksInput(item.checks.join("\n"));
    setWorkaroundInput(item.workaround);
  }, []);

  const saveBug = useCallback(async () => {
    if (!canManage) return;
    if (!slugInput.trim() || !serviceInput.trim() || !titleInput.trim()) {
      toast.error("Заполните slug, сервис и название бага");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        slug: slugInput.trim().toLowerCase(),
        service: serviceInput.trim(),
        title: titleInput.trim(),
        status: statusInput,
        sort_order: Number(sortOrderInput) || 100,
        symptoms: toLines(symptomsInput),
        root_cause: rootCauseInput.trim(),
        tech_notes: toLines(techNotesInput),
        checks: toLines(checksInput),
        workaround: workaroundInput.trim(),
      };

      if (editingId) {
        await adminApi("service_bugs.update", { id: editingId, ...payload });
        toast.success("Баг обновлен");
      } else {
        await adminApi("service_bugs.create", payload);
        toast.success("Баг создан");
      }

      resetEditor();
      await loadBugs();
    } catch (err) {
      logger.error("[ServiceBugsPage] save failed", { error: err });
      toast.error("Не удалось сохранить", {
        description: "Попробуйте снова.",
      });
    } finally {
      setSaving(false);
    }
  }, [canManage, slugInput, serviceInput, titleInput, statusInput, sortOrderInput, symptomsInput, rootCauseInput, techNotesInput, checksInput, workaroundInput, editingId, resetEditor, loadBugs]);

  const deleteBug = useCallback(async (id: string) => {
    if (!canManage) return;
    if (!confirm("Удалить баг из реестра?")) return;

    setSaving(true);
    try {
      await adminApi("service_bugs.delete", { id });
      toast.success("Баг удален");
      if (editingId === id) resetEditor();
      await loadBugs();
    } catch (err) {
      logger.error("[ServiceBugsPage] delete failed", { error: err });
      toast.error("Не удалось удалить", {
        description: "Попробуйте снова.",
      });
    } finally {
      setSaving(false);
    }
  }, [canManage, editingId, resetEditor, loadBugs]);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="sticky top-0 z-10 bg-zinc-900/85 backdrop-blur-sm border-b border-white/10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/10 text-white/70 hover:text-white transition-colors"
            aria-label="Назад"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold leading-tight">Баги сервисов</h1>
            <p className="text-xs text-white/60">Технический реестр инцидентов и проблем API/Realtime</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-5 space-y-5">
        {canManage ? (
          <section className="rounded-2xl border border-cyan-500/35 bg-cyan-500/10 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-cyan-100">Admin CRUD: реестр багов сервисов</p>
              {editingId ? (
                <button
                  type="button"
                  onClick={resetEditor}
                  className="px-2.5 py-1 rounded-lg border border-cyan-200/40 text-cyan-100 text-xs"
                >
                  Новый баг
                </button>
              ) : null}
            </div>

            <div className="grid sm:grid-cols-2 gap-2">
              <input value={slugInput} onChange={(e) => setSlugInput(e.target.value)} placeholder="slug" className="px-3 py-2 rounded-lg bg-zinc-950 border border-white/20 text-sm" />
              <input value={serviceInput} onChange={(e) => setServiceInput(e.target.value)} placeholder="Service" className="px-3 py-2 rounded-lg bg-zinc-950 border border-white/20 text-sm" />
              <input value={titleInput} onChange={(e) => setTitleInput(e.target.value)} placeholder="Bug title" className="px-3 py-2 rounded-lg bg-zinc-950 border border-white/20 text-sm sm:col-span-2" />
              <select value={statusInput} onChange={(e) => setStatusInput(e.target.value as BugStatus)} className="px-3 py-2 rounded-lg bg-zinc-950 border border-white/20 text-sm">
                <option value="open">open</option>
                <option value="in_progress">in_progress</option>
                <option value="fixed">fixed</option>
              </select>
              <input value={sortOrderInput} onChange={(e) => setSortOrderInput(e.target.value)} placeholder="sort_order" className="px-3 py-2 rounded-lg bg-zinc-950 border border-white/20 text-sm" />
              <textarea value={rootCauseInput} onChange={(e) => setRootCauseInput(e.target.value)} placeholder="Root cause" className="px-3 py-2 rounded-lg bg-zinc-950 border border-white/20 text-sm min-h-20 sm:col-span-2" />
              <textarea value={symptomsInput} onChange={(e) => setSymptomsInput(e.target.value)} placeholder="Symptoms (one per line)" className="px-3 py-2 rounded-lg bg-zinc-950 border border-white/20 text-sm min-h-24" />
              <textarea value={techNotesInput} onChange={(e) => setTechNotesInput(e.target.value)} placeholder="Tech notes (one per line)" className="px-3 py-2 rounded-lg bg-zinc-950 border border-white/20 text-sm min-h-24" />
              <textarea value={checksInput} onChange={(e) => setChecksInput(e.target.value)} placeholder="Verification checks (one per line)" className="px-3 py-2 rounded-lg bg-zinc-950 border border-white/20 text-sm min-h-24" />
              <textarea value={workaroundInput} onChange={(e) => setWorkaroundInput(e.target.value)} placeholder="Workaround / action" className="px-3 py-2 rounded-lg bg-zinc-950 border border-white/20 text-sm min-h-20 sm:col-span-2" />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveBug()}
                className="px-3 py-2 rounded-lg bg-cyan-300 text-black text-sm font-medium disabled:opacity-60"
              >
                {editingId ? "Сохранить" : "Создать"}
              </button>
              {editingId ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void deleteBug(editingId)}
                  className="px-3 py-2 rounded-lg border border-rose-300/40 text-rose-200 text-sm disabled:opacity-60"
                >
                  Удалить
                </button>
              ) : null}
            </div>
          </section>
        ) : null}

        {isFallback ? (
          <section className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-3 text-sm text-amber-100">
            <p className="font-medium">Режим fallback: используются локальные данные.</p>
            <p className="text-amber-100/80 mt-1">Чтобы включить live-данные, примените миграцию таблицы `service_bugs`.</p>
            {errorText ? <p className="text-amber-100/70 mt-1 break-all">DB error: {errorText}</p> : null}
          </section>
        ) : null}

        <section className="grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-zinc-900 border border-white/10 p-3">
            <p className="text-[11px] uppercase tracking-wider text-white/50">Открытые</p>
            <p className="mt-1 text-lg font-semibold text-rose-300">{totals.open}</p>
          </div>
          <div className="rounded-xl bg-zinc-900 border border-white/10 p-3">
            <p className="text-[11px] uppercase tracking-wider text-white/50">В работе</p>
            <p className="mt-1 text-lg font-semibold text-amber-300">{totals.progress}</p>
          </div>
          <div className="rounded-xl bg-zinc-900 border border-white/10 p-3">
            <p className="text-[11px] uppercase tracking-wider text-white/50">Исправлено</p>
            <p className="mt-1 text-lg font-semibold text-emerald-300">{totals.fixed}</p>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-zinc-900/80 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs border transition-colors",
                statusFilter === "all" ? "bg-white text-black border-white" : "bg-transparent text-white/80 border-white/20 hover:border-white/40",
              )}
            >
              Все статусы
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("open")}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs border transition-colors",
                statusFilter === "open" ? "bg-rose-300 text-black border-rose-200" : "bg-transparent text-white/80 border-white/20 hover:border-white/40",
              )}
            >
              Открыт
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("in_progress")}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs border transition-colors",
                statusFilter === "in_progress" ? "bg-amber-300 text-black border-amber-200" : "bg-transparent text-white/80 border-white/20 hover:border-white/40",
              )}
            >
              В работе
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("fixed")}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs border transition-colors",
                statusFilter === "fixed" ? "bg-emerald-300 text-black border-emerald-200" : "bg-transparent text-white/80 border-white/20 hover:border-white/40",
              )}
            >
              Исправлено
            </button>

            <select
              value={serviceFilter}
              onChange={(e) => setServiceFilter(e.target.value)}
              className="ml-auto min-w-[170px] px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-white/20 text-sm text-white"
            >
              <option value="all">Все сервисы</option>
              {serviceOptions.filter((x) => x !== "all").map((service) => (
                <option key={service} value={service}>{service}</option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => void loadBugs()}
              className="px-2.5 py-1.5 rounded-lg border border-white/20 text-white/80 hover:text-white hover:border-white/40 transition-colors"
              aria-label="Обновить"
            >
              <RefreshCw className={cn("w-4 h-4", loading ? "animate-spin" : "")} />
            </button>
          </div>
        </section>

        <section className="space-y-3">
          {loading ? (
            <article className="rounded-2xl border border-white/10 bg-zinc-900/80 p-4 text-sm text-white/70">
              Загружаем баги сервисов...
            </article>
          ) : null}

          {!loading && filteredBugs.length === 0 ? (
            <article className="rounded-2xl border border-white/10 bg-zinc-900/80 p-4 text-sm text-white/70">
              По выбранным фильтрам баги не найдены.
            </article>
          ) : null}

          {filteredBugs.map((item) => (
            <article key={item.id} className="rounded-2xl border border-white/10 bg-zinc-900/80 p-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center shrink-0">
                  {item.status === "fixed" ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                  ) : item.status === "in_progress" ? (
                    <Wrench className="w-4 h-4 text-amber-300" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-300" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs text-white/55">{item.service}</p>
                      <h2 className="text-sm sm:text-base font-semibold leading-tight">{item.bug}</h2>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn("text-[11px] px-2 py-1 rounded-full border whitespace-nowrap", statusClasses(item.status))}>
                        {statusLabel(item.status)}
                      </span>
                      {canManage ? (
                        <button
                          type="button"
                          onClick={() => startEdit(item)}
                          className="text-[11px] px-2 py-1 rounded-full border border-white/20 text-white/80 hover:border-white/40"
                        >
                          Edit
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl bg-black/25 border border-white/10 p-3">
                      <p className="text-[11px] uppercase tracking-wider text-white/50">Symptoms</p>
                      <ul className="mt-2 space-y-1.5 text-sm text-white/80">
                        {item.symptoms.map((s, idx) => (
                          <li key={`${item.id}-sym-${idx}`} className="leading-snug">• {s}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="rounded-xl bg-black/25 border border-white/10 p-3">
                      <p className="text-[11px] uppercase tracking-wider text-white/50">Root Cause</p>
                      <p className="mt-2 text-sm text-white/80 leading-snug">{item.rootCause}</p>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl bg-black/25 border border-white/10 p-3">
                      <p className="text-[11px] uppercase tracking-wider text-white/50">Tech Notes</p>
                      <ul className="mt-2 space-y-1.5 text-sm text-white/80">
                        {item.techNotes.map((n, idx) => (
                          <li key={`${item.id}-note-${idx}`} className="leading-snug">• {n}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="rounded-xl bg-black/25 border border-white/10 p-3">
                      <p className="text-[11px] uppercase tracking-wider text-white/50">Verification</p>
                      <ul className="mt-2 space-y-1.5 text-sm text-white/80">
                        {item.checks.map((c, idx) => (
                          <li key={`${item.id}-check-${idx}`} className="leading-snug">• {c}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="mt-3 rounded-xl bg-zinc-950/80 border border-white/10 p-3">
                    <p className="text-[11px] uppercase tracking-wider text-white/50">Workaround / Action</p>
                    <p className="mt-2 text-sm text-white/80 leading-snug">{item.workaround}</p>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </section>

        <section className="rounded-2xl border border-blue-500/30 bg-blue-500/10 p-4 flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
            <Bug className="w-4 h-4 text-blue-300" />
          </div>
          <div>
            <p className="text-sm font-semibold text-blue-200">Как использовать этот раздел</p>
            <p className="mt-1 text-sm text-blue-100/80 leading-snug">
              Карточки предназначены для техподдержки и разработки: здесь фиксируются симптомы, гипотеза корневой причины,
              шаги верификации и временные обходные решения для сервисов.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

export default ServiceBugsPage;
