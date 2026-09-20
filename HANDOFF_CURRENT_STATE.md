# HANDOFF - STATO ATTUALE DEL PROGETTO & SPECIFICA PROSSIMA ETAPA

**Data aggiornamento**: 2026-09-20  
**Ultimo commit Git**: `f563bcd` - `feat: UX refinement - archival vs deletion, textual benefits, redesigned quick points, in-card operator panel`  
**Branch Git**: `main` (working tree clean, nessun segreto o dump tracciato)  
**Database**: MariaDB / MySQL locale (`pardinitec_vantaggi`), migrazioni applicate fino alla `0017`.

---

## 1. Stato Esatto Attuale del Sistema

### 1.1 Separazione Canonica dei Prodotti
La voce unificata legacy *"Offerte Vantaggi & VIP"* è stata definitivamente eliminata da ogni modulo e interfaccia. I tre prodotti sono segregati e indipendenti:
1. **Punti** (`/dashboard/points` e `/dashboard/rewards`):
   - Modulo fedeltà ad accumulo punti e catalogo premi dedicati con costi in punti.
2. **Vantaggi** (`/dashboard/vantaggi`):
   - Sconti e promozioni commerciali per i clienti del circuito Vantaggi.
   - Supporto a tre tipologie di sconto:
     - **Percentuale (%)**: con input decimale centesimale (`step="0.01"`).
     - **Importo fisso (€)**: sconto monetario fisso all'italiana.
     - **Vantaggio libero / promozione testuale (`text`)**: senza percentuale né importo obbligatorio, solo titolo, descrizione e periodo di validità (formattato come *"Vantaggio libero"*).
3. **VIP** (`/dashboard/vip`):
   - Benefici ed esperienze esclusive riservate ai clienti VIP, con sezione separata per promozioni Vantaggi estese al profilo VIP.

### 1.2 Archiviazione vs Eliminazione Fisica (Migrazione 0017)
- **Migrazione 0017**: ampliamento ENUM status a `'active'`, `'inactive'`, `'archived'` sulle tabelle `rewards` e `offers`.
- **Regola di eliminazione**:
  - Se un premio o un'offerta ha **0 utilizzi storici**: viene cancellato fisicamente dal database (`DELETE`).
  - Se possiede **movimenti contabili storici**: viene salvaguardato il registro contabile e il record viene marcato come `status = 'archived'`.
- **Separazione viste**: tab *"🏆 Premi/Offerte in catalogo"* e *"📦 Contenuti archiviati"*, con possibilità di **Ripristina** (`POST .../restore`) nel catalogo attivo come inattivo.
- **Esclusione pubblica rigorosa**: tutti gli endpoint pubblici e la scheda `/c/{token}` escludono categoricamente elementi inattivi o archiviati.

### 1.3 Redesign Accredito Punti nel Dashboard (`PointsPage.tsx`)
- Dopo aver cercato e selezionato il cliente (per nome, telefono, email o ID numerico esatto):
  - **Modalità predefinita rapida**: pulsanti tattili `[ +1 pt ]`, `[ +5 pt ]`, `[ +10 pt ]` ad esecuzione immediata in 1 clic.
  - **Altro importo**: campo numerico rapido per inserire una quantità specifica di punti con conferma a 1 clic.
  - **Modalità secondaria `Calcola da scontrino`**: calcolatore live da importo spesa in € basato sulla regola del negozio.
  - **Sezione 3 separata `Rettifica punti`**: scheda dedicata per correzioni contabili, storni o resi merce con causale obbligatoria (+/- punti).

### 1.4 Ficha Digitale Unificata `/c/{token}` (`PublicCardPage.tsx`)
- **Visitante anonimo**: visualizza esclusivamente la carta cliente digitale (QR Code centrato, saldo punti, barra progresso prossimo premio, bottoni modali per consultare offerte/premi/storico, e link di login). Zero controlli operativi, zero PII esposta.
- **Operatore autenticato dello stesso punto vendita** (Owner, Manager, Staff con `points.adjust`):
  - Visualizza all'interno della stessa scheda il pannello **"⚡ Accredita punti al banco"** con pulsanti tattili:
    - `[ +1 pt ]`, `[ +5 pt ]`, `[ +10 pt ]`: accredito immediato a 1 tocco, banner di conferma visiva verde, e aggiornamento istantaneo del saldo locale senza ricaricare la pagina (`fetchCard(true)` sincronizza in background).
    - `[ ✍️ Altro importo ]`: input inline per inserire i punti desiderati.
    - `[ 🛒 Da acquisto ]`: input inline per totale scontrino in € con calcolo automatico dei punti.
    - Link per rettifica manuale avanzata e pulsante per riscatto premi.
