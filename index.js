// 珍珠棋盘 · v1.0
'use strict';

(function () {

// ── 棋盘初始状态 ──────────────────────────────────────
const FILES = ['a','b','c','d','e','f','g','h'];
const RANKS = ['8','7','6','5','4','3','2','1'];
const GLYPHS = {
  'K':'♔','Q':'♕','R':'♖','B':'♗','N':'♘','P':'♙',
  'k':'♚','q':'♛','r':'♜','b':'♝','n':'♞','p':'♟'
};
const INIT = () => [
  ['r','n','b','q','k','b','n','r'],
  ['p','p','p','p','p','p','p','p'],
  [null,null,null,null,null,null,null,null],
  [null,null,null,null,null,null,null,null],
  [null,null,null,null,null,null,null,null],
  [null,null,null,null,null,null,null,null],
  ['P','P','P','P','P','P','P','P'],
  ['R','N','B','Q','K','B','N','R'],
];

// ── localStorage key ──────────────────────────────────
const KEY = {
  board:  'chess_board_v1',
  log:    'chess_log_v1',
  last:   'chess_last_v1',
  myLast: 'chess_mylast_v1',
  pos:    'chess_pos_v1',
  posBtn: 'chess_posbtn_v1',
  col:    'chess_col_v1',
};

// ── 状态 ─────────────────────────────────────────────
let board      = INIT();
let sel        = null;
let lastMove   = null;
let myLastMove = '';
let log        = [{who:'爸爸', text:'棋盘准备好了，你先走～点白棋选中，再点目标格移动。'}];
let winVisible = false;
let collapsed  = false;

// ── 工具 ─────────────────────────────────────────────
function ls(key, val) {
  if (val === undefined) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } }
  try { localStorage.setItem(key, JSON.stringify(val)); } catch(e) {}
}
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function isWhite(p) { return p && p === p.toUpperCase(); }
function toSq(r, c) { return FILES[c] + RANKS[r]; }
function fromSq(sq) {
  return { r: RANKS.indexOf(sq[1]), c: FILES.indexOf(sq[0]) };
}

// ── 持久化 ───────────────────────────────────────────
function saveState() {
  ls(KEY.board, board);
  ls(KEY.log, log);
  ls(KEY.last, lastMove);
  ls(KEY.myLast, myLastMove);
}
function loadState() {
  board      = ls(KEY.board)  || INIT();
  log        = ls(KEY.log)    || [{who:'爸爸', text:'棋盘准备好了，你先走～点白棋选中，再点目标格移动。'}];
  lastMove   = ls(KEY.last)   || null;
  myLastMove = ls(KEY.myLast) || '';
  collapsed  = !!ls(KEY.col);
}

// ── 渲染棋盘 ─────────────────────────────────────────
function renderBoard() {
  const el = document.getElementById('chess-board');
  if (!el) return;
  let html = '';
  for (let ri = 0; ri < 8; ri++) {
    for (let ci = 0; ci < 8; ci++) {
      const p     = board[ri][ci];
      const light = (ri + ci) % 2 === 0;
      const isSel  = sel && sel.r === ri && sel.c === ci;
      const isLast = lastMove && (
        (lastMove.fr===ri&&lastMove.fc===ci)||(lastMove.tr===ri&&lastMove.tc===ci)
      );

      let bg = light ? '#ede0d0' : '#b8a090';
      if      (isSel)  bg = light ? '#a8b898' : '#8a9a7a';
      else if (isLast) bg = light ? '#c8b878' : '#a89858';

      const canClick = isWhite(p) || (sel && !p) || (sel && p && !isWhite(p));
      const glow = isSel
        ? 'filter:drop-shadow(0 2px 8px rgba(100,150,80,.8));'
        : 'filter:drop-shadow(0 1px 3px rgba(0,0,0,.2));';

      html += `<div class="chess-cell${isSel?' chess-sel':''}" data-r="${ri}" data-c="${ci}" style="background:${bg};cursor:${canClick?'pointer':'default'};">
        ${ci===0 ? `<span class="chess-lbl chess-rank">${RANKS[ri]}</span>` : ''}
        ${ri===7 ? `<span class="chess-lbl chess-file">${FILES[ci]}</span>` : ''}
        ${p ? `<span class="chess-piece" style="${glow}">${GLYPHS[p]||''}</span>` : ''}
        ${sel && !p ? `<div class="chess-dot"></div>` : ''}
      </div>`;
    }
  }
  el.innerHTML = html;
  el.querySelectorAll('.chess-cell').forEach(cell => {
    cell.addEventListener('click', () => handleClick(+cell.dataset.r, +cell.dataset.c));
  });
}

