-- Расширяем enum категорий страхования
ALTER TYPE public.insurance_category ADD VALUE IF NOT EXISTS 'osago';
ALTER TYPE public.insurance_category ADD VALUE IF NOT EXISTS 'kasko';
ALTER TYPE public.insurance_category ADD VALUE IF NOT EXISTS 'mini_kasko';
ALTER TYPE public.insurance_category ADD VALUE IF NOT EXISTS 'mortgage';
ALTER TYPE public.insurance_category ADD VALUE IF NOT EXISTS 'dms';
ALTER TYPE public.insurance_category ADD VALUE IF NOT EXISTS 'osgop'