/**
 * ReplyKeyboard — Telegram-style bot reply keyboard.
 *
 * Unlike InlineKeyboard (attached to message), ReplyKeyboard replaces
 * the regular keyboard with a grid of text buttons.
 *
 * Props come from bot message payload: reply_markup.keyboard[][]
 * Each button sends its text as a regular message.
 */

import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

export interface ReplyKeyboardButton {
  text: string;
  /** Request contact sharing */
  request_contact?: boolean;
  /** Request location sharing */
  request_location?: boolean;
}

interface ReplyKeyboardProps {
  /** 2D array of buttons — rows × columns */
  keyboard: ReplyKeyboardButton[][];
  /** Send button text as message */
  onButtonPress: (text: string, button: ReplyKeyboardButton) => void;
  /** Whether keyboard can be collapsed */
  resizable?: boolean;
  /** Whether keyboard disappears after one press */
  oneTime?: boolean;
  /** Placeholder text for input when keyboard is shown */
  inputPlaceholder?: string;
}

export function ReplyKeyboard({
  keyboard,
  onButtonPress,
  resizable = true,
  oneTime = false,
}: ReplyKeyboardProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: collapsed ? 40 : "auto", opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        className="border-t border-border/40 dark:border-white/10 bg-background/95 dark:bg-[#17212b]/95 backdrop-blur-sm overflow-hidden"
      >
        {/* Collapse/expand toggle */}
        {resizable && (
          <div className="flex justify-center py-1">
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="px-4 py-0.5 rounded-full hover:bg-muted dark:hover:bg-white/10 transition-colors"
            >
              {collapsed ? (
                <ChevronUp className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              )}
            </button>
          </div>
        )}

        {/* Keyboard grid */}
        {!collapsed && (
          <div className="px-2 pb-2 space-y-1.5">
            {keyboard.map((row, rowIdx) => (
              <div key={rowIdx} className="flex gap-1.5">
                {row.map((btn, colIdx) => (
                  <motion.button
                    key={`${rowIdx}-${colIdx}`}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => {
                      onButtonPress(btn.text, btn);
                      if (oneTime) setDismissed(true);
                    }}
                    className="flex-1 px-3 py-2.5 rounded-xl bg-muted dark:bg-white/10 hover:bg-muted/80 dark:hover:bg-white/15 text-sm font-medium text-foreground dark:text-white transition-colors text-center truncate"
                  >
                    {btn.request_contact && "👤 "}
                    {btn.request_location && "📍 "}
                    {btn.text}
                  </motion.button>
                ))}
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
