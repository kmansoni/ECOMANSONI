import { motion, AnimatePresence } from "framer-motion";
import { useLocation, useNavigationType } from "react-router-dom";
import { ReactNode, useRef } from "react";

interface PageTransitionProps {
  children: ReactNode;
}

// Основные вкладки нижнего таб-бара — при переключении между ними
// НЕ пересоздаём дерево компонентов (как в Telegram)
const TAB_ROUTES = new Set(["/", "/reels", "/notifications", "/chats", "/profile", "/ar"]);

export function PageTransition({ children }: PageTransitionProps) {
  const location = useLocation();
  const navigationType = useNavigationType();
  const prevPathRef = useRef(location.pathname);

  const isTab = TAB_ROUTES.has(location.pathname);
  const wasTab = TAB_ROUTES.has(prevPathRef.current);

  // Переключение между табами — стабильный ключ, без ремаунта
  // Вход/выход из глубокой страницы — анимация слайдом
  const transitionKey = isTab ? "__tabs__" : location.pathname;

  // Обновляем предыдущий путь после вычисления направления
  const isTabToTab = isTab && wasTab;

  const getDirection = () => {
    if (isTabToTab) return "none";
    if (navigationType === "POP") return "back";
    if (navigationType === "REPLACE") return "fade";
    return "forward";
  };

  const direction = getDirection();
  prevPathRef.current = location.pathname;

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
    none: {
      initial: {},
      animate: {},
      exit: {},
    },
  };

  const v = variants[direction];

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={transitionKey}
        initial={v.initial}
        animate={v.animate}
        exit={v.exit}
        transition={{
          type: "tween",
          duration: direction === "none" ? 0 : direction === "fade" ? 0.15 : 0.25,
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
