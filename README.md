# SanguePro Portal

Frontend del Portale amministrativo centrale SanguePro.

## URL

Produzione:

```txt
https://portal.sangueprogestionale.it
```

## Scopo

Il Portal è destinato esclusivamente agli amministratori centrali della piattaforma e gestirà progressivamente:

- AVIS e sedi;
- account operatori;
- ruoli e permessi;
- configurazioni dell'app donatori;
- token pubblici di registrazione;
- utilizzo, limiti e configurazioni globali.

## Stack

- React
- Vite

## Sviluppo locale

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

La build di produzione viene generata nella cartella `dist/` e pubblicata sul webspace IONOS dedicato al Portal.

## Regole operative

Prima di modificare il progetto leggere `PROJECT_RULES.md`.

Il backend operativo è mantenuto separatamente nel repository `ChristianGasso/server-app`.
