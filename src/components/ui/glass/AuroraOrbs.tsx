import { motion } from "framer-motion";
import type { GlassTheme } from "./glassTokens";

/**
 * Aurora Orbs — 3-4 размытых круга с radial-gradient,
 * плавное движение по Y: [-20, 20], duration 8-12s,
 * easeInOut, repeat: Infinity.
 */
export function AuroraOrbs({ theme = "dark" }: { theme?: GlassTheme }) {
  const dark = theme === "dark";

  const orbs = dark
    ? [
        {
          x: "10%",
          y: "10%",
          size: 400,
          colors: ["#00b4d8", "#0077b6", "transparent"],
          delay: 0,
          duration: 10,
        },
        {
          x: "70%",
          y: "20%",
          size: 350,
          colors: ["#00c896", "#0096c7", "transparent"],
          delay: 2,
          duration: 12,
        },
        {
          x: "40%",
          y: "60%",
          size: 450,
          colors: ["#0096c7", "#00b4d8", "transparent"],
          delay: 4,
          duration: 9,
        },
        {
          x: "85%",
          y: "70%",
          size: 320,
          colors: ["#0077b6", "#00c896", "transparent"],
          delay: 1,
          duration: 11,
        },
      ]
    : [
        {
          x: "10%",
          y: "10%",
          size: 400,
          colors: ["#67e8f9", "#0ea5e9", "transparent"],
          delay: 0,
          duration: 10,
        },
        {
          x: "70%",
          y: "20%",
          size: 350,
          colors: ["#6ee7b7", "#059669", "transparent"],
          delay: 2,
          duration: 12,
        },
        {
          x: "40%",
          y: "60%",
          size: 450,
          colors: ["#0ea5e9", "#67e8f9", "transparent"],
          delay: 4,
          duration: 9,
        },
        {
          x: "85%",
          y: "70%",
          size: 320,
          colors: ["#059669", "#6ee7b7", "transparent"],
          delay: 1,
          duration: 11,
        },
      ];

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
      {orbs.map((orb, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full blur-3xl will-change-transform"
          style={{
            left: orb.x,
            top: orb.y,
            width: orb.size,
            height: orb.size,
            background: `radial-gradient(circle at 30% 30%, ${orb.colors[0]}, ${orb.colors[1]}, ${orb.colors[2]})`,
          }}
          initial={{ opacity: 0 }}
          animate={{
            opacity: dark ? 0.45 : 0.55,
            y: [0, -20, 0, 20, 0],
          }}
          transition={{
            opacity: { duration: 1.5, delay: orb.delay },
            y: {
              duration: orb.duration,
              delay: orb.delay,
              repeat: Infinity,
              ease: "easeInOut",
            },
          }}
        />
      ))}
    </div>
  );
}
