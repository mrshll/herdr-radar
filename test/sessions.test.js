'use strict';

// One daemon per Herdr session, each with state of its own.
//
// A named session (`herdr --session <name>`) runs its own server on its own
// socket, but Herdr hands every session the same HERDR_PLUGIN_STATE_DIR. With
// the lock, control endpoint and caches all in that one directory, the second
// session's startup hook found the first session's daemon answering, started
// nothing, and its sidebar stayed bare. The session is read from the socket
// Herdr injects — the socket the daemon then talks to — and the default
// session keeps the paths it always had.
//
// Paths are fixed at require time, so each environment is resolved in a child
// process of its own.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-sessions-'));
const config = path.join(sandbox, 'config');
const state = path.join(sandbox, 'state');
process.env.HERDR_RADAR_STATE = state;
process.env.XDG_CONFIG_HOME = config;

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');

const paths = require('../lib/paths');
const managed = require('../lib/managed-config');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_SOCKET = path.join(config, 'herdr', 'herdr.sock');
const sessionSocket = (name) => path.join(config, 'herdr', 'sessions', name, 'herdr.sock');

test.after(() => fs.rmSync(sandbox, { recursive: true, force: true }));

function envFor(socket, extra = {}) {
  const env = { ...process.env, XDG_CONFIG_HOME: config, HERDR_RADAR_STATE: state, ...extra };
  delete env.HERDR_SESSION;
  if (socket === null) delete env.HERDR_SOCKET_PATH;
  else env.HERDR_SOCKET_PATH = socket;
  return env;
}

// Where every per-session and shared file lands for one environment.
const PROBE = `
const paths = require('./lib/paths');
const control = require('./lib/control');
const state = require('./lib/state');
const daemon = require('./lib/daemon');
const tabline = require('./lib/tabline');
const view = require('./lib/view');
const activity = require('./lib/activity');
view.setMode('recent');
activity.save(new Map([['w1:p1', 1]]));
process.stdout.write(JSON.stringify({
  session: paths.sessionName(),
  root: paths.stateRoot,
  sessionRoot: paths.sessionRoot,
  endpoint: control.endpoint(),
  lock: state.LOCK(),
  stop: state.STOP(),
  err: daemon.ERR_FILE(),
  tabbar: tabline.CACHE(),
  log: paths.logPath,
}));
`;

function probe(socket) {
  const run = spawnSync(process.execPath, ['-e', PROBE], { cwd: ROOT, env: envFor(socket), encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(run.stdout);
}

test('the session is named by the socket Herdr injects', () => {
  assert.equal(paths.sessionName({}), null, 'no socket is the default session');
  assert.equal(paths.sessionName({ HERDR_SOCKET_PATH: '/home/u/.config/herdr/herdr.sock' }), null);
  assert.equal(
    paths.sessionName({ HERDR_SOCKET_PATH: '/home/u/.config/herdr/sessions/dynamical/herdr.sock' }),
    'dynamical',
  );
  // HERDR_SESSION is not what the daemon talks to; the socket is.
  assert.equal(
    paths.sessionName({ HERDR_SESSION: 'dynamical', HERDR_SOCKET_PATH: '/home/u/.config/herdr/herdr.sock' }),
    null,
  );
});

test('the default session keeps the paths it always had', () => {
  for (const socket of [null, DEFAULT_SOCKET]) {
    const at = probe(socket);
    assert.equal(at.session, null);
    assert.equal(at.sessionRoot, state);
    if (process.platform !== 'win32') assert.equal(at.endpoint, path.join(state, 'control.sock'));
    assert.equal(at.lock, path.join(state, 'animator.pid'));
    assert.equal(at.stop, path.join(state, 'animator.stop'));
    assert.equal(at.err, path.join(state, 'animator.err'));
    assert.equal(at.tabbar, path.join(state, 'tabbar.txt'));
    assert.equal(at.log, path.join(state, 'tab-bar.log'));
  }
  assert.equal(fs.readFileSync(path.join(state, 'agent-view.on'), 'utf8'), 'recent');
  assert.ok(fs.existsSync(path.join(state, 'activity.json')));
});

test('a named session keeps its state under sessions/<name>', () => {
  const at = probe(sessionSocket('dynamical'));
  const own = path.join(state, 'sessions', 'dynamical');
  assert.equal(at.session, 'dynamical');
  assert.equal(at.root, state, 'the plugin root is shared');
  assert.equal(at.sessionRoot, own);
  if (process.platform !== 'win32') assert.equal(at.endpoint, path.join(own, 'control.sock'));
  else assert.match(at.endpoint, /\.dynamical\.ctl$/);
  for (const key of ['lock', 'stop', 'err', 'tabbar', 'log']) {
    assert.equal(path.dirname(at[key]), own, `${key} is outside the session's directory`);
  }
  assert.equal(fs.readFileSync(path.join(own, 'agent-view.on'), 'utf8'), 'recent');
  assert.ok(fs.existsSync(path.join(own, 'activity.json')));
});

// The bug itself: the second session found the first one's daemon on the
// shared endpoint and stood down.
const HOLD = `
const control = require('./lib/control');
control.serve({ ping: () => ({ ok: true, pid: process.pid }) }).then((server) => {
  process.stdout.write(server ? 'bound\\n' : 'taken\\n');
  if (!server) process.exit(0);
  process.stdin.on('end', () => process.exit(0));
  process.stdin.resume();
});
`;

function hold(t, socket) {
  const child = spawn(process.execPath, ['-e', HOLD], { cwd: ROOT, env: envFor(socket) });
  t.after(() => child.stdin.end());
  return new Promise((resolve, reject) => {
    child.stdout.once('data', (chunk) => resolve(String(chunk).trim()));
    child.once('error', reject);
  });
}

test('each session binds its own daemon endpoint', { skip: process.platform === 'win32' }, async (t) => {
  assert.equal(await hold(t, DEFAULT_SOCKET), 'bound');
  assert.equal(await hold(t, sessionSocket('dynamical')), 'bound', "the default session's daemon held the lock");
  assert.equal(await hold(t, sessionSocket('dynamical')), 'taken', 'one session ran two daemons');
});

// The tab-bar entry is one static line in Herdr's global config, run by
// `/bin/sh -lc` in every session with that session's HERDR_SOCKET_PATH. It has
// to find the same file the session's daemon writes.
test('the tab-bar command reads its own session’s line', { skip: process.platform === 'win32' }, () => {
  const line = managed.block().match(/command = '([^']*)'/);
  assert.ok(line, 'no command in the tab-bar block');
  for (const [socket, text] of [
    [DEFAULT_SOCKET, 'default line'],
    [sessionSocket('dynamical'), 'dynamical line'],
    [sessionSocket('upstream'), 'upstream line'],
  ]) {
    const file = probe(socket).tabbar;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${text}\n`);
  }
  for (const [socket, text] of [
    [DEFAULT_SOCKET, 'default line'],
    [null, 'default line'],
    [sessionSocket('dynamical'), 'dynamical line'],
    [sessionSocket('upstream'), 'upstream line'],
  ]) {
    const run = spawnSync('/bin/sh', ['-c', line[1]], { env: envFor(socket), encoding: 'utf8' });
    assert.equal(run.stdout.trim(), text, `socket ${socket}`);
  }
});
