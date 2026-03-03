import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { User, Heart, Shield, Building2 } from "lucide-react";

export interface DmsFormData {
  lastName: string; firstName: string; middleName: string; birthDate: string;
  gender: string; passportSeries: string; passportNumber: string;
  phone: string; email: string; snils: string;
  hasChronicDiseases: boolean; chronicDesc: string;
  hasAllergies: boolean; allergiesDesc: string;
  currentMeds: string; bloodGroup: string; height: string; weight: string;
  programType: string; clinic: string;
  hasDental: boolean; hasEmergency: boolean; hasConsultation: boolean;
  isCorporate: boolean; companyInn: string; companyName: string; employeesCount: string;
}

interface Props { data: DmsFormData; onChange: (data: DmsFormData) => void; }

export default function DmsApplicationForm({ data, onChange }: Props) {
  const update = (field: keyof DmsFormData, value: string | boolean) => onChange({ ...data, [field]: value });

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
            <div className="space-y-1.5"><Label>СНИЛС</Label><Input value={data.snils} onChange={(e) => update("snils", e.target.value)} placeholder="000-000-000 00" /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Телефон *</Label><Input value={data.phone} onChange={(e) => update("phone", e.target.value)} /></div>
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
          <CardTitle className="flex items-center gap-2 text-base"><Heart className="w-4 h-4 text-primary" />Медицинская информация</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Checkbox checked={data.hasChronicDiseases} onCheckedChange={(v) => update("hasChronicDiseases", !!v)} id="chronic" />
            <Label htmlFor="chronic">Наличие хронических заболеваний</Label>
          </div>
          {data.hasChronicDiseases && (
            <div className="space-y-1.5"><Label>Описание</Label><Textarea value={data.chronicDesc} onChange={(e) => update("chronicDesc", e.target.value)} /></div>
          )}
          <div className="flex items-center gap-2">
            <Checkbox checked={data.hasAllergies} onCheckedChange={(v) => update("hasAllergies", !!v)} id="allergies" />
            <Label htmlFor="allergies">Наличие аллергий</Label>
          </div>
          {data.hasAllergies && (
            <div className="space-y-1.5"><Label>Аллергии</Label><Input value={data.allergiesDesc} onChange={(e) => update("allergiesDesc", e.target.value)} /></div>
          )}
          <div className="space-y-1.5"><Label>Текущие лекарства</Label><Input value={data.currentMeds} onChange={(e) => update("currentMeds", e.target.value)} /></div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Группа крови</Label>
              <Select value={data.bloodGroup} onValueChange={(v) => update("bloodGroup", v)}>
                <SelectTrigger><SelectValue placeholder="Группа" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1+">I (O) Rh+</SelectItem>
                  <SelectItem value="1-">I (O) Rh-</SelectItem>
                  <SelectItem value="2+">II (A) Rh+</SelectItem>
                  <SelectItem value="2-">II (A) Rh-</SelectItem>
                  <SelectItem value="3+">III (B) Rh+</SelectItem>
                  <SelectItem value="3-">III (B) Rh-</SelectItem>
                  <SelectItem value="4+">IV (AB) Rh+</SelectItem>
                  <SelectItem value="4-">IV (AB) Rh-</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Рост (см)</Label><Input type="number" value={data.height} onChange={(e) => update("height", e.target.value)} placeholder="175" /></div>
            <div className="space-y-1.5"><Label>Вес (кг)</Label><Input type="number" value={data.weight} onChange={(e) => update("weight", e.target.value)} placeholder="70" /></div>
          </div>
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
                  <SelectItem value="basic">Базовая</SelectItem>
                  <SelectItem value="standard">Стандартная</SelectItem>
                  <SelectItem value="premium">Премиум</SelectItem>
                  <SelectItem value="vip">VIP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Клиника-прикрепление</Label>
              <Select value={data.clinic} onValueChange={(v) => update("clinic", v)}>
                <SelectTrigger><SelectValue placeholder="Выберите клинику" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="medsi">МЕДСИ</SelectItem>
                  <SelectItem value="emc">Европейский МЦ</SelectItem>
                  <SelectItem value="invitro">Инвитро</SelectItem>
                  <SelectItem value="sm">СМ-Клиника</SelectItem>
                  <SelectItem value="atlas">АО «Атлас»</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Separator />
          <div className="space-y-3">
            <div className="flex items-center gap-2"><Checkbox checked={data.hasDental} onCheckedChange={(v) => update("hasDental", !!v)} id="dental" /><Label htmlFor="dental">Стоматология</Label></div>
            <div className="flex items-center gap-2"><Checkbox checked={data.hasEmergency} onCheckedChange={(v) => update("hasEmergency", !!v)} id="emergency" /><Label htmlFor="emergency">Экстренная помощь</Label></div>
            <div className="flex items-center gap-2"><Checkbox checked={data.hasConsultation} onCheckedChange={(v) => update("hasConsultation", !!v)} id="consultation" /><Label htmlFor="consultation">Онлайн-консультации</Label></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Building2 className="w-4 h-4 text-primary" />Для корпоративного страхования</CardTitle>
          <p className="text-sm text-muted-foreground">Заполните если страховка оформляется на сотрудников компании</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Checkbox checked={data.isCorporate} onCheckedChange={(v) => update("isCorporate", !!v)} id="corporate" />
            <Label htmlFor="corporate">Корпоративное страхование</Label>
          </div>
          {data.isCorporate && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label>ИНН компании</Label><Input maxLength={12} value={data.companyInn} onChange={(e) => update("companyInn", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Название компании</Label><Input value={data.companyName} onChange={(e) => update("companyName", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Кол-во сотрудников</Label><Input type="number" value={data.employeesCount} onChange={(e) => update("employeesCount", e.target.value)} /></div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function createDefaultDmsFormData(): DmsFormData {
  return {
    lastName: "", firstName: "", middleName: "", birthDate: "", gender: "",
    passportSeries: "", passportNumber: "", phone: "", email: "", snils: "",
    hasChronicDiseases: false, chronicDesc: "", hasAllergies: false, allergiesDesc: "",
    currentMeds: "", bloodGroup: "", height: "", weight: "",
    programType: "standard", clinic: "", hasDental: false, hasEmergency: true, hasConsultation: false,
    isCorporate: false, companyInn: "", companyName: "", employeesCount: "",
  };
}
