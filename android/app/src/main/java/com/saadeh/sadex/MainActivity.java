package com.saadeh.sadex;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelFileDescriptor;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintDocumentInfo;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;
import android.content.ClipboardManager;
import android.content.ClipData;
import android.os.Message;
import androidx.webkit.WebSettingsCompat;

import androidx.core.content.FileProvider;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Collections;

public class MainActivity extends Activity {
  static final String HOME = "https://claude.ai/artifact/DMze2Cz16YQRegMRCMWPBC";
  WebView web, popup;
  FrameLayout root;
  String lastClip = "";
  ValueCallback<Uri[]> fileCb;

  // Runs in every frame: the Claude page, Claude's inner artifact frame and SADEX itself.
  // In Claude's frames it makes the SADEX frame fill the whole screen and hides Claude's own toolbar.
  static final String FIT = "(function(){if(window.__sxa)return;window.__sxa=1;" +
    "function css(){if(document.getElementById('sxa-css'))return;var s=document.createElement('style');s.id='sxa-css';" +
    "s.textContent='html.sx-full,html.sx-full body{background:#0a1730!important;overflow:hidden!important}html.sx-full body *{visibility:hidden!important}html.sx-full .sx-anc,html.sx-full iframe.sx-art{visibility:visible!important}" +
    "html.sx-full .sx-anc{transform:none!important;filter:none!important;contain:none!important;will-change:auto!important;perspective:none!important;backdrop-filter:none!important;clip-path:none!important}" +
    "html.sx-full iframe.sx-art{position:fixed!important;top:0!important;left:0!important;width:100vw!important;height:100%!important;max-width:none!important;max-height:none!important;margin:0!important;border:0!important;border-radius:0!important;transform:none!important;z-index:2147483647!important}';" +
    "(document.head||document.documentElement).appendChild(s)}" +
    "function fit(){if(document.getElementById('app-data'))return;css();var R=document.documentElement,best=null,ba=0,vw=innerWidth,vh=innerHeight;" +
    "document.querySelectorAll('iframe').forEach(function(f){var r=f.getBoundingClientRect(),a=r.width*r.height;if(f.classList.contains('sx-art'))a=Math.max(a,vw*vh);if(a>ba){ba=a;best=f}});" +
    "document.querySelectorAll('iframe.sx-art').forEach(function(f){if(f!==best)f.classList.remove('sx-art')});" +
    "var ok=best&&ba>vw*vh*0.25,anc=[];if(ok){best.classList.add('sx-art');for(var p=best.parentElement;p&&p!==R;p=p.parentElement)anc.push(p)}" +
    "document.querySelectorAll('.sx-anc').forEach(function(x){if(anc.indexOf(x)<0)x.classList.remove('sx-anc')});anc.forEach(function(x){x.classList.add('sx-anc')});R.classList.toggle('sx-full',!!ok)}" +
    "if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',fit);else fit();setInterval(fit,700);addEventListener('resize',fit)})();";

