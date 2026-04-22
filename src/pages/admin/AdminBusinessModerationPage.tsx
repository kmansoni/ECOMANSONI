/**
 * AdminBusinessModerationPage — Admin page for moderating business registrations.
 * Allows admins to approve or reject business registration requests.
 */
import { useEffect, useState, useCallback } from 'react';
import { ArrowLeft, Building2, Check, X, Clock, Eye, Filter, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { supabase, dbLoose } from '@/lib/supabase';
import { toast } from 'sonner';

interface BusinessRegistration {
  id: string;
  user_id: string;
  business_type: 'ip' | 'ooo' | 'self_employed';
  name: string;
  legal_name: string | null;
  inn: string;
  ogrn: string | null;
  address: string;
  lat: number | null;
  lng: number | null;
  phone: string;
  website: string | null;
  email: string | null;
  category: string;
  description: string | null;
  working_hours: string | null;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason: string | null;
  created_at: string;
}

const STATUS_LABELS = {
  pending: { label: 'На модерации', color: 'text-yellow-400', bg: 'bg-yellow-500/20' },
  approved: { label: 'Одобрено', color: 'text-green-400', bg: 'bg-green-500/20' },
  rejected: { label: 'Отклонено', color: 'text-red-400', bg: 'bg-red-500/20' },
};

const BIZ_TYPE_LABELS = { ip: 'ИП', ooo: 'ООО', self_employed: 'Самозанятый' };

export function AdminBusinessModerationPage() {
  const routerNav = useNavigate();
  const [registrations, setRegistrations] = useState<BusinessRegistration[]>([]);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const fetchRegistrations = useCallback(async () => {
    setLoading(true);
    try {
      let query = dbLoose
        .from('business_registrations')
        .select('*')
        .order('created_at', { ascending: false });

      if (filter !== 'all') {
        query = query.eq('status', filter);
      }

      const { data, error } = await query;
      if (error) throw error;
      setRegistrations((data as BusinessRegistration[] | null) || []);
    } catch (err: any) {
      toast.error(`Ошибка загрузки: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { fetchRegistrations(); }, [fetchRegistrations]);

  const handleApprove = async (id: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await dbLoose
        .from('business_registrations')
        .update({
          status: 'approved',
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;
      toast.success('Бизнес одобрен');
      fetchRegistrations();
      setSelectedId(null);
    } catch (err: any) {
      toast.error(`Ошибка: ${err.message}`);
    }
  };

  const handleReject = async (id: string) => {
    if (!rejectReason.trim()) {
      toast.error('Укажите причину отклонения');
      return;
    }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await dbLoose
        .from('business_registrations')
        .update({
          status: 'rejected',
          rejection_reason: rejectReason,
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;
      toast.success('Заявка отклонена');
      fetchRegistrations();
      setSelectedId(null);
      setRejectReason('');
    } catch (err: any) {
      toast.error(`Ошибка: ${err.message}`);
    }
  };

  const selected = registrations.find(r => r.id === selectedId);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="sticky top-0 z-50 flex items-center gap-3 p-4 bg-gray-950/90 backdrop-blur-md border-b border-white/5">
        <button onClick={() => routerNav(-1)} className="p-2 -ml-2 rounded-lg hover:bg-white/5">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <Building2 className="h-5 w-5 text-blue-400" />
        <h1 className="text-lg font-semibold">Модерация бизнесов</h1>
        <button onClick={fetchRegistrations} className="ml-auto p-2 rounded-lg hover:bg-white/5">
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </button>
      </header>

      {/* Filter tabs */}
      <div className="flex gap-2 p-3 border-b border-white/5 overflow-x-auto">
        {(['all', 'pending', 'approved', 'rejected'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors',
              filter === f ? 'bg-blue-500 text-white' : 'bg-white/10 text-gray-300'
            )}
          >
            {f === 'all' ? 'Все' : STATUS_LABELS[f].label}
            {f === 'pending' && registrations.filter(r => r.status === 'pending').length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-yellow-500/30 rounded-full text-xs">
                {registrations.filter(r => r.status === 'pending').length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="p-4 space-y-3">
        {loading && <p className="text-gray-500 text-center py-8">Загрузка...</p>}
        {!loading && registrations.length === 0 && (
          <p className="text-gray-500 text-center py-8">Нет заявок</p>
        )}

        {registrations.map((reg) => {
          const status = STATUS_LABELS[reg.status];
          return (
            <button
              key={reg.id}
              onClick={() => setSelectedId(selectedId === reg.id ? null : reg.id)}
              className={cn(
                'w-full text-left p-4 rounded-xl transition-all',
                'bg-white/5 border border-white/10 hover:bg-white/10',
                selectedId === reg.id && 'border-blue-500/40 bg-blue-500/5'
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold truncate">{reg.name}</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-white/10">{BIZ_TYPE_LABELS[reg.business_type]}</span>
                  </div>
                  <p className="text-sm text-gray-400 truncate">{reg.category} · {reg.address}</p>
                  <p className="text-xs text-gray-500 mt-1">ИНН: {reg.inn} · {new Date(reg.created_at).toLocaleDateString('ru')}</p>
                </div>
                <span className={cn('text-xs px-2 py-1 rounded-full whitespace-nowrap', status.bg, status.color)}>
                  {status.label}
                </span>
              </div>

              {/* Expanded details */}
              {selectedId === reg.id && (
                <div className="mt-4 pt-4 border-t border-white/10 space-y-3" onClick={e => e.stopPropagation()}>
                  <DetailRow label="Юр. название" value={reg.legal_name} />
                  <DetailRow label="ОГРН" value={reg.ogrn} />
                  <DetailRow label="Телефон" value={reg.phone} />
                  <DetailRow label="Сайт" value={reg.website} />
                  <DetailRow label="Email" value={reg.email} />
                  <DetailRow label="Часы работы" value={reg.working_hours} />
                  <DetailRow label="Описание" value={reg.description} />

                  {reg.status === 'pending' && (
                    <div className="flex flex-col gap-3 mt-4">
                      <button
                        onClick={() => handleApprove(reg.id)}
                        className="w-full py-2.5 rounded-xl bg-green-600 hover:bg-green-500 text-white font-medium flex items-center justify-center gap-2"
                      >
                        <Check className="h-4 w-4" /> Одобрить
                      </button>

                      <textarea
                        placeholder="Причина отклонения..."
                        value={rejectReason}
                        onChange={e => setRejectReason(e.target.value)}
                        className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 resize-none h-16 text-sm"
                        maxLength={300}
                      />
                      <button
                        onClick={() => handleReject(reg.id)}
                        className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-medium flex items-center justify-center gap-2"
                      >
                        <X className="h-4 w-4" /> Отклонить
                      </button>
                    </div>
                  )}

                  {reg.status === 'rejected' && reg.rejection_reason && (
                    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                      <p className="text-xs text-red-400 font-medium mb-1">Причина отклонения:</p>
                      <p className="text-sm text-red-300">{reg.rejection_reason}</p>
                    </div>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex gap-2 text-sm">
      <span className="text-gray-500 shrink-0 w-28">{label}:</span>
      <span className="text-gray-300 break-words">{value}</span>
    </div>
  );
}
