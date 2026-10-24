// SADEX Desktop — opens the live SADEX app in its own window.
// The app itself is loaded from Claude every time, so every update published
// to SADEX appears here automatically. Nothing needs reinstalling.
const { app, BrowserWindow, Menu, shell, dialog, session, nativeTheme, ipcMain } = require('electron');
const CHROME = require('./chrome');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

const SADEX_URL = 'https://claude.ai/artifact/DMze2Cz16YQRegMRCMWPBC';
const PARTITION = 'persist:sadex'; // keeps the Claude sign-in between launches

// Pages that stay inside the SADEX window; everything else opens in the normal browser.
const INSIDE = [/^https:\/\/([a-z0-9-]+\.)*claude\.ai\//i, /^https:\/\/([a-z0-9-]+\.)*claudeusercontent\.com\//i,
  /^https:\/\/([a-z0-9-]+\.)*anthropic\.com\//i, /^https:\/\/accounts\.google\.com\//i, /^https:\/\/appleid\.apple\.com\//i,
  /^about:blank/i, /^blob:/i, /^data:/i];
const inside = (url) => INSIDE.some((r) => r.test(url));

let win = null;
const stateFile = () => path.join(app.getPath('userData'), 'window.json');
function loadState() { try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch (e) { return { width: 1360, height: 860 }; } }
function saveState() { if (!win || win.isDestroyed()) return; try { const b = win.getNormalBounds(); fs.writeFileSync(stateFile(), JSON.stringify({ ...b, max: win.isMaximized() })); } catch (e) {} }

function createWindow() {
  const st = loadState();
  win = new BrowserWindow({
    x: st.x, y: st.y, width: st.width || 1360, height: st.height || 860, minWidth: 420, minHeight: 500,
    title: 'SADEX', icon: path.join(__dirname, 'build', 'icon.png'), backgroundColor: '#0a1730', show: false,
    titleBarStyle: 'hidden', titleBarOverlay: { color: '#0a1730', symbolColor: '#e6eefc', height: 30 },
    webPreferences: { partition: PARTITION, contextIsolation: true, sandbox: true, spellcheck: true, preload: path.join(__dirname, 'preload.js') }
  });
  if (st.max) win.maximize();
  win.once('ready-to-show', () => win.show());
  win.on('close', saveState);
  // Slim SADEX bar + full-window SADEX view, re-applied on every page load.
  const dress = () => { const wc = win.webContents; const u = wc.getURL();
    if (!/^https:\/\/([a-z0-9-]+\.)*claude\.ai\//i.test(u)) return;
    wc.insertCSS(CHROME.css).catch(() => {}); wc.executeJavaScript(CHROME.js).catch(() => {}); };
  win.webContents.on('did-finish-load', dress);
  win.webContents.on('did-navigate-in-page', dress);
  win.webContents.on('page-title-updated', (e) => { e.preventDefault(); win.setTitle('SADEX'); });

  // Links: Claude pages stay here, other websites open in the normal browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (inside(url)) { return { action: 'allow', overrideBrowserWindowOptions: { icon: path.join(__dirname, 'build', 'icon.png'), webPreferences: { partition: PARTITION, contextIsolation: true, sandbox: true } } }; }
    shell.openExternal(url); return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => { if (!inside(url)) { e.preventDefault(); shell.openExternal(url); } });

  // Friendly page if the internet is down.
  win.webContents.on('did-fail-load', (e, code, desc, url, isMain) => {
    if (!isMain || code === -3) return;
    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(
      '<body style="background:#0a1730;color:#e6eefc;font:15px system-ui;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center;max-width:420px">' +
      '<h2>SADEX can\'t reach Claude</h2><p>Check the internet connection, then press <b>Ctrl+R</b> or the button below.</p>' +
      '<button onclick="location.href=\'' + SADEX_URL + '\'" style="padding:10px 18px;border-radius:99px;border:0;background:#2db6fb;color:#06121f;font-weight:600;cursor:pointer">Try again</button></div></body>'));
  });

  win.loadURL(SADEX_URL);
}

function buildMenu() {
  const go = (url) => () => { if (win) win.loadURL(url); };
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'SADEX', submenu: [
      { label: 'Open SADEX', accelerator: 'CmdOrCtrl+H', click: go(SADEX_URL) },
      { type: 'separator' },
      { label: 'Reload (get the latest version)', accelerator: 'CmdOrCtrl+R', click: () => win && win.webContents.reload() },
      { label: 'Back', accelerator: 'Alt+Left', click: () => win && win.webContents.canGoBack() && win.webContents.goBack() },
      { type: 'separator' },
      { label: 'Sign out of Claude on this PC', click: async () => {
          const r = await dialog.showMessageBox(win, { type: 'question', buttons: ['Sign out', 'Cancel'], defaultId: 1, message: 'Sign out of Claude in SADEX Desktop?', detail: 'You will need to sign in to Claude again the next time.' });
          if (r.response === 0) { await session.fromPartition(PARTITION).clearStorageData(); win.loadURL(SADEX_URL); }
        } },
      { type: 'separator' },
      { role: 'quit', label: 'Exit' }
    ] },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [{ role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
    { label: 'Help', submenu: [
      { label: 'Check for updates', click: () => checkUpdates(true) },
      { label: 'About SADEX Desktop', click: () => dialog.showMessageBox(win, { type: 'info', title: 'SADEX', message: 'SADEX — Formulas. Standards. Control.', detail: 'Desktop version ' + app.getVersion() + '\nThe app content updates automatically from Claude every time it opens.' }) }
    ] }
  ]));
}

