const BOSS_SRC = "assets/boss.png";

const W = 360, H = 600;
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
let scale = 1;

function resize(){
  const cssW = cv.parentNode.clientWidth;
  const cssH = cssW * H / W;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.style.height = cssH + 'px';
  cv.width = Math.round(cssW * dpr);
  cv.height = Math.round(cssH * dpr);
  scale = cv.width / W;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingEnabled = true;
}
window.addEventListener('resize', resize);

/* ---------- 青海波の背景 ---------- */
const bgPat = (()=>{
  const c = document.createElement('canvas');
  const u = 24; c.width = u*2; c.height = u;
  const g = c.getContext('2d');
  g.fillStyle = '#16233f'; g.fillRect(0,0,c.width,c.height);
  g.strokeStyle = 'rgba(184,145,47,.16)'; g.lineWidth = 1;
  for(const cx of [0, u, u*2]){
    for(let r=6; r<=u; r+=6){
      g.beginPath(); g.arc(cx, u, r, Math.PI, 0); g.stroke();
    }
  }
  for(const cx of [u/2, u*1.5]){
    for(let r=6; r<=u; r+=6){
      g.beginPath(); g.arc(cx, 0, r, 0, Math.PI); g.stroke();
    }
  }
  return ctx.createPattern(c, 'repeat');
})();

/* ---------- 状態 ---------- */
const boss = new Image();
let bossReady = false;
boss.onload = ()=> bossReady = true;
boss.src = BOSS_SRC;

// 第二形態（撃破後に復活する“本気の顔”）
const boss2 = new Image();
let boss2Ready = false;
boss2.onload = ()=> boss2Ready = true;
boss2.src = "assets/boss2.png";

let state = 'title';       // title | play | clear | over | win
let wave = 1, score = 0, lives = 3;
let player, bullets, ebullets, enemies, bossObj, msg = '', msgTimer = 0;
let dir = 1, stepTimer = 0, shake = 0;
let ki = 0, charge = 0, beam = null, kbCharge = false, frame = 0, flash = 0;
let items = [];
const ITEMS = [
  { k:'sub',    label:'副', name:'副印',   col:'#d8b45c' },
  { k:'rapid',  label:'速', name:'速筆',   col:'#ede4d3' },
  { k:'ink',    label:'朱', name:'朱肉',   col:'#c0392b' },
  { k:'shield', label:'受', name:'受理印', col:'#b8912f' }
];
const BTN = { x: W-56, y: H-116, w: 48, h: 48 };
const MUTE = { x: W-30, y: 8, w: 22, h: 22 };   // 右上のミュート切替
const EBULLET_SPEED = 1.5;                        // 敵弾（球）の速度倍率

function newPlayer(){
  return { x: W/2, y: H-42, w: 30, h: 20, speed: 4.6, cool: 0, inv: 0,
           sub: 0, subT: 0, rapidT: 0, shield: false };
}

function makeWave(n){
  enemies = [];
  const cols = 7, rows = Math.min(3 + n, 5);
  const gapX = 42, gapY = 34, x0 = (W - (cols-1)*gapX)/2, y0 = 96;
  for(let r=0;r<rows;r++){
    for(let c=0;c<cols;c++){
      enemies.push({
        x: x0 + c*gapX, y: y0 + r*gapY, w: 26, h: 20, alive: true,
        kind: r % 3, pt: (rows - r) * 10, f: 0
      });
    }
  }
  dir = 1; stepTimer = 0;
}

function makeBoss(){
  bossObj = { x: W/2, y: 110, w: 86, h: 94, hp: 70, max: 70, t: 0, cool: 60, hurt: 0, next: 55, phase: 1 };
}

// ボス撃破時：第一形態なら“本気の顔”で復活、第二形態なら勝利
function bossDown(){
  const b = bossObj;
  if(b.phase === 1){
    b.phase = 2;
    b.hp = b.max = 80;          // 第二形態はHP増
    b.next = b.max - 15;
    b.hurt = 16; b.cool = 100;  // 復活直後は少し間を置く
    b.t = 0;
    score += 300; shake = 18; flash = 12;
    setMsg('所長、本気の顔で復活', 130);
    beep(200, .5, 'sawtooth', .06); beep(300, .5, 'square', .05);
    // BGMはボス曲を継続（頭出しし直したい場合は bgmSet('boss', true)）
  } else {
    state = 'win'; score += 1000; shake = 20; beep(880, .5, 'triangle', .06);
  }
}

