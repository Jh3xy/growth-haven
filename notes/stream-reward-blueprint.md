# GrowthHaven — Stream Reward System: Architectural Blueprint

---

## Guiding Principle

The client is untrusted. It reports events (play, pause, complete). The server records timestamps, validates elapsed wall-clock time, and credits the wallet. The client can lie about what it sends — it cannot lie about what time it is on the server.

---

## 1. The `stream_sessions` Table

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key, default `gen_random_uuid()` |
| `user_id` | `uuid` | FK → `members.id`, not null |
| `song_id` | `text` | The video/song identifier from your songs list |
| `started_at` | `timestamptz` | Set to `NOW()` by the server at session creation. **Never trusted from the client.** |
| `required_seconds` | `integer` | 80% of `song_duration_seconds`. Stored at creation so the server has a reference. Validated against wall-clock, not client-reported progress. |
| `rewarded` | `boolean` | Default `false`. Flipped to `true` by `complete_stream` after successful credit. Immutable once `true`. |
| `reward_amount` | `integer` | The amount credited (e.g. 50 or 75). Stored for ledger consistency even if the rate changes later. |
| `created_at` | `timestamptz` | Default `NOW()`. Used for the per-day uniqueness check. |
| `is_resync` | `boolean` | Default `false`. Set to `true` if this session was created by a Re-Sync action. Useful for future audit queries. |

### Key Constraints

- **Unique partial index:** `(user_id, song_id, created_at::date)` where `rewarded = true` — enforces that a user earns from a given song at most once per calendar day, regardless of how many sessions they open.
- **RLS:** `user_id = auth.uid()` on all operations. Users can only touch their own rows.
- No client ever writes directly to this table. All mutations go through RPCs with `SECURITY DEFINER`.

---

## 2. `start_stream` — Logic Flow

This RPC is called in two scenarios: **initial play** and **Re-Sync**. The `is_resync` boolean parameter distinguishes them. The deposit gate and daily cap are checked the same way in both cases.

**Parameters received from client:**
- `p_song_id` (text)
- `p_song_duration_seconds` (integer) — client-reported. Used to compute `required_seconds` but the server never trusts this alone for reward validation.
- `p_is_resync` (boolean)

---

### Gate 1 — Authentication

Confirm `auth.uid()` is not null. Reject immediately if unauthenticated.

---

### Gate 2 — Deposit Check

Query `members` where `id = auth.uid()`. Check whether `total_deposited > 0` (or whatever column you use to track this). If the user has never deposited, return a structured error payload:

```
{ "error": "deposit_required", "message": "Make a deposit to earn from streaming." }
```

The client reads this code and shows the gate overlay — same pattern as the blog section. Do not raise a Postgres exception here; return a typed JSON error so the client can branch on it without a try/catch.

---

### Gate 3 — Already Earned From This Song Today

