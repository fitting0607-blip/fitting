// Supabase Edge Function: send-push
// - Auth required (expects Authorization: Bearer <user-jwt>)
// - Sends push via Expo Push API using users.fcm_token (ExpoPushToken) as destination
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

type Json = Record<string, unknown>

function json(status: number, body: Json) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}

type RoutePayload = { pathname: string; params?: Record<string, string> }

type Body =
  | { mode: 'notification_id'; notificationId: string; route?: RoutePayload }
  | { mode: 'message'; roomId: string; messageId: string; route?: RoutePayload }
  | { mode: 'direct'; recipientUserId: string; type: string; content: string; relatedId?: string; route?: RoutePayload }
  | {
      mode: 'latest_by_related'
      recipientUserId: string
      type: 'match' | 'like' | 'message' | 'point'
      relatedId: string
      route?: RoutePayload
    }

async function readJson(req: Request): Promise<Body | null> {
  try {
    return (await req.json()) as Body
  } catch {
    return null
  }
}

function getBearer(req: Request): string | null {
  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : ''
  return jwt || null
}

async function sendExpoPush(params: {
  to: string
  title: string
  body: string
  data: Record<string, unknown>
}) {
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: params.to,
      sound: 'default',
      title: params.title,
      body: params.body,
      data: params.data,
    }),
  })

  const text = await res.text().catch(() => '')
  if (!res.ok) {
    return { ok: false, status: res.status, responseText: text }
  }
  return { ok: true, responseText: text }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim()
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim()
  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, { error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' })
  }

  const jwt = getBearer(req)
  if (!jwt) return json(401, { error: 'Missing bearer token' })

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: userData, error: userErr } = await admin.auth.getUser(jwt)
  if (userErr || !userData.user) return json(401, { error: 'Invalid token' })
  const actorUserId = userData.user.id

  const body = await readJson(req)
  if (!body) return json(400, { error: 'Invalid JSON body' })

  let recipientUserId = ''
  let notificationRow: any = null
  let route: RoutePayload | null = (body as any).route ?? null

  if (body.mode === 'notification_id') {
    const nid = String(body.notificationId ?? '').trim()
    if (!nid) return json(400, { error: 'Missing notificationId' })

    const { data, error } = await admin
      .from('notifications')
      .select('id,user_id,type,content,related_id,created_at')
      .eq('id', nid)
      .maybeSingle()
    if (error) return json(400, { error: error.message })
    if (!data) return json(404, { error: 'Notification not found' })
    notificationRow = data
    recipientUserId = String((data as any).user_id ?? '').trim()

    // Basic permission check for message pushes: caller must be in the room
    const type = String((data as any).type ?? '').trim().toLowerCase()
    if (type === 'message') {
      const roomId = String((data as any).related_id ?? '').trim()
      if (!roomId) return json(400, { error: 'Missing room id in notification' })

      const { data: roomRow, error: roomErr } = await admin
        .from('chat_rooms')
        .select('match_id')
        .eq('id', roomId)
        .maybeSingle()
      if (roomErr) return json(400, { error: roomErr.message })
      const matchId = String((roomRow as any)?.match_id ?? '').trim()
      if (!matchId) return json(400, { error: 'Invalid room' })

      const { data: matchRow, error: matchErr } = await admin
        .from('matches')
        .select('requester_id,target_id')
        .eq('id', matchId)
        .maybeSingle()
      if (matchErr) return json(400, { error: matchErr.message })

      const requesterId = String((matchRow as any)?.requester_id ?? '').trim()
      const targetId = String((matchRow as any)?.target_id ?? '').trim()
      const isParticipant = actorUserId === requesterId || actorUserId === targetId
      if (!isParticipant) return json(403, { error: 'Forbidden' })
    }
  } else if (body.mode === 'message') {
    const roomId = String(body.roomId ?? '').trim()
    const messageId = String(body.messageId ?? '').trim()
    if (!roomId || !messageId) return json(400, { error: 'Missing roomId/messageId' })

    // 1) verify message sender
    const { data: msgRow, error: msgErr } = await admin
      .from('messages')
      .select('id,room_id,sender_id,content,created_at')
      .eq('id', messageId)
      .eq('room_id', roomId)
      .maybeSingle()
    if (msgErr) return json(400, { error: msgErr.message })
    const senderId = String((msgRow as any)?.sender_id ?? '').trim()
    if (!senderId || senderId !== actorUserId) return json(403, { error: 'Forbidden' })

    // 2) resolve recipient via match participants
    const { data: roomRow, error: roomErr } = await admin
      .from('chat_rooms')
      .select('match_id')
      .eq('id', roomId)
      .maybeSingle()
    if (roomErr) return json(400, { error: roomErr.message })
    const matchId = String((roomRow as any)?.match_id ?? '').trim()
    if (!matchId) return json(400, { error: 'Invalid room' })

    const { data: matchRow, error: matchErr } = await admin
      .from('matches')
      .select('requester_id,target_id')
      .eq('id', matchId)
      .maybeSingle()
    if (matchErr) return json(400, { error: matchErr.message })

    const requesterId = String((matchRow as any)?.requester_id ?? '').trim()
    const targetId = String((matchRow as any)?.target_id ?? '').trim()
    const isParticipant = actorUserId === requesterId || actorUserId === targetId
    if (!isParticipant) return json(403, { error: 'Forbidden' })
    recipientUserId = actorUserId === requesterId ? targetId : requesterId
    if (!recipientUserId) return json(400, { error: 'Missing recipient' })

    // 3) build notification content (include sender nickname if available)
    const { data: nickRow } = await admin.from('users').select('nickname').eq('id', actorUserId).maybeSingle()
    const senderNick = String((nickRow as any)?.nickname ?? '').trim() || '상대'
    const messageText = String((msgRow as any)?.content ?? '').trim()
    const content = messageText ? `${senderNick}: ${messageText}` : `${senderNick}님이 메시지를 보냈어요`

    const { data: ins, error: insErr } = await admin
      .from('notifications')
      .insert({
        user_id: recipientUserId,
        type: 'message',
        content,
        is_read: false,
        related_id: roomId,
      })
      .select('id,user_id,type,content,related_id,created_at')
      .single()
    if (insErr) return json(400, { error: insErr.message })
    notificationRow = ins
  } else if (body.mode === 'direct') {
    recipientUserId = String(body.recipientUserId ?? '').trim()
    const type = String(body.type ?? '').trim()
    const content = String(body.content ?? '').trim()
    const relatedId = String(body.relatedId ?? '').trim()
    if (!recipientUserId || !type || !content) {
      return json(400, { error: 'Missing recipientUserId/type/content' })
    }

    // Admin-only
    const { data: actorRow, error: actorErr } = await admin
      .from('users')
      .select('is_admin')
      .eq('id', actorUserId)
      .maybeSingle()
    if (actorErr) return json(400, { error: actorErr.message })
    const isAdmin = Boolean((actorRow as any)?.is_admin)
    if (!isAdmin) return json(403, { error: 'Forbidden' })

    const { data: ins, error: insErr } = await admin
      .from('notifications')
      .insert({
        user_id: recipientUserId,
        type,
        content,
        is_read: false,
        related_id: relatedId || null,
      })
      .select('id,user_id,type,content,related_id,created_at')
      .single()
    if (insErr) return json(400, { error: insErr.message })
    notificationRow = ins
  } else {
    recipientUserId = String(body.recipientUserId ?? '').trim()
    const type = String(body.type ?? '').trim().toLowerCase()
    const relatedId = String(body.relatedId ?? '').trim()
    if (!recipientUserId || !type || !relatedId) {
      return json(400, { error: 'Missing recipientUserId/type/relatedId' })
    }

    // Permission checks
    if (type === 'match') {
      const { data: matchRow, error: matchErr } = await admin
        .from('matches')
        .select('requester_id')
        .eq('id', relatedId)
        .maybeSingle()
      if (matchErr) return json(400, { error: matchErr.message })
      const requesterId = String((matchRow as any)?.requester_id ?? '').trim()
      if (!requesterId || requesterId !== actorUserId) return json(403, { error: 'Forbidden' })
    }
    if (type === 'like') {
      const { data: likeRow, error: likeErr } = await admin
        .from('likes')
        .select('id')
        .eq('user_id', actorUserId)
        .eq('post_id', relatedId)
        .maybeSingle()
      if (likeErr) return json(400, { error: likeErr.message })
      if (!likeRow) return json(403, { error: 'Forbidden' })
    }

    const { data, error } = await admin
      .from('notifications')
      .select('id,user_id,type,content,related_id,created_at')
      .eq('user_id', recipientUserId)
      .eq('type', type)
      .eq('related_id', relatedId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) return json(400, { error: error.message })
    notificationRow = data
  }

  if (!recipientUserId) return json(400, { error: 'Missing recipient user' })

  const { data: userRow, error: tokenErr } = await admin
    .from('users')
    .select('fcm_token')
    .eq('id', recipientUserId)
    .maybeSingle()
  if (tokenErr) return json(400, { error: tokenErr.message })
  const to = typeof (userRow as any)?.fcm_token === 'string' ? String((userRow as any).fcm_token).trim() : ''
  if (!to) return json(200, { ok: true, skipped: 'no_token' })

  const notifType = String((notificationRow as any)?.type ?? '').trim().toLowerCase()
  const content = String((notificationRow as any)?.content ?? '').trim()
  const relatedId = String((notificationRow as any)?.related_id ?? '').trim()

  if (!route) {
    if (notifType === 'message' && relatedId) {
      route = { pathname: '/chat-room', params: { roomId: relatedId } }
    } else if (notifType === 'match') {
      // match.related_id = matchId → find roomId
      const matchId = relatedId
      const { data: roomRow } = await admin
        .from('chat_rooms')
        .select('id')
        .eq('match_id', matchId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      const roomId = String((roomRow as any)?.id ?? '').trim()
      route = roomId ? { pathname: '/chat-room', params: { roomId } } : { pathname: '/(tabs)/chat' }
    } else if (notifType === 'like') {
      route = { pathname: '/notifications' }
    } else if (notifType === 'trainer_approved') {
      route = { pathname: '/trainer-apply' }
    } else {
      route = { pathname: '/notifications' }
    }
  }

  const result = await sendExpoPush({
    to,
    title: 'fitting',
    body: content || '새 알림이 도착했어요',
    data: {
      notificationId: String((notificationRow as any)?.id ?? ''),
      type: notifType,
      relatedId,
      route,
    },
  })

  if (!result.ok) {
    return json(502, { error: 'Push send failed', details: result })
  }
  return json(200, { ok: true })
})

