import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ChevronLeft, CheckCircle2, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MessengerQrCode } from "@/components/insurance/shared/MessengerQrCode";

const APP_URL = "https://mansoni.ru/app";

const BENEFITS = [
  { icon: "📋", title: "Все полисы в одном месте", desc: "Все ваши страховые полисы хранятся в приложении и доступны в любое время" },
  { icon: "🔔", title: "Уведомления о продлении", desc: "Получайте напоминания за 30, 14 и 7 дней до окончания срока действия" },
  { icon: "💬", title: "Быстрая связь со страховой", desc: "Чат с представителем страховой компании прямо в приложении" },
  { icon: "⚡", title: "Оформление за 2 минуты", desc: "Заполните данные один раз и оформляйте новые полисы в пару кликов" },
  { icon: "📱", title: "QR-код полиса всегда под рукой", desc: "Электронный полис с QR-кодом — не нужно носить бумажные документы" },
];

export default function InsuranceDownloadPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border">
        <div className="flex items-center gap-3 px-4 py-3 max-w-2xl mx-auto">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-base font-semibold">Скачать приложение</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-10">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-3"
        >
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto">
            <Smartphone className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-2xl font-bold">Mansoni — мессенджер для страхования</h2>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            Управляйте всеми страховыми полисами в одном удобном приложении
          </p>
        </motion.div>

        {/* QR Code */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="flex flex-col items-center gap-4"
        >
          <MessengerQrCode size={220} showButtons />
          <p className="text-xs text-muted-foreground text-center max-w-xs">
            Отсканируйте QR-код камерой или воспользуйтесь одной из кнопок ниже
          </p>
        </motion.div>

        {/* Кнопки скачивания */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-3 gap-3"
        >
          {[
            { label: "App Store", emoji: "🍎" },
            { label: "Google Play", emoji: "🤖" },
            { label: "Web App", emoji: "🌐" },
          ].map(({ label, emoji }) => (
            <Button
              key={label}
              variant="outline"
              className="flex flex-col h-auto py-3 gap-1"
              onClick={() => window.open(APP_URL, "_blank")}
            >
              <span className="text-xl">{emoji}</span>
              <span className="text-xs">{label}</span>
            </Button>
          ))}
        </motion.div>

        {/* Преимущества */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="space-y-4"
        >
          <h3 className="text-base font-semibold">Почему стоит использовать Mansoni</h3>
          <div className="space-y-3">
            {BENEFITS.map((b, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.07 }}
                className="flex gap-3 items-start"
              >
                <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center text-xl shrink-0">
                  {b.icon}
                </div>
                <div>
                  <p className="text-sm font-medium">{b.title}</p>
                  <p className="text-xs text-muted-foreground">{b.desc}</p>
                </div>
                <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
