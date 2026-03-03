import { Mail, Phone, MapPin, Calendar } from "lucide-react";

interface BusinessActionButtonsProps {
  email?: string;
  phone?: string;
  address?: string;
}

export function BusinessActionButtons({ email, phone, address }: BusinessActionButtonsProps) {
  const buttons = [
    email && { icon: Mail, label: "Email", action: () => window.open(`mailto:${email}`) },
    phone && { icon: Phone, label: "Звонок", action: () => window.open(`tel:${phone}`) },
    address && { icon: MapPin, label: "Маршрут", action: () => window.open(`https://maps.google.com/?q=${encodeURIComponent(address)}`) },
  ].filter(Boolean) as { icon: React.ElementType; label: string; action: () => void }[];

  if (!buttons.length) return null;

  return (
    <div className="flex gap-2 mt-3">
      {buttons.map(({ icon: Icon, label, action }) => (
        <button
          key={label}
          onClick={action}
          className="flex-1 flex flex-col items-center gap-1 py-2 bg-muted rounded-xl hover:bg-muted/80 transition-colors"
        >
          <Icon className="w-4 h-4 text-foreground" />
          <span className="text-xs text-muted-foreground">{label}</span>
        </button>
      ))}
    </div>
  );
}
