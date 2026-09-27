// Visual design values for the purple-aqua style direction (chosen 2026-09-24, replacing the earlier
// "milk tea" brown palette). Rules and rationale: docs/ui-style-guide.md. This file only holds values.
// Keep it free of imports: mobile/tests load it by reading the source and importing it as a
// data URL (mobile/ is not an ES-module package).

export const colors = {
  page: "#FFFFFF", // page and card background
  recess: "#D9FFF4", // sunken areas: pearl tray, unselected chips, avatars, secondary panels ("mint")
  text: "#321E48", // primary text, filled pearls, pickup-code panel ("deep purple")
  textSecondary: "#43637E", // secondary text ("slate"); only on page or recess
  accent: "#43637E", // solid fill of tappable things (text: onAccent) and 2px drawn outlines ("slate")
  accentInk: "#321E48", // links and the text of selected labels
  onAccent: "#FFFFFF", // text on an accent fill
  onDark: "#D9FFF4", // text on the panel filled with `text` (the pickup code)
  lineDecor: "#65DCD5", // decorative card outline on customer screens ("aqua"); carries no meaning
  lineRow: "#BFD0DB", // 1px divider between list rows; carries no meaning
  lineInput: "#728DA2" // outline of an unselected input (must reach 3:1 on `page`)
};

// Status pill colours. Meaning is never carried by colour alone: every tone also has a `mark`
// drawn inside the pill, and the pill always shows its label text.
export const tones = {
  info: { bg: "#65DCD5", fg: "#321E48", mark: "dots" }, // in progress / recruiting / ordered, not charged yet
  success: { bg: "#D2EFB8", fg: "#1F4A12", mark: "check" }, // done, locked, paid
  warning: { bg: "#FFEBB0", fg: "#6B4200", mark: "bang" }, // needs attention
  danger: { bg: "#FBD5DE", fg: "#9E1F3A", mark: "cross" }, // failed, rejected, overdue
  neutral: { bg: "#E4E8EE", fg: "#3F4855", mark: "dash" }, // finished, cancelled, not applicable
  estimate: { bg: "#E4D6F6", fg: "#4B2A7A", mark: "dots" } // a discount that can still change
};

// Dark theme (2026-09-25). Same keys and roles as `colors` / `tones` above, so a screen never has to know
// which theme is active: page is a near-black purple, text a light lavender, accent (buttons and drawn
// lines) flips to the aqua with dark text on it, and the pickup-code panel becomes a light panel with dark
// digits (`onDark` is the digit colour on the `text`-filled panel).
export const darkColors = {
  page: "#15101D",
  recess: "#1D3A3C",
  text: "#F1EAF7",
  textSecondary: "#A9BFCF",
  accent: "#65DCD5",
  accentInk: "#D9FFF4",
  onAccent: "#15101D",
  onDark: "#321E48",
  lineDecor: "#2A6A68",
  lineRow: "#2C3A45",
  lineInput: "#7893A8"
};

export const darkTones = {
  info: { bg: "#1F5A57", fg: "#D9FFF4", mark: "dots" },
  success: { bg: "#25421B", fg: "#D2EFB8", mark: "check" },
  warning: { bg: "#4D3B0C", fg: "#FFEBB0", mark: "bang" },
  danger: { bg: "#552030", fg: "#FBD5DE", mark: "cross" },
  neutral: { bg: "#2D323C", fg: "#E4E8EE", mark: "dash" },
  estimate: { bg: "#37275E", fg: "#E4D6F6", mark: "dots" }
};

// Shades the dark Google Maps style needs that are not UI colours (land, roads, water...). They live here so
// the whole dark palette is in one file; theme/mapStyles.js turns them into the style array.
export const darkMapColors = {
  land: "#1D1A26",
  labelText: darkColors.textSecondary,
  labelStroke: darkColors.page,
  boundary: "#3B3350",
  locality: darkColors.accentInk,
  park: "#17332F",
  parkText: "#6B9B96",
  road: "#2C2638",
  highway: "#3B3350",
  highwayText: "#D9D0E6",
  transit: "#2F2A3D",
  water: "#0F2A33",
  waterText: "#4E7A86"
};

export const radii = { xs: 8, sm: 14, md: 20, lg: 28, pill: 999 };

// Multiples of 4.
export const spacing = { s4: 4, s8: 8, s12: 12, s16: 16, s20: 20, s24: 24, s32: 32 };

export const sizes = {
  stroke: 2, // the only line thickness in the app (merchant list dividers are 1px)
  tap: 44, // minimum height of anything tappable
  buttonHeight: 52,
  buttonRadius: 26
};

// Set as `maxFontSizeMultiplier` on the pickup code, pearl numbers and pill labels so a large
// system font size cannot break their layout.
export const maxFontSizeMultiplier = 1.1;

// Chinese system fonts differ per device; only weights 400 and 700 are reliable steps.
export const typeScale = {
  pearlNumber: { fontSize: 32, lineHeight: 36, fontWeight: "700" },
  amount: { fontSize: 28, lineHeight: 32, fontWeight: "700" }, // order total, amount to pay
  pickupCode: { fontSize: 52, lineHeight: 60, fontWeight: "700" },
  screenTitle: { fontSize: 24, lineHeight: 32, fontWeight: "700" },
  sectionTitle: { fontSize: 17, lineHeight: 24, fontWeight: "700" },
  price: { fontSize: 18, lineHeight: 24, fontWeight: "700" },
  button: { fontSize: 16, lineHeight: 22, fontWeight: "700" },
  body: { fontSize: 15, lineHeight: 23, fontWeight: "400" },
  bodyDense: { fontSize: 14, lineHeight: 20, fontWeight: "400" }, // merchant screens
  label: { fontSize: 12, lineHeight: 16, fontWeight: "700" },
  caption: { fontSize: 12, lineHeight: 17, fontWeight: "400" }
};
