import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { User, CreditCard, Home, Shield } from "lucide-react";
import { type MortgageFormData } from "./mortgageFormModel";

const MORTGAGE_BANKS = [
  { id: "sber", name: "Сбербанк" },
  { id: "vtb", name: "ВТБ" },
  { id: "alfa", name: "Альфа-Банк" },
  { id: "gazprom", name: "Газпромбанк" },
  { id: "raiffeisen", name: "Райффайзенбанк" },
  { id: "dom_rf", name: "Дом.РФ" },
  { id: "rosselhoz", name: "Россельхозбанк" },
  { id: "unicredit", name: "ЮниКредит Банк" },
  { id: "otkritie", name: "Открытие" },
  { id: "psb", name: "Промсвязьбанк" },
  { id: "other", name: "Другой банк" },
];

interface Props {
  data: MortgageFormData;
  onChange: (data: MortgageFormData) => void;
}

export default function MortgageApplicationForm({ data, onChange }: Props) {
  const update = (field: keyof MortgageFormData, value: string | boolean) =>
    onChange({ ...data, [field]: value });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="w-4 h-4 text-primary" />
            Данные заёмщика
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Фамилия *</Label>
              <Input value={data.lastName} onChange={(e) => update("lastName", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Имя *</Label>
              <Input value={data.firstName} onChange={(e) => update("firstName", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Отчество</Label>
              <Input value={data.middleName} onChange={(e) => update("middleName", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Дата рождения *</Label>
              <Input type="date" value={data.birthDate} onChange={(e) => update("birthDate", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Пол</Label>
              <Select value={data.gender} onValueChange={(v) => update("gender", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Пол" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Мужской</SelectItem>
                  <SelectItem value="female">Женский</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>СНИЛС</Label>
              <Input value={data.snils} onChange={(e) => update("snils", e.target.value)} placeholder="000-000-000 00" />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label>Серия паспорта</Label>
              <Input maxLength={4} value={data.passportSeries} onChange={(e) => update("passportSeries", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Номер паспорта</Label>
              <Input maxLength={6} value={data.passportNumber} onChange={(e) => update("passportNumber", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Телефон *</Label>
              <Input value={data.phone} onChange={(e) => update("phone", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Email *</Label>
              <Input type="email" value={data.email} onChange={(e) => update("email", e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="w-4 h-4 text-primary" />
            Данные кредитного договора
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Банк *</Label>
              <Select value={data.bank} onValueChange={(v) => update("bank", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите банк" />
                </SelectTrigger>
                <SelectContent>
                  {MORTGAGE_BANKS.map((bank) => (
                    <SelectItem key={bank.id} value={bank.id}>
                      {bank.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Номер кредитного договора</Label>
              <Input value={data.creditNumber} onChange={(e) => update("creditNumber", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Дата договора</Label>
              <Input type="date" value={data.creditDate} onChange={(e) => update("creditDate", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Срок кредита (лет)</Label>
              <Input type="number" value={data.creditTerm} onChange={(e) => update("creditTerm", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Сумма кредита *</Label>
              <Input type="number" value={data.creditAmount} onChange={(e) => update("creditAmount", e.target.value)} placeholder="5000000" />
            </div>
            <div className="space-y-1.5">
              <Label>Остаток долга *</Label>
              <Input type="number" value={data.creditBalance} onChange={(e) => update("creditBalance", e.target.value)} placeholder="4500000" />
            </div>
            <div className="space-y-1.5">
              <Label>Процентная ставка (%)</Label>
              <Input
                type="number"
                step="0.1"
                value={data.interestRate}
                onChange={(e) => update("interestRate", e.target.value)}
                placeholder="11.5"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Home className="w-4 h-4 text-primary" />
            Объект недвижимости
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Адрес *</Label>
            <Input value={data.propertyAddress} onChange={(e) => update("propertyAddress", e.target.value)} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Кадастровый номер</Label>
              <Input value={data.cadastralNumber} onChange={(e) => update("cadastralNumber", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Тип</Label>
              <Select value={data.propertyType} onValueChange={(v) => update("propertyType", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Тип" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="apartment">Квартира</SelectItem>
                  <SelectItem value="house">Дом</SelectItem>
                  <SelectItem value="townhouse">Таунхаус</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Площадь (кв.м.)</Label>
              <Input type="number" value={data.propertyArea} onChange={(e) => update("propertyArea", e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Стоимость по оценке (₽) *</Label>
            <Input type="number" value={data.propertyValue} onChange={(e) => update("propertyValue", e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="w-4 h-4 text-primary" />
            Виды страхования
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={data.hasLifeCoverage}
                onCheckedChange={(v) => update("hasLifeCoverage", !!v)}
                id="lifeCov"
              />
              <Label htmlFor="lifeCov">Жизнь и здоровье заёмщика</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={data.hasTitleCoverage}
                onCheckedChange={(v) => update("hasTitleCoverage", !!v)}
                id="titleCov"
              />
              <Label htmlFor="titleCov">Титульное страхование (защита права собственности)</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={data.hasPropertyCoverage}
                onCheckedChange={(v) => update("hasPropertyCoverage", !!v)}
                id="propCov"
              />
              <Label htmlFor="propCov">Страхование имущества (конструктив)</Label>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
