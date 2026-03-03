import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { User, Globe, Users, Shield, Plus, Trash2 } from "lucide-react";

const TRAVEL_COUNTRIES = [
  "Германия", "Франция", "Испания", "Италия", "Греция", "Турция",
  "ОАЭ", "Таиланд", "Вьетнам", "Китай", "США", "Великобритания",
  "Австрия", "Чехия", "Венгрия", "Польша", "Финляндия", "Швейцария",
  "Мальдивы", "Египет", "Израиль", "Кипр", "Нидерланды", "Другая страна",
];

interface Traveler {
  id: string;
  lastName: string; firstName: string; birthDate: string;
  passportSeries: string; passportNumber: string; passportExpiry: string;
}

export interface TravelFormData {
  lastName: string; firstName: string; birthDate: string; citizenship: string;
  passportSeries: string; passportNumber: string; passportExpiry: string;
  country: string; city: string; departureDate: string; returnDate: string;
  purpose: string; flightNumber: string;
  travelers: Traveler[];
  coverageAmount: string;
  hasSports: boolean; hasCancellation: boolean; hasBaggage: boolean; hasAccident: boolean;
}

interface Props { data: TravelFormData; onChange: (data: TravelFormData) => void; }

export default function TravelApplicationForm({ data, onChange }: Props) {
  const update = (field: keyof TravelFormData, value: string | boolean) => onChange({ ...data, [field]: value });

  const addTraveler = () => {
    const t: Traveler = { id: Date.now().toString(), lastName: "", firstName: "", birthDate: "", passportSeries: "", passportNumber: "", passportExpiry: "" };
    onChange({ ...data, travelers: [...data.travelers, t] });
  };

  const removeTraveler = (id: string) => onChange({ ...data, travelers: data.travelers.filter((t) => t.id !== id) });

  const updateTraveler = (id: string, field: keyof Traveler, value: string) => {
    onChange({ ...data, travelers: data.travelers.map((t) => t.id === id ? { ...t, [field]: value } : t) });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><User className="w-4 h-4 text-primary" />Данные путешественника</CardTitle>
          <p className="text-sm text-muted-foreground">Основной застрахованный</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Фамилия (лат.) *</Label><Input value={data.lastName} onChange={(e) => update("lastName", e.target.value.toUpperCase())} placeholder="IVANOV" /></div>
            <div className="space-y-1.5"><Label>Имя (лат.) *</Label><Input value={data.firstName} onChange={(e) => update("firstName", e.target.value.toUpperCase())} placeholder="IVAN" /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Дата рождения *</Label><Input type="date" value={data.birthDate} onChange={(e) => update("birthDate", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Гражданство</Label><Input value={data.citizenship} onChange={(e) => update("citizenship", e.target.value)} placeholder="Российская Федерация" /></div>
          </div>
          <Separator />
          <p className="text-sm font-medium">Загранпаспорт</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5"><Label>Серия</Label><Input value={data.passportSeries} onChange={(e) => update("passportSeries", e.target.value)} placeholder="70" /></div>
            <div className="space-y-1.5"><Label>Номер</Label><Input value={data.passportNumber} onChange={(e) => update("passportNumber", e.target.value)} placeholder="1234567" /></div>
            <div className="space-y-1.5"><Label>Срок действия до</Label><Input type="date" value={data.passportExpiry} onChange={(e) => update("passportExpiry", e.target.value)} /></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Globe className="w-4 h-4 text-primary" />Данные о поездке</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Страна назначения *</Label>
              <Select value={data.country} onValueChange={(v) => update("country", v)}>
                <SelectTrigger><SelectValue placeholder="Выберите страну" /></SelectTrigger>
                <SelectContent>{TRAVEL_COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Город назначения</Label><Input value={data.city} onChange={(e) => update("city", e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Дата вылета *</Label><Input type="date" value={data.departureDate} onChange={(e) => update("departureDate", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Дата возвращения *</Label><Input type="date" value={data.returnDate} onChange={(e) => update("returnDate", e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Цель поездки</Label>
              <Select value={data.purpose} onValueChange={(v) => update("purpose", v)}>
                <SelectTrigger><SelectValue placeholder="Цель" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tourism">Туризм</SelectItem>
                  <SelectItem value="business">Деловая поездка</SelectItem>
                  <SelectItem value="study">Учёба</SelectItem>
                  <SelectItem value="sport">Спорт</SelectItem>
                  <SelectItem value="treatment">Лечение</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Номер рейса / бронирования</Label><Input value={data.flightNumber} onChange={(e) => update("flightNumber", e.target.value)} /></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Users className="w-4 h-4 text-primary" />Дополнительные путешественники</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.travelers.map((t, idx) => (
            <div key={t.id} className="border border-border/50 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground">Путешественник {idx + 1}</p>
                <Button variant="ghost" size="icon" onClick={() => removeTraveler(t.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Фамилия (лат.)</Label><Input value={t.lastName} onChange={(e) => updateTraveler(t.id, "lastName", e.target.value.toUpperCase())} /></div>
                <div className="space-y-1.5"><Label>Имя (лат.)</Label><Input value={t.firstName} onChange={(e) => updateTraveler(t.id, "firstName", e.target.value.toUpperCase())} /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5"><Label>Дата рождения</Label><Input type="date" value={t.birthDate} onChange={(e) => updateTraveler(t.id, "birthDate", e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Серия паспорта</Label><Input value={t.passportSeries} onChange={(e) => updateTraveler(t.id, "passportSeries", e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Номер паспорта</Label><Input value={t.passportNumber} onChange={(e) => updateTraveler(t.id, "passportNumber", e.target.value)} /></div>
              </div>
            </div>
          ))}
          <Button variant="outline" onClick={addTraveler} className="w-full">
            <Plus className="w-4 h-4 mr-2" />Добавить путешественника
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Shield className="w-4 h-4 text-primary" />Программа покрытия</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Страховая сумма *</Label>
            <Select value={data.coverageAmount} onValueChange={(v) => update("coverageAmount", v)}>
              <SelectTrigger><SelectValue placeholder="Выберите сумму" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="30000">30 000 EUR</SelectItem>
                <SelectItem value="50000">50 000 EUR</SelectItem>
                <SelectItem value="100000">100 000 EUR</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Separator />
          <div className="space-y-3">
            <div className="flex items-center gap-2"><Checkbox checked={data.hasSports} onCheckedChange={(v) => update("hasSports", !!v)} id="sports" /><Label htmlFor="sports">Активный спорт и экстремальные виды деятельности</Label></div>
            <div className="flex items-center gap-2"><Checkbox checked={data.hasCancellation} onCheckedChange={(v) => update("hasCancellation", !!v)} id="cancellation" /><Label htmlFor="cancellation">Отмена/прерывание поездки</Label></div>
            <div className="flex items-center gap-2"><Checkbox checked={data.hasBaggage} onCheckedChange={(v) => update("hasBaggage", !!v)} id="baggage" /><Label htmlFor="baggage">Страхование багажа</Label></div>
            <div className="flex items-center gap-2"><Checkbox checked={data.hasAccident} onCheckedChange={(v) => update("hasAccident", !!v)} id="accident" /><Label htmlFor="accident">Несчастный случай</Label></div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function createDefaultTravelFormData(): TravelFormData {
  return {
    lastName: "", firstName: "", birthDate: "", citizenship: "Российская Федерация",
    passportSeries: "", passportNumber: "", passportExpiry: "",
    country: "", city: "", departureDate: "", returnDate: "", purpose: "tourism", flightNumber: "",
    travelers: [],
    coverageAmount: "50000",
    hasSports: false, hasCancellation: false, hasBaggage: false, hasAccident: false,
  };
}
