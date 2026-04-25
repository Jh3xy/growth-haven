-- Replace only the mine-generation block inside start_mines_game with this.
-- This keeps the rest of your function unchanged.
--
-- Supabase/Postgres supports gen_random_uuid(), which gives each tile an
-- independent random sort key. We then take the first p_mines_count tiles,
-- guaranteeing unique positions from 0-24 without replacement.

-- Generate mine positions with unbiased sampling without replacement
select array_agg(tile order by random_key)
into v_mine_pos
from (
  select
    tile,
    gen_random_uuid() as random_key
  from generate_series(0, 24) as tile
  order by random_key
  limit p_mines_count
) t;
