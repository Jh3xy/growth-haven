
-- ============================================================
-- GrowthHaven — Supabase DB Functions
-- supabase/migrations/schema.sql
-- ============================================================
-- Conventions:
--   p_ prefix → function parameters
--   v_ prefix → internal variables
--   SECURITY DEFINER + SET search_path = public on every function
-- ============================================================


-- ------------------------------------------------------------
-- 1. admin_promote_member
--    Promotes a member to the promoter role. Admin only.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_promote_member(
  p_member_id uuid
)
RETURNS void
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
BEGIN
  -- Verify the caller is actually an admin
  SELECT role INTO v_caller_role
  FROM members
  WHERE id = auth.uid();

  IF v_caller_role != 'admin' THEN
    RAISE EXCEPTION 'Access denied: caller is not an admin';
  END IF;

  -- Update the member's promoter flag
  UPDATE members
  SET promoter = true
  WHERE id = p_member_id;

  -- Create the promoters row if it doesn't exist
  -- Default commission rate of 40% (0.40) — change per promoter in Studio as needed
  INSERT INTO promoters (
    user_id,
    assigned_commission_rate,
    wallet_balance,
    name,        -- Concatenated from first_name + last_name
    referral_code
  )
  SELECT
    p_member_id,
    0.40,
    0.00,
    TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')),
    referral_code
  FROM members
  WHERE id = p_member_id
  ON CONFLICT (user_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
--  Deposit Unlock Trigger
-- Unlocks blog access after a user's first completed deposit.
-- Handles both:
--   1. completed deposit inserted directly
--   2. pending deposit later updated to completed
-- ============================================================

create or replace function public.mark_first_deposit()
returns trigger
security definer
set search_path = public
as $$
begin
  if new.type = 'deposit'
     and new.status = 'completed'
     and coalesce(old.status, '') is distinct from 'completed'
  then
    update public.members
    set has_deposited = true
    where id = new.user_id
      and has_deposited = false;
  end if;

  return new;
end;
$$ language plpgsql;


drop trigger if exists on_deposit_completion on public.transactions;

create trigger on_deposit_completion
after insert or update of status
on public.transactions
for each row
execute function public.mark_first_deposit();



-- ------------------------------------------------------------
-- 2. admin_update_withdrawal_status
--    Admin transitions a withdrawal request through its
--    allowed states. Syncs the transactions table and refunds
--    on rejection.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_withdrawal_status(
  p_withdrawal_id uuid,
  p_new_status    text
)
RETURNS public.withdrawal_requests
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id    uuid := auth.uid();
  v_actor_role  text;
  v_current_row public.withdrawal_requests%rowtype;
  v_updated_row public.withdrawal_requests%rowtype;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  -- Verify caller is an admin
  SELECT m.role
  INTO v_actor_role
  FROM public.members m
  WHERE m.id = v_actor_id;

  IF v_actor_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Access denied. Admins only.';
  END IF;

  -- Lock the row so concurrent updates can't race
  SELECT *
  INTO v_current_row
  FROM public.withdrawal_requests wr
  WHERE wr.id = p_withdrawal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Withdrawal request not found.';
  END IF;

  -- Only allow known target statuses
  IF p_new_status NOT IN ('approved', 'completed', 'rejected') THEN
    RAISE EXCEPTION 'Invalid target status: %', p_new_status;
  END IF;

  -- Enforce valid state transitions:
  --   pending  → approved | rejected
  --   approved → completed | rejected
  IF NOT (
    (v_current_row.status = 'pending'  AND p_new_status IN ('approved', 'rejected'))
    OR
    (v_current_row.status = 'approved' AND p_new_status IN ('completed', 'rejected'))
  ) THEN
    RAISE EXCEPTION
      'Invalid status transition from % to %.',
      v_current_row.status,
      p_new_status;
  END IF;

  UPDATE public.withdrawal_requests
  SET
    status     = p_new_status,
    updated_at = now()
  WHERE id = p_withdrawal_id
  RETURNING * INTO v_updated_row;

  -- ── Sync transactions table ──────────────────────────────────
  IF p_new_status = 'completed' THEN
    UPDATE public.transactions
    SET status = 'completed'
    WHERE reference = v_current_row.reference
      AND user_id   = v_current_row.user_id
      AND type      = 'withdrawal';

  ELSIF p_new_status = 'rejected' THEN
    -- Mark the ledger entry as failed
    UPDATE public.transactions
    SET status = 'failed'
    WHERE reference = v_current_row.reference
      AND user_id   = v_current_row.user_id
      AND type      = 'withdrawal';

    -- Refund the amount to the user's wallet
    UPDATE public.members
    SET wallet_balance = wallet_balance + v_current_row.amount
    WHERE id = v_current_row.user_id;
  END IF;

  RETURN v_updated_row;
END;
$$ LANGUAGE plpgsql;


-- ------------------------------------------------------------
-- 3. cashout_mines
--    Settles an active Mines session: credits payout, logs
--    the win transaction and casino_rounds row.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cashout_mines(
  p_session_id uuid
)
RETURNS json
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_session mines_sessions%rowtype;
  v_payout  numeric;
  v_mult    numeric;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('error', 'Not authenticated');
  END IF;

  -- Lock session row to prevent race conditions
  SELECT * INTO v_session
  FROM mines_sessions
  WHERE id = p_session_id AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Session not found');
  END IF;
  IF v_session.status != 'active' THEN
    RETURN json_build_object('error', 'Game is not active');
  END IF;
  IF COALESCE(array_length(v_session.revealed_tiles, 1), 0) = 0 THEN
    RETURN json_build_object('error', 'Reveal at least one tile before cashing out');
  END IF;

  -- accrued_winnings already has house_edge applied from reveal_tile
  v_payout := v_session.accrued_winnings;
  v_mult   := round(v_session.current_multiplier * v_session.house_edge, 2);

  UPDATE mines_sessions SET status = 'won' WHERE id = p_session_id;

  -- Credit wallet
  UPDATE members
  SET wallet_balance = wallet_balance + v_payout
  WHERE id = v_user_id;

  -- Log win into transactions
  INSERT INTO transactions (user_id, type, label, amount, status, reference)
  VALUES (
    v_user_id,
    'mines_win',
    format('Mines – Cashed out at %sx', round(v_session.current_multiplier * v_session.house_edge, 2)),
    v_payout,
    'completed',
    format('win_%s', p_session_id::text)  -- Prefixed with 'win_' to distinguish from bet reference
  );

  -- Record win in casino_rounds (source of truth for game history)
  INSERT INTO public.casino_rounds (
    user_id, game_type, bet_amount, outcome_won,
    payout_amount, profit, multiplier, metadata
  ) VALUES (
    v_user_id,
    'mines',
    v_session.bet_amount,
    true,
    v_payout,
    v_payout - v_session.bet_amount,
    v_mult,
    jsonb_build_object(
      'mines_count',    v_session.mines_count,
      'tiles_revealed', array_length(v_session.revealed_tiles, 1),
      'session_id',     p_session_id
    )
  );

  RETURN json_build_object(
    'payout',         round(v_payout, 2),
    'multiplier',     v_mult,
    'mine_positions', v_session.mine_positions
  );
END;
$$ LANGUAGE plpgsql;


-- ------------------------------------------------------------
-- 4. create_investment_plan
--    Validates balance, creates the investment row, moves
--    funds from wallet → vault, and logs the transaction.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_investment_plan(
  p_amount        numeric,
  p_duration_days int,
  p_daily_rate    numeric,
  p_total_rate    numeric
)
RETURNS uuid
-- 'Definer' ensures the function has permission to update the members table
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id        uuid := auth.uid();
  v_wallet_balance numeric;
  v_projected      numeric;
  v_maturity       timestamptz;
  v_payout         timestamptz;
  v_investment_id  uuid;
BEGIN
  -- 1. Check wallet balance is sufficient
  SELECT wallet_balance INTO v_wallet_balance
    FROM members WHERE id = v_user_id;

  IF v_wallet_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient wallet balance';
  END IF;

  -- 2. Check no active plan already exists
  IF EXISTS (
    SELECT 1 FROM investments
    WHERE user_id = v_user_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'You already have an active investment plan';
  END IF;

  -- 3. Compute dates
  v_maturity := now() + (p_duration_days || ' days')::interval;

  -- Weekend shift logic (Institutional standard)
  v_payout := v_maturity;
  IF extract(dow FROM v_payout) = 6 THEN      -- Saturday
    v_payout := v_payout + interval '2 days';
  ELSIF extract(dow FROM v_payout) = 0 THEN   -- Sunday
    v_payout := v_payout + interval '1 day';
  END IF;

  -- 4. Projected earnings
  v_projected := p_amount * p_total_rate;

  -- 5. Insert investment row
  INSERT INTO investments (
    user_id, amount, duration_days, daily_rate, total_rate,
    start_date, maturity_date, payout_date,
    status, projected_earnings
  )
  VALUES (
    v_user_id, p_amount, p_duration_days, p_daily_rate, p_total_rate,
    now(), v_maturity, v_payout,
    'active', v_projected
  )
  RETURNING id INTO v_investment_id;

  -- 6. Move funds: wallet → vault
  UPDATE members
    SET wallet_balance = wallet_balance - p_amount,
        vault_balance  = vault_balance  + p_amount
    WHERE id = v_user_id;

  -- 7. Log the transaction
  INSERT INTO transactions (user_id, type, label, amount, investment_id)
  VALUES (
    v_user_id,
    'vault_fund',
    p_duration_days || '-Day Plan started',
    p_amount,
    v_investment_id
  );

  RETURN v_investment_id;
END;
$$ LANGUAGE plpgsql;


-- ------------------------------------------------------------
-- 5. generate_referral_code
--    Builds a referral code from the user's initials + 5
--    random characters from an ambiguity-safe alphabet.
--    NOTE: params intentionally have no p_ prefix — supabase.ts
--    defines these as { first_name, last_name } and the client
--    RPC call must match exactly.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_referral_code(
  first_name text,
  last_name  text
)
RETURNS text
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Omits easily confused chars (0/O, 1/I, etc.)
  chars    text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result   text := '';
  initials text;
  i        int;
BEGIN
  initials := upper(left(coalesce(first_name, 'X'), 1))
           || upper(left(coalesce(last_name,  'X'), 1));

  FOR i IN 1..5 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;

  RETURN initials || '-' || result;
END;
$$ LANGUAGE plpgsql;


-- ------------------------------------------------------------
-- 6. get_active_mines_session
--    Returns the caller's current active Mines session, if any.
--    Mine positions are intentionally excluded while the game
--    is still in progress.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_active_mines_session()
RETURNS json
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session mines_sessions%rowtype;
BEGIN
  SELECT * INTO v_session
  FROM mines_sessions
  WHERE user_id = auth.uid() AND status = 'active'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('session', null);
  END IF;

  -- Never return mine_positions on an active session
  RETURN json_build_object(
    'session', json_build_object(
      'id',               v_session.id,
      'bet_amount',       v_session.bet_amount,
      'mines_count',      v_session.mines_count,
      'revealed_tiles',   v_session.revealed_tiles,
      'multiplier',       round(v_session.current_multiplier * v_session.house_edge, 2),
      'accrued_winnings', round(v_session.accrued_winnings, 2)
    )
  );
END;
$$ LANGUAGE plpgsql;


-- ------------------------------------------------------------
-- 7. get_game_history
--    Returns the caller's casino round history, optionally
--    filtered by game type and limited in count.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_game_history(
  p_game_type text    DEFAULT NULL,
  p_limit     integer DEFAULT NULL
)
RETURNS TABLE(
  id            uuid,
  game_type     text,
  bet_amount    numeric,
  outcome_won   boolean,
  payout_amount numeric,
  profit        numeric,
  multiplier    numeric,
  created_at    text
)
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  RETURN QUERY
  SELECT
    cr.id,
    cr.game_type,
    cr.bet_amount,
    cr.outcome_won,
    cr.payout_amount,
    cr.profit,
    cr.multiplier,
    cr.created_at
  FROM public.casino_rounds cr
  WHERE cr.user_id = v_user
    AND (p_game_type IS NULL OR cr.game_type = p_game_type)
  ORDER BY cr.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;


-- ------------------------------------------------------------
-- 8. get_my_referrals
--    Returns all referrals made by the calling user, joined
--    with the referred member's profile data.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_referrals()
RETURNS TABLE(
  referral_id  uuid,
  referred_id  uuid,
  first_name   text,
  last_name    text,
  has_deposited boolean,
  status       text,
  created_at   text,
  completed_at text
)
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id             AS referral_id,
    r.referred_id,
    m.first_name,
    m.last_name,
    m.has_deposited,
    r.status,
    r.created_at,
    r.completed_at
  FROM public.referrals r
  JOIN public.members m ON m.id = r.referred_id
  WHERE r.referrer_id = auth.uid()
  ORDER BY r.created_at DESC;
END;
$$ LANGUAGE plpgsql;


-- ------------------------------------------------------------
-- 9. get_promoter_referrals
--    Returns all referrals for the calling promoter, including
--    last_sign_in_at from auth.users (requires SECURITY DEFINER).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_promoter_referrals()
RETURNS TABLE(
  first_name    text,
  last_name     text,
  created_at    text,
  has_deposited boolean,
  is_promoter   boolean,
  last_active_at text
)
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.first_name,
    m.last_name,
    m.created_at,
    m.has_deposited,
    m.promoter          AS is_promoter,
    au.last_sign_in_at  AS last_active_at
  FROM public.referrals r
  -- Who made this call?
  JOIN public.members caller
    ON caller.id = auth.uid()
  -- The person they referred
  JOIN public.members m
    ON m.id = r.referred_id
  -- Pull last_sign_in_at from auth.users (SECURITY DEFINER required for auth schema access)
  LEFT JOIN auth.users au
    ON au.id = m.id
  WHERE r.referrer_id = caller.id
  ORDER BY m.created_at DESC;
END;
$$ LANGUAGE plpgsql;


-- ------------------------------------------------------------
-- 10. handle_new_user
--     Trigger function fired AFTER INSERT ON auth.users.
--     Creates the member row, optionally a promoter record,
--     and the referral relationship.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fname       text;
  lname       text;
  code        text;
  promoter    boolean DEFAULT false;
  secret_word text := 'GAINS2026';  -- The uncheatable portal secret
BEGIN
  -- Extract metadata from auth sign-up payload
  fname := new.raw_user_meta_data->>'first_name';
  lname := new.raw_user_meta_data->>'last_name';

  -- A. Check for Promoter Status via Portal Code
  IF (new.raw_user_meta_data->>'portal_code') = secret_word THEN
    promoter := true;
  END IF;

  -- B. Collision loop: regenerate if code already exists
  LOOP
    code := public.generate_referral_code(fname, lname);
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.members WHERE referral_code = code
    );
  END LOOP;

  -- C. Insert into members
  INSERT INTO public.members (
    id,
    email,
    first_name,
    last_name,
    referral_code,
    referrer_code,
    promoter
  )
  VALUES (
    new.id,
    new.email,
    fname,
    lname,
    code,
    new.raw_user_meta_data->>'referrer_code',
    promoter
  );

  -- D. Create Promoter record if applicable
  IF promoter THEN
    INSERT INTO public.promoters (user_id, name, referral_code)
    VALUES (
      new.id,
      (fname || ' ' || lname),
      code
    );
  END IF;

  -- E. Create referral relationship if a referrer_code was supplied
  IF new.raw_user_meta_data->>'referrer_code' IS NOT NULL THEN
    INSERT INTO public.referrals (referrer_id, referred_id)
    SELECT m.id, new.id
    FROM public.members m
    WHERE m.referral_code = new.raw_user_meta_data->>'referrer_code';
  END IF;

  RETURN new;
END;
$$ LANGUAGE plpgsql;


-- ------------------------------------------------------------
-- 11. is_admin
--     Lightweight boolean check — used in RLS policies.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.members
    WHERE id   = auth.uid()
      AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql;


-- ------------------------------------------------------------
-- 12. play_coin_flip
--     Deducts the bet, flips a fair coin, credits payout if
--     won, and records the result in casino_rounds.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.play_coin_flip(
  p_bet_amount numeric,
  p_choice     text
)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user       uuid        := auth.uid();
  v_balance    numeric;
  v_outcome    text;
  v_multiplier numeric     := 1.95;  -- House edge baked in
  v_payout     numeric     := 0;
  v_profit     numeric     := 0;
  v_round_id   uuid        := gen_random_uuid();
  v_now        timestamptz := now();
BEGIN
  -- Auth
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('error', 'User is not authenticated.');
  END IF;

  -- Validate choice
  IF p_choice NOT IN ('heads', 'tails') THEN
    RETURN jsonb_build_object('error', 'Choice must be heads or tails.');
  END IF;

  -- Validate bet
  IF p_bet_amount IS NULL OR p_bet_amount <= 0 THEN
    RETURN jsonb_build_object('error', 'Bet must be a positive number.');
  END IF;

  -- Lock member row to prevent concurrent spends
  SELECT wallet_balance
  INTO   v_balance
  FROM   public.members
  WHERE  id = v_user
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Account not found.');
  END IF;

  IF v_balance < p_bet_amount THEN
    RETURN jsonb_build_object('error', 'Insufficient wallet balance.');
  END IF;

  -- Debit stake
  UPDATE public.members
  SET    wallet_balance = wallet_balance - p_bet_amount
  WHERE  id = v_user;

  -- Determine outcome — unbiased coin via UUID sort
  SELECT choice INTO v_outcome
  FROM (VALUES ('heads'), ('tails')) AS c(choice)
  ORDER BY gen_random_uuid()
  LIMIT 1;

  -- Credit payout if won
  IF v_outcome = p_choice THEN
    v_payout := round(p_bet_amount * v_multiplier, 2);
    v_profit := v_payout - p_bet_amount;
    UPDATE public.members
    SET    wallet_balance = wallet_balance + v_payout
    WHERE  id = v_user;
  ELSE
    v_payout := 0;
    v_profit := -p_bet_amount;
  END IF;

  -- Record in casino_rounds (source of truth for all game history)
  INSERT INTO public.casino_rounds (
    id, user_id, game_type, bet_amount, outcome_won,
    payout_amount, profit, multiplier, metadata, created_at
  ) VALUES (
    v_round_id,
    v_user,
    'coin_flip',
    p_bet_amount,
    v_outcome = p_choice,
    v_payout,
    v_profit,
    CASE WHEN v_outcome = p_choice THEN v_multiplier ELSE 0 END,
    jsonb_build_object('choice', p_choice, 'outcome', v_outcome),
    v_now
  );

  RETURN jsonb_build_object(
    'round_id',      v_round_id,
    'choice',        p_choice,
    'outcome',       v_outcome,
    'won',           v_outcome = p_choice,
    'bet_amount',    p_bet_amount,
    'payout_amount', v_payout,
    'profit',        v_profit,
    'new_balance',   (SELECT wallet_balance FROM public.members WHERE id = v_user)
  );
END;
$$ LANGUAGE plpgsql;


-- ------------------------------------------------------------
-- 13. play_dice
--     Rolls 1–100, computes a fair multiplier from the win
--     probability (1% house edge), and settles the bet.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.play_dice(
  p_bet_amount numeric,
  p_direction  text,
  p_target     integer
)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id     uuid;
  v_balance     numeric;
  v_roll        int;
  v_won         boolean;
  v_probability numeric;
  v_multiplier  numeric;
  v_payout      numeric;
  v_profit      numeric;
  v_new_balance numeric;
BEGIN
  -- ── AUTH ──────────────────────────────────────────────────────
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  -- ── VALIDATE INPUTS ───────────────────────────────────────────
  IF p_direction NOT IN ('over', 'under') THEN
    RETURN jsonb_build_object('error', 'Invalid direction. Use ''over'' or ''under''');
  END IF;

  IF p_target < 2 OR p_target > 98 THEN
    RETURN jsonb_build_object('error', 'Target must be between 2 and 98');
  END IF;

  IF p_bet_amount IS NULL OR p_bet_amount <= 0 THEN
    RETURN jsonb_build_object('error', 'Bet amount must be greater than zero');
  END IF;

  -- ── FETCH BALANCE (row lock prevents race conditions) ─────────
  SELECT wallet_balance INTO v_balance
  FROM members
  WHERE id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Member account not found');
  END IF;

  IF v_balance < p_bet_amount THEN
    RETURN jsonb_build_object('error', 'Insufficient balance');
  END IF;

  -- ── ROLL (1–100 inclusive) ────────────────────────────────────
  v_roll := floor(random() * 100 + 1)::int;

  -- ── OUTCOME ───────────────────────────────────────────────────
  IF p_direction = 'over' THEN
    v_won         := v_roll > p_target;
    v_probability := (100 - p_target)::numeric / 100;
  ELSE
    v_won         := v_roll < p_target;
    v_probability := (p_target - 1)::numeric / 100;
  END IF;

  -- ── MULTIPLIER (house edge = 1%) ──────────────────────────────
  v_multiplier := round(0.99 / v_probability, 4);

  -- ── PAYOUT ────────────────────────────────────────────────────
  IF v_won THEN
    v_payout      := round(p_bet_amount * v_multiplier, 2);
    v_profit      := v_payout - p_bet_amount;
    v_new_balance := v_balance - p_bet_amount + v_payout;
  ELSE
    v_payout      := 0;
    v_profit      := -p_bet_amount;
    v_new_balance := v_balance - p_bet_amount;
  END IF;

  -- ── COMMIT ────────────────────────────────────────────────────
  UPDATE members
  SET wallet_balance = v_new_balance
  WHERE id = v_user_id;

  INSERT INTO casino_rounds (
    user_id, game_type, bet_amount, outcome_won,
    payout_amount, profit, multiplier, metadata
  ) VALUES (
    v_user_id, 'dice', p_bet_amount, v_won,
    v_payout, v_profit, v_multiplier,
    jsonb_build_object(
      'roll',      v_roll,
      'target',    p_target,
      'direction', p_direction
    )
  );

  RETURN jsonb_build_object(
    'roll',        v_roll,
    'won',         v_won,
    'payout',      v_payout,
    'profit',      v_profit,
    'multiplier',  v_multiplier,
    'new_balance', v_new_balance
  );
END;
$$ LANGUAGE plpgsql;


-- ------------------------------------------------------------
-- 14. play_limbo
--     Generates a Pareto-distributed result and pays out if
--     it meets or exceeds the player's target multiplier.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.play_limbo(
  p_bet_amount        numeric,
  p_target_multiplier numeric
)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- ── House edge: adjust here only — flows through all math ─────
  v_house_edge  numeric := 0.01;

  -- ── Working vars ───────────────────────────────────────────────
  v_user        uuid    := auth.uid();
  v_balance     numeric;
  v_result      numeric;
  v_won         boolean;
  v_payout      numeric;
  v_profit      numeric;
  v_new_balance numeric;
