/** `/?creer=1` opens home with the « Créer une séance » sheet up (e.g. from an empty « Mes séances »). */
const CREATE_PARAM = "creer";

export const CREATE_PATH = `/?${CREATE_PARAM}=1`;

/** Whether home was opened to create a séance straight away (`search` as in location.search). */
export function asksToCreate(search: string): boolean {
  return new URLSearchParams(search).get(CREATE_PARAM) === "1";
}