function reset(){
  wave = 1; score = 0; lives = 3;
  ki = 45; charge = 0; beam = null; flash = 0; items = [];
  player = newPlayer(); bullets = []; ebullets = []; bossObj = null;
  makeWave(1); state = 'play'; setMsg('第一波　申請書類の群れ', 90);
  bgmSet('normal', true);   // ゲーム開始（タップ／キー操作）と同時にBGM開始＝自動再生規制を回避
}

function setMsg(t, f){ msg = t; msgTimer = f; }

/* ---------- 音 ---------- */
let ac = null;
function beep(freq, dur, type='square', vol=.05){
  try{
    if(!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.value = vol; o.connect(g); g.connect(ac.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(.0001, ac.currentTime + dur);
    o.stop(ac.currentTime + dur);
  }catch(e){}
}

/* ---------- BGM（通常＝申請書類の雪崩／ボス戦＝専用曲） ---------- */
const BGM = {
  normal: { file: 'assets/paperavalanche.mp3', vol: .45, el: null },
  boss:   { file: 'assets/boss-theme.mp3',     vol: .5,  el: null }
};
let muted = false, curTrack = null;
function bgmEl(name){
  const t = BGM[name];
  if(!t.el){
    t.el = new Audio(t.file);
    t.el.loop = true; t.el.volume = t.vol; t.el.preload = 'auto';
  }
  return t.el;
}
function bgmSet(name, restart){
  curTrack = name;
  if(muted) return;
  try{
    for(const k in BGM){ if(k !== name && BGM[k].el && !BGM[k].el.paused) BGM[k].el.pause(); }
    const a = bgmEl(name);
    if(restart){ try{ a.currentTime = 0; }catch(e){} }
    a.play().catch(()=>{});   // 端末のミュート等で失敗しても無視
  }catch(e){}
}
function bgmStop(){ for(const k in BGM){ if(BGM[k].el){ try{ BGM[k].el.pause(); }catch(e){} } } }
function toggleMute(){
  muted = !muted;
  if(muted) bgmStop();
  else if(state === 'play') bgmSet(curTrack || 'normal', false);   // 消音前の曲を再開
  return muted;
}

/* ---------- 入力 ---------- */
const keys = {};
addEventListener('keydown', e=>{
  keys[e.code] = true;
  if(['ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
  if(e.code === 'Space' || e.code === 'Enter') tap();
  if(e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyZ') kbCharge = true;
  if(e.code === 'KeyM') toggleMute();
});
addEventListener('keyup', e=>{
  keys[e.code] = false;
  if(e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyZ') kbCharge = false;
});

let touchX = null, movePtr = null, chargePtr = null;
function pos(e){
  const r = cv.getBoundingClientRect();
  return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
}
function inBtn(p){
  return p.x > BTN.x-8 && p.x < BTN.x+BTN.w+8 && p.y > BTN.y-8 && p.y < BTN.y+BTN.h+8;
}
function inMute(p){
  return p.x > MUTE.x-8 && p.x < MUTE.x+MUTE.w+8 && p.y > MUTE.y-8 && p.y < MUTE.y+MUTE.h+8;
}
cv.addEventListener('pointerdown', e=>{
  const p = pos(e);
  cv.setPointerCapture(e.pointerId);
  if(inMute(p)){ toggleMute(); return; }   // ミュート切替（開始前でも押せる）
  if(state !== 'play'){ tap(); return; }
  if(inBtn(p) && chargePtr === null){ chargePtr = e.pointerId; return; }
  movePtr = e.pointerId; touchX = p.x; shoot();
});
cv.addEventListener('pointermove', e=>{ if(e.pointerId === movePtr) touchX = pos(e).x; });
function ptrEnd(e){
  if(e.pointerId === chargePtr) chargePtr = null;
  if(e.pointerId === movePtr){ movePtr = null; touchX = null; }
}
cv.addEventListener('pointerup', ptrEnd);
cv.addEventListener('pointercancel', ptrEnd);

function tap(){
  if(state === 'title' || state === 'over' || state === 'win'){ reset(); return; }
  if(state === 'play') shoot();
}

function shoot(){
  if(player.cool > 0 || charge > 0 || state !== 'play') return;
  const n = 1 + player.sub * 2;               // 副印で2WAY→3WAY→5WAY
  for(let i=0;i<n;i++){
    const off = (i - (n-1)/2);
    bullets.push({ x: player.x + off*4, y: player.y - 12, w: 4, h: 10, vx: off*1.5 });
  }
  player.cool = player.rapidT > 0 ? 7 : 14;     // 速筆で連射
  beep(880, .06, 'square', .04);
}

/* ---------- パワーアップ ---------- */
function maybeDrop(x, y, rate){
  if(Math.random() > (rate === undefined ? .14 : rate)) return;
  const w = [30, 28, 24, 18], total = 100;
  let r = Math.random()*total, i = 0;
  while(r > w[i] && i < w.length-1){ r -= w[i]; i++; }
  items.push({ x: x, y: y, kind: i, t: 0 });
}

function pickUp(it){
  const d = ITEMS[it.kind];
  if(d.k === 'sub'){        player.sub = Math.min(2, player.sub + 1); player.subT = 900; }
  else if(d.k === 'rapid'){ player.rapidT = 780; }
  else if(d.k === 'ink'){   ki = 100; }
  else if(d.k === 'shield'){ player.shield = true; }
  setMsg(d.name + '　入手', 26);
  beep(700, .08, 'triangle', .05); beep(1050, .1, 'triangle', .04);
}

function updateItems(){
  for(const it of items){
    it.t++;
    it.y += 1.25;
    it.x += Math.sin(it.t/22) * .6;
    if(Math.abs(it.x - player.x) < 20 && Math.abs(it.y - player.y) < 18){ it.got = true; pickUp(it); }
  }
  items = items.filter(it => !it.got && it.y < H - 6);

  if(player.subT > 0 && --player.subT === 0) player.sub = 0;
  if(player.rapidT > 0) player.rapidT--;
}

/* ---------- 必殺・朱印一閃 ---------- */
function release(){
  const p = charge; charge = 0;
  if(p < 20){ beep(140, .12, 'sine', .03); return; }   // 貯めが足りないと不発
  const life = Math.round(22 + p * .22);
  beam = { x: player.x, w: 26 + p * 1.25, power: p, life: life, maxlife: life, acc: 0 };
  flash = 6; shake = Math.round(6 + p*.1);
  beep(420, .35, 'sawtooth', .06); beep(150, .5, 'square', .04);
  if(p >= 85) setMsg('必殺　朱印一閃', 34);
}

function updateBeam(){
  const b = beam, half = b.w/2;
  b.life--;
  if(bossObj){
    if(Math.abs(bossObj.x - b.x) < half + bossObj.w/2 - 12){
      b.acc += b.power * .22 / b.maxlife;
      while(b.acc >= 1 && bossObj.hp > 0){ b.acc--; bossObj.hp--; score += 5; }
      if(bossObj.hp <= bossObj.next){ bossObj.next -= 15; maybeDrop(bossObj.x, bossObj.y + 30, 1); }
      bossObj.hurt = 4;
      if(bossObj.hp <= 0 && state === 'play'){ bossDown(); }
    }
  } else {
    for(const e of enemies){
      if(e.alive && Math.abs(e.x - b.x) < half + e.w/2){
        e.alive = false; score += e.pt; ki = Math.min(100, ki + 3); maybeDrop(e.x, e.y, .07);
        if(frame % 2 === 0) beep(560, .04, 'square', .02);
      }
    }
  }
  ebullets = ebullets.filter(bl => Math.abs(bl.x - b.x) > half);
  if(b.life <= 0) beam = null;
}

/* ---------- 更新 ---------- */
function update(){
  frame++;
  if(msgTimer > 0) msgTimer--;
  if(shake > 0) shake--;
  if(flash > 0) flash--;
  if(state !== 'play') return;

  // 気力：時間で少し、書類を捌くと多く回復
  ki = Math.min(100, ki + .05);

  // 必殺技：長押しで貯め、離して放つ
  const held = kbCharge || chargePtr !== null;
  if(held && (charge > 0 || ki >= 15)){
    charge = Math.min(100, charge + 1.7);
    ki = Math.max(0, ki - 1.15);
    if(frame % 5 === 0) beep(240 + charge*7, .05, 'triangle', .025);
    if(ki <= 0) release();
  } else if(charge > 0){
    release();
  }
  if(beam) updateBeam();
  updateItems();

  // 自機（貯め中は足が止まり気味、通常弾も出ない）
  const mv = charge > 0 ? .5 : 1;
  if(keys.ArrowLeft) player.x -= player.speed * mv;
  if(keys.ArrowRight) player.x += player.speed * mv;
  if(touchX !== null){
    const d = touchX - player.x;
    // 指位置へ機敏に追従（近距離はそのまま、遠距離は上限で頭打ち）
    const step = Math.abs(d) < 2 ? d : Math.max(-16, Math.min(16, d * .6));
    player.x += step * mv;
    if(player.cool <= 0) shoot();
  }
  player.x = Math.max(18, Math.min(W-18, player.x));
  if(player.cool > 0) player.cool--;
  if(player.inv > 0) player.inv--;

  // 自弾
  bullets.forEach(b => { b.y -= 7; b.x += b.vx || 0; });
  bullets = bullets.filter(b => b.y > -12 && b.x > -8 && b.x < W+8);

  // 敵弾（球速1.5倍）
  ebullets.forEach(b => { b.y += b.vy * EBULLET_SPEED; b.x += (b.vx || 0) * EBULLET_SPEED; });
  ebullets = ebullets.filter(b => b.y < H+10 && b.x > -10 && b.x < W+10);

  if(bossObj) updateBoss(); else updateSwarm();

  // 被弾
  for(const b of ebullets){
    if(player.inv <= 0 && Math.abs(b.x - player.x) < 14 && Math.abs(b.y - player.y) < 12){
      b.dead = true;
      if(player.shield){
        player.shield = false; player.inv = 60; shake = 8;
        setMsg('受理印が受け止めた', 26); beep(300,.18,'triangle',.05);
      } else {
        lives--; player.inv = 90; shake = 14; beep(120,.3,'sawtooth',.07);
        if(lives <= 0){ state = 'over'; setMsg('', 0); }
      }
    }
  }
  ebullets = ebullets.filter(b => !b.dead);
}

function updateSwarm(){
  const live = enemies.filter(e => e.alive);
  if(live.length === 0){
    if(wave >= 3){ makeBoss(); setMsg('最終波　所長が出てきた', 120); beep(200,.5,'sawtooth',.06); bgmSet('boss', true); }
    else { wave++; makeWave(wave); player.inv = 60;
           setMsg(wave === 2 ? '第二波　書類が増えた' : '第三波', 90); }
    return;
  }
  // 移動（残数が減るほど速く）
  const interval = Math.max(6, 30 - (enemies.length - live.length) * .5 - wave * 3);
  stepTimer++;
  if(stepTimer >= interval){
    stepTimer = 0;
    let hitEdge = false;
    for(const e of live){
      if(e.x + dir*8 > W-16 || e.x + dir*8 < 16) hitEdge = true;
    }
    if(hitEdge){
      dir *= -1;
      for(const e of live) e.y += 14;
    } else {
      for(const e of live){ e.x += dir*8; e.f ^= 1; }
    }
    beep(160 + live.length, .04, 'triangle', .02);
    // 最前列到達
    for(const e of live){
      if(e.y > H - 70){ state = 'over'; return; }
    }
  }
  // 敵の発射
  if(Math.random() < .012 + wave*.006){
    const s = live[Math.floor(Math.random()*live.length)];
    ebullets.push({ x: s.x, y: s.y + 12, vy: 2.6 + wave*.2, kind:0 });
  }
  // 命中判定
  for(const b of bullets){
    for(const e of live){
      if(Math.abs(b.x - e.x) < e.w/2 + 2 && Math.abs(b.y - e.y) < e.h/2 + 4){
        e.alive = false; b.dead = true; score += e.pt;
        ki = Math.min(100, ki + 6); maybeDrop(e.x, e.y);
        beep(520, .07, 'square', .04); break;
      }
    }
  }
  bullets = bullets.filter(b => !b.dead);
}

function updateBoss(){
  const b = bossObj;
  b.t++;
  b.x = W/2 + Math.sin(b.t/60) * (W/2 - 60);
  b.y = 110 + Math.sin(b.t/95) * 22;
  if(b.hurt > 0) b.hurt--;

  b.cool--;
  if(b.cool <= 0){
    const rage = b.hp < b.max/2;
    b.cool = rage ? 42 : 62;
    const n = rage ? 5 : 3;
    for(let i=0;i<n;i++){
      const a = Math.PI/2 + (i-(n-1)/2) * .28;
      ebullets.push({ x: b.x, y: b.y + b.h/2 - 6,
                      vx: Math.cos(a)*2.4, vy: Math.sin(a)*2.4, kind:1 });
    }
    beep(180, .12, 'sawtooth', .05);
  }

  for(const bl of bullets){
    if(Math.abs(bl.x - b.x) < b.w/2 - 6 && Math.abs(bl.y - b.y) < b.h/2 - 6){
      bl.dead = true; b.hp--; b.hurt = 6; score += 5; ki = Math.min(100, ki + .8);
      if(b.hp <= b.next){ b.next -= 15; maybeDrop(b.x, b.y + 30, 1); }
      beep(660, .04, 'square', .03);
      if(b.hp <= 0){ bossDown(); break; }
    }
  }
  bullets = bullets.filter(bl => !bl.dead);
}

/* ---------- 描画 ---------- */
function drawDoc(e){
  const x = e.x - e.w/2, y = e.y - e.h/2;
  const tint = ['#ede4d3', '#dfd3bd', '#cfc0a6'][e.kind];
  ctx.fillStyle = tint;
  ctx.fillRect(x, y, e.w, e.h);
  ctx.fillStyle = '#16233f';
  ctx.beginPath(); ctx.moveTo(x+e.w-7, y); ctx.lineTo(x+e.w, y); ctx.lineTo(x+e.w, y+7); ctx.fill();
  ctx.fillStyle = 'rgba(22,35,63,.55)';
  for(let i=0;i<3;i++) ctx.fillRect(x+4, y+5 + i*5 + (e.f?0:1), e.w-10 - (i===2?6:0), 1.5);
  ctx.strokeStyle = '#b8912f'; ctx.lineWidth = 1;
  ctx.strokeRect(x+.5, y+.5, e.w-1, e.h-1);
  ctx.fillStyle = '#c0392b';
  ctx.beginPath(); ctx.arc(x+e.w-6, y+e.h-5, 2.6, 0, Math.PI*2); ctx.fill();
}

function drawPlayer(){
  if(player.inv > 0 && Math.floor(player.inv/5) % 2) return;
  const x = player.x, y = player.y;
  ctx.fillStyle = '#b8912f';
  ctx.fillRect(x-4, y-2, 8, 16);            // 柄
  ctx.fillStyle = '#d8b45c';
  ctx.fillRect(x-14, y-12, 28, 12);         // 印面
  ctx.fillStyle = '#16233f';
  ctx.font = '9px "Yu Mincho",serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('認', x, y-5.5);
}

function drawBoss(){
  const b = bossObj;
  const p2 = b.phase === 2;
  const img = p2 ? boss2 : boss;
  const ready = p2 ? boss2Ready : bossReady;
  const x = b.x - b.w/2, y = b.y - b.h/2;
  if(ready){
    if(b.hurt > 0){ ctx.globalAlpha = .55; }
    ctx.drawImage(img, x, y, b.w, b.h);
    ctx.globalAlpha = 1;
    if(p2){   // 本気の顔は朱色の枠で囲う
      ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 2;
      ctx.strokeRect(x+1, y+1, b.w-2, b.h-2);
    }
  } else {
    ctx.fillStyle = '#ede4d3';
    ctx.fillRect(x, y, b.w, b.h);
  }
  // HPバー
  const bw = 200, bx = (W-bw)/2, by = 26;
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(bx, by, bw, 8);
  ctx.fillStyle = p2 ? '#c0392b' : '#b8912f'; ctx.fillRect(bx, by, bw * b.hp/b.max, 8);
  ctx.strokeStyle = 'rgba(237,228,211,.7)'; ctx.lineWidth = 1;
  ctx.strokeRect(bx+.5, by+.5, bw-1, 7);
  ctx.fillStyle = '#d8b45c'; ctx.font = '9px system-ui,sans-serif';
  ctx.textAlign = 'center'; ctx.fillText(p2 ? '所長　三宅 晴久（本気）' : '所長　三宅 晴久', W/2, by - 6);
}

function drawBeam(){
  const b = beam, half = b.w/2, k = b.life / b.maxlife, bot = player.y - 10;
  ctx.save();
  ctx.globalAlpha = .2 + .6*k;
  const g = ctx.createLinearGradient(0, bot, 0, 0);
  g.addColorStop(0, 'rgba(216,180,92,.95)');
  g.addColorStop(.4, 'rgba(192,57,43,.85)');
  g.addColorStop(1, 'rgba(216,180,92,.12)');
  ctx.fillStyle = g; ctx.fillRect(b.x-half, 0, b.w, bot);
  ctx.globalAlpha = .8*k; ctx.strokeStyle = '#ede4d3'; ctx.lineWidth = 1.5;
  ctx.strokeRect(b.x-half, 0, b.w, bot);
  ctx.globalAlpha = k; ctx.strokeStyle = 'rgba(192,57,43,.95)'; ctx.lineWidth = 3;
  const t = 1 - k;
  for(let i=0;i<3;i++){
    const y = bot - ((t*1.5 + i*.34) % 1) * bot;
    ctx.beginPath(); ctx.arc(b.x, y, half*.8, 0, Math.PI*2); ctx.stroke();
  }
  ctx.restore();
}

function drawCharge(){
  const r = 15 + charge*.16;
  ctx.save();
  ctx.globalAlpha = .25 + .2*Math.sin(frame/4);
  ctx.fillStyle = '#d8b45c';
  ctx.beginPath(); ctx.arc(player.x, player.y-2, r*.8, 0, Math.PI*2); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(player.x, player.y-2, r, -Math.PI/2, -Math.PI/2 + Math.PI*2*charge/100);
  ctx.stroke();
  ctx.restore();
}

function drawSeal(cx, cy, r){
  ctx.save();
  ctx.translate(cx, cy); ctx.rotate(-.06);
  ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 4;
  ctx.strokeRect(-r, -r, r*2, r*2);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(-r+7, -r+7, (r-7)*2, (r-7)*2);
  ctx.fillStyle = '#c0392b';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = (r*1.05) + 'px "Yu Mincho",serif';
  ctx.fillText('認', 0, 2);
  ctx.restore();
}

function drawBtn(){
  const b = BTN, on = ki >= 15 || charge > 0;
  ctx.save();
  ctx.globalAlpha = on ? 1 : .3;
  ctx.fillStyle = charge > 0 ? 'rgba(192,57,43,.45)' : 'rgba(184,145,47,.15)';
  ctx.fillRect(b.x, b.y, b.w, b.h);
  ctx.strokeStyle = '#d8b45c'; ctx.lineWidth = 1.5;
  ctx.strokeRect(b.x+.5, b.y+.5, b.w-1, b.h-1);
  ctx.fillStyle = '#ede4d3'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '14px "Yu Mincho",serif'; ctx.fillText('必殺', b.x+b.w/2, b.y+b.h/2-6);
  ctx.font = '7px system-ui,sans-serif'; ctx.fillText('長押し', b.x+b.w/2, b.y+b.h/2+11);
  if(charge > 0){
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(b.x, b.y+b.h-4, b.w*charge/100, 4);
  }
  ctx.restore();
}

function drawItem(it){
  const d = ITEMS[it.kind], r = 9, bob = Math.sin(it.t/12)*1.5;
  ctx.save();
  ctx.translate(it.x, it.y + bob); ctx.rotate(Math.sin(it.t/40)*.15);
  ctx.globalAlpha = .18 + .12*Math.sin(it.t/8);
  ctx.fillStyle = d.col;
  ctx.beginPath(); ctx.arc(0, 0, r*1.7, 0, Math.PI*2); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(14,23,48,.85)';
  ctx.fillRect(-r, -r, r*2, r*2);
  ctx.strokeStyle = d.col; ctx.lineWidth = 2;
  ctx.strokeRect(-r, -r, r*2, r*2);
  ctx.fillStyle = d.col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '12px "Yu Mincho",serif';
  ctx.fillText(d.label, 0, 1);
  ctx.restore();
}

function drawChips(){
  const on = [];
  if(player.sub > 0)     on.push({ d: ITEMS[0], t: player.subT/900,   n: 1 + player.sub*2 });
  if(player.rapidT > 0)  on.push({ d: ITEMS[1], t: player.rapidT/780 });
  if(player.shield)      on.push({ d: ITEMS[3], t: 1 });
  on.forEach((o, i)=>{
    const x = 8 + i*40, y = H-52;
    ctx.fillStyle = 'rgba(14,23,48,.6)'; ctx.fillRect(x, y, 36, 14);
    ctx.strokeStyle = o.d.col; ctx.lineWidth = 1; ctx.strokeRect(x+.5, y+.5, 35, 13);
    ctx.fillStyle = o.d.col; ctx.font = '9px "Yu Mincho",serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(o.d.label + (o.n ? o.n + '発' : (o.d.k === 'shield' ? '1枚' : '')), x+4, y+7);
    ctx.fillStyle = o.d.col;
    ctx.fillRect(x, y+13, 36*o.t, 1.5);
  });
}

function drawHUD(){
  const gw = 92, gx = 8, gy = H-30;
  ctx.fillStyle = 'rgba(0,0,0,.32)'; ctx.fillRect(gx, gy, gw, 6);
  ctx.fillStyle = charge > 0 ? '#c0392b' : (ki >= 15 ? '#d8b45c' : 'rgba(216,180,92,.35)');
  ctx.fillRect(gx, gy, gw*ki/100, 6);
  ctx.strokeStyle = 'rgba(237,228,211,.45)'; ctx.lineWidth = 1;
  ctx.strokeRect(gx+.5, gy+.5, gw-1, 5);
  ctx.fillStyle = 'rgba(237,228,211,.7)'; ctx.font = '8px system-ui,sans-serif';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText('気力', gx, gy-7);

  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(237,228,211,.85)';
  ctx.font = '11px system-ui,sans-serif';
  ctx.textAlign = 'left';  ctx.fillText('SCORE ' + score, 8, H-12);
  ctx.textAlign = 'right';
  ctx.fillText(bossObj ? 'FINAL' : 'WAVE ' + wave, W-8, H-12);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#c0392b';
  let s = ''; for(let i=0;i<lives;i++) s += '● ';
  ctx.fillText(s.trim(), W/2, H-12);
}

function drawMute(){
  const cx = MUTE.x + MUTE.w/2, cy = MUTE.y + MUTE.h/2;
  ctx.fillStyle = 'rgba(237,228,211,.7)';
  // スピーカー本体
  ctx.beginPath();
  ctx.moveTo(cx-6, cy-3); ctx.lineTo(cx-3, cy-3); ctx.lineTo(cx+1, cy-6);
  ctx.lineTo(cx+1, cy+6); ctx.lineTo(cx-3, cy+3); ctx.lineTo(cx-6, cy+3);
  ctx.closePath(); ctx.fill();
  if(muted){
    // ミュート時は赤い斜線
    ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx-7, cy-7); ctx.lineTo(cx+8, cy+8); ctx.stroke();
  }else{
    // 再生中は音波
    ctx.strokeStyle = 'rgba(216,180,92,.9)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(cx+2, cy, 5, -Math.PI/3, Math.PI/3); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx+2, cy, 8, -Math.PI/3, Math.PI/3); ctx.stroke();
  }
}

function center(lines){
  ctx.fillStyle = 'rgba(14,23,48,.82)';
  ctx.fillRect(0, H/2-100, W, 200);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  let y = H/2 - 60;
  for(const l of lines){
    ctx.fillStyle = l.c || '#ede4d3';
    ctx.font = (l.s || 16) + 'px ' + (l.f || '"Yu Mincho",serif');
    ctx.fillText(l.t, W/2, y);
    y += l.gap || 26;
  }
}

function draw(){
  ctx.save();
  if(shake > 0) ctx.translate((Math.random()-.5)*shake*.5, (Math.random()-.5)*shake*.5);
  ctx.fillStyle = bgPat; ctx.fillRect(-20, -20, W+40, H+40);

  if(state === 'play'){
    if(bossObj) drawBoss();
    else enemies.filter(e=>e.alive).forEach(drawDoc);

    ctx.fillStyle = '#d8b45c';
    bullets.forEach(b => ctx.fillRect(b.x-2, b.y-5, 4, 10));
    ebullets.forEach(b=>{
      ctx.fillStyle = b.kind ? '#c0392b' : 'rgba(237,228,211,.9)';
      ctx.beginPath(); ctx.arc(b.x, b.y, b.kind ? 4 : 3, 0, Math.PI*2); ctx.fill();
    });
    items.forEach(drawItem);
    if(beam) drawBeam();
    drawPlayer();
    if(player.shield && !(player.inv > 0 && Math.floor(player.inv/5) % 2)){
      ctx.save();
      ctx.strokeStyle = 'rgba(184,145,47,.85)'; ctx.lineWidth = 1.5;
      ctx.globalAlpha = .55 + .3*Math.sin(frame/10);
      ctx.beginPath(); ctx.arc(player.x, player.y-2, 20, 0, Math.PI*2); ctx.stroke();
      ctx.restore();
    }
    if(charge > 0) drawCharge();
    drawBtn();
    drawChips();
    drawHUD();
    if(flash > 0){
      ctx.globalAlpha = flash/12; ctx.fillStyle = '#ede4d3';
      ctx.fillRect(0,0,W,H); ctx.globalAlpha = 1;
    }
    if(msgTimer > 0){
      ctx.globalAlpha = Math.min(1, msgTimer/30);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#d8b45c'; ctx.font = '17px "Yu Mincho",serif';
      ctx.fillText(msg, W/2, H/2);
      ctx.globalAlpha = 1;
    }
  } else if(state === 'title'){
    center([
      {t:'書類インベーダー', s:24, gap:30},
      {t:'押し寄せる申請書類を、認印で捌く。', s:12, c:'rgba(237,228,211,.75)', gap:22},
      {t:'必殺・朱印一閃　気力を貯めて放つ', s:12, c:'#c0392b', gap:22},
      {t:'落ちてくる印を拾って強化：副印・速筆・朱肉・受理印', s:10.5, c:'rgba(237,228,211,.7)', gap:22},
      {t:'三つの波を越えると、何かが出る', s:12, c:'#d8b45c', gap:32},
      {t:'タップ / スペースで開始', s:12, f:'system-ui,sans-serif', c:'#ede4d3'}
    ]);
    drawSeal(W/2, 128, 40);
  } else if(state === 'over'){
    center([
      {t:'書類に埋もれた', s:22, gap:32},
      {t:'SCORE ' + score, s:16, f:'system-ui,sans-serif', c:'#d8b45c', gap:32},
      {t:'タップでもう一度', s:12, f:'system-ui,sans-serif', c:'rgba(237,228,211,.8)'}
    ]);
  } else if(state === 'win'){
    center([
      {t:'所長 撃破', s:24, c:'#d8b45c', gap:30},
      {t:'すべての書類が受理されました', s:13, gap:30},
      {t:'SCORE ' + score, s:16, f:'system-ui,sans-serif', c:'#d8b45c', gap:32},
      {t:'タップで再挑戦', s:12, f:'system-ui,sans-serif', c:'rgba(237,228,211,.8)'}
    ]);
  }
  drawMute();   // どの画面でも右上に表示（開始前に消音予約も可）
  ctx.restore();
}

function loop(){
  update(); draw();
  if(state !== 'play') bgmStop();   // クリア/ゲームオーバー/タイトルで停止
  requestAnimationFrame(loop);
}
resize(); player = newPlayer(); bullets = []; ebullets = []; enemies = [];
loop();
