import { useMemo } from "react";

// Beautiful gradient combinations
const GRADIENTS = [
  "from-rose-500 via-pink-500 to-fuchsia-500",
  "from-violet-500 via-purple-500 to-indigo-500",
  "from-cyan-500 via-teal-500 to-emerald-500",
  "from-amber-500 via-orange-500 to-red-500",
  "from-blue-500 via-indigo-500 to-violet-500",
  "from-emerald-500 via-green-500 to-teal-500",
  "from-pink-500 via-rose-500 to-orange-500",
  "from-indigo-500 via-blue-500 to-cyan-500",
  "from-fuchsia-500 via-pink-500 to-rose-500",
  "from-teal-500 via-cyan-500 to-blue-500",
  "from-orange-500 via-amber-500 to-yellow-500",
  "from-purple-500 via-violet-500 to-fuchsia-500",
];

interface GradientAvatarProps {
  name: string;
  seed?: string;
  avatarUrl?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function GradientAvatar({ 
  name, 
  seed, 
  avatarUrl, 
  size = "md",
  className = "" 
}: GradientAvatarProps) {
  const sizeClasses = {
    sm: "w-10 h-10 text-sm",
    md: "w-14 h-14 text-lg",
    lg: "w-20 h-20 text-2xl",
  };

  const gradient = useMemo(() => {
    const str = seed || name;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return GRADIENTS[Math.abs(hash) % GRADIENTS.length];
  }, [seed, name]);

  const initials = useMemo(() => {
    if (!name) return "?";
    const words = name.trim().split(/\s+/);
    if (words.length >= 2) {
      return (words[0][0] + words[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }, [name]);

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className={`${sizeClasses[size]} rounded-full object-cover border-2 border-white/20 ${className}`}
      />
    );
  }

  return (
    <div
      className={`${sizeClasses[size]} rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center font-bold text-white shadow-lg border-2 border-white/20 ${className}`}
    >
      {initials}
    </div>
  );
}