Query `stream_sessions` for a row where:
- `user_id = auth.uid()`
- `song_id = p_song_id`
- `rewarded = true`
- `created_at::date = CURRENT_DATE` (server's date in WAT/UTC+1)

If a row exists, return:

```
{ "error": "already_rewarded_today", "message": "You've already earned from this song today." }
```

The client reads this and disables the reward progress bar for this song, showing a subtle "Earned today" label instead. Playback continues normally — only the reward is blocked.

---

### Gate 4 — Daily Earnings Cap Check

Sum `reward_amount` from `stream_sessions` where:
- `user_id = auth.uid()`
- `rewarded = true`
- `created_at::date = CURRENT_DATE`

If that sum is already at or above your cap (e.g. ₦2,000), return:

```
{ "error": "daily_cap_reached", "message": "You've reached your daily streaming earnings limit." }
```

Client shows the cap state on the progress bar. Same deal — playback continues, reward UI goes dormant.

---

### Gate 5 — Re-Sync Cleanup (only if `p_is_resync = true`)

If this is a Re-Sync call, find and soft-invalidate any existing open (unrewarded) session for this user + song from today:

- Query for rows where `user_id = auth.uid()`, `song_id = p_song_id`, `rewarded = false`, `created_at::date = CURRENT_DATE`
- Delete them. They're stale — the reset-on-pause contract means they're worthless once the timer was interrupted.

This prevents session accumulation. A user who pauses 40 times doesn't build up 40 open sessions.

---

### Session Creation

All gates passed. Insert into `stream_sessions`:

```
user_id        = auth.uid()
song_id        = p_song_id
started_at     = NOW()               ← server clock, not client
required_seconds = FLOOR(p_song_duration_seconds * 0.8)
rewarded       = false
reward_amount  = [your configured rate, e.g. 75]
is_resync      = p_is_resync
```

Return to client:

```
{
  "success": true,
  "session_id": "<uuid>",
  "required_seconds": <integer>,
  "started_at": "<ISO timestamp>"
}
```

The client stores `session_id` and `started_at` in local state. It uses `required_seconds` to drive the progress bar countdown.

---

## 3. `complete_stream` — Logic Flow

**Parameters received from client:**
- `p_session_id` (uuid)

The client calls this when its local progress bar reaches 100% (i.e. it believes enough time has elapsed). The server then independently confirms this using its own clock.

---

### Step 1 — Fetch and Validate Session Ownership

Query `stream_sessions` by `p_session_id`. Confirm:
- Row exists
- `user_id = auth.uid()` — prevents someone calling complete on another user's session
- `rewarded = false` — idempotency guard; if already rewarded, return success silently (don't double-credit)

If the row doesn't exist or ownership fails, raise an exception.

---

### Step 2 — Wall-Clock Elapsed Time Check

```
elapsed_seconds = EXTRACT(EPOCH FROM (NOW() - session.started_at))
```

Compare `elapsed_seconds` against `session.required_seconds`.

**If `elapsed_seconds < required_seconds`:** The client called complete too early. This is either a bug or a cheat attempt. Return:

```
{ "error": "insufficient_time", "elapsed": <actual>, "required": <required> }
```

Do not credit. Do not delete the session — the client can keep waiting and retry `complete_stream` later if it genuinely was a timing edge case.

**Tolerance buffer:** Consider accepting `elapsed_seconds >= required_seconds - 5` to absorb network latency (the client fires the call slightly before the server tick catches up). 5 seconds is conservative and reasonable.

---

### Step 3 — Re-check Daily Cap (double enforcement)

The cap was checked in `start_stream`, but time has passed. Re-run the daily sum query. If somehow the cap was reached between session creation and completion (e.g. multiple tabs), skip the credit and return:

```
{ "error": "daily_cap_reached" }
```

Mark the session `rewarded = true` anyway so it doesn't dangle. Just set `reward_amount = 0` to indicate no credit was given.

---

### Step 4 — Credit and Record

Run three writes atomically (wrap in a single function body — Postgres functions are implicitly transactional):

1. **Credit wallet:**
   ```
   UPDATE members SET wallet_balance = wallet_balance + session.reward_amount WHERE id = auth.uid()
   ```

2. **Mark session complete:**
   ```
   UPDATE stream_sessions SET rewarded = true WHERE id = p_session_id
   ```

3. **Insert transaction ledger row:**
   ```
   INSERT INTO transactions (user_id, type, label, amount)
   VALUES (auth.uid(), 'stream_reward', 'Earned from streaming', session.reward_amount)
   ```
   Keep the `type` value consistent and distinct (e.g. `'stream_reward'`) so it can be filtered in the Transactions section alongside `blog_like_reward` and others.

---

### Return Payload

```
{
  "success": true,
  "earned": <reward_amount>,
  "new_balance": <updated wallet_balance>
}
```

The client reads `earned` to animate the toast confirmation and optionally update the wallet balance display if the user is on the Home section.

---

## 4. Frontend Player Event Handling & Reward Progress Bar

### State the Client Must Track (in memory, not localStorage)

| Variable | Description |
|---|---|
| `activeSessionId` | UUID returned by `start_stream`. Null when no active session. |
| `sessionStartedAt` | JS `Date` object parsed from the server's `started_at` response. |
| `requiredSeconds` | Integer from `start_stream` response. |
| `rewardState` | Enum: `idle` / `active` / `paused` / `earned` / `capped` / `already_earned_today` |
| `progressIntervalId` | Reference to the `setInterval` driving the bar. |

---

### YT Player Event → Action Map

```
onReady         → No action. Session created only on explicit play.

onStateChange(PLAYING)
  If rewardState is 'idle':
    → Call start_stream(song_id, duration, is_resync=false)
    → On success: set activeSessionId, sessionStartedAt, requiredSeconds
    → Set rewardState = 'active'
    → Start progress interval (tick every 1s)
  If rewardState is 'paused':
    → (User resumed without hitting Re-Sync)
    → Do not start a new session automatically
    → Show the paused-state progress bar with the warning label
    → Re-Sync button becomes the only path back to 'active'

onStateChange(PAUSED)
  If rewardState is 'active':
    → Clear progress interval
    → Set rewardState = 'paused'
    → Fire pause toast: "Reward timer paused. Re-Sync to resume earning."
    → Null out activeSessionId (the server session is now stale by design)
    → Activate the Re-Sync button

onStateChange(BUFFERING)
  → Same as PAUSED treatment above.
  → The toast wording can differ: "Buffering paused your reward timer."

onStateChange(ENDED)
  If rewardState is 'active':
    → Clear progress interval (bar should already be at 100% or close)
    → If bar hasn't reached 100% yet, call complete_stream anyway — server validates
    → Handle server response (success or insufficient_time)

onStateChange(CUED / UNSTARTED)
  → Reset all client state to idle. Clear bar to 0%.
```

---

### Progress Bar Tick Logic

Every 1 second while `rewardState === 'active'`:

```
elapsed = (Date.now() - sessionStartedAt) / 1000
progress = Math.min(elapsed / requiredSeconds, 1.0)   // 0.0 → 1.0
Update bar fill width to (progress * 100)%

If progress >= 1.0:
  → Clear interval
  → Call complete_stream(activeSessionId)
  → On success response: set rewardState = 'earned', show earned toast
  → On error 'insufficient_time': retry complete_stream after 3s (server will pass once clock catches up)
```

The bar is purely cosmetic and driven by the local JS clock against the server's `started_at` timestamp. If the user's device clock is wrong, the bar may be slightly off — but the **server validates independently**, so the bar being off doesn't enable cheating. It only affects visual accuracy.

---

### Re-Sync Button Logic

The Re-Sync button is visible but dimmed during `rewardState === 'active'`. It activates (full opacity, clickable) only when `rewardState === 'paused'`.

On Re-Sync click:

```
1. Call start_stream(song_id, remaining_duration, is_resync=true)
   → remaining_duration = song total duration - current YT player position
   → This is what the server uses to compute the new required_seconds
   → The server deletes the old stale session and creates a fresh one from NOW()

2. On success:
   → Update activeSessionId, sessionStartedAt, requiredSeconds with fresh values
   → Set rewardState = 'active'
   → Reset bar to 0% and restart interval
   → Show subtle toast: "Reward timer restarted from current position."

3. On error (cap, already_earned_today, etc.):
   → Set rewardState to the appropriate state
   → Disable progress bar permanently for this song instance
```

The key insight: Re-Sync restarts the bar from 0% because `required_seconds` is now 80% of the *remaining* duration, not the full song. So the bar fills faster the later in the song they resume. The server still validates wall-clock elapsed against that shorter requirement — which is legitimate, since they've already watched part of the song.

---

### Progress Bar Visual States Summary

| `rewardState` | Bar appearance | Button state | Label |
|---|---|---|---|
| `idle` | Hidden or 0%, greyed | Re-Sync dimmed | — |
| `active` | Filling, green | Re-Sync dimmed | "Earning..." |
| `paused` | Frozen at last %, amber/orange tint | Re-Sync active | "Timer paused" |
| `earned` | 100%, green pulse animation | Re-Sync hidden | "+₦75 earned" |
| `capped` | Locked at current %, greyed | Re-Sync hidden | "Daily limit reached" |
| `already_earned_today` | 0%, greyed out entirely | Re-Sync hidden | "Earned today ✓" |

---

## Notes on WAT Midnight Reset

Your existing blog reward system presumably resets per calendar day. Confirm whether you're using `CURRENT_DATE` in server timezone (UTC) or WAT (UTC+1). The difference is a 1-hour window at midnight where users in Nigeria could double-dip across a UTC date boundary. Set your Postgres timezone or cast explicitly to `AT TIME ZONE 'Africa/Lagos'` in the daily cap and already-rewarded queries for consistency with how the rest of the platform handles this.
