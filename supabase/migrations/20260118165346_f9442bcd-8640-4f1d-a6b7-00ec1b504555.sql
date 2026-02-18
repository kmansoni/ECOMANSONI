-- =====================================================
-- CORE TABLES - Shared across all services
-- =====================================================

-- App roles enum
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

-- User profiles (extends auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User roles for RBAC
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

-- =====================================================
-- REAL ESTATE SERVICE
-- =====================================================

-- Property types enum
CREATE TYPE public.property_type AS ENUM ('apartment', 'house', 'room', 'commercial', 'land');
CREATE TYPE public.deal_type AS ENUM ('sale', 'rent', 'daily');
CREATE TYPE public.property_status AS ENUM ('active', 'sold', 'rented', 'inactive');

-- Properties table
CREATE TABLE public.properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  property_type property_type NOT NULL,
  deal_type deal_type NOT NULL,
  status property_status NOT NULL DEFAULT 'active',
  price DECIMAL(15, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'RUB',
  
  -- Location
  city TEXT NOT NULL,
  district TEXT,
  address TEXT,
  metro_station TEXT,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  
  -- Characteristics
  rooms INTEGER,
  floor INTEGER,
  total_floors INTEGER,
  area_total DECIMAL(10, 2),
  area_living DECIMAL(10, 2),
  area_kitchen DECIMAL(10, 2),
  
  -- Features
  has_balcony BOOLEAN DEFAULT false,
  has_parking BOOLEAN DEFAULT false,
  has_furniture BOOLEAN DEFAULT false,
  is_new_building BOOLEAN DEFAULT false,
  
  -- Verification
  is_verified BOOLEAN DEFAULT false,
  is_from_owner BOOLEAN DEFAULT false,
  
  -- Stats
  views_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Property images
CREATE TABLE public.property_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  is_primary BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Property favorites
CREATE TABLE public.property_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, property_id)
);

-- Property views (for analytics)
CREATE TABLE public.property_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================
-- INSURANCE SERVICE
-- =====================================================

-- Insurance category enum
CREATE TYPE public.insurance_category AS ENUM ('auto', 'health', 'property', 'travel', 'life');
CREATE TYPE public.policy_status AS ENUM ('pending', 'active', 'expired', 'cancelled');

-- Insurance companies
CREATE TABLE public.insurance_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  logo_url TEXT,
  rating DECIMAL(2, 1),
  is_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insurance products (templates offered by companies)
CREATE TABLE public.insurance_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.insurance_companies(id) ON DELETE CASCADE,
  category insurance_category NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  features JSONB DEFAULT '[]'::jsonb,
  coverage_amount DECIMAL(15, 2),
  price_from DECIMAL(10, 2) NOT NULL,
  is_popular BOOLEAN DEFAULT false,
  badge TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User insurance policies (purchased by users)
CREATE TABLE public.insurance_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.insurance_products(id) ON DELETE RESTRICT,
  policy_number TEXT NOT NULL UNIQUE,
  status policy_status NOT NULL DEFAULT 'pending',
  
  -- Policy details
  insured_name TEXT NOT NULL,
  insured_phone TEXT,
  insured_email TEXT,
  
  -- Dates
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  
  -- Payment
  premium_amount DECIMAL(10, 2) NOT NULL,
  paid_at TIMESTAMPTZ,
  
  -- Document
  document_url TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insurance claims
CREATE TABLE public.insurance_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES public.insurance_policies(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  claim_number TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  claim_amount DECIMAL(10, 2),
  status TEXT NOT NULL DEFAULT 'submitted',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Security definer function for role checking
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Apply updated_at triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_properties_updated_at BEFORE UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_insurance_products_updated_at BEFORE UPDATE ON public.insurance_products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_insurance_policies_updated_at BEFORE UPDATE ON public.insurance_policies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insurance_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insurance_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insurance_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insurance_claims ENABLE ROW LEVEL SECURITY;

-- PROFILES POLICIES
CREATE POLICY "Users can view all profiles" ON public.profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = user_id);

-- USER ROLES POLICIES (admin only can manage)
CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage roles" ON public.user_roles
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- PROPERTIES POLICIES
CREATE POLICY "Anyone can view active properties" ON public.properties
  FOR SELECT USING (status = 'active');

CREATE POLICY "Owners can view own properties" ON public.properties
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Users can create properties" ON public.properties
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners can update own properties" ON public.properties
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Owners can delete own properties" ON public.properties
  FOR DELETE USING (auth.uid() = owner_id);

-- PROPERTY IMAGES POLICIES
CREATE POLICY "Anyone can view property images" ON public.property_images
  FOR SELECT USING (true);

CREATE POLICY "Property owners can manage images" ON public.property_images
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.properties p 
      WHERE p.id = property_id AND p.owner_id = auth.uid()
    )
  );

-- PROPERTY FAVORITES POLICIES
CREATE POLICY "Users can view own favorites" ON public.property_favorites
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can add favorites" ON public.property_favorites
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove own favorites" ON public.property_favorites
  FOR DELETE USING (auth.uid() = user_id);

-- PROPERTY VIEWS POLICIES
CREATE POLICY "Anyone can record views" ON public.property_views
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Property owners can view stats" ON public.property_views
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.properties p 
      WHERE p.id = property_id AND p.owner_id = auth.uid()
    )
  );

-- INSURANCE COMPANIES POLICIES (public read)
CREATE POLICY "Anyone can view insurance companies" ON public.insurance_companies
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage companies" ON public.insurance_companies
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- INSURANCE PRODUCTS POLICIES (public read)
CREATE POLICY "Anyone can view insurance products" ON public.insurance_products
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage products" ON public.insurance_products
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- INSURANCE POLICIES (user-specific)
CREATE POLICY "Users can view own policies" ON public.insurance_policies
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create policies" ON public.insurance_policies
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own policies" ON public.insurance_policies
  FOR UPDATE USING (auth.uid() = user_id);

-- INSURANCE CLAIMS POLICIES
CREATE POLICY "Users can view own claims" ON public.insurance_claims
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can submit claims" ON public.insurance_claims
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own claims" ON public.insurance_claims
  FOR UPDATE USING (auth.uid() = user_id);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

CREATE INDEX idx_properties_city ON public.properties(city);
CREATE INDEX idx_properties_type ON public.properties(property_type);
CREATE INDEX idx_properties_deal_type ON public.properties(deal_type);
CREATE INDEX idx_properties_status ON public.properties(status);
CREATE INDEX idx_properties_price ON public.properties(price);
CREATE INDEX idx_properties_owner ON public.properties(owner_id);

CREATE INDEX idx_property_images_property ON public.property_images(property_id);
CREATE INDEX idx_property_favorites_user ON public.property_favorites(user_id);
CREATE INDEX idx_property_favorites_property ON public.property_favorites(property_id);

CREATE INDEX idx_insurance_products_category ON public.insurance_products(category);
CREATE INDEX idx_insurance_products_company ON public.insurance_products(company_id);
CREATE INDEX idx_insurance_policies_user ON public.insurance_policies(user_id);
CREATE INDEX idx_insurance_policies_status ON public.insurance_policies(status);
CREATE INDEX idx_insurance_claims_policy ON public.insurance_claims(policy_id);