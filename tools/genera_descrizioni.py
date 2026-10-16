#!/usr/bin/env python3
"""Genera le descrizioni (italiano e tedesco) degli articoli del listino che non ne hanno una.

Uso:  python3 tools/genera_descrizioni.py
Scrive nel blocco <script id="descrizioni"> di index.html le voci mancanti, per ogni lingua separatamente:
"nome"/"desc" con "auto": true (italiano), "nome_de"/"desc_de" con "auto_de": true (tedesco).
Sono composte sul modello delle descrizioni originali della stessa famiglia (liste di descrizioni italiana e tedesca)
e con i dati del listino (misure dal codice, peso). Nell'app sono segnalate «descrizione generata · controlla»
(solo a schermo). Non tocca mai le descrizioni originali; importa_descrizioni.py sostituisce quelle generate.
Gli articoli che il generatore non sa descrivere vengono elencati.
"""
import json
import re
from pathlib import Path

HTML = Path(__file__).resolve().parent.parent / "index.html"
PAT = re.compile(r'(<script type="application/json" id="descrizioni">)(.*?)(</script>)', re.S)
CAT = re.compile(r'<script type="application/json" id="catalog">(.*?)</script>', re.S)
# articoli aggiunti dall'app, non nel listino Excel
EXTRA = [{"code": "VHK0.5", "name": "0,5m handrail with kickboard", "section": "STAGE HANDRAIL", "kg": None}]

SKIRT_NOTE = ("- La parte superiore della tenda è dotata di una striscia di velcro che permette di fissarla alla piattaforma con un profilo a scatto per tende.\n"
              "- La connessione laterale avviene tramite un risvolto di velcro\n- Colore nero\n\nB1 secondo DIN 4102\nEN 13773 Classe 1\nPN-EN ISO 6940: 2005")
RAIL = ("Fornitura di parapetto con le seguenti caratteristiche:\nstruttura in tubolare, acciaio, verniciato nero\n{kick}- altezza 1.000mm\n"
        "- lunghezza {L}mm\n{kg}- tutti gli elementi di collegamento alla pedana inclusi\n- parapetto anticaduta, no antisfondamento !")


def norm(code):
    return re.sub(r"\s+", "", str(code)).replace("×", "x").upper()


def mm(v):
    """1000 -> '1.000', 175.5 -> '175,5'"""
    if abs(v - round(v)) > 1e-6:
        return f"{v:.1f}".replace(".", ",")
    return f"{int(round(v)):,}".replace(",", ".")


def kg(v):
    return f"{v:.1f}".rstrip("0").rstrip(".").replace(".", ",")


def misura(code):
    """Misura del pianale dal codice (in metri, virgola decimale): 'VS750H-2,1x1,2' -> (2100, 1200)."""
    m = re.search(r"-(\d+(?:,\d+)?)\s*[x×]\s*(\d+(?:,\d+)?)", code, re.I)
    return tuple(float(x.replace(",", ".")) * 1000 for x in m.groups()) if m else None


def peso(i):
    # pesi degli articoli da fattura sono stime: non li scrivo
    return f"- peso ca.{kg(i['kg'])} kg\n" if i.get("kg") and not i.get("fattura") else ""


