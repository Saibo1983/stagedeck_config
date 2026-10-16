#!/usr/bin/env python3
"""Importa le descrizioni degli articoli (italiano o tedesco) dentro index.html.

Uso:  python3 tools/importa_descrizioni.py lista_con_descrizione.xlsx
      python3 tools/importa_descrizioni.py lista_con_descrizione_in_tedesco.xlsx
Legge il primo foglio (colonne: codice, denominazione, descrizione). La lingua si riconosce dall'intestazione:
«Codice / Denominazione / Descrizione (it)» = italiano, «Kode / Bezeichnung / Beschreibung (de)» = tedesco.
Riscrive il blocco <script id="descrizioni"> di index.html: codice normalizzato ->
  {"cod": codice originale della lista, "nome", "desc"  (italiano), "nome_de", "desc_de"  (tedesco)}.
Le descrizioni gia' presenti restano: quelle del file nuovo le aggiungono o le sostituiscono (la lista puo' essere parziale),
e l'altra lingua non viene toccata. Le voci importate prendono il posto di quelle generate da genera_descrizioni.py.
E' una tabella separata dal catalogo, cosi' aggiorna_listino.py non la tocca.
Niente prezzi: questo blocco puo' stare nel repository.
"""
import json
import re
import sys
from pathlib import Path

import openpyxl

HTML = Path(__file__).resolve().parent.parent / "index.html"
PAT = re.compile(r'(<script type="application/json" id="descrizioni">)(.*?)(</script>)', re.S)
CAT = re.compile(r'<script type="application/json" id="catalog">.*?</script>', re.S)
# Codici della lista scritti diversamente dal listino (codice normalizzato -> codici del listino)
ALIAS = {
    "VSM200": ["VSM20"], "VSM400": ["VSM40"], "VSM600": ["VSM60"], "VSM800": ["VSM80"],  # gradini: mm nella lista, cm nel listino
    "VASH": ["VASH-R", "VASH-L"],                    # corrimano scala regolabile, destro e sinistro
    "VS750H-2X1T": ["VS750H-2x1T-R", "VS750H-2x1T-L"],  # pedana triangolare, destra e sinistra
    "VSP-S200X400": ["VSP-S 200x405"],               # telo velluto 20x40,5 cm
}
# campi per lingua: nome, descrizione, marca «generata»
CAMPI = {"it": ("nome", "desc", "auto"), "de": ("nome_de", "desc_de", "auto_de")}


def norm(code):
    return re.sub(r"\s+", "", str(code)).replace("×", "x").upper()


def pulisci(t):
    """Spazi a fine riga e righe vuote in fondo tolti, al massimo una riga vuota di fila."""
    righe = [r.rstrip() for r in str(t or "").replace("\r", "").split("\n")]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(righe)).strip()


def lingua(intestazione):
    t = " ".join(str(v or "") for v in intestazione).lower()
    if "(de)" in t or "kode" in t or "beschreibung" in t:
        return "de"
    return "it"


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    ws = openpyxl.load_workbook(sys.argv[1], data_only=True).worksheets[0]
    righe = list(ws.iter_rows(values_only=True))
    lg = lingua(righe[0] if righe else [])
    k_nome, k_desc, k_auto = CAMPI[lg]
    html = HTML.read_text(encoding="utf-8")
    vecchio = PAT.search(html)
    desc = json.loads(vecchio.group(2).replace("<\\/", "</")) if vecchio else {}
    cat = json.loads(CAT.search(html).group(0).split(">", 1)[1].rsplit("<", 1)[0].replace("<\\/", "</"))
    listino = {norm(i["code"]) for i in cat["items"]}
    nuovi, fuori = 0, []
    for r, row in enumerate(righe):
        code, nome, testo = (list(row) + [None] * 3)[:3]
        if not code or r == 0 and str(code).strip().lower() in ("codice", "kode", "code"):
            continue
        nome, testo = pulisci(nome), pulisci(testo)
        if not nome and not testo:
            continue
        chiavi = [norm(c) for c in ALIAS.get(norm(code), [code])]
        for k in chiavi:
            v = desc.setdefault(k, {})
            v["cod"] = str(code).strip()  # codice come scritto nella lista
            v[k_nome], v[k_desc] = nome, testo
            v.pop(k_auto, None)
            nuovi += 1
        if not any(k in listino for k in chiavi):
            fuori.append(str(code).strip())
    payload = json.dumps(dict(sorted(desc.items())), ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    blocco = f'<script type="application/json" id="descrizioni">{payload}</script>'
    if vecchio:
        html = PAT.sub(lambda m: blocco, html, count=1)
    else:  # prima volta: subito dopo il catalogo
        m = CAT.search(html)
        html = html[:m.end()] + "\n" + blocco + html[m.end():]
    HTML.write_text(html, encoding="utf-8")
    print(f"Lingua: {'tedesco' if lg == 'de' else 'italiano'}. {nuovi} descrizioni importate, {len(desc)} voci in index.html.")
    if fuori:
        print(f"Non nel listino (tenute per quando ci saranno): {', '.join(fuori)}")
    senza = sorted(i["code"] for i in cat["items"] if not (desc.get(norm(i["code"])) or {}).get(k_desc))
    print(f"Articoli del listino senza descrizione in questa lingua: {len(senza)} di {len(cat['items'])}"
          " (rilancia tools/genera_descrizioni.py per comporle).")
    print("Ora cambia VERSION in sw.js.")


if __name__ == "__main__":
    main()
