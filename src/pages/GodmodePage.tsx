import { useState, useRef, useEffect, useCallback } from "react"
import {
  Send, Trash2, Settings2, Zap, Skull, Brain, Sparkles, Trophy, ChevronDown,
  ThumbsUp, ThumbsDown, Loader2, Shield, Flame, Eye, Volume2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

// ── Types ──────────────────────────────────────────

type GodmodeTheme = "matrix" | "hacker" | "glyph" | "minimal"
type ChatMode = "chat" | "classic" | "ultraplinian" | "consortium"
type SpeedTier = "fast" | "standard" | "smart" | "power" | "ultra"

interface GodMessage {
  id: string
  role: "user" | "assistant"
  content: string
  ts: number
  mode?: ChatMode
  meta?: {
    model?: string
    score?: number
    duration_ms?: number
    tier?: string
    combo_id?: string
    combo_emoji?: string
    models_queried?: number
    models_succeeded?: number
    pipeline?: Record<string, unknown>
  }
}

interface RaceEntry {
  model: string
  score: number
  duration_ms: number
  success: boolean
  combo_id?: string
  emoji?: string
  name?: string
}

// ── Constants ──────────────────────────────────────

const API_BASE = "http://localhost:3077"

const THEME_CLASSES: Record<GodmodeTheme, { bg: string; text: string; accent: string; input: string; border: string; card: string }> = {
  matrix: {
    bg: "bg-black", text: "text-green-400", accent: "text-green-300",
    input: "bg-green-950/30 border-green-800 text-green-200 placeholder:text-green-700",
    border: "border-green-800/50", card: "bg-green-950/20",
  },
  hacker: {
    bg: "bg-gray-950", text: "text-orange-400", accent: "text-red-400",
    input: "bg-red-950/20 border-red-800 text-orange-200 placeholder:text-red-700",
    border: "border-red-800/50", card: "bg-red-950/15",
  },
  glyph: {
    bg: "bg-slate-950", text: "text-purple-300", accent: "text-violet-400",
    input: "bg-violet-950/20 border-violet-800 text-purple-200 placeholder:text-violet-700",
    border: "border-violet-800/50", card: "bg-violet-950/15",
  },
  minimal: {
    bg: "bg-white dark:bg-zinc-900", text: "text-zinc-800 dark:text-zinc-200", accent: "text-blue-600 dark:text-blue-400",
    input: "bg-zinc-100 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-600 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400",
    border: "border-zinc-200 dark:border-zinc-700", card: "bg-zinc-50 dark:bg-zinc-800/50",
  },
}

const MODE_ICONS: Record<ChatMode, typeof Zap> = {
  chat: Brain, classic: Flame, ultraplinian: Zap, consortium: Eye,
}

const MODE_LABELS: Record<ChatMode, string> = {
  chat: "Chat", classic: "Classic", ultraplinian: "Ultraplinian", consortium: "Consortium",
}

const TIER_INFO: Record<SpeedTier, { emoji: string; label: string; desc: string }> = {
  fast: { emoji: "⚡", label: "FAST", desc: "10 моделей" },
  standard: { emoji: "🎯", label: "STANDARD", desc: "24 модели" },
  smart: { emoji: "🧠", label: "SMART", desc: "36 моделей" },
  power: { emoji: "⚔️", label: "POWER", desc: "45 моделей" },
  ultra: { emoji: "🔱", label: "ULTRA", desc: "51+ моделей" },
}

// ── Konami code Easter Egg ─────────────────────────

const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"]

function useKonami(onActivate: () => void) {
  const idx = useRef(0)
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === KONAMI[idx.current]) {
        idx.current++
        if (idx.current === KONAMI.length) {
          idx.current = 0
          onActivate()
        }
      } else {
        idx.current = 0
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onActivate])
}

// ── Helpers ────────────────────────────────────────

let msgCounter = 0
function genId() { return `gm-${Date.now()}-${++msgCounter}` }

