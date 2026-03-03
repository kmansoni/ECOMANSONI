import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { User, Car, Users, Calendar, Plus, Trash2 } from "lucide-react";
import { VEHICLE_MAKES, VEHICLE_TYPES } from "@/lib/insurance/vehicle-dictionary";

interface Driver {
  id: string;
  lastName: string;
  firstName: string;
  middleName: string;
  birthDate: string;
  licenseNumber: string;
  licenseDate: string;
  kbm: string;
}

export interface OsagoFormData {
  // Страхователь
  lastName: string;
  firstName: string;
  middleName: string;
  birthDate: string;
  passportSeries: string;
  passportNumber: string;
  passportIssued: string;
  passportDate: string;
  phone: string;
  email: string;
  address: string;
  // ТС
  make: string;
  model: string;
  year: string;
  vin: string;
  regNumber: string;
  enginePower: string;
  vehicleType: string;
  ptsSeries: string;
  ptsNumber: string;
  stsSeries: string;
  stsNumber: string;
  // Водители
  drivers: Driver[];
  // Период
  startDate: string;
  usagePeriod: string;
}

interface Props {
  data: OsagoFormData;
  onChange: (data: OsagoFormData) => void;
}

export default function OsagoApplicationForm({ data, onChange }: Props) {
  const [selectedMake, setSelectedMake] = useState(data.make || "");

  const update = (field: keyof OsagoFormData, value: string) => onChange({ ...data, [field]: value });

  const models = selectedMake
    ? VEHICLE_MAKES.find((m) => m.id === selectedMake)?.models ?? []
    : [];

  const addDriver = () => {
    const driver: Driver = {
      id: Date.now().toString(),
      lastName: "", firstName: "", middleName: "", birthDate: "",
      licenseNumber: "", licenseDate: "", kbm: "",
    };
    onChange({ ...data, drivers: [...data.drivers, driver] });
  };

  const removeDriver = (id: string) => {
    onChange({ ...data, drivers: data.drivers.filter((d) => d.id !== id) });
  };

  const updateDriver = (id: string, field: keyof Driver, value: string) => {
    onChange({
      ...data,
      drivers: data.drivers.map((d) => (d.id === id ? { ...d, [field]: value } : d)),
    });
  };

  return (
    <div className="space-y-6">
      {/* Страхователь */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="w-4 h-4 text-primary" />
            Данные страхователя
          </CardTitle>
          <p className="text-sm text-muted-foreground">Лицо, заключающее договор страхования</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Фамилия *</Label>
              <Input value={data.lastName} onChange={(e) => update("lastName", e.target.value)} placeholder="Иванов" />
            </div>
            <div className="space-y-1.5">
              <Label>Имя *</Label>
              <Input value={data.firstName} onChange={(e) => update("firstName", e.target.value)} placeholder="Иван" />
            </div>
            <div className="space-y-1.5">
              <Label>Отчество</Label>
              <Input value={data.middleName} onChange={(e) => update("middleName", e.target.value)} placeholder="Иванович" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Дата рождения *</Label>
              <Input type="date" value={data.birthDate} onChange={(e) => update("birthDate", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Телефон *</Label>
              <Input value={data.phone} onChange={(e) => update("phone", e.target.value)} placeholder="+7 (999) 000-00-00" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Email *</Label>
            <Input type="email" value={data.email} onChange={(e) => update("email", e.target.value)} placeholder="ivan@example.com" />
          </div>
          <Separator />
          <p className="text-sm font-medium">Паспортные данные</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label>Серия</Label>
              <Input maxLength={4} value={data.passportSeries} onChange={(e) => update("passportSeries", e.target.value)} placeholder="1234" />
            </div>
            <div className="space-y-1.5">
              <Label>Номер</Label>
              <Input maxLength={6} value={data.passportNumber} onChange={(e) => update("passportNumber", e.target.value)} placeholder="567890" />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Дата выдачи</Label>
              <Input type="date" value={data.passportDate} onChange={(e) => update("passportDate", e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Кем выдан</Label>
            <Input value={data.passportIssued} onChange={(e) => update("passportIssued", e.target.value)} placeholder="ОВД Советского района г. Москвы" />
          </div>
          <div className="space-y-1.5">
            <Label>Адрес регистрации *</Label>
            <Input value={data.address} onChange={(e) => update("address", e.target.value)} placeholder="г. Москва, ул. Ленина, д. 1, кв. 1" />
          </div>
        </CardContent>
      </Card>

      {/* ТС */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Car className="w-4 h-4 text-primary" />
            Данные транспортного средства
          </CardTitle>
          <p className="text-sm text-muted-foreground">Сведения об автомобиле для страхования</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Марка *</Label>
              <Select value={data.make} onValueChange={(v) => { setSelectedMake(v); onChange({ ...data, make: v, model: "" }); }}>
                <SelectTrigger><SelectValue placeholder="Выберите марку" /></SelectTrigger>
                <SelectContent>
                  {VEHICLE_MAKES.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.nameRu}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Модель *</Label>
              <Select value={data.model} onValueChange={(v) => update("model", v)} disabled={!selectedMake}>
                <SelectTrigger><SelectValue placeholder="Сначала выберите марку" /></SelectTrigger>
                <SelectContent>
                  {models.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Год выпуска *</Label>
              <Input type="number" min={1990} max={2025} value={data.year} onChange={(e) => update("year", e.target.value)} placeholder="2020" />
            </div>
            <div className="space-y-1.5">
              <Label>Мощность двигателя (л.с.) *</Label>
              <Input type="number" value={data.enginePower} onChange={(e) => update("enginePower", e.target.value)} placeholder="150" />
            </div>
            <div className="space-y-1.5">
              <Label>Тип ТС *</Label>
              <Select value={data.vehicleType} onValueChange={(v) => update("vehicleType", v)}>
                <SelectTrigger><SelectValue placeholder="Тип ТС" /></SelectTrigger>
                <SelectContent>
                  {VEHICLE_TYPES.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.nameRu}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>VIN *</Label>
              <Input maxLength={17} value={data.vin} onChange={(e) => update("vin", e.target.value.toUpperCase())} placeholder="X4XEF2762EG012345" />
            </div>
            <div className="space-y-1.5">
              <Label>Государственный номер *</Label>
              <Input value={data.regNumber} onChange={(e) => update("regNumber", e.target.value.toUpperCase())} placeholder="A123BC777" />
            </div>
          </div>
          <Separator />
          <p className="text-sm font-medium">Документы на ТС</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label>ПТС серия</Label>
              <Input maxLength={4} value={data.ptsSeries} onChange={(e) => update("ptsSeries", e.target.value)} placeholder="77УЕ" />
            </div>
            <div className="space-y-1.5">
              <Label>ПТС номер</Label>
              <Input maxLength={6} value={data.ptsNumber} onChange={(e) => update("ptsNumber", e.target.value)} placeholder="123456" />
            </div>
            <div className="space-y-1.5">
              <Label>СТС серия</Label>
              <Input maxLength={4} value={data.stsSeries} onChange={(e) => update("stsSeries", e.target.value)} placeholder="77 00" />
            </div>
            <div className="space-y-1.5">
              <Label>СТС номер</Label>
              <Input maxLength={6} value={data.stsNumber} onChange={(e) => update("stsNumber", e.target.value)} placeholder="123456" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Водители */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="w-4 h-4 text-primary" />
            Данные водителей
          </CardTitle>
          <p className="text-sm text-muted-foreground">Лица, допущенные к управлению ТС</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.drivers.map((driver, idx) => (
            <div key={driver.id} className="border border-border/50 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground">Водитель {idx + 1}</p>
                {data.drivers.length > 1 && (
                  <Button variant="ghost" size="icon" onClick={() => removeDriver(driver.id)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>Фамилия</Label>
                  <Input value={driver.lastName} onChange={(e) => updateDriver(driver.id, "lastName", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Имя</Label>
                  <Input value={driver.firstName} onChange={(e) => updateDriver(driver.id, "firstName", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Отчество</Label>
                  <Input value={driver.middleName} onChange={(e) => updateDriver(driver.id, "middleName", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>Дата рождения</Label>
                  <Input type="date" value={driver.birthDate} onChange={(e) => updateDriver(driver.id, "birthDate", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Номер ВУ</Label>
                  <Input value={driver.licenseNumber} onChange={(e) => updateDriver(driver.id, "licenseNumber", e.target.value)} placeholder="77 00 123456" />
                </div>
                <div className="space-y-1.5">
                  <Label>Дата начала стажа</Label>
                  <Input type="date" value={driver.licenseDate} onChange={(e) => updateDriver(driver.id, "licenseDate", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>КБМ</Label>
                  <Select value={driver.kbm} onValueChange={(v) => updateDriver(driver.id, "kbm", v)}>
                    <SelectTrigger><SelectValue placeholder="Класс КБМ" /></SelectTrigger>
                    <SelectContent>
                      {[...Array(14)].map((_, i) => (
                        <SelectItem key={i} value={String(i + 1)}>Класс {i + 1}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          ))}
          <Button variant="outline" onClick={addDriver} className="w-full">
            <Plus className="w-4 h-4 mr-2" />
            Добавить водителя
          </Button>
        </CardContent>
      </Card>

      {/* Период */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="w-4 h-4 text-primary" />
            Период страхования
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Дата начала *</Label>
              <Input type="date" value={data.startDate} onChange={(e) => update("startDate", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Период использования *</Label>
              <Select value={data.usagePeriod} onValueChange={(v) => update("usagePeriod", v)}>
                <SelectTrigger><SelectValue placeholder="Выберите период" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3 месяца</SelectItem>
                  <SelectItem value="6">6 месяцев</SelectItem>
                  <SelectItem value="9">9 месяцев</SelectItem>
                  <SelectItem value="12">12 месяцев</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function createDefaultOsagoFormData(): OsagoFormData {
  return {
    lastName: "", firstName: "", middleName: "", birthDate: "",
    passportSeries: "", passportNumber: "", passportIssued: "", passportDate: "",
    phone: "", email: "", address: "",
    make: "", model: "", year: "", vin: "", regNumber: "",
    enginePower: "", vehicleType: "", ptsSeries: "", ptsNumber: "", stsSeries: "", stsNumber: "",
    drivers: [{ id: "1", lastName: "", firstName: "", middleName: "", birthDate: "", licenseNumber: "", licenseDate: "", kbm: "" }],
    startDate: "", usagePeriod: "12",
  };
}
