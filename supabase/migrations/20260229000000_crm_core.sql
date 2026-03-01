-- CRM Core Schema
-- Universal CRM for messenger with profession-specific modules

-- Create CRM schema
CREATE SCHEMA IF NOT EXISTS crm;

-- Table: crm.user_profiles
-- Stores CRM-specific profile for each user
CREATE TABLE crm.user_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    profession VARCHAR(100) NOT NULL DEFAULT 'default',
    company_name VARCHAR(255),
    settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, profession)
);

-- Table: crm.clients
-- Stores client information
CREATE TABLE crm.clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    profession VARCHAR(100) NOT NULL DEFAULT 'default',
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    email VARCHAR(255),
    telegram_id VARCHAR(100),
    company VARCHAR(255),
    position VARCHAR(255),
    address TEXT,
    notes TEXT,
    tags TEXT[] DEFAULT '{}',
    custom_fields JSONB DEFAULT '{}'::jsonb,
    messenger_conversation_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: crm.deals
-- Stores deal/sales pipeline information
CREATE TABLE crm.deals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    client_id UUID REFERENCES crm.clients(id) ON DELETE SET NULL,
    profession VARCHAR(100) NOT NULL DEFAULT 'default',
    title VARCHAR(255) NOT NULL,
    description TEXT,
    value DECIMAL(15, 2) DEFAULT 0,
    currency VARCHAR(10) DEFAULT 'RUB',
    stage VARCHAR(50) NOT NULL DEFAULT 'new',
    probability INTEGER DEFAULT 0,
    expected_close_date DATE,
    actual_close_date DATE,
    won BOOLEAN DEFAULT FALSE,
    lost BOOLEAN DEFAULT FALSE,
    lost_reason TEXT,
    custom_fields JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: crm.tasks
-- Stores tasks/todos
CREATE TABLE crm.tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    client_id UUID REFERENCES crm.clients(id) ON DELETE SET NULL,
    deal_id UUID REFERENCES crm.deals(id) ON DELETE SET NULL,
    profession VARCHAR(100) NOT NULL DEFAULT 'default',
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    priority VARCHAR(20) DEFAULT 'medium',
    due_date TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    reminder_at TIMESTAMPTZ,
    custom_fields JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: crm.interactions
-- Stores client interactions (calls, messages, meetings)
CREATE TABLE crm.interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    client_id UUID REFERENCES crm.clients(id) ON DELETE SET NULL,
    deal_id UUID REFERENCES crm.deals(id) ON DELETE SET NULL,
    profession VARCHAR(100) NOT NULL DEFAULT 'default',
    type VARCHAR(50) NOT NULL,
    direction VARCHAR(20),
    subject VARCHAR(255),
    content TEXT,
    duration_seconds INTEGER,
    outcome VARCHAR(100),
    next_action TEXT,
    custom_fields JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: crm.profession_configs
-- Stores profession-specific configurations
CREATE TABLE crm.profession_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profession VARCHAR(100) NOT NULL UNIQUE,
    display_name VARCHAR(255) NOT NULL,
    icon VARCHAR(100),
    color VARCHAR(20),
    pipeline_stages JSONB NOT NULL DEFAULT '["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost"]'::jsonb,
    custom_fields JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_crm_clients_user_id ON crm.clients(user_id);
CREATE INDEX idx_crm_clients_profession ON crm.clients(profession);
CREATE INDEX idx_crm_deals_user_id ON crm.deals(user_id);
CREATE INDEX idx_crm_deals_client_id ON crm.deals(client_id);
CREATE INDEX idx_crm_deals_stage ON crm.deals(stage);
CREATE INDEX idx_crm_tasks_user_id ON crm.tasks(user_id);
CREATE INDEX idx_crm_tasks_client_id ON crm.tasks(client_id);
CREATE INDEX idx_crm_tasks_status ON crm.tasks(status);
CREATE INDEX idx_crm_tasks_due_date ON crm.tasks(due_date);
CREATE INDEX idx_crm_interactions_user_id ON crm.interactions(user_id);
CREATE INDEX idx_crm_interactions_client_id ON crm.interactions(client_id);
CREATE INDEX idx_crm_interactions_type ON crm.interactions(type);

