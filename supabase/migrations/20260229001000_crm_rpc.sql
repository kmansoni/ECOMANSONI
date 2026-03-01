-- CRM RPC Functions for CRUD operations

-- Client functions
CREATE OR REPLACE FUNCTION crm.get_clients(p_profession VARCHAR DEFAULT 'default')
RETURNS SETOF crm.clients AS $$
    SELECT * FROM crm.clients 
    WHERE user_id = auth.uid() 
    AND profession = p_profession
    ORDER BY created_at DESC;
LANGUAGE SQL SECURITY DEFINER;

CREATE OR REPLACE FUNCTION crm.get_client(p_id UUID)
RETURNS SETOF crm.clients AS $$
    SELECT * FROM crm.clients 
    WHERE id = p_id AND user_id = auth.uid();
LANGUAGE SQL SECURITY DEFINER;

CREATE OR REPLACE FUNCTION crm.create_client(
    p_profession VARCHAR DEFAULT 'default',
    p_name VARCHAR,
    p_phone VARCHAR DEFAULT NULL,
    p_email VARCHAR DEFAULT NULL,
    p_telegram_id VARCHAR DEFAULT NULL,
    p_company VARCHAR DEFAULT NULL,
    p_position VARCHAR DEFAULT NULL,
    p_address TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_tags TEXT[] DEFAULT '{}',
    p_custom_fields JSONB DEFAULT '{}'::jsonb
)
RETURNS crm.clients AS $$
    INSERT INTO crm.clients (
        user_id, profession, name, phone, email, telegram_id, 
        company, position, address, notes, tags, custom_fields
    ) VALUES (
        auth.uid(), p_profession, p_name, p_phone, p_email, p_telegram_id,
        p_position, p_address, p_notes, p_tags, p_custom_fields
    )
    RETURNING *;
LANGUAGE SQL SECURITY DEFINER;

CREATE OR REPLACE FUNCTION crm.update_client(
    p_id UUID,
    p_name VARCHAR DEFAULT NULL,
    p_phone VARCHAR DEFAULT NULL,
    p_email VARCHAR DEFAULT NULL,
    p_telegram_id VARCHAR DEFAULT NULL,
    p_company VARCHAR DEFAULT NULL,
    p_position VARCHAR DEFAULT NULL,
    p_address TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_tags TEXT[] DEFAULT NULL,
    p_custom_fields JSONB DEFAULT NULL
)
RETURNS crm.clients AS $$
    UPDATE crm.clients SET
        name = COALESCE(p_name, name),
        phone = COALESCE(p_phone, phone),
        email = COALESCE(p_email, email),
        telegram_id = COALESCE(p_telegram_id, telegram_id),
        company = COALESCE(p_company, company),
        position = COALESCE(p_position, position),
        address = COALESCE(p_address, address),
        notes = COALESCE(p_notes, notes),
        tags = COALESCE(p_tags, tags),
        custom_fields = COALESCE(p_custom_fields, custom_fields),
        updated_at = NOW()
    WHERE id = p_id AND user_id = auth.uid()
    RETURNING *;
LANGUAGE SQL SECURITY DEFINER;

CREATE OR REPLACE FUNCTION crm.delete_client(p_id UUID)
RETURNS BOOLEAN AS $$
    DELETE FROM crm.clients WHERE id = p_id AND user_id = auth.uid();
    RETURNING (NOT EXISTS (SELECT 1 FROM crm.clients WHERE id = p_id));
LANGUAGE SQL SECURITY DEFINER;

-- Deal functions
CREATE OR REPLACE FUNCTION crm.get_deals(p_profession VARCHAR DEFAULT 'default')
RETURNS SETOF crm.deals AS $$
    SELECT * FROM crm.deals 
    WHERE user_id = auth.uid() 
    AND profession = p_profession
    ORDER BY created_at DESC;
LANGUAGE SQL SECURITY DEFINER;

CREATE OR REPLACE FUNCTION crm.get_deal(p_id UUID)
RETURNS SETOF crm.deals AS $$
    SELECT * FROM crm.deals 
    WHERE id = p_id AND user_id = auth.uid();
LANGUAGE SQL SECURITY DEFINER;