def pedana(i):
    c, n = norm(i["code"]), i["name"].lower()
    serie = "PL" if c.startswith("PT") else "StageDeck"
    if c == "VS750H-4MC":
        return ("Pedana modulare StageDeck Hexa per palco rotondo Ø 4 m",
                "Fornitura di pedana modulare con le seguenti caratteristiche:\n- pezzo sagomato per palco rotondo diametro 4.000mm\n"
                "- Bordo in alluminio\n- altezza telaio 90mm\n- pianale in multistrato fenolico carply Hexa antiscivolo, spessore 12mm\n"
                "- portata certificata 750kg/m²\n- struttura telaio in alluminio")
    if c == "HPL-2X1":
        return ("Pianale in multistrato Hexa 2.000x1.000mm",
                "Pianale di ricambio per pedana modulare:\n- dimensione 2.000 x 1.000mm\n- multistrato fenolico carply Hexa antiscivolo, spessore 12mm")
    d = misura(i["code"])
    if not d:
        return None
    a, b = d
    tri, curvo, rc = re.search(r"\dT(-[RL])?$", c), re.search(r"\dC(-[RL])?$", c), c.endswith("RC")
    lato = " destra" if c.endswith("-R") else " sinistra" if c.endswith("-L") else ""
    if c.startswith(("VS750PB", "VS75PB", "PT750PB")):
        piano, tit = "pianale in Plexiglass nero", "con Plexiglass nero"
    elif c.startswith(("VS750PT", "PT750PT")):
        piano, tit = "pianale in Plexiglass trasparente", "con Plexiglass trasparente"
    elif c.startswith("PT750PW"):
        piano, tit = "pianale in Plexiglass bianco", "con Plexiglass bianco"
    elif "W-" in c[:7] or c.startswith("PT750W"):
        piano, tit = "pianale in multistrato con finitura legno", "multistrato legno"
    elif c.startswith("VS750BL"):
        piano, tit = "pianale in multistrato verniciato nero", "verniciata nera"
    else:
        piano, tit = "pianale in multistrato fenolico carply Hexa antiscivolo, spessore 12mm", "multistrato Hexa"
    forma = " triangolare" if tri else " lato curvo" if curvo else " angoli smussati" if rc else ""
    nome = f"Pedana modulare {serie} {mm(a)}x{mm(b)}mm{forma}{lato} {tit}".replace("  ", " ")
    righe = ["Fornitura di pedana modulare con le seguenti caratteristiche:"]
    if tri:
        righe.append(f"- dimensione pianale triangolare {mm(a)} x {mm(b)} x {mm(round((a*a+b*b)**.5))}mm")
    elif curvo:
        righe += [f"- dimensione massime pianale {mm(a)} x {mm(b)}mm", "- un lato curvo"]
    else:
        righe.append(f"- dimensione pianale {mm(a)} x {mm(b)}mm")
    if rc:
        righe.append("- Angoli smussati per uso con sistema Layher")
    if "BULK" in c:
        righe.append("- fornita senza imballo singolo (bulk)")
    # altezza telaio e impilamento solo per StageDeck (le descrizioni originali non coprono la serie PL)
    righe += ["- Bordo in alluminio"] + (["- altezza telaio 90mm", "- altezza impilamento 95 mm"] if serie == "StageDeck" else []) + [f"- {piano}",
              "- portata certificata 750kg/m²", "- struttura telaio in alluminio"]
    return nome, "\n".join(righe) + "\n" + peso(i).rstrip("\n")


