#!/usr/bin/env python3
"""Aggiorna il listino dentro index.html a partire dal file Excel Everdeck.

Uso:  python3 tools/aggiorna_listino.py listino.xlsx [rampe.xlsx]
Legge il foglio "Tabelle1" del listino (e, se c'e', un file rampe con un foglio per altezza)
e riscrive il blocco <script id="catalog"> di index.html.
"""
import json
import re
import sys
from pathlib import Path

import openpyxl

FOGLIO = "Tabelle1"
# Correzioni a errori evidenti del file (codice normalizzato -> campi da sovrascrivere)
CORREZIONI = {
    "VS75PB-1X1": {"pack": [1005, 1005, 100]},  # nel file l'imballo 1x1 e' 2005x1005x100
    # Spider deck: spessore imballo 60 mm (confermato dall'utente; nel file e' 600)
    "SPHA-2X1": {"pack": [2050, 1050, 60]}, "SPHB-2X1": {"pack": [2050, 1050, 60]},
    "SPHA-1X1": {"pack": [1050, 1050, 60]}, "SPHB-1X1": {"pack": [1050, 1050, 60]},
}
DIM = re.compile(r"^\s*(\d+)\s*[x×]\s*(\d+)\s*[x×]\s*(\d+)\s*$", re.I)


def norm(code):
    return re.sub(r"\s+", "", code).replace("×", "x").upper()


def dims(v):
    m = DIM.match(v) if isinstance(v, str) else None
    return [int(m.group(i)) for i in (1, 2, 3)] if m else None


def num(v):
    return float(v) if isinstance(v, (int, float)) else None


def parse(xlsx):
    ws = openpyxl.load_workbook(xlsx, data_only=True)[FOGLIO]
    items, seen, sezione = [], set(), ""
    for r in range(1, ws.max_row + 1):
        code, name, price, pkgprice, kg, pdim, p1, p2 = (ws.cell(r, c).value for c in (3, 4, 5, 6, 7, 9, 10, 11))
        name = str(name).strip() if name else ""
        code = str(code).strip() if code else ""
        if code == "Product Code":
            continue
        if not code and name and price is None and kg is None:
            sezione = name
            continue
        if not name or num(price) is None:
            continue
        if code.upper().startswith(("PSP", "VSP")):  # teli: il codice 1000x2050 pleated e' scritto 1000x1050 nel file
            mm = re.search(r"(\d+x\d+)\s*$", name)
            if mm:
                code = re.sub(r"\d+x\d+\s*$", mm.group(1), code)
        if not code:  # righe senza codice nel file (profilo 5 m, tappo)
            code = "PROFILO-5M" if "profile" in name.lower() else "TAPPO-PLASTICA"
        key = norm(code)
        if key in seen:
            continue
        seen.add(key)
        item = {
            "code": code,
            "name": re.sub(r"\s+", " ", name),
            "section": sezione,
            "price": round(num(price), 2),
            "kg": num(kg),
            "pack": dims(p1) or dims(p2),
        }
        # Articoli venduti in confezione (gambe x4, connettori x3): "Package price" = n x prezzo unitario.
        # Peso e imballo del file sono della confezione, il prezzo unitario e' per pezzo.
        if num(pkgprice) and num(price) and dims(p2) and not dims(p1):
            n = num(pkgprice) / num(price)
            if n > 1.05 and abs(n - round(n)) < 0.05:
                item["pkg"] = int(round(n))
        item.update(CORREZIONI.get(key, {}))
        items.append(item)
    return items


def parse_rampe(xlsx, gia):
    """Ogni foglio e' un kit rampa: righe con codice, descrizione, quantita', prezzo."""
    wb = openpyxl.load_workbook(xlsx, data_only=True)
    articoli, kit = [], []
    for ws in wb:
        numeri = [int(n) for n in re.findall(r"\d+", ws.title)]
        if not numeri:
            continue
        parti = []
        for r in range(1, ws.max_row + 1):
            code, desc, qty, price = (ws.cell(r, c).value for c in (2, 3, 4, 5))
            if not code or code == "Part number" or num(price) is None or num(qty) is None:
                continue
            code = str(code).strip()
            parti.append({"code": code, "qty": int(num(qty))})
            key = norm(code)
            if key not in gia:
                gia.add(key)
                articoli.append({"code": code, "name": re.sub(r"\s+", " ", str(desc).strip()), "section": "RAMPE",
                                 "price": round(num(price), 2), "kg": None, "pack": None})
        kit.append({"name": ws.title.strip(), "lo": numeri[0], "hi": numeri[-1], "parts": parti})
    return articoli, kit


def main():
    if len(sys.argv) not in (2, 3):
        sys.exit(__doc__)
    xlsx = Path(sys.argv[1])
    items = parse(xlsx)
    kit = []
    if len(sys.argv) == 3:
        extra, kit = parse_rampe(sys.argv[2], {norm(i["code"]) for i in items})
        items += extra
    m = re.search(r"\d{4}\.\d{2}", xlsx.stem)
    label = f"Everdeck STAGEDECKS {m.group(0)}" if m else xlsx.stem
    # i prezzi NON vanno nel repository: restano in prezzi.json (ignorato da git)
    prezzi = {norm(i["code"]): i["price"] for i in items}
    for i in items:
        i.pop("price", None)
    (Path(__file__).resolve().parent.parent / "prezzi.json").write_text(
        json.dumps({"listino": label, "prezzi": prezzi}, ensure_ascii=False, indent=0), encoding="utf-8")
    payload = json.dumps({"listino": label, "items": items, "rampKits": kit}, ensure_ascii=False, separators=(",", ":"))
    payload = payload.replace("</", "<\\/")
    html_path = Path(__file__).resolve().parent.parent / "index.html"
    html = html_path.read_text(encoding="utf-8")
    pat = re.compile(r'(<script type="application/json" id="catalog">)(.*?)(</script>)', re.S)
    if not pat.search(html):
        sys.exit("Blocco catalog non trovato in index.html")
    html_path.write_text(pat.sub(lambda mo: mo.group(1) + payload + mo.group(3), html, count=1), encoding="utf-8")
    print(f"{len(items)} articoli scritti in index.html ({label}), senza prezzi.")
    print("Prezzi salvati in prezzi.json: NON caricarlo su GitHub, caricalo nell'app (scheda Listino).")


if __name__ == "__main__":
    main()