// Downloads (PDF, Word, backups): ask where to save.
function handleDownloads() {
  session.fromPartition(PARTITION).on('will-download', (e, item) => {
    item.setSaveDialogOptions({ title: 'Save file', defaultPath: path.join(app.getPath('downloads'), item.getFilename()) });
  });
}


// Self-update: new versions are built on GitHub and installed on the next restart.
let updateAsked = false, manualCheck = false;
function checkUpdates(manual) {
  if (!app.isPackaged) { if (manual) dialog.showMessageBox(win, { message: 'Updates work in the installed app only.' }); return; }
  if (manual) manualCheck = true;
  autoUpdater.checkForUpdates().then((r) => {
    if (manual && (!r || !r.updateInfo || r.updateInfo.version === app.getVersion())) { manualCheck = false; dialog.showMessageBox(win, { type: 'info', message: 'SADEX Desktop is up to date (version ' + app.getVersion() + ').', detail: 'The SADEX app inside the window always loads the newest version from Claude.' }); }
  }).catch((e) => { if (manual) { manualCheck = false; dialog.showMessageBox(win, { type: 'warning', message: 'Could not check for updates.', detail: String(e && e.message || e) + '\n\nCheck the internet connection, or download the newest installer from github.com/Ahmed-Saadeh/sadex-desktop/releases' }); } });
}
function setupUpdates() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-downloaded', async (info) => {
    if (win) { win.setProgressBar(-1); win.setTitle('SADEX'); }
    if (updateAsked) return; updateAsked = true;
    const r = await dialog.showMessageBox(win, { type: 'info', buttons: ['Restart now', 'Later'], defaultId: 0, cancelId: 1,
      message: 'A new version of SADEX Desktop (' + info.version + ') is ready.', detail: 'Restart now to update, or it will install the next time you close SADEX.' });
    if (r.response === 0) setImmediate(() => autoUpdater.quitAndInstall(false, true));
  });
  autoUpdater.on('update-available', (info) => {
    if (win) win.setTitle('SADEX — downloading update ' + info.version + '…');
    if (manualCheck) dialog.showMessageBox(win, { type: 'info', message: 'Version ' + info.version + ' found — downloading now.', detail: 'You can keep working. SADEX will ask to restart when it is ready.' });
    manualCheck = false;
  });
  autoUpdater.on('download-progress', (p) => { if (win) win.setProgressBar(Math.max(0, Math.min(1, (p.percent || 0) / 100))); });
  autoUpdater.on('error', (e) => { if (win) { win.setProgressBar(-1); win.setTitle('SADEX'); } if (manualCheck) { manualCheck = false; dialog.showMessageBox(win, { type: 'warning', message: 'The update could not be downloaded.', detail: String(e && e.message || e) }); } });
  checkUpdates(false);
  setInterval(() => checkUpdates(false), 6 * 60 * 60 * 1000);
}

// Save / print files sent by the SADEX page.
function openPreview(file, title) {
  const w = new BrowserWindow({ width: 1000, height: 900, title: 'Print preview — ' + title, icon: path.join(__dirname, 'build', 'icon.png'), autoHideMenuBar: true, webPreferences: { plugins: true, sandbox: true, contextIsolation: true } });
  w.webContents.on('page-title-updated', (e) => { e.preventDefault(); w.setTitle('Print preview — ' + title + '   (press Ctrl+P or the printer button to print)'); });
  w.loadURL(require('url').pathToFileURL(file).href);
}
ipcMain.handle('sadex-file', async (e, p) => {
  try {
    const name = String((p && p.name) || 'SADEX file').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180) || 'SADEX file';
    const buf = Buffer.from(new Uint8Array(p.data));
    if (p.kind === 'print') { const f = path.join(app.getPath('temp'), 'SADEX ' + Date.now() + ' ' + name); fs.writeFileSync(f, buf); openPreview(f, name.replace(/^Print - /, '').replace(/\.pdf$/i, '')); return true; }
    const r = await dialog.showSaveDialog(win, { title: 'Save file', defaultPath: path.join(app.getPath('downloads'), name) });
    if (r.canceled || !r.filePath) return true;
    fs.writeFileSync(r.filePath, buf);
    if (/\.pdf$/i.test(r.filePath)) { const q = await dialog.showMessageBox(win, { type: 'info', buttons: ['Open', 'Show in folder', 'Close'], defaultId: 0, message: 'Saved: ' + path.basename(r.filePath) }); if (q.response === 0) openPreview(r.filePath, path.basename(r.filePath)); else if (q.response === 1) shell.showItemInFolder(r.filePath); }
    else shell.showItemInFolder(r.filePath);
    return true;
  } catch (err) { dialog.showErrorBox('SADEX', 'Could not save the file: ' + (err && err.message)); return false; }
});
ipcMain.on('sadex-menu', (e, p) => { const m = Menu.getApplicationMenu(); if (!m || !win) return;
  Menu.buildFromTemplate(m.items.map((i) => ({ label: i.label, submenu: i.submenu }))).popup({ window: win, x: p && p.x || 0, y: p && p.y || 30 }); });

if (!app.requestSingleInstanceLock()) { app.quit(); }
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => { nativeTheme.themeSource = 'dark'; buildMenu(); handleDownloads(); createWindow(); setupUpdates(); });
  app.on('window-all-closed', () => app.quit());
}
