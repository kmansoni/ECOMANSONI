import { useState, useMemo } from "react";
import { ChevronLeft, ChevronDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const regions = [
  "Москва",
  "Санкт-Петербург", 
  "Краснодар",
  "Казань",
  "Новосибирск",
  "Екатеринбург",
];

const propertyTypes = [
  { id: "new", label: "Новостройка" },
  { id: "secondary", label: "Вторичная" },
  { id: "house", label: "Дом" },
  { id: "construction", label: "Строительство дома" },
];

const downPaymentOptions = [20, 25, 30, 35, 40];
const termOptions = [5, 10, 15, 20, 25, 30];

const mortgagePrograms = [
  { id: "family", name: "Семейная", description: "Для тех, у кого есть дети", rate: 6 },
  { id: "base", name: "Базовая", description: "Для всех, до 100 млн ₽", rate: 19 },
  { id: "it", name: "IT-ипотека", description: "Для IT-специалистов", rate: 5 },
  { id: "military", name: "Военная", description: "Для военнослужащих", rate: 7 },
];

const ageOptions = [
  { id: "over21", label: "Старше 21 года" },
  { id: "under21", label: "До 21 года" },
];

const employmentTypes = [
  { id: "employee", label: "Работа по найму" },
  { id: "ip", label: "ИП" },
  { id: "business", label: "Владелец бизнеса" },
  { id: "self", label: "Самозанятый" },
];

const workExperience = [
  { id: "over1y", label: "Больше года" },
  { id: "6-12m", label: "6-12 месяцев" },
  { id: "3-6m", label: "3-6 месяцев" },
  { id: "under3m", label: "До 3 месяцев" },
];

const currentJobExperience = [
  { id: "over3m", label: "Больше 3 месяцев" },
  { id: "under3m", label: "До 3 месяцев" },
];

const incomeConfirmation = [
  { id: "2ndfl", label: "2-НДФЛ" },
  { id: "bank", label: "Справка по форме банка" },
  { id: "sfr", label: "Выписка из СФР" },
  { id: "none", label: "Без подтверждения" },
];

export function MortgageCalculator() {
  const [isOpen, setIsOpen] = useState(false);
  const [region, setRegion] = useState("Москва");
  const [propertyType, setPropertyType] = useState("new");
  const [propertyPrice, setPropertyPrice] = useState(5000000);
  const [downPaymentPercent, setDownPaymentPercent] = useState(30);
  const [term, setTerm] = useState(20);
  const [selectedProgram, setSelectedProgram] = useState("base");
  const [age, setAge] = useState("over21");
  const [employment, setEmployment] = useState("employee");
  const [experience, setExperience] = useState("over1y");
  const [currentExp, setCurrentExp] = useState("over3m");
  const [incomeType, setIncomeType] = useState("2ndfl");

  const downPayment = Math.round(propertyPrice * (downPaymentPercent / 100));
  const loanAmount = propertyPrice - downPayment;

  const calculations = useMemo(() => {
    const program = mortgagePrograms.find(p => p.id === selectedProgram);
    const rate = program?.rate || 19;
    const monthlyRate = rate / 100 / 12;
    const totalMonths = term * 12;

    const monthlyPayment = loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, totalMonths)) / 
                          (Math.pow(1 + monthlyRate, totalMonths) - 1);

    return {
      rate,
      monthlyPayment: Math.round(monthlyPayment),
    };
  }, [loanAmount, term, selectedProgram]);

  const formatPrice = (value: number) => {
    return value.toLocaleString("ru-RU") + " ₽";
  };

  const ToggleButton = ({ 
    selected, 
    onClick, 
    children 
  }: { 
    selected: boolean; 
    onClick: () => void; 
    children: React.ReactNode 
  }) => (
    <button
      onClick={onClick}
      className={cn(
        "px-4 py-2.5 rounded-full text-sm font-medium transition-all whitespace-nowrap",
        selected
          ? "bg-foreground text-background"
          : "bg-muted text-foreground"
      )}
    >
      {children}
    </button>
  );

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button 
          variant="outline" 
          className="w-full h-14 rounded-2xl border-2 border-primary/30 bg-primary/5 text-primary font-medium hover:bg-primary/10"
        >
          Ипотечный калькулятор
        </Button>
      </SheetTrigger>
      
      <SheetContent side="bottom" className="h-[95vh] rounded-t-3xl p-0 flex flex-col">
        {/* Header */}
        <SheetHeader className="px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center">
            <button onClick={() => setIsOpen(false)} className="p-1 -ml-1">
              <ChevronLeft className="w-6 h-6" />
            </button>
            <SheetTitle className="flex-1 text-center pr-6">Подбор ипотеки</SheetTitle>
          </div>
        </SheetHeader>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-5 space-y-6">
          {/* Title */}
          <div>
            <h1 className="text-2xl font-bold mb-1">Ипотечный калькулятор</h1>
            <p className="text-muted-foreground">Покажем программы с лучшими ставками и платежом.</p>
          </div>

          {/* Region */}
          <div className="space-y-2">
            <Label className="text-base font-semibold">Регион покупки</Label>
            <Select value={region} onValueChange={setRegion}>
              <SelectTrigger className="h-12 rounded-xl bg-muted border-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover border shadow-lg z-50">
                {regions.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Property Type */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Тип недвижимости</Label>
            <div className="flex flex-wrap gap-2">
              {propertyTypes.map((type) => (
                <ToggleButton
                  key={type.id}
                  selected={propertyType === type.id}
                  onClick={() => setPropertyType(type.id)}
                >
                  {type.label}
                </ToggleButton>
              ))}
            </div>
          </div>

          {/* Property Price */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Стоимость жилья</Label>
            <div className="h-12 px-4 rounded-xl bg-muted flex items-center">
              <span className="text-base">{formatPrice(propertyPrice)}</span>
            </div>
            <Slider
              value={[propertyPrice]}
              onValueChange={(v) => setPropertyPrice(v[0])}
              min={500000}
              max={100000000}
              step={100000}
              className="py-1"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>500 тыс. ₽</span>
              <span>100 млн. ₽</span>
            </div>
          </div>

          {/* Down Payment */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Первоначальный взнос</Label>
            <div className="h-12 px-4 rounded-xl bg-muted flex items-center justify-between">
              <span className="text-base">{formatPrice(downPayment)}</span>
              <span className="text-muted-foreground">{downPaymentPercent}%</span>
            </div>
            <Slider
              value={[downPaymentPercent]}
              onValueChange={(v) => setDownPaymentPercent(v[0])}
              min={20}
              max={90}
              step={1}
              className="py-1"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>20%</span>
              <span>90%</span>
            </div>
            <div className="flex gap-2">
              {downPaymentOptions.map((percent) => (
                <ToggleButton
                  key={percent}
                  selected={downPaymentPercent === percent}
                  onClick={() => setDownPaymentPercent(percent)}
                >
                  {percent}%
                </ToggleButton>
              ))}
            </div>
          </div>

          {/* Term */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Срок кредита</Label>
            <div className="h-12 px-4 rounded-xl bg-muted flex items-center">
              <span className="text-base">{term} лет</span>
            </div>
            <Slider
              value={[term]}
              onValueChange={(v) => setTerm(v[0])}
              min={1}
              max={30}
              step={1}
              className="py-1"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>1 год</span>
              <span>30 лет</span>
            </div>
            <div className="flex gap-2">
              {termOptions.map((t) => (
                <ToggleButton
                  key={t}
                  selected={term === t}
                  onClick={() => setTerm(t)}
                >
                  {t}
                </ToggleButton>
              ))}
            </div>
          </div>

          {/* Mortgage Program */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Ипотечная программа</Label>
            <div className="grid grid-cols-2 gap-3">
              {mortgagePrograms.map((program) => (
                <button
                  key={program.id}
                  onClick={() => setSelectedProgram(program.id)}
                  className={cn(
                    "p-4 rounded-xl text-left border-2 transition-all",
                    selectedProgram === program.id
                      ? "border-foreground bg-muted"
                      : "border-border bg-background"
                  )}
                >
                  <div className="flex items-start justify-between mb-1">
                    <span className="font-semibold">{program.name}</span>
                    {selectedProgram === program.id && (
                      <Check className="w-5 h-5" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">{program.description}</p>
                  <span className="text-lg font-bold">от {program.rate}%</span>
                </button>
              ))}
            </div>
          </div>

          {/* Employment Section */}
          <div className="pt-4 border-t border-border">
            <button className="text-primary text-sm font-medium mb-4">
              Какая мне подойдёт?
            </button>
            
            <h2 className="text-xl font-bold mb-4">Занятость и доход</h2>

            {/* Age */}
            <div className="space-y-3 mb-5">
              <Label className="font-semibold">Ваш возраст</Label>
              <div className="flex gap-2">
                {ageOptions.map((opt) => (
                  <ToggleButton
                    key={opt.id}
                    selected={age === opt.id}
                    onClick={() => setAge(opt.id)}
                  >
                    {opt.label}
                  </ToggleButton>
                ))}
              </div>
            </div>

            {/* Employment Type */}
            <div className="space-y-3 mb-5">
              <Label className="font-semibold">Тип занятости</Label>
              <div className="flex flex-wrap gap-2">
                {employmentTypes.map((opt) => (
                  <ToggleButton
                    key={opt.id}
                    selected={employment === opt.id}
                    onClick={() => setEmployment(opt.id)}
                  >
                    {opt.label}
                  </ToggleButton>
                ))}
              </div>
            </div>

            {/* Work Experience */}
            <div className="space-y-3 mb-5">
              <Label className="font-semibold">Общий трудовой стаж</Label>
              <div className="flex flex-wrap gap-2">
                {workExperience.map((opt) => (
                  <ToggleButton
                    key={opt.id}
                    selected={experience === opt.id}
                    onClick={() => setExperience(opt.id)}
                  >
                    {opt.label}
                  </ToggleButton>
                ))}
              </div>
            </div>

            {/* Current Job Experience */}
            <div className="space-y-3 mb-5">
              <Label className="font-semibold">Стаж на текущей работе</Label>
              <div className="flex gap-2">
                {currentJobExperience.map((opt) => (
                  <ToggleButton
                    key={opt.id}
                    selected={currentExp === opt.id}
                    onClick={() => setCurrentExp(opt.id)}
                  >
                    {opt.label}
                  </ToggleButton>
                ))}
              </div>
            </div>

            {/* Income Confirmation */}
            <div className="space-y-3">
              <Label className="font-semibold">Подтверждение дохода</Label>
              <div className="flex flex-wrap gap-2">
                {incomeConfirmation.map((opt) => (
                  <ToggleButton
                    key={opt.id}
                    selected={incomeType === opt.id}
                    onClick={() => setIncomeType(opt.id)}
                  >
                    {opt.label}
                  </ToggleButton>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Fixed Bottom Bar */}
        <div className="shrink-0 border-t border-border bg-background px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Ставка</p>
              <p className="text-lg font-bold">от {calculations.rate} %</p>
            </div>
            <div className="flex-1 mx-4">
              <p className="text-xs text-muted-foreground">Платёж</p>
              <p className="text-lg font-bold">от {formatPrice(calculations.monthlyPayment)}</p>
              {/* Progress indicator */}
              <div className="h-1 bg-muted rounded-full mt-1 overflow-hidden">
                <div className="h-full bg-primary w-1/2" />
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Банки</p>
              <div className="flex -space-x-2">
                {/* Сбербанк */}
                <div className="w-8 h-8 rounded-full bg-[#21A038] border-2 border-background flex items-center justify-center overflow-hidden">
                  <svg viewBox="0 0 24 24" className="w-5 h-5 text-white" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
                  </svg>
                </div>
                {/* Тинькофф */}
                <div className="w-8 h-8 rounded-full bg-[#FFDD2D] border-2 border-background flex items-center justify-center">
                  <span className="text-black font-black text-sm">T</span>
                </div>
                {/* Альфа-Банк */}
                <div className="w-8 h-8 rounded-full bg-[#EF3124] border-2 border-background flex items-center justify-center">
                  <span className="text-white font-bold text-sm">A</span>
                </div>
                {/* ВТБ */}
                <div className="w-8 h-8 rounded-full bg-[#0A2973] border-2 border-background flex items-center justify-center">
                  <span className="text-white font-bold text-[10px]">ВТБ</span>
                </div>
                {/* Счётчик остальных */}
                <div className="w-8 h-8 rounded-full bg-muted border-2 border-background flex items-center justify-center text-foreground text-xs font-bold">
                  +9
                </div>
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
