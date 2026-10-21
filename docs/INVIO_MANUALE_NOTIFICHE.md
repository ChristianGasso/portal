# Avvio manuale notifiche AVIS da Portal

## Obiettivo

Nella schermata della singola AVIS, scheda **Invio notifiche**, l'admin puo avviare immediatamente uno dei due processi di notifica:
- `nuove_raccolte`: avvisi delle nuove raccolte gia in attesa;
- `scadenza_idoneita`: controllo rischio scadenza e invio push.

Il pulsante riguarda **esclusivamente l'AVIS selezionata**, non tutte le AVIS.
Non viene aggiunta alcuna tabella SQL. La tabella `avis_notifiche_automatiche` pensata inizialmente per gli interruttori non serve a questo flusso e non va installata.

## Funzionamento e sicurezza

1. Il browser invia al Portal l'ID interno della AVIS e il tipo di notifica.
2. `backend/avis/esegui-notifiche.php` verifica che il token appartenga a un amministratore Portal attivo.
3. Il backend ricava il codice sede a cinque cifre dalla tabella AVIS centrale.
4. Il backend esegue tramite `proc_open`, senza shell e con percorso del file fissato a codice, lo script CLI privato di AppDonatore passando `--avis=xxxxx`.
5. Lo script si connette **solo** al database collegato a quel codice AVIS e filtra **anche** la query degli eventi/donatori per `id_avis` corrispondente.
6. Il Portal mostra soltanto statistiche numeriche. Gli endpoint push e gli identificativi dei donatori non compaiono nella risposta.

I cron IONOS esistenti, chiamati senza `--avis`, continuano a elaborare tutte le AVIS. Gli invii gia effettuati restano protetti dalla logica di deduplicazione originale e i lock impediscono la contemporanea esecuzione sovrapposta.

## Requisiti del server IONOS

- PHP CLI: `/usr/bin/php8.4` (gia usato dagli attuali cron).
- Script privati: `/home/www/AppDonatore/scripts/send-collection-alerts.php` e `send-eligibility-expiry-alerts.php`.
- Il PHP del Portal deve poter leggere/eseguire gli script della directory sorella AppDonatore e poter utilizzare `proc_open`. Queste possibilita **devono essere verificate direttamente sul server IONOS** dopo il deploy: non e possibile garantirle con una sola verifica del repository.
- Se l'hosting non consente `proc_open` o l'accesso fra directory sorelle, va realizzato un bridge autenticato dedicato fra Portal e AppDonatore; non esporre direttamente gli script CLI tramite HTTP.

## Test obbligatori dopo la pubblicazione

1. Accedere come admin a un'AVIS A; verificare che appaiano i due pulsanti e la finestra di conferma.
2. Eseguire un processo e verificare che il riepilogo sia riferito alla sola AVIS A.
3. Verificare sul database dell'AVIS B che non siano state consumate sottoscrizioni o eventi di notifica.
4. Verificare la risposta quando il processo e gia in esecuzione, quando non ci sono notifiche pendenti e in caso di errore.
5. Verificare che le normali esecuzioni IONOS senza `--avis` restino operative.
6. Verificare il rifiuto di un utente Portal non amministratore e di un tipo di notifica non previsto.

Nota: la risposta di Web Push indica l'accettazione da parte del servizio push, non garantisce che il dispositivo abbia visualizzato effettivamente la notifica.
