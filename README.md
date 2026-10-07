# StageDeck

Configuratore di offerte per palchi modulari Everdeck. Inserisci misure, altezza gambe, parapetti e scale: l'app calcola i pezzi, i prezzi, il peso e il volume degli imballi.

## Pubblicare su GitHub Pages
1. Crea il repository `stagedeck_config` e carica tutti questi file (la cartella `tools` compresa).
2. Settings → Pages → "Deploy from a branch" → branch `main`, cartella `/ (root)`.
3. Apri `https://<utente>.github.io/stagedeck_config/` e, da Chrome o Safari, scegli "Installa app" / "Aggiungi a Home".

## Aggiornare il listino
`python3 tools/aggiorna_listino.py nuovo_listino.xlsx rampe.xlsx` (serve `pip install openpyxl`; il file rampe è facoltativo) riscrive listino e kit rampe dentro `index.html`. Poi cambia `VERSION` in `sw.js`.

## Attenzione
I prezzi NON sono nel repository. `index.html` contiene solo codici, nomi, pesi e imballi. I prezzi di acquisto stanno in `prezzi.json` (ignorato da git, non va caricato su GitHub). Apri l'app, scheda Listino, e premi «Carica prezzi»: restano salvati solo sul tuo dispositivo. Va fatto una volta per ogni dispositivo e browser.

## Dati corretti a mano
Nel listino l'imballo di `VS75PB-1×1` è 2005×1005×100 mm: è stato corretto in 1005×1005×100 come per le altre 1×1 (vedi `tools/aggiorna_listino.py`).

## Fonti delle regole
Manuale di montaggio e brochure Larcher (Stage Deck, Spider, Rollrisers), listino rampe. Ogni regola nella scheda Regole indica da dove viene; le righe marcate "ipotesi" o "da confermare" non sono nei documenti.

## Regole
Le regole dei pezzi accessori (morsetti, connettori, corrimano) sono modificabili nella scheda Regole dell'app e vengono salvate nel browser.


## Prezzi e maggiorazione
I prezzi del listino sono di acquisto. Nel campo Maggiorazione % (o con i tasti rapidi) si imposta il ricarico: ogni riga dell'offerta è il prezzo di vendita. Acquisto e maggiorazione compaiono solo nel riepilogo a schermo (voci «interno»), non nel testo copiato.

## Regole confermate
- Connettori e livellatori: 1 pezzo per ogni metro di lato connesso, uguale per StageDeck e Spider.
- Scale: numero, lato e corrimano (1 o 2 lati) si scelgono nei dati generali.
- Imballo Spider deck: spessore 60 mm.

## Confezioni
Nel listino gambe (set da 4) e connettori VD2D, VDL, D2DC (set da 3) hanno prezzo unitario per pezzo, mentre peso e misure dell'imballo sono della confezione. L'app divide di conseguenza e arrotonda la quantità per eccesso a confezioni intere (sulla riga compare «conf. da N»). Le gambe in offerta sono espresse in set da 4, con prezzo per set: un set per ogni deck.

## Mascheratura e carrelli
- Mascheratura: si scelgono i lati (come per i parapetti), la stoffa (poliestere o velluto, liscio o plissettato) e l'altezza del telo. Per ogni lato di deck sul perimetro: lato lungo = profilo SKP1970 + telo da 2050, lato corto = SKP970 + telo da 1050. Non dipende dalle scale. Altezza automatica: il telo standard (20-100 cm) che copre altezza palco + 9 cm di deck (modificabile in Regole).
- Carrelli: VTT, VDT, VGT per StageDeck, VTSP e FLSP per Spider. Quantità automatica dalla capacità (modificabile in Regole) oppure scelta a mano.
- Dopo aver aggiornato il listino ricarica `prezzi.json` nell'app: contiene anche i codici dei teli.

## Ordine al fornitore
Il pulsante «Ordine fornitore (Excel)» scarica un .xlsx con Product Code, Product Name, Quantity e Unit. Le gambe sono in set da 4, tutto il resto in pezzi.
