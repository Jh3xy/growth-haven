

/**
 * auth.js — GrowthHaven Auth Functions
 * Usage:
 *   import { signUpUser, verifyEmailOtp, signInUser, createMemberProfile } from './auth.js'
 */


import { supabase } from './supabase.js';

// 1. Sign Up User (Sends the OTP email)
export async function signUpUser(email, password, firstName, lastName, inviteCode, portalCode) {
  return await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        first_name: firstName,
        last_name: lastName,
        referrer_code: inviteCode || null,
        portal_code: portalCode || null, //Sent to Postgres Trigger to assign to correct portal
      }
    }
  });
}

// 2. Verify OTP (Logs them in if correct)
export async function verifyEmailOtp(email, token) {
  return await supabase.auth.verifyOtp({
    email,
    token,
    type: 'signup'
  });
}

// 3. Log In User
export async function signInUser(email, password) {
  return await supabase.auth.signInWithPassword({
    email,
    password
  });
}

// 4. Create Member Profile (Called after successful OTP)
export async function createMemberProfile(userId, email) {
  return await supabase.from('members').insert([
    { id: userId, email: email }
  ]);
}


// 5. Get User promoter Status
export async function getUserStatus(userId) {
  const { data, error } = await supabase
    .from('members')
    .select('promoter, role')
    .eq('id', userId)
    .single();
    
  return { data, error };
}



