// "482917" -> "482 917" so the code reads in two easy groups. Anything that is not exactly six
// digits is shown unchanged rather than guessed at.
export function formatPickupCode(pickupCode) {
  const code = String(pickupCode ?? "");
  return /^\d{6}$/.test(code) ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}