def genera(i):
    c, n, s = norm(i["code"]), i["name"], i["section"]
    m = None
    if s in ("STAGE PLATFORMS", "PL OUTDOOR PRO DECK", "PL BASIC DECK", "PL SPECIAL DECK"):
        return pedana(i)
    if re.match(r"VFL(\d+)$", c):
        h = int(c[3:]) * 10
        return (f"Gambe verticali ad altezza fissa {mm(h)}mm",
                f"Gambe verticali con le seguenti caratteristiche:\n- profilo in alluminio 60x60x2mm\n- altezza fissa {mm(h)}mm\n- piedini in PVC\n- set da 4 pezzi")
    if m := re.match(r"VTL(\d+)-(\d+)$", c):
        lo, hi = int(m[1]) * 10, int(m[2]) * 10
        return (f"Gambe verticali telescopiche {mm(lo)}-{mm(hi)}mm 60x60mm",
                f"Fornitura di gambe telescopiche con le seguenti caratteristiche:\n- profilo in alluminio 60/50mm\n- altezza regolabile continua {mm(lo)}-{mm(hi)}mm\n- piedini in PVC\n- set da 4 pezzi")
    if m := re.match(r"VRL(A?)(\d+)$", c):
        h, adj = int(m[2]) * 10, m[1] == "A"
        return (f"Gambe verticali tonda {mm(h)}mm" + (" con piedino regolabile" if adj else ""),
                f"Gambe verticali con le seguenti caratteristiche:\n- profilo in alluminio tubo tondo 48,3x3mm\n- altezza fissa {mm(h)}mm\n"
                + ("- piedino regolabile +-30mm\n" if adj else "") + "- set da 4 pezzi")
    if c == "VRLT150":
        return ("Gambe verticali telescopiche 1.500-2.200mm tubo tondo",
                "Fornitura di gambe telescopiche tubolari con le seguenti caratteristiche:\n- profilo in alluminio tubo tondo 48,3mm\n- altezza regolabile continua 1.500-2.200mm")
    if c == "VLCO-48MM":
        return ("Connettore 2 gambe tonde sovrapposte",
                "Connettore gambe verticali per pedana modulare.\n- Sistema unione gambe verticali tonde 48,3mm (connessione di n° 2 gambe).\n- Gambe sovrapposte.")
    if m := re.match(r"VSM(\d+(?:,\d+)?)$", c):
        a = float(m[1].replace(",", ".")) * 10
        k = round(a / 175)
        return (f"Scaletta componibile {k}° scalino a={mm(a)} mm multistrato Hexa",
                f"Scaletta componibile con le seguenti caratteristiche:\n- telaio in tubolare quadro, acciaio, verniciato nero\n- {k} scalin{'o' if k == 1 else 'i'}\n"
                f"- larghezza 1.000mm\n- alzata ca.175mm\n- pedata 300mm in multistrato antiscivolo Hexa\n- tutti gli elementi di collegamento alle pedane inclusi")
    if m := re.match(r"VH(K?)(\d+(?:\.\d+)?)$", c) or re.match(r"VH-()(\d+)$", c):
        L = float(m[2]) * 1000
        kick = m[1] == "K"
        nome = (f"Parapetto con parapiede altezza 1.000mm, lunghezza {mm(L)}mm" if kick else f"Parapetto per pedane altezza 1.000mm, lunghezza {mm(L)}mm")
        return nome, RAIL.format(kick="- con parapiede\n" if kick else "", L=mm(L), kg=peso(i))
    if m := re.match(r"(P|V)SP-(S|P)(\d+)X(\d+)$", c):
        velluto, teso, h, L = m[1] == "V", m[2] == "S", int(m[3]), int(m[4])
        stoffa = "velluto" if velluto else "tessuto"
        nome = f"Mascheratura in {stoffa} {'teso ' if velluto and teso else ''}{'con ricchezza ' if not teso else ''}{mm(h)}x{mm(L)}mm".replace("  ", " ")
        return nome, (f"Mascheratura in {'velluto poliestere' if velluto else 'tessuto poliestere'} per pedana con le seguenti caratteristiche:\n"
                      f"- Confezionata {'tesa' if teso else 'arricciata'} {mm(h)}x{mm(L)}mm\n"
                      f"- In {'velluto poliestere' if velluto else 'poliestere'} peso di 360g / m² e permanentemente ignifuga\n" + SKIRT_NOTE)
    if m := re.match(r"SKP(\d+)$", c):
        return (f"Profilo a incastro per rivestimento {m[1]} mm incl. velcro",
                f"Profilo per il fissaggio del rivestimento in tessuto, lunghezza {m[1]} mm\n- Il montaggio avviene in pochi secondi agganciando il profilo alla scanalatura.\n- Il rivestimento può essere fissato tramite il velcro.")
    if m := re.match(r"SKBP(\d+)$", c):
        return (f"Profilo per bloccaggio anticaduta di sedie lunghezza {m[1]} mm",
                f"Profilo per bloccaggio anticaduta di sedie, lunghezza {m[1]} mm, incl. velcro per il rivestimento")
    if m := re.match(r"SPHB-(\d)X1$", c):
        a = int(m[1]) * 1000
        return (f"Pedana modulare Spider Deck {mm(a)}x1.000mm nera",
                f"Pedana realizzata con struttura in alluminio estruso e legno multistrato con superficie resistente agli agenti atmosferici, colore nero\n"
                f"Per uso temporaneo all'aperto\nDimensioni: {a}x1000x55 mm (LxPxA)\nI riser non sono inclusi\n" + (f"Peso {kg(i['kg'])} kg" if i.get("kg") else ""))
    if m := re.match(r"SPR(\d+)B-1X1$", c):
        h = int(m[1]) * 10
        return (f"Riser 100x100 cm altezza fissa {h}mm nero",
                f"Telaio a reticolo in alluminio con connettori in nylon da utilizzare solo con SpiderDeck.\nColore nero\nAltezza fissa {h} mm\n" + (f"Peso {kg(i['kg'])} kg" if i.get("kg") else ""))
    if m := re.match(r"VAP(\d)\.0$", c):
        return (f"Profilo in alluminio {m[1]} m per StageDeck", f"Profilo in alluminio per pedane StageDeck, lunghezza {mm(int(m[1]) * 1000)}mm")
    if m := re.match(r"EB(\d+)$", c):
        return (f"Trave Layher per pedane L={m[1]} cm", f"Trave Layher per pedane, lunghezza {m[1]} cm, con trave per event deck integrata")
    if m := re.match(r"F31-(\d+(?:,\d+)?)$", c):
        v = float(m[1].replace(",", "."))
        v = v * 1000 if v < 10 else v
        return (f"Tubo singolo {mm(v)}mm", f"Tubo singolo in alluminio per kit rampa, lunghezza {mm(v)}mm")
    if m := re.match(r"VRA-(\d+)CM-R$", c):
        return (f"Piedini tondi per rampa da {m[1]} cm", f"Piedini tondi per kit rampa, altezza palco {m[1]} cm")
    if m := re.match(r"VRLT-(\d+)CM(\d)-R$", c):
        return (f"Gamba telescopica tonda per rampa da {m[1]} cm, tipo {m[2]}", f"Gamba telescopica tonda per kit rampa, altezza palco {m[1]} cm, tipo {m[2]}")
    T = {"ER-TCSR": "Connettore a T di partenza, destro", "ER-TCSL": "Connettore a T di partenza, sinistro",
         "ER-TCER": "Connettore a T di arrivo, destro", "ER-TCEL": "Connettore a T di arrivo, sinistro", "ER-TCM": "Connettore a T intermedio"}
    if c in T:
        return T[c], f"{T[c]} per kit rampa"
    FISSE = {
        "ER-SE": ("Elemento di partenza rampa", "Elemento di partenza (a terra) per kit rampa"),
        "ER-EE": ("Elemento di arrivo rampa", "Elemento di arrivo (lato palco) per kit rampa"),
        "SP0002": ("Set connettore: inserto di montaggio e vite", "Set di ricambio composto da inserto di montaggio e vite"),
        "SP0012": ("Rondella rettangolare per piede innestabile variabile", "Rondella rettangolare di ricambio per piede innestabile variabile"),
        "E8002": ("Mezzo giunto M10 portata 200 kg, tubo 50 mm", "Mezzo giunto con attacco M10 per tubo diametro 50mm\n- portata 200 kg"),
        "E38002-B": ("Mezzo giunto portata 250 kg nero", "Mezzo giunto per tubo diametro 48-51mm\n- portata 250 kg\n- colore nero"),
        "E8016": ("Morsetto a chiusura rapida per tubo 50 mm, portata 250 kg", "Morsetto a chiusura rapida per tubo diametro 50mm\n- portata 250 kg"),
        "VSCS200": ("Giunto girevole slim portata 200 kg, tubo 48-51 mm", "Giunto girevole versione slim per tubo diametro 48-51mm\n- portata 200 kg"),
        "PROFILO-5M": ("Profilo in alluminio 60x60x2mm, barra da 5 m", "Profilo in alluminio 60x60x2mm per gambe, barra da 5.000mm da tagliare a misura"),
        "TAPPO-PLASTICA": ("Tappo di protezione in plastica", "Tappo di protezione in plastica per profilo gamba 60x60mm"),
        "VPLI": ("Limitatore per pedana", "Limitatore per pedane, accessorio per sistema Layher"),
        "E31-400": ("Tubo diritto 4 m", "Tubo diritto in alluminio, lunghezza 4.000mm"),
        "E32-300B": ("Traliccio a 2 correnti 3,0 m nero", "Segmento diritto di traliccio a 2 correnti, lunghezza 3.000mm, colore nero"),
        "E32-400BM8": ("Traliccio a 2 correnti 4,0 m 290x290x2mm", "Segmento diritto di traliccio a 2 correnti, lunghezza 4.000mm, sezione 290x290x2mm, colore nero"),
    }
    return FISSE.get(c)


