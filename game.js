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

// 中ボス（2面クリア後に出現するイカ型の魔物）
const midboss = new Image();
let midbossReady = false;
midboss.onload = ()=> midbossReady = true;
midboss.src = "assets/midboss.png";

// 裏面の中ボス（交際費の女将／ラウンジのママ）
const kousai = new Image();
let kousaiReady = false;
kousai.onload = ()=> kousaiReady = true;
kousai.src = "assets/kousai.png";

// 裏面の中ボス（税務調査官／認印を振りかざす所長タイプ）
const chosa = new Image();
let chosaReady = false;
chosa.onload = ()=> chosaReady = true;
chosa.src = "assets/chosa.png";

// 裏面のザコ（税務調査官風のピクセルキャラ4種）
const ZAKO = [new Image(), new Image(), new Image(), new Image()];
const ZAKO_READY = [false, false, false, false];
ZAKO.forEach((im, i)=>{ im.onload = ()=> ZAKO_READY[i] = true; im.src = 'assets/zako' + (i+1) + '.png'; });

// 裏面ボスの昇格ラダー（税務署の役職6段階）
const RANK_IMG = [0,1,2,3,4,5].map(()=> new Image());
const RANK_READY = [false, false, false, false, false, false];
RANK_IMG.forEach((im, i)=>{ im.onload = ()=> RANK_READY[i] = true; im.src = 'assets/rank' + (i+1) + '.png'; });
const RANK_NAME = ['国税調査官', '上席国税調査官', '統括国税調査官', '特別国税調査官', '副署長', '税務署長'];
const RANK_ASP  = [0.566, 0.713, 0.897, 0.816, 0.547, 0.925];   // 幅/高さ
const RANK_LINES = [
  ['この経費、説明できますか？', '記録はありますか？', '……確認します'],
  ['帳簿を見せてください', '数字が合いませんね', '見過ごせません'],
  ['認印の重み、分かるか？', '追徴、覚悟せよ', 'まだ終わらんぞ'],
  ['隠しても無駄だ', '証拠は挙がっている', '逃がさん'],
  ['副署長として看過できません', '厳正に調査します', '観念なさい'],
  ['税務署長だ。逃げ場はない', '国税の威信にかけて', '……見のがさん']
];

let state = 'title';       // title | play | over | win | uraAsk
let wave = 1, score = 0, lives = 3;
let ura = false, uraStage = 0, allClear = false;   // 裏面（全100面・雑魚のみ・面ごとに難化）
let best = { score: 0, ura: 0 };                   // 自己ベスト（localStorage）
let combo = 0, comboT = 0, pops = [], scoreMul = 1;   // コンボ／スコアポップ／控除倍率
let player, bullets, ebullets, enemies, bossObj, msg = '', msgTimer = 0;
let missiles = [];   // ボスの誘導ミサイル
let barriers = [];   // 防壁（積み上げた書類の壁）＝ステージによって出現。撃つと崩れる
let bgPhrase = '', bgPhraseT = 0;   // 税務ワードの背景表示（ボス戦以外）
let midDone = false;   // 中ボスを倒したか
let introT = 0, introMax = 0, introBlots = [];   // ラスボス登場演出
let morphT = 0, morphMax = 0, morphBlots = [], morphCol = '#c0392b', morphInk = '#4e0a0c';   // 形態変化演出
let overT = 0, overMax = 0, overParts = [], deadX = 0, deadY = 0;   // ゲームオーバー演出
let winT = 0, winMax = 0;   // クリア演出（暗転→しっかり納税）
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
  { k:'etax',   label:'e', name:'e-Tax',   col:'#39c8c0' },  // 超連射
  { k:'kojo',   label:'控', name:'税額控除', col:'#e0b83a' }   // 一定時間スコア2倍
];
const MAX_LIVES = 5, MAX_WINGS = 2;
const STAGE_NAMES = ['', '領収書の山', '請求書の束', '帳簿の海', '年末調整', '確定申告'];
const BTN = { x: W-56, y: H-116, w: 48, h: 48 };
const MUTE = { x: W-30, y: 8, w: 22, h: 22 };   // 右上のミュート切替
const PAUSE = { x: W-58, y: 8, w: 22, h: 22 };   // 一時停止（ミュートの左隣）
let paused = false;
const EBULLET_SPEED = 1.5;                        // 敵弾（球）の速度倍率

function newPlayer(){
  return { x: W/2, y: H-42, w: 30, h: 20, speed: 4.6, cool: 0, inv: 0,
           sub: 0, subT: 0, rapidT: 0, shield: 0,
           wings: 0, inkT: 0, etaxT: 0, kojoT: 0 };
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
  // 第三・四面は防壁（書類の壁）を配置
  if(n === 3 || n === 4) buildBarriers(3, 1); else barriers = [];
  dir = 1; stepTimer = 0;
}

