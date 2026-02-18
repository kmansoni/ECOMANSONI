import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Circle, Clock, Loader2 } from "lucide-react";

interface RoadmapTask {
  id: string;
  title: string;
  status: "done" | "in_progress" | "todo";
  description?: string;
}

interface Phase {
  id: number;
  title: string;
  description: string;
  tasks: RoadmapTask[];
}

const ROADMAP: Phase[] = [
  {
    id: 1,
    title: "Критические исправления",
    description: "Исправление основных багов для стабильной работы",
    tasks: [
      { id: "1.1", title: "Исправить видеозвонки", status: "in_progress", description: "Диагностика и исправление проблемы с соединением" },
      { id: "1.2", title: "Добавить серверную диагностику", status: "done", description: "Debug-события в БД для отладки iOS" },
      { id: "1.3", title: "Создать панель разработчика", status: "done", description: "UI для мониторинга багов и задач" },
      { id: "1.4", title: "Добавить раннюю диагностику", status: "in_progress", description: "Логирование до getUserMedia" },
      { id: "1.5", title: "Таймаут на getUserMedia", status: "in_progress", description: "10-секундный таймаут с fallback" },
    ],
  },
  {
    id: 2,
    title: "Стабилизация",
    description: "Улучшение надёжности и UX",
    tasks: [
      { id: "2.1", title: "Push-уведомления для звонков", status: "todo", description: "Уведомления когда приложение в фоне" },
      { id: "2.2", title: "Оффлайн-режим с очередью", status: "todo", description: "Отправка сообщений при восстановлении связи" },
      { id: "2.3", title: "Оптимизация батареи", status: "todo", description: "Уменьшение потребления при звонках" },
      { id: "2.4", title: "Улучшить обработку ошибок", status: "todo", description: "Понятные сообщения для пользователя" },
    ],
  },
  {
    id: 3,
    title: "Новые функции",
    description: "Расширение функциональности",
    tasks: [
      { id: "3.1", title: "Групповые видеозвонки", status: "todo", description: "До 4 участников" },
      { id: "3.2", title: "Демонстрация экрана", status: "todo", description: "Шаринг экрана во время звонка" },
      { id: "3.3", title: "Запись звонков", status: "todo", description: "Локальная запись видеозвонков" },
      { id: "3.4", title: "Шифрование E2E", status: "todo", description: "End-to-end шифрование сообщений" },
    ],
  },
];

const getStatusIcon = (status: RoadmapTask["status"]) => {
  switch (status) {
    case "done":
      return <CheckCircle className="w-4 h-4 text-green-500" />;
    case "in_progress":
      return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
    case "todo":
      return <Circle className="w-4 h-4 text-muted-foreground" />;
  }
};

const getStatusLabel = (status: RoadmapTask["status"]) => {
  switch (status) {
    case "done":
      return "Готово";
    case "in_progress":
      return "В работе";
    case "todo":
      return "Планируется";
  }
};

const getStatusColor = (status: RoadmapTask["status"]) => {
  switch (status) {
    case "done":
      return "bg-green-500";
    case "in_progress":
      return "bg-blue-500";
    case "todo":
      return "bg-muted";
  }
};

export default function RoadmapTab() {
  const totalTasks = ROADMAP.reduce((acc, phase) => acc + phase.tasks.length, 0);
  const doneTasks = ROADMAP.reduce(
    (acc, phase) => acc + phase.tasks.filter((t) => t.status === "done").length,
    0
  );
  const inProgressTasks = ROADMAP.reduce(
    (acc, phase) => acc + phase.tasks.filter((t) => t.status === "in_progress").length,
    0
  );

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-green-500/30">
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle className="w-6 h-6 text-green-500" />
            <div>
              <p className="text-xl font-bold">{doneTasks}</p>
              <p className="text-xs text-muted-foreground">Готово</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-blue-500/30">
          <CardContent className="p-4 flex items-center gap-3">
            <Loader2 className="w-6 h-6 text-blue-500" />
            <div>
              <p className="text-xl font-bold">{inProgressTasks}</p>
              <p className="text-xs text-muted-foreground">В работе</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="w-6 h-6 text-muted-foreground" />
            <div>
              <p className="text-xl font-bold">{totalTasks - doneTasks - inProgressTasks}</p>
              <p className="text-xs text-muted-foreground">Планируется</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Общий прогресс</span>
          <span className="font-medium">{Math.round((doneTasks / totalTasks) * 100)}%</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden flex">
          <div
            className="h-full bg-green-500 transition-all"
            style={{ width: `${(doneTasks / totalTasks) * 100}%` }}
          />
          <div
            className="h-full bg-blue-500 transition-all"
            style={{ width: `${(inProgressTasks / totalTasks) * 100}%` }}
          />
        </div>
      </div>

      {/* Phases */}
      {ROADMAP.map((phase) => {
        const phaseDone = phase.tasks.filter((t) => t.status === "done").length;
        const phaseProgress = Math.round((phaseDone / phase.tasks.length) * 100);

        return (
          <Card key={phase.id}>
            <CardHeader className="py-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Badge variant="outline">Фаза {phase.id}</Badge>
                  {phase.title}
                </CardTitle>
                <span className="text-xs text-muted-foreground">
                  {phaseDone}/{phase.tasks.length} ({phaseProgress}%)
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{phase.description}</p>
            </CardHeader>
            <CardContent className="py-2">
              <div className="space-y-2">
                {phase.tasks.map((task) => (
                  <div
                    key={task.id}
                    className={`flex items-start gap-3 p-2 rounded ${
                      task.status === "in_progress" ? "bg-blue-500/10" : ""
                    }`}
                  >
                    {getStatusIcon(task.status)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-sm ${
                            task.status === "done" ? "line-through text-muted-foreground" : ""
                          }`}
                        >
                          {task.title}
                        </span>
                        {task.status === "in_progress" && (
                          <Badge className="bg-blue-500 text-[10px]">В работе</Badge>
                        )}
                      </div>
                      {task.description && (
                        <p className="text-xs text-muted-foreground">{task.description}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
