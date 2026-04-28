import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  const newToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!newToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { mergeToken } = await request.json()
  if (!mergeToken) {
    return NextResponse.json({ error: 'mergeToken required' }, { status: 400 })
  }

  const admin = getAdminClient()

  const { data: newUserData, error: newErr } = await admin.auth.getUser(newToken)
  if (newErr || !newUserData.user) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: row, error: rowErr } = await (admin as any)
    .from('pending_guest_merges')
    .select('anon_user_id, expires_at')
    .eq('token', mergeToken)
    .single()

  if (rowErr || !row) {
    return NextResponse.json({ error: 'Invalid or expired merge token' }, { status: 400 })
  }

  if (new Date(row.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Merge token expired' }, { status: 400 })
  }

  const newUserId = newUserData.user.id
  const anonUserId: string = row.anon_user_id

  if (newUserId === anonUserId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any).from('pending_guest_merges').delete().eq('token', mergeToken)
    return NextResponse.json({ ok: true })
  }

  const { error: updateError } = await admin
    .from('exams')
    .update({ user_id: newUserId })
    .eq('user_id', anonUserId)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  await admin.auth.admin.deleteUser(anonUserId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any).from('pending_guest_merges').delete().eq('token', mergeToken)

  return NextResponse.json({ ok: true })
}
