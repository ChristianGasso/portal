# Regole repository

## Repository

`ChristianGasso/portal`

## Stato repository

Questo repository contiene il Portal amministrativo centrale SanguePro, comprensivo di:

- frontend React;
- backend PHP dedicato al Portal.

Il Portal resta separato da:

- gestionale operativo delle singole AVIS;
- app donatori;
- backend operativo del gestionale.

## URL pubblico

```txt
https://portal.sangueprogestionale.it
```

## Hosting

Il Portal viene pubblicato sul server IONOS nella directory:

```txt
/portal
```

Il deploy utilizza un accesso SFTP dedicato limitato alla directory `/portal`.

Le credenziali SFTP non devono mai essere salvate nel repository.

## Struttura progetto

Il frontend React resta nella struttura attuale del repository.

Il backend PHP dedicato al Portal deve essere creato sotto:

```txt
backend/
```

La struttura prevista è:

```txt
backend/
├── auth/
├── avis/
├── donatori/
└── config/
```

In fase di deploy il backend deve essere pubblicato sotto:

```txt
/portal/api/
```

Gli endpoint pubblici del Portal avranno quindi URL del tipo:

```txt
https://portal.sangueprogestionale.it/api/auth/...
https://portal.sangueprogestionale.it/api/avis/...
https://portal.sangueprogestionale.it/api/donatori/...
```

## Scopo del Portal

Il Portal è la console amministrativa centrale della piattaforma SanguePro.

Deve consentire agli amministratori di gestire, progressivamente:

- AVIS e sedi;
- stato delle AVIS;
- operatori collegati a ciascuna AVIS;
- ruoli e permessi degli operatori;
- configurazione dell'app donatori;
- link e token pubblici di registrazione donatori;
- utilizzo e limiti;
- configurazioni globali della piattaforma.

## Sicurezza

Il Portal deve essere accessibile esclusivamente agli utenti con ruolo:

```txt
admin
```

La sicurezza non deve mai dipendere esclusivamente dal frontend.

Nascondere pulsanti, pagine o route non costituisce un controllo di sicurezza.

Ogni endpoint backend del Portal deve verificare lato server:

- validità del token;
- identità dell'utente autenticato;
- stato attivo dell'account;
- ruolo `admin`;
- eventuali ulteriori autorizzazioni richieste.

Un token appartenente a un utente non admin non deve poter utilizzare endpoint amministrativi, anche tramite chiamate API dirette.

Le operazioni amministrative sensibili, incluse modifica, disabilitazione, cancellazione e gestione permessi, devono essere eseguibili esclusivamente con un token appartenente a un utente con ruolo `admin`.

## Backend Portal

Il backend specifico del Portal appartiene a questo repository:

```txt
ChristianGasso/portal
```

Percorso sorgente:

```txt
backend/...
```

Percorso pubblico dopo il deploy:

```txt
/portal/api/...
```

Il repository `ChristianGasso/server-app` resta il backend operativo del gestionale e non deve contenere i nuovi endpoint amministrativi del Portal, salvo decisione esplicita futura.

## Gestionale operativo

Il gestionale operativo delle singole AVIS resta nel repository:

```txt
ChristianGasso/Gestionale
```

Il Portal non deve essere utilizzato per le normali attività operative quotidiane di una singola AVIS.

Gli operatori sono gestiti nel contesto della relativa AVIS e non come sezione globale indipendente.

## App donatori

Il Portal amministra le configurazioni dell'app donatori.

Ogni AVIS potrà avere un token pubblico di registrazione associato internamente al proprio codice sede.

Il codice sede interno non deve essere inserito negli URL pubblici di registrazione.

Esempio:

```txt
https://app.sangueprogestionale.it/registrazione/<token-pubblico>
```

Il token pubblico:

- deve essere generato casualmente;
- non deve essere derivabile dal codice sede;
- deve essere stabile finché non viene rigenerato;
- deve poter essere revocato o rigenerato da un admin;
- deve essere risolto esclusivamente lato backend;
- deve identificare univocamente l'AVIS associata.

## Regole obbligatorie prima delle modifiche

Prima di creare o modificare file ChatGPT deve:

1. leggere questo `PROJECT_RULES.md`;
2. dichiarare il repository scelto;
3. dichiarare il percorso del file;
4. dichiarare il motivo della modifica;
5. dichiarare il tipo di modifica;
6. aspettare conferma esplicita dell'utente prima di eseguire il commit.

## Interfaccia

- Non usare `alert()`, `window.alert()`, `confirm()` o `window.confirm()`.
- Utilizzare componenti React per conferme e dialoghi.
- Utilizzare toast coerenti con la grafica del Portal per successi, errori e avvisi.
- L'interfaccia deve essere responsive.
- Il Portal deve mantenere una grafica professionale e coerente con l'ecosistema SanguePro.

## Separazione delle responsabilità

Per frontend e backend Portal:

```txt
ChristianGasso/portal
```

Per il backend operativo del gestionale:

```txt
ChristianGasso/server-app
```

Per il gestionale operativo:

```txt
ChristianGasso/Gestionale
```

Il vecchio gestionale:

```txt
ChristianGasso/avis-gestionale
```

può essere utilizzato esclusivamente in lettura e consultazione.

## Segreti

È vietato salvare nel repository:

- password;
- credenziali SFTP;
- secret JWT;
- chiavi API private;
- credenziali database;
- token amministrativi;
- altri segreti infrastrutturali.

I segreti devono essere gestiti tramite environment variables, configurazione server fuori repository o sistemi dedicati di secret management.
