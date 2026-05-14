import { useState, useEffect } from "react";
import { X, FileText, Shield } from "lucide-react";

type LegalType = "terms" | "privacy";

interface LegalModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: LegalType;
}

const legalContent = {
  terms: {
    title: "Условия использования",
    icon: FileText,
    lastUpdated: "1 мая 2026 г.",
    sections: [
      {
        heading: "1. Общие положения",
        content: `Используя приложение MANSONI, вы соглашаетесь с настоящими Условиями использования. Если вы не согласны с какими-либо условиями, пожалуйста, не используйте приложение.

Сервис MANSONI предоставляет доступ к платформе, объединяющей различные сервисы, включая мессенджер, социальные сети, маркетплейс, такси и другие функции.`,
      },
      {
        heading: "2. Аккаунт пользователя",
        content: `Для использования приложения необходимо создать аккаунт. Вы несёте ответственность за сохранность своих учётных данных и за все действия, совершаемые с вашего аккаунта.

Вы обязуетесь предоставлять точную и актуальную информацию при регистрации.`,
      },
      {
        heading: "3. Конфиденциальность",
        content: `Мы серьёзно относимся к защите ваших персональных данных. Сбор, хранение и обработка данных осуществляются в соответствии с Политикой конфиденциальности и применимым законодательством.

Все коммуникации в мессенджере защищены сквозным шифрованием (E2EE).`,
      },
      {
        heading: "4. Правила поведения",
        content: `Запрещено:
• Размещение контента, нарушающего законодательство
• Публикация материалов, нарушающих авторские права
• Распространение спама и вредоносного контента
• Любые действия, которые могут нанести вред другим пользователям

Мы оставляем за собой право ограничивать или блокировать доступ нарушителям.`,
      },
      {
        heading: "5. Ограничение ответственности",
        content: `Приложение предоставляется «как есть». Мы не гарантируем бесперебойную работу всех функций. Мы не несём ответственности за действия пользователей или контент, размещаемый третьими лицами.

При использовании услуг третьих сторон (такси, маркетплейс и др.) применяются их собственные условия.`,
      },
      {
        heading: "6. Интеллектуальная собственность",
        content: `Все права на приложение MANSONI, включая дизайн, логотип и программный код, принадлежат правообладателям. Копирование или использование без разрешения запрещено.`,
      },
      {
        heading: "7. Изменения условий",
        content: `Мы можем обновлять настоящие Условия. Об изменениях будет сообщаться через приложение. Продолжая использовать приложение после изменений, вы соглашаетесь с новыми условиями.`,
      },
      {
        heading: "8. Контакты",
        content: `По вопросам, связанным с настоящими Условиями, обращайтесь: support@mansoni.app`,
      },
    ],
  },
  privacy: {
    title: "Политика конфиденциальности",
    icon: Shield,
    lastUpdated: "1 мая 2026 г.",
    sections: [
      {
        heading: "1. Сбор данных",
        content: `Мы собираем информацию, которую вы предоставляете при регистрации: имя, email, телефон, дата рождения. Также собираем данные об использовании приложения для улучшения сервиса.

Данные собираются только с вашего согласия и необходимы для функционирования приложения.`,
      },
      {
        heading: "2. Использование данных",
        content: `Собранные данные используются для:
• Создания и управления вашим аккаунтом
• Обеспечения работы всех функций платформы
• Связи с вами по важным вопросам
• Улучшения качества сервиса
• Обеспечения безопасности и предотвращения мошенничества`,
      },
      {
        heading: "3. Защита данных",
        content: `Мы применяем современные меры защиты:
• Сквозное шифрование (E2EE) для всех сообщений
• TLS 1.3 для защиты данных при передаче
• AES-256 для шифрования хранимых данных
• Row Level Security (RLS) в базе данных
• Регулярные проверки безопасности`,
      },
      {
        heading: "4. Передача третьим лицам",
        content: `Мы не продаём и не передаём ваши персональные данные третьим лицам без вашего согласия, за исключением случаев, предусмотренных законодательством.

При использовании сервисов партнёров (оплата, такси) их политики конфиденциальности применяются отдельно.`,
      },
      {
        heading: "5. Ваши права",
        content: `Вы имеете право:
• Получить доступ к своим данным
• Исправить неточные данные
• Удалить свой аккаунт и данные
• Отозвать согласие на обработку
• Получить данные в переносимом формате

Для реализации прав обращайтесь: privacy@mansoni.app`,
      },
      {
        heading: "6. Хранение данных",
        content: `Данные хранятся столько, сколько необходимо для целей, указанных выше. При удалении аккаунта данные удаляются в течение 30 дней, за исключением случаев, когда закон требует более длительного хранения.`,
      },
      {
        heading: "7. Дети",
        content: `Приложение не предназначено для лиц младше 16 лет. Мы не собираем данные несовершеннолетних сознательно. Если вы обнаружили, что данные ребёнка были предоставлены, свяжитесь с нами для удаления.`,
      },
      {
        heading: "8. Контакты",
        content: `По вопросам конфиденциальности: privacy@mansoni.app`,
      },
    ],
  },
};

export function LegalModal({ isOpen, onClose, type }: LegalModalProps) {
  const [isVisible, setIsVisible] = useState(false);
  const content = legalContent[type];
  const Icon = content.icon;

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => setIsVisible(true));
    } else {
      setIsVisible(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-end sm:items-center justify-center transition-all duration-300 ${
        isVisible ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className={`relative w-full sm:max-w-lg max-h-[85vh] sm:max-h-[80vh] bg-[#0a1628] rounded-t-2xl sm:rounded-2xl overflow-hidden transition-transform duration-300 ${
          isVisible ? "translate-y-0" : "translate-y-full sm:translate-y-4 sm:scale-95"
        }`}
        style={{
          boxShadow: "0 -4px 30px rgba(0,0,0,0.5), 0 8px 40px rgba(0,0,0,0.3)",
        }}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b border-white/10 bg-[#0a1628]">
          <div className="flex items-center gap-2">
            <Icon className="w-5 h-5 text-cyan-400" />
            <h2 className="text-base font-semibold text-white">{content.title}</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"
          >
            <X className="w-4 h-4 text-white/70" />
          </button>
        </div>

        {/* Last updated */}
        <div className="px-4 py-2 border-b border-white/5 bg-white/[0.02]">
          <p className="text-[11px] text-white/40">Последнее обновление: {content.lastUpdated}</p>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(85vh-100px)] sm:max-h-[calc(80vh-100px)] px-4 py-4">
          {content.sections.map((section, index) => (
            <div key={index} className="mb-5 last:mb-0">
              <h3 className="text-sm font-semibold text-cyan-300 mb-2">{section.heading}</h3>
              <p className="text-[13px] text-white/70 leading-relaxed whitespace-pre-line">{section.content}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