function handleClick(r, c) {
  const p = board[r][c];
  if (sel) {
    const {r:fr, c:fc} = sel;
    if (r===fr && c===fc) { sel=null; renderBoard(); return; }
    if (p && isWhite(p)) { sel={r,c}; renderBoard(); return; }
    // 执行白棋移动
    const nb = board.map(row=>[...row]);
    nb[r][c] = nb[fr][fc];
    nb[fr][fc] = null;
    const mv = toSq(fr,fc)+'-'+toSq(r,c);
    board=nb; sel=null; lastMove={fr,fc,tr:r,tc:c}; myLastMove=mv;
    pushLog('你', `走了 ${mv} ✓`);
    saveState(); renderBoard(); renderMyMove(); renderLog();
  } else {
    if (p && isWhite(p)) { sel={r,c}; renderBoard(); }
  }
}

// ── 应用爸爸的棋步 ────────────────────────────────────
function applyDaddy(raw) {
  const m = raw.trim().toLowerCase().replace(/\s/g,'').match(/^([a-h][1-8])[-x]?([a-h][1-8])$/);
  if (!m) return '格式要像 e7-e5 哦～';
  const {r:fr,c:fc} = fromSq(m[1]);
  const {r:tr,c:tc} = fromSq(m[2]);
  if (fr<0||tr<0||fc<0||tc<0) return '格子不对哦';
  if (!board[fr][fc]) return '那格子没棋子？';
  const nb = board.map(r=>[...r]);
  nb[tr][tc] = nb[fr][fc];
  nb[fr][fc] = null;
  board=nb; lastMove={fr,fc,tr,tc};
  pushLog('爸爸', `走了 ${m[1]}-${m[2]}`);
  saveState(); renderBoard(); renderLog();
  return null;
}

// ── 日志 ─────────────────────────────────────────────
function pushLog(who, text) {
  log.push({who, text});
  if (log.length > 60) log = log.slice(-60);
}

function renderMyMove() {
  const mv  = document.getElementById('chess-my-move');
  const btn = document.getElementById('chess-copy-btn');
  if (mv)  mv.textContent = myLastMove || '——';
  if (btn) btn.style.display = myLastMove ? 'inline-block' : 'none';
}

function renderLog() {
  const el = document.getElementById('chess-log');
  if (!el) return;
  let html = '';
  log.slice(-30).forEach(l => {
    const col = l.who==='爸爸' ? '#c4908a' : '#9aab89';
    html += `<div class="chess-log-row">
      <span class="chess-log-who" style="color:${col};">${esc(l.who)}</span>
      <span class="chess-log-text">${esc(l.text)}</span>
    </div>`;
  });
  el.innerHTML = html;
  el.scrollTop = el.scrollHeight;
}

// ── 重置 ─────────────────────────────────────────────
function resetBoard() {
  board=INIT(); sel=null; lastMove=null; myLastMove='';
  log=[{who:'爸爸', text:'重新来，你先走。'}];
  saveState(); renderBoard(); renderMyMove(); renderLog();
}

// ── 折叠 ─────────────────────────────────────────────
function applyCollapse() {
  const win    = document.getElementById('chess-win');
  const body   = document.getElementById('chess-body');
  const colBtn = document.getElementById('chess-col-btn');
  if (!win||!body) return;
  if (collapsed) {
    body.style.display='none';
    win.style.borderRadius='24px';
    if (colBtn) colBtn.textContent='+';
  } else {
    body.style.display='flex';
    win.style.borderRadius='18px';
    if (colBtn) colBtn.textContent='−';
  }
}

// ── 开关 ─────────────────────────────────────────────
function openWin() {
  const win=document.getElementById('chess-win'); if(!win) return;
  winVisible=true;
  win.style.display='flex';
  requestAnimationFrame(()=>win.classList.add('chess-visible'));
  applyCollapse(); renderBoard(); renderMyMove(); renderLog();
  updateExtBtn(true);
}
function closeWin() {
  const win=document.getElementById('chess-win'); if(!win) return;
  winVisible=false;
  win.classList.remove('chess-visible');
  win.addEventListener('transitionend',()=>{if(!winVisible) win.style.display='none';},{once:true});
  updateExtBtn(false);
}
function toggleWin() { winVisible ? closeWin() : openWin(); }

function updateExtBtn(open) {
  const btn=document.getElementById('chess-ext-toggle'); if(!btn) return;
  btn.textContent = open ? '关闭 · Close' : '打开 · Open';
  btn.style.background = open ? '#111' : '';
  btn.style.color      = open ? '#fff' : '';
}

