import { useEffect, useState } from "react";
import { Download, Check, X, HardDrive, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import moduleLoader, { type ModuleManifest } from "@/lib/ModuleLoader";

interface ModuleInstallerProps {
  moduleId: string;
  manifest: ModuleManifest;
  onComplete?: () => void;
  onError?: (error: string) => void;
  children?: React.ReactNode; // Fallback UI while installing
}

export function ModuleInstaller({
  moduleId,
  manifest,
  onComplete,
  onError,
  children,
}: ModuleInstallerProps) {
  const [status, setStatus] = useState<"checking" | "downloading" | "unpacking" | "ready" | "error">("checking");
  const [progress, setProgress] = useState(0);
  const [downloadedSize, setDownloadedSize] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const isOnline = useOnlineStatus();

  useEffect(() => {
    installModule();
  }, []);

  async function installModule() {
    try {
      // 1. Проверяем интернет
      if (!isOnline) {
        throw new Error("Требуется интернет для установки модуля");
      }

      // 2. Проверяем свободное место
      const hasEnoughSpace = await checkFreeSpace(manifest.size);
      if (!hasEnoughSpace) {
        throw new Error(`Недостаточно места. Нужно: ${formatBytes(manifest.size)}`);
      }

      // 3. Устанавливаем через ModuleLoader
      setStatus("downloading");

      await moduleLoader.install(moduleId, manifest, (downloaded: number, total: number) => {
        const percent = total > 0 ? Math.round((downloaded / total) * 100) : 0;
        setProgress(percent);
        setDownloadedSize(downloaded);
      });

      setStatus("ready");
      toast.success(`Модуль "${manifest.name}" установлен!`);

      onComplete?.();
    } catch (err: any) {
      console.error("Module installation failed:", err);
      setStatus("error");
      setError(err.message || "Неизвестная ошибка");
      onError?.(err.message);
    }
  }

  // Рендер в зависимости от статуса
  if (status === "ready" && children) {
    return <>{children}</>;
  }

  if (status === "error") {
    return (
      <ErrorState
        moduleName={manifest.name}
        error={error ?? "Неизвестная ошибка"}
        onRetry={installModule}
      />
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 p-4 bg-primary/10 rounded-full">
            <Download className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-xl">Установка модуля "{manifest.name}"</CardTitle>
          <CardDescription>
            {status === "checking" && "Проверка условий..."}
            {status === "downloading" && "Загрузка с сервера..."}
            {status === "unpacking" && "Распаковка файлов..."}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Информация о модуле */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Размер:</span>
            <Badge variant="secondary">{formatBytes(manifest.size)}</Badge>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Версия:</span>
            <span className="font-mono text-xs">{manifest.version}</span>
          </div>

          {/* Прогресс-бар */}
          {status === "downloading" && (
            <div className="space-y-2">
              <Progress value={progress} className="h-2" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{formatBytes(downloadedSize)} / {formatBytes(manifest.size)}</span>
                <span>{progress}%</span>
              </div>
            </div>
          )}

          {/* Прогресс распаковки */}
          {status === "unpacking" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent" />
              <span>Распаковка архивов...</span>
            </div>
          )}

          {/* Статус интернета */}
          <div className="flex items-center gap-2 pt-2 border-t">
            {isOnline ? (
              <>
                <Wifi className="w-4 h-4 text-green-500" />
                <span className="text-xs text-green-600">Интернет доступен</span>
              </>
            ) : (
              <>
                <WifiOff className="w-4 h-4 text-red-500" />
                <span className="text-xs text-red-600">Нет подключения к интернету</span>
              </>
            )}
          </div>

          {/* Кнопка отмены */}
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => {
              // Можно добавить отмену загрузки
              window.history.back();
            }}
          >
            Отмена
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Состояние ошибки установки
 */
function ErrorState({
  moduleName,
  error,
  onRetry,
}: {
  moduleName: string;
  error: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4">
      <Card className="w-full max-w-md border-destructive">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 p-4 bg-destructive/10 rounded-full">
            <X className="w-8 h-8 text-destructive" />
          </div>
          <CardTitle className="text-xl text-destructive">Ошибка установки</CardTitle>
          <CardDescription>
            Не удалось установить модуль "{moduleName}"
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="p-3 bg-destructive/5 border border-destructive/20 rounded-md">
            <p className="text-sm text-destructive">{error}</p>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => window.history.back()}>
              Назад
            </Button>
            <Button className="flex-1" onClick={onRetry}>
              <Download className="w-4 h-4 mr-2" />
              Повторить
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Проверка свободного места на устройстве
 */
async function checkFreeSpace(requiredBytes: number): Promise<boolean> {
  try {
    // Получаем информацию о свободном месте
    // В Capacitor нет прямого API для этого, эмулируем
    // На мобильных устройствах обычно много памяти

    // Примерная оценка: если requiredBytes < 1GB — probable enough space
    const oneGB = 1024 * 1024 * 1024;
    if (requiredBytes < oneGB) {
      return true;
    }

    // Для точной оценки нужно нативный плагин
    // Пока просто разрешаем
    return true;
  } catch (error) {
    return true; // err on the safe side
  }
}

/**
 * Форматирование байтов в читаемый вид
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
