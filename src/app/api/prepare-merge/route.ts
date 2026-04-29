import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { getAdminClient } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = getAdminClient()

  const { data: userData, error: userErr } = await admin.auth.getUser(token)
  if (userErr || !userData.user) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
  }
  if (!userData.user.is_anonymous) {
    return NextResponse.json({ error: 'Only anonymous users can prepare a merge' }, { status: 400 })
  }

  const mergeToken = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: insertErr } = await (admin as any).from('pending_guest_merges').insert({
    token: mergeToken,
    anon_user_id: userData.user.id,
    expires_at: expiresAt,
  })

  if (insertErr) {
    return NextResponse.json({ error: 'Failed to prepare merge' }, { status: 500 })
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set('basarix_merge', mergeToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60, // 1 hour — tighter than DB expiry as an extra safeguard
  })
  return response
}
