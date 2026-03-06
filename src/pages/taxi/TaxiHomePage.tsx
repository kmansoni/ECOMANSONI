import { useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { History, Settings, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTaxiOrder } from '@/hooks/taxi/useTaxiOrder';
import { useTaxiMap } from '@/hooks/taxi/useTaxiMap';
import { useTaxiTracking } from '@/hooks/taxi/useTaxiTracking';
import { TaxiMap } from '@/components/taxi/TaxiMap';
import { OrderBottomSheet } from '@/components/taxi/OrderBottomSheet';
import { SafetyPanel } from '@/components/taxi/SafetyPanel';
import { calculateRoute } from '@/lib/taxi/api';

// ─── Вычисление высоты bottom sheet по статусу ────────────────────────────────
function getSheetHeight(status: string): string {
  switch (status) {
    case 'idle':
      return 'h-52';
    case 'selecting_route':
      return 'h-[65%]';
    case 'selecting_tariff':
      return 'h-[80%]';
    case 'searching_driver':
      return 'h-72';
    case 'driver_found':
    case 'driver_arriving':
      return 'h-80';
    case 'driver_arrived':
      return 'h-auto';
    case 'in_trip':
      return 'h-64';
    case 'completed':
      return 'h-64';
    case 'rating':
      return 'h-[90%]';
    default:
      return 'h-52';
  }
}

export default function TaxiHomePage() {
  const navigate = useNavigate();
  const order = useTaxiOrder();
  const map = useTaxiMap();
  const tracking = useTaxiTracking();

  const prevStatusRef = useRef(order.status);

  // ─── При появлении pickup — обновить маркер на карте ─────────────────────
  useEffect(() => {
    if (order.pickup) {
      map.setPickupMarker(order.pickup.coordinates);
    } else {
      map.setPickupMarker(null);
    }
  }, [order.pickup, map.setPickupMarker]);

  // ─── При появлении destination — обновить маркер + маршрут ───────────────
  useEffect(() => {
    if (order.pickup && order.destination) {
      map.showRoute(order.pickup.coordinates, order.destination.coordinates);
    } else if (order.destination) {
      map.setDestinationMarker(order.destination.coordinates);
    } else {
      map.setDestinationMarker(null);
      map.clearRoute();
    }
  }, [order.pickup, order.destination]); // eslint-disable-line

  // ─── При нахождении водителя — начать трекинг ─────────────────────────────
  useEffect(() => {
    const prevStatus = prevStatusRef.current;
    const currentStatus = order.status;
    prevStatusRef.current = currentStatus;

    if (
      currentStatus === 'driver_arriving' &&
      prevStatus !== 'driver_arriving' &&
      order.order?.driver &&
      order.pickup
    ) {
      // Построить маршрут водителя к пассажиру
      calculateRoute(
        order.order.driver.location,
        order.pickup.coordinates
      ).then((route) => {
        tracking.startTracking(order.order!.driver!, order.pickup!.coordinates, route);
      });
    }

    if (
      currentStatus === 'in_trip' &&
      prevStatus !== 'in_trip' &&
      order.order?.driver &&
      order.destination
    ) {
      // Переключаем цель трекинга на назначение
      tracking.updateTarget(order.destination.coordinates);
    }

    if (currentStatus === 'completed' || currentStatus === 'idle') {
      tracking.stopTracking();
      if (currentStatus === 'idle') {
        map.clearRoute();
      }
    }
  }, [order.status]); // eslint-disable-line

  // ─── Обновить позицию водителя на карте ───────────────────────────────────
  useEffect(() => {
    if (tracking.driverPosition) {
      map.updateDriverPosition(tracking.driverPosition, tracking.driverHeading);
    }
  }, [tracking.driverPosition, tracking.driverHeading]); // eslint-disable-line

  // ─── Имитация: водитель прибыл после полного tracking ─────────────────────
  useEffect(() => {
    if (
      order.status === 'driver_arriving' &&
      tracking.progress >= 0.95 &&
      tracking.isActive
    ) {
      order.driverArrived();
    }
  }, [tracking.progress, order.status]); // eslint-disable-line

  // ─── Имитация: поездка завершена ──────────────────────────────────────────
  useEffect(() => {
    if (
      order.status === 'in_trip' &&
      tracking.progress >= 0.98
    ) {
      order.completeTrip();
    }
  }, [tracking.progress, order.status]); // eslint-disable-line

  // ─── Режим показа водителей рядом (только idle) ───────────────────────────
  const showNearby = order.status === 'idle' || order.status === 'selecting_route';

  // ─── Показывать ли SafetyPanel ────────────────────────────────────────────
  const showSafety = order.status === 'in_trip' && order.order;

  const sheetHeight = getSheetHeight(order.status);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-background">
      {/* Карта — полноэкранная подложка */}
      <TaxiMap
        center={map.center}
        zoom={map.zoom}
        pickupMarker={map.pickupMarker}
        destinationMarker={map.destinationMarker}
        driverPosition={map.driverPosition}
        driverHeading={map.driverHeading}
        routePoints={map.routePoints}
        nearbyDrivers={map.nearbyDrivers}
        userLocation={map.userLocation}
        showNearbyDrivers={showNearby}
        onCenterOnUser={map.centerOnUser}
        className="absolute inset-0"
      />

      {/* Шапка — кнопки навигации */}
      <div className="absolute top-0 left-0 right-0 z-[900] flex items-center justify-between p-4 pt-safe">
        {/* Кнопка назад */}
        <button
          onClick={() => navigate(-1)}
          className={cn(
            'w-10 h-10 rounded-full bg-white shadow-lg border border-gray-100',
            'flex items-center justify-center',
            'transition-transform active:scale-95'
          )}
          aria-label="Назад"
        >
          <ArrowLeft className="h-5 w-5 text-gray-700" />
        </button>

        {/* Правые кнопки */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/taxi/history')}
            className={cn(
              'w-10 h-10 rounded-full bg-white shadow-lg border border-gray-100',
              'flex items-center justify-center',
              'transition-transform active:scale-95'
            )}
            aria-label="История"
          >
            <History className="h-5 w-5 text-gray-700" />
          </button>
          <button
            onClick={() => navigate('/taxi/settings')}
            className={cn(
              'w-10 h-10 rounded-full bg-white shadow-lg border border-gray-100',
              'flex items-center justify-center',
              'transition-transform active:scale-95'
            )}
            aria-label="Настройки"
          >
            <Settings className="h-5 w-5 text-gray-700" />
          </button>
        </div>
      </div>

      {/* SafetyPanel — только во время поездки */}
      {showSafety && order.order && (
        <div className="absolute top-[4.5rem] left-4 right-4 z-[900]">
          <SafetyPanel orderId={order.order.id} />
        </div>
      )}

      {/* Bottom Sheet — главный UX-элемент */}
      <div
        className={cn(
          'absolute bottom-0 left-0 right-0 z-[800]',
          'bg-background rounded-t-3xl shadow-2xl',
          sheetHeight,
          'transition-all duration-300 ease-out',
          'overflow-hidden'
        )}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </div>

        {/* Контент Bottom Sheet */}
        <div className="px-4 pb-6 overflow-y-auto h-full">
          <OrderBottomSheet
            order={order}
            trackingProgress={tracking.progress}
            trackingEta={tracking.etaMinutes}
            trackingDistanceLeft={tracking.distanceLeft}
            onDriverCall={() => {
              // В production: инициировать звонок через VoIP proxy
              if (order.order?.driver) {
                window.location.href = `tel:${order.order.driver.phone}`;
              }
            }}
            onDriverChat={() => {
              // В production: открыть чат с водителем
            }}
          />
        </div>
      </div>
    </div>
  );
}
