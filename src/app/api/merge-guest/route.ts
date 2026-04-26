import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  const newToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!newToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { anonAccessToken, anonUserId: rawAnonUserId } = await request.json()
  if (!anonAccessToken && !rawAnonUserId) {
    return NextResponse.json({ error: 'anonAccessToken or anonUserId required' }, { status: 400 })
  }

  const admin = getAdminClient()

  const { data: newUserData, error: newErr } = await admin.auth.getUser(newToken)
  if (newErr || !newUserData.user) {
    return NextResponse.json({ error: 'Invalid new session' }, { status: 401 })
  }

  let anonUserId: string
  if (anonAccessToken) {
    const { data: anonUserData, error: anonErr } = await admin.auth.getUser(anonAccessToken)
    if (anonErr || !anonUserData.user) {
      return NextResponse.json({ error: 'Invalid anon session' }, { status: 400 })
    }
    if (!anonUserData.user.is_anonymous) {
      return NextResponse.json({ error: 'Source user is not anonymous' }, { status: 400 })
    }
    anonUserId = anonUserData.user.id
  } else {
    const { data: anonUserData, error: anonErr } = await admin.auth.admin.getUserById(rawAnonUserId)
    if (anonErr || !anonUserData.user) {
      return NextResponse.json({ error: 'Anon user not found' }, { status: 400 })
    }
    if (!anonUserData.user.is_anonymous) {
      return NextResponse.json({ error: 'Source user is not anonymous' }, { status: 400 })
    }
    anonUserId = anonUserData.user.id
  }

  const newUserId = newUserData.user.id

  console.log('[merge-guest] anonUserId:', anonUserId, '→ newUserId:', newUserId)

  if (newUserId === anonUserId) {
    console.log('[merge-guest] same user, nothing to do')
    return NextResponse.json({ ok: true })
  }

  const { error: updateError, count } = await admin
    .from('exams')
    .update({ user_id: newUserId })
    .eq('user_id', anonUserId)
    .select('id')

  console.log('[merge-guest] rows updated:', count, '| error:', updateError?.message ?? null)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(anonUserId)
  console.log('[merge-guest] anon user deleted:', !deleteError, deleteError?.message ?? null)

  return NextResponse.json({ ok: true, rowsUpdated: count })
}
