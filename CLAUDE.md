# Istruzioni per Claude

## Git e pull request
- Dopo ogni modifica: commit, push del branch e **apri sempre tu la pull request** verso `main`, senza chiedere. Poi dai all'utente il link.
- `gh pr create` non funziona dalle sessioni Claude Code (GraphQL bloccato): usa la REST API, `gh api repos/Saibo1983/stagedeck_config/pulls -f base=main -f head=<branch> -f title=... -F body=@file`.
- Testi (commit, PR, risposte) in italiano.

## Progetto
- I prezzi non vanno mai nel repository: restano in `prezzi.json` (ignorato da git), che si consegna all'utente come file. I prezzi che non sono nel listino Excel (es. pezzi speciali dei palchi rotondi) stanno in `prezzi_extra.json`, anche lui fuori da git.
- Dopo ogni modifica a `index.html` o agli altri file in cache, cambia `VERSION` in `sw.js`.
- Gli articoli del listino con il campo `fattura` vengono da fatture di acquisto (righe azzurre dell'Excel): vanno segnalati nell'offerta, mai nel PDF né nel testo per il cliente.