CREATE OR REPLACE FUNCTION crm.create_deal(
    p_profession VARCHAR DEFAULT 'default',
    p_client_id UUID DEFAULT NULL,
    p_title VARCHAR,
    p_description TEXT DEFAULT NULL,
    p_value DECIMAL DEFAULT 0,
    p_currency VARCHAR DEFAULT 'RUB',
    p_stage VARCHAR DEFAULT 'new',
    p_probability INTEGER DEFAULT 0,
    p_expected_close_date DATE DEFAULT NULL,
    p_custom_fields JSONB DEFAULT '{}'::jsonb
)
RETURNS crm.deals AS $$
    INSERT INTO crm.deals (
        user_id, profession, client_id, title, description,
        value, currency, stage, probability, expected_close_date, custom_fields
    ) VALUES (
        auth.uid(), p_profession, p_client_id, p_title, p_description,
        p_value, p_currency, p_stage, p_probability, p_expected_close_date, p_custom_fields
    )
    RETURNING *;
LANGUAGE SQL SECURITY DEFINER;

CREATE OR REPLACE FUNCTION crm.update_deal(
    p_id UUID,
    p_client_id UUID DEFAULT NULL,
    p_title VARCHAR DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_value DECIMAL DEFAULT NULL,
    p_currency VARCHAR DEFAULT NULL,
    p_stage VARCHAR DEFAULT NULL,
    p_probability INTEGER DEFAULT NULL,
    p_expected_close_date DATE DEFAULT NULL,
    p_won BOOLEAN DEFAULT NULL,
    p_lost BOOLEAN DEFAULT NULL,
    p_lost_reason TEXT DEFAULT NULL,
    p_custom_fields JSONB DEFAULT NULL
)
RETURNS crm.deals AS $$
    UPDATE crm.deals SET
        client_id = COALESCE(p_client_id, client_id),
        title = COALESCE(p_title, title),
        description = COALESCE(p_description, description),
        value = COALESCE(p_value, value),
        currency = COALESCE(p_currency, currency),
        stage = COALESCE(p_stage, stage),
        probability = COALESCE(p_probability, probability),
        expected_close_date = COALESCE(p_expected_close_date, expected_close_date),
        won = COALESCE(p_won, won),
        lost = COALESCE(p_lost, lost),
        lost_reason = COALESCE(p_lost_reason, lost_reason),
        actual_close_date = CASE 
            WHEN p_won = TRUE AND won = FALSE THEN NOW() 
            ELSE actual_close_date 
        END,
        custom_fields = COALESCE(p_custom_fields, custom_fields),
        updated_at = NOW()
    WHERE id = p_id AND user_id = auth.uid()
    RETURNING *;
LANGUAGE SQL SECURITY DEFINER;

CREATE OR REPLACE FUNCTION crm.delete_deal(p_id UUID)
RETURNS BOOLEAN AS $$
    DELETE FROM crm.deals WHERE id = p_id AND user_id = auth.uid();
    RETURNING (NOT EXISTS (SELECT 1 FROM crm.deals WHERE id = p_id));
LANGUAGE SQL SECURITY DEFINER;

CREATE OR REPLACE FUNCTION crm.get_deals_pipeline(p_profession VARCHAR DEFAULT 'default')
RETURNS TABLE(stage VARCHAR, count BIGINT, total_value DECIMAL) AS $$
    SELECT stage, COUNT(*), COALESCE(SUM(value), 0)::DECIMAL(15,2)
    FROM crm.deals 
    WHERE user_id = auth.uid() AND profession = p_profession AND NOT won AND NOT lost
    GROUP BY stage
    ORDER BY 
        CASE stage
            WHEN 'new' THEN 1
            WHEN 'contacted' THEN 2
            WHEN 'qualified' THEN 3
            WHEN 'proposal' THEN 4
            WHEN 'negotiation' THEN 5
            ELSE 10
        END;
LANGUAGE SQL SECURITY DEFINER;

-- Task functions
CREATE OR REPLACE FUNCTION crm.get_tasks(p_profession VARCHAR DEFAULT 'default', p_status VARCHAR DEFAULT NULL)
RETURNS SETOF crm.tasks AS $$
    SELECT * FROM crm.tasks 
    WHERE user_id = auth.uid() 
    AND profession = p_profession
    AND (p_status IS NULL OR status = p_status)
    ORDER BY 
        CASE priority
            WHEN 'high' THEN 1
            WHEN 'medium' THEN 2
            WHEN 'low' THEN 3
            ELSE 4
        END,
        due_date ASC NULLS LAST,
        created_at DESC;
LANGUAGE SQL SECURITY DEFINER;

CREATE OR REPLACE FUNCTION crm.get_task(p_id UUID)
RETURNS SETOF crm.tasks AS $$
    SELECT * FROM crm.tasks 
    WHERE id = p_id AND user_id = auth.uid();
LANGUAGE SQL SECURITY DEFINER;

