'use strict';

// One source of truth for every colour this project puts on screen: the few
// Herdr chrome tokens we override, and the sidebar tokens we publish. Keeping
// them in one file is the point — a theme picked in Herdr and a sidebar
// coloured by hand drift apart, and the seam shows.
//
// Herdr has no theme-file format: a built-in is chosen by name, and
// `[theme.custom]` overrides tokens on top of it (`resolve_palette_for_theme_name`
// does `Palette::from_name(name).with_overrides(custom)`). Third-party themes
// use the same table — the marketplace's herdr-theme-picker writes it too.
//
// Which is exactly why this file overrides as LITTLE as possible. Copying a
// whole built-in palette in here would pin every colour: switching themes in
// Herdr's settings would change nothing, and `auto_switch` could no longer
// repaint for a light or dark host, because `[theme.custom]` is one static
// table applied to whichever theme is live. Override one token and the rest of
// the theme still works.

// The only chrome token we take over, and why:
//
// A built-in's `active_row_bg` is often a grey a shade off `panel_bg`, so the
// current Space and the focused Agent read as unselected (Tokyo Night Day's
// #d2d3da against its #e1e2e7 panel is the case that prompted this). These are
// that theme family's own selection blue, pushed to where it works as a row
// fill.
//
// Two variants because one value cannot serve both: a fill has to sit darker
// than a light panel and lighter than a dark one, and the row's text colour
// does not change with it. `bin/configure.js` picks the variant from the
// configured theme name and leaves the block out entirely under `auto_switch`,
// where neither value would be right half the time.
//
// These are now the fallback, not the default: a built-in gets its own
// selection colour (`rowFillFor` below), and only a theme whose own colours
// cannot show a selection, or a name we do not know, still takes these.
const chrome = {
  light: { active_row_bg: '#b9cdf2' },
  dark: { active_row_bg: '#414868' },
};

// Light built-ins, for that choice. Everything else in Herdr's THEME_NAMES is
// dark; `terminal` follows the host's own colours and counts as neither.
const lightThemes = [
  'catppuccin-latte',
  'tokyo-night-day',
  'gruvbox-light',
  'one-light',
  'solarized-light',
  'kanagawa-lotus',
  'rose-pine-dawn',
];

// Vendor colours, shown while an agent works. Shape already carries the state
// (§2.1), which frees colour to say whose agent it is. Sidebar token colours
// are static hex and cannot follow the theme (quirks §1), so every value here
// is chosen to read on both light and dark panels.
// Vendor hues — every one of them the vendor's own, checked against the mark
// the company publishes. Invented colours used to live here and no longer do:
// a brand that signs itself in black has no hue to carry, and painting one on
// says something about the row that is not true.
//
// A vendor absent from this table gets NO colour. The logo cell leaves its own
// `fg` unset, Herdr preserves the contextual default for any style field left
// out, and the mark inherits the row's ink — black on a light terminal, white
// on a dark one. That is the faithful reading of a monochrome brand, and the
// only treatment here that follows the theme, since these values are static
// hex and cannot (quirks §1).
//
// Two constraints shape the values:
//
//   - Both grounds at once. A hex that reads on white and dies on a dark panel
//     is half a colour. Everything here clears 3:1 against both, which is why
//     Cline (#323b43, near-black) and Kilo (#f8f676, pale yellow) are carried
//     at their own hue with a moved lightness rather than as published.
//   - Green and red stay out: they mean done and blocked, and a vendor wearing
//     either reads as a state.
//
// Gemini, Kimi and DeepSeek all sign in blue and land within 13° of one
// another. Nothing to be done about that without dropping a published hue —
// the glyphs separate those rows, and colour only groups them coarsely.
const brand = {
  claude: '#d97757', // Anthropic coral, as published
  gemini: '#4285f4', // the blue out of Google's four
  kimi: '#1783ff', // as published
  deepseek: '#4d6bfe', // as published
  qwen: '#615ced', // as published
  kiro: '#9046ff', // as published
  cline: '#586876', // #323b43 lightened: as published it dies on a dark panel
  kilo: '#9a9808', // #f8f676 darkened: as published it dies on a light one
  other: '#c78a1f', // a recognised harness with no hue of its own
};

