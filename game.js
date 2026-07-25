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

// 第三形態（さらに復活。鼻からたま／ビーム）
const boss3 = new Image();
let boss3Ready = false;
boss3.onload = ()=> boss3Ready = true;
boss3.src = "assets/boss3.png";
const NOSE_REL_Y = 0.695;   // スプライト上の鼻の縦位置（0=上,1=下）

let state = 'title';       // title | play | clear | over | win
let wave = 1, score = 0, lives = 3;
let player, bullets, ebullets, enemies, bossObj, msg = '', msgTimer = 0;
let missiles = [];   // ボスの誘導ミサイル
let dir = 1, stepTimer = 0, shake = 0;
let ki = 0, charge = 0, beam = null, kbCharge = false, frame = 0, flash = 0;
let items = [];
const ITEMS = [
  { k:'sub',    label:'副', name:'副印',   col:'#d8b45c' },
  { k:'rapid',  label:'速', name:'速筆',   col:'#ede4d3' },
  { k:'ink',    label:'朱', name:'朱肉',   col:'#c0392b' },
  { k:'shield', label:'受', name:'受理印', col:'#b8912f' },
  { k:'heal',   label:'薬', name:'回復薬', col:'#3aa76d' },   // ライフ回復（緑）
  { k:'bunshin',label:'分', name:'分身',   col:'#5aa9e6' },   // 僚機（水色）
  { k:'pierce', label:'貫', name:'貫通弾', col:'#e67e22' }    // 貫通弾（橙）
];
const MAX_LIVES = 5, MAX_WINGS = 2;
const BTN = { x: W-56, y: H-116, w: 48, h: 48 };
const FIRE = { x: 8, y: H-116, w: 48, h: 48 };   // 左下：その場で撃つ迎撃ボタン
const MUTE = { x: W-30, y: 8, w: 22, h: 22 };   // 右上のミュート切替
const EBULLET_SPEED = 1.5;                        // 敵弾（球）の速度倍率

function newPlayer(){
  return { x: W/2, y: H-42, w: 30, h: 20, speed: 4.6, cool: 0, inv: 0,
           sub: 0, subT: 0, rapidT: 0, shield: false,
           wings: 0, pierceT: 0 };
}

function makeWave(n){
  enemies = [];
  const cols = 7, rows = Math.min(3 + n, 5);
  const gapX = 42, gapY = 34, x0 = (W - (cols-1)*gapX)/2, y0 = 96;
  for(let r=0;r<rows;r++){
    for(let c=0;c<cols;c++){
      // 後列（r=0）は分厚い書類束＝複数ヒットで倒す固い敵（波が進むほど硬い）
      const tough = (r === 0);
      const hp = tough ? 1 + Math.min(2, n) : 1;   // 2〜3発
      enemies.push({
        x: x0 + c*gapX, y: y0 + r*gapY, w: 26, h: 20, alive: true,
        kind: r % 3, pt: (rows - r) * 10 + (tough ? 20 : 0), f: 0,
        hp: hp, maxhp: hp, hurt: 0
      });
    }
  }
  dir = 1; stepTimer = 0;
}

function makeBoss(){
  bossObj = { x: W/2, y: 110, w: 86, h: 94, hp: 70, max: 70, t: 0, cool: 60, hurt: 0, next: 55, phase: 1 };
}

// ボス撃破時：第一→第二→第三形態と復活し、第三を倒すと勝利
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
  } else if(b.phase === 2){
    b.phase = 3;
    b.hp = b.max = 90;          // 第三形態はさらにHP増
    b.next = b.max - 15;
    b.hurt = 18; b.cool = 90;
    b.t = 0;
    b.beamState = 0; b.beamCool = 130; b.beamT = 0; b.beamX = b.x;   // 鼻ビーム初期化
    score += 500; shake = 22; flash = 14;
    setMsg('第三形態！鼻からたま・ビーム', 150);
    beep(220, .5, 'sawtooth', .06); beep(330, .5, 'square', .05); beep(160, .6, 'triangle', .05);
  } else {
    state = 'win'; score += 1000; shake = 20; beep(880, .5, 'triangle', .06);
  }
}

