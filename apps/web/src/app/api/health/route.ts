import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { getDb } from '@lms/db';

export const dynamic = 'force-dynamic';

/** Health check para EasyPanel/Compose: verifica processo e banco. */
export async function GET() {
  try {
    await getDb().execute(sql`select 1`);
    return NextResponse.json({ ok: true, db: 'up' });
  } catch (e) {
    console.error('[health] banco indisponível', e);
    return NextResponse.json({ ok: false, db: 'down' }, { status: 503 });
  }
}
