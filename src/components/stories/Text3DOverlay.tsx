/**
 * Text3DOverlay — 3D текст для Stories с CSS 3D transform.
 * Drag-to-rotate (touch + mouse), пресеты цветов, настройка глубины.
 */

import { useRef, useEffect, useCallback, useState } from "react";
import { motion } from "framer-motion";
import { Type, RotateCw, Palette } from "lucide-react";
import { useText3D, COLOR_PRESETS } from "@/hooks/useText3D";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";

interface Text3DOverlayProps {
  onApply?: (config: ReturnType<typeof useText3D>["config"]) => void;
  onCancel?: () => void;
}

export function Text3DOverlay({ onApply, onCancel }: Text3DOverlayProps) {
  const { config, updateConfig, renderToCanvas } = useText3D();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragStartRef = useRef<{ x: number; y: number; rotX: number; rotY: number } | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);

  // Перерисовка при изменении конфигурации
  useEffect(() => {
    if (canvasRef.current) {
      renderToCanvas(canvasRef.current);
    }
  }, [config, renderToCanvas]);

  // Drag-to-rotate handlers
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        rotX: config.rotation.x,
        rotY: config.rotation.y,
      };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [config.rotation],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragStartRef.current) return;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      updateConfig({
        rotation: {
          x: Math.max(-45, Math.min(45, dragStartRef.current.rotX - dy * 0.5)),
          y: Math.max(-45, Math.min(45, dragStartRef.current.rotY + dx * 0.5)),
          z: config.rotation.z,
        },
      });
    },
    [config.rotation.z, updateConfig],
  );

  const handlePointerUp = useCallback(() => {
    dragStartRef.current = null;
  }, []);

  const resetRotation = useCallback(() => {
    updateConfig({ rotation: { x: 0, y: 0, z: 0 } });
  }, [updateConfig]);

  return (
    <div className="flex flex-col gap-3 w-full max-w-sm mx-auto">
      {/* Preview canvas */}
      <div
        className="relative w-full aspect-[9/16] bg-black/50 rounded-xl overflow-hidden touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <canvas
          ref={canvasRef}
          className="w-full h-full"
          style={{ touchAction: "none" }}
          aria-label="Превью 3D текста"
        />

        {/* CSS 3D отображение текста поверх canvas */}
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ perspective: "800px" }}
        >
          <span
            className="select-none leading-tight"
            style={{
              fontSize: `${config.fontSize}px`,
              fontWeight: config.fontWeight,
              color: config.color,
              transform: `rotateX(${config.rotation.x}deg) rotateY(${config.rotation.y}deg) rotateZ(${config.rotation.z}deg)`,
              textShadow: Array.from({ length: config.depth }, (_, i) =>
                `${(i + 1) * 1.2}px ${(i + 1) * 1.2}px 0px rgba(0,0,0,${0.5 - i * 0.04})`,
              ).join(", "),
              transition: "transform 0.05s ease-out",
            }}
          >
            {config.text || "Текст"}
          </span>
        </div>

        <p className="absolute bottom-2 left-0 right-0 text-center text-xs text-white/40">
          Тяните для вращения
        </p>
      </div>

      {/* Текст */}
      <Input
        value={config.text}
        onChange={(e) => updateConfig({ text: e.target.value })}
        placeholder="Введите текст"
        maxLength={100}
        className="text-center"
        aria-label="Текст для 3D"
      />

      {/* Глубина */}
      <div className="flex items-center gap-3">
        <Type className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="text-xs text-muted-foreground w-14">Глубина</span>
        <Slider
          value={[config.depth]}
          onValueChange={([v]) => updateConfig({ depth: v })}
          min={1}
          max={10}
          step={1}
          className="flex-1"
          aria-label="Глубина 3D текста"
        />
        <span className="text-xs text-muted-foreground w-6 text-right">{config.depth}</span>
      </div>

      {/* Размер шрифта */}
      <div className="flex items-center gap-3">
        <Type className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="text-xs text-muted-foreground w-14">Размер</span>
        <Slider
          value={[config.fontSize]}
          onValueChange={([v]) => updateConfig({ fontSize: v })}
          min={12}
          max={120}
          step={2}
          className="flex-1"
          aria-label="Размер шрифта"
        />
        <span className="text-xs text-muted-foreground w-6 text-right">{config.fontSize}</span>
      </div>

      {/* Цвета */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowColorPicker((v) => !v)}
          className="p-2 rounded-lg hover:bg-white/10 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label="Выбрать цвет"
        >
          <Palette className="w-5 h-5" style={{ color: config.color }} />
        </button>

        {showColorPicker && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex gap-1.5 flex-wrap"
          >
            {COLOR_PRESETS.map((c) => (
              <button
                key={c}
                onClick={() => updateConfig({ color: c })}
                className="w-7 h-7 rounded-full border-2 transition-all min-h-[28px] min-w-[28px]"
                style={{
                  backgroundColor: c,
                  borderColor: config.color === c ? "#fff" : "transparent",
                  transform: config.color === c ? "scale(1.2)" : "scale(1)",
                }}
                aria-label={`Цвет ${c}`}
              />
            ))}
          </motion.div>
        )}
      </div>

      {/* Толщина и сброс */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            updateConfig({ fontWeight: config.fontWeight === "bold" ? "normal" : "bold" })
          }
          className="flex-1 min-h-[44px]"
          aria-label="Переключить жирность"
        >
          <span className={config.fontWeight === "bold" ? "font-bold" : "font-normal"}>
            {config.fontWeight === "bold" ? "Жирный" : "Обычный"}
          </span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={resetRotation}
          className="min-h-[44px] min-w-[44px]"
          aria-label="Сбросить вращение"
        >
          <RotateCw className="w-4 h-4" />
        </Button>
      </div>

      {/* Действия */}
      <div className="flex gap-2 pt-2">
        {onCancel && (
          <Button variant="outline" onClick={onCancel} className="flex-1 min-h-[44px]">
            Отмена
          </Button>
        )}
        {onApply && (
          <Button onClick={() => onApply(config)} className="flex-1 min-h-[44px]">
            Применить
          </Button>
        )}
      </div>
    </div>
  );
}
