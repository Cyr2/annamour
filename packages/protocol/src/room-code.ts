/** Room codes: 4 letters, without look-alikes (no I, L, O). */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ";
export const ROOM_CODE_LENGTH = 4;

export function generateRoomCode(random: () => number = Math.random): string {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[Math.floor(random() * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

/** Uppercases and keeps only valid letters, so "ab cd" reads as "ABCD". */
export function normalizeRoomCode(input: string): string {
  return input
    .toUpperCase()
    .split("")
    .filter((c) => ROOM_CODE_ALPHABET.includes(c))
    .join("")
    .slice(0, ROOM_CODE_LENGTH);
}

export function isRoomCode(input: string): boolean {
  return input.length === ROOM_CODE_LENGTH && normalizeRoomCode(input) === input;
}
