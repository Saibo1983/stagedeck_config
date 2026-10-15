#!/usr/bin/env node
/* Crea le illustrazioni degli articoli che non hanno una foto, dai modelli 3D CAD dell'app (models3d.js),
   allungati alla misura dell'articolo, e le mette in una cartella da passare a importa_immagini.py.

   Uso:  node tools/genera_immagini.js cartella_uscita
         python3 tools/importa_immagini.py cartella_uscita
   Serve Playwright con Chromium (npm i playwright). Gli articoli che hanno già un'immagine in img/ vengono saltati. */
const fs = require('fs'), path = require('path');
let chromium;
try{ ({chromium} = require('playwright')); }catch(e){ ({chromium} = require('/opt/node22/lib/node_modules/playwright')); }

const ROOT = path.resolve(__dirname, '..');
const D = (w, d, extra) => Object.assign({kind:'deck', w, d}, extra);
// codice -> pezzo da disegnare (mm)
const SPEC = {
  'VS750H-2,1x1,2':D(2100,1200), 'VS750H-2x1,2':D(2000,1200), 'VS750H-2x0,95':D(2000,950), 'VS750H-2x0,9':D(2000,900),
  'VS750H-2x0,85':D(2000,850), 'VS750H-1x1,5':D(1000,1500), 'VS750H-1,5x1':D(1500,1000), 'VS750H-1,45x1':D(1450,1000),
  'VS750H-1x0,95':D(1000,950), 'VS750H-2x0,35':D(2000,350), 'VS750H-1,2x0,5':D(1200,500), 'VS750H-1x0,35':D(1000,350),
  'VS750H-0,5x0,5':D(500,500), 'VS750H-1×1':D(1000,1000),
  'VS750W-0,5x0,5':D(500,500,{fam:'wood'}), 'VS750W-1,5x0,5':D(1500,500,{fam:'wood'}),
  'VS750BL-2x1':D(2000,1000,{black:true}), 'HPL-2x1':D(2000,1000,{topOnly:true}),
  'VFL25':{kind:'leg', h:250}, 'VFL70':{kind:'leg', h:700},
  'VH0.5':{kind:'rail', L:500}, 'VH1.45':{kind:'rail', L:1450}, 'VH1.5':{kind:'rail', L:1500},
  'VHK1.0':{kind:'rail', L:1000, kick:true}, 'VHK1.5':{kind:'rail', L:1500, kick:true}, 'VHK2.0':{kind:'rail', L:2000, kick:true},
  'VSM17,5':{kind:'step', h:175}, 'VSM35':{kind:'step', h:350}, 'VSM52,5':{kind:'step', h:525},
  'VLC':{kind:'part', name:'vlc', el:0.5},
  // forme generate (non ci sono modelli CAD): pedane sagomate, tubi, profili, traliccio, rampe
  'PROFILO-5M':{kind:'tube', L:5000, d:60, az:0.35, el:0.3}, 'TAPPO-PLASTICA':{kind:'tube', L:20, d:60, color:[0.08,0.08,0.09], az:1.2},
  'VAP1.0':{kind:'tube', L:1000, d:70, az:0.45}, 'VAP2.0':{kind:'tube', L:2000, d:70, az:0.4},
  'E31-400':{kind:'tube', L:4000, d:50, round:true, az:0.35, el:0.3}, 'E32-300B':{kind:'tube', L:3000, d:50, round:true, color:[0.09,0.09,0.1], az:0.35, el:0.3},
  'E32-400BM8':{kind:'truss', L:4000, w:290, az:0.25, el:0.35},
  'VRP20':{kind:'ramp', L:2000, H:200, W:1000}, 'VRP40':{kind:'ramp', L:3000, H:400, W:1000}, 'VRP60':{kind:'ramp', L:2000, H:600, W:1000}
};
// pedane sagomate: contorno in pianta (mm)
const tri = (w, d, left) => left ? [[0,0],[w,0],[0,d]] : [[0,0],[w,0],[w,d]];
const quarter = r => { const p = [[0,0]]; for(let i=0;i<=24;i++){ const a = i/24*Math.PI/2; p.push([Math.cos(a)*r, Math.sin(a)*r]); } return p; };
for(const [pre, fam] of [['VS750H','hexa'], ['VS750W','wood'], ['PT750H','hexa'], ['PT750W','hexa']]){
  const x = pre.startsWith('PT') ? 'X' : 'x';
  SPEC[`${pre}-2${x}1T-R`] = {kind:'shape', fam, pts:tri(2000,1000,false)};
  SPEC[`${pre}-2${x}1T-L`] = {kind:'shape', fam, pts:tri(2000,1000,true)};
  SPEC[`${pre}-1${x}1T`] = {kind:'shape', fam, pts:tri(1000,1000,true)};
  SPEC[`${pre}-1${x}1C`] = {kind:'shape', fam, pts:quarter(1000)};
}
SPEC['PT750H-0,5x0,5'] = D(500,500); SPEC['PT750W-0,5x0,5'] = D(500,500);

(async () => {
  const out = process.argv[2];
  if(!out){ console.error('Uso: node tools/genera_immagini.js cartella_uscita'); process.exit(1); }
  fs.mkdirSync(out, {recursive:true});
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const cat = JSON.parse(html.match(/id="catalog">([\s\S]*?)<\/script>/)[1].replace(/<\\\//g, '</'));
  const norm = c => String(c).replace(/\s+/g,'').replace(/×/g,'x').toUpperCase();
  const have = new Set(cat.items.filter(i => i.img).map(i => norm(i.code)));
  const todo = Object.entries(SPEC).filter(([c]) => !have.has(norm(c)) && cat.items.some(i => norm(i.code)===norm(c)));
  if(!todo.length){ console.log('Nessuna immagine da creare.'); return; }
  const b = await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
  const p = await b.newPage({viewport:{width:900, height:900}});
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.setContent('<body style="margin:0;background:#fff"><canvas id="c" style="width:900px;height:900px;display:block"></canvas></body>');
  await p.addScriptTag({path:path.join(ROOT,'models3d.js')});
  await p.addScriptTag({path:path.join(ROOT,'viewer3d.js')});
  await p.evaluate(() => { window.V = window.StageView.create(document.getElementById('c')); });
  for(const [code, spec] of todo){
    const data = await p.evaluate(async s => { V.item(s); await new Promise(r => requestAnimationFrame(r)); V.item(s); return document.getElementById('c').toDataURL('image/png'); }, spec);
    fs.writeFileSync(path.join(out, code + '.png'), Buffer.from(data.split(',')[1], 'base64'));
    console.log('creata', code);
  }
  await b.close();
  if(errs.length) console.error(errs.join('\n'));
})();
