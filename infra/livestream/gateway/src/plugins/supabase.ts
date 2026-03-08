/**
 * plugins/supabase.ts — Supabase service_role client as Fastify plugin.
 *
 * Uses service_role key → bypasses RLS, full DB access.
 * ONLY used server-side. Never returned to clients.
 *
 * Security: the service_role key is sourced from config (env var),
 * validated at startup, and never logged or exposed in error messages.
 */

import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { config } from '../config.js'

declare module 'fastify' {
  interface FastifyInstance {
    supabase: SupabaseClient
  }
}

async function supabasePlugin(app: FastifyInstance): Promise<void> {
  const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      // Service role: do not persist session, no token refresh on server
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    db: {
      // Default schema
      schema: 'public',
    },
    global: {
      headers: {
        // Identify gateway requests in Supabase logs
        'x-application-name': 'livestream-gateway',
      },
    },
  })

  // Verify connectivity: run a minimal query
  try {
    const { error } = await supabase.from('live_sessions').select('id').limit(1)
    if (error != null) {
      app.log.warn({ supabaseError: error.message }, 'Supabase readiness check returned error')
    } else {
      app.log.info('Supabase client ready')
    }
  } catch (err) {
    app.log.warn({ err }, 'Supabase readiness check failed (non-fatal, will retry on requests)')
  }

  app.decorate('supabase', supabase)
}

export default fp(supabasePlugin, {
  name: 'supabase',
  fastify: '>=4.0.0',
})
