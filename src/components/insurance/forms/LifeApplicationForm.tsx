import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { User, Heart, Briefcase, Shield, Users, Plus, Trash2 } from "lucide-react";

interface Beneficiary {
  id: string;
  lastName: string; firstName: string; middleName: string;
  birthDate: string; relation: string; share: string;
}

export interface LifeFormData {
  lastName: string; firstName: string; middleName: string; birthDate: string;
  gender: string; passportSeries: string; passportNumber: string; phone: string; email: string;
  height: string; weight: string; isSmoker: boolean;
  hasChronicDiseases: boolean; chronicDesc: string;
  hasSurgeries: boolean; surgeriesDesc: string;
  disabilityGroup: string;
  profession: string; isDangerousWork: boolean; hasExtremeSports: boolean; activitiesDesc: string;
  programType: string; coverageAmount: string; term: string; paymentFrequency: string;
  beneficiaries: Beneficiary[];
}

interface Props { data: LifeFormData; onChange: (data: LifeFormData) => void; }

export default function LifeApplicationForm({ data, onChange }: Props) {
  const update = (field: keyof LifeFormData, value: string | boolean) => onChange({ ...data, [field]: value });

  const addBeneficiary = () => {
    const b: Beneficiary = { id: Date.now().toString(), lastName: "", firstName: "", middleName: "", birthDate: "", relation: "", share: "" };
    onChange({ ...data, beneficiaries: [...data.beneficiaries, b] });
  };

  const removeBeneficiary = (id: string) => onChange({ ...data, beneficiaries: data.beneficiaries.filter((b) => b.id !== id) });

  const updateBeneficiary = (id: string, field: keyof Beneficiary, value: string) => {
    onChange({ ...data, beneficiaries: data.beneficiaries.map((b) => b.id === id ? { ...b, [field]: value } : b) });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><User className="w-4 h-4 text-primary" />Данные застрахованного</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5"><Label>Фамилия *</Label><Input value={data.lastName} onChange={(e) => update("lastName", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Имя *</Label><Input value={data.firstName} onChange={(e) => update("firstName", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Отчество</Label><Input value={data.middleName} onChange={(e) => update("middleName", e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5"><Label>Дата рождения *</Label><Input type="date" value={data.birthDate} onChange={(e) => update("birthDate", e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>Пол *</Label>
              <Select value={data.gender} onValueChange={(v) => update("gender", v)}>
                <SelectTrigger><SelectValue placeholder="Пол" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Мужской</SelectItem>
                  <SelectItem value="female">Женский</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Телефон *</Label><Input value={data.phone} onChange={(e) => update("phone", e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Email *</Label><Input type="email" value={data.email} onChange={(e) => update("email", e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Серия паспорта</Label><Input maxLength={4} value={data.passportSeries} onChange={(e) => update("passportSeries", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Номер паспорта</Label><Input maxLength={6} value={data.passportNumber} onChange={(e) => update("passportNumber", e.target.value)} /></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Heart className="w-4 h-4 text-primary" />Состояние здоровья</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5"><Label>Рост (см)</Label><Input type="number" value={data.height} onChange={(e) => update("height", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Вес (кг)</Label><Input type="number" value={data.weight} onChange={(e) => update("weight", e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>Группа инвалидности</Label>
              <Select value={data.disabilityGroup} onValueChange={(v) => update("disabilityGroup", v)}>
                <SelectTrigger><SelectValue placeholder="Нет" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Нет</SelectItem>
                  <SelectItem value="1">I группа</SelectItem>
                  <SelectItem value="2">II группа</SelectItem>
                  <SelectItem value="3">III группа</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-2"><Checkbox checked={data.isSmoker} onCheckedChange={(v) => update("isSmoker", !!v)} id="smoker" /><Label htmlFor="smoker">Курю</Label></div>
          <div className="flex items-center gap-2"><Checkbox checked={data.hasChronicDiseases} onCheckedChange={(v) => update("hasChronicDiseases", !!v)} id="chronic" /><Label htmlFor="chronic">Хронические заболевания</Label></div>
          {data.hasChronicDiseases && (
            <div className="space-y-1.5"><Label>Описание заболеваний</Label><Textarea value={data.chronicDesc} onChange={(e) => update("chronicDesc", e.target.value)} /></div>
          )}
          <div className="flex items-center gap-2"><Checkbox checked={data.hasSurgeries} onCheckedChange={(v) => update("hasSurgeries", !!v)} id="surgeries" /><Label htmlFor="surgeries">Перенесённые операции</Label></div>
          {data.hasSurgeries && (
            <div className="space-y-1.5"><Label>Описание операций</Label><Textarea value={data.surgeriesDesc} onChange={(e) => update("surgeriesDesc", e.target.value)} /></div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Briefcase className="w-4 h-4 text-primary" />Занятость и деятельность</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5"><Label>Профессия / должность</Label><Input value={data.profession} onChange={(e) => update("profession", e.target.value)} placeholder="Менеджер по продажам" /></div>
          <div className="flex items-center gap-2"><Checkbox checked={data.isDangerousWork} onCheckedChange={(v) => update("isDangerousWork", !!v)} id="dangerWork" /><Label htmlFor="dangerWork">Работа с повышенным уровнем опасности (шахты, химия, высота)</Label></div>
          <div className="flex items-center gap-2"><Checkbox checked={data.hasExtremeSports} onCheckedChange={(v) => update("hasExtremeSports", !!v)} id="extreme" /><Label htmlFor="extreme">Экстремальные хобби (парашют, мотоцикл, горные лыжи)</Label></div>
          {(data.isDangerousWork || data.hasExtremeSports) && (
            <div className="space-y-1.5"><Label>Описание</Label><Textarea value={data.activitiesDesc} onChange={(e) => update("activitiesDesc", e.target.value)} /></div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Shield className="w-4 h-4 text-primary" />Программа страхования</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Тип программы *</Label>
              <Select value={data.programType} onValueChange={(v) => update("programType", v)}>
                <SelectTrigger><SelectValue placeholder="Выберите программу" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="risk">Рисковое (только защита)</SelectItem>
                  <SelectItem value="endowment">Накопительное (НСЖ)</SelectItem>
                  <SelectItem value="investment">Инвестиционное (ИСЖ)</SelectItem>
                  <SelectItem value="pension">Пенсионное</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Страховая сумма *</Label><Input type="number" value={data.coverageAmount} onChange={(e) => update("coverageAmount", e.target.value)} placeholder="1000000" /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Срок страхования (лет) *</Label><Input type="number" value={data.term} onChange={(e) => update("term", e.target.value)} placeholder="10" /></div>
            <div className="space-y-1.5">
              <Label>Периодичность взносов</Label>
              <Select value={data.paymentFrequency} onValueChange={(v) => update("paymentFrequency", v)}>
                <SelectTrigger><SelectValue placeholder="Выберите" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="once">Разовый</SelectItem>
                  <SelectItem value="monthly">Ежемесячный</SelectItem>
                  <SelectItem value="quarterly">Ежеквартальный</SelectItem>
                  <SelectItem value="yearly">Ежегодный</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Users className="w-4 h-4 text-primary" />Выгодоприобретатели</CardTitle>
          <p className="text-sm text-muted-foreground">Лица, получающие выплату при наступлении страхового случая</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.beneficiaries.map((b, idx) => (
            <div key={b.id} className="border border-border/50 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground">Выгодоприобретатель {idx + 1}</p>
                <Button variant="ghost" size="icon" onClick={() => removeBeneficiary(b.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5"><Label>Фамилия</Label><Input value={b.lastName} onChange={(e) => updateBeneficiary(b.id, "lastName", e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Имя</Label><Input value={b.firstName} onChange={(e) => updateBeneficiary(b.id, "firstName", e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Отчество</Label><Input value={b.middleName} onChange={(e) => updateBeneficiary(b.id, "middleName", e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5"><Label>Дата рождения</Label><Input type="date" value={b.birthDate} onChange={(e) => updateBeneficiary(b.id, "birthDate", e.target.value)} /></div>
                <div className="space-y-1.5">
                  <Label>Степень родства</Label>
                  <Select value={b.relation} onValueChange={(v) => updateBeneficiary(b.id, "relation", v)}>
                    <SelectTrigger><SelectValue placeholder="Связь" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="spouse">Супруг(а)</SelectItem>
                      <SelectItem value="child">Ребёнок</SelectItem>
                      <SelectItem value="parent">Родитель</SelectItem>
                      <SelectItem value="sibling">Брат/сестра</SelectItem>
                      <SelectItem value="other">Другое лицо</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label>Доля (%)</Label><Input type="number" min={1} max={100} value={b.share} onChange={(e) => updateBeneficiary(b.id, "share", e.target.value)} placeholder="100" /></div>
              </div>
            </div>
          ))}
          <Button variant="outline" onClick={addBeneficiary} className="w-full">
            <Plus className="w-4 h-4 mr-2" />Добавить выгодоприобретателя
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export function createDefaultLifeFormData(): LifeFormData {
  return {
    lastName: "", firstName: "", middleName: "", birthDate: "", gender: "",
    passportSeries: "", passportNumber: "", phone: "", email: "",
    height: "", weight: "", isSmoker: false,
    hasChronicDiseases: false, chronicDesc: "", hasSurgeries: false, surgeriesDesc: "",
    disabilityGroup: "none",
    profession: "", isDangerousWork: false, hasExtremeSports: false, activitiesDesc: "",
    programType: "risk", coverageAmount: "", term: "", paymentFrequency: "yearly",
    beneficiaries: [],
  };
}
