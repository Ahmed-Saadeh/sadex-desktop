// Injected into the Claude page: a slim SADEX bar (drag area + buttons) and a full-window SADEX view
// that covers Claude's own artifact toolbar. "Claude tools" shows that toolbar again (Share, Chat).
module.exports.css = `
#sx-bar{position:fixed;top:0;left:0;right:0;height:30px;background:#0a1730;color:#e6eefc;display:flex;align-items:center;gap:8px;
  padding:0 146px 0 10px;font:600 12px/1 "Segoe UI",system-ui,sans-serif;z-index:2147483647;-webkit-app-region:drag;
  border-bottom:1px solid #1c3256;box-sizing:border-box;user-select:none}
#sx-bar .sx-t{letter-spacing:.18em}#sx-bar .sx-t b{color:#2db6fb;font-weight:700}
#sx-bar .sx-s{color:#7f93b4;font-weight:500;letter-spacing:.04em;font-size:11px;margin-right:auto}
#sx-bar button{-webkit-app-region:no-drag;background:transparent;color:#b9c8e2;border:1px solid #2a3f63;border-radius:99px;
  font:500 11px "Segoe UI",system-ui,sans-serif;height:20px;padding:0 10px;cursor:pointer}
#sx-bar button:hover{border-color:#2db6fb;color:#fff}
#sx-bar button[aria-pressed="true"]{background:#2db6fb;color:#06121f;border-color:#2db6fb}
html{padding-top:30px!important;box-sizing:border-box!important}
html.sx-full iframe.sx-art{position:fixed!important;top:30px!important;left:0!important;right:0!important;width:100vw!important;
  height:calc(100vh - 30px)!important;max-width:none!important;max-height:none!important;z-index:2147483640!important;border:0!important;border-radius:0!important;margin:0!important;transform:none!important}
`;
module.exports.js = `(function(){
  if(window.__sxBar)return;window.__sxBar=1;
  var full=true;try{full=localStorage.getItem('sx-claude-tools')!=='1'}catch(e){}
  function bar(){if(document.getElementById('sx-bar')||!document.body)return;
    var b=document.createElement('div');b.id='sx-bar';
    b.innerHTML='<span class="sx-t">SAD<b>E</b>X</span><span class="sx-s">Formulas. Standards. Control.</span>'+
      '<button type="button" id="sx-tools" title="Show Claude\\u2019s toolbar (Share, Chat)">Claude tools</button>'+
      '<button type="button" id="sx-reload" title="Reload — get the latest SADEX (Ctrl+R)">\\u21bb</button>'+
      '<button type="button" id="sx-menu" title="Menu">\\u2630</button>';
    document.body.appendChild(b);
    b.querySelector('#sx-reload').onclick=function(){location.reload()};
    b.querySelector('#sx-menu').onclick=function(e){var r=e.target.getBoundingClientRect();if(window.sadexDesktop)window.sadexDesktop.openMenu(Math.round(r.left),Math.round(r.bottom))};
    b.querySelector('#sx-tools').onclick=function(){full=!full;try{localStorage.setItem('sx-claude-tools',full?'0':'1')}catch(e){}apply()};
  }
  function apply(){var best=null,ba=0,vw=innerWidth,vh=innerHeight;
    document.querySelectorAll('iframe').forEach(function(f){var r=f.getBoundingClientRect(),a=r.width*r.height;if(f.classList.contains('sx-art')){a=Math.max(a,vw*vh)}if(a>ba){ba=a;best=f}});
    document.querySelectorAll('iframe.sx-art').forEach(function(f){if(f!==best)f.classList.remove('sx-art')});
    var ok=best&&ba>vw*vh*0.35;if(ok)best.classList.add('sx-art');
    document.documentElement.classList.toggle('sx-full',!!(ok&&full));
    var t=document.getElementById('sx-tools');if(t){t.hidden=!ok;t.setAttribute('aria-pressed',String(!full))}}
  // Files from the SADEX page (Word, PDF, print) are saved by the desktop app itself, so no hidden Claude prompt is needed.
  addEventListener('message',function(e){var m=e.data;if(!m||!m.sadexDesk||!window.sadexDesktop||!e.source)return;
    if(e.source===window||!/^https:\\/\\//i.test(e.origin))return;
    if(m.sadexDesk==='pdfjob'){if(!window.sadexDesktop.pdfjob){e.source.postMessage({sadexAck:m.id,ok:false},'*');return}e.source.postMessage({sadexAck:m.id,ok:true},'*');
      window.sadexDesktop.pdfjob({mode:m.mode,name:m.name,parts:m.parts}).then(function(r){e.source.postMessage({sadexDone:m.id,ok:!!(r&&r.ok),err:r&&r.err},'*')},function(x){e.source.postMessage({sadexDone:m.id,ok:false,err:String(x&&x.message||x)},'*')});return}
    window.sadexDesktop.file(String(m.sadexDesk),String(m.name||'SADEX file'),m.data).then(function(r){e.source.postMessage({sadexAck:m.id,ok:!!r},'*')},function(){e.source.postMessage({sadexAck:m.id,ok:false},'*')})});
  bar();apply();setInterval(function(){bar();apply()},700);addEventListener('resize',apply);
})();`;
