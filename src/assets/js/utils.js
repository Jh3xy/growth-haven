
// Growth Haven reusuables functions and helpers

// CountDown Helpers

export function isValidEmail(val) {
  // Catches most typos without being overkill
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
}
 
export function isValidPhone(val) {
  // Strips formatting chars, checks for 7–15 digits (ITU-T E.164 range)
  return /^\d{7,15}$/.test(val.replace(/[\s\-().+]/g, ''));
}

export function formatDate(isoString) {
  return new Date(isoString).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric'
  });
}

export function getInitials(firstName, lastName) {
  return ((firstName?.[0] || '') + (lastName?.[0] || '')).toUpperCase() || '?';
}
