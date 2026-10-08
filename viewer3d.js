/* Vista 3D del palco: renderer WebGL2 minimale, senza librerie.
   Usa i modelli CAD reali (models3d.js: pedana, gamba, morsetti, ringhiere, gradini) montati secondo la configurazione.
   Unità: millimetri. Assi: x destra, y su, z verso il fronte (davanti al pubblico). Origine: angolo posteriore sinistro del palco. */
(function(){
'use strict';
const MD = window.MODELS3D;
if(!MD){ window.StageView = null; return; }

/* ---------- decodifica dei modelli ---------- */
const raw = Uint8Array.from(atob(MD.data), c => c.charCodeAt(0)).buffer;
const PARTS = {};
for(const [name,p] of Object.entries(MD.parts)){
  PARTS[name] = p.mats.map(m => {
    const q = new Uint16Array(raw, m.po, m.nv*3), ix = new Uint16Array(raw, m.io, m.nt*3);
    const pos = new Float32Array(m.nv*3);
    for(let i=0;i<m.nv;i++) for(let k=0;k<3;k++) pos[i*3+k] = p.min[k] + q[i*3+k]*p.sc[k];
    return {rgb:m.rgb, pos, idx:ix, key:m.rgb.join(',')};
  });
}

/* ---------- algebra: trasformazioni {r:[9 per riga], t:[3]} ---------- */
const I3 = [1,0,0, 0,1,0, 0,0,1];
const mulR = (a,b) => { const o = []; for(let i=0;i<3;i++) for(let j=0;j<3;j++) o.push(a[i*3]*b[j]+a[i*3+1]*b[3+j]+a[i*3+2]*b[6+j]); return o; };
const mulV = (r,v) => [r[0]*v[0]+r[1]*v[1]+r[2]*v[2], r[3]*v[0]+r[4]*v[1]+r[5]*v[2], r[6]*v[0]+r[7]*v[1]+r[8]*v[2]];
const comp = (A,B) => { const t = mulV(A.r,B.t); return {r:mulR(A.r,B.r), t:[t[0]+A.t[0], t[1]+A.t[1], t[2]+A.t[2]]}; };
const toMat4 = T => { const r = T.r, t = T.t; return [r[0],r[3],r[6],0, r[1],r[4],r[7],0, r[2],r[5],r[8],0, t[0],t[1],t[2],1]; };
const RY = a => { const c = Math.round(Math.cos(a)), s = Math.round(Math.sin(a)); return [c,0,s, 0,1,0, -s,0,c]; };
const ZUP = [1,0,0, 0,0,1, 0,-1,0];   // modelli CAD con z verso l'alto -> y verso l'alto

/* ---------- WebGL ---------- */
const VS = `#version 300 es
layout(location=0) in vec3 a_pos;
layout(location=1) in vec4 i0; layout(location=2) in vec4 i1; layout(location=3) in vec4 i2; layout(location=4) in vec4 i3;
uniform mat4 u_vp; out vec3 v_pos;
void main(){ mat4 m = mat4(i0,i1,i2,i3); vec4 w = m*vec4(a_pos,1.0); v_pos = w.xyz; gl_Position = u_vp*w; }`;
const FS = `#version 300 es
precision highp float; in vec3 v_pos; out vec4 o;
uniform vec3 u_color; uniform float u_spec; uniform vec3 u_eye;
void main(){
  vec3 n = normalize(cross(dFdx(v_pos), dFdy(v_pos)));
  vec3 V = normalize(u_eye - v_pos); if(dot(n,V) < 0.0) n = -n;
  vec3 L1 = normalize(vec3(-0.45, 0.85, 0.55)), L2 = normalize(vec3(0.6, 0.35, -0.5));
  float d = max(dot(n,L1),0.0)*0.62 + max(dot(n,L2),0.0)*0.22;
  float amb = 0.34 + 0.16*n.y;
  vec3 H = normalize(L1+V); float sp = pow(max(dot(n,H),0.0), 48.0)*u_spec;
  vec3 c = u_color*(amb+d) + vec3(sp);
  o = vec4(pow(c, vec3(1.0/1.1)), 1.0);
}`;
const GVS = `#version 300 es
layout(location=0) in vec3 a_pos; uniform mat4 u_vp; out vec3 v_pos;
void main(){ v_pos = a_pos; gl_Position = u_vp*vec4(a_pos,1.0); }`;
const GFS = `#version 300 es
precision highp float; in vec3 v_pos; out vec4 o;
uniform vec4 u_rect; uniform vec3 u_ground; uniform vec3 u_center;
void main(){
  vec2 p = v_pos.xz;
  vec2 dd = max(max(u_rect.xy - p, p - u_rect.zw), vec2(0.0));
  float dist = length(dd);
  float sh = 1.0 - 0.55*exp(-dist/420.0);          // ombra morbida attorno al palco
  float fade = smoothstep(0.0, 1.0, 1.0 - length(p-u_center.xz)/ (u_center.y));  // sfuma verso l'orizzonte
  vec3 c = u_ground*sh;
  o = vec4(c, fade);
}`;
function sh(gl,type,src){ const s = gl.createShader(type); gl.shaderSource(s,src); gl.compileShader(s); if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
function prog(gl,v,f){ const p = gl.createProgram(); gl.attachShader(p,sh(gl,gl.VERTEX_SHADER,v)); gl.attachShader(p,sh(gl,gl.FRAGMENT_SHADER,f)); gl.linkProgram(p); if(!gl.getProgramParameter(p,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return p; }

/* ---------- matrici di vista ---------- */
function persp(fov,asp,n,f){ const t = 1/Math.tan(fov/2); return [t/asp,0,0,0, 0,t,0,0, 0,0,(f+n)/(n-f),-1, 0,0,2*f*n/(n-f),0]; }
function lookAt(e,c,u){
  let z = [e[0]-c[0],e[1]-c[1],e[2]-c[2]]; const zl = Math.hypot(...z); z = z.map(v => v/zl);
  let x = [u[1]*z[2]-u[2]*z[1], u[2]*z[0]-u[0]*z[2], u[0]*z[1]-u[1]*z[0]]; const xl = Math.hypot(...x); x = x.map(v => v/xl);
  const y = [z[1]*x[2]-z[2]*x[1], z[2]*x[0]-z[0]*x[2], z[0]*x[1]-z[1]*x[0]];
  return [x[0],y[0],z[0],0, x[1],y[1],z[1],0, x[2],y[2],z[2],0, -(x[0]*e[0]+x[1]*e[1]+x[2]*e[2]), -(y[0]*e[0]+y[1]*e[1]+y[2]*e[2]), -(z[0]*e[0]+z[1]*e[1]+z[2]*e[2]), 1];
}
function mul4(a,b){ const o = new Array(16); for(let c=0;c<4;c++) for(let r=0;r<4;r++){ let s = 0; for(let k=0;k<4;k++) s += a[k*4+r]*b[c*4+k]; o[c*4+r] = s; } return o; }

/* ---------- colori ---------- */
const COL = {
  '254,254,255':{c:[0.80,0.82,0.86], s:0.5},   // alluminio
  '190,188,186':{c:[0.56,0.56,0.57], s:0.35},  // acciaio
  '64,64,64':{c:[0.10,0.10,0.11], s:0.15}      // nero
};
const DECK_TOP = {   // piano di calpestio per famiglia
  hexa:[0.09,0.09,0.10], spidera:[0.09,0.09,0.10], spiderb:[0.09,0.09,0.10],
  wood:[0.66,0.48,0.30], plexb:[0.03,0.03,0.04], plexm:[0.93,0.93,0.94], plext:[0.60,0.78,0.88]
};
const FRAME_DARK = {spiderb:true};

/* ---------- la vista ---------- */
function create(canvas){
  const gl = canvas.getContext('webgl2', {antialias:true, alpha:true, preserveDrawingBuffer:true});
  if(!gl) return null;
  const P = prog(gl,VS,FS), G = prog(gl,GVS,GFS);
  const U = {vp:gl.getUniformLocation(P,'u_vp'), color:gl.getUniformLocation(P,'u_color'), spec:gl.getUniformLocation(P,'u_spec'), eye:gl.getUniformLocation(P,'u_eye')};
  const GU = {vp:gl.getUniformLocation(G,'u_vp'), rect:gl.getUniformLocation(G,'u_rect'), ground:gl.getUniformLocation(G,'u_ground'), center:gl.getUniformLocation(G,'u_center')};
  let batches = [];      // {meshes:[{vao,n,type,color,spec}], inst, count}
  let groundMesh = null, rect = [0,0,1,1], bg = [1,1,1], groundCol = [0.82,0.84,0.86];
  const cam = {az:0.62, el:0.46, dist:9000, target:[0,300,0], fit:9000};
  let dirty = true, W = 1, Hh = 1, stageR = 4000;

  function makeVAO(pos, idx, instBuf){
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const pb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,pb); gl.bufferData(gl.ARRAY_BUFFER,pos,gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,3,gl.FLOAT,false,0,0);
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,idx,gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER,instBuf);
    for(let k=0;k<4;k++){ gl.enableVertexAttribArray(1+k); gl.vertexAttribPointer(1+k,4,gl.FLOAT,false,64,k*16); gl.vertexAttribDivisor(1+k,1); }
    gl.bindVertexArray(null);
    return {vao, pb, ib};
  }
  function clearBatches(){
    for(const b of batches){ gl.deleteBuffer(b.inst); for(const m of b.meshes){ gl.deleteVertexArray(m.vao); gl.deleteBuffer(m.pb); gl.deleteBuffer(m.ib); } }
    batches = [];
  }
  // un lotto = una geometria (con i suoi materiali) disegnata per tutte le sue istanze
  function addBatch(mats, transforms){
    if(!transforms.length) return;
    const data = new Float32Array(transforms.length*16);
    transforms.forEach((T,i) => data.set(toMat4(T), i*16));
    const inst = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,inst); gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);
    const meshes = mats.map(m => {
      const idx = m.idx32 || m.idx, v = makeVAO(m.pos, idx, inst);
      return {vao:v.vao, pb:v.pb, ib:v.ib, n:idx.length, type: m.idx32 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, color:m.color, spec:m.spec};
    });
    batches.push({meshes, inst, count:transforms.length});
  }
  const colorOf = (m, over) => {
    const base = COL[m.key] || {c:[0.5,0.5,0.5], s:0.2};
    return {color: over || base.c, spec: base.s};
  };
  function stretched(partName, fn, over){          // copia della parte con vertici spostati da fn(x,y,z)->[x,y,z]
    return PARTS[partName].map(m => {
      const pos = new Float32Array(m.pos.length);
      for(let i=0;i<m.pos.length;i+=3){ const o = fn(m.pos[i],m.pos[i+1],m.pos[i+2]); pos[i]=o[0]; pos[i+1]=o[1]; pos[i+2]=o[2]; }
      const c = colorOf(m, over && over(m));
      return {pos, idx:m.idx, color:c.color, spec:c.spec};
    });
  }
  const plain = (partName, over) => PARTS[partName].map(m => { const c = colorOf(m, over && over(m)); return {pos:m.pos, idx:m.idx, color:c.color, spec:c.spec}; });
  // mesh generico (pelle, rampa, ...): posizioni float + indici
  function rawMat(pos, idx, color, spec){ const big = pos.length/3 > 65535; return {pos:new Float32Array(pos), idx: big ? null : new Uint16Array(idx), idx32: big ? new Uint32Array(idx) : null, color, spec:spec||0}; }
  const IDT = {r:I3, t:[0,0,0]};

  /* ---------- costruzione della scena ---------- */
  function build(plan, cfg){
    clearBatches();
    const Wmm = plan.W*1000, Dmm = plan.D*1000, H = +cfg.H || 60;
    const ty = H*10 - 30;                       // sotto il deck (mm da terra)
    const delta = H*10 - 600;                   // allungamento rispetto alla gamba da 60 cm del modello
    const fam = cfg.family || 'hexa';
    const frameCol = FRAME_DARK[fam] ? [0.10,0.10,0.11] : null;
    const topCol = DECK_TOP[fam] || DECK_TOP.hexa;
    const deckOver = m => m.key==='64,64,64' ? topCol : (m.key==='254,254,255' && frameCol ? frameCol : null);

    // --- decks e gambe
    const deckBy = new Map(), legs = [], legPts = new Map();
    for(const d of plan.decks){
      const wx = d.w*500, dz = d.h*500;
      const rot = wx > dz;                       // il modello e' 1000 (x) x 2000 (z): se il lato lungo e' su x lo ruoto
      const sx = Math.min(wx,dz) - 1000, sz = Math.max(wx,dz) - 2000;
      const key = Math.min(wx,dz)+'x'+Math.max(wx,dz);
      if(!deckBy.has(key)) deckBy.set(key, {sx, sz, list:[]});
      let D;
      if(!rot) D = {r:I3, t:[d.x*500+31, ty, d.y*500+1000]};
      else D = {r:[0,0,1, 0,1,0, -1,0,0], t:[d.y*0+d.x*500+1000, ty, d.y*500 + 969 + sx]};
      // rot: x_w = z_m + (x0+1000), z_w = -x_m + (z0 + 969 + sx)
      D.t[0] = d.x*500 + 1000; D.t[2] = d.y*500 + 969 + sx;
      deckBy.get(key).list.push(D);
      for(const T of MD.legT){
        const t = T.t.slice(); if(t[0] > 469) t[0] += sx; if(t[2] > 0) t[2] += sz;
        t[1] -= delta;                              // la gamba resta ancorata a terra
        const L = comp(D, {r:T.R.flat(), t});
        legs.push(L);
      }
      // punti angolo (per i morsetti)
      for(const [cx,cy] of [[d.x,d.y],[d.x+d.w,d.y],[d.x,d.y+d.h],[d.x+d.w,d.y+d.h]]){
        const k = cx+','+cy; if(!legPts.has(k)) legPts.set(k, {x:cx*500, z:cy*500, n:0, near:[]}); legPts.get(k).n++;
      }
    }
    for(const [key,v] of deckBy){
      const geo = stretched('deck', (x,y,z) => [x + (x>469 ? v.sx : 0), y, z + (z>0 ? v.sz : 0)], deckOver);
      addBatch(geo, v.list);
    }
    // gambe: la parte sopra z=150 si allunga/accorcia
    addBatch(stretched('leg', (x,y,z) => [x,y,z > 150 ? z+delta : z]), legs);

    // --- morsetti tra le gambe (a 170 mm sotto il deck)
    const cy = ty - Math.min(170, ty*0.45);
    const v4 = [], v2 = [];
    const conn4 = plan.conn4!==false, conn2 = plan.conn2!==false;   // connettori solo dove l'offerta li mette (gambe oltre 80 cm)
    for(const p of legPts.values()){
      if(conn4 && p.n===4) v4.push({r:mulR(RY(Math.PI/2), ZUP), t:[p.x, cy, p.z]});
    }
    // coppie da 2: lungo i lati di deck dove si incontrano solo 2 angoli
    const seen = new Set();
    for(const p of legPts.values()){
      if(!conn2 || p.n!==2) continue;
      // direzione: dai deck che condividono il vertice
      const dk = plan.decks.filter(d => [[d.x,d.y],[d.x+d.w,d.y],[d.x,d.y+d.h],[d.x+d.w,d.y+d.h]].some(([a,b]) => a*500===p.x && b*500===p.z));
      if(dk.length!==2) continue;
      const a = dk[0], b = dk[1];
      const ax = (a.x+a.w/2 - b.x - b.w/2), az = (a.y+a.h/2 - b.y - b.h/2);
      const alongX = Math.abs(ax) > Math.abs(az);   // i deck sono affiancati su x -> il morsetto corre lungo x
      v2.push({r: alongX ? I3 : RY(Math.PI/2), t:[p.x, cy, p.z]});   // piastra in piedi contro le facce delle due gambe
    }
    if(v4.length) addBatch(plain('v4lc'), v4);
    if(v2.length) addBatch(plain('vlc'), v2);

    // --- ringhiere
    const r2 = [], r1 = [], r05 = [], ry = ty + 63.5;
    for(const run of plan.runs){
      let pos = run.start;
      const lens = run.pieces || [...Array(run.n2).fill(2), ...Array(run.n1).fill(1), ...Array(run.n05||0).fill(0.5)];
      const side = run.side, limit = (side==='back'||side==='front') ? plan.W : plan.D;
      for(const Lm of lens){
        const s = pos*1000, L = Math.min(Lm, limit-pos)*1000;
        let T;
        if(side==='left')       T = {r:I3, t:[0, ry, s+50]};
        else if(side==='back')  T = {r:[0,0,-1, 0,1,0, 1,0,0], t:[s+L-50, ry, 0]};
        else if(side==='right') T = {r:RY(Math.PI), t:[Wmm, ry, s+L-50]};
        else                    T = {r:[0,0,1, 0,1,0, -1,0,0], t:[s+50, ry, Dmm]};
        (Lm===2 ? r2 : Lm===1 ? r1 : r05).push(T);
        pos += Lm;
      }
    }
    if(r2.length) addBatch(plain('rail2'), r2);
    if(r1.length) addBatch(plain('rail1'), r1);
    if(r05.length) addBatch(stretched('rail1', (x,y,z) => [x, y, z > 450 ? z-500 : z]), r05);   // elemento da 0,5 m: quello da 1 m accorciato

    // --- scale
    const OUT = {back:[0,0,-1], front:[0,0,1], left:[-1,0,0], right:[1,0,0]};
    const sideStart = {back:[0,0], front:[0,Dmm], left:[0,0], right:[Wmm,0]};
    const stepBy = {}, sRail = [];
    const byside = {back:[],front:[],left:[],right:[]};
    (cfg.stairs||[]).forEach(s => { if(byside[s.side]) byside[s.side].push(s); });
    const opening = (plan.opening||1)*1000;
    for(const side of Object.keys(byside)){
      byside[side].forEach((st,i) => {
        const o = OUT[side], horiz = side==='back'||side==='front';
        const along = (i+0.5)*opening;                         // centro della scala lungo il lato
        const base = sideStart[side];
        const cx = base[0] + (horiz ? along : 0), cz = base[1] + (horiz ? 0 : along);
        const n = Math.max(1, Math.max(1, Math.round(H/20)));       // gradini da 20 cm
        const lz = [0,1,0], ly = [-o[0],-o[1],-o[2]];
        // lx = ly x lz
        const lx = [ly[1]*lz[2]-ly[2]*lz[1], ly[2]*lz[0]-ly[0]*lz[2], ly[0]*lz[1]-ly[1]*lz[0]];
        const R = [lx[0],ly[0],lz[0], lx[1],ly[1],lz[1], lx[2],ly[2],lz[2]];
        for(let k=0;k<n;k++){
          const h = (n-k)*200, dist = 120 + k*240;
          const key = h<=600 ? 'step'+(h/10) : 'tall'+h;
          if(!stepBy[key]) stepBy[key] = [];
          stepBy[key].push({r:R, t:[cx+o[0]*dist, 5, cz+o[2]*dist]});
        }
        // corrimano: uno ogni 2 gradini, su 1 o 2 lati
        const sides = st.rails===0 ? 0 : st.rails===1 ? 1 : 2;
        if(sides && n>=2){
          const rz = [0,1,0], rx = o, ryv = [rz[1]*rx[2]-rz[2]*rx[1], rz[2]*rx[0]-rz[0]*rx[2], rz[0]*rx[1]-rz[1]*rx[0]];
          const RR = [rx[0],ryv[0],rz[0], rx[1],ryv[1],rz[1], rx[2],ryv[2],rz[2]];
          for(let k=0;k<Math.floor(n/2);k++){
            const dist = 240 + k*480, top = (n-2*k)*200, by = top - 372;
            for(let sd=0;sd<sides;sd++){
              const off = (sd===0 ? -1 : 1)*337;                   // a destra e a sinistra della scala
              const px = cx + (horiz ? off : 0) + o[0]*dist, pz = cz + (horiz ? 0 : off) + o[2]*dist;
              sRail.push({r:RR, t:[px, by, pz]});
            }
          }
        }
      });
    }
    for(const [key,list] of Object.entries(stepBy)){
      if(key.startsWith('step')) addBatch(plain(key), list);
      else { const h = +key.slice(4); addBatch(stretched('step60', (x,y,z) => [x,y,z > 300 ? z + (h-600) : z]), list); }
    }
    if(sRail.length) addBatch(plain('stairrail'), sRail);

    // --- rampe: cuneo semplice dal pavimento al piano del palco
    const ramps = [], rl = (plan.rampLen||2)*1000, top = ty + 90;
    const rbySide = {back:0,front:0,left:0,right:0};
    (cfg.ramps||[]).forEach(r => { if(rbySide[r.side]!==undefined) rbySide[r.side]++; });
    for(const side of Object.keys(rbySide)){
      for(let j=0;j<rbySide[side];j++){
        const o = OUT[side], horiz = side==='back'||side==='front';
        const along = ((plan.stairs[side]||0)*opening + (j+0.5)*(plan.rampOpening||1)*1000);
        const base = sideStart[side], w2 = (plan.rampOpening||1)*500 - 20;
        const cx = base[0] + (horiz ? along : 0), cz = base[1] + (horiz ? 0 : along);
        const px = horiz ? [1,0,0] : [0,0,1];
        const P0 = [[-w2,0,0],[w2,0,0],[w2,top,0],[-w2,top,0],[-w2,0,rl],[w2,0,rl]]; // x lungo il fronte, z in uscita, y su
        const pts = P0.map(([x,y,z]) => [cx + px[0]*x + o[0]*z, y, cz + px[2]*x + o[2]*z]);
        const pos = pts.flat();
        ramps.push(rawMat(pos,[0,1,2, 0,2,3, 0,4,5, 0,5,1, 3,2,5, 3,5,4, 1,5,2, 0,3,4],[0.30,0.31,0.33],0.1));
      }
    }
    for(const m of ramps) addBatch([m],[IDT]);

    // --- mascheratura (teli): lisci o plissettati
    const skCol = cfg.skirt && /^VSP/.test(cfg.skirt.fabric||'') ? [0.035,0.035,0.04] : [0.075,0.075,0.085];
    const pleated = cfg.skirt && /-P$/.test(cfg.skirt.fabric||'');
    for(const side of (plan.skirt||[])){
      const horiz = side==='back'||side==='front', len = horiz ? Wmm : Dmm, o = OUT[side];
      const sh = Math.min(ty, (plan.skirtH||H)*10);
      const bot = ty - sh, topY = ty + 10;
      const pos = [], idx = [], step = pleated ? 60 : len, amp = pleated ? 28 : 0;
      const nSeg = Math.max(1, Math.round(len/step));
      const baseX = side==='right' ? Wmm : 0, baseZ = side==='front' ? Dmm : 0;
      for(let i=0;i<=nSeg;i++){
        const a = i*len/nSeg, off = 12 + (i%2 ? amp : 0);
        const x = horiz ? a : baseX + o[0]*off, z = horiz ? baseZ + o[2]*off : a;
        const xx = horiz ? x : x, zz = z;
        pos.push(xx,bot,zz, xx,topY,zz);
        if(i>0){ const k = (i-1)*2; idx.push(k,k+2,k+1, k+1,k+2,k+3); }
      }
      addBatch([rawMat(pos,idx,skCol,0.05)],[IDT]);
    }

    // --- inquadratura
    cam.target = [Wmm/2, (ty+90)/2, Dmm/2];
    stageR = Math.hypot(Wmm, Dmm)/2 + 600;
    rect = [0,0,Wmm,Dmm];
    cam.fit = Math.max(stageR*2.1, 3500);
    if(!cam.userMoved) cam.dist = cam.fit;
    buildGround();
    dirty = true; draw();
  }
  function buildGround(){
    if(groundMesh){ gl.deleteVertexArray(groundMesh.vao); gl.deleteBuffer(groundMesh.pb); gl.deleteBuffer(groundMesh.ib); }
    const R = 60000, cx = cam.target[0], cz = cam.target[2];
    const pos = new Float32Array([cx-R,0,cz-R, cx+R,0,cz-R, cx+R,0,cz+R, cx-R,0,cz+R]);
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const pb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,pb); gl.bufferData(gl.ARRAY_BUFFER,pos,gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,3,gl.FLOAT,false,0,0);
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array([0,2,1,0,3,2]),gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    groundMesh = {vao,pb,ib};
  }

  /* ---------- disegno ---------- */
  function eye(){
    const ce = Math.cos(cam.el), t = cam.target;
    return [t[0] + cam.dist*ce*Math.sin(cam.az), t[1] + cam.dist*Math.sin(cam.el), t[2] + cam.dist*ce*Math.cos(cam.az)];
  }
  function draw(){
    if(!dirty) return; dirty = false;
    gl.viewport(0,0,canvas.width,canvas.height);
    gl.clearColor(bg[0],bg[1],bg[2],1); gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
    const e = eye(), asp = canvas.width/Math.max(1,canvas.height);
    const vp = mul4(persp(0.62, asp, Math.max(50,cam.dist/200), cam.dist*12+80000), lookAt(e, cam.target, [0,1,0]));
    // terreno
    if(groundMesh){
      gl.useProgram(G); gl.uniformMatrix4fv(GU.vp,false,vp);
      gl.uniform4f(GU.rect, rect[0],rect[1],rect[2],rect[3]); gl.uniform3f(GU.ground, groundCol[0],groundCol[1],groundCol[2]);
      gl.uniform3f(GU.center, cam.target[0], stageR*5, cam.target[2]);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindVertexArray(groundMesh.vao); gl.drawElements(gl.TRIANGLES,6,gl.UNSIGNED_SHORT,0); gl.disable(gl.BLEND);
    }
    gl.useProgram(P); gl.uniformMatrix4fv(U.vp,false,vp); gl.uniform3f(U.eye,e[0],e[1],e[2]);
    for(const b of batches) for(const m of b.meshes){
      gl.uniform3f(U.color,m.color[0],m.color[1],m.color[2]); gl.uniform1f(U.spec,m.spec);
      gl.bindVertexArray(m.vao); gl.drawElementsInstanced(gl.TRIANGLES, m.n, m.type, 0, b.count);
    }
    gl.bindVertexArray(null);
  }
  const request = () => { dirty = true; requestAnimationFrame(draw); };

  /* ---------- interazione ---------- */
  const ptr = new Map(); let lastPinch = 0;
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); ptr.set(e.pointerId,{x:e.clientX,y:e.clientY,b:e.button}); lastPinch = 0; });
  canvas.addEventListener('pointerup', e => { ptr.delete(e.pointerId); lastPinch = 0; });
  canvas.addEventListener('pointercancel', e => { ptr.delete(e.pointerId); lastPinch = 0; });
  canvas.addEventListener('pointermove', e => {
    const p = ptr.get(e.pointerId); if(!p) return;
    const dx = e.clientX-p.x, dy = e.clientY-p.y; p.x = e.clientX; p.y = e.clientY;
    cam.userMoved = true;
    if(ptr.size===2){
      const [a,b] = [...ptr.values()], d = Math.hypot(a.x-b.x,a.y-b.y);
      if(lastPinch) cam.dist = Math.min(cam.fit*4, Math.max(cam.fit*0.12, cam.dist*lastPinch/d));
      lastPinch = d;
    } else if(p.b===2 || e.shiftKey){
      const k = cam.dist*0.0016, s = Math.sin(cam.az), c = Math.cos(cam.az);
      cam.target[0] -= (c*dx)*k; cam.target[2] += (s*dx)*k; cam.target[1] += dy*k;
    } else {
      cam.az -= dx*0.007; cam.el = Math.min(1.45, Math.max(0.03, cam.el + dy*0.006));
    }
    request();
  });
  canvas.addEventListener('wheel', e => { e.preventDefault(); cam.userMoved = true; cam.dist = Math.min(cam.fit*4, Math.max(cam.fit*0.12, cam.dist*Math.exp(e.deltaY*0.001))); request(); }, {passive:false});
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  function resize(){
    const r = canvas.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio||1);
    const w = Math.max(2,Math.round(r.width*dpr)), h = Math.max(2,Math.round(r.height*dpr));
    if(canvas.width!==w || canvas.height!==h){ canvas.width = w; canvas.height = h; }
    request();
  }
  function theme(){
    const parse = s => { const m = /rgba?\((\d+)[ ,]+(\d+)[ ,]+(\d+)(?:[ ,/]+([\d.]+))?/.exec(s); return m && (m[4]===undefined || +m[4] > 0.5) ? [m[1]/255,m[2]/255,m[3]/255] : null; };
    bg = null;
    for(let e = canvas.parentElement; e && !bg; e = e.parentElement) bg = parse(getComputedStyle(e).backgroundColor);
    bg = bg || [0.93,0.95,0.97];
    const dark = (bg[0]+bg[1]+bg[2])/3 < 0.4;
    groundCol = dark ? [bg[0]*1.25+0.03, bg[1]*1.25+0.03, bg[2]*1.25+0.04] : [Math.min(1,bg[0]*0.97), Math.min(1,bg[1]*0.97), Math.min(1,bg[2]*0.97)];
    request();
  }
  function reset(){ cam.userMoved = false; cam.az = 0.62; cam.el = 0.46; cam.dist = cam.fit; request(); }
  function png(){ draw(); return new Promise(res => canvas.toBlob(res, 'image/png')); }
  new ResizeObserver(resize).observe(canvas);
  theme(); resize();
  try{ matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => theme()); }catch(e){}
  return {build, resize, theme, reset, png, request, cam};
}
window.StageView = {create};
})();