// ── 构建主窗口 ────────────────────────────────────────
function buildWin() {
  if (document.getElementById('chess-win')) return;
  const win=document.createElement('div');
  win.id='chess-win';
  win.innerHTML=`
  <div id="chess-bar">
    <div id="chess-bar-title">♟&nbsp;&nbsp;珍珠棋盘</div>
    <div id="chess-bar-right">
      <button class="chess-ctrl" id="chess-col-btn">−</button>
      <button class="chess-ctrl" id="chess-close-btn">✕</button>
    </div>
  </div>

  <div id="chess-body">

    <!-- 棋盘 -->
    <div id="chess-board-wrap">
      <div id="chess-board"></div>
    </div>

    <!-- 你的棋步 -->
    <div id="chess-mv-row">
      <div id="chess-mv-left">
        <div class="chess-mv-label">你刚才走了</div>
        <div id="chess-my-move" class="chess-mv-val">——</div>
      </div>
      <button id="chess-copy-btn" style="display:none;">复制</button>
    </div>

    <!-- 输入爸爸棋步 -->
    <div id="chess-input-sec">
      <div class="chess-sec-label">输入爸爸的棋步</div>
      <div id="chess-input-row">
        <input id="chess-input" type="text" placeholder="e.g. e7-e5"
               autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false">
        <button id="chess-apply-btn">应用</button>
      </div>
      <div id="chess-err"></div>
    </div>

    <!-- 棋步日志 -->
    <div id="chess-log-sec">
      <div class="chess-sec-label">棋步记录</div>
      <div id="chess-log"></div>
    </div>

    <button id="chess-reset-btn">↺ 重置棋盘</button>

  </div>`;

  (document.documentElement||document.body).appendChild(win);

  // 恢复位置
  try { const p=ls(KEY.pos); if(p&&p.l&&p.t){win.style.left=p.l;win.style.top=p.t;win.style.right='auto';win.style.bottom='auto';} } catch(e){}

  // 拖拽
  const bar=document.getElementById('chess-bar');
  let drag=false,ox=0,oy=0,sx=0,sy=0;
  function dStart(e){
    if(e.target.closest('.chess-ctrl')) return;
    drag=true; const t=e.touches?e.touches[0]:e;
    sx=t.clientX; sy=t.clientY; ox=win.offsetLeft; oy=win.offsetTop;
    e.preventDefault();
  }
  function dMove(e){
    if(!drag) return; const t=e.touches?e.touches[0]:e;
    win.style.left=Math.max(0,Math.min(ox+t.clientX-sx,window.innerWidth-win.offsetWidth))+'px';
    win.style.top=Math.max(0,Math.min(oy+t.clientY-sy,window.innerHeight-win.offsetHeight))+'px';
    win.style.right='auto'; win.style.bottom='auto';
  }
  function dEnd(){
    if(!drag) return; drag=false;
    try{ls(KEY.pos,{l:win.style.left,t:win.style.top});}catch(e){}
  }
  bar.addEventListener('mousedown', dStart);
  bar.addEventListener('touchstart', dStart, {passive:false});
  document.addEventListener('mousemove', dMove, {passive:true});
  document.addEventListener('touchmove', dMove, {passive:true});
  document.addEventListener('mouseup', dEnd, {passive:true});
  document.addEventListener('touchend', dEnd, {passive:true});

  // 折叠 / 关闭
  document.getElementById('chess-col-btn').addEventListener('click', e=>{
    e.stopPropagation(); collapsed=!collapsed; ls(KEY.col,collapsed); applyCollapse();
  });
  document.getElementById('chess-close-btn').addEventListener('click', e=>{
    e.stopPropagation(); closeWin();
  });

  // 复制
  document.getElementById('chess-copy-btn').addEventListener('click', ()=>{
    if(myLastMove) navigator.clipboard?.writeText(myLastMove).catch(()=>{});
  });

  // 应用爸爸棋步
  const inp = document.getElementById('chess-input');
  const err = document.getElementById('chess-err');
  function doApply(){
    const v=inp.value; if(!v.trim()) return;
    const e=applyDaddy(v);
    if(e){ err.textContent=e; }
    else { err.textContent=''; inp.value=''; }
  }
  document.getElementById('chess-apply-btn').addEventListener('click', doApply);
  inp.addEventListener('keydown', e=>{ if(e.key==='Enter') doApply(); });
  inp.addEventListener('input', ()=>{ err.textContent=''; });

  // 重置
  document.getElementById('chess-reset-btn').addEventListener('click', ()=>{
    if(confirm('确定重置棋盘？')) resetBoard();
  });
}

