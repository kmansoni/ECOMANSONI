import { Link } from "react-router-dom";

export default function TermsOfServicePage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Условия использования Mansoni</h1>
          <Link
            to="/auth/showcase"
            className="rounded-lg border px-3 py-1.5 text-sm transition hover:bg-muted"
          >
            Назад
          </Link>
        </div>

        <p className="mb-4 text-sm text-muted-foreground">
          Версия: 0.1-draft · Дата вступления в силу: [YYYY-MM-DD] · Оператор: [указать реквизиты]
        </p>

        <section className="space-y-6 text-sm leading-6 sm:text-base">
          <div>
            <h2 className="mb-2 text-lg font-semibold">1. Предмет и акцепт</h2>
            <p>
              Настоящие условия регулируют доступ к сервисам Mansoni: мессенджеру, навигации, коммуникациям,
              маркетплейс-функциям и другим модулям платформы. Начало использования сервиса считается акцептом
              оферты.
            </p>
          </div>

          <div>
            <h2 className="mb-2 text-lg font-semibold">2. Аккаунт и безопасность доступа</h2>
            <p>
              Пользователь обязан сохранять контроль над устройствами и методами входа. При компрометации устройства
              пользователь должен незамедлительно ограничить сессии и уведомить поддержку.
            </p>
          </div>

          <div>
            <h2 className="mb-2 text-lg font-semibold">3. Допустимое использование</h2>
            <p>
              Запрещены фишинг, вредоносная активность, обход ограничений платформы, несанкционированный сбор
              персональных данных третьих лиц и публикация противоправного контента.
            </p>
          </div>

          <div>
            <h2 className="mb-2 text-lg font-semibold">4. Контент и права</h2>
            <p>
              Пользователь сохраняет права на свой контент и предоставляет платформе неисключительную лицензию,
              необходимую для технического предоставления функций сервиса.
            </p>
          </div>

          <div>
            <h2 className="mb-2 text-lg font-semibold">5. Ограничение ответственности</h2>
            <p>
              Платформа применяет меры защиты и отказоустойчивости, но не гарантирует абсолютную непрерывность
              работы при внешних инфраструктурных сбоях и не отвечает за последствия компрометации пользовательского
              устройства вне зоны контроля оператора.
            </p>
          </div>

          <div>
            <h2 className="mb-2 text-lg font-semibold">6. Споры и обращения</h2>
            <p>
              Претензии принимаются по адресу: [legal@domain]. Срок рассмотрения: [30] календарных дней.
              Применимое право и порядок подсудности определяются законодательством РФ.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
