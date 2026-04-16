/**
 * EditorProjectsPage.tsx — Список проектов видеоредактора.
 *
 * Полнофункциональная страница: поиск, сортировка, grid-карточки,
 * empty state, skeleton loading, pagination «Загрузить ещё»,
 * контекстное меню (открыть / дублировать / удалить).
 */

import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Search,
  ArrowUpDown,
  MoreVertical,
  Film,
  Copy,
  Trash2,
  ExternalLink,
  Clock,
  Clapperboard,
  ArrowLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useProjectList } from '@/features/editor/hooks/useProjectList';
import {
  useCreateProject,
  useDeleteProject,
  useDuplicateProject,
} from '@/features/editor/hooks/useProject';
import { NewProjectDialog } from '@/features/editor/components/dialogs/NewProjectDialog';
import type {
  EditorProject,
  ProjectStatus,
  CreateProjectInput,
  PaginationParams,
} from '@/features/editor/types';

// ── Helpers ───────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<ProjectStatus, { label: string; className: string }> = {
  draft: { label: 'Черновик', className: 'bg-slate-500/20 text-slate-400 border-slate-600/30' },
  rendering: { label: 'Рендеринг', className: 'bg-amber-500/20 text-amber-400 border-amber-600/30 animate-pulse' },
  rendered: { label: 'Готово', className: 'bg-emerald-500/20 text-emerald-400 border-emerald-600/30' },
  published: { label: 'Опубликовано', className: 'bg-blue-500/20 text-blue-400 border-blue-600/30' },
  archived: { label: 'Архив', className: 'bg-gray-500/20 text-gray-400 border-gray-600/30' },
};

function formatDuration(ms: number): string {
  if (ms <= 0) return '0:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatDate(isoDate: string): string {
  const d = new Date(isoDate);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatRelativeDate(isoDate: string): string {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'Только что';
  if (diffMin < 60) return `${diffMin} мин. назад`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} ч. назад`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays} дн. назад`;
  return formatDate(isoDate);
}

const PLACEHOLDER_GRADIENTS = [
  'from-indigo-600 to-purple-700',
  'from-emerald-600 to-teal-700',
  'from-rose-600 to-pink-700',
  'from-amber-600 to-orange-700',
  'from-cyan-600 to-blue-700',
  'from-fuchsia-600 to-violet-700',
];

function getPlaceholderGradient(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  return PLACEHOLDER_GRADIENTS[Math.abs(hash) % PLACEHOLDER_GRADIENTS.length];
}

type SortKey = 'updated_at' | 'created_at' | 'title';

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'updated_at', label: 'По обновлению' },
  { value: 'created_at', label: 'По дате создания' },
  { value: 'title', label: 'По имени' },
];

const PAGE_SIZE = 12;

// ── Components ────────────────────────────────────────────────────────────

function ProjectCardSkeleton() {
  return (
    <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
      <Skeleton className="w-full aspect-video" />
      <div className="p-3 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <div className="flex gap-2">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-12 rounded-full" />
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onCreateClick }: { onCreateClick: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
      <div className="w-24 h-24 rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-600/20 flex items-center justify-center mb-6">
        <Clapperboard className="w-12 h-12 text-indigo-400" />
      </div>
      <h3 className="text-xl font-semibold text-foreground mb-2">
        Создайте свой первый проект
      </h3>
      <p className="text-muted-foreground text-sm max-w-md mb-6">
        Создавайте профессиональные видео с помощью нашего редактора.
        Обрезка, эффекты, музыка, стикеры и многое другое.
      </p>
      <NewProjectDialog
        onCreateProject={() => {}}
        trigger={
          <Button size="lg" className="gap-2">
            <Plus className="w-5 h-5" />
            Новый проект
          </Button>
        }
      />
    </div>
  );
}

interface ProjectCardProps {
  project: EditorProject;
  onOpen: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (project: EditorProject) => void;
}

