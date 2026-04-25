import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// --- CONFIG ------------------------------------------------------
const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? ''

const ADMIN_CHAT_IDS = [
  '8141089809',
  '8565740927',
]

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const ok = () =>
  new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  })

const sendTelegramMessage = async (chatId: string, text: string) => {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
    }),
  })

  if (!res.ok) {
    console.error('[bot-handler] Telegram send failed:', await res.text())
  }
}

const formatNaira = (amount: number) =>
  `₦${amount.toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

// --- HANDLER -----------------------------------------------------
Deno.serve(async (req) => {
  try {
    let payload: Record<string, unknown>

    try {
      payload = await req.json()
    } catch {
      return ok()
    }

    const message = payload?.message as
      | {
          text?: string
          chat?: { id?: number | string }
          from?: { id?: number | string }
        }
      | undefined

    const chatId = String(message?.chat?.id ?? '')
    const fromId = String(message?.from?.id ?? '')
    const text = message?.text?.trim() ?? ''

    if (!chatId || !fromId || !text.startsWith('/')) {
      return ok()
    }

    if (!ADMIN_CHAT_IDS.includes(fromId)) {
      return ok()
    }

    const command = text.split(/\s+/)[0].split('@')[0]

    switch (command) {
      case '/start': {
        await sendTelegramMessage(
          chatId,
          'Welcome to GrowthHaven HQ. Authorized access confirmed.',
        )
        return ok()
      }

      case '/summary': {
        const { data, error } = await supabase
          .from('withdrawals')
          .select('amount')
          .eq('status', 'pending')

        if (error) {
          console.error('[bot-handler] Summary query failed:', error)
          return ok()
        }

        const totalCount = data?.length ?? 0
        const totalAmount = (data ?? []).reduce(
          (sum, row) => sum + Number(row.amount ?? 0),
          0,
        )

        const reply = [
          '*Pending Withdrawals Summary*',
          '',
          `Count: *${totalCount}*`,
          `Total: *${formatNaira(totalAmount)}*`,
        ].join('\n')

        await sendTelegramMessage(chatId, reply)
        return ok()
      }

      case '/status': {
        const { error } = await supabase
          .from('members')
          .select('id')
          .limit(1)

        if (error) {
          console.error('[bot-handler] Status check failed:', error)
          return ok()
        }

        await sendTelegramMessage(
          chatId,
          'System Online. Database connection: Active.',
        )
        return ok()
      }

      default:
        return ok()
    }
  } catch (err) {
    console.error('[bot-handler] Unhandled error:', err)
    return ok()
  }
})