  @Override protected void onCreate(Bundle b) {
    super.onCreate(b);
    root = new FrameLayout(this);
    web = new WebView(this);
    web.setBackgroundColor(0xFF0A1730);
    root.addView(web);
    setContentView(root);
    immersive();
    setup(web);
    WebSettings s = web.getSettings();
    s.setLoadWithOverviewMode(true); s.setUseWideViewPort(true);
    web.addJavascriptInterface(new Bridge(), "SadexAndroid");
    if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
      WebViewCompat.addDocumentStartJavaScript(web, FIT, Collections.singleton("*"));
    }
    if (b != null) web.restoreState(b); else web.loadUrl(HOME);
    checkUpdate();
  }

  /* Shared settings for the main view and sign-in pop-ups. Google sign-in only works when the app looks like a normal browser. */
  void setup(final WebView v) {
    WebSettings s = v.getSettings();
    s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true); s.setDatabaseEnabled(true);
    s.setMediaPlaybackRequiresUserGesture(false); s.setSupportZoom(false); s.setBuiltInZoomControls(false);
    s.setJavaScriptCanOpenWindowsAutomatically(true); s.setSupportMultipleWindows(true);
    String ua = s.getUserAgentString().replace("; wv)", ")").replaceAll("Version/[0-9.]+ ", "");
    s.setUserAgentString(ua + " SADEX-Android/" + BuildConfig.VERSION_NAME);
    if (WebViewFeature.isFeatureSupported(WebViewFeature.REQUESTED_WITH_HEADER_ALLOW_LIST))
      WebSettingsCompat.setRequestedWithHeaderOriginAllowList(s, java.util.Collections.<String>emptySet());
    CookieManager cm = CookieManager.getInstance(); cm.setAcceptCookie(true); cm.setAcceptThirdPartyCookies(v, true);
    v.setWebViewClient(new WebViewClient() {
      @Override public boolean shouldOverrideUrlLoading(WebView w, WebResourceRequest r) { return route(w, r.getUrl().toString()); }
      @Override public void onPageFinished(WebView w, String u) {
        CookieManager.getInstance().flush();
        if (w == web && !WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) w.evaluateJavascript(FIT, null);
      }
    });
    v.setWebChromeClient(new WebChromeClient() {
      @Override public boolean onShowFileChooser(WebView w, ValueCallback<Uri[]> cb, FileChooserParams p) {
        fileCb = cb;
        try { startActivityForResult(p.createIntent(), 7); } catch (Exception e) { fileCb = null; return false; }
        return true;
      }
      @Override public boolean onCreateWindow(WebView w, boolean dialog, boolean gesture, Message msg) {
        closePopup();
        popup = new WebView(MainActivity.this); popup.setBackgroundColor(0xFFFFFFFF); setup(popup);
        root.addView(popup, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        ((WebView.WebViewTransport) msg.obj).setWebView(popup); msg.sendToTarget();
        return true;
      }
      @Override public void onCloseWindow(WebView w) { if (w == popup) closePopup(); }
    });
  }
  void closePopup() { if (popup != null) { root.removeView(popup); popup.destroy(); popup = null; } }
  /* Claude and Google sign-in pages stay inside the app; everything else opens in the phone's browser. */
  boolean route(WebView w, String u) {
    if (u.startsWith("intent:")) {
      try {
        Intent it = Intent.parseUri(u, Intent.URI_INTENT_SCHEME); String fb = it.getStringExtra("browser_fallback_url");
        if (fb != null && inside(fb)) { w.loadUrl(fb); return true; }
        startActivity(it);
      } catch (Exception e) {}
      return true;
    }
    if (inside(u)) return false;
    try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(u))); } catch (Exception e) {}
    return true;
  }
  static boolean inside(String u) {
    if (u.matches("^https://([a-z0-9-]+\\.)*(google\\.[a-z.]+|gstatic\\.com|googleusercontent\\.com|googleapis\\.com|youtube\\.com)(/.*)?$")) return true;
    return u.matches("^https://([a-z0-9-]+\\.)*(claude\\.ai|claudeusercontent\\.com|anthropic\\.com|claude\\.com)(/.*)?$")
      || u.startsWith("https://accounts.google.com/") || u.startsWith("about:") || u.startsWith("blob:") || u.startsWith("data:");
  }

  void immersive() {
    Window w = getWindow();
    if (Build.VERSION.SDK_INT >= 30) {
      w.setDecorFitsSystemWindows(false);
      WindowInsetsController c = w.getInsetsController();
      if (c != null) { c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars()); c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE); }
    } else {
      w.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
    }
  }
  @Override public void onWindowFocusChanged(boolean f) { super.onWindowFocusChanged(f); if (f) immersive(); }
  @Override protected void onSaveInstanceState(Bundle o) { super.onSaveInstanceState(o); web.saveState(o); }
  @Override protected void onPause() { super.onPause(); CookieManager.getInstance().flush(); }
  @Override public void onBackPressed() {
    if (popup != null) { if (popup.canGoBack()) popup.goBack(); else closePopup(); return; }
    if (web.canGoBack()) web.goBack(); else super.onBackPressed();
  }
  /* Signing in by email: copy the sign-in link from the email, come back to SADEX, and the app offers to open it here. */
  @Override protected void onResume() { super.onResume(); web.postDelayed(this::checkClip, 600); }
  void checkClip() {
    try {
      ClipboardManager cb = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE); ClipData c = cb.getPrimaryClip();
      if (c == null || c.getItemCount() == 0) return;
      CharSequence t = c.getItemAt(0).coerceToText(this); if (t == null) return;
      final String u = t.toString().trim();
      if (u.equals(lastClip) || !u.matches("^https://(www\\.)?claude\\.ai/\\S*(magic|login|verify|auth|token)\\S*$")) return;
      lastClip = u;
      new AlertDialog.Builder(this).setTitle("Sign in to SADEX").setMessage("Open the sign-in link you copied, here in the SADEX app?")
        .setPositiveButton("Open", (d, w) -> { closePopup(); web.loadUrl(u); }).setNegativeButton("No", null).show();
    } catch (Exception e) {}
  }
  @Override protected void onActivityResult(int req, int res, Intent data) {
    if (req == 7 && fileCb != null) { fileCb.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(res, data)); fileCb = null; return; }
    super.onActivityResult(req, res, data);
  }

  /* Files and printing for the SADEX page (Word, PDF, print preview). */
  class Bridge {
    @JavascriptInterface public boolean isApp() { return true; }
    @JavascriptInterface public String version() { return BuildConfig.VERSION_NAME; }
    @JavascriptInterface public void saveFile(String name, String mime, String b64) {
      final byte[] data = Base64.decode(b64, Base64.DEFAULT);
      final String fn = clean(name);
      runOnUiThread(() -> {
        try {
          Uri uri;
          if (Build.VERSION.SDK_INT >= 29) {
            ContentValues cv = new ContentValues();
            cv.put(MediaStore.Downloads.DISPLAY_NAME, fn); cv.put(MediaStore.Downloads.MIME_TYPE, mime);
            cv.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/SADEX");
            uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
            try (OutputStream o = getContentResolver().openOutputStream(uri)) { o.write(data); }
          } else {
            File dir = new File(getExternalFilesDir(null), "SADEX"); dir.mkdirs(); File f = new File(dir, fn);
            try (FileOutputStream o = new FileOutputStream(f)) { o.write(data); }
            uri = FileProvider.getUriForFile(MainActivity.this, "com.saadeh.sadex.files", f);
          }
          Toast.makeText(MainActivity.this, "Saved to Downloads/SADEX: " + fn, Toast.LENGTH_LONG).show();
          Intent i = new Intent(Intent.ACTION_VIEW); i.setDataAndType(uri, mime); i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
          try { startActivity(Intent.createChooser(i, "Open " + fn)); } catch (Exception e) {}
        } catch (Exception e) { Toast.makeText(MainActivity.this, "Could not save: " + e.getMessage(), Toast.LENGTH_LONG).show(); }
      });
    }
    @JavascriptInterface public void printPdf(String name, String b64) {
      final byte[] data = Base64.decode(b64, Base64.DEFAULT);
      final String fn = clean(name);
      runOnUiThread(() -> {
        try {
          final File f = new File(getCacheDir(), "print.pdf");
          try (FileOutputStream o = new FileOutputStream(f)) { o.write(data); }
          PrintManager pm = (PrintManager) getSystemService(PRINT_SERVICE);
          pm.print(fn, new PrintDocumentAdapter() {
            @Override public void onLayout(PrintAttributes o, PrintAttributes n, CancellationSignal c, LayoutResultCallback cb, Bundle x) {
              cb.onLayoutFinished(new PrintDocumentInfo.Builder(fn).setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT).build(), true);
            }
            @Override public void onWrite(PageRange[] p, ParcelFileDescriptor d, CancellationSignal c, WriteResultCallback cb) {
              try (InputStream in = new FileInputStream(f); OutputStream out = new FileOutputStream(d.getFileDescriptor())) {
                byte[] buf = new byte[16384]; int n; while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                cb.onWriteFinished(new PageRange[]{PageRange.ALL_PAGES});
              } catch (Exception e) { cb.onWriteFailed(e.getMessage()); }
            }
          }, null);
        } catch (Exception e) { Toast.makeText(MainActivity.this, "Could not print: " + e.getMessage(), Toast.LENGTH_LONG).show(); }
      });
    }
  }
  static String clean(String n) { String s = (n == null ? "SADEX file" : n).replaceAll("[\\\\/:*?\"<>|]+", " ").trim(); return s.isEmpty() ? "SADEX file" : s; }

  /* New app version on GitHub? Offer to download it. The SADEX content itself always loads fresh from Claude. */
  void checkUpdate() {
    new Thread(() -> {
      try {
        HttpURLConnection c = (HttpURLConnection) new URL("https://api.github.com/repos/Ahmed-Saadeh/sadex-desktop/releases?per_page=20").openConnection();
        c.setRequestProperty("Accept", "application/vnd.github+json"); c.setConnectTimeout(8000); c.setReadTimeout(8000);
        InputStream in = c.getInputStream(); java.util.Scanner sc = new java.util.Scanner(in).useDelimiter("\\A"); String body = sc.hasNext() ? sc.next() : "[]";
        JSONArray a = new JSONArray(body);
        for (int i = 0; i < a.length(); i++) {
          JSONObject r = a.getJSONObject(i); String tag = r.optString("tag_name");
          if (!tag.startsWith("android-v")) continue;
          String v = tag.substring(9);
          if (newer(v, BuildConfig.VERSION_NAME)) {
            JSONArray as = r.getJSONArray("assets"); String url = null;
            for (int k = 0; k < as.length(); k++) { JSONObject o = as.getJSONObject(k); if (o.optString("name").endsWith(".apk")) url = o.optString("browser_download_url"); }
            final String fu = url != null ? url : r.optString("html_url");
            new Handler(Looper.getMainLooper()).post(() -> new AlertDialog.Builder(MainActivity.this)
              .setTitle("SADEX " + v + " is available").setMessage("Download and install the new version of the SADEX app?")
              .setPositiveButton("Download", (d, w) -> startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(fu))))
              .setNegativeButton("Later", null).show());
          }
          break;
        }
      } catch (Exception e) {}
    }).start();
  }
  static boolean newer(String a, String b) {
    String[] x = a.split("\\."), y = b.split("\\.");
    for (int i = 0; i < Math.max(x.length, y.length); i++) {
      int p = i < x.length ? Integer.parseInt(x[i].replaceAll("\\D", "0")) : 0, q = i < y.length ? Integer.parseInt(y[i].replaceAll("\\D", "0")) : 0;
      if (p != q) return p > q;
    }
    return false;
  }
}