# ---------- tedesco: stesse famiglie, testi sul modello della lista tedesca ----------
SKIRT_DE = ("- Gewicht von 360g / m2 dauerhaft flammenhemmend.\n"
            "- An der Oberseite besitzt der Vorhang einen Klettstreifen um ihn, durch Einsatz eines Vorhang Klickprofiles, am Podest zu befestigen.\n"
            "- Der Vorhang besitzt ein Overlock-Finish an der Unterseite und die Seiten sind eingenäht.\n"
            "- Der seitliche Verbindungsaufbau erfolgt über eine Klettlasche.\n\nB1 nach DIN 4102\nEN 13773 Klasse 1\nPN-EN ISO 6940: 2005")


def gewicht(i):
    return f"- Gewicht ca.{kg(i['kg'])} kg\n" if i.get("kg") and not i.get("fattura") else ""


def podest(i):
    c = norm(i["code"])
    serie = "PL" if c.startswith("PT") else "StageDeck"
    if c == "VS750H-4MC":
        return ("Bühnenpodest StageDeck Hexa für runde Bühne Ø 4 m",
                "Anlieferung eines Bühnenpodestes mit folgenden Eigenschaften:\n- Formteil für runde Bühne Durchmesser 4.000mm\n"
                "- Deckplatte 12mm starke rutschfeste Siebdruckplatte Hexa\n- Zertifizierte Tragkraft 750kg/m²\n- Trägerrahmen in Aluminium")
    if c == "HPL-2X1":
        return ("Deckplatte Siebdruckplatte Hexa 2.000x1.000mm",
                "Ersatz-Deckplatte für Bühnenpodest:\n- Maße 2.000 x 1.000mm\n- 12mm starke rutschfeste Siebdruckplatte Hexa")
    d = misura(i["code"])
    if not d:
        return None
    a, b = d
    tri, curvo, rc = re.search(r"\dT(-[RL])?$", c), re.search(r"\dC(-[RL])?$", c), c.endswith("RC")
    seite = " rechts" if c.endswith("-R") else " links" if c.endswith("-L") else ""
    if c.startswith(("VS750PB", "VS75PB", "PT750PB")):
        platte, tit = "Plexiglass schwarz", "mit Plexiglass schwarz"
    elif c.startswith(("VS750PT", "PT750PT")):
        platte, tit = "Plexiglass transparent", "mit Plexiglass transparent"
    elif c.startswith("PT750PW"):
        platte, tit = "Plexiglass weiss", "mit Plexiglass weiss"
    elif "W-" in c[:7] or c.startswith("PT750W"):
        platte, tit = "Mehrschichtholz in Holzoptik", "Mehrschichtholz Holzoptik"
    elif c.startswith("VS750BL"):
        platte, tit = "Mehrschichtholz schwarz lackiert", "schwarz lackiert"
    else:
        platte, tit = "12mm starke rutschfeste Siebdruckplatte Hexa", "Siebdruckplatte Hexa"
    form = " Dreieck" if tri else " gebogene Seite" if curvo else " Abgeschrägte Ecken" if rc else ""
    nome = f"Bühnenpodest {serie}{' Dreieck' if tri else ''} {mm(a)}x{mm(b)}mm{'' if tri else form}{seite} {tit}".replace("  ", " ")
    z = ["Anlieferung eines Bühnenpodestes mit folgenden Eigenschaften:"]
    if tri:
        z.append(f"- Podestfläche Dreieck {mm(a)} x {mm(b)} x {mm(round((a*a+b*b)**.5))}mm")
    elif curvo:
        z += [f"- maximale Podestfläche {mm(a)} x {mm(b)}mm", "- eine gebogene Seite"]
    else:
        z.append(f"- Podestfläche {mm(a)} x {mm(b)}mm")
    if rc:
        z.append("- Abgeschrägte Ecken zur Verwendung mit dem Layher-System")
    if "BULK" in c:
        z.append("- ohne Einzelverpackung geliefert (Bulk)")
    z += (["- einzelne Nutenkanäle auf der Außenseite", "- Stapelhöhe 95mm"] if serie == "StageDeck" else []) + [
        f"- Deckplatte {platte}", "- Zertifizierte Tragkraft 750kg/m²", "- Trägerrahmen in Aluminium"]
    return nome, "\n".join(z) + "\n" + gewicht(i).rstrip("\n")


