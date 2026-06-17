/**
 * Mansoni Create Studio — Premium Creation Operating System
 * "The control center of a billion-user ecosystem"
 *
 * Philosophy:
 * - Camera is the hero (95% of screen)
 * - Context appears only when needed
 * - One intelligent action: CREATE
 * - Tools are contextual, never visible by default
 * - Apple-level restraint, Tesla-level simplicity, Vision Pro-level depth
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useCreateStudio } from "./createStudioContext";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type Intent =
  | "share"
  | "sell"
  | "teach"
  | "show"
  | "broadcast"
  | "promote"
  | "launch"
  | "manage";

export type ContextType =
  | "property"
  | "product"
  | "person"
  | "event"
  | "document"
  | "service";

interface StatusIndicator {
  label: string;
  value: string;
  status: "active" | "idle" | "warning";
}

interface ContextCard {
  type: ContextType;
  title: string;
  subtitle: string;
  actions: string[];
}

// ─── Design Tokens ────────────────────────────────────────────────────────────

const T = {
  bg: "#020207",
  surface: "rgba(8,8,14,0.72)",
  surfaceHover: "rgba(14,16,24,0.85)",
  border: "rgba(255,255,255,0.07)",
  borderActive: "rgba(255,255,255,0.18)",
  textPrimary: "#FFFFFF",
  textSecondary: "rgba(255,255,255,0.55)",
  textMuted: "rgba(255,255,255,0.30)",
  accent: "#1E5EFF",
  accentGlow: "rgba(30,94,255,0.35)",
  createCore: "#1E5EFF",
  createCoreGlow: "rgba(30,94,255,0.50)",
  success: "#00D26A",
  warning: "#FFB547",
  contextProperty: "rgba(30,94,255,0.15)",
  contextProduct: "rgba(0,210,106,0.15)",
  contextPerson: "rgba(106,54,255,0.15)",
  contextEvent: "rgba(255,181,71,0.15)",
} as const;

// ─── Intent Definitions ───────────────────────────────────────────────────────

const INTENTS: { id: Intent; label: string; description: string }[] = [
  { id: "share", label: "Share", description: "Share a moment" },
  { id: "sell", label: "Sell", description: "List a product" },
  { id: "teach", label: "Teach", description: "Create a lesson" },
  { id: "show", label: "Show", description: "Demonstrate something" },
  { id: "broadcast", label: "Broadcast", description: "Go live" },
  { id: "promote", label: "Promote", description: "Run a campaign" },
  { id: "launch", label: "Launch", description: "Start something new" },
  { id: "manage", label: "Manage", description: "Control your empire" },
];

// ─── Context Tool Sets ────────────────────────────────────────────────────────

type ContextTool = { label: string; icon: string };
const CONTEXT_TOOLS: Partial<Record<ContextType, ContextTool[]>> = {
  property: [
    { label: "Rooms", icon: "◻" },
    { label: "Area", icon: "◼" },
    { label: "Price", icon: "◈" },
    { label: "Location", icon: "◎" },
    { label: "AR", icon: "◉" },
  ],
  product: [
    { label: "Price", icon: "◈" },
    { label: "Category", icon: "◻" },
    { label: "Inventory", icon: "◼" },
    { label: "Delivery", icon: "◎" },
  ],
  person: [
    { label: "Connect", icon: "◎" },
    { label: "Message", icon: "◈" },
    { label: "Schedule", icon: "◻" },
  ],
  event: [
    { label: "Date", icon: "◻" },
    { label: "Guests", icon: "◎" },
    { label: "Location", icon: "◎" },
  ],
  document: [
    { label: "Sign", icon: "◈" },
    { label: "Share", icon: "◎" },
    { label: "Archive", icon: "◻" },
  ],
  service: [
    { label: "Book", icon: "◻" },
    { label: "Price", icon: "◈" },
    { label: "Schedule", icon: "◼" },
  ],
};

// ─── Status Layer ─────────────────────────────────────────────────────────────

function StatusLayer({ indicators }: { indicators: StatusIndicator[] }) {
  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-3">
      {/* Left: status dots */}
      <div className="flex items-center gap-4">
        {indicators.map((ind) => (
          <div key={ind.label} className="flex items-center gap-1.5">
            <div
              className="w-1.5 h-1.5 rounded-full"
              style={{
                background:
                  ind.status === "active"
                    ? T.success
                    : ind.status === "warning"
                    ? T.warning
                    : "rgba(255,255,255,0.20)",
                boxShadow:
                  ind.status === "active"
                    ? `0 0 6px ${T.success}`
                    : ind.status === "warning"
                    ? `0 0 6px ${T.warning}`
                    : "none",
              }}
            />
            <span
              className="text-[10px] font-medium tracking-wide uppercase"
              style={{ color: T.textMuted }}
            >
              {ind.label}
            </span>
            <span
              className="text-[10px] font-medium"
              style={{ color: T.textSecondary }}
            >
              {ind.value}
            </span>
          </div>
        ))}
      </div>

      {/* Right: suggestion count */}
      <div className="flex items-center gap-2">
        <div
          className="w-px h-3"
          style={{ background: T.border }}
        />
        <span className="text-[10px]" style={{ color: T.textMuted }}>
          3 suggestions
        </span>
        <div
          className="w-1.5 h-1.5 rounded-full animate-pulse"
          style={{ background: T.accent, boxShadow: `0 0 6px ${T.accentGlow}` }}
        />
      </div>
    </div>
  );
}

