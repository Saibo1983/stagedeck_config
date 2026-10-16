# StageDeck

Configuratore di offerte per palchi modulari Everdeck. Inserisci misure, altezza gambe, parapetti e scale: l'app calcola i pezzi, i prezzi, il peso e il volume degli imballi.

## Pubblicare su GitHub Pages
1. Crea il repository `stagedeck_config` e carica tutti questi file (la cartella `tools` compresa).
2. Settings → Pages → "Deploy from a branch" → branch `main`, cartella `/ (root)`.
3. Apri `https://<utente>.github.io/stagedeck_config/` e, da Chrome o Safari, scegli "Installa app" / "Aggiungi a Home".

## Aggiornare il listino
`python3 tools/aggiorna_listino.py nuovo_listino.xlsx rampe.xlsx` (serve `pip install openpyxl`; il file rampe è facoltativo: senza, restano i kit rampe già presenti) riscrive listino e kit rampe dentro `index.html`. Poi cambia `VERSION` in `sw.js`.

## Articoli integrati da fatture
Il listino `Everdeck_STAGEDECKS_2026.04_integrato` aggiunge 48 pezzi e misure fuori catalogo (45 nell'app: le rampe VRP20, VRP40 e VRP60 sono escluse, perché doppioni dei kit rampe; elenco `ESCLUSI` in `aggiorna_listino.py`), ricavati dalle fatture di acquisto: sono le righe con il codice evidenziato in azzurro. Lo script le riconosce dal colore e le marca nel catalogo con la nota di provenienza (colonne R e U del file: codice, fatture, come sono stati stimati peso e imballo).
- Nell'offerta ogni riga con un articolo da fattura è azzurra con l'etichetta «fuori listino · controlla» (passa sopra per leggere la nota), e un avviso in cima elenca i codici. Etichetta e avviso non escono nel PDF né nel testo copiato.
- Nella scheda Listino gli stessi articoli hanno l'etichetta «fuori listino».
- Alcuni entrano da soli nei calcoli: i parapetti da 0,5 m (VH0.5) e la gamba fissa da 70 cm (VFL70), che ora ha il suo prezzo invece della media tra VFL60 e VFL80. Gli altri si aggiungono a mano da «Voci aggiuntive» e sono segnalati allo stesso modo.
- Caricando un nuovo `prezzi.json`, i codici che non ci sono (per esempio le rampe) tengono il prezzo già caricato sul dispositivo.

## Attenzione
I prezzi NON sono nel repository. `index.html` contiene solo codici, nomi, pesi e imballi. I prezzi di acquisto stanno in `prezzi.json` (ignorato da git, non va caricato su GitHub). Apri l'app, scheda Listino, e premi «Carica prezzi»: restano salvati solo sul tuo dispositivo. Va fatto una volta per ogni dispositivo e browser.

## Dati corretti a mano
Nel listino l'imballo di `VS75PB-1×1` è 2005×1005×100 mm: è stato corretto in 1005×1005×100 come per le altre 1×1 (vedi `tools/aggiorna_listino.py`).

## Fonti delle regole
Manuale di montaggio e brochure Larcher (Stage Deck, Spider, Rollrisers), listino rampe. Ogni regola nella scheda Regole indica da dove viene; le righe marcate "ipotesi" o "da confermare" non sono nei documenti.

## Regole
Le regole dei pezzi accessori (morsetti, connettori, corrimano) sono modificabili nella scheda Regole dell'app e vengono salvate nel browser.


## Prezzi e maggiorazione
I prezzi del listino sono di acquisto. La maggiorazione è fissa al 37% (il campo Maggiorazione % resta modificabile). L'offerta mostra per ogni riga acquisto, maggiorazione, prezzo di vendita e totale; sotto, totale acquisto, maggiorazione, subtotale vendita, sconto, imponibile, IVA e totale. Nel PDF dell'offerta acquisto e maggiorazione compaiono solo se è spuntato «Prezzi di acquisto nel PDF»; nel testo copiato non compaiono mai.

## Regole confermate
- Pedane tutte orientate nello stesso verso: i 2×1 formano un blocco unico (dall'angolo retro-sinistra) con il lato lungo tutto sulla larghezza o tutto sulla profondità. Dove la misura non è multipla del modulo, la striscia che avanza (a destra e sul fronte) si chiude con 1×1, 2×0,5, 1×0,5 e 0,5×0,5, mai con un 2×1 girato. Tra i due versi vince il prezzo di listino più basso, poi meno pezzi, poi il lato lungo sulla larghezza.
- Pulsante «Ottimizza pedane» sopra la pianta: se è attivo torna la copertura di prima, cioè la soluzione al prezzo più basso anche con pedane in versi diversi. La scelta resta salvata; un avviso in cima ricorda che è attiva e il pulsante non esce nel PDF.
- Connettori tra le gambe solo con gambe oltre 80 cm (fisse sopra 80 cm, telescopiche VTL60 60–100 cm e più lunghe): sul perimetro, dove si incontrano 2 gambe, un connettore doppio VLC; all'interno, dove se ne incontrano 4, un connettore quadro V4LC.
- Connettori d'angolo parapetti VHCC: 2 per ogni angolo a 90° dove due lati con parapetto si incontrano (parapetto su 3 lati = 4 connettori, su 4 lati = 8).
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

## Quantità modificate a mano
Nell'offerta ogni riga ha i tasti − e + per cambiare la quantità (per esempio 2 parapetti da 1 m al posto di uno da 2 m). Un passo vale 1 pezzo, 1 set per le gambe, 1 confezione per gli articoli in confezione. Le righe modificate sono evidenziate, un avviso le elenca e «Ripristina quantità calcolate» le riporta ai valori dell'app. Le modifiche restano salvate finché non le ripristini, anche se cambi misure o altezza. Scale e rampe sono in due gruppi separati.

## PDF e nuova offerta
- «PDF offerta» e «PDF disegni» aprono la stampa del browser con solo quella parte e un'intestazione con numero, cliente, progetto e data: scegli «Salva come PDF». Il nome del file proposto è «Offerta …» o «Disegni …». Nel PDF dell'offerta non compaiono le voci interne (acquisto e maggiorazione).
- «Nuova offerta: azzera tutto», in fondo ai dati, riporta il palco 4 × 4 m a 60 cm su gambe senza accessori, dati cliente vuoti, maggiorazione e sconto a 0. Prezzi e regole restano.

## Spedizione e bancali
In cima ci sono totale, superficie e numero di pedane in offerta. Peso, volume e bancali sono nel riquadro «Spedizione», sotto l'offerta, con un disegno di ogni bancale (stima):
- Pedane impilate su bancali 2×1 m: al massimo 20 strati e 200 cm di carico, bancale escluso. Ogni strato è il piano 2×1 diviso in celle da 50 cm e le pedane ci stanno con la loro forma vera (una 2×0,5 è una striscia lunga 2 m, non un quadrato 1×1): dalla più grande alla più piccola, nel primo posto libero, girate se serve. Le pedane più grandi di 2×1 (es. 2,1×1,2) fanno strato da sole.
- Accessori prima sopra le pedane, nello spazio che resta fino a 200 cm. Quello che avanza va su EPAL 120×80 cm; i pezzi più lunghi di 120 cm (parapetti da 2 m, profili mascheratura 1970, scale regolabili, ...) solo su bancali 2×1 m.
- Lo spazio per gli accessori è il 75% del volume libero del bancale. I carrelli viaggiano a parte; rampe e Rollrisers non hanno misure d'imballo e non sono conteggiati.
- Il riepilogo «Spedizione (stima)» compare anche nelle note dell'offerta e il riquadro esce nel PDF dell'offerta. Strati, altezza e riempimento si cambiano nella scheda Regole.

## Richiesta offerta trasporto
A destra dei disegni dei bancali c'è il riepilogo dei colli (per esempio «1 bancale 2 × 1 × h 1,93 m») con il peso totale, bancali vuoti compresi (stima 30 kg il 2×1, 25 kg l'EPAL), e il pulsante «Richiedi offerta trasporto». Nella finestra si scelgono:
- trasportatore e indirizzo email: Brigl (sales@brigl.it) o GLS (bolzano.ritiri@gls-italy.com);
- carico: fornitore (EVERDECK s.c., Bogacica PL, predefinito, oppure BÜTEC GmbH, Mettmann D) e muletto sì/no;
- scarico: indirizzo da scrivere a mano, muletto sì/no, sponda idraulica sì/no;
- referente per la consegna: nominativo e telefono per il preavviso.
«Crea email» apre il programma di posta con la mail già scritta; «Copia testo» la copia. Le scelte restano salvate; «Nuova offerta: azzera tutto» le riporta ai valori iniziali.

## Illustrazioni degli articoli
Le immagini stanno in `img/` (lato lungo 600 px, bordo bianco tolto) e il catalogo le indica nel campo `img`. Per aggiungerle o sostituirle:
`python3 tools/importa_immagini.py immagini.zip` (oppure una cartella; serve `pip install pillow`), poi cambia `VERSION` in `sw.js`.
- Ogni immagine si abbina all'articolo con lo stesso nome della colonna «Product Photo Name» del listino, oppure con lo stesso codice. I nomi diversi noti (es. `VS750P-2×1B` per `VS750PB-2×1`, `VASH` per i due corrimano, `rollriser` per tutti i Rollrisers) sono in `ALIAS` dentro lo script.
- Lo script elenca le immagini che non trovano un articolo e gli articoli ancora senza immagine.
- `aggiorna_listino.py` ricollega da solo le immagini già presenti in `img/`.
- Articoli senza foto: `node tools/genera_immagini.js cartella` crea le illustrazioni dai modelli 3D dell'app, allungati alla misura (pedane di altre misure, gambe, parapetti anche con battipiede, gradini, morsetto VLC), oppure con forme generate (pedane triangolari e a quarto di cerchio, tubi, profili, traliccio); poi `python3 tools/importa_immagini.py cartella`. Salta gli articoli che hanno già un'immagine.
- Gli articoli quasi uguali a uno con foto (pedane RC, VTL30, teli e profili di misura vicina) usano quella foto: elenco `SIMILI` in `importa_immagini.py`.
Nell'app la miniatura compare nell'offerta (anche nel PDF per il cliente), nella scheda Listino e sotto ogni sezione della configurazione (Palco, Scale, Parapetti, ...) con i pezzi che quella scelta mette in offerta. Tocca una miniatura per ingrandirla.

## Palco rotondo
Nel riquadro Palco, «Forma» → «Rotondo» e il diametro: 3, 4, 6, 8 o 10 m, con la suddivisione dei disegni Everdeck (elenco `ROUND_LAYOUTS` in `index.html`, rettangoli in metri dal centro).
- Pedane 2×1 intere al centro e pezzi speciali ritagliati sul cerchio. I pezzi uguali (a meno di una rotazione) sono lo stesso tipo: articoli `KOLO<Ø>-<tipo>`, per esempio KOLO8-01. Conteggi come nei disegni: 4 m = 2 + 12 (6 tipi da 2), 6 m = 8 + 16 (4 tipi da 4), 8 m = 16 + 16.
- Prezzo dei pezzi speciali dalla regola Everdeck (maggio 2026): fino a 1×1 m e fino a 2×1 m, chiavi `TONDO-SPEC-1X1` e `TONDO-SPEC-2X1` di `prezzi.json`. Sono in `prezzi_extra.json` (fuori da git), che `aggiorna_listino.py` aggiunge a `prezzi.json`.
- Peso stimato dalla superficie (16 kg/m²), imballo dalle misure d'ingombro; nell'offerta sono segnalati come «fuori listino · controlla», con l'immagine della sagoma.
- Gambe: sempre 4 per ogni pezzo, anche per quelli con il lato curvo (schede GlobalTruss «Stage Deck Curved»): negli angoli, una sola gamba per due angoli più vicini di 35 cm, e quelle che mancano sul lato curvo. Connettore tra le gambe solo dove le gambe sono perfettamente allineate (angoli diritti in comune tra pezzi vicini), non sul lato curvo. Connettori deck-deck calcolati sui lati in comune. Scale centrate sul lato. Niente parapetti, mascheratura e rampe (non ci sono pezzi curvi): se sono scelti, un avviso lo dice.
- Pianta, vista 3D, spedizione e PDF funzionano anche per il palco rotondo.

## Rampe
I kit rampe per altezza (20, 40, 60, 80–100, 120–140 cm) vengono da `RAMPS_list.xlsx`, con i prezzi: `python3 tools/aggiorna_listino.py listino.xlsx RAMPS_list.xlsx`. Le immagini per altezza («20.jpg» = rampa, «20cm e palco.jpg» = rampa montata al palco) si importano con `importa_immagini.py` e diventano `img/RAMPA-<h>.jpg` e `img/RAMPA-<h>-PALCO.jpg`. Con una rampa in offerta, l'immagine dell'altezza più vicina al palco compare nella sezione Rampe (rampa e rampa con palco) e sulla riga «Rampe» dell'offerta, anche nel PDF.

## Posizione dei dati offerta
In alto nel riquadro «Dati offerta» si sceglie la posizione dei dati: «A lato» (colonna a sinistra, come prima) oppure «Sopra»: sotto la barra del totale e sopra la pianta, con Dati offerta, Palco, Scale, Parapetti, ecc. in riquadri affiancati (quanti ne stanno nella larghezza della pagina). La scelta resta salvata nel browser.

## Larghezza della pagina
Sul bordo destro della pagina c'è una barra verticale: trascinala per allargare la pagina fino a tutto lo schermo. Doppio clic per tornare alla larghezza normale. La larghezza resta salvata nel browser. Non c'è su schermi stretti.

## Voci aggiuntive: ricerca
Nel campo delle voci aggiuntive si scrive un codice o una parte della descrizione: compare l'elenco degli articoli che contengono tutte le parole scritte (codice, descrizione o gruppo del listino), con la miniatura. Le parole italiane più comuni valgono anche in inglese, come sono scritte nel listino (morsetto = clamp/coupler, gamba = leg, parapetto = handrail, scala = stair, telo = skirt, velluto = velvet, ...: elenco `XSYN` in `index.html`); «1,5» vale come «1.5». Frecce e Invio per scegliere, poi Invio sulla quantità per aggiungere.

## Vista 3D
Il pannello «Vista 3D» monta il palco configurato con i pezzi reali (pedane, gambe, connettori tra le gambe, connettori deck-deck VD2D sotto i giunti, parapetti da 2 m, 1 m e 0,5 m, scale, mascheratura) e salva un'immagine PNG. Il pulsante «Pianali trasparenti» rende quasi trasparenti i piani delle pedane: si vedono telai, gambe, morsetti e connettori sotto il palco senza girare la vista (anche nell'immagine PNG; nei file .html e .glb i pianali restano pieni). Si può scaricare anche:
- «3D interattivo (.html)»: una pagina da aprire nel browser, anche sul telefono, o da mandare al cliente; il palco si gira con il dito o il mouse. Per aprirla serve internet (usa la libreria model-viewer da cdn.jsdelivr.net).
- «Modello 3D (.glb)»: il modello in formato standard glTF, in metri, per il Visualizzatore 3D di Windows, l'Anteprima del Mac, Blender e altri programmi.
Un vero «PDF 3D» (U3D/PRC) si vede solo con Adobe Acrobat sul computer e non si può generare dal browser: per questo si usano i due formati sopra. Si carica solo se richiesto (`viewer3d.js` + `models3d.js`, entrambi vanno pubblicati insieme a `index.html`). I connettori tra le gambe compaiono solo quando sono in offerta (gambe oltre 80 cm). Spider Deck e Rollrisers sono mostrati con pedane e gambe StageDeck. Il palco rotondo è montato con pedane 2×1 e pezzi speciali (telaio e piano con la loro forma). Nel PDF dei disegni la vista 3D esce se è aperta; nel PDF dell'offerta no.

