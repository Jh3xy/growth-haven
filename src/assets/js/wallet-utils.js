import { supabase } from './supabase'

export async function updateWalletDisplay() {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const user = session.user
    const { data, error } = await supabase
      .from('members')
      .select('wallet_balance')
      .eq('id', user.id)
      .single()

    if (!error && data) {
      const el = document.getElementById('walletDisplay')
      if (el) el.textContent = '₦' + Number(data.wallet_balance).toLocaleString('en-NG', { minimumFractionDigits: 2 })
    }
  } catch (err) {
    console.error('updateWalletDisplay error', err)
  }
}