BEGIN
  -- ── Auth guard ────────────────────────────────────────────────
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated.');
  END IF;

  -- ── Input validation ──────────────────────────────────────────
  IF p_bet_amount <= 0 THEN
    RETURN jsonb_build_object('error', 'Bet amount must be greater than 0.');
  END IF;

  IF p_target_multiplier < 1 OR p_target_multiplier > 999 THEN
    RETURN jsonb_build_object('error', 'Target multiplier must be between 1× and 999×.');
  END IF;

  -- ── Lock row and read balance (prevents race conditions) ───────
  SELECT wallet_balance
    INTO v_balance
    FROM public.members
   WHERE id = v_user
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Member account not found.');
  END IF;

  IF v_balance < p_bet_amount THEN
    RETURN jsonb_build_object('error', 'Insufficient balance.');
  END IF;

  -- ── Generate result: Pareto distribution, 2dp, capped at 999 ──
  -- FLOOR(x * 100) / 100 gives us 2 decimal places (floor, not round)
  v_result := LEAST(
    FLOOR((1.0 / (random() + 0.000001))::numeric * 100) / 100,
    999
  );

  -- ── Determine outcome ─────────────────────────────────────────
  v_won := v_result >= p_target_multiplier;

  -- ── Payout math — house edge is baked into the Pareto distribution
  -- Win probability (informational): (1 - v_house_edge) / p_target_multiplier
  IF v_won THEN
    v_payout := p_bet_amount * p_target_multiplier;
    v_profit  := v_payout - p_bet_amount;
  ELSE
    v_payout := 0;
    v_profit  := -p_bet_amount;
  END IF;

  -- ── Update wallet ─────────────────────────────────────────────
  v_new_balance := v_balance - p_bet_amount + v_payout;

  UPDATE public.members
     SET wallet_balance = v_new_balance
   WHERE id = v_user;

  -- ── Record round ──────────────────────────────────────────────
  INSERT INTO public.casino_rounds (
    user_id,
    game_type,
    bet_amount,
    outcome_won,
    payout_amount,
    profit,
    multiplier,
    metadata
  ) VALUES (
    v_user,
    'limbo',
    p_bet_amount,
    v_won,
    v_payout,
    v_profit,
    p_target_multiplier,
    jsonb_build_object(
      'result_multiplier', v_result,
      'target_multiplier', p_target_multiplier
    )
  );

  -- ── Return result ─────────────────────────────────────────────
  RETURN jsonb_build_object(
    'result_multiplier', v_result,
    'won',               v_won,
    'payout',            v_payout,
    'profit',            v_profit,
    'new_balance',       v_new_balance
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', 'An unexpected error occurred. Please try again.');
END;
$$ LANGUAGE plpgsql;


-- ------------------------------------------------------------
-- 15. play_plinko
--     Simulates a Plinko drop, selects a multiplier from the
--     appropriate risk table, and settles the bet.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.play_plinko(
  p_bet_amount numeric,
  p_rows       integer,
  p_risk       text
)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- ── HOUSE EDGE ────────────────────────────────────────────────
  -- Embedded in the multiplier tables below; declared here
  -- so it's easy to audit / adjust tables in one place.
  v_house_edge numeric := 0.01;

  -- ── MULTIPLIER TABLES ─────────────────────────────────────────
  -- For N rows there are N+1 buckets (0 = all-Left, N = all-Right).
  -- Arrays are 1-indexed in PG; bucket_index + 1 = array index.
  -- All arrays are symmetric.

  -- Low risk
  v_low_8   numeric[] := ARRAY[5.6,  2.1, 1.1, 1.0, 0.5,      1.0, 1.1,  2.1,  5.6];
  v_low_12  numeric[] := ARRAY[8.9,  3.0, 1.4, 1.1, 1.0, 0.5, 0.3, 0.5,  1.0,  1.1, 1.4, 3.0, 8.9];
  v_low_16  numeric[] := ARRAY[16.0, 9.0, 4.0, 2.0, 1.4, 1.1, 1.0, 0.7,  0.5,  0.7, 1.0, 1.1, 1.4, 2.0, 4.0, 9.0, 16.0];

  -- Medium risk
  v_med_8   numeric[] := ARRAY[13.0,  3.0,  1.3, 0.7, 0.4,            0.7, 1.3,  3.0,  13.0];
  v_med_12  numeric[] := ARRAY[24.0,  5.0,  2.0, 0.9, 0.5, 0.3, 0.2, 0.3, 0.5,  0.9,  2.0, 5.0, 24.0];
  v_med_16  numeric[] := ARRAY[110.0, 41.0, 10.0, 5.0, 2.0, 0.9, 0.5, 0.3, 0.2, 0.3,  0.5, 0.9, 2.0, 5.0, 10.0, 41.0, 110.0];

  -- High risk
  v_high_8  numeric[] := ARRAY[29.0,  4.0,  1.5, 0.3, 0.2,           0.3, 1.5,  4.0,  29.0];
  v_high_12 numeric[] := ARRAY[46.0,  6.0,  2.0, 0.5, 0.2, 0.1, 0.1, 0.1, 0.2,  0.5,  2.0, 6.0, 46.0];
  v_high_16 numeric[] := ARRAY[999.0, 200.0, 60.0, 15.0, 3.0, 0.9, 0.3, 0.2, 0.1, 0.2, 0.3, 0.9, 3.0, 15.0, 60.0, 200.0, 999.0];

  -- ── WORKING VARIABLES ─────────────────────────────────────────
  v_user_id      uuid;
  v_balance      numeric;
  v_path         boolean[] := ARRAY[]::boolean[];
  v_step         boolean;
  v_bucket_index int := 0;
  v_mults        numeric[];
  v_multiplier   numeric;
  v_payout       numeric;
  v_profit       numeric;
  v_won          boolean;
  v_new_balance  numeric;
  i              int;
BEGIN
  -- ── AUTH ──────────────────────────────────────────────────────
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  -- ── INPUT VALIDATION ──────────────────────────────────────────
  IF p_bet_amount IS NULL OR p_bet_amount <= 0 THEN
    RETURN jsonb_build_object('error', 'Bet amount must be greater than zero');
  END IF;

  IF p_rows NOT IN (8, 12, 16) THEN
    RETURN jsonb_build_object('error', 'Row count must be 8, 12, or 16');
  END IF;

  IF p_risk NOT IN ('low', 'medium', 'high') THEN
    RETURN jsonb_build_object('error', 'Risk must be low, medium, or high');
  END IF;

  -- ── WALLET LOCK ───────────────────────────────────────────────
  SELECT wallet_balance
  INTO   v_balance
  FROM   members
  WHERE  id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Member record not found');
  END IF;

  IF v_balance < p_bet_amount THEN
    RETURN jsonb_build_object('error', 'Insufficient balance');
  END IF;

  -- ── GENERATE PATH ─────────────────────────────────────────────
  -- Each step: true = Right, false = Left.
  -- bucket_index = count of Right turns (0 = far left, p_rows = far right).
  FOR i IN 1..p_rows LOOP
    v_step := (random() < 0.5);
    v_path := array_append(v_path, v_step);
    IF v_step THEN
      v_bucket_index := v_bucket_index + 1;
    END IF;
  END LOOP;

  -- ── SELECT MULTIPLIER TABLE ───────────────────────────────────
  IF p_risk = 'low' THEN
    CASE p_rows
      WHEN 8  THEN v_mults := v_low_8;
      WHEN 12 THEN v_mults := v_low_12;
      ELSE         v_mults := v_low_16;
    END CASE;
  ELSIF p_risk = 'medium' THEN
    CASE p_rows
      WHEN 8  THEN v_mults := v_med_8;
      WHEN 12 THEN v_mults := v_med_12;
      ELSE         v_mults := v_med_16;
    END CASE;
  ELSE -- 'high'
    CASE p_rows
      WHEN 8  THEN v_mults := v_high_8;
      WHEN 12 THEN v_mults := v_high_12;
      ELSE         v_mults := v_high_16;
    END CASE;
  END IF;

  -- PG arrays are 1-indexed; bucket_index is 0-based
  v_multiplier := v_mults[v_bucket_index + 1];

  -- ── CALCULATE PAYOUT ──────────────────────────────────────────
  v_payout := p_bet_amount * v_multiplier;
  v_profit  := v_payout - p_bet_amount;
  v_won     := v_multiplier >= 1.0;

  -- ── APPLY NET WALLET CHANGE ───────────────────────────────────
  -- Single UPDATE: deduct bet and credit payout atomically
  UPDATE members
  SET    wallet_balance = wallet_balance - p_bet_amount + v_payout
  WHERE  id = v_user_id
  RETURNING wallet_balance INTO v_new_balance;

  -- ── RECORD ROUND ──────────────────────────────────────────────
  INSERT INTO casino_rounds (
    user_id,
    game_type,
    bet_amount,
    outcome_won,
    payout_amount,
    profit,
    multiplier,
    metadata
  ) VALUES (
    v_user_id,
    'plinko',
    p_bet_amount,
    v_won,
    v_payout,
    v_profit,
    v_multiplier,
    jsonb_build_object(
      'path',         to_jsonb(v_path),
      'bucket_index', v_bucket_index,
      'rows',         p_rows,
      'risk',         p_risk
    )
  );

  -- ── RETURN ────────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'path',         to_jsonb(v_path),
    'bucket_index', v_bucket_index,
    'multiplier',   v_multiplier,
    'won',          v_won,
    'payout',       v_payout,
    'profit',       v_profit,
    'new_balance',  v_new_balance
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', SQLERRM);
END;
$$ LANGUAGE plpgsql;


-- ------------------------------------------------------------
-- 16. process_daily_claim
--     Enforces the 9 AM WAT claim window, validates the
--     one-claim-per-day rule, credits yield, and logs it.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_daily_claim()
RETURNS numeric
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_investment       investments%ROWTYPE;
  v_today_wat        date;
  v_last_claimed_wat date;
  v_claimable        numeric(12,2);
BEGIN
  -- WAT = UTC+1 (Africa/Lagos)
  v_today_wat := (now() AT TIME ZONE 'Africa/Lagos')::date;

  -- 9 AM WAT window check (server-enforced)
  IF EXTRACT(HOUR FROM (now() AT TIME ZONE 'Africa/Lagos')) < 9 THEN
    RAISE EXCEPTION 'Claim window not open yet. Come back after 9 AM WAT.';
  END IF;

  -- Fetch active investment
  SELECT * INTO v_investment
  FROM investments
  WHERE user_id = auth.uid()
    AND status  = 'active'
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active investment found';
  END IF;

  -- Derive last claimed date in WAT
  v_last_claimed_wat := (v_investment.last_claimed_at AT TIME ZONE 'Africa/Lagos')::date;

  -- Already claimed today (WAT)?
  IF v_investment.last_claimed_at IS NOT NULL
     AND v_last_claimed_wat = v_today_wat THEN
    RAISE EXCEPTION 'Already claimed today';
  END IF;

  -- Calculate today's yield from rate
  v_claimable := ROUND(v_investment.amount * v_investment.daily_rate, 2);

  IF v_claimable <= 0 THEN
    RAISE EXCEPTION 'No yield to claim';
  END IF;

  -- Atomic update on the investment row
  UPDATE investments
  SET
    claimed_today    = true,
    accrued_earnings = accrued_earnings + v_claimable,
    claimable_amount = 0,
    last_claimed_at  = now()
  WHERE id = v_investment.id;

  -- Credit wallet immediately
  UPDATE members
  SET wallet_balance = wallet_balance + v_claimable
  WHERE id = auth.uid();

  -- Write transaction record
  INSERT INTO transactions (user_id, type, label, amount, investment_id, status)
  VALUES (auth.uid(), 'daily_claim', 'Daily yield claimed', v_claimable, v_investment.id, 'completed');

  RETURN v_claimable;
END;
$$ LANGUAGE plpgsql;


-- ------------------------------------------------------------
-- 17. process_deposit
--     Creates a pending deposit transaction and returns a
--     unique reference for payment verification.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_deposit(
  p_amount numeric
)
RETURNS json
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_ref     text;
BEGIN
  IF p_amount < 6000 THEN
    RETURN json_build_object('error', 'Minimum deposit is ₦6,000.');
  END IF;

  -- Generate a unique reference
  v_ref := 'GH-DEP-' || upper(substring(md5(random()::text) FROM 1 FOR 8));

  INSERT INTO transactions (user_id, type, label, amount, status, reference)
  VALUES (
    v_user_id,
    'deposit',
    'Wallet deposit',
    p_amount,
    'pending',
    v_ref
  );

  RETURN json_build_object(
    'success',   true,
    'reference', v_ref
  );
END;
$$ LANGUAGE plpgsql;


-- ------------------------------------------------------------
-- 18. process_early_exit
--     Validates the 50% duration condition, applies a tiered
--     penalty on accrued earnings, and returns funds to wallet.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_early_exit()
RETURNS numeric
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id             uuid;
  v_amount         numeric(12,2);
  v_duration_days  integer;
  v_accrued        numeric(12,2);
  v_start_date     timestamptz;
  v_days_in        integer;
  v_pct_days       numeric;
  v_penalty_rate   numeric;
  v_penalty_amount numeric(12,2);
  v_net_payout     numeric(12,2);
BEGIN
  -- 1. Fetch the active investment
  SELECT id, amount, duration_days, accrued_earnings, start_date
  INTO   v_id, v_amount, v_duration_days, v_accrued, v_start_date
  FROM   investments
  WHERE  user_id = auth.uid()
    AND  status  = 'active'
  LIMIT  1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active investment found';
  END IF;

  -- 2. Enforce the 50% duration condition server-side
  v_days_in  := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - v_start_date)) / 86400));
  v_pct_days := v_days_in::numeric / v_duration_days;

  IF v_pct_days < 0.5 THEN
    RAISE EXCEPTION 'Exit condition not met: minimum 50%% of plan duration required';
  END IF;

  -- 3. Calculate penalty
  --    < 70% complete → 25% of accrued; ≥ 70% complete → 15% of accrued
  v_penalty_rate   := CASE WHEN v_pct_days < 0.7 THEN 0.25 ELSE 0.15 END;
  v_penalty_amount := ROUND(v_accrued * v_penalty_rate, 2);
  v_net_payout     := v_amount + v_accrued - v_penalty_amount;

  -- 4. Mark investment as exited
  UPDATE investments
  SET
    status           = 'exited_early',
    claimable_amount = 0,
    claimed_today    = true
  WHERE id = v_id;

  -- 5. Credit net payout to wallet
  UPDATE members
  SET wallet_balance = wallet_balance + v_net_payout
  WHERE id = auth.uid();

  -- 6. Record the transaction
  INSERT INTO transactions (user_id, type, label, amount, investment_id)
  VALUES (
    auth.uid(),
    'early_exit',
    'Early exit — funds returned to wallet',
    v_net_payout,
    v_id
  );

  RETURN v_net_payout;
