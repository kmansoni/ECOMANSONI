import { useState, useEffect } from "react";
import { ChevronLeft, Search, MapPin, ChevronDown, SlidersHorizontal } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface RealEstateFiltersProps {
  onShowResults: () => void;
  resultsCount?: number;
  onFiltersChange?: (filters: {
    propertyType: string;
    dealType: string;
    marketType: string;
    rooms: string;
    price: string;
    city: string;
  }) => void;
}

const propertyTypes = [
  { value: "apartment", label: "Квартира" },
  { value: "room", label: "Комната" },
  { value: "house", label: "Дом" },
  { value: "commercial", label: "Коммерческая" },
  { value: "land", label: "Участок" },
];

const dealTypes = [
  { value: "buy", label: "Купить" },
  { value: "rent", label: "Снять" },
  { value: "daily", label: "Посуточно" },
];

const marketTypes = [
  { id: "all", label: "Все" },
  { id: "secondary", label: "Вторичка" },
  { id: "new", label: "Новостройка" },
];

const roomOptions = [
  { value: "studio", label: "Студия" },
  { value: "1", label: "1 комната" },
  { value: "2", label: "2 комнаты" },
  { value: "3", label: "3 комнаты" },
  { value: "4+", label: "4+ комнат" },
];

const priceOptions = [
  { value: "any", label: "Любая" },
  { value: "1m", label: "До 1 млн" },
  { value: "3m", label: "До 3 млн" },
  { value: "5m", label: "До 5 млн" },
  { value: "10m", label: "До 10 млн" },
  { value: "20m", label: "До 20 млн" },
  { value: "50m", label: "До 50 млн" },
];

export function RealEstateFilters({ onShowResults, resultsCount = 1000, onFiltersChange }: RealEstateFiltersProps) {
  const navigate = useNavigate();
  const [propertyType, setPropertyType] = useState("apartment");
  const [dealType, setDealType] = useState("buy");
  const [marketType, setMarketType] = useState("all");
  const [rooms, setRooms] = useState("");
  const [price, setPrice] = useState("");

  // Notify parent when filters change
  useEffect(() => {
    if (onFiltersChange) {
      onFiltersChange({
        propertyType,
        dealType,
        marketType,
        rooms,
        price,
        city: "Москва",
      });
    }
  }, [propertyType, dealType, marketType, rooms, price, onFiltersChange]);

  const formatResultsCount = (count: number) => {
    if (count >= 1000) {
      return `${Math.floor(count / 1000)} тыс.`;
    }
    return count.toString();
  };

  return (
    <div className="bg-accent/30 rounded-b-3xl pb-4">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <button onClick={() => navigate(-1)} className="p-1">
          <ChevronLeft className="w-6 h-6 text-foreground" />
        </button>
        <button className="p-1">
          <Search className="w-6 h-6 text-foreground" />
        </button>
      </div>

      {/* Title & Location */}
      <div className="px-4 mb-4">
        <h1 className="text-xl font-bold text-foreground mb-1">Недвижимость</h1>
        <button className="flex items-center gap-1 text-sm">
          <MapPin className="w-4 h-4 text-muted-foreground" />
          <span className="text-foreground font-medium">Москва</span>
          <span className="text-primary">, метро, район</span>
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Property Type & Deal Type Dropdowns */}
      <div className="px-4 mb-3 flex gap-3">
        <Select value={propertyType} onValueChange={setPropertyType}>
          <SelectTrigger className="flex-1 h-12 rounded-xl bg-background border-0 shadow-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-popover border shadow-lg z-50">
            {propertyTypes.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={dealType} onValueChange={setDealType}>
          <SelectTrigger className="flex-1 h-12 rounded-xl bg-background border-0 shadow-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-popover border shadow-lg z-50">
            {dealTypes.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Market Type Toggle */}
      <div className="px-4 mb-3 flex gap-2">
        {marketTypes.map((type) => (
          <button
            key={type.id}
            onClick={() => setMarketType(type.id)}
            className={cn(
              "px-5 py-2.5 rounded-xl text-sm font-medium transition-all",
              marketType === type.id
                ? "bg-foreground text-background"
                : "bg-background text-foreground border border-border"
            )}
          >
            {type.label}
          </button>
        ))}
      </div>

      {/* Rooms & Price Row */}
      <div className="px-4 mb-4 flex gap-3">
        <Select value={rooms} onValueChange={setRooms}>
          <SelectTrigger className="flex-1 h-12 rounded-xl bg-background border-0 shadow-sm">
            <SelectValue placeholder="Кол-во комнат" />
          </SelectTrigger>
          <SelectContent className="bg-popover border shadow-lg z-50">
            {roomOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={price} onValueChange={setPrice}>
          <SelectTrigger className="flex-1 h-12 rounded-xl bg-background border-0 shadow-sm">
            <SelectValue placeholder="Цена" />
          </SelectTrigger>
          <SelectContent className="bg-popover border shadow-lg z-50">
            {priceOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          size="icon"
          className="h-12 w-12 rounded-xl bg-background border-0 shadow-sm shrink-0"
        >
          <SlidersHorizontal className="w-5 h-5" />
        </Button>
      </div>

      {/* Show Results Button */}
      <div className="px-4">
        <Button
          onClick={onShowResults}
          className="w-full h-12 rounded-xl bg-foreground text-background hover:bg-foreground/90 font-medium"
        >
          Показать больше {formatResultsCount(resultsCount)} объявлений
        </Button>
      </div>
    </div>
  );
}
