import { Link } from "react-router-dom";

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Политика конфиденциальности Mansoni</h1>
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
            <h2 className="mb-2 text-lg font-semibold">1. Какие данные обрабатываются</h2>
            <p>
              Данные аккаунта, технические события безопасности, данные сессий и контент в объеме, необходимом для
              работы функций платформы и защиты от злоупотреблений.
            </p>
          </div>

          <div>
            <h2 className="mb-2 text-lg font-semibold">2. Цели обработки</h2>
            <p>
              Аутентификация, предоставление функций мессенджера и сервисов, предотвращение фрода, поддержка
              пользователей, выполнение требований законодательства РФ.
            </p>
          </div>

          <div>
            <h2 className="mb-2 text-lg font-semibold">3. Техническая защита</h2>
            <p>
              В Mansoni применяются транспортное шифрование и криптографические механизмы защиты коммуникаций,
              ролевая изоляция доступа к данным и контроль действий в чувствительных контурах.
            </p>
          </div>

          <div>
            <h2 className="mb-2 text-lg font-semibold">4. Трансграничная обработка</h2>
            <p>
              При использовании облачной инфраструктуры возможна трансграничная передача данных. Для таких операций
              применяются предусмотренные законодательством меры правовой и организационной защиты.
            </p>
          </div>

          <div>
            <h2 className="mb-2 text-lg font-semibold">5. Права пользователя</h2>
            <p>
              Пользователь вправе запросить сведения об обработке, уточнение или удаление данных в рамках применимого
              права, а также отозвать согласие в случаях, когда обработка основана на согласии.
            </p>
          </div>

          <div>
            <h2 className="mb-2 text-lg font-semibold">6. Контакты по персональным данным</h2>
            <p>
              Запросы и обращения по персональным данным: [privacy@domain]. Срок ответа: [30] календарных дней.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
