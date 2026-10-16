#!/usr/bin/env python3
"""Importa le descrizioni in italiano degli articoli dentro index.html.

Uso:  python3 tools/importa_descrizioni.py lista_con_descrizione.xlsx
Legge il primo foglio (colonne: Codice, Denominazione, Descrizione (it)) e riscrive il blocco
<script id="descrizioni"> di index.html: codice normalizzato -> {"cod": codice originale della lista, "nome": denominazione, "desc": descrizione}.
Le descrizioni gia' presenti restano: quelle del file nuovo le aggiungono o le sostituiscono (la lista puo' essere parziale).
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


def norm(code):
    return re.sub(r"\s+", "", str(code)).replace("×", "x").upper()


def pulisci(t):
    """Spazi a fine riga e righe vuote in fondo tolti, al massimo una riga vuota di fila."""
    righe = [r.rstrip() for r in str(t or "").replace("\r", "").split("\n")]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(righe)).strip()


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    ws = openpyxl.load_workbook(sys.argv[1], data_only=True).worksheets[0]
    html = HTML.read_text(encoding="utf-8")
    vecchio = PAT.search(html)
    desc = json.loads(vecchio.group(2).replace("<\\/", "</")) if vecchio else {}
    cat = json.loads(CAT.search(html).group(0).split(">", 1)[1].rsplit("<", 1)[0].replace("<\\/", "</"))
    listino = {norm(i["code"]) for i in cat["items"]}
    nuovi, fuori = 0, []
    for r, row in enumerate(ws.iter_rows(values_only=True)):
        code, nome, testo = (list(row) + [None] * 3)[:3]
        if not code or r == 0 and str(code).strip().lower() == "codice":
            continue
        voce = {"cod": str(code).strip(), "nome": pulisci(nome), "desc": pulisci(testo)}  # cod: codice come scritto nella lista
        if not voce["nome"] and not voce["desc"]:
            continue
        chiavi = [norm(c) for c in ALIAS.get(norm(code), [code])]
        for k in chiavi:
            desc[k] = voce
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
    print(f"{nuovi} descrizioni importate, {len(desc)} in tutto in index.html.")
    if fuori:
        print(f"Non nel listino (tenute per quando ci saranno): {', '.join(fuori)}")
    senza = sorted(i["code"] for i in cat["items"] if norm(i["code"]) not in desc)
    print(f"Articoli del listino ancora senza descrizione: {len(senza)} di {len(cat['items'])}.")
    print("Ora cambia VERSION in sw.js.")


if __name__ == "__main__":
    main()
