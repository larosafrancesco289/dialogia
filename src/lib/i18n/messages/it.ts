// Italiano. Typed from the English source (en.ts); GLOSSARY.md keeps the words
// used throughout. Informal address, plain words, the app's warm voice.

import type en from './en';
import type { Translation } from '@/lib/i18n/catalogue';

const messages: Translation<typeof en> = {
  // Shared
  'common.notNow': 'Non ora',
  'common.off': 'Disattivata',
  'common.cancel': 'Annulla',
  'common.save': 'Salva',
  'common.delete': 'Elimina',
  'common.close': 'Chiudi',
  'common.dismiss': 'Chiudi',

  // Welcome and first run
  'welcome.headline.first': 'Ti diamo il benvenuto in {name}',
  'welcome.headline.learn': 'Che cosa vuoi {word}?',
  'welcome.headline.learnWord': 'imparare',
  'welcome.headline.chat': 'Inizia un nuovo {word}',
  'welcome.headline.chatWord': 'dialogo',
  'welcome.subline.withTutor':
    'Parla con i migliori modelli di IA, o impara qualcosa con un tutor.',
  'welcome.subline': 'Parla con i migliori modelli di IA.',
  'welcome.connectTitle': 'Prima di tutto, collega un modello',
  'welcome.connected': 'Collegato',
  'setup.title': 'Collega un modello',
  'setup.needsKey': '{model} funziona su {provider}. Aggiungi la tua chiave {provider} per usarlo.',
  'connect.lead.openrouter':
    'Incolla una chiave di OpenRouter. Una sola chiave apre quasi tutti i modelli, e paghi OpenRouter solo per quello che usi.',
  'connect.lead.anthropic':
    'Incolla una chiave di Anthropic per usare i modelli Claude. Paghi Anthropic solo per quello che usi.',
  'connect.lead.local':
    'Incolla l’indirizzo di un server di modelli che gestisci tu, come Ollama o LM Studio. Quasi sempre non serve una chiave.',
  'connect.steps.what':
    'Una chiave è come una password: permette a Dialogia di usare il tuo account {provider}. Paghi {provider} direttamente per quello che usi.',
  'connect.steps.account': '{action} su {link}.',
  'connect.steps.accountAction': 'Crea un account',
  'connect.steps.credit':
    '{action} nella sezione {page}. Serve una carta, e per iniziare bastano pochi dollari.',
  'connect.steps.creditAction': 'Aggiungi un po’ di credito',
  'connect.steps.key': '{action} nella sezione {link}, copiala e incollala qui sopra.',
  'connect.steps.keyAction': 'Crea una chiave',
  'connect.steps.free':
    'Vuoi solo provare? OpenRouter ha anche modelli gratuiti, con “(free)” nel nome. Non chiedono credito, ma permettono solo un numero limitato di messaggi al giorno.',
  'connect.serverAddress': 'Indirizzo del server',
  'connect.submit': 'Collega',
  'connect.howToGetKey': 'Come ottengo una chiave?',
  'connect.otherWays': 'Altri modi per collegarti',
  'connect.privacy.key': 'La tua chiave e le tue chat restano in questo browser.',
  'connect.privacy.server': 'Le tue chat restano in questo browser.',
  'connect.option.openrouter': 'Chiave OpenRouter',
  'connect.option.openrouterNote': 'Quasi tutti i modelli, una chiave',
  'connect.option.anthropic': 'Chiave Anthropic',
  'connect.option.anthropicNote': 'Solo modelli Claude',
  'connect.option.local': 'Il tuo server',
  'connect.option.localNote': 'Ollama, LM Studio e simili',
  'connect.keyRefused':
    '{provider} non ha accettato quella chiave. Controlla di averla copiata tutta, oppure creane una nuova.',
  'connect.serverSilent': 'Da quell’indirizzo non è arrivato nessun modello. Il server è acceso?',
  'connect.keyFormat':
    'Questa non sembra una chiave {provider}: le chiavi {provider} iniziano con {prefix}. Copia tutta la chiave e incollala di nuovo.',
  'connect.serverUnreachable': 'Quell’indirizzo non risponde.',
  'connect.keyNotSaved':
    'Questo browser non è riuscito a salvare la chiave: funziona solo finché non chiudi la pagina.',
  'connect.invalidAddress':
    'Scrivi l’indirizzo completo, come http://localhost:11434/v1, con http:// o https:// all’inizio.',

  // Composer
  'composer.placeholder': 'Chiedi qualcosa',
  'composer.slashSuggestions': 'Suggerimenti di comandi',
  'composer.stop': 'Ferma la risposta',
  'composer.writingElsewhere': 'Sta scrivendo in un’altra scheda…',
  'composer.attach': 'Allega file',
  'composer.memory.label': 'Tieni questa chat fuori dalla memoria',
  'composer.memory.on':
    'Memoria: attiva in questa chat. Disattivala per tenerla fuori dalla memoria.',
  'composer.memory.off': 'Memoria: disattivata in questa chat. Niente viene letto né ricordato.',
  'composer.memory.offLabel': 'Memoria off',
  'composer.sendLabel': 'Invia messaggio',
  'composer.send': 'Invia',
  'composer.sendFailed':
    'Il messaggio non è stato inviato. La bozza è di nuovo nel campo di scrittura.',
  'composer.sendFailedElsewhere':
    'Il messaggio non è stato inviato. La bozza è di nuovo nella sua chat.',

  // Thinking effort
  'effort.title': 'Livello di ragionamento',
  'effort.buttonTitle': 'Ragionamento: {level}',
  'effort.default': 'predefinito',
  'effort.modelDefault': '{level} (predefinito del modello)',
  'effort.none': 'Nessuno',
  'effort.minimal': 'Minimo',
  'effort.low': 'Basso',
  'effort.medium': 'Medio',
  'effort.high': 'Alto',
  'effort.xhigh': 'Molto alto',
  'effort.max': 'Massimo',
  'effort.hint.none': 'Risponde subito',
  'effort.hint.minimal': 'Appena un pensiero',
  'effort.hint.low': 'Ci pensa un attimo',
  'effort.hint.medium': 'Ci ragiona sopra',
  'effort.hint.high': 'Ci pensa bene',
  'effort.hint.xhigh': 'Ci pensa a fondo',
  'effort.hint.max': 'Si prende tutto il tempo che serve',

  // Web search
  'search.title': 'Ricerca web',
  'search.short': 'Cerca',
  'search.state.on': 'Ricerca web: attiva ({provider})',
  'search.state.off': 'Ricerca web: disattivata ({provider})',
  'search.builtIn': 'Integrata',
  'search.builtInDescription': 'La ricerca del fornitore del modello',
  'search.toolDescription': 'Cerca quando serve e legge le pagine che trova',
  'search.openrouter': 'Ricerca OpenRouter',

  // Slash commands (the commands themselves stay in English)
  'slash.model': 'Rispondi con un altro modello',
  'slash.search': 'Attiva o disattiva la ricerca web',
  'slash.reasoning': 'Quanto ragiona il modello',
  'slash.help': 'Cosa fanno questi comandi',
  'slash.typeModel': 'Scrivi il nome di un modello…',
  'slash.searchOn': 'Ricerca web attiva in questa chat.',
  'slash.searchOff': 'Ricerca web disattivata in questa chat.',
  'slash.searchOnNext': 'La ricerca web sarà attiva nella prossima chat.',
  'slash.searchOffNext': 'La ricerca web sarà disattivata nella prossima chat.',
  'slash.noThinking':
    'Questo modello risponde senza ragionare prima, quindi non c’è niente da impostare.',
  'slash.effortUnavailable': 'Questo modello non offre il livello “{level}”.',
  'slash.effortSet': 'Livello di ragionamento impostato su “{level}”.',
  'slash.noSuchModel': 'Nessun modello si chiama {name}.',
  'slash.modelSet': 'Ora risponde {name}.',
  'slash.helpText':
    'Scrivi /model e un nome per cambiare modello, /search on oppure off per la ricerca web, e /reasoning con un livello come low o high.',

  // Chat
  'chat.opening': 'Apro la chat…',
  'chat.showEarlier': {
    one: 'Mostra il messaggio precedente ({count})',
    other: 'Mostra i messaggi precedenti ({count})',
  },
  'chat.scrollToBottom': 'Vai in fondo',

  // Sidebar and chats
  'chat.untitled': 'Nuova chat',
  'chat.branchMark': '(ramo)',

  // A message and its actions
  'message.saveShortcut': '{key} Invio per salvare',
  'message.copy': 'Copia',
  'message.copied': 'Copiato',
  'message.copyLabel': 'Copia il messaggio',
  'message.edit': 'Modifica',
  'message.editing': 'In modifica…',
  'message.editMessage': 'Modifica il messaggio',
  'message.editReply': 'Modifica la risposta',
  'message.editPlaceholder': 'Modifica il tuo messaggio…',
  'message.editReplyPlaceholder': 'Modifica la risposta…',
  'message.showLess': 'Mostra meno',
  'message.showAll': 'Mostra tutto',
  'message.writing': 'Sta scrivendo una risposta',
  'message.stillWorking': 'Ci sta ancora lavorando',
  'message.tryAgain': 'Riprova',
  'message.branch': 'Ramifica in una nuova chat',
  'message.selectText': 'Seleziona il testo',
  'message.sheet.reply': 'Risposta',
  'message.sheet.yours': 'Il tuo messaggio',
  'message.sheet.replyActions': 'Azioni sulla risposta',
  'message.sheet.messageActions': 'Azioni sul messaggio',
  'message.filtered.title': 'Rifiutato dal filtro di sicurezza del modello',
  'message.filtered.cutShort':
    'La risposta è stata interrotta dal filtro di sicurezza del fornitore.',
  'message.filtered.blocked':
    'Un filtro di sicurezza ha bloccato la richiesta prima che il modello potesse rispondere.',
  'message.filtered.reason': 'Motivo indicato: {reason}.',
  'message.youSaid': 'Tu:',

  // A reply's versions (Try again keeps the old one)
  'versions.label': 'Versione {at} di {count}',
  'versions.labelWithModel': 'Versione {at} di {count}, {model}',
  'versions.group': 'Versioni di questa risposta',
  'versions.onlyLatest': 'Solo l’ultima risposta può cambiare versione',
  'versions.previous': 'Versione precedente',
  'versions.next': 'Versione successiva',
  'versions.delete': 'Elimina questa versione',
  'versions.deleteNumbered': 'Elimina la versione {at} di {count}',
  'versions.deleteTitle': 'Eliminare questa versione?',
  'versions.deleteBody':
    'Questa versione sparirà per sempre. La risposta resta, con un’altra versione.',

  // The reasoning ledger: what the model thought and which tools it used
  'activity.thinking': 'Sta pensando',
  'activity.thought': 'Ha pensato',
  'activity.thoughtFor': 'per {duration}',
  'activity.words': { one: '{count} parola', other: '{count} parole' },
  'activity.tools': { one: '{count} strumento', other: '{count} strumenti' },
  'activity.searches': { one: '{count} ricerca', other: '{count} ricerche' },
  'activity.waiting': 'In attesa del modello… {seconds} s',
  'activity.searchingWeb': 'Cerca sul web',
  'activity.searchingFor': 'Cerca: {query}',
  'activity.searchingSources': 'Cerca le fonti',
  'activity.searchFailed': 'Ricerca non riuscita',
  'activity.tool.fetch': 'Legge una pagina',
  'activity.tool.memoryRead': 'Controlla la memoria',
  'activity.tool.memorySave': 'Salva in memoria',
  'activity.tool.memoryForget': 'Dimentica una nota',
  'activity.notFound': 'Non trovato',
  'activity.notSaved': 'Non salvato',
  'activity.searching': 'Cerca',
  'activity.running': 'In corso',
  'activity.notApplied': 'Non applicato',
  'activity.stopped': 'Fermato',
  'activity.failed': 'Non riuscito',
  'activity.noResults': 'Nessun risultato',
  'activity.copyThinking': 'Copia il ragionamento',
  'activity.turnFailed': 'Il turno si è interrotto prima che questa chiamata partisse',
  'sources.found': { one: '{count} fonte trovata', other: '{count} fonti trovate' },
  'sources.looking': 'Cerca le fonti…',
  'sources.lookingFor': 'Cerca le fonti: {query}…',
  'sources.untitled': 'Fonte senza titolo',

  // Ends with {title} in every language: the renderer knows a citation by the words before it.
  'sources.citation': 'Fonte {number}: {title}',

  // How a reply ended
  'ending.stopped': 'Fermata prima della fine.',
  'ending.failed': 'Interrotta da un errore prima della fine.',
  'ending.interrupted': 'Interrotta: la pagina si è chiusa mentre veniva scritta.',
  'ending.nothing.stopped': 'Fermata prima che la risposta iniziasse.',
  'ending.nothing.failed': 'Questa risposta non è riuscita.',
  'ending.nothing.interrupted': 'La pagina si è chiusa prima che la risposta iniziasse.',
  'ending.details': 'Cosa ha detto il fornitore',
  'ending.length': 'Fermata al limite di lunghezza.',
  'ending.announce.stopped': 'Risposta fermata',
  'ending.announce.failed': 'Risposta non riuscita',
  'ending.announce.length': 'Risposta fermata al limite di lunghezza',
  'ending.announce.finished': 'Risposta completata',

  // The line under a reply: model, speed, cost
  'colophon.firstWord': 'prima parola in {time}',
  'colophon.tokens': { one: '{count} token', other: '{count} token' },
  'colophon.speed': '{rate} token/s',
  'colophon.under': 'meno di {amount}',

  // Attachments
  'attachments.openLarger': 'Apri più grande',
  'attachments.image': 'immagine',
  'attachments.audio': 'Audio',
  'attachments.audioAttached': 'Audio allegato',
  'attachments.pages': { one: '{count} pagina', other: '{count} pagine' },
  'attachments.attachment': 'allegato',
  'attachments.remove': 'Rimuovi',
  'attachments.removeNamed': 'Rimuovi {name}',
  'attachments.attachedAudio': 'Allegato (mp3/wav)',
  'attachments.attachedPdf': 'Allegato (letto nel tuo browser)',

  // Developer views (Settings › Appearance › Developer)
  'debug.request': 'Richiesta di debug',
  'debug.toolActivity': 'Attività degli strumenti',
  'debug.overview': 'Panoramica',
  'debug.toolDefinitions': 'Definizioni degli strumenti',
  'debug.plugins': 'Plugin',
  'debug.messages': 'Messaggi',
  'debug.noContent': 'Nessun contenuto visibile',
  'debug.toolCalls': 'Chiamate a strumenti: {names}',
  'debug.rawJson': 'JSON della richiesta',
  'debug.copyRequest': 'Copia la richiesta',
  'toolLog.heading': 'Chiamate a strumenti ({count})',
  'toolLog.input': 'Input',
  'toolLog.output': 'Output',
  'toolLog.copy.input': 'Copia il JSON di input',
  'toolLog.copy.output': 'Copia il JSON di output',
  'toolLog.metadata': 'Metadati',
  'toolLog.category.search': 'Ricerca',
  'toolLog.category.tutor': 'Tutor',
  'toolLog.category.planning': 'Pianificazione',
  'toolLog.category.system': 'Sistema',
  'toolLog.category.other': 'Altro',
  'toolLog.searchResults': {
    one: 'Ricerca web ({count} risultato)',
    other: 'Ricerca web ({count} risultati)',
  },
  'toolLog.searchError': 'Errore nella ricerca web',
  'toolLog.completed': 'Completata',
  'toolLog.pending': 'In attesa',
  'toolLog.round': 'Giro {round}',
  'toolLog.cached': 'Risultato in cache',
  'toolLog.usedInReply': 'Usato nella risposta',
  'toolLog.learnerUpdated': 'Modello dello studente aggiornato',
  'toolLog.planUpdated': 'Piano aggiornato',

  // Models
  'models.caps.reasoning': 'Ragiona prima di rispondere',
  'models.caps.vision': 'Legge le immagini',
  'models.caps.audio': 'Ascolta l’audio',
  'models.caps.image': 'Crea immagini',
  'models.caps.zdr': 'Non conserva nessun tuo dato (conservazione zero)',
  'models.contextHint': 'Quanto riesce a leggere in una volta',
  'models.contextTokens': { one: '{count} token', other: '{count} token' },
  'models.curated.claudeHaiku': 'Veloce, economico e scrive bene; le nuove chat partono da qui',
  'models.curated.gptLuna': 'Veloce, economico e sintetico; bravo con gli strumenti',
  'models.curated.tutor':
    'Veloce, economico e un insegnante paziente e caloroso; il tutor di partenza',
  'models.curated.gptSol': 'La linea principale di OpenAI, per ragionamenti e testi più difficili',
  'models.curated.claudeOpus':
    'Lavoro accurato e di lunga durata; il predefinito consigliato da Anthropic',
  'models.curated.claudeFable': 'Il Claude più capace, per i problemi più difficili; il più caro',
  'models.curated.geminiFlash':
    'Il più recente di Google; veloce con immagini e documenti molto lunghi',
  'models.curated.kimi': 'Pesi aperti, forte nel codice, ottimo rapporto qualità-prezzo',
  'models.curated.grok': 'Il Grok più recente, per lavori lunghi con gli strumenti',
  'models.curated.image': 'Crea e modifica immagini',

  // Settings › Models
  'models.default.follows': 'Le nuove chat usano il modello che hai scelto per ultimo.',
  'models.default.startsHere':
    'Le nuove chat partono da qui finché non scegli un modello in una chat.',
  'models.default.reset': 'Ripristina',
  'models.default.refresh': 'Aggiorna l’elenco',
  'models.favorites.hint': 'I modelli che il selettore propone accanto ai consigliati.',
  'models.favorites.empty': 'Ancora nessun preferito.',
  'models.favorites.add': 'Aggiungi un modello',
  'models.zdr': 'Solo conservazione zero dei dati',
  'models.zdrHint': 'Mostra solo modelli di fornitori che non conservano i tuoi prompt.',
  'models.familyMoved':
    '{family} ora è {model}: le nuove chat lo usano, quelle già avviate tengono il loro.',
  'models.defaultMissing':
    '{model} non è offerto dai tuoi fornitori, quindi le nuove chat partono con {fallback}.',
  'models.hiddenZdr':
    'I modelli di {server} sono nascosti: la conservazione zero è attiva e solo OpenRouter può garantirla.',
  'models.unavailableKey': 'Modelli di {server} non disponibili: la chiave è stata rifiutata.',
  'models.unavailableLimited': 'Modelli di {server} non disponibili: troppe richieste.',
  'models.unreachable': 'Impossibile raggiungere {server}.',
  'models.unavailable': 'Modelli di {server} non disponibili al momento.',
  'pricing.free': 'Gratis',
  'pricing.in': 'input {rate}/M',
  'pricing.out': 'output {rate}/M',
  'pricing.inFree': 'input gratis',
  'pricing.outFree': 'output gratis',

  // The model picker
  'picker.choose': 'Scegli un modello',
  'picker.search': 'Cerca modelli',
  'picker.results': 'Risultati',
  'picker.recommended': 'Consigliati',
  'picker.favorites': 'I tuoi preferiti',
  'picker.servers': 'I tuoi server',
  'picker.unavailableZdr': '{model}: non disponibile con la conservazione zero attiva',
  'picker.empty': 'Ancora nessun modello. Collega un fornitore per scegliere tra i suoi modelli.',
  'picker.noMatch': 'Nessun modello corrisponde.',
  'picker.noneFound': 'Nessun modello trovato',
  'picker.inUse': ', in uso',
  'picker.removeFavorite': 'Rimuovi dai preferiti',
  'picker.removeFavoriteNamed': 'Rimuovi {model} dai preferiti',
  'regenerate.with': 'Riprova con',
  'regenerate.withAnother': 'Riprova con un altro modello',
  'regenerate.sameModel': 'stesso modello',
  'sidebar.newChat': 'Nuova chat',
  'sidebar.createFolder': 'Crea una cartella',
  'sidebar.folders': 'Cartelle',
  'sidebar.search': 'Cerca nelle chat',
  'sidebar.noMatch': 'Nessuna chat corrisponde a “{query}”.',
  'sidebar.today': 'Oggi',
  'sidebar.previous7': 'Ultimi 7 giorni',
  'sidebar.previous30': 'Ultimi 30 giorni',
  'sidebar.earlier': 'Prima',
  'chatRow.name': 'Nome della chat',
  'chatRow.tutoring': 'Sessione di studio:',
  'chatRow.rename': 'Rinomina',
  'chatRow.renameNamed': 'Rinomina “{title}”',
  'chatRow.move': 'Sposta in una cartella',
  'chatRow.moveNamed': 'Sposta “{title}” in una cartella',
  'chatRow.deleteNamed': 'Elimina “{title}”',
  'chatRow.actionsFor': 'Azioni per {title}',
  'chatRow.deleteTitle': 'Eliminare questa chat?',
  'chatRow.deleteBody': '“{title}” e i suoi messaggi spariranno per sempre.',
  'folder.namePlaceholder': 'Nome della cartella',
  'folder.newName': 'Nome della nuova cartella',
  'folder.actionsFor': 'Azioni per la cartella {name}',
  'folder.rename': 'Rinomina la cartella',
  'folder.delete': 'Elimina la cartella',
  'folder.deleteTitle': 'Eliminare questa cartella?',
  'folder.deleteBodyChats': 'Le chat in “{name}” restano: escono dalla cartella.',
  'folder.deleteBodyEmpty': '“{name}” è vuota.',
  'folder.count': { one: '{count} chat', other: '{count} chat' },
  'folder.newDefault': 'Nuova cartella',
  'move.label': 'Sposta {title} in una cartella',
  'move.title': 'Sposta “{title}”',
  'move.noFolder': 'Nessuna cartella',
  'move.newFolder': 'Nuova cartella…',
  'move.heading': 'Sposta in',

  // Header, drawer and pages
  'nav.memory': 'Memoria',
  'nav.settings': 'Impostazioni',
  'nav.learningHub': 'Percorso',
  'drawer.chats': 'Chat',
  'drawer.open': 'Apri le chat',
  'header.toggleSidebar': 'Mostra o nascondi la barra laterale',
  'header.expandSidebar': 'Apri la barra laterale',
  'header.collapseSidebar': 'Chiudi la barra laterale',
  'header.openMemory': 'Apri la memoria',
  'header.openSettings': 'Apri le impostazioni',
  'learnTools.notice':
    '{model} non sa usare gli strumenti, quindi in Impara può solo chattare: niente piano e niente quiz.',
  'learnTools.chooseModel': 'Scegli un altro modello',
  'learnTools.turnOnTools': 'Attiva Strumenti nelle Impostazioni',
  'header.tutorModel': 'Modello del tutor: {model}. Puoi cambiarlo nelle Impostazioni.',
  'lightbox.label': 'Visualizzatore di immagini',
  'lightbox.download': 'Scarica',
  'lightbox.previous': 'Precedente',
  'lightbox.next': 'Successiva',

  // Settings › Chat
  'settings.chat.systemHint':
    'Quello che ogni nuova chat riceve prima del tuo primo messaggio. Una sessione di studio aggiunge le sue istruzioni sopra.',
  'settings.chat.savedPrompts': 'Prompt salvati',
  'settings.chat.savedPrompt': 'Prompt salvato',
  'settings.chat.namePrompt': 'Dai un nome a questo prompt',
  'settings.chat.newName': 'Nuovo nome',
  'settings.chat.newNameLabel': 'Nuovo nome per questo prompt',
  'settings.chat.deletePrompt': 'Eliminare “{name}”?',
  'settings.chat.choosePrompt': 'Scegli un prompt salvato…',
  'settings.chat.use': 'Usa',
  'settings.chat.saveCurrent': 'Salva l’attuale',
  'settings.chat.renamePrompt': 'Rinomina il prompt',
  'settings.chat.deletePromptButton': 'Elimina il prompt',
  'settings.chat.timestamps': 'Data e ora dei messaggi',
  'settings.chat.timestampsHint':
    'Dice al modello quando è stato inviato ogni messaggio, così conosce la data. Costa un po’ di più a messaggio.',
  'settings.chat.modelDefault': 'Predefinito del modello',
  'settings.chat.effortHint':
    'Quanto ragionano le nuove chat, di partenza. Puoi cambiarlo in ogni chat dal campo di scrittura; un modello che non ha un livello usa quello più vicino.',
  'settings.chat.budget': 'Budget di ragionamento',
  'settings.chat.automatic': 'Automatico',
  'settings.chat.budgetInvalid':
    'Scrivi un numero intero maggiore di 0, o lascia vuoto. Non salvato.',
  'settings.chat.budgetHint':
    'Il massimo che il modello può ragionare, in token (circa tre quarti di parola l’uno), per i modelli che accettano un limite. Lascia vuoto per far decidere al modello.',
  'settings.memory.use': 'Usa la memoria',
  'settings.memory.useHint':
    'Il modello legge la tua memoria a ogni messaggio e annota quello che impara su di te. Ciò che legge va al fornitore usato dalla chat. Per tenere fuori una chat, disattiva la memoria con il segnalibro nel suo campo di scrittura.',
  'settings.memory.sensitive': 'Includi argomenti delicati',
  'settings.memory.sensitiveHint':
    'Lascia che il modello annoti dettagli come condizioni di salute o convinzioni religiose senza che tu lo chieda. La memoria resta solo in questo browser e va al fornitore della chat come il resto. Se è disattivato, li salva solo quando lo chiedi tu.',
  'settings.memory.open': 'Apri la memoria',

  // Settings: pages and sections
  'settings.tab.connections': 'Connessioni',
  'settings.tab.models': 'Modelli',
  'settings.tab.chat': 'Chat',
  'settings.tab.tutor': 'Tutor',
  'settings.tab.appearance': 'Aspetto',
  'settings.tab.data': 'Dati',
  'settings.section.providers': 'Fornitori',
  'settings.section.endpoints': 'I tuoi server',
  'settings.section.web-search': 'Ricerca web',
  'settings.section.default-model': 'Modello predefinito',
  'settings.section.favorites': 'Preferiti',
  'settings.section.privacy': 'Privacy',
  'settings.section.general': 'Prompt di sistema',
  'settings.section.memory': 'Memoria',
  'settings.section.reasoning': 'Ragionamento',
  'settings.section.tutor': 'Tutor',
  'settings.section.theme': 'Tema',
  'settings.section.language': 'Lingua',
  'settings.section.display': 'Visualizzazione',
  'settings.section.developer': 'Sviluppatori',
  'settings.section.data': 'Importa ed esporta',

  // What each section shows and is about, so search finds it by the words on
  // screen as well as by its title. English words always find it too.
  'settings.keywords.providers':
    'chiave openrouter chiave anthropic api fornitore collega sostituisci rimuovi workspace',
  'settings.keywords.endpoints':
    'il tuo server locale ollama lm studio llama.cpp vllm indirizzo del server url endpoint personalizzato compatibile openai chiave api nomi dei modelli prova la connessione strumenti immagini livello di ragionamento costi delle risposte cache dei prompt titoli delle chat rimuovi self-hosted',
  'settings.keywords.web-search': 'tavily chiave ricerca naviga web ricerca openrouter jina reader',
  'settings.keywords.default-model': 'nuova chat modello predefinito ripristina aggiorna elenco',
  'settings.keywords.favorites': 'preferiti stella modelli rimuovi selettore',
  'settings.keywords.privacy': 'solo conservazione zero dei dati zdr privacy fornitori prompt',
  'settings.keywords.general':
    'prompt di sistema prompt salvati scegli un prompt salvato preset salva l’attuale rinomina elimina data e ora dei messaggi orario',
  'settings.keywords.memory':
    'usa la memoria ricorda dimentica note su di te studio argomenti delicati privato salute apri la memoria segnalibro',
  'settings.keywords.reasoning':
    'livello di ragionamento budget di ragionamento token livello modello predefinito',
  'settings.keywords.tutor':
    'tutor modalità impara sempre segui il tutor scorrimento modello del tutor piano di studio studente insegnamento',
  'settings.keywords.theme': 'tema colori schema chiaro scuro automatico sistema',
  'settings.keywords.language':
    'lingua traduzione automatico english italiano français español deutsch português ελληνικά',
  'settings.keywords.display':
    'mostra il ragionamento di solito mostra i dettagli delle risposte modello velocità costo statistiche visualizzazione',
  'settings.keywords.developer':
    'sviluppatori registro delle chiamate a strumenti vista della richiesta includi il json grezzo ogni risposta debug ispeziona argomenti risultato',
  'settings.keywords.data': 'importa esporta chat e impostazioni file json backup dati',
  'settings.tutorSummary': 'Le sessioni di studio e il loro modello',
  'settings.search': 'Cerca nelle impostazioni',
  'settings.clearSearch': 'Cancella la ricerca',
  'settings.noMatch': 'Nessuna impostazione corrisponde a “{query}”.',
  'settings.pages': 'Pagine delle impostazioni',
  'settings.navigation': 'Navigazione delle impostazioni',
  'settings.close': 'Chiudi le impostazioni',
  'settings.back': 'Torna alle Impostazioni',
  'settings.saveFailed': 'Non è stato possibile salvare le impostazioni. Riprova la modifica.',

  // Settings › Connections
  'providers.rejected': 'Il fornitore ha rifiutato questa chiave. Incollane una nuova.',
  'providers.usingKey': 'Usa la tua chiave',
  'providers.readyNoKey': 'Pronto (nessuna chiave necessaria)',
  'providers.needsAddress': 'Serve un indirizzo',
  'providers.needsKey': 'Serve una chiave',
  'providers.keysStay': 'Le chiavi restano in questo browser e non vengono mai esportate.',
  'providers.workspace': 'ID del workspace (facoltativo)',
  'providers.workspaceHint':
    'Serve solo se Claude dice che la tua chiave richiede un workspace. Copia l’ID da Workspaces nella Claude Console: inizia con wrkspc_.',
  'providers.workspaceInvalid': 'Un ID del workspace contiene solo lettere, numeri, _ e -.',
  'apiKey.saved': '{key} salvata. Incolla per sostituirla',
  'apiKey.replace': 'Sostituisci',
  'apiKey.removeNamed': 'Rimuovi: {label}',
  'apiKey.removeTitle': 'Rimuovere «{label}»?',
  'apiKey.removeBody':
    'Viene cancellata da questo browser. Per usarla di nuovo, incollala un’altra volta.',
  'servers.removeTitle': 'Rimuovere {name}?',
  'servers.removeBody':
    'Indirizzo, chiave e impostazioni spariscono. Le chat che usavano i suoi modelli tengono i loro messaggi.',
  'servers.notSaved': 'Non salvato.',
  'servers.addressHint':
    'L’indirizzo del server, per esempio http://localhost:11434/v1 per Ollama.',
  'servers.modelNames': 'Nomi dei modelli',
  'servers.modelNamesHint':
    'Separati da virgole. Quelli che il server elenca su /models vengono aggiunti da soli.',
  'servers.keyOptional': 'Chiave (facoltativa)',
  'servers.keyPlaceholder': 'Quasi tutti i server locali non ne hanno bisogno',
  'servers.supports': 'Cosa supporta questo server',
  'servers.supportsHint':
    'Niente di quello che non è spuntato viene mai inviato. Un server rigido rifiuta l’intera richiesta per un solo campo che non conosce.',
  'servers.titles': 'Titoli delle chat',
  'servers.titlesChatModel': 'Usa il modello della chat',
  'servers.titlesOff': 'Non generare titoli',
  'servers.remove': 'Rimuovi questo server',
  'servers.name': 'Nome del server',
  'servers.namePlaceholder': 'Nome, es. Ollama',
  'servers.add': 'Aggiungi',
  'servers.addHint':
    'Funziona con Ollama, LM Studio, llama.cpp e vLLM. Le funzioni partono spente: le accendi tu.',
  'servers.noAddress': 'nessun indirizzo',
  'webSearch.hint':
    'La ricerca integrata nel fornitore del modello non richiede altre chiavi ed è quella predefinita. Con una chiave OpenRouter puoi anche scegliere la ricerca OpenRouter nel campo di scrittura: il modello cerca quando serve, con il tuo credito OpenRouter, e le pagine vengono lette tramite Jina Reader. Le tue ricerche vanno al partner di ricerca di OpenRouter, e gli indirizzi delle pagine a Jina.',
  'webSearch.keyLabel': 'Chiave {provider}',
  'capability.tools': 'Strumenti',
  'capability.toolsHint': 'Lascia che il modello usi strumenti, come la ricerca e la memoria.',
  'capability.vision': 'Immagini',
  'capability.visionHint': 'Invia immagini.',
  'capability.reasoningHint': 'Invia un livello di ragionamento.',
  'capability.streamUsage': 'Costi delle risposte',
  'capability.streamUsageHint': 'Riporta quanto è costata ogni risposta.',
  'capability.parallelToolCalls': 'Più strumenti insieme',
  'capability.parallelToolCallsHint': 'Lascia che il modello usi più di uno strumento per passo.',
  'capability.promptCaching': 'Cache dei prompt',
  'capability.promptCachingHint': 'Riusa i prompt lunghi per risparmiare.',
  'probe.title': 'Prova la connessione',
  'probe.test': 'Prova la connessione',
  'probe.testAgain': 'Prova di nuovo',
  'probe.modelToTest': 'Modello da provare',
  'probe.hint':
    'Invia qualche richiesta minuscola per vedere quali campi accetta questo server, così le caselle qui sotto si impostano da una risposta e non a intuito.',
  'probe.hintModel':
    'Invia qualche richiesta minuscola a {model} per vedere quali campi accetta questo server, così le caselle qui sotto si impostano da una risposta e non a intuito.',
  'probe.step.models': 'Elenco dei modelli…',
  'probe.step.chat': 'Invio di un primo messaggio…',
  'probe.step.tools': 'Controllo degli strumenti…',
  'probe.step.parallelToolCalls': 'Controllo di più strumenti insieme…',
  'probe.step.reasoning': 'Controllo del livello di ragionamento…',
  'probe.step.vision': 'Controllo delle immagini…',
  'probe.step.streamUsage': 'Controllo dei costi delle risposte…',
  'probe.step.promptCaching': 'Controllo della cache dei prompt…',
  'probe.verdict.ok': 'Accettato',
  'probe.verdict.no': 'Non supportato',
  'probe.verdict.unknown': 'Nessuna risposta',
  'probe.verdict.skipped': 'Saltato',
  'probe.reachable': 'Raggiungibile.',
  'probe.noModels': 'Non elenca modelli, quindi si usano solo quelli che hai scritto.',
  'probe.listsModels': { one: 'Elenca {count} modello.', other: 'Elenca {count} modelli.' },
  'probe.notApi': 'A {address} ha risposto qualcosa, ma non un server compatibile con OpenAI.',
  'probe.notApiHint':
    'Controlla l’indirizzo. Di solito è la radice del server seguita da /v1, per esempio http://localhost:11434/v1 per Ollama.',
  'probe.noRoute': 'Qui non c’è /models, quindi si usano solo quelli che hai scritto.',
  'probe.unauthorized': 'Raggiungibile, ma vuole una chiave e non ha accettato la tua.',
  'probe.unreachable': 'Impossibile raggiungere {address}.',
  'probe.unreachableHint':
    'Controlla che il server sia acceso e che accetti richieste da {origin}. Ollama ha bisogno che OLLAMA_ORIGINS includa questa origine, e LM Studio che il CORS sia attivo nelle impostazioni del server.',
  'probe.listFailed': 'Raggiungibile, ma l’elenco dei modelli non è riuscito.',
  'probe.replied': '{model} ha risposto in {time}.',
  'probe.noAnswer': '{model} non ha risposto.',
  'probe.notTested': '{model} non è stato provato.',
  'probe.noMessage': 'Non è stato inviato nessun messaggio.',
  'probe.apply': 'Applica alle caselle qui sotto',
  'probe.applyHint': 'Attiva ciò che è stato accettato e spegne ciò che è stato rifiutato.',
  'probe.alreadyMatch': 'Le caselle qui sotto corrispondono già a ciò che il server ha accettato.',

  // Testing a server (the details under each line)
  'probe.canceled': 'La prova della connessione è stata annullata.',
  'probe.timeout': 'Nessuna risposta entro {seconds} s.',
  'probe.failedEarly': 'La richiesta non è riuscita prima che il server rispondesse.',
  'probe.detail.unreachable': 'Il server non è raggiungibile.',
  'probe.detail.notApi': 'A questo indirizzo non ha risposto nessun server compatibile con OpenAI.',
  'probe.detail.noModel':
    'Nessun modello da provare. Scrivi il nome di un modello qui sopra, o controlla cosa elenca il server.',
  'probe.detail.notStream':
    'Ha risposto, ma non come flusso di token. Dialogia mostra ogni risposta mentre arriva.',
  'probe.detail.firstFailed': 'Saltato perché il primo messaggio non è passato.',
  'probe.detail.needsTools': 'Servono le chiamate a strumenti.',
  'probe.detail.noUsage': 'Il server ha accettato il campo ma non ha restituito i consumi.',

  // Settings › Data
  'data.label': 'Chat e impostazioni',
  'data.hint': 'Tutto in un solo file. Le tue chiavi non ci sono mai.',
  'data.import': 'Importa',
  'data.export': 'Esporta',
  'data.thisFile': 'questo file',
  'data.importTitle': 'Importare {name}?',
  'data.importBody':
    'Le chat del file sostituiscono quelle qui con lo stesso id, e le sue impostazioni sostituiscono le tue: server, preferiti e impostazioni delle chat. Tutto il resto resta com’è. Esporta prima, se potresti voler tornare indietro.',
  'data.exportFailed': 'L’esportazione non è riuscita. Riprova.',
  'data.importFailed': 'L’importazione non è riuscita. Riprova.',
  'data.importWhileReplying': 'Aspetta che la risposta finisca, poi importa.',
  'data.nothing': 'Questo file non contiene chat né impostazioni di Dialogia.',
  'data.notJson': 'Quel file non è un’esportazione di Dialogia: non è un JSON valido.',
  'data.newerVersion':
    'Questo backup è stato fatto con una versione più recente di Dialogia. Ricarica per aggiornare l’app, poi importalo di nuovo.',
  'data.noneRead': 'Nessuna delle chat di questo file si è potuta leggere.',
  'data.imported.chats': { one: 'Importata {count} chat.', other: 'Importate {count} chat.' },
  'data.imported.settings': 'Impostazioni importate.',
  'data.skipped.some': {
    one: '{count} non si è potuta leggere.',
    other: '{count} non si sono potute leggere.',
  },
  'data.skipped.chats': {
    one: '{count} chat non si è potuta leggere.',
    other: '{count} chat non si sono potute leggere.',
  },

  // Settings › Appearance
  'appearance.scheme': 'Colori',
  'appearance.schemeHint': 'Chiaro, scuro o come il tuo sistema.',
  'appearance.light': 'Chiaro',
  'appearance.dark': 'Scuro',
  'appearance.auto': 'Auto',
  'appearance.language': 'Lingua',
  'appearance.languageHint': 'Le parole dell’app. Le risposte seguono la lingua in cui scrivi.',
  'appearance.languageAuto': 'Automatica ({language})',
  'appearance.showThinking': 'Mostra sempre il ragionamento',
  'appearance.showThinkingHint':
    'Mostra cosa ha pensato il modello in ogni risposta, anche in quelle precedenti.',
  'appearance.showStats': 'Mostra i dettagli delle risposte',
  'appearance.showStatsHint':
    'Una riga sotto ogni risposta: quale modello l’ha scritta, quanto in fretta e quanto è costata.',
  'appearance.toolLog': 'Registro delle chiamate a strumenti',
  'appearance.toolLogHint':
    'Sopra ogni risposta che ha usato strumenti, ogni chiamata con i suoi argomenti e il risultato.',
  'appearance.requestView': 'Vista della richiesta',
  'appearance.requestViewHint':
    'Sopra ogni risposta, la richiesta che l’ha prodotta. Registrata da ora in poi e tenuta finché non ricarichi.',
  'appearance.rawJson': 'Includi il JSON grezzo',
  'appearance.rawJsonHint': 'La richiesta esattamente come è stata inviata, pronta da copiare.',

  // Code blocks and diagrams in replies
  'code.copy': 'Copia il codice',
  'code.wrap': 'A capo',
  'code.unwrap': 'Su una riga',
  'code.enableWrap': 'Manda a capo le righe lunghe',
  'code.disableWrap': 'Tieni le righe lunghe intere',
  'code.expand': 'Espandi',
  'code.collapse': 'Comprimi',
  'code.diagramFailed': 'Questo diagramma non si è potuto disegnare.',

  // Memory
  'memory.close': 'Chiudi la memoria',
  'memory.folders': 'Cartelle della memoria',
  'memory.folder.about': 'Su di te',
  'memory.folder.aboutDescription': 'Chi sei, dove vivi, come preferisci le risposte',
  'memory.folder.learning': 'Studio',
  'memory.folder.learningDescription': 'Cosa hai studiato con il tutor e come impari meglio',
  'memory.aboutEmpty':
    'Qui va quello che il modello impara su di te. Puoi anche aggiungere una nota tu.',
  'memory.folderEmpty': 'Ancora nessuna nota in questa cartella.',
  'memory.forgotten': 'Dimenticate di recente',
  'memory.forgottenHint':
    'Note che tu o il modello avete lasciato andare. Ognuna resta qui per 30 giorni, poi sparisce per sempre.',
  'memory.forgottenFrom': 'Da {folder} · dimenticata il {date}',
  'memory.aFolder': 'una cartella',
  'memory.restore': 'Ripristina',
  'memory.restoreNamed': 'Ripristina: {note}',
  'memory.forgottenEmpty': 'Niente di dimenticato di recente.',
  'memory.editHint': 'Invio per salvare · Esc per annullare',
  'memory.editHintTouch': 'Tocca Fine per salvare',
  'memory.byModel': 'Scritta dal modello',
  'memory.editedByYou': 'Modificata da te',
  'memory.byYou': 'Scritta da te',
  'memory.fromChat': 'da {chat}',
  'memory.note': 'Nota',
  'memory.forget': 'Dimentica',
  'memory.forgetNamed': 'Dimentica: {note}',
  'memory.newNote': 'Nuova nota',
  'memory.newNotePlaceholder': 'Qualcosa che il modello dovrebbe sapere',
  'memory.addNote': 'Aggiungi una nota',
  'memory.folderHolds': 'Cosa contiene {folder}',
  'memory.folderLineHint':
    'Il modello legge prima questa riga, e apre la cartella quando fa al caso.',
  'memory.folderLinePlaceholder': 'Scrivi cosa contiene questa cartella',
  'memory.consolidating': 'Riordino in corso…',
  'memory.consolidate': 'Riordina',
  'memory.consolidateHint': 'Riordina la memoria con {model}',
  'memory.addFirst': 'Prima aggiungi una nota',
  'memory.newToday': {
    one: '{count} nuova dal riordino di oggi',
    other: '{count} nuove dal riordino di oggi',
  },
  'memory.newSince': { one: '{count} nuova dal {date}', other: '{count} nuove dal {date}' },
  'memory.upToDate': 'In ordine',
  'memory.reportLabel': 'Cosa ha cambiato il riordino',
  'memory.consolidatedOn': 'Riordinata il {date}',
  'memory.nothingChanged': 'Niente di cambiato',
  'memory.alreadyTidy': 'Era già in ordine',
  'memory.undo': 'Annulla',
  'memory.openInMemory': 'Apri nella memoria',
  'memory.nothingNeeded': 'Non c’era niente da cambiare.',
  'memory.skippedSome': {
    one: 'Saltata una modifica proposta che non si poteva fare.',
    other: 'Saltate {count} modifiche proposte che non si potevano fare.',
  },
  'memory.skippedAll': {
    one: 'Il modello ha proposto una modifica, ma non si poteva fare.',
    other: 'Il modello ha proposto {count} modifiche, ma nessuna si poteva fare.',
  },
  'memory.writesLabel': 'Modifiche alla memoria',
  'memory.takenBack': 'Annullato:',
  'memory.write.added': 'Ricordato',
  'memory.write.updated': 'Aggiornato',
  'memory.write.forgotten': 'Dimenticato',
  'memory.was': '(prima: {text})',
  'memory.undoNamed': 'Annulla: {note}',
  'memory.records': 'Sessioni di studio',
  'memory.recordsHint':
    'Le sessioni di studio compaiono qui da sole, con i progressi letti in diretta dalla chat.',
  'memory.record.finished': 'Finita il {date}',
  'memory.record.progress': '{done} di {count} fatti · ultimo studio il {date}',

  // Notices: the toasts that say something went right or wrong
  'notice.invalidKey':
    'Quella chiave è stata rifiutata. Controllala in Impostazioni › Connessioni.',
  'notice.expiredKey':
    'Quella chiave è scaduta. Aggiungine una nuova in Impostazioni › Connessioni.',
  'notice.rateLimited': 'Il fornitore sta limitando le richieste. Aspetta un momento, poi riprova.',
  'notice.missingSearchKey':
    'Questa ricerca ha bisogno di una chiave. Aggiungila in Impostazioni › Connessioni.',
  'notice.searchUnavailable': 'La ricerca web non è disponibile in questa chat; rispondo senza.',
  'notice.unknownEndpoint':
    'Questa chat usa un server che non esiste più. Aggiungilo di nuovo in Impostazioni › Connessioni, o scegli un altro modello.',
  'notice.exportedChats': 'Le tue chat sono state esportate.',
  'notice.planApplyFailed': 'Non è stato possibile applicare il piano. Riprova.',
  'notice.planChangesFailed': 'Non è stato possibile inviare il tuo suggerimento. Riprova.',
  'notice.copyFailed': 'Impossibile copiare: il browser ha bloccato gli appunti.',
  'notice.replyInOtherTab':
    'Un’altra scheda sta scrivendo una risposta in questa chat. Invia quando ha finito, così le due schede mostrano la stessa chat.',
  'notice.saveFailed':
    'La risposta non si è potuta salvare in questo browser. Ora è sullo schermo, ma dopo un ricaricamento potrebbe risultare tagliata.',
  'notice.consolidationFailed':
    'Non è stato possibile riordinare la memoria. Non è cambiato niente; riprova tra un momento.',
  'notice.consolidationUnreadable':
    'Questo modello non è riuscito a proporre modifiche. Non è cambiato niente. Prova un altro modello.',
  'notice.consolidationUndone': 'Riordino annullato.',
  'notice.consolidationStale':
    'La memoria è cambiata durante il riordino, quindi non è cambiato niente. Riordina di nuovo.',
  'notice.consolidationPartlyUndone':
    'Riordino annullato, tranne ciò che è cambiato nel frattempo, che è rimasto com’era.',
  'notice.memoryChangedSince':
    'Questa nota è cambiata nel frattempo. Modificala nella pagina Memoria.',
  'notice.memoryAlreadyForgotten':
    'Questa nota è già dimenticata. Aspetta in Dimenticate di recente, nella pagina Memoria.',
  'notice.consolidationNoModel':
    'Collega un modello in Impostazioni › Connessioni per riordinare la memoria.',
  'notice.replacedReplyChangedMemory':
    'La risposta che hai sostituito aveva cambiato la tua memoria. Quelle note restano come sono; controllale nella pagina Memoria.',
  'notice.unreachable':
    'Impossibile raggiungere il fornitore. Controlla la connessione, o che il tuo server locale sia acceso.',
  'notice.timedOut': 'La richiesta è scaduta. Riprova.',
  'notice.cutOff': 'La connessione si è chiusa prima che la risposta finisse. Riprova.',
  'notice.stalled':
    'Il fornitore ha smesso di inviare, quindi la risposta è stata interrotta. Riprova.',
  'notice.unknownError': 'Qualcosa è andato storto, e il fornitore non ha detto cosa.',
  'notice.outOfCredit':
    'Il credito del tuo account presso il fornitore è finito. Aggiungine sul sito del fornitore, poi riprova.',
  'notice.modelNotFound': 'Il fornitore non ha questo modello. Scegline un altro, poi riprova.',
  'notice.providerDown':
    'Il fornitore ha avuto un problema. Riprova tra un momento, o scegli un altro modello.',
  'notice.requestRefused':
    'Il fornitore non è riuscito a gestire questa richiesta. Riprova, o scegli un altro modello.',
  'notice.tryAgainSoon': 'Riprova tra un momento.',
  'notice.providerError': 'Il fornitore del modello ha restituito un errore',
  'notice.modelListFailed': 'Impossibile caricare l’elenco dei modelli',
  'notice.emptyResponse': 'Il fornitore ha inviato una risposta vuota',
  'markdown.remoteImage': 'Immagine: {name} (apri)',
  'notice.kind.image': 'immagini',
  'notice.kind.audio': 'audio',
  'notice.kind.pdf': 'PDF',
  'notice.droppedOne': 'Escluso perché questo modello non lo accetta: {list}.',
  'notice.droppedMany': 'Esclusi perché questo modello non li accetta: {list}.',
  'notice.noModelsOffered': '{servers} non ha offerto nessun modello.',
  'zdr.blocked':
    '{model} non garantisce la conservazione zero dei dati. Scegli un altro modello, o disattiva Solo conservazione zero dei dati in Impostazioni › Modelli.',
  'zdr.unavailable':
    'Impossibile verificare quali fornitori non conservano dati. Controlla la connessione, o disattiva Solo conservazione zero dei dati in Impostazioni › Modelli.',

  // Attaching files
  'attach.kinds.all': 'immagini, audio (mp3/wav) o PDF',
  'attach.kinds.images': 'immagini o PDF',
  'attach.kinds.audio': 'audio (mp3/wav) o PDF',
  'attach.kinds.pdf': 'PDF',
  'attach.aFile': 'un file',
  'attach.tooLarge': 'troppo grande, massimo {max} MB',
  'attach.perMessage': 'al massimo {limit} per messaggio',
  'attach.pdfs': { one: '{count} PDF', other: '{count} PDF' },
  'attach.images': { one: '{count} immagine', other: '{count} immagini' },
  'attach.audioFiles': { one: '{count} file audio', other: '{count} file audio' },
  'attach.imageTypes': 'solo immagini PNG, JPEG, WebP o GIF',
  'attach.audioTypes': 'solo audio mp3 o wav',
  'attach.modelTakes': 'questo modello accetta {kinds}',
  'attach.notAttached': 'Non allegati: {files}.',
  'attach.hint': 'Allega {kinds}',

  // Search errors, as the reasoning line shows them
  'searchError.failed': 'La ricerca non è riuscita.',
  'searchError.tooLong': 'La ricerca ci ha messo troppo.',
  'searchError.pageTooLong': 'La pagina ci ha messo troppo a caricarsi.',
  'searchError.unreachable': 'Impossibile raggiungere {service}.',
  'searchError.openrouter.key':
    'OpenRouter non ha accettato la chiave. Controllala in Impostazioni › Connessioni.',
  'searchError.openrouter.credit': 'Il credito dell’account OpenRouter è finito.',
  'searchError.openrouter.limited':
    'OpenRouter sta limitando le richieste in questo momento. Riprova tra poco.',
  'searchError.openrouter.trouble': 'OpenRouter ha qualche problema al momento. Riprova più tardi.',
  'searchError.openrouter.failed': 'OpenRouter non è riuscito a fare questa ricerca.',
  'searchError.reader.busy': 'Il lettore di pagine gratuito è occupato. Riprova tra un minuto.',
  'searchError.reader.forbidden':
    'Il lettore di pagine non ha il permesso di aprire questa pagina.',
  'searchError.reader.failed': 'Il lettore di pagine non è riuscito ad aprire questa pagina.',
  'searchError.reader.couldNot': 'Impossibile leggere questa pagina.',
  'searchError.reader.unreachable': 'Impossibile raggiungere il lettore di pagine.',
  'searchError.tavily.key':
    'Tavily non ha accettato la chiave di ricerca. Controllala in Impostazioni › Connessioni.',
  'searchError.tavily.limited':
    'Tavily sta limitando le ricerche in questo momento. Riprova tra poco.',
  'searchError.tavily.plan': 'Il piano Tavily ha raggiunto il suo limite di ricerche.',
  'searchError.tavily.trouble': 'Tavily ha qualche problema al momento. Riprova più tardi.',
  'searchError.tavily.search': 'Tavily non è riuscito a fare questa ricerca.',
  'searchError.tavily.fetch': 'Tavily non è riuscito ad aprire questa pagina.',
};

export default messages;
