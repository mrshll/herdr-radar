'use strict';

// The idle titles in the Agents list follow the Herdr theme that is selected:
// its own `text` for a parked session, its own `subtext0` for a stale one.
// Run with `npm test`.

const test = require('node:test');
const assert = require('node:assert/strict');

const palette = require('../../lib/palette');
const managed = require('../../lib/managed-config');

// The style a generated block gives one token, from the fallback row.
function cellFor(block, token) {
  const agents = block.slice(block.indexOf('rows = ['), block.indexOf('[ui.sidebar.agents.rows_by_agent]'));
  const match = agents.match(
    new RegExp(`\\{ token = "\\${token}", fg = "(#[0-9a-f]{6})", bold = (\\w+), dim = (\\w+)`),
  );
  assert.ok(match, `no ${token} cell`);
  return { fg: match[1], bold: match[2] === 'true', dim: match[3] === 'true' };
}

function luminance(hex) {
  const [r, g, b] = [1, 3, 5]
    .map((at) => parseInt(hex.slice(at, at + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

test('idle titles wear the selected theme’s own text colours', () => {
  for (const [name, ink] of Object.entries(palette.themeInks)) {
    const variant = palette.lightThemes.includes(name) ? 'light' : 'dark';
    const block = managed.sidebarBlock(variant, palette.inkForTheme(name, variant));
    assert.equal(cellFor(block, '$title_idle').fg, ink.text, name);
    assert.equal(cellFor(block, '$title_idle_stale').fg, ink.subtext0, name);
  }
});

test('a stale title is not dimmed on top of receding', () => {
  // Herdr maps `dim` straight to the terminal's faint attribute, which on most
  // terminals halves an already-muted grey into the background.
  const block = managed.sidebarBlock('dark', palette.inkForTheme('catppuccin', 'dark'));
  assert.equal(cellFor(block, '$title_idle_stale').dim, false);
});

test('the stale tier reads at least 2.5:1 on every built-in panel', () => {
  // `subtext0` is the theme's own second-rank text. The static grey it
  // replaces sat at 1.8–2.6:1 on the same panels.
  const panels = {
    catppuccin: '#181825',
    'catppuccin-latte': '#eff1f5',
    'tokyo-night': '#1a1b26',
    'tokyo-night-day': '#e1e2e7',
    dracula: '#282a36',
    nord: '#2e3440',
    gruvbox: '#282828',
    'gruvbox-light': '#fbf1c7',
    'one-dark': '#282c34',
    'one-light': '#fafafa',
    solarized: '#002b36',
    'solarized-light': '#fdf6e3',
    kanagawa: '#1f1f28',
    'kanagawa-lotus': '#f2ecbc',
    'rose-pine': '#191724',
    'rose-pine-dawn': '#faf4ed',
    vesper: '#1a1a1a',
  };
  assert.deepEqual(Object.keys(panels).sort(), Object.keys(palette.themeInks).sort());
  for (const [name, panel] of Object.entries(panels)) {
    const ink = palette.themeInks[name];
    assert.ok(contrast(ink.subtext0, panel) >= 2.5, `${name} subtext0 ${contrast(ink.subtext0, panel).toFixed(2)}:1`);
    assert.ok(contrast(ink.text, panel) >= 4, `${name} text ${contrast(ink.text, panel).toFixed(2)}:1`);
  }
});

test('theme names resolve the way Herdr resolves them', () => {
  assert.equal(palette.canonicalTheme('Tokyo Night'), 'tokyo-night');
  assert.equal(palette.canonicalTheme('catppuccin-mocha'), 'catppuccin');
  assert.equal(palette.canonicalTheme('dawn'), 'rose-pine-dawn');
  assert.equal(palette.canonicalTheme('no-such-theme'), null);
});

test('a theme with no hex of its own falls back to its side’s default', () => {
  assert.deepEqual(palette.inkForTheme('terminal', 'dark'), palette.themeInks.catppuccin);
  assert.deepEqual(palette.inkForTheme(null, 'light'), palette.themeInks['catppuccin-latte']);
});

test('the sidebar is drawn for the theme Herdr resolves', () => {
  const resolve = (text, detected = null, host = null) => managed.effectiveTheme(text, detected, () => host);
  // No [theme] at all is Herdr's default, catppuccin — dark, not the light side.
  assert.deepEqual(resolve('[ui]\n'), { theme: 'catppuccin', variant: 'dark', mode: null });
  assert.deepEqual(resolve('[theme]\nname = "gruvbox-light"\n'), {
    theme: 'gruvbox-light',
    variant: 'light',
    mode: null,
  });
  // An alias is the theme it names, on that theme's side.
  assert.deepEqual(resolve('[theme]\nname = "latte"\n'), { theme: 'catppuccin-latte', variant: 'light', mode: null });
  // An unknown name is Herdr's fallback, catppuccin.
  assert.equal(resolve('[theme]\nname = "no-such-theme"\n').theme, 'catppuccin');
  // Herdr's own auto_switch ignores `name` and picks a side from the host; the
  // desktop stands in for that, and with no answer it is dark, as in Herdr.
  // An unset side is `name`'s sibling; an unpaired theme is its own.
  const auto = '[theme]\nname = "nord"\nauto_switch = true\nlight_name = "one-light"\n';
  assert.deepEqual(resolve(auto, null, 'light'), { theme: 'one-light', variant: 'light', mode: 'light' });
  assert.deepEqual(resolve(auto, null, null), { theme: 'nord', variant: 'dark', mode: 'dark' });
  const paired = '[theme]\nname = "tokyo-night"\nauto_switch = true\n';
  assert.deepEqual(resolve(paired, null, 'light'), { theme: 'tokyo-night-day', variant: 'light', mode: 'light' });
  assert.equal(resolve('[theme]\nauto_switch = true\ndark_name = "nope"\n', null, 'dark').theme, 'catppuccin');
  // An unpaired dark theme stays dark on a light host, so its rows do too.
  assert.equal(resolve('[theme]\nname = "vesper"\nauto_switch = true\n', null, 'light').variant, 'dark');
  // `terminal` is the host's own colours: the side is the same guess.
  assert.deepEqual(resolve('[theme]\nname = "terminal"\n', null, 'light'), {
    theme: 'terminal',
    variant: 'light',
    mode: null,
  });
  assert.equal(resolve('[theme]\nname = "terminal"\n').variant, 'dark');
  // With the desktop's appearance followed, the name applyAppearance writes
  // wins: the side's name, else catppuccin for that side, and an unknown side
  // name is drawn as Herdr's manual fallback, catppuccin.
  assert.equal(resolve('[theme]\nname = "nord"\nlight_name = "one-light"\n', 'light').theme, 'one-light');
  assert.equal(resolve('[theme]\nname = "nord"\n', 'dark').theme, 'catppuccin');
  assert.deepEqual(resolve('[theme]\nlight_name = "nope"\n', 'light'), {
    theme: 'catppuccin',
    variant: 'dark',
    mode: null,
  });
  // …but only when there is a `[theme]` for it to write. Without one,
  // applyAppearance refuses and Herdr keeps drawing catppuccin, dark.
  assert.deepEqual(resolve('[ui]\n', 'light'), { theme: 'catppuccin', variant: 'dark', mode: null });
});

// chromeVariant reads the installed plugin's follow_appearance; with it on,
// the desktop answers and the name is not consulted.
const followed = require('../../lib/config').followAppearance && 'follow_appearance is on here';

test('the chrome side agrees with the sidebar side', { skip: followed }, () => {
  // `latte` used to read as dark here, pairing Latte's dark text with the dark
  // row fill; under auto_switch no fill is right half the time.
  assert.equal(managed.chromeVariant('[theme]\nname = "latte"\n'), 'light');
  assert.equal(managed.chromeVariant('[theme]\nname = "nord"\nauto_switch = true\n'), null);
});

test('a hand-set theme text colour wins over the built-in', () => {
  const nord = { theme: 'nord', variant: 'dark', mode: null };
  const text = '[theme]\nname = "nord"\n\n[theme.custom]\ntext = "#FFFFFF"\nsubtext0 = "#ddd"\n';
  assert.deepEqual(managed.sidebarInk(text, nord), { text: '#ffffff', subtext0: '#dddddd' });
  const rgb = '[theme.custom]\ntext = "rgb(1, 2, 255)"\nsubtext0 = "grey"\n';
  assert.deepEqual(managed.sidebarInk(rgb, nord), { text: '#0102ff', subtext0: palette.themeInks.nord.subtext0 });
  // Under Herdr's auto_switch the active side's table layers last.
  const moded = '[theme.custom]\ntext = "#111111"\n\n[theme.custom.dark]\ntext = "#222222"\n';
  assert.equal(managed.sidebarInk(moded, { ...nord, mode: 'dark' }).text, '#222222');
  assert.equal(managed.sidebarInk(moded, nord).text, '#111111');
});

test('idle titles stay readable on a selected row', () => {
  // A selected row is filled with the theme's own active_row_bg, or with the
  // plugin's override when it writes one. Neither fill may swallow the text,
  // and the stale tier must beat the fixed grey it replaced on both.
  const ownRows = {
    catppuccin: '#1e1e2e',
    'catppuccin-latte': '#e6e9ef',
    'tokyo-night': '#232636',
    'tokyo-night-day': '#d2d3da',
    dracula: '#373c52',
    nord: '#434c5e',
    gruvbox: '#323130',
    'gruvbox-light': '#f2e5bc',
    'one-dark': '#313640',
    'one-light': '#d8dbe2',
    solarized: '#164b57',
    'solarized-light': '#eee8d5',
    kanagawa: '#363646',
    'kanagawa-lotus': '#d5cea3',
    'rose-pine': '#26233a',
    'rose-pine-dawn': '#e3d9cf',
    vesper: '#101010',
  };
  for (const [name, ownRow] of Object.entries(ownRows)) {
    const variant = palette.lightThemes.includes(name) ? 'light' : 'dark';
    const block = managed.sidebarBlock(variant, palette.inkForTheme(name, variant));
    const before = palette.stateFor(variant);
    for (const row of [ownRow, palette.chrome[variant].active_row_bg]) {
      const idle = cellFor(block, '$title_idle').fg;
      const stale = cellFor(block, '$title_idle_stale').fg;
      assert.ok(contrast(idle, row) >= 2.5, `${name} idle on ${row}: ${contrast(idle, row).toFixed(2)}:1`);
      assert.ok(contrast(stale, row) > contrast(before.idleStale, row), `${name} stale on ${row}`);
    }
  }
});
