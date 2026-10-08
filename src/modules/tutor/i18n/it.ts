// Italiano. Typed from the English source (en.ts); GLOSSARY.md keeps the words
// used throughout. Informal address, plain words, the app's warm voice.

import type en from './en';
import type { Translation } from '@/lib/i18n/catalogue';

const messages: Translation<typeof en> = {
  // How a topic stands
  'status.done': 'Fatto',
  'status.inProgress': 'In corso',
  'status.startsAfter': 'Inizia dopo {topics}',
  'status.quoted': '“{name}”',
  'status.upNext': 'Il prossimo',
  'status.notStarted': 'Non iniziato',
  'idea.youThought': 'Pensavi che {belief}',

  // The Learning Hub
  'hub.goal': 'Il tuo obiettivo',
  'hub.topicsDone': {
    one: '{done} di {count} argomento fatto',
    other: '{done} di {count} argomenti fatti',
  },
  'hub.hours': { one: 'circa {count} ora in tutto', other: 'circa {count} ore in tutto' },
  'hub.hint':
    'Ogni percentuale è la stima del tutor di quanto conosci quell’argomento. Apri un argomento per vedere perché.',
  'hub.hintCorrect':
    'Ogni percentuale è la stima del tutor di quanto conosci quell’argomento. Apri un argomento per vedere perché, o per correggerla.',
  'hub.toClear': { one: '{count} cosa da chiarire', other: '{count} cose da chiarire' },
  'hub.objectives': 'Saprai',
  'hub.seemsWrong': 'Non ti torna?',
  'hub.correct': 'Correggi la stima',
  'hub.tooHigh': 'Troppo alta',
  'hub.tooLow': 'Troppo bassa',
  'hub.toClearLabel': 'Da chiarire',
  'hub.gotIt': 'Ora l’ho capito',
  'hub.startsOnce': 'Inizia quando avrai finito {topics}.',
  'hub.title': 'Percorso',
  'hub.open': 'Apri il percorso',
  'hub.close': 'Chiudi il percorso',
  'hub.labelWith': 'Percorso: {detail}',
  'hub.topicsOf': { one: '{done} di {count} argomento', other: '{done} di {count} argomenti' },
  'hub.editing': 'Modifica del piano',
  'hub.proposed': 'Piano proposto',
  'hub.done': 'Fatto',
  'hub.editPlan': 'Modifica il piano',
  'why.title': 'Perché {percent}',
  'why.starting': 'Stima iniziale',
  'why.carriedBefore': 'Ripresa da prima',
  'why.now': 'Ora',
  'why.morePractice': 'Hai chiesto più esercizio',
  'why.markedKnown': 'L’hai segnato come già noto',
  'why.corrected': 'L’hai corretta tu',
  'why.told': 'L’hai detto al tutor',
  'why.byTutor': 'Impostata dal tutor',

  // Margin notes and "Why N%": what moved an estimate
  'carried.elsewhere': '{topic} in un’altra sessione di studio',
  'carried.inChat': '{topic} in {title}',
  'carried.plain': 'Ripresa da {from} ({estimate}, {date}).',
  'carried.capped':
    'Ripresa da {from} ({estimate}, {date}), ferma a {cap} finché non rispondi qui a {questions} domande.',
  'note.fromBefore': 'Da quello che hai detto prima del piano',
  'note.markedKnown': 'Segnato come già noto.',
  'note.you': 'Tu ',
  'note.quizRight': 'Hai risposto giusto a una domanda del quiz: “{question}”',
  'note.quizWrong': 'Hai sbagliato una domanda del quiz: “{question}”',
  'note.checkRight': 'Hai risposto giusto a una domanda della verifica: “{question}”',
  'note.checkWrong': 'Hai sbagliato una domanda della verifica: “{question}”',
  'note.quizOneRight': 'Domanda del quiz giusta',
  'note.quizOneMissed': 'Domanda del quiz sbagliata',
  'note.checkOneRight': 'Domanda della verifica giusta',
  'note.checkOneMissed': 'Domanda della verifica sbagliata',
  'note.quizScore': {
    one: '{right} su {count} domanda del quiz giusta',
    other: '{right} su {count} domande del quiz giuste',
  },
  'note.checkScore': {
    one: '{right} su {count} domanda della verifica giusta',
    other: '{right} su {count} domande della verifica giuste',
  },
  'note.feltHigh': 'Hai detto che la stima ti sembrava troppo alta',
  'note.feltLow': 'Hai detto che la stima ti sembrava troppo bassa',
  'common.close': 'Chiudi',
  'common.cancel': 'Annulla',
  'common.previous': 'Indietro',
  'common.next': 'Avanti',

  // Learn: starting and leaving a learning session
  'learn.label': 'Impara',
  'learn.chat': 'Chat',
  'learn.mode': 'Modalità',
  'learn.forcedHint': 'Ogni chat è una sessione di studio (Impostazioni › Tutor)',
  'learn.leaveHint':
    'Esci da questa sessione di studio. Resta nella cronologia e si apre una nuova chat.',
  'learn.startHint':
    'Inizia una sessione di studio. Si apre in una nuova chat; questa resta nella cronologia.',
  'learn.forced': 'Ogni chat è una sessione di studio',
  'learn.tapToLeave': 'In una sessione di studio; tocca per uscire',
  'learn.start': 'Inizia una sessione di studio',

  // Editing the plan in the Hub
  'revise.hint': 'Per aggiungere, togliere o riordinare argomenti, chiedi al tutor.',
  'revise.ask': 'Chiedi modifiche al tutor',
  'revise.confirm': 'Lo segni come fatto e vai avanti?',
  'revise.skip': 'Saltalo',
  'revise.next': 'Fai questo dopo',
  'revise.known': 'Lo so già',
  'revise.reopen': 'Riprendilo',
  'plan.applying': 'Applico…',
  'plan.approve': 'Approva il piano',
  'plan.suggest': 'Suggerisci modifiche',

  // A plan proposal
  'plan.approved': 'Approvato',
  'plan.changesRequested': 'Modifiche richieste',
  'plan.revisedBelow': 'Rivisto qui sotto',
  'plan.hours': { one: 'Circa {count} ora', other: 'Circa {count} ore' },
  'plan.recording': 'Registro…',
  'plan.viewFull': 'Vedi il piano completo',

  // The end of a topic
  'chapter.label': 'Fine dell’argomento: {name}',
  'chapter.kicker': 'Argomento {at} di {count} finito',
  'chapter.estimate': 'Sei al {percent} su questo argomento.',
  'chapter.ready': 'Vuoi andare avanti?',
  'chapter.last': 'Era l’ultimo argomento del piano.',
  'chapter.goOn': 'Avanti: {topic}',
  'chapter.morePractice': 'Prima ancora un po’ di esercizio',
  'chapter.back': 'Di nuovo in esercizio',
  'chapter.finishedAt': 'Finito al {percent}',
  'chapter.finished': 'Finito',
  'chapter.next': 'Dopo: {topic}',

  // Cards in a tutor's reply
  'cards.plan': 'Piano di studio',
  'cards.revisedPlan': 'Piano rivisto',
  'cards.beforeStart': 'Prima di iniziare',
  'cards.exercises': 'Esercizi',

  // Quizzes and the quick check
  'quiz.question': 'Domanda {at} di {count}',
  'quiz.questionNumber': 'Domanda {number}',
  'quiz.correct': 'Giusto',
  'quiz.notQuite': 'Non proprio',
  'diagnostic.title': 'Una verifica veloce su {topic}',
  'diagnostic.why': 'Così il tutor sa da dove partire.',
  'diagnostic.score': { one: '{right} su {count} giusta', other: '{right} su {count} giuste' },

  // The opening questions
  'intake.title': 'Raccontami i tuoi obiettivi',
  'intake.thanks': 'Grazie. Il piano terrà conto di questo.',
  'intake.skippedHint': 'Saltate. Il tutor è andato avanti senza queste risposte.',
  'intake.chooseAny': 'Scegli tutte quelle che ti descrivono.',
  'intake.chooseOne': 'Scegline una.',
  'intake.sent': 'Risposte inviate',
  'intake.skipped': 'Saltate',
  'intake.sending': 'Invio…',
  'intake.send': 'Invia le risposte',

  // Margin notes beside a reply
  'margin.label': 'Cosa ha annotato il tutor',
  'margin.change': 'da {from} a {to}',
  'margin.more': { one: '+{count} altro', other: '+{count} altri' },
  'margin.now': 'Ora {percent}.',

  // Asking the tutor to change the plan
  'feedback.title': 'Di’ al tutor cosa cambiare',
  'feedback.about': 'Su {topic}',
  'feedback.placeholderTopic':
    'Approfondire qualcosa prima di andare avanti, riordinare gli argomenti, o aggiungere basi se {topic} ti sembra troppo avanzato.',
  'feedback.placeholder':
    'Più esercizio sulle basi, saltare quello che sai già, o un’altra direzione.',
  'feedback.hint': 'La tua nota compare nella chat, e il tutor risponde con un piano rivisto.',
  'feedback.shortcut': '{key} Invio per inviare',
  'feedback.send': 'Invia al tutor',

  // Settings › Tutor
  'settings.title': 'Tutor',
  'settings.newest': 'Sempre la versione più recente',
  'settings.offer': 'Offri Impara',
  'settings.offerHint':
    'Impara sta accanto a Chat: un tutor prepara con te un breve corso, te lo insegna e verifica cosa sai con domande veloci.',
  'settings.always': 'Impara sempre',
  'settings.alwaysHint': 'Ogni chat è una sessione di studio. Chat non viene offerta.',
  'settings.follow': 'Segui il tutor',
  'settings.followHint': 'Scorri fino all’ultimo messaggio mentre il tutor risponde.',
  'settings.model': 'Modello del tutor',
  'settings.searchModel': 'Cerca un altro modello',
  'settings.searchModelLabel': 'Cerca un modello per il tutor',
  'settings.modelHint': 'Ogni sessione di studio usa questo modello.',
  'settings.howItWorks':
    'Ogni sessione di studio prepara un piano dal tuo primo messaggio e tiene traccia di quello che sai man mano. Il tutor passa all’argomento successivo quando te la senti.',

  // The tutor's greeting at the top of a learning session
  'welcome.first':
    'Dimmi cosa vuoi imparare, e perché. Preparo un piano per noi, tu puoi cambiarlo, e mentre lavoriamo terremo traccia di quello che sai. Se hai appunti o letture, aggiungili e lavorerò anche da quelli.',
  'welcome.goal': '“{goal}”',
  'welcome.back': 'Eccoci di nuovo',
  'welcome.finished': 'Abbiamo finito il piano per {goal}',
  'welcome.goBack': 'Possiamo ripassarne qualsiasi parte, o fissare un nuovo obiettivo',
  'welcome.notesWelcome': 'Nuovi appunti o letture sono benvenuti',
  'welcome.workingToward': 'Stiamo lavorando verso {goal}',
  'welcome.nextWithDescription': 'Il prossimo passo è {topic}: {description}',
  'welcome.next': 'Il prossimo passo è {topic}',
  'welcome.ask': 'Fai una domanda, o chiedi un esercizio, quando vuoi',
  'welcome.addNotes': 'Puoi aggiungere appunti o letture in qualsiasi momento',

  // The learner's actions, as lines in the transcript
  'ledger.score': { one: '{right} su {count} giusta', other: '{right} su {count} giuste' },
  'ledger.intake': 'Ho risposto alle domande iniziali',
  'ledger.quiz': 'Ho risposto al quiz: {score}',
  'ledger.diagnostic': 'Ho finito la verifica veloce: {score}',
  'ledger.approved': 'Ho approvato il piano',
  'ledger.declined': 'Ho chiesto modifiche al piano: {feedback}',
  'ledger.goingOn': 'Vado avanti: {topic}',
  'ledger.morePractice': 'Ho chiesto più esercizio: {topic}',
  'ledger.started': 'Ho scelto cosa fare dopo: {topic}',
  'ledger.reopened': 'Ho ripreso un argomento: {topic}',
  'ledger.markedKnown': 'Ho segnato come già noto: {topic}',
  'ledger.tooHigh': 'Ho detto che la stima mi sembrava troppo alta: {topic}',
  'ledger.tooLow': 'Ho detto che la stima mi sembrava troppo bassa: {topic}',
  'ledger.clearedUp': 'Ho segnato come chiarito: {idea}',
  'notice.saveFailed':
    'I progressi del tutor non si sono potuti salvare. Restano in questa scheda e verranno salvati con la prossima modifica.',
};

export default messages;
