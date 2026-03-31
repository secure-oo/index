// 珍珠棋盘 · v3.0  合法走步验证 + 提示 + 复盘
'use strict';
(function () {

// ─── 常量 ──────────────────────────────────────────────
const FILES = ['a','b','c','d','e','f','g','h'];
const RANKS = ['8','7','6','5','4','3','2','1'];
const GLYPHS = {
  'K':'♔','Q':'♕','R':'♖','B':'♗','N':'♘','P':'♙',
  'k':'♚','q':'♛','r':'♜','b':'♝','n':'♞','p':'♟'
};
const INIT_BOARD = () => [
  ['r','n','b','q','k','b','n','r'],
  ['p','p','p','p','p','p','p','p'],
  [null,null,null,null,null,null,null,null],
  [null,null,null,null,null,null,null,null],
  [null,null,null,null,null,null,null,null],
  [null,null,null,null,null,null,null,null],
  ['P','P','P','P','P','P','P','P'],
  ['R','N','B','Q','K','B','N','R'],
];
const INIT_CASTLING = () => ({WK:true,WQ:true,BK:true,BQ:true});

// ─── localStorage keys ─────────────────────────────────
const KEY = {
  board:'chess_board_v3', log:'chess_log_v3', last:'chess_last_v3',
  myLast:'chess_mylast_v3', ep:'chess_ep_v3', castling:'chess_castling_v3',
  pos:'chess_pos_v1', posBtn:'chess_posbtn_v1', col:'chess_col_v1', panel:'chess_panel_v1',
};

// ─── 状态 ──────────────────────────────────────────────
let board      = INIT_BOARD();
let sel        = null;       // {r,c} 已选中的白棋格
let validMoves = [];         // [{fr,fc,tr,tc,...}] 当前合法走法
let lastMove   = null;       // {fr,fc,tr,tc} 上一步高亮
let myLastMove = '';         // 白方最后一步字符串
let enPassant  = null;       // {r,c} 吃过路兵目标格
let castling   = INIT_CASTLING();
let log        = [{who:'系统',text:'棋盘准备好了，你先走～'}];
let winVisible = false;
let collapsed  = false;
let panelOpen  = true;

// ─── 工具 ──────────────────────────────────────────────
function ls(key,val){
  if(val===undefined){try{return JSON.parse(localStorage.getItem(key));}catch{return null;}}
  try{localStorage.setItem(key,JSON.stringify(val));}catch(e){}
}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function isW(p){return !!(p&&p===p.toUpperCase());}
function isB(p){return !!(p&&p===p.toLowerCase());}
function toSq(r,c){return FILES[c]+RANKS[r];}
function fromSq(sq){return{r:RANKS.indexOf(sq[1]),c:FILES.indexOf(sq[0])};}
function ib(r,c){return r>=0&&r<8&&c>=0&&c<8;}

// ─── 核心：攻击检测 ────────────────────────────────────
// 判断格子(r,c)是否被 attackerIsWhite 方的棋子攻击
function isAttackedBy(bd,r,c,attackerIsWhite){
  const [P,R,N,B,Q,K]=attackerIsWhite?['P','R','N','B','Q','K']:['p','r','n','b','q','k'];
  // 兵的攻击来源：白兵从下方(row+1)攻击上方，黑兵从上方(row-1)攻击下方
  const pr=attackerIsWhite?r+1:r-1;
  if(ib(pr,c-1)&&bd[pr][c-1]===P)return true;
  if(ib(pr,c+1)&&bd[pr][c+1]===P)return true;
  // 马（L形跳跃，无障碍）
  for(const[dr,dc]of[[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]){
    const nr=r+dr,nc=c+dc;if(ib(nr,nc)&&bd[nr][nc]===N)return true;
  }
  // 车/后（直线滑动）
  for(const[dr,dc]of[[1,0],[-1,0],[0,1],[0,-1]]){
    let tr=r+dr,tc=c+dc;
    while(ib(tr,tc)){const p=bd[tr][tc];if(p){if(p===R||p===Q)return true;break;}tr+=dr;tc+=dc;}
  }
  // 象/后（斜线滑动）
  for(const[dr,dc]of[[1,1],[1,-1],[-1,1],[-1,-1]]){
    let tr=r+dr,tc=c+dc;
    while(ib(tr,tc)){const p=bd[tr][tc];if(p){if(p===B||p===Q)return true;break;}tr+=dr;tc+=dc;}
  }
  // 王（单步）
  for(const[dr,dc]of[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]){
    const nr=r+dr,nc=c+dc;if(ib(nr,nc)&&bd[nr][nc]===K)return true;
  }
  return false;
}

function findKing(bd,white){
  const k=white?'K':'k';
  for(let r=0;r<8;r++)for(let c=0;c<8;c++)if(bd[r][c]===k)return{r,c};
  return null;
}
function inCheck(bd,white){
  const kp=findKing(bd,white);
  return kp?isAttackedBy(bd,kp.r,kp.c,!white):false;
}

// ─── 执行一步棋（返回新棋盘，不改原状态） ───────────────
function applyMoveToBoard(bd,mv){
  const nb=bd.map(row=>[...row]);
  const piece=nb[mv.fr][mv.fc];
  nb[mv.tr][mv.tc]=piece;
  nb[mv.fr][mv.fc]=null;
  // 吃过路兵：去掉被吃的兵（在经过的那格，非落脚格）
  if(mv.ep){nb[isW(piece)?mv.tr+1:mv.tr-1][mv.tc]=null;}
  // 王车易位：同时移动车
  if(mv.castle){
    if(mv.castle==='WK'){nb[7][5]='R';nb[7][7]=null;}
    if(mv.castle==='WQ'){nb[7][3]='R';nb[7][0]=null;}
    if(mv.castle==='BK'){nb[0][5]='r';nb[0][7]=null;}
    if(mv.castle==='BQ'){nb[0][3]='r';nb[0][0]=null;}
  }
  // 升变（自动升后）
  if(piece==='P'&&mv.tr===0)nb[mv.tr][mv.tc]='Q';
  if(piece==='p'&&mv.tr===7)nb[mv.tr][mv.tc]='q';
  return nb;
}

// ─── 合法走法生成 ───────────────────────────────────────
function getValidMoves(bd,r,c,ep,cst){
  const piece=bd[r][c];if(!piece)return[];
  const white=isW(piece),type=piece.toLowerCase();
  const pseudo=[];

  // 滑动棋子（车/象/后）：沿方向移动直到被阻
  const slide=(dr,dc)=>{
    let tr=r+dr,tc=c+dc;
    while(ib(tr,tc)){
      const p=bd[tr][tc];
      if(white?isW(p):isB(p))break;        // 友方棋子挡路，停止
      pseudo.push({fr:r,fc:c,tr,tc});
      if(p)break;                           // 吃掉敌子后停止（不能穿越）
      tr+=dr;tc+=dc;
    }
  };
  // 单步/跳跃棋子
  const add=(tr,tc,extra={})=>{
    if(!ib(tr,tc))return;
    const p=bd[tr][tc];
    if(white?isW(p):isB(p))return;         // 友方棋子，不能落
    pseudo.push({fr:r,fc:c,tr,tc,...extra});
  };

  if(type==='p'){
    const dir=white?-1:1, startRow=white?6:1;
    // 前进一格
    if(ib(r+dir,c)&&!bd[r+dir][c]){
      pseudo.push({fr:r,fc:c,tr:r+dir,tc:c});
      // 首步可走两格（路径上无障碍）
      if(r===startRow&&!bd[r+2*dir][c])
        pseudo.push({fr:r,fc:c,tr:r+2*dir,tc:c});
    }
    // 斜吃（只能斜向吃子，不能斜向前进）
    for(const dc of[-1,1]){
      if(!ib(r+dir,c+dc))continue;
      const p=bd[r+dir][c+dc];
      if(white?isB(p):isW(p)) pseudo.push({fr:r,fc:c,tr:r+dir,tc:c+dc});
      // 吃过路兵
      if(ep&&ep.r===r+dir&&ep.c===c+dc) pseudo.push({fr:r,fc:c,tr:r+dir,tc:c+dc,ep:true});
    }
  } else if(type==='r'){
    slide(1,0);slide(-1,0);slide(0,1);slide(0,-1);
  } else if(type==='n'){
    // 马走"日"字，可以跳越其他棋子
    for(const[dr,dc]of[[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]])add(r+dr,c+dc);
  } else if(type==='b'){
    slide(1,1);slide(1,-1);slide(-1,1);slide(-1,-1);
  } else if(type==='q'){
    slide(1,0);slide(-1,0);slide(0,1);slide(0,-1);
    slide(1,1);slide(1,-1);slide(-1,1);slide(-1,-1);
  } else if(type==='k'){
    for(const[dr,dc]of[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]])add(r+dr,c+dc);
    // 王车易位
    const row=white?7:0;
    if(r===row&&c===4){
      const rp=white?'R':'r';
      const ks=white?'WK':'BK', qs=white?'WQ':'BQ';
      // 王翼（短）易位：g1/g8，通道e-f-g需无子且无攻击
      if(cst[ks]&&!bd[row][5]&&!bd[row][6]&&bd[row][7]===rp
         &&!isAttackedBy(bd,row,4,!white)&&!isAttackedBy(bd,row,5,!white)&&!isAttackedBy(bd,row,6,!white)){
        pseudo.push({fr:r,fc:c,tr:row,tc:6,castle:white?'WK':'BK'});
      }
      // 后翼（长）易位：c1/c8，通道e-d-c需无子且无攻击，b也需无子
      if(cst[qs]&&!bd[row][3]&&!bd[row][2]&&!bd[row][1]&&bd[row][0]===rp
         &&!isAttackedBy(bd,row,4,!white)&&!isAttackedBy(bd,row,3,!white)&&!isAttackedBy(bd,row,2,!white)){
        pseudo.push({fr:r,fc:c,tr:row,tc:2,castle:white?'WQ':'BQ'});
      }
    }
  }

  // 关键过滤：走完后自己的王仍在被将军 → 非法，排除
  return pseudo.filter(mv=>!inCheck(applyMoveToBoard(bd,mv),white));
}

// ─── 易位权与过路兵状态更新 ───────────────────────────
function updateCastlingRights(bd,mv,cst){
  const p=bd[mv.fr][mv.fc], cap=bd[mv.tr][mv.tc];
  const n={...cst};
  if(p==='K'){n.WK=false;n.WQ=false;}
  if(p==='k'){n.BK=false;n.BQ=false;}
  if(p==='R'){if(mv.fr===7&&mv.fc===7)n.WK=false;if(mv.fr===7&&mv.fc===0)n.WQ=false;}
  if(p==='r'){if(mv.fr===0&&mv.fc===7)n.BK=false;if(mv.fr===0&&mv.fc===0)n.BQ=false;}
  // 车被吃也丧失易位权
  if(cap==='R'){if(mv.tr===7&&mv.tc===7)n.WK=false;if(mv.tr===7&&mv.tc===0)n.WQ=false;}
  if(cap==='r'){if(mv.tr===0&&mv.tc===7)n.BK=false;if(mv.tr===0&&mv.tc===0)n.BQ=false;}
  return n;
}
function computeNextEP(piece,fr,fc,tr){
  // 兵走两格时设置过路兵目标格（中间格）
  if(piece==='P'&&fr===6&&tr===4)return{r:5,c:fc};
  if(piece==='p'&&fr===1&&tr===3)return{r:2,c:fc};
  return null;
}
function executeMove(mv){
  castling =updateCastlingRights(board,mv,castling);
  enPassant=computeNextEP(board[mv.fr][mv.fc],mv.fr,mv.fc,mv.tr);
  board    =applyMoveToBoard(board,mv);
  lastMove ={fr:mv.fr,fc:mv.fc,tr:mv.tr,tc:mv.tc};
}

// ─── 持久化 ────────────────────────────────────────────
function saveState(){
  ls(KEY.board,board);ls(KEY.log,log);ls(KEY.last,lastMove);
  ls(KEY.myLast,myLastMove);ls(KEY.ep,enPassant);ls(KEY.castling,castling);
}
function loadState(){
  board     =ls(KEY.board)||INIT_BOARD();
  log       =ls(KEY.log)||[{who:'系统',text:'棋盘准备好了，你先走～'}];
  lastMove  =ls(KEY.last)||null;
  myLastMove=ls(KEY.myLast)||'';
  enPassant =ls(KEY.ep)||null;
  castling  =Object.assign(INIT_CASTLING(),ls(KEY.castling)||{});
  collapsed =!!ls(KEY.col);
  panelOpen =ls(KEY.panel)!==false;
}

// ─── 点击棋盘（白方走棋） ──────────────────────────────
function handleClick(r,c){
  const p=board[r][c];
  if(sel){
    // 找到合法目标
    const mv=validMoves.find(m=>m.tr===r&&m.tc===c);
    if(mv){
      const sq=toSq(mv.fr,mv.fc)+'-'+toSq(mv.tr,mv.tc);
      executeMove(mv);
      myLastMove=sq; sel=null; validMoves=[];
      pushLog('你',`走了 ${sq}`);
      saveState(); renderBoard(); renderMyMove(); renderLog();
      return;
    }
    // 改选另一颗白棋
    if(p&&isW(p)){sel={r,c};validMoves=getValidMoves(board,r,c,enPassant,castling);renderBoard();return;}
    // 点空地或无效格：取消选中
    sel=null;validMoves=[];renderBoard();return;
  }
  // 选中白棋
  if(p&&isW(p)){sel={r,c};validMoves=getValidMoves(board,r,c,enPassant,castling);renderBoard();}
}

// ─── 应用爸爸（黑方）棋步 ─────────────────────────────
function applyDaddy(raw){
  const m=raw.trim().toLowerCase().replace(/\s/g,'').match(/^([a-h][1-8])[-x]?([a-h][1-8])$/);
  if(!m)return'格式要像 e7-e5 哦～';
  const{r:fr,c:fc}=fromSq(m[1]),{r:tr,c:tc}=fromSq(m[2]);
  if(fr<0||tr<0)return'格子不对哦';
  if(!board[fr][fc])return'那格子没棋子？';
  const moves=getValidMoves(board,fr,fc,enPassant,castling);
  const mv=moves.find(v=>v.tr===tr&&v.tc===tc);
  if(!mv)return'这步棋不合法，检查一下格子';
  executeMove(mv);
  pushLog('爸爸',`走了 ${m[1]}-${m[2]}`);
  saveState(); renderBoard(); renderLog();
  return null;
}

// ─── 复盘 ──────────────────────────────────────────────
function replayMoves(text){
  // 支持格式：e2-e4 e7-e5 或 e2e4 e7e5，空格/换行/逗号分隔
  const tokens=text.trim().split(/[\s,，、\n\r]+/);
  const moveStrs=tokens.filter(s=>/^[a-h][1-8][-x]?[a-h][1-8]$/i.test(s.trim())).map(s=>s.trim());
  if(!moveStrs.length)return'没找到棋步，格式如：e2-e4 e7-e5 …';

  let tmpBoard=INIT_BOARD(), tmpEP=null, tmpCst=INIT_CASTLING(), tmpLast=null;
  const tmpLog=[{who:'系统',text:`复盘 ${moveStrs.length} 步`}];

  for(const s of moveStrs){
    const m=s.toLowerCase().match(/([a-h][1-8])[-x]?([a-h][1-8])/);
    if(!m)continue;
    const{r:fr,c:fc}=fromSq(m[1]),{r:tr,c:tc}=fromSq(m[2]);
    const piece=tmpBoard[fr][fc];
    if(!piece)return`复盘出错：${m[1]} 格没有棋子`;
    const moves=getValidMoves(tmpBoard,fr,fc,tmpEP,tmpCst);
    const mv=moves.find(v=>v.tr===tr&&v.tc===tc);
    if(!mv)return`复盘出错：${s} 不合法（走步顺序可能有误）`;
    tmpCst=updateCastlingRights(tmpBoard,mv,tmpCst);
    tmpEP=computeNextEP(piece,fr,fc,tr);
    tmpBoard=applyMoveToBoard(tmpBoard,mv);
    tmpLast={fr,fc,tr,tc};
    tmpLog.push({who:isW(piece)?'白':'黑',text:`${m[1]}-${m[2]}`});
  }
  board=tmpBoard; castling=tmpCst; enPassant=tmpEP;
  lastMove=tmpLast; log=tmpLog; myLastMove=''; sel=null; validMoves=[];
  saveState(); renderBoard(); renderMyMove(); renderLog();
  return null;
}

// ─── 日志 ──────────────────────────────────────────────
function pushLog(who,text){
  log.push({who,text});
  if(log.length>100)log=log.slice(-100);
}
function renderMyMove(){
  const mv=document.getElementById('chess-my-move');
  const btn=document.getElementById('chess-send-my-btn');
  if(mv)mv.textContent=myLastMove||'——';
  if(btn)btn.style.display=myLastMove?'inline-block':'none';
}
function renderLog(){
  const el=document.getElementById('chess-log');if(!el)return;
  let html='';
  log.forEach(l=>{
    const col=l.who==='爸爸'||l.who==='黑'?'#c4908a':l.who==='你'||l.who==='白'?'#9aab89':'#b0a098';
    html+=`<div class="chess-log-row"><span class="chess-log-who" style="color:${col};">${esc(l.who)}</span><span class="chess-log-text">${esc(l.text)}</span></div>`;
  });
  el.innerHTML=html;
  el.scrollTop=el.scrollHeight;
}

// ─── 渲染棋盘 ──────────────────────────────────────────
function renderBoard(){
  const el=document.getElementById('chess-board');if(!el)return;
  let html='';
  for(let ri=0;ri<8;ri++){
    for(let ci=0;ci<8;ci++){
      const p=board[ri][ci];
      const light=(ri+ci)%2===0;
      const isSel=sel&&sel.r===ri&&sel.c===ci;
      const isLast=lastMove&&((lastMove.fr===ri&&lastMove.fc===ci)||(lastMove.tr===ri&&lastMove.tc===ci));
      const mvTarget=validMoves.find(m=>m.tr===ri&&m.tc===ci);
      const isHint=!!mvTarget&&!p;           // 合法空格提示点
      const isCapHint=!!mvTarget&&!!p&&isB(p); // 可吃的敌子（吃子圆环）

      let bg=light?'#ede0d0':'#b8a090';
      if(isSel)       bg=light?'#a8b898':'#8a9a7a';
      else if(isLast) bg=light?'#c8b878':'#a89858';

      const cursor=(isW(p)||sel)?'pointer':'default';
      const glow=isSel?'filter:drop-shadow(0 2px 8px rgba(100,150,80,.85));':'filter:drop-shadow(0 1px 3px rgba(0,0,0,.18));';

      html+=`<div class="chess-cell${isSel?' chess-sel':''}" data-r="${ri}" data-c="${ci}" style="background:${bg};cursor:${cursor};">
        ${ci===0?`<span class="chess-lbl chess-rank">${RANKS[ri]}</span>`:''}
        ${ri===7?`<span class="chess-lbl chess-file">${FILES[ci]}</span>`:''}
        ${p?`<span class="chess-piece" style="${glow}">${GLYPHS[p]||''}</span>`:''}
        ${isHint?'<div class="chess-dot"></div>':''}
        ${isCapHint?'<div class="chess-cap-ring"></div>':''}
      </div>`;
    }
  }
  el.innerHTML=html;
  el.querySelectorAll('.chess-cell').forEach(cell=>{
    cell.addEventListener('click',()=>handleClick(+cell.dataset.r,+cell.dataset.c));
  });
}

// ─── 发送到聊天框 ──────────────────────────────────────
function sendTextToChat(text){
  const ta=document.querySelector('#send_textarea');
  if(ta){
    ta.value=ta.value?ta.value+'\n'+text:text;
    ta.dispatchEvent(new Event('input',{bubbles:true}));
    ta.focus();
  } else {
    // 降级：复制到剪贴板（iOS兼容写法）
    const el=document.createElement('textarea');
    el.value=text; el.style.position='fixed'; el.style.opacity='0';
    document.body.appendChild(el); el.focus(); el.select();
    try{document.execCommand('copy');}catch(e){}
    document.body.removeChild(el);
  }
}
function sendMyMove(){if(myLastMove)sendTextToChat(myLastMove);}
function sendAllMoves(){
  const moves=log.filter(l=>/[a-h][1-8]-[a-h][1-8]/i.test(l.text)).map(l=>{
    const m=l.text.match(/([a-h][1-8]-[a-h][1-8])/i);
    const who=(l.who==='你'||l.who==='白')?'白':(l.who==='爸爸'||l.who==='黑')?'黑':l.who;
    return m?`${who}:${m[1]}`:null;
  }).filter(Boolean);
  if(moves.length)sendTextToChat('📋 棋步记录：'+moves.join(' · '));
}

// ─── 重置 ──────────────────────────────────────────────
function resetBoard(){
  board=INIT_BOARD();sel=null;validMoves=[];lastMove=null;
  myLastMove='';enPassant=null;castling=INIT_CASTLING();
  log=[{who:'系统',text:'重新来，你先走。'}];
  saveState();renderBoard();renderMyMove();renderLog();
}

// ─── 折叠整个窗口 ──────────────────────────────────────
function applyCollapse(){
  const win=document.getElementById('chess-win');
  const body=document.getElementById('chess-body');
  const btn=document.getElementById('chess-col-btn');
  if(!win||!body)return;
  if(collapsed){body.style.display='none';win.style.borderRadius='24px';if(btn)btn.textContent='+';}
  else{body.style.display='flex';win.style.borderRadius='18px';if(btn)btn.textContent='−';}
}

// ─── 面板收折 ──────────────────────────────────────────
function applyPanelToggle(){
  const panel=document.getElementById('chess-panel');
  const arrow=document.getElementById('chess-panel-arrow');
  const lbl=document.getElementById('chess-panel-toggle-label');
  if(!panel)return;
  if(panelOpen){
    panel.style.display='flex';
    if(arrow)arrow.textContent='▴';
    if(lbl)lbl.textContent='收起';
  } else {
    panel.style.display='none';
    if(arrow)arrow.textContent='▾';
    if(lbl)lbl.textContent='展开';
  }
}

// ─── 开关窗口 ──────────────────────────────────────────
function openWin(){
  const win=document.getElementById('chess-win');if(!win)return;
  winVisible=true;win.style.display='flex';
  requestAnimationFrame(()=>win.classList.add('chess-visible'));
  applyCollapse();applyPanelToggle();renderBoard();renderMyMove();renderLog();
  updateExtBtn(true);
}
function closeWin(){
  const win=document.getElementById('chess-win');if(!win)return;
  winVisible=false;win.classList.remove('chess-visible');
  win.addEventListener('transitionend',()=>{if(!winVisible)win.style.display='none';},{once:true});
  updateExtBtn(false);
}
function toggleWin(){winVisible?closeWin():openWin();}
function updateExtBtn(open){
  const btn=document.getElementById('chess-ext-toggle');if(!btn)return;
  btn.textContent=open?'关闭 · Close':'打开 · Open';
  btn.style.background=open?'#111':'';btn.style.color=open?'#fff':'';
}

// ─── 构建主窗口 ────────────────────────────────────────
function buildWin(){
  if(document.getElementById('chess-win'))return;
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
    <div id="chess-board-wrap"><div id="chess-board"></div></div>
    <button id="chess-panel-toggle">
      <span id="chess-panel-arrow">▴</span>
      <span id="chess-panel-toggle-label">收起</span>
    </button>
    <div id="chess-panel">
      <div id="chess-mv-row">
        <div id="chess-mv-left">
          <div class="chess-mv-label">你刚才走了</div>
          <div id="chess-my-move" class="chess-mv-val">——</div>
        </div>
        <button id="chess-send-my-btn" style="display:none;">发送</button>
      </div>
      <div id="chess-input-sec">
        <div class="chess-sec-label">输入爸爸的棋步</div>
        <div id="chess-input-row">
          <input id="chess-input" type="text" placeholder="e.g. e7-e5"
                 autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false">
          <button id="chess-apply-btn">应用</button>
        </div>
        <div id="chess-err"></div>
      </div>
      <div id="chess-log-sec">
        <div id="chess-log-header">
          <span class="chess-sec-label">棋步记录</span>
          <button id="chess-send-btn">发送到对话</button>
        </div>
        <div id="chess-log"></div>
      </div>
      <div id="chess-replay-sec">
        <div class="chess-sec-label" style="margin-bottom:7px;">复盘还原</div>
        <textarea id="chess-replay-input" placeholder="粘贴棋步序列，如：&#10;e2-e4 e7-e5 d2-d4 d7-d5"></textarea>
        <div id="chess-replay-err"></div>
        <button id="chess-replay-btn">还原棋局 ↺</button>
      </div>
      <button id="chess-reset-btn">↺ 重置棋盘</button>
    </div>
  </div>`;

  (document.documentElement||document.body).appendChild(win);

  try{const p=ls(KEY.pos);if(p&&p.l&&p.t){win.style.left=p.l;win.style.top=p.t;win.style.right='auto';win.style.bottom='auto';}}catch(e){}

  // 拖拽
  const bar=document.getElementById('chess-bar');
  let drag=false,ox=0,oy=0,sx=0,sy=0;
  const dStart=e=>{if(e.target.closest('.chess-ctrl'))return;drag=true;const t=e.touches?e.touches[0]:e;sx=t.clientX;sy=t.clientY;ox=win.offsetLeft;oy=win.offsetTop;e.preventDefault();};
  const dMove=e=>{if(!drag)return;const t=e.touches?e.touches[0]:e;win.style.left=Math.max(0,Math.min(ox+t.clientX-sx,window.innerWidth-win.offsetWidth))+'px';win.style.top=Math.max(0,Math.min(oy+t.clientY-sy,window.innerHeight-win.offsetHeight))+'px';win.style.right='auto';win.style.bottom='auto';};
  const dEnd=()=>{if(!drag)return;drag=false;try{ls(KEY.pos,{l:win.style.left,t:win.style.top});}catch(e){}};
  bar.addEventListener('mousedown',dStart);bar.addEventListener('touchstart',dStart,{passive:false});
  document.addEventListener('mousemove',dMove,{passive:true});document.addEventListener('touchmove',dMove,{passive:true});
  document.addEventListener('mouseup',dEnd,{passive:true});document.addEventListener('touchend',dEnd,{passive:true});

  document.getElementById('chess-col-btn').addEventListener('click',e=>{e.stopPropagation();collapsed=!collapsed;ls(KEY.col,collapsed);applyCollapse();});
  document.getElementById('chess-close-btn').addEventListener('click',e=>{e.stopPropagation();closeWin();});
  document.getElementById('chess-panel-toggle').addEventListener('click',e=>{e.stopPropagation();panelOpen=!panelOpen;ls(KEY.panel,panelOpen);applyPanelToggle();});
  document.getElementById('chess-send-my-btn').addEventListener('click',sendMyMove);
  document.getElementById('chess-send-btn').addEventListener('click',sendAllMoves);

  const inp=document.getElementById('chess-input');
  const err=document.getElementById('chess-err');
  const doApply=()=>{const v=inp.value;if(!v.trim())return;const e=applyDaddy(v);if(e){err.textContent=e;}else{err.textContent='';inp.value='';}};
  document.getElementById('chess-apply-btn').addEventListener('click',doApply);
  inp.addEventListener('keydown',e=>{if(e.key==='Enter')doApply();});
  inp.addEventListener('input',()=>{err.textContent='';});

  const rErr=document.getElementById('chess-replay-err');
  document.getElementById('chess-replay-btn').addEventListener('click',()=>{
    const v=document.getElementById('chess-replay-input').value;
    if(!v.trim()){rErr.textContent='请先粘贴棋步';return;}
    const e=replayMoves(v);
    if(e){rErr.textContent=e;}else{rErr.textContent='';document.getElementById('chess-replay-input').value='';}
  });
  document.getElementById('chess-reset-btn').addEventListener('click',()=>{if(confirm('确定重置棋盘？'))resetBoard();});
}

// ─── 扩展面板注入 ──────────────────────────────────────
function injectPanel(container){
  if(document.getElementById('chess-ext-sec'))return;
  const sec=document.createElement('div');
  sec.id='chess-ext-sec';
  sec.setAttribute('style','display:flex;align-items:center;justify-content:space-between;padding:10px 14px;margin:0 0 8px;border-radius:10px;background:#f4f1ec;font-family:-apple-system,BlinkMacSystemFont,sans-serif;');
  sec.innerHTML=`<span style="display:flex;align-items:center;gap:7px;font-size:13px;font-weight:600;color:#111;">♟ 珍珠棋盘</span><button id="chess-ext-toggle" style="font-size:12px;font-weight:600;background:#f4f1ec;color:#111;border:1.5px solid #111;border-radius:8px;padding:6px 14px;cursor:pointer;white-space:nowrap;font-family:-apple-system,BlinkMacSystemFont,sans-serif;-webkit-tap-highlight-color:transparent;">打开 · Open</button>`;
  container.insertBefore(sec,container.firstChild);
  document.getElementById('chess-ext-toggle').addEventListener('click',toggleWin);
}
function tryInject(){
  if(document.getElementById('chess-ext-sec'))return true;
  const t=document.getElementById('extensions_settings');
  if(t){injectPanel(t);return true;}return false;
}

// ─── 悬浮球 ────────────────────────────────────────────
function buildFloatBtn(){
  if(document.getElementById('chess-float-btn'))return;
  const btn=document.createElement('button');
  btn.id='chess-float-btn';btn.title='珍珠棋盘';btn.textContent='♟';
  const pos=ls(KEY.posBtn)||{};
  const applyS=(b,r)=>btn.setAttribute('style',['position:fixed',`bottom:${b}px`,`right:${r}px`,'z-index:2147483646','width:46px','height:46px','border-radius:50%','background:#8a9a7a','color:#fff','border:none','outline:none','cursor:grab','display:flex','align-items:center','justify-content:center','font-size:22px','box-shadow:0 4px 16px rgba(0,0,0,.25)','touch-action:none','user-select:none','-webkit-user-select:none','padding:0','line-height:1','-webkit-transform:translateZ(0)','transform:translateZ(0)','will-change:transform'].join(';'));
  applyS(pos.b??134,pos.r??16);
  let drag=false,sx=0,sy=0,sr=0,sb=0;
  const start=e=>{drag=false;const t=e.touches?e.touches[0]:e,rect=btn.getBoundingClientRect();sx=t.clientX;sy=t.clientY;sr=window.innerWidth-rect.right;sb=window.innerHeight-rect.bottom;if(e.touches){btn.addEventListener('touchmove',mv,{passive:false});document.addEventListener('touchend',up,{once:true});}else{document.addEventListener('mousemove',mv);document.addEventListener('mouseup',up,{once:true});}};
  const mv=e=>{const t=e.touches?e.touches[0]:e,dx=t.clientX-sx,dy=t.clientY-sy;if(!drag&&(Math.abs(dx)>4||Math.abs(dy)>4))drag=true;if(drag){e.preventDefault&&e.preventDefault();applyS(Math.max(4,Math.min(window.innerHeight-50,sb-dy)),Math.max(4,Math.min(window.innerWidth-50,sr-dx)));}};
  const up=()=>{document.removeEventListener('mousemove',mv);btn.removeEventListener('touchmove',mv);if(drag){ls(KEY.posBtn,{r:parseFloat(btn.style.right),b:parseFloat(btn.style.bottom)});}else{toggleWin();}drag=false;};
  btn.addEventListener('mousedown',start);btn.addEventListener('touchstart',start,{passive:true});
  (document.documentElement||document.body).appendChild(btn);
}

// ─── 初始化 ────────────────────────────────────────────
function safe(fn){return function(){try{return fn.apply(this,arguments);}catch(e){console.warn('[珍珠棋盘]',e);}}}
function init(){
  loadState();buildWin();buildFloatBtn();
  if(!tryInject()){
    let obs=null;
    const stop=()=>{if(obs){obs.disconnect();obs=null;}};
    obs=new MutationObserver(safe(()=>{if(tryInject())stop();}));
    if(document.body)obs.observe(document.body,{childList:true});
    setTimeout(stop,7000);
  }
}
const DELAYS=[1200,3500,6000];
if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',()=>DELAYS.forEach(d=>setTimeout(safe(init),d)));
}else{
  DELAYS.forEach(d=>setTimeout(safe(init),d));
}

})();