function ProjectCard({ project, onOpen, onDuplicate, onDelete }: ProjectCardProps) {
  const statusCfg = STATUS_CONFIG[project.status] ?? STATUS_CONFIG.draft;
  const gradient = getPlaceholderGradient(project.id);

  return (
    <div
      className="group rounded-xl border border-border/50 bg-card overflow-hidden hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all duration-200 cursor-pointer"
      onClick={() => onOpen(project.id)}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(project.id); }}
      tabIndex={0}
      role="button"
      aria-label={`Открыть проект: ${project.title}`}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video overflow-hidden">
        {project.thumbnail_url ? (
          <img loading="lazy" src={project.thumbnail_url}
            alt={project.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            
          />
        ) : (
          <div className={cn('w-full h-full bg-gradient-to-br', gradient, 'flex items-center justify-center')}>
            <Film className="w-10 h-10 text-white/30" />
          </div>
        )}

        {/* Duration overlay */}
        {project.duration_ms > 0 && (
          <div className="absolute bottom-2 right-2 bg-black/75 backdrop-blur-sm text-white text-[11px] font-medium px-1.5 py-0.5 rounded">
            {formatDuration(project.duration_ms)}
          </div>
        )}

        {/* Aspect ratio badge */}
        <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm text-white/80 text-[10px] font-mono px-1.5 py-0.5 rounded">
          {project.aspect_ratio}
        </div>

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
          <ExternalLink className="w-8 h-8 text-white drop-shadow-lg" />
        </div>
      </div>

      {/* Card body */}
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="font-medium text-sm text-foreground truncate">
              {project.title}
            </h3>
            <div className="flex items-center gap-1.5 mt-1 text-muted-foreground text-xs">
              <Clock className="w-3 h-3 flex-shrink-0" />
              <span>{formatRelativeDate(project.updated_at)}</span>
            </div>
          </div>

          {/* Context menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                onClick={(e) => e.stopPropagation()}
                aria-label="Действия с проектом"
              >
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onOpen(project.id); }}>
                <ExternalLink className="w-4 h-4 mr-2" />
                Открыть
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDuplicate(project.id); }}>
                <Copy className="w-4 h-4 mr-2" />
                Дублировать
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={(e) => { e.stopPropagation(); onDelete(project); }}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Удалить
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Status + metadata */}
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 h-5', statusCfg.className)}>
            {statusCfg.label}
          </Badge>
          {project.fps > 0 && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 bg-muted/50 text-muted-foreground border-border/50">
              {project.fps}fps
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────

export function EditorProjectsPage() {
  const navigate = useNavigate();

  // ── State ─────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('updated_at');
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<EditorProject | null>(null);

  // ── Pagination params ─────────────────────────────────────────────────
  const paginationParams: PaginationParams = useMemo(
    () => ({
      page,
      limit: PAGE_SIZE,
      sort_by: sortBy,
      sort_order: sortBy === 'title' ? 'asc' : 'desc',
    }),
    [page, sortBy],
  );

  // ── Queries ───────────────────────────────────────────────────────────
  const { data, isLoading, isFetching } = useProjectList(paginationParams);
  const createProject = useCreateProject();
  const deleteProject = useDeleteProject();
  const duplicateProject = useDuplicateProject();

  // ── Client-side search filter ─────────────────────────────────────────
  const projects = useMemo(() => {
    const list = data?.data ?? [];
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase().trim();
    return list.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        (p.description && p.description.toLowerCase().includes(q)),
    );
  }, [data?.data, searchQuery]);

  const hasMore = data?.has_more ?? false;
  const totalCount = data?.total ?? 0;

  // ── Handlers ──────────────────────────────────────────────────────────
  const handleOpen = useCallback(
    (projectId: string) => navigate(`/editor/${projectId}`),
    [navigate],
  );

  const handleCreateProject = useCallback(
    (input: CreateProjectInput) => {
      createProject.mutate(input, {
        onSuccess(created) {
          toast.success('Проект создан');
          navigate(`/editor/${created.id}`);
        },
        onError() {
          toast.error('Не удалось создать проект');
        },
      });
    },
    [createProject, navigate],
  );

  const handleDuplicate = useCallback(
    (projectId: string) => {
      duplicateProject.mutate(projectId, {
        onSuccess() {
          toast.success('Проект дублирован');
        },
        onError() {
          toast.error('Не удалось дублировать проект');
        },
      });
    },
    [duplicateProject],
  );

  const handleDeleteConfirm = useCallback(() => {
    if (!deleteTarget) return;
    deleteProject.mutate(deleteTarget.id, {
      onSuccess() {
        toast.success('Проект удалён');
        setDeleteTarget(null);
      },
      onError() {
        toast.error('Не удалось удалить проект');
        setDeleteTarget(null);
      },
    });
  }, [deleteTarget, deleteProject]);

  const handleLoadMore = useCallback(() => {
    setPage((p) => p + 1);
  }, []);

  // ── Render ────────────────────────────────────────────────────────────
  const showSkeleton = isLoading && page === 1;
  const showEmptyState = !isLoading && projects.length === 0 && !searchQuery.trim();
  const showNoResults = !isLoading && projects.length === 0 && searchQuery.trim().length > 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                onClick={() => navigate('/')}
                aria-label="Назад"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
                  <Clapperboard className="w-5 h-5 text-primary" />
                  Видеоредактор
                </h1>
                {totalCount > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {totalCount} {totalCount === 1 ? 'проект' : totalCount < 5 ? 'проекта' : 'проектов'}
                  </p>
                )}
              </div>
            </div>

            <NewProjectDialog
              onCreateProject={handleCreateProject}
              trigger={
                <Button size="sm" className="gap-1.5">
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">Новый проект</span>
                </Button>
              }
            />
          </div>

          {/* Search + Sort */}
          {(totalCount > 0 || searchQuery) && (
            <div className="flex items-center gap-3 mt-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Поиск по названию..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9 text-sm"
                />
              </div>

              <Select value={sortBy} onValueChange={(v) => { setSortBy(v as SortKey); setPage(1); }}>
                <SelectTrigger className="w-[180px] h-9 text-sm">
                  <ArrowUpDown className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Skeleton loading */}
        {showSkeleton && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <ProjectCardSkeleton key={i} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {showEmptyState && <EmptyState onCreateClick={() => {}} />}

        {/* No search results */}
        {showNoResults && (
          <div className="flex flex-col items-center py-16 text-center">
            <Search className="w-12 h-12 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground">
              Ничего не найдено по запросу «{searchQuery}»
            </p>
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => setSearchQuery('')}>
              Сбросить поиск
            </Button>
          </div>
        )}

        {/* Project grid */}
        {!showSkeleton && projects.length > 0 && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onOpen={handleOpen}
                  onDuplicate={handleDuplicate}
                  onDelete={setDeleteTarget}
                />
              ))}
            </div>

            {/* Load more */}
            {hasMore && (
              <div className="flex justify-center mt-8">
                <Button
                  variant="outline"
                  onClick={handleLoadMore}
                  disabled={isFetching}
                  className="min-w-[180px]"
                >
                  {isFetching ? 'Загрузка...' : 'Загрузить ещё'}
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить проект?</AlertDialogTitle>
            <AlertDialogDescription>
              Проект «{deleteTarget?.title}» будет удалён безвозвратно.
              Все связанные медиафайлы и рендеры также будут удалены.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteProject.isPending ? 'Удаление...' : 'Удалить'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default EditorProjectsPage;
