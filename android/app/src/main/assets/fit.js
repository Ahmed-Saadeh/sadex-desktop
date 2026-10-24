(function(){
  if (window.__sxa) return; window.__sxa = 1;
  var CSS = 'html.sx-full,html.sx-full body{background:#0a1730!important;overflow:hidden!important}' +
    'html.sx-full body *{visibility:hidden!important}' +
    'html.sx-full .sx-anc,html.sx-full iframe.sx-art{visibility:visible!important}' +
    'html.sx-full .sx-anc{transform:none!important;filter:none!important;contain:none!important;will-change:auto!important;perspective:none!important;backdrop-filter:none!important;clip-path:none!important}' +
    'html.sx-full iframe.sx-art{position:fixed!important;top:0!important;left:0!important;right:0!important;bottom:0!important;width:100vw!important;height:100%!important;max-width:none!important;max-height:none!important;margin:0!important;border:0!important;border-radius:0!important;transform:none!important;z-index:2147483647!important}';
  var done = false;
  function css() {
    if (done) return; done = true;
    // claude.ai blocks <style> tags it did not write, so use a constructed style sheet (allowed) and keep the <style> as a fallback.
    try { var sh = new CSSStyleSheet(); sh.replaceSync(CSS); document.adoptedStyleSheets = document.adoptedStyleSheets.concat([sh]); } catch (e) {}
    try { var s = document.createElement('style'); s.textContent = CSS; (document.head || document.documentElement).appendChild(s); } catch (e) {}
  }
  function imp(el, k, v) { try { if (el.style.getPropertyValue(k) !== v || el.style.getPropertyPriority(k) !== 'important') el.style.setProperty(k, v, 'important'); } catch (e) {} }
  var last = null;
  function fit() {
    if (document.getElementById('app-data')) return;           // this is SADEX itself
    css();
    var R = document.documentElement, best = null, ba = 0, vw = innerWidth, vh = innerHeight;
    document.querySelectorAll('iframe').forEach(function (f) {
      var r = f.getBoundingClientRect(), a = r.width * r.height;
      if (f === last) a = Math.max(a, vw * vh);
      if (a > ba) { ba = a; best = f; }
    });
    var ok = best && ba > vw * vh * 0.25;
    if (!ok) { R.classList.remove('sx-full'); return; }
    if (last && last !== best) last.classList.remove('sx-art');
    last = best; best.classList.add('sx-art'); R.classList.add('sx-full');
    // Inline styles as well, in case the style sheet was refused.
    [['position','fixed'],['top','0'],['left','0'],['width','100vw'],['height','100%'],['max-width','none'],['max-height','none'],['margin','0'],['border','0'],['border-radius','0'],['transform','none'],['z-index','2147483647'],['visibility','visible']].forEach(function (p) { imp(best, p[0], p[1]); });
    for (var p = best.parentElement; p && p !== R; p = p.parentElement) {
      p.classList.add('sx-anc');
      ['transform','filter','contain','perspective','backdrop-filter','clip-path','will-change'].forEach(function (k) { imp(p, k, k === 'will-change' ? 'auto' : 'none'); });
      imp(p, 'visibility', 'visible');
      // Hide everything beside the path to the SADEX frame (Claude's toolbar, buttons, panels).
      Array.prototype.forEach.call(p.children, function (c) { if (c !== best && !c.contains(best) && c.tagName !== 'SCRIPT' && c.tagName !== 'STYLE') imp(c, 'visibility', 'hidden'); });
    }
    imp(document.body, 'overflow', 'hidden'); imp(R, 'overflow', 'hidden');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fit); else fit();
  setInterval(fit, 600); addEventListener('resize', fit);
  try { new MutationObserver(function () { clearTimeout(window.__sxt); window.__sxt = setTimeout(fit, 80); }).observe(document.documentElement, { childList: true, subtree: true }); } catch (e) {}
})();
