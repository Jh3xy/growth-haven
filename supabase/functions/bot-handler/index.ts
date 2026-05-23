
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

// --- MARKDOWN ESCAPE HELPER (NEW) --------------------------------
const escapeMarkdown = (text: string) => {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&')
}

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

        // ─── HANDLE CALLBACK QUERIES (NEW) ───────────────────────────
    const callbackQuery = payload?.callback_query as
      | {
          id?: string
          data?: string
          from?: { id?: number | string }
          message?: { 
            chat?: { id?: number | string }
            message_id?: number 
          }
        }
      | undefined

    if (callbackQuery) {
      const fromId = String(callbackQuery.from?.id ?? '')
      const data = callbackQuery.data ?? ''
      const chatId = String(callbackQuery.message?.chat?.id ?? '')
      const messageId = callbackQuery.message?.message_id

      if (!ADMIN_CHAT_IDS.includes(fromId)) {
        return ok()
      }

      // Parse callback: delete_post:{post_id}
      if (data.startsWith('delete_post:')) {
        const postId = data.split(':')[1]

        const { error } = await supabase
          .from('posts')
          .delete()
          .eq('id', postId)

        if (error) {
          console.error('[bot-handler] Delete failed:', error)
          
          // Answer callback query with error
          await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              callback_query_id: callbackQuery.id,
              text: 'Delete failed. Check logs.',
              show_alert: true,
            }),
          })

          return ok()
        }

        // Delete successful — update the message
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            message_id: messageId,
            text: '✅ *Post Deleted*\n\nThis post has been removed from the platform.',
            parse_mode: 'Markdown',
          }),
        })

        // Answer callback query
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callback_query_id: callbackQuery.id,
            text: 'Post deleted successfully',
          }),
        })

      return ok()
    }
 
    // ─── HANDLE delete_member ─────────────────────────────────
    if (data.startsWith('delete_member:')) {
      const userId = data.split(':')[1]
 
      // Step 1: Delete all of the member's posts
      const { error: postsError } = await supabase
        .from('posts')
        .delete()
        .eq('user_id', userId)
 
      if (postsError) {
        console.error('[bot-handler] delete_member — posts delete failed:', postsError)
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callback_query_id: callbackQuery.id,
            text: '⚠️ Could not remove this member. Their account is connected to other records that need to be cleared first. Contact Jhey immediately — do not retry.',
            show_alert: true,
          }),
        })
        return ok()
      }
 
      // Step 2: Delete the member profile row
      const { error: memberError } = await supabase
        .from('members')
        .delete()
        .eq('id', userId)
 
      if (memberError) {
        console.error('[bot-handler] delete_member — member row delete failed:', memberError)
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callback_query_id: callbackQuery.id,
            text: "⚠️ Their posts were deleted but the member couldn't be removed.\nThere's still linked data (investments, transactions, etc.) in the system.\nContact your developer immediately — do not retry!",
            show_alert: true,
          }),
        })
        return ok()
      }
 
      // Step 3: Delete the Supabase Auth account (blocks re-login)
      const { error: authError } = await supabase.auth.admin.deleteUser(userId)
 
      if (authError) {
        console.error('[bot-handler] delete_member — auth user delete failed:', authError)
        // Posts + member row are gone but login account remains — partial state
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            message_id: messageId,
            text: '⚠️ *Partial Removal*\n\nThis member\'s posts and profile data were deleted, but their login account is still active. Contact Jhey — they can finish this manually',
            parse_mode: 'Markdown',
          }),
        })
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callback_query_id: callbackQuery.id,
            text: 'Partially removed. Contact Jhey to finish.',
            show_alert: true,
          }),
        })
        return ok()
      }
 
      // All three steps succeeded — update the original message and confirm
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: messageId,
          text: '✅ *Member Removed*\n\nThis member\'s posts, profile, and login account has been fully deleted',
          parse_mode: 'Markdown',
        }),
      })
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callback_query_id: callbackQuery.id,
          text: 'Member fully removed.',
        }),
      })
 
      return ok()
    }

      return ok()
    }

    // ─── HANDLE TEXT COMMANDS (EXISTING) ─────────────────────────
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
          .from('withdrawal_requests')
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
          'System Online. DB connection: Active.',
        )
        return ok()
      }

      // ─── REFRESH CATALOG COMMAND (WITH MARKDOWN ESCAPING FIX) ─────────
      case '/refresh_catalog': {
        // Immediately acknowledge
        await sendTelegramMessage(chatId, '⏳ Starting catalog refresh in the background... This could take some minutes, Please wait.')

        // Background execution
        ;(async () => {
          try {
            console.log('[bot-handler] Triggering catalog-refresh function...')
            const refreshResponse = await fetch(
              `${SUPABASE_URL}/functions/v1/catalog-refresh`,
              {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
                  'Content-Type': 'application/json'
                }
              }
            )
          
            const raw = await refreshResponse.text()

            let result: any
            try {
              result = JSON.parse(raw)
            } catch {
              result = {
                success: false,
                error: `Non-JSON response from catalog-refresh: ${raw.slice(0, 200)}`
              }
            }
            
            console.log('[bot-handler] Catalog-refresh response:', result)
          
            if (result.success) {
              await sendTelegramMessage(
                chatId,
                `✅ *Music Catalog Refresh Complete\\!*\n\n` +
                `📊 Total Fetched: *${result.totalFetched}* videos\n` +
                `🆕 New Items Added: *${result.totalInserted}*`
              )
            } else {
              // APPLY MARKDOWN ESCAPING TO ERROR MESSAGE
              const errorMsg = escapeMarkdown(result.error || 'Unknown endpoint error')
              await sendTelegramMessage(
                chatId,
                `❌ *Refresh failed*\n\n${errorMsg}`
              )
            }
          } catch (fetchErr: any) {
            console.error('[bot-handler] Catalog refresh trigger failed:', fetchErr)
            // APPLY MARKDOWN ESCAPING TO NETWORK ERROR
            const errMsg = escapeMarkdown(fetchErr?.message || 'Unknown error')
            await sendTelegramMessage(
              chatId,
              `❌ *Network Error*\n\nFailed to reach the catalog refresh service\\.\n\n${errMsg}`
            )
          }
        })()

        return ok()
      }

      // ─── VIEW CATALOG STATS COMMAND ──────────────────────────────
      case '/view_catalog_stats': {
        // Use Postgres aggregation instead of fetching all rows
        const { data: stats, error: statsError } = await supabase
          .rpc('get_catalog_stats')
 
        if (statsError) {
          console.error('[bot-handler] Stats query failed:', statsError)
          await sendTelegramMessage(chatId, `❌ Failed to load catalog stats.`)
          return ok()
        }
 
        const statsMessage = (stats || [])
          .map((row: any) => `🎵 ${row.category}: ${row.count} songs`)
          .join('\n')
     
        await sendTelegramMessage(chatId, `📊 *Music Catalog Stats:*\n\n${statsMessage || 'No tracks in catalog yet.'}`)
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
