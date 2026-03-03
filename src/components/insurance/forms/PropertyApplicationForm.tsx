import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { User, Home, FileText, Shield } from "lucide-react";

export interface PropertyFormData {
  lastName: string; firstName: string; middleName: string;
  passportSeries: string; passportNumber: string; phone: string; email: string;
  propertyType: string; address: string; cadastralNumber: string;
  area: string; builtYear: string; floor: string; totalFloors: string;
  wallMaterial: string; roomsCount: string; propertyValue: string;
  docType: string; docNumber: string; docDate: string;
  hasConstruction: boolean; hasInterior: boolean; hasMovables: boolean; hasLiability: boolean;
}

interface Props { data: PropertyFormData; onChange: (data: PropertyFormData) => void; }

export default function PropertyApplicationForm({ data, onChange }: Props) {
  const update = (field: keyof PropertyFormData, value: string | boolean) => onChange({ ...data, [field]: value });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><User className="w-4 h-4 text-primary" />Данные собственника</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5"><Label>Фамилия *</Label><Input value={data.lastName} onChange={(e) => update("lastName", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Имя *</Label><Input value={data.firstName} onChange={(e) => update("firstName", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Отчество</Label><Input value={data.middleName} onChange={(e) => update("middleName", e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="space-y-1.5"><Label>Серия паспорта</Label><Input maxLength={4} value={data.passportSeries} onChange={(e) => update("passportSeries", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Номер паспорта</Label><Input maxLength={6} value={data.passportNumber} onChange={(e) => update("passportNumber", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Телефон *</Label><Input value={data.phone} onChange={(e) => update("phone", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Email *</Label><Input type="email" value={data.email} onChange={(e) => update("email", e.target.value)} /></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Home className="w-4 h-4 text-primary" />Объект страхования</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Тип объекта *</Label>
              <Select value={data.propertyType} onValueChange={(v) => update("propertyType", v)}>
                <SelectTrigger><SelectValue placeholder="Выберите тип" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="apartment">Квартира</SelectItem>
                  <SelectItem value="house">Дом</SelectItem>
                  <SelectItem value="dacha">Дача</SelectItem>
                  <SelectItem value="room">Комната</SelectItem>
                  <SelectItem value="commercial">Коммерческая недвижимость</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Адрес *</Label><Input value={data.address} onChange={(e) => update("address", e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Кадастровый номер</Label><Input value={data.cadastralNumber} onChange={(e) => update("cadastralNumber", e.target.value)} placeholder="77:00:0000000:00" /></div>
            <div className="space-y-1.5"><Label>Площадь (кв.м.) *</Label><Input type="number" value={data.area} onChange={(e) => update("area", e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="space-y-1.5"><Label>Год постройки</Label><Input type="number" value={data.builtYear} onChange={(e) => update("builtYear", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Этаж</Label><Input type="number" value={data.floor} onChange={(e) => update("floor", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Всего этажей</Label><Input type="number" value={data.totalFloors} onChange={(e) => update("totalFloors", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Кол-во комнат</Label><Input type="number" value={data.roomsCount} onChange={(e) => update("roomsCount", e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Материал стен</Label>
              <Select value={data.wallMaterial} onValueChange={(v) => update("wallMaterial", v)}>
                <SelectTrigger><SelectValue placeholder="Материал" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="brick">Кирпич</SelectItem>
                  <SelectItem value="panel">Панель</SelectItem>
                  <SelectItem value="monolith">Монолит</SelectItem>
                  <SelectItem value="wood">Дерево</SelectItem>
                  <SelectItem value="foam_block">Пеноблок/газоблок</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Стоимость объекта *</Label><Input type="number" value={data.propertyValue} onChange={(e) => update("propertyValue", e.target.value)} placeholder="5000000" /></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><FileText className="w-4 h-4 text-primary" />Правоустанавливающие документы</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Тип документа</Label>
              <Select value={data.docType} onValueChange={(v) => update("docType", v)}>
                <SelectTrigger><SelectValue placeholder="Выберите тип" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="certificate">Свидетельство о праве собственности</SelectItem>
                  <SelectItem value="egrn">Выписка из ЕГРН</SelectItem>
                  <SelectItem value="sale_contract">Договор купли-продажи</SelectItem>
                  <SelectItem value="gift_contract">Договор дарения</SelectItem>
                  <SelectItem value="inheritance">Свидетельство о наследстве</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Номер документа</Label><Input value={data.docNumber} onChange={(e) => update("docNumber", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Дата документа</Label><Input type="date" value={data.docDate} onChange={(e) => update("docDate", e.target.value)} /></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Shield className="w-4 h-4 text-primary" />Объём покрытия</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center gap-2"><Checkbox checked={data.hasConstruction} onCheckedChange={(v) => update("hasConstruction", !!v)} id="construction" /><Label htmlFor="construction">Конструктiv (стены, фундамент, перекрытия)</Label></div>
            <div className="flex items-center gap-2"><Checkbox checked={data.hasInterior} onCheckedChange={(v) => update("hasInterior", !!v)} id="interior" /><Label htmlFor="interior">Отделка (пол, потолок, стены внутри)</Label></div>
            <div className="flex items-center gap-2"><Checkbox checked={data.hasMovables} onCheckedChange={(v) => update("hasMovables", !!v)} id="movables" /><Label htmlFor="movables">Движимое имущество (мебель, техника)</Label></div>
            <div className="flex items-center gap-2"><Checkbox checked={data.hasLiability} onCheckedChange={(v) => update("hasLiability", !!v)} id="liability" /><Label htmlFor="liability">Гражданская ответственность перед соседями</Label></div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function createDefaultPropertyFormData(): PropertyFormData {
  return {
    lastName: "", firstName: "", middleName: "", passportSeries: "", passportNumber: "", phone: "", email: "",
    propertyType: "apartment", address: "", cadastralNumber: "", area: "", builtYear: "", floor: "", totalFloors: "", wallMaterial: "", roomsCount: "", propertyValue: "",
    docType: "egrn", docNumber: "", docDate: "",
    hasConstruction: true, hasInterior: true, hasMovables: false, hasLiability: false,
  };
}
