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

test('the selected row is filled from the theme’s own selection colours', () => {
  for (const [name, surfaces] of Object.entries(palette.themeSurfaces)) {
    const variant = palette.lightThemes.includes(name) ? 'light' : 'dark';
    const fill = palette.rowFillFor(name, variant);
    if (name === 'vesper') {
      // Neither of vesper's own fills stands off its panel; the fixed one stays.
      assert.equal(fill, palette.chrome.dark.active_row_bg);
      continue;
    }
    assert.ok([surfaces.selection, surfaces.activeRow].includes(fill), name);
    assert.ok(palette.contrast(fill, surfaces.panel) >= 1.2, `${name} fill does not read as selected`);
  }
  // A theme we have no surfaces for keeps the side's fixed fill.
  assert.equal(palette.rowFillFor('terminal', 'light'), palette.chrome.light.active_row_bg);
  assert.equal(palette.rowFillFor(null, 'dark'), palette.chrome.dark.active_row_bg);
});

test('idle titles stay readable on the selected row', () => {
  // solarized-light's text is 4.1:1 on its own bare panel, so any fill that
  // reads as selected costs it; these floors are what every built-in clears.
  for (const name of Object.keys(palette.themeSurfaces)) {
    const variant = palette.lightThemes.includes(name) ? 'light' : 'dark';
    const block = managed.sidebarBlock(variant, palette.inkForTheme(name, variant));
    const fill = palette.rowFillFor(name, variant);
    const idle = cellFor(block, '$title_idle').fg;
    const stale = cellFor(block, '$title_idle_stale').fg;
    assert.ok(contrast(idle, fill) >= 3, `${name} idle on ${fill}: ${contrast(idle, fill).toFixed(2)}:1`);
    assert.ok(contrast(stale, fill) >= 2.2, `${name} stale on ${fill}: ${contrast(stale, fill).toFixed(2)}:1`);
  }
});

test('the theme block writes the resolved theme’s fill', () => {
  // follow_appearance off is passed explicitly, so this does not depend on
  // the desktop of the machine running it.
  const block = (text) => managed.themeBlockFor(text, null);
  assert.match(block('[theme]\nname = "solarized-light"\n'), /active_row_bg = "#c9dcdf"/);
  assert.match(block('[theme]\nname = "tokyonight"\n'), /active_row_bg = "#2d3650"/);
  assert.match(block('[theme]\nname = "vesper"\n'), /active_row_bg = "#414868"/);
  // No [theme], auto_switch and terminal leave the fill to Herdr, as before.
  assert.equal(block('[ui]\n'), null);
  assert.equal(block('[theme]\nname = "nord"\nauto_switch = true\n'), null);
  assert.equal(block('[theme]\nname = "terminal"\n'), null);
});

test('each built-in gets the fill the rule picks from Herdr 0.9.0', () => {
  // Written out by hand from src/app/state.rs, independent of themeSurfaces,
  // so a transcription slip or a reversed choice shows up here.
  const expected = {
    catppuccin: '#313244',
    'catppuccin-latte': '#bdd0f5',
    'tokyo-night': '#2d3650',
    'tokyo-night-day': '#b6cae7',
    dracula: '#463f5d',
    nord: '#40505d',
    gruvbox: '#4b3f27',
    'gruvbox-light': '#ebdbb2',
    'one-dark': '#334659',
    'one-light': '#cddbf8',
    solarized: '#164b57',
    'solarized-light': '#c9dcdf',
    kanagawa: '#32384b',
    'kanagawa-lotus': '#d5cea3',
    'rose-pine': '#3b344b',
    'rose-pine-dawn': '#e3d9cf',
    vesper: '#414868',
  };
  for (const [name, fill] of Object.entries(expected)) {
    const variant = palette.lightThemes.includes(name) ? 'light' : 'dark';
    assert.equal(palette.rowFillFor(name, variant), fill, name);
  }
});

test('a fill set in the plugin’s [colors] still wins', () => {
  // The plugin config is read once at load, so each case runs in its own
  // process against a throwaway config directory.
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { execFileSync } = require('node:child_process');
  const root = path.resolve(__dirname, '../..');
  const fillFor = (colors) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-fill-'));
    try {
      fs.writeFileSync(path.join(dir, 'config.toml'), `follow_appearance = false\n${colors}`);
      const script = `process.stdout.write(String(require('./lib/managed-config').themeBlockFor('[theme]\\nname = "solarized-light"\\n', null)))`;
      const out = execFileSync(process.execPath, ['-e', script], {
        cwd: root,
        env: { ...process.env, HERDR_PLUGIN_CONFIG_DIR: dir },
        encoding: 'utf8',
      });
      return out.match(/active_row_bg = "(#\w+)"/)?.[1] ?? null;
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
  assert.equal(fillFor(''), '#c9dcdf');
  assert.equal(fillFor('[colors]\nactive_row_bg_light = "#ffcc00"\n'), '#ffcc00');
  // Empty means "no override at all": Herdr's own active_row_bg shows.
  assert.equal(fillFor('[colors]\nactive_row_bg_light = ""\n'), null);
});
