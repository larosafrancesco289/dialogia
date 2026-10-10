// Ελληνικά. Typed from the English source (en.ts); GLOSSARY.md keeps the words
// used throughout. Informal address, plain words, the app's warm voice.

import type en from './en';
import type { Translation } from '@/lib/i18n/catalogue';

const messages: Translation<typeof en> = {
  // How a topic stands
  'status.done': 'Ολοκληρώθηκε',
  'status.skipped': 'Αφέθηκε για τώρα',
  'status.inProgress': 'Σε εξέλιξη',
  'status.startsAfter': 'Ξεκινά μετά από {topics}',
  'status.quoted': '«{name}»',
  'status.upNext': 'Επόμενη',
  'status.notStarted': 'Δεν ξεκίνησε',
  'status.due': 'Για επανάληψη',
  'idea.youThought': 'Νόμιζες ότι {belief}',

  // The Learning Hub
  'hub.goal': 'Ο στόχος σου',
  'hub.topicsDone': {
    one: '{done} από {count} ενότητα ολοκληρώθηκε',
    other: '{done} από {count} ενότητες ολοκληρώθηκαν',
  },
  'hub.hours': { one: 'περίπου {count} ώρα συνολικά', other: 'περίπου {count} ώρες συνολικά' },
  'hub.hint':
    'Κάθε ποσοστό είναι η εκτίμηση του δασκάλου για το πόσο καλά ξέρεις την ενότητα. Άνοιξε μια ενότητα για να δεις γιατί.',
  'hub.hintCorrect':
    'Κάθε ποσοστό είναι η εκτίμηση του δασκάλου για το πόσο καλά ξέρεις την ενότητα. Άνοιξε μια ενότητα για να δεις γιατί ή για να τη διορθώσεις.',
  'hub.toClear': {
    one: '{count} πράγμα να ξεκαθαρίσει',
    other: '{count} πράγματα να ξεκαθαρίσουν',
  },
  'hub.objectives': 'Θα μπορείς να',
  'hub.seemsWrong': 'Δεν σου φαίνεται σωστό;',
  'hub.correct': 'Διόρθωση της εκτίμησης',
  'hub.tooHigh': 'Πολύ υψηλή',
  'hub.tooLow': 'Πολύ χαμηλή',
  'hub.toClearLabel': 'Να ξεκαθαρίσει',
  'hub.gotIt': 'Τώρα το κατάλαβα',
  'hub.startsOnce': 'Ξεκινά μόλις τελειώσεις {topics}.',
  'hub.title': 'Πορεία',
  'hub.open': 'Άνοιγμα της πορείας',
  'hub.close': 'Κλείσιμο της πορείας',
  'hub.labelWith': 'Πορεία: {detail}',
  'hub.topicsOf': { one: '{done} από {count} ενότητα', other: '{done} από {count} ενότητες' },
  'hub.editing': 'Επεξεργασία του πλάνου',
  'hub.proposed': 'Προτεινόμενο πλάνο',
  'hub.done': 'Τέλος',
  'hub.editPlan': 'Επεξεργασία πλάνου',

  // Coming back to topics studied a while ago
  'review.title': 'Ώρα για επανάληψη',
  'review.hint': 'Λίγες γρήγορες ερωτήσεις τώρα σε βοηθούν να κρατήσεις όσα έμαθες.',
  'review.studiedToday': 'Μελετήθηκε σήμερα',
  'review.studied': {
    one: 'Μελετήθηκε πριν από {count} μέρα',
    other: 'Μελετήθηκε πριν από {count} μέρες',
  },
  'review.now': 'Επανάληψη τώρα',
  'why.title': 'Γιατί {percent}',
  'why.starting': 'Αρχική εκτίμηση',
  'why.carriedBefore': 'Μεταφέρθηκε από πριν',
  'why.now': 'Τώρα',
  'why.morePractice': 'Ζήτησες περισσότερη εξάσκηση',
  'why.markedKnown': 'Το σημείωσες ως γνωστό',
  'why.corrected': 'Τη διόρθωσες εσύ',
  'why.told': 'Το είπες στον δάσκαλο',
  'why.byTutor': 'Την όρισε ο δάσκαλος',

  // Margin notes and "Why N%": what moved an estimate
  'carried.elsewhere': '{topic} σε άλλο μάθημα',
  'carried.inChat': '{topic} στο {title}',
  'carried.plain': 'Μεταφέρθηκε από {from} ({estimate}, {date}).',
  'carried.capped':
    'Μεταφέρθηκε από {from} ({estimate}, {date}), με ανώτατο όριο {cap} μέχρι να απαντήσεις εδώ {questions} ερωτήσεις.',
  'note.fromBefore': 'Από όσα είπες πριν από το πλάνο',
  'note.markedKnown': 'Σημειώθηκε ως ήδη γνωστό.',
  'note.you': 'Εσύ ',
  'note.quizRight': 'Απάντησες σωστά σε μια ερώτηση του κουίζ: «{question}»',
  'note.quizWrong': 'Έχασες μια ερώτηση του κουίζ: «{question}»',
  'note.checkRight': 'Απάντησες σωστά σε μια ερώτηση του γρήγορου ελέγχου: «{question}»',
  'note.checkWrong': 'Έχασες μια ερώτηση του γρήγορου ελέγχου: «{question}»',
  'note.quizOneRight': 'Σωστή η ερώτηση του κουίζ',
  'note.quizOneMissed': 'Λάθος η ερώτηση του κουίζ',
  'note.checkOneRight': 'Σωστή η ερώτηση του γρήγορου ελέγχου',
  'note.checkOneMissed': 'Λάθος η ερώτηση του γρήγορου ελέγχου',
  'note.quizScore': {
    one: '{right} από {count} ερώτηση του κουίζ σωστή',
    other: '{right} από {count} ερωτήσεις του κουίζ σωστές',
  },
  'note.checkScore': {
    one: '{right} από {count} ερώτηση του γρήγορου ελέγχου σωστή',
    other: '{right} από {count} ερωτήσεις του γρήγορου ελέγχου σωστές',
  },
  'note.feltHigh': 'Είπες ότι η εκτίμηση σου φάνηκε πολύ υψηλή',
  'note.feltLow': 'Είπες ότι η εκτίμηση σου φάνηκε πολύ χαμηλή',
  'common.close': 'Κλείσιμο',
  'common.cancel': 'Ακύρωση',
  'common.previous': 'Πίσω',
  'common.next': 'Επόμενο',

  // Learn: starting and leaving a learning session
  'learn.label': 'Μάθηση',
  'learn.chat': 'Συζήτηση',
  'learn.mode': 'Λειτουργία',
  'learn.forcedHint': 'Κάθε συζήτηση είναι μάθημα (Ρυθμίσεις › Δάσκαλος)',
  'learn.leaveHint':
    'Έξοδος από αυτό το μάθημα. Μένει στο ιστορικό σου και ανοίγει μια νέα συζήτηση.',
  'learn.startHint': 'Ξεκίνα ένα μάθημα. Ανοίγει ως νέα συζήτηση· αυτή εδώ μένει στο ιστορικό σου.',
  'learn.forced': 'Κάθε συζήτηση είναι μάθημα',
  'learn.tapToLeave': 'Σε μάθημα· πάτησε για έξοδο',
  'learn.start': 'Ξεκίνα ένα μάθημα',

  // Editing the plan in the Hub
  'revise.hint':
    'Για να προσθέσεις, να αφαιρέσεις ή να αλλάξεις τη σειρά των ενοτήτων, ρώτα τον δάσκαλο.',
  'revise.ask': 'Ζήτα αλλαγές από τον δάσκαλο',
  'revise.confirm': 'Να παραλειφθεί και να συνεχίσεις;',
  'revise.skip': 'Παράλειψη',
  'revise.next': 'Αυτή μετά',
  'revise.known': 'Το ξέρω ήδη',
  'revise.reopen': 'Ξανά από την αρχή',
  'plan.applying': 'Εφαρμογή…',
  'plan.approve': 'Έγκριση πλάνου',
  'plan.suggest': 'Πρότεινε αλλαγές',

  // A plan proposal
  'plan.approved': 'Εγκρίθηκε',
  'plan.changesRequested': 'Ζητήθηκαν αλλαγές',
  'plan.revisedBelow': 'Αναθεωρήθηκε παρακάτω',
  'plan.hours': { one: 'Περίπου {count} ώρα', other: 'Περίπου {count} ώρες' },
  'plan.recording': 'Καταγραφή…',
  'plan.viewFull': 'Όλο το πλάνο',

  // The end of a topic
  'chapter.label': 'Τέλος ενότητας: {name}',
  'chapter.kicker': 'Ολοκληρώθηκε η ενότητα {at} από {count}',
  'chapter.estimate': 'Είσαι στο {percent} σε αυτή την ενότητα.',
  'chapter.ready': 'Πάμε παρακάτω;',
  'chapter.last': 'Αυτή ήταν η τελευταία ενότητα του πλάνου.',
  'chapter.goOn': 'Συνέχεια: {topic}',
  'chapter.morePractice': 'Πρώτα λίγη εξάσκηση ακόμα',
  'chapter.back': 'Ξανά για εξάσκηση',
  'chapter.finishedAt': 'Ολοκληρώθηκε στο {percent}',
  'chapter.finished': 'Ολοκληρώθηκε',
  'chapter.next': 'Μετά: {topic}',

  // Cards in a tutor's reply
  'cards.plan': 'Πλάνο μάθησης',
  'cards.revisedPlan': 'Αναθεωρημένο πλάνο',
  'cards.beforeStart': 'Πριν ξεκινήσουμε',
  'cards.exercises': 'Ασκήσεις',
  'cards.refresher': 'Επανάληψη',

  // Quizzes and the quick check
  'quiz.question': 'Ερώτηση {at} από {count}',
  'quiz.questionNumber': 'Ερώτηση {number}',
  'quiz.correct': 'Σωστό',
  'quiz.notQuite': 'Όχι ακριβώς',
  'quiz.check': 'Έλεγχος',
  'quiz.rightAnswer': 'Σωστή απάντηση',
  'quiz.yourAnswer': 'Η απάντησή σου',
  'diagnostic.title': 'Ένας γρήγορος έλεγχος για {topic}',
  'diagnostic.why': 'Για να ξέρει ο δάσκαλος από πού να ξεκινήσει.',
  'diagnostic.score': { one: '{right} από {count} σωστή', other: '{right} από {count} σωστές' },

  // The opening questions
  'intake.title': 'Πες μου για τους στόχους σου',
  'intake.thanks': 'Ευχαριστώ. Το πλάνο θα φτιαχτεί με βάση αυτά.',
  'intake.skippedHint': 'Παραλείφθηκαν. Ο δάσκαλος συνέχισε χωρίς αυτές τις απαντήσεις.',
  'intake.chooseAny': 'Διάλεξε όσα σου ταιριάζουν.',
  'intake.chooseOne': 'Διάλεξε ένα.',
  'intake.sent': 'Οι απαντήσεις στάλθηκαν',
  'intake.skipped': 'Παραλείφθηκαν',
  'intake.sending': 'Αποστολή…',
  'intake.send': 'Αποστολή απαντήσεων',

  // Margin notes beside a reply
  'margin.label': 'Τι σημείωσε ο δάσκαλος',
  'margin.change': 'από {from} σε {to}',
  'margin.more': { one: '+{count} ακόμα', other: '+{count} ακόμα' },
  'margin.now': 'Τώρα {percent}.',

  // Asking the tutor to change the plan
  'feedback.title': 'Πες στον δάσκαλο τι να αλλάξει',
  'feedback.about': 'Για {topic}',
  'feedback.placeholderTopic':
    'Να εμβαθύνετε σε κάτι πριν προχωρήσετε, να αλλάξει η σειρά των ενοτήτων ή να μπουν βάσεις, αν το {topic} σου φαίνεται πολύ προχωρημένο.',
  'feedback.placeholder':
    'Περισσότερη εξάσκηση στα βασικά, παράλειψη όσων ήδη ξέρεις ή άλλη εστίαση.',
  'feedback.hint':
    'Η σημείωσή σου εμφανίζεται στη συζήτηση και ο δάσκαλος απαντά με αναθεωρημένο πλάνο.',
  'feedback.shortcut': '{key} Enter για αποστολή',
  'feedback.send': 'Αποστολή στον δάσκαλο',

  // Settings › Tutor
  'settings.title': 'Δάσκαλος',
  'settings.newest': 'Πάντα η νεότερη έκδοση',
  'settings.offer': 'Προσφορά της Μάθησης',
  'settings.offerHint':
    'Η Μάθηση βρίσκεται δίπλα στη Συζήτηση: ένας δάσκαλος σχεδιάζει μαζί σου ένα σύντομο μάθημα, σε διδάσκει και ελέγχει τι ξέρεις με γρήγορες ερωτήσεις.',
  'settings.always': 'Πάντα μάθηση',
  'settings.alwaysHint': 'Κάθε συζήτηση είναι μάθημα. Η Συζήτηση δεν προσφέρεται.',
  'settings.follow': 'Ακολούθησε τον δάσκαλο',
  'settings.followHint': 'Κύλιση στο τελευταίο μήνυμα όσο απαντά ο δάσκαλος.',
  'settings.model': 'Μοντέλο του δασκάλου',
  'settings.searchModel': 'Αναζήτηση άλλου μοντέλου',
  'settings.searchModelLabel': 'Αναζήτηση μοντέλου για τον δάσκαλο',
  'settings.modelHint': 'Κάθε μάθημα χρησιμοποιεί αυτό το μοντέλο.',
  'settings.howItWorks':
    'Κάθε μάθημα φτιάχνει ένα πλάνο από το πρώτο σου μήνυμα και παρακολουθεί τι ξέρεις καθώς προχωράς. Ο δάσκαλος περνά στην επόμενη ενότητα όταν το θέλεις.',

  // The tutor's greeting at the top of a learning session
  'welcome.first':
    'Πες μου τι θέλεις να μάθεις και γιατί. Θα σχεδιάσω ένα πλάνο για εμάς, μπορείς να το αλλάξεις, και καθώς δουλεύουμε θα κρατάμε σημειώσεις για το τι ξέρεις. Αν έχεις σημειώσεις ή κείμενα, πρόσθεσέ τα και θα δουλέψω και με αυτά.',
  'welcome.goal': '«{goal}»',
  'welcome.back': 'Καλώς ήρθες πάλι',
  'welcome.finished': 'Ολοκληρώσαμε το πλάνο για {goal}',
  'welcome.goBack': 'Μπορούμε να ξαναδούμε οποιοδήποτε κομμάτι του ή να βάλουμε νέο στόχο',
  'welcome.notesWelcome': 'Νέες σημειώσεις ή κείμενα είναι επίσης ευπρόσδεκτα',
  'welcome.workingToward': 'Δουλεύουμε για {goal}',
  'welcome.nextWithDescription': 'Η επόμενη ενότητα είναι {topic}: {description}',
  'welcome.next': 'Η επόμενη ενότητα είναι {topic}',
  'welcome.ask': 'Κάνε μια ερώτηση ή ζήτα εξάσκηση, όποτε θέλεις',
  'welcome.addNotes': 'Μπορείς να προσθέσεις σημειώσεις ή κείμενα οποιαδήποτε στιγμή',

  // The learner's actions, as lines in the transcript
  'ledger.score': { one: '{right} από {count} σωστή', other: '{right} από {count} σωστές' },
  'ledger.intake': 'Απάντησα στις αρχικές ερωτήσεις',
  'ledger.quiz': 'Απάντησα στο κουίζ: {score}',
  'ledger.diagnostic': 'Τελείωσα τον γρήγορο έλεγχο: {score}',
  'ledger.approved': 'Ενέκρινα το πλάνο',
  'ledger.declined': 'Ζήτησα αλλαγές στο πλάνο: {feedback}',
  'ledger.goingOn': 'Συνεχίζω: {topic}',
  'ledger.morePractice': 'Ζήτησα περισσότερη εξάσκηση: {topic}',
  'ledger.started': 'Διάλεξα τι ακολουθεί: {topic}',
  'ledger.reopened': 'Ξανάπιασα μια ενότητα: {topic}',
  'ledger.markedKnown': 'Το σημείωσα ως γνωστό: {topic}',
  'ledger.tooHigh': 'Είπα ότι η εκτίμηση μού φάνηκε πολύ υψηλή: {topic}',
  'ledger.tooLow': 'Είπα ότι η εκτίμηση μού φάνηκε πολύ χαμηλή: {topic}',
  'ledger.clearedUp': 'Το σημείωσα ως ξεκαθαρισμένο: {idea}',
  'ledger.review': 'Ζήτησα επανάληψη: {topics}',
  'notice.saveFailed':
    'Η πρόοδος του μαθήματος δεν αποθηκεύτηκε. Κρατιέται σε αυτή την καρτέλα και θα ξαναδοκιμαστεί με την επόμενη αλλαγή.',
};

export default messages;
