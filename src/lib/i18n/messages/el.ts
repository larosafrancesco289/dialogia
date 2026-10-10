// Ελληνικά. Typed from the English source (en.ts); GLOSSARY.md keeps the words
// used throughout. Informal address, plain words, the app's warm voice.

import type en from './en';
import type { Translation } from '@/lib/i18n/catalogue';

const messages: Translation<typeof en> = {
  // Shared
  'common.notNow': 'Όχι τώρα',
  'common.off': 'Ανενεργή',
  'common.cancel': 'Ακύρωση',
  'common.save': 'Αποθήκευση',
  'common.delete': 'Διαγραφή',
  'common.close': 'Κλείσιμο',
  'common.dismiss': 'Κλείσιμο',

  // Welcome and first run
  'welcome.headline.first': 'Καλώς ήρθες στο {name}',
  'welcome.headline.learn': 'Τι θα {word};',
  'welcome.headline.learnWord': 'μάθεις',
  'welcome.headline.chat': 'Ξεκίνα έναν νέο {word}',
  'welcome.headline.chatWord': 'διάλογο',
  'welcome.subline.withTutor':
    'Συζήτησε με τα κορυφαία μοντέλα τεχνητής νοημοσύνης ή μάθε κάτι με έναν δάσκαλο.',
  'welcome.subline': 'Συζήτησε με τα κορυφαία μοντέλα τεχνητής νοημοσύνης.',
  'welcome.connectTitle': 'Πρώτα, σύνδεσε ένα μοντέλο',
  'welcome.connected': 'Συνδέθηκε',
  'setup.title': 'Σύνδεση μοντέλου',
  'setup.needsKey':
    'Το {model} τρέχει στο {provider}. Πρόσθεσε το κλειδί σου για το {provider} για να το χρησιμοποιήσεις.',
  'connect.lead.openrouter':
    'Επικόλλησε ένα κλειδί από το OpenRouter. Ένα κλειδί ανοίγει σχεδόν όλα τα μοντέλα, και πληρώνεις το OpenRouter μόνο για ό,τι χρησιμοποιείς.',
  'connect.lead.anthropic':
    'Επικόλλησε ένα κλειδί από την Anthropic για να χρησιμοποιήσεις τα μοντέλα Claude. Πληρώνεις την Anthropic μόνο για ό,τι χρησιμοποιείς.',
  'connect.lead.local':
    'Επικόλλησε τη διεύθυνση ενός διακομιστή μοντέλων που τρέχεις εσύ, όπως το Ollama ή το LM Studio. Οι περισσότεροι δεν χρειάζονται κλειδί.',
  'connect.steps.account': '{action} στο {link}.',
  'connect.steps.accountAction': 'Φτιάξε λογαριασμό',
  'connect.steps.credit': '{action} στην ενότητα {page}.',
  'connect.steps.creditAction': 'Βάλε λίγη πίστωση',
  'connect.steps.key': '{action} στην ενότητα {link}, αντίγραψέ το και επικόλλησέ το παραπάνω.',
  'connect.steps.keyAction': 'Δημιούργησε ένα κλειδί',
  'connect.serverAddress': 'Διεύθυνση διακομιστή',
  'connect.submit': 'Σύνδεση',
  'connect.howToGetKey': 'Πώς βρίσκω κλειδί;',
  'connect.otherWays': 'Άλλοι τρόποι σύνδεσης',
  'connect.privacy.key': 'Το κλειδί και οι συζητήσεις σου μένουν σε αυτόν τον browser.',
  'connect.privacy.server': 'Οι συζητήσεις σου μένουν σε αυτόν τον browser.',
  'connect.option.openrouter': 'Κλειδί OpenRouter',
  'connect.option.openrouterNote': 'Σχεδόν όλα τα μοντέλα, ένα κλειδί',
  'connect.option.anthropic': 'Κλειδί Anthropic',
  'connect.option.anthropicNote': 'Μόνο μοντέλα Claude',
  'connect.option.local': 'Ο δικός σου διακομιστής',
  'connect.option.localNote': 'Ollama, LM Studio και παρόμοια',
  'connect.keyRefused':
    'Το {provider} δεν δέχτηκε αυτό το κλειδί. Έλεγξε ότι το αντέγραψες ολόκληρο ή φτιάξε καινούργιο.',
  'connect.serverSilent': 'Δεν ήρθε κανένα μοντέλο από αυτή τη διεύθυνση. Τρέχει ο διακομιστής;',
  'connect.keyNotSaved':
    'Αυτός ο browser δεν μπόρεσε να αποθηκεύσει το κλειδί σου, οπότε λειτουργεί μόνο μέχρι να κλείσεις τη σελίδα.',
  'connect.invalidAddress':
    'Γράψε ολόκληρη τη διεύθυνση, όπως http://localhost:11434/v1, με http:// ή https:// στην αρχή.',

  // Composer
  'composer.placeholder': 'Ρώτα ό,τι θέλεις',
  'composer.slashSuggestions': 'Προτάσεις εντολών',
  'composer.stop': 'Διακοπή απάντησης',
  'composer.writingElsewhere': 'Γράφει σε άλλη καρτέλα…',
  'composer.attach': 'Επισύναψη αρχείων',
  'composer.memory.label': 'Κράτα αυτή τη συζήτηση έξω από τη μνήμη',
  'composer.memory.on':
    'Μνήμη: ενεργή σε αυτή τη συζήτηση. Απενεργοποίησέ τη για να μείνει έξω από τη μνήμη.',
  'composer.memory.off':
    'Μνήμη: ανενεργή σε αυτή τη συζήτηση. Τίποτα δεν διαβάζεται ούτε απομνημονεύεται.',
  'composer.memory.offLabel': 'Χωρίς μνήμη',
  'composer.sendLabel': 'Αποστολή μηνύματος',
  'composer.send': 'Αποστολή',
  'composer.sendFailed': 'Το μήνυμα δεν στάλθηκε. Το προσχέδιό σου είναι ξανά στο πεδίο γραφής.',
  'composer.sendFailedElsewhere':
    'Το μήνυμα δεν στάλθηκε. Το προσχέδιό σου είναι ξανά στη συζήτησή του.',

  // Thinking effort
  'effort.title': 'Βάθος σκέψης',
  'effort.buttonTitle': 'Σκέψη: {level}',
  'effort.default': 'προεπιλογή',
  'effort.modelDefault': '{level} (προεπιλογή του μοντέλου)',
  'effort.none': 'Καθόλου',
  'effort.minimal': 'Ελάχιστο',
  'effort.low': 'Χαμηλό',
  'effort.medium': 'Μέτριο',
  'effort.high': 'Υψηλό',
  'effort.xhigh': 'Πολύ υψηλό',
  'effort.max': 'Μέγιστο',
  'effort.hint.none': 'Απαντά αμέσως',
  'effort.hint.minimal': 'Μια ελάχιστη σκέψη',
  'effort.hint.low': 'Σκέφτεται λίγο πρώτα',
  'effort.hint.medium': 'Το σκέφτεται καλά',
  'effort.hint.high': 'Σκέφτεται σοβαρά',
  'effort.hint.xhigh': 'Σκέφτεται πολύ σοβαρά',
  'effort.hint.max': 'Παίρνει όσο χρόνο χρειάζεται',

  // Web search
  'search.title': 'Αναζήτηση στο web',
  'search.short': 'Αναζήτηση',
  'search.state.on': 'Αναζήτηση στο web: ενεργή ({provider})',
  'search.state.off': 'Αναζήτηση στο web: ανενεργή ({provider})',
  'search.builtIn': 'Ενσωματωμένη',
  'search.builtInDescription': 'Η αναζήτηση του ίδιου του παρόχου του μοντέλου',
  'search.toolDescription': 'Ψάχνει όταν χρειάζεται και διαβάζει τις σελίδες που βρίσκει',
  'search.openrouter': 'Αναζήτηση OpenRouter',

  // Slash commands (the commands themselves stay in English)
  'slash.model': 'Απάντηση με άλλο μοντέλο',
  'slash.search': 'Ενεργοποίηση ή απενεργοποίηση της αναζήτησης στο web',
  'slash.reasoning': 'Πόσο σκέφτεται το μοντέλο',
  'slash.help': 'Τι κάνουν αυτές οι εντολές',
  'slash.typeModel': 'Γράψε το όνομα ενός μοντέλου…',
  'slash.searchOn': 'Η αναζήτηση στο web είναι ενεργή σε αυτή τη συζήτηση.',
  'slash.searchOff': 'Η αναζήτηση στο web είναι ανενεργή σε αυτή τη συζήτηση.',
  'slash.searchOnNext': 'Η αναζήτηση στο web θα είναι ενεργή στην επόμενη συζήτηση.',
  'slash.searchOffNext': 'Η αναζήτηση στο web θα είναι ανενεργή στην επόμενη συζήτηση.',
  'slash.noThinking':
    'Αυτό το μοντέλο απαντά χωρίς να σκεφτεί πρώτα, οπότε δεν υπάρχει κάτι να ρυθμίσεις.',
  'slash.effortUnavailable': 'Αυτό το μοντέλο δεν προσφέρει το επίπεδο «{level}».',
  'slash.effortSet': 'Το βάθος σκέψης ορίστηκε σε «{level}».',
  'slash.noSuchModel': 'Κανένα μοντέλο δεν λέγεται {name}.',
  'slash.modelSet': 'Τώρα απαντά το {name}.',
  'slash.helpText':
    'Γράψε /model και ένα όνομα για να αλλάξεις μοντέλο, /search on ή off για την αναζήτηση στο web και /reasoning με ένα επίπεδο όπως low ή high.',

  // Chat
  'chat.opening': 'Άνοιγμα της συζήτησης…',
  'chat.showEarlier': {
    one: 'Εμφάνιση του προηγούμενου μηνύματος ({count})',
    other: 'Εμφάνιση προηγούμενων μηνυμάτων ({count})',
  },
  'chat.scrollToBottom': 'Μετάβαση στο τέλος',

  // Sidebar and chats
  'chat.untitled': 'Νέα συζήτηση',
  'chat.branchMark': '(κλάδος)',

  // A message and its actions
  'message.saveShortcut': '{key} Enter για αποθήκευση',
  'message.copy': 'Αντιγραφή',
  'message.copied': 'Αντιγράφηκε',
  'message.copyLabel': 'Αντιγραφή μηνύματος',
  'message.edit': 'Επεξεργασία',
  'message.editing': 'Σε επεξεργασία…',
  'message.editMessage': 'Επεξεργασία μηνύματος',
  'message.editReply': 'Επεξεργασία απάντησης',
  'message.editPlaceholder': 'Επεξεργάσου το μήνυμά σου…',
  'message.editReplyPlaceholder': 'Επεξεργάσου την απάντηση…',
  'message.showLess': 'Λιγότερα',
  'message.showAll': 'Όλο το μήνυμα',
  'message.writing': 'Γράφει απάντηση',
  'message.stillWorking': 'Δουλεύει ακόμα',
  'message.tryAgain': 'Δοκίμασε ξανά',
  'message.branch': 'Διακλάδωση σε νέα συζήτηση',
  'message.selectText': 'Επιλογή κειμένου',
  'message.sheet.reply': 'Απάντηση',
  'message.sheet.yours': 'Το μήνυμά σου',
  'message.sheet.replyActions': 'Ενέργειες απάντησης',
  'message.sheet.messageActions': 'Ενέργειες μηνύματος',
  'message.filtered.title': 'Απορρίφθηκε από το φίλτρο ασφαλείας του μοντέλου',
  'message.filtered.cutShort': 'Η απάντηση διακόπηκε από το φίλτρο ασφαλείας του παρόχου.',
  'message.filtered.blocked':
    'Ένα φίλτρο ασφαλείας μπλόκαρε αυτό το αίτημα πριν απαντήσει το μοντέλο.',
  'message.filtered.reason': 'Αιτία: {reason}.',
  'message.youSaid': 'Εσύ:',

  // A reply's versions (Try again keeps the old one)
  'versions.label': 'Έκδοση {at} από {count}',
  'versions.labelWithModel': 'Έκδοση {at} από {count}, {model}',
  'versions.group': 'Εκδόσεις αυτής της απάντησης',
  'versions.onlyLatest': 'Μόνο η τελευταία απάντηση μπορεί να αλλάξει έκδοση',
  'versions.previous': 'Προηγούμενη έκδοση',
  'versions.next': 'Επόμενη έκδοση',
  'versions.delete': 'Διαγραφή αυτής της έκδοσης',
  'versions.deleteNumbered': 'Διαγραφή της έκδοσης {at} από {count}',
  'versions.deleteTitle': 'Διαγραφή αυτής της έκδοσης;',
  'versions.deleteBody': 'Αυτή η έκδοση θα χαθεί οριστικά. Η απάντηση μένει, με μια άλλη έκδοση.',

  // The reasoning ledger: what the model thought and which tools it used
  'activity.thinking': 'Σκέφτεται',
  'activity.thought': 'Σκέφτηκε',
  'activity.thoughtFor': 'για {duration}',
  'activity.words': { one: '{count} λέξη', other: '{count} λέξεις' },
  'activity.tools': { one: '{count} εργαλείο', other: '{count} εργαλεία' },
  'activity.searches': { one: '{count} αναζήτηση', other: '{count} αναζητήσεις' },
  'activity.waiting': 'Περιμένει το μοντέλο… {seconds} δ.',
  'activity.searchingWeb': 'Ψάχνει στο web',
  'activity.searchingFor': 'Αναζήτηση: {query}',
  'activity.searchingSources': 'Ψάχνει πηγές',
  'activity.searchFailed': 'Η αναζήτηση απέτυχε',
  'activity.tool.fetch': 'Διαβάζει μια σελίδα',
  'activity.tool.memoryRead': 'Κοιτάζει τη μνήμη',
  'activity.tool.memorySave': 'Αποθηκεύει στη μνήμη',
  'activity.tool.memoryForget': 'Ξεχνά μια σημείωση',
  'activity.notFound': 'Δεν βρέθηκε',
  'activity.notSaved': 'Δεν αποθηκεύτηκε',
  'activity.searching': 'Ψάχνει',
  'activity.running': 'Τρέχει',
  'activity.notApplied': 'Δεν εφαρμόστηκε',
  'activity.stopped': 'Σταμάτησε',
  'activity.failed': 'Απέτυχε',
  'activity.noResults': 'Κανένα αποτέλεσμα',
  'activity.copyThinking': 'Αντιγραφή σκέψης',
  'activity.turnFailed': 'Ο γύρος απέτυχε πριν τρέξει αυτή η κλήση',
  'sources.found': { one: 'Βρέθηκε {count} πηγή', other: 'Βρέθηκαν {count} πηγές' },
  'sources.looking': 'Ψάχνει πηγές…',
  'sources.lookingFor': 'Ψάχνει πηγές: {query}…',
  'sources.untitled': 'Πηγή χωρίς τίτλο',

  // Ends with {title} in every language: the renderer knows a citation by the words before it.
  'sources.citation': 'Πηγή {number}: {title}',

  // How a reply ended
  'ending.stopped': 'Σταμάτησε πριν το τέλος.',
  'ending.failed': 'Κόπηκε από ένα σφάλμα πριν το τέλος.',
  'ending.interrupted': 'Κόπηκε: η σελίδα έκλεισε ενώ γραφόταν.',
  'ending.nothing.stopped': 'Σταμάτησε πριν ξεκινήσει η απάντηση.',
  'ending.nothing.failed': 'Αυτή η απάντηση απέτυχε.',
  'ending.nothing.interrupted': 'Η σελίδα έκλεισε πριν ξεκινήσει η απάντηση.',
  'ending.length': 'Σταμάτησε στο όριο μήκους.',
  'ending.announce.stopped': 'Η απάντηση σταμάτησε',
  'ending.announce.failed': 'Η απάντηση απέτυχε',
  'ending.announce.length': 'Η απάντηση σταμάτησε στο όριο μήκους',
  'ending.announce.finished': 'Η απάντηση ολοκληρώθηκε',

  // The line under a reply: model, speed, cost
  'colophon.firstWord': 'πρώτη λέξη σε {time}',
  'colophon.tokens': { one: '{count} token', other: '{count} tokens' },
  'colophon.speed': '{rate} tokens/δ.',
  'colophon.under': 'κάτω από {amount}',

  // Attachments
  'attachments.openLarger': 'Άνοιγμα σε μεγαλύτερο μέγεθος',
  'attachments.image': 'εικόνα',
  'attachments.audio': 'Ήχος',
  'attachments.audioAttached': 'Επισυνάφθηκε ήχος',
  'attachments.pages': { one: '{count} σελίδα', other: '{count} σελίδες' },
  'attachments.attachment': 'συνημμένο',
  'attachments.remove': 'Αφαίρεση',
  'attachments.removeNamed': 'Αφαίρεση: {name}',
  'attachments.attachedAudio': 'Επισυνάφθηκε (mp3/wav)',
  'attachments.attachedPdf': 'Επισυνάφθηκε (διαβάζεται στον browser σου)',

  // Developer views (Settings › Appearance › Developer)
  'debug.request': 'Αίτημα αποσφαλμάτωσης',
  'debug.toolActivity': 'Δραστηριότητα εργαλείων',
  'debug.overview': 'Επισκόπηση',
  'debug.toolDefinitions': 'Ορισμοί εργαλείων',
  'debug.plugins': 'Πρόσθετα',
  'debug.messages': 'Μηνύματα',
  'debug.noContent': 'Κανένα ορατό περιεχόμενο',
  'debug.toolCalls': 'Κλήσεις εργαλείων: {names}',
  'debug.rawJson': 'Ακατέργαστο JSON του αιτήματος',
  'debug.copyRequest': 'Αντιγραφή αιτήματος',
  'toolLog.heading': 'Κλήσεις εργαλείων ({count})',
  'toolLog.input': 'Είσοδος',
  'toolLog.output': 'Έξοδος',
  'toolLog.copy.input': 'Αντιγραφή JSON εισόδου',
  'toolLog.copy.output': 'Αντιγραφή JSON εξόδου',
  'toolLog.metadata': 'Μεταδεδομένα',
  'toolLog.category.search': 'Αναζήτηση',
  'toolLog.category.tutor': 'Δάσκαλος',
  'toolLog.category.planning': 'Σχεδιασμός',
  'toolLog.category.system': 'Σύστημα',
  'toolLog.category.other': 'Άλλο',
  'toolLog.searchResults': {
    one: 'Αναζήτηση στο web ({count} αποτέλεσμα)',
    other: 'Αναζήτηση στο web ({count} αποτελέσματα)',
  },
  'toolLog.searchError': 'Σφάλμα αναζήτησης στο web',
  'toolLog.completed': 'Ολοκληρώθηκε',
  'toolLog.pending': 'Σε αναμονή',
  'toolLog.round': 'Γύρος {round}',
  'toolLog.cached': 'Αποτέλεσμα από την προσωρινή μνήμη',
  'toolLog.usedInReply': 'Χρησιμοποιήθηκε στην απάντηση',
  'toolLog.learnerUpdated': 'Ενημερώθηκε το προφίλ του μαθητή',
  'toolLog.planUpdated': 'Ενημερώθηκε το πλάνο',

  // Models
  'models.caps.reasoning': 'Σκέφτεται πριν απαντήσει',
  'models.caps.vision': 'Διαβάζει εικόνες',
  'models.caps.audio': 'Ακούει ήχο',
  'models.caps.image': 'Φτιάχνει εικόνες',
  'models.caps.zdr': 'Δεν κρατά κανένα δεδομένο σου (μηδενική διατήρηση δεδομένων)',
  'models.contextHint': 'Πόσα μπορεί να διαβάσει μονομιάς',
  'models.contextTokens': { one: '{count} token', other: '{count} tokens' },
  'models.curated.claudeHaiku':
    'Γρήγορο, οικονομικό και γράφει πολύ καλά· οι νέες συζητήσεις ξεκινούν εδώ',
  'models.curated.gptLuna': 'Γρήγορο, οικονομικό και σύντομο· καλό με εργαλεία',
  'models.curated.tutor':
    'Γρήγορο, οικονομικό, ένας ζεστός και υπομονετικός δάσκαλος· ο δάσκαλος της προεπιλογής',
  'models.curated.gptSol': 'Η κύρια σειρά της OpenAI, για δυσκολότερη σκέψη και γραφή',
  'models.curated.claudeOpus':
    'Προσεκτική, μακροσκελής δουλειά· η προτεινόμενη προεπιλογή της Anthropic',
  'models.curated.claudeFable': 'Το ικανότερο Claude, για τα δυσκολότερα προβλήματα· το ακριβότερο',
  'models.curated.geminiFlash': 'Το νεότερο της Google· γρήγορο με εικόνες και πολύ μεγάλα έγγραφα',
  'models.curated.kimi': 'Ανοιχτά βάρη, δυνατό στον κώδικα, καλή αξία',
  'models.curated.grok': 'Το νεότερο Grok, για μεγάλες δουλειές με εργαλεία',
  'models.curated.image': 'Φτιάχνει και επεξεργάζεται εικόνες',

  // Settings › Models
  'models.default.follows': 'Οι νέες συζητήσεις παίρνουν το μοντέλο που διάλεξες τελευταίο.',
  'models.default.startsHere':
    'Οι νέες συζητήσεις ξεκινούν εδώ μέχρι να διαλέξεις μοντέλο σε μια συζήτηση.',
  'models.default.reset': 'Επαναφορά',
  'models.default.refresh': 'Ανανέωση λίστας',
  'models.favorites.hint': 'Τα μοντέλα που προτείνει η επιλογή δίπλα στα προτεινόμενα.',
  'models.favorites.empty': 'Δεν υπάρχουν ακόμα αγαπημένα.',
  'models.favorites.add': 'Προσθήκη μοντέλου',
  'models.zdr': 'Μόνο μηδενική διατήρηση δεδομένων',
  'models.zdrHint': 'Προσφέρει μόνο μοντέλα από παρόχους που δεν κρατούν τα prompts σου.',
  'models.familyMoved':
    'Το {family} είναι τώρα το {model}: οι νέες συζητήσεις το χρησιμοποιούν, όσες είναι σε εξέλιξη κρατούν το δικό τους.',
  'models.defaultMissing':
    'Το {model} δεν προσφέρεται από τους παρόχους σου, οπότε οι νέες συζητήσεις ξεκινούν με το {fallback}.',
  'models.hiddenZdr':
    'Τα μοντέλα του {server} είναι κρυμμένα: η μηδενική διατήρηση δεδομένων είναι ενεργή και μόνο το OpenRouter μπορεί να την εγγυηθεί.',
  'models.unavailableKey': 'Τα μοντέλα του {server} δεν είναι διαθέσιμα: το κλειδί απορρίφθηκε.',
  'models.unavailableLimited': 'Τα μοντέλα του {server} δεν είναι διαθέσιμα: πάρα πολλά αιτήματα.',
  'models.unreachable': 'Δεν ήταν δυνατή η σύνδεση με το {server}.',
  'models.unavailable': 'Τα μοντέλα του {server} δεν είναι διαθέσιμα αυτή τη στιγμή.',
  'pricing.free': 'Δωρεάν',
  'pricing.in': 'είσοδος {rate}/M',
  'pricing.out': 'έξοδος {rate}/M',
  'pricing.inFree': 'είσοδος δωρεάν',
  'pricing.outFree': 'έξοδος δωρεάν',

  // The model picker
  'picker.choose': 'Επιλογή μοντέλου',
  'picker.search': 'Αναζήτηση μοντέλων',
  'picker.results': 'Αποτελέσματα',
  'picker.recommended': 'Προτεινόμενα',
  'picker.favorites': 'Τα αγαπημένα σου',
  'picker.servers': 'Οι διακομιστές σου',
  'picker.unavailableZdr': '{model}: μη διαθέσιμο όσο είναι ενεργή η μηδενική διατήρηση δεδομένων',
  'picker.empty':
    'Δεν υπάρχουν ακόμα μοντέλα. Σύνδεσε έναν πάροχο για να διαλέξεις από τα μοντέλα του.',
  'picker.noMatch': 'Κανένα μοντέλο δεν ταιριάζει.',
  'picker.noneFound': 'Δεν βρέθηκαν μοντέλα',
  'picker.inUse': ', σε χρήση',
  'picker.removeFavorite': 'Αφαίρεση από τα αγαπημένα',
  'picker.removeFavoriteNamed': 'Αφαίρεση του {model} από τα αγαπημένα',
  'regenerate.with': 'Δοκίμασε ξανά με',
  'regenerate.withAnother': 'Δοκίμασε ξανά με άλλο μοντέλο',
  'regenerate.sameModel': 'ίδιο μοντέλο',
  'sidebar.newChat': 'Νέα συζήτηση',
  'sidebar.createFolder': 'Νέος φάκελος',
  'sidebar.folders': 'Φάκελοι',
  'sidebar.search': 'Αναζήτηση συζητήσεων',
  'sidebar.noMatch': 'Καμία συζήτηση δεν ταιριάζει με «{query}».',
  'sidebar.today': 'Σήμερα',
  'sidebar.previous7': 'Τελευταίες 7 ημέρες',
  'sidebar.previous30': 'Τελευταίες 30 ημέρες',
  'sidebar.earlier': 'Παλαιότερα',
  'chatRow.name': 'Όνομα συζήτησης',
  'chatRow.tutoring': 'Μάθημα:',
  'chatRow.rename': 'Μετονομασία',
  'chatRow.renameNamed': 'Μετονομασία της «{title}»',
  'chatRow.move': 'Μετακίνηση σε φάκελο',
  'chatRow.moveNamed': 'Μετακίνηση της «{title}» σε φάκελο',
  'chatRow.deleteNamed': 'Διαγραφή της «{title}»',
  'chatRow.actionsFor': 'Ενέργειες για {title}',
  'chatRow.deleteTitle': 'Διαγραφή αυτής της συζήτησης;',
  'chatRow.deleteBody': 'Η «{title}» και τα μηνύματά της θα χαθούν οριστικά.',
  'folder.namePlaceholder': 'Όνομα φακέλου',
  'folder.newName': 'Όνομα νέου φακέλου',
  'folder.actionsFor': 'Ενέργειες για τον φάκελο {name}',
  'folder.rename': 'Μετονομασία φακέλου',
  'folder.delete': 'Διαγραφή φακέλου',
  'folder.deleteTitle': 'Διαγραφή αυτού του φακέλου;',
  'folder.deleteBodyChats': 'Οι συζητήσεις στον «{name}» μένουν· απλώς βγαίνουν από τον φάκελο.',
  'folder.deleteBodyEmpty': 'Ο «{name}» είναι άδειος.',
  'folder.count': { one: '{count} συζήτηση', other: '{count} συζητήσεις' },
  'folder.newDefault': 'Νέος φάκελος',
  'move.label': 'Μετακίνηση της {title} σε φάκελο',
  'move.title': 'Μετακίνηση της «{title}»',
  'move.noFolder': 'Χωρίς φάκελο',
  'move.newFolder': 'Νέος φάκελος…',
  'move.heading': 'Μετακίνηση σε',

  // Header, drawer and pages
  'nav.memory': 'Μνήμη',
  'nav.settings': 'Ρυθμίσεις',
  'nav.learningHub': 'Πορεία',
  'drawer.chats': 'Συζητήσεις',
  'drawer.open': 'Άνοιγμα συζητήσεων',
  'header.toggleSidebar': 'Εμφάνιση ή απόκρυψη πλαϊνής στήλης',
  'header.expandSidebar': 'Άνοιγμα πλαϊνής στήλης',
  'header.collapseSidebar': 'Κλείσιμο πλαϊνής στήλης',
  'header.openMemory': 'Άνοιγμα μνήμης',
  'header.openSettings': 'Άνοιγμα ρυθμίσεων',
  'header.tutorModel': 'Μοντέλο του δασκάλου: {model}. Αλλάζει από τις Ρυθμίσεις.',
  'lightbox.label': 'Προβολή εικόνας',
  'lightbox.download': 'Λήψη',
  'lightbox.previous': 'Προηγούμενη',
  'lightbox.next': 'Επόμενη',

  // Settings › Chat
  'settings.chat.systemHint':
    'Τι λέγεται σε κάθε νέα συζήτηση πριν από το πρώτο σου μήνυμα. Ένα μάθημα προσθέτει από πάνω τις δικές του οδηγίες.',
  'settings.chat.savedPrompts': 'Αποθηκευμένα prompts',
  'settings.chat.savedPrompt': 'Αποθηκευμένο prompt',
  'settings.chat.namePrompt': 'Δώσε όνομα σε αυτό το prompt',
  'settings.chat.newName': 'Νέο όνομα',
  'settings.chat.newNameLabel': 'Νέο όνομα για αυτό το prompt',
  'settings.chat.deletePrompt': 'Διαγραφή του «{name}»;',
  'settings.chat.choosePrompt': 'Διάλεξε ένα αποθηκευμένο prompt…',
  'settings.chat.use': 'Χρήση',
  'settings.chat.saveCurrent': 'Αποθήκευση τρέχοντος',
  'settings.chat.renamePrompt': 'Μετονομασία prompt',
  'settings.chat.deletePromptButton': 'Διαγραφή prompt',
  'settings.chat.timestamps': 'Ώρα των μηνυμάτων',
  'settings.chat.timestampsHint':
    'Λέει στο μοντέλο πότε στάλθηκε κάθε μήνυμα, ώστε να ξέρει την ημερομηνία. Προσθέτει λίγο στο κόστος κάθε μηνύματος.',
  'settings.chat.modelDefault': 'Προεπιλογή του μοντέλου',
  'settings.chat.effortHint':
    'Πόσο σκέφτονται οι νέες συζητήσεις από προεπιλογή. Αλλάζει σε κάθε συζήτηση από το πεδίο γραφής· ένα μοντέλο χωρίς κάποιο επίπεδο παίρνει το πιο κοντινό που έχει.',
  'settings.chat.budget': 'Όριο σκέψης',
  'settings.chat.automatic': 'Αυτόματο',
  'settings.chat.budgetInvalid':
    'Γράψε έναν ακέραιο αριθμό πάνω από 0 ή άφησέ το κενό. Δεν αποθηκεύτηκε.',
  'settings.chat.budgetHint':
    'Το πολύ που μπορεί να σκεφτεί το μοντέλο, σε tokens (περίπου τρία τέταρτα της λέξης το καθένα), για μοντέλα που δέχονται όριο. Άφησέ το κενό για να αποφασίσει το μοντέλο.',
  'settings.memory.use': 'Χρήση μνήμης',
  'settings.memory.useHint':
    'Το μοντέλο διαβάζει τη μνήμη σου σε κάθε μήνυμα και σημειώνει ό,τι μαθαίνει για σένα. Ό,τι διαβάζει πηγαίνει στον πάροχο που χρησιμοποιεί η συζήτηση. Για να κρατήσεις μια συζήτηση έξω, απενεργοποίησε τη μνήμη με τον σελιδοδείκτη στο πεδίο γραφής της.',
  'settings.memory.sensitive': 'Και ευαίσθητα θέματα',
  'settings.memory.sensitiveHint':
    'Επιτρέπει στο μοντέλο να σημειώνει λεπτομέρειες όπως θέματα υγείας ή θρησκευτικές πεποιθήσεις χωρίς να του το ζητήσεις. Η μνήμη μένει μόνο σε αυτόν τον browser και πηγαίνει στον πάροχο της συζήτησης όπως και τα υπόλοιπα. Αν είναι ανενεργό, τα αποθηκεύει μόνο όταν το ζητήσεις.',
  'settings.memory.open': 'Άνοιγμα μνήμης',

  // Settings: pages and sections
  'settings.tab.connections': 'Συνδέσεις',
  'settings.tab.models': 'Μοντέλα',
  'settings.tab.chat': 'Συζήτηση',
  'settings.tab.tutor': 'Δάσκαλος',
  'settings.tab.appearance': 'Εμφάνιση',
  'settings.tab.data': 'Δεδομένα',
  'settings.section.providers': 'Πάροχοι',
  'settings.section.endpoints': 'Οι διακομιστές σου',
  'settings.section.web-search': 'Αναζήτηση στο web',
  'settings.section.default-model': 'Προεπιλεγμένο μοντέλο',
  'settings.section.favorites': 'Αγαπημένα',
  'settings.section.privacy': 'Απόρρητο',
  'settings.section.general': 'Prompt συστήματος',
  'settings.section.memory': 'Μνήμη',
  'settings.section.reasoning': 'Σκέψη',
  'settings.section.tutor': 'Δάσκαλος',
  'settings.section.theme': 'Θέμα',
  'settings.section.language': 'Γλώσσα',
  'settings.section.display': 'Προβολή',
  'settings.section.developer': 'Για προγραμματιστές',
  'settings.section.data': 'Εισαγωγή και εξαγωγή',

  // What each section shows and is about, so search finds it by the words on
  // screen as well as by its title. English words always find it too.
  'settings.keywords.providers':
    'κλειδί openrouter κλειδί anthropic api πάροχος σύνδεση αντικατάσταση αφαίρεση χώρος εργασίας workspace',
  'settings.keywords.endpoints':
    'ο δικός σου διακομιστής τοπικός ollama lm studio llama.cpp vllm διεύθυνση διακομιστή url προσαρμοσμένο endpoint συμβατό openai κλειδί api ονόματα μοντέλων δοκιμή σύνδεσης εργαλεία εικόνες βάθος σκέψης κόστος απαντήσεων προσωρινή αποθήκευση prompt τίτλοι συζητήσεων αφαίρεση',
  'settings.keywords.web-search': 'tavily κλειδί αναζήτηση web openrouter jina reader',
  'settings.keywords.default-model': 'νέα συζήτηση προεπιλεγμένο μοντέλο επαναφορά ανανέωση λίστα',
  'settings.keywords.favorites': 'αγαπημένα αστέρι μοντέλα αφαίρεση επιλογή',
  'settings.keywords.privacy': 'μόνο μηδενική διατήρηση δεδομένων zdr απόρρητο πάροχοι prompts',
  'settings.keywords.general':
    'prompt συστήματος αποθηκευμένα prompts πρότυπο αποθήκευση τρέχοντος μετονομασία διαγραφή ώρα μηνυμάτων ημερομηνία',
  'settings.keywords.memory':
    'χρήση μνήμης θυμάμαι ξεχνώ σημειώσεις για σένα μάθηση ευαίσθητα θέματα προσωπικά υγεία άνοιγμα μνήμης σελιδοδείκτης',
  'settings.keywords.reasoning': 'βάθος σκέψης όριο σκέψης tokens επίπεδο μοντέλο προεπιλογή',
  'settings.keywords.tutor':
    'δάσκαλος λειτουργία πάντα μάθηση ακολούθησε τον δάσκαλο κύλιση μοντέλο δασκάλου πλάνο μαθητής διδασκαλία',
  'settings.keywords.theme': 'θέμα χρώμα χρώματα φωτεινό σκοτεινό αυτόματο σύστημα',
  'settings.keywords.language':
    'γλώσσα μετάφραση αυτόματη english italiano français español deutsch português ελληνικά',
  'settings.keywords.display':
    'εμφάνιση σκέψης πάντα λεπτομέρειες απάντησης μοντέλο ταχύτητα κόστος στατιστικά προβολή',
  'settings.keywords.developer':
    'προγραμματιστές αρχείο κλήσεων εργαλείων προβολή αιτήματος ακατέργαστο json κάθε απάντηση αποσφαλμάτωση ορίσματα αποτέλεσμα',
  'settings.keywords.data':
    'εισαγωγή εξαγωγή συζητήσεις και ρυθμίσεις αρχείο json αντίγραφο ασφαλείας δεδομένα',
  'settings.tutorSummary': 'Τα μαθήματα και το μοντέλο τους',
  'settings.search': 'Αναζήτηση ρυθμίσεων',
  'settings.clearSearch': 'Καθαρισμός αναζήτησης',
  'settings.noMatch': 'Καμία ρύθμιση δεν ταιριάζει με «{query}».',
  'settings.pages': 'Σελίδες ρυθμίσεων',
  'settings.navigation': 'Πλοήγηση στις ρυθμίσεις',
  'settings.close': 'Κλείσιμο ρυθμίσεων',
  'settings.back': 'Πίσω στις Ρυθμίσεις',
  'settings.saveFailed': 'Οι ρυθμίσεις δεν αποθηκεύτηκαν. Δοκίμασε ξανά την αλλαγή.',

  // Settings › Connections
  'providers.rejected': 'Ο πάροχος απέρριψε αυτό το κλειδί. Επικόλλησε καινούργιο.',
  'providers.usingKey': 'Με το κλειδί σου',
  'providers.readyNoKey': 'Έτοιμο (δεν χρειάζεται κλειδί)',
  'providers.needsAddress': 'Χρειάζεται διεύθυνση',
  'providers.needsKey': 'Χρειάζεται κλειδί',
  'providers.keysStay': 'Τα κλειδιά μένουν σε αυτόν τον browser και δεν εξάγονται ποτέ.',
  'providers.workspace': 'ID χώρου εργασίας (προαιρετικό)',
  'providers.workspaceHint':
    'Χρειάζεται μόνο αν το Claude πει ότι το κλειδί σου θέλει χώρο εργασίας. Αντίγραψε το ID από τα Workspaces στο Claude Console· ξεκινά με wrkspc_.',
  'providers.workspaceInvalid': 'Ένα ID χώρου εργασίας έχει μόνο γράμματα, αριθμούς, _ και -.',
  'apiKey.saved': 'Αποθηκεύτηκε {key}. Επικόλλησε για αντικατάσταση',
  'apiKey.replace': 'Αντικατάσταση',
  'apiKey.removeNamed': 'Αφαίρεση: {label}',
  'apiKey.removeTitle': 'Αφαίρεση: «{label}»;',
  'apiKey.removeBody':
    'Διαγράφεται από αυτόν τον browser. Για να το ξαναχρησιμοποιήσεις, επικόλλησέ το πάλι.',
  'servers.removeTitle': 'Αφαίρεση του {name};',
  'servers.removeBody':
    'Η διεύθυνση, το κλειδί και οι ρυθμίσεις του φεύγουν. Οι συζητήσεις που χρησιμοποίησαν τα μοντέλα του κρατούν τα μηνύματά τους.',
  'servers.notSaved': 'Δεν αποθηκεύτηκε.',
  'servers.addressHint':
    'Η διεύθυνση του διακομιστή, π.χ. http://localhost:11434/v1 για το Ollama.',
  'servers.modelNames': 'Ονόματα μοντέλων',
  'servers.modelNamesHint':
    'Χωρισμένα με κόμμα. Όσα δείχνει ο διακομιστής στο /models προστίθενται αυτόματα.',
  'servers.keyOptional': 'Κλειδί (προαιρετικό)',
  'servers.keyPlaceholder': 'Οι περισσότεροι τοπικοί διακομιστές δεν χρειάζονται',
  'servers.supports': 'Τι υποστηρίζει αυτός ο διακομιστής',
  'servers.supportsHint':
    'Ό,τι δεν είναι τσεκαρισμένο δεν στέλνεται ποτέ. Ένας αυστηρός διακομιστής απορρίπτει όλο το αίτημα για ένα μόνο πεδίο που δεν γνωρίζει.',
  'servers.titles': 'Τίτλοι συζητήσεων',
  'servers.titlesChatModel': 'Με το μοντέλο της συζήτησης',
  'servers.titlesOff': 'Χωρίς τίτλους',
  'servers.remove': 'Αφαίρεση αυτού του διακομιστή',
  'servers.name': 'Όνομα διακομιστή',
  'servers.namePlaceholder': 'Όνομα, π.χ. Ollama',
  'servers.add': 'Προσθήκη',
  'servers.addHint':
    'Λειτουργεί με Ollama, LM Studio, llama.cpp και vLLM. Οι δυνατότητες ξεκινούν ανενεργές και τις ενεργοποιείς εσύ.',
  'servers.noAddress': 'χωρίς διεύθυνση',
  'webSearch.hint':
    'Η αναζήτηση που είναι ενσωματωμένη στον πάροχο του μοντέλου δεν χρειάζεται άλλο κλειδί και είναι η προεπιλογή. Με κλειδί OpenRouter μπορείς να διαλέξεις και την αναζήτηση OpenRouter στο πεδίο γραφής: το μοντέλο ψάχνει όταν χρειάζεται, με την πίστωσή σου στο OpenRouter, και οι σελίδες διαβάζονται μέσω του Jina Reader. Οι αναζητήσεις σου πηγαίνουν στον συνεργάτη αναζήτησης του OpenRouter και οι διευθύνσεις των σελίδων στο Jina.',
  'webSearch.keyLabel': 'Κλειδί {provider}',
  'capability.tools': 'Εργαλεία',
  'capability.toolsHint':
    'Το μοντέλο μπορεί να χρησιμοποιεί εργαλεία, όπως την αναζήτηση και τη μνήμη.',
  'capability.vision': 'Εικόνες',
  'capability.visionHint': 'Αποστολή εικόνων.',
  'capability.reasoningHint': 'Αποστολή επιπέδου σκέψης.',
  'capability.streamUsage': 'Κόστος απαντήσεων',
  'capability.streamUsageHint': 'Αναφέρει πόσο κόστισε κάθε απάντηση.',
  'capability.parallelToolCalls': 'Πολλά εργαλεία μαζί',
  'capability.parallelToolCallsHint':
    'Το μοντέλο μπορεί να χρησιμοποιεί πάνω από ένα εργαλείο σε κάθε βήμα.',
  'capability.promptCaching': 'Προσωρινή αποθήκευση prompt',
  'capability.promptCachingHint': 'Ξαναχρησιμοποιεί τα μεγάλα prompts για να μειώσει το κόστος.',
  'probe.title': 'Δοκιμή σύνδεσης',
  'probe.test': 'Δοκιμή σύνδεσης',
  'probe.testAgain': 'Νέα δοκιμή',
  'probe.modelToTest': 'Μοντέλο για τη δοκιμή',
  'probe.hint':
    'Στέλνει μερικά μικροσκοπικά αιτήματα για να δει ποια πεδία δέχεται αυτός ο διακομιστής, ώστε τα κουτάκια παρακάτω να οριστούν από μια απάντηση κι όχι στα τυφλά.',
  'probe.hintModel':
    'Στέλνει μερικά μικροσκοπικά αιτήματα στο {model} για να δει ποια πεδία δέχεται αυτός ο διακομιστής, ώστε τα κουτάκια παρακάτω να οριστούν από μια απάντηση κι όχι στα τυφλά.',
  'probe.step.models': 'Καταγραφή μοντέλων…',
  'probe.step.chat': 'Αποστολή πρώτου μηνύματος…',
  'probe.step.tools': 'Έλεγχος εργαλείων…',
  'probe.step.parallelToolCalls': 'Έλεγχος πολλών εργαλείων μαζί…',
  'probe.step.reasoning': 'Έλεγχος βάθους σκέψης…',
  'probe.step.vision': 'Έλεγχος εικόνων…',
  'probe.step.streamUsage': 'Έλεγχος κόστους απαντήσεων…',
  'probe.step.promptCaching': 'Έλεγχος προσωρινής αποθήκευσης prompt…',
  'probe.verdict.ok': 'Έγινε δεκτό',
  'probe.verdict.no': 'Δεν υποστηρίζεται',
  'probe.verdict.unknown': 'Καμία απάντηση',
  'probe.verdict.skipped': 'Παραλείφθηκε',
  'probe.reachable': 'Προσβάσιμος.',
  'probe.noModels': 'Δεν δείχνει μοντέλα, οπότε χρησιμοποιούνται μόνο όσα έγραψες.',
  'probe.listsModels': { one: 'Δείχνει {count} μοντέλο.', other: 'Δείχνει {count} μοντέλα.' },
  'probe.notApi': 'Κάτι απάντησε στο {address}, αλλά όχι ως διακομιστής συμβατός με OpenAI.',
  'probe.notApiHint':
    'Έλεγξε τη διεύθυνση. Συνήθως είναι η ρίζα του διακομιστή και μετά /v1, π.χ. http://localhost:11434/v1 για το Ollama.',
  'probe.noRoute': 'Δεν υπάρχει /models εδώ, οπότε χρησιμοποιούνται μόνο όσα έγραψες.',
  'probe.unauthorized': 'Προσβάσιμος, αλλά θέλει ένα κλειδί που δεν δέχτηκε.',
  'probe.unreachable': 'Δεν ήταν δυνατή η σύνδεση με το {address}.',
  'probe.unreachableHint':
    'Έλεγξε ότι ο διακομιστής τρέχει και δέχεται αιτήματα από το {origin}. Το Ollama χρειάζεται το OLLAMA_ORIGINS να περιλαμβάνει αυτή την προέλευση, και το LM Studio το CORS ενεργό στις ρυθμίσεις του διακομιστή.',
  'probe.listFailed': 'Προσβάσιμος, αλλά η καταγραφή των μοντέλων απέτυχε.',
  'probe.replied': 'Το {model} απάντησε σε {time}.',
  'probe.noAnswer': 'Το {model} δεν απάντησε.',
  'probe.notTested': 'Το {model} δεν δοκιμάστηκε.',
  'probe.noMessage': 'Δεν στάλθηκε κανένα μήνυμα.',
  'probe.apply': 'Εφαρμογή στα κουτάκια παρακάτω',
  'probe.applyHint': 'Ενεργοποιεί ό,τι έγινε δεκτό και απενεργοποιεί ό,τι απορρίφθηκε.',
  'probe.alreadyMatch': 'Τα κουτάκια παρακάτω συμφωνούν ήδη με ό,τι δέχτηκε αυτός ο διακομιστής.',

  // Testing a server (the details under each line)
  'probe.canceled': 'Η δοκιμή σύνδεσης ακυρώθηκε.',
  'probe.timeout': 'Καμία απάντηση μέσα σε {seconds} δ.',
  'probe.failedEarly': 'Το αίτημα απέτυχε πριν απαντήσει ο διακομιστής.',
  'probe.detail.unreachable': 'Δεν ήταν δυνατή η σύνδεση με τον διακομιστή.',
  'probe.detail.notApi':
    'Δεν απάντησε κανένας διακομιστής συμβατός με OpenAI σε αυτή τη διεύθυνση.',
  'probe.detail.noModel':
    'Δεν υπάρχει μοντέλο για δοκιμή. Γράψε ένα όνομα μοντέλου παραπάνω ή δες τι δείχνει ο διακομιστής.',
  'probe.detail.notStream':
    'Απάντησε, αλλά όχι ως ροή tokens. Το Dialogia δείχνει κάθε απάντηση καθώς γράφεται.',
  'probe.detail.firstFailed': 'Παραλείφθηκε επειδή το πρώτο μήνυμα δεν πέρασε.',
  'probe.detail.needsTools': 'Χρειάζεται κλήσεις εργαλείων.',
  'probe.detail.noUsage': 'Ο διακομιστής δέχτηκε το πεδίο αλλά δεν έστειλε πίσω την κατανάλωση.',

  // Settings › Data
  'data.label': 'Συζητήσεις και ρυθμίσεις',
  'data.hint': 'Όλα σε ένα αρχείο. Τα κλειδιά σου δεν περιλαμβάνονται ποτέ.',
  'data.import': 'Εισαγωγή',
  'data.export': 'Εξαγωγή',
  'data.thisFile': 'αυτού του αρχείου',
  'data.importTitle': 'Εισαγωγή {name};',
  'data.importBody':
    'Οι συζητήσεις του αρχείου αντικαθιστούν όσες εδώ έχουν το ίδιο id, και οι ρυθμίσεις του αντικαθιστούν τις δικές σου: διακομιστές, αγαπημένα και προεπιλογές συζήτησης. Όλα τα άλλα μένουν ως έχουν. Κάνε πρώτα εξαγωγή, αν ίσως θέλεις να γυρίσεις πίσω.',
  'data.exportFailed': 'Η εξαγωγή απέτυχε. Δοκίμασε ξανά.',
  'data.importFailed': 'Η εισαγωγή απέτυχε. Δοκίμασε ξανά.',
  'data.importWhileReplying': 'Περίμενε να τελειώσει η απάντηση και μετά κάνε εισαγωγή.',
  'data.nothing': 'Αυτό το αρχείο δεν έχει συζητήσεις ή ρυθμίσεις του Dialogia.',
  'data.notJson': 'Αυτό το αρχείο δεν είναι εξαγωγή του Dialogia: δεν είναι έγκυρο JSON.',
  'data.newerVersion':
    'Αυτό το αντίγραφο ασφαλείας φτιάχτηκε από νεότερη έκδοση του Dialogia. Ανανέωσε τη σελίδα για να ενημερωθεί η εφαρμογή και κάνε ξανά εισαγωγή.',
  'data.noneRead': 'Καμία από τις συζητήσεις αυτού του αρχείου δεν διαβάστηκε.',
  'data.imported.chats': {
    one: 'Εισήχθη {count} συζήτηση.',
    other: 'Εισήχθησαν {count} συζητήσεις.',
  },
  'data.imported.settings': 'Οι ρυθμίσεις σου εισήχθησαν.',
  'data.skipped.some': { one: '{count} δεν διαβάστηκε.', other: '{count} δεν διαβάστηκαν.' },
  'data.skipped.chats': {
    one: '{count} συζήτηση δεν διαβάστηκε.',
    other: '{count} συζητήσεις δεν διαβάστηκαν.',
  },

  // Settings › Appearance
  'appearance.scheme': 'Χρώματα',
  'appearance.schemeHint': 'Φωτεινά, σκοτεινά ή όπως το σύστημά σου.',
  'appearance.light': 'Φωτεινά',
  'appearance.dark': 'Σκοτεινά',
  'appearance.auto': 'Αυτόματα',
  'appearance.language': 'Γλώσσα',
  'appearance.languageHint':
    'Οι λέξεις της εφαρμογής. Οι απαντήσεις ακολουθούν τη γλώσσα στην οποία γράφεις.',
  'appearance.languageAuto': 'Αυτόματη ({language})',
  'appearance.showThinking': 'Εμφάνιση της σκέψης πάντα',
  'appearance.showThinkingHint':
    'Δείχνει τι σκέφτηκε το μοντέλο σε κάθε απάντηση, και στις παλαιότερες.',
  'appearance.showStats': 'Λεπτομέρειες απάντησης',
  'appearance.showStatsHint':
    'Μια γραμμή κάτω από κάθε απάντηση: ποιο μοντέλο την έγραψε, πόσο γρήγορα και πόσο κόστισε.',
  'appearance.toolLog': 'Αρχείο κλήσεων εργαλείων',
  'appearance.toolLogHint':
    'Πάνω από κάθε απάντηση που χρησιμοποίησε εργαλεία, κάθε κλήση με τα ορίσματα και το αποτέλεσμά της.',
  'appearance.requestView': 'Προβολή αιτήματος',
  'appearance.requestViewHint':
    'Πάνω από κάθε απάντηση, το αίτημα που την έφτιαξε. Καταγράφεται από τώρα και κρατιέται μέχρι να ανανεώσεις τη σελίδα.',
  'appearance.rawJson': 'Με το ακατέργαστο JSON',
  'appearance.rawJsonHint': 'Το αίτημα ακριβώς όπως στάλθηκε, έτοιμο για αντιγραφή.',

  // Code blocks and diagrams in replies
  'code.copy': 'Αντιγραφή κώδικα',
  'code.wrap': 'Αναδίπλωση',
  'code.unwrap': 'Χωρίς αναδίπλωση',
  'code.enableWrap': 'Αναδίπλωση μεγάλων γραμμών',
  'code.disableWrap': 'Μεγάλες γραμμές ολόκληρες',
  'code.expand': 'Ανάπτυξη',
  'code.collapse': 'Σύμπτυξη',
  'code.diagramFailed': 'Αυτό το διάγραμμα δεν μπόρεσε να σχεδιαστεί.',

  // Memory
  'memory.close': 'Κλείσιμο μνήμης',
  'memory.folders': 'Φάκελοι μνήμης',
  'memory.folder.about': 'Για σένα',
  'memory.folder.aboutDescription': 'Ποιος είσαι, πού ζεις, πώς σου αρέσουν οι απαντήσεις',
  'memory.folder.learning': 'Μάθηση',
  'memory.folder.learningDescription':
    'Τι έχεις μελετήσει με τον δάσκαλο και πώς μαθαίνεις καλύτερα',
  'memory.aboutEmpty':
    'Εδώ μπαίνει ό,τι μαθαίνει το μοντέλο για σένα. Μπορείς να προσθέσεις κι εσύ μια σημείωση.',
  'memory.folderEmpty': 'Δεν υπάρχουν ακόμα σημειώσεις σε αυτόν τον φάκελο.',
  'memory.forgotten': 'Ξεχάστηκαν πρόσφατα',
  'memory.forgottenHint':
    'Σημειώσεις που άφησες εσύ ή το μοντέλο. Η καθεμιά περιμένει εδώ 30 ημέρες και μετά χάνεται οριστικά.',
  'memory.forgottenFrom': 'Από {folder} · ξεχάστηκε {date}',
  'memory.aFolder': 'έναν φάκελο',
  'memory.restore': 'Επαναφορά',
  'memory.restoreNamed': 'Επαναφορά: {note}',
  'memory.forgottenEmpty': 'Τίποτα δεν ξεχάστηκε πρόσφατα.',
  'memory.editHint': 'Enter για αποθήκευση · Esc για ακύρωση',
  'memory.editHintTouch': 'Πάτησε Τέλος για αποθήκευση',
  'memory.byModel': 'Από το μοντέλο',
  'memory.editedByYou': 'Την επεξεργάστηκες εσύ',
  'memory.byYou': 'Από σένα',
  'memory.fromChat': 'από {chat}',
  'memory.note': 'Σημείωση',
  'memory.forget': 'Ξέχασέ το',
  'memory.forgetNamed': 'Ξέχασέ το: {note}',
  'memory.newNote': 'Νέα σημείωση',
  'memory.newNotePlaceholder': 'Κάτι που πρέπει να ξέρει το μοντέλο',
  'memory.addNote': 'Προσθήκη σημείωσης',
  'memory.folderHolds': 'Τι περιέχει: {folder}',
  'memory.folderLineHint':
    'Το μοντέλο διαβάζει πρώτα αυτή τη γραμμή και ανοίγει τον φάκελο όταν ταιριάζει.',
  'memory.folderLinePlaceholder': 'Γράψε τι περιέχει αυτός ο φάκελος',
  'memory.consolidating': 'Τακτοποίηση…',
  'memory.consolidate': 'Τακτοποίηση',
  'memory.consolidateHint': 'Τακτοποιεί τη μνήμη με το {model}',
  'memory.addFirst': 'Πρόσθεσε πρώτα μια σημείωση',
  'memory.newToday': {
    one: '{count} νέα από τη σημερινή τακτοποίηση',
    other: '{count} νέες από τη σημερινή τακτοποίηση',
  },
  'memory.newSince': { one: '{count} νέα από {date}', other: '{count} νέες από {date}' },
  'memory.upToDate': 'Τακτοποιημένη',
  'memory.reportLabel': 'Τι άλλαξε η τακτοποίηση',
  'memory.consolidatedOn': 'Τακτοποιήθηκε {date}',
  'memory.nothingChanged': 'Δεν άλλαξε τίποτα',
  'memory.alreadyTidy': 'Ήταν ήδη τακτοποιημένη',
  'memory.undo': 'Αναίρεση',
  'memory.openInMemory': 'Άνοιγμα στη μνήμη',
  'memory.nothingNeeded': 'Δεν χρειαζόταν καμία αλλαγή.',
  'memory.skippedSome': {
    one: 'Παραλείφθηκε μια προτεινόμενη αλλαγή που δεν γινόταν.',
    other: 'Παραλείφθηκαν {count} προτεινόμενες αλλαγές που δεν γίνονταν.',
  },
  'memory.skippedAll': {
    one: 'Το μοντέλο πρότεινε μια αλλαγή, αλλά δεν γινόταν.',
    other: 'Το μοντέλο πρότεινε {count} αλλαγές, αλλά καμία δεν γινόταν.',
  },
  'memory.writesLabel': 'Αλλαγές στη μνήμη',
  'memory.takenBack': 'Αναιρέθηκε:',
  'memory.write.added': 'Θυμάται',
  'memory.write.updated': 'Ενημερώθηκε',
  'memory.write.forgotten': 'Ξεχάστηκε',
  'memory.was': '(πριν: {text})',
  'memory.undoNamed': 'Αναίρεση: {note}',
  'memory.records': 'Μαθήματα',
  'memory.recordsHint':
    'Τα μαθήματα εμφανίζονται εδώ μόνα τους, με την πρόοδό τους όπως είναι τώρα στη συζήτηση.',
  'memory.record.finished': 'Ολοκληρώθηκε {date}',
  'memory.record.progress': '{done} από {count} έγιναν · τελευταία μελέτη {date}',

  // Notices: the toasts that say something went right or wrong
  'notice.invalidKey': 'Αυτό το κλειδί απορρίφθηκε. Έλεγξέ το στις Ρυθμίσεις › Συνδέσεις.',
  'notice.expiredKey': 'Αυτό το κλειδί έληξε. Πρόσθεσε καινούργιο στις Ρυθμίσεις › Συνδέσεις.',
  'notice.rateLimited': 'Ο πάροχος περιορίζει τα αιτήματα. Περίμενε λίγο και δοκίμασε ξανά.',
  'notice.missingSearchKey':
    'Αυτή η αναζήτηση χρειάζεται κλειδί. Πρόσθεσέ το στις Ρυθμίσεις › Συνδέσεις.',
  'notice.searchUnavailable':
    'Η αναζήτηση στο web δεν είναι διαθέσιμη σε αυτή τη συζήτηση· η απάντηση έρχεται χωρίς αυτήν.',
  'notice.unknownEndpoint':
    'Αυτή η συζήτηση χρησιμοποιεί έναν διακομιστή που δεν υπάρχει πια. Πρόσθεσέ τον ξανά στις Ρυθμίσεις › Συνδέσεις ή διάλεξε άλλο μοντέλο.',
  'notice.exportedChats': 'Οι συζητήσεις σου εξήχθησαν.',
  'notice.planApplyFailed': 'Το πλάνο δεν εφαρμόστηκε. Δοκίμασε ξανά.',
  'notice.planChangesFailed': 'Η πρότασή σου δεν στάλθηκε. Δοκίμασε ξανά.',
  'notice.copyFailed': 'Η αντιγραφή δεν έγινε: ο browser μπλόκαρε το πρόχειρο.',
  'notice.replyInOtherTab':
    'Μια άλλη καρτέλα γράφει απάντηση σε αυτή τη συζήτηση. Στείλε όταν τελειώσει, ώστε και οι δύο καρτέλες να δείχνουν την ίδια συζήτηση.',
  'notice.saveFailed':
    'Η απάντηση δεν αποθηκεύτηκε σε αυτόν τον browser. Φαίνεται τώρα στην οθόνη, αλλά μπορεί να κοπεί μετά από ανανέωση.',
  'notice.consolidationFailed':
    'Η μνήμη δεν τακτοποιήθηκε. Δεν άλλαξε τίποτα· δοκίμασε ξανά σε λίγο.',
  'notice.consolidationUnreadable':
    'Αυτό το μοντέλο δεν μπόρεσε να προτείνει αλλαγές. Δεν άλλαξε τίποτα. Δοκίμασε άλλο μοντέλο.',
  'notice.consolidationUndone': 'Η τακτοποίηση αναιρέθηκε.',
  'notice.consolidationStale':
    'Η μνήμη άλλαξε όσο τακτοποιούνταν, οπότε δεν άλλαξε τίποτα. Τακτοποίησέ τη ξανά.',
  'notice.consolidationPartlyUndone':
    'Η τακτοποίηση αναιρέθηκε, εκτός από όσα άλλαξαν στο μεταξύ, που έμειναν ως έχουν.',
  'notice.memoryChangedSince':
    'Αυτή η σημείωση άλλαξε στο μεταξύ. Επεξεργάσου τη στη σελίδα Μνήμη.',
  'notice.memoryAlreadyForgotten':
    'Αυτή η σημείωση έχει ήδη ξεχαστεί. Περιμένει στα Ξεχάστηκαν πρόσφατα, στη σελίδα Μνήμη.',
  'notice.consolidationNoModel':
    'Σύνδεσε ένα μοντέλο στις Ρυθμίσεις › Συνδέσεις για να τακτοποιήσεις τη μνήμη.',
  'notice.replacedReplyChangedMemory':
    'Η απάντηση που αντικατέστησες είχε αλλάξει τη μνήμη σου. Εκείνες οι σημειώσεις μένουν όπως είναι· δες τες στη σελίδα Μνήμη.',
  'notice.unreachable':
    'Δεν ήταν δυνατή η σύνδεση με τον πάροχο. Έλεγξε τη σύνδεσή σου ή ότι τρέχει ο τοπικός σου διακομιστής.',
  'notice.timedOut': 'Το αίτημα άργησε πολύ. Δοκίμασε ξανά.',
  'notice.cutOff': 'Η σύνδεση έκλεισε πριν τελειώσει η απάντηση. Δοκίμασε ξανά.',
  'notice.stalled': 'Ο πάροχος σταμάτησε να στέλνει, οπότε η απάντηση τερματίστηκε. Δοκίμασε ξανά.',
  'notice.unknownError': 'Κάτι πήγε στραβά και ο πάροχος δεν είπε τι.',
  'notice.tryAgainSoon': 'Δοκίμασε ξανά σε λίγο.',
  'notice.providerError': 'Ο πάροχος του μοντέλου επέστρεψε σφάλμα',
  'notice.modelListFailed': 'Η λίστα μοντέλων δεν φόρτωσε',
  'notice.emptyResponse': 'Ο πάροχος έστειλε κενή απάντηση',
  'notice.kind.image': 'εικόνες',
  'notice.kind.audio': 'ήχος',
  'notice.kind.pdf': 'PDF',
  'notice.droppedOne': 'Παραλείφθηκε, γιατί αυτό το μοντέλο δεν το δέχεται: {list}.',
  'notice.droppedMany': 'Παραλείφθηκαν, γιατί αυτό το μοντέλο δεν τα δέχεται: {list}.',
  'notice.noModelsOffered': 'Το {servers} δεν πρόσφερε κανένα μοντέλο.',
  'zdr.blocked':
    'Το {model} δεν εγγυάται μηδενική διατήρηση δεδομένων. Διάλεξε άλλο μοντέλο ή απενεργοποίησε τη Μόνο μηδενική διατήρηση δεδομένων στις Ρυθμίσεις › Μοντέλα.',
  'zdr.unavailable':
    'Δεν ήταν δυνατό να ελεγχθεί ποιοι πάροχοι δεν κρατούν δεδομένα. Έλεγξε τη σύνδεσή σου ή απενεργοποίησε τη Μόνο μηδενική διατήρηση δεδομένων στις Ρυθμίσεις › Μοντέλα.',

  // Attaching files
  'attach.kinds.all': 'εικόνες, ήχο (mp3/wav) ή PDF',
  'attach.kinds.images': 'εικόνες ή PDF',
  'attach.kinds.audio': 'ήχο (mp3/wav) ή PDF',
  'attach.kinds.pdf': 'PDF',
  'attach.aFile': 'ένα αρχείο',
  'attach.tooLarge': 'πολύ μεγάλο, έως {max} MB',
  'attach.perMessage': 'έως {limit} ανά μήνυμα',
  'attach.pdfs': { one: '{count} PDF', other: '{count} PDF' },
  'attach.images': { one: '{count} εικόνα', other: '{count} εικόνες' },
  'attach.audioFiles': { one: '{count} αρχείο ήχου', other: '{count} αρχεία ήχου' },
  'attach.imageTypes': 'μόνο εικόνες PNG, JPEG, WebP ή GIF',
  'attach.audioTypes': 'μόνο ήχος mp3 ή wav',
  'attach.modelTakes': 'αυτό το μοντέλο δέχεται {kinds}',
  'attach.notAttached': 'Δεν επισυνάφθηκαν: {files}.',
  'attach.hint': 'Επισύναψη: {kinds}',

  // Search errors, as the reasoning line shows them
  'searchError.failed': 'Η αναζήτηση απέτυχε.',
  'searchError.tooLong': 'Η αναζήτηση άργησε πολύ.',
  'searchError.pageTooLong': 'Η σελίδα άργησε πολύ να φορτώσει.',
  'searchError.unreachable': 'Δεν ήταν δυνατή η σύνδεση με το {service}.',
  'searchError.openrouter.key':
    'Το OpenRouter δεν δέχτηκε το κλειδί. Έλεγξέ το στις Ρυθμίσεις › Συνδέσεις.',
  'searchError.openrouter.credit': 'Ο λογαριασμός OpenRouter δεν έχει άλλη πίστωση.',
  'searchError.openrouter.limited':
    'Το OpenRouter περιορίζει τα αιτήματα αυτή τη στιγμή. Δοκίμασε ξανά σε λίγο.',
  'searchError.openrouter.trouble':
    'Το OpenRouter έχει πρόβλημα αυτή τη στιγμή. Δοκίμασε ξανά αργότερα.',
  'searchError.openrouter.failed': 'Το OpenRouter δεν μπόρεσε να κάνει αυτή την αναζήτηση.',
  'searchError.reader.busy':
    'Ο δωρεάν αναγνώστης σελίδων είναι απασχολημένος. Δοκίμασε ξανά σε ένα λεπτό.',
  'searchError.reader.forbidden': 'Ο αναγνώστης σελίδων δεν έχει άδεια να ανοίξει αυτή τη σελίδα.',
  'searchError.reader.failed': 'Ο αναγνώστης σελίδων δεν μπόρεσε να ανοίξει αυτή τη σελίδα.',
  'searchError.reader.couldNot': 'Αυτή η σελίδα δεν διαβάστηκε.',
  'searchError.reader.unreachable': 'Δεν ήταν δυνατή η σύνδεση με τον αναγνώστη σελίδων.',
  'searchError.tavily.key':
    'Το Tavily δεν δέχτηκε το κλειδί αναζήτησης. Έλεγξέ το στις Ρυθμίσεις › Συνδέσεις.',
  'searchError.tavily.limited':
    'Το Tavily περιορίζει τις αναζητήσεις αυτή τη στιγμή. Δοκίμασε ξανά σε λίγο.',
  'searchError.tavily.plan': 'Το πρόγραμμα Tavily έφτασε το όριο αναζητήσεών του.',
  'searchError.tavily.trouble': 'Το Tavily έχει πρόβλημα αυτή τη στιγμή. Δοκίμασε ξανά αργότερα.',
  'searchError.tavily.search': 'Το Tavily δεν μπόρεσε να κάνει αυτή την αναζήτηση.',
  'searchError.tavily.fetch': 'Το Tavily δεν μπόρεσε να φέρει αυτή τη σελίδα.',
};

export default messages;
