/**
 * The codes of the séances an account sees (bind `:me`): those it entered and did not remove, and those
 * made for one of its circles that it never entered, unless it removed them. A séance made for a circle
 * thus shows to all its people at once, with no code to type.
 */
export const VISIBLE_ROOMS = `
  SELECT r.code FROM rooms r
  LEFT JOIN participations mine ON mine.room_code = r.code AND mine.account_id = :me
  WHERE mine.hidden = 0
     OR (mine.account_id IS NULL
         AND r.circle_id IN (SELECT circle_id FROM circle_members WHERE account_id = :me)
         AND NOT EXISTS (SELECT 1 FROM room_dismissals d WHERE d.room_code = r.code AND d.account_id = :me))`;
