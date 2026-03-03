import { MapPin } from "lucide-react";

interface LocationTagProps {
  name: string;
  lat?: number;
  lng?: number;
}

export function LocationTag({ name, lat, lng }: LocationTagProps) {
  const handleClick = () => {
    if (lat && lng) {
      window.open(`https://maps.google.com/?q=${lat},${lng}`, "_blank");
    } else {
      window.open(`https://maps.google.com/?q=${encodeURIComponent(name)}`, "_blank");
    }
  };

  return (
    <button
      onClick={handleClick}
      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
    >
      <MapPin className="w-3.5 h-3.5" />
      <span className="truncate max-w-[180px]">{name}</span>
    </button>
  );
}
