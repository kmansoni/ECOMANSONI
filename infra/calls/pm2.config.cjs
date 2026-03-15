// PM2 ecosystem config for calls-ws gateway
// Usage:
//   pm2 start infra/calls/pm2.config.cjs --env production
//   pm2 save
//   pm2 startup  (to enable on boot)
'use strict';

module.exports = {
  apps: [
    {
      name: 'calls-ws',
      script: 'server/calls-ws/index.mjs',
      cwd: '/opt/mansoni/app',

      // Single instance (calls-ws is stateful per room — horizontal scaling
      // requires a shared Redis store which is configured in env)
      instances: 1,
      exec_mode: 'fork',

      // Auto-restart on crash
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',

      // How long to wait before considering the app up
      listen_timeout: 10000,
      kill_timeout: 5000,

      // Production environment variables
      // Secrets (SUPABASE_URL, SUPABASE_ANON_KEY) must be injected via .env.production
      // or set in the OS environment before calling `pm2 start`
      env_production: {
        NODE_ENV: 'production',
        ENV: 'production',
        CALLS_WS_PORT: '8787',
        REDIS_URL: 'redis://127.0.0.1:6379',
        CALLS_WS_TRUSTED_PROXIES: '127.0.0.1',
      },

      // Logging
      out_file: '/var/log/mansoni/calls-ws.log',
      error_file: '/var/log/mansoni/calls-ws-error.log',
      merge_logs: true,
      time: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
