

/**
 * supabase.js — GrowthHaven Supabase Client
 * Usage:
 *   import { supabase } from './supabase.js'
 */

import { createClient } from '@supabase/supabase-js';

// Vite exposes .env variables prefixed with VITE_ via import.meta.env
const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY

// Fail loudly in development if the env variables are missing.
// This prevents silent failures where Supabase just returns auth errors
if (!SUPABASE_URL || !SUPABASE_ANON) {
  throw new Error(
    '[GrowthHaven] Supabase env variables are missing.\n' +
    'Create a .env file at the project root with:\n' +
    '  VITE_SUPABASE_URL=...\n' +
    '  VITE_SUPABASE_ANON_KEY=...'
  )
}

// Create and export the single shared client instance
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON)
