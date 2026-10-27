#!/usr/bin/env python3
"""Importa in index.html i codici degli articoli presenti nel programma gestionale.

Uso:  python3 tools/importa_gestionale.py Artikelliste.xlsx
Legge il primo foglio e prende solo la colonna «Codice» (o «Kode»): prezzi e descrizioni della lista non vengono letti.
Riscrive il blocco <script id="gestionale"> di index.html: codice del listino normalizzato -> codice scritto come nel gestionale.
Nell'esportazione XML gli articoli che non sono in questa tabella (e quelli da fatture) vanno senza codice articolo,
cosi' il gestionale non scarta la riga. Se la tabella e' vuota tutti i codici del listino vanno come sono.
Niente prezzi: questo blocco puo' stare nel repository.
"""
import json
import re
import sys
from datetime import date
from pathlib import Path

import openpyxl

HTML = Path(__file__).resolve().parent.parent / "index.html"
PAT = re.compile(r'(<script type="application/json" id="gestionale">)(.*?)(</script>)', re.S)
# Codici del gestionale che valgono per piu' codici del listino (codice del gestionale normalizzato -> codici del listino)
ALIAS = {
    "VASH": ["VASH-R", "VASH-L"],                       # corrimano scala regolabile, destro e sinistro
    "VS750H-2X1T": ["VS750H-2x1T-R", "VS750H-2x1T-L"],  # pedana triangolare, destra e sinistra
}


def norm(code):
    return re.sub(r"\s+", "", str(code)).replace("×", "x").upper()


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    ws = openpyxl.load_workbook(sys.argv[1], read_only=True, data_only=True).worksheets[0]
    rows = ws.iter_rows(values_only=True)
    head = [str(h or "").strip().lower() for h in next(rows)]
    col = next((i for i, h in enumerate(head) if h in ("codice", "kode", "code")), None)
    if col is None:
        sys.exit("Colonna «Codice» non trovata nella prima riga.")
    codici = {}
    for r in rows:
        c = str(r[col] or "").strip()
        if not c:
            continue
        codici[norm(c)] = c
        for alias in ALIAS.get(norm(c), []):
            codici.setdefault(norm(alias), c)
    html = HTML.read_text(encoding="utf-8")
    blocco = json.dumps({"lista": re.sub(r"^[0-9a-f]{8}-", "", Path(sys.argv[1]).name), "data": date.today().isoformat(), "codici": dict(sorted(codici.items()))},
                        ensure_ascii=False, separators=(",", ":"))
    if not PAT.search(html):
        sys.exit("Blocco <script id=\"gestionale\"> non trovato in index.html.")
    HTML.write_text(PAT.sub(lambda m: m.group(1) + blocco.replace("</", "<\\/") + m.group(3), html, count=1), encoding="utf-8")
    print(f"{len(codici)} codici del gestionale scritti in index.html. Ora cambia VERSION in sw.js.")


if __name__ == "__main__":
    main()
