import { useState } from "react";
import { Sparkles, Camera, Scan, Box, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

const AR_FEATURES = [
  {
    icon: Scan,
    title: "Сканирование объектов",
    description: "Наведите камеру на объект для получения информации",
    available: false,
  },
  {
    icon: Box,
    title: "3D-просмотр недвижимости",
    description: "Визуализация квартиры или дома в реальном пространстве",
    available: false,
  },
  {
    icon: Sparkles,
    title: "AR-примерка",
    description: "Примерьте мебель и предметы интерьера в вашем помещении",
    available: false,
  },
];

async function requestCameraAccess(): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach((t) => t.stop());
    return true;
  } catch (err) {
    console.debug("Camera access denied:", err);
    return false;
  }
}

export function ARPage() {
  const navigate = useNavigate();
  const [cameraGranted, setCameraGranted] = useState<boolean | null>(null);
  const [launching, setLaunching] = useState(false);

  const handleLaunchAR = async () => {
    setLaunching(true);
    const granted = await requestCameraAccess();
    setCameraGranted(granted);
    setLaunching(false);

    if (granted) {
      toast.info("AR-режим скоро появится. Следите за обновлениями!");
    } else {
      toast.error("Доступ к камере не предоставлен. Разрешите использование камеры в настройках браузера.");
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={() => navigate("/")} className="p-1 -ml-1">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <span className="font-semibold">AR-просмотр</span>
          <div className="w-6" />
        </div>
      </div>

      {/* Hero */}
      <div className="bg-gradient-to-br from-violet-500 to-indigo-600 text-white p-8 flex flex-col items-center text-center">
        <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center mb-4">
          <Sparkles className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Дополненная реальность</h1>
        <p className="text-white/80 text-sm max-w-xs">
          Исследуйте объекты недвижимости и товары прямо в вашем пространстве с помощью AR-технологий.
        </p>
        <Badge variant="secondary" className="mt-4 bg-white/20 text-white border-0">
          Скоро
        </Badge>
      </div>

      {/* Camera Access */}
      <div className="px-4 mt-6">
        <Card>
          <CardContent className="p-4 flex flex-col items-center text-center gap-4">
            <div className="w-12 h-12 rounded-full bg-violet-500/10 flex items-center justify-center">
              <Camera className="w-6 h-6 text-violet-600" />
            </div>
            <div>
              <p className="font-medium text-sm">Требуется доступ к камере</p>
              <p className="text-xs text-muted-foreground mt-1">
                AR-функции используют камеру вашего устройства для наложения виртуальных объектов.
              </p>
            </div>
            {cameraGranted === true && (
              <p className="text-xs text-emerald-600 font-medium">✅ Доступ к камере предоставлен</p>
            )}
            {cameraGranted === false && (
              <p className="text-xs text-destructive font-medium">❌ Доступ к камере отклонён</p>
            )}
            <Button
              className="w-full bg-violet-600 hover:bg-violet-700"
              onClick={handleLaunchAR}
              disabled={launching}
            >
              {launching ? "Запуск..." : "Запустить AR"}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Features */}
      <div className="px-4 mt-6 space-y-3">
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
          Возможности
        </h2>
        {AR_FEATURES.map((feature, idx) => (
          <Card key={idx}>
            <CardContent className="p-4 flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
                <feature.icon className="w-5 h-5 text-violet-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm">{feature.title}</p>
                  <Badge variant="outline" className="text-[10px]">
                    {feature.available ? "Доступно" : "Скоро"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{feature.description}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
