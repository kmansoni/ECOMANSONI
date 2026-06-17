import { useCallback, useEffect, useRef, useState } from "react";
import {
  Aperture,
  Camera,
  ChevronDown,
  ChevronUp,
  Circle,
  Focus,
  Grid3X3,
  Moon,
  Move3D,
  RefreshCw,
  Settings2,
  Snowflake,
  Sun,
  Thermometer,
  Timer,
  ToggleLeft,
  ToggleRight,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  ExposureMode,
  FocusMode,
  GridOverlay,
  ProCameraSettings,
  WhiteBalanceMode,
} from "./CameraHost";

interface ProControlsPanelProps {
  settings: ProCameraSettings;
  onSettingsChange: (settings: Partial<ProCameraSettings>) => void;
  onClose: () => void;
  videoMode?: "normal" | "slowmo" | "timelapse" | "cinematic";
  className?: string;
}

// Wheel control for numeric values
interface WheelControlProps {
  value: number;
  min: number;
  max: number;
  step: number;
  label: string;
  icon: React.ReactNode;
  format?: (value: number) => string;
  onChange: (value: number) => void;
}

function WheelControl({
  value,
  min,
  max,
  step,
  label,
  icon,
  format = (v) => String(v),
  onChange,
}: WheelControlProps) {
  const [isDragging, setIsDragging] = useState(false);
  const startYRef = useRef(0);
  const startValueRef = useRef(0);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      setIsDragging(true);
      startYRef.current = e.clientY;
      startValueRef.current = value;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [value]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging) return;

      const delta = startYRef.current - e.clientY;
      const range = max - min;
      const sensitivity = e.shiftKey ? 0.1 : 0.5; // Fine control with Shift
      const deltaValue = (delta * range * sensitivity) / 200;

      let newValue = startValueRef.current + deltaValue;
      newValue = Math.round(newValue / step) * step;
      newValue = Math.max(min, Math.min(max, newValue));

      if (newValue !== value) {
        onChange(newValue);
      }
    },
    [isDragging, min, max, step, value, onChange]
  );

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const increment = useCallback(() => {
    const newValue = Math.min(max, value + step);
    onChange(newValue);
  }, [value, max, step, onChange]);

  const decrement = useCallback(() => {
    const newValue = Math.max(min, value - step);
    onChange(newValue);
  }, [value, min, step, onChange]);

  return (
    <div className="flex items-center gap-2">
      <span className="w-6 h-6 flex items-center justify-center text-white/60">
        {icon}
      </span>
      <span className="text-xs text-white/60 w-16">{label}</span>
      <div className="flex-1 flex items-center justify-center">
        <button
          onClick={decrement}
          className="w-8 h-8 flex items-center justify-center text-white/80 hover:text-white"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
        <div
          className={cn(
            "w-20 h-10 flex items-center justify-center rounded-lg cursor-grab active:cursor-grabbing select-none",
            "bg-white/10 hover:bg-white/20 transition-colors",
            isDragging && "bg-white/20 cursor-grabbing"
          )}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <span className="text-sm font-mono text-white">
            {format(value)}
          </span>
        </div>
        <button
          onClick={increment}
          className="w-8 h-8 flex items-center justify-center text-white/80 hover:text-white"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// Segment control for enum values
interface SegmentControlProps<T extends string> {
  value: T;
  options: Array<{ value: T; label: string; icon?: React.ReactNode }>;
  onChange: (value: T) => void;
}

function SegmentControl<T extends string>({
  value,
  options,
  onChange,
}: SegmentControlProps<T>) {
  return (
    <div className="flex gap-1 bg-black/40 rounded-lg p-1">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "flex items-center gap-1 px-2 py-1.5 rounded-md text-xs transition-colors",
            value === option.value
              ? "bg-white text-black font-medium"
              : "text-white/70 hover:text-white hover:bg-white/10"
          )}
        >
          {option.icon}
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  );
}

// Toggle row
interface ToggleRowProps {
  label: string;
  icon: React.ReactNode;
  value: boolean;
  onChange: (value: boolean) => void;
}

function ToggleRow({ label, icon, value, onChange }: ToggleRowProps) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="flex items-center gap-3 w-full px-2 py-2 rounded-lg hover:bg-white/10 transition-colors"
    >
      <span className="w-6 h-6 flex items-center justify-center text-white/60">
        {icon}
      </span>
      <span className="flex-1 text-left text-sm text-white">{label}</span>
      {value ? (
        <ToggleRight className="w-5 h-5 text-cyan-400" />
      ) : (
        <ToggleLeft className="w-5 h-5 text-white/40" />
      )}
    </button>
  );
}