// The vendors with a colour of their own, in table order. The Agents row
// colours a logo by rule and the Spaces row gives each of these a token, so
// both lists have to name the same vendors or a mark is coloured in one panel
// and grey in the other — which is how Antigravity and Kiro ended up branded
// beside their titles and anonymous in Spaces.
const brandVendors = Object.keys(brand).filter((vendor) => vendor !== 'other');

// The ink a hueless mark is drawn in: black on a light panel, white on a dark
// one, which is how a monochrome brand signs itself.
//
// This used to be done by leaving the cell's `fg` out and letting Herdr keep
// the contextual default. That reads well as a sentence and rendered as a
// muted grey — the sidebar's default ink is second-rank text, not the ink a
// logo wants, and it left the black-signing brands looking switched off beside
// the coloured ones. Naming the value is the only way to get the two ends of
// the scale, and the sidebar block is rebuilt per appearance anyway
// (`sidebarBlock(variant)`), so a static hex here still follows the desktop.
const inks = {
  light: '#16161c',
  dark: '#e9e9f0',
};

function inkFor(variant) {
  return inks[variant] ?? inks.light;
}

// State colours. Green and red are semantic and outrank branding: they exist
// to pull the eye. Idle recedes so a glance separates busy from parked.
const state = {
  done: '#4c9a5a',
  blocked: '#c04a4a',
  idle: '#6e738d',
  unknown: '#907aa9',
  none: '#9a9eb3', // a Space with no live agent: a dot, so names stay aligned
  subtle: '#7c7f93', // titles and other second-rank text
};

// The freshness scale, and colour is its entire signal — the three tiers draw
// the same mark (lib/logos.js).
//
// The middle tier is plain text on purpose. It was amber for a while, chosen
// to make the scale read as a cooling gradient (warm, cooling, cold), and the
// metaphor was fine but the arithmetic was not: most sessions are in the
// middle most of the time, so the amber was not a signal, it was the
// background — a high-attention colour applied to "nothing in particular",
// competing with the green it was supposed to defer to. A scale over a list
// only needs to mark the DEVIATIONS: worked in the last hours stands out,
// untouched since yesterday recedes, and everything between is what ordinary
// looks like.
//
// It flips with the panel, because receding means light-on-light but
// dark-on-dark — a single static hex cannot fade on both (quirks §1). The
// faded end must also actually fade: its first value was a light *blue*
// (#b3b6c4), which over a warm translucent panel read as tinted text, a
// highlight rather than an absence. Stale keeps almost no chroma.
//
// `idleNormal` is deliberately separate from `state.idle`: the Spaces list
// paints its own idle mark with the latter, and "this workspace has nothing
// running" is not a point on the freshness scale.
//
// An entry is one row now — `logo · title` — so these three ARE the entry's
// text colour, not a decoration beside it. That raises the bar: a tier has to
// stay readable as a whole sentence, not just legible as a mark.
const stateByVariant = {
  light: {
    idleFresh: '#416c4f',
    idleNormal: '#6b6259',
    idleStale: '#a4a5a9',
  },
  dark: {
    idleFresh: '#95bba2',
    idleNormal: '#a99e92',
    idleStale: '#585a64',
  },
};

