import { useEffect, useRef } from "react";

type EffectType = "confetti" | "fire" | "hearts";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  color: string;
  size: number;
  rotation: number;
  rotationSpeed: number;
  emoji?: string;
}

interface MessageEffectProps {
  type: EffectType | null;
  onComplete?: () => void;
}

const CONFETTI_COLORS = ["#ff6b6b", "#ffd93d", "#6bcb77", "#4d96ff", "#f9c74f", "#a29bfe"];
const FIRE_COLORS = ["#ff4500", "#ff6347", "#ffa500", "#ffd700"];

export function MessageEffect({ type, onComplete }: MessageEffectProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number | null>(null);

  useEffect(() => {
    if (!type || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles: Particle[] = [];
    const count = type === "confetti" ? 120 : type === "fire" ? 80 : 60;
    const centerX = canvas.width / 2;
    const startY = canvas.height * 0.7;

    for (let i = 0; i < count; i++) {
      const angle = (Math.random() - 0.5) * Math.PI;
      const speed = 3 + Math.random() * 6;
      let color: string;
      let emoji: string | undefined;

      if (type === "confetti") {
        color = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
      } else if (type === "fire") {
        color = FIRE_COLORS[Math.floor(Math.random() * FIRE_COLORS.length)];
      } else {
        color = "#ff6b9d";
        emoji = "❤️";
      }

      particles.push({
        x: centerX + (Math.random() - 0.5) * 100,
        y: startY,
        vx: Math.sin(angle) * speed,
        vy: -Math.cos(angle) * speed - 2,
        alpha: 1,
        color,
        size: 6 + Math.random() * 6,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.2,
        emoji,
      });
    }

    const gravity = 0.12;
    let frame = 0;

    const animate = () => {
      if (frame > 180) {
        if (animRef.current) cancelAnimationFrame(animRef.current);
        onComplete?.();
        return;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      frame++;

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += gravity;
        p.vx *= 0.99;
        p.alpha = Math.max(0, 1 - frame / 180);
        p.rotation += p.rotationSpeed;

        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);

        if (p.emoji) {
          ctx.font = `${p.size * 2}px serif`;
          ctx.fillText(p.emoji, -p.size, p.size);
        } else if (type === "confetti") {
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        } else {
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      }

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [type]);

  if (!type) return null;

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-50"
      style={{ width: "100%", height: "100%" }}
    />
  );
}
