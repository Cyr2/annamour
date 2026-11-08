/**
 * One person can follow a séance on several devices of the same account (the TV and
 * a phone): each device stays a member, so the film waits for every one of them, but
 * the second shows « Darius (2) » so nobody thinks a stranger joined. Guests have no
 * account to tell them apart, so their prénom is shown as given.
 */
export function deviceNames(members: readonly { name: string; accountId?: string | undefined }[]): string[] {
  const seen = new Map<string, number>();
  return members.map(({ name, accountId }) => {
    if (accountId === undefined) return name;
    const count = (seen.get(accountId) ?? 0) + 1;
    seen.set(accountId, count);
    return count === 1 ? name : `${name} (${count})`;
  });
}