// ─── Context Card ──────────────────────────────────────────────────────────────

function ContextCard({
  card,
  onDismiss,
}: {
  card: ContextCard;
  onDismiss: () => void;
}) {
  const tools = CONTEXT_TOOLS[card.type] || [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.98 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="fixed bottom-32 left-1/2 -translate-x-1/2 z-40 w-72"
    >
      <div
        className="rounded-2xl border backdrop-blur-2xl overflow-hidden"
        style={{
          background: T.surface,
          borderColor: T.border,
          backdropFilter: "blur(40px) saturate(180%)",
        }}
      >
        {/* Card header */}
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className="w-5 h-5 rounded-full"
                style={{
                  background:
                    card.type === "property"
                      ? T.accent
                      : card.type === "product"
                      ? T.success
                      : card.type === "person"
                      ? "rgba(106,54,255,1)"
                      : card.type === "event"
                      ? T.warning
                      : T.accent,
                  opacity: 0.8,
                }}
              />
              <span
                className="text-[10px] uppercase tracking-widest font-medium"
                style={{ color: T.textMuted }}
              >
                {card.type} detected
              </span>
            </div>
            <button
              onClick={onDismiss}
              className="w-6 h-6 rounded-lg flex items-center justify-center transition-colors hover:bg-white/5"
              style={{ color: T.textMuted }}
            >
              <span className="text-sm">×</span>
            </button>
          </div>
          <p className="text-sm font-semibold mt-2" style={{ color: T.textPrimary }}>
            {card.title}
          </p>
          <p className="text-xs mt-0.5" style={{ color: T.textSecondary }}>
            {card.subtitle}
          </p>
        </div>

        {/* Tools row */}
        {tools.length > 0 && (
          <div
            className="flex gap-1 px-4 pb-4"
          >
            {tools.map((tool) => (
              <button
                key={tool.label}
                className="flex-1 py-2 rounded-xl text-center text-[10px] font-medium transition-all duration-200 hover:scale-[1.03] active:scale-[0.98]"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: `1px solid ${T.border}`,
                  color: T.textSecondary,
                }}
              >
                {tool.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Creation Core ─────────────────────────────────────────────────────────────

function CreationCore({
  active,
  onActivate,
  onIntentSelect,
}: {
  active: boolean;
  onActivate: () => void;
  onIntentSelect: (intent: Intent) => void;
}) {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center pointer-events-none">
      {/* Intent Panel */}
      <AnimatePresence>
        {active && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="pointer-events-auto"
          >
            <div
              className="rounded-3xl border backdrop-blur-3xl p-6"
              style={{
                background: T.surface,
                borderColor: T.border,
                backdropFilter: "blur(60px) saturate(200%)",
                boxShadow: `0 40px 100px -20px rgba(0,0,0,0.7), 0 0 80px rgba(30,94,255,0.04)`,
              }}
            >
              <div className="grid grid-cols-4 gap-2 w-[400px]">
                {INTENTS.map((intent) => (
                  <button
                    key={intent.id}
                    onClick={() => onIntentSelect(intent.id)}
                    className="group flex flex-col items-center gap-2 py-5 rounded-2xl transition-all duration-200 hover:scale-[1.04] active:scale-[0.97]"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: `1px solid ${T.border}`,
                    }}
                  >
                    <span className="text-lg font-light" style={{ color: T.textPrimary }}>
                      {intent.label}
                    </span>
                    <span
                      className="text-[9px] uppercase tracking-widest"
                      style={{ color: T.textMuted }}
                    >
                      {intent.description}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* The CREATE button — only visible when panel is closed */}
      <AnimatePresence>
        {!active && (
          <motion.div
            initial={{ opacity: 0, scale: 0.88 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="pointer-events-auto"
          >
            <button
              onClick={onActivate}
              className="group relative flex flex-col items-center gap-3"
            >
              {/* Outer glow ring */}
              <div
                className="absolute -inset-8 rounded-full opacity-20 group-hover:opacity-35 transition-opacity duration-500"
                style={{
                  background: `radial-gradient(circle, ${T.createCoreGlow} 0%, transparent 70%)`,
                }}
              />

              {/* Core circle */}
              <div
                className="relative w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 group-hover:scale-105 group-active:scale-95"
                style={{
                  background: `radial-gradient(circle at 35% 35%, rgba(60,120,255,0.9), ${T.createCore})`,
                  boxShadow: `0 0 40px ${T.createCoreGlow}, 0 0 80px rgba(30,94,255,0.15), inset 0 1px 0 rgba(255,255,255,0.15)`,
                }}
              >
                {/* Inner highlight */}
                <div
                  className="absolute top-3 left-3 right-8 h-px rounded-full"
                  style={{
                    background: "linear-gradient(90deg, rgba(255,255,255,0.4), transparent)",
                  }}
                />
                <span
                  className="text-[10px] uppercase tracking-[0.2em] font-semibold"
                  style={{ color: T.textPrimary }}
                >
                  Create
                </span>
              </div>

              {/* Label */}
              <div className="text-center">
                <p
                  className="text-[11px] uppercase tracking-[0.25em] font-medium"
                  style={{ color: T.textSecondary }}
                >
                  Mansoni
                </p>
                <p
                  className="text-[9px] uppercase tracking-[0.15em] mt-0.5"
                  style={{ color: T.textMuted }}
                >
                  Studio
                </p>
              </div>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Close Button ─────────────────────────────────────────────────────────────

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      onClick={onClose}
      className="fixed top-4 right-4 z-50 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95"
      style={{
        background: T.surface,
        border: `1px solid ${T.border}`,
        backdropFilter: "blur(20px)",
        color: T.textSecondary,
      }}
    >
      <span className="text-lg leading-none">×</span>
    </button>
  );
}

// ─── Backdrop ──────────────────────────────────────────────────────────────────

function StudioBackdrop() {
  return (
    <div
      className="fixed inset-0 -z-10"
      style={{ background: T.bg }}
    >
      {/* Subtle grid */}
      <div
        className="absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(30,94,255,0.4) 1px, transparent 1px),
            linear-gradient(90deg, rgba(30,94,255,0.4) 1px, transparent 1px)
          `,
          backgroundSize: "120px 120px",
        }}
      />
      {/* Vignette */}
      <div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(ellipse at center, transparent 40%, rgba(2,2,7,0.6) 100%)",
        }}
      />
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────────

interface MansoniCreateStudioProps {
  onIntentSelect?: (intent: Intent) => void;
  onClose?: () => void;
}

export function MansoniCreateStudio({ onIntentSelect, onClose }: MansoniCreateStudioProps) {
  const { closeCreateStudio } = useCreateStudio();
  const [panelActive, setPanelActive] = useState(false);
  const [contextCard, setContextCard] = useState<ContextCard | null>(null);

  // Demo: simulate context detection after 2s
  useEffect(() => {
    const timer = setTimeout(() => {
      setContextCard({
        type: "property",
        title: "Apartment · 78 m²",
        subtitle: "Moscow, Tverskaya Street",
        actions: ["List", "Share", "AR Tour"],
      });
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  const handleActivate = useCallback(() => {
    setPanelActive(true);
  }, []);

  const handleIntentSelect = useCallback(
    (intent: Intent) => {
      setPanelActive(false);
      onIntentSelect?.(intent);
    },
    [onIntentSelect],
  );

  const handleClose = useCallback(() => {
    closeCreateStudio();
    onClose?.();
  }, [closeCreateStudio, onClose]);

  const indicators: StatusIndicator[] = [
    { label: "AI", value: "Analysis", status: "active" },
    { label: "Light", value: "72%", status: "active" },
    { label: "Audio", value: "Ready", status: "idle" },
    { label: "Conn", value: "4G", status: "warning" },
  ];

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden">
      <StudioBackdrop />
      <StatusLayer indicators={indicators} />
      <CloseButton onClose={handleClose} />

      {/* Camera surface — the hero */}
      <div
        className="absolute inset-0"
        style={{
          // Placeholder for camera — in real app this is the CameraHost
          background: "linear-gradient(180deg, #0a0a14 0%, #050508 50%, #020207 100%)",
        }}
      >
        {/* Camera grid placeholder */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)
            `,
            backgroundSize: "60px 60px",
          }}
        />
        {/* Center focus cross */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative w-32 h-32">
            <div className="absolute top-1/2 left-0 right-0 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
            <div className="absolute left-1/2 top-0 bottom-0 w-px" style={{ background: "rgba(255,255,255,0.08)" }} />
            <div
              className="absolute top-1/2 left-1/2 w-3 h-3 -mt-1.5 -ml-1.5 rounded-full"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}
            />
          </div>
        </div>
      </div>

      {/* Context Card */}
      <AnimatePresence>
        {contextCard && (
          <ContextCard
            card={contextCard}
            onDismiss={() => setContextCard(null)}
          />
        )}
      </AnimatePresence>

      {/* Creation Core */}
      <CreationCore
        active={panelActive}
        onActivate={handleActivate}
        onIntentSelect={handleIntentSelect}
      />
    </div>
  );
}

export default MansoniCreateStudio;
