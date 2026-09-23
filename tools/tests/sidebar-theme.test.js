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

test('the sidebar is drawn for the theme config.toml selects', () => {
  // No [theme] at all is Herdr's default, catppuccin — a dark theme, so the
  // dark side of the palette, not the light one.
  assert.equal(managed.sidebarTheme('[ui]\n', null), 'catppuccin');
  assert.equal(managed.sidebarTheme('[theme]\nname = "gruvbox-light"\n', null), 'gruvbox-light');
  // auto_switch picks by asking the host terminal at attach; the file cannot say.
  assert.equal(managed.sidebarTheme('[theme]\nauto_switch = true\n', null), null);
  // With the desktop's appearance known, the name applyAppearance drives wins.
  assert.equal(managed.sidebarTheme('[theme]\nname = "nord"\nlight_name = "one-light"\n', 'light'), 'one-light');
  assert.equal(managed.sidebarTheme('[theme]\nname = "nord"\n', 'dark'), 'catppuccin');
});

test('a hand-set theme text colour wins over the built-in', () => {
  const text = '[theme]\nname = "nord"\n\n[theme.custom]\ntext = "#ffffff"\nsubtext0 = "#dddddd"\n';
  assert.deepEqual(managed.sidebarInk(text, 'dark', 'nord'), { text: '#ffffff', subtext0: '#dddddd' });
});