/* ---------- 裏面（全100面・雑魚のみ・面ごとに難化） ---------- */
// 全部が雑魚キャラだが、面が進むほど硬く・速く・弾も多彩に。
// 一部の敵は隊列を離れて独立移動（フロート）する＝動きが多彩。
function makeUraWave(n){
  enemies = [];
  const cols = 7, rows = Math.min(3 + Math.floor(n/6), 5);
  const gapX = 42, gapY = 32, x0 = (W - (cols-1)*gapX)/2, y0 = 84;
  const baseHp = 1 + Math.floor(n/16);               // 面が進むと基礎HP増
  for(let r=0;r<rows;r++){
    for(let c=0;c<cols;c++){
      const tough = (r === 0);
      const sprite = (r*2 + c) % 4;
      let hp = baseHp + (tough ? 1 + Math.min(2, Math.floor(n/8)) : 0);
      const e = { x: x0 + c*gapX, y: y0 + r*gapY, w: 26, h: 20, alive: true,
                  kind: (r + c) % 3, sprite: sprite, pt: 20 + n, f: 0,
                  hp: hp, maxhp: hp, hurt: 0, float: false };
      // sprite別の特性
      if(sprite === 1){ e.hp += 1; e.maxhp += 1; }     // 黒クリップボード＝装甲（硬い）
      if(sprite === 3){ e.pt += 15; }                  // 帳簿＝高得点
      if(sprite === 0){                                // カバン＝機動（常にフロートで大きく蛇行）
        e.float = true; e.t = Math.floor(Math.random()*100);
        e.amp = 34 + Math.random()*40;
        e.cx = Math.max(16 + e.amp, Math.min(W - 16 - e.amp, e.x));
        e.fx = 0.025 + Math.random()*0.03;
        e.phase = Math.random()*6.28;
        e.vy = 0.14 + n*0.007 + Math.random()*0.10;    // ゆっくり降下（面が進むと速い）
      }
      enemies.push(e);
    }
  }
  // 裏面は3面ごとに防壁を配置。面が進むと硬く・数も増える
  if(n % 3 === 2) buildBarriers(Math.min(4, 3 + Math.floor(n/50)), 1 + Math.floor(n/40));
  else barriers = [];
  dir = 1; stepTimer = 0;
}
function startUra(){
  ura = true; uraStage = 1; allClear = false;
  bossObj = null; missiles = []; ebullets = []; bullets = []; beam = null; charge = 0;
  winT = 0; morphT = 0; introT = 0; overT = 0;
  lives = Math.min(MAX_LIVES, lives + 1);   // 突入ボーナスで1UP
  player.inv = 90;
  makeUraWave(1); state = 'play';
  setMsg('裏一面　修羅の申告', 100);
  bgmSet('boss', true);
}
function uraAllClear(){
  ura = false; allClear = true; score += 5000; saveBest();
  bgmStop(); state = 'win';
}
// 独立移動の敵（フロート）を更新
function updateFloaters(live){
  for(const e of live){
    if(!e.float) continue;
    e.t = (e.t || 0) + 1;
    e.x = e.cx + Math.sin(e.t*e.fx + e.phase) * e.amp;
    e.y += e.vy;
    e.f = Math.floor(e.t/12) % 2;
    if(e.y > H - 64){ gameOver(); return; }
  }
}
// 敵の発射（裏面は面数で激化・多彩化：直下／狙い撃ち／扇状）
function enemyFire(live){
  let rate, bspd, aimCh;
  if(ura){
    rate  = Math.min(.10, .02 + uraStage*.004);
    bspd  = Math.min(5.2, 2.6 + uraStage*.06);
    aimCh = Math.min(.85, .2 + uraStage*.03);
  } else {
    rate = .012 + wave*.006; bspd = 2.6 + wave*.2; aimCh = 0;
  }
  if(Math.random() < rate){
    const s = live[Math.floor(Math.random()*live.length)];
    if(ura && Math.random() < aimCh){                 // 自機を狙う
      const a = Math.atan2(player.y - s.y, player.x - s.x);
      ebullets.push({ x: s.x, y: s.y + 12, vx: Math.cos(a)*bspd/EBULLET_SPEED, vy: Math.sin(a)*bspd/EBULLET_SPEED, kind:1 });
    } else {
      ebullets.push({ x: s.x, y: s.y + 12, vy: bspd/EBULLET_SPEED, kind: ura ? 1 : 0 });
    }
  }
  if(ura && uraStage >= 12 && Math.random() < .006 + uraStage*.0006){   // 扇状の一斉射撃
    const s = live[Math.floor(Math.random()*live.length)];
    const a0 = Math.atan2(player.y - s.y, player.x - s.x), n = 3;
    for(let i=0;i<n;i++){
      const a = a0 + (i-(n-1)/2)*.3;
      ebullets.push({ x: s.x, y: s.y + 10, vx: Math.cos(a)*bspd/EBULLET_SPEED, vy: Math.sin(a)*bspd/EBULLET_SPEED, kind:1 });
    }
    beep(200, .08, 'sawtooth', .04);
  }
  // メガネ星バッジ＝射撃特化：自機を狙って追加で撃つ
  if(ura){
    const snipers = live.filter(e => e.sprite === 2);
    if(snipers.length && Math.random() < .02 + uraStage*.0022){
      const s = snipers[Math.floor(Math.random()*snipers.length)];
      const a = Math.atan2(player.y - s.y, player.x - s.x);
      ebullets.push({ x: s.x, y: s.y + 10, vx: Math.cos(a)*bspd/EBULLET_SPEED, vy: Math.sin(a)*bspd/EBULLET_SPEED, kind: 1 });
    }
  }
}
/* ---------- 防壁（積み上げた書類の壁）：ステージによって出現 ---------- */
// 小さなセルの集合。自弾・敵弾で1マスずつ崩れ、敵が触れても削れる。
function buildBarriers(count, cellHp){
  barriers = [];
  const cs = 7, cols = 6, rows = 4, bw = cols*cs;
  const y0 = H - 152;
  const margin = (W - count*bw) / (count + 1);
  for(let k=0;k<count;k++){
    const x0 = margin + k*(bw + margin);
    for(let r=0;r<rows;r++){
      for(let c=0;c<cols;c++){
        if(r >= rows-1 && (c === 2 || c === 3)) continue;   // 下中央にアーチの切り欠き
        barriers.push({ x: x0 + c*cs + cs/2, y: y0 + r*cs + cs/2, s: cs,
                        hp: cellHp, max: cellHp, alive: true });
      }
    }
  }
}
/* 文字の壁（裏面のみ・ランダム出現）：税務調査ワードが降ってくる障害物 */
const WALL_PHRASES = [
  '交際費 相手方必須','誰と飲んだ？','相手方を記録せよ','一人飲みは経費か？','私用飲食を見抜け',
  '会議費、本当ですか？','その接待、事業関連？','飲食相手が不明です','交際費判定中……','ゴルフの相手は誰だ！',
  '領収書を捨てるな！','証拠書類を保存せよ','宛名なしを発見！','但し書きが空白だ！','レシートでも保存！',
  '証憑不足で攻撃不能','その支払い、証拠は？','領収書が見つからない','記録なき経費は危険','電子データも保存せよ',
  '売上を漏らすな！','現金売上を記録せよ','通帳と売上が合わない','入金の正体は何だ？','売上除外を発見！',
  '売上計上はいつだ？','個人口座を確認せよ','現金商売に要注意','その入金、売上では？','期ズレを修正せよ！',
  'それ、本当に経費？','私用経費を排除せよ','家事費混入を発見！','家族旅行は経費不可','私物購入に要注意',
  '事業との関係を示せ','高額経費が接近中！','雑費に逃げるな！','使途不明金を発見！','説明できない経費あり',
  'それは外注？給与？','外注先の実態を確認','架空外注を撃破せよ','現金外注、証拠は？','請求書が足りない！',
  '源泉徴収を忘れるな','勤務実態を確認せよ','外注費判定中……','人工代の記録はある？','支払先を特定せよ',
  '申告期限が迫っている','納期限を守れ！','棚卸を忘れるな','未払金を確認せよ','前払費用を判定せよ',
  '減価償却を開始せよ','決算整理を完了せよ','期限後申告が接近中','延滞税が増殖中！','加算税ボス出現！',
  'この経費、説明できますか？','誰と、どこで、何のために？','元帳を見せてください','通帳も確認します','反面調査を開始します',
  '前年と比べて増えてます','この入金は何ですか？','原始資料はありますか？','個人口座も見せて','その処理、根拠は？'
];
// 税務ワードの背景表示（ボス戦以外・薄く大きく・数秒ごとに切替）
function drawBgPhrase(){
  if(!bgPhrase) return;
  const k = bgPhraseT;
  let a = 1;
  if(k < 34) a = k/34; else if(k > 186) a = (220-k)/34;   // フェードイン／アウト
  const n = bgPhrase.length, fs = Math.min(27, Math.floor((W-20)/n));
  ctx.save();
  ctx.globalAlpha = 0.34 * Math.max(0, a);
  ctx.fillStyle = '#f0e2b0';
  ctx.font = fs + 'px "Yu Mincho",serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(bgPhrase, W/2, H*0.60);
  ctx.restore();
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}

// 弾が防壁に当たったら1マス削る（当たれば true）
function hitBarrier(x, y, r){
  for(const c of barriers){
    if(!c.alive) continue;
    if(Math.abs(x - c.x) < c.s/2 + r && Math.abs(y - c.y) < c.s/2 + r){
      c.hp--; if(c.hp <= 0) c.alive = false;
      return true;
    }
  }
  return false;
}
function drawBarriers(){
  for(const c of barriers){
    if(!c.alive) continue;
    if(c.ch){   // 文字の壁（税務調査ワード）
      ctx.fillStyle = 'rgba(78,10,12,.72)';
      ctx.fillRect(c.x - c.s/2 - 1, c.y - c.s/2 - 1, c.s + 2, c.s + 2);
      ctx.strokeStyle = 'rgba(192,57,43,.9)'; ctx.lineWidth = 1;
      ctx.strokeRect(c.x - c.s/2 - .5, c.y - c.s/2 - .5, c.s + 1, c.s + 1);
      ctx.fillStyle = '#ffd23f';
      ctx.font = c.s + 'px "Yu Mincho",serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(c.ch, c.x, c.y + 1);
      continue;
    }
    ctx.fillStyle = (c.max > 1 && c.hp < c.max) ? '#8a6a1f' : '#cbb26a';
    ctx.fillRect(c.x - c.s/2, c.y - c.s/2, c.s, c.s);
    ctx.strokeStyle = 'rgba(122,86,14,.8)'; ctx.lineWidth = .5;
    ctx.strokeRect(c.x - c.s/2 + .25, c.y - c.s/2 + .25, c.s - .5, c.s - .5);
  }
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}

function inRect(p, r){ return p.x > r.x && p.x < r.x+r.w && p.y > r.y && p.y < r.y+r.h; }
const YESBTN = { x: W/2-92, y: H/2+50, w: 82, h: 34 };
const NOBTN  = { x: W/2+10, y: H/2+50, w: 82, h: 34 };
function handleUraAsk(p){
  if(inRect(p, YESBTN)) startUra();
  else if(inRect(p, NOBTN)) state = 'win';
}

function makeBoss(type, arg){
  barriers = [];   // ボス戦では防壁なし
  if(type === 'rank'){
    // 裏面ボスの昇格ラダー（役職が上がるほど大きく・タフ・攻撃的）
    const idx = arg | 0, asp = RANK_ASP[idx];
    const h = 150 + idx*8, w = h * asp, y = 46 + h/2;
    const hp = 90 + idx*40 + uraStage*4;
    bossObj = { type: 'rank', rank: idx, finale: uraStage === 100, x: W/2, y: y, y0: y, w: w, h: h, hp: hp, max: hp,
                t: 0, cool: Math.max(22, 56 - uraStage - idx*3), hurt: 0, next: hp - 12,
                mslCool: Math.max(70, 150 - uraStage - idx*8), spCool: Math.max(56, 120 - idx*8) };
    return;
  }
  if(type === 'mid'){
    // 中ボス：単形態。復活なし、鼻ビームなし
    bossObj = { type: 'mid', x: W/2, y: 96, y0: 96, w: 96, h: 73, hp: 50, max: 50,
                t: 0, cool: 70, hurt: 0, next: 35, mslCool: 130 };
  } else if(type === 'kousai'){
    // 裏面の中ボス：交際費の女将。面が進むほどHP・攻撃が激化
    const hp = 60 + uraStage * 4;
    bossObj = { type: 'kousai', x: W/2, y: 118, y0: 118, w: 104, h: 156, hp: hp, max: hp,
                t: 0, cool: Math.max(28, 60 - uraStage), hurt: 0, next: hp - 12,
                mslCool: Math.max(80, 150 - uraStage), spCool: 90 };
  } else if(type === 'chosa'){
    // 裏面の中ボス：税務調査官。女将よりややタフ
    const hp = 70 + uraStage * 4;
    bossObj = { type: 'chosa', x: W/2, y: 118, y0: 118, w: 124, h: 150, hp: hp, max: hp,
                t: 0, cool: Math.max(26, 58 - uraStage), hurt: 0, next: hp - 12,
                mslCool: Math.max(80, 145 - uraStage), spCool: 110 };
  } else if(type === 'kokuzei'){
    // 裏ラスボス：国税局長（裏100面の締め）。非常にタフで攻撃も激しい
    const hp = 720;
    bossObj = { type: 'kokuzei', x: W/2, y: 122, y0: 122, w: 152, h: 184, hp: hp, max: hp,
                t: 0, cool: 24, hurt: 0, next: hp - 12, mslCool: 96, spCool: 80 };
  } else {
    // ラスボス（所長）：3段階。HPは倍設定（歯ごたえ重視）
    bossObj = { type: 'last', x: W/2, y: 110, w: 86, h: 94, hp: 140, max: 140,
                t: 0, cool: 60, hurt: 0, next: 125, phase: 1 };
  }
}

