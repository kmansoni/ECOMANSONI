#!/usr/bin/env node
/**
 * Phone Auth Service Initialization Script
 * 
 * Usage: node init.js
 * 
 * Initializes the phone-auth service by:
 * 1. Verifying environment variables
 * 2. Testing database connection
 * 3. Running database migrations
 * 4. Starting the service
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Color output helpers
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(color, label, message) {
  console.log(`${color}${label}${colors.reset} ${message}`);
}

function logSuccess(message) {
  log(colors.green, '✓', message);
}

function logError(message) {
  log(colors.red, '✗', message);
}

function logWarn(message) {
  log(colors.yellow, '⚠', message);
}

function logInfo(message) {
  log(colors.blue, 'ℹ', message);
}

function logSection(title) {
  console.log(`\n${colors.cyan}${colors.bright}${title}${colors.reset}\n`);
}

// === Check Environment Variables ===

async function checkEnvironment() {
  logSection('1. Checking Environment Variables');

  const required = ['DATABASE_URL', 'JWT_SECRET'];
  const optional = ['PHONE_AUTH_PORT', 'OTP_VALIDITY_SEC', 'SMS_PROVIDER', 'CORS_ALLOWED_ORIGINS'];
  const missing = [];

  for (const env of required) {
    if (process.env[env]) {
      logSuccess(`${env} is set`);
    } else {
      logError(`${env} is missing`);
      missing.push(env);
    }
  }

  for (const env of optional) {
    if (process.env[env]) {
      logSuccess(`${env} = ${process.env[env]}`);
    } else {
      logWarn(`${env} not set (using default)`);
    }
  }

  if (missing.length > 0) {
    logError(`Missing required environment variables: ${missing.join(', ')}`);
    logInfo('Create a .env.local file in this directory with:');
    console.log(`  DATABASE_URL=postgresql://user:password@host:port/db`);
    console.log(`  JWT_SECRET=$(openssl rand -base64 32)`);
    process.exit(1);
  }

  return true;
}

// === Test Database Connection ===

async function testDatabaseConnection() {
  logSection('2. Testing Database Connection');

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const result = await pool.query('SELECT NOW()');
    logSuccess(`Connected to database`);
    logInfo(`Current time on server: ${result.rows[0].now}`);
    await pool.end();
    return true;
  } catch (error) {
    logError(`Failed to connect to database: ${error.message}`);
    logInfo('Ensure that:');
    console.log(`  - DATABASE_URL is correct`);
    console.log(`  - PostgreSQL server is running`);
    console.log(`  - Network access to server is allowed`);
    process.exit(1);
  }
}

// === Run Database Migrations ===

async function runMigrations() {
  logSection('3. Running Database Migrations');

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const migrations = [
    {
      name: 'users table',
      sql: `
        CREATE TABLE IF NOT EXISTS users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          phone VARCHAR(20) NOT NULL UNIQUE,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL,
          last_login_at TIMESTAMP WITH TIME ZONE,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
        CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC);
      `
    },
    {
      name: 'otp_audit_log table',
      sql: `
        CREATE TABLE IF NOT EXISTS otp_audit_log (
          id BIGSERIAL PRIMARY KEY,
          phone VARCHAR(20) NOT NULL,
          action VARCHAR(50) NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          ip_address INET,
          user_agent TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_otp_audit_phone ON otp_audit_log(phone);
        CREATE INDEX IF NOT EXISTS idx_otp_audit_created_at ON otp_audit_log(created_at DESC);
      `
    },
    {
      name: 'revoked_tokens table',
      sql: `
        CREATE TABLE IF NOT EXISTS revoked_tokens (
          token_hash VARCHAR(64) PRIMARY KEY,
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          revoked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_revoked_tokens_user ON revoked_tokens(user_id);
        CREATE INDEX IF NOT EXISTS idx_revoked_tokens_revoked_at ON revoked_tokens(revoked_at DESC);
      `
    }
  ];

  try {
    for (const migration of migrations) {
      await pool.query(migration.sql);
      logSuccess(`Created ${migration.name}`);
    }

    // Verify tables
    const result = await pool.query(
      `SELECT table_name FROM information_schema.tables 
       WHERE table_schema = 'public' AND table_name IN ('users', 'otp_audit_log', 'revoked_tokens')`
    );

    logInfo(`Database has ${result.rows.length} required tables:`);
    result.rows.forEach(row => console.log(`  - ${row.table_name}`));

    await pool.end();
    return true;
  } catch (error) {
    logError(`Migration failed: ${error.message}`);
    logInfo('Check that the database user has proper permissions');
    process.exit(1);
  }
}

// === Display Next Steps ===

function displayNextSteps() {
  logSection('4. Initialization Complete!');

  logSuccess('All checks passed ✓');

  console.log(`\n${colors.bright}Next Steps:${colors.reset}\n`);
  console.log(`1. Start the service:`);
  console.log(`   npm run dev\n`);
  console.log(`2. The service will listen on http://localhost:${process.env.PHONE_AUTH_PORT || 3000}\n`);
  console.log(`3. Test the health endpoint:`);
  console.log(`   curl http://localhost:${process.env.PHONE_AUTH_PORT || 3000}/health\n`);
  console.log(`4. Test OTP request:`);
  console.log(`   curl -X POST http://localhost:${process.env.PHONE_AUTH_PORT || 3000}/auth/phone/request-otp \\`);
  console.log(`     -H "Content-Type: application/json" \\`);
  console.log(`     -d '{"phone": "+79991234567"}'\n`);
  console.log(`5. For production deployment, see TIMEWEB_AUTH_MIGRATION.md\n`);
}

// === Main ===

async function main() {
  console.log(`\n${colors.cyan}${colors.bright}Phone Auth Service Initialization${colors.reset}\n`);

  try {
    await checkEnvironment();
    await testDatabaseConnection();
    await runMigrations();
    displayNextSteps();
  } catch (error) {
    logError(`Initialization failed: ${error.message}`);
    process.exit(1);
  }
}

main();