function reset(){
  wave = 1; score = 0; lives = 3;
  ki = 45; charge = 0; beam = null; flash = 0; items = [];
  player = newPlayer(); bullets = []; ebullets = []; missiles = []; bossObj = null;
  makeWave(1); state = 'play'; setMsg('第一波　申請書類の群れ', 90);
  bgmSet('normal', true);   // ゲーム開始（タップ／キー操作）と同時にBGM開始＝自動再生規制を回避
}

function setMsg(t, f){ msg = t; msgTimer = f; }

/* ---------- 音 ---------- */
let ac = null, audioPrimed = false;
// 端末のオーディオ規制を解除（最初のタップ／キー操作で必ず呼ぶ）
function unlockAudio(){
  try{
    if(!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
    if(ac.state === 'suspended') ac.resume();   // 効果音（WebAudio）の再開
  }catch(e){}
  if(audioPrimed) return;                        // BGMのアンロックは一度だけ
  audioPrimed = true;
  // BGMは単一の<audio>を使い、ジェスチャ内で一度再生して解錠する。
  // （iOSは1ジェスチャで解錠できる要素が限られるため、要素を1つに統一）
  try{
    const a = bgmAudioEl();
    if(!a.src){ a.src = BGM.normal.file; }
    a.play().then(()=>{ if(!curTrack){ try{ a.pause(); }catch(e){} } }).catch(()=>{});
  }catch(e){}
}
function beep(freq, dur, type='square', vol=.05){
  try{
    if(!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
    if(ac.state === 'suspended') ac.resume();
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.value = vol; o.connect(g); g.connect(ac.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(.0001, ac.currentTime + dur);
    o.stop(ac.currentTime + dur);
  }catch(e){}
}

/* ---------- BGM（通常＝申請書類の雪崩／ボス戦＝専用曲） ---------- */
// iOSでは1ジェスチャで解錠できるメディア要素が限られるため、
// 複数の<audio>を持たず、単一要素の src を差し替えて曲を切り替える。
const BGM = {
  normal: { file: 'assets/paperavalanche.mp3', vol: .45 },
  boss:   { file: 'assets/boss-theme.mp3',     vol: .5  }
};
let muted = false, curTrack = null, bgmAudio = null;
function bgmAudioEl(){
  if(!bgmAudio){
    bgmAudio = new Audio();
    bgmAudio.loop = true; bgmAudio.preload = 'auto';
  }
  return bgmAudio;
}
function bgmSet(name, restart){
  curTrack = name;
  if(muted) return;
  const t = BGM[name];
  if(!t) return;
  try{
    const a = bgmAudioEl();
    const want = new URL(t.file, location.href).href;
    if(a.src !== want){ a.src = t.file; }               // 曲を差し替え（＝先頭から）
    else if(restart){ try{ a.currentTime = 0; }catch(e){} }
    a.volume = t.vol;
    a.play().catch(()=>{});   // 端末のミュート等で失敗しても無視
  }catch(e){}
}
function bgmStop(){ if(bgmAudio){ try{ bgmAudio.pause(); }catch(e){} } }
function toggleMute(){
  muted = !muted;
  if(muted) bgmStop();
  else if(state === 'play') bgmSet(curTrack || 'normal', false);   // 消音前の曲を再開
  return muted;
}

/* ---------- 入力 ---------- */
const keys = {};
addEventListener('keydown', e=>{
  unlockAudio();
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

let touchX = null, movePtr = null, chargePtr = null, firePtr = null;
function pos(e){
  const r = cv.getBoundingClientRect();
  return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
}
function inBtn(p){
  return p.x > BTN.x-8 && p.x < BTN.x+BTN.w+8 && p.y > BTN.y-8 && p.y < BTN.y+BTN.h+8;
}
function inFire(p){
  return p.x > FIRE.x-8 && p.x < FIRE.x+FIRE.w+8 && p.y > FIRE.y-8 && p.y < FIRE.y+FIRE.h+8;
}
function inMute(p){
  return p.x > MUTE.x-8 && p.x < MUTE.x+MUTE.w+8 && p.y > MUTE.y-8 && p.y < MUTE.y+MUTE.h+8;
}
cv.addEventListener('pointerdown', e=>{
  unlockAudio();
  const p = pos(e);
  cv.setPointerCapture(e.pointerId);
  if(inMute(p)){ toggleMute(); return; }   // ミュート切替（開始前でも押せる）
  if(state !== 'play'){ tap(); return; }
  if(inBtn(p) && chargePtr === null){ chargePtr = e.pointerId; return; }
  if(inFire(p) && firePtr === null){ firePtr = e.pointerId; shoot(); return; }   // その場撃ち（動かない）
  movePtr = e.pointerId; touchX = p.x; shoot();
});
cv.addEventListener('pointermove', e=>{ if(e.pointerId === movePtr) touchX = pos(e).x; });
function ptrEnd(e){
  if(e.pointerId === chargePtr) chargePtr = null;
  if(e.pointerId === firePtr) firePtr = null;
  if(e.pointerId === movePtr){ movePtr = null; touchX = null; }
}
cv.addEventListener('pointerup', ptrEnd);
cv.addEventListener('pointercancel', ptrEnd);

function tap(){
  if(state === 'title' || state === 'over' || state === 'win'){ reset(); return; }
  if(state === 'play') shoot();
}

function wingOffsets(){
  // 分身の左右オフセット（1機＝左、2機＝左右）
  return player.wings === 1 ? [-26] : player.wings >= 2 ? [-26, 26] : [];
}
function shoot(){
  if(player.cool > 0 || charge > 0 || state !== 'play') return;
  const pierce = player.pierceT > 0;
  const n = 1 + player.sub * 2;               // 副印で2WAY→3WAY→5WAY
  for(let i=0;i<n;i++){
    const off = (i - (n-1)/2);
    bullets.push({ x: player.x + off*4, y: player.y - 12, w: 4, h: 10, vx: off*1.5, pierce });
  }
  // 分身（僚機）はまっすぐ1発ずつ援護射撃
  for(const wx of wingOffsets()){
    bullets.push({ x: player.x + wx, y: player.y - 8, w: 4, h: 10, vx: 0, pierce });
  }
  player.cool = player.rapidT > 0 ? 7 : 14;     // 速筆で連射
  beep(880, .06, 'square', .04);
}

/* ---------- パワーアップ ---------- */
function maybeDrop(x, y, rate){
  if(Math.random() > (rate === undefined ? .14 : rate)) return;
  // ITEMS順：副印/速筆/朱肉/受理印/回復薬/分身/貫通弾
  // 回復薬は満タン時は出さない。分身は最大時は出さない。
  const w = [17, 15, 14, 12,
             lives < MAX_LIVES ? 9 : 0,
             player.wings < MAX_WINGS ? 12 : 0,
             10];
  const total = w.reduce((a, b) => a + b, 0);
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
  else if(d.k === 'heal'){
    if(lives < MAX_LIVES){ lives++; setMsg('回復薬　ライフ＋1', 30); }
    else { score += 200; setMsg('回復薬　満タン（＋200）', 30); }
    beep(660, .1, 'triangle', .06); beep(990, .12, 'triangle', .05); beep(1320, .12, 'sine', .04);
    return;
  }
  else if(d.k === 'bunshin'){
    if(player.wings < MAX_WINGS){ player.wings++; setMsg('分身　僚機＋1', 28); }
    else { score += 150; setMsg('分身　最大（＋150）', 28); }
  }
  else if(d.k === 'pierce'){ player.pierceT = 660; setMsg('貫通弾', 26); }
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
  if(player.pierceT > 0) player.pierceT--;
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
  missiles = missiles.filter(m => Math.abs(m.x - b.x) > half);   // 必殺はミサイルも消す
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
  const holdFire = firePtr !== null;   // 迎撃ボタン押下中は足を止めて正面へ連射
  if(!holdFire){
    if(keys.ArrowLeft) player.x -= player.speed * mv;
    if(keys.ArrowRight) player.x += player.speed * mv;
  }
  if(holdFire){
    if(player.cool <= 0) shoot();        // その場撃ち（移動しない）
  } else if(touchX !== null){
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
  if(missiles.length) updateMissiles();

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
  for(const e of live){ if(e.hurt > 0) e.hurt--; }
  // 命中判定
  for(const b of bullets){
    for(const e of live){
      if(e.alive && Math.abs(b.x - e.x) < e.w/2 + 2 && Math.abs(b.y - e.y) < e.h/2 + 4){
        if(!b.pierce) b.dead = true;
        e.hp--;
        if(e.hp <= 0){                              // 撃破
          e.alive = false; score += e.pt;
          ki = Math.min(100, ki + 6); maybeDrop(e.x, e.y);
          beep(520, .07, 'square', .04);
        } else {                                    // 固い敵：ヒットしたが未撃破
          e.hurt = 4; score += 2; ki = Math.min(100, ki + 1);
          beep(360, .04, 'square', .03);
        }
        break;
      }
    }
  }
  bullets = bullets.filter(b => !b.dead);
}

function updateBoss(){
  const b = bossObj;
  const p3 = b.phase === 3;
  b.t += p3 ? 2 : 1;                       // 第三形態は動きも約2倍速
  b.x = W/2 + Math.sin(b.t/60) * (W/2 - 60);
  b.y = 110 + Math.sin(b.t/95) * 22;
  if(b.hurt > 0) b.hurt--;

  // 鼻の位置（第三形態の発射口）
  const noseX = b.x, noseY = b.y + (NOSE_REL_Y - .5) * b.h;

  b.cool--;
  if(b.cool <= 0){
    const rage = b.hp < b.max/2;
    if(p3){
      // 鼻から「たま」を2倍速で自機方向へ扇状に放つ
      b.cool = rage ? 24 : 36;
      const n = rage ? 5 : 4;
      const aim = Math.atan2(player.y - noseY, player.x - noseX);
      for(let i=0;i<n;i++){
        const a = aim + (i-(n-1)/2) * .30;
        ebullets.push({ x: noseX, y: noseY,
                        vx: Math.cos(a)*4.8, vy: Math.sin(a)*4.8, kind:1 });   // 4.8×1.5=7.2 ≒ 通常の2倍
      }
      beep(140, .1, 'sawtooth', .05);
    } else {
      b.cool = rage ? 42 : 62;
      const n = rage ? 5 : 3;
      for(let i=0;i<n;i++){
        const a = Math.PI/2 + (i-(n-1)/2) * .28;
        ebullets.push({ x: b.x, y: b.y + b.h/2 - 6,
                        vx: Math.cos(a)*2.4, vy: Math.sin(a)*2.4, kind:1 });
      }
      beep(180, .12, 'sawtooth', .05);
    }
  }

  // 第三形態：鼻からビーム（溜め→発射）
  if(p3) updateNoseBeam(b, noseX, noseY);

  // 復活形態（第二・第三）は各種ミサイルを発射
  if(b.phase >= 2){
    b.mslCool = (b.mslCool || 0) - 1;
    if(b.mslCool <= 0){
      b.mslCool = p3 ? 108 : 165;
      const count = p3 ? 2 : 1;
      const sx = p3 ? noseX : b.x, sy = p3 ? noseY : b.y + b.h/2 - 6;
      const pool = p3 ? ['homing','zigzag','splitter','armored'] : ['homing','zigzag'];
      for(let i=0;i<count;i++){
        const kind = pool[Math.floor(Math.random() * pool.length)];
        const aim = Math.atan2(player.y - sy, player.x - sx);
        spawnMissile(sx, sy, kind, aim, p3);
      }
      beep(520, .12, 'square', .04);
    }
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

// 第三形態：鼻から縦ビーム（溜め→発射）。発射中に自機がライン上にいれば被弾
function updateNoseBeam(b, noseX, noseY){
  if(!b.beamState){
    b.beamCool--;
    if(b.beamCool <= 0){ b.beamState = 'charge'; b.beamT = 46; b.beamX = noseX; beep(320, .5, 'sine', .04); }
    return;
  }
  b.beamT--;
  if(b.beamState === 'charge'){
    b.beamX = noseX;                       // 溜め中は鼻に追従（発射で固定）
    if(b.beamT <= 0){ b.beamState = 'fire'; b.beamT = 36; shake = 12; beep(90, .5, 'sawtooth', .07); }
  } else if(b.beamState === 'fire'){
    if(player.inv <= 0 && Math.abs(player.x - b.beamX) < 13 && player.y > noseY){
      if(player.shield){
        player.shield = false; player.inv = 60; shake = 8;
        setMsg('受理印が受け止めた', 26); beep(300, .18, 'triangle', .05);
      } else {
        lives--; player.inv = 90; shake = 16; beep(120, .3, 'sawtooth', .07);
        if(lives <= 0){ state = 'over'; setMsg('', 0); }
      }
    }
    if(b.beamT <= 0){ b.beamState = 0; b.beamCool = 150; }
  }
}

// ミサイル生成（種類ごとに挙動を変える）
// homing=追尾／zigzag=蛇行／splitter=分裂／armored=重装甲(2発耐久)
function spawnMissile(x, y, kind, aim, p3){
  const m = { x, y, kind, t: 0, dead: false, hp: 1,
              vx: Math.cos(aim)*1.4, vy: Math.sin(aim)*1.4, spd: 2.2, life: 320 };
  if(kind === 'homing'){   m.spd = p3 ? 2.5 : 2.1; m.turn = p3 ? .06 : .05; }
  else if(kind === 'zigzag'){ m.spd = p3 ? 2.3 : 2.0; m.phase = Math.random()*6.28; m.amp = 2.8; }
  else if(kind === 'splitter'){ m.spd = 2.1; m.vx = Math.cos(aim)*m.spd; m.vy = Math.sin(aim)*m.spd; m.fuse = p3 ? 48 : 60; }
  else if(kind === 'armored'){ m.spd = p3 ? 1.8 : 1.6; m.turn = .045; m.hp = 2; m.life = 380; }
  missiles.push(m);
}

// ミサイル更新：種類別に動かし、自弾で撃墜可・必殺で消去可
function updateMissiles(){
  const burst = [];   // 分裂で生成する敵弾を後でまとめて追加
  for(const m of missiles){
    m.t++;
    if(m.kind === 'zigzag'){
      // 蛇行しながら降下＋自機側へわずかに寄る
      const dx = Math.sin(m.t * .16 + m.phase) * m.amp + Math.sign(player.x - m.x) * .5;
      m.x += dx; m.y += m.spd; m.vx = dx; m.vy = m.spd;
    } else if(m.kind === 'splitter'){
      m.x += m.vx; m.y += m.vy;
      m.fuse--;
      if(m.fuse <= 0){
        // 自機方向へ扇状に分裂
        const aim = Math.atan2(player.y - m.y, player.x - m.x), n = 5;
        for(let i=0;i<n;i++){
          const a = aim + (i - (n-1)/2) * .34;
          burst.push({ x: m.x, y: m.y, vx: Math.cos(a)*2.2, vy: Math.sin(a)*2.2, kind: 1 });
        }
        m.dead = true; shake = 6; beep(300, .12, 'square', .05);
        continue;
      }
    } else {
      // homing / armored：自機へ緩やかに旋回（旋回上限＝避けられる）
      const desired = Math.atan2(player.y - m.y, player.x - m.x);
      let cur = Math.atan2(m.vy, m.vx);
      let diff = desired - cur;
      while(diff > Math.PI) diff -= Math.PI*2;
      while(diff < -Math.PI) diff += Math.PI*2;
      cur += Math.max(-m.turn, Math.min(m.turn, diff));
      m.vx = Math.cos(cur) * m.spd; m.vy = Math.sin(cur) * m.spd;
      m.x += m.vx; m.y += m.vy;
    }
    m.life--;
    // 自機に被弾
    if(player.inv <= 0 && Math.abs(m.x - player.x) < 14 && Math.abs(m.y - player.y) < 13){
      m.dead = true;
      if(player.shield){
        player.shield = false; player.inv = 60; shake = 8;
        setMsg('受理印が受け止めた', 26); beep(300, .18, 'triangle', .05);
      } else {
        lives--; player.inv = 90; shake = 15; beep(120, .3, 'sawtooth', .07);
        if(lives <= 0){ state = 'over'; setMsg('', 0); }
      }
    }
    // 自弾で撃墜（重装甲は2発必要）
    if(!m.dead){
      for(const bl of bullets){
        if(!bl.dead && Math.abs(bl.x - m.x) < 9 && Math.abs(bl.y - m.y) < 10){
          bl.dead = true; m.hp--;
          if(m.hp <= 0){ m.dead = true; score += 8; ki = Math.min(100, ki + 1); beep(560, .05, 'square', .03); }
          else { score += 3; m.hurt = 4; beep(400, .04, 'square', .03); }
          break;
        }
      }
    }
    if(m.hurt > 0) m.hurt--;
  }
  if(burst.length) ebullets.push(...burst);
  bullets = bullets.filter(bl => !bl.dead);
  missiles = missiles.filter(m => !m.dead && m.life > 0 &&
                                  m.x > -24 && m.x < W+24 && m.y > -24 && m.y < H+24);
}

/* ---------- 描画 ---------- */
const MSL_COL = { homing:'#c0392b', zigzag:'#d8b45c', splitter:'#2e8b8b', armored:'#7f8a99' };
function drawMissiles(){
  for(const m of missiles){
    const ang = Math.atan2(m.vy || 1, m.vx || 0);
    const big = m.kind === 'armored';
    const bw = big ? 13 : 11, bh = big ? 8 : 6;
    let body = MSL_COL[m.kind] || '#c0392b';
    if(m.hurt > 0) body = '#ede4d3';   // 被弾フラッシュ（重装甲）
    ctx.save();
    ctx.translate(m.x, m.y); ctx.rotate(ang);
    // 噴射炎
    ctx.fillStyle = 'rgba(216,180,92,' + (.5 + .4*Math.abs(Math.sin(frame/3))) + ')';
    ctx.beginPath(); ctx.moveTo(-6,0); ctx.lineTo(-12,-2.6); ctx.lineTo(-12,2.6); ctx.closePath(); ctx.fill();
    // 弾体
    ctx.fillStyle = body; ctx.fillRect(-6, -bh/2, bw, bh);
    // 弾頭
    ctx.fillStyle = '#ede4d3';
    ctx.beginPath(); ctx.moveTo(-6+bw, -bh/2); ctx.lineTo(-6+bw+5, 0); ctx.lineTo(-6+bw, bh/2); ctx.closePath(); ctx.fill();
    if(big){   // 重装甲は装甲リベット
      ctx.fillStyle = '#3a4250'; ctx.fillRect(-4, -bh/2+1, 2, bh-2); ctx.fillRect(0, -bh/2+1, 2, bh-2);
    }
    if(m.kind === 'splitter' && m.fuse < 22 && Math.floor(m.fuse/3) % 2){   // 分裂間近は点滅
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(1, 0, 2.4, 0, Math.PI*2); ctx.fill();
    }
    ctx.restore();
  }
}
function drawDoc(e){
  const x = e.x - e.w/2, y = e.y - e.h/2;
  const tough = e.maxhp > 1;
  if(tough){
    // 分厚い書類束：重なりで厚みを表現＋青系の別色
    ctx.fillStyle = '#243a63';
    ctx.fillRect(x+3, y+3, e.w, e.h);
    ctx.fillStyle = '#33517f';
    ctx.fillRect(x+1.5, y+1.5, e.w, e.h);
  }
  let tint = tough ? '#6d86b8' : ['#ede4d3', '#dfd3bd', '#cfc0a6'][e.kind];
  if(e.hurt > 0) tint = '#ffffff';                 // 被弾フラッシュ
  ctx.fillStyle = tint;
  ctx.fillRect(x, y, e.w, e.h);
  ctx.fillStyle = '#16233f';
  ctx.beginPath(); ctx.moveTo(x+e.w-7, y); ctx.lineTo(x+e.w, y); ctx.lineTo(x+e.w, y+7); ctx.fill();
  ctx.fillStyle = tough ? 'rgba(237,244,255,.55)' : 'rgba(22,35,63,.55)';
  for(let i=0;i<3;i++) ctx.fillRect(x+4, y+5 + i*5 + (e.f?0:1), e.w-10 - (i===2?6:0), 1.5);
  ctx.strokeStyle = tough ? '#c0392b' : '#b8912f'; ctx.lineWidth = tough ? 1.5 : 1;
  ctx.strokeRect(x+.5, y+.5, e.w-1, e.h-1);
  if(tough){
    // 束ねる朱の帯＋残り耐久ピップ
    ctx.fillStyle = '#c0392b'; ctx.fillRect(x, y+e.h/2-1.5, e.w, 3);
    for(let i=0;i<e.hp;i++){ ctx.fillStyle = '#c0392b'; ctx.fillRect(x+3+i*4, y+2, 2.5, 2.5); }
  } else {
    ctx.fillStyle = '#c0392b';
    ctx.beginPath(); ctx.arc(x+e.w-6, y+e.h-5, 2.6, 0, Math.PI*2); ctx.fill();
  }
}

function drawSealShip(x, y, scale, alpha){
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y); ctx.scale(scale, scale);
  ctx.fillStyle = '#b8912f'; ctx.fillRect(-4, -2, 8, 16);       // 柄
  ctx.fillStyle = '#d8b45c'; ctx.fillRect(-14, -12, 28, 12);    // 印面
  ctx.fillStyle = '#16233f'; ctx.font = '9px "Yu Mincho",serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('認', 0, -5.5);
  ctx.restore();
}
function drawPlayer(){
  const blink = player.inv > 0 && Math.floor(player.inv/5) % 2;
  // 分身（僚機）を左右に描画（本体点滅中も表示）
  for(const wx of wingOffsets()){
    drawSealShip(player.x + wx, player.y + 2, .68, .9);
  }
  if(blink) return;
  drawSealShip(player.x, player.y, 1, 1);
}

function drawBoss(){
  const b = bossObj;
  const p2 = b.phase === 2, p3 = b.phase === 3;
  const img = p3 ? boss3 : (p2 ? boss2 : boss);
  const ready = p3 ? boss3Ready : (p2 ? boss2Ready : bossReady);
  const frameCol = p3 ? '#8e44ad' : '#c0392b';   // 第三形態は紫枠
  const x = b.x - b.w/2, y = b.y - b.h/2;
  if(p3) drawNoseBeam(b);   // ビームは顔の背面から
  if(ready){
    if(b.hurt > 0){ ctx.globalAlpha = .55; }
    ctx.drawImage(img, x, y, b.w, b.h);
    ctx.globalAlpha = 1;
    if(p2 || p3){   // 復活形態は枠で囲う
      ctx.strokeStyle = frameCol; ctx.lineWidth = 2;
      ctx.strokeRect(x+1, y+1, b.w-2, b.h-2);
    }
  } else {
    ctx.fillStyle = '#ede4d3';
    ctx.fillRect(x, y, b.w, b.h);
  }
  // HPバー
  const bw = 200, bx = (W-bw)/2, by = 26;
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(bx, by, bw, 8);
  ctx.fillStyle = p3 ? '#8e44ad' : (p2 ? '#c0392b' : '#b8912f'); ctx.fillRect(bx, by, bw * b.hp/b.max, 8);
  ctx.strokeStyle = 'rgba(237,228,211,.7)'; ctx.lineWidth = 1;
  ctx.strokeRect(bx+.5, by+.5, bw-1, 7);
  ctx.fillStyle = '#d8b45c'; ctx.font = '9px system-ui,sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(p3 ? '所長の秘蔵っ子　第三形態' : (p2 ? '所長　三宅 晴久（本気）' : '所長　三宅 晴久'), W/2, by - 6);
}

// 鼻からの縦ビーム描画（溜め＝細い警告線／発射＝太い光条）
function drawNoseBeam(b){
  if(!b.beamState) return;
  const noseY = b.y + (NOSE_REL_Y - .5) * b.h, x = b.beamX;
  ctx.save();
  if(b.beamState === 'charge'){
    const a = .3 + .5 * Math.abs(Math.sin(frame/4));
    ctx.strokeStyle = 'rgba(142,68,173,' + a + ')'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x, noseY); ctx.lineTo(x, H); ctx.stroke();
  } else {
    const g = ctx.createLinearGradient(x-13, 0, x+13, 0);
    g.addColorStop(0, 'rgba(142,68,173,0)');
    g.addColorStop(.5, 'rgba(200,140,240,.92)');
    g.addColorStop(1, 'rgba(142,68,173,0)');
    ctx.fillStyle = g; ctx.fillRect(x-13, noseY, 26, H-noseY);
    ctx.fillStyle = 'rgba(255,245,255,.95)'; ctx.fillRect(x-2.5, noseY, 5, H-noseY);
  }
  ctx.restore();
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

function drawFireBtn(){
  const b = FIRE, on = firePtr !== null;
  ctx.save();
  ctx.globalAlpha = on ? 1 : .55;
  ctx.fillStyle = on ? 'rgba(216,180,92,.4)' : 'rgba(184,145,47,.15)';
  ctx.fillRect(b.x, b.y, b.w, b.h);
  ctx.strokeStyle = '#d8b45c'; ctx.lineWidth = 1.5;
  ctx.strokeRect(b.x+.5, b.y+.5, b.w-1, b.h-1);
  // 上向き矢印（正面へ撃つ）
  const cx = b.x+b.w/2, cy = b.y+b.h/2-4;
  ctx.fillStyle = '#ede4d3';
  ctx.beginPath();
  ctx.moveTo(cx, cy-9); ctx.lineTo(cx-7, cy+1); ctx.lineTo(cx-2.5, cy+1);
  ctx.lineTo(cx-2.5, cy+8); ctx.lineTo(cx+2.5, cy+8); ctx.lineTo(cx+2.5, cy+1);
  ctx.lineTo(cx+7, cy+1); ctx.closePath(); ctx.fill();
  ctx.font = '7px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('その場撃ち', b.x+b.w/2, b.y+b.h-6);
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
  if(d.k === 'heal'){   // 回復薬は右上に小さな十字（回復の記号）
    ctx.fillStyle = '#3aa76d';
    ctx.fillRect(r-5, -r+1, 4, 1.4); ctx.fillRect(r-4.3, -r+.3, 1.4, 4);
  }
  ctx.restore();
}

function drawChips(){
  const on = [];
  if(player.sub > 0)     on.push({ d: ITEMS[0], t: player.subT/900,   n: 1 + player.sub*2 });
  if(player.rapidT > 0)  on.push({ d: ITEMS[1], t: player.rapidT/780 });
  if(player.shield)      on.push({ d: ITEMS[3], t: 1 });
  if(player.wings > 0)   on.push({ d: ITEMS[5], t: 1, tag: player.wings + '機' });
  if(player.pierceT > 0) on.push({ d: ITEMS[6], t: player.pierceT/660 });
  on.forEach((o, i)=>{
    const x = 8 + i*40, y = H-52;
    ctx.fillStyle = 'rgba(14,23,48,.6)'; ctx.fillRect(x, y, 36, 14);
    ctx.strokeStyle = o.d.col; ctx.lineWidth = 1; ctx.strokeRect(x+.5, y+.5, 35, 13);
    ctx.fillStyle = o.d.col; ctx.font = '9px "Yu Mincho",serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(o.d.label + (o.tag ? o.tag : (o.n ? o.n + '発' : (o.d.k === 'shield' ? '1枚' : ''))), x+4, y+7);
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
    drawMissiles();
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
    drawFireBtn();
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
      {t:'書類インベーダー　v10', s:24, gap:30},
      {t:'押し寄せる申請書類を、認印で捌く。', s:12, c:'rgba(237,228,211,.75)', gap:22},
      {t:'必殺・朱印一閃　気力を貯めて放つ', s:12, c:'#c0392b', gap:22},
      {t:'印を拾って強化：副印・速筆・朱肉・受理印・回復薬', s:10, c:'rgba(237,228,211,.7)', gap:18},
      {t:'分身で僚機・貫通弾も', s:10, c:'#5aa9e6', gap:22},
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
  // ビルド確認用（キャッシュ判別）：左上に小さく表示
  ctx.fillStyle = 'rgba(237,228,211,.28)'; ctx.font = '7px system-ui,sans-serif';
  ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('v10', 5, 9);
  ctx.restore();
}

function loop(){
  update(); draw();
  if(state !== 'play') bgmStop();   // クリア/ゲームオーバー/タイトルで停止
  requestAnimationFrame(loop);
}
resize(); player = newPlayer(); bullets = []; ebullets = []; enemies = [];
loop();