// ボス撃破時：第一→第二→第三形態と復活し、第三を倒すと勝利
function bossDown(){
  const b = bossObj;
  if(b.phase === 1){
    b.phase = 2;
    b.hp = b.max = 160;         // 第二形態はHP増（倍）
    b.next = b.max - 15;
    b.hurt = 16; b.cool = 100;  // 復活直後は少し間を置く
    b.t = 0;
    score += 300; shake = 18; flash = 12;
    setMsg('所長、本気の顔で復活', 130);
    beep(200, .5, 'sawtooth', .06); beep(300, .5, 'square', .05);
    startMorph(2);   // 変身演出（朱墨）
    // BGMはボス曲を継続（頭出しし直したい場合は bgmSet('boss', true)）
  } else if(b.phase === 2){
    b.phase = 3;
    b.hp = b.max = 180;         // 第三形態はさらにHP増（倍）
    b.next = b.max - 15;
    b.hurt = 18; b.cool = 90;
    b.t = 0;
    b.beamState = 0; b.beamCool = 130; b.beamT = 0; b.beamX = b.x;   // 鼻ビーム初期化
    score += 500; shake = 22; flash = 14;
    setMsg('第三形態！鼻からたま・ビーム', 150);
    beep(220, .5, 'sawtooth', .06); beep(330, .5, 'square', .05); beep(160, .6, 'triangle', .05);
    startMorph(3);   // 変身演出（紫の墨）
  } else {
    startWinSeq();   // クリア演出（暗転→しっかり納税）
  }
}

function reset(){
  wave = 1; score = 0; lives = 3; midDone = false; introT = 0; morphT = 0; overT = 0; winT = 0;
  ura = false; uraStage = 0; allClear = false;
  ki = 45; charge = 0; beam = null; flash = 0; items = []; paused = false;
  combo = 0; comboT = 0; pops = []; scoreMul = 1;
  bgPhraseT = 0; bgPhrase = WALL_PHRASES[Math.floor(Math.random()*WALL_PHRASES.length)];
  player = newPlayer(); bullets = []; ebullets = []; missiles = []; bossObj = null;
  makeWave(1); state = 'play'; setMsg('第一面　' + STAGE_NAMES[1], 90);
  bgmSet('normal', true);   // ゲーム開始（タップ／キー操作）と同時にBGM開始＝自動再生規制を回避
}

function setMsg(t, f){ msg = t; msgTimer = f; }

