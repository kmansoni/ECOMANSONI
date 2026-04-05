import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Download, FileText, Home, Shield, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

export default function InsuranceSuccessPage() {
  const { policyId } = useParams<{ policyId: string }>();
  const navigate = useNavigate();
  const [downloading, setDownloading] = useState(false);

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

              {/* QR-код (mock) */}
              <div className="flex flex-col items-center gap-3">
                <div className="w-36 h-36 bg-muted border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-1">
                  <FileText className="w-8 h-8 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground text-center">QR-код полиса</p>
                  <p className="text-xs font-mono text-muted-foreground">{policyId?.slice(-8)}</p>
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  Отсканируйте, чтобы проверить подлинность полиса
                </p>
              </div>

              <Separator />

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Статус</span>
                  <span className="font-medium text-green-500">Активен</span>
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