- **Isolamento multi-tenant**: operatori di un altro negozio (cross-tenant) ricevono `403 Forbidden` (`state: 'forbidden'`), impedendo qualsiasi visualizzazione o operazione non autorizzata.

### 1.5 Sicurezza e Crittografia
- **Migrazione 0016**: credenziali digitali memorizzate in formato cifrato AES-256-GCM (`encrypted_token`, `encryption_iv`, `encryption_tag`) utilizzando `TOKEN_ENCRYPTION_KEY` a 32 byte in `api/.env`.
- **Risoluzione pubblica**: continua ad avvenire tramite lookup SHA-256 `public_token_hash`.
- **Nessuna esposizione**: token in chiaro mai memorizzati a riposo né esposti nei log o repository.
- **Headers di sicurezza**: risposte con link della credenziale protette da `Cache-Control: no-store`.

### 1.6 Stato della Suite di Test e Build
- **Vitest**: 16 suite di test / **79 test unitari e di integrazione superati con successo (100% OK)**.
- **Build Frontend**: `npm run build` completata con 0 errori TypeScript/Vite.
- **Lint Backend**: `php -l` eseguito con 0 errori su tutti i servizi e controller.
- **Git**: Working tree pulito al commit `f563bcd`.

---

## 2. Cambiamenti Pendenti (Roadmap Immediata)

Prima della messa in produzione o di ulteriori espansioni, i compiti pendenti pianificati sono:
1. **Flusso Tarjetas Preprogramadas (Pre-printed / Pre-encoded NFC & QR Cards)**:
   - Registrazione di lotti di carte fisiche vergini prima dell'assegnazione al cliente.
   - Procedura di associazione rapida al banco tramite scansione del QR/NFC della carta vergine.
2. **Sistema di Bloqueo por Escaneo & Protezione Anti-Frode**:
   - Rate limiting rafforzato su scansioni fallite (anti-bruteforce su `/c/{token}`).
   - Meccanismo di blocco preventivo/congelamento per scansioni anomale o sospetto abuso (`suspended`).
   - Sblocco amministrativo guidato dal Dashboard per titolari e responsabili.
3. **Verifica end-to-end con dispositivi fisici** (fotocamera smartphone, lettore barcode ottico da cassa e lettore Web NFC).

---

## 3. Prompt Completo per la Prossima Implementazione

> [!IMPORTANT]
> **ISTRUZIONI DI NON-ESECUZIONE ATTUALE**: Il seguente prompt descrive in modo completo e dettagliato i requisiti per la prossima sessione di lavoro. **Non implementare né modificare codice in questo turno.**