function addPop(x, y, txt, col){ pops.push({ x, y, txt, col, t: 0 }); }
// 撃破スコア加算＋コンボ（控除で倍率、3コンボごとにボーナス）
function award(pt, x, y){
  combo++; comboT = 100;
  const total = pt * scoreMul + Math.floor(combo/3) * 3;
  score += total;
  if(x !== undefined) addPop(x, y, '+' + total, combo >= 5 ? '#ffd23f' : '#d8b45c');
  if(combo > 0 && combo % 10 === 0){ beep(180, .2, 'square', .06); addPop(W/2, H*0.42, combo + ' コンボ！', '#c0392b'); }
}
function loadBest(){
  try{ const b = JSON.parse(localStorage.getItem('shorui_best') || '{}'); best.score = b.score || 0; best.ura = b.ura || 0; }catch(e){}
}
function saveBest(){
  if(score > best.score) best.score = score;
  if(uraStage > best.ura) best.ura = uraStage;
  try{ localStorage.setItem('shorui_best', JSON.stringify(best)); }catch(e){}
}
function rankOf(s){
  if(s >= 15000) return { r:'S', c:'#ffd23f', m:'優良申告！所長も脱帽です' };
  if(s >= 8000)  return { r:'A', c:'#d8b45c', m:'期限内に完璧な申告' };
  if(s >= 4000)  return { r:'B', c:'#a9c68c', m:'まずまずの申告です' };
  return { r:'C', c:'#cfe0bd', m:'来年こそは早めの準備を' };
}

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
  if(e.code === 'KeyP' || e.code === 'Escape'){ togglePause(); e.preventDefault(); return; }
  if(paused) return;   // 停止中は他の入力を無視
  keys[e.code] = true;
  if(['ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
  if(state === 'uraAsk'){
    if(e.code === 'KeyY') startUra();
    else if(e.code === 'KeyN') state = 'win';
    return;
  }
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
function inPause(p){
  return p.x > PAUSE.x-8 && p.x < PAUSE.x+PAUSE.w+8 && p.y > PAUSE.y-8 && p.y < PAUSE.y+PAUSE.h+8;
}
function togglePause(){
  if(state !== 'play') return;
  paused = !paused;
  if(paused) bgmStop();
  else if(!muted) bgmSet(curTrack || 'normal', false);
}
cv.addEventListener('pointerdown', e=>{
  unlockAudio();
  const p = pos(e);
  cv.setPointerCapture(e.pointerId);
  if(inMute(p)){ toggleMute(); return; }   // ミュート切替（開始前でも押せる）
  if(inPause(p)){ togglePause(); return; }  // 一時停止／再開
  if(paused){ togglePause(); return; }      // 停止中は画面タップで再開
  if(state === 'uraAsk'){ handleUraAsk(p); return; }   // 裏面 突入 Yes/No
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

function wingOffsets(){
  // 分身の左右オフセット（1機＝左、2機＝左右）
  return player.wings === 1 ? [-26] : player.wings >= 2 ? [-26, 26] : [];
}
function shoot(){
  if(player.cool > 0 || charge > 0 || state !== 'play') return;
  const ink = player.inkT > 0, dmg = ink ? 2 : 1;   // 朱肉で強化弾（威力2）
  const n = 1 + player.sub * 2;               // 副印で2WAY→3WAY→5WAY
  for(let i=0;i<n;i++){
    const off = (i - (n-1)/2);
    bullets.push({ x: player.x + off*4, y: player.y - 12, w: 4, h: 10, vx: off*1.5, dmg, ink });
  }
  // 分身（僚機）はまっすぐ1発ずつ援護射撃
  for(const wx of wingOffsets()){
    bullets.push({ x: player.x + wx, y: player.y - 8, w: 4, h: 10, vx: 0, dmg, ink });
  }
  player.cool = player.etaxT > 0 ? 4 : (player.rapidT > 0 ? 7 : 14);   // e-Taxで超連射／速筆で連射
  beep(880, .06, 'square', .04);
}

/* ---------- パワーアップ ---------- */
function maybeDrop(x, y, rate){
  if(Math.random() > (rate === undefined ? .14 : rate)) return;
  // ITEMS順：副印/速筆/朱肉/受理印/回復薬/分身/e-Tax/税額控除
  // 回復薬は満タン時は出さない。分身は最大時は出さない。
  const w = [15, 13, 12, 11,
             lives < MAX_LIVES ? 8 : 0,
             player.wings < MAX_WINGS ? 11 : 0,
             9, 9];
  const total = w.reduce((a, b) => a + b, 0);
  let r = Math.random()*total, i = 0;
  while(r > w[i] && i < w.length-1){ r -= w[i]; i++; }
  items.push({ x: x, y: y, kind: i, t: 0 });
}

function pickUp(it){
  const d = ITEMS[it.kind];
  if(d.k === 'sub'){        player.sub = Math.min(2, player.sub + 1); player.subT = 900; }
  else if(d.k === 'rapid'){ player.rapidT = 780; }
  else if(d.k === 'ink'){
    ki = 100;                 // 必殺ゲージ満タン
    player.inkT = 600;        // 一定時間、朱の強化弾（大きく・威力2）
    setMsg('朱肉　必殺満タン＋強化弾', 30);
    beep(700, .08, 'triangle', .05); beep(1050, .1, 'triangle', .04);
    return;
  }
  else if(d.k === 'shield'){ player.shield = Math.max(player.shield, 1); }
  else if(d.k === 'etax'){ player.etaxT = 600; setMsg('e-Tax　超連射', 26); }
  else if(d.k === 'kojo'){ player.kojoT = 600; setMsg('税額控除　スコア2倍', 26); }
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
  if(player.inkT > 0) player.inkT--;
  if(player.etaxT > 0) player.etaxT--;
  if(player.kojoT > 0) player.kojoT--;
}

/* ---------- 必殺・朱印一閃 ---------- */
function release(){
  const p = charge; charge = 0;
  if(p < 20){ beep(140, .12, 'sine', .03); return; }   // 貯めが足りないと不発
  const life = Math.round(22 + p * .22);
  beam = { x: player.x, w: 26 + p * 1.25, power: p, life: life, maxlife: life, acc: 0 };
  flash = 6; shake = Math.round(6 + p*.1);
  beep(420, .35, 'sawtooth', .06); beep(150, .5, 'square', .04);
  if(p >= 85) setMsg('必殺　一括計算', 34);
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
      if(bossObj.hp <= 0 && state === 'play'){
        if(bossObj.type === 'mid') midDefeated();
        else if(bossObj.type === 'kousai' || bossObj.type === 'chosa' || bossObj.type === 'kokuzei' || bossObj.type === 'rank') uraBossDefeated();
        else bossDown();
      }
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
  for(const c of barriers){ if(c.alive && Math.abs(c.x - b.x) < half + c.s/2) c.alive = false; }   // 防壁も貫く
  if(b.life <= 0) beam = null;
}

/* ---------- 更新 ---------- */
function update(){
  frame++;
  if(msgTimer > 0) msgTimer--;
  if(shake > 0) shake--;
  if(flash > 0) flash--;
  if(state !== 'play') return;
  if(paused) return;                         // 一時停止中は進行を止める（描画は継続）
  if(introT > 0){ updateIntro(); return; }   // ラスボス登場演出（インクブリード）中は進行停止
  if(morphT > 0){ morphT--; return; }        // 形態変化演出中は進行停止
  if(overT > 0){ updateGameOver(); return; } // ゲームオーバー演出中
  if(winT > 0){ updateWinSeq(); return; }    // クリア演出中

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
  // コンボ・スコアポップ・控除倍率
  if(comboT > 0){ comboT--; if(comboT === 0) combo = 0; }
  scoreMul = player.kojoT > 0 ? 2 : 1;
  for(const p of pops){ p.t++; p.y -= 0.6; }
  pops = pops.filter(p => p.t < 46);

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

  // 税務ワードの背景表示（ボス戦以外・数秒ごとに切替）
  if(!bossObj){
    if(++bgPhraseT >= 220){ bgPhraseT = 0; bgPhrase = WALL_PHRASES[Math.floor(Math.random()*WALL_PHRASES.length)]; }
  }

  // 防壁との当たり（自弾・敵弾は防壁を削って消える）
  if(barriers.length){
    for(const b of bullets){ if(!b.dead && hitBarrier(b.x, b.y, 2)) b.dead = true; }
    bullets = bullets.filter(b => !b.dead);
    for(const b of ebullets){ if(!b.dead && hitBarrier(b.x, b.y, 3)) b.dead = true; }
    ebullets = ebullets.filter(b => !b.dead);
  }

  if(bossObj) updateBoss(); else updateSwarm();
  if(missiles.length) updateMissiles();

  // 被弾
  for(const b of ebullets){
    if(player.inv <= 0 && Math.abs(b.x - player.x) < 14 && Math.abs(b.y - player.y) < 12){
      b.dead = true;
      if(player.shield > 0){
        player.shield--; player.inv = 60; shake = 8;
        setMsg('受理印が受け止めた', 26); beep(300,.18,'triangle',.05);
      } else {
        lives--; player.inv = 90; shake = 14; beep(120,.3,'sawtooth',.07);
        if(lives <= 0){ gameOver(); }
      }
    }
  }
  ebullets = ebullets.filter(b => !b.dead);
}

function updateSwarm(){
  const live = enemies.filter(e => e.alive);
  if(live.length === 0){
    if(ura){                                   // 裏面：全100面。クリアで次面へ
      if(uraStage >= 100){ uraAllClear(); return; }
      uraStage++;
      if(uraStage % 10 === 0){                  // 10面ごとに昇格ボス（役職6段階のラダー）
        const finale = uraStage === 100;
        const idx = finale ? 5 : ((uraStage / 10) - 1) % 6;   // 裏10=調査官…裏60=署長, 以降くり返し。裏100=署長
        makeBoss('rank', idx); player.inv = 60;
        setMsg((finale ? '裏ラスボス　' : '裏中ボス　') + RANK_NAME[idx] + (finale ? ' 参上' : ''), finale ? 140 : 120);
        if(finale){ beep(160, .6, 'sawtooth', .07); beep(90, .7, 'square', .05); } else beep(200, .5, 'sawtooth', .06);
        return;
      }
      makeUraWave(uraStage); player.inv = 60;
      setMsg('裏' + uraStage + '面' + (barriers.length ? '　防壁あり' : ''), 80);
      return;
    }
    // 進行：1面→2面→中ボス→3面→4面→5面→ラスボス
    if(wave === 2 && !midDone){
      makeBoss('mid'); setMsg('中ボス出現　決算の魔物', 120);
      beep(200,.5,'sawtooth',.06); return;   // 中ボスはBGMそのまま（通常曲を継続）
    }
    if(wave >= 5){
      startBossIntro(); return;   // ラスボス登場演出（インクブリード）
    }
    wave++; makeWave(wave); player.inv = 60;
    const kanji = ['', '一', '二', '三', '四', '五'][wave] || wave;
    setMsg('第' + kanji + '面　' + (STAGE_NAMES[wave] || '') + (barriers.length ? '　防壁あり' : ''), 90);
    return;
  }

  // 裏面：独立移動する敵（フロート）を更新
  if(ura) updateFloaters(live);

  // 隊列移動（マーチ）。裏面は隊列を組む敵のみが対象で、面が進むほど速い
  const marchers = ura ? live.filter(e => !e.float) : live;
  if(marchers.length){
    const spd = ura ? (8 + Math.min(6, uraStage*0.12)) : 8;
    const interval = ura
      ? Math.max(4, 24 - uraStage*0.6 - (enemies.length - live.length) * .3)
      : Math.max(6, 30 - (enemies.length - live.length) * .5 - wave * 3);
    stepTimer++;
    if(stepTimer >= interval){
      stepTimer = 0;
      let hitEdge = false;
      for(const e of marchers){ if(e.x + dir*spd > W-16 || e.x + dir*spd < 16) hitEdge = true; }
      if(hitEdge){ dir *= -1; for(const e of marchers) e.y += ura ? 12 : 14; }
      else { for(const e of marchers){ e.x += dir*spd; e.f ^= 1; } }
      beep(160 + live.length, .04, 'triangle', .02);
      for(const e of marchers){ if(e.y > H - 70){ gameOver(); return; } }
    }
  }

  // 敵の発射（裏面は面数で激化・多彩化）
  enemyFire(live);

  for(const e of live){ if(e.hurt > 0) e.hurt--; }
  // 命中判定
  for(const b of bullets){
    for(const e of live){
      if(e.alive && Math.abs(b.x - e.x) < e.w/2 + 2 && Math.abs(b.y - e.y) < e.h/2 + 4){
        b.dead = true;
        e.hp -= (b.dmg || 1);
        if(e.hp <= 0){                              // 撃破
          e.alive = false; award(e.pt, e.x, e.y);
          ki = Math.min(100, ki + 6);
          maybeDrop(e.x, e.y, e.sprite === 3 ? 0.42 : undefined);   // 帳簿＝アイテムを落としやすい
          beep(520, .07, 'square', .04);
        } else {                                    // 固い敵：ヒットしたが未撃破
          e.hurt = 4; score += 2; ki = Math.min(100, ki + 1);
          beep(360, .04, 'square', .03);
        }
        break;
      }
    }
  }
  // 敵が防壁に触れたら削る
  if(barriers.length){
    for(const e of live){
      for(const c of barriers){
        if(c.alive && Math.abs(e.x - c.x) < e.w/2 && Math.abs(e.y - c.y) < e.h/2) c.alive = false;
      }
    }
  }
  bullets = bullets.filter(b => !b.dead);
}

function updateBoss(){
  const b = bossObj;
  if(b.type === 'mid' || b.type === 'kousai' || b.type === 'chosa' || b.type === 'kokuzei' || b.type === 'rank'){ updateMidBoss(b); return; }
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
      bl.dead = true; b.hp -= (bl.dmg || 1); b.hurt = 6; score += 5; ki = Math.min(100, ki + .8);
      if(b.hp <= b.next){ b.next -= 15; maybeDrop(b.x, b.y + 30, 1); }
      beep(660, .04, 'square', .03);
      if(b.hp <= 0){ bossDown(); break; }
    }
  }
  bullets = bullets.filter(bl => !bl.dead);
}

// 中ボス：単形態。扇状の弾＋たまに誘導ミサイル。倒すと第三面へ
function updateMidBoss(b){
  b.t++;
  b.x = W/2 + Math.sin(b.t/55) * (W/2 - 55);
  b.x = Math.max(b.w/2 + 4, Math.min(W - b.w/2 - 4, b.x));   // 大きいボスも画面内に収める
  b.y = (b.y0 || 96) + Math.sin(b.t/80) * 14;
  if(b.hurt > 0) b.hurt--;

  b.cool--;
  if(b.cool <= 0){
    const rage = b.hp < b.max/2;
    b.cool = rage ? 40 : 62;
    const n = rage ? 4 : 3;
    for(let i=0;i<n;i++){
      const a = Math.PI/2 + (i-(n-1)/2) * .3;
      ebullets.push({ x: b.x, y: b.y + b.h/2 - 4, vx: Math.cos(a)*2.4, vy: Math.sin(a)*2.4, kind:1 });
    }
    beep(200, .1, 'sawtooth', .05);
  }
  // たまに誘導ミサイル
  b.mslCool--;
  if(b.mslCool <= 0){
    b.mslCool = 150;
    const aim = Math.atan2(player.y - b.y, player.x - b.x);
    spawnMissile(b.x, b.y + b.h/2 - 4, 'homing', aim, false);
    beep(520, .12, 'square', .04);
  }
  // ボス固有武器
  if(b.type === 'kousai' || b.type === 'chosa' || b.type === 'kokuzei' || b.type === 'rank'){
    b.spCool--;
    if(b.spCool <= 0){
      const rage = b.hp < b.max/2;
      const sy = b.y + b.h/2 - 10, aim = Math.atan2(player.y - sy, player.x - b.x);
      if(b.type === 'kousai'){
        // 接待攻撃：❤️🍶🍺 を扇状にばらまく
        b.spCool = rage ? 80 : 120;
        const emo = ['❤️','🍶','🍺'], n = rage ? 6 : 5, sp = 2.0;
        for(let i=0;i<n;i++){
          const a = aim + (i-(n-1)/2)*.24;
          ebullets.push({ x: b.x, y: sy, vx: Math.cos(a)*sp, vy: Math.sin(a)*sp, kind: 2, emoji: emo[i%emo.length] });
        }
        beep(880, .1, 'sine', .05); beep(1180, .08, 'sine', .04);
      } else {
        // 追徴スタンプ：認印「追」を投げつける（役職が上がるほど多く速い）
        const rk = b.type === 'rank' ? b.rank : (b.type === 'kokuzei' ? 5 : 2);
        const big = rk >= 4;
        b.spCool = big ? (rage ? 58 : 88) : (rage ? 95 : 140);
        const n = Math.min(7, 2 + Math.floor(rk) + (rage ? 1 : 0)), sp = 2.6 + rk*0.08;
        for(let i=0;i<n;i++){
          const a = aim + (i-(n-1)/2)*.20;
          ebullets.push({ x: b.x, y: sy, vx: Math.cos(a)*sp, vy: Math.sin(a)*sp, kind: 3 });
        }
        beep(150, .16, 'square', .06);
      }
    }
  }
  // 命中判定
  for(const bl of bullets){
    if(Math.abs(bl.x - b.x) < b.w/2 - 8 && Math.abs(bl.y - b.y) < b.h/2 - 8){
      bl.dead = true; b.hp -= (bl.dmg || 1); b.hurt = 6; score += 5; ki = Math.min(100, ki + .8);
      if(b.hp <= b.next){ b.next -= 12; maybeDrop(b.x, b.y + 20, 1); }
      beep(660, .04, 'square', .03);
      if(b.hp <= 0){ (b.type === 'mid' ? midDefeated : uraBossDefeated)(); break; }
    }
  }
  bullets = bullets.filter(bl => !bl.dead);
}

/* ---------- ラスボス登場演出（インクブリード） ---------- */
function startBossIntro(){
  introMax = introT = 155;
  bullets = []; ebullets = []; missiles = []; items = []; charge = 0; beam = null;
  // 画面中央（印の落下点）から外へ滲み出す朱墨のブロット
  introBlots = [];
  for(let i=0;i<20;i++){
    const ang = Math.random()*6.283, dist = Math.random()*Math.max(W, H)*.62;
    introBlots.push({
      x: W/2 + Math.cos(ang)*dist, y: H*0.40 + Math.sin(ang)*dist,
      r: 5 + Math.random()*13, delay: 46 + dist*0.28 + Math.random()*12
    });
  }
  setMsg('', 0); beep(320, .5, 'sine', .04);
}
function updateIntro(){
  introT--;
  const t = introMax - introT;
  if(t === 46){ shake = 16; flash = 8; bgmSet('boss', true);     // 認印が振り下ろされる
                beep(140, .5, 'sawtooth', .07); beep(90, .6, 'square', .05); }
  if(introT === 24){ makeBoss('last'); shake = 12; }             // 墨の中からラスボス出現
  if(introT <= 0){ setMsg('最終面　所長 参上', 120); beep(200, .5, 'sawtooth', .06); }
}
function drawIntro(){
  const t = introMax - introT;
  const fade = introT < 24 ? introT/24 : 1;   // 終盤は墨が引いてラスボスが現れる
  ctx.save();
  // 朱墨のにじみ（ブロットが成長して画面を侵食）
  for(const b of introBlots){
    const lt = t - b.delay;
    if(lt <= 0) continue;
    const gr = b.r + lt * 2.5;
    ctx.globalAlpha = Math.min(1, lt/30) * fade;
    ctx.fillStyle = '#4e0a0c'; ctx.beginPath(); ctx.arc(b.x, b.y, gr, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#8f181a'; ctx.beginPath(); ctx.arc(b.x, b.y, gr*.62, 0, 6.283); ctx.fill();
  }
  // 全体の墨染め
  ctx.globalAlpha = Math.min(.5, Math.max(0, (t-46)/80)) * fade;
  ctx.fillStyle = '#340608'; ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;
  // 認印の落下（大きく→原寸で着地）
  if(t >= 30){
    const land = Math.min(1, (t-30)/16), sc = 2.7 - 1.7*land;
    ctx.save();
    ctx.translate(W/2, H*0.40); ctx.globalAlpha = land * fade; ctx.scale(sc, sc);
    ctx.fillStyle = '#c0392b'; ctx.fillRect(-30, -30, 60, 60);
    ctx.strokeStyle = '#5a0b0d'; ctx.lineWidth = 3; ctx.strokeRect(-30, -30, 60, 60);
    ctx.fillStyle = '#ede4d3'; ctx.font = '40px "Yu Mincho",serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('認', 0, 2);
    ctx.restore();
  }
  // 決戦テキスト
  if(t >= 74){
    ctx.globalAlpha = Math.min(1, (t-74)/16) * fade;
    ctx.fillStyle = '#ede4d3'; ctx.font = '19px "Yu Mincho",serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('最終決戦　所長 参上', W/2, H*0.60);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/* ---------- ゲームオーバー演出（自機爆散→「却下」朱印） ---------- */
function gameOver(){
  if(overT > 0 || state !== 'play') return;
  saveBest();
  overMax = overT = 120;
  deadX = player.x; deadY = player.y;
  ebullets = []; missiles = []; charge = 0; beam = null;   // 進行を止めて見せ場に
  overParts = [];
  for(let i=0;i<20;i++){
    const a = Math.random()*6.283, sp = 1.4 + Math.random()*3.6;
    overParts.push({ x: deadX, y: deadY, vx: Math.cos(a)*sp, vy: Math.sin(a)*sp - 1.2,
                     r: 2 + Math.random()*3, life: 40 + Math.random()*30,
                     col: Math.random() < .5 ? '#c0392b' : '#ede4d3' });   // 墨と紙片
  }
  flash = 10; shake = 18;
  beep(140, .5, 'sawtooth', .07); beep(80, .7, 'square', .05);
}
function updateGameOver(){
  overT--;
  const t = overMax - overT;
  for(const p of overParts){ p.x += p.vx; p.y += p.vy; p.vy += .13; p.life--; }
  overParts = overParts.filter(p => p.life > 0);
  if(t === 40){ shake = 14; flash = 6; beep(120, .5, 'sawtooth', .06); }   // 「却下」着地
  if(overT <= 0){ state = 'over'; setMsg('', 0); }
}
function drawGameOver(){
  const t = overMax - overT;
  ctx.save();
  // 自機の爆散（墨と紙片）
  for(const p of overParts){
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life/20));
    ctx.fillStyle = p.col; ctx.fillRect(p.x - p.r, p.y - p.r, p.r*2, p.r*2);
  }
  ctx.globalAlpha = 1;
  // 画面を墨で暗く
  ctx.globalAlpha = Math.min(.62, Math.max(0, (t-28)/55));
  ctx.fillStyle = '#1a0405'; ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;
  // 「却下」の朱印が斜めに振り下ろされる
  if(t >= 34){
    const land = Math.min(1, (t-34)/12), sc = 3 - 2*land;
    ctx.save();
    ctx.translate(W/2, H*0.42); ctx.globalAlpha = land; ctx.scale(sc, sc); ctx.rotate(-0.14);
    ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 4; ctx.strokeRect(-40, -27, 80, 54);
    ctx.fillStyle = '#c0392b'; ctx.font = 'bold 30px "Yu Mincho",serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('追徴', 0, 2);
    ctx.restore();
  }
  ctx.restore();
}

/* ---------- クリア演出（暗転→しっかり納税） ---------- */
const WIN_HIT = 96;   // 「しっかり納税」が出るタイミング（もったいぶり）
function startWinSeq(){
  winMax = winT = 195;
  score += 1000; saveBest();
  ebullets = []; missiles = []; bullets = []; charge = 0; beam = null;
  flash = 12; shake = 22;
  beep(880, .5, 'triangle', .06); beep(1320, .5, 'triangle', .05);
}
function updateWinSeq(){
  winT--;
  const t = winMax - winT;
  if(t === 28){ beep(150, .8, 'sine', .05); }                       // 暗転
  if(t === 64){ beep(180, .6, 'sine', .045); }                      // 低い唸り（タメ）
  if(t === 82){ beep(240, .6, 'sine', .05); }                       // 緊張が高まる
  if(t === WIN_HIT){                                                // ドンッ！文字出現
    shake = 18; flash = 7;
    beep(70, .9, 'sine', .09); beep(150, .8, 'triangle', .06);
    beep(300, .7, 'sine', .05); beep(1000, .4, 'square', .03);
  }
  if(winT <= 0){ state = 'uraAsk'; }   // 所長撃破後：裏面に突入するか Yes/No
}
function drawWinSeq(){
  const t = winMax - winT;
  ctx.save();
  // だんだん真っ暗に（タメを長めに）
  const dark = Math.min(1, Math.max(0, (t-16)/46));
  ctx.globalAlpha = dark; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;
  // 闇の中から「しっかり納税」がドンと出る
  if(t >= WIN_HIT){
    const k = t - WIN_HIT;
    const pop = Math.min(1, k/12);              // 出現の勢い
    const a = Math.min(1, k/16);
    const sc = 1.4 - 0.4*pop;                   // 大きく→原寸（インパクト）
    // 金の光背
    const g = ctx.createRadialGradient(W/2, H*0.42, 4, W/2, H*0.42, 160);
    g.addColorStop(0, 'rgba(216,180,92,' + (0.30*a) + ')'); g.addColorStop(1, 'rgba(216,180,92,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // 本文（大きく）
    ctx.save();
    ctx.translate(W/2, H*0.42); ctx.scale(sc, sc); ctx.globalAlpha = a;
    ctx.fillStyle = '#f2e2b2'; ctx.font = 'bold 40px "Yu Mincho",serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('しっかり納税', 0, 0);
    ctx.restore();
    // 署名（少し遅れて）
    if(k >= 16){
      ctx.globalAlpha = Math.min(1, (k-16)/16);
      ctx.fillStyle = '#d8b45c'; ctx.font = '12px "Yu Mincho",serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('― 税理士法人アストラスト ―', W/2, H*0.42 + 38);
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
}

/* ---------- 形態変化演出（ボスから墨が弾ける） ---------- */
function startMorph(toPhase){
  morphMax = morphT = 66;
  ebullets = []; missiles = [];   // 変身の衝撃で敵弾を一掃
  morphCol = toPhase === 3 ? '#8e44ad' : '#c0392b';   // 第三＝紫／第二＝朱
  morphInk = toPhase === 3 ? '#2c1046' : '#4e0a0c';
  morphBlots = [];
  for(let i=0;i<14;i++){
    const ang = Math.random()*6.283, dist = Math.random()*70;
    morphBlots.push({ dx: Math.cos(ang)*dist, dy: Math.sin(ang)*dist,
                      r: 6 + Math.random()*10, delay: Math.random()*16 });
  }
}
function drawMorph(){
  const b = bossObj; if(!b) return;
  const t = morphMax - morphT;
  const fade = morphT < 20 ? morphT/20 : 1;   // 終盤で墨が引いて新形態が現れる
  const cx = b.x, cy = b.y;
  ctx.save();
  // 衝撃波リング
  if(t < 30){
    ctx.globalAlpha = Math.max(0, 1 - t/30);
    ctx.strokeStyle = morphCol; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(cx, cy, t*7, 0, 6.283); ctx.stroke();
  }
  // 墨が弾けて広がる
  for(const bl of morphBlots){
    const lt = t - bl.delay; if(lt <= 0) continue;
    const gr = bl.r + lt*3.4;
    ctx.globalAlpha = Math.min(1, lt/14) * fade;
    ctx.fillStyle = morphInk; ctx.beginPath(); ctx.arc(cx+bl.dx, cy+bl.dy, gr, 0, 6.283); ctx.fill();
    ctx.fillStyle = morphCol; ctx.beginPath(); ctx.arc(cx+bl.dx, cy+bl.dy, gr*.6, 0, 6.283); ctx.fill();
  }
  ctx.restore();
}

// 裏中ボス（交際費の女将）撃破 → 次の裏面へ
function uraBossDefeated(){
  const nm = bossObj ? (bossObj.type === 'rank' ? RANK_NAME[bossObj.rank] : bossObj.type === 'chosa' ? '税務調査官' : '交際費の女将') : '';
  score += 800; shake = 18; flash = 12;
  beep(660, .4, 'triangle', .06); beep(990, .3, 'triangle', .05);
  bossObj = null; missiles = []; ebullets = [];
  if(uraStage >= 100){ uraAllClear(); return; }   // 裏100面ボス撃破＝全制覇
  uraStage++; makeUraWave(uraStage); player.inv = 90;
  setMsg(nm + ' 撃破！　裏' + uraStage + '面へ', 100);
}

// 中ボス撃破 → 第三面へ
function midDefeated(){
  score += 500; shake = 18; flash = 12;
  setMsg('中ボス撃破！　第三面へ', 120);
  beep(660, .4, 'triangle', .06); beep(990, .3, 'triangle', .05);
  midDone = true; bossObj = null; missiles = [];
  wave = 3; makeWave(3); player.inv = 90;
  // 中ボス中もBGMは通常曲のままなので切替不要
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
      if(player.shield > 0){
        player.shield--; player.inv = 60; shake = 8;
        setMsg('受理印が受け止めた', 26); beep(300, .18, 'triangle', .05);
      } else {
        lives--; player.inv = 90; shake = 16; beep(120, .3, 'sawtooth', .07);
        if(lives <= 0){ gameOver(); }
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
      if(player.shield > 0){
        player.shield--; player.inv = 60; shake = 8;
        setMsg('受理印が受け止めた', 26); beep(300, .18, 'triangle', .05);
      } else {
        lives--; player.inv = 90; shake = 15; beep(120, .3, 'sawtooth', .07);
        if(lives <= 0){ gameOver(); }
      }
    }
    // 自弾で撃墜（重装甲は2発必要）
    if(!m.dead){
      for(const bl of bullets){
        if(!bl.dead && Math.abs(bl.x - m.x) < 9 && Math.abs(bl.y - m.y) < 10){
          bl.dead = true; m.hp--;
          if(m.hp <= 0){ m.dead = true; award(8, m.x, m.y); ki = Math.min(100, ki + 1); beep(560, .05, 'square', .03); }
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
const MSL_COL = { homing:'#d1519c', zigzag:'#e67e22', splitter:'#f0c020', armored:'#96a0b0' };
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
    // 分厚い書類束：重なりで厚みを表現＋紫系の別色
    ctx.fillStyle = '#3a2452';
    ctx.fillRect(x+3, y+3, e.w, e.h);
    ctx.fillStyle = '#5a3d7a';
    ctx.fillRect(x+1.5, y+1.5, e.w, e.h);
  }
  let tint = tough ? '#9b6fb0' : ['#cfe0bd', '#bcd3a4', '#a9c68c'][e.kind];
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

// 裏面ザコ＝税務調査官風ピクセルキャラ（4種）
function drawZako(e){
  const idx = e.sprite % 4, img = ZAKO[idx], ready = ZAKO_READY[idx];
  if(e.maxhp > 1){   // 固い敵：朱のオーラ
    ctx.fillStyle = 'rgba(192,57,43,.22)';
    ctx.beginPath(); ctx.arc(e.x, e.y, 16, 0, Math.PI*2); ctx.fill();
  }
  if(ready){
    const asp = img.height ? img.width / img.height : 1;
    const h = 30, w = h * asp;
    if(e.hurt > 0) ctx.globalAlpha = .5;
    ctx.drawImage(img, e.x - w/2, e.y - h/2 - 1, w, h);
    ctx.globalAlpha = 1;
  } else {
    ctx.fillStyle = e.hurt > 0 ? '#fff' : '#3a2452';
    ctx.fillRect(e.x - 13, e.y - 10, 26, 20);
  }
  if(e.maxhp > 1){   // 残り耐久ピップ
    for(let i=0;i<e.hp;i++){ ctx.fillStyle = '#c0392b'; ctx.fillRect(e.x - 11 + i*4, e.y - 16, 2.5, 2.5); }
  }
  if(idx === 2){     // 射撃特化＝赤い照準ドット
    ctx.fillStyle = 'rgba(255,82,82,' + (.5 + .4*Math.sin(frame/6)) + ')';
    ctx.beginPath(); ctx.arc(e.x, e.y - 15, 2, 0, Math.PI*2); ctx.fill();
  } else if(idx === 3){   // 高得点＝¥のきらめき
    ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 8px serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('¥', e.x + 11, e.y - 12);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }
}
// 自機＝電卓
function drawSealShip(x, y, scale, alpha){
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y); ctx.scale(scale, scale);
  // 砲口（弾の出口）
  ctx.fillStyle = '#c0392b'; ctx.fillRect(-2, -15, 4, 5);
  // 電卓本体
  ctx.fillStyle = '#e6d3a0'; ctx.fillRect(-13, -11, 26, 21);
  ctx.strokeStyle = '#8a6a1f'; ctx.lineWidth = 1; ctx.strokeRect(-12.5, -10.5, 25, 20);
  // 液晶
  ctx.fillStyle = '#16233f'; ctx.fillRect(-10.5, -8.5, 21, 6);
  ctx.fillStyle = '#7fe6a0'; ctx.font = 'bold 6px "Courier New",monospace';
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  ctx.fillText('1040', 9, -5.2);
  // ボタン（2行×4列）
  ctx.fillStyle = '#33517f';
  for(let r=0;r<2;r++) for(let c=0;c<4;c++){ ctx.fillRect(-10.5 + c*5.4, -0.3 + r*4.7, 3.8, 3.3); }
  ctx.restore();
}
function drawPlayer(){
  if(overT > 0) return;   // ゲームオーバー演出中は自機は爆散済み
  const blink = player.inv > 0 && Math.floor(player.inv/5) % 2;
  // 分身（僚機）を左右に描画（本体点滅中も表示）
  for(const wx of wingOffsets()){
    drawSealShip(player.x + wx, player.y + 2, .68, .9);
  }
  if(blink) return;
  drawSealShip(player.x, player.y, 1, 1);
}

function drawMidBoss(b){
  const x = b.x - b.w/2, y = b.y - b.h/2;
  if(midbossReady){
    if(b.hurt > 0) ctx.globalAlpha = .55;
    ctx.drawImage(midboss, x, y, b.w, b.h);
    ctx.globalAlpha = 1;
  } else {
    ctx.fillStyle = '#7a4fb0'; ctx.fillRect(x, y, b.w, b.h);
  }
  const bw = 200, bx = (W-bw)/2, by = 26;
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(bx, by, bw, 8);
  ctx.fillStyle = '#8e44ad'; ctx.fillRect(bx, by, bw * b.hp/b.max, 8);
  ctx.strokeStyle = 'rgba(237,228,211,.7)'; ctx.lineWidth = 1;
  ctx.strokeRect(bx+.5, by+.5, bw-1, 7);
  ctx.fillStyle = '#d8b45c'; ctx.font = '9px system-ui,sans-serif';
  ctx.textAlign = 'center'; ctx.fillText('中ボス　決算の魔物', W/2, by - 6);
}
function drawKousaiBoss(b){
  const x = b.x - b.w/2, y = b.y - b.h/2;
  if(kousaiReady){
    if(b.hurt > 0) ctx.globalAlpha = .55;
    ctx.drawImage(kousai, x, y, b.w, b.h);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 2; ctx.strokeRect(x+1, y+1, b.w-2, b.h-2);
  } else {
    ctx.fillStyle = '#2a1a2a'; ctx.fillRect(x, y, b.w, b.h);
  }
  const bw = 200, bx = (W-bw)/2, by = 26;
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(bx, by, bw, 8);
  ctx.fillStyle = '#c0392b'; ctx.fillRect(bx, by, bw * b.hp/b.max, 8);
  ctx.strokeStyle = 'rgba(237,228,211,.7)'; ctx.lineWidth = 1;
  ctx.strokeRect(bx+.5, by+.5, bw-1, 7);
  ctx.fillStyle = '#d8b45c'; ctx.font = '9px system-ui,sans-serif';
  ctx.textAlign = 'center'; ctx.fillText('裏中ボス　交際費の女将', W/2, by - 6);
  drawBossSpeech(b, BOSS_LINES.kousai);
}
function drawChosaBoss(b){
  const x = b.x - b.w/2, y = b.y - b.h/2;
  if(chosaReady){
    if(b.hurt > 0) ctx.globalAlpha = .55;
    ctx.drawImage(chosa, x, y, b.w, b.h);
    ctx.globalAlpha = 1;
  } else {
    ctx.fillStyle = '#1b2a4a'; ctx.fillRect(x, y, b.w, b.h);
  }
  const bw = 200, bx = (W-bw)/2, by = 26;
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(bx, by, bw, 8);
  ctx.fillStyle = '#c0392b'; ctx.fillRect(bx, by, bw * b.hp/b.max, 8);
  ctx.strokeStyle = 'rgba(237,228,211,.7)'; ctx.lineWidth = 1;
  ctx.strokeRect(bx+.5, by+.5, bw-1, 7);
  ctx.fillStyle = '#d8b45c'; ctx.font = '9px system-ui,sans-serif';
  ctx.textAlign = 'center'; ctx.fillText('裏中ボス　税務調査官', W/2, by - 6);
  drawBossSpeech(b, BOSS_LINES.chosa);
}
function drawKokuzeiBoss(b){
  const x = b.x - b.w/2, y = b.y - b.h/2;
  if(chosaReady){
    if(b.hurt > 0) ctx.globalAlpha = .55;
    ctx.drawImage(chosa, x, y, b.w, b.h);
    ctx.globalAlpha = 1;
  } else { ctx.fillStyle = '#1b2a4a'; ctx.fillRect(x, y, b.w, b.h); }
  // 金の威圧オーラ
  ctx.strokeStyle = 'rgba(216,180,92,' + (.5 + .3*Math.sin(frame/8)) + ')'; ctx.lineWidth = 3;
  ctx.strokeRect(x-2, y-2, b.w+4, b.h+4);
  const bw = 220, bx = (W-bw)/2, by = 26;
  ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(bx, by, bw, 9);
  ctx.fillStyle = '#d8b45c'; ctx.fillRect(bx, by, bw * b.hp/b.max, 9);
  ctx.strokeStyle = 'rgba(237,228,211,.8)'; ctx.lineWidth = 1; ctx.strokeRect(bx+.5, by+.5, bw-1, 8);
  ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 10px system-ui,sans-serif';
  ctx.textAlign = 'center'; ctx.fillText('裏ラスボス　国税局長', W/2, by - 6);
  drawBossSpeech(b, BOSS_LINES.kokuzei);
}
function drawRankBoss(b){
  const idx = b.rank, img = RANK_IMG[idx], ready = RANK_READY[idx];
  const x = b.x - b.w/2, y = b.y - b.h/2, boss6 = idx === 5, finale = b.finale;
  if(boss6){   // 税務署長＝金の威圧オーラ
    ctx.strokeStyle = 'rgba(216,180,92,' + (.5 + .3*Math.sin(frame/8)) + ')'; ctx.lineWidth = 3;
    ctx.strokeRect(x-2, y-2, b.w+4, b.h+4);
  }
  if(ready){
    if(b.hurt > 0) ctx.globalAlpha = .55;
    ctx.drawImage(img, x, y, b.w, b.h);
    ctx.globalAlpha = 1;
  } else { ctx.fillStyle = '#1b2a4a'; ctx.fillRect(x, y, b.w, b.h); }
  const bh = boss6 ? 9 : 8, bw = boss6 ? 220 : 200, bx = (W-bw)/2, by = 26;
  ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = boss6 ? '#d8b45c' : '#c0392b'; ctx.fillRect(bx, by, bw * b.hp/b.max, bh);
  ctx.strokeStyle = 'rgba(237,228,211,.75)'; ctx.lineWidth = 1; ctx.strokeRect(bx+.5, by+.5, bw-1, bh-1);
  ctx.fillStyle = boss6 ? '#ffd23f' : '#d8b45c'; ctx.font = (boss6 ? 'bold 10px' : '9px') + ' system-ui,sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText((finale ? '裏ラスボス　' : '裏中ボス　') + RANK_NAME[idx], W/2, by - 6);
  drawBossSpeech(b, RANK_LINES[idx]);
}
function drawBoss(){
  const b = bossObj;
  if(b.type === 'mid'){ drawMidBoss(b); return; }
  if(b.type === 'rank'){ drawRankBoss(b); return; }
  if(b.type === 'kousai'){ drawKousaiBoss(b); return; }
  if(b.type === 'chosa'){ drawChosaBoss(b); return; }
  if(b.type === 'kokuzei'){ drawKokuzeiBoss(b); return; }
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
  if(player.inkT > 0)    on.push({ d: ITEMS[2], t: player.inkT/600 });
  if(player.shield > 0)  on.push({ d: ITEMS[3], t: 1, tag: player.shield + '枚' });
  if(player.wings > 0)   on.push({ d: ITEMS[5], t: 1, tag: player.wings + '機' });
  if(player.etaxT > 0)   on.push({ d: ITEMS[6], t: player.etaxT/600 });
  if(player.kojoT > 0)   on.push({ d: ITEMS[7], t: player.kojoT/600 });
  on.forEach((o, i)=>{
    const x = 8 + i*40, y = H-80;   // 自機（最下段）と重ならないよう一段上へ
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
  ctx.fillText('集中', gx, gy-7);

  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(237,228,211,.85)';
  ctx.font = '11px system-ui,sans-serif';
  ctx.textAlign = 'left';  ctx.fillText('SCORE ' + score, 8, H-12);
  ctx.textAlign = 'right';
  ctx.fillText(bossObj
    ? (bossObj.type === 'last' ? 'FINAL' : (bossObj.type === 'kousai' || bossObj.type === 'chosa' || bossObj.type === 'kokuzei' || bossObj.type === 'rank') ? ('裏 ' + uraStage + '/100') : 'MID BOSS')
    : (ura ? '裏 ' + uraStage + '/100' : 'STAGE ' + wave + '/5'), W-8, H-12);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#c0392b';
  let s = ''; for(let i=0;i<lives;i++) s += '● ';
  ctx.fillText(s.trim(), W/2, H-12);
}

function drawPause(){
  const b = PAUSE, cx = b.x + b.w/2, cy = b.y + b.h/2;
  ctx.fillStyle = 'rgba(237,228,211,.7)';
  if(paused){   // 再開（▶）
    ctx.beginPath(); ctx.moveTo(cx-4, cy-6); ctx.lineTo(cx-4, cy+6); ctx.lineTo(cx+6, cy); ctx.closePath(); ctx.fill();
  } else {      // 一時停止（||）
    ctx.fillRect(cx-5, cy-6, 3.5, 12); ctx.fillRect(cx+1.5, cy-6, 3.5, 12);
  }
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

function drawChoiceBtn(r, label, col){
  ctx.fillStyle = 'rgba(14,23,48,.92)'; ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.strokeRect(r.x+.5, r.y+.5, r.w-1, r.h-1);
  ctx.fillStyle = '#ede4d3'; ctx.font = '13px "Yu Mincho",serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, r.x + r.w/2, r.y + r.h/2);
}
function drawBestLine(){
  ctx.fillStyle = '#d8b45c'; ctx.font = '11px system-ui,sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('自己ベスト ' + best.score + '点' + (best.ura > 0 ? '　／　裏' + best.ura + '面' : ''), W/2, H/2 + 92);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}
// ボスの体力連動セリフ（吹き出しをボスの下に表示）
function drawBossSpeech(b, phrases){
  const k = b.hp / b.max, txt = k > 0.6 ? phrases[0] : k > 0.3 ? phrases[1] : phrases[2];
  ctx.font = '9px "Yu Mincho",serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const w = ctx.measureText(txt).width + 14, h = 16;
  const bx = Math.max(4 + w/2, Math.min(W - 4 - w/2, b.x)), by = Math.min(H - 130, b.y + b.h/2 + 14);
  ctx.fillStyle = 'rgba(255,255,255,.94)'; ctx.fillRect(bx - w/2, by - h/2, w, h);
  ctx.beginPath(); ctx.moveTo(bx - 4, by - h/2); ctx.lineTo(bx + 4, by - h/2); ctx.lineTo(bx, by - h/2 - 6); ctx.fill();
  ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 1.2; ctx.strokeRect(bx - w/2, by - h/2, w, h);
  ctx.fillStyle = '#16233f'; ctx.fillText(txt, bx, by + 1);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}
const BOSS_LINES = {
  kousai:  ['その領収書、見せて？', '誰と行ったの？', '…お会計、高くつくわよ'],
  chosa:   ['この経費、説明できますか？', '通帳も確認します', '追徴課税、確定です'],
  kokuzei: ['国税を、なめるな。', '反面調査を開始する', '……見のがさん']
};
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
    if(!bossObj) drawBgPhrase();   // 税務ワードの背景表示（ボス戦以外）
    if(bossObj) drawBoss();
    else { const dr = ura ? drawZako : drawDoc; enemies.filter(e=>e.alive).forEach(dr); }
    if(barriers.length) drawBarriers();

    bullets.forEach(b => {
      if(b.ink){ ctx.fillStyle = '#ffb020'; ctx.fillRect(b.x-3, b.y-7, 6, 14); }   // 強化弾（橙金）
      else { ctx.fillStyle = '#3fd0e6'; ctx.fillRect(b.x-2, b.y-5, 4, 10); }        // 通常弾（シアン）
    });
    ebullets.forEach(b=>{
      if(b.kind === 2 && b.emoji){
        // 女将の接待弾（❤️🍶🍺）
        ctx.font = '19px "Segoe UI Emoji","Noto Color Emoji",serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(b.emoji, b.x, b.y + 1);
      } else if(b.kind === 3){
        // 調査官の追徴スタンプ（回転する朱の認印「追」）
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(frame * 0.15);
        ctx.fillStyle = '#c0392b'; ctx.fillRect(-8, -8, 16, 16);
        ctx.strokeStyle = '#5a0b0d'; ctx.lineWidth = 1.5; ctx.strokeRect(-8, -8, 16, 16);
        ctx.fillStyle = '#ffe6cc'; ctx.font = '11px "Yu Mincho",serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('追', 0, 1);
        ctx.restore();
      } else if(b.kind){
        // ボス弾：明るい赤＋光背＋白い芯で背景から浮かせる
        ctx.fillStyle = 'rgba(255,90,90,.30)';
        ctx.beginPath(); ctx.arc(b.x, b.y, 7, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#ff5252';
        ctx.beginPath(); ctx.arc(b.x, b.y, 4.4, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#ffe6cc';
        ctx.beginPath(); ctx.arc(b.x, b.y, 1.8, 0, Math.PI*2); ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(237,228,211,.95)';
        ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, Math.PI*2); ctx.fill();
      }
    });
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
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
    drawChips();
    drawHUD();
    drawPause();
    // スコアポップ
    pops.forEach(p=>{
      ctx.globalAlpha = Math.max(0, 1 - p.t/46);
      ctx.fillStyle = p.col; ctx.font = 'bold 12px "Yu Mincho",serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(p.txt, p.x, p.y); ctx.globalAlpha = 1;
    });
    // コンボ表示（ボス以外の上部中央）
    if(combo >= 3 && !bossObj){
      ctx.fillStyle = combo >= 10 ? '#ffd23f' : '#d8b45c';
      ctx.font = 'bold 13px "Yu Mincho",serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(combo + ' コンボ', W/2, 16);
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    if(introT > 0) drawIntro();   // ラスボス登場演出（インクブリード）
    if(morphT > 0) drawMorph();   // 形態変化演出
    if(overT > 0) drawGameOver(); // ゲームオーバー演出
    if(winT > 0) drawWinSeq();    // クリア演出
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
    if(paused){   // 一時停止オーバーレイ
      ctx.fillStyle = 'rgba(14,23,48,.72)'; ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#d8b45c'; ctx.font = '26px "Yu Mincho",serif';
      ctx.fillText('一時停止', W/2, H/2 - 14);
      ctx.fillStyle = 'rgba(237,228,211,.85)'; ctx.font = '12px system-ui,sans-serif';
      ctx.fillText('タップ / P で再開', W/2, H/2 + 18);
      drawPause();   // ▶アイコンを最前面に
    }
  } else if(state === 'title'){
    center([
      {t:'書類インベーダー　v39', s:24, gap:30},
      {t:'押し寄せる申告書類を、認印で捌く。', s:12, c:'rgba(237,228,211,.75)', gap:22},
      {t:'必殺・一括計算　集中を貯めて放つ', s:12, c:'#c0392b', gap:22},
      {t:'印を拾って強化：副印・速筆・朱肉・受理印・回復薬・分身', s:10, c:'rgba(237,228,211,.7)', gap:18},
      {t:'全5面。2面で中ボス→ラスボス所長', s:11, c:'#d8b45c', gap:18},
      {t:'所長を倒すと…裏面（全100面）へ！', s:11, c:'#c0392b', gap:30},
      {t:'タップ / スペースで開始', s:12, f:'system-ui,sans-serif', c:'#ede4d3'}
    ]);
    drawSeal(W/2, 128, 40);
    if(best.score > 0){
      ctx.fillStyle = '#d8b45c'; ctx.font = '11px system-ui,sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('自己ベスト  ' + best.score + '点' + (best.ura > 0 ? '　／　裏' + best.ura + '面到達' : ''), W/2, H/2 + 88);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }
  } else if(state === 'over'){
    const L = [], rk = rankOf(score);
    if(uraStage > 0){                              // 裏面での力尽き＝到達面を表示
      L.push({t:'力尽きた…', s:19, gap:24});
      L.push({t:'裏' + uraStage + '面まで到達', s:16, c:'#c0392b', gap:26});
    } else {
      L.push({t:'申告漏れ…書類に埋もれた', s:18, gap:26});
    }
    L.push({t:'SCORE ' + score + '　ランク ' + rk.r, s:15, f:'system-ui,sans-serif', c: rk.c, gap:22});
    L.push({t: rk.m, s:11, c:'rgba(237,228,211,.85)', gap:26});
    L.push({t:'タップでもう一度', s:12, f:'system-ui,sans-serif', c:'rgba(237,228,211,.8)'});
    center(L);
    drawBestLine();
  } else if(state === 'uraAsk'){
    center([
      {t:'所長 撃破！', s:24, c:'#d8b45c', gap:28},
      {t:'しっかり納税、おつかれさま。', s:12, gap:24},
      {t:'…だが、申告に終わりはない。', s:12, c:'#c0392b', gap:26},
      {t:'裏面（全100面）に突入しますか？', s:13, gap:18}
    ]);
    drawChoiceBtn(YESBTN, 'YES 突入', '#c0392b');
    drawChoiceBtn(NOBTN,  'NO 終了',  '#5aa9e6');
  } else if(state === 'win'){
    const rk = rankOf(score);
    center(allClear ? [
      {t:'全100面 制覇！', s:22, c:'#d8b45c', gap:28},
      {t:'あなたは伝説の税理士だ', s:12, gap:26},
      {t:'SCORE ' + score + '　ランク ' + rk.r, s:15, f:'system-ui,sans-serif', c: rk.c, gap:22},
      {t: rk.m, s:11, c:'rgba(237,228,211,.85)', gap:26},
      {t:'タップで再挑戦', s:12, f:'system-ui,sans-serif', c:'rgba(237,228,211,.8)'}
    ] : [
      {t:'所長 撃破', s:23, c:'#d8b45c', gap:28},
      {t:'期限内に申告完了しました', s:12, gap:26},
      {t:'SCORE ' + score + '　ランク ' + rk.r, s:15, f:'system-ui,sans-serif', c: rk.c, gap:22},
      {t: rk.m, s:11, c:'rgba(237,228,211,.85)', gap:26},
      {t:'タップで再挑戦', s:12, f:'system-ui,sans-serif', c:'rgba(237,228,211,.8)'}
    ]);
    drawBestLine();
  }
  drawMute();   // どの画面でも右上に表示（開始前に消音予約も可）
  // ビルド確認用（キャッシュ判別）：左上に小さく表示
  ctx.fillStyle = 'rgba(237,228,211,.28)'; ctx.font = '7px system-ui,sans-serif';
  ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText("v39", 5, 9);
  ctx.restore();
}

function loop(){
  update(); draw();
  if(state !== 'play') bgmStop();   // クリア/ゲームオーバー/タイトルで停止
  requestAnimationFrame(loop);
}
resize(); player = newPlayer(); bullets = []; ebullets = []; enemies = [];
loadBest();
loop();
