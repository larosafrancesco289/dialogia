// Français. Typed from the English source (en.ts); GLOSSARY.md keeps the words
// used throughout. Informal address, plain words, the app's warm voice.

import type en from './en';
import type { Translation } from '@/lib/i18n/catalogue';

const messages: Translation<typeof en> = {
  // Shared
  'common.notNow': 'Pas maintenant',
  'common.off': 'Désactivée',
  'common.cancel': 'Annuler',
  'common.save': 'Enregistrer',
  'common.delete': 'Supprimer',
  'common.close': 'Fermer',
  'common.dismiss': 'Fermer',

  // Welcome and first run
  'welcome.headline.first': 'Bienvenue dans {name}',
  'welcome.headline.learn': 'Que vas-tu {word} ?',
  'welcome.headline.learnWord': 'apprendre',
  'welcome.headline.chat': 'Commence un {word}',
  'welcome.headline.chatWord': 'dialogue',
  'welcome.subline.withTutor':
    'Discute avec les meilleurs modèles d’IA, ou apprends quelque chose avec un tuteur.',
  'welcome.subline': 'Discute avec les meilleurs modèles d’IA.',
  'welcome.connectTitle': 'D’abord, connecte un modèle',
  'welcome.connected': 'Connecté',
  'setup.title': 'Connecter un modèle',
  'setup.needsKey': '{model} passe par {provider}. Ajoute ta clé {provider} pour l’utiliser.',
  'connect.lead.openrouter':
    'Colle une clé OpenRouter. Une seule clé ouvre presque tous les modèles, et tu ne paies à OpenRouter que ce que tu utilises.',
  'connect.lead.anthropic':
    'Colle une clé Anthropic pour utiliser les modèles Claude. Tu ne paies à Anthropic que ce que tu utilises.',
  'connect.lead.local':
    'Colle l’adresse d’un serveur de modèles que tu fais tourner, comme Ollama ou LM Studio. La plupart n’ont pas besoin de clé.',
  'connect.steps.account': '{action} sur {link}.',
  'connect.steps.accountAction': 'Crée un compte',
  'connect.steps.credit': '{action} dans {page}.',
  'connect.steps.creditAction': 'Ajoute un peu de crédit',
  'connect.steps.key': '{action} dans {link}, copie-la et colle-la ci-dessus.',
  'connect.steps.keyAction': 'Crée une clé',
  'connect.serverAddress': 'Adresse du serveur',
  'connect.submit': 'Connecter',
  'connect.howToGetKey': 'Comment obtenir une clé ?',
  'connect.otherWays': 'Autres façons de se connecter',
  'connect.privacy.key': 'Ta clé et tes discussions restent dans ce navigateur.',
  'connect.privacy.server': 'Tes discussions restent dans ce navigateur.',
  'connect.option.openrouter': 'Clé OpenRouter',
  'connect.option.openrouterNote': 'Presque tous les modèles, une clé',
  'connect.option.anthropic': 'Clé Anthropic',
  'connect.option.anthropicNote': 'Modèles Claude uniquement',
  'connect.option.local': 'Ton propre serveur',
  'connect.option.localNote': 'Ollama, LM Studio et similaires',
  'connect.keyRefused':
    '{provider} n’a pas accepté cette clé. Vérifie que tu l’as copiée en entier, ou crées-en une nouvelle.',
  'connect.serverSilent': 'Aucun modèle n’est venu de cette adresse. Le serveur tourne-t-il ?',
  'connect.keyNotSaved':
    'Ce navigateur n’a pas pu enregistrer ta clé : elle ne marche que jusqu’à ce que tu fermes la page.',
  'connect.invalidAddress':
    'Saisis l’adresse complète, comme http://localhost:11434/v1, avec http:// ou https:// au début.',

  // Composer
  'composer.placeholder': 'Demande ce que tu veux',
  'composer.slashSuggestions': 'Suggestions de commandes',
  'composer.stop': 'Arrêter la réponse',
  'composer.writingElsewhere': 'Écrit dans un autre onglet…',
  'composer.attach': 'Joindre des fichiers',
  'composer.memory.label': 'Garder cette discussion hors de la mémoire',
  'composer.memory.on':
    'Mémoire : activée dans cette discussion. Désactive-la pour la garder hors de la mémoire.',
  'composer.memory.off': 'Mémoire : désactivée dans cette discussion. Rien n’est lu ni retenu.',
  'composer.memory.offLabel': 'Sans mémoire',
  'composer.sendLabel': 'Envoyer le message',
  'composer.send': 'Envoyer',
  'composer.sendFailed':
    'Le message n’a pas pu être envoyé. Ton brouillon est revenu dans la zone de saisie.',
  'composer.sendFailedElsewhere':
    'Le message n’a pas pu être envoyé. Ton brouillon est revenu dans sa discussion.',

  // Thinking effort
  'effort.title': 'Niveau de réflexion',
  'effort.buttonTitle': 'Réflexion : {level}',
  'effort.default': 'par défaut',
  'effort.modelDefault': '{level} (par défaut du modèle)',
  'effort.none': 'Aucune',
  'effort.minimal': 'Minimale',
  'effort.low': 'Faible',
  'effort.medium': 'Moyenne',
  'effort.high': 'Élevée',
  'effort.xhigh': 'Très élevée',
  'effort.max': 'Maximale',
  'effort.hint.none': 'Répond tout de suite',
  'effort.hint.minimal': 'Une pensée très brève',
  'effort.hint.low': 'Réfléchit un instant',
  'effort.hint.medium': 'Prend le temps d’y réfléchir',
  'effort.hint.high': 'Réfléchit sérieusement',
  'effort.hint.xhigh': 'Réfléchit très sérieusement',
  'effort.hint.max': 'Prend tout le temps nécessaire',

  // Web search
  'search.title': 'Recherche web',
  'search.short': 'Recherche',
  'search.state.on': 'Recherche web : activée ({provider})',
  'search.state.off': 'Recherche web : désactivée ({provider})',
  'search.builtIn': 'Intégrée',
  'search.builtInDescription': 'La recherche du fournisseur du modèle',
  'search.toolDescription': 'Cherche quand il le faut et lit les pages trouvées',
  'search.openrouter': 'Recherche OpenRouter',

  // Slash commands (the commands themselves stay in English)
  'slash.model': 'Répondre avec un autre modèle',
  'slash.search': 'Activer ou désactiver la recherche web',
  'slash.reasoning': 'Combien de temps le modèle réfléchit',
  'slash.help': 'Ce que font ces commandes',
  'slash.typeModel': 'Tape le nom d’un modèle…',
  'slash.searchOn': 'La recherche web est activée dans cette discussion.',
  'slash.searchOff': 'La recherche web est désactivée dans cette discussion.',
  'slash.searchOnNext': 'La recherche web sera activée dans la prochaine discussion.',
  'slash.searchOffNext': 'La recherche web sera désactivée dans la prochaine discussion.',
  'slash.noThinking': 'Ce modèle répond sans réfléchir d’abord, il n’y a donc rien à régler.',
  'slash.effortUnavailable': 'Ce modèle ne propose pas le niveau « {level} ».',
  'slash.effortSet': 'Niveau de réflexion réglé sur « {level} ».',
  'slash.noSuchModel': 'Aucun modèle ne s’appelle {name}.',
  'slash.modelSet': 'C’est maintenant {name} qui répond.',
  'slash.helpText':
    'Tape /model et un nom pour changer de modèle, /search on ou off pour la recherche web, et /reasoning avec un niveau comme low ou high.',

  // Chat
  'chat.opening': 'Ouverture de la discussion…',
  'chat.showEarlier': {
    one: 'Afficher le message précédent ({count})',
    other: 'Afficher les messages précédents ({count})',
  },
  'chat.scrollToBottom': 'Aller en bas',

  // Sidebar and chats
  'chat.untitled': 'Nouvelle discussion',
  'chat.branchMark': '(branche)',

  // A message and its actions
  'message.saveShortcut': '{key} Entrée pour enregistrer',
  'message.copy': 'Copier',
  'message.copied': 'Copié',
  'message.copyLabel': 'Copier le message',
  'message.edit': 'Modifier',
  'message.editing': 'En cours de modification…',
  'message.editMessage': 'Modifier le message',
  'message.editReply': 'Modifier la réponse',
  'message.editPlaceholder': 'Modifie ton message…',
  'message.editReplyPlaceholder': 'Modifie la réponse…',
  'message.showLess': 'Afficher moins',
  'message.showAll': 'Tout afficher',
  'message.writing': 'Écrit une réponse',
  'message.stillWorking': 'Travaille encore',
  'message.tryAgain': 'Réessayer',
  'message.branch': 'Bifurquer dans une nouvelle discussion',
  'message.selectText': 'Sélectionner le texte',
  'message.sheet.reply': 'Réponse',
  'message.sheet.yours': 'Ton message',
  'message.sheet.replyActions': 'Actions sur la réponse',
  'message.sheet.messageActions': 'Actions sur le message',
  'message.filtered.title': 'Refusé par le filtre de sécurité du modèle',
  'message.filtered.cutShort':
    'La réponse a été interrompue par le filtre de sécurité du fournisseur.',
  'message.filtered.blocked':
    'Un filtre de sécurité a bloqué cette demande avant que le modèle puisse répondre.',
  'message.filtered.reason': 'Raison donnée : {reason}.',
  'message.youSaid': 'Toi :',

  // A reply's versions (Try again keeps the old one)
  'versions.label': 'Version {at} sur {count}',
  'versions.labelWithModel': 'Version {at} sur {count}, {model}',
  'versions.group': 'Versions de cette réponse',
  'versions.onlyLatest': 'Seule la dernière réponse peut changer de version',
  'versions.previous': 'Version précédente',
  'versions.next': 'Version suivante',
  'versions.delete': 'Supprimer cette version',
  'versions.deleteNumbered': 'Supprimer la version {at} sur {count}',
  'versions.deleteTitle': 'Supprimer cette version ?',
  'versions.deleteBody':
    'Cette version disparaîtra pour de bon. La réponse reste, avec une autre version.',

  // The reasoning ledger: what the model thought and which tools it used
  'activity.thinking': 'Réfléchit',
  'activity.thought': 'A réfléchi',
  'activity.thoughtFor': 'pendant {duration}',
  'activity.words': { one: '{count} mot', other: '{count} mots' },
  'activity.tools': { one: '{count} outil', other: '{count} outils' },
  'activity.searches': { one: '{count} recherche', other: '{count} recherches' },
  'activity.waiting': 'En attente du modèle… {seconds} s',
  'activity.searchingWeb': 'Cherche sur le web',
  'activity.searchingFor': 'Recherche : {query}',
  'activity.searchingSources': 'Cherche des sources',
  'activity.searchFailed': 'La recherche a échoué',
  'activity.tool.fetch': 'Lit une page',
  'activity.tool.memoryRead': 'Consulte la mémoire',
  'activity.tool.memorySave': 'Enregistre en mémoire',
  'activity.tool.memoryForget': 'Oublie une note',
  'activity.notFound': 'Introuvable',
  'activity.notSaved': 'Non enregistré',
  'activity.searching': 'Recherche',
  'activity.running': 'En cours',
  'activity.notApplied': 'Non appliqué',
  'activity.stopped': 'Arrêté',
  'activity.failed': 'Échec',
  'activity.noResults': 'Aucun résultat',
  'activity.copyThinking': 'Copier la réflexion',
  'activity.turnFailed': 'Le tour a échoué avant que cet appel ne parte',
  'sources.found': { one: '{count} source trouvée', other: '{count} sources trouvées' },
  'sources.looking': 'Cherche des sources…',
  'sources.lookingFor': 'Cherche des sources : {query}…',
  'sources.untitled': 'Source sans titre',

  // Ends with {title} in every language: the renderer knows a citation by the words before it.
  'sources.citation': 'Source {number} : {title}',

  // How a reply ended
  'ending.stopped': 'Arrêtée avant la fin.',
  'ending.failed': 'Interrompue par une erreur avant la fin.',
  'ending.interrupted': 'Interrompue : la page s’est fermée pendant l’écriture.',
  'ending.nothing.stopped': 'Arrêtée avant que la réponse commence.',
  'ending.nothing.failed': 'Cette réponse a échoué.',
  'ending.nothing.interrupted': 'La page s’est fermée avant que la réponse commence.',
  'ending.length': 'Arrêtée à la limite de longueur.',
  'ending.announce.stopped': 'Réponse arrêtée',
  'ending.announce.failed': 'Réponse en échec',
  'ending.announce.length': 'Réponse arrêtée à la limite de longueur',
  'ending.announce.finished': 'Réponse terminée',

  // The line under a reply: model, speed, cost
  'colophon.firstWord': 'premier mot en {time}',
  'colophon.tokens': { one: '{count} token', other: '{count} tokens' },
  'colophon.speed': '{rate} tokens/s',
  'colophon.under': 'moins de {amount}',

  // Attachments
  'attachments.openLarger': 'Agrandir',
  'attachments.image': 'image',
  'attachments.audio': 'Audio',
  'attachments.audioAttached': 'Audio joint',
  'attachments.pages': { one: '{count} page', other: '{count} pages' },
  'attachments.attachment': 'pièce jointe',
  'attachments.remove': 'Retirer',
  'attachments.removeNamed': 'Retirer {name}',
  'attachments.attachedAudio': 'Joint (mp3/wav)',
  'attachments.attachedPdf': 'Joint (lu dans ton navigateur)',

  // Developer views (Settings › Appearance › Developer)
  'debug.request': 'Requête de débogage',
  'debug.toolActivity': 'Activité des outils',
  'debug.overview': 'Vue d’ensemble',
  'debug.toolDefinitions': 'Définitions des outils',
  'debug.plugins': 'Plugins',
  'debug.messages': 'Messages',
  'debug.noContent': 'Aucun contenu visible',
  'debug.toolCalls': 'Appels d’outils : {names}',
  'debug.rawJson': 'JSON brut de la requête',
  'debug.copyRequest': 'Copier la requête',
  'toolLog.heading': 'Appels d’outils ({count})',
  'toolLog.input': 'Entrée',
  'toolLog.output': 'Sortie',
  'toolLog.copy.input': 'Copier le JSON d’entrée',
  'toolLog.copy.output': 'Copier le JSON de sortie',
  'toolLog.metadata': 'Métadonnées',
  'toolLog.category.search': 'Recherche',
  'toolLog.category.tutor': 'Tuteur',
  'toolLog.category.planning': 'Planification',
  'toolLog.category.system': 'Système',
  'toolLog.category.other': 'Autre',
  'toolLog.searchResults': {
    one: 'Recherche web ({count} résultat)',
    other: 'Recherche web ({count} résultats)',
  },
  'toolLog.searchError': 'Erreur de recherche web',
  'toolLog.completed': 'Terminé',
  'toolLog.pending': 'En attente',
  'toolLog.round': 'Tour {round}',
  'toolLog.cached': 'Résultat en cache',
  'toolLog.usedInReply': 'Utilisé dans la réponse',
  'toolLog.learnerUpdated': 'Profil de l’apprenant mis à jour',
  'toolLog.planUpdated': 'Plan mis à jour',

  // Models
  'models.caps.reasoning': 'Réfléchit avant de répondre',
  'models.caps.vision': 'Lit les images',
  'models.caps.audio': 'Entend l’audio',
  'models.caps.image': 'Crée des images',
  'models.caps.zdr': 'Ne garde aucune de tes données (zéro conservation)',
  'models.contextHint': 'Ce qu’il peut lire d’un coup',
  'models.contextTokens': { one: '{count} token', other: '{count} tokens' },
  'models.curated.claudeHaiku':
    'Rapide, bon marché et belle plume ; les nouvelles discussions commencent ici',
  'models.curated.gptLuna': 'Rapide, bon marché et concis ; à l’aise avec les outils',
  'models.curated.tutor':
    'Rapide, bon marché, un professeur chaleureux et patient ; le tuteur par défaut',
  'models.curated.gptSol':
    'La gamme principale d’OpenAI, pour le raisonnement et l’écriture plus difficiles',
  'models.curated.claudeOpus':
    'Travail soigné et de longue haleine ; le choix par défaut recommandé par Anthropic',
  'models.curated.claudeFable':
    'Le Claude le plus capable, pour les problèmes les plus durs ; le plus cher',
  'models.curated.geminiFlash':
    'Le plus récent de Google ; rapide avec les images et les très longs documents',
  'models.curated.kimi': 'Poids ouverts, fort en code, bon rapport qualité-prix',
  'models.curated.grok': 'Le Grok le plus récent, pour de longs travaux avec des outils',
  'models.curated.image': 'Crée et retouche des images',

  // Settings › Models
  'models.default.follows':
    'Les nouvelles discussions prennent le dernier modèle que tu as choisi.',
  'models.default.startsHere':
    'Les nouvelles discussions commencent ici tant que tu ne choisis pas de modèle dans une discussion.',
  'models.default.reset': 'Réinitialiser',
  'models.default.refresh': 'Actualiser la liste',
  'models.favorites.hint': 'Les modèles que le sélecteur propose à côté de ses recommandations.',
  'models.favorites.empty': 'Pas encore de favoris.',
  'models.favorites.add': 'Ajouter un modèle',
  'models.zdr': 'Zéro conservation des données uniquement',
  'models.zdrHint': 'Ne proposer que des modèles de fournisseurs qui ne gardent pas tes prompts.',
  'models.familyMoved':
    '{family} est désormais {model} : les nouvelles discussions l’utilisent, celles en cours gardent le leur.',
  'models.defaultMissing':
    '{model} n’est pas proposé par tes fournisseurs, les nouvelles discussions commencent donc avec {fallback}.',
  'models.hiddenZdr':
    'Les modèles de {server} sont masqués : la zéro conservation est activée et seul OpenRouter peut la garantir.',
  'models.unavailableKey': 'Modèles de {server} indisponibles : la clé a été refusée.',
  'models.unavailableLimited': 'Modèles de {server} indisponibles : trop de requêtes.',
  'models.unreachable': 'Impossible de joindre {server}.',
  'models.unavailable': 'Modèles de {server} indisponibles pour le moment.',
  'pricing.free': 'Gratuit',
  'pricing.in': 'entrée {rate}/M',
  'pricing.out': 'sortie {rate}/M',
  'pricing.inFree': 'entrée gratuite',
  'pricing.outFree': 'sortie gratuite',

  // The model picker
  'picker.choose': 'Choisir un modèle',
  'picker.search': 'Rechercher des modèles',
  'picker.results': 'Résultats',
  'picker.recommended': 'Recommandés',
  'picker.favorites': 'Tes favoris',
  'picker.servers': 'Tes serveurs',
  'picker.unavailableZdr': '{model} : indisponible tant que la zéro conservation est activée',
  'picker.empty': 'Pas encore de modèles. Connecte un fournisseur pour choisir parmi ses modèles.',
  'picker.noMatch': 'Aucun modèle ne correspond.',
  'picker.noneFound': 'Aucun modèle trouvé',
  'picker.inUse': ', utilisé',
  'picker.removeFavorite': 'Retirer des favoris',
  'picker.removeFavoriteNamed': 'Retirer {model} des favoris',
  'regenerate.with': 'Réessayer avec',
  'regenerate.withAnother': 'Réessayer avec un autre modèle',
  'regenerate.sameModel': 'même modèle',
  'sidebar.newChat': 'Nouvelle discussion',
  'sidebar.createFolder': 'Créer un dossier',
  'sidebar.folders': 'Dossiers',
  'sidebar.search': 'Rechercher dans les discussions',
  'sidebar.noMatch': 'Aucune discussion ne correspond à « {query} ».',
  'sidebar.today': 'Aujourd’hui',
  'sidebar.previous7': '7 derniers jours',
  'sidebar.previous30': '30 derniers jours',
  'sidebar.earlier': 'Plus ancien',
  'chatRow.name': 'Nom de la discussion',
  'chatRow.tutoring': 'Séance d’apprentissage :',
  'chatRow.rename': 'Renommer',
  'chatRow.renameNamed': 'Renommer « {title} »',
  'chatRow.move': 'Déplacer dans un dossier',
  'chatRow.moveNamed': 'Déplacer « {title} » dans un dossier',
  'chatRow.deleteNamed': 'Supprimer « {title} »',
  'chatRow.actionsFor': 'Actions pour {title}',
  'chatRow.deleteTitle': 'Supprimer cette discussion ?',
  'chatRow.deleteBody': '« {title} » et ses messages disparaîtront pour de bon.',
  'folder.namePlaceholder': 'Nom du dossier',
  'folder.newName': 'Nom du nouveau dossier',
  'folder.actionsFor': 'Actions du dossier {name}',
  'folder.rename': 'Renommer le dossier',
  'folder.delete': 'Supprimer le dossier',
  'folder.deleteTitle': 'Supprimer ce dossier ?',
  'folder.deleteBodyChats': 'Les discussions de « {name} » restent ; elles sortent du dossier.',
  'folder.deleteBodyEmpty': '« {name} » est vide.',
  'folder.count': { one: '{count} discussion', other: '{count} discussions' },
  'folder.newDefault': 'Nouveau dossier',
  'move.label': 'Déplacer {title} dans un dossier',
  'move.title': 'Déplacer « {title} »',
  'move.noFolder': 'Aucun dossier',
  'move.newFolder': 'Nouveau dossier…',
  'move.heading': 'Déplacer vers',

  // Header, drawer and pages
  'nav.memory': 'Mémoire',
  'nav.settings': 'Réglages',
  'nav.learningHub': 'Parcours',
  'drawer.chats': 'Discussions',
  'drawer.open': 'Ouvrir les discussions',
  'header.toggleSidebar': 'Afficher ou masquer la barre latérale',
  'header.expandSidebar': 'Ouvrir la barre latérale',
  'header.collapseSidebar': 'Replier la barre latérale',
  'header.openMemory': 'Ouvrir la mémoire',
  'header.openSettings': 'Ouvrir les réglages',
  'header.tutorModel': 'Modèle du tuteur : {model}. À changer dans les Réglages.',
  'lightbox.label': 'Visionneuse d’images',
  'lightbox.download': 'Télécharger',
  'lightbox.previous': 'Précédente',
  'lightbox.next': 'Suivante',

  // Settings › Chat
  'settings.chat.systemHint':
    'Ce que chaque nouvelle discussion reçoit avant ton premier message. Une séance d’apprentissage y ajoute ses propres instructions.',
  'settings.chat.savedPrompts': 'Prompts enregistrés',
  'settings.chat.savedPrompt': 'Prompt enregistré',
  'settings.chat.namePrompt': 'Nomme ce prompt',
  'settings.chat.newName': 'Nouveau nom',
  'settings.chat.newNameLabel': 'Nouveau nom pour ce prompt',
  'settings.chat.deletePrompt': 'Supprimer « {name} » ?',
  'settings.chat.choosePrompt': 'Choisis un prompt enregistré…',
  'settings.chat.use': 'Utiliser',
  'settings.chat.saveCurrent': 'Enregistrer l’actuel',
  'settings.chat.renamePrompt': 'Renommer le prompt',
  'settings.chat.deletePromptButton': 'Supprimer le prompt',
  'settings.chat.timestamps': 'Horodatage des messages',
  'settings.chat.timestampsHint':
    'Indique au modèle quand chaque message a été envoyé, pour qu’il connaisse la date. Ajoute un peu au coût de chaque message.',
  'settings.chat.modelDefault': 'Par défaut du modèle',
  'settings.chat.effortHint':
    'Combien les nouvelles discussions réfléchissent par défaut. Change-le par discussion depuis la zone de saisie ; un modèle qui n’a pas un niveau prend le plus proche.',
  'settings.chat.budget': 'Budget de réflexion',
  'settings.chat.automatic': 'Automatique',
  'settings.chat.budgetInvalid':
    'Saisis un nombre entier supérieur à 0, ou laisse vide. Non enregistré.',
  'settings.chat.budgetHint':
    'Le maximum que le modèle peut réfléchir, en tokens (environ trois quarts de mot chacun), pour les modèles qui acceptent une limite. Laisse vide pour laisser le modèle décider.',
  'settings.memory.use': 'Utiliser la mémoire',
  'settings.memory.useHint':
    'Le modèle lit ta mémoire à chaque message et note ce qu’il apprend sur toi. Ce qu’il lit part chez le fournisseur de la discussion. Pour garder une discussion à l’écart, désactive la mémoire avec le marque-page de sa zone de saisie.',
  'settings.memory.sensitive': 'Inclure les sujets sensibles',
  'settings.memory.sensitiveHint':
    'Laisse le modèle noter des détails comme des problèmes de santé ou des convictions religieuses sans que tu le demandes. La mémoire reste uniquement dans ce navigateur, et part chez le fournisseur de la discussion comme le reste. Désactivé, il ne les enregistre que si tu le demandes.',
  'settings.memory.open': 'Ouvrir la mémoire',

  // Settings: pages and sections
  'settings.tab.connections': 'Connexions',
  'settings.tab.models': 'Modèles',
  'settings.tab.chat': 'Discussion',
  'settings.tab.tutor': 'Tuteur',
  'settings.tab.appearance': 'Apparence',
  'settings.tab.data': 'Données',
  'settings.section.providers': 'Fournisseurs',
  'settings.section.endpoints': 'Tes serveurs',
  'settings.section.web-search': 'Recherche web',
  'settings.section.default-model': 'Modèle par défaut',
  'settings.section.favorites': 'Favoris',
  'settings.section.privacy': 'Confidentialité',
  'settings.section.general': 'Prompt système',
  'settings.section.memory': 'Mémoire',
  'settings.section.reasoning': 'Réflexion',
  'settings.section.tutor': 'Tuteur',
  'settings.section.theme': 'Thème',
  'settings.section.language': 'Langue',
  'settings.section.display': 'Affichage',
  'settings.section.developer': 'Développeurs',
  'settings.section.data': 'Importer et exporter',

  // What each section shows and is about, so search finds it by the words on
  // screen as well as by its title. English words always find it too.
  'settings.keywords.providers':
    'clé openrouter clé anthropic api fournisseur connecter remplacer retirer espace de travail workspace',
  'settings.keywords.endpoints':
    'ton propre serveur local ollama lm studio llama.cpp vllm adresse du serveur url endpoint personnalisé compatible openai clé api noms des modèles tester la connexion outils images niveau de réflexion coûts des réponses cache des prompts titres des discussions retirer auto-hébergé',
  'settings.keywords.web-search': 'tavily clé recherche web openrouter jina reader',
  'settings.keywords.default-model':
    'nouvelle discussion modèle par défaut réinitialiser actualiser liste',
  'settings.keywords.favorites': 'favoris étoile modèles retirer sélecteur',
  'settings.keywords.privacy':
    'zéro conservation des données uniquement zdr confidentialité fournisseurs prompts',
  'settings.keywords.general':
    'prompt système prompts enregistrés choisir un prompt modèle enregistrer l’actuel renommer supprimer horodatage date heure',
  'settings.keywords.memory':
    'utiliser la mémoire retenir oublier notes sur toi apprentissage sujets sensibles privé santé ouvrir la mémoire marque-page',
  'settings.keywords.reasoning':
    'niveau de réflexion budget de réflexion tokens niveau modèle par défaut',
  'settings.keywords.tutor':
    'tuteur mode toujours apprendre suivre le tuteur défilement modèle du tuteur plan d’apprentissage apprenant enseignement',
  'settings.keywords.theme': 'thème couleur clair sombre automatique système',
  'settings.keywords.language':
    'langue traduction automatique english italiano français español deutsch português ελληνικά',
  'settings.keywords.display':
    'afficher la réflexion par défaut détails des réponses modèle vitesse coût statistiques affichage',
  'settings.keywords.developer':
    'développeurs journal des appels d’outils vue de la requête json brut chaque réponse débogage inspecter arguments résultat',
  'settings.keywords.data':
    'importer exporter discussions et réglages fichier json sauvegarde données',
  'settings.tutorSummary': 'Les séances d’apprentissage et leur modèle',
  'settings.search': 'Rechercher dans les réglages',
  'settings.clearSearch': 'Effacer la recherche',
  'settings.noMatch': 'Aucun réglage ne correspond à « {query} ».',
  'settings.pages': 'Pages des réglages',
  'settings.navigation': 'Navigation des réglages',
  'settings.close': 'Fermer les réglages',
  'settings.back': 'Retour aux Réglages',
  'settings.saveFailed': 'Les réglages n’ont pas pu être enregistrés. Refais la modification.',

  // Settings › Connections
  'providers.rejected': 'Le fournisseur a refusé cette clé. Colles-en une nouvelle.',
  'providers.usingKey': 'Utilise ta clé',
  'providers.readyNoKey': 'Prêt (pas besoin de clé)',
  'providers.needsAddress': 'Il faut une adresse',
  'providers.needsKey': 'Il faut une clé',
  'providers.keysStay': 'Les clés restent dans ce navigateur et ne sont jamais exportées.',
  'providers.workspace': 'ID de l’espace de travail (facultatif)',
  'providers.workspaceHint':
    'Utile seulement si Claude indique que ta clé demande un espace de travail. Copie l’ID depuis Workspaces dans la Claude Console : il commence par wrkspc_.',
  'providers.workspaceInvalid':
    'Un ID d’espace de travail ne contient que des lettres, des chiffres, _ et -.',
  'apiKey.saved': '{key} enregistrée. Colle pour la remplacer',
  'apiKey.replace': 'Remplacer',
  'apiKey.removeNamed': 'Retirer : {label}',
  'apiKey.removeTitle': 'Retirer « {label} » ?',
  'apiKey.removeBody':
    'Elle est supprimée de ce navigateur. Pour t’en resservir, colle-la à nouveau.',
  'servers.removeTitle': 'Retirer {name} ?',
  'servers.removeBody':
    'Son adresse, sa clé et ses réglages disparaissent. Les discussions qui utilisaient ses modèles gardent leurs messages.',
  'servers.notSaved': 'Non enregistré.',
  'servers.addressHint': 'L’adresse du serveur, par exemple http://localhost:11434/v1 pour Ollama.',
  'servers.modelNames': 'Noms des modèles',
  'servers.modelNamesHint':
    'Séparés par des virgules. Ce que ce serveur liste dans /models s’ajoute tout seul.',
  'servers.keyOptional': 'Clé (facultative)',
  'servers.keyPlaceholder': 'La plupart des serveurs locaux n’en ont pas besoin',
  'servers.supports': 'Ce que ce serveur prend en charge',
  'servers.supportsHint':
    'Rien de ce qui n’est pas coché n’est jamais envoyé. Un serveur strict refuse toute la requête pour un seul champ qu’il ne connaît pas.',
  'servers.titles': 'Titres des discussions',
  'servers.titlesChatModel': 'Utiliser le modèle de la discussion',
  'servers.titlesOff': 'Ne pas générer de titres',
  'servers.remove': 'Retirer ce serveur',
  'servers.name': 'Nom du serveur',
  'servers.namePlaceholder': 'Nom, ex. Ollama',
  'servers.add': 'Ajouter',
  'servers.addHint':
    'Fonctionne avec Ollama, LM Studio, llama.cpp et vLLM. Les fonctions commencent désactivées, à toi de les activer.',
  'servers.noAddress': 'aucune adresse',
  'webSearch.hint':
    'La recherche intégrée au fournisseur du modèle ne demande pas d’autre clé et c’est celle par défaut. Avec une clé OpenRouter, tu peux aussi choisir la recherche OpenRouter dans la zone de saisie : le modèle cherche quand il le faut, sur ton crédit OpenRouter, et les pages sont lues avec Jina Reader. Tes recherches partent chez le partenaire de recherche d’OpenRouter, et les adresses des pages chez Jina.',
  'webSearch.keyLabel': 'Clé {provider}',
  'capability.tools': 'Outils',
  'capability.toolsHint':
    'Laisser le modèle utiliser des outils, comme la recherche et la mémoire.',
  'capability.vision': 'Images',
  'capability.visionHint': 'Envoyer des images.',
  'capability.reasoningHint': 'Envoyer un niveau de réflexion.',
  'capability.streamUsage': 'Coût des réponses',
  'capability.streamUsageHint': 'Indiquer ce que chaque réponse a coûté.',
  'capability.parallelToolCalls': 'Plusieurs outils à la fois',
  'capability.parallelToolCallsHint': 'Laisser le modèle utiliser plus d’un outil par étape.',
  'capability.promptCaching': 'Cache des prompts',
  'capability.promptCachingHint': 'Réutiliser les longs prompts pour économiser.',
  'probe.title': 'Tester la connexion',
  'probe.test': 'Tester la connexion',
  'probe.testAgain': 'Tester à nouveau',
  'probe.modelToTest': 'Modèle à tester',
  'probe.hint':
    'Envoie quelques toutes petites requêtes pour voir quels champs ce serveur accepte, afin que les cases ci-dessous soient réglées d’après une réponse plutôt qu’au hasard.',
  'probe.hintModel':
    'Envoie quelques toutes petites requêtes à {model} pour voir quels champs ce serveur accepte, afin que les cases ci-dessous soient réglées d’après une réponse plutôt qu’au hasard.',
  'probe.step.models': 'Liste des modèles…',
  'probe.step.chat': 'Envoi d’un premier message…',
  'probe.step.tools': 'Vérification des outils…',
  'probe.step.parallelToolCalls': 'Vérification de plusieurs outils à la fois…',
  'probe.step.reasoning': 'Vérification du niveau de réflexion…',
  'probe.step.vision': 'Vérification des images…',
  'probe.step.streamUsage': 'Vérification du coût des réponses…',
  'probe.step.promptCaching': 'Vérification du cache des prompts…',
  'probe.verdict.ok': 'Accepté',
  'probe.verdict.no': 'Non pris en charge',
  'probe.verdict.unknown': 'Pas de réponse',
  'probe.verdict.skipped': 'Ignoré',
  'probe.reachable': 'Joignable.',
  'probe.noModels': 'Il ne liste aucun modèle, seuls ceux que tu as saisis sont donc utilisés.',
  'probe.listsModels': { one: 'Il liste {count} modèle.', other: 'Il liste {count} modèles.' },
  'probe.notApi': 'Quelque chose a répondu à {address}, mais pas un serveur compatible OpenAI.',
  'probe.notApiHint':
    'Vérifie l’adresse. C’est en général la racine du serveur suivie de /v1, par exemple http://localhost:11434/v1 pour Ollama.',
  'probe.noRoute': 'Pas de route /models ici, seuls ceux que tu as saisis sont donc utilisés.',
  'probe.unauthorized': 'Joignable, mais il veut une clé et n’a pas accepté la tienne.',
  'probe.unreachable': 'Impossible de joindre {address}.',
  'probe.unreachableHint':
    'Vérifie que le serveur tourne et qu’il accepte les requêtes de {origin}. Ollama a besoin que OLLAMA_ORIGINS inclue cette origine, et LM Studio que le CORS soit activé dans les réglages du serveur.',
  'probe.listFailed': 'Joignable, mais la liste des modèles a échoué.',
  'probe.replied': '{model} a répondu en {time}.',
  'probe.noAnswer': '{model} n’a pas répondu.',
  'probe.notTested': '{model} n’a pas été testé.',
  'probe.noMessage': 'Aucun message n’a été envoyé.',
  'probe.apply': 'Appliquer aux cases ci-dessous',
  'probe.applyHint': 'Active ce qui a été accepté et désactive ce qui a été refusé.',
  'probe.alreadyMatch': 'Les cases ci-dessous correspondent déjà à ce que ce serveur a accepté.',

  // Testing a server (the details under each line)
  'probe.canceled': 'Le test de connexion a été annulé.',
  'probe.timeout': 'Pas de réponse en {seconds} s.',
  'probe.failedEarly': 'La requête a échoué avant que le serveur réponde.',
  'probe.detail.unreachable': 'Le serveur était injoignable.',
  'probe.detail.notApi': 'Aucun serveur compatible OpenAI n’a répondu à cette adresse.',
  'probe.detail.noModel':
    'Aucun modèle à tester. Saisis un nom de modèle ci-dessus, ou regarde ce que le serveur liste.',
  'probe.detail.notStream':
    'A répondu, mais pas sous forme de flux de tokens. Dialogia affiche chaque réponse au fil de l’écriture.',
  'probe.detail.firstFailed': 'Ignoré parce que le premier message n’est pas passé.',
  'probe.detail.needsTools': 'Nécessite les appels d’outils.',
  'probe.detail.noUsage': 'Le serveur a accepté le champ mais n’a renvoyé aucune consommation.',

  // Settings › Data
  'data.label': 'Discussions et réglages',
  'data.hint': 'Tout dans un seul fichier. Tes clés n’y sont jamais.',
  'data.import': 'Importer',
  'data.export': 'Exporter',
  'data.thisFile': 'ce fichier',
  'data.importTitle': 'Importer {name} ?',
  'data.importBody':
    'Les discussions du fichier remplacent celles d’ici qui ont le même identifiant, et ses réglages remplacent les tiens : serveurs, favoris et réglages des discussions. Tout le reste est gardé. Exporte d’abord si tu risques de vouloir revenir en arrière.',
  'data.exportFailed': 'L’export a échoué. Réessaie.',
  'data.importFailed': 'L’import a échoué. Réessaie.',
  'data.nothing': 'Ce fichier ne contient ni discussions ni réglages de Dialogia.',
  'data.notJson': 'Ce fichier n’est pas un export de Dialogia : ce n’est pas du JSON valide.',
  'data.newerVersion':
    'Cette sauvegarde vient d’une version plus récente de Dialogia. Recharge pour mettre l’app à jour, puis importe-la à nouveau.',
  'data.noneRead': 'Aucune des discussions de ce fichier n’a pu être lue.',
  'data.imported.chats': {
    one: '{count} discussion importée.',
    other: '{count} discussions importées.',
  },
  'data.imported.settings': 'Tes réglages ont été importés.',
  'data.skipped.some': {
    one: '{count} n’a pas pu être lue.',
    other: '{count} n’ont pas pu être lues.',
  },
  'data.skipped.chats': {
    one: '{count} discussion n’a pas pu être lue.',
    other: '{count} discussions n’ont pas pu être lues.',
  },

  // Settings › Appearance
  'appearance.scheme': 'Couleurs',
  'appearance.schemeHint': 'Clair, sombre, ou comme ton système.',
  'appearance.light': 'Clair',
  'appearance.dark': 'Sombre',
  'appearance.auto': 'Auto',
  'appearance.language': 'Langue',
  'appearance.languageHint':
    'Les mots de l’app. Les réponses suivent la langue dans laquelle tu écris.',
  'appearance.languageAuto': 'Automatique ({language})',
  'appearance.showThinking': 'Toujours afficher la réflexion',
  'appearance.showThinkingHint':
    'Affiche ce que le modèle a pensé pour chaque réponse, y compris les plus anciennes.',
  'appearance.showStats': 'Afficher les détails des réponses',
  'appearance.showStatsHint':
    'Une ligne sous chaque réponse : quel modèle l’a écrite, à quelle vitesse, et ce qu’elle a coûté.',
  'appearance.toolLog': 'Journal des appels d’outils',
  'appearance.toolLogHint':
    'Au-dessus de chaque réponse qui a utilisé des outils, chaque appel avec ses arguments et son résultat.',
  'appearance.requestView': 'Vue de la requête',
  'appearance.requestViewHint':
    'Au-dessus de chaque réponse, la requête qui l’a produite. Enregistrée à partir de maintenant et gardée jusqu’au rechargement.',
  'appearance.rawJson': 'Inclure le JSON brut',
  'appearance.rawJsonHint': 'La requête exactement telle qu’envoyée, prête à copier.',

  // Code blocks and diagrams in replies
  'code.copy': 'Copier le code',
  'code.wrap': 'Retour à la ligne',
  'code.unwrap': 'Sans retour',
  'code.enableWrap': 'Couper les longues lignes',
  'code.disableWrap': 'Garder les longues lignes entières',
  'code.expand': 'Déplier',
  'code.collapse': 'Replier',
  'code.diagramFailed': 'Ce diagramme n’a pas pu être dessiné.',

  // Memory
  'memory.close': 'Fermer la mémoire',
  'memory.folders': 'Dossiers de la mémoire',
  'memory.folder.about': 'À propos de toi',
  'memory.folder.aboutDescription': 'Qui tu es, où tu vis, comment tu aimes les réponses',
  'memory.folder.learning': 'Apprentissage',
  'memory.folder.learningDescription':
    'Ce que tu as étudié avec le tuteur, et comment tu apprends le mieux',
  'memory.aboutEmpty':
    'Ce que le modèle apprend sur toi arrive ici. Tu peux aussi ajouter une note toi-même.',
  'memory.folderEmpty': 'Pas encore de notes dans ce dossier.',
  'memory.forgotten': 'Oubliées récemment',
  'memory.forgottenHint':
    'Les notes que toi ou le modèle avez laissées de côté. Chacune attend ici 30 jours, puis disparaît pour de bon.',
  'memory.forgottenFrom': 'Depuis {folder} · oubliée le {date}',
  'memory.aFolder': 'un dossier',
  'memory.restore': 'Restaurer',
  'memory.restoreNamed': 'Restaurer : {note}',
  'memory.forgottenEmpty': 'Rien d’oublié récemment.',
  'memory.editHint': 'Entrée pour enregistrer · Échap pour annuler',
  'memory.editHintTouch': 'Touche OK pour enregistrer',
  'memory.byModel': 'Écrite par le modèle',
  'memory.editedByYou': 'Modifiée par toi',
  'memory.byYou': 'Écrite par toi',
  'memory.fromChat': 'depuis {chat}',
  'memory.note': 'Note',
  'memory.forget': 'Oublier',
  'memory.forgetNamed': 'Oublier : {note}',
  'memory.newNote': 'Nouvelle note',
  'memory.newNotePlaceholder': 'Quelque chose que le modèle devrait savoir',
  'memory.addNote': 'Ajouter une note',
  'memory.folderHolds': 'Ce que contient {folder}',
  'memory.folderLineHint':
    'Le modèle lit d’abord cette ligne, et ouvre le dossier quand il s’y prête.',
  'memory.folderLinePlaceholder': 'Dis ce que contient ce dossier',
  'memory.consolidating': 'Rangement en cours…',
  'memory.consolidate': 'Ranger',
  'memory.consolidateHint': 'Range la mémoire avec {model}',
  'memory.addFirst': 'Ajoute d’abord une note',
  'memory.newToday': {
    one: '{count} nouvelle depuis le rangement d’aujourd’hui',
    other: '{count} nouvelles depuis le rangement d’aujourd’hui',
  },
  'memory.newSince': {
    one: '{count} nouvelle depuis le {date}',
    other: '{count} nouvelles depuis le {date}',
  },
  'memory.upToDate': 'À jour',
  'memory.reportLabel': 'Ce que le rangement a changé',
  'memory.consolidatedOn': 'Rangée le {date}',
  'memory.nothingChanged': 'Rien n’a changé',
  'memory.alreadyTidy': 'Déjà bien rangée',
  'memory.undo': 'Annuler',
  'memory.openInMemory': 'Ouvrir dans la mémoire',
  'memory.nothingNeeded': 'Il n’y avait rien à changer.',
  'memory.skippedSome': {
    one: 'Une modification proposée n’a pas pu être faite et a été ignorée.',
    other: '{count} modifications proposées n’ont pas pu être faites et ont été ignorées.',
  },
  'memory.skippedAll': {
    one: 'Le modèle a proposé une modification, mais elle n’a pas pu être faite.',
    other: 'Le modèle a proposé {count} modifications, mais aucune n’a pu être faite.',
  },
  'memory.writesLabel': 'Modifications de la mémoire',
  'memory.takenBack': 'Annulé :',
  'memory.write.added': 'Retenu',
  'memory.write.updated': 'Mis à jour',
  'memory.write.forgotten': 'Oublié',
  'memory.was': '(avant : {text})',
  'memory.undoNamed': 'Annuler : {note}',
  'memory.records': 'Séances d’apprentissage',
  'memory.recordsHint':
    'Les séances d’apprentissage apparaissent ici d’elles-mêmes, avec leur progression lue en direct dans la discussion.',
  'memory.record.finished': 'Terminée le {date}',
  'memory.record.progress': '{done} sur {count} faits · étudié pour la dernière fois le {date}',

  // Notices: the toasts that say something went right or wrong
  'notice.invalidKey': 'Cette clé a été refusée. Vérifie-la dans Réglages › Connexions.',
  'notice.expiredKey': 'Cette clé a expiré. Ajoutes-en une nouvelle dans Réglages › Connexions.',
  'notice.rateLimited': 'Le fournisseur limite les requêtes. Attends un instant, puis réessaie.',
  'notice.missingSearchKey':
    'Cette recherche a besoin d’une clé. Ajoute-la dans Réglages › Connexions.',
  'notice.searchUnavailable':
    'La recherche web n’est pas disponible dans cette discussion ; la réponse se fait sans elle.',
  'notice.unknownEndpoint':
    'Cette discussion utilise un serveur qui n’existe plus. Ajoute-le à nouveau dans Réglages › Connexions, ou choisis un autre modèle.',
  'notice.exportedChats': 'Tes discussions ont été exportées.',
  'notice.planApplyFailed': 'Le plan n’a pas pu être appliqué. Réessaie.',
  'notice.planChangesFailed': 'Ta suggestion n’a pas pu être envoyée. Réessaie.',
  'notice.copyFailed': 'Copie impossible : le navigateur a bloqué le presse-papiers.',
  'notice.replyInOtherTab':
    'Un autre onglet écrit une réponse dans cette discussion. Envoie quand il a fini, pour que les deux onglets montrent la même discussion.',
  'notice.saveFailed':
    'La réponse n’a pas pu être enregistrée dans ce navigateur. Elle est à l’écran, mais pourrait être coupée après un rechargement.',
  'notice.consolidationFailed':
    'La mémoire n’a pas pu être rangée. Rien n’a changé ; réessaie dans un instant.',
  'notice.consolidationUnreadable':
    'Ce modèle n’a pas su proposer de modifications. Rien n’a changé. Essaie un autre modèle.',
  'notice.consolidationUndone': 'Rangement annulé.',
  'notice.consolidationStale':
    'La mémoire a changé pendant le rangement, donc rien n’a changé. Range à nouveau.',
  'notice.consolidationPartlyUndone':
    'Le rangement a été annulé, sauf ce qui a changé depuis, laissé tel quel.',
  'notice.memoryChangedSince': 'Cette note a changé depuis. Modifie-la dans la page Mémoire.',
  'notice.memoryAlreadyForgotten':
    'Cette note est déjà oubliée. Elle attend dans Oubliées récemment, sur la page Mémoire.',
  'notice.consolidationNoModel':
    'Connecte un modèle dans Réglages › Connexions pour ranger la mémoire.',
  'notice.replacedReplyChangedMemory':
    'La réponse que tu as remplacée avait modifié ta mémoire. Ces notes restent telles quelles ; relis-les dans la page Mémoire.',
  'notice.unreachable':
    'Impossible de joindre le fournisseur. Vérifie ta connexion, ou que ton serveur local tourne.',
  'notice.timedOut': 'La requête a pris trop de temps. Réessaie.',
  'notice.unknownError': 'Quelque chose s’est mal passé, et le fournisseur n’a pas dit quoi.',
  'notice.tryAgainSoon': 'Réessaie dans un instant.',
  'notice.providerError': 'Le fournisseur du modèle a renvoyé une erreur',
  'notice.modelListFailed': 'Impossible de charger la liste des modèles',
  'notice.emptyResponse': 'Le fournisseur a envoyé une réponse vide',
  'notice.kind.image': 'images',
  'notice.kind.audio': 'audio',
  'notice.kind.pdf': 'PDF',
  'notice.droppedOne': 'Laissé de côté car ce modèle ne l’accepte pas : {list}.',
  'notice.droppedMany': 'Laissés de côté car ce modèle ne les accepte pas : {list}.',
  'notice.noModelsOffered': '{servers} n’a proposé aucun modèle.',
  'zdr.blocked':
    '{model} ne garantit pas la zéro conservation des données. Choisis un autre modèle, ou désactive Zéro conservation des données uniquement dans Réglages › Modèles.',
  'zdr.unavailable':
    'Impossible de vérifier quels fournisseurs ne gardent aucune donnée. Vérifie ta connexion, ou désactive Zéro conservation des données uniquement dans Réglages › Modèles.',

  // Attaching files
  'attach.kinds.all': 'des images, de l’audio (mp3/wav) ou des PDF',
  'attach.kinds.images': 'des images ou des PDF',
  'attach.kinds.audio': 'de l’audio (mp3/wav) ou des PDF',
  'attach.kinds.pdf': 'des PDF',
  'attach.aFile': 'un fichier',
  'attach.tooLarge': 'trop lourd, {max} Mo maximum',
  'attach.perMessage': '{limit} maximum par message',
  'attach.pdfs': { one: '{count} PDF', other: '{count} PDF' },
  'attach.images': { one: '{count} image', other: '{count} images' },
  'attach.audioFiles': { one: '{count} fichier audio', other: '{count} fichiers audio' },
  'attach.imageTypes': 'images PNG, JPEG, WebP ou GIF uniquement',
  'attach.audioTypes': 'audio mp3 ou wav uniquement',
  'attach.modelTakes': 'ce modèle accepte {kinds}',
  'attach.notAttached': 'Non joints : {files}.',
  'attach.hint': 'Joindre {kinds}',

  // Search errors, as the reasoning line shows them
  'searchError.failed': 'La recherche a échoué.',
  'searchError.tooLong': 'La recherche a pris trop de temps.',
  'searchError.pageTooLong': 'La page a mis trop de temps à charger.',
  'searchError.unreachable': 'Impossible de joindre {service}.',
  'searchError.openrouter.key':
    'OpenRouter n’a pas accepté la clé. Vérifie-la dans Réglages › Connexions.',
  'searchError.openrouter.credit': 'Le compte OpenRouter n’a plus de crédit.',
  'searchError.openrouter.limited':
    'OpenRouter limite les requêtes en ce moment. Réessaie dans un instant.',
  'searchError.openrouter.trouble':
    'OpenRouter rencontre des problèmes en ce moment. Réessaie plus tard.',
  'searchError.openrouter.failed': 'OpenRouter n’a pas pu lancer cette recherche.',
  'searchError.reader.busy': 'Le lecteur de pages gratuit est occupé. Réessaie dans une minute.',
  'searchError.reader.forbidden': 'Le lecteur de pages n’a pas le droit d’ouvrir cette page.',
  'searchError.reader.failed': 'Le lecteur de pages n’a pas pu ouvrir cette page.',
  'searchError.reader.couldNot': 'Impossible de lire cette page.',
  'searchError.reader.unreachable': 'Impossible de joindre le lecteur de pages.',
  'searchError.tavily.key':
    'Tavily n’a pas accepté la clé de recherche. Vérifie-la dans Réglages › Connexions.',
  'searchError.tavily.limited':
    'Tavily limite les recherches en ce moment. Réessaie dans un instant.',
  'searchError.tavily.plan': 'L’offre Tavily a atteint sa limite de recherches.',
  'searchError.tavily.trouble': 'Tavily rencontre des problèmes en ce moment. Réessaie plus tard.',
  'searchError.tavily.search': 'Tavily n’a pas pu lancer cette recherche.',
  'searchError.tavily.fetch': 'Tavily n’a pas pu récupérer cette page.',
};

export default messages;
