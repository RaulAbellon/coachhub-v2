export type TeamGender = "masculino" | "femenino" | undefined | null;

/**
 * Returns "jugador"/"jugadores" or "jugadora"/"jugadoras" depending on team gender.
 * Defaults to femenino when gender is missing (existing teams before this field existed).
 */
export function playerWord(gender: TeamGender, plural: boolean, capitalize = false): string {
  const isMale = gender === "masculino";
  let word: string;
  if (isMale) word = plural ? "jugadores" : "jugador";
  else word = plural ? "jugadoras" : "jugadora";
  return capitalize ? word.charAt(0).toUpperCase() + word.slice(1) : word;
}
