export function deliveryBlock(input: {
  enabled: boolean; allowed: boolean; aiAllowed: boolean; linkedUser: boolean;
  role: string; sameOrganization: boolean; suppressed: boolean;
  occurredAt: Date; now: Date; live: boolean; token: boolean;
  recipient: string; testRecipient: string;
}) {
  if (!input.enabled || !input.allowed || !input.aiAllowed || !input.linkedUser) return "permission_revoked";
  // Cross-project replies are possible for a primary admin. Recheck that role at send time.
  if (input.role !== "super_admin") return "admin_test_only";
  if (input.suppressed) return "suppressed";
  const age = input.now.getTime() - input.occurredAt.getTime();
  if (!Number.isFinite(age) || age < -300000 || age >= 23 * 3600000) return "reply_window_expired";
  if (!input.testRecipient || input.recipient !== input.testRecipient) return "test_recipient_mismatch";
  if (!input.live || !input.token) return "configuration_required";
  return null;
}