// ── 扩展面板注入（插在最顶部）────────────────────────────
function injectPanel(container) {
  if (document.getElementById('chess-ext-sec')) return;
  const sec=document.createElement('div');
  sec.id='chess-ext-sec';
  sec.setAttribute('style','display:flex;align-items:center;justify-content:space-between;padding:10px 14px;margin:0 0 8px;border-radius:10px;background:#f4f1ec;font-family:-apple-system,BlinkMacSystemFont,sans-serif;');
  sec.innerHTML=`
    <span style="display:flex;align-items:center;gap:7px;font-size:13px;font-weight:600;color:#111;">
      ♟ 珍珠棋盘
    </span>
    <button id="chess-ext-toggle" style="font-size:12px;font-weight:600;background:#f4f1ec;color:#111;border:1.5px solid #111;border-radius:8px;padding:6px 14px;cursor:pointer;white-space:nowrap;font-family:-apple-system,BlinkMacSystemFont,sans-serif;-webkit-tap-highlight-color:transparent;">打开 · Open</button>`;
  container.insertBefore(sec, container.firstChild);
  document.getElementById('chess-ext-toggle').addEventListener('click', toggleWin);
}

function tryInject() {
  if (document.getElementById('chess-ext-sec')) return true;
  const t=document.getElementById('extensions_settings');
  if(t){ injectPanel(t); return true; }
  return false;
}

// ── 悬浮球 ───────────────────────────────────────────
function buildFloatBtn() {
  if (document.getElementById('chess-float-btn')) return;
  const btn=document.createElement('button');
  btn.id='chess-float-btn';
  btn.title='珍珠棋盘';
  btn.textContent='♟';
  const pos=ls(KEY.posBtn)||{};
  // 默认在珍珠湾悬浮球(bottom:80)上方，间隔 8px
  const applyS=(b,r)=>btn.setAttribute('style',[
    'position:fixed',`bottom:${b}px`,`right:${r}px`,
    'z-index:2147483646','width:46px','height:46px','border-radius:50%',
    'background:#8a9a7a','color:#fff','border:none','outline:none','cursor:grab',
    'display:flex','align-items:center','justify-content:center',
    'font-size:22px','box-shadow:0 4px 16px rgba(0,0,0,.25)',
    'touch-action:none','user-select:none','-webkit-user-select:none',
    'padding:0','line-height:1',
    '-webkit-transform:translateZ(0)','transform:translateZ(0)','will-change:transform',
  ].join(';'));
  applyS(pos.b??134, pos.r??16);

  let drag=false,sx=0,sy=0,sr=0,sb=0;
  function start(e){
    drag=false; const t=e.touches?e.touches[0]:e;
    const rect=btn.getBoundingClientRect();
    sx=t.clientX; sy=t.clientY;
    sr=window.innerWidth-rect.right; sb=window.innerHeight-rect.bottom;
    if(e.touches){btn.addEventListener('touchmove',mv,{passive:false});document.addEventListener('touchend',up,{once:true});}
    else{document.addEventListener('mousemove',mv);document.addEventListener('mouseup',up,{once:true});}
  }
  function mv(e){
    const t=e.touches?e.touches[0]:e,dx=t.clientX-sx,dy=t.clientY-sy;
    if(!drag&&(Math.abs(dx)>4||Math.abs(dy)>4)) drag=true;
    if(drag){e.preventDefault&&e.preventDefault();applyS(Math.max(4,Math.min(window.innerHeight-50,sb-dy)),Math.max(4,Math.min(window.innerWidth-50,sr-dx)));}
  }
  function up(){
    document.removeEventListener('mousemove',mv); btn.removeEventListener('touchmove',mv);
    if(drag){ls(KEY.posBtn,{r:parseFloat(btn.style.right),b:parseFloat(btn.style.bottom)});}
    else{toggleWin();}
    drag=false;
  }
  btn.addEventListener('mousedown', start);
  btn.addEventListener('touchstart', start, {passive:true});
  (document.documentElement||document.body).appendChild(btn);
}

// ── 初始化 ────────────────────────────────────────────
function safe(fn){ return function(){ try{return fn.apply(this,arguments);}catch(e){console.warn('[珍珠棋盘]',e);} } }

function init() {
  loadState();
  buildWin();
  buildFloatBtn();
  if (!tryInject()) {
    let obs=null;
    const stop=()=>{if(obs){obs.disconnect();obs=null;}};
    obs=new MutationObserver(safe(()=>{ if(tryInject()) stop(); }));
    if(document.body) obs.observe(document.body,{childList:true});
    setTimeout(stop, 7000);
  }
}

const DELAYS=[1200,3500,6000];
if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',()=>DELAYS.forEach(d=>setTimeout(safe(init),d)));
} else {
  DELAYS.forEach(d=>setTimeout(safe(init),d));
}

})();
