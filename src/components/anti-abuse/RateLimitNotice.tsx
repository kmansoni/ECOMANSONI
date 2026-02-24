import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export type RateLimitNoticeProps = {
  action?: string;
  tier?: string;
  retryAfterSeconds?: number;
  onDismiss?: () => void;
  className?: string;
};

function formatSeconds(seconds?: number): string {
  if (!seconds || seconds <= 0) return "несколько секунд";
  if (seconds < 60) return `${seconds} сек.`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} мин.`;
}

function actionLabel(action?: string): string | null {
  if (!action) return null;
  const map: Record<string, string> = {
    send_message: "отправка сообщений",
    media_upload: "загрузка медиа",
    create_post: "публикация",
    follow: "подписки",
    search: "поиск",
    api_call: "запросы",
  };
  return map[action] || action;
}

export function RateLimitNotice(props: RateLimitNoticeProps) {
  const label = actionLabel(props.action);
  const wait = formatSeconds(props.retryAfterSeconds);

  const title = "Слишком много запросов";
  const description = label
    ? `Мы временно ограничили: ${label}. Попробуйте снова через ${wait}.`
    : `Попробуйте снова через ${wait}.`;

  return (
    <Alert className={props.className}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <AlertTitle>{title}</AlertTitle>
          <AlertDescription>
            <p>{description}</p>
            {props.tier ? <p className="mt-1 text-muted-foreground">Тир: {props.tier}</p> : null}
          </AlertDescription>
        </div>

        {props.onDismiss ? (
          <Button variant="outline" size="sm" onClick={props.onDismiss} className="shrink-0">
            Ок
          </Button>
        ) : null}
      </div>
    </Alert>
  );
}
