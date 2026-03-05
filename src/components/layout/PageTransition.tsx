import { motion, AnimatePresence } from "framer-motion";
import { useLocation, useNavigationType } from "react-router-dom";
import { ReactNode } from "react";

interface PageTransitionProps {
  children: ReactNode;
}

export function PageTransition({ children }: PageTransitionProps) {
  const location = useLocation();
  const navigationType = useNavigationType();

  const getDirection = () => {
    if (navigationType === "POP") return "back";
    if (navigationType === "REPLACE") return "fade";
    return "forward";
  };

  const direction = getDirection();

  const variants = {
    forward: {
      initial: { x: "100%", opacity: 0.8 },
      animate: { x: 0, opacity: 1 },
      exit: { x: "-30%", opacity: 0.5 },
    },
    back: {
      initial: { x: "-30%", opacity: 0.5 },
      animate: { x: 0, opacity: 1 },
      exit: { x: "100%", opacity: 0.8 },
    },
    fade: {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
    },
  };

  const v = variants[direction];

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        initial={v.initial}
        animate={v.animate}
        exit={v.exit}
        transition={{
          type: "tween",
          duration: direction === "fade" ? 0.15 : 0.25,
          ease: [0.25, 0.1, 0.25, 1.0],
        }}
        className="h-full w-full"
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
