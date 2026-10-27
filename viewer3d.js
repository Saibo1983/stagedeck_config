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
const LEG_AXIS = [-13,-1,0];           // centro del tubo nel modello della gamba (in pianta)
const VLC_JAW = -30;                   // centro delle ganasce del morsetto VLC (asse z del modello)
const VD2D_MID = 60, VD2D_TOP = 60;    // connettore deck-deck: centro tra le due ganasce (x) e punta dei ganci (z, verso l'alto)

/* ---------- WebGL ---------- */
const VS = `#version 300 es
layout(location=0) in vec3 a_pos;
layout(location=1) in vec4 i0; layout(location=2) in vec4 i1; layout(location=3) in vec4 i2; layout(location=4) in vec4 i3;
uniform mat4 u_vp; out vec3 v_pos;
void main(){ mat4 m = mat4(i0,i1,i2,i3); vec4 w = m*vec4(a_pos,1.0); v_pos = w.xyz; gl_Position = u_vp*w; }`;
const FS = `#version 300 es
precision highp float; in vec3 v_pos; out vec4 o;
uniform vec3 u_color; uniform float u_spec; uniform vec3 u_eye; uniform float u_alpha;
void main(){
  vec3 n = normalize(cross(dFdx(v_pos), dFdy(v_pos)));
  vec3 V = normalize(u_eye - v_pos); if(dot(n,V) < 0.0) n = -n;
  vec3 L1 = normalize(vec3(-0.45, 0.85, 0.55)), L2 = normalize(vec3(0.6, 0.35, -0.5));
  float d = max(dot(n,L1),0.0)*0.62 + max(dot(n,L2),0.0)*0.22;
  float amb = 0.34 + 0.16*n.y;
  vec3 H = normalize(L1+V); float sp = pow(max(dot(n,H),0.0), 48.0)*u_spec;
  vec3 c = u_color*(amb+d) + vec3(sp);
  o = vec4(pow(c, vec3(1.0/1.1)), u_alpha);
}`;
const GVS = `#version 300 es
layout(location=0) in vec3 a_pos; uniform mat4 u_vp; out vec3 v_pos;
void main(){ v_pos = a_pos; gl_Position = u_vp*vec4(a_pos,1.0); }`;
const GFS = `#version 300 es
precision highp float; in vec3 v_pos; out vec4 o;
uniform vec4 u_rect; uniform vec3 u_ground; uniform vec3 u_center; uniform float u_round;
void main(){
  vec2 p = v_pos.xz;
  vec2 dd = max(max(u_rect.xy - p, p - u_rect.zw), vec2(0.0));
  // palco rotondo (u_round = raggio): ombra intorno al cerchio, non al quadrato che lo contiene
  float dist = u_round > 0.0 ? max(length(p - 0.5*(u_rect.xy + u_rect.zw)) - u_round, 0.0) : length(dd);
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
  const U = {vp:gl.getUniformLocation(P,'u_vp'), color:gl.getUniformLocation(P,'u_color'), spec:gl.getUniformLocation(P,'u_spec'), eye:gl.getUniformLocation(P,'u_eye'), alpha:gl.getUniformLocation(P,'u_alpha')};
  const GU = {vp:gl.getUniformLocation(G,'u_vp'), rect:gl.getUniformLocation(G,'u_rect'), ground:gl.getUniformLocation(G,'u_ground'), center:gl.getUniformLocation(G,'u_center'), round:gl.getUniformLocation(G,'u_round')};
  let batches = [];      // {meshes:[{vao,n,type,color,spec}], inst, count, src:{mats, mats4}}
  let groundMesh = null, rect = [0,0,1,1], roundR = 0, bg = [1,1,1], groundCol = [0.82,0.84,0.86];
  const cam = {az:0.62, el:0.46, dist:9000, target:[0,300,0], fit:9000};
  let dirty = true, W = 1, Hh = 1, stageR = 4000;
  let xray = false;      // pianali delle pedane trasparenti: si vede sotto il palco senza girare la vista
  let roomClear = false; // pareti e pavimento della sala trasparenti

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
      return {vao:v.vao, pb:v.pb, ib:v.ib, n:idx.length, type: m.idx32 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, color:m.color, spec:m.spec, top:!!m.top, room:m.room};
    });
    batches.push({meshes, inst, count:transforms.length, src:{mats, data}});   // src: copia per l'esportazione GLB
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
  // mesh composti: posizioni e indici accumulati, poi un solo lotto
  const mk = () => ({P:[], I:[]});
  const push = (m, P, I) => { const o = m.P.length/3; m.P.push(...P); m.I.push(...I.map(k => k+o)); };

  /* ---------- costruzione della scena ---------- */
  function build(plan, cfg){
    clearBatches();
    // tribuna (plan.trib): ogni pedana ha l'altezza della sua fila (d.hc, cm); H è quella dell'ultima fila
    const Wmm = plan.W*1000, Dmm = plan.D*1000, H = plan.trib ? plan.hTop : (+cfg.H || 60);
    const ty = H*10 - 30;                       // sotto il deck (mm da terra)
    const delta = H*10 - 600;                   // allungamento rispetto alla gamba da 60 cm del modello
    const fam = cfg.family || 'hexa';
    const frameCol = FRAME_DARK[fam] ? [0.10,0.10,0.11] : null;
    const topCol = DECK_TOP[fam] || DECK_TOP.hexa;
    const deckOver = m => m.key==='64,64,64' ? topCol : (m.key==='254,254,255' && frameCol ? frameCol : null);
    const spider = cfg.support==='spider' && !plan.round && !plan.trib;
    const roundLeg = cfg.legShape==='round' || cfg.legShape==='roundAdj';
    const legAxes = [];                         // asse di ogni gamba in pianta (per le gambe tonde)

    // --- decks e gambe
    const deckBy = new Map(), legs = [], legPts = new Map(), legsBy = new Map();   // legsBy: gambe di altre altezze (tribuna)
    for(const d of plan.decks){
      const tyD = d.hc!=null ? d.hc*10 - 30 : ty, dl = d.hc!=null ? d.hc*10 - 600 : delta;
      const legList = dl===delta ? legs : (legsBy.get(dl) || legsBy.set(dl, []).get(dl));
      const wx = d.w*500, dz = d.h*500;
      const rot = wx > dz;                       // il modello e' 1000 (x) x 2000 (z): se il lato lungo e' su x lo ruoto
      const sx = Math.min(wx,dz) - 1000, sz = Math.max(wx,dz) - 2000;
      const key = Math.min(wx,dz)+'x'+Math.max(wx,dz);
      if(!deckBy.has(key)) deckBy.set(key, {sx, sz, list:[]});
      // rot: x_w = z_m + (x0+1000), z_w = -x_m + (z0 + 969 + sx)
      const D = !rot ? {r:I3, t:[d.x*500+31, tyD, d.y*500+1000]} : {r:[0,0,1, 0,1,0, -1,0,0], t:[d.x*500+1000, tyD, d.y*500 + 969 + sx]};
      deckBy.get(key).list.push(D);
      for(const T of MD.legT){
        const t = T.t.slice(); if(t[0] > 469) t[0] += sx; if(t[2] > 0) t[2] += sz;
        t[1] -= dl;                                 // la gamba resta ancorata a terra
        const L = comp(D, {r:T.R.flat(), t});
        legList.push(L);
        // asse del tubo della gamba (in pianta), assegnato all'angolo di deck più vicino: serve per i morsetti
        const a = mulV(L.r, LEG_AXIS), gx = L.t[0]+a[0], gz = L.t[2]+a[2];
        const rl = plan.trib && plan.rows[d.row] && plan.rows[d.row].leg;
        legAxes.push([gx, gz, tyD, rl ? !!rl.tele : undefined]);
        let best = null, bd = Infinity;
        for(const [cx,cy] of [[d.x,d.y],[d.x+d.w,d.y],[d.x,d.y+d.h],[d.x+d.w,d.y+d.h]]){
          const dd = Math.hypot(cx*500-gx, cy*500-gz); if(dd < bd){ bd = dd; best = cx+','+cy; }
        }
        if(!legPts.has(best)) legPts.set(best, {legs:[], ty:Infinity, hc:0, rows:new Set()});
        const lp = legPts.get(best); lp.legs.push([gx,gz]); lp.ty = Math.min(lp.ty, tyD); lp.hc = Math.max(lp.hc, d.hc||0); lp.rows.add(d.row);
      }
    }
    if(!spider) for(const [key,v] of deckBy){
      const geo = stretched('deck', (x,y,z) => [x + (x>469 ? v.sx : 0), y, z + (z>0 ? v.sz : 0)], deckOver);
      geo.forEach((m,i) => { if(PARTS.deck[i].key==='64,64,64') m.top = true; });   // il pianale (si può rendere trasparente)
      addBatch(geo, v.list);
    }
    // palco rotondo: pezzi speciali (telaio in alluminio + piano) e 4 gambe per pezzo (q.legs[].at: asse del tubo, già
    // dentro il pezzo). La gamba non è simmetrica: di 4 rotazioni si prende quella che sta più dentro il pezzo.
    if(plan.round){
      const LT = MD.legT[0], mn = MD.parts.leg.min, mx = MD.parts.leg.sc.map((v,i) => mn[i] + v*65535);
      const foot = [[mn[0],mn[1]],[mx[0],mn[1]],[mx[0],mx[1]],[mn[0],mx[1]]];   // ingombro in pianta (modello)
      const rots = [0,1,2,3].map(k => { const r = mulR(RY(k*Math.PI/2), LT.R.flat()), a = mulV(r, LEG_AXIS);
        return {r, a, f:foot.map(([x,y]) => { const v = mulV(r, [x,y,0]); return [v[0]-a[0], v[2]-a[2]]; })}; });
      for(const q of plan.round.pieces){
        if(q.std) continue;
        const pts = q.poly.map(([x,y]) => [x*1000, y*1000]);
        addBatch([rawMat(...extrude(pts, ty, ty+72, false), FRAME_DARK[fam] ? [0.10,0.10,0.11] : [0.80,0.82,0.86], 0.5), Object.assign(rawMat(...extrude(pts, ty+72, ty+90), topCol, 0.15), {top:true})], [IDT]);
        const sgn = Math.sign(pts.reduce((a,v,i) => { const w = pts[(i+1)%pts.length]; return a + v[0]*w[1]-w[0]*v[1]; }, 0));
        const inside = (x,z) => Math.min(...pts.map((a,i) => { const b = pts[(i+1)%pts.length], L = Math.hypot(b[0]-a[0], b[1]-a[1]);
          return L < 1e-6 ? Infinity : ((x-a[0])*-(b[1]-a[1]) + (z-a[1])*(b[0]-a[0]))/L*sgn; }));   // distanza dal lato più vicino (<0 fuori)
        for(const g of q.legs){
          const gx = g.at[0]*1000, gz = g.at[1]*1000;
          let best = null, bd = -Infinity;
          for(const o of rots){ const d = Math.min(...o.f.map(([x,z]) => inside(gx+x, gz+z))); if(d > bd + 1e-6){ bd = d; best = o; } }
          legs.push({r:best.r, t:[gx - best.a[0], ty + LT.t[1] - delta, gz - best.a[2]]}); legAxes.push([gx, gz]);
          if(g.aligned){   // gambe allineate con quelle dei pezzi vicini: morsetti come nelle pedane normali
            const k = Math.round(g.p[0]*200)/100 + ',' + Math.round(g.p[1]*200)/100;
            if(!legPts.has(k)) legPts.set(k, {legs:[]});
            legPts.get(k).legs.push([gx, gz]);
          }
        }
      }
    }
    // gambe: la parte sopra z=150 si allunga/accorcia
    if(spider) spiderParts(plan, cfg, ty, topCol);
    else if(roundLeg) roundLegs(legAxes, ty, cfg);
    else{
      addBatch(stretched('leg', (x,y,z) => [x,y,z > 150 ? z+delta : z]), legs);
      for(const [dl, list] of legsBy) addBatch(stretched('leg', (x,y,z) => [x,y,z > 150 ? z+dl : z]), list);
    }

    // --- morsetti tra le gambe (a 170 mm sotto il deck)
    const v4 = [], v2 = [];
    const conn4 = plan.trib ? !!plan.conn : plan.conn4!==false, conn2 = plan.trib ? !!plan.conn : plan.conn2!==false;   // solo dove l'offerta li mette (gambe oltre 80 cm)
    if(!spider) for(const p of legPts.values()){
      if(plan.trib && p.hc < 80 && p.rows.size < 2) continue;   // tribuna: sempre tra le file, dentro la fila dagli 80 cm
      const pty = isFinite(p.ty) ? p.ty : ty, cy = pty - Math.min(170, pty*0.45);
      const n = p.legs.length, mx = p.legs.reduce((s,g) => s+g[0],0)/n, mz = p.legs.reduce((s,g) => s+g[1],0)/n;
      if(conn4 && n===4) v4.push({r:mulR(RY(Math.PI/2), ZUP), t:[mx, cy, mz]});
      if(conn2 && n===2){
        // il morsetto corre da una gamba all'altra; le sue ganasce (a z = -30 nel modello) stringono i tubi
        const alongX = Math.abs(p.legs[0][0]-p.legs[1][0]) > Math.abs(p.legs[0][1]-p.legs[1][1]);
        const R = alongX ? I3 : RY(Math.PI/2), o = mulV(R, [0,0,VLC_JAW]);
        v2.push({r:R, t:[mx - o[0], cy, mz - o[2]]});
      }
    }
    // --- connettori deck-deck VD2D: sotto ogni giunto tra due pedane, di traverso, 1 per metro di giunto (come nell'offerta)
    if(plan.vd2d && PARTS.vd2d){
      const vd = [], ds = plan.decks;
      let yv = ty + 20 - VD2D_TOP;   // i ganci salgono 20 mm dentro il telaio delle pedane
      const put = (x, z, alongZ) => {   // alongZ: giunto parallelo a z, il connettore corre lungo x
        const R = alongZ ? ZUP : mulR(RY(Math.PI/2), ZUP), o = mulV(R, [VD2D_MID, 0, 0]);
        vd.push({r:R, t:[x - o[0], yv, z - o[2]]});
      };
      for(let i=0;i<ds.length;i++) for(let j=i+1;j<ds.length;j++){
        const a = ds[i], b = ds[j];
        if(a.row!==b.row) continue;                    // tribuna: solo pedane della stessa fila
        yv = (a.hc!=null ? a.hc*10 - 30 : ty) + 20 - VD2D_TOP;
        if(a.x+a.w===b.x || b.x+b.w===a.x){           // giunto lungo z
          const y0 = Math.max(a.y,b.y), y1 = Math.min(a.y+a.h,b.y+b.h), L = (y1-y0)/2;
          if(L>0){ const n = Math.ceil(L-1e-9), x = (a.x+a.w===b.x ? b.x : a.x)*500; for(let k=0;k<n;k++) put(x, (y0/2 + (k+0.5)*L/n)*1000, true); }
        }
        if(a.y+a.h===b.y || b.y+b.h===a.y){           // giunto lungo x
          const x0 = Math.max(a.x,b.x), x1 = Math.min(a.x+a.w,b.x+b.w), L = (x1-x0)/2;
          if(L>0){ const n = Math.ceil(L-1e-9), z = (a.y+a.h===b.y ? b.y : a.y)*500; for(let k=0;k<n;k++) put((x0/2 + (k+0.5)*L/n)*1000, z, false); }
        }
      }
      if(vd.length) addBatch(plain('vd2d'), vd);
    }
    if(v4.length) addBatch(plain('v4lc'), v4);
    if(v2.length) addBatch(plain('vlc'), v2);

    // --- ringhiere. Ogni elemento ha 2 connettori a un'estremità, verso il parapetto vicino (rail2 alla fine, rail1 e
    // 0,5 m all'inizio): dove da quella parte non c'è un altro elemento dello stesso tratto non si disegnano (spunterebbero
    // nel vuoto). Con il battipiede (VHK) una lamiera alta 15 cm sul piano.
    const ry0 = ty + 63.5, railGroups = new Map();
    const kickAll = !!cfg.kick && !cfg.safety && !spider;
    for(const run of plan.runs){
      let pos = run.start;
      const ry = run.h!=null ? run.h*10 - 30 + 63.5 : ry0;   // tribuna: ogni tratto alla quota della sua fila
      const lens = run.pieces || [...Array(run.n2).fill(2), ...Array(run.n1).fill(1), ...Array(run.n05||0).fill(0.5)];
      const side = run.side, limit = (side==='back'||side==='front') ? plan.W : plan.D;
      const kick = run.kick!=null ? !!run.kick && !spider : kickAll;
      const pcs = [];
      for(const Lm of lens){
        const s = pos*1000, L = Math.min(Lm, limit-pos)*1000;
        let T;
        if(side==='left')       T = {r:I3, t:[0, ry, s+50]};
        else if(side==='back')  T = {r:[0,0,-1, 0,1,0, 1,0,0], t:[s+L-50, ry, 0]};
        else if(side==='right') T = {r:RY(Math.PI), t:[Wmm, ry, s+L-50]};
        else                    T = {r:[0,0,1, 0,1,0, -1,0,0], t:[s+50, ry, Dmm]};
        // posizione dei connettori lungo il tratto (u, mm): z del modello 1950 (rail2) o -50 (rail1, 0,5 m)
        const zc = Lm===2 ? 1950 : -50, up = side==='left' || side==='front';
        pcs.push({Lm, T, a:s, b:s+L, uc: up ? s+50+zc : s+L-50-zc});
        pos += Lm;
      }
      for(const pc of pcs){
        const conn = pcs.some(q => q!==pc && pc.uc >= q.a-1 && pc.uc <= q.b+1);
        const k = pc.Lm+'|'+(kick?1:0)+'|'+(conn?1:0);
        if(!railGroups.has(k)) railGroups.set(k, {Lm:pc.Lm, kick, conn, list:[]});
        railGroups.get(k).list.push(pc.T);
      }
    }
    // connettori d'angolo (VHCC): dove due tratti di parapetto si incontrano a 90°, una squadretta tra i due montanti
    // d'angolo (a 50 mm dall'angolo, 27 mm fuori dal bordo) alle altezze dei connettori dei parapetti (273 e 873 mm sul piede)
    {
      const spans = plan.runs.map(r => {
        const limit = (r.side==='back'||r.side==='front') ? plan.W : plan.D, lens = r.pieces || [];
        return {side:r.side, u0:r.start, u1:Math.min(limit, r.start + lens.reduce((a,b) => a+b, 0)), y:r.h!=null ? r.h*10 - 30 + 63.5 : ry0};
      });
      const at = (side, u) => spans.find(sp => sp.side===side && u >= sp.u0-1e-6 && u <= sp.u1+1e-6);
      const CC = mk();
      for(const [hs, vs] of [['back','left'],['back','right'],['front','left'],['front','right']]){
        const uH = vs==='left' ? 0 : plan.W, uV = hs==='back' ? 0 : plan.D;
        const h = at(hs, uH), v = at(vs, uV);
        if(!h || !v) continue;
        const cx = uH*1000, cz = uV*1000, ox = vs==='left' ? -1 : 1, oz = hs==='back' ? -1 : 1;   // verso fuori
        const pA = [cx - ox*50, cz + oz*27], pC = [cx + ox*27, cz + oz*27], pB = [cx + ox*27, cz - oz*50];   // montanti: 27 mm fuori dal bordo
        for(const dy of [273, 873]){
          const y = h.y + dy;
          for(const [p, q] of [[pA, pC], [pC, pB]]) push(CC, box([Math.min(p[0],q[0])-6, y-12, Math.min(p[1],q[1])-6], [Math.max(p[0],q[0])+6, y+12, Math.max(p[1],q[1])+6]), BOX_IDX);
          push(CC, ...cyl([pC[0], y-30, pC[1]], [pC[0], y+30, pC[1]], 9, 8));   // bullone a farfalla
        }
      }
      if(CC.P.length) addBatch([rawMat(CC.P, CC.I, [0.56,0.56,0.57], 0.35)], [IDT]);
    }
    for(const g of railGroups.values()){
      let mats;
      if(spider) mats = spiderRail(g.Lm*1000);                       // parapetti Spider VH-2 e VH-1 (disegni 81-82)
      else if(cfg.safety && g.Lm!==0.5) mats = vhxMats(g.Lm*1000);   // parapetto di sicurezza VHX (disegnato qui)
      else mats = railMats(g.Lm, g.kick, g.conn);
      addBatch(mats, g.list);
    }

    // --- scale (disegni Everdeck). Modulare: elementi VSM larghi 910 mm e profondi 282, l'ultimo 20 cm sotto il palco
    // (palco da 60 cm: VSM20 + VSM40), corrimano VHSM ogni 2 gradini partendo dall'alto. Regolabile (VAS): due cosciali
    // lunghi st.len, larga 975 mm con i ganci, gradini sempre orizzontali, corrimano VASH lungo 2180 mm e alto 750.
    const OUT = {back:[0,0,-1], front:[0,0,1], left:[-1,0,0], right:[1,0,0]};
    const sideStart = {back:[0,0], front:[0,Dmm], left:[0,0], right:[Wmm,0]};
    const stepBy = {}, sRail = [];
    const byside = {back:[],front:[],left:[],right:[]};
    if(!plan.trib) (cfg.stairs||[]).forEach(s => { if(byside[s.side]) byside[s.side].push(s); });
    const opening = (plan.opening||1)*1000;
    const st = plan.stair || {}, adjStair = st.kind==='adjustable' && st.len;
    const nMod = st.kind==='modular' ? st.steps : Math.max(1, Math.round(H/20) - 1);
    const SD = 282, SW = 910;                                   // profondità e larghezza di un elemento modulare
    const AS = mk(), AA = mk();                                 // scala regolabile: gradini neri, alluminio
    let stairOut = 0;                                           // quanto escono le scale dal palco (per la sala)
    for(const side of Object.keys(byside)){
      byside[side].forEach((stc,i) => {
        const o = OUT[side], horiz = side==='back'||side==='front';
        // centro della scala lungo il lato (palco rotondo: scale centrate, il bordo tocca il lato solo al centro)
        const along = (i+0.5)*opening + (plan.round ? ((horiz ? Wmm : Dmm) - byside[side].length*opening)/2 : 0);
        const base = sideStart[side];
        const cx = base[0] + (horiz ? along : 0), cz = base[1] + (horiz ? 0 : along);
        const sides = stc.rails===0 ? 0 : stc.rails===1 ? 1 : 2;
        if(adjStair){
          const yTop = ty + 90, run = Math.max(300, st.run*10), w2 = 975/2 - 20, n = st.steps;
          stairOut = Math.max(stairOut, run + 100);
          const px = horiz ? [1,0,0] : [0,0,1];
          const W = ([x,y,z]) => [cx + px[0]*x + o[0]*z, y, cz + px[2]*x + o[2]*z];
          const sbox = (m, x0, x1, z0, z1, yt0, yt1, t) => push(m, [[x0,yt0-t,z0],[x1,yt0-t,z0],[x1,yt0,z0],[x0,yt0,z0],[x0,yt1-t,z1],[x1,yt1-t,z1],[x1,yt1,z1],[x0,yt1,z1]].map(W).flat(), BOX_IDX);
          const yAtS = z => yTop - (yTop - 110)*z/run;           // filo superiore dei cosciali (al piede 11 cm da terra)
          for(const sx of [-1,1]) sbox(AA, sx<0 ? -w2 : w2-45, sx<0 ? -w2+45 : w2, 0, run, yAtS(0), yAtS(run), 110);
          sbox(AA, -w2, w2, -70, 0, yTop+6, yTop+6, 6);          // ganci sul bordo del palco
          const tw = Math.min(260, run/(n+1)*1.05);
          for(let k=1;k<=n;k++){
            const t = k/(n+1), z = run*(1-t), y = yTop*t;
            sbox(AS, -w2+45, w2-45, z-tw/2, z+tw/2, y, y, 28);
            sbox(AA, -w2+45, w2-45, z+tw/2-30, z+tw/2, y-28, y-28, 40);   // profilo sotto il gradino
          }
          // corrimano VASH: tubo parallelo ai cosciali, 750 mm sopra, con due montanti
          const Lr = Math.min(2180, Math.hypot(run, yTop)), zr = run*Lr/Math.hypot(run, yTop);
          for(let sd=0; sd<sides; sd++){
            const x = (sd===0 ? -1 : 1)*(w2+25), z0 = Math.max(0, (run-zr)/2), z1 = z0 + zr;
            push(AA, ...cyl(W([x, yAtS(z0)+750, z0]), W([x, yAtS(z1)+750, z1]), 20, 12));
            for(const zp of [z0 + zr*0.1, z0 + zr*0.9]) push(AA, ...cyl(W([x, yAtS(zp)-60, zp]), W([x, yAtS(zp)+750, zp]), 17, 10));
          }
          return;
        }
        const n = nMod;
        stairOut = Math.max(stairOut, n*SD + 100);
        const lz = [0,1,0], ly = [-o[0],-o[1],-o[2]];
        // lx = ly x lz
        const lx = [ly[1]*lz[2]-ly[2]*lz[1], ly[2]*lz[0]-ly[0]*lz[2], ly[0]*lz[1]-ly[1]*lz[0]];
        const R = [lx[0],ly[0],lz[0], lx[1],ly[1],lz[1], lx[2],ly[2],lz[2]];
        for(let k=0;k<n;k++){
          const h = (n-k)*200, dist = SD/2 + k*SD;
          const key = h<=600 ? 'step'+(h/10) : 'tall'+h;
          if(!stepBy[key]) stepBy[key] = [];
          stepBy[key].push({r:R, t:[cx+o[0]*dist, 5, cz+o[2]*dist]});
        }
        // corrimano: uno ogni 2 gradini, partendo dall'alto (con 3 gradini sta sul 2° e 3°), su 1 o 2 lati
        if(sides && n>=2){
          const rz = [0,1,0], rx = o, ryv = [rz[1]*rx[2]-rz[2]*rx[1], rz[2]*rx[0]-rz[0]*rx[2], rz[0]*rx[1]-rz[1]*rx[0]];
          const RR = [rx[0],ryv[0],rz[0], rx[1],ryv[1],rz[1], rx[2],ryv[2],rz[2]];
          for(let j=0; j+1<n; j+=2){
            const dist = (j+1)*SD, top = (n-j)*200, by = top - 372;
            for(let sd=0;sd<sides;sd++){
              const off = (sd===0 ? -1 : 1)*(SW/2 + 16);           // a destra e a sinistra della scala
              const px = cx + (horiz ? off : 0) + o[0]*dist, pz = cz + (horiz ? 0 : off) + o[2]*dist;
              sRail.push({r:RR, t:[px, by, pz]});
            }
          }
        }
      });
    }
    // tribuna: scala d'accesso davanti a ogni corridoio e gradini intermedi nei corridoi (sulla fila sotto, contro l'alzata)
    if(plan.trib){
      const RF = [1,0,0, 0,0,1, 0,-1,0], dep = plan.depth*1000;          // gradino rivolto verso il fronte
      const putStep = (h, x, y, z) => { const key = h<=600 ? 'step'+(h/10) : 'tall'+h; (stepBy[key] || (stepBy[key] = [])).push({r:RF, t:[x, y, z]}); };
      for(const [a,b] of plan.aisles){
        const cx = (a+b)*500;
        if(plan.access && plan.access.kind==='modular') for(let k=0;k<plan.access.steps;k++) putStep((plan.access.steps-k)*200, cx, 5, Dmm + SD/2 + k*SD);
        if(plan.inter) for(const r of plan.rows.slice(0, -1)){
          const top = r.h*10 + 60, zb = (plan.N-1-r.i)*dep;         // piano della fila e sua alzata (bordo dietro)
          for(let k=0;k<plan.inter;k++) putStep((plan.inter-k)*200, cx, top, zb + SD/2 + k*SD);
        }
      }
      // bordi anticaduta per le sedie (SKBP): profilo sul bordo dietro di ogni fila (trattiene le gambe posteriori)
      if(plan.stops && plan.stops.length){
        const C = mk();
        for(const st of plan.stops){
          const top = plan.rows[st.row].h*10 + 60, z = st.y*500;
          push(C, box([st.x*500 + 10, top, z + 8], [(st.x+st.w)*500 - 10, top + 45, z + 22]), BOX_IDX);
        }
        addBatch([rawMat(C.P, C.I, [0.12,0.12,0.13], 0.2)], [IDT]);
      }
    }
    // elementi modulari: i modelli CAD sono larghi 642 mm e profondi 242, si allargano alle misure dei disegni
    const widen = (x,y) => [x + Math.sign(x)*(SW-642)/2, y + Math.sign(y)*(SD-242)/2];
    for(const [key,list] of Object.entries(stepBy)){
      const src = key.startsWith('step') ? key : 'step60', h = key.startsWith('step') ? 0 : +key.slice(4) - 600;
      addBatch(stretched(src, (x,y,z) => [...widen(x,y), z > 300 && h ? z + h : z]), list);
    }
    if(sRail.length) addBatch(stretched('stairrail', (x,y,z) => [x + Math.sign(x)*(2*SD-474)/2, y, z]), sRail);
    if(AS.P.length) addBatch([rawMat(AS.P, AS.I, [0.06,0.06,0.07], 0.15)], [IDT]);
    if(AA.P.length) addBatch([rawMat(AA.P, AA.I, [0.80,0.82,0.86], 0.5)], [IDT]);

    // --- rampe (disegni Everdeck dei kit): pedane in salita larghe 1 m, telaio in alluminio, lamiera mandorlata
    // a terra (ER-SE) e sul palco (ER-EE), piedini tondi (20 e 40 cm) o gambe telescopiche tonde con traverso
    // sotto i giunti e in cima; pedane dalla più lunga (a terra) alla più corta (verso il palco)
    const top = ty + 90, rbySide = {back:0,front:0,left:0,right:0};
    if(!plan.trib) (cfg.ramps||[]).forEach(r => { if(rbySide[r.side]!==undefined) rbySide[r.side]++; });
    const decksR = (plan.rampDecks && plan.rampDecks.length ? plan.rampDecks : [plan.rampLen||2]).map(x => x*1000);
    const rl = decksR.reduce((a,b) => a+b, 0), g0 = 25;                 // g0: quota del piano sopra l'elemento di partenza
    const yAt = z => top - (top-g0)*z/rl;                                // z: distanza dal bordo del palco, verso fuori
    const RB = mk(), RA = mk(), RG = mk();                               // piano nero, alluminio, lamiera
    for(const side of Object.keys(rbySide)){
      for(let j=0;j<rbySide[side];j++){
        const o = OUT[side], horiz = side==='back'||side==='front';
        const along = ((plan.stairs[side]||0)*opening + (j+0.5)*(plan.rampOpening||1)*1000);
        const base = sideStart[side], w2 = Math.min(500, (plan.rampOpening||1)*500) - 10;
        const cx = base[0] + (horiz ? along : 0), cz = base[1] + (horiz ? 0 : along);
        const px = horiz ? [1,0,0] : [0,0,1];
        const W = ([x,y,z]) => [cx + px[0]*x + o[0]*z, y, cz + px[2]*x + o[2]*z];
        // prisma inclinato: x0..x1 di traverso, z0..z1 in uscita, piano superiore da yt0 a yt1, spessore t
        const sbox = (m, x0, x1, z0, z1, yt0, yt1, t) => push(m, [[x0,yt0-t,z0],[x1,yt0-t,z0],[x1,yt0,z0],[x0,yt0,z0],[x0,yt1-t,z1],[x1,yt1-t,z1],[x1,yt1,z1],[x0,yt1,z1]].map(W).flat(), BOX_IDX);
        const tube = (m, a, b, r) => push(m, ...cyl(W(a), W(b), r, 12));
        let z = 0;
        for(let k=decksR.length-1;k>=0;k--){                          // dal palco verso terra
          const z0 = z, z1 = z + decksR[k];
          sbox(RB, -w2+40, w2-40, z0+4, z1-4, yAt(z0+4), yAt(z1-4), 12);           // piano Hexa
          sbox(RA, -w2, -w2+40, z0, z1, yAt(z0), yAt(z1), 90);                       // telaio laterale
          sbox(RA, w2-40, w2, z0, z1, yAt(z0), yAt(z1), 90);
          z = z1;
        }
        sbox(RG, -w2, w2, -190, 10, top+6, top+6, 6);                                // ER-EE sul palco
        push(RG, [[-w2,g0,rl],[w2,g0,rl],[w2,0,rl+300],[-w2,0,rl+300],[-w2,0,rl],[w2,0,rl]].map(W).flat(),
             [0,1,2, 0,2,3, 4,1,0, 4,5,1, 4,0,3, 5,2,1]);                            // ER-SE: cuneo a terra
        // appoggi: in cima e sotto ogni giunto tra le pedane
        const legZ = [80]; let acc = 0;
        for(let k=decksR.length-1;k>0;k--){ acc += decksR[k]; legZ.push(acc); }
        for(const lz of legZ){
          const yb = yAt(lz) - 90;
          for(const lx of [-w2+70, w2-70]) tube(RA, [lx,0,lz], [lx,Math.max(20,yb),lz], plan.rampFeet ? 30 : 24);
          if(!plan.rampFeet && yb > 250) tube(RA, [-w2+70,yb*0.45,lz], [w2-70,yb*0.45,lz], 14);   // traverso tra le gambe
        }
      }
    }
    if(RB.P.length) addBatch([rawMat(RB.P, RB.I, [0.06,0.06,0.07], 0.15)], [IDT]);
    if(RA.P.length) addBatch([rawMat(RA.P, RA.I, [0.80,0.82,0.86], 0.5)], [IDT]);
    if(RG.P.length) addBatch([rawMat(RG.P, RG.I, [0.56,0.57,0.59], 0.35)], [IDT]);

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

    // --- sala (pareti di fondo, sinistra e destra, pavimento): superfici piane grigio chiaro, appena più grandi del palco.
    // Le pareti stanno a filo del palco (30 mm), dietro scale e rampe; senza parete il pavimento sporge di 50 cm.
    const rm = cfg.room || {};
    roomClear = !!rm.clear;
    if(rm.back || rm.left || rm.right || rm.floor){
      const out = s => Math.max(rbySide[s] ? rl + 300 : 0, byside[s].length ? stairOut : 0);
      const GAP = 30, M = 500, WH = Math.max(3000, ty + 2500), WALL = [0.93,0.93,0.94];
      const x0 = -out('left') - (rm.left ? GAP : M), x1 = Wmm + out('right') + (rm.right ? GAP : M);
      const z0 = -out('back') - (rm.back ? GAP : M), z1 = Dmm + out('front') + M;
      // wall: normale verso l'interno e un punto della parete (se la vista è dietro la parete, la parete si vede in trasparenza)
      const surf = (P, color, wall) => Object.assign(rawMat(P, [0,1,2, 0,2,3], color, 0.05), {room:{wall}});
      const rs = [];
      if(rm.floor) rs.push(surf([x0,2,z0, x1,2,z0, x1,2,z1, x0,2,z1], [0.86,0.86,0.87], null));
      if(rm.back)  rs.push(surf([x0,0,z0, x1,0,z0, x1,WH,z0, x0,WH,z0], WALL, {n:[0,0,1], p:[0,0,z0]}));
      if(rm.left)  rs.push(surf([x0,0,z0, x0,0,z1, x0,WH,z1, x0,WH,z0], WALL, {n:[1,0,0], p:[x0,0,0]}));
      if(rm.right) rs.push(surf([x1,0,z0, x1,0,z1, x1,WH,z1, x1,WH,z0], WALL, {n:[-1,0,0], p:[x1,0,0]}));
      addBatch(rs, [IDT]);
    }

    // --- inquadratura
    // anche le rampe devono stare nell'inquadratura (l'ombra a terra resta quella del palco)
    const ext = s => rbySide[s] ? rl + 300 : 0, fr = [-ext('left'), -ext('back'), Wmm + ext('right'), Dmm + ext('front')];
    rect = [0,0,Wmm,Dmm]; roundR = plan.round ? Wmm/2 : 0;
    cam.target = [(fr[0]+fr[2])/2, (ty+90)/2, (fr[1]+fr[3])/2];
    stageR = Math.hypot(fr[2]-fr[0], fr[3]-fr[1])/2 + 600;
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
      gl.uniform4f(GU.rect, rect[0],rect[1],rect[2],rect[3]); gl.uniform3f(GU.ground, groundCol[0],groundCol[1],groundCol[2]); gl.uniform1f(GU.round, roundR);
      gl.uniform3f(GU.center, cam.target[0], stageR*5, cam.target[2]);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindVertexArray(groundMesh.vao); gl.drawElements(gl.TRIANGLES,6,gl.UNSIGNED_SHORT,0); gl.disable(gl.BLEND);
    }
    gl.useProgram(P); gl.uniformMatrix4fv(U.vp,false,vp); gl.uniform3f(U.eye,e[0],e[1],e[2]);
    // prima i pezzi opachi, poi quelli semitrasparenti senza scrivere la profondità: i pianali (modalità trasparente)
    // e le superfici della sala trasparenti. La parete che sta tra la vista e il palco non si disegna (come in una casa delle bambole).
    const hidden = m => m.room && m.room.wall && (e[0]-m.room.wall.p[0])*m.room.wall.n[0] + (e[2]-m.room.wall.p[2])*m.room.wall.n[2] < 0;
    const see = m => m.room ? roomClear : xray && m.top;
    gl.uniform1f(U.alpha, 1);
    let glass = false;
    for(const b of batches) for(const m of b.meshes){
      if(hidden(m)) continue;
      if(see(m)){ glass = true; continue; }
      gl.uniform3f(U.color,m.color[0],m.color[1],m.color[2]); gl.uniform1f(U.spec,m.spec);
      gl.bindVertexArray(m.vao); gl.drawElementsInstanced(gl.TRIANGLES, m.n, m.type, 0, b.count);
    }
    if(glass){
      // l'alfa del canvas resta 1: se no la pagina sotto schiarisce i pezzi trasparenti
      gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
      for(const b of batches) for(const m of b.meshes){
        if(!see(m) || hidden(m)) continue;
        const k = m.room ? 0.7 : 1;   // sala trasparente un po' più scura, se no sul fondo chiaro non si vede
        gl.uniform1f(U.alpha, m.room ? 0.3 : 0.16);
        gl.uniform3f(U.color,m.color[0]*k,m.color[1]*k,m.color[2]*k); gl.uniform1f(U.spec,0);
        gl.bindVertexArray(m.vao); gl.drawElementsInstanced(gl.TRIANGLES, m.n, m.type, 0, b.count);
      }
      gl.depthMask(true); gl.disable(gl.BLEND);
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
  // rotellina: senza Ctrl (o ⌘) scorre la pagina come altrove; lo zoom è con Ctrl + rotellina (il pizzico del touchpad
  // arriva già con Ctrl). Al primo giro senza Ctrl compare per un attimo l'avviso sopra la vista.
  let tip = null, tipT = 0;
  canvas.addEventListener('wheel', e => {
    if(!e.ctrlKey && !e.metaKey){
      if(!tip){
        tip = document.createElement('div');
        tip.textContent = 'Ctrl + rotellina per lo zoom';
        tip.style.cssText = 'position:absolute;left:50%;top:12px;transform:translateX(-50%);background:rgba(18,32,43,.78);color:#fff;font-size:13px;padding:5px 12px;border-radius:6px;pointer-events:none;transition:opacity .3s;opacity:0';
        const box = canvas.parentElement; if(getComputedStyle(box).position==='static') box.style.position = 'relative';
        box.appendChild(tip);
      }
      tip.style.opacity = '1'; clearTimeout(tipT); tipT = setTimeout(() => { tip.style.opacity = '0'; }, 1200);
      return;
    }
    e.preventDefault(); cam.userMoved = true; cam.dist = Math.min(cam.fit*4, Math.max(cam.fit*0.12, cam.dist*Math.exp(e.deltaY*0.001))); request();
  }, {passive:false});
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

  /* ---------- esportazione glTF binario (.glb): una mesh per geometria+colore, un nodo per ogni istanza ---------- */
  function glb(){
    const chunks = [], views = [], accessors = [], materials = [], meshes = [], nodes = [], matKey = new Map(), geo = new Map();
    let off = 0;
    const view = (arr, target) => {
      const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength), pad = (4 - bytes.length % 4) % 4;
      chunks.push(bytes); if(pad) chunks.push(new Uint8Array(pad));
      views.push({buffer:0, byteOffset:off, byteLength:bytes.length, target}); off += bytes.length + pad;
      return views.length - 1;
    };
    const material = (color, spec, alpha = 1) => {
      const k = color.map(v => v.toFixed(3)).join(',') + '|' + spec.toFixed(2) + '|' + alpha;
      if(!matKey.has(k)){
        materials.push(Object.assign({pbrMetallicRoughness:{baseColorFactor:[color[0],color[1],color[2],alpha], metallicFactor:Math.min(0.8, spec*0.9), roughnessFactor:Math.max(0.25, 1-spec*0.7)}, doubleSided:true}, alpha < 1 ? {alphaMode:'BLEND'} : {}));
        matKey.set(k, materials.length-1);
      }
      return matKey.get(k);
    };
    const geometry = m => {   // posizioni e indici condivisi tra lotti che usano gli stessi array
      const idx = m.idx32 || m.idx;
      if(geo.has(m.pos) && geo.get(m.pos).idx===idx) return geo.get(m.pos);
      const min = [Infinity,Infinity,Infinity], max = [-Infinity,-Infinity,-Infinity];
      for(let i=0;i<m.pos.length;i+=3) for(let k=0;k<3;k++){ const v = m.pos[i+k]; if(v<min[k]) min[k] = v; if(v>max[k]) max[k] = v; }
      const pos = Float32Array.from(m.pos);
      accessors.push({bufferView:view(pos, 34962), componentType:5126, count:pos.length/3, type:'VEC3', min, max});
      const pa = accessors.length - 1;
      const ix = m.idx32 ? Uint32Array.from(idx) : Uint16Array.from(idx);
      accessors.push({bufferView:view(ix, 34963), componentType: m.idx32 ? 5125 : 5123, count:ix.length, type:'SCALAR'});
      const g = {idx, pa, ia:accessors.length - 1};
      geo.set(m.pos, g); return g;
    };
    // pareti della sala sempre in trasparenza: negli altri programmi la vista gira libera e una parete piena coprirebbe il palco
    for(const b of batches){
      const prims = b.src.mats.filter(m => (m.idx32||m.idx).length).map(m => { const g = geometry(m); return {attributes:{POSITION:g.pa}, indices:g.ia, material:material(m.color, m.spec||0, m.room && (roomClear || m.room.wall) ? 0.3 : 1)}; });
      if(!prims.length) continue;
      meshes.push({primitives:prims});
      for(let i=0;i<b.count;i++) nodes.push({mesh:meshes.length-1, matrix:Array.from(b.src.data.subarray(i*16, i*16+16))});
    }
    // radice: millimetri -> metri
    const root = {name:'Palco', scale:[0.001,0.001,0.001], children:nodes.map((_,i) => i+1)};
    const json = {asset:{version:'2.0', generator:'StageDeck'}, scene:0, scenes:[{nodes:[0]}], nodes:[root, ...nodes],
      meshes, materials, accessors, bufferViews:views, buffers:[{byteLength:off}]};
    let js = new TextEncoder().encode(JSON.stringify(json));
    const jpad = (4 - js.length % 4) % 4; if(jpad){ const t = new Uint8Array(js.length + jpad).fill(0x20); t.set(js); js = t; }
    const total = 12 + 8 + js.length + 8 + off, out = new Uint8Array(total), dv = new DataView(out.buffer);
    dv.setUint32(0, 0x46546C67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
    dv.setUint32(12, js.length, true); dv.setUint32(16, 0x4E4F534A, true); out.set(js, 20);
    let p = 20 + js.length; dv.setUint32(p, off, true); dv.setUint32(p+4, 0x004E4942, true); p += 8;
    for(const c of chunks){ out.set(c, p); p += c.length; }
    return new Blob([out], {type:'model/gltf-binary'});
  }
  new ResizeObserver(resize).observe(canvas);
  theme(); resize();
  try{ matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => theme()); }catch(e){}
  function setXray(on){ xray = !!on; request(); }

  /* ---------- un solo pezzo su fondo bianco, alla misura voluta (per creare le illustrazioni del listino:
     tools/genera_immagini.js). spec: {kind:'deck', w, d, fam, black, topOnly} | {kind:'leg', h} |
     {kind:'rail', L, kick} | {kind:'step', h} | {kind:'part', name}; misure in mm ---------- */
  function item(spec){
    clearBatches();
    if(groundMesh){ gl.deleteVertexArray(groundMesh.vao); gl.deleteBuffer(groundMesh.pb); gl.deleteBuffer(groundMesh.ib); groundMesh = null; }
    let mats, T = IDT;
    if(spec.kind==='deck'){
      const sx = Math.min(spec.w,spec.d) - 1000, sz = Math.max(spec.w,spec.d) - 2000;
      const top = DECK_TOP[spec.fam] || DECK_TOP.hexa, frame = spec.black ? [0.10,0.10,0.11] : null;
      mats = stretched('deck', (x,y,z) => [x + (x>469 ? sx : 0), y, z + (z>0 ? sz : 0)], m => m.key==='64,64,64' ? top : (frame && m.key==='254,254,255' ? frame : null));
      if(spec.topOnly) mats = mats.filter((m,i) => PARTS.deck[i].key==='64,64,64');
    } else if(spec.kind==='leg'){
      const d = spec.h - 600; mats = stretched('leg', (x,y,z) => [x, y, z > 150 ? z + d : z]); T = {r:ZUP, t:[0,0,0]};
    } else if(spec.kind==='rail'){
      const base = spec.L > 1000 ? 'rail2' : 'rail1', cut = spec.L > 1000 ? 1000 : 450, d = spec.L - (spec.L > 1000 ? 2000 : 1000);
      mats = stretched(base, (x,y,z) => [x, y, z > cut ? z + d : z]);
      if(spec.kick) mats.push(rawMat(box([-24,0,-40],[-20,150,spec.L-60]), BOX_IDX, [0.80,0.82,0.86], 0.4));   // battipiede
    } else if(spec.kind==='step'){
      const src = spec.h <= 200 ? 20 : spec.h <= 400 ? 40 : 60, d = spec.h - src*10;
      mats = stretched('step'+src, (x,y,z) => [x, y, z > src*5 ? z + d : z]); T = {r:ZUP, t:[0,0,0]};
    } else if(spec.kind==='shape'){       // pedana sagomata (triangolo, quarto di cerchio): telaio in alluminio + piano
      const pts = spec.pts, top = DECK_TOP[spec.fam] || DECK_TOP.hexa;
      mats = [rawMat(...extrude(pts, 0, 72), [0.80,0.82,0.86], 0.5), rawMat(...extrude(pts, 72, 90), top, 0.15)];
    } else if(spec.kind==='tube'){        // tubo tondo o profilo quadro lungo x
      const g = spec.round ? cyl([0,0,0],[spec.L,0,0], spec.d/2) : [box([0,-spec.d/2,-spec.d/2],[spec.L,spec.d/2,spec.d/2]), BOX_IDX];
      mats = [rawMat(...g, spec.color || [0.80,0.82,0.86], 0.45)];
    } else if(spec.kind==='truss'){       // traliccio a 2 correnti con diagonali
      const L = spec.L, w = spec.w, r = spec.r || 24, col = spec.color || [0.80,0.82,0.86], P = [], I = [];
      const add = g => { const o = P.length/3; P.push(...g[0]); I.push(...g[1].map(i => i+o)); };
      add(cyl([0,0,0],[L,0,0], r)); add(cyl([0,w,0],[L,w,0], r));
      const n = Math.round(L/w); for(let k=0;k<n;k++) add(cyl([k*L/n,(k%2)*w,0],[(k+1)*L/n,((k+1)%2)*w,0], r*0.55));
      mats = [rawMat(P, I, col, 0.45)];
    } else if(spec.kind==='ramp'){        // rampa: cuneo con piano nero e fianchi in alluminio
      const L = spec.L, H = spec.H, W = spec.W, top = [[0,H,0],[L,0,0],[L,0,W],[0,H,W]];
      mats = [rawMat(top.flat(), [0,1,2,0,2,3], [0.10,0.10,0.11], 0.15),
              rawMat([0,0,0, L,0,0, 0,H,0, 0,0,W, L,0,W, 0,H,W, 0,0,0, 0,0,W, 0,H,W, 0,H,0], [0,1,2, 3,5,4, 6,7,8, 6,8,9], [0.80,0.82,0.86], 0.5)];
    } else mats = plain(spec.name);
    addBatch(mats, [T]);
    // inquadratura sul pezzo
    const mn = [Infinity,Infinity,Infinity], mx = [-Infinity,-Infinity,-Infinity];
    for(const m of mats) for(let i=0;i<m.pos.length;i+=3){ const v = mulV(T.r,[m.pos[i],m.pos[i+1],m.pos[i+2]]); for(let k=0;k<3;k++){ mn[k] = Math.min(mn[k],v[k]); mx[k] = Math.max(mx[k],v[k]); } }
    const r = Math.hypot(mx[0]-mn[0], mx[1]-mn[1], mx[2]-mn[2])/2;
    cam.target = [(mn[0]+mx[0])/2, (mn[1]+mx[1])/2, (mn[2]+mx[2])/2];
    cam.az = spec.az!=null ? spec.az : 0.62; cam.el = spec.el!=null ? spec.el : 0.42; cam.dist = cam.fit = r/Math.tan(0.31)*1.08; cam.userMoved = true;
    bg = [1,1,1]; dirty = true; draw();
  }
  // gambe tonde Ø 48,3 mm (disegni Everdeck): VRL tubo con tappo, VRLA con piedino regolabile, VRLT telescopica
  // (tubo esterno più grosso in basso, pomello di bloccaggio). In cima la gamba entra 20 mm nel telaio della pedana.
  function roundLegs(axes, ty, cfg){
    const A = mk(), K = mk(), r = 24.15;
    const tele = !!cfg.tele || !(+cfg.H >= 20 && +cfg.H <= 120 && +cfg.H % 10 === 0);
    for(const [x,z,tyA,teleA] of axes){
      const top = (tyA!=null ? tyA : ty) + 20;
      if(teleA!=null ? teleA : tele){
        const yb = Math.max(140, top*0.45);
        push(A, ...cyl([x,40,z], [x,yb,z], 30, 16)); push(A, ...cyl([x,yb-10,z], [x,top,z], r, 16));
        push(K, ...cyl([x,0,z], [x,40,z], 34, 16)); push(K, ...cyl([x+30,yb-60,z], [x+62,yb-60,z], 12, 8));
      } else if(cfg.legShape==='roundAdj'){
        push(A, ...cyl([x,45,z], [x,top,z], r, 16)); push(K, ...cyl([x,0,z], [x,14,z], 45, 18)); push(A, ...cyl([x,14,z], [x,45,z], 8, 8));
      } else {
        push(A, ...cyl([x,12,z], [x,top,z], r, 16)); push(K, ...cyl([x,0,z], [x,12,z], 26, 16));
      }
    }
    addBatch([rawMat(A.P, A.I, [0.80,0.82,0.86], 0.5)], [IDT]);
    addBatch([rawMat(K.P, K.I, [0.10,0.10,0.11], 0.15)], [IDT]);
  }
  // Spider Deck (disegni Everdeck 73-80): pianale spesso 55 mm su gambe a forbice, una ogni metro quadro (1×1:
  // 914 × 914 mm, 9 montanti, croci tra i montanti vicini); il pianale 2×1 ne ha due. Gambe in alluminio o nere.
  function spiderParts(plan, cfg, ty, topCol){
    const fr = mk(), tp = mk(), rs = mk(), y0 = ty + 35, y1 = ty + 90;
    const black = cfg.family==='spiderb', rcol = black ? [0.10,0.10,0.11] : [0.80,0.82,0.86];
    for(const d of plan.decks){
      const x0 = d.x*500 + 2, z0 = d.y*500 + 2, x1 = (d.x+d.w)*500 - 2, z1 = (d.y+d.h)*500 - 2;
      push(fr, ...extrude([[x0,z0],[x1,z0],[x1,z1],[x0,z1]], y0, y1 - 12, true));
      push(tp, ...extrude([[x0,z0],[x1,z0],[x1,z1],[x0,z1]], y1 - 12, y1, true));
      for(let cx = d.x; cx < d.x + d.w; cx += 2) for(let cz = d.y; cz < d.y + d.h; cz += 2){
        const ox = cx*500 + 43, oz = cz*500 + 43, s = 914/2, hR = y0;
        const P = []; for(let i=0;i<3;i++) for(let k=0;k<3;k++) P.push([ox + i*s, oz + k*s]);
        for(const [x,z] of P) push(rs, box([x-15,0,z-15],[x+15,hR,z+15]), BOX_IDX);
        const bar = (a, b) => { push(rs, ...cyl([a[0],30,a[1]], [b[0],hR-30,b[1]], 9, 6)); push(rs, ...cyl([b[0],30,b[1]], [a[0],hR-30,a[1]], 9, 6)); };
        for(let i=0;i<3;i++) for(let k=0;k<2;k++){ bar(P[i*3+k], P[i*3+k+1]); bar(P[k*3+i], P[(k+1)*3+i]); }
      }
    }
    addBatch([rawMat(fr.P, fr.I, black ? [0.10,0.10,0.11] : [0.80,0.82,0.86], 0.5)], [IDT]);
    addBatch([Object.assign(rawMat(tp.P, tp.I, topCol, 0.15), {top:true})], [IDT]);
    addBatch([rawMat(rs.P, rs.I, rcol, black ? 0.15 : 0.45)], [IDT]);
  }
  // parapetti StageDeck dai modelli CAD: rail2 (2 m), rail1 (1 m), 0,5 m = rail1 accorciato. Senza connettori: tolti i
  // pezzi piccoli tra 240 e 905 mm di altezza (farfalle, bulloni e pomelli dei 2 connettori). Battipiede: lamiera sul lato
  // interno, dal piano (y 26,5) a 15 cm.
  const noConnCache = new Map();
  function noConn(name){
    if(noConnCache.has(name)) return noConnCache.get(name);
    const out = PARTS[name].map(m => {
      const n = m.pos.length/3, par = Int32Array.from({length:n}, (_,i) => i), f = x => { while(par[x]!==x){ par[x] = par[par[x]]; x = par[x]; } return x; };
      const seen = new Map();
      for(let i=0;i<n;i++){ const k = m.pos[i*3].toFixed(1)+','+m.pos[i*3+1].toFixed(1)+','+m.pos[i*3+2].toFixed(1); if(seen.has(k)) par[f(i)] = f(seen.get(k)); else seen.set(k, i); }
      for(let t=0;t<m.idx.length;t+=3){ const a = f(m.idx[t]); par[f(m.idx[t+1])] = a; par[f(m.idx[t+2])] = a; }
      const bb = new Map();
      for(let i=0;i<n;i++){ const r = f(i), y = m.pos[i*3+1], z = m.pos[i*3+2], b = bb.get(r) || [Infinity,-Infinity,Infinity,-Infinity];
        b[0] = Math.min(b[0],y); b[1] = Math.max(b[1],y); b[2] = Math.min(b[2],z); b[3] = Math.max(b[3],z); bb.set(r, b); }
      const drop = r => { const b = bb.get(r); return b[0] >= 240 && b[1] <= 905 && b[1]-b[0] <= 60 && b[3]-b[2] <= 220; };
      const idx = []; for(let t=0;t<m.idx.length;t+=3) if(!drop(f(m.idx[t]))) idx.push(m.idx[t], m.idx[t+1], m.idx[t+2]);
      return {...m, idx:new Uint16Array(idx)};
    });
    noConnCache.set(name, out); return out;
  }
  function railMats(Lm, kick, conn){
    const name = Lm===2 ? 'rail2' : 'rail1', short = Lm===0.5;
    const mats = (conn ? PARTS[name] : noConn(name)).filter(m => m.idx.length).map(m => {
      const c = colorOf(m);
      let pos = m.pos;
      if(short){ pos = new Float32Array(m.pos); for(let i=2;i<pos.length;i+=3) if(pos[i] > 450) pos[i] -= 500; }   // 0,5 m: quello da 1 m accorciato
      return {pos, idx:m.idx, color:c.color, spec:c.spec};
    });
    if(kick) mats.push(rawMat(box([-24,26.5,-40],[-20,176.5, Lm===2 ? 1940 : Lm===1 ? 940 : 440]), BOX_IDX, [0.80,0.82,0.86], 0.4));
    return mats;
  }
  // parapetto Spider VH-2 / VH-1 (disegni Everdeck 81-82): telaio in tubo con gli angoli in alto curvati, traverso
  // a metà, morsetti in basso; alto 1026 mm, lungo 1980 o 980. Coordinate come i modelli dei parapetti (y=26,5: piano)
  function spiderRail(L){
    const x = -22, z0 = -40, z1 = L - 60, yd = 26.5, top = yd + 1000, R = 90, P = [], I = [];
    const add = g => { const o = P.length/3; P.push(...g[0]); I.push(...g[1].map(i => i+o)); };
    const a = z0 + 15, b = z1 - 15;
    add(cyl([x,-80,a],[x,top-R,a], 19, 12)); add(cyl([x,-80,b],[x,top-R,b], 19, 12));
    add(cyl([x,top,a+R],[x,top,b-R], 19, 12)); add(cyl([x,yd+480,a],[x,yd+480,b], 16, 10));
    for(const [zc, dir] of [[a+R, -1], [b-R, 1]]){            // curve in alto
      const pts = []; for(let k=0;k<=4;k++){ const t = k/4*Math.PI/2; pts.push([x, top-R + R*Math.sin(t), zc + dir*R*Math.cos(t)]); }
      for(let k=0;k<4;k++) add(cyl(pts[k], pts[k+1], 19, 12));
    }
    for(const zp of [a, b]) add([box([x-38,-60,zp-30],[x+20,0,zp+30]), BOX_IDX]);   // morsetti sul bordo
    return [rawMat(P, I, [0.80,0.82,0.86], 0.5)];
  }
  // parapetto di sicurezza VHX (dalle immagini Everdeck/GlobalTruss): corrimano tondo in alto, due montanti quadri,
  // traverso basso e montanti tondi ogni ~11 cm, tubo quadro di base sotto il bordo; alto 115 cm sul piano; misure in mm
  function vhxMats(L){
    const z0 = -40, z1 = L - 60, x = -22, P = [], I = [];
    const add = g => { const o = P.length/3; P.push(...g[0]); I.push(...g[1].map(i => i+o)); };
    add(cyl([x,1060,z0],[x,1060,z1], 24));
    add([box([x-12,140,z0+20],[x+12,165,z1-20]), BOX_IDX]);
    add([box([x-20,-70,z0+60],[x+20,-30,z1-60]), BOX_IDX]);
    const posts = [z0+0.09*(z1-z0), z1-0.09*(z1-z0)];
    for(const zp of posts) add([box([x-25,-90,zp-25],[x+25,1040,zp+25]), BOX_IDX]);
    const n = Math.round((z1-z0)/115);
    for(let k=1;k<n;k++){ const zb = z0 + k*(z1-z0)/n; if(posts.some(zp => Math.abs(zb-zp) < 45)) continue; add(cyl([x,160,zb],[x,1040,zb], 8, 8)); }
    return [rawMat(P, I, [0.09,0.09,0.10], 0.35)];
  }
  const box = (a,b) => [a[0],a[1],a[2], b[0],a[1],a[2], b[0],b[1],a[2], a[0],b[1],a[2], a[0],a[1],b[2], b[0],a[1],b[2], b[0],b[1],b[2], a[0],b[1],b[2]];
  // prisma da un poligono convesso in pianta [[x,z],...] tra le quote y0 e y1
  function extrude(pts, y0, y1, caps=true){   // caps=false: solo le pareti (telaio aperto sotto e sopra)
    const n = pts.length, P = [], I = [];
    for(const [x,z] of pts) P.push(x,y0,z); for(const [x,z] of pts) P.push(x,y1,z);
    if(caps) for(let i=1;i<n-1;i++){ I.push(0,i,i+1); I.push(n,n+i+1,n+i); }
    for(let i=0;i<n;i++){ const j = (i+1)%n; I.push(i,j,n+j, i,n+j,n+i); }
    return [P, I];
  }
  function cyl(a, b, r, seg=18){       // cilindro dall'asse a -> b
    const d = [b[0]-a[0],b[1]-a[1],b[2]-a[2]], L = Math.hypot(...d), u = d.map(v => v/L);
    const t = Math.abs(u[1]) < 0.9 ? [0,1,0] : [1,0,0];
    const v1 = [u[1]*t[2]-u[2]*t[1], u[2]*t[0]-u[0]*t[2], u[0]*t[1]-u[1]*t[0]], l1 = Math.hypot(...v1); for(let k=0;k<3;k++) v1[k] /= l1;
    const v2 = [u[1]*v1[2]-u[2]*v1[1], u[2]*v1[0]-u[0]*v1[2], u[0]*v1[1]-u[1]*v1[0]];
    const P = [], I = [];
    for(let i=0;i<seg;i++){ const an = i/seg*Math.PI*2, c = Math.cos(an)*r, s = Math.sin(an)*r;
      for(const e of [a,b]) P.push(e[0]+v1[0]*c+v2[0]*s, e[1]+v1[1]*c+v2[1]*s, e[2]+v1[2]*c+v2[2]*s); }
    for(let i=0;i<seg;i++){ const j = (i+1)%seg; I.push(i*2, j*2, j*2+1, i*2, j*2+1, i*2+1); }
    return [P, I];
  }
  const BOX_IDX = [0,1,2,0,2,3, 4,6,5,4,7,6, 0,4,5,0,5,1, 3,2,6,3,6,7, 1,5,6,1,6,2, 0,3,7,0,7,4];
  return {build, resize, theme, reset, png, glb, request, cam, setXray, item};
}
window.StageView = {create};
})();
