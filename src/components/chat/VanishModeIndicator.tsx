import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff } from 'lucide-react';

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  opacity: number;
  vx: number;
  vy: number;
}

interface VanishModeIndicatorProps {
  isActive: boolean;
  onToggle: () => void;
}

function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animRef = useRef<number>(0);
  const idRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    const spawn = () => {
      if (particlesRef.current.length < 30) {
        particlesRef.current.push({
          id: idRef.current++,
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          size: Math.random() * 3 + 1,
          opacity: Math.random() * 0.6 + 0.2,
          vx: (Math.random() - 0.5) * 0.5,
          vy: -(Math.random() * 0.5 + 0.2),
        });
      }
    };

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      spawn();

      particlesRef.current = particlesRef.current.filter(p => p.opacity > 0.01);
      particlesRef.current.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.opacity -= 0.005;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(167, 139, 250, ${p.opacity})`;
        ctx.fill();
      });

      animRef.current = requestAnimationFrame(animate);
    };

    animate();
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
    />
  );
}

export function VanishModeIndicator({ isActive, onToggle }: VanishModeIndicatorProps) {
  return (
    <AnimatePresence>
      {isActive && (
        <motion.div
          className="relative overflow-hidden flex items-center justify-between px-4 py-3 bg-violet-950/60 border-b border-violet-500/20"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <ParticleCanvas />

          <div className="relative flex items-center gap-2 z-10">
            <div className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
            <span className="text-violet-200 text-sm font-medium">
              Vanish Mode включён
            </span>
            <span className="text-violet-400 text-xs">
              — сообщения исчезают после прочтения
            </span>
          </div>

          <button
            onClick={onToggle}
            className="relative z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-violet-500/20 hover:bg-violet-500/40 text-violet-300 text-xs font-medium transition-colors"
          >
            <EyeOff className="w-3.5 h-3.5" />
            Выключить
          </button>
        </motion.div>
      )}
      {!isActive && (
        <motion.div
          className="flex justify-center py-1"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <button
            onClick={onToggle}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-zinc-500 hover:text-zinc-300 text-xs transition-colors"
          >
            <Eye className="w-3.5 h-3.5" />
            Включить Vanish Mode
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