// Each Herdr built-in's own `text` and `subtext0`, copied from Herdr 0.9.0
// (src/app/state.rs, `Palette::<name>()`).
//
// The middle and stale idle tiers used to be static greys picked to sit
// between "a light panel" and "a dark panel" — and a grey that is only
// moderately wrong on both is unreadable on some: #585a64, dimmed, came out at
// well under 2:1 on catppuccin. A sidebar cell cannot name a theme token
// (Herdr takes hex only there), and leaving `fg` out is worse, not better:
// Herdr's default for a plugin token is `overlay0` plus faint. So the plugin
// reads which theme is selected and writes that theme's own ink.
//
// `terminal` is missing on purpose: its text is the host terminal's own
// foreground, which has no hex to write.
const themeInks = {
  catppuccin: { text: '#cdd6f4', subtext0: '#a6adc8' },
  'catppuccin-latte': { text: '#4c4f69', subtext0: '#6c6f85' },
  'tokyo-night': { text: '#c0caf5', subtext0: '#a9b1d6' },
  'tokyo-night-day': { text: '#3760bf', subtext0: '#6172b0' },
  dracula: { text: '#f8f8f2', subtext0: '#d2d2dc' },
  nord: { text: '#eceff4', subtext0: '#d8dee9' },
  gruvbox: { text: '#ebdbb2', subtext0: '#d5c4a1' },
  'gruvbox-light': { text: '#3c3836', subtext0: '#504945' },
  'one-dark': { text: '#abb2bf', subtext0: '#969ca8' },
  'one-light': { text: '#383a42', subtext0: '#686b77' },
  solarized: { text: '#93a1a1', subtext0: '#839496' },
  'solarized-light': { text: '#657b83', subtext0: '#839496' },
  kanagawa: { text: '#dcd7ba', subtext0: '#c8c3aa' },
  'kanagawa-lotus': { text: '#545464', subtext0: '#43436c' },
  'rose-pine': { text: '#e0def4', subtext0: '#c8c5dc' },
  'rose-pine-dawn': { text: '#464261', subtext0: '#797593' },
  vesper: { text: '#ffffff', subtext0: '#a0a0a0' },
};

// Herdr's theme-name aliases (src/config/theme.rs `canonical_theme_name`), so
// `name = "tokyonight"` finds the same ink Herdr draws with.
const themeAliases = {
  'catppuccin-mocha': 'catppuccin',
  latte: 'catppuccin-latte',
  light: 'catppuccin-latte',
  tokyonight: 'tokyo-night',
  'tokyo-day': 'tokyo-night-day',
  'tokyonight-day': 'tokyo-night-day',
  'gruvbox-dark': 'gruvbox',
  onedark: 'one-dark',
  onelight: 'one-light',
  'solarized-dark': 'solarized',
  lotus: 'kanagawa-lotus',
  rosepine: 'rose-pine',
  'rosepine-dawn': 'rose-pine-dawn',
  dawn: 'rose-pine-dawn',
};

// Each built-in's panel and its two selection colours, from the same Herdr
// source as `themeInks`. The selected row is filled from these, not from one
// blue per side: that blue was chosen against Tokyo Night Day, and on a theme
// whose text is mid-toned (solarized-light's #657b83) it took the selected
// idle title below 3:1.
const themeSurfaces = {
  catppuccin: { panel: '#181825', activeRow: '#1e1e2e', selection: '#313244' },
  'catppuccin-latte': { panel: '#eff1f5', activeRow: '#e6e9ef', selection: '#bdd0f5' },
  'tokyo-night': { panel: '#1a1b26', activeRow: '#232636', selection: '#2d3650' },
  'tokyo-night-day': { panel: '#e1e2e7', activeRow: '#d2d3da', selection: '#b6cae7' },
  dracula: { panel: '#282a36', activeRow: '#373c52', selection: '#463f5d' },
  nord: { panel: '#2e3440', activeRow: '#434c5e', selection: '#40505d' },
  gruvbox: { panel: '#282828', activeRow: '#323130', selection: '#4b3f27' },
  'gruvbox-light': { panel: '#fbf1c7', activeRow: '#f2e5bc', selection: '#ebdbb2' },
  'one-dark': { panel: '#282c34', activeRow: '#313640', selection: '#334659' },
  'one-light': { panel: '#fafafa', activeRow: '#d8dbe2', selection: '#cddbf8' },
  solarized: { panel: '#002b36', activeRow: '#164b57', selection: '#083e55' },
  'solarized-light': { panel: '#fdf6e3', activeRow: '#eee8d5', selection: '#c9dcdf' },
  kanagawa: { panel: '#1f1f28', activeRow: '#363646', selection: '#32384b' },
  'kanagawa-lotus': { panel: '#f2ecbc', activeRow: '#d5cea3', selection: '#dcd5ac' },
  'rose-pine': { panel: '#191724', activeRow: '#26233a', selection: '#3b344b' },
  'rose-pine-dawn': { panel: '#faf4ed', activeRow: '#e3d9cf', selection: '#f2e9e1' },
  vesper: { panel: '#1a1a1a', activeRow: '#101010', selection: '#232323' },
};

