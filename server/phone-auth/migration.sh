#!/bin/bash
# Database migration for phone-auth service
# Run this on Timeweb PostgreSQL before deploying phone-auth service

psql "${DATABASE_URL}" <<EOF

-- Create users table for phone authentication
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone VARCHAR(20) NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  last_login_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_last_login_at ON users(last_login_at DESC);

-- Create OTP audit log table (for production: track OTP requests/attempts)
CREATE TABLE IF NOT EXISTS otp_audit_log (
  id BIGSERIAL PRIMARY KEY,
  phone VARCHAR(20) NOT NULL,
  action VARCHAR(50) NOT NULL, -- 'requested', 'verified', 'expired', 'max_attempts'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  ip_address INET,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_otp_audit_phone ON otp_audit_log(phone);
CREATE INDEX IF NOT EXISTS idx_otp_audit_created_at ON otp_audit_log(created_at DESC);

-- Create JWT token revocation table (for production: support logout)
CREATE TABLE IF NOT EXISTS revoked_tokens (
  token_hash VARCHAR(64) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  revoked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_revoked_tokens_user ON revoked_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_revoked_tokens_revoked_at ON revoked_tokens(revoked_at DESC);

-- RLS policy for users table (if using Timeweb managed PostgreSQL)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Allow users to read their own data
CREATE POLICY "Users can read own data"
  ON users FOR SELECT
  USING (id = current_user_id());  -- Note: Requires JWT claim integration

COMMIT;

-- Verify schema
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' AND table_name IN ('users', 'otp_audit_log', 'revoked_tokens');

EOF

echo "Database migration completed!"
