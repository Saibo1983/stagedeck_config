#!/usr/bin/env python3
"""Importa le illustrazioni degli articoli nella cartella img/ e le collega al catalogo di index.html.

Uso:  python3 tools/importa_immagini.py immagini.zip   (oppure una cartella con le immagini)
Serve:  pip install pillow
Ogni immagine viene abbinata all'articolo con lo stesso nome della colonna «Product Photo Name» del listino
(oppure con lo stesso codice), ridotta a 600 px sul lato lungo e salvata come JPG in img/.
Le immagini che non corrispondono a nessun articolo vengono elencate e non copiate.
"""
import io
import json
import re
import sys
import zipfile
from pathlib import Path

from PIL import Image, ImageChops, ImageOps

sys.path.insert(0, str(Path(__file__).resolve().parent))
from aggiorna_listino import IMG_DIR, assegna_immagini, foto_key, img_file, norm, rampe_immagini  # noqa: E402

LATO = 600
# Immagini con un nome diverso dal codice: nome del file (normalizzato) -> codici a cui va
ALIAS = {
    "VS750P-2X1B": ["VS750PB-2x1"], "VS750P-2X1M": ["VS750PM-2x1"], "VS750P-2X1T": ["VS750PT-2x1"],
    "VS750P-1X1T": ["VS750PT-1x1"], "VS75P-1X1B": ["VS75PB-1x1"], "VS75P-1X1M": ["VS750PM-1x1"],
    "VASH": ["VASH-L", "VASH-R"],
    "VLC0-48MM": ["VLCO-48MM"],  # nel file c'e' lo zero al posto della O
    "ROLLRISER": ["RR30-1", "RR30-2", "RR30-4", "RR40-1", "RR40-2", "RR40-4"],
}
# Articoli aggiunti dall'app (non nel listino Excel): l'immagine si salva in img/ e index.html la indica nel campo «img»
AGGIUNTI_APP = {"VH0.5", "VHK0.5", "VHX2.0", "VHX1.0", "VHXC", "VHXCC"}
EST = re.compile(r"\.(jpe?g|png|webp)$", re.I)
# Articoli senza foto quasi uguali a un altro che ce l'ha: codice senza foto -> codice di cui usare la foto
SIMILI = {
    "VS750H-2×1RC": "VS750H-2×1", "VS750H-1×1RC": "VS750H-1×1", "VS750H-2×0,5RC": "VS750H-2×0,5", "VS750H-1x0,5RC": "VS750H-1x0,5",
    "VTL30": "VTL40", "VTL30-40": "VTL40",
    "VSP-S 200x405": "VSP-S 200x1050", "VSP-P 200x400": "VSP-P 200x1050",
    "VSP-P 700x1050": "VSP-P 600x1050", "VSP-P 700x2050": "VSP-P 600x2050",
    "SKP320": "SKP470", "SKBP470": "SKP470", "SKBP970": "SKP970", "SKBP1970": "SKP1970",
}
# Immagini delle rampe per altezza: «20.jpg» (rampa da sola), «20cm e palco.jpg» (rampa montata al palco)
RAMPA = re.compile(r"^(\d{2,3})\s*(?:cm)?\s*(e\s*palco)?\.(?:jpe?g|png|webp)$", re.I)
HTML = Path(__file__).resolve().parent.parent / "index.html"
PAT = re.compile(r'(<script type="application/json" id="catalog">)(.*?)(</script>)', re.S)


def sorgenti(path):
    p = Path(path)
    if p.is_dir():
        for f in sorted(p.rglob("*")):
            if f.is_file() and EST.search(f.name):
                yield f.name, f.read_bytes()
    else:
        with zipfile.ZipFile(p) as z:
            for n in sorted(z.namelist()):
                name = n.rsplit("/", 1)[-1]
                if EST.search(name) and not name.startswith("._") and "__MACOSX" not in n:
                    yield name, z.read(n)


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    html = HTML.read_text(encoding="utf-8")
    m = PAT.search(html)
    cat = json.loads(m.group(2).replace("<\\/", "</"))
    chiavi = {i.get("foto") for i in cat["items"]} | {norm(i["code"]) for i in cat["items"]}
    chiavi.discard(None)
    chiavi |= AGGIUNTI_APP
    IMG_DIR.mkdir(exist_ok=True)
    salvate, scartate = 0, []
    for name, data in sorgenti(sys.argv[1]):
        key = foto_key(name)
        mr = RAMPA.match(name)
        dest = [f"RAMPA-{int(mr.group(1))}" + ("-PALCO" if mr.group(2) else "")] if mr else \
            [key] if key in chiavi else [norm(c) for c in ALIAS.get(key, [])]
        if not dest:
            scartate.append(name)
            continue
        im = ImageOps.exif_transpose(Image.open(io.BytesIO(data)))
        if im.mode in ("RGBA", "LA", "P"):
            im = im.convert("RGBA")
            fondo = Image.new("RGB", im.size, "white")
            fondo.paste(im, mask=im.split()[-1])
            im = fondo
        im = im.convert("RGB")
        # toglie il bordo bianco intorno al pezzo (con un piccolo margine), cosi' la miniatura e' piena
        box = ImageChops.difference(im, Image.new("RGB", im.size, "white")).convert("L").point(lambda v: 255 if v > 12 else 0).getbbox()
        if box:
            m = int(max(box[2] - box[0], box[3] - box[1]) * 0.04)
            im = im.crop((max(0, box[0] - m), max(0, box[1] - m), min(im.width, box[2] + m), min(im.height, box[3] + m)))
        im.thumbnail((LATO, LATO), Image.LANCZOS)
        for k in dest:
            im.save(IMG_DIR / img_file(k), "JPEG", quality=82, optimize=True, progressive=True)
            salvate += 1
    n = assegna_immagini(cat["items"])
    by = {norm(i["code"]): i for i in cat["items"]}
    for dst, src in SIMILI.items():
        d, s_ = by.get(norm(dst)), by.get(norm(src))
        if d is not None and not d.get("img") and s_ is not None and s_.get("img"):
            (IMG_DIR / img_file(norm(dst))).write_bytes((IMG_DIR / s_["img"]).read_bytes())
            salvate += 1
    n = assegna_immagini(cat["items"])
    cat["rampImgs"] = rampe_immagini()
    payload = json.dumps(cat, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    HTML.write_text(PAT.sub(lambda mo: mo.group(1) + payload + mo.group(3), html, count=1), encoding="utf-8")
    print(f"{salvate} immagini salvate in img/, {n} articoli del catalogo con immagine.")
    senza = sorted({i["code"] for i in cat["items"] if not i.get("img") and i.get("section") != "RAMPE"})
    if scartate:
        print(f"{len(scartate)} immagini senza articolo corrispondente (non copiate): {', '.join(scartate)}")
    if senza:
        print(f"{len(senza)} articoli ancora senza immagine: {', '.join(senza)}")
    print("Ricordati di cambiare VERSION in sw.js.")


if __name__ == "__main__":
    main()
