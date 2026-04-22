import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Check, Download, Home, Shield, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import QRCode from "qrcode";

export default function InsuranceSuccessPage() {
  const { policyId } = useParams<{ policyId: string }>();
  const navigate = useNavigate();
  const [downloading, setDownloading] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!policyId) return;
    QRCode.toDataURL(policyId, {
      width: 200,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    })
      .then(setQrCodeUrl)
      .catch((e) => console.warn('[InsuranceSuccess] QR generation failed:', e));
  }, [policyId]);

  const handleDownload = async () => {
    if (!policyId) return;
    setDownloading(true);
    try {
      const { data, error } = await supabase.storage
        .from("policies")
        .download(`${policyId}.pdf`);

      if (error || !data) {
        toast.error("Файл полиса не найден");
        return;
      }

      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `policy-${policyId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("PDF загружен");
    } catch {
      toast.error("Ошибка при скачивании");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md space-y-6">
        {/* Анимированная галочка */}
        <div className="flex flex-col items-center gap-4">
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 15 }}
            className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.3, type: "spring", stiffness: 300 }}
            >
              <Check className="w-12 h-12 text-white" strokeWidth={3} />
            </motion.div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="text-center"
          >
            <h1 className="text-2xl font-bold">Полис оформлен!</h1>
            <p className="text-muted-foreground mt-1">Поздравляем! Ваш страховой полис успешно выпущен.</p>
          </motion.div>
        </div>

        {/* Информация о полисе */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
          <Card>
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <Shield className="w-8 h-8 text-primary" />
                <div>
                  <p className="text-xs text-muted-foreground">Номер полиса</p>
                  <p className="font-mono font-bold text-base">{policyId}</p>
                </div>
              </div>

              <Separator />

              {policyId && (
                <div className="flex flex-col items-center gap-2 py-3">
                  <p className="text-xs text-muted-foreground">Номер полиса</p>
                  <p className="text-2xl font-mono font-bold tracking-wider text-primary">{policyId}</p>
                  <p className="text-xs text-muted-foreground text-center mt-1">
                    Сохраните номер для обращения в страховую компанию
                  </p>
                  {qrCodeUrl && (
                    <div className="mt-3 p-2 bg-white rounded-lg">
                      <img src={qrCodeUrl} alt="QR код полиса" className="w-32 h-32" />
                      <p className="text-[10px] text-muted-foreground text-center mt-1">Сканируйте для быстрого поиска</p>
                    </div>
                  )}
                </div>
              )}

              <Separator />

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Статус</span>
                  <span className="font-medium text-amber-500">Ожидает оплаты</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Дата выдачи</span>
                  <span className="font-medium">{new Date().toLocaleDateString("ru-RU")}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Кнопки */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="space-y-3"
        >
          <Button onClick={handleDownload} disabled={downloading} className="w-full" size="lg">
            {downloading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            {downloading ? "Загрузка..." : "Скачать PDF"}
          </Button>
          <Button variant="outline" onClick={() => navigate("/insurance/policies")} className="w-full">
            Мои полисы
          </Button>
          <Button variant="ghost" onClick={() => navigate("/insurance")} className="w-full">
            <Home className="w-4 h-4 mr-2" />На главную страхования
          </Button>
        </motion.div>
      </div>
    </div>
  );
}
