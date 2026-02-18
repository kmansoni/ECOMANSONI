import { useState } from "react";
import { Calculator, Car, Info, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

const regions = [
  { value: "moscow", label: "Москва", coefficient: 1.8 },
  { value: "spb", label: "Санкт-Петербург", coefficient: 1.72 },
  { value: "krasnodar", label: "Краснодар", coefficient: 1.76 },
  { value: "kazan", label: "Казань", coefficient: 1.67 },
  { value: "other", label: "Другой регион", coefficient: 1.0 },
];

const experienceOptions = [
  { value: "0", label: "Менее 1 года", coefficient: 1.87 },
  { value: "1", label: "1-2 года", coefficient: 1.63 },
  { value: "3", label: "3-4 года", coefficient: 1.04 },
  { value: "5", label: "5-9 лет", coefficient: 0.96 },
  { value: "10", label: "10+ лет", coefficient: 0.83 },
];

const ageOptions = [
  { value: "18", label: "18-21 год", coefficient: 1.87 },
  { value: "22", label: "22-24 года", coefficient: 1.63 },
  { value: "25", label: "25-29 лет", coefficient: 1.04 },
  { value: "30", label: "30-39 лет", coefficient: 1.0 },
  { value: "40", label: "40+ лет", coefficient: 0.96 },
];

const BASE_RATE = 5436; // Базовая ставка ОСАГО 2024

export function OsagoCalculator() {
  const [isOpen, setIsOpen] = useState(false);
  const [region, setRegion] = useState("");
  const [experience, setExperience] = useState("");
  const [age, setAge] = useState("");
  const [power, setPower] = useState([100]);
  const [kbm, setKbm] = useState("1.0");
  const [calculated, setCalculated] = useState(false);
  const [result, setResult] = useState({ min: 0, max: 0 });

  const getPowerCoefficient = (hp: number) => {
    if (hp <= 50) return 0.6;
    if (hp <= 70) return 1.0;
    if (hp <= 100) return 1.1;
    if (hp <= 120) return 1.2;
    if (hp <= 150) return 1.4;
    return 1.6;
  };

  const calculate = () => {
    const regionData = regions.find(r => r.value === region);
    const expData = experienceOptions.find(e => e.value === experience);
    const ageData = ageOptions.find(a => a.value === age);
    
    if (!regionData || !expData || !ageData) return;

    const kt = regionData.coefficient; // Территория
    const kvs = Math.max(expData.coefficient, ageData.coefficient); // Возраст-стаж
    const km = getPowerCoefficient(power[0]); // Мощность
    const kbmValue = parseFloat(kbm);

    const minRate = BASE_RATE * 0.8;
    const maxRate = BASE_RATE * 1.2;

    const minPrice = Math.round(minRate * kt * kvs * km * kbmValue);
    const maxPrice = Math.round(maxRate * kt * kvs * km * kbmValue);

    setResult({ min: minPrice, max: maxPrice });
    setCalculated(true);
  };

  const formatPrice = (price: number) => {
    return price.toLocaleString("ru-RU") + " ₽";
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <button className="flex flex-col items-center p-3 rounded-xl bg-muted/50 active:bg-muted transition-colors">
          <div className="w-10 h-10 rounded-full bg-background flex items-center justify-center mb-2 shadow-sm">
            <Calculator className="w-5 h-5 text-primary" strokeWidth={1.5} />
          </div>
          <span className="text-[11px] text-center text-foreground font-medium leading-tight">
            Калькулятор
          </span>
        </button>
      </SheetTrigger>
      
      <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2">
            <Car className="w-5 h-5 text-primary" />
            Калькулятор ОСАГО
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-5 overflow-y-auto pb-6">
          {/* Region */}
          <div className="space-y-2">
            <Label>Регион регистрации</Label>
            <Select value={region} onValueChange={setRegion}>
              <SelectTrigger className="h-12 rounded-xl">
                <SelectValue placeholder="Выберите регион" />
              </SelectTrigger>
              <SelectContent className="bg-popover border shadow-lg z-50">
                {regions.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Age */}
          <div className="space-y-2">
            <Label>Возраст водителя</Label>
            <Select value={age} onValueChange={setAge}>
              <SelectTrigger className="h-12 rounded-xl">
                <SelectValue placeholder="Выберите возраст" />
              </SelectTrigger>
              <SelectContent className="bg-popover border shadow-lg z-50">
                {ageOptions.map((a) => (
                  <SelectItem key={a.value} value={a.value}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Experience */}
          <div className="space-y-2">
            <Label>Стаж вождения</Label>
            <Select value={experience} onValueChange={setExperience}>
              <SelectTrigger className="h-12 rounded-xl">
                <SelectValue placeholder="Выберите стаж" />
              </SelectTrigger>
              <SelectContent className="bg-popover border shadow-lg z-50">
                {experienceOptions.map((e) => (
                  <SelectItem key={e.value} value={e.value}>
                    {e.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Power */}
          <div className="space-y-3">
            <div className="flex justify-between">
              <Label>Мощность двигателя</Label>
              <span className="text-sm font-medium text-primary">{power[0]} л.с.</span>
            </div>
            <Slider
              value={power}
              onValueChange={setPower}
              min={50}
              max={300}
              step={10}
              className="py-2"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>50 л.с.</span>
              <span>300 л.с.</span>
            </div>
          </div>

          {/* KBM */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label>КБМ (бонус-малус)</Label>
              <Info className="w-4 h-4 text-muted-foreground" />
            </div>
            <Select value={kbm} onValueChange={setKbm}>
              <SelectTrigger className="h-12 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover border shadow-lg z-50">
                <SelectItem value="0.5">0.5 — Максимальная скидка</SelectItem>
                <SelectItem value="0.7">0.7 — Хорошая история</SelectItem>
                <SelectItem value="1.0">1.0 — Без скидки/надбавки</SelectItem>
                <SelectItem value="1.4">1.4 — 1 ДТП</SelectItem>
                <SelectItem value="2.45">2.45 — Много ДТП</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Calculate Button */}
          <Button 
            onClick={calculate}
            disabled={!region || !experience || !age}
            className="w-full h-12 rounded-xl bg-emerald-500 hover:bg-emerald-600"
          >
            <Calculator className="w-5 h-5 mr-2" />
            Рассчитать стоимость
          </Button>

          {/* Result */}
          {calculated && (
            <div className="bg-gradient-to-br from-emerald-500/10 to-teal-500/10 rounded-2xl p-5 space-y-3 animate-fade-in">
              <h3 className="font-semibold text-center">Примерная стоимость ОСАГО</h3>
              <div className="text-center">
                <span className="text-3xl font-bold text-emerald-600">
                  {formatPrice(result.min)} — {formatPrice(result.max)}
                </span>
                <p className="text-sm text-muted-foreground mt-1">в год</p>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                * Точная стоимость зависит от страховой компании и дополнительных условий
              </p>
              <Button className="w-full rounded-xl" variant="outline">
                Получить точный расчёт
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