export function ProControlsPanel({
  settings,
  onSettingsChange,
  onClose,
  videoMode = "normal",
  className,
}: ProControlsPanelProps) {
  const [activeTab, setActiveTab] = useState<"exposure" | "focus" | "overlay" | "video">(
    "exposure"
  );

  // ISO presets (common values)
  const isoOptions = [50, 100, 200, 400, 800, 1600, 3200, 6400];

  // Shutter speed options (fractions of a second)
  const shutterOptions = [
    { value: 1 / 8000, label: "1/8000" },
    { value: 1 / 4000, label: "1/4000" },
    { value: 1 / 2000, label: "1/2000" },
    { value: 1 / 1000, label: "1/1000" },
    { value: 1 / 500, label: "1/500" },
    { value: 1 / 250, label: "1/250" },
    { value: 1 / 125, label: "1/125" },
    { value: 1 / 60, label: "1/60" },
    { value: 1 / 30, label: "1/30" },
    { value: 1 / 15, label: "1/15" },
    { value: 1 / 8, label: "1/8" },
    { value: 1 / 4, label: "1/4" },
    { value: 1 / 2, label: "1/2" },
    { value: 1, label: "1s" },
    { value: 2, label: "2s" },
  ];

  // White balance kelvin presets
  const wbPresets: Array<{ value: WhiteBalanceMode; kelvin: number; label: string; icon: React.ReactNode }> = [
    { value: "auto", kelvin: 5500, label: "Auto", icon: <RefreshCw className="w-4 h-4" /> },
    { value: "sunny", kelvin: 5500, label: "Sunny", icon: <Sun className="w-4 h-4" /> },
    { value: "cloudy", kelvin: 6500, label: "Cloudy", icon: <CloudIcon className="w-4 h-4" /> },
    { value: "shade", kelvin: 7500, label: "Shade", icon: <Moon className="w-4 h-4" /> },
    { value: "tungsten", kelvin: 3200, label: "Tungsten", icon: <Thermometer className="w-4 h-4" /> },
    { value: "fluorescent", kelvin: 4000, label: "Fluorescent", icon: <Zap className="w-4 h-4" /> },
  ];

  const gridOptions: Array<{ value: GridOverlay; label: string; icon: React.ReactNode }> = [
    { value: "none", label: "Off", icon: <GridOffIcon className="w-4 h-4" /> },
    { value: "rule-of-thirds", label: "3x3", icon: <Grid3X3 className="w-4 h-4" /> },
    { value: "golden-ratio", label: "Phi", icon: <Move3D className="w-4 h-4" /> },
    { value: "diagonal", label: "Diag", icon: <DiagonalIcon className="w-4 h-4" /> },
    { value: "square", label: "Box", icon: <Camera className="w-4 h-4" /> },
  ];

  return (
    <div className={cn("bg-black/90 backdrop-blur-xl rounded-2xl border border-white/10 p-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Aperture className="w-5 h-5 text-cyan-400" />
          <span className="text-white font-medium">Pro Mode</span>
          {videoMode !== "normal" && (
            <span className="text-xs bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded-full capitalize">
              {videoMode}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white/80"
        >
          <span className="text-lg">&times;</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-black/40 rounded-lg p-1">
        {[
          { id: "exposure", label: "Exposure", icon: <Zap className="w-4 h-4" /> },
          { id: "focus", label: "Focus", icon: <Focus className="w-4 h-4" /> },
          { id: "overlay", label: "Grid", icon: <Grid3X3 className="w-4 h-4" /> },
          { id: "video", label: "Video", icon: <Timer className="w-4 h-4" /> },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors",
              activeTab === tab.id
                ? "bg-white text-black font-medium"
                : "text-white/70 hover:text-white hover:bg-white/10"
            )}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="space-y-4">
        {activeTab === "exposure" && (
          <>
            {/* Exposure Mode */}
            <div className="space-y-2">
              <span className="text-xs text-white/50 uppercase tracking-wide">Mode</span>
              <SegmentControl
                value={settings.exposureMode}
                options={[
                  { value: "auto", label: "Auto", icon: <RefreshCw className="w-4 h-4" /> },
                  { value: "shutter-priority", label: "S", icon: <Timer className="w-4 h-4" /> },
                  { value: "aperture-priority", label: "A", icon: <Aperture className="w-4 h-4" /> },
                  { value: "manual", label: "M", icon: <Settings2 className="w-4 h-4" /> },
                ]}
                onChange={(v) => onSettingsChange({ exposureMode: v })}
              />
            </div>

            {/* ISO (in manual modes) */}
            {(settings.exposureMode === "manual" || settings.exposureMode === "shutter-priority") && (
              <div className="space-y-2">
                <span className="text-xs text-white/50 uppercase tracking-wide">ISO</span>
                <div className="flex gap-1 flex-wrap">
                  {isoOptions.map((iso) => (
                    <button
                      key={iso}
                      onClick={() => onSettingsChange({ iso })}
                      className={cn(
                        "px-3 py-1.5 rounded-md text-xs font-mono transition-colors",
                        settings.iso === iso
                          ? "bg-cyan-500 text-white"
                          : "bg-white/10 text-white/70 hover:bg-white/20"
                      )}
                    >
                      {iso}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Shutter Speed (in manual and shutter priority modes) */}
            {(settings.exposureMode === "manual" || settings.exposureMode === "shutter-priority") && (
              <div className="space-y-2">
                <span className="text-xs text-white/50 uppercase tracking-wide">Shutter</span>
                <div className="flex gap-1 flex-wrap">
                  {shutterOptions.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => onSettingsChange({ shutterSpeed: opt.value })}
                      className={cn(
                        "px-2 py-1.5 rounded-md text-xs font-mono transition-colors",
                        settings.shutterSpeed === opt.value
                          ? "bg-cyan-500 text-white"
                          : "bg-white/10 text-white/70 hover:bg-white/20"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* White Balance */}
            <div className="space-y-2">
              <span className="text-xs text-white/50 uppercase tracking-wide">White Balance</span>
              <div className="flex gap-1 flex-wrap">
                {wbPresets.map((preset) => (
                  <button
                    key={preset.value}
                    onClick={() =>
                      onSettingsChange({
                        whiteBalanceMode: preset.value,
                        whiteBalanceKelvin: preset.kelvin,
                      })
                    }
                    className={cn(
                      "flex items-center gap-1 px-2 py-1.5 rounded-md text-xs transition-colors",
                      settings.whiteBalanceMode === preset.value
                        ? "bg-cyan-500 text-white"
                        : "bg-white/10 text-white/70 hover:bg-white/20"
                    )}
                  >
                    {preset.icon}
                    <span>{preset.label}</span>
                  </button>
                ))}
              </div>

              {/* Custom Kelvin */}
              {(settings.whiteBalanceMode === "custom" || settings.whiteBalanceMode === "auto") && (
                <WheelControl
                  value={settings.whiteBalanceKelvin}
                  min={2500}
                  max={10000}
                  step={100}
                  label="K"
                  icon={<Thermometer className="w-4 h-4" />}
                  format={(v) => `${v}K`}
                  onChange={(v) => onSettingsChange({ whiteBalanceKelvin: v, whiteBalanceMode: "custom" })}
                />
              )}
            </div>

            {/* Exposure Compensation */}
            <WheelControl
              value={settings.exposureCompensation}
              min={-3}
              max={3}
              step={0.3}
              label="EV"
              icon={<Zap className="w-4 h-4" />}
              format={(v) => (v >= 0 ? `+${v.toFixed(1)}` : v.toFixed(1))}
              onChange={(v) => onSettingsChange({ exposureCompensation: v })}
            />

            {/* Toggles */}
            <div className="space-y-1 pt-2 border-t border-white/10">
              <ToggleRow
                label="Night Mode"
                icon={<Moon className="w-4 h-4" />}
                value={settings.nightMode}
                onChange={(v) => onSettingsChange({ nightMode: v })}
              />
              <ToggleRow
                label="HDR"
                icon={<Circle className="w-4 h-4" />}
                value={settings.hdrMode}
                onChange={(v) => onSettingsChange({ hdrMode: v })}
              />
            </div>
          </>
        )}

        {activeTab === "focus" && (
          <>
            {/* Focus Mode */}
            <div className="space-y-2">
              <span className="text-xs text-white/50 uppercase tracking-wide">Focus Mode</span>
              <SegmentControl
                value={settings.focusMode}
                options={[
                  { value: "auto", label: "AF-S", icon: <Focus className="w-4 h-4" /> },
                  { value: "continuous", label: "AF-C", icon: <RefreshCw className="w-4 h-4" /> },
                  { value: "manual", label: "MF", icon: <Settings2 className="w-4 h-4" /> },
                ]}
                onChange={(v) => onSettingsChange({ focusMode: v as FocusMode })}
              />
            </div>

            {/* Manual Focus Distance */}
            {settings.focusMode === "manual" && (
              <WheelControl
                value={settings.focusDistance * 100}
                min={0}
                max={100}
                step={1}
                label="Focus"
                icon={<Move3D className="w-4 h-4" />}
                format={(v) => (v === 0 ? "Near" : v === 100 ? "Inf" : `${v}%`)}
                onChange={(v) => onSettingsChange({ focusDistance: v / 100 })}
              />
            )}

            {/* Focus Lock */}
            <div className="space-y-1 pt-2 border-t border-white/10">
              <ToggleRow
                label="Lock Focus"
                icon={<Focus className="w-4 h-4" />}
                value={settings.focusLock}
                onChange={(v) => onSettingsChange({ focusLock: v })}
              />
              <ToggleRow
                label="Lock AE/AF"
                icon={<Zap className="w-4 h-4" />}
                value={settings.touchAELock}
                onChange={(v) => onSettingsChange({ touchAELock: v })}
              />
            </div>

            {/* Focus Peaking */}
            <div className="space-y-1 pt-2 border-t border-white/10">
              <ToggleRow
                label="Focus Peaking"
                icon={<Circle className="w-4 h-4" />}
                value={settings.showFocusPeaking}
                onChange={(v) => onSettingsChange({ showFocusPeaking: v })}
              />
            </div>
          </>
        )}

        {activeTab === "overlay" && (
          <>
            {/* Grid Overlay */}
            <div className="space-y-2">
              <span className="text-xs text-white/50 uppercase tracking-wide">Grid</span>
              <div className="flex gap-1 flex-wrap">
                {gridOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => onSettingsChange({ gridOverlay: opt.value })}
                    className={cn(
                      "flex items-center gap-1 px-2 py-1.5 rounded-md text-xs transition-colors",
                      settings.gridOverlay === opt.value
                        ? "bg-cyan-500 text-white"
                        : "bg-white/10 text-white/70 hover:bg-white/20"
                    )}
                  >
                    {opt.icon}
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Level */}
            <ToggleRow
              label="Level"
              icon={<Move3D className="w-4 h-4" />}
              value={settings.showLevel}
              onChange={(v) => onSettingsChange({ showLevel: v })}
            />

            {/* Histogram */}
            <ToggleRow
              label="Histogram"
              icon={<Grid3X3 className="w-4 h-4" />}
              value={settings.showHistogram}
              onChange={(v) => onSettingsChange({ showHistogram: v })}
            />

            {/* Zebra Stripes */}
            <ToggleRow
              label="Zebra Stripes"
              icon={<Snowflake className="w-4 h-4" />}
              value={settings.showZebraStripes}
              onChange={(v) => onSettingsChange({ showZebraStripes: v })}
            />
          </>
        )}

        {activeTab === "video" && (
          <>
            {/* Stabilization */}
            <div className="space-y-2">
              <span className="text-xs text-white/50 uppercase tracking-wide">Stabilization</span>
              <SegmentControl
                value={settings.stabilizationMode}
                options={[
                  { value: "off", label: "Off" },
                  { value: "standard", label: "Standard" },
                  { value: "cinematic", label: "Cinema" },
                ]}
                onChange={(v) => onSettingsChange({ stabilizationMode: v as ProCameraSettings["stabilizationMode"] })}
              />
            </div>

            {/* Video Modes */}
            <div className="space-y-2 pt-2 border-t border-white/10">
              <span className="text-xs text-white/50 uppercase tracking-wide">Video Mode</span>
              <SegmentControl
                value={videoMode}
                options={[
                  { value: "normal", label: "Normal" },
                  { value: "slowmo", label: "Slow-Mo" },
                  { value: "timelapse", label: "Timelapse" },
                  { value: "cinematic", label: "Cinema" },
                ]}
                onChange={() => {}} // Handled by parent
              />
            </div>
          </>
        )}
      </div>

      {/* Reset Button */}
      <button
        onClick={() =>
          onSettingsChange({
            exposureMode: "auto",
            iso: 100,
            shutterSpeed: 1 / 125,
            whiteBalanceMode: "auto",
            whiteBalanceKelvin: 5500,
            exposureCompensation: 0,
            focusMode: "continuous",
            focusDistance: 0,
            exposureLock: false,
            focusLock: false,
            whiteBalanceLock: false,
            hdrMode: false,
            nightMode: false,
            stabilizationMode: "standard",
            gridOverlay: "none",
            showHistogram: false,
            showFocusPeaking: false,
            showZebraStripes: false,
            showLevel: false,
            touchAELock: false,
            touchAFPoint: null,
          })
        }
        className="w-full mt-4 py-2 rounded-lg bg-white/10 text-white/70 hover:bg-white/20 text-sm transition-colors"
      >
        Reset to Defaults
      </button>
    </div>
  );
}

// Custom icons
function CloudIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
    </svg>
  );
}

function GridOffIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="3" y1="3" x2="21" y2="21" />
    </svg>
  );
}

function DiagonalIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="3" y1="3" x2="21" y2="21" />
      <circle cx="12" cy="12" r="8" />
    </svg>
  );
}