CREATE OR REPLACE FUNCTION crm.create_task(
    p_profession VARCHAR DEFAULT 'default',
    p_client_id UUID DEFAULT NULL,
    p_deal_id UUID DEFAULT NULL,
    p_title VARCHAR,
    p_description TEXT DEFAULT NULL,
    p_status VARCHAR DEFAULT 'pending',
    p_priority VARCHAR DEFAULT 'medium',
    p_due_date TIMESTAMPTZ DEFAULT NULL,
    p_reminder_at TIMESTAMPTZ DEFAULT NULL,
    p_custom_fields JSONB DEFAULT '{}'::jsonb
)
RETURNS crm.tasks AS $$
    INSERT INTO crm.tasks (
        user_id, profession, client_id, deal_id, title, description,
        status, priority, due_date, reminder_at, custom_fields
    ) VALUES (
        auth.uid(), p_profession, p_client_id, p_deal_id, p_title, p_description,
        p_status, p_priority, p_due_date, p_reminder_at, p_custom_fields
    )
    RETURNING *;
LANGUAGE SQL SECURITY DEFINER;

CREATE OR REPLACE FUNCTION crm.update_task(
    p_id UUID,
    p_client_id UUID DEFAULT NULL,
    p_deal_id UUID DEFAULT NULL,
    p_title VARCHAR DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_status VARCHAR DEFAULT NULL,
    p_priority VARCHAR DEFAULT NULL,
    p_due_date TIMESTAMPTZ DEFAULT NULL,
    p_reminder_at TIMESTAMPTZ DEFAULT NULL,
    p_custom_fields JSONB DEFAULT NULL
)
RETURNS crm.tasks AS $$
    UPDATE crm.tasks SET
        client_id = COALESCE(p_client_id, client_id),
        deal_id = COALESCE(p_deal_id, deal_id),
        title = COALESCE(p_title, title),
        description = COALESCE(p_description, description),
        status = COALESCE(p_status, status),
        priority = COALESCE(p_priority, priority),
        due_date = COALESCE(p_due_date, due_date),
        reminder_at = COALESCE(p_reminder_at, reminder_at),
        completed_at = CASE WHEN p_status = 'completed' AND status != 'completed' THEN NOW() ELSE completed_at END,
        custom_fields = COALESCE(p_custom_fields, custom_fields),
        updated_at = NOW()
    WHERE id = p_id AND user_id = auth.uid()
    RETURNING *;
LANGUAGE SQL SECURITY DEFINER;

CREATE OR REPLACE FUNCTION crm.complete_task(p_id UUID)
RETURNS crm.tasks AS $$
    UPDATE crm.tasks SET
        status = 'completed',
        completed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_id AND user_id = auth.uid()
    RETURNING *;
LANGUAGE SQL SECURITY DEFINER;

CREATE OR REPLACE FUNCTION crm.delete_task(p_id UUID)
RETURNS BOOLEAN AS $$
    DELETE FROM crm.tasks WHERE id = p_id AND user_id = auth.uid();
    RETURNING (NOT EXISTS (SELECT 1 FROM crm.tasks WHERE id = p_id));
LANGUAGE SQL SECURITY DEFINER;

-- Interaction functions
CREATE OR REPLACE FUNCTION crm.get_interactions(p_client_id UUID DEFAULT NULL, p_type VARCHAR DEFAULT NULL)
RETURNS SETOF crm.interactions AS $$
    SELECT * FROM crm.interactions 
    WHERE user_id = auth.uid()
    AND (p_client_id IS NULL OR client_id = p_client_id)
    AND (p_type IS NULL OR type = p_type)
    ORDER BY created_at DESC
    LIMIT 100;
LANGUAGE SQL SECURITY DEFINER;

CREATE OR REPLACE FUNCTION crm.create_interaction(
    p_profession VARCHAR DEFAULT 'default',
    p_client_id UUID DEFAULT NULL,
    p_deal_id UUID DEFAULT NULL,
    p_type VARCHAR,
    p_direction VARCHAR DEFAULT NULL,
    p_subject VARCHAR DEFAULT NULL,
    p_content TEXT DEFAULT NULL,
    p_duration_seconds INTEGER DEFAULT NULL,
    p_outcome VARCHAR DEFAULT NULL,
    p_next_action TEXT DEFAULT NULL,
    p_custom_fields JSONB DEFAULT '{}'::jsonb
)
RETURNS crm.interactions AS $$
    INSERT INTO crm.interactions (
        user_id, profession, client_id, deal_id, type, direction,
        subject, content, duration_seconds, outcome, next_action, custom_fields
    ) VALUES (
        auth.uid(), p_profession, p_client_id, p_deal_id, p_type, p_direction,
        p_subject, p_content, p_duration_seconds, p_outcome, p_next_action, p_custom_fields
    )
    RETURNING *;
