import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { User, Car, Shield, History, Star } from "lucide-react";
import { VEHICLE_MAKES, VEHICLE_TYPES } from "@/lib/insurance/vehicle-dictionary";
import { type KaskoFormData } from "./kaskoFormModel";

interface Props { data: KaskoFormData; onChange: (data: KaskoFormData) => void; }

export default function KaskoApplicationForm({ data, onChange }: Props) {
  const [selectedMake, setSelectedMake] = useState(data.make || "");
  const update = (field: keyof KaskoFormData, value: string | boolean) => onChange({ ...data, [field]: value });
  const models = selectedMake ? VEHICLE_MAKES.find((m) => m.id === selectedMake)?.models ?? [] : [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><User className="w-4 h-4 text-primary" />Данные страхователя</CardTitle>
          <p className="text-sm text-muted-foreground">Лицо, заключающее договор страхования</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5"><Label>Фамилия *</Label><Input value={data.lastName} onChange={(e) => update("lastName", e.target.value)} placeholder="Иванов" /></div>
            <div className="space-y-1.5"><Label>Имя *</Label><Input value={data.firstName} onChange={(e) => update("firstName", e.target.value)} placeholder="Иван" /></div>
            <div className="space-y-1.5"><Label>Отчество</Label><Input value={data.middleName} onChange={(e) => update("middleName", e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Дата рождения *</Label><Input type="date" value={data.birthDate} onChange={(e) => update("birthDate", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Телефон *</Label><Input value={data.phone} onChange={(e) => update("phone", e.target.value)} placeholder="+7 (999) 000-00-00" /></div>
          </div>
          <div className="space-y-1.5"><Label>Email *</Label><Input type="email" value={data.email} onChange={(e) => update("email", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Адрес регистрации *</Label><Input value={data.address} onChange={(e) => update("address", e.target.value)} /></div>
          <Separator />
          <p className="text-sm font-medium">Паспортные данные</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="space-y-1.5"><Label>Серия</Label><Input maxLength={4} value={data.passportSeries} onChange={(e) => update("passportSeries", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Номер</Label><Input maxLength={6} value={data.passportNumber} onChange={(e) => update("passportNumber", e.target.value)} /></div>
            <div className="space-y-1.5 col-span-2"><Label>Дата выдачи</Label><Input type="date" value={data.passportDate} onChange={(e) => update("passportDate", e.target.value)} /></div>
          </div>
          <div className="space-y-1.5"><Label>Кем выдан</Label><Input value={data.passportIssued} onChange={(e) => update("passportIssued", e.target.value)} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Car className="w-4 h-4 text-primary" />Данные транспортного средства</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Марка *</Label>
              <Select value={data.make} onValueChange={(v) => { setSelectedMake(v); onChange({ ...data, make: v, model: "" }); }}>
                <SelectTrigger><SelectValue placeholder="Выберите марку" /></SelectTrigger>
                <SelectContent>{VEHICLE_MAKES.map((m) => <SelectItem key={m.id} value={m.id}>{m.nameRu}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Модель *</Label>
              <Select value={data.model} onValueChange={(v) => update("model", v)} disabled={!selectedMake}>
                <SelectTrigger><SelectValue placeholder="Сначала выберите марку" /></SelectTrigger>
                <SelectContent>{models.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5"><Label>Год выпуска *</Label><Input type="number" value={data.year} onChange={(e) => update("year", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Мощность (л.с.) *</Label><Input type="number" value={data.enginePower} onChange={(e) => update("enginePower", e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>Тип ТС *</Label>
              <Select value={data.vehicleType} onValueChange={(v) => update("vehicleType", v)}>
                <SelectTrigger><SelectValue placeholder="Тип ТС" /></SelectTrigger>
                <SelectContent>{VEHICLE_TYPES.map((t) => <SelectItem key={t.id} value={t.id}>{t.nameRu}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>VIN *</Label><Input value={data.vin} onChange={(e) => update("vin", e.target.value.toUpperCase())} /></div>
            <div className="space-y-1.5"><Label>Гос. номер *</Label><Input value={data.regNumber} onChange={(e) => update("regNumber", e.target.value.toUpperCase())} /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5"><Label>Стоимость авто (₽) *</Label><Input type="number" value={data.carValue} onChange={(e) => update("carValue", e.target.value)} placeholder="2000000" /></div>
            <div className="space-y-1.5"><Label>Пробег (км)</Label><Input type="number" value={data.mileage} onChange={(e) => update("mileage", e.target.value)} placeholder="50000" /></div>
            <div className="space-y-1.5"><Label>Цвет</Label><Input value={data.color} onChange={(e) => update("color", e.target.value)} placeholder="Белый" /></div>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox checked={data.hasExtraEquipment} onCheckedChange={(v) => update("hasExtraEquipment", !!v)} id="extraEquip" />
            <Label htmlFor="extraEquip">Наличие дополнительного оборудования</Label>
          </div>
          {data.hasExtraEquipment && (
            <div className="space-y-1.5">
              <Label>Описание оборудования</Label>
              <Textarea value={data.extraEquipmentDesc} onChange={(e) => update("extraEquipmentDesc", e.target.value)} placeholder="Магнитола Pioneer, видеорегистратор..." />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Shield className="w-4 h-4 text-primary" />Параметры страхования</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Тип покрытия *</Label>
              <Select value={data.coverageType} onValueChange={(v) => update("coverageType", v)}>
                <SelectTrigger><SelectValue placeholder="Выберите тип" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">Полное (КАСКО)</SelectItem>
                  <SelectItem value="partial">Частичное</SelectItem>
                  <SelectItem value="total_loss">Только тотал/угон</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Франшиза</Label>
              <Select value={data.franchise} onValueChange={(v) => update("franchise", v)}>
                <SelectTrigger><SelectValue placeholder="Без франшизы" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Без франшизы</SelectItem>
                  <SelectItem value="15000">15 000 ₽</SelectItem>
                  <SelectItem value="30000">30 000 ₽</SelectItem>
                  <SelectItem value="50000">50 000 ₽</SelectItem>
                  <SelectItem value="100000">100 000 ₽</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Противоугонная система</Label>
              <Select value={data.antiTheft} onValueChange={(v) => update("antiTheft", v)}>
                <SelectTrigger><SelectValue placeholder="Выберите тип" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Нет</SelectItem>
                  <SelectItem value="mechanical">Механическая</SelectItem>
                  <SelectItem value="electronic">Электронная</SelectItem>
                  <SelectItem value="satellite">Спутниковая</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Место хранения</Label>
              <Select value={data.parkingType} onValueChange={(v) => update("parkingType", v)}>
                <SelectTrigger><SelectValue placeholder="Выберите тип" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="garage">Гараж</SelectItem>
                  <SelectItem value="yard">Двор</SelectItem>
                  <SelectItem value="parking">Охраняемая парковка</SelectItem>
                  <SelectItem value="street">Улица</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><History className="w-4 h-4 text-primary" />Предыдущее страхование</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Checkbox checked={data.hasPrevPolicy} onCheckedChange={(v) => update("hasPrevPolicy", !!v)} id="prevPolicy" />
            <Label htmlFor="prevPolicy">Ранее имелся полис КАСКО</Label>
          </div>
          {data.hasPrevPolicy && (
            <>
              <div className="space-y-1.5"><Label>Страховая компания</Label><Input value={data.prevCompany} onChange={(e) => update("prevCompany", e.target.value)} /></div>
              <div className="flex items-center gap-2">
                <Checkbox checked={data.hasLosses} onCheckedChange={(v) => update("hasLosses", !!v)} id="hasLosses" />
                <Label htmlFor="hasLosses">Были страховые убытки</Label>
              </div>
              {data.hasLosses && (
                <div className="space-y-1.5">
                  <Label>Описание убытков</Label>
                  <Textarea value={data.lossesDesc} onChange={(e) => update("lossesDesc", e.target.value)} />
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Star className="w-4 h-4 text-primary" />Дополнительные опции</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center gap-2"><Checkbox checked={data.hasGap} onCheckedChange={(v) => update("hasGap", !!v)} id="hasGap" /><Label htmlFor="hasGap">GAP-страхование</Label></div>
            <div className="flex items-center gap-2"><Checkbox checked={data.hasKeyless} onCheckedChange={(v) => update("hasKeyless", !!v)} id="hasKeyless" /><Label htmlFor="hasKeyless">Страхование при бесключевом доступе</Label></div>
            <div className="flex items-center gap-2"><Checkbox checked={data.hasTowing} onCheckedChange={(v) => update("hasTowing", !!v)} id="hasTowing" /><Label htmlFor="hasTowing">Эвакуатор</Label></div>
            <div className="flex items-center gap-2"><Checkbox checked={data.hasCommissioner} onCheckedChange={(v) => update("hasCommissioner", !!v)} id="hasCommissioner" /><Label htmlFor="hasCommissioner">Аварийный комиссар</Label></div>
            <div className="flex items-center gap-2"><Checkbox checked={data.hasReplacement} onCheckedChange={(v) => update("hasReplacement", !!v)} id="hasReplacement" /><Label htmlFor="hasReplacement">Подменный автомобиль</Label></div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
