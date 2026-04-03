/**
 * useTripComplaint — хук для отправки жалоб на поездку такси.
 *
 * - submitComplaint(rideId, type, description, photos) — отправка жалобы
 * - complaints — история жалоб текущего пользователя
 * - uploading — индикатор загрузки фото
 * - submitting — индикатор отправки жалобы
 */

import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { supabase, dbLoose } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { logger } from '@/lib/logger';

// ─── Типы ────────────────────────────────────────────────────────────────────

export type ComplaintType =
  | 'rude_driver'
  | 'unsafe_driving'
  | 'wrong_route'
  | 'overcharge'
  | 'dirty_car'
  | 'no_show'
  | 'other';

export type ComplaintStatus = 'submitted' | 'reviewing' | 'resolved' | 'rejected';

export interface TaxiComplaint {
  id: string;
  ride_id: string;
  user_id: string;
  type: ComplaintType;
  description: string | null;
  photos: string[];
  status: ComplaintStatus;
  resolution: string | null;
  created_at: string;
  resolved_at: string | null;
}

const MAX_PHOTOS = 3;
const MAX_PHOTO_SIZE = 5 * 1024 * 1024; // 5 МБ

// ─── Загрузка фото в Storage ─────────────────────────────────────────────────

async function uploadComplaintPhotos(
  userId: string,
  rideId: string,
  files: File[]
): Promise<string[]> {
  const urls: string[] = [];

  for (const file of files.slice(0, MAX_PHOTOS)) {
    if (file.size > MAX_PHOTO_SIZE) {
      toast.error(`Файл "${file.name}" превышает 5 МБ`);
      continue;
    }

    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `taxi-complaints/${userId}/${rideId}/${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from('chat-media')
      .upload(path, file, { upsert: false, contentType: file.type });

    if (uploadErr) {
      logger.error('[useTripComplaint] Ошибка загрузки фото', { path, error: uploadErr });
      toast.error('Не удалось загрузить фото');
      continue;
    }

    const { data: urlData } = supabase.storage.from('chat-media').getPublicUrl(path);
    urls.push(urlData.publicUrl);
  }

  return urls;
}

// ─── Хук ─────────────────────────────────────────────────────────────────────

export function useTripComplaint() {
  const { user } = useAuth();
  const [complaints, setComplaints] = useState<TaxiComplaint[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // ─── Загрузить историю жалоб ────────────────────────────────────────────

  const loadComplaints = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { data, error } = await dbLoose
        .from('taxi_complaints')
        .select('id, ride_id, user_id, type, description, photos, status, resolution, created_at, resolved_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        logger.error('[useTripComplaint] Ошибка загрузки жалоб', { error });
        toast.error('Не удалось загрузить историю жалоб');
        return;
      }

      const mapped: TaxiComplaint[] = (data ?? []).map((row: Record<string, unknown>) => ({
        id: row.id as string,
        ride_id: row.ride_id as string,
        user_id: row.user_id as string,
        type: row.type as ComplaintType,
        description: (row.description as string) ?? null,
        photos: (row.photos as string[]) ?? [],
        status: row.status as ComplaintStatus,
        resolution: (row.resolution as string) ?? null,
        created_at: row.created_at as string,
        resolved_at: (row.resolved_at as string) ?? null,
      }));

      setComplaints(mapped);
    } catch (e) {
      logger.error('[useTripComplaint] Неожиданная ошибка загрузки жалоб', { error: e });
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadComplaints();
  }, [loadComplaints]);

  // ─── Отправка жалобы ───────────────────────────────────────────────────

  const submitComplaint = useCallback(async (
    rideId: string,
    type: ComplaintType,
    description: string,
    photos: File[]
  ): Promise<boolean> => {
    if (!user?.id) {
      toast.error('Необходимо авторизоваться');
      return false;
    }

    setSubmitting(true);
    try {
      // Загружаем фото, если есть
      let photoUrls: string[] = [];
      if (photos.length > 0) {
        setUploading(true);
        photoUrls = await uploadComplaintPhotos(user.id, rideId, photos);
        setUploading(false);
      }

      const { data, error } = await dbLoose
        .from('taxi_complaints')
        .insert({
          ride_id: rideId,
          user_id: user.id,
          type,
          description: description.trim() || null,
          photos: photoUrls,
        })
        .select('id, ride_id, user_id, type, description, photos, status, resolution, created_at, resolved_at')
        .single();

      if (error) {
        logger.error('[useTripComplaint] Ошибка отправки жалобы', { rideId, type, error });
        toast.error('Не удалось отправить жалобу');
        return false;
      }

      const row = data as Record<string, unknown>;
      const newComplaint: TaxiComplaint = {
        id: row.id as string,
        ride_id: row.ride_id as string,
        user_id: row.user_id as string,
        type: row.type as ComplaintType,
        description: (row.description as string) ?? null,
        photos: (row.photos as string[]) ?? [],
        status: row.status as ComplaintStatus,
        resolution: (row.resolution as string) ?? null,
        created_at: row.created_at as string,
        resolved_at: (row.resolved_at as string) ?? null,
      };

      setComplaints((prev) => [newComplaint, ...prev]);
      toast.success('Жалоба отправлена. Мы рассмотрим её в ближайшее время');
      return true;
    } catch (e) {
      logger.error('[useTripComplaint] Неожиданная ошибка отправки жалобы', { error: e });
      toast.error('Произошла ошибка при отправке жалобы');
      return false;
    } finally {
      setUploading(false);
      setSubmitting(false);
    }
  }, [user?.id]);

  return {
    complaints,
    loading,
    uploading,
    submitting,
    submitComplaint,
    refresh: loadComplaints,
  };
}
