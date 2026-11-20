/* =========================================================
 * MUSIC — 演奏会の音楽（自動生成スコア＋WebAudio再生）
 *
 * 既存ゲームには音楽再生の仕組みがなかったため、新たに設計した。
 *  - 曲の雰囲気（mood）・編成・乱数シードから、短い管弦楽の「スコア」を生成する
 *    （実在曲の旋律は使わない。和声進行と旋律はその場で作曲するオリジナル）。
 *  - スコアは「パート（5セクション）ごとの音符列」で、音声と3Dアニメーションの両方が
 *    同じスコアと同じ時計（AudioContext.currentTime）を参照するため、動きと音が同期する。
 *  - 音声が使えない／ミュートの場合も、時計は performance.now() で進みアニメーションは動く。
 * ========================================================= */
const Music = (() => {
  const MOODS = {
    '軽快': { tempo: 132, minor: false, feel: 'bright' }, '華麗': { tempo: 138, minor: false, feel: 'bright' },
    '祝祭': { tempo: 120, minor: false, feel: 'bright' }, '高揚': { tempo: 116, minor: false, feel: 'bright' },
    '壮麗': { tempo: 92, minor: false, feel: 'grand' }, '劇的': { tempo: 108, minor: true, feel: 'drama' },
    '叙情': { tempo: 76, minor: false, feel: 'calm' }, '叙景': { tempo: 84, minor: false, feel: 'calm' },
    '幻想': { tempo: 72, minor: true, feel: 'calm' }, '悲歌': { tempo: 62, minor: true, feel: 'calm' },
    'ロマン的': { tempo: 80, minor: true, feel: 'grand' },
  };
  const RHYTHMS = {
    bright: [[1, 1, 1, 1], [1.5, 0.5, 1, 1], [2, 1, 1], [1, 1, 2], [0.5, 0.5, 1, 2]],
    grand: [[2, 1, 1], [3, 1], [1.5, 0.5, 2], [2, 2]],
    drama: [[1.5, 0.5, 1.5, 0.5], [1, 1, 2], [2, 2], [0.5, 0.5, 0.5, 0.5, 2]],
    calm: [[2, 2], [3, 1], [1.5, 0.5, 2], [4], [2, 1, 1]],
  };
  const MAJOR = [0, 2, 4, 5, 7, 9, 11], MINOR = [0, 2, 3, 5, 7, 8, 11];
  const PROG = { major: [[0, 5, 3, 4], [0, 3, 4, 0], [0, 4, 5, 3], [0, 5, 1, 4]], minor: [[0, 3, 4, 0], [0, 5, 2, 4], [0, 3, 6, 4]] };

  /* ---------- スコア生成 ---------- */
  // opts: { seed, sections:[使用セクション], bars, quiet }
  function createScore(song, opts = {}) {
    const rng = seededRng(opts.seed || hashStr(song.id));
    const rpick = a => a[Math.floor(rng() * a.length)];
    const mood = MOODS[song.mood] || MOODS['叙情'];
    const tempo = Math.round(mood.tempo * (0.95 + rng() * 0.1));
    const BPB = 4;
    const bars = opts.bars || Math.max(12, Math.min(26, Math.round(40 * tempo / 240 / 2) * 2));
    const root = 55 + Math.floor(rng() * 7);            // G3〜C#4
    const scale = mood.minor ? MINOR : MAJOR;
    const midiOf = step => root + 12 * Math.floor(step / 7) + scale[((step % 7) + 7) % 7];
    const chordSteps = deg => [deg, deg + 2, deg + 4];
    const secs = opts.sections || ['hs', 'ls', 'ww', 'br', 'pc'];
    const has = s => secs.includes(s);

    // 形式：序奏 → A → B → A' → 終結
    const intro = Math.min(2, bars - 6), coda = 2;
    const body = bars - intro - coda;
    const aLen = Math.max(2, Math.round(body * 0.4 / 2) * 2), bLen = Math.max(2, Math.round(body * 0.3 / 2) * 2);
    const a2Len = Math.max(2, body - aLen - bLen);
    const phrases = [];
    let bar = 0;
    const add = (label, len, dyn) => { phrases.push({ label, start: bar * BPB, end: (bar + len) * BPB, bar0: bar, len, dyn }); bar += len; };
    if (intro > 0) add('intro', intro, 0.35);
    add('A', aLen, 0.6); add('B', bLen, 0.55); add('A2', a2Len, 0.9); add('coda', coda, 1.0);

    const progA = rpick(PROG[mood.minor ? 'minor' : 'major']);
    const progB = rpick(PROG[mood.minor ? 'minor' : 'major']).map(d => (d + 3) % 7);
    const chords = [];
    for (const ph of phrases) for (let i = 0; i < ph.len; i++) {
      let deg;
      if (ph.label === 'intro') deg = i === ph.len - 1 ? 4 : 0;
      else if (ph.label === 'coda') deg = i === 0 ? 4 : 0;
      else if (ph.label === 'B') deg = progB[i % 4];
      else deg = progA[i % 4];
      if (i === ph.len - 1 && (ph.label === 'A' || ph.label === 'A2') && ph.label !== 'coda') deg = ph.label === 'A2' ? 4 : 4;
      chords.push(deg);
    }
    const parts = { hs: [], ls: [], ww: [], br: [], pc: [] };
    const note = (sec, t, d, p, v, kind) => { if (has(sec)) parts[sec].push({ t, d, p, v, kind }); };
    const chordMidi = (deg, base) => chordSteps(deg).map(s => midiOf(s + base));

    // 旋律
    const melSec = ph => ph.label === 'B' ? (has('ww') ? 'ww' : has('br') ? 'br' : 'hs') : 'hs';
    let step = 9;   // 旋律の現在位置（音階のステップ）
    for (const ph of phrases) {
      if (ph.label === 'intro' || ph.label === 'coda') continue;
      const ms = melSec(ph);
      for (let i = 0; i < ph.len; i++) {
        const b0 = (ph.bar0 + i) * BPB, deg = chords[ph.bar0 + i];
        const last = i === ph.len - 1;
        const rh = last ? rpick([[4], [2, 2], [3, 1]]) : rpick(RHYTHMS[mood.feel]);
        let t = b0;
        rh.forEach((d, k) => {
          const strong = (t - b0) % 2 === 0;
          if (strong) {   // 強拍は和音の構成音のうち近いもの
            const cands = []; for (let o = 0; o < 3; o++) chordSteps(deg).forEach(s => cands.push(s + 7 * o));
            step = cands.reduce((best, s) => Math.abs(s - step) < Math.abs(best - step) ? s : best, cands[0]);
          } else step += rpick([-1, 1, 1, -2, 2]);
          step = Math.max(6, Math.min(16, step));
          const p = midiOf(step) + 12;
          const v = ph.dyn * (strong ? 1 : 0.85);
          note(ms, t, d * 0.95, [p], v, 'mel');
          if (ph.label === 'A2' && has('ww') && ms === 'hs') note('ww', t, d * 0.95, [p + 12], v * 0.7, 'mel');
          t += d;
        });
      }
    }
    // 伴奏
    for (const ph of phrases) {
      for (let i = 0; i < ph.len; i++) {
        const bi = ph.bar0 + i, b0 = bi * BPB, deg = chords[bi];
        const ch = chordMidi(deg, 7), bass = midiOf(deg) - 12;
        const v = ph.dyn;
        const lastBar = bi === bars - 1;
        if (ph.label === 'coda') {
          if (lastBar) {
            for (const sec of ['hs', 'ww', 'br']) note(sec, b0, 3.5, sec === 'br' ? chordMidi(deg, 0) : ch.map(p => p + (sec === 'ww' ? 12 : 0)), v, 'pad');
            note('ls', b0, 3.5, [bass, bass + 12], v, 'bass');
            note('pc', b0, 1, [midiOf(0) - 24], v, 'hit');
          } else {
            for (let k = 0; k < 4; k++) {
              for (const sec of ['hs', 'ww', 'br']) note(sec, b0 + k, 0.8, sec === 'br' ? chordMidi(deg, 0) : ch, v * (0.8 + k * 0.05), 'pad');
              note('ls', b0 + k, 0.8, [bass], v, 'bass');
            }
            note('pc', b0, 4, [midiOf(4) - 24], v, 'roll');
          }
          continue;
        }
        if (ph.label === 'intro') {
          note('hs', b0, 4, ch, v * 0.8, 'pad'); note('ls', b0, 4, [bass], v, 'bass');
          continue;
        }
        if (ph.label === 'A') {
          note('ls', b0, 2, [bass], v, 'bass'); note('ls', b0 + 2, 2, [bass + (rng() < 0.5 ? 7 : 12)], v, 'bass');
          if (has('ww')) note('ww', b0, 4, ch.slice(0, 2), v * 0.55, 'pad');
          continue;
        }
        if (ph.label === 'B') {
          const ms = melSec(ph);
          if (ms !== 'hs') for (let k = 0; k < 4; k++) note('hs', b0 + k, 0.9, ch, v * 0.6, 'pad');
          for (let k = 0; k < 4; k += 2) note('ls', b0 + k, 1.9, [bass], v, 'bass');
          if (has('br') && ms !== 'br' && i % 2 === 1) note('br', b0, 2, chordMidi(deg, 0), v * 0.7, 'pad');
          if (i === ph.len - 1) note('pc', b0, 4, [midiOf(4) - 24], v * 0.8, 'roll');
          continue;
        }
        if (ph.label === 'A2') {
          for (let k = 0; k < 4; k++) note('ls', b0 + k, 0.9, [bass], v, 'bass');
          if (has('br')) { note('br', b0, 1.5, chordMidi(deg, 0), v * 0.8, 'pad'); note('br', b0 + 2, 1.5, chordMidi(deg, 0), v * 0.75, 'pad'); }
          if (!has('ww')) note('hs', b0, 4, ch.map(p => p - 12), v * 0.5, 'pad');
          note('pc', b0, 1, [midiOf(deg) - 24], v, 'hit');
          if (i === 0) note('pc', b0, 1, [0], v, 'cym');
        }
      }
    }
    Object.values(parts).forEach(a => a.sort((x, y) => x.t - y.t));
    const beats = bars * BPB;
    const score = { song: song.id, tempo, spb: 60 / tempo, beats, bars, bpb: BPB, phrases, parts, root, minor: mood.minor, duration: beats * 60 / tempo };
    // パートごとの「演奏している区間」（1拍以内の休みはつなげる）
    score.active = {};
    for (const [sec, ns] of Object.entries(parts)) {
      const iv = [];
      for (const n of ns) {
        const last = iv[iv.length - 1];
        const end = n.t + Math.max(n.d, n.kind === 'hit' || n.kind === 'cym' ? 1 : n.d);
        if (last && n.t - last[1] <= 1.05) last[1] = Math.max(last[1], end); else iv.push([n.t, end]);
      }
      score.active[sec] = iv;
    }
    return score;
  }
  function isActive(score, sec, beat) {
    const iv = score.active[sec]; if (!iv) return false;
    for (const [a, b] of iv) { if (beat < a) return false; if (beat <= b) return true; }
    return false;
  }
  function dynAt(score, beat) {
    const ph = score.phrases.find(p => beat >= p.start && beat < p.end);
    return ph ? ph.dyn : 0.4;
  }
  // 区間内の現在の音符（二分探索）
  function noteAt(score, sec, beat) {
    const ns = score.parts[sec]; if (!ns || !ns.length) return null;
    let lo = 0, hi = ns.length - 1, idx = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (ns[mid].t <= beat) { idx = mid; lo = mid + 1; } else hi = mid - 1; }
    if (idx < 0) return null;
    return { n: ns[idx], i: idx, next: ns[idx + 1] || null };
  }

  /* ---------- WebAudio ---------- */
  let ctx = null, master = null, wetGain = null, conv = null, noiseBuf = null, muted = false;
  let timers = [], live = [];
  function audio() {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16; comp.ratio.value = 4;
      master = ctx.createGain(); master.gain.value = muted ? 0 : 0.55;
      const dry = ctx.createGain(); dry.gain.value = 0.8;
      wetGain = ctx.createGain(); wetGain.gain.value = 0.35;
      conv = ctx.createConvolver();
      master.connect(dry).connect(comp);
      master.connect(conv).connect(wetGain).connect(comp);
      comp.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      setReverb(60);
    } catch (e) { ctx = null; }
    return ctx;
  }
  // ホールの音響性能に応じて残響の長さを変える
  function setReverb(acoustics) {
    if (!ctx) return;
    const len = 0.5 + acoustics / 100 * 2.4, sr = ctx.sampleRate, n = Math.floor(sr * len);
    const buf = ctx.createBuffer(2, n, sr);
    for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.6); }
    conv.buffer = buf;
    wetGain.gain.value = 0.18 + acoustics / 100 * 0.32;
  }
  function resume() { const c = audio(); if (c && c.state === 'suspended') c.resume().catch(() => {}); return c; }
  /* ゲーム内の時計（演出・アニメーション・音の共通の時刻）。
   * 音声が動いているときは AudioContext.currentTime、動いていないときは performance.now() を使うが、
   * 2つは基準が違う（例：ページを開いてからの秒数 と 音声を開始してからの秒数）。
   * 以前は切り替わった瞬間に時刻が大きく飛び（本番開始の直後に音声が動き出すと数百秒も巻き戻る）、
   * 本番の演出が「開演前」のまま進まず、団員が入場しなくなっていた。
   * そこで切り替わるたびに差分（off）を持ち越して、時刻が途切れず常に増えていくようにする。 */
  let clk = null;
  const rawNow = src => src === 'ctx' ? ctx.currentTime : performance.now() / 1000;
  function now() {
    const src = ctx && ctx.state === 'running' ? 'ctx' : 'perf';
    if (!clk) clk = { src, off: 0, last: rawNow(src) };
    if (clk.src !== src) { clk.off = clk.last - rawNow(src); clk.src = src; }
    const v = rawNow(src) + clk.off;
    if (v < clk.last) return clk.last;   // 時刻は戻さない
    clk.last = v; return v;
  }
  // now() の時刻 → AudioContext の時刻（音の予約に使う）
  const ctxTime = t => t - (clk && clk.src === 'ctx' ? clk.off : 0);
  function setMuted(v) { muted = v; if (master) master.gain.setTargetAtTime(v ? 0 : 0.55, ctx.currentTime, 0.05); }
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);

  function env(g, t, a, d, peak, rel = 0.12) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.setValueAtTime(Math.max(0.0002, peak), t + Math.max(a, d - rel));
    g.gain.exponentialRampToValueAtTime(0.0001, t + d + rel);
  }
  function voice(type, freq, t, dur, vel, opt = {}) {
    const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = type; o.frequency.value = freq; if (opt.detune) o.detune.value = opt.detune;
    f.type = 'lowpass'; f.frequency.value = opt.cutoff || 2000; f.Q.value = opt.q || 0.7;
    if (opt.filterEnv) { f.frequency.setValueAtTime(opt.cutoff * 0.4, t); f.frequency.linearRampToValueAtTime(opt.cutoff, t + 0.06); f.frequency.linearRampToValueAtTime(opt.cutoff * 0.7, t + Math.max(0.1, dur)); }
    if (opt.vib && dur > 0.5) {
      const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 5.3; lg.gain.value = freq * 0.004;
      l.connect(lg).connect(o.frequency); l.start(t + 0.15); l.stop(t + dur + 0.3);
    }
    o.connect(f).connect(g).connect(master);
    env(g, t, opt.attack || 0.03, dur, vel, opt.release || 0.12);
    o.start(t); o.stop(t + dur + (opt.release || 0.12) + 0.05);
    live.push(o);
  }
  function noise(t, dur, vel, ftype, freq, q = 0.8) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; f.type = ftype; f.frequency.value = freq; f.Q.value = q;
    s.connect(f).connect(g).connect(master);
    g.gain.setValueAtTime(vel, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.02); live.push(s);
  }
  function timpani(freq, t, vel) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(freq * 1.5, t); o.frequency.exponentialRampToValueAtTime(freq, t + 0.08);
    o.connect(g).connect(master);
    g.gain.setValueAtTime(vel * 0.9, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    o.start(t); o.stop(t + 1.5); live.push(o);
    noise(t, 0.12, vel * 0.25, 'lowpass', 400);
  }
  // 1音を鳴らす（セクションごとの音色）
  function playNote(sec, n, t, spb, rng, q) {
    const dur = n.d * spb, vel = 0.05 + n.v * 0.12;
    const det = () => (rng() - 0.5) * 2 * (1 - q) * 14;   // 仕上がりが低いほど音程がわずかに揺れる
    if (sec === 'pc') {
      if (n.kind === 'cym') { noise(t, 2.2, vel * 0.5, 'highpass', 6500, 0.5); return; }
      if (n.kind === 'roll') { for (let k = 0; k < n.d * 6; k++) timpani(hz(n.p[0]), t + k * spb / 6, vel * (0.25 + 0.6 * k / (n.d * 6))); return; }
      timpani(hz(n.p[0]), t, vel * 1.4); return;
    }
    for (const p of n.p) {
      const f = hz(p), per = vel / Math.sqrt(n.p.length);
      if (sec === 'hs' || sec === 'ls') {
        const soft = n.kind === 'pad';
        voice('sawtooth', f, t, dur, per * (soft ? 0.55 : 0.75), { detune: det() - 5, cutoff: sec === 'ls' ? 700 : soft ? 1400 : 2600, attack: soft ? 0.18 : 0.06, vib: !soft, release: 0.2 });
        voice('sawtooth', f, t, dur, per * (soft ? 0.45 : 0.6), { detune: det() + 6, cutoff: sec === 'ls' ? 700 : soft ? 1400 : 2600, attack: soft ? 0.2 : 0.07, release: 0.2 });
      } else if (sec === 'ww') {
        voice('triangle', f, t, dur, per * 0.95, { detune: det(), cutoff: 3000, attack: 0.05, vib: n.kind === 'mel' });
        voice('square', f, t, dur, per * 0.12, { detune: det(), cutoff: 1800, attack: 0.05 });
      } else if (sec === 'br') {
        voice('sawtooth', f, t, dur, per * 0.7, { detune: det(), cutoff: 1500 + n.v * 1800, attack: 0.05, filterEnv: true, release: 0.15 });
      }
    }
  }
  function stopAll() {
    timers.forEach(clearInterval); timers = [];
    live.forEach(o => { try { o.stop(); } catch (e) {} }); live = [];
  }
  /**
   * スコアの再生。startAt（now()基準の秒）から開始。仕上がり q（0〜1、セクション別）で揺らぎを付ける。
   * 音声が使えない場合は何もしない（時計だけで進行する）。
   */
  function playScore(score, startAt, quality = {}) {
    if (!ctx || ctx.state !== 'running') return;
    now();
    const rng = seededRng(hashStr(score.song + 'perf'));
    const queue = [];
    for (const [sec, ns] of Object.entries(score.parts)) for (const n of ns) queue.push({ sec, n });
    queue.sort((a, b) => a.n.t - b.n.t);
    let i = 0;
    const tick = () => {
      const horizon = ctx.currentTime + 0.5;
      while (i < queue.length) {
        const { sec, n } = queue[i];
        const q = quality[sec] ?? 0.8;
        const t = ctxTime(startAt + n.t * score.spb + (rng() - 0.5) * 2 * (1 - q) * 0.03);
        if (t > horizon) break;
        if (t >= ctx.currentTime - 0.05) playNote(sec, n, Math.max(t, ctx.currentTime), score.spb, rng, q);
        i++;
      }
      if (i >= queue.length) { clearInterval(id); timers = timers.filter(x => x !== id); }
      live = live.slice(-400);
    };
    const id = setInterval(tick, 80); timers.push(id); tick();
  }
  // チューニング：オーボエのA → 弦・管が合わせる
  function tuning(startAt, dur = 3.2) {
    if (!ctx || ctx.state !== 'running') return;
    now(); startAt = ctxTime(startAt);
    voice('triangle', 440, startAt, 1.6, 0.09, { cutoff: 2600, attack: 0.08 });
    voice('square', 440, startAt, 1.6, 0.015, { cutoff: 1800, attack: 0.08 });
    for (let k = 0; k < 10; k++) {
      const t = startAt + 1.2 + Math.random() * (dur - 1.6), oct = [0.5, 1, 1, 2, 0.25][k % 5];
      voice('sawtooth', 440 * oct, t, 1.2 + Math.random(), 0.02, { detune: (Math.random() - 0.5) * 30, cutoff: 1500, attack: 0.15, vib: true });
    }
  }
  // 拍手：強さ（0〜1）に応じた密度のノイズ
  function applause(startAt, dur, strength) {
    if (!ctx || ctx.state !== 'running') return;
    now(); startAt = ctxTime(startAt);
    const n = Math.floor(dur * (25 + strength * 70));
    for (let k = 0; k < n; k++) {
      const t = startAt + Math.random() * dur, fade = 1 - Math.max(0, (t - startAt) / dur - 0.7) / 0.3;
      noise(t, 0.05, (0.03 + Math.random() * 0.05) * fade * (0.5 + strength * 0.5), 'bandpass', 1200 + Math.random() * 1800, 1.2);
    }
  }
  return { createScore, isActive, dynAt, noteAt, resume, now, setMuted, isMuted: () => muted, setReverb, playScore, tuning, applause, stopAll, hasAudio: () => !!(ctx && ctx.state === 'running') };
})();
