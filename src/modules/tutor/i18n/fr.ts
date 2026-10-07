// Français. Typed from the English source (en.ts); GLOSSARY.md keeps the words
// used throughout. Informal address, plain words, the app's warm voice.

import type en from './en';
import type { Translation } from '@/lib/i18n/catalogue';

const messages: Translation<typeof en> = {
  // How a topic stands
  'status.done': 'Terminé',
  'status.inProgress': 'En cours',
  'status.startsAfter': 'Commence après {topics}',
  'status.quoted': '« {name} »',
  'status.upNext': 'Ensuite',
  'status.notStarted': 'Pas commencé',
  'idea.youThought': 'Tu pensais que {belief}',

  // The Learning Hub
  'hub.goal': 'Ton objectif',
  'hub.topicsDone': {
    one: '{done} sujet sur {count} terminé',
    other: '{done} sujets sur {count} terminés',
  },
  'hub.hours': { one: 'environ {count} heure en tout', other: 'environ {count} heures en tout' },
  'hub.hint':
    'Chaque pourcentage est l’estimation du tuteur de ce que tu maîtrises de ce sujet. Ouvre un sujet pour voir pourquoi.',
  'hub.hintCorrect':
    'Chaque pourcentage est l’estimation du tuteur de ce que tu maîtrises de ce sujet. Ouvre un sujet pour voir pourquoi, ou pour la corriger.',
  'hub.toClear': { one: '{count} point à éclaircir', other: '{count} points à éclaircir' },
  'hub.objectives': 'Tu sauras',
  'hub.seemsWrong': 'Ça ne te semble pas juste ?',
  'hub.correct': 'Corriger l’estimation',
  'hub.tooHigh': 'Trop haute',
  'hub.tooLow': 'Trop basse',
  'hub.toClearLabel': 'À éclaircir',
  'hub.gotIt': 'C’est bon, j’ai compris',
  'hub.startsOnce': 'Commence quand tu auras fini {topics}.',
  'hub.title': 'Parcours',
  'hub.open': 'Ouvrir le parcours',
  'hub.close': 'Fermer le parcours',
  'hub.labelWith': 'Parcours : {detail}',
  'hub.topicsOf': { one: '{done} sujet sur {count}', other: '{done} sujets sur {count}' },
  'hub.editing': 'Modification du plan',
  'hub.proposed': 'Plan proposé',
  'hub.done': 'Terminé',
  'hub.editPlan': 'Modifier le plan',
  'why.title': 'Pourquoi {percent}',
  'why.starting': 'Estimation de départ',
  'why.carriedBefore': 'Reprise d’avant',
  'why.now': 'Maintenant',
  'why.morePractice': 'Tu as demandé plus d’entraînement',
  'why.markedKnown': 'Tu l’as marqué comme connu',
  'why.corrected': 'Tu l’as corrigée',
  'why.told': 'Tu l’as dit au tuteur',
  'why.byTutor': 'Fixée par le tuteur',

  // Margin notes and "Why N%": what moved an estimate
  'carried.elsewhere': '{topic} dans une autre séance d’apprentissage',
  'carried.inChat': '{topic} dans {title}',
  'carried.plain': 'Reprise de {from} ({estimate}, {date}).',
  'carried.capped':
    'Reprise de {from} ({estimate}, {date}), plafonnée à {cap} jusqu’à ce que tu répondes ici à {questions} questions.',
  'note.fromBefore': 'D’après ce que tu as dit avant le plan',
  'note.markedKnown': 'Marqué comme déjà connu.',
  'note.you': 'Tu ',
  'note.quizRight': 'Tu as bien répondu à une question du quiz : « {question} »',
  'note.quizWrong': 'Erreur sur une question du quiz : « {question} »',
  'note.checkRight': 'Tu as bien répondu à une question du petit test : « {question} »',
  'note.checkWrong': 'Erreur sur une question du petit test : « {question} »',
  'note.quizOneRight': 'Question du quiz réussie',
  'note.quizOneMissed': 'Question du quiz manquée',
  'note.checkOneRight': 'Question du petit test réussie',
  'note.checkOneMissed': 'Question du petit test manquée',
  'note.quizScore': {
    one: '{right} question du quiz réussie sur {count}',
    other: '{right} questions du quiz réussies sur {count}',
  },
  'note.checkScore': {
    one: '{right} question du petit test réussie sur {count}',
    other: '{right} questions du petit test réussies sur {count}',
  },
  'note.feltHigh': 'Tu as dit que l’estimation te semblait trop haute',
  'note.feltLow': 'Tu as dit que l’estimation te semblait trop basse',
  'common.close': 'Fermer',
  'common.cancel': 'Annuler',
  'common.previous': 'Précédente',
  'common.next': 'Suivante',

  // Learn: starting and leaving a learning session
  'learn.label': 'Apprendre',
  'learn.chat': 'Discuter',
  'learn.mode': 'Mode',
  'learn.forcedHint': 'Chaque discussion est une séance d’apprentissage (Réglages › Tuteur)',
  'learn.leaveHint':
    'Quitter cette séance d’apprentissage. Elle reste dans ton historique, et une nouvelle discussion s’ouvre.',
  'learn.startHint':
    'Commencer une séance d’apprentissage. Elle s’ouvre dans une nouvelle discussion ; celle-ci reste dans ton historique.',
  'learn.forced': 'Chaque discussion est une séance d’apprentissage',
  'learn.tapToLeave': 'En séance d’apprentissage ; touche pour quitter',
  'learn.start': 'Commencer une séance d’apprentissage',

  // Editing the plan in the Hub
  'revise.hint': 'Pour ajouter, retirer ou réordonner des sujets, demande au tuteur.',
  'revise.ask': 'Demander des changements au tuteur',
  'revise.confirm': 'Le marquer comme terminé et passer à la suite ?',
  'revise.skip': 'Le passer',
  'revise.next': 'Faire celui-ci ensuite',
  'revise.known': 'Je le sais déjà',
  'revise.reopen': 'Le reprendre',
  'plan.applying': 'Application…',
  'plan.approve': 'Approuver le plan',
  'plan.suggest': 'Suggérer des changements',

  // A plan proposal
  'plan.approved': 'Approuvé',
  'plan.changesRequested': 'Changements demandés',
  'plan.revisedBelow': 'Révisé plus bas',
  'plan.hours': { one: 'Environ {count} heure', other: 'Environ {count} heures' },
  'plan.recording': 'Enregistrement…',
  'plan.viewFull': 'Voir le plan complet',

  // The end of a topic
  'chapter.label': 'Fin du sujet : {name}',
  'chapter.kicker': 'Sujet {at} sur {count} terminé',
  'chapter.estimate': 'Tu es à {percent} sur ce sujet.',
  'chapter.ready': 'On passe à la suite ?',
  'chapter.last': 'C’était le dernier sujet du plan.',
  'chapter.goOn': 'Continuer : {topic}',
  'chapter.morePractice': 'D’abord un peu plus d’entraînement',
  'chapter.back': 'De retour pour s’entraîner',
  'chapter.finishedAt': 'Terminé à {percent}',
  'chapter.finished': 'Terminé',
  'chapter.next': 'Ensuite : {topic}',

  // Cards in a tutor's reply
  'cards.plan': 'Plan d’apprentissage',
  'cards.revisedPlan': 'Plan révisé',
  'cards.beforeStart': 'Avant de commencer',
  'cards.exercises': 'Exercices',

  // Quizzes and the quick check
  'quiz.question': 'Question {at} sur {count}',
  'quiz.questionNumber': 'Question {number}',
  'quiz.correct': 'Correct',
  'quiz.notQuite': 'Pas tout à fait',
  'diagnostic.title': 'Un petit test sur {topic}',
  'diagnostic.why': 'Pour que le tuteur sache par où commencer.',
  'diagnostic.score': { one: '{right} sur {count} juste', other: '{right} sur {count} justes' },

  // The opening questions
  'intake.title': 'Parle-moi de tes objectifs',
  'intake.thanks': 'Merci. Le plan sera construit autour de ça.',
  'intake.skippedHint': 'Passées. Le tuteur a continué sans ces réponses.',
  'intake.chooseAny': 'Choisis toutes celles qui te correspondent.',
  'intake.chooseOne': 'Choisis-en une.',
  'intake.sent': 'Réponses envoyées',
  'intake.skipped': 'Passées',
  'intake.sending': 'Envoi…',
  'intake.send': 'Envoyer les réponses',

  // Margin notes beside a reply
  'margin.label': 'Ce que le tuteur a noté',
  'margin.change': 'de {from} à {to}',
  'margin.more': { one: '+{count} de plus', other: '+{count} de plus' },
  'margin.now': 'Maintenant {percent}.',

  // Asking the tutor to change the plan
  'feedback.title': 'Dis au tuteur ce qu’il faut changer',
  'feedback.about': 'À propos de {topic}',
  'feedback.placeholderTopic':
    'Approfondir quelque chose avant d’avancer, réordonner les sujets, ou ajouter des bases si {topic} te semble trop avancé.',
  'feedback.placeholder':
    'Plus d’entraînement sur les bases, sauter ce que tu sais déjà, ou un autre angle.',
  'feedback.hint': 'Ta note apparaît dans la discussion, et le tuteur répond avec un plan révisé.',
  'feedback.shortcut': '{key} Entrée pour envoyer',
  'feedback.send': 'Envoyer au tuteur',

  // Settings › Tutor
  'settings.title': 'Tuteur',
  'settings.newest': 'Toujours la version la plus récente',
  'settings.offer': 'Proposer Apprendre',
  'settings.offerHint':
    'Apprendre se trouve à côté de Discuter : un tuteur prépare avec toi un petit cours, te l’enseigne et vérifie ce que tu sais avec des questions rapides.',
  'settings.always': 'Toujours apprendre',
  'settings.alwaysHint':
    'Chaque discussion est une séance d’apprentissage. Discuter n’est pas proposé.',
  'settings.follow': 'Suivre le tuteur',
  'settings.followHint': 'Faire défiler jusqu’au dernier message pendant que le tuteur répond.',
  'settings.model': 'Modèle du tuteur',
  'settings.searchModel': 'Chercher un autre modèle',
  'settings.searchModelLabel': 'Chercher un modèle pour le tuteur',
  'settings.modelHint': 'Chaque séance d’apprentissage utilise ce modèle.',
  'settings.howItWorks':
    'Chaque séance d’apprentissage prépare un plan à partir de ton premier message et suit ce que tu sais au fil du temps. Le tuteur passe au sujet suivant quand tu le veux.',

  // The tutor's greeting at the top of a learning session
  'welcome.first':
    'Dis-moi ce que tu veux apprendre, et pourquoi. Je prépare un plan pour nous, tu peux le remanier, et en travaillant on suivra ce que tu sais. Si tu as des notes ou des lectures, ajoute-les et je m’en servirai aussi.',
  'welcome.goal': '« {goal} »',
  'welcome.back': 'Te revoilà',
  'welcome.finished': 'On a terminé le plan pour {goal}',
  'welcome.goBack': 'On peut reprendre n’importe quelle partie, ou fixer un nouvel objectif',
  'welcome.notesWelcome': 'De nouvelles notes ou lectures sont bienvenues aussi',
  'welcome.workingToward': 'On travaille vers {goal}',
  'welcome.nextWithDescription': 'Prochaine étape, {topic} : {description}',
  'welcome.next': 'Prochaine étape : {topic}',
  'welcome.ask': 'Pose une question, ou demande un exercice, quand tu veux',
  'welcome.addNotes': 'Tu peux ajouter des notes ou des lectures à tout moment',

  // The learner's actions, as lines in the transcript
  'ledger.score': { one: '{right} sur {count} juste', other: '{right} sur {count} justes' },
  'ledger.intake': 'J’ai répondu aux questions de départ',
  'ledger.quiz': 'J’ai répondu au quiz : {score}',
  'ledger.diagnostic': 'J’ai fini le petit test : {score}',
  'ledger.approved': 'J’ai approuvé le plan',
  'ledger.declined': 'J’ai demandé des changements au plan : {feedback}',
  'ledger.goingOn': 'Je continue : {topic}',
  'ledger.morePractice': 'J’ai demandé plus d’entraînement : {topic}',
  'ledger.started': 'J’ai choisi la suite : {topic}',
  'ledger.reopened': 'J’ai repris un sujet : {topic}',
  'ledger.markedKnown': 'Marqué comme connu : {topic}',
  'ledger.tooHigh': 'J’ai dit que l’estimation me semblait trop haute : {topic}',
  'ledger.tooLow': 'J’ai dit que l’estimation me semblait trop basse : {topic}',
  'ledger.clearedUp': 'Marqué comme éclairci : {idea}',
  'notice.saveFailed':
    'La progression du tuteur n’a pas pu être enregistrée. Elle reste dans cet onglet et sera réessayée au prochain changement.',
};

export default messages;