LANGUAGE SQL SECURITY DEFINER;

-- User profile functions
CREATE OR REPLACE FUNCTION crm.get_user_profile(p_profession VARCHAR DEFAULT 'default')
RETURNS SETOF crm.user_profiles AS $$
    SELECT * FROM crm.user_profiles 
    WHERE user_id = auth.uid() AND profession = p_profession;
LANGUAGE SQL SECURITY DEFINER;

CREATE OR REPLACE FUNCTION crm.upsert_user_profile(
    p_profession VARCHAR DEFAULT 'default',
    p_company_name VARCHAR DEFAULT NULL,
    p_settings JSONB DEFAULT NULL
)
RETURNS crm.user_profiles AS $$
    INSERT INTO crm.user_profiles (user_id, profession, company_name, settings)
    VALUES (auth.uid(), p_profession, p_company_name, COALESCE(p_settings, '{}'::jsonb))
    ON CONFLICT (user_id, profession) DO UPDATE SET
        company_name = COALESCE(p_company_name, user_profiles.company_name),
        settings = COALESCE(p_settings, user_profiles.settings),
        updated_at = NOW()
    RETURNING *;
LANGUAGE SQL SECURITY DEFINER;

-- Profession config functions
CREATE OR REPLACE FUNCTION crm.get_profession_config(p_profession VARCHAR)
RETURNS SETOF crm.profession_configs AS $$
    SELECT * FROM crm.profession_configs 
    WHERE profession = p_profession;
LANGUAGE SQL SECURITY DEFINER;

CREATE OR REPLACE FUNCTION crm.get_all_profession_configs()
RETURNS SETOF crm.profession_configs AS $$
    SELECT * FROM crm.profession_configs ORDER BY display_name;
LANGUAGE SQL SECURITY DEFINER;

-- Dashboard stats function
CREATE OR REPLACE FUNCTION crm.get_dashboard_stats(p_profession VARCHAR DEFAULT 'default')
RETURNS TABLE(
    total_clients BIGINT,
    active_deals BIGINT,
    won_deals BIGINT,
    total_deals_value DECIMAL,
    pending_tasks BIGINT,
    overdue_tasks BIGINT,
    completed_tasks_this_week BIGINT
) AS $$
    SELECT 
        (SELECT COUNT(*) FROM crm.clients WHERE user_id = auth.uid() AND profession = p_profession)::BIGINT,
        (SELECT COUNT(*) FROM crm.deals WHERE user_id = auth.uid() AND profession = p_profession AND NOT won AND NOT lost)::BIGINT,
        (SELECT COUNT(*) FROM crm.deals WHERE user_id = auth.uid() AND profession = p_profession AND won)::BIGINT,
        (SELECT COALESCE(SUM(value), 0) FROM crm.deals WHERE user_id = auth.uid() AND profession = p_profession AND won)::DECIMAL(15,2),
        (SELECT COUNT(*) FROM crm.tasks WHERE user_id = auth.uid() AND profession = p_profession AND status = 'pending')::BIGINT,
        (SELECT COUNT(*) FROM crm.tasks WHERE user_id = auth.uid() AND profession = p_profession AND status = 'pending' AND due_date < NOW())::BIGINT,
        (SELECT COUNT(*) FROM crm.tasks WHERE user_id = auth.uid() AND profession = p_profession AND status = 'completed' AND completed_at >= NOW() - INTERVAL '7 days')::BIGINT;
LANGUAGE SQL SECURITY DEFINER;

-- Link chat conversation to client
CREATE OR REPLACE FUNCTION crm.link_client_to_conversation(
    p_client_id UUID,
    p_conversation_id UUID
)
RETURNS crm.clients AS $$
    UPDATE crm.clients SET
        messenger_conversation_id = p_conversation_id,
        updated_at = NOW()
    WHERE id = p_client_id AND user_id = auth.uid()
    RETURNING *;
LANGUAGE SQL SECURITY DEFINER;

-- Get client by conversation
CREATE OR REPLACE FUNCTION crm.get_client_by_conversation(p_conversation_id UUID)
RETURNS SETOF crm.clients AS $$
    SELECT * FROM crm.clients 
    WHERE messenger_conversation_id = p_conversation_id
    AND user_id = auth.uid();
LANGUAGE SQL SECURITY DEFINER;