function stripMarkdown(s: string) {
  return s.replace(/```[\s\S]*?```/g, "[code]").replace(/`[^`]+`/g, "[code]").slice(0, 200)
}

async function godmodeRequest(path: string, body: Record<string, unknown>) {
  const apiKey = localStorage.getItem("godmode_openrouter_key") || ""
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, openrouter_api_key: apiKey }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

async function godmodeSSE(
  path: string, body: Record<string, unknown>,
  onEvent: (event: string, data: Record<string, unknown>) => void,
  signal?: AbortSignal,
) {
  const apiKey = localStorage.getItem("godmode_openrouter_key") || ""
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, openrouter_api_key: apiKey, stream: true }),
    signal,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buf = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split("\n")
    buf = lines.pop() || ""
    let currentEvent = ""
    for (const line of lines) {
      if (line.startsWith("event: ")) { currentEvent = line.slice(7).trim(); continue }
      if (line.startsWith("data: ") && currentEvent) {
        try {
          onEvent(currentEvent, JSON.parse(line.slice(6)))
        } catch { /* ignore parse errors */ }
        currentEvent = ""
      }
    }
  }
}

// ── Component ──────────────────────────────────────

export function GodmodePage() {
  const [messages, setMessages] = useState<GodMessage[]>(() => {
    try {
      const saved = localStorage.getItem("godmode_history")
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [theme, setTheme] = useState<GodmodeTheme>(() =>
    (localStorage.getItem("godmode_theme") as GodmodeTheme) || "matrix",
  )
  const [mode, setMode] = useState<ChatMode>("chat")
  const [tier, setTier] = useState<SpeedTier>("fast")
  const [showSettings, setShowSettings] = useState(false)
  const [apiKeyInput, setApiKeyInput] = useState(() => localStorage.getItem("godmode_openrouter_key") || "")
  const [autoTune, setAutoTune] = useState(true)
  const [godmodeBoost, setGodmodeBoost] = useState(true)
  const [parseltongue, setParseltongue] = useState(false)
  const [parseltongueIntensity, setParseltongueIntensity] = useState<"light" | "medium" | "heavy">("medium")
  const [raceResults, setRaceResults] = useState<RaceEntry[]>([])
  const [konamiActive, setKonamiActive] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const t = THEME_CLASSES[theme]

  // konami easter egg
  useKonami(useCallback(() => {
    setKonamiActive(true)
    toast.success("🎮 KONAMI CODE ACTIVATED! God among gods.", { duration: 5000 })
    setTimeout(() => setKonamiActive(false), 10000)
  }, []))

  // save history
  useEffect(() => {
    localStorage.setItem("godmode_history", JSON.stringify(messages.slice(-200)))
  }, [messages])

  // save theme
  useEffect(() => {
    localStorage.setItem("godmode_theme", theme)
  }, [theme])

  // scroll to bottom
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages])

  function saveApiKey() {
    localStorage.setItem("godmode_openrouter_key", apiKeyInput)
    toast.success("API key сохранён")
    setShowSettings(false)
  }

  function clearHistory() {
    setMessages([])
    localStorage.removeItem("godmode_history")
    toast.success("История очищена")
  }

  async function sendMessage() {
    const text = input.trim()
    if (!text || loading) return
    if (!localStorage.getItem("godmode_openrouter_key")) {
      toast.error("Сначала укажите OpenRouter API key в настройках")
      setShowSettings(true)
      return
    }

    setInput("")
    const userMsg: GodMessage = { id: genId(), role: "user", content: text, ts: Date.now() }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)
    setRaceResults([])

    // Parseltongue — обфусцируем ввод для red-teaming
    let finalText = text
    if (parseltongue) {
      try {
        const pt = await godmodeRequest("/v1/parseltongue/transform", {
          text, intensity: parseltongueIntensity,
        })
        finalText = pt.transformed || text
        if (pt.triggers_found?.length) {
          toast.info(`🐍 Parseltongue: ${pt.triggers_found.length} triggers → ${pt.techniques_applied.join(", ")}`)
        }
      } catch { /* fallback to original */ }
    }

    const chatMessages = [
      ...messages.filter(m => m.role === "user" || m.role === "assistant").slice(-10).map(m => ({
        role: m.role, content: m.content,
      })),
      { role: "user" as const, content: finalText },
    ]

    const controller = new AbortController()
    abortRef.current = controller

    try {
      switch (mode) {
        case "chat": {
          const data = await godmodeRequest("/v1/chat/completions", {
            messages: chatMessages, autotune: autoTune, godmode: godmodeBoost,
          })
          const content = data.choices?.[0]?.message?.content || data.response || ""
          setMessages(prev => [...prev, {
            id: genId(), role: "assistant", content, ts: Date.now(), mode,
            meta: {
              model: data.model || data.x_godmode?.model,
              score: data.x_godmode?.score,
              duration_ms: data.x_godmode?.duration_ms,
              pipeline: data.x_godmode?.pipeline,
            },
          }])
          break
        }

        case "classic": {
          const entries: RaceEntry[] = []
          let finalContent = ""
          let finalMeta: GodMessage["meta"] = {}

          await godmodeSSE("/v1/classic/completions", {
            messages: chatMessages,
          }, (event, d) => {
            if (event === "classic:model") {
              entries.push({
                model: d.model as string, score: d.score as number,
                duration_ms: d.duration_ms as number, success: d.success as boolean,
                combo_id: d.combo_id as string, emoji: d.emoji as string,
                name: d.name as string,
              })
              setRaceResults([...entries])
            }
            if (event === "classic:complete") {
              finalContent = d.response as string
              const w = d.winner as Record<string, unknown> | null
              finalMeta = {
                model: w?.model as string,
                score: w?.score as number,
                duration_ms: w?.duration_ms as number,
                combo_id: w?.combo_id as string,
                combo_emoji: w?.emoji as string,
              }
            }
          }, controller.signal)

          setMessages(prev => [...prev, {
            id: genId(), role: "assistant", content: finalContent, ts: Date.now(), mode,
            meta: finalMeta,
          }])
          break
        }

        case "ultraplinian": {
          const entries: RaceEntry[] = []
          let finalContent = ""
          let finalMeta: GodMessage["meta"] = {}

          await godmodeSSE("/v1/ultraplinian/completions", {
            messages: chatMessages, tier, autotune: autoTune, godmode: godmodeBoost,
          }, (event, d) => {
            if (event === "race:model") {
              entries.push({
                model: d.model as string, score: d.score as number,
                duration_ms: d.duration_ms as number, success: d.success as boolean,
              })
              setRaceResults([...entries])
            }
            if (event === "race:complete") {
              finalContent = d.response as string
              const w = d.winner as Record<string, unknown>
              finalMeta = {
                model: w?.model as string, score: w?.score as number,
                duration_ms: w?.duration_ms as number,
                tier, models_queried: (d.race as Record<string, unknown>)?.models_queried as number,
                models_succeeded: (d.race as Record<string, unknown>)?.models_succeeded as number,
              }
            }
          }, controller.signal)

          setMessages(prev => [...prev, {
            id: genId(), role: "assistant", content: finalContent, ts: Date.now(), mode,
            meta: finalMeta,
          }])
          break
        }

        case "consortium": {
          const entries: RaceEntry[] = []
          let finalContent = ""
          let finalMeta: GodMessage["meta"] = {}

          await godmodeSSE("/v1/consortium/completions", {
            messages: chatMessages, tier, autotune: autoTune, godmode: godmodeBoost,
          }, (event, d) => {
            if (event === "consortium:model") {
              entries.push({
                model: d.model as string, score: d.score as number,
                duration_ms: d.duration_ms as number, success: d.success as boolean,
              })
              setRaceResults([...entries])
            }
            if (event === "consortium:complete") {
              finalContent = d.response as string
              const coll = d.collection as Record<string, unknown>
              finalMeta = {
                tier, models_queried: coll?.total_models as number,
                models_succeeded: coll?.succeeded as number,
                duration_ms: (d.synthesis as Record<string, unknown>)?.duration_ms as number,
                model: (d.synthesis as Record<string, unknown>)?.model as string,
              }
            }
          }, controller.signal)

          setMessages(prev => [...prev, {
            id: genId(), role: "assistant", content: finalContent, ts: Date.now(), mode,
            meta: finalMeta,
          }])
          break
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        toast.error(`Ошибка: ${(err as Error).message}`)
      }
    } finally {
      setLoading(false)
      abortRef.current = null
    }
  }

  function stopGeneration() {
    abortRef.current?.abort()
    setLoading(false)
  }

  async function sendFeedback(msgId: string, rating: number) {
    const msg = messages.find(m => m.id === msgId)
    if (!msg?.meta) return
    try {
      await godmodeRequest("/v1/feedback", {
        context: "conversational", rating,
        model: msg.meta.model, response_id: msgId,
      })
      toast.success(rating > 0.5 ? "👍 Спасибо!" : "👎 Учтём")
    } catch { /* silent */ }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // ── Render ─────────────────────────────────────

  return (
    <div className={cn("flex flex-col h-screen", t.bg, t.text)}>
      {/* Konami overlay */}
      {konamiActive && (
        <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center">
          <div className="text-6xl animate-pulse">🜏</div>
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-green-500/5 to-transparent animate-pulse" />
        </div>
      )}

      {/* Header */}
      <header className={cn("flex items-center gap-3 px-4 py-3 border-b", t.border)}>
        <div className="flex items-center gap-2">
          <Skull className="w-6 h-6" />
          <span className="font-mono font-bold text-lg tracking-wider">G0DM0D3</span>
          <Badge variant="outline" className={cn("text-[10px] font-mono", t.accent)}>v2.0</Badge>
        </div>

        <div className="flex-1" />

        {/* Mode selector */}
        <div className="flex gap-1">
          {(["chat", "classic", "ultraplinian", "consortium"] as ChatMode[]).map(m => {
            const Icon = MODE_ICONS[m]
            return (
              <Button
                key={m}
                size="sm"
                variant={mode === m ? "default" : "ghost"}
                className={cn("text-xs gap-1 font-mono", mode === m && "shadow-lg")}
                onClick={() => setMode(m)}
              >
                <Icon className="w-3.5 h-3.5" />
                {MODE_LABELS[m]}
              </Button>
            )
          })}
        </div>

        <div className="flex gap-1">
          <Button size="icon" variant="ghost" onClick={() => setShowSettings(!showSettings)}>
            <Settings2 className="w-4 h-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={clearHistory}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </header>

      {/* Settings panel */}
      {showSettings && (
        <div className={cn("px-4 py-3 border-b space-y-3", t.border, t.card)}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* API Key */}
            <div className="space-y-1">
              <label className="text-xs font-mono opacity-70">OpenRouter API Key</label>
              <div className="flex gap-1">
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={e => setApiKeyInput(e.target.value)}
                  placeholder="sk-or-..."
                  className={cn("flex-1 rounded px-2 py-1.5 text-xs border font-mono", t.input)}
                />
                <Button size="sm" onClick={saveApiKey}>Save</Button>
              </div>
            </div>

            {/* Theme */}
            <div className="space-y-1">
              <label className="text-xs font-mono opacity-70">Тема</label>
              <Select value={theme} onValueChange={v => setTheme(v as GodmodeTheme)}>
                <SelectTrigger className={cn("h-8 text-xs font-mono", t.input)}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="matrix">🟢 Matrix</SelectItem>
                  <SelectItem value="hacker">🔴 Hacker</SelectItem>
                  <SelectItem value="glyph">🟣 Glyph</SelectItem>
                  <SelectItem value="minimal">⚪ Minimal</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Tier (для ultraplinian/consortium) */}
            {(mode === "ultraplinian" || mode === "consortium") && (
              <div className="space-y-1">
                <label className="text-xs font-mono opacity-70">Тир моделей</label>
                <Select value={tier} onValueChange={v => setTier(v as SpeedTier)}>
                  <SelectTrigger className={cn("h-8 text-xs font-mono", t.input)}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TIER_INFO).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v.emoji} {v.label} — {v.desc}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Toggles */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono">AutoTune</span>
                <Switch checked={autoTune} onCheckedChange={setAutoTune} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono">GODMODE Boost</span>
                <Switch checked={godmodeBoost} onCheckedChange={setGodmodeBoost} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono">🐍 Parseltongue</span>
                <Switch checked={parseltongue} onCheckedChange={setParseltongue} />
              </div>
              {parseltongue && (
                <Select value={parseltongueIntensity} onValueChange={v => setParseltongueIntensity(v as "light" | "medium" | "heavy")}>
                  <SelectTrigger className={cn("h-7 text-[10px] font-mono", t.input)}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">🟢 Light (11 triggers)</SelectItem>
                    <SelectItem value="medium">🟡 Medium (22 triggers)</SelectItem>
                    <SelectItem value="heavy">🔴 Heavy (33 triggers)</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Race scoreboard */}
      {raceResults.length > 0 && (mode === "ultraplinian" || mode === "classic" || mode === "consortium") && (
        <div className={cn("px-4 py-2 border-b overflow-x-auto", t.border, t.card)}>
          <div className="flex gap-2 min-w-max">
            {raceResults
              .sort((a, b) => b.score - a.score)
              .slice(0, 10)
              .map((r, i) => (
                <div
                  key={`${r.model}-${i}`}
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono border",
                    t.border,
                    i === 0 && "ring-1 ring-yellow-500/50",
                  )}
                >
                  {i === 0 && <Trophy className="w-3 h-3 text-yellow-500" />}
                  {r.emoji && <span>{r.emoji}</span>}
                  <span className="opacity-70">{r.model.split("/").pop()}</span>
                  <Badge variant="outline" className="text-[9px] h-4">
                    {r.score}
                  </Badge>
                  <span className="opacity-50">{r.duration_ms}ms</span>
                  {!r.success && <span className="text-red-500">✗</span>}
                </div>
              ))}
            {loading && (
              <div className="flex items-center gap-1 px-2 py-1 text-[10px] font-mono opacity-50">
                <Loader2 className="w-3 h-3 animate-spin" />
                racing...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Messages */}
      <ScrollArea className="flex-1 px-4" ref={scrollRef}>
        <div className="max-w-4xl mx-auto py-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 opacity-40 space-y-3">
              <Skull className="w-16 h-16" />
              <span className="font-mono text-lg tracking-widest">G0DM0D3</span>
              <span className="font-mono text-xs">Multi-model AI gateway • {MODE_LABELS[mode]} mode</span>
              {mode === "classic" && (
                <span className="font-mono text-[10px]">5 provenных комбо гонят параллельно</span>
              )}
              {mode === "ultraplinian" && (
                <span className="font-mono text-[10px]">
                  {TIER_INFO[tier].emoji} {TIER_INFO[tier].label} — {TIER_INFO[tier].desc} racing
                </span>
              )}
              {mode === "consortium" && (
                <span className="font-mono text-[10px]">Hive-mind synthesis: все модели → один ответ</span>
              )}
            </div>
          )}

          {messages.map(msg => (
            <div key={msg.id} className={cn("flex gap-3", msg.role === "user" && "flex-row-reverse")}>
              <div className={cn(
                "max-w-[85%] rounded-lg px-4 py-3 font-mono text-sm",
                msg.role === "user"
                  ? cn("bg-opacity-20 border", t.border, t.card)
                  : cn(t.card, "border", t.border),
              )}>
                {/* Message content */}
                <div className="whitespace-pre-wrap break-words leading-relaxed">
                  {msg.content || (loading && msg.role === "assistant" ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : null)}
                </div>

                {/* Meta info */}
                {msg.meta && (
                  <div className="flex items-center gap-2 mt-2 pt-2 border-t border-current/10">
                    {msg.meta.combo_emoji && <span>{msg.meta.combo_emoji}</span>}
                    {msg.meta.model && (
                      <span className="text-[10px] opacity-50">{msg.meta.model}</span>
                    )}
                    {msg.meta.score != null && (
                      <Badge variant="outline" className="text-[9px] h-4">{msg.meta.score}</Badge>
                    )}
                    {msg.meta.duration_ms && (
                      <span className="text-[10px] opacity-40">{msg.meta.duration_ms}ms</span>
                    )}
                    {msg.meta.models_queried && (
                      <span className="text-[10px] opacity-40">
                        {msg.meta.models_succeeded}/{msg.meta.models_queried} models
                      </span>
                    )}
                    {msg.mode && (
                      <Badge variant="outline" className="text-[9px] h-4 font-mono">
                        {MODE_LABELS[msg.mode]}
                      </Badge>
                    )}
                  </div>
                )}

                {/* Feedback */}
                {msg.role === "assistant" && msg.content && (
                  <div className="flex gap-1 mt-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => sendFeedback(msg.id, 1)}
                    >
                      <ThumbsUp className="w-3 h-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => sendFeedback(msg.id, 0)}
                    >
                      <ThumbsDown className="w-3 h-3" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className={cn("px-4 py-3 border-t", t.border)}>
        <div className="max-w-4xl mx-auto flex gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Сообщение ${MODE_LABELS[mode]}...`}
            disabled={loading}
            rows={1}
            className={cn("flex-1 resize-none min-h-[42px] max-h-[200px] font-mono text-sm", t.input)}
          />
          {loading ? (
            <Button onClick={stopGeneration} variant="destructive" size="icon" className="shrink-0">
              <Loader2 className="w-4 h-4 animate-spin" />
            </Button>
          ) : (
            <Button onClick={sendMessage} size="icon" className="shrink-0" disabled={!input.trim()}>
              <Send className="w-4 h-4" />
            </Button>
          )}
        </div>
        <div className="max-w-4xl mx-auto flex items-center gap-2 mt-1.5 text-[10px] font-mono opacity-40">
          <span>{MODE_LABELS[mode]}</span>
          {(mode === "ultraplinian" || mode === "consortium") && (
            <span>• {TIER_INFO[tier].emoji} {TIER_INFO[tier].label}</span>
          )}
          {autoTune && <span>• AutoTune</span>}
          {godmodeBoost && <span>• GODMODE</span>}
          {parseltongue && <span>• 🐍 Parseltongue ({parseltongueIntensity})</span>}
        </div>
      </div>
    </div>
  )
}

export default GodmodePage
