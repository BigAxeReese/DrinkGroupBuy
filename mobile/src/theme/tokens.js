// Visual design values for the "milk tea" style direction (no blue anywhere in the app UI).
// Rules and rationale: docs/ui-style-guide.md. This file only holds values.
// Keep it free of imports: mobile/tests load it by reading the source and importing it as a
// data URL (mobile/ is not an ES-module package).

export const colors = {
  page: "#FFFFFF", // page and card background ("fresh milk white")
  recess: "#F3E4D2", // sunken areas: pearl tray, unselected chips, secondary panels ("milk tea")
  text: "#2A1B17", // primary text, filled pearls, pickup-code panel ("tapioca black")
  textSecondary: "#6F5A4E", // secondary text ("brown-sugar grey"); only on page or recess
  accent: "#8B5E3C", // solid fill of tappable things (text: onAccent) and 2px drawn outlines
  accentInk: "#6B4423", // links and the text of selected labels
  onAccent: "#FFFFFF", // text on an accent fill
  onDark: "#FFF8F2", // text on the panel filled with `text` (the pickup code)
  lineDecor: "#EADBCB", // decorative card outline on customer screens; carries no meaning
  lineRow: "#C9B39C", // 1px divider between merchant list rows; carries no meaning
  lineInput: "#A38670" // outline of an unselected input (must reach 3:1 on `page`)
};

// Status pill colours. Meaning is never carried by colour alone: every tone also has a `mark`
// drawn inside the pill, and the pill always shows its label text.
export const tones = {
  info: { bg: "#E8CDAE", fg: "#5A3818", mark: "dots" }, // in progress / recruiting / ordered, not charged yet
  success: { bg: "#E5F0D3", fg: "#2F5A14", mark: "check" }, // done, locked, paid
  warning: { bg: "#FBEBC8", fg: "#7A4A00", mark: "bang" }, // needs attention
  danger: { bg: "#FBE3E6", fg: "#9E1F3A", mark: "cross" }, // failed, rejected, overdue
  neutral: { bg: "#ECEAE8", fg: "#4F4A46", mark: "dash" }, // finished, cancelled, not applicable
  estimate: { bg: "#EFE8F7", fg: "#5B3D8C", mark: "dots" } // a discount that can still change
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