-- Enable Row Level Security
ALTER TABLE crm.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.profession_configs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_profiles
CREATE POLICY "Users can view own CRM profile" ON crm.user_profiles
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own CRM profile" ON crm.user_profiles
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own CRM profile" ON crm.user_profiles
    FOR UPDATE USING (auth.uid() = user_id);

-- RLS Policies for clients
CREATE POLICY "Users can view own clients" ON crm.clients
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own clients" ON crm.clients
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own clients" ON crm.clients
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own clients" ON crm.clients
    FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for deals
CREATE POLICY "Users can view own deals" ON crm.deals
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own deals" ON crm.deals
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own deals" ON crm.deals
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own deals" ON crm.deals
    FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for tasks
CREATE POLICY "Users can view own tasks" ON crm.tasks
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own tasks" ON crm.tasks
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tasks" ON crm.tasks
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own tasks" ON crm.tasks
    FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for interactions
CREATE POLICY "Users can view own interactions" ON crm.interactions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own interactions" ON crm.interactions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own interactions" ON crm.interactions
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own interactions" ON crm.interactions
    FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for profession_configs (read-only for all authenticated users)
CREATE POLICY "Authenticated users can view profession configs" ON crm.profession_configs
    FOR SELECT USING (auth.role() = 'authenticated');

-- Seed default profession configs
INSERT INTO crm.profession_configs (profession, display_name, icon, color, pipeline_stages) VALUES
    ('default', 'Универсальная CRM', 'briefcase', '#6B7280', '["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost"]'::jsonb),
    ('auto', 'Авто бизнес', 'car', '#3B82F6', '["new", "test_drive", "credit_approval", "deal", "completed", "lost"]'::jsonb),
    ('realestate', 'Недвижимость', 'home', '#10B981', '["new", "viewing", "negotiation", "contract", "completed", "lost"]'::jsonb),
    ('hr', 'HR / Рекрутинг', 'users', '#8B5CF6', '["new", "screening", "interview", "offer", "hired", "rejected"]'::jsonb),
    ('smm', 'SMM / Маркетинг', 'trending-up', '#EC4899', '["new", "brief", "content", "review", "approved", "published"]'::jsonb),
    ('finance', 'Финансы / Бухгалтерия', 'calculator', '#F59E0B', '["new", "analysis", "proposal", "approval", "signed", "lost"]'::jsonb),
    ('medicine', 'Медицина', 'stethoscope', '#EF4444', '["new", "consultation", "diagnosis", "treatment", "follow-up", "completed"]'::jsonb),
    ('education', 'Образование', 'graduation-cap', '#6366F1', '["new", "enquiry", "demo", "enrollment", "active", "completed"]'::jsonb),
    ('beauty', 'Салоны красоты', 'scissors', '#F472B6', '["new", "consultation", "booking", "service", "follow-up", "completed"]'::jsonb),
    ('restaurant', 'Ресторан / Общепит', 'utensils', '#F97316', '["new", "inquiry", "proposal", "contract", "active", "completed"]'::jsonb),
    ('tourism', 'Туризм', 'plane', '#06B6D4', '["new", "consultation", "booking", "payment", "confirmed", "completed"]'::jsonb)
ON CONFLICT (profession) DO NOTHING;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION crm.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_crm_user_profiles_updated_at 
    BEFORE UPDATE ON crm.user_profiles 
    FOR EACH ROW EXECUTE FUNCTION crm.update_updated_at_column();

CREATE TRIGGER update_crm_clients_updated_at 
    BEFORE UPDATE ON crm.clients 
    FOR EACH ROW EXECUTE FUNCTION crm.update_updated_at_column();

CREATE TRIGGER update_crm_deals_updated_at 
    BEFORE UPDATE ON crm.deals 
    FOR EACH ROW EXECUTE FUNCTION crm.update_updated_at_column();

CREATE TRIGGER update_crm_tasks_updated_at 
    BEFORE UPDATE ON crm.tasks 
    FOR EACH ROW EXECUTE FUNCTION crm.update_updated_at_column();

CREATE TRIGGER update_crm_profession_configs_updated_at 
    BEFORE UPDATE ON crm.profession_configs 
    FOR EACH ROW EXECUTE FUNCTION crm.update_updated_at_column();

-- Comment on schema
COMMENT ON SCHEMA crm IS 'Universal CRM system for messenger with profession-specific modules';
