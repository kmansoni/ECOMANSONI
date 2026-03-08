import { CheckCircle2, Circle, Package, Truck, Home } from 'lucide-react';

type OrderStatus = 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled';

interface OrderStep {
  status: OrderStatus;
  label: string;
  icon: React.ReactNode;
  date?: string;
}

interface OrderTrackingProps {
  currentStatus: OrderStatus;
  statusDates?: Partial<Record<OrderStatus, string>>;
}

const STEPS: Omit<OrderStep, 'date'>[] = [
  { status: 'pending', label: 'Оформлен', icon: <Circle className="w-5 h-5" /> },
  { status: 'confirmed', label: 'Подтверждён', icon: <CheckCircle2 className="w-5 h-5" /> },
  { status: 'shipped', label: 'Отправлен', icon: <Truck className="w-5 h-5" /> },
  { status: 'delivered', label: 'Доставлен', icon: <Home className="w-5 h-5" /> },
];

const STATUS_ORDER: OrderStatus[] = ['pending', 'confirmed', 'shipped', 'delivered'];

export function OrderTracking({ currentStatus, statusDates = {} }: OrderTrackingProps) {
  const currentIdx = STATUS_ORDER.indexOf(currentStatus);
  const isCancelled = currentStatus === 'cancelled';

  if (isCancelled) {
    return (
      <div className="bg-red-900/20 border border-red-800 rounded-2xl p-4 text-center">
        <p className="text-red-400 font-medium">Заказ отменён</p>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 rounded-2xl p-4">
      <h3 className="text-white font-bold mb-4">Отслеживание заказа</h3>
      <div className="relative">
        {/* Progress line */}
        <div className="absolute left-5 top-5 bottom-5 w-0.5 bg-zinc-700" />
        <div
          className="absolute left-5 top-5 w-0.5 bg-white transition-all duration-700"
          style={{ height: `${(currentIdx / (STEPS.length - 1)) * 100}%` }}
        />

        <div className="space-y-6">
          {STEPS.map((step, idx) => {
            const done = idx <= currentIdx;
            const active = idx === currentIdx;
            return (
              <div key={step.status} className="flex items-start gap-4 relative">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center z-10 transition-colors ${
                  done ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-600'
                } ${active ? 'ring-2 ring-white ring-offset-2 ring-offset-zinc-900' : ''}`}>
                  {step.icon}
                </div>
                <div className="flex-1 pt-1.5">
                  <p className={`text-sm font-medium ${done ? 'text-white' : 'text-zinc-500'}`}>
                    {step.label}
                  </p>
                  {statusDates[step.status] && (
                    <p className="text-zinc-500 text-xs mt-0.5">
                      {new Date(statusDates[step.status]!).toLocaleString('ru-RU')}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
