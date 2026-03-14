import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Car, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DriverModePanel } from "@/components/taxi/DriverModePanel";
import { DriverOrderRequest } from "@/components/taxi/DriverOrderRequest";
import { DriverEarningsPanel } from "@/components/taxi/DriverEarningsPanel";
import { useAuth } from "@/hooks/useAuth";
import {
  getDriverProfile,
  subscribeToIncomingOrders,
  upsertDriverProfile,
} from "@/lib/taxi/driverService";
import type { DriverProfile, IncomingOrderRequest, VehicleClass } from "@/types/taxi";

const VEHICLE_CLASSES: VehicleClass[] = [
  "economy",
  "comfort",
  "business",
  "minivan",
  "premium",
  "kids",
  "green",
];

export default function TaxiDriverPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [incomingOrder, setIncomingOrder] = useState<IncomingOrderRequest | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [carMake, setCarMake] = useState("");
  const [carModel, setCarModel] = useState("");
  const [carColor, setCarColor] = useState("");
  const [carPlateNumber, setCarPlateNumber] = useState("");
  const [carYear, setCarYear] = useState(new Date().getFullYear());
  const [carClass, setCarClass] = useState<VehicleClass>("economy");

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const p = await getDriverProfile();
      setProfile(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить профиль водителя");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    void loadProfile();
  }, [user, loadProfile]);

  useEffect(() => {
    if (!profile) return;
    const unsubscribe = subscribeToIncomingOrders(profile.driverId, (order) => {
      setIncomingOrder(order);
    });
    return unsubscribe;
  }, [profile]);

  const activeOrderSummary = useMemo(() => {
    if (!incomingOrder) return null;
    return {
      orderId: incomingOrder.orderId,
      passengerName: incomingOrder.passengerName,
      pickup: incomingOrder.pickup.address,
      destination: incomingOrder.destination.address,
      price: incomingOrder.estimatedPrice,
      status: "arriving" as const,
    };
  }, [incomingOrder]);

  const handleDriverProfileCreate = useCallback(async () => {
    if (!name.trim() || !phone.trim() || !carMake.trim() || !carModel.trim() || !carPlateNumber.trim()) {
      setError("Заполните обязательные поля профиля и автомобиля");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await upsertDriverProfile({
        name: name.trim(),
        phone: phone.trim(),
        carMake: carMake.trim(),
        carModel: carModel.trim(),
        carColor: carColor.trim() || "Черный",
        carPlateNumber: carPlateNumber.trim(),
        carYear,
        carClass,
      });
      await loadProfile();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось создать профиль водителя");
    } finally {
      setSaving(false);
    }
  }, [name, phone, carMake, carModel, carColor, carPlateNumber, carYear, carClass, loadProfile]);

  if (!user) {
    return (
      <div className="min-h-screen bg-background p-4 flex flex-col items-center justify-center text-center gap-3">
        <p className="text-foreground font-semibold">Требуется вход в аккаунт</p>
        <Button onClick={() => navigate("/auth")}>Войти</Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 bg-background border-b border-border">
        <div className="flex items-center gap-3 px-4 py-3 pt-safe">
          <button
            onClick={() => navigate("/taxi")}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-muted transition-colors"
            aria-label="Назад"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-bold">Режим водителя</h1>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4 max-w-lg mx-auto">
        {error && (
          <div className="px-3 py-2 rounded-lg border border-red-300 bg-red-50 text-red-700 text-sm">
            {error}
          </div>
        )}

        {!profile && (
          <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Car className="w-4 h-4 text-muted-foreground" />
              <h2 className="font-semibold">Регистрация водителя</h2>
            </div>

            <input className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" placeholder="Имя" value={name} onChange={(e) => setName(e.target.value)} />
            <input className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" placeholder="Телефон" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <input className="rounded-lg border border-border bg-background px-3 py-2 text-sm" placeholder="Марка" value={carMake} onChange={(e) => setCarMake(e.target.value)} />
              <input className="rounded-lg border border-border bg-background px-3 py-2 text-sm" placeholder="Модель" value={carModel} onChange={(e) => setCarModel(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input className="rounded-lg border border-border bg-background px-3 py-2 text-sm" placeholder="Цвет" value={carColor} onChange={(e) => setCarColor(e.target.value)} />
              <input className="rounded-lg border border-border bg-background px-3 py-2 text-sm" placeholder="Номер" value={carPlateNumber} onChange={(e) => setCarPlateNumber(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                type="number"
                min={1990}
                max={new Date().getFullYear() + 1}
                value={carYear}
                onChange={(e) => setCarYear(Number(e.target.value) || new Date().getFullYear())}
              />
              <select
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                value={carClass}
                onChange={(e) => setCarClass(e.target.value as VehicleClass)}
              >
                {VEHICLE_CLASSES.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>

            <Button className="w-full" onClick={handleDriverProfileCreate} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Создать профиль водителя
            </Button>
          </div>
        )}

        {profile && (
          <>
            <DriverModePanel
              driverProfile={profile}
              currentOrderSummary={activeOrderSummary}
              onProfileUpdate={() => {
                void loadProfile();
              }}
            />
            <DriverEarningsPanel driverProfile={profile} />
          </>
        )}
      </div>

      {profile && incomingOrder && (
        <DriverOrderRequest
          request={incomingOrder}
          driverId={profile.driverId}
          onAccept={() => {
            void loadProfile();
          }}
          onReject={() => {
            setIncomingOrder(null);
          }}
        />
      )}
    </div>
  );
}
