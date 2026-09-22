// How many of `count` pearls to fill for `filled` cups out of `band` cups. Rounds down, but never
// shows an empty row once someone has ordered and never a full row before the band is reached, so
// 99 / 100 cups does not look complete. The exact cup count is always written next to the pearls.
export function getFilledPearls(filled, band, count) {
  const cups = Number(filled);
  const target = Number(band);
  if (!Number.isFinite(cups) || !Number.isFinite(target)) return 0;
  if (!Number.isInteger(count) || count < 1) return 0;
  if (cups <= 0 || target <= 0) return 0;
  if (cups >= target) return count;
  // Multiply before dividing: (cups / target) * count can land just under a whole number
  // (29 / 100 * 100 = 28.999...), which would drop a pearl that should be filled.
  return Math.min(count - 1, Math.max(1, Math.floor((cups * count) / target)));
}

// The big pearl tray. One pearl is one cup while the band is small; a band larger than `maxCount`
// cups packs a whole number of cups into each pearl (so the picture never claims a fraction of a
// cup). Returns how many pearls to draw, how many cups each stands for and how many are filled,
// with the same "never empty once ordered, never full before the band is reached" rule as above.
export function getPearlTray(filled, band, maxCount = 10) {
  const target = Number(band);
  if (!Number.isFinite(target) || target <= 0) return { count: 0, cupsPerPearl: 1, filled: 0 };
  if (!Number.isInteger(maxCount) || maxCount < 1) return { count: 0, cupsPerPearl: 1, filled: 0 };

  const cupsPerPearl = Math.max(1, Math.ceil(target / maxCount));
  const count = Math.ceil(target / cupsPerPearl);
  const cups = Number(filled);
  if (!Number.isFinite(cups) || cups <= 0) return { count, cupsPerPearl, filled: 0 };
  if (cups >= target) return { count, cupsPerPearl, filled: count };
  return { count, cupsPerPearl, filled: Math.min(count - 1, Math.max(1, Math.floor(cups / cupsPerPearl))) };
}
