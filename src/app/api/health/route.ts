/**
 * SECURIA — Health Check Endpoint
 * GET /api/health
 *
 * Used by:
 *  - Vercel / hosting platform uptime monitors
 *  - Load balancers
 *  - External monitoring services (UptimeRobot, BetterStack, etc.)
 *
 * Returns:
 *  200  — All systems operational
 *  503  — One or more critical checks failed
 *
 * ⚠️  This endpoint intentionally returns minimal information in production
 *     to avoid exposing infrastructure details to attackers.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const isDev = process.env.NODE_ENV !== 'production';
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? '1.0.0';

export async function GET() {
  const startTime = Date.now();
  const checks: Record<string, { ok: boolean; latencyMs?: number; detail?: string }> = {};

  // ── Check 1: Database connectivity ────────────────────────────────────────
  let dbOk = false;
  let dbLatency = 0;
  try {
    const t0 = Date.now();
    let error: any = null;
    try {
      const { supabaseAdmin } = await import('@/lib/supabase/admin');
      const res = await supabaseAdmin
        .from('organizations')
        .select('id', { count: 'exact', head: true })
        .limit(1);
      error = res.error;
    } catch {
      const supabase = await createClient();
      const res = await supabase
        .from('organizations')
        .select('id', { count: 'exact', head: true })
        .limit(1);
      error = res.error;
    }
    dbLatency = Date.now() - t0;
    dbOk = !error;
    checks.database = { ok: dbOk, latencyMs: dbLatency };
  } catch {
    checks.database = { ok: false, detail: isDev ? 'Supabase unreachable' : undefined };
  }

  // ── Check 2: Environment variables ────────────────────────────────────────
  const envOk = !!(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL) &&
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY) &&
    (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  );
  checks.environment = { ok: envOk };

  // ── Aggregate result ──────────────────────────────────────────────────────
  const allOk = Object.values(checks).every((c) => c.ok);
  const totalLatency = Date.now() - startTime;

  // In production, expose only the minimum required info
  const responseBody = isDev
    ? {
        status: allOk ? 'ok' : 'degraded',
        version: APP_VERSION,
        env: process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV,
        latencyMs: totalLatency,
        checks,
        timestamp: new Date().toISOString(),
      }
    : {
        status: allOk ? 'ok' : 'degraded',
        version: APP_VERSION,
        timestamp: new Date().toISOString(),
      };

  return NextResponse.json(responseBody, {
    status: allOk ? 200 : 503,
    headers: {
      // Never cache health checks
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
