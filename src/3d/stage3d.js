/* =========================================================
 * STAGE3D — 演奏会タブの3D空間（Three.js）
 *
 * 方針（スマートフォン優先）
 *  - モデルはすべてプログラムで生成する軽量ローポリ。団員の静止部分は1メッシュに結合し
 *    （頂点カラー）、腕・楽器・弓など動く部分だけを別メッシュにしている。
 *  - 腕は2関節IKで「手の目標位置」を追う。楽器ごとに手の位置と楽器の姿勢を定義するだけで
 *    弓・ピストン・スライド・マレットの動きを表現できる。
 *  - 動きは Music のスコアと同じ時計を参照する（音と同期）。休符中は楽器を下ろす。
 *  - 仕上がり（品質 q）が低いほど、タイミングと動きにわずかなばらつきが出る。
 *  - 演奏会タブ以外ではアニメーションループを止める。フレーム時間に応じて解像度を自動で下げる。
 *  - WebGL や Three.js が使えない場合は ok=false となり、UI は従来の2D表示で動作を続ける。
 * ========================================================= */
const Stage3D = (() => {
  const T = window.THREE;
  let ok = false, reason = '';
  let renderer, scene, camera, canvas, host;
  let running = false, raf = 0, lastT = 0, slowFrames = 0, pixelRatio = 1;
  let hallGroup = null, orchGroup = null, hallKey = '', lineupKey = '';
  let hemi, keyLight, fillLight;
  let actors = [], conductor = null, seats = [], audience = null, layoutInfo = null;
  let cam = { name: 'front', from: null, to: null, fromT: null, toT: null, t0: 0, dur: 0.8, pos: null, tgt: null };
  let mode = 'idle', show = null, practice = null;
  let captionCb = null;
  const geoCache = new Map(), matCache = new Map();
  const V = (x, y, z) => new T.Vector3(x, y, z);
  const tmpV = T ? new T.Vector3() : null, tmpV2 = T ? new T.Vector3() : null, tmpQ = T ? new T.Quaternion() : null, DOWN = T ? new T.Vector3(0, -1, 0) : null;

  /* ---------- 初期化 ---------- */
  function init(container) {
    if (ok || reason) return ok;
    try {
      if (!T) throw new Error('3Dライブラリを読み込めませんでした');
      const test = document.createElement('canvas');
      const gl = test.getContext('webgl2') || test.getContext('webgl');
      if (!gl) throw new Error('この端末・ブラウザはWebGLに対応していません');
      host = container;
      renderer = new T.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', alpha: false });
      pixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
      renderer.setPixelRatio(pixelRatio);
      renderer.outputColorSpace = T.SRGBColorSpace;
      canvas = renderer.domElement; canvas.className = 'stage-canvas';
      host.appendChild(canvas);
      scene = new T.Scene();
      scene.background = new T.Color(0x0c0a09);
      camera = new T.PerspectiveCamera(50, 1, 0.1, 140);
      hemi = new T.HemisphereLight(0xfff2e0, 0x2a1d14, 1.0); scene.add(hemi);
      keyLight = new T.DirectionalLight(0xfff0dc, 1.5); keyLight.position.set(2, 14, 10); scene.add(keyLight); scene.add(keyLight.target);
      fillLight = new T.DirectionalLight(0xffe2c0, 0.45); fillLight.position.set(-6, 8, -12); scene.add(fillLight);
      orchGroup = new T.Group(); scene.add(orchGroup);
      window.addEventListener('resize', resize);
      canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); stop(); }, false);
      ok = true;
      resize();
    } catch (e) { reason = e.message || String(e); ok = false; }
    return ok;
  }
  function resize() {
    if (!ok || !host) return;
    const w = host.clientWidth || window.innerWidth, h = host.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix();
    if (cam.name) setCamera(cam.name, true);
  }

  /* ---------- ジオメトリ・マテリアル ---------- */
  function mat(color, opt = {}) {
    const k = color + JSON.stringify(opt);
    if (!matCache.has(k)) matCache.set(k, opt.basic ? new T.MeshBasicMaterial({ color, ...opt.props }) : new T.MeshLambertMaterial({ color, ...opt.props }));
    return matCache.get(k);
  }
  const VCOL = () => mat(0xffffff, { props: { vertexColors: true, side: T.DoubleSide } });
  // 複数の部品（geometry＋色＋変換）を1つのジオメトリに結合する
  function merge(parts) {
    let total = 0;
    const prepared = parts.map(p => {
      let g = p.g.index ? p.g.toNonIndexed() : p.g.clone();
      if (p.m) g.applyMatrix4(p.m);
      total += g.attributes.position.count;
      return { g, c: new T.Color(p.c) };
    });
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
    let o = 0;
    for (const { g, c } of prepared) {
      const P = g.attributes.position.array, N = g.attributes.normal.array;
      pos.set(P, o * 3); nor.set(N, o * 3);
      for (let i = 0; i < g.attributes.position.count; i++) { col[(o + i) * 3] = c.r; col[(o + i) * 3 + 1] = c.g; col[(o + i) * 3 + 2] = c.b; }
      o += g.attributes.position.count; g.dispose();
    }
    const out = new T.BufferGeometry();
    out.setAttribute('position', new T.BufferAttribute(pos, 3));
    out.setAttribute('normal', new T.BufferAttribute(nor, 3));
    out.setAttribute('color', new T.BufferAttribute(col, 3));
    out.computeBoundingSphere();
    return out;
  }
  function M(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    return new T.Matrix4().compose(V(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rx, ry, rz, 'YXZ')), V(sx, sy, sz));
  }
  const G = {
    sph: (r, w = 12, h = 8) => new T.SphereGeometry(r, w, h),
    cyl: (rt, rb, h, s = 8) => new T.CylinderGeometry(rt, rb, h, s),
    box: (x, y, z) => new T.BoxGeometry(x, y, z),
    cone: (r, h, s = 10) => new T.ConeGeometry(r, h, s, 1, true),
    tor: (r, t, s = 8, ts = 18) => new T.TorusGeometry(r, t, s, ts),
  };
  function woodTexture(base, planks = true) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 256;
    const x = c.getContext('2d');
    const col = new T.Color(base);
    for (let i = 0; i < 16; i++) {
      const k = 0.85 + Math.random() * 0.25;
      x.fillStyle = `rgb(${col.r * 255 * k | 0},${col.g * 255 * k | 0},${col.b * 255 * k | 0})`;
      if (planks) x.fillRect(0, i * 16, 256, 16); else x.fillRect(i * 16, 0, 16, 256);
      x.fillStyle = 'rgba(0,0,0,0.18)';
      if (planks) x.fillRect(0, i * 16, 256, 1); else x.fillRect(i * 16, 0, 1, 256);
    }
    for (let i = 0; i < 260; i++) { x.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`; x.fillRect(Math.random() * 256, Math.random() * 256, 30 + Math.random() * 60, 1); }
    const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.colorSpace = T.SRGBColorSpace;
    return t;
  }

  /* ---------- 人物モデル ---------- */
  const SHOULDER_X = 0.24, UPPER = 0.27, FORE = 0.27;
  function personBody(look, standing) {
    const k = JSON.stringify(look) + standing;
    if (geoCache.has(k)) return geoCache.get(k);
    const P = LOOK_PARTS, b = look.build || 1;
    const skin = P.skins[look.skin] ?? P.skins[0], hair = P.hairColors[look.hairColor] ?? P.hairColors[0];
    const black = 0x16161a, dark = 0x222229, white = 0xf2f0ea;
    const lift = standing ? 0.4 : 0;     // 立ち姿は胴を持ち上げる
    const parts = [];
    // 脚
    if (standing) {
      parts.push({ g: G.cyl(0.075, 0.07, 0.62), c: black, m: M(0.1, 0.31, 0) }, { g: G.cyl(0.075, 0.07, 0.62), c: black, m: M(-0.1, 0.31, 0) });
      parts.push({ g: G.box(0.13, 0.06, 0.24), c: 0x0a0a0a, m: M(0.1, 0.03, 0.05) }, { g: G.box(0.13, 0.06, 0.24), c: 0x0a0a0a, m: M(-0.1, 0.03, 0.05) });
    } else {
      parts.push({ g: G.box(0.13, 0.13, 0.42), c: black, m: M(0.1, 0.5, 0.16) }, { g: G.box(0.13, 0.13, 0.42), c: black, m: M(-0.1, 0.5, 0.16) });
      parts.push({ g: G.box(0.12, 0.46, 0.13), c: black, m: M(0.1, 0.25, 0.34) }, { g: G.box(0.12, 0.46, 0.13), c: black, m: M(-0.1, 0.25, 0.34) });
      parts.push({ g: G.box(0.13, 0.06, 0.24), c: 0x0a0a0a, m: M(0.1, 0.03, 0.41) }, { g: G.box(0.13, 0.06, 0.24), c: 0x0a0a0a, m: M(-0.1, 0.03, 0.41) });
    }
    // 胴体・衣装
    parts.push({ g: G.cyl(0.19, 0.24, 0.56, 10), c: look.style === 'dress' ? 0x121216 : black, m: M(0, 0.84 + lift, 0, 0, 0, 0, b, 1, b * 0.92) });
    if (look.style === 'dress') {
      parts.push({ g: new T.CylinderGeometry(0.24, standing ? 0.36 : 0.42, standing ? 0.6 : 0.5, 12, 1, true), c: 0x121216, m: standing ? M(0, 0.33 + 0.02, 0, 0, 0, 0, b, 1, b) : M(0, 0.5, 0.12, 0.55, 0, 0, b, 1, b) });
      parts.push({ g: G.box(0.16, 0.08, 0.02), c: skin, m: M(0, 1.08 + lift, 0.2, -0.2) });
    } else {
      parts.push({ g: G.box(0.13, 0.3, 0.02), c: look.style === 'tux' ? white : 0x3a3d48, m: M(0, 0.96 + lift, 0.205 * b, -0.12) });
      if (look.style === 'tux') parts.push({ g: G.box(0.12, 0.045, 0.03), c: 0x0a0a0a, m: M(0, 1.09 + lift, 0.21 * b) });
    }
    // 頭部
    const hy = 1.36 + lift, R = 0.3;
    parts.push({ g: G.sph(0.085, 8, 6), c: skin, m: M(0, 1.14 + lift, 0) });
    parts.push({ g: G.sph(R, 16, 12), c: skin, m: M(0, hy, 0) });
    // 顔（パターン）
    const f = look.face || 0;
    const eyeH = [0.06, 0.025, 0.04, 0.06, 0.035, 0.018][f], eyeW = [0.042, 0.05, 0.05, 0.042, 0.035, 0.05][f];
    for (const sx of [1, -1]) {
      parts.push({ g: G.sph(1, 8, 6), c: 0x1d1712, m: M(sx * 0.105, hy + 0.01, R * 0.9, 0, 0, 0, eyeW, eyeH, 0.03) });
      if (f === 3 || f === 4) parts.push({ g: G.box(0.09, 0.022, 0.02), c: hair, m: M(sx * 0.105, hy + 0.09, R * 0.92, 0, 0, sx * (f === 4 ? 0.25 : -0.12)) });
      else parts.push({ g: G.box(0.075, 0.014, 0.02), c: hair, m: M(sx * 0.105, hy + 0.085, R * 0.93, 0, 0, sx * -0.08) });
      parts.push({ g: G.sph(1, 6, 4), c: 0xf0a8a0, m: M(sx * 0.17, hy - 0.06, R * 0.82, 0, 0, 0, 0.045, 0.025, 0.02) });
    }
    parts.push({ g: G.box(f === 1 ? 0.07 : 0.05, 0.016, 0.02), c: 0x9a4a44, m: M(0, hy - 0.11, R * 0.94) });
    if (look.glasses) for (const sx of [1, -1]) parts.push({ g: G.tor(0.058, 0.009, 4, 14), c: 0x2a2a2a, m: M(sx * 0.105, hy + 0.01, R * 0.96) });
    // 髪型
    const cap = (s = 1.07, th = 0.56) => new T.SphereGeometry(R * s, 16, 10, 0, Math.PI * 2, 0, Math.PI * th);
    const shell = (s, th, front = 1.3) => new T.SphereGeometry(R * s, 16, 10, Math.PI / 2 + front / 2, Math.PI * 2 - front, 0, Math.PI * th);
    const h = look.hair;
    if (h === 'crop') parts.push({ g: cap(1.04, 0.5), c: hair, m: M(0, hy + 0.01, -0.01, -0.25) });
    else parts.push({ g: cap(), c: hair, m: M(0, hy + 0.01, -0.015, -0.3) });
    if (h === 'side') parts.push({ g: G.box(0.26, 0.07, 0.12), c: hair, m: M(0.06, hy + 0.2, 0.2, -0.5, 0, -0.25) });
    if (h === 'bob') parts.push({ g: shell(1.1, 0.72), c: hair, m: M(0, hy, -0.01, 0, 0, 0, 1, 1.02, 1) });
    if (h === 'long') { parts.push({ g: shell(1.1, 0.72), c: hair, m: M(0, hy, -0.01) }); parts.push({ g: G.box(0.5, 0.42, 0.14), c: hair, m: M(0, hy - 0.36, -0.15, 0.08) }); }
    if (h === 'ponytail') { parts.push({ g: G.sph(0.09), c: hair, m: M(0, hy + 0.05, -0.31) }); parts.push({ g: G.cyl(0.07, 0.035, 0.36), c: hair, m: M(0, hy - 0.16, -0.36, 0.2) }); }
    if (h === 'bun') parts.push({ g: G.sph(0.13), c: hair, m: M(0, hy + 0.2, -0.24) });
    if (h === 'wavy') { parts.push({ g: shell(1.13, 0.62), c: hair, m: M(0, hy, -0.02) }); for (const sx of [1, -1]) parts.push({ g: G.sph(0.1), c: hair, m: M(sx * 0.26, hy - 0.08, -0.05) }); }
    const g = merge(parts);
    geoCache.set(k, g);
    return g;
  }
  function armMeshes() {
    if (!geoCache.has('arm')) {
      const up = G.cyl(0.062, 0.055, UPPER, 7); up.translate(0, -UPPER / 2, 0);
      geoCache.set('arm', up);
    }
    return geoCache.get('arm');
  }
  function foreGeo(skin) {
    const k = 'fore' + skin;
    if (!geoCache.has(k)) {
      const fg = G.cyl(0.053, 0.045, FORE - 0.04, 7);
      geoCache.set(k, merge([{ g: fg, c: 0x16161a, m: M(0, -(FORE - 0.04) / 2, 0) }, { g: G.box(0.05, 0.02, 0.02), c: 0xf2f0ea, m: M(0, -(FORE - 0.05), 0) }, { g: G.sph(0.058, 8, 6), c: skin, m: M(0, -FORE, 0) }]));
    }
    return geoCache.get(k);
  }
  function makePerson(look, standing) {
    const group = new T.Group();
    const body = new T.Mesh(personBody(look, standing), VCOL());
    group.add(body);
    const skin = LOOK_PARTS.skins[look.skin] ?? LOOK_PARTS.skins[0];
    const lift = standing ? 0.4 : 0;
    const arm = side => {
      const upper = new T.Mesh(armMeshes(), mat(0x16161a));
      const fore = new T.Mesh(foreGeo(skin), VCOL());
      group.add(upper, fore);
      return { upper, fore, shoulder: V(side * SHOULDER_X * (look.build || 1), 1.06 + lift, 0), side, hand: V(side * 0.25, 0.62 + lift, 0.25), elbow: V() };
    };
    return { group, body, L: arm(1), R: arm(-1), lift };
  }
  // 2関節IK：肩→肘→手。pole（肘を出す方向）で自然な曲げ方にする
  const _d = T ? new T.Vector3() : null, _n = T ? new T.Vector3() : null, _pole = T ? new T.Vector3() : null;
  function solveArm(arm, target) {
    const S = arm.shoulder;
    _d.subVectors(target, S); let d = _d.length();
    const maxR = UPPER + FORE - 0.005; if (d > maxR) { _d.multiplyScalar(maxR / d); d = maxR; }
    if (d < 0.06) { d = 0.06; _d.set(0, -0.06, 0); }
    const dir = _d.clone().normalize();
    const cosA = clamp((UPPER * UPPER + d * d - FORE * FORE) / (2 * UPPER * d), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
    _pole.set(arm.side * 0.9, -1, -0.45);
    _n.copy(_pole).addScaledVector(dir, -_pole.dot(dir)).normalize();
    arm.elbow.copy(S).addScaledVector(dir, UPPER * cosA).addScaledVector(_n, UPPER * sinA);
    const hand = tmpV2.copy(S).add(_d);
    arm.upper.position.copy(S);
    arm.upper.quaternion.setFromUnitVectors(DOWN, tmpV.subVectors(arm.elbow, S).normalize());
    arm.fore.position.copy(arm.elbow);
    arm.fore.quaternion.setFromUnitVectors(DOWN, tmpV.subVectors(hand, arm.elbow).normalize());
    arm.hand.copy(hand);
  }

  /* ---------- 楽器 ---------- */
  const WOOD = 0x7c3412, WOOD2 = 0x5e260b, BLK = 0x141414, GOLD = 0xc9a24a, SILVER = 0xc8ccd2, COPPER = 0xb26b3a;
  // 楽器のジオメトリは +Z 方向（または +Y）に沿って作る
  function instrumentGeo(kind) {
    if (geoCache.has('i' + kind)) return geoCache.get('i' + kind);
    let parts = [];
    const strings = (L, W, scaleN) => [
      { g: G.sph(1, 12, 8), c: WOOD, m: M(0, 0, L * 0.3, 0, 0, 0, W, W * 0.32, L * 0.32) },
      { g: G.box(0.03 * scaleN, 0.025 * scaleN, L * 0.42), c: BLK, m: M(0, W * 0.22, L * 0.72) },
      { g: G.sph(0.03 * scaleN, 6, 4), c: WOOD2, m: M(0, W * 0.22, L * 0.95) },
    ];
    if (kind === 'vn') parts = strings(0.56, 0.11, 1);
    if (kind === 'va') parts = strings(0.62, 0.12, 1.1);
    if (kind === 'vc' || kind === 'cb') {   // 縦置き：+Y 方向
      const s = kind === 'cb' ? 1.45 : 1;
      parts = [
        { g: G.sph(1, 14, 10), c: WOOD, m: M(0, 0.42 * s, 0, 0, 0, 0, 0.23 * s, 0.36 * s, 0.1 * s) },
        { g: G.box(0.05 * s, 0.55 * s, 0.04 * s), c: BLK, m: M(0, 0.95 * s, 0.03) },
        { g: G.sph(0.05 * s, 6, 4), c: WOOD2, m: M(0, 1.24 * s, 0.03) },
        { g: G.cyl(0.012, 0.008, 0.14 * s, 5), c: SILVER, m: M(0, 0.02, 0) },
      ];
    }
    if (kind === 'fl') parts = [{ g: G.cyl(0.018, 0.018, 0.62, 8), c: SILVER, m: M(0, 0, 0.31, Math.PI / 2) }];
    if (kind === 'ob') parts = [{ g: G.cyl(0.016, 0.026, 0.5, 8), c: BLK, m: M(0, 0, 0.25, Math.PI / 2) }, { g: G.cone(0.045, 0.06), c: BLK, m: M(0, 0, 0.52, Math.PI / 2) }];
    if (kind === 'cl') parts = [{ g: G.cyl(0.02, 0.026, 0.56, 8), c: BLK, m: M(0, 0, 0.28, Math.PI / 2) }, { g: G.cone(0.06, 0.09), c: BLK, m: M(0, 0, 0.6, Math.PI / 2) }, { g: G.cyl(0.023, 0.023, 0.02, 8), c: SILVER, m: M(0, 0, 0.2, Math.PI / 2) }];
    if (kind === 'fg') parts = [{ g: G.cyl(0.045, 0.05, 1.05, 8), c: 0x6a2e12, m: M(0, 0.52, 0) }, { g: G.cyl(0.05, 0.05, 0.2, 8), c: 0x6a2e12, m: M(0.07, 0.1, 0) }, { g: G.cyl(0.007, 0.007, 0.32, 4), c: SILVER, m: M(0, 0.62, 0.12, 1.1) }];
    if (kind === 'hr') parts = [{ g: G.tor(0.14, 0.022, 6, 20), c: GOLD, m: M(0, 0, 0, 0, Math.PI / 2) }, { g: G.tor(0.08, 0.016, 6, 16), c: GOLD, m: M(0, 0, 0, 0, Math.PI / 2) }, { g: G.cone(0.13, 0.22, 14), c: GOLD, m: M(0, -0.14, -0.14, 2.3) }, { g: G.cyl(0.008, 0.008, 0.25, 4), c: GOLD, m: M(0, 0.12, 0.13, 1.2) }];
    if (kind === 'tp') parts = [{ g: G.cyl(0.014, 0.014, 0.32, 6), c: GOLD, m: M(0, 0, 0.16, Math.PI / 2) }, { g: G.cyl(0.014, 0.014, 0.26, 6), c: GOLD, m: M(0, -0.06, 0.2, Math.PI / 2) }, { g: G.cone(0.065, 0.13, 12), c: GOLD, m: M(0, 0, 0.38, -Math.PI / 2) }, ...[0, 1, 2].map(i => ({ g: G.cyl(0.012, 0.012, 0.1, 6), c: SILVER, m: M(0, -0.03, 0.12 + i * 0.03) }))];
    if (kind === 'tb') parts = [{ g: G.cyl(0.014, 0.014, 0.6, 6), c: GOLD, m: M(0, 0.04, 0.22, Math.PI / 2) }, { g: G.cone(0.1, 0.18, 12), c: GOLD, m: M(0, 0.04, 0.55, -Math.PI / 2) }];
    if (kind === 'tbslide') parts = [{ g: G.cyl(0.011, 0.011, 0.55, 5), c: SILVER, m: M(0.035, -0.04, 0.27, Math.PI / 2) }, { g: G.cyl(0.011, 0.011, 0.55, 5), c: SILVER, m: M(-0.035, -0.04, 0.27, Math.PI / 2) }, { g: G.cyl(0.012, 0.012, 0.08, 5), c: SILVER, m: M(0, -0.04, 0.55, 0, 0, Math.PI / 2) }];
    if (kind === 'tu') parts = [{ g: G.cyl(0.14, 0.17, 0.5, 12), c: GOLD, m: M(0, 0, 0) }, { g: G.cone(0.26, 0.3, 16), c: GOLD, m: M(0, 0.38, 0, Math.PI) }, { g: G.tor(0.09, 0.03, 6, 14), c: GOLD, m: M(0, -0.25, 0.05, Math.PI / 2) }, ...[0, 1, 2, 3].map(i => ({ g: G.cyl(0.015, 0.015, 0.12, 6), c: SILVER, m: M(-0.04 + i * 0.03, 0.12, 0.16) }))];
    if (kind === 'timp') parts = [-1, 1].flatMap(sx => [{ g: new T.SphereGeometry(0.34, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), c: COPPER, m: M(sx * 0.37, 0.72, 0) }, { g: new T.CircleGeometry(0.34, 16), c: 0xe8e0cc, m: M(sx * 0.37, 0.72, 0, -Math.PI / 2) }, { g: G.cyl(0.02, 0.02, 0.4, 5), c: BLK, m: M(sx * 0.37, 0.2, 0) }]);
    if (kind === 'snare') parts = [{ g: G.cyl(0.19, 0.19, 0.14, 14), c: 0xd8d8d8, m: M(0, 0.82, 0) }, { g: G.cyl(0.015, 0.015, 0.75, 5), c: BLK, m: M(0, 0.38, 0) }];
    if (kind === 'bassdrum') parts = [{ g: G.cyl(0.42, 0.42, 0.34, 18), c: 0xe6e0d2, m: M(0, 0.66, 0, 0, 0, Math.PI / 2) }, { g: G.box(0.4, 0.3, 0.4), c: BLK, m: M(0, 0.15, 0) }];
    if (kind === 'cymbal') parts = [{ g: G.cyl(0.24, 0.24, 0.012, 16), c: 0xd1b25a, m: M(0, 1.05, 0.1, 0.3) }, { g: G.cyl(0.012, 0.012, 1.0, 5), c: BLK, m: M(0, 0.52, 0.05) }];
    if (kind === 'glock') parts = [{ g: G.box(0.6, 0.05, 0.3), c: 0x3a2a20, m: M(0, 0.8, 0) }, ...[0, 1, 2, 3, 4, 5, 6, 7].map(i => ({ g: G.box(0.05, 0.02, 0.2 - i * 0.012), c: SILVER, m: M(-0.24 + i * 0.07, 0.835, 0) })), { g: G.cyl(0.015, 0.015, 0.75, 5), c: BLK, m: M(0, 0.4, 0) }];
    if (kind === 'bow') parts = [{ g: G.cyl(0.006, 0.006, 0.62, 4), c: 0x4a2a14, m: M(0, 0, 0.31, Math.PI / 2) }, { g: G.box(0.012, 0.02, 0.6), c: 0xf0ece0, m: M(0, -0.018, 0.31) }];
    if (kind === 'mallet') parts = [{ g: G.cyl(0.008, 0.008, 0.34, 4), c: 0x8a6a40, m: M(0, 0, 0.17, Math.PI / 2) }, { g: G.sph(0.03, 6, 4), c: 0xeeeeee, m: M(0, 0, 0.34) }];
    if (kind === 'baton') parts = [{ g: G.cyl(0.004, 0.007, 0.36, 4), c: 0xf8f8f8, m: M(0, 0, 0.18, Math.PI / 2) }, { g: G.sph(0.015, 6, 4), c: 0x6a4a2a, m: M(0, 0, 0) }];
    if (kind === 'chair') parts = [{ g: G.box(0.46, 0.06, 0.44), c: 0x1f1b1a, m: M(0, 0.47, 0.12) }, { g: G.box(0.46, 0.44, 0.05), c: 0x1f1b1a, m: M(0, 0.72, -0.1, -0.1) }, ...[[0.2, 0.3], [-0.2, 0.3], [0.2, -0.08], [-0.2, -0.08]].map(([x, z]) => ({ g: G.cyl(0.018, 0.018, 0.46, 4), c: 0x444444, m: M(x, 0.23, z) }))];
    if (kind === 'stand') parts = [{ g: G.cyl(0.012, 0.012, 1.0, 4), c: 0x222222, m: M(0, 0.5, 0) }, { g: G.box(0.4, 0.28, 0.02), c: 0x1a1a1a, m: M(0, 1.05, 0.02, -0.6) }, { g: G.box(0.36, 0.24, 0.005), c: 0xf2ecdc, m: M(0, 1.06, 0.035, -0.6) }, { g: G.cyl(0.14, 0.14, 0.02, 6), c: 0x222222, m: M(0, 0.01, 0) }];
    const g = merge(parts);
    geoCache.set('i' + kind, g);
    return g;
  }
  const INST_KIND = { Vn1: 'vn', Vn2: 'vn', Va: 'va', Vc: 'vc', Cb: 'cb', Fl: 'fl', Ob: 'ob', Cl: 'cl', Fg: 'fg', Hr: 'hr', Tp: 'tp', Tb: 'tb', Tuba: 'tu', Perc: 'pc' };
  const PERC_KINDS = ['timp', 'snare', 'bassdrum', 'cymbal', 'glock', 'snare'];

  /* ---------- 奏者（アクター） ---------- */
  function makeActor(member, seat, rngSeed) {
    const kind = INST_KIND[member.inst];
    const standing = kind === 'pc' || kind === 'cb';
    const p = makePerson(member.look || generateLook(member.id, member.name), standing);
    p.group.position.set(seat.x, seat.y, seat.z); p.group.rotation.y = seat.rot;
    const a = { member, seat, kind, sec: INST[member.inst].section, standing, ...p, w: 0, pk: seat.pk || 0,
      rng: seededRng(rngSeed), jit: 0, amp: 1, swayPh: 0, bowDir: 1, lastNote: -1, walk: null };
    const ik = kind === 'pc' ? PERC_KINDS[a.pk % PERC_KINDS.length] : kind;
    a.instr = new T.Mesh(instrumentGeo(ik === 'vn' || ik === 'va' ? ik : ik), VCOL());
    p.group.add(a.instr);
    if (['vn', 'va', 'vc', 'cb'].includes(kind)) { a.tool = new T.Mesh(instrumentGeo('bow'), VCOL()); p.group.add(a.tool); }
    if (kind === 'tb') { a.slide = new T.Mesh(instrumentGeo('tbslide'), VCOL()); a.instr.add(a.slide); }
    if (kind === 'pc') { a.tool = new T.Mesh(instrumentGeo('mallet'), VCOL()); a.tool2 = new T.Mesh(instrumentGeo('mallet'), VCOL()); p.group.add(a.tool, a.tool2); a.ik = ik; }
    if (member.isPrincipal) a.principal = true;
    return a;
  }
  function makeConductorActor(cd, podium) {
    const p = makePerson(cd.look || generateLook(cd.id, cd.name), true);
    p.group.position.set(podium.x, podium.y, podium.z); p.group.rotation.y = Math.PI;   // オーケストラの方を向く
    const a = { member: cd, standing: true, ...p, baton: new T.Mesh(instrumentGeo('baton'), VCOL()), home: V(podium.x, podium.y, podium.z), w: 0, bow: 0, face: Math.PI, walk: null };
    p.group.add(a.baton);
    return a;
  }

  /* ---------- 配置（指揮者を中心とした弧） ---------- */
  function layoutSeats(lineup, stageY) {
    const O = { x: 0, z: -1.6 };
    const out = [];
    const arc = (inst, list, r0, a0, a1, rise, opts = {}) => {
      let r = r0, idx = 0, row = 0;
      while (idx < list.length) {
        const span = Math.abs(a1 - a0) * Math.PI / 180 * r;
        const n = Math.max(1, Math.min(list.length - idx, Math.floor(span / (opts.gap || 0.9)) + 1));
        for (let k = 0; k < n; k++, idx++) {
          const ang = (a0 + (a1 - a0) * (n === 1 ? 0.5 : (k + 0.5) / n)) * Math.PI / 180;
          const x = O.x + r * Math.cos(ang), z = O.z - r * Math.sin(ang);
          out.push({ inst, member: list[idx], x, z, y: stageY + rise + (opts.rowRise || 0) * row, rot: Math.atan2(O.x - x, O.z - z), pk: idx });
        }
        r += 0.95; row++;
      }
    };
    const L = lineup;
    arc('Vn1', L.Vn1, 2.0, 172, 124, 0);
    arc('Vn2', L.Vn2, 2.6, 122, 92, 0);
    arc('Va', L.Va, 2.6, 88, 58, 0);
    arc('Vc', L.Vc, 2.0, 56, 10, 0);
    arc('Cb', L.Cb, 5.3, 40, 12, 0.25, { gap: 1.0 });
    arc('Fl', L.Fl, 5.3, 93, 116, 0.3, { gap: 0.85 });
    arc('Ob', L.Ob, 5.3, 87, 64, 0.3, { gap: 0.85 });
    arc('Cl', L.Cl, 6.3, 93, 114, 0.3, { gap: 0.85 });
    arc('Fg', L.Fg, 6.3, 87, 66, 0.3, { gap: 0.85 });
    arc('Hr', L.Hr, 7.4, 110, 152, 0.6, { gap: 0.85 });
    arc('Tp', L.Tp, 7.4, 92, 74, 0.6, { gap: 0.85 });
    arc('Tb', L.Tb, 7.4, 72, 54, 0.6, { gap: 0.9 });
    arc('Tuba', L.Tuba, 7.4, 52, 44, 0.6, { gap: 0.9 });
    arc('Perc', L.Perc, 8.7, 112, 70, 0.9, { gap: 1.05 });
    return { seats: out, podium: { x: O.x, y: stageY + 0.22, z: O.z } };
  }

  /* ---------- 練習室（通常練習の場所。data/halls/index.json の practiceRoom） ----------
   * 客席のない楽団専用の部屋。明るい木の床・演奏エリアのカーペット・低いひな壇・窓・ホワイトボード・
   * アップライトピアノ・蛍光灯など。団員の配置・動き・カメラはホールと同じ仕組みをそのまま使う。 */
  function buildPracticeRoom() {
    if (hallGroup) { scene.remove(hallGroup); disposeGroup(hallGroup); }
    audience = null;
    const R = PRACTICE_ROOM.visual;
    const g = new T.Group(); hallGroup = g; scene.add(g);
    const W = R.w, D = R.d, H = R.h, stageW = Math.min(W - 2, 20), stageD = 12, stageY = 0.02, back = -stageD;
    const depth = D + stageD + 2, cz = (D - stageD) / 2;
    // 床（明るいフローリング）と演奏エリアのカーペット
    const floorTex = woodTexture(R.floor); floorTex.repeat.set(W / 3, depth / 3);
    const floor = new T.Mesh(new T.PlaneGeometry(W, depth), new T.MeshLambertMaterial({ map: floorTex }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, cz); g.add(floor);
    const carpet = new T.Mesh(new T.PlaneGeometry(stageW, stageD + 1.5), mat(R.carpet)); carpet.rotation.x = -Math.PI / 2; carpet.position.set(0, 0.012, back / 2 + 0.6); g.add(carpet);
    // 低いひな壇（管・打楽器。高さはホールと同じなので座る位置も同じ）
    const riserMat = mat(new T.Color(R.carpet).multiplyScalar(0.8).getHex());
    [[5.0, 0.3], [7.0, 0.6], [8.3, 0.9]].forEach(([r, h], i) => {
      const plat = new T.Mesh(G.box(Math.min(stageW - 1, 6 + r * 1.6), h, 1.2 + (2 - i) * 0.2), riserMat);
      plat.position.set(0, h / 2, -1.6 - r - 0.2 + (i === 2 ? -0.2 : 0)); g.add(plat);
    });
    // 壁・天井（白い壁、明るい天井）
    const room = new T.Mesh(G.box(W, H, depth), new T.MeshLambertMaterial({ color: R.wall, side: T.BackSide })); room.position.set(0, H / 2, cz); g.add(room);
    const ceil = new T.Mesh(new T.PlaneGeometry(W, depth), new T.MeshLambertMaterial({ color: R.ceiling, emissive: new T.Color(R.ceiling).multiplyScalar(0.18) }));
    ceil.rotation.x = Math.PI / 2; ceil.position.set(0, H - 0.01, cz); g.add(ceil);
    const backWall = new T.Mesh(new T.PlaneGeometry(W, H), mat(R.backdrop)); backWall.position.set(0, H / 2, back - 0.9); g.add(backWall);
    // 腰壁（木）
    for (const [x, rot, len] of [[-W / 2 + 0.03, Math.PI / 2, depth], [W / 2 - 0.03, -Math.PI / 2, depth]]) {
      const wain = new T.Mesh(new T.PlaneGeometry(len, 1.0), mat(new T.Color(R.floor).multiplyScalar(0.85).getHex())); wain.rotation.y = rot; wain.position.set(x, 0.5, cz); g.add(wain);
    }
    // 蛍光灯
    const lg = G.box(2.4, 0.06, 0.3), lm = mat(0xf4f8ff, { basic: true });
    for (let x = -6; x <= 6; x += 4) for (let z = back + 1.5; z < D - 1; z += 4) { const l = new T.Mesh(lg, lm); l.position.set(x, H - 0.05, z); g.add(l); }
    // 左の壁の窓（外の光）
    const nw = Math.round(R.windows || 0);
    for (let k = 0; k < nw; k++) {
      const z = back + 1.5 + k * ((depth - 4) / Math.max(1, nw));
      const glass = new T.Mesh(new T.PlaneGeometry(2.2, 1.7), mat(0xcfe6f7, { basic: true })); glass.rotation.y = Math.PI / 2; glass.position.set(-W / 2 + 0.04, 2.6, z); g.add(glass);
      const frameM = mat(0xf2f2f0);
      for (const [dy, dz, w, h] of [[0.9, 0, 0.08, 2.4], [-0.9, 0, 0.08, 2.4], [0, 0, 1.8, 0.08], [0, 1.15, 1.8, 0.08], [0, -1.15, 1.8, 0.08]]) {
        const f = new T.Mesh(G.box(0.06, w, h), frameM); f.position.set(-W / 2 + 0.07, 2.6 + dy, z + dz); g.add(f);
      }
    }
    // 右の壁の吸音パネル
    const pg = G.box(0.08, 1.6, 1.2), pm = mat(0x7b8794); const np = Math.floor(depth / 2.6);
    const inst = new T.InstancedMesh(pg, pm, np); const o = new T.Object3D();
    for (let k = 0; k < np; k++) { o.position.set(W / 2 - 0.06, 2.8, back + 0.8 + k * 2.6); o.updateMatrix(); inst.setMatrixAt(k, o.matrix); }
    g.add(inst);
    // 奥の壁：ホワイトボードと時計
    if (R.whiteboard) {
      const wb = new T.Mesh(G.box(6.4, 2.0, 0.06), mat(0xfbfbf8)); wb.position.set(0, 3.0, back - 0.85); g.add(wb);
      const fr = new T.Mesh(G.box(6.6, 0.08, 0.1), mat(0x9a9a9a)); fr.position.set(0, 1.97, back - 0.8); g.add(fr);
      for (const [x, w, c] of [[-1.8, 2.2, 0x3a5fa8], [0.6, 1.6, 0x3a5fa8], [-0.8, 2.8, 0xb03a3a]]) { const ln = new T.Mesh(G.box(w, 0.05, 0.02), mat(c, { basic: true })); ln.position.set(x, 3.4 - (c === 0xb03a3a ? 0.5 : x > 0 ? 0.25 : 0), back - 0.81); g.add(ln); }
    }
    const clock = new T.Mesh(G.cyl(0.38, 0.38, 0.06, 20), mat(0xffffff, { basic: true })); clock.rotation.x = Math.PI / 2; clock.position.set(W * 0.3, 4.6, back - 0.85); g.add(clock);
    const rim = new T.Mesh(G.cyl(0.42, 0.42, 0.04, 20), mat(0x333333)); rim.rotation.x = Math.PI / 2; rim.position.set(W * 0.3, 4.6, back - 0.88); g.add(rim);
    // アップライトピアノ・楽器ケース・積み重ねた椅子（手前の左右）
    if (R.piano) {
      const pz = Math.min(D - 2, 4.5);
      const body = new T.Mesh(G.box(1.5, 1.25, 0.6), mat(0x161616)); body.position.set(-W / 2 + 1.2, 0.62, pz); body.rotation.y = Math.PI / 2; g.add(body);
      const keys = new T.Mesh(G.box(1.4, 0.06, 0.25), mat(0xf4f1e8)); keys.position.set(-W / 2 + 1.55, 0.75, pz); keys.rotation.y = Math.PI / 2; g.add(keys);
    }
    for (let k = 0; k < 5; k++) { const cs = new T.Mesh(G.box(0.35, 0.25 + (k % 3) * 0.12, 1.1 + (k % 2) * 0.4), mat([0x2b2b30, 0x5a3b28, 0x1e2a3a][k % 3])); cs.position.set(W / 2 - 0.5, 0.15 + (k % 3) * 0.06, Math.min(D - 1.5, 2.5) + k * 0.55); g.add(cs); }
    for (let k = 0; k < 6; k++) { const ch = new T.Mesh(G.box(0.48, 0.05, 0.45), mat(0x30343c)); ch.position.set(W / 2 - 2.0, 0.45 + k * 0.08, Math.min(D - 2, 6)); g.add(ch); }
    // ライティング（昼白色）
    hemi.color.set(R.light); hemi.intensity = 1.15 * R.lightI;
    keyLight.color.set(R.light); keyLight.intensity = 1.5 * R.lightI;
    scene.background = new T.Color(R.ceiling).multiplyScalar(0.15);
    layoutInfo = { W, D, H, stageW, stageD, stageY, back, V3: { lightI: R.lightI }, rakeAt: () => 0, room: true, maxZ: D - 0.6 };
    return layoutInfo;
  }

  /* ---------- ホール ---------- */
  function buildHall(hallId) {
    if (hallId === PRACTICE_ROOM.id) return buildPracticeRoom();
    if (hallGroup) { scene.remove(hallGroup); disposeGroup(hallGroup); }
    const V3 = HALL_VISUALS[hallId] || HALL_VISUALS.general;
    const g = new T.Group(); hallGroup = g; scene.add(g);
    const W = V3.w, D = V3.d, H = V3.h;
    const stageW = Math.min(W - 2, 22), stageD = 12, stageY = 1.0;
    const back = -stageD;
    // 床・ステージ（木目）
    const floorTex = woodTexture(V3.floor); floorTex.repeat.set(W / 4, D / 4);
    const floor = new T.Mesh(new T.PlaneGeometry(W, D + 2), new T.MeshLambertMaterial({ map: floorTex }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, D / 2 - 1); g.add(floor);
    const stageTex = woodTexture(V3.stageFloor); stageTex.repeat.set(stageW / 3, stageD / 3);
    const stageMat = new T.MeshLambertMaterial({ map: stageTex });
    const stage = new T.Mesh(G.box(stageW, stageY, stageD), [mat(0x2a1c12), mat(0x2a1c12), stageMat, mat(0x2a1c12), mat(0x3a2616), mat(0x2a1c12)]);
    stage.position.set(0, stageY / 2, back / 2); g.add(stage);
    // ひな壇（管・打楽器）
    [[5.0, 0.3], [7.0, 0.6], [8.3, 0.9]].forEach(([r, h], i) => {
      const plat = new T.Mesh(G.box(Math.min(stageW - 1, 6 + r * 1.6), h, 1.2 + (2 - i) * 0.2), stageMat);
      plat.position.set(0, stageY + h / 2, -1.6 - r - 0.2 + (i === 2 ? -0.2 : 0)); g.add(plat);
    });
    // 壁・天井
    const wallMat = new T.MeshLambertMaterial({ color: V3.wallWood ? 0xffffff : V3.wall, map: V3.wallWood ? woodTexture(V3.wall, false) : null, side: T.BackSide });
    if (wallMat.map) wallMat.map.repeat.set(6, 2);
    const room = new T.Mesh(G.box(W, H, D + stageD + 2), wallMat);
    room.position.set(0, H / 2, (D - stageD) / 2); g.add(room);
    const ceil = new T.Mesh(new T.PlaneGeometry(W, D + stageD), new T.MeshLambertMaterial({ color: V3.ceiling, emissive: new T.Color(V3.ceiling).multiplyScalar(V3.folding ? 0.55 : 0.25) }));
    ceil.rotation.x = Math.PI / 2; ceil.position.set(0, H - 0.01, (D - stageD) / 2); g.add(ceil);
    const backWall = new T.Mesh(new T.PlaneGeometry(W, H), new T.MeshLambertMaterial({ color: V3.wallWood ? 0xffffff : V3.backdrop, map: V3.wallWood ? woodTexture(V3.backdrop, false) : null }));
    if (backWall.material.map) backWall.material.map.repeat.set(5, 1);
    backWall.position.set(0, H / 2, back - 0.9); g.add(backWall);
    // 側壁の木製パネル（リズムを付ける）
    if (V3.panels) {
      const pg = G.box(0.12, H * 0.7, 1.2), pm = mat(new T.Color(V3.wall).multiplyScalar(0.75).getHex());
      const n = Math.floor((D + stageD) / 2.4);
      const inst = new T.InstancedMesh(pg, pm, n * 2); let i = 0; const o = new T.Object3D();
      for (let k = 0; k < n; k++) for (const sx of [1, -1]) { o.position.set(sx * (W / 2 - 0.08), H * 0.45, back + 1 + k * 2.4); o.updateMatrix(); inst.setMatrixAt(i++, o.matrix); }
      g.add(inst);
    }
    // 照明（蛍光灯 or シャンデリア）
    if (V3.folding) {
      const lg = G.box(2.4, 0.06, 0.3), lm = mat(0xf4f8ff, { basic: true });
      for (let x = -6; x <= 6; x += 6) for (let z = back + 2; z < D; z += 5) { const l = new T.Mesh(lg, lm); l.position.set(x, H - 0.05, z); g.add(l); }
    }
    for (let k = 0; k < (V3.chandelier || 0); k++) {
      const ch = new T.Group(); const cz = 3 + k * (D - 6) / Math.max(1, V3.chandelier - 1);
      ch.add(new T.Mesh(G.sph(0.5, 12, 8), mat(0xffe4a8, { basic: true })));
      for (let j = 0; j < 12; j++) { const b = new T.Mesh(G.sph(0.12, 6, 4), mat(0xfff2cc, { basic: true })); const a = j / 12 * Math.PI * 2; b.position.set(Math.cos(a) * 1.0, -0.4 + (j % 2) * 0.25, Math.sin(a) * 1.0); ch.add(b); }
      const cord = new T.Mesh(G.cyl(0.02, 0.02, 2, 4), mat(GOLD)); cord.position.y = 1.2; ch.add(cord);
      ch.position.set(0, H - 2.4, cz); g.add(ch);
    }
    // パイプオルガン
    if (V3.organ) {
      const n = 26, pipeG = G.cyl(0.12, 0.12, 1, 8), pm = mat(V3.gold ? 0xd8b866 : 0xb8b4aa);
      const inst = new T.InstancedMesh(pipeG, pm, n); const o = new T.Object3D();
      for (let i = 0; i < n; i++) { const x = (i - n / 2 + 0.5) * 0.3; const h = 2.4 + Math.cos((i - n / 2) / n * Math.PI) * 2.2; o.position.set(x, stageY + 4.6 + h / 2, back - 0.6); o.scale.set(1, h, 1); o.updateMatrix(); inst.setMatrixAt(i, o.matrix); }
      g.add(inst);
      const case_ = new T.Mesh(G.box(n * 0.3 + 0.8, 0.6, 0.6), mat(V3.backdrop)); case_.position.set(0, stageY + 4.3, back - 0.6); g.add(case_);
    }
    // 音響反射板
    if (H >= 11) for (let k = 0; k < 3; k++) { const r = new T.Mesh(G.box(stageW * 0.5, 0.08, 1.6), mat(new T.Color(V3.ceiling).multiplyScalar(0.8).getHex())); r.position.set(0, H - 1.2 - k * 0.2, back + 1.5 + k * 3.2); r.rotation.x = 0.15; g.add(r); }
    // バルコニー
    for (let lv = 0; lv < (V3.balcony || 0); lv++) {
      const y = 4.2 + lv * 3.2;
      for (const sx of [1, -1]) {
        const slab = new T.Mesh(G.box(2.6, 0.3, D - 3), mat(new T.Color(V3.wall).multiplyScalar(0.8).getHex())); slab.position.set(sx * (W / 2 - 1.3), y, D / 2 + 0.5); g.add(slab);
        const rail = new T.Mesh(G.box(0.12, 0.9, D - 3), mat(V3.gold ? 0xc9a24a : new T.Color(V3.wall).multiplyScalar(1.15).getHex())); rail.position.set(sx * (W / 2 - 2.6), y + 0.6, D / 2 + 0.5); g.add(rail);
      }
      if (lv === 0) { const rb = new T.Mesh(G.box(W - 5.2, 0.3, 3), mat(new T.Color(V3.wall).multiplyScalar(0.8).getHex())); rb.position.set(0, y + 1.5, D - 1.2); g.add(rb); }
    }
    // 客席（椅子）と観客
    const rows = V3.rows, cols = V3.cols, seatG = V3.folding ? merge([{ g: G.box(0.46, 0.05, 0.42), c: V3.seat, m: M(0, 0.45, 0) }, { g: G.box(0.46, 0.45, 0.04), c: V3.seat, m: M(0, 0.7, -0.2) }, { g: G.cyl(0.015, 0.015, 0.45, 4), c: 0x999999, m: M(0, 0.22, 0) }])
      : merge([{ g: G.box(0.52, 0.14, 0.48), c: V3.seat, m: M(0, 0.42, 0) }, { g: G.box(0.52, 0.66, 0.1), c: V3.seat, m: M(0, 0.74, -0.22) }, { g: G.box(0.06, 0.5, 0.5), c: 0x2a1a12, m: M(0.28, 0.3, 0) }]);
    const seatMesh = new T.InstancedMesh(seatG, VCOL(), rows * cols);
    const o = new T.Object3D(); const seatPos = [];
    const spacingX = Math.min(0.62, (W - 4) / cols), spacingZ = Math.min(0.95, (D - 2.5) / rows);
    let i = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = (c - (cols - 1) / 2) * spacingX + (c >= cols / 2 ? 0.6 : -0.6);   // 中央通路
      const z = 2.6 + r * spacingZ, y = r * spacingZ * V3.rake * 1.6;
      o.position.set(x, y, z); o.rotation.y = Math.PI; o.updateMatrix(); seatMesh.setMatrixAt(i++, o.matrix);
      seatPos.push({ x, y, z, r, c });
    }
    g.add(seatMesh);
    // 段状の客席床
    if (V3.rake > 0.05) {
      const stepMat = mat(new T.Color(V3.floor).multiplyScalar(0.75).getHex());
      const steps = new T.InstancedMesh(G.box(1, 1, 1), stepMat, rows);
      for (let r = 0; r < rows; r++) { const hgt = r * spacingZ * V3.rake * 1.6; o.position.set(0, hgt / 2, 2.6 + r * spacingZ); o.rotation.set(0, 0, 0); o.scale.set(W - 0.3, Math.max(0.01, hgt), spacingZ); o.updateMatrix(); steps.setMatrixAt(r, o.matrix); }
      o.scale.set(1, 1, 1);
      g.add(steps);
    }
    buildAudience(seatPos, V3);
    // ライティング（ホールごとの色温度）
    hemi.color.set(V3.light); hemi.intensity = 1.15 * V3.lightI;
    keyLight.color.set(V3.light); keyLight.intensity = 1.5 * V3.lightI;
    scene.background = new T.Color(V3.ceiling).multiplyScalar(0.15);
    layoutInfo = { W, D, H, stageW, stageD, stageY, back, V3, rakeAt: z => Math.max(0, z - 2.6) * V3.rake * 1.6 };
    return layoutInfo;
  }
  function buildAudience(seatPos, V3) {
    const n = seatPos.length;
    const bodyG = merge([{ g: G.cyl(0.17, 0.22, 0.6, 6), c: 0xffffff, m: M(0, 0.8, 0) }]);
    const headG = merge([{ g: G.sph(0.17, 7, 5), c: 0xffffff, m: M(0, 1.28, 0) }]);
    const handG = merge([{ g: G.box(0.09, 0.1, 0.05), c: 0xffffff }]);
    const bodies = new T.InstancedMesh(bodyG, mat(0xffffff), n), heads = new T.InstancedMesh(headG, mat(0xffffff), n), hands = new T.InstancedMesh(handG, mat(0xffffff), n * 2);
    bodies.instanceMatrix.setUsage(T.DynamicDrawUsage); heads.instanceMatrix.setUsage(T.DynamicDrawUsage); hands.instanceMatrix.setUsage(T.DynamicDrawUsage);
    const cloth = [0x2a2a33, 0x3d3a4a, 0x5a3030, 0x2f4a5a, 0x6a6a6a, 0x403028, 0x7a6a5a, 0x1e2a3a, 0x8a7060];
    const hair = LOOK_PARTS.hairColors, skins = LOOK_PARTS.skins;
    const c = new T.Color();
    const order = seatPos.map((p, i) => ({ i, k: p.r * 0.12 + Math.abs(p.c - V3.cols / 2) * 0.08 + Math.random() * 3 }));   // 前方・中央がやや埋まりやすい
    order.sort((a, b) => a.k - b.k);
    const rank = new Array(n); order.forEach((o, idx) => rank[o.i] = idx);
    for (let i = 0; i < n; i++) {
      bodies.setColorAt(i, c.set(cloth[i % cloth.length]));
      heads.setColorAt(i, c.set(Math.random() < 0.82 ? hair[Math.floor(Math.random() * 6)] : skins[Math.floor(Math.random() * 5)]));
      hands.setColorAt(i * 2, c.set(skins[i % 5])); hands.setColorAt(i * 2 + 1, c.set(skins[i % 5]));
    }
    hallGroup.add(bodies, heads, hands);
    audience = { bodies, heads, hands, seatPos, rank, n, fill: 0.5, clap: 0, stand: 0, phase: seatPos.map(() => Math.random() * 6.28) };
    updateAudience(0, true);
  }
  function updateAudience(time, force) {
    if (!audience) return;
    const A = audience, o = new T.Object3D(); const visibleN = Math.round(A.n * A.fill);
    if (!force && A.clap <= 0.001 && A.stand <= 0.001 && A._still) return;
    for (let i = 0; i < A.n; i++) {
      const p = A.seatPos[i], on = A.rank[i] < visibleN;
      const ph = A.phase[i];
      const bounce = A.clap * 0.03 * Math.sin(time * 9 + ph);
      const st = A.stand * (A.rank[i] % 3 !== 0 ? 1 : 0.4);
      o.position.set(p.x, on ? p.y + st * 0.45 + bounce : -50, p.z); o.rotation.set(0, Math.PI, 0); o.scale.set(1, 1, 1); o.updateMatrix();
      A.bodies.setMatrixAt(i, o.matrix); A.heads.setMatrixAt(i, o.matrix);
      const clapOpen = A.clap > 0 ? (Math.sin(time * 14 + ph) * 0.5 + 0.5) * 0.09 : 0.1;
      const hy = on ? p.y + st * 0.45 + 0.95 + A.clap * 0.18 : -50;
      for (const s of [0, 1]) { o.position.set(p.x + (s ? 1 : -1) * (0.04 + clapOpen), hy, p.z - 0.2 - A.clap * 0.05); o.updateMatrix(); A.hands.setMatrixAt(i * 2 + s, o.matrix); }
    }
    A.bodies.instanceMatrix.needsUpdate = A.heads.instanceMatrix.needsUpdate = A.hands.instanceMatrix.needsUpdate = true;
    A._still = A.clap <= 0.001 && A.stand <= 0.001;
  }
  function disposeGroup(g) {
    const cached = new Set(geoCache.values());
    g.traverse(o => {
      if (o.geometry && !cached.has(o.geometry)) o.geometry.dispose();
      for (const m of [].concat(o.material || [])) if (m && m.map && m.map.dispose) m.map.dispose();
    });
  }

  /* ---------- 出演メンバー ---------- */
  // 曲が決まっていれば必要人数分（首席→能力順）、未定なら全団員が着席する。欠員は空席として表示。
  function computeLineup(song) {
    const req = song ? songRequirements(song) : null;
    const L = {}, empty = {};
    for (const ins of INSTRUMENTS) {
      const ms = STATE.members.filter(m => m.inst === ins.id).sort((a, b) => (isPrincipal(b) - isPrincipal(a)) || (memberAvg(b) - memberAvg(a)));
      const need = req ? (req[ins.id] || 0) : ms.length;
      L[ins.id] = ms.slice(0, need).map(m => ({ ...m, isPrincipal: isPrincipal(m) }));
      while (L[ins.id].length < need) L[ins.id].push(null);
      empty[ins.id] = Math.max(0, need - ms.length);
    }
    return L;
  }
  function buildOrchestra(song, cd) {
    while (orchGroup.children.length) orchGroup.remove(orchGroup.children[0]);
    actors = []; conductor = null;
    const L = computeLineup(song);
    const lay = layoutSeats(L, layoutInfo.stageY);
    seats = lay.seats;
    // 椅子・譜面台（インスタンス描画）
    const sitting = seats.filter(s => !['Perc', 'Cb'].includes(s.inst));
    const chairs = new T.InstancedMesh(instrumentGeo('chair'), VCOL(), Math.max(1, sitting.length));
    const stands = new T.InstancedMesh(instrumentGeo('stand'), VCOL(), Math.max(1, seats.length));
    const o = new T.Object3D();
    sitting.forEach((s, i) => { o.position.set(s.x, s.y, s.z); o.rotation.set(0, s.rot, 0); o.updateMatrix(); chairs.setMatrixAt(i, o.matrix); });
    seats.forEach((s, i) => { const f = s.inst === 'Perc' ? 0.95 : 0.85; o.position.set(s.x + Math.sin(s.rot) * f, s.y, s.z + Math.cos(s.rot) * f); o.rotation.set(0, s.rot + Math.PI, 0); o.updateMatrix(); stands.setMatrixAt(i, o.matrix); });
    if (!sitting.length) chairs.count = 0;
    orchGroup.add(chairs, stands);
    // 指揮台
    const pod = new T.Mesh(G.box(1.0, 0.22, 1.0), mat(0x2a1a10)); pod.position.set(lay.podium.x, layoutInfo.stageY + 0.11, lay.podium.z); orchGroup.add(pod);
    const rail = new T.Mesh(G.box(0.9, 0.05, 0.05), mat(GOLD)); rail.position.set(lay.podium.x, layoutInfo.stageY + 1.2, lay.podium.z + 0.5); orchGroup.add(rail);
    const cstand = new T.Mesh(instrumentGeo('stand'), VCOL()); cstand.position.set(lay.podium.x, lay.podium.y, lay.podium.z - 0.55); cstand.scale.set(1.4, 1.0, 1.2); orchGroup.add(cstand);
    seats.forEach((s, i) => {
      if (!s.member) return;
      const a = makeActor(s.member, s, hashStr(s.member.id) + i);
      orchGroup.add(a.group); actors.push(a);
      a.lag = Math.random() * 0.3;
    });
    if (cd) { conductor = makeConductorActor(cd, lay.podium); orchGroup.add(conductor.group); }
    setQuality(0.7);
    poseAll(0, 0, true);
  }

  /* ---------- 楽器ごとの姿勢（手の目標位置） ---------- */
  const _q1 = T ? new T.Quaternion() : null;
  function placeObj(obj, pos, dir, roll = 0) {
    obj.position.copy(pos);
    obj.quaternion.setFromUnitVectors(V(0, 0, 1), dir.clone().normalize());
    if (roll) { _q1.setFromAxisAngle(V(0, 0, 1), roll); obj.quaternion.multiply(_q1); }
  }
  const lerpV = (a, b, t) => V(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
  // a.w: 構え（0=下ろす, 1=演奏）  m: 音楽状態 { u:音符内の進み, onset:直近の発音からの拍, dyn, pitch, dur }
  function poseActor(a, m, time) {
    const w = a.w, lf = a.lift, sway = Math.sin(time * 1.3 + a.swayPh) * 0.02 * (0.4 + (m.dyn || 0.4)) * w;
    a.body.rotation.x = sway * 0.6 + (a.kind === 'vn' || a.kind === 'va' ? 0.03 * w : 0);
    a.body.rotation.z = sway * 0.4;
    let L, R, ip, idir, iroll = 0;
    const k = a.kind;
    if (k === 'vn' || k === 'va') {
      const chin = V(0.1, 1.12, 0.13), dirP = V(0.38, -0.08, 0.92).normalize();
      const restP = V(0.16, 0.62, 0.3), restD = V(0.05, 1, 0.12).normalize();
      ip = lerpV(restP, chin, w); idir = lerpV(restD, dirP, w).normalize(); iroll = 0.9 * w;
      L = ip.clone().addScaledVector(idir, 0.42 * (0.6 + 0.4 * w)).add(V(0, -0.03 + Math.sin(time * 7) * 0.008 * w * (m.active ? 1 : 0), 0));
      // 弓：音符ごとに上げ弓・下げ弓が入れ替わる
      const s = 0.12 + 0.36 * (a.bowDir > 0 ? m.u : 1 - m.u) * Math.min(1, 0.5 + (m.dur || 1) * 0.35) * a.amp;
      const contact = chin.clone().addScaledVector(dirP, 0.16).add(V(0, 0.03, 0));
      const bowD = V(0.92, 0.12, 0.32).normalize();
      const playHand = contact.clone().addScaledVector(bowD, -s);
      R = lerpV(V(-0.22, 0.66, 0.3), playHand, w);
      placeObj(a.tool, R, lerpV(V(0, 1, 0.15), bowD, w).normalize());
    } else if (k === 'vc' || k === 'cb') {
      const sc = k === 'cb' ? 1.45 : 1, base = k === 'cb' ? V(0, 0.05, 0.42) : V(0, 0.08, 0.42);
      const tilt = V(0.12, 1, -0.32).normalize();
      ip = base; idir = tilt;
      a.instr.position.copy(base); a.instr.quaternion.setFromUnitVectors(V(0, 1, 0), tilt);
      L = base.clone().addScaledVector(tilt, 1.0 * sc).add(V(0.04, -0.12 * sc + Math.sin(time * 6) * 0.01 * w, 0.03));
      const contact = base.clone().addScaledVector(tilt, 0.42 * sc).add(V(0, 0, 0.1));
      const bowD = V(0.97, -0.08, 0.2).normalize();
      const s = 0.1 + 0.38 * (a.bowDir > 0 ? m.u : 1 - m.u) * Math.min(1, 0.5 + (m.dur || 1) * 0.35) * a.amp;
      R = lerpV(V(-0.26, 0.6 + lf * 0.6, 0.28), contact.clone().addScaledVector(bowD, -s), w);
      placeObj(a.tool, R, lerpV(V(0.2, -1, 0.3), bowD, w).normalize());
      solveArm(a.L, L); solveArm(a.R, R);
      return;
    } else if (k === 'fl') {
      const mouth = V(0.04, 1.18, 0.29), d = V(-0.96, -0.12, 0.18).normalize();
      ip = lerpV(V(0.26, 0.62, 0.32), mouth, w); idir = lerpV(V(-1, 0, 0.05), d, w).normalize();
      const fing = m.onset < 0.2 ? 0.012 : 0;
      L = ip.clone().addScaledVector(idir, 0.13).add(V(0, -0.03 - fing, 0.01)); R = ip.clone().addScaledVector(idir, 0.4).add(V(0, -0.03 + fing, 0.01));
    } else if (k === 'ob' || k === 'cl') {
      const mouth = V(0, 1.16, 0.3), d = V(0, -0.78, 0.62).normalize();
      ip = lerpV(V(-0.14, 0.98, 0.32), mouth, w); idir = lerpV(V(0, -1, 0.12), d, w).normalize();
      const fing = m.onset < 0.2 ? 0.01 : 0;
      L = ip.clone().addScaledVector(idir, 0.16).add(V(0, 0, 0.03 + fing)); R = ip.clone().addScaledVector(idir, 0.34).add(V(0, 0, 0.03 - fing));
    } else if (k === 'fg') {
      ip = lerpV(V(-0.22, 0.32, 0.28), V(-0.18, 0.4, 0.3), w); idir = V(0, 0, 1);
      a.instr.position.copy(ip); a.instr.quaternion.setFromEuler(new T.Euler(0.12, 0, -0.32 + 0.1 * w));
      L = V(-0.02, 0.98, 0.34); R = V(-0.2, 0.68, 0.36);
      if (m.onset < 0.2) R.y += 0.01 * w;
      solveArm(a.L, lerpV(V(0.2, 0.62, 0.3), L, w)); solveArm(a.R, lerpV(V(-0.24, 0.6, 0.3), R, w));
      return;
    } else if (k === 'hr') {
      ip = lerpV(V(-0.16, 0.68, 0.32), V(-0.12, 0.92, 0.32), w);
      a.instr.position.copy(ip); a.instr.quaternion.setFromEuler(new T.Euler(-0.2 * w, 0.2, 0));
      L = ip.clone().add(V(0.1, 0.06, 0.08)); R = ip.clone().add(V(-0.14, -0.12, -0.12));
      if (m.onset < 0.2) L.y += 0.012;
      solveArm(a.L, lerpV(V(0.22, 0.62, 0.3), L, w)); solveArm(a.R, R);
      return;
    } else if (k === 'tp' || k === 'tb') {
      const mouth = V(0, 1.17, 0.3), d = V(0, -0.12 + 0.1 * (m.dyn || 0.5) * w, 1).normalize();
      ip = lerpV(k === 'tp' ? V(0.16, 0.62, 0.34) : V(0.2, 0.25, 0.42), mouth, w); idir = lerpV(V(0, 1, 0.15), d, w).normalize();
      L = ip.clone().addScaledVector(idir, 0.14).add(V(0.02, -0.05, 0));
      if (k === 'tp') { R = ip.clone().addScaledVector(idir, 0.12).add(V(-0.02, -0.02 - (m.onset < 0.2 ? 0.01 : 0), 0)); }
      else {
        const slide = 0.08 + ((m.pitch || 60) % 7) / 7 * 0.28 * w;   // 音の高さでスライド位置が変わる
        a.slide.position.set(0, 0, slide);
        R = ip.clone().addScaledVector(idir, 0.55 + slide).add(V(-0.02, -0.06, 0));
      }
    } else if (k === 'tu') {
      ip = lerpV(V(0, 0.68, 0.3), V(0, 0.78, 0.3), w);
      a.instr.position.copy(ip); a.instr.quaternion.setFromEuler(new T.Euler(-0.15 * w, 0.3, 0.1));
      L = ip.clone().add(V(0.18, 0.08, 0.06)); R = ip.clone().add(V(-0.05, 0.14, 0.16 + (m.onset < 0.2 ? 0.01 : 0)));
      solveArm(a.L, L); solveArm(a.R, lerpV(V(-0.24, 0.62, 0.3), R, w));
      return;
    } else if (k === 'pc') {
      const ik = a.ik;
      a.instr.position.set(0, 0, 0.48); a.instr.quaternion.identity();
      const head = ik === 'timp' ? 0.75 : ik === 'bassdrum' ? 0.85 : ik === 'cymbal' ? 1.05 : 0.86;
      // 発音の瞬間に打面へ、次の音に向けて振り上げる
      const gap = Math.max(0.25, Math.min(1.2, m.gap || 1));
      const ph = clamp((m.onset || 0) / gap, 0, 1);
      const lift = 0.04 + Math.sin(ph * Math.PI) * (m.roll ? 0.05 : 0.2) * a.amp;
      const alt = m.roll ? Math.sin(time * 40) * 0.04 : 0;
      const lx = ik === 'timp' ? 0.37 : 0.09, rx = ik === 'timp' ? -0.37 : -0.09;
      L = lerpV(V(0.25, 0.85, 0.12), V(lx, head + lift + alt, 0.48), w);
      R = lerpV(V(-0.25, 0.85, 0.12), V(rx, head + lift * (m.roll ? 1 : 0.6) - alt, 0.48), w);
      solveArm(a.L, L); solveArm(a.R, R);
      placeObj(a.tool, a.L.hand, V(-0.25, -0.35, 1).normalize()); placeObj(a.tool2, a.R.hand, V(0.25, -0.35, 1).normalize());
      return;
    }
    if (ip) placeObj(a.instr, ip, idir, iroll);
    solveArm(a.L, L); solveArm(a.R, R);
  }
  // 指揮：4拍子の図形（1拍目は下、2拍目は内、3拍目は外、4拍目は上）
  const BEAT_PTS = [[0, -0.3], [0.22, -0.18], [-0.3, -0.16], [0, 0.12]];
  function poseConductor(cd, beat, dyn, phase, time) {
    const lf = cd.lift;
    let R, L;
    const base = V(-0.08, 1.0 + lf + 0.42, 0.42);
    if (phase === 'beat') {
      const bi = Math.floor(beat) % 4, f = beat - Math.floor(beat);
      const a = BEAT_PTS[(bi + 3) % 4], b = BEAT_PTS[bi];
      const e = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;   // 打点に向かって加速
      const amp = 0.7 + dyn * 0.6;
      const x = a[0] + (b[0] - a[0]) * e, y = a[1] + (b[1] - a[1]) * e + Math.sin(f * Math.PI) * 0.08;
      R = base.clone().add(V(-x * amp * 0.9, y * amp + 0.22, 0));
      L = V(0.2 + Math.sin(time * 0.7) * 0.05, 1.2 + lf + dyn * 0.25, 0.36);
      cd.body.rotation.x = 0.06 + Math.sin(beat * Math.PI) * 0.015 * dyn;
    } else if (phase === 'ready') {
      R = base.clone().add(V(-0.05, 0.36, 0.02)); L = V(0.2, 1.32 + lf, 0.38); cd.body.rotation.x = 0.04;
    } else if (phase === 'bow') {
      R = V(-0.2, 0.62 + lf, 0.1); L = V(0.2, 0.62 + lf, 0.1); cd.body.rotation.x = 0.55 * cd.bow;
    } else {
      R = V(-0.22, 0.62 + lf, 0.12); L = V(0.22, 0.62 + lf, 0.12); cd.body.rotation.x = 0;
    }
    solveArm(cd.L, L); solveArm(cd.R, R);
    placeObj(cd.baton, cd.R.hand, tmpV.subVectors(cd.R.hand, cd.R.elbow).normalize().add(V(0, 0.2, 0.3)).normalize());
  }

  /* ---------- 音楽の状態 → 動き ---------- */
  let score = null, quality = {}, scoreStart = 0, curBeat = -10;
  function setQuality(q) {
    quality = typeof q === 'number' ? { hs: q, ls: q, ww: q, br: q, pc: q } : q;
    for (const a of actors) {
      const qq = quality[a.sec] ?? 0.7;
      a.jit = (a.rng() - 0.5) * 2 * (1 - qq) * 0.16;   // タイミングのずれ（拍）
      a.amp = 1 + (a.rng() - 0.5) * (1 - qq) * 0.6;    // 動きの大きさのばらつき
      a.swayPh = qq > 0.8 ? 0 : a.rng() * 6.28 * (1 - qq);   // 上手いほど揺れが揃う
    }
  }
  function musicState(a, beat, sc) {
    const b = beat + a.jit;
    const active = sc ? Music.isActive(sc, a.sec, b + 0.9) && b < sc.beats + 0.4 : false;   // 1拍前には構える
    const st = { active, dyn: sc ? Music.dynAt(sc, b) : 0.4, u: 0, onset: 9, dur: 1, gap: 1, pitch: 60, roll: false };
    if (!sc) return st;
    const na = Music.noteAt(sc, a.sec, b);
    if (na && b < na.n.t + na.n.d + 0.3) {
      st.u = clamp((b - na.n.t) / Math.max(0.2, na.n.d), 0, 1); st.onset = b - na.n.t; st.dur = na.n.d; st.pitch = na.n.p[0];
      st.gap = na.next ? na.next.t - na.n.t : 1; st.roll = na.n.kind === 'roll';
      if (na.i !== a.lastNote) { a.lastNote = na.i; a.bowDir *= -1; }
      if (st.roll) st.onset = (b * 6) % 1 * 0.4;
    }
    return st;
  }
  function poseAll(beat, dt, instant, phaseOverride) {
    for (const a of actors) {
      let target = 0, m;
      if (mode === 'show' && show && show.stage === 'tuning') { target = a.sec === 'pc' ? 0 : 1; m = { active: true, u: (Math.sin(show.t * 2 + a.swayPh * 3) * 0.5 + 0.5), dyn: 0.3, onset: 9, dur: 2 }; }
      else if (score && (mode === 'show' || mode === 'practice')) {
        m = musicState(a, beat, score);
        target = m.active && (!practice || practice.who(a)) ? 1 : 0;
        if (practice && !practice.who(a)) m = { active: false, u: 0, dyn: 0.3, onset: 9 };
      } else m = { active: false, u: 0, dyn: 0.3, onset: 9 };
      if (phaseOverride === 'stand') target = 0;
      const rate = instant ? 1 : Math.min(1, dt * (target > a.w ? 5 : 3));
      a.w += (target - a.w) * rate;
      poseActor(a, m, nowT);
    }
  }

  /* ---------- カメラ ---------- */
  function presets() {
    const L = layoutInfo || { stageY: 1, D: 20, H: 10 };
    const aspect = camera.aspect || 0.6;
    const k = clamp(0.95 / aspect, 1, 2.2);   // 縦長画面ほど引いて全体を収める
    const sec = id => {
      const ss = actors.filter(a => a.sec === id);
      if (!ss.length) return null;
      const c = ss.reduce((acc, a) => acc.add(a.group.position), V(0, 0, 0)).multiplyScalar(1 / ss.length);
      const toward = V(-c.x * 0.6, 0, 3 - c.z).normalize();
      const back = id === 'br' || id === 'pc' || id === 'ww';
      if (back) return { pos: c.clone().add(V(0, 4.4, 2.4 * Math.min(1.4, k))), tgt: c.clone().add(V(0, 0.5, -0.6)) };   // 後方のセクションは上から覗き込む
      return { pos: c.clone().addScaledVector(toward, 3.2 * Math.min(1.5, k)).add(V(0, 3.0, 0)), tgt: c.clone().add(V(0, 0.9, 0)) };
    };
    const y = L.stageY;
    return {
      overview: { pos: V(0, y + 5.6 + 1.8 * k, 5.5 + 5.0 * k), tgt: V(0, y + 0.2, -4.8) },
      front: { pos: V(0, y + 2.6, 3.5 + 4.2 * k), tgt: V(0, y + 1.5, -4.6) },
      conductor: { pos: V(0, y + 2.6, -1.4), tgt: V(0, y + 0.3, -6.5) },   // 指揮者の目の位置（本人は非表示）
      // ホールの下見（予約前の3Dプレビュー）用：客席後方・側方の上・舞台から客席を見る
      hallRear: { pos: V(0, (L.rakeAt ? L.rakeAt(L.D - 1.5) : 0) + 2.4, L.D - 1.5), tgt: V(0, y + 1.2, -5) },
      hallSide: { pos: V((L.W || 20) / 2 - 2.2, Math.min((L.H || 10) - 1.2, y + 4.5), (L.D || 16) * 0.45), tgt: V(0, y + 0.6, -4) },
      fromStage: { pos: V(0, y + 2.0, -2.6), tgt: V(0, (L.H || 10) * 0.3, L.D || 16) },
      hs: sec('hs'), ls: sec('ls'), ww: sec('ww'), br: sec('br'), pc: sec('pc'),
    };
  }
  function setCamera(name, instant, dur) {
    if (!ok) return;
    const p = presets()[name] || presets().front;
    if (layoutInfo) {
      if (p.pos.z > 2) p.pos.y = Math.max(p.pos.y, layoutInfo.rakeAt(p.pos.z) + 1.7);   // 段状の客席に埋もれない
      p.pos.y = Math.min(p.pos.y, layoutInfo.H - 0.7);   // 天井より上に出ない（天井の低いホール）
      if (layoutInfo.maxZ) p.pos.z = Math.min(p.pos.z, layoutInfo.maxZ);   // 練習室：部屋の壁より外に出ない
    }
    cam.dur = dur || 0.8;
    cam.name = presets()[name] ? name : 'front';
    if (instant || !cam.pos) { cam.pos = p.pos.clone(); cam.tgt = p.tgt.clone(); cam.from = null; }
    else { cam.from = cam.pos.clone(); cam.fromT = cam.tgt.clone(); cam.to = p.pos; cam.toT = p.tgt; cam.t0 = performance.now() / 1000; }
  }
  function updateCamera(t) {
    if (cam.from) {
      const u = clamp((t - cam.t0) / cam.dur, 0, 1), e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
      cam.pos.lerpVectors(cam.from, cam.to, e); cam.tgt.lerpVectors(cam.fromT, cam.toT, e);
      if (u >= 1) cam.from = null;
    }
    camera.position.copy(cam.pos); camera.lookAt(cam.tgt);
    if (conductor) conductor.body.visible = conductor.L.upper.visible = conductor.L.fore.visible = conductor.R.upper.visible = conductor.R.fore.visible = conductor.baton.visible = cam.name !== 'conductor' || !!cam.from;
  }

  /* ---------- 演奏会の演出（イベントの流れ） ---------- */
  // stages: 開演前→入場・着席→チューニング→指揮者登場→一礼→構え→演奏→終演→拍手→結果
  function playShow(opts) {
    if (!ok) { opts.onEnd && opts.onEnd(); return; }
    stopPractice();
    const sc = opts.score;
    score = sc; setQuality(opts.quality || 0.7);
    Music.setReverb(opts.acoustics || 60);
    const t0 = Music.now() + 0.15;
    const S = [
      ['before', 1.6, '開演前'], ['enter', 3.6, '団員入場・着席'], ['tuning', 3.4, 'チューニング'],
      ['maestro', 2.8, '指揮者の登場'], ['bowAud', 1.6, '指揮者が一礼し、指揮台へ'], ['ready', 1.2, '演奏開始'],
      ['play', sc.duration + 0.4, '演奏中'], ['end', 1.6, '演奏終了'], ['applause', 5.5, opts.applauseLabel || '観客の拍手'],
    ];
    let acc = 0; const marks = S.map(([id, d, label]) => { const m = { id, start: acc, end: acc + d, label }; acc += d; return m; });
    show = { t0, marks, total: acc, sc, stage: 'before', t: 0, onEnd: opts.onEnd, opts, scheduled: {} };
    mode = 'show';
    if (audience) { audience.fill = opts.fill ?? 0.6; audience.clap = 0; audience.stand = 0; updateAudience(0, true); }
    // 団員は袖から入場（その間は楽器を持たない）
    for (const a of actors) {
      a.walk = { from: V(-layoutInfo.stageW / 2 - 1.5, a.seat.y, a.seat.z + 0.6), delay: a.rng() * 2.2 + (a.sec === 'pc' ? 0.6 : 0) };
      a.group.position.copy(a.walk.from); a.instr.visible = ['vc', 'cb', 'pc'].includes(a.kind); if (a.tool) a.tool.visible = false; if (a.tool2) a.tool2.visible = false;
      a.w = 0;
    }
    if (conductor) { conductor.group.position.set(-layoutInfo.stageW / 2 - 1.5, conductor.home.y - 0.2, conductor.home.z + 1.2); conductor.group.rotation.y = Math.PI / 2; }
    captionCb = opts.onCaption;
    start();
  }
  function skipShow() {
    if (!show) return;
    Music.stopAll();
    const cb = show.onEnd; endShowState(); cb && cb();
  }
  function endShowState() {
    show = null; mode = 'idle'; score = null;
    for (const a of actors) { a.walk = null; a.group.position.set(a.seat.x, a.seat.y, a.seat.z); a.group.rotation.y = a.seat.rot; a.instr.visible = true; if (a.tool) a.tool.visible = true; if (a.tool2) a.tool2.visible = true; a.w = 0; a.body.position.y = 0; }
    if (conductor) { conductor.group.position.copy(conductor.home); conductor.group.rotation.y = Math.PI; conductor.bow = 0; }
    if (audience) { audience.clap = 0; audience.stand = 0; updateAudience(0, true); }
    hemi.intensity = 1.15 * ((layoutInfo && layoutInfo.V3.lightI) || 1);
  }
  function updateShow(t) {
    const s = show, tt = t - s.t0; s.t = tt;
    const cur = s.marks.find(m => tt >= m.start && tt < m.end) || s.marks[s.marks.length - 1];
    if (cur.id !== s.stage || !s.captioned) {
      s.stage = cur.id; s.captioned = true;
      captionCb && captionCb(cur.label, cur.id);
      const at = s.t0 + cur.start;
      if (cur.id === 'tuning' && !s.scheduled.tuning) { s.scheduled.tuning = 1; Music.tuning(at + 0.2, 3.0); }
      if (cur.id === 'maestro' && !s.scheduled.m) { s.scheduled.m = 1; Music.applause(at + 0.4, 2.2, 0.35); }
      if (cur.id === 'play' && !s.scheduled.play) { s.scheduled.play = 1; scoreStart = at + 0.2; Music.playScore(s.sc, scoreStart, quality); }
      if (cur.id === 'applause' && !s.scheduled.ap) { s.scheduled.ap = 1; Music.applause(at + 0.1, 5.2, s.opts.applause ?? 0.6); }
    }
    const local = tt - cur.start, dur = cur.end - cur.start, u = clamp(local / dur, 0, 1);
    const lightI = (layoutInfo && layoutInfo.V3.lightI) || 1;
    // 客席照明：演奏中は落とす
    const dimTarget = ['bowAud', 'ready', 'play', 'end'].includes(cur.id) ? 0.45 : 1.15;
    hemi.intensity += (dimTarget * lightI - hemi.intensity) * 0.05;
    // 入場
    for (const a of actors) {
      if (!a.walk) continue;
      const e = clamp((tt - s.marks[1].start - a.walk.delay) / 1.3, 0, 1);
      if (tt < s.marks[1].start) { a.group.position.copy(a.walk.from); a.group.visible = false; continue; }
      a.group.visible = true;
      if (e < 1) {
        a.group.position.lerpVectors(a.walk.from, V(a.seat.x, a.seat.y, a.seat.z), e);
        a.group.position.y += Math.abs(Math.sin(e * 18)) * 0.05;
        a.group.rotation.y = e < 0.9 ? Math.atan2(a.seat.x - a.walk.from.x, 0.0001) : a.seat.rot;
      } else {
        a.group.position.set(a.seat.x, a.seat.y, a.seat.z); a.group.rotation.y = a.seat.rot;
        a.instr.visible = true; if (a.tool) a.tool.visible = true; if (a.tool2) a.tool2.visible = true;
        a.walk = null;
      }
    }
    // 指揮者
    const cd = conductor;
    let cphase = 'idle', beat = 0, dyn = 0.5;
    if (cd) {
      const m3 = s.marks[3], m4 = s.marks[4];
      if (tt < m3.start) cd.group.visible = false;
      else if (tt < m3.end) {
        cd.group.visible = true;
        const e = clamp((tt - m3.start) / (dur * 0.85), 0, 1);
        const from = V(-layoutInfo.stageW / 2 - 1.5, cd.home.y - 0.2, cd.home.z + 1.2), to = V(cd.home.x + 0.7, layoutInfo.stageY, cd.home.z + 0.9);
        cd.group.position.lerpVectors(from, to, Math.min(1, e)); cd.group.position.y += Math.abs(Math.sin(e * 16)) * 0.05 * (e < 1 ? 1 : 0);
        cd.group.rotation.y = e < 1 ? Math.PI / 2 : 0;
      } else if (tt < m4.end) {
        const e = clamp((tt - m4.start) / (m4.end - m4.start), 0, 1);
        cd.group.position.set(cd.home.x + 0.7 * (1 - Math.max(0, e - 0.6) / 0.4), e < 0.6 ? layoutInfo.stageY : cd.home.y, cd.home.z + 0.9 * (1 - Math.max(0, e - 0.6) / 0.4));
        cd.group.rotation.y = e < 0.6 ? 0 : Math.PI * Math.min(1, (e - 0.6) / 0.3);
        cd.bow = e < 0.55 ? Math.sin(e / 0.55 * Math.PI) : 0; cphase = e < 0.55 ? 'bow' : 'idle';
      } else { cd.group.position.copy(cd.home); }
      if (cur.id === 'ready') { cd.group.rotation.y = Math.PI; cphase = 'ready'; }
      if (cur.id === 'play') { cd.group.rotation.y = Math.PI; beat = (t - scoreStart) / s.sc.spb; cphase = beat < 0 ? 'ready' : beat < s.sc.beats ? 'beat' : 'ready'; dyn = Music.dynAt(s.sc, beat); }
      if (cur.id === 'end') { cd.group.rotation.y = Math.PI; cphase = u < 0.5 ? 'ready' : 'idle'; }
      if (cur.id === 'applause') {
        cd.group.rotation.y = Math.PI * (1 - Math.min(1, u * 3)); cd.group.position.copy(cd.home);
        cd.bow = u > 0.3 && u < 0.7 ? Math.sin((u - 0.3) / 0.4 * Math.PI) : 0; cphase = 'bow';
      }
      poseConductor(cd, beat, dyn, cphase, t);
    }
    // 団員の演奏
    const b = cur.id === 'play' || cur.id === 'end' ? (t - scoreStart) / s.sc.spb : -10;
    curBeat = b;
    poseAll(b, frameDt, false, cur.id === 'applause' ? 'stand' : null);
    if (cur.id === 'applause') for (const a of actors) a.body.position.y = u > 0.15 && u < 0.8 && !a.standing ? 0.12 * Math.sin(Math.min(1, (u - 0.15) * 5) * Math.PI / 2) : 0;
    // 観客
    if (audience) {
      const clap = cur.id === 'applause' ? (u < 0.85 ? 1 : (1 - u) / 0.15) : cur.id === 'maestro' ? (u > 0.1 && u < 0.85 ? 0.5 : 0) : 0;
      audience.clap += (clap - audience.clap) * 0.15;
      const st = cur.id === 'applause' && (s.opts.standing || false) && u > 0.2 && u < 0.9 ? 1 : 0;
      audience.stand += (st - audience.stand) * 0.06;
      updateAudience(t);
    }
    if (tt >= s.total) { const cb = s.onEnd; endShowState(); cb && cb(); }
  }

  /* ---------- 練習のアニメーション（音なし・数秒） ----------
   * opts.loop=true：練習時間中くり返し演奏する（練習の進行は画面側が管理し、endPractice() で終える）
   *   setPracticeFocus(['hs','ls']) で中心に演奏させるセクションを切り替え、pausePractice(true) で手を止めて話を聞く姿勢にする */
  function playPractice(plan, q, opts = {}) {
    if (!ok || mode === 'show' || !scoreSong) return;
    const sc = Music.createScore(scoreSong, { seed: Math.floor(Math.random() * 1e9), bars: 4, sections: SECTIONS.map(s => s.id) });
    score = sc; setQuality(q);
    const targets = new Set(plan.members || []);
    const secOffset = { hs: 0, ls: 1, ww: 2, br: 3, pc: 1.5 };
    // くり返し再生では、各セクションが「楽譜上で演奏している拍」だけをつないで動かす（休符ばかりで動かないのを防ぐ）
    // 個人練習の対象が今回の曲の編成に入っていない（舞台にいない）ときは、その団員のセクションを演奏させる
    const anyOn = actors.some(a => a.member && targets.has(a.member.id)), fb = new Set(opts.fallbackSecs || []);
    const act = {};
    if (opts.loop) for (const s of SECTIONS) { act[s.id] = []; for (let x = 0; x < sc.beats; x += 0.25) if (Music.isActive(sc, s.id, x)) act[s.id].push(x); }
    practice = {
      t0: Music.now(), plan, loop: !!opts.loop, focus: null, paused: false, pausedAt: 0, pausedTotal: 0, act,
      who: a => (plan.menu === 'tutti' ? true : plan.menu === 'individual' ? (anyOn ? targets.has(a.member.id) : fb.has(a.sec)) : true) && (!practice.focus || practice.focus.has(a.sec)),
      off: a => plan.menu === 'section' && !practice.loop ? secOffset[a.sec] * 2 : 0,
    };
    mode = 'practice';
    start();
  }
  function stopPractice() { practice = null; if (mode === 'practice') { mode = 'idle'; score = null; } }
  function endPractice() { if (practice) { stopPractice(); poseAll(0, 1, true); } }
  function setPracticeFocus(secs) { if (practice) practice.focus = secs && secs.length ? new Set(secs) : null; }
  function pausePractice(on) {
    const p = practice; if (!p || p.paused === !!on) return;
    const t = Music.now();
    if (on) p.pausedAt = t; else p.pausedTotal += t - p.pausedAt;
    p.paused = !!on;
  }
  function updateLoopPractice(t) {
    const p = practice, b = Math.max(0, (p.paused ? p.pausedAt : t) - p.t0 - p.pausedTotal) / score.spb, bb = b % score.beats;
    curBeat = bb;
    // 指揮者：演奏中は拍を振り、手を止めているあいだは団員に向かって話している姿勢
    if (conductor) poseConductor(conductor, bb, 0.6, p.paused ? 'idle' : 'beat', t);
    for (const a of actors) {
      const play = !p.paused && p.who(a);
      const L = p.act[a.sec] || [];
      const sb = L.length ? L[Math.floor(b * 4) % L.length] + (b * 4 % 1) / 4 : bb;
      const m = play ? musicState(a, sb, score) : { active: false, u: 0, dyn: 0.3, onset: 9 };
      const target = play && m.active ? 1 : 0;
      a.w += (target - a.w) * Math.min(1, frameDt * 4);
      poseActor(a, m, t);
    }
  }
  function updatePractice(t) {
    if (practice.loop) return updateLoopPractice(t);
    const p = practice, b = (t - p.t0) / score.spb;
    if (conductor) poseConductor(conductor, b, 0.6, p.plan.menu === 'tutti' && b < score.beats ? 'beat' : 'idle', t);
    if (b > score.beats + 2) { stopPractice(); poseAll(0, 1, true); return; }
    for (const a of actors) {
      const bb = b - (p.off(a) || 0);
      const m = p.who(a) && bb > 0 ? musicState(a, bb % score.beats, score) : { active: false, u: 0, dyn: 0.3, onset: 9 };
      const target = m.active && bb > 0 && bb < score.beats ? 1 : 0;
      a.w += (target - a.w) * Math.min(1, frameDt * 4);
      poseActor(a, m, t);
    }
  }

  /* ---------- ループ ---------- */
  let frameDt = 0.016, nowT = 0, idleTick = 0;
  function frame(ms) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const t = Music.now();
    frameDt = Math.min(0.1, lastT ? t - lastT : 0.016); lastT = t; nowT = t;
    // 待機中は30fpsに間引く
    if (mode === 'idle' && !cam.from) { idleTick ^= 1; if (idleTick) return; }
    const t0 = performance.now();
    if (mode === 'show' && show) updateShow(t);
    else if (mode === 'practice' && practice) updatePractice(t);
    else {
      for (const a of actors) { a.w += (0 - a.w) * Math.min(1, frameDt * 3); poseActor(a, { active: false, u: 0, dyn: 0.3, onset: 9 }, t); }
      if (conductor) poseConductor(conductor, 0, 0.4, 'idle', t);
    }
    updateCamera(performance.now() / 1000);
    renderer.render(scene, camera);
    // 端末が重い場合は解像度を下げる
    const cost = performance.now() - t0;
    if (cost > 24) slowFrames++; else slowFrames = Math.max(0, slowFrames - 1);
    if (slowFrames > 40 && pixelRatio > 0.75) { pixelRatio = Math.max(0.75, pixelRatio - 0.25); renderer.setPixelRatio(pixelRatio); resize(); slowFrames = 0; }
  }
  function start() { if (!ok || running) return; running = true; lastT = 0; raf = requestAnimationFrame(frame); }
  function stop() { running = false; cancelAnimationFrame(raf); }

  /* ---------- 公開API ---------- */
  let scoreSong = null;
  function sync({ hallId, song, conductor: cd }) {
    if (!ok) return;
    const hk = hallId || 'general';
    if (hk !== hallKey) { buildHall(hk); hallKey = hk; lineupKey = ''; }
    scoreSong = song || findSong('finlandia');
    const key = [song ? song.id : '-', cd ? cd.id + JSON.stringify(cd.look) : '-', ...STATE.members.map(m => m.id + m.inst + (isPrincipal(m) ? '*' : ''))].join('|');
    if (key !== lineupKey && mode !== 'show') { lineupKey = key; buildOrchestra(song, cd); setCamera(cam.name || 'front', true); }
  }
  function setVisible(v) { if (!ok) return; if (v) { resize(); start(); } else { stop(); if (show) skipShow(); stopPractice(); } }
  function setAudienceFill(f) { if (audience) { audience.fill = clamp(f, 0, 1); updateAudience(0, true); } }
  return {
    init, sync, setVisible, setCamera, playShow, skipShow, playPractice, endPractice, setPracticeFocus, pausePractice, setAudienceFill, resize,
    isPracticing: () => mode === 'practice' && !!practice,
    venue: () => hallKey,
    get ok() { return ok; }, get reason() { return reason; }, isShowing: () => !!show, camName: () => cam.name,
    sections: () => SECTIONS.map(s => { const as = actors.filter(a => a.sec === s.id); return { sec: s.id, n: as.length, w: as.length ? +(as.reduce((x, a) => x + a.w, 0) / as.length).toFixed(2) : 0, active: score ? Music.isActive(score, s.id, curBeat + 0.9) : false, beat: +curBeat.toFixed(2) }; }),
    conductorPose: () => conductor ? { y: +conductor.R.hand.y.toFixed(3), x: +conductor.R.hand.x.toFixed(3), visible: conductor.group.visible, rotY: +conductor.group.rotation.y.toFixed(2) } : null,
    debug: () => ({ aud: audience ? [audience.n, +audience.fill.toFixed(2)] : null, actors: actors.length, conductor: !!conductor, hall: hallKey, mode, calls: renderer ? renderer.info.render.calls : 0, tris: renderer ? renderer.info.render.triangles : 0, pixelRatio, seats: seats.length, empty: seats.filter(s => !s.member).length, principals: actors.filter(a => a.principal).length, stage: show ? show.stage : null, actorsW: actors.slice(0, 5).map(a => +a.w.toFixed(2)) }),
  };
})();