## Descrizioni in italiano
Le descrizioni in italiano degli articoli (denominazione e descrizione tecnica) stanno in una tabella a parte dentro `index.html` (blocco `<script id="descrizioni">`), separata dal listino: `aggiorna_listino.py` non la tocca. Non contiene prezzi.
- Per importarle o aggiornarle: `python3 tools/importa_descrizioni.py lista_con_descrizione.xlsx` (primo foglio, colonne Codice, Denominazione, Descrizione (it)), poi cambia `VERSION` in `sw.js`. La lista può essere parziale: le descrizioni già presenti restano, quelle nuove le aggiungono o le sostituiscono.
- I codici scritti diversamente dal listino (es. `VSM200` = `VSM20`, `VASH` = `VASH-R` e `VASH-L`, `VS750H-2X1T` = le due triangolari) sono in `ALIAS` dentro lo script. I codici che non sono nel listino (barriere EBR, parapetti VHX, ...) restano nella tabella per quando ci saranno.
- Nell'offerta, tra le impostazioni: «Descrizioni» mostra la descrizione sotto ogni riga; «Descrizioni in PDF e copie» la mette nel PDF dell'offerta, in «Copia offerta» (righe sotto l'articolo) e in «Copia per Excel» (colonna «Descrizione estesa»). Spente di default; l'ordine al fornitore resta in inglese.
- Nella scheda Listino la denominazione italiana compare sotto il nome (passa sopra per la descrizione), e la ricerca del Listino e delle voci aggiuntive trova anche le parole italiane.
