import { motion } from "framer-motion";
import type { Theme } from "../types";

export function AuroraBackground({ theme }: { theme: Theme }) {
  const dark = theme === "dark";
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden>
      <div
        className="absolute inset-0 transition-colors duration-700"
        style={{
          background: dark
            ? "radial-gradient(120% 80% at 50% 0%, #0a1628 0%, #071420 60%, #020309 100%)"
            : "radial-gradient(120% 80% at 50% 0%, #f0fdfa 0%, #ecfeff 55%, #f0f9ff 100%)",
        }}
      />
      {(dark
        ? [
            { x: "-10%", y: "-20%", c1: "#00b4d8", c2: "#0077b6", s: 620, d: 18, delay: 0 },
            { x: "60%", y: "10%", c1: "#00c896", c2: "#00e6b4", s: 560, d: 22, delay: 3 },
            { x: "20%", y: "70%", c1: "#0096c7", c2: "#00b4d8", s: 700, d: 26, delay: 6 },
          ]
        : [
            { x: "-10%", y: "-20%", c1: "#67e8f9", c2: "#a5f3fc", s: 620, d: 18, delay: 0 },
            { x: "60%", y: "10%", c1: "#6ee7b7", c2: "#a7f3d0", s: 560, d: 22, delay: 3 },
            { x: "20%", y: "70%", c1: "#99f6e4", c2: "#a5f3fc", s: 700, d: 26, delay: 6 },
          ]
      ).map((b, i) => (
        <motion.div
          key={i}
          className={`absolute rounded-full blur-3xl will-change-transform ${
            dark ? "mix-blend-screen" : "mix-blend-multiply"
          }`}
          initial={{ opacity: 0 }}
          animate={{
            opacity: dark ? 0.55 : 0.75,
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
          dark ? "opacity-[0.06] mix-blend-overlay" : "opacity-[0.04] mix-blend-multiply"
        }`}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.9'/></svg>\")",
        }}
      />
    </div>
  );
}
