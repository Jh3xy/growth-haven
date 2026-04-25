import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ─── CONFIG ────────────────────────────────────────────────────
// To add or remove admins, edit this array. No other changes needed.
const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? ''

const ADMIN_CHAT_IDS = [
  '8141089809',      // Admin 1 
  '8565740927', // Admin 2 — Jhey
]

const SUPABASE_URL        = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

// ─── HANDLER ───────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const payload = await req.json()
    const record  = payload.record

    if (!record) {
      return new Response('No record in payload', { status: 400 })
    }

    // Fetch the member's name — webhook only gives us user_id
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    const { data: member } = await supabase
      .from('members')
      .select('first_name, last_name')
      .eq('id', record.user_id)
      .single()

    const fullName  = member
      ? `${member.first_name ?? ''} ${member.last_name ?? ''}`.trim()
      : 'Unknown User'

    const roleLabel  = record.role === 'promoter' ? 'Promoter ' : 'Standard User'
    const amount     = Number(record.amount).toLocaleString('en-NG', {
      minimumFractionDigits: 2,
    })
    const bank       = record.bank        ?? '—'
    const accName    = record.account_name   ?? '—'
    const accNumber  = record.account_number ?? '—'
    const timestamp  = new Date(record.created_at).toLocaleString('en-GB', {
      timeZone:    'Africa/Lagos',
      day:         'numeric',
      month:       'short',
      year:        'numeric',
      hour:        '2-digit',
      minute:      '2-digit',
    })

    // ─── MESSAGE ─────────────────────────────────────────────────
    const message = [
      `💸 *New Withdrawal Request*`,
      ``,
      `👤 *Name:* ${fullName}`,
      `🏷️ *Role:* ${roleLabel}`,
      `💰 *Amount:* ₦${amount}`,
      `🏦 *Bank:* ${bank}`,
      `📋 *Account:* ${accName} · ${accNumber}`,
      `🕐 *Time:* ${timestamp}`,
      ``,
      `_Review in the admin dashboard._`,
    ].join('\n')

    // ─── SEND TO ALL ADMINS ───────────────────────────────────────
    const sends = ADMIN_CHAT_IDS.map((chatId) =>
      fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "Open Admin Dashboard",
                  url: "https://growth-havenmvp.vercel.app/src/admin/" 
                }
              ]
            ]
          }
        }),
      })
    )

    const results = await Promise.all(sends)

    // Log any Telegram errors without crashing the function
    for (const res of results) {
      if (!res.ok) {
        console.error('[telegram] Send failed:', await res.text())
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('[notify-withdrawal] Unhandled error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status:  500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})