/**
 * Whether a session is older than the account's last password change.
 *
 * JWT issue times are whole seconds, so the change time is compared at the
 * same precision: a session signed in the same second as the change (the
 * person signing in with the new password) is kept.
 */
export function issuedBeforePasswordChange(
  issuedAtSeconds: number | null,
  passwordChangedAt: Date | null,
): boolean {
  if (!passwordChangedAt) return false;
  if (issuedAtSeconds === null) return true;
  return issuedAtSeconds < Math.floor(passwordChangedAt.getTime() / 1000);
}