def genera_de(i):
    c, s = norm(i["code"]), i["section"]
    if s in ("STAGE PLATFORMS", "PL OUTDOOR PRO DECK", "PL BASIC DECK", "PL SPECIAL DECK"):
        return podest(i)
    if re.match(r"VFL(\d+)$", c):
        h = int(c[3:]) * 10
        return (f"Steckbeine fixe Höhe {mm(h)}mm",
                f"Anlieferung von Steckbeinen mit folgenden Eigenschaften:\n- Quadratrohr Hohlprofil in Aluminium 60x60x2mm\n- Bühnenhöhe {mm(h)}mm\n- Eingelassene PVC Lastenverteiler\n- Set mit 4 Stück")
    if m := re.match(r"VTL(\d+)-(\d+)$", c):
        lo, hi = int(m[1]) * 10, int(m[2]) * 10
        return (f"Teleskopbeine {mm(lo)}-{mm(hi)}mm 60x60mm",
                f"Anlieferung von verstärkten Teleskopbeinen mit folgenden Eigenschaften:\n- Quadrathohlprofil in Aluminium 60/50mm\n- Stufenlos verstellbare Höhe {mm(lo)}-{mm(hi)}mm\n- Rutschfixe Gummifüße\n- Set mit 4 Stück")
    if m := re.match(r"VRL(A?)(\d+)$", c):
        h, adj = int(m[2]) * 10, m[1] == "A"
        return (f"Steckbein Rund fixe Höhe {mm(h)}mm" + (" mit Nivellierfuß" if adj else ""),
                f"Anlieferung von Steckbeinen mit folgenden Eigenschaften:\n- Rundrohr Hohlprofil in Aluminium 48,3x3mm\n- Bühnenhöhe {mm(h)}mm\n"
                + ("- Nivellierfuß +- 30mm\n" if adj else "") + "- Set mit 4 Stück")
    if c == "VRLT150":
        return ("Teleskopbeine 1.500-2.200mm Rundrohr",
                "Teleskopbeine mit folgenden Eigenschaften:\n- Rundhohlprofil in Aluminium 48,3mm\n- Stufenlos verstellbare Höhe 1.500-2.200mm")
    if c == "VLCO-48MM":
        return ("Beinverbindungsklammer Zweifuß Rundbeine überlappend",
                "Zweifuß-Verbindungsklammer zum Befestigen der Podeste untereinander.\n- Für Rundbeine Durchmesser 48,3mm\n- Beine überlappend")
    if m := re.match(r"VSM(\d+(?:,\d+)?)$", c):
        a = float(m[1].replace(",", ".")) * 10
        k = round(a / 175)
        return (f"Anstelltreppe Stahl {k}° Stufe H={mm(a)}mm Siebdruckplatte Hexa",
                f"Stahltreppe mit folgenden Eigenschaften:\n- Vierkantrohre aus Stahl, Lackierung Schwarz\n- {k} Stufe{'' if k == 1 else 'n'}\n"
                f"- Stufenbreite 1.000mm\n- Stufenhöhe ca.175mm\n- Auftritt 300mm in Siebdruckplatte Hexa\n- Komplett mit allen Verbindungsstücken")
    if m := re.match(r"VH(K?)(\d+(?:\.\d+)?)$", c) or re.match(r"VH-()(\d+)$", c):
        L = float(m[2]) * 1000
        kick = m[1] == "K"
        nome = f"Bühnengeländer{' mit Bordbrett' if kick else ''} Höhe 1.000mm, Länge {mm(L)}mm"
        return nome, (f"Anlieferung eines Bühnengeländers mit folgenden Eigenschaften:\n- Vierkantrohre aus Stahl, Lackierung Schwarz{' mit Bordbrett' if kick else ''}\n"
                      f"- Höhe 1.000mm\n- Länge {mm(L)}mm\n{gewicht(i)}- Komplett mit allen Verbindungsstücken\n"
                      "Achtung es handelt sich hierbei nur um ein Umwehrungsgeländer und kein Sicherheitsgeländer!")
    if m := re.match(r"(P|V)SP-(S|P)(\d+)X(\d+)$", c):
        samt, glatt, h, L = m[1] == "V", m[2] == "S", int(m[3]), int(m[4])
        if samt:
            nome = f"Verkleidung aus Samt {'ohne' if glatt else 'mit'} Stoffzugabe {mm(h)}x{mm(L)}mm"
        else:
            nome = f"Verkleidung aus Stoff{'' if glatt else ' mit Stoffzugabe'} {mm(h)}x{mm(L)}mm"
        return nome, f"Verkleidungsvorhang aus Polyester{' Samt' if samt else ''} {mm(h)}x{mm(L)}mm\n" + SKIRT_DE
    if m := re.match(r"SKP(\d+)$", c):
        return (f"Click-Profil für Verkleidung {m[1]}mm inkl. Klettverschluss",
                f"Befestigung für die Stoffverkleidung Länge {m[1]}mm.\n- Die Montage erfolgt in nur wenigen Sekunden durch Einklipsen des Profils in die Nut.\n- Über den Klettverschluss kann die Verkleidung befestigt werden.")
    if m := re.match(r"SKBP(\d+)$", c):
        return (f"Stühle stop - Profil Länge {m[1]}mm", f"Stühle stop - Profil {m[1]}mm, inkl. Klettverschluss für die Verkleidung")
    if m := re.match(r"SPHB-(\d)X1$", c):
        a = int(m[1]) * 1000
        return (f"Bühnenpodest Spider Deck {mm(a)}x1.000mm schwarz",
                "Podest aus Aluminium-Strangpressprofil und Mehrschichtholz mit wetterfester Oberfläche, Farbe schwarz\n"
                f"Für den temporären Einsatz im Freien\nMaße: {a}x1000x55 mm (BxTxH)\nStandfüße nicht enthalten\n" + (f"Gewicht {kg(i['kg'])} kg" if i.get("kg") else ""))
    if m := re.match(r"SPR(\d+)B-1X1$", c):
        h = int(m[1]) * 10
        return (f"Riser 100x100 cm fixe Höhe {h} mm schwarz",
                f"Gitterrahmen aus Aluminium, mit Nylon-Verbindungen zur Verwendung mit Spider-Decks.\nFarbe schwarz\nFixe Höhe {h} mm\n" + (f"Gewicht {kg(i['kg'])} kg" if i.get("kg") else ""))
    if m := re.match(r"VAP(\d)\.0$", c):
        return (f"Aluminiumprofil {m[1]} m für StageDeck", f"Aluminiumprofil für StageDeck Podeste, Länge {mm(int(m[1]) * 1000)}mm")
    if m := re.match(r"EB(\d+)$", c):
        return (f"Layher Träger für Podeste L={m[1]} cm", f"Layher Träger für Podeste, Länge {m[1]} cm, mit integriertem Event-Deck-Träger")
    if m := re.match(r"F31-(\d+(?:,\d+)?)$", c):
        v = float(m[1].replace(",", "."))
        v = v * 1000 if v < 10 else v
        return (f"Einzelrohr {mm(v)}mm", f"Einzelrohr aus Aluminium für Rampen-Set, Länge {mm(v)}mm")
    if m := re.match(r"VRA-(\d+)CM-R$", c):
        return (f"Rundfüße für Rampe {m[1]} cm", f"Rundfüße für Rampen-Set, Podesthöhe {m[1]} cm")
    if m := re.match(r"VRLT-(\d+)CM(\d)-R$", c):
        return (f"Teleskop-Rundbein für Rampe {m[1]} cm, Typ {m[2]}", f"Teleskop-Rundbein für Rampen-Set, Podesthöhe {m[1]} cm, Typ {m[2]}")
    T = {"ER-TCSR": "T-Verbinder Anfang, rechts", "ER-TCSL": "T-Verbinder Anfang, links",
         "ER-TCER": "T-Verbinder Ende, rechts", "ER-TCEL": "T-Verbinder Ende, links", "ER-TCM": "T-Verbinder Mitte"}
    if c in T:
        return T[c], f"{T[c]} für Rampen-Set"
    FIX = {
        "ER-SE": ("Anfangselement Rampe", "Anfangselement (am Boden) für Rampen-Set"),
        "ER-EE": ("Endelement Rampe", "Endelement (an der Bühne) für Rampen-Set"),
        "SP0002": ("Verbinder-Set: Montageeinsatz und Schraube", "Ersatzteil-Set aus Montageeinsatz und Schraube"),
        "SP0012": ("Rechteckige Unterlegscheibe für variablen Steckfuß", "Rechteckige Ersatz-Unterlegscheibe für variablen Steckfuß"),
        "E8002": ("Halbkupplung M10 Tragkraft 200 kg, Rohr 50 mm", "Halbkupplung mit M10-Anschluss für Rohr Durchmesser 50mm\n- Tragkraft 200 kg"),
        "E38002-B": ("Halbkupplung Tragkraft 250 kg schwarz", "Halbkupplung für Rohr Durchmesser 48-51mm\n- Tragkraft 250 kg\n- Farbe schwarz"),
        "E8016": ("Schnellspann-Rohrschelle für Rohr 50 mm, Tragkraft 250 kg", "Schnellspann-Rohrschelle für Rohr Durchmesser 50mm\n- Tragkraft 250 kg"),
        "VSCS200": ("Drehkupplung Slim Tragkraft 200 kg, Rohr 48-51 mm", "Drehkupplung in schmaler Ausführung für Rohr Durchmesser 48-51mm\n- Tragkraft 200 kg"),
        "PROFILO-5M": ("Aluminiumprofil 60x60x2mm, Stange 5 m", "Aluminiumprofil 60x60x2mm für Beine, Stange 5.000mm zum Zuschneiden"),
        "TAPPO-PLASTICA": ("Schutzkappe aus Kunststoff", "Schutzkappe aus Kunststoff für Beinprofil 60x60mm"),
        "VPLI": ("Podestbegrenzer", "Podestbegrenzer, Zubehör für das Layher-System"),
        "E31-400": ("Gerades Rohr 4 m", "Gerades Aluminiumrohr, Länge 4.000mm"),
        "E32-300B": ("2-Punkt-Traverse 3,0 m schwarz", "Gerades Segment einer 2-Punkt-Traverse, Länge 3.000mm, Farbe schwarz"),
        "E32-400BM8": ("2-Punkt-Traverse 4,0 m 290x290x2mm", "Gerades Segment einer 2-Punkt-Traverse, Länge 4.000mm, Querschnitt 290x290x2mm, Farbe schwarz"),
    }
    return FIX.get(c)


