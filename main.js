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

// Crash log: anything that goes wrong is written to SADEX's log file instead of stopping the app.
const logFile = () => path.join(app.getPath('userData'), 'logs', 'sadex.log');
function log(...a) {
  try {
    const f = logFile(); fs.mkdirSync(path.dirname(f), { recursive: true });
    try { if (fs.statSync(f).size > 2 * 1024 * 1024) fs.renameSync(f, f + '.old'); } catch (e) {}
    fs.appendFileSync(f, new Date().toISOString() + ' ' + a.map((x) => (x && x.stack) || (typeof x === 'string' ? x : JSON.stringify(x))).join(' ') + '\n');
  } catch (e) {}
}
process.on('uncaughtException', (e) => log('main error:', e));
process.on('unhandledRejection', (e) => log('main promise error:', e));

// Settings kept between launches (safe graphics mode).
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
function loadSettings() { try { return JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) || {}; } catch (e) { return {}; } }
function saveSettings(p) { try { fs.writeFileSync(settingsFile(), JSON.stringify({ ...loadSettings(), ...p })); } catch (e) { log('settings:', e); } }
// Some PC graphics drivers crash Chromium's GPU process (white or black window). Safe graphics mode turns the GPU off.
if (loadSettings().safeGraphics) app.disableHardwareAcceleration();

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
  // The CSS is inserted once per page (Claude changes pages without reloading, which used to stack copies of it).
  const dress = async () => { if (!win || win.isDestroyed()) return; const wc = win.webContents; const u = wc.getURL();
    if (!/^https:\/\/([a-z0-9-]+\.)*claude\.ai\//i.test(u)) return;
    try { if (!(await wc.executeJavaScript('!!window.__sxCss'))) { await wc.insertCSS(CHROME.css); await wc.executeJavaScript('window.__sxCss=1'); } } catch (e) {}
    wc.executeJavaScript(CHROME.js).catch(() => {}); };
  // Claude shows the artifact inside a wrapper frame that has its own toolbar strip. Make the SADEX frame fill that wrapper
  // too (only while SADEX is in full-window mode), so nothing of Claude's page shows between the title bar and SADEX.
  const INNER = (on) => `(function(on){var R=document.documentElement;if(document.getElementById('app-data'))return 'sadex';
    if(!document.getElementById('sx-in-css')){var s=document.createElement('style');s.id='sx-in-css';s.textContent='html.sx-in,html.sx-in body{background:#0a1730!important;overflow:hidden!important}html.sx-in body *{visibility:hidden!important}html.sx-in .sx-anc,html.sx-in iframe.sx-art2{visibility:visible!important}html.sx-in .sx-anc{transform:none!important;filter:none!important;contain:none!important;will-change:auto!important;perspective:none!important;backdrop-filter:none!important;clip-path:none!important}html.sx-in iframe.sx-art2{position:fixed!important;top:0!important;left:0!important;width:100vw!important;height:100vh!important;max-width:none!important;max-height:none!important;margin:0!important;border:0!important;border-radius:0!important;transform:none!important;z-index:2147483647!important}';(document.head||R).appendChild(s)}
    var best=null,ba=0;document.querySelectorAll('iframe').forEach(function(f){var r=f.getBoundingClientRect(),a=r.width*r.height;if(f.classList.contains('sx-art2'))a=Math.max(a,innerWidth*innerHeight);if(a>ba){ba=a;best=f}});
    document.querySelectorAll('iframe.sx-art2').forEach(function(f){if(f!==best)f.classList.remove('sx-art2')});
    var ok=on&&best&&ba>innerWidth*innerHeight*0.3,anc=[];if(ok){best.classList.add('sx-art2');for(var p=best.parentElement;p&&p!==R;p=p.parentElement)anc.push(p)}
    document.querySelectorAll('.sx-anc').forEach(function(x){if(anc.indexOf(x)<0)x.classList.remove('sx-anc')});anc.forEach(function(x){x.classList.add('sx-anc')});
    R.classList.toggle('sx-in',!!ok);return ok?'on':'off'})(${on?'true':'false'})`;
  // Skipped while SADEX is minimised or hidden, so it costs nothing in the background.
  // Frames can disappear at any moment while Claude loads, so each one is guarded on its own.
  const fitInner = async () => {
    if (!win || win.isDestroyed() || win.isMinimized() || !win.isVisible()) return; const wc = win.webContents;
    if (wc.isLoading() || wc.isCrashed()) return;
    try {
      const on = await wc.mainFrame.executeJavaScript("document.documentElement.classList.contains('sx-full')");
      if (win.isDestroyed()) return;
      for (const f of wc.mainFrame.frames) {
        try { if (f.isDestroyed() || !/^https:\/\//i.test(f.url || '')) continue; f.executeJavaScript(INNER(on)).catch(() => {}); } catch (e) {}
      }
    } catch (e) {}
  };
  const fitTimer = setInterval(fitInner, 1000);
  win.on('closed', () => { clearInterval(fitTimer); win = null; });
  win.webContents.on('did-frame-finish-load', () => setTimeout(fitInner, 200));
  win.webContents.on('did-finish-load', dress);
  win.webContents.on('did-navigate-in-page', dress);
  win.webContents.on('page-title-updated', (e) => { e.preventDefault(); win.setTitle('SADEX'); });

  // If the page crashes or runs out of memory, reload SADEX instead of leaving a blank window.
  let crashes = [];
  win.webContents.on('render-process-gone', (e, d) => {
    log('page stopped:', d.reason, 'exit code', d.exitCode);
    if (d.reason === 'clean-exit' || !win || win.isDestroyed()) return;
    const now = Date.now(); crashes = crashes.filter((t) => now - t < 2 * 60 * 1000); crashes.push(now);
    if (crashes.length <= 3) { setTimeout(() => { if (win && !win.isDestroyed()) win.loadURL(SADEX_URL); }, 500); return; }
    showProblem('SADEX stopped several times', 'The page crashed ' + crashes.length + ' times in two minutes (' + d.reason + '). If this keeps happening, turn on <b>View \u2192 Safe graphics mode</b> and restart SADEX.');
  });
  let hang = null;
  win.webContents.on('unresponsive', () => {
    log('page not responding');
    if (hang) return;
    hang = setTimeout(async () => {
      if (!win || win.isDestroyed()) return;
      const r = await dialog.showMessageBox(win, { type: 'warning', buttons: ['Wait', 'Reload SADEX'], defaultId: 0, cancelId: 0, message: 'SADEX is not responding.', detail: 'It may be busy with a large file. Wait a little, or reload it.' });
      hang = null; if (r.response === 1 && win && !win.isDestroyed()) win.webContents.forcefullyCrashRenderer(); // the crash handler reloads it
    }, 8000);
  });
  win.webContents.on('responsive', () => { if (hang) { clearTimeout(hang); hang = null; } });

  // Links: Claude pages stay here, other websites open in the normal browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (inside(url)) { return { action: 'allow', overrideBrowserWindowOptions: { icon: path.join(__dirname, 'build', 'icon.png'), webPreferences: { partition: PARTITION, contextIsolation: true, sandbox: true } } }; }
    shell.openExternal(url); return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => { if (!inside(url)) { e.preventDefault(); shell.openExternal(url); } });

  // Friendly page if the internet is down.
  win.webContents.on('did-fail-load', (e, code, desc, url, isMain) => {
    if (!isMain || code === -3) return;
    log('load failed:', code, desc);
    showProblem('SADEX can\'t reach Claude', 'Check the internet connection, then press <b>Ctrl+R</b> or the button below.');
  });

  win.loadURL(SADEX_URL);
}

function showProblem(title, text) {
  if (!win || win.isDestroyed()) return;
  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(
    '<body style="background:#0a1730;color:#e6eefc;font:15px system-ui;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center;max-width:460px">' +
    '<h2>' + title + '</h2><p>' + text + '</p>' +
    '<button onclick="location.href=\'' + SADEX_URL + '\'" style="padding:10px 18px;border-radius:99px;border:0;background:#2db6fb;color:#06121f;font-weight:600;cursor:pointer">Try again</button></div></body>'));
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
    { label: 'View', submenu: [{ role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' }, { type: 'separator' }, { role: 'togglefullscreen' }, { type: 'separator' },
      { label: 'Safe graphics mode (if the window goes white or crashes)', type: 'checkbox', checked: !!loadSettings().safeGraphics, click: async (item) => {
          saveSettings({ safeGraphics: item.checked });
          const r = await dialog.showMessageBox(win, { type: 'info', buttons: ['Restart now', 'Later'], defaultId: 0, cancelId: 1, message: 'Safe graphics mode is ' + (item.checked ? 'on' : 'off') + '.', detail: 'It takes effect after SADEX restarts.' });
          if (r.response === 0) { app.relaunch(); app.quit(); }
        } }] },
    { label: 'Help', submenu: [
      { label: 'Check for updates', click: () => checkUpdates(true) },
      { label: 'Open the problem log', click: () => { log('log opened, version', app.getVersion()); shell.showItemInFolder(logFile()); } },
      { label: 'About SADEX Desktop', click: () => dialog.showMessageBox(win, { type: 'info', title: 'SADEX', message: 'SADEX — Formulas. Standards. Control.', detail: 'Desktop version ' + app.getVersion() + '\nThe app content updates automatically from Claude every time it opens.' }) }
    ] }
  ]));
}

