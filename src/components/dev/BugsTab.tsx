import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle, Eye, Bug } from "lucide-react";

interface KnownBug {
  id: string;
  title: string;
  description: string;
  status: "active" | "monitoring" | "fixed";
  priority: "critical" | "high" | "medium" | "low";
  notes?: string;
}

const KNOWN_BUGS: KnownBug[] = [
  {
    id: "BUG-006",
    title: "Призрачные звонки при входе",
    description: "При входе в приложение показывались входящие звонки от пользователей не в сети. Причина — старые записи со статусом 'ringing' в БД.",
    status: "fixed",
    priority: "critical",
    notes: "Добавлена автоочистка зависших звонков при загрузке + фильтр по возрасту (60 сек) в polling и Realtime.",
  },
  {
    id: "BUG-001",
    title: "Видеозвонки не соединяются",
    description: "При ответе на видеозвонок соединение не устанавливается (started_at остаётся null). Debug-сигналы не доходят до БД — вероятно, сбой на этапе getUserMedia.",
    status: "monitoring",
    priority: "critical",
    notes: "Добавлена ранняя диагностика перед getUserMedia и таймаут 10 сек. Тестируем.",
  },
  {
    id: "BUG-005",
    title: "Модальное окно не закрывается при завершении звонка",
    description: "Когда один участник завершает звонок, у другого модальное окно остаётся открытым со статусом 'инициализация'.",
    status: "fixed",
    priority: "critical",
    notes: "Исправлено: порядок вызовов onCallEnded → cleanup, обновление БД до отправки hangup-сигнала.",
  },
  {
    id: "BUG-002",
    title: "Сессия слетает в Telegram iOS",
    description: "При открытии разрешений камеры/микрофона в iOS Safari (Telegram Mini App) вызывается visibilitychange, что может прерывать звонок.",
    status: "monitoring",
    priority: "high",
    notes: "Добавлена защита от cleanup при visibilitychange во время активного звонка.",
  },
  {
    id: "BUG-003",
    title: "ICE candidates не доходят",
    description: "На некоторых сетях ICE candidates теряются, соединение зависает на этапе checking.",
    status: "fixed",
    priority: "medium",
    notes: "Решено через dual signaling (Broadcast + DB polling) и force relay для iOS.",
  },
  {
    id: "BUG-004",
    title: "Аудио-fallback при проблемах с камерой",
    description: "Если камера недоступна, видеозвонок должен переключаться на аудио.",
    status: "fixed",
    priority: "medium",
    notes: "Реализован audio-only fallback в answerCall.",
  },
];

const getStatusIcon = (status: KnownBug["status"]) => {
  switch (status) {
    case "active":
      return <AlertTriangle className="w-4 h-4 text-red-500" />;
    case "monitoring":
      return <Eye className="w-4 h-4 text-yellow-500" />;
    case "fixed":
      return <CheckCircle className="w-4 h-4 text-green-500" />;
  }
};

const getStatusLabel = (status: KnownBug["status"]) => {
  switch (status) {
    case "active":
      return "Активный";
    case "monitoring":
      return "Мониторинг";
    case "fixed":
      return "Исправлено";
  }
};

const getPriorityColor = (priority: KnownBug["priority"]) => {
  switch (priority) {
    case "critical":
      return "bg-red-500";
    case "high":
      return "bg-orange-500";
    case "medium":
      return "bg-yellow-500";
    case "low":
      return "bg-blue-500";
  }
};

const getPriorityLabel = (priority: KnownBug["priority"]) => {
  switch (priority) {
    case "critical":
      return "Критический";
    case "high":
      return "Высокий";
    case "medium":
      return "Средний";
    case "low":
      return "Низкий";
  }
};

export default function BugsTab() {
  const activeBugs = KNOWN_BUGS.filter((b) => b.status === "active");
  const monitoringBugs = KNOWN_BUGS.filter((b) => b.status === "monitoring");
  const fixedBugs = KNOWN_BUGS.filter((b) => b.status === "fixed");

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-red-500/30">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-red-500" />
            <div>
              <p className="text-xl font-bold">{activeBugs.length}</p>
              <p className="text-xs text-muted-foreground">Активных</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-yellow-500/30">
          <CardContent className="p-4 flex items-center gap-3">
            <Eye className="w-6 h-6 text-yellow-500" />
            <div>
              <p className="text-xl font-bold">{monitoringBugs.length}</p>
              <p className="text-xs text-muted-foreground">Мониторинг</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-green-500/30">
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle className="w-6 h-6 text-green-500" />
            <div>
              <p className="text-xl font-bold">{fixedBugs.length}</p>
              <p className="text-xs text-muted-foreground">Исправлено</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active Bugs */}
      {activeBugs.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-red-500 flex items-center gap-2">
            <Bug className="w-4 h-4" />
            Активные проблемы
          </h3>
          {activeBugs.map((bug) => (
            <Card key={bug.id} className="border-red-500/30">
              <CardHeader className="py-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    {getStatusIcon(bug.status)}
                    <span className="font-mono text-xs text-muted-foreground">
                      {bug.id}
                    </span>
                    {bug.title}
                  </CardTitle>
                  <Badge className={getPriorityColor(bug.priority)}>
                    {getPriorityLabel(bug.priority)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="py-2 space-y-2">
                <p className="text-sm text-muted-foreground">{bug.description}</p>
                {bug.notes && (
                  <div className="text-xs bg-muted p-2 rounded">
                    <span className="font-semibold">Заметка:</span> {bug.notes}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Monitoring Bugs */}
      {monitoringBugs.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-yellow-500 flex items-center gap-2">
            <Eye className="w-4 h-4" />
            Под наблюдением
          </h3>
          {monitoringBugs.map((bug) => (
            <Card key={bug.id} className="border-yellow-500/30">
              <CardHeader className="py-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    {getStatusIcon(bug.status)}
                    <span className="font-mono text-xs text-muted-foreground">
                      {bug.id}
                    </span>
                    {bug.title}
                  </CardTitle>
                  <Badge className={getPriorityColor(bug.priority)}>
                    {getPriorityLabel(bug.priority)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="py-2 space-y-2">
                <p className="text-sm text-muted-foreground">{bug.description}</p>
                {bug.notes && (
                  <div className="text-xs bg-muted p-2 rounded">
                    <span className="font-semibold">Заметка:</span> {bug.notes}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Fixed Bugs */}
      {fixedBugs.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-green-500 flex items-center gap-2">
            <CheckCircle className="w-4 h-4" />
            Исправлено
          </h3>
          {fixedBugs.map((bug) => (
            <Card key={bug.id} className="border-green-500/30 opacity-70">
              <CardHeader className="py-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    {getStatusIcon(bug.status)}
                    <span className="font-mono text-xs text-muted-foreground">
                      {bug.id}
                    </span>
                    {bug.title}
                  </CardTitle>
                  <Badge variant="outline">{getStatusLabel(bug.status)}</Badge>
                </div>
              </CardHeader>
              <CardContent className="py-2 space-y-2">
                <p className="text-sm text-muted-foreground">{bug.description}</p>
                {bug.notes && (
                  <div className="text-xs bg-muted p-2 rounded">
                    <span className="font-semibold">Решение:</span> {bug.notes}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
