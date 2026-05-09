// src/components/sidebar/iconRenderer.tsx
import React from 'react';
import {
  User, Zap, MessageCircle, Music as MusicIcon, Car, CloudSun,
  CheckCircle, Search, TrendingUp, FileText, Settings, HelpCircle,
  Compass, MapPin, Navigation2, BookmarkPlus,
  Play, Pause, SkipForward, SkipBack, Volume2,
  Droplets, Wind, Thermometer,
  Plus, Trash2, GripVertical,
  ChevronDown, ChevronUp,
  Star, Flame,
  Bell, Palette, SlidersHorizontal,
  Phone,
} from 'lucide-react';

const ICON_MAP: Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  User, Zap, MessageCircle, Music: MusicIcon, Car, CloudSun,
  CheckCircle, Search, TrendingUp, FileText, Settings, HelpCircle,
  Compass, MapPin, Navigation2, BookmarkPlus,
  Play, Pause, SkipForward, SkipBack, Volume2,
  Droplets, Wind, Thermometer: Thermometer as any,
  Plus: Plus as any, Trash2: Trash2 as any, GripVertical: GripVertical as any,
  ChevronDown, ChevronUp,
  Star, Flame,
  Bell, Palette, SlidersHorizontal: SlidersHorizontal as any,
  Phone,
};

interface IconRendererProps {
  name: string;
  className?: string;
}

export function IconRenderer({ name, className }: IconRendererProps) {
  const Icon = ICON_MAP[name];
  if (!Icon) return null;
  return <Icon className={className} />;
}