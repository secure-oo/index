// 珍珠棋盘 · v4.0
'use strict';
(function(){

const FILES=['a','b','c','d','e','f','g','h'];
const RANKS=['8','7','6','5','4','3','2','1'];
const GLYPHS={'K':'♔','Q':'♕','R':'♖','B':'♗','N':'♘','P':'♙','k':'♚','q':'♛','r':'♜','b':'♝','n':'♞','p':'♟'};
const INIT_BOARD=()=>[
  ['r','n','b','q','k','b','n','r'],['p','p','p','p','p','p','p','p'],
  [null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null],
  [null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null],
  ['P','P','P','P','P','P','P','P'],['R','N','B','Q','K','B','N','R'],
];
const INIT_CAST=()=>({WK:true,WQ:true,BK:true,BQ:true});

const KEY={
  board:'cb_board_v4',log:'cb_log_v4',last:'cb_last_v4',myLast:'cb_mylast_v4',
  ep:'cb_ep_v4',castling:'cb_cast_v4',captured:'cb_cap_v4',
  myColor:'cb_color_v4',history:'cb_hist_v4',
  pos:'cb_pos_v1',posBtn:'cb_posBtn_v1',col:'cb_col_v1',panel:'cb_panel_v1',replay:'cb_replay_v1',
};

// ── 状态 ──
let board=INIT_BOARD(),sel=null,validMoves=[],lastMove=null,myLastMove='';
let enPassant=null,castling=INIT_CAST();
let log=[],captured={mine:[],theirs:[]};
let myColor='W'; // 'W'白 or 'B'黑
let colorChosen=false;
let history=[]; // 状态快照栈，用于反悔
let winVisible=false,collapsed=false,panelOpen=true,replayOpen=false;

// ── 工具 ──
function ls(k,v){if(v===undefined){try{return JSON.parse(localStorage.getItem(k));}catch{return null;}}try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function isW(p){return!!(p&&p===p.toUpperCase());}
function isB(p){return!!(p&&p===p.toLowerCase());}
function isMine(p){return myColor==='W'?isW(p):isB(p);}
function isTheirs(p){return myColor==='W'?isB(p):isW(p);}
function toSq(r,c){return FILES[c]+RANKS[r];}
function fromSq(sq){return{r:RANKS.indexOf(sq[1]),c:FILES.indexOf(sq[0])};}
function ib(r,c){return r>=0&&r<8&&c>=0&&c<8;}

// ── 攻击检测 ──
function isAttackedBy(bd,r,c,atkW){
  const[P,R,N,B,Q,K]=atkW?['P','R','N','B','Q','K']:['p','r','n','b','q','k'];
  const pr=atkW?r+1:r-1;
  if(ib(pr,c-1)&&bd[pr][c-1]===P)return true;
  if(ib(pr,c+1)&&bd[pr][c+1]===P)return true;
  for(const[dr,dc]of[[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]){const nr=r+dr,nc=c+dc;if(ib(nr,nc)&&bd[nr][nc]===N)return true;}
  for(const[dr,dc]of[[1,0],[-1,0],[0,1],[0,-1]]){let tr=r+dr,tc=c+dc;while(ib(tr,tc)){const p=bd[tr][tc];if(p){if(p===R||p===Q)return true;break;}tr+=dr;tc+=dc;}}
  for(const[dr,dc]of[[1,1],[1,-1],[-1,1],[-1,-1]]){let tr=r+dr,tc=c+dc;while(ib(tr,tc)){const p=bd[tr][tc];if(p){if(p===B||p===Q)return true;break;}tr+=dr;tc+=dc;}}
  for(const[dr,dc]of[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]){const nr=r+dr,nc=c+dc;if(ib(nr,nc)&&bd[nr][nc]===K)return true;}
  return false;
}
function findKing(bd,w){const k=w?'K':'k';for(let r=0;r<8;r++)for(let c=0;c<8;c++)if(bd[r][c]===k)return{r,c};return null;}
function inCheck(bd,w){const kp=findKing(bd,w);return kp?isAttackedBy(bd,kp.r,kp.c,!w):false;}

// ── 执行走步 ──
function applyMoveToBoard(bd,mv){
  const nb=bd.map(row=>[...row]);
  const piece=nb[mv.fr][mv.fc];
  nb[mv.tr][mv.tc]=piece;nb[mv.fr][mv.fc]=null;
  if(mv.ep){nb[isW(piece)?mv.tr+1:mv.tr-1][mv.tc]=null;}
  if(mv.castle==='WK'){nb[7][5]='R';nb[7][7]=null;}
  if(mv.castle==='WQ'){nb[7][3]='R';nb[7][0]=null;}
  if(mv.castle==='BK'){nb[0][5]='r';nb[0][7]=null;}
  if(mv.castle==='BQ'){nb[0][3]='r';nb[0][0]=null;}
  if(piece==='P'&&mv.tr===0)nb[mv.tr][mv.tc]='Q';
  if(piece==='p'&&mv.tr===7)nb[mv.tr][mv.tc]='q';
  return nb;
}

// ── 合法走法 ──
function getValidMoves(bd,r,c,ep,cst){
  const piece=bd[r][c];if(!piece)return[];
  const white=isW(piece),type=piece.toLowerCase(),pseudo=[];
  const slide=(dr,dc)=>{let tr=r+dr,tc=c+dc;while(ib(tr,tc)){const p=bd[tr][tc];if(white?isW(p):isB(p))break;pseudo.push({fr:r,fc:c,tr,tc});if(p)break;tr+=dr;tc+=dc;}};
  const add=(tr,tc,extra={})=>{if(!ib(tr,tc))return;const p=bd[tr][tc];if(white?isW(p):isB(p))return;pseudo.push({fr:r,fc:c,tr,tc,...extra});};
  if(type==='p'){
    const dir=white?-1:1,startRow=white?6:1;
    if(ib(r+dir,c)&&!bd[r+dir][c]){
      pseudo.push({fr:r,fc:c,tr:r+dir,tc:c});
      if(r===startRow&&!bd[r+2*dir][c])pseudo.push({fr:r,fc:c,tr:r+2*dir,tc:c});
    }
    for(const dc of[-1,1]){
      if(!ib(r+dir,c+dc))continue;
      const p=bd[r+dir][c+dc];
      if(white?isB(p):isW(p))pseudo.push({fr:r,fc:c,tr:r+dir,tc:c+dc});
      if(ep&&ep.r===r+dir&&ep.c===c+dc)pseudo.push({fr:r,fc:c,tr:r+dir,tc:c+dc,ep:true});
    }
  } else if(type==='r'){slide(1,0);slide(-1,0);slide(0,1);slide(0,-1);}
  else if(type==='n'){for(const[dr,dc]of[[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]])add(r+dr,c+dc);}
  else if(type==='b'){slide(1,1);slide(1,-1);slide(-1,1);slide(-1,-1);}
  else if(type==='q'){slide(1,0);slide(-1,0);slide(0,1);slide(0,-1);slide(1,1);slide(1,-1);slide(-1,1);slide(-1,-1);}
  else if(type==='k'){
    for(const[dr,dc]of[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]])add(r+dr,c+dc);
    const row=white?7:0;
    const rp=white?'R':'r',ks=white?'WK':'BK',qs=white?'WQ':'BQ';
    if(r===row&&c===4){
      if(cst[ks]&&!bd[row][5]&&!bd[row][6]&&bd[row][7]===rp&&!isAttackedBy(bd,row,4,!white)&&!isAttackedBy(bd,row,5,!white)&&!isAttackedBy(bd,row,6,!white))
        pseudo.push({fr:r,fc:c,tr:row,tc:6,castle:white?'WK':'BK'});
      if(cst[qs]&&!bd[row][3]&&!bd[row][2]&&!bd[row][1]&&bd[row][0]===rp&&!isAttackedBy(bd,row,4,!white)&&!isAttackedBy(bd,row,3,!white)&&!isAttackedBy(bd,row,2,!white))
        pseudo.push({fr:r,fc:c,tr:row,tc:2,castle:white?'WQ':'BQ'});
    }
  }
  return pseudo.filter(mv=>!inCheck(applyMoveToBoard(bd,mv),white));
}

function updCast(bd,mv,cst){
  const p=bd[mv.fr][mv.fc],cap=bd[mv.tr][mv.tc],n={...cst};
  if(p==='K'){n.WK=false;n.WQ=false;}if(p==='k'){n.BK=false;n.BQ=false;}
  if(p==='R'){if(mv.fr===7&&mv.fc===7)n.WK=false;if(mv.fr===7&&mv.fc===0)n.WQ=false;}
  if(p==='r'){if(mv.fr===0&&mv.fc===7)n.BK=false;if(mv.fr===0&&mv.fc===0)n.BQ=false;}
  if(cap==='R'){if(mv.tr===7&&mv.tc===7)n.WK=false;if(mv.tr===7&&mv.tc===0)n.WQ=false;}
  if(cap==='r'){if(mv.tr===0&&mv.tc===7)n.BK=false;if(mv.tr===0&&mv.tc===0)n.BQ=false;}
  return n;
}
function nextEP(piece,fr,fc,tr){
  if(piece==='P'&&fr===6&&tr===4)return{r:5,c:fc};
  if(piece==='p'&&fr===1&&tr===3)return{r:2,c:fc};
  return null;
}

// ── 快照（反悔用） ──
function snapshot(){
  return{board:board.map(r=>[...r]),log:[...log],lastMove,myLastMove,
    enPassant,castling:{...castling},captured:{mine:[...captured.mine],theirs:[...captured.theirs]}};
}
function pushHistory(){
  history.push(snapshot());
  if(history.length>20)history.shift();
  ls(KEY.history,history);
}
function undoLast(){
  if(!history.length)return;
  const s=history.pop();
  board=s.board;log=s.log;lastMove=s.lastMove;myLastMove=s.myLastMove;
  enPassant=s.enPassant;castling=s.castling;captured=s.captured;
  sel=null;validMoves=[];
  ls(KEY.history,history);saveState();
  renderAll();
}

// ── 执行一步（含快照） ──
function executeMove(mv,isMineMove){
  pushHistory();
  const piece=board[mv.fr][mv.fc];
  // 被吃子
  let capPiece=board[mv.tr][mv.tc];
  if(mv.ep)capPiece=isW(piece)?board[mv.tr+1][mv.tc]:board[mv.tr-1][mv.tc];
  if(capPiece){
    if(isMineMove)captured.mine.push(capPiece);
    else captured.theirs.push(capPiece);
  }
  castling=updCast(board,mv,castling);
  enPassant=nextEP(piece,mv.fr,mv.fc,mv.tr);
  board=applyMoveToBoard(board,mv);
  lastMove={fr:mv.fr,fc:mv.fc,tr:mv.tr,tc:mv.tc};
}

// ── 持久化 ──
function saveState(){
  ls(KEY.board,board);ls(KEY.log,log);ls(KEY.last,lastMove);ls(KEY.myLast,myLastMove);
  ls(KEY.ep,enPassant);ls(KEY.castling,castling);ls(KEY.captured,captured);
}
function loadState(){
  const chosen=ls(KEY.myColor);
  if(chosen){myColor=chosen;colorChosen=true;}
  board=ls(KEY.board)||INIT_BOARD();
  log=ls(KEY.log)||[];
  lastMove=ls(KEY.last)||null;myLastMove=ls(KEY.myLast)||'';
  enPassant=ls(KEY.ep)||null;
  castling=Object.assign(INIT_CAST(),ls(KEY.castling)||{});
  const cap=ls(KEY.captured);
  captured=cap&&cap.mine?cap:{mine:[],theirs:[]};
  history=ls(KEY.history)||[];
  collapsed=!!ls(KEY.col);panelOpen=ls(KEY.panel)!==false;replayOpen=!!ls(KEY.replay);
}

// ── 颜色选择 ──
function chooseColor(c){
  myColor=c;colorChosen=true;
  ls(KEY.myColor,c);
  const ov=document.getElementById('chess-color-overlay');
  if(ov)ov.style.display='none';
  renderAll();
}

// ── 点击棋盘 ──
function handleClick(r,c){
  if(!colorChosen)return;
  const p=board[r][c];
  if(sel){
    const mv=validMoves.find(m=>m.tr===r&&m.tc===c);
    if(mv){
      const sq=toSq(mv.fr,mv.fc)+'-'+toSq(mv.tr,mv.tc);
      const capPiece=board[mv.tr][mv.tc]||(mv.ep?(isW(board[mv.fr][mv.fc])?board[mv.tr+1][mv.tc]:board[mv.tr-1][mv.tc]):null);
      const capNote=capPiece?` 吃${GLYPHS[capPiece]}`:'';
      executeMove(mv,true);
      myLastMove=sq;sel=null;validMoves=[];
      log.push({who:'你',text:`${sq}${capNote}`});
      saveState();renderAll();return;
    }
    if(p&&isMine(p)){sel={r,c};validMoves=getValidMoves(board,r,c,enPassant,castling);renderBoard();return;}
    sel=null;validMoves=[];renderBoard();return;
  }
  if(p&&isMine(p)){sel={r,c};validMoves=getValidMoves(board,r,c,enPassant,castling);renderBoard();}
}

// ── 爸爸棋步 ──
function applyDaddy(raw){
  const m=raw.trim().toLowerCase().replace(/\s/g,'').match(/^([a-h][1-8])[-x]?([a-h][1-8])$/);
  if(!m)return'格式要像 e7-e5 哦～';
  const{r:fr,c:fc}=fromSq(m[1]),{r:tr,c:tc}=fromSq(m[2]);
  if(fr<0||tr<0)return'格子不对哦';
  if(!board[fr][fc])return'那格子没棋子？';
  const theirPiece=board[fr][fc];
  if(myColor==='W'?isW(theirPiece):isB(theirPiece))return'那是你的棋子哦';
  const moves=getValidMoves(board,fr,fc,enPassant,castling);
  const mv=moves.find(v=>v.tr===tr&&v.tc===tc);
  if(!mv)return'这步棋不合法，检查格子和顺序';
  const capPiece=board[mv.tr][mv.tc]||(mv.ep?(isW(theirPiece)?board[mv.tr+1][mv.tc]:board[mv.tr-1][mv.tc]):null);
  const capNote=capPiece?` 吃${GLYPHS[capPiece]}`:'';
  executeMove(mv,false);
  log.push({who:'爸爸',text:`${m[1]}-${m[2]}${capNote}`});
  saveState();renderAll();return null;
}

// ── 复盘 ──
function replayMoves(text){
  const tokens=text.trim().split(/[\s,，、\n\r]+/);
  const strs=tokens.filter(s=>/^[a-h][1-8][-x]?[a-h][1-8]$/i.test(s.trim())).map(s=>s.trim());
  if(!strs.length)return'没找到棋步，格式如：e2-e4 e7-e5';
  let tmpB=INIT_BOARD(),tmpEP=null,tmpC=INIT_CAST(),tmpL=null;
  const tmpLog=[{who:'系统',text:`复盘 ${strs.length} 步`}];
  const tmpCap={mine:[],theirs:[]};
  let turn=0;// 0=白方先
  for(const s of strs){
    const m=s.toLowerCase().match(/([a-h][1-8])[-x]?([a-h][1-8])/);
    if(!m)continue;
    const{r:fr,c:fc}=fromSq(m[1]),{r:tr,c:tc}=fromSq(m[2]);
    const piece=tmpB[fr][fc];
    if(!piece)return`复盘出错：${m[1]} 没棋子`;
    const moves=getValidMoves(tmpB,fr,fc,tmpEP,tmpC);
    const mv=moves.find(v=>v.tr===tr&&v.tc===tc);
    if(!mv)return`复盘出错：${s} 不合法`;
    const capP=tmpB[tr][tc];
    if(capP){isW(piece)?tmpCap.mine.push(capP):tmpCap.theirs.push(capP);}
    tmpC=updCast(tmpB,mv,tmpC);tmpEP=nextEP(piece,fr,fc,tr);
    tmpB=applyMoveToBoard(tmpB,mv);tmpL={fr,fc,tr,tc};
    tmpLog.push({who:isW(piece)?'白':'黑',text:`${m[1]}-${m[2]}${capP?' 吃'+GLYPHS[capP]:''}`});
    turn++;
  }
  board=tmpB;castling=tmpC;enPassant=tmpEP;lastMove=tmpL;
  log=tmpLog;myLastMove='';captured=tmpCap;history=[];sel=null;validMoves=[];
  saveState();ls(KEY.history,[]);renderAll();return null;
}

// ── 重置 ──
function resetBoard(){
  board=INIT_BOARD();sel=null;validMoves=[];lastMove=null;myLastMove='';
  enPassant=null;castling=INIT_CAST();log=[];captured={mine:[],theirs:[]};
  history=[];colorChosen=false;
  ls(KEY.board,null);ls(KEY.myColor,null);ls(KEY.history,[]);saveState();
  renderAll();
  const ov=document.getElementById('chess-color-overlay');
  if(ov)ov.style.display='flex';
}

// ── 发送到聊天 ──
function sendToChat(text){
  const ta=document.querySelector('#send_textarea');
  if(ta){ta.value=ta.value?ta.value+'\n'+text:text;ta.dispatchEvent(new Event('input',{bubbles:true}));ta.focus();}
  else{const el=document.createElement('textarea');el.value=text;el.style.cssText='position:fixed;opacity:0;';document.body.appendChild(el);el.focus();el.select();try{document.execCommand('copy');}catch(e){}document.body.removeChild(el);}
}

// ── 渲染棋盘 ──
function renderBoard(){
  const el=document.getElementById('chess-board');if(!el)return;
  let h='';
  for(let ri=0;ri<8;ri++){
    for(let ci=0;ci<8;ci++){
      const p=board[ri][ci],light=(ri+ci)%2===0;
      const isSel=sel&&sel.r===ri&&sel.c===ci;
      const isLast=lastMove&&((lastMove.fr===ri&&lastMove.fc===ci)||(lastMove.tr===ri&&lastMove.tc===ci));
      const mvT=validMoves.find(m=>m.tr===ri&&m.tc===ci);
      let bg=light?'#ede0d0':'#b8a090';
      if(isSel)bg=light?'#a8b898':'#8a9a7a';
      else if(isLast)bg=light?'#c8b878':'#a89858';
      const glow=isSel?'filter:drop-shadow(0 2px 8px rgba(100,150,80,.85));':'filter:drop-shadow(0 1px 3px rgba(0,0,0,.18));';
      h+=`<div class="chess-cell${isSel?' chess-sel':''}" data-r="${ri}" data-c="${ci}" style="background:${bg};cursor:${isMine(p)||sel?'pointer':'default'};">
        ${ci===0?`<span class="chess-lbl chess-rank">${RANKS[ri]}</span>`:''}
        ${ri===7?`<span class="chess-lbl chess-file">${FILES[ci]}</span>`:''}
        ${p?`<span class="chess-piece" style="${glow}">${GLYPHS[p]||''}</span>`:''}
        ${mvT&&!p?'<div class="chess-dot"></div>':''}
        ${mvT&&p&&isTheirs(p)?'<div class="chess-cap-ring"></div>':''}
      </div>`;
    }
  }
  el.innerHTML=h;
  el.querySelectorAll('.chess-cell').forEach(cell=>cell.addEventListener('click',()=>handleClick(+cell.dataset.r,+cell.dataset.c)));
}

function renderMyMove(){
  const mv=document.getElementById('chess-my-move');
  const btn=document.getElementById('chess-send-my-btn');
  if(mv)mv.textContent=myLastMove||'——';
  if(btn)btn.style.display=myLastMove?'inline-flex':'none';
}

function renderLog(){
  const el=document.getElementById('chess-log');if(!el)return;
  let h='';
  log.slice(-60).forEach(l=>{
    const col=l.who==='爸爸'||l.who==='黑'?'#c4908a':l.who==='你'||l.who==='白'?'#9aab89':'#b0a098';
    h+=`<div class="cl-row"><span class="cl-who" style="color:${col};">${esc(l.who)}</span><span class="cl-txt">${esc(l.text)}</span></div>`;
  });
  el.innerHTML=h;el.scrollTop=el.scrollHeight;
}

function renderCaptured(){
  const mine=document.getElementById('chess-cap-mine');
  const theirs=document.getElementById('chess-cap-theirs');
  if(mine)mine.textContent=captured.mine.map(p=>GLYPHS[p]||'').join('')||'—';
  if(theirs)theirs.textContent=captured.theirs.map(p=>GLYPHS[p]||'').join('')||'—';
}

function renderUndoBtn(){
  const btn=document.getElementById('chess-undo-btn');
  if(btn)btn.style.display=history.length?'inline-flex':'none';
}

function renderAll(){
  renderBoard();renderMyMove();renderLog();renderCaptured();renderUndoBtn();
  // 颜色覆盖层
  const ov=document.getElementById('chess-color-overlay');
  if(ov)ov.style.display=colorChosen?'none':'flex';
}

// ── 折叠 ──
function applyCollapse(){
  const win=document.getElementById('chess-win'),body=document.getElementById('chess-body'),btn=document.getElementById('chess-col-btn');
  if(!win||!body)return;
  if(collapsed){body.style.display='none';win.style.borderRadius='24px';if(btn)btn.textContent='+';}
  else{body.style.display='flex';win.style.borderRadius='18px';if(btn)btn.textContent='−';}
}
function applyPanel(){
  const p=document.getElementById('chess-panel'),a=document.getElementById('chess-panel-arrow'),l=document.getElementById('chess-ptgl-lbl');
  if(!p)return;
  if(panelOpen){p.style.display='flex';if(a)a.textContent='▴';if(l)l.textContent='收起';}
  else{p.style.display='none';if(a)a.textContent='▾';if(l)l.textContent='展开';}
}
function applyReplay(){
  const p=document.getElementById('chess-replay-body'),a=document.getElementById('chess-replay-arrow');
  if(!p)return;
  if(replayOpen){p.style.display='flex';if(a)a.textContent='▴';}
  else{p.style.display='none';if(a)a.textContent='▾';}
}
function openWin(){
  const win=document.getElementById('chess-win');if(!win)return;
  winVisible=true;win.style.display='flex';
  requestAnimationFrame(()=>win.classList.add('chess-visible'));
  applyCollapse();applyPanel();applyReplay();renderAll();updateExtBtn(true);
}
function closeWin(){
  const win=document.getElementById('chess-win');if(!win)return;
  winVisible=false;win.classList.remove('chess-visible');
  win.addEventListener('transitionend',()=>{if(!winVisible)win.style.display='none';},{once:true});
  updateExtBtn(false);
}
function toggleWin(){winVisible?closeWin():openWin();}
function updateExtBtn(open){
  const b=document.getElementById('chess-ext-toggle');if(!b)return;
  b.textContent=open?'关闭 · Close':'打开 · Open';
  b.style.background=open?'#111':'';b.style.color=open?'#fff':'';
}

// ── 构建窗口 ──
function buildWin(){
  if(document.getElementById('chess-win'))return;
  const win=document.createElement('div');
  win.id='chess-win';
  win.innerHTML=`
  <div id="chess-bar">
    <div id="chess-bar-title">♟&nbsp;珍珠棋盘</div>
    <div id="chess-bar-right">
      <button class="chess-ctrl" id="chess-undo-btn" title="反悔" style="display:none;">↩</button>
      <button class="chess-ctrl" id="chess-col-btn">−</button>
      <button class="chess-ctrl" id="chess-close-btn">✕</button>
    </div>
  </div>

  <div id="chess-body">
    <!-- 棋盘 + 颜色选择覆盖层 -->
    <div id="chess-board-wrap">
      <div id="chess-board"></div>
      <div id="chess-color-overlay">
        <div id="chess-color-box">
          <div class="chess-color-title">选择执棋颜色</div>
          <div class="chess-color-row">
            <button class="chess-color-btn" id="chess-pick-w">执白 ♙<br><span>先手</span></button>
            <button class="chess-color-btn" id="chess-pick-b">执黑 ♟<br><span>后手</span></button>
          </div>
        </div>
      </div>
    </div>

    <!-- 被吃棋子 -->
    <div id="chess-captured">
      <div class="chess-cap-row">
        <span class="chess-cap-lbl">你吃了</span>
        <span id="chess-cap-mine" class="chess-cap-pieces">—</span>
      </div>
      <div class="chess-cap-div"></div>
      <div class="chess-cap-row">
        <span class="chess-cap-lbl">爸爸吃了</span>
        <span id="chess-cap-theirs" class="chess-cap-pieces">—</span>
      </div>
    </div>

    <!-- 面板折叠条 -->
    <button id="chess-panel-toggle">
      <span id="chess-panel-arrow">▴</span>
      <span id="chess-ptgl-lbl">收起</span>
    </button>

    <!-- 可折叠面板 -->
    <div id="chess-panel">

      <!-- 你走了 + 爸爸走了，两行紧凑 -->
      <div id="chess-moves-card">
        <div class="chess-move-row">
          <span class="chess-move-lbl">你走了</span>
          <span id="chess-my-move" class="chess-move-val">——</span>
          <button id="chess-send-my-btn" style="display:none;">发送</button>
        </div>
        <div class="chess-move-divider"></div>
        <div class="chess-move-row chess-daddy-row">
          <span class="chess-move-lbl">爸爸走了</span>
          <input id="chess-input" type="text" placeholder="e7-e5"
            autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false">
          <button id="chess-apply-btn">应用</button>
        </div>
        <div id="chess-err"></div>
      </div>

      <!-- 棋步记录 -->
      <div id="chess-log-card">
        <div class="chess-card-hd">
          <span class="chess-sec-lbl">棋步记录</span>
          <button id="chess-send-btn">发送到对话</button>
        </div>
        <div id="chess-log"></div>
      </div>

      <!-- 复盘（默认折叠） -->
      <div id="chess-replay-card">
        <button id="chess-replay-toggle" class="chess-fold-btn">
          <span id="chess-replay-arrow">▾</span>
          <span class="chess-sec-lbl" style="margin:0;">复盘还原</span>
        </button>
        <div id="chess-replay-body">
          <textarea id="chess-replay-input" placeholder="粘贴棋步序列&#10;如: e2-e4 e7-e5 d2-d4"></textarea>
          <div id="chess-replay-err"></div>
          <button id="chess-replay-btn">还原棋局 ↺</button>
        </div>
      </div>

      <button id="chess-reset-btn">↺ 重置 / 新局</button>
    </div>
  </div>`;

  (document.documentElement||document.body).appendChild(win);
  try{const p=ls(KEY.pos);if(p&&p.l&&p.t){win.style.left=p.l;win.style.top=p.t;win.style.right='auto';win.style.bottom='auto';}}catch(e){}

  // 拖拽
  const bar=document.getElementById('chess-bar');
  let drag=false,ox=0,oy=0,sx=0,sy=0;
  const dS=e=>{if(e.target.closest('.chess-ctrl'))return;drag=true;const t=e.touches?e.touches[0]:e;sx=t.clientX;sy=t.clientY;ox=win.offsetLeft;oy=win.offsetTop;e.preventDefault();};
  const dM=e=>{if(!drag)return;const t=e.touches?e.touches[0]:e;win.style.left=Math.max(0,Math.min(ox+t.clientX-sx,window.innerWidth-win.offsetWidth))+'px';win.style.top=Math.max(0,Math.min(oy+t.clientY-sy,window.innerHeight-win.offsetHeight))+'px';win.style.right='auto';win.style.bottom='auto';};
  const dE=()=>{if(!drag)return;drag=false;try{ls(KEY.pos,{l:win.style.left,t:win.style.top});}catch(e){}};
  bar.addEventListener('mousedown',dS);bar.addEventListener('touchstart',dS,{passive:false});
  document.addEventListener('mousemove',dM,{passive:true});document.addEventListener('touchmove',dM,{passive:true});
  document.addEventListener('mouseup',dE,{passive:true});document.addEventListener('touchend',dE,{passive:true});

  // 按钮事件
  document.getElementById('chess-col-btn').addEventListener('click',e=>{e.stopPropagation();collapsed=!collapsed;ls(KEY.col,collapsed);applyCollapse();});
  document.getElementById('chess-close-btn').addEventListener('click',e=>{e.stopPropagation();closeWin();});
  document.getElementById('chess-undo-btn').addEventListener('click',undoLast);
  document.getElementById('chess-panel-toggle').addEventListener('click',e=>{e.stopPropagation();panelOpen=!panelOpen;ls(KEY.panel,panelOpen);applyPanel();});
  document.getElementById('chess-pick-w').addEventListener('click',()=>chooseColor('W'));
  document.getElementById('chess-pick-b').addEventListener('click',()=>chooseColor('B'));
  document.getElementById('chess-send-my-btn').addEventListener('click',()=>{if(myLastMove)sendToChat(myLastMove);});
  document.getElementById('chess-send-btn').addEventListener('click',()=>{
    const moves=log.filter(l=>/[a-h][1-8]-[a-h][1-8]/i.test(l.text)).map(l=>{const m=l.text.match(/([a-h][1-8]-[a-h][1-8])/i);return m?(l.who==='你'||l.who==='白'?'白':'黑')+':'+m[1]:null;}).filter(Boolean);
    if(moves.length)sendToChat('📋 棋步记录：'+moves.join(' · '));
  });
  const inp=document.getElementById('chess-input'),err=document.getElementById('chess-err');
  const doApply=()=>{const v=inp.value;if(!v.trim())return;const e=applyDaddy(v);if(e){err.textContent=e;}else{err.textContent='';inp.value='';}};
  document.getElementById('chess-apply-btn').addEventListener('click',doApply);
  inp.addEventListener('keydown',e=>{if(e.key==='Enter')doApply();});
  inp.addEventListener('input',()=>{err.textContent='';});
  document.getElementById('chess-replay-toggle').addEventListener('click',()=>{replayOpen=!replayOpen;ls(KEY.replay,replayOpen);applyReplay();});
  const rErr=document.getElementById('chess-replay-err');
  document.getElementById('chess-replay-btn').addEventListener('click',()=>{
    const v=document.getElementById('chess-replay-input').value;
    if(!v.trim()){rErr.textContent='请先粘贴棋步';return;}
    const e=replayMoves(v);
    if(e){rErr.textContent=e;}else{rErr.textContent='';document.getElementById('chess-replay-input').value='';}
  });
  document.getElementById('chess-reset-btn').addEventListener('click',()=>{if(confirm('重置棋盘并重新选色？'))resetBoard();});
}

// ── 扩展面板注入 ──
function injectPanel(c){
  if(document.getElementById('chess-ext-sec'))return;
  const s=document.createElement('div');s.id='chess-ext-sec';
  s.setAttribute('style','display:flex;align-items:center;justify-content:space-between;padding:10px 14px;margin:0 0 8px;border-radius:10px;background:#f4f1ec;font-family:-apple-system,BlinkMacSystemFont,sans-serif;');
  s.innerHTML=`<span style="display:flex;align-items:center;gap:7px;font-size:13px;font-weight:600;color:#111;">♟ 珍珠棋盘</span><button id="chess-ext-toggle" style="font-size:12px;font-weight:600;background:#f4f1ec;color:#111;border:1.5px solid #111;border-radius:8px;padding:6px 14px;cursor:pointer;white-space:nowrap;font-family:-apple-system,BlinkMacSystemFont,sans-serif;-webkit-tap-highlight-color:transparent;">打开 · Open</button>`;
  c.insertBefore(s,c.firstChild);
  document.getElementById('chess-ext-toggle').addEventListener('click',toggleWin);
}
function tryInject(){
  if(document.getElementById('chess-ext-sec'))return true;
  const t=document.getElementById('extensions_settings');
  if(t){injectPanel(t);return true;}return false;
}

// ── 悬浮球 ──
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

// ── 初始化 ──
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
const D=[1200,3500,6000];
if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',()=>D.forEach(d=>setTimeout(safe(init),d)));}
else{D.forEach(d=>setTimeout(safe(init),d));}

})();
