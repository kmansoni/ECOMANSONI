// PM2 ecosystem config for calls-ws gateway + SFU
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

    {
      name: 'sfu',
      script: 'server/sfu/index.mjs',
      cwd: '/opt/mansoni/app',

      instances: 1,
      exec_mode: 'fork',

      autorestart: true,
      watch: false,
      // mediasoup workers потребляют ~200 МБ на воркер; 1 ГБ хватает для 2-4 воркеров
      max_memory_restart: '1024M',

      listen_timeout: 15000,
      kill_timeout: 10000,

      // Секреты и SFU_ANNOUNCED_IP берутся из /opt/mansoni/app/server/sfu/.env.production
      // которое должно быть создано на VPS вручную (содержит приватный IP/ключи)
      env_production: {
        NODE_ENV: 'production',
        ENV: 'production',
        SFU_PORT: '4443',
        PORT: '4443',
        REGION: 'primary',
        REDIS_URL: 'redis://127.0.0.1:6379',
        SFU_ENABLE_MEDIASOUP: '1',
        SFU_REQUIRE_MEDIASOUP: '1',
        SFU_INSECURE_DEV_MODE: '0',
        SFU_E2EE_REQUIRED: '1',
        E2EE_REQUIRED_DEFAULT: 'true',
        SFU_STRICT_VALIDATION: '1',
        SFU_WORKER_COUNT: 'auto',
        SFU_MAX_ROOMS_PER_WORKER: '100',
        // SFU_ANNOUNCED_IP — ОБЯЗАТЕЛЬНО задать вручную на VPS:
        //   echo "SFU_ANNOUNCED_IP=<public_ipv4>" >> /opt/mansoni/app/server/sfu/.env.production
        // PM2 подхватит через node_args / env файл ниже
      },

      // Загружаем .env.production из директории SFU — там должен быть SFU_ANNOUNCED_IP
      node_args: '--env-file=/opt/mansoni/app/server/sfu/.env.production',

      // Logging
      out_file: '/var/log/mansoni/sfu.log',
      error_file: '/var/log/mansoni/sfu-error.log',
      merge_logs: true,
      time: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