// WCAG contrast between two `#rrggbb` colours.
function contrast(a, b) {
  const luminance = (hex) => {
    const [r, g, bl] = [1, 3, 5]
      .map((at) => parseInt(hex.slice(at, at + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

// How far a fill must stand off the panel to read as selected. Tokyo Night
// Day's own active row, the case that started the override, sits at 1.15.
const ROW_FILL_MIN = 1.2;

// The selected-row fill for one theme: whichever of its own two selection
// colours stands further off its panel, so the row reads as selected in the
// theme's own hue and its text keeps the contrast the theme designed for.
// Below ROW_FILL_MIN neither can show a selection (vesper), and the side's
// fixed fill above stays.
function rowFillFor(theme, variant) {
  const fallback = (chrome[variant] ?? chrome.light).active_row_bg;
  const surfaces = themeSurfaces[canonicalTheme(theme)];
  if (!surfaces) return fallback;
  const [best] = [surfaces.selection, surfaces.activeRow]
    .map((fill) => ({ fill, standoff: contrast(fill, surfaces.panel) }))
    .sort((a, b) => b.standoff - a.standoff);
  return best.standoff >= ROW_FILL_MIN ? best.fill : fallback;
}

// Herdr's `sibling_theme_names`: the light partner of each dark built-in, which
// its `auto_switch` falls back to when `dark_name` or `light_name` is unset.
const themeSiblings = [
  ['catppuccin', 'catppuccin-latte'],
  ['tokyo-night', 'tokyo-night-day'],
  ['gruvbox', 'gruvbox-light'],
  ['one-dark', 'one-light'],
  ['solarized', 'solarized-light'],
  ['kanagawa', 'kanagawa-lotus'],
  ['rose-pine', 'rose-pine-dawn'],
];

function canonicalTheme(name) {
  if (!name) return null;
  const key = name.toLowerCase().replace(/[ _]/g, '-');
  if (key === 'terminal' || themeInks[key]) return key;
  return themeAliases[key] ?? null;
}

// The ink for one theme, or — for `terminal`, an unknown name, or a theme the
// file cannot pin down — the ink of Herdr's own default for that side.
function inkForTheme(name, variant) {
  return themeInks[canonicalTheme(name)] ?? themeInks[variant === 'light' ? 'catppuccin-latte' : 'catppuccin'];
}

// The state colours for one appearance. Everything outside the freshness
// scale reads acceptably on either side and stays shared. With the theme's
// ink, the middle idle tier is the theme's plain text and the stale tier its
// second-rank text: still a step down, but a step the theme chose.
function stateFor(variant, ink = null) {
  const base = { ...state, ...(stateByVariant[variant] ?? stateByVariant.light) };
  return ink ? { ...base, idleNormal: ink.text, idleStale: ink.subtext0 } : base;
}

module.exports = {
  chrome,
  lightThemes,
  brand,
  brandVendors,
  inkFor,
  state,
  stateFor,
  themeInks,
  themeSiblings,
  themeSurfaces,
  canonicalTheme,
  inkForTheme,
  rowFillFor,
  contrast,
};
