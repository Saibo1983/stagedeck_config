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
- Connettori tra le gambe solo con gambe oltre 80 cm (fisse sopra 80 cm, telescopiche VTL60 60–100 cm e più lunghe): sul perimetro, dove si incontrano 2 gambe, un connettore doppio VLC; all'interno, dove se ne incontrano 4, un connettore quadro V4LC.
- Connettori e livellatori: 1 pezzo per ogni metro di lato connesso, uguale per StageDeck e Spider.
- Scale: numero, lato e corrimano (1 o 2 lati) si scelgono nei dati generali.
- Imballo Spider deck: spessore 60 mm.

## Confezioni
Nel listino gambe (set da 4) e connettori VD2D, VDL, D2DC (set da 3) hanno prezzo unitario per pezzo, mentre peso e misure dell'imballo sono della confezione. L'app divide di conseguenza e arrotonda la quantità per eccesso a confezioni intere (sulla riga compare «conf. da N»). Le gambe in offerta sono espresse in set da 4, con prezzo per set: un set per ogni deck.

## Mascheratura e carrelli
- Mascheratura: si scelgono i lati (come per i parapetti), la stoffa (poliestere o velluto, liscio o plissettato) e l'altezza del telo. Per ogni lato di deck sul perimetro: lato lungo = profilo SKP1970 + telo da 2050, lato corto = SKP970 + telo da 1050. Non dipende dalle scale. Altezza automatica: il telo standard (20-100 cm) che copre l'altezza del palco, che è l'altezza finita (piano del deck da terra).
- Carrelli: VTT, VDT, VGT per StageDeck, VTSP e FLSP per Spider. Quantità automatica dalla capacità (modificabile in Regole) oppure scelta a mano.
- Dopo aver aggiornato il listino ricarica `prezzi.json` nell'app: contiene anche i codici dei teli.

## Ordine al fornitore
Il pulsante «Ordine fornitore (Excel)» scarica un .xlsx con Product Code, Product Name, Quantity e Unit. Le gambe sono in set da 4, tutto il resto in pezzi.

## Scale
- Scala modulare: elementi da 20 cm (VSM20 = 1° gradino, VSM40 = 2°, ...). L'ultimo gradino sta 20 cm sotto il palco: per un palco da 60 cm servono VSM20 + VSM40. Si compone solo per palchi da 40 a 100 cm a passi di 20; per altre altezze l'app usa la scala regolabile (o avvisa, se è scelta «Modulare»). Un palco da 20 cm non ha scala.
- Scala regolabile: il modello va abbinato alla gamba telescopica con la stessa escursione (VAS-2↔VTL40, VAS-4↔VTL60, VAS-5↔VTL80, VAS-7↔VTL100). Con le gambe telescopiche l'app sceglie la scala dello stesso modello; con le gambe fisse lo segnala.
- Il riquadro «Scala in offerta» mostra la scala vista di lato con i pezzi messi in offerta: tocca un pezzo (o il suo codice) per vedere cos'è. L'ingombro a terra della scala regolabile è indicativo.
