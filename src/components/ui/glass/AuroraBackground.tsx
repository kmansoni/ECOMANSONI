import { motion } from "framer-motion";
import type { GlassTheme } from "./glassTokens";

/**
 * Анимированный aurora-фон — эталон из src/pages/auth/components/AuroraBackground.tsx.
 * Три радиальных blob-а в фирменной палитре cyan→teal→emerald + SVG-noise overlay.
 */
export function AuroraBackground({ theme = "dark" }: { theme?: GlassTheme }) {
  const dark = theme === "dark";
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden>
      <div
        className="absolute inset-0 transition-colors duration-700"
        style={{
          background: dark
            ? "radial-gradient(120% 80% at 50% 0%, #0a1628 0%, #071420 60%, #020309 100%)"
            : "linear-gradient(165deg, #f0fdfa 0%, #ccfbf1 28%, #a5f3fc 55%, #7dd3fc 82%, #bae6fd 100%)",
        }}
      />
      {!dark && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(70% 50% at 88% 8%, rgba(20,184,166,0.22) 0%, transparent 70%)," +
              "radial-gradient(60% 45% at 8% 92%, rgba(99,102,241,0.18) 0%, transparent 72%)," +
              "radial-gradient(50% 40% at 50% 50%, rgba(56,189,248,0.10) 0%, transparent 75%)",
          }}
        />
      )}
      {(dark
        ? [
            { x: "-10%", y: "-20%", c1: "#00b4d8", c2: "#0077b6", s: 620, d: 18, delay: 0 },
            { x: "60%", y: "10%", c1: "#00c896", c2: "#00e6b4", s: 560, d: 22, delay: 3 },
            { x: "20%", y: "70%", c1: "#0096c7", c2: "#00b4d8", s: 700, d: 26, delay: 6 },
          ]
        : [
            { x: "-15%", y: "-25%", c1: "#2dd4bf", c2: "#5eead4", s: 680, d: 20, delay: 0 },
            { x: "65%", y: "5%", c1: "#22d3ee", c2: "#67e8f9", s: 600, d: 24, delay: 3 },
            { x: "15%", y: "65%", c1: "#34d399", c2: "#6ee7b7", s: 720, d: 26, delay: 5 },
            { x: "55%", y: "75%", c1: "#a78bfa", c2: "#c4b5fd", s: 540, d: 28, delay: 8 },
          ]
      ).map((b, i) => (
        <motion.div
          key={i}
          className={`absolute rounded-full blur-3xl will-change-transform ${
            dark ? "mix-blend-screen" : "mix-blend-multiply"
          }`}
          initial={{ opacity: 0 }}
          animate={{
            opacity: dark ? 0.55 : 0.32,
            x: ["0%", "6%", "-4%", "0%"],
            y: ["0%", "-5%", "4%", "0%"],
            scale: [1, 1.08, 0.96, 1],
          }}
          transition={{ duration: b.d, delay: b.delay, repeat: Infinity, ease: "easeInOut" }}
          style={{
            left: b.x,
            top: b.y,
            width: b.s,
            height: b.s,
            background: `radial-gradient(circle at 30% 30%, ${b.c1}, ${b.c2} 55%, transparent 70%)`,
          }}
        />
      ))}
      <div
        className={`absolute inset-0 pointer-events-none ${
          dark ? "opacity-[0.06] mix-blend-overlay" : "opacity-[0.035] mix-blend-multiply"
        }`}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.9'/></svg>\")",
        }}
      />
    </div>
  );
}
