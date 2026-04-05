import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, Upload, RotateCcw, CheckCircle, Loader2, X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { recognizeDocument, FIELD_LABELS, DOCUMENT_FIELDS } from "@/lib/insurance/ocr";
import type { OcrResult } from "@/lib/insurance/ocr";

export interface DocumentScannerProps {
  documentType: 'passport' | 'driver_license' | 'vehicle_registration' | 'pts' | 'sts' | 'diagnostic_card';
  onRecognized: (data: Record<string, string>) => void;
  onClose: () => void;
}

const DOC_TYPE_LABELS: Record<string, string> = {
  passport: 'Паспорт',
  driver_license: 'Водительское удостоверение',
  vehicle_registration: 'Свидетельство о регистрации ТС',
  pts: 'ПТС',
  sts: 'СТС',
  diagnostic_card: 'Диагностическая карта',
};

type Mode = 'select' | 'upload' | 'camera' | 'preview' | 'recognizing' | 'result';

export function DocumentScanner({ documentType, onRecognized, onClose }: DocumentScannerProps) {
  const [mode, setMode] = useState<Mode>('select');
  const [imageData, setImageData] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [hasCamera, setHasCamera] = useState(true);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setHasCamera(false);
    }
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  };

  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setMode('camera');
    } catch {
      setCameraError('Не удалось получить доступ к камере. Используйте загрузку фото.');
      setMode('upload');
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const data = canvas.toDataURL('image/jpeg', 0.9);
    setImageData(data);
    stopCamera();
    setMode('preview');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setImageData(reader.result as string);
      setMode('preview');
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setImageData(reader.result as string);
      setMode('preview');
    };
    reader.readAsDataURL(file);
  }, []);

  const handleRecognize = async () => {
    if (!imageData) return;
    setMode('recognizing');
    try {
      const result = await recognizeDocument(imageData, documentType);
      setOcrResult(result);
      setMode('result');
    } catch {
      setMode('preview');
    }
  };

  const handleRetake = () => {
    setImageData(null);
    setOcrResult(null);
    stopCamera();
    setMode('select');
  };

  const handleApply = () => {
    if (ocrResult) {
      onRecognized(ocrResult.fields);
    }
  };

  const docLabel = DOC_TYPE_LABELS[documentType] ?? documentType;

  return (
    <div className="flex flex-col h-full bg-background text-foreground">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-base font-semibold">Скан: {docLabel}</h2>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="w-5 h-5" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <AnimatePresence mode="wait">

          {/* Выбор режима */}
          {mode === 'select' && (
            <motion.div
              key="select"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-3"
            >
              <p className="text-sm text-muted-foreground text-center">
                Выберите способ добавления документа
              </p>
              {cameraError && (
                <p className="text-xs text-destructive text-center">{cameraError}</p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Card
                  className="p-4 flex flex-col items-center gap-2 cursor-pointer hover:border-primary transition-colors"
                  onClick={() => setMode('upload')}
                >
                  <Upload className="w-8 h-8 text-primary" />
                  <span className="text-sm font-medium">Загрузить фото</span>
                  <span className="text-xs text-muted-foreground text-center">Из галереи или файла</span>
                </Card>
                {hasCamera && (
                  <Card
                    className="p-4 flex flex-col items-center gap-2 cursor-pointer hover:border-primary transition-colors"
                    onClick={startCamera}
                  >
                    <Camera className="w-8 h-8 text-primary" />
                    <span className="text-sm font-medium">Фотографировать</span>
                    <span className="text-xs text-muted-foreground text-center">Камера устройства</span>
                  </Card>
                )}
              </div>
            </motion.div>
          )}

          {/* Загрузка файла */}
          {mode === 'upload' && (
            <motion.div
              key="upload"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              <div
                className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary transition-colors"
                onClick={() => fileInputRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={e => e.preventDefault()}
              >
                <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm font-medium">Нажмите или перетащите фото документа</p>
                <p className="text-xs text-muted-foreground mt-1">JPG, PNG до 10 МБ</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
              <Button variant="outline" className="w-full" onClick={() => setMode('select')}>
                Назад
              </Button>
            </motion.div>
          )}

          {/* Камера */}
          {mode === 'camera' && (
            <motion.div
              key="camera"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              <div className="relative rounded-xl overflow-hidden bg-black aspect-[4/3]">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                {/* Рамка автофокуса */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-4/5 h-3/5 border-2 border-white/70 rounded-lg relative">
                    <div className="absolute top-0 left-0 w-5 h-5 border-t-2 border-l-2 border-primary rounded-tl-md" />
                    <div className="absolute top-0 right-0 w-5 h-5 border-t-2 border-r-2 border-primary rounded-tr-md" />
                    <div className="absolute bottom-0 left-0 w-5 h-5 border-b-2 border-l-2 border-primary rounded-bl-md" />
                    <div className="absolute bottom-0 right-0 w-5 h-5 border-b-2 border-r-2 border-primary rounded-br-md" />
                    <p className="absolute -bottom-7 left-0 right-0 text-center text-white text-xs">
                      Наведите на документ
                    </p>
                  </div>
                </div>
              </div>
              <canvas ref={canvasRef} className="hidden" />
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={handleRetake}>
                  Отмена
                </Button>
                <Button className="flex-1" onClick={capturePhoto}>
                  <Camera className="w-4 h-4 mr-2" />
                  Сфотографировать
                </Button>
              </div>
            </motion.div>
          )}

          {/* Превью */}
          {mode === 'preview' && imageData && (
            <motion.div
              key="preview"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              <div className="rounded-xl overflow-hidden">
                <img src={imageData} alt="Документ" className="w-full object-contain max-h-64" />
              </div>
              <p className="text-sm text-muted-foreground text-center">
                Убедитесь, что документ хорошо виден и читаемый
              </p>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={handleRetake}>
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Переснять
                </Button>
                <Button className="flex-1" onClick={handleRecognize}>
                  Распознать
                </Button>
              </div>
            </motion.div>
          )}

          {/* Распознавание */}
          {mode === 'recognizing' && (
            <motion.div
              key="recognizing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-16 space-y-4"
            >
              <div className="relative">
                <motion.div
                  className="w-16 h-16 rounded-full bg-primary/20"
                  animate={{ scale: [1, 1.3, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
                <Loader2 className="w-8 h-8 text-primary animate-spin absolute inset-0 m-auto" />
              </div>
              <p className="text-base font-medium">Распознавание документа...</p>
              <p className="text-sm text-muted-foreground">Пожалуйста, подождите</p>
            </motion.div>
          )}

          {/* Результат */}
          {mode === 'result' && ocrResult && (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              {ocrResult.error ? (
                <div className="flex items-center gap-2 text-amber-500">
                  <AlertTriangle className="w-5 h-5" />
                  <span className="text-sm font-medium">{ocrResult.error}</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-green-500">
                  <CheckCircle className="w-5 h-5" />
                  <span className="text-sm font-medium">
                    Документ распознан (достоверность {Math.round(ocrResult.confidence * 100)}%)
                  </span>
                </div>
              )}
              <Card className="p-4 space-y-2">
                {Object.entries(ocrResult.fields).map(([key, value]) => (
                  <div key={key} className="flex justify-between gap-2">
                    <span className="text-xs text-muted-foreground shrink-0">
                      {FIELD_LABELS[key] ?? key}
                    </span>
                    <span className="text-xs font-medium text-right">{value}</span>
                  </div>
                ))}
              </Card>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={handleRetake}>
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Переснять
                </Button>
                <Button className="flex-1" onClick={handleApply}>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Применить к форме
                </Button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