// Downloads (PDF, Word, backups): ask where to save.
function handleDownloads() {
  session.fromPartition(PARTITION).on('will-download', (e, item) => {
    item.setSaveDialogOptions({ title: 'Save file', defaultPath: path.join(app.getPath('downloads'), item.getFilename()) });
    item.once('done', (ev, state) => { if (state === 'interrupted') { log('download failed:', item.getFilename()); dialog.showErrorBox('SADEX', 'Could not save ' + item.getFilename() + '. Check that the folder exists and the file is not open in another program, then try again.'); } });
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
// The preview has its own menu: Print, Open in the PC's PDF program (the fallback if printing here fails), Save a copy.
function openPreview(file, title) {
  const w = new BrowserWindow({ width: 1000, height: 900, title: 'Print preview — ' + title, icon: path.join(__dirname, 'build', 'icon.png'), webPreferences: { plugins: true, sandbox: true, contextIsolation: true } });
  const inPdfApp = async () => { const err = await shell.openPath(file); if (err) dialog.showErrorBox('SADEX', 'This PC has no program for PDF files: ' + err); };
  const print = () => {
    if (w.isDestroyed()) return;
    try {
      w.webContents.print({ printBackground: true }, (ok, why) => {
        if (ok || why === 'Print job canceled' || why === 'cancelled') return;
        log('print failed:', why);
        if (w.isDestroyed()) return;
        dialog.showMessageBox(w, { type: 'warning', buttons: ['Open in PDF program', 'Close'], defaultId: 0, cancelId: 1, message: 'Printing did not work here (' + (why || 'unknown reason') + ').', detail: 'Open the file in the PC\'s PDF program and print from there.' })
          .then((r) => { if (r.response === 0) inPdfApp(); });
      });
    } catch (e) { log('print error:', e); inPdfApp(); }
  };
  w.setMenu(Menu.buildFromTemplate([
    { label: 'Print…', accelerator: 'CmdOrCtrl+P', click: print },
    { label: 'Open in PDF program', click: inPdfApp },
    { label: 'Save a copy…', accelerator: 'CmdOrCtrl+S', click: async () => {
        const r = await dialog.showSaveDialog(w, { title: 'Save PDF', defaultPath: path.join(app.getPath('downloads'), title.replace(/\.pdf$/i, '') + '.pdf'), filters: [{ name: 'PDF', extensions: ['pdf'] }] });
        if (!r.canceled && r.filePath) { try { fs.copyFileSync(file, r.filePath); } catch (e) { dialog.showErrorBox('SADEX', 'Could not save the file: ' + e.message); } }
      } },
    { label: 'Close', accelerator: 'Esc', click: () => w.close() }
  ]));
  w.webContents.on('page-title-updated', (e) => { e.preventDefault(); w.setTitle('Print preview — ' + title); });
  let reloaded = false; // one retry only, so a file that always crashes the viewer can't loop
  w.webContents.on('render-process-gone', (e, d) => { log('preview stopped:', d.reason); if (!reloaded && !w.isDestroyed() && d.reason !== 'clean-exit') { reloaded = true; w.loadURL(require('url').pathToFileURL(file).href); } });
  w.loadURL(require('url').pathToFileURL(file).href);
  return w;
}
// Print and preview files go to the temp folder; ones older than a day are removed at start-up.
function cleanTemp() {
  try {
    const t = app.getPath('temp'), old = Date.now() - 24 * 60 * 60 * 1000;
    for (const n of fs.readdirSync(t)) {
      if (!/^SADEX \d+ |^sadex-pdf-\d+$/.test(n)) continue;
      const f = path.join(t, n); try { if (fs.statSync(f).mtimeMs < old) fs.rmSync(f, { recursive: true, force: true }); } catch (e) {}
    }
  } catch (e) {}
}
// Word → PDF with Microsoft Word on this PC (exact Word layout and fonts), then join into one PDF.
const PS_CONVERT = `param([string]$list)
$ErrorActionPreference = 'Stop'
$files = Get-Content -LiteralPath $list -Encoding UTF8 | Where-Object { $_ }
$w = New-Object -ComObject Word.Application
$w.Visible = $false; $w.DisplayAlerts = 0
try { foreach ($f in $files) { $d = $w.Documents.Open($f, $false, $true, $false); try { $d.ExportAsFixedFormat(($f -replace '\.docx$', '.pdf'), 17) } finally { $d.Close(0) } } }
finally { $w.Quit(); [System.Runtime.InteropServices.Marshal]::ReleaseComObject($w) | Out-Null }`;
function wordToPdf(files) {
  return new Promise((ok, no) => {
    if (process.platform !== 'win32') return no(new Error('Word conversion needs Windows'));
    const dir = path.dirname(files[0]), ps = path.join(dir, 'convert.ps1'), list = path.join(dir, 'files.txt');
    fs.writeFileSync(ps, '\ufeff' + PS_CONVERT, 'utf8'); fs.writeFileSync(list, files.join('\r\n'), 'utf8');
    require('child_process').execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ps, '-list', list], { windowsHide: true, timeout: 10 * 60 * 1000 }, (err, so, se) => {
      const missing = files.filter((f) => !fs.existsSync(f.replace(/\.docx$/i, '.pdf')));
      if (missing.length) return no(new Error(/Word\.Application|80040154|class not registered/i.test(String(se) + String(err)) ? 'Microsoft Word is not installed on this PC' : 'Word could not convert ' + missing.length + ' file(s)'));
      ok(files.map((f) => f.replace(/\.docx$/i, '.pdf')));
    });
  });
}
// Weather for the clock (Open-Meteo, no key).
ipcMain.handle('sadex-weather', async (e, city) => {
  try {
    const { net } = require('electron');
    const g = await (await net.fetch('https://geocoding-api.open-meteo.com/v1/search?count=1&name=' + encodeURIComponent(String(city || 'Amman').slice(0, 80)))).json();
    const p = g && g.results && g.results[0]; if (!p) return null;
    return await (await net.fetch('https://api.open-meteo.com/v1/forecast?latitude=' + p.latitude + '&longitude=' + p.longitude + '&current=temperature_2m,weather_code,relative_humidity_2m,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&forecast_days=1&timezone=auto')).json();
  } catch (err) { return null; }
});
ipcMain.handle('sadex-pdfjob', async (e, job) => {
  const dir = path.join(app.getPath('temp'), 'sadex-pdf-' + Date.now());
  try {
    fs.mkdirSync(dir, { recursive: true });
    const parts = (job && job.parts) || []; if (!parts.length) return { ok: false, err: 'Nothing to convert' };
    const docx = [], order = [];
    parts.forEach((p, i) => { const f = path.join(dir, ('000' + i).slice(-4) + (p.type === 'docx' ? '.docx' : '.pdf')); fs.writeFileSync(f, Buffer.from(new Uint8Array(p.data))); if (p.type === 'docx') docx.push(f); order.push(f.replace(/\.docx$/i, '.pdf')); });
    if (docx.length) { if (win) win.setProgressBar(2); try { await wordToPdf(docx); } finally { if (win) win.setProgressBar(-1); } }
    const { PDFDocument } = require('pdf-lib'); const out = await PDFDocument.create();
    for (const f of order) { const src = await PDFDocument.load(fs.readFileSync(f)); const pages = await out.copyPages(src, src.getPageIndices()); pages.forEach((pg) => out.addPage(pg)); }
    const bytes = Buffer.from(await out.save());
    const name = String(job.name || 'SADEX').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160) || 'SADEX';
    if (job.mode === 'save') {
      const r = await dialog.showSaveDialog(win, { title: 'Save PDF', defaultPath: path.join(app.getPath('downloads'), name + '.pdf'), filters: [{ name: 'PDF', extensions: ['pdf'] }] });
      if (r.canceled || !r.filePath) return { ok: true };
      fs.writeFileSync(r.filePath, bytes);
      const q = await dialog.showMessageBox(win, { type: 'info', buttons: ['Open', 'Show in folder', 'Close'], defaultId: 0, message: 'Saved: ' + path.basename(r.filePath) });
      if (q.response === 0) openPreview(r.filePath, path.basename(r.filePath)); else if (q.response === 1) shell.showItemInFolder(r.filePath);
      return { ok: true };
    }
    const f = path.join(app.getPath('temp'), 'SADEX ' + Date.now() + ' ' + name + '.pdf'); fs.writeFileSync(f, bytes); openPreview(f, name);
    return { ok: true };
  } catch (err) { log('pdf job failed:', err); return { ok: false, err: (err && err.message ? err.message : String(err)) + ' — using the built-in PDF instead.' }; }
  finally { setTimeout(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (x) {} }, 60000); }
});
ipcMain.handle('sadex-file', async (e, p) => {
  try {
    const name = String((p && p.name) || 'SADEX file').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180) || 'SADEX file';
    if (!p || !p.data || !p.data.byteLength) throw new Error('the file arrived empty');
    const buf = Buffer.from(new Uint8Array(p.data));
    if (p.kind === 'print') { const f = path.join(app.getPath('temp'), 'SADEX ' + Date.now() + ' ' + name.replace(/\.pdf$/i, '') + '.pdf'); fs.writeFileSync(f, buf); openPreview(f, name.replace(/^Print - /, '').replace(/\.pdf$/i, '')); return true; }
    const r = await dialog.showSaveDialog(win, { title: 'Save file', defaultPath: path.join(app.getPath('downloads'), name) });
    if (r.canceled || !r.filePath) return true;
    fs.writeFileSync(r.filePath, buf);
    // "Open" is offered only for document types, so a saved file can never be run as a program.
    if (!/\.(pdf|xlsx|xls|csv|docx|doc|txt|json|png|jpe?g)$/i.test(r.filePath)) { shell.showItemInFolder(r.filePath); return true; }
    const q = await dialog.showMessageBox(win, { type: 'info', buttons: ['Open', 'Show in folder', 'Close'], defaultId: 0, cancelId: 2, message: 'Saved: ' + path.basename(r.filePath) });
    if (q.response === 0) { if (/\.pdf$/i.test(r.filePath)) openPreview(r.filePath, path.basename(r.filePath)); else { const err = await shell.openPath(r.filePath); if (err) dialog.showErrorBox('SADEX', 'Could not open the file: ' + err); } }
    else if (q.response === 1) shell.showItemInFolder(r.filePath);
    return true;
  } catch (err) { log('save failed:', err); dialog.showErrorBox('SADEX', 'Could not save the file: ' + (err && err.message) + (err && err.code === 'EBUSY' ? '\n\nThe file is open in another program (for example Excel). Close it and try again.' : '')); return false; }
});
ipcMain.on('sadex-menu', (e, p) => { const m = Menu.getApplicationMenu(); if (!m || !win) return;
  Menu.buildFromTemplate(m.items.map((i) => ({ label: i.label, submenu: i.submenu }))).popup({ window: win, x: p && p.x || 0, y: p && p.y || 30 }); });

if (!app.requestSingleInstanceLock()) { app.quit(); }
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  // A crashed GPU process makes the window white or black. After two, suggest safe graphics mode.
  let gpuCrashes = 0;
  app.on('child-process-gone', (e, d) => {
    log('helper stopped:', d.type, d.reason, d.exitCode);
    if (d.type !== 'GPU' || d.reason === 'clean-exit' || loadSettings().safeGraphics || ++gpuCrashes !== 2 || !win) return;
    dialog.showMessageBox(win, { type: 'warning', buttons: ['Turn on and restart', 'Not now'], defaultId: 0, cancelId: 1, message: 'SADEX\'s graphics keep crashing on this PC.', detail: 'Safe graphics mode avoids this. You can change it later in View \u2192 Safe graphics mode.' })
      .then((r) => { if (r.response === 0) { saveSettings({ safeGraphics: true }); app.relaunch(); app.quit(); } });
  });
  app.whenReady().then(() => { log('start, version', app.getVersion()); nativeTheme.themeSource = 'dark'; buildMenu(); handleDownloads(); createWindow(); setupUpdates(); setTimeout(cleanTemp, 10000); });
  app.on('window-all-closed', () => app.quit());
}
