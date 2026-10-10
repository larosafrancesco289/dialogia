// Deutsch. Typed from the English source (en.ts); GLOSSARY.md keeps the words
// used throughout. Informal address, plain words, the app's warm voice.

import type en from './en';
import type { Translation } from '@/lib/i18n/catalogue';

const messages: Translation<typeof en> = {
  // How a topic stands
  'status.done': 'Erledigt',
  'status.skipped': 'Übersprungen',
  'status.inProgress': 'In Arbeit',
  'status.startsAfter': 'Beginnt nach {topics}',
  'status.quoted': '„{name}“',
  'status.upNext': 'Als Nächstes',
  'status.notStarted': 'Noch nicht begonnen',
  'idea.youThought': 'Du dachtest: {belief}',

  // The Learning Hub
  'hub.goal': 'Dein Ziel',
  'hub.topicsDone': {
    one: '{done} von {count} Thema erledigt',
    other: '{done} von {count} Themen erledigt',
  },
  'hub.hours': { one: 'etwa {count} Stunde insgesamt', other: 'etwa {count} Stunden insgesamt' },
  'hub.hint':
    'Jede Prozentzahl ist die Einschätzung des Tutors, wie gut du das Thema kannst. Öffne ein Thema, um zu sehen, warum.',
  'hub.hintCorrect':
    'Jede Prozentzahl ist die Einschätzung des Tutors, wie gut du das Thema kannst. Öffne ein Thema, um zu sehen, warum, oder um sie zu korrigieren.',
  'hub.toClear': { one: '{count} Punkt zu klären', other: '{count} Punkte zu klären' },
  'hub.objectives': 'Danach kannst du',
  'hub.seemsWrong': 'Passt nicht?',
  'hub.correct': 'Einschätzung korrigieren',
  'hub.tooHigh': 'Zu hoch',
  'hub.tooLow': 'Zu niedrig',
  'hub.toClearLabel': 'Zu klären',
  'hub.gotIt': 'Jetzt hab ich’s',
  'hub.startsOnce': 'Beginnt, sobald du {topics} abgeschlossen hast.',
  'hub.title': 'Lernpfad',
  'hub.open': 'Lernpfad öffnen',
  'hub.close': 'Lernpfad schließen',
  'hub.labelWith': 'Lernpfad: {detail}',
  'hub.topicsOf': { one: '{done} von {count} Thema', other: '{done} von {count} Themen' },
  'hub.editing': 'Plan bearbeiten',
  'hub.proposed': 'Vorgeschlagener Plan',
  'hub.done': 'Fertig',
  'hub.editPlan': 'Plan bearbeiten',
  'why.title': 'Warum {percent}',
  'why.starting': 'Anfangseinschätzung',
  'why.carriedBefore': 'Von früher übernommen',
  'why.now': 'Jetzt',
  'why.morePractice': 'Du wolltest mehr üben',
  'why.markedKnown': 'Du hast es als bekannt markiert',
  'why.corrected': 'Du hast sie korrigiert',
  'why.told': 'Du hast es dem Tutor gesagt',
  'why.byTutor': 'Vom Tutor gesetzt',

  // Margin notes and "Why N%": what moved an estimate
  'carried.elsewhere': '{topic} in einer anderen Lerneinheit',
  'carried.inChat': '{topic} in {title}',
  'carried.plain': 'Übernommen aus {from} ({estimate}, {date}).',
  'carried.capped':
    'Übernommen aus {from} ({estimate}, {date}), begrenzt auf {cap}, bis du hier {questions} Fragen beantwortest.',
  'note.fromBefore': 'Aus dem, was du vor dem Plan gesagt hast',
  'note.markedKnown': 'Als bereits bekannt markiert.',
  'note.you': 'Du ',
  'note.quizRight': 'Du hast eine Quizfrage richtig beantwortet: „{question}“',
  'note.quizWrong': 'Du hast eine Quizfrage verfehlt: „{question}“',
  'note.checkRight': 'Du hast eine Frage des Kurzchecks richtig beantwortet: „{question}“',
  'note.checkWrong': 'Du hast eine Frage des Kurzchecks verfehlt: „{question}“',
  'note.quizOneRight': 'Quizfrage richtig',
  'note.quizOneMissed': 'Quizfrage verfehlt',
  'note.checkOneRight': 'Frage des Kurzchecks richtig',
  'note.checkOneMissed': 'Frage des Kurzchecks verfehlt',
  'note.quizScore': {
    one: '{right} von {count} Quizfrage richtig',
    other: '{right} von {count} Quizfragen richtig',
  },
  'note.checkScore': {
    one: '{right} von {count} Frage des Kurzchecks richtig',
    other: '{right} von {count} Fragen des Kurzchecks richtig',
  },
  'note.feltHigh': 'Du hast gesagt, die Einschätzung kommt dir zu hoch vor',
  'note.feltLow': 'Du hast gesagt, die Einschätzung kommt dir zu niedrig vor',
  'common.close': 'Schließen',
  'common.cancel': 'Abbrechen',
  'common.previous': 'Zurück',
  'common.next': 'Weiter',

  // Learn: starting and leaving a learning session
  'learn.label': 'Lernen',
  'learn.chat': 'Chat',
  'learn.mode': 'Modus',
  'learn.forcedHint': 'Jeder Chat ist eine Lerneinheit (Einstellungen › Tutor)',
  'learn.leaveHint':
    'Diese Lerneinheit verlassen. Sie bleibt in deinem Verlauf, und ein neuer Chat öffnet sich.',
  'learn.startHint':
    'Eine Lerneinheit beginnen. Sie öffnet sich als neuer Chat; dieser bleibt in deinem Verlauf.',
  'learn.forced': 'Jeder Chat ist eine Lerneinheit',
  'learn.tapToLeave': 'In einer Lerneinheit; tippen zum Verlassen',
  'learn.start': 'Lerneinheit beginnen',

  // Editing the plan in the Hub
  'revise.hint': 'Um Themen hinzuzufügen, zu entfernen oder umzustellen, frag den Tutor.',
  'revise.ask': 'Den Tutor um Änderungen bitten',
  'revise.confirm': 'Überspringen und weitermachen?',
  'revise.skip': 'Überspringen',
  'revise.next': 'Als Nächstes',
  'revise.known': 'Kann ich schon',
  'revise.reopen': 'Wieder aufnehmen',
  'plan.applying': 'Wird übernommen …',
  'plan.approve': 'Plan annehmen',
  'plan.suggest': 'Änderungen vorschlagen',

  // A plan proposal
  'plan.approved': 'Angenommen',
  'plan.changesRequested': 'Änderungen gewünscht',
  'plan.revisedBelow': 'Unten überarbeitet',
  'plan.hours': { one: 'Etwa {count} Stunde', other: 'Etwa {count} Stunden' },
  'plan.recording': 'Wird notiert …',
  'plan.viewFull': 'Ganzen Plan ansehen',

  // The end of a topic
  'chapter.label': 'Ende des Themas: {name}',
  'chapter.kicker': 'Thema {at} von {count} abgeschlossen',
  'chapter.estimate': 'Du stehst bei {percent} in diesem Thema.',
  'chapter.ready': 'Bereit weiterzumachen?',
  'chapter.last': 'Das war das letzte Thema im Plan.',
  'chapter.goOn': 'Weiter: {topic}',
  'chapter.morePractice': 'Erst noch mehr üben',
  'chapter.back': 'Zurück zum Üben',
  'chapter.finishedAt': 'Abgeschlossen bei {percent}',
  'chapter.finished': 'Abgeschlossen',
  'chapter.next': 'Danach: {topic}',

  // Cards in a tutor's reply
  'cards.plan': 'Lernplan',
  'cards.revisedPlan': 'Überarbeiteter Plan',
  'cards.beforeStart': 'Bevor wir anfangen',
  'cards.exercises': 'Übungen',

  // Quizzes and the quick check
  'quiz.question': 'Frage {at} von {count}',
  'quiz.questionNumber': 'Frage {number}',
  'quiz.correct': 'Richtig',
  'quiz.notQuite': 'Nicht ganz',
  'diagnostic.title': 'Ein Kurzcheck zu {topic}',
  'diagnostic.why': 'Damit der Tutor weiß, wo er anfangen soll.',
  'diagnostic.score': { one: '{right} von {count} richtig', other: '{right} von {count} richtig' },

  // The opening questions
  'intake.title': 'Erzähl mir von deinen Zielen',
  'intake.thanks': 'Danke. Der Plan richtet sich danach.',
  'intake.skippedHint': 'Übersprungen. Der Tutor hat ohne diese Antworten weitergemacht.',
  'intake.chooseAny': 'Wähle alle, die auf dich zutreffen.',
  'intake.chooseOne': 'Wähle eine.',
  'intake.sent': 'Antworten gesendet',
  'intake.skipped': 'Übersprungen',
  'intake.sending': 'Wird gesendet …',
  'intake.send': 'Antworten senden',

  // Margin notes beside a reply
  'margin.label': 'Was der Tutor notiert hat',
  'margin.change': '{from} auf {to}',
  'margin.more': { one: '+{count} weiterer', other: '+{count} weitere' },
  'margin.now': 'Jetzt {percent}.',

  // Asking the tutor to change the plan
  'feedback.title': 'Sag dem Tutor, was er ändern soll',
  'feedback.about': 'Zu {topic}',
  'feedback.placeholderTopic':
    'Etwas vertiefen, bevor es weitergeht, die Themen umstellen oder Grundlagen ergänzen, falls {topic} dir zu fortgeschritten vorkommt.',
  'feedback.placeholder':
    'Mehr Übung bei den Grundlagen, überspringen, was du schon kannst, oder ein anderer Schwerpunkt.',
  'feedback.hint':
    'Deine Notiz erscheint im Chat, und der Tutor antwortet mit einem überarbeiteten Plan.',
  'feedback.shortcut': '{key} Enter zum Senden',
  'feedback.send': 'An den Tutor senden',

  // Settings › Tutor
  'settings.title': 'Tutor',
  'settings.newest': 'Immer die neueste Version',
  'settings.offer': 'Lernen anbieten',
  'settings.offerHint':
    'Lernen steht neben Chat: Ein Tutor plant mit dir einen kurzen Kurs, unterrichtet ihn und prüft mit kurzen Fragen, was du kannst.',
  'settings.always': 'Immer lernen',
  'settings.alwaysHint': 'Jeder Chat ist eine Lerneinheit. Chat wird nicht angeboten.',
  'settings.follow': 'Dem Tutor folgen',
  'settings.followHint': 'Zur neuesten Nachricht scrollen, während der Tutor antwortet.',
  'settings.model': 'Tutor-Modell',
  'settings.searchModel': 'Nach einem anderen Modell suchen',
  'settings.searchModelLabel': 'Nach einem Tutor-Modell suchen',
  'settings.modelHint': 'Jede Lerneinheit nutzt dieses Modell.',
  'settings.howItWorks':
    'Jede Lerneinheit entwirft aus deiner ersten Nachricht einen Plan und verfolgt unterwegs, was du kannst. Der Tutor geht zum nächsten Thema, wenn du so weit bist.',

  // The tutor's greeting at the top of a learning session
  'welcome.first':
    'Sag mir, was du lernen willst und warum. Ich skizziere einen Plan für uns, du kannst ihn umgestalten, und beim Arbeiten behalten wir im Blick, was du schon kannst. Wenn du Notizen oder Texte hast, füge sie hinzu, dann arbeite ich auch damit.',
  'welcome.goal': '„{goal}“',
  'welcome.back': 'Schön, dass du wieder da bist',
  'welcome.finished': 'Wir haben den Plan für {goal} abgeschlossen',
  'welcome.goBack': 'Wir können jeden Teil wiederholen oder ein neues Ziel setzen',
  'welcome.notesWelcome': 'Neue Notizen oder Texte sind auch willkommen',
  'welcome.workingToward': 'Wir arbeiten auf {goal} hin',
  'welcome.nextWithDescription': 'Als Nächstes geht es um {topic}: {description}',
  'welcome.next': 'Als Nächstes geht es um {topic}',
  'welcome.ask': 'Stell eine Frage oder bitte um eine Übung, wann immer du bereit bist',
  'welcome.addNotes': 'Du kannst jederzeit Notizen oder Texte hinzufügen',

  // The learner's actions, as lines in the transcript
  'ledger.score': { one: '{right} von {count} richtig', other: '{right} von {count} richtig' },
  'ledger.intake': 'Die Einstiegsfragen beantwortet',
  'ledger.quiz': 'Das Quiz beantwortet: {score}',
  'ledger.diagnostic': 'Den Kurzcheck abgeschlossen: {score}',
  'ledger.approved': 'Den Plan angenommen',
  'ledger.declined': 'Änderungen am Plan gewünscht: {feedback}',
  'ledger.goingOn': 'Weiter mit: {topic}',
  'ledger.morePractice': 'Mehr Übung gewünscht: {topic}',
  'ledger.started': 'Als Nächstes gewählt: {topic}',
  'ledger.reopened': 'Ein Thema wieder aufgenommen: {topic}',
  'ledger.markedKnown': 'Als bekannt markiert: {topic}',
  'ledger.tooHigh': 'Gesagt, die Einschätzung sei zu hoch: {topic}',
  'ledger.tooLow': 'Gesagt, die Einschätzung sei zu niedrig: {topic}',
  'ledger.clearedUp': 'Als geklärt markiert: {idea}',
  'notice.saveFailed':
    'Der Lernfortschritt konnte nicht gespeichert werden. Er bleibt in diesem Tab und wird mit der nächsten Änderung erneut gespeichert.',
};

export default messages;