# lingua -> (campo nome, campo descrizione, marca «generata», funzione)
LINGUE = {"it": ("nome", "desc", "auto", genera), "de": ("nome_de", "desc_de", "auto_de", genera_de)}


def main():
    html = HTML.read_text(encoding="utf-8")
    vecchio = PAT.search(html)
    if not vecchio:
        raise SystemExit("Blocco descrizioni non trovato: prima tools/importa_descrizioni.py")
    desc = json.loads(vecchio.group(2).replace("<\\/", "</"))
    items = json.loads(CAT.search(html).group(1).replace("<\\/", "</"))["items"] + EXTRA
    fatte, nulla = {"it": 0, "de": 0}, {"it": [], "de": []}
    for i in items:
        k = norm(i["code"])
        v = desc.get(k, {})
        for lg, (k_nome, k_desc, k_auto, fn) in LINGUE.items():
            if v.get(k_desc) and not v.get(k_auto):
                continue  # descrizione originale: non si tocca
            g = fn(i)
            if not g:
                nulla[lg].append(i["code"])
                continue
            v.setdefault("cod", i["code"])
            v[k_nome], v[k_desc], v[k_auto] = g[0], g[1].strip(), True
            fatte[lg] += 1
        if v:
            desc[k] = v
    payload = json.dumps(dict(sorted(desc.items())), ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    HTML.write_text(PAT.sub(lambda m: m.group(1) + payload + m.group(3), html, count=1), encoding="utf-8")
    for lg, nome in (("it", "italiano"), ("de", "tedesco")):
        print(f"{nome}: {fatte[lg]} descrizioni generate (da controllare)." + (f" Senza descrizione: {', '.join(nulla[lg])}" if nulla[lg] else ""))
    print("Ora cambia VERSION in sw.js.")


if __name__ == "__main__":
    main()