END;
$$ LANGUAGE plpgsql;


-- ------------------------------------------------------------
-- 19. process_plan_maturity
--     Scheduled / cron-invoked. Loops all active investments
--     past their payout_date, marks them completed, and
--     credits capital + earnings to each member's wallet.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_plan_maturity()
RETURNS void
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec      RECORD;
  v_payout numeric(12,2);
BEGIN
  -- Loop every active investment whose payout_date has passed
  FOR rec IN
    SELECT id, user_id, amount, accrued_earnings
    FROM   investments
    WHERE  status      = 'active'
      AND  payout_date <= now()
  LOOP
    v_payout := rec.amount + COALESCE(rec.accrued_earnings, 0);

    -- 1. Mark the plan as completed
    UPDATE investments
    SET status = 'completed'
    WHERE id = rec.id;

    -- 2. Credit the full payout (capital + earnings) to the member's wallet
    UPDATE members
    SET wallet_balance = wallet_balance + v_payout
    WHERE id = rec.user_id;

    -- 3. Record the transaction
    INSERT INTO transactions (user_id, type, label, amount, investment_id)
    VALUES (
      rec.user_id,
      'vault_maturity',
      'Plan matured — capital + earnings returned',
      v_payout,
      rec.id
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql;


-- ------------------------------------------------------------
-- 20. process_post_like
--     Inserts a like, prevents self-likes and double-likes,
--     credits ₦100 to the liker and ₦200 to the post owner.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_post_like(
  p_post_id  uuid,
  p_liker_id uuid
)
RETURNS json
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post_owner_id uuid;
  v_already_liked boolean;
BEGIN
  -- Check if already liked
  SELECT EXISTS(
    SELECT 1 FROM likes
    WHERE post_id = p_post_id AND user_id = p_liker_id
  ) INTO v_already_liked;

  IF v_already_liked THEN
    RAISE EXCEPTION 'You have already liked this post';
  END IF;

  -- Get post owner
  SELECT user_id INTO v_post_owner_id
  FROM posts
  WHERE id = p_post_id;

  IF v_post_owner_id IS NULL THEN
    RAISE EXCEPTION 'Post not found';
  END IF;

  -- Prevent self-liking
  IF v_post_owner_id = p_liker_id THEN
    RAISE EXCEPTION 'You cannot like your own post';
  END IF;

  -- Everything in one transaction
  BEGIN
    -- Insert like record
    INSERT INTO likes (post_id, user_id)
    VALUES (p_post_id, p_liker_id);

    -- Credit liker ₦100
    UPDATE members
    SET wallet_balance = wallet_balance + 100
    WHERE id = p_liker_id;

    -- Credit post owner ₦200
    UPDATE members
    SET wallet_balance = wallet_balance + 200
    WHERE id = v_post_owner_id;

    -- Log both reward transactions
    INSERT INTO transactions (user_id, type, label, amount) VALUES
      (p_liker_id,      'blog_like_reward', 'Liked a post',    100),
      (v_post_owner_id, 'blog_post_reward', 'Post was liked',  200);

    RETURN json_build_object(
      'success',      true,
      'liker_earned', 100,
      'owner_earned', 200
    );

  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Transaction failed: %', SQLERRM;
  END;
END;
$$ LANGUAGE plpgsql;


-- ------------------------------------------------------------
-- 21. process_promoter_withdrawal
--     Validates and deducts from the promoter's wallet,
--     creates the withdrawal_requests row, and logs the
--     pending transaction.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_promoter_withdrawal(
  p_amount     numeric,
  p_bank       text,
  p_acc_number text,
  p_acc_name   text
)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id         uuid;
  v_promoter_id     uuid;
  v_current_balance numeric;
  v_reference       text;
  v_label           text;
  v_remaining       numeric;
  v_transaction_id  uuid;
BEGIN
  -- 1. Identify caller
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated.');
  END IF;

  -- 2. Fetch promoter record and lock the row
  SELECT id, wallet_balance
    INTO v_promoter_id, v_current_balance
    FROM public.promoters
   WHERE user_id = v_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Promoter profile not found.');
  END IF;

  -- 3. Validate amount
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('error', 'Withdrawal amount must be greater than zero.');
  END IF;

  IF p_amount > v_current_balance THEN
    RETURN jsonb_build_object('error', 'Insufficient balance. Available: ' || v_current_balance::text);
  END IF;

  -- 4. Generate reference
  v_reference := 'GH-PW-'
    || upper(to_char(now(), 'YYYYMMDD'))
    || '-'
    || upper(substring(gen_random_uuid()::text FROM 1 FOR 8));

  -- 5. Build label
  v_label := 'Withdrawal to ' || p_bank || ' · ' || p_acc_number || ' · ' || p_acc_name;

  -- 6. Deduct from promoter wallet
  v_remaining := v_current_balance - p_amount;

  UPDATE public.promoters
    SET wallet_balance = v_remaining
  WHERE id = v_promoter_id;

  -- 7. Log the pending transaction and capture its ID
  INSERT INTO public.transactions (
    user_id, type, label, amount, status, reference
  ) VALUES (
    v_user_id, 'withdrawal', v_label, p_amount, 'pending', v_reference
  )
  RETURNING id INTO v_transaction_id;

  -- Create the withdrawal request referencing the transaction
  INSERT INTO public.withdrawal_requests (
    user_id, role, amount, bank, account_number,
    account_name, status, reference, transaction_id
  ) VALUES (
    v_user_id, 'promoter', p_amount, p_bank, p_acc_number,
    p_acc_name, 'pending', v_reference, v_transaction_id
  );

  -- 8. Return success payload
  RETURN jsonb_build_object(
    'reference',         v_reference,
    'remaining_balance', v_remaining
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('error', SQLERRM);
END;
$$ LANGUAGE plpgsql;


-- ------------------------------------------------------------
-- 22. process_withdrawal
--     Validates balance, deducts the amount, creates the
--     withdrawal_requests row, and logs the pending transaction.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_withdrawal(
  p_amount     numeric,
  p_bank       text,
  p_acc_number text,
  p_acc_name   text
)
RETURNS json
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id        uuid := auth.uid();
  v_balance        numeric;
  v_ref            text;
  v_transaction_id uuid;
  v_label          text;
BEGIN
  -- Lock the row and read current balance
  SELECT wallet_balance INTO v_balance
  FROM members
  WHERE id = v_user_id
  FOR UPDATE;

  IF v_balance IS NULL THEN
    RETURN json_build_object('error', 'Member record not found.');
  END IF;

  IF p_amount < 10000 THEN
    RETURN json_build_object('error', 'Minimum withdrawal is ₦10,000.');
  END IF;

  IF p_amount > v_balance THEN
    RETURN json_build_object('error', 'Amount exceeds your available balance.');
  END IF;

  -- Generate reference
  v_ref   := 'GH-WDR-' || upper(substring(md5(random()::text) FROM 1 FOR 8));
  v_label := 'Withdrawal to ' || p_bank || ' · ' || p_acc_number || ' · ' || p_acc_name;

  -- Deduct balance
  UPDATE members
  SET wallet_balance = wallet_balance - p_amount
  WHERE id = v_user_id;

  -- Log the pending transaction and capture its ID
  INSERT INTO public.transactions (
    user_id, type, label, amount, status, reference
  ) VALUES (
    v_user_id, 'withdrawal', v_label, p_amount, 'pending', v_ref
  )
  RETURNING id INTO v_transaction_id;

  -- Create withdrawal request referencing the transaction
  INSERT INTO public.withdrawal_requests (
    user_id, role, amount, bank, account_number,
    account_name, status, reference, transaction_id
  ) VALUES (
    v_user_id, 'user', p_amount, p_bank, p_acc_number,
    p_acc_name, 'pending', v_ref, v_transaction_id
  );

  RETURN json_build_object(
    'success',           true,
    'reference',         v_ref,
    'remaining_balance', v_balance - p_amount
  );
END;
$$ LANGUAGE plpgsql;


-- ------------------------------------------------------------
-- 23. reveal_tile
--     Validates and reveals a Mines tile. Returns a mine hit
--     (game over) or updates the running multiplier on a safe
--     tile. Records a loss in casino_rounds on mine hit.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reveal_tile(
  p_session_id uuid,
  p_tile_index integer
)
RETURNS json
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id      uuid;
  v_session      mines_sessions%rowtype;
  v_revealed_ct  int;
  v_tiles_before int;
  v_safe_before  int;
  v_new_mult     numeric;
  v_winnings     numeric;
  v_new_revealed int[];
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('error', 'Not authenticated');
  END IF;

  IF p_tile_index < 0 OR p_tile_index > 24 THEN
    RETURN json_build_object('error', 'Invalid tile');
  END IF;

  -- Lock the row — this is what prevents race conditions
  SELECT * INTO v_session
  FROM mines_sessions
  WHERE id = p_session_id AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Session not found');
  END IF;
  IF v_session.status != 'active' THEN
    RETURN json_build_object('error', 'Game is not active');
  END IF;
  IF p_tile_index = ANY(v_session.revealed_tiles) THEN
    RETURN json_build_object('error', 'Tile already revealed');
  END IF;

  -- ── Mine hit ─────────────────────────────────────────────────
  IF p_tile_index = ANY(v_session.mine_positions) THEN
    UPDATE mines_sessions SET status = 'lost' WHERE id = p_session_id;

    -- Record loss in casino_rounds
    INSERT INTO public.casino_rounds (
      user_id, game_type, bet_amount, outcome_won,
      payout_amount, profit, multiplier, metadata
    ) VALUES (
      v_user_id,
      'mines',
      v_session.bet_amount,
      false,
      0,
      -v_session.bet_amount,
      0,
      jsonb_build_object(
        'mines_count',    v_session.mines_count,
        'tiles_revealed', COALESCE(array_length(v_session.revealed_tiles, 1), 0),
        'session_id',     p_session_id
      )
    );

    -- Now safe to reveal positions since the game is over
    RETURN json_build_object(
      'hit',            true,
      'mine_positions', v_session.mine_positions,
      'bet_amount',     v_session.bet_amount
    );
  END IF;

  -- ── Safe tile: update multiplier ─────────────────────────────
  -- coalesce handles empty array (array_length returns null on '{}')
  v_revealed_ct  := COALESCE(array_length(v_session.revealed_tiles, 1), 0);
  v_tiles_before := 25 - v_revealed_ct;
  v_safe_before  := (25 - v_session.mines_count) - v_revealed_ct;
  v_new_mult     := v_session.current_multiplier
                    * v_tiles_before::numeric
                    / v_safe_before::numeric;
  v_winnings     := v_session.bet_amount * v_new_mult * v_session.house_edge;
  v_new_revealed := v_session.revealed_tiles || p_tile_index;

  UPDATE mines_sessions
  SET
    revealed_tiles     = v_new_revealed,
    current_multiplier = v_new_mult,
    accrued_winnings   = v_winnings
  WHERE id = p_session_id;

  RETURN json_build_object(
    'hit',              false,
    'multiplier',       round(v_new_mult * v_session.house_edge, 2),
    'accrued_winnings', round(v_winnings, 2),
    'revealed_count',   array_length(v_new_revealed, 1)
  );
END;
$$ LANGUAGE plpgsql;


-- ------------------------------------------------------------
-- 24. start_mines_game
--     Validates bet and mine count, generates random mine
--     positions, deducts the bet, and creates the session row.
--     Mine positions are never returned to the client here.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_mines_game(
  p_bet_amount  numeric,
  p_mines_count integer
)
RETURNS json
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- ── Change these to adjust game limits ────────────────────────
  c_min_bet    constant numeric := 500;
  c_max_bet    constant numeric := 100000000;
  c_min_mines  constant int    := 1;
  c_max_mines  constant int    := 24;
  c_house_edge constant numeric := 0.95;
  -- ─────────────────────────────────────────────────────────────

  v_user_id    uuid;
  v_wallet     numeric;
  v_mine_pos   int[];
  v_session_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('error', 'Not authenticated');
  END IF;

  -- Input validation
  IF p_bet_amount < c_min_bet THEN
    RETURN json_build_object('error', format('Minimum bet is ₦%s', c_min_bet::text));
  END IF;
  IF p_bet_amount > c_max_bet THEN
    RETURN json_build_object('error', format('Maximum bet is ₦%s', c_max_bet::text));
  END IF;
  IF p_mines_count < c_min_mines OR p_mines_count > c_max_mines THEN
    RETURN json_build_object('error', 'Mines count must be between 1 and 24');
  END IF;

  -- Block if an active session already exists
  IF EXISTS (
    SELECT 1 FROM mines_sessions
    WHERE user_id = v_user_id AND status = 'active'
  ) THEN
    RETURN json_build_object('error', 'You have an active game. Cash out or finish it first.');
  END IF;

  -- Lock wallet row and check balance
  SELECT wallet_balance INTO v_wallet
  FROM members
  WHERE id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Account not found');
  END IF;
  IF v_wallet < p_bet_amount THEN
    RETURN json_build_object('error', 'Insufficient wallet balance');
  END IF;

  -- Generate mine positions with unbiased sampling without replacement
  SELECT array_agg(tile ORDER BY random_key)
  INTO v_mine_pos
  FROM (
    SELECT
      tile,
      gen_random_uuid() AS random_key
    FROM generate_series(0, 24) AS tile
    ORDER BY random_key
    LIMIT p_mines_count
  ) t;

  -- Deduct bet
  UPDATE members
  SET wallet_balance = wallet_balance - p_bet_amount
  WHERE id = v_user_id;

  -- Create session row
  INSERT INTO mines_sessions (
    user_id,
    bet_amount,
    mines_count,
    mine_positions,
    revealed_tiles,
    current_multiplier,
    accrued_winnings,
    house_edge,
    status
  )
  VALUES (
    v_user_id,
    p_bet_amount,
    p_mines_count,
    v_mine_pos,
    '{}',
    1.0,
    0,
    c_house_edge,
    'active'
  )
  RETURNING id INTO v_session_id;

  -- Log the bet as a transaction
  INSERT INTO transactions (user_id, type, label, amount, status, reference)
  VALUES (
    v_user_id,
    'mines_bet',
    format('Mines – ₦%s bet (%s mines)', p_bet_amount, p_mines_count),
    p_bet_amount,
    'completed',
    v_session_id::text  -- Session ID as reference so it can be looked up
  );

  -- Return only what the client needs — mine_positions never leave the server
  RETURN json_build_object(
    'session_id',  v_session_id,
    'mines_count', p_mines_count,
    'bet_amount',  p_bet_amount
  );
END;
$$ LANGUAGE plpgsql;