```markdown
================================================================================
PROMPT PER LA PROSSIMA SESSIONE: TARJETAS PREPROGRAMADAS E BLOQUEO POR ESCANEO
================================================================================

OBIETTIVO
Implementare il ciclo operativo completo per l'utilizzo di tessere plastiche / NFC / portachiavi QR "pre-programmati" (stampati in tipografia prima di essere assegnati a un cliente) e integrare un meccanismo di sicurezza avanzato di "blocco per scansione" (anti-frode, congelamento per abuso e sblocco operatore).

--------------------------------------------------------------------------------
1. TARJETAS PREPROGRAMADAS (CARTE FISICHE PRE-STAMPATE)
--------------------------------------------------------------------------------
Contesto:
Nei negozi fisici le tessere non vengono create digitalmente una ad una: il commerciante riceve un box con centinaia di tessere in PVC con chip NFC e QR code già stampati con un URL univoco e fisso:
https://vantaggi.club/c/{token_fisico_vergine}

Requisiti Funzionali:
1.1 Stato Vergine della Tessera:
- Le carte fisiche generate dal Super Admin o assegnate al negozio nascono con stato `issued` (assegnata al negozio ma non ancora associata a nessun cliente).
- Se un cliente finale o chiunque scansiona una carta in stato `issued`, la pagina `/c/{token}` deve mostrare una schermata pulita:
  "Carta non ancora attivata. Presentala in cassa per associarla al tuo conto."

1.2 Associazione Rapida in Cassa tramite Scansione:
- Se ad aprire l'URL `/c/{token}` di una carta vergine è un operatore loggato dello stesso punto vendita (o se l'operatore preme "Associa Carta Fisica" dal Dashboard ed effettua la scansione):
  - La schermata riconosce istantaneamente che si tratta di una carta vergine del proprio negozio.
  - Mostra il pulsante primario: "⚡ Associa questa carta a un cliente".
  - Consente di cercare un cliente esistente in 2 secondi oppure di registrare un nuovo cliente rapido (Nome, Cognome, Telefono).
  - Al confermare, la carta passa atomicamente da `issued` ad `active` e viene collegata al `loyalty_account_id` del cliente.
  - La pagina si aggiorna immediatamente mostrando la ficha operativa con i pulsanti di accredito punti (+1, +5, +10).

1.3 Riassegnazione e Smarrimento:
- Se il cliente smarrisce la carta fisica:
  - Il commerciante prende una NUOVA carta vergine dal cassetto.
  - Clicca "Sostituisci carta smarrita" dal profilo del cliente, scansiona la nuova tessera.
  - La vecchia tessera fisica viene marcata come `replaced` / `revoked` (il suo token risponderà sempre "Carta sostituita").
  - La nuova tessera eredita saldo punti, storico e benefici senza alcuna perdita contabile.

--------------------------------------------------------------------------------
2. BLOQUEO POR ESCANEO (PROTEZIONE ANTI-FRODE & RATE LIMITING)
--------------------------------------------------------------------------------
Contesto:
Essendo gli URL `/c/{token}` pubblici e accessibili tramite fotocamera o NFC, occorre impedire attacchi di enumerazione, furto di punti, scraping o duplicazione non autorizzata.

Requisiti di Sicurezza:
2.1 Rate Limiting Anti-Bruteforce su Token Inesistenti:
- Se dallo stesso indirizzo IP vengono inviate più di 10 richieste consecutive a token `/c/{token}` inesistenti o non validi (HTTP 404) nell'arco di 5 minuti:
  - L'IP viene temporaneamente bloccato con HTTP 429 Too Many Requests per 15 minuti.
  - Header `Retry-After: 900` incluso nella risposta.
  - Evento registrato nella tabella `audit_logs` come `security.token_scan_abuse`.

2.2 Congelamento Preventivo della Carta ("Blocco per Scansione Sospetta"):
- Rilevamento di scansioni anomale:
  - Se la stessa credenziale viene utilizzata per tentativi di accredito/riscatto con credenziali operatore non valide o da sessioni concorrenti anomale, il sistema deve permettere il congelamento immediato dello stato della carta a `suspended`.
  - Possibilità per il commerciante di attivare manualmente il "Blocco antifrode / Sospensione carta" con 1 clic dalla scheda cliente in caso di furto segnalato o uso anomalo.

2.3 Comportamento della Carta Sospesa:
- Quando `status = 'suspended'`:
  - L'URL `/c/{token}` mostra un banner rosso evidente:
    "Carta Temporaneamente Sospesa per Motivi di Sicurezza. Rivolgiti al personale del punto vendita."
  - Tutti i pulsanti di accredito punti, riscatto premi e applicazione offerte vengono disabilitati e bloccati a livello di backend con errore 403.

2.4 Sblocco Amministrativo Verificato:
- Solo Owner, Manager o Super Admin possono riattivare la tessera sospesa (`POST /api/v1/businesses/{id}/cards/{cardId}/reactivate`).
- L'operazione richiede causale di sblocco e viene tracciata nell'audit trail.

--------------------------------------------------------------------------------
3. CRITERI DI ACCETTAZIONE E VERIFICA
--------------------------------------------------------------------------------
- Test automatici in Vitest che coprano:
  1. Scansione di tessera vergine da anonimo -> vista "Carta non attivata".
  2. Scansione di tessera vergine da operatore -> modale/flusso di associazione rapida.
  3. Tessera sospesa -> blocco totale di accredito punti e riscatto offerte.
  4. Sblocco da parte del manager -> ripristino istantaneo dello stato attivo.
- Zero modifiche distruttive alle migrazioni precedenti 0001-0017.
- Nessuna memorizzazione di token in chiaro.
================================================================================
```
