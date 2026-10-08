// Deutsch. Typed from the English source (en.ts); GLOSSARY.md keeps the words
// used throughout. Informal address, plain words, the app's warm voice.

import type en from './en';
import type { Translation } from '@/lib/i18n/catalogue';

const messages: Translation<typeof en> = {
  // Shared
  'common.notNow': 'Nicht jetzt',
  'common.off': 'Aus',
  'common.cancel': 'Abbrechen',
  'common.save': 'Speichern',
  'common.delete': 'Löschen',
  'common.close': 'Schließen',
  'common.dismiss': 'Schließen',

  // Welcome and first run
  'welcome.headline.first': 'Willkommen bei {name}',
  'welcome.headline.learn': 'Was willst du {word}?',
  'welcome.headline.learnWord': 'lernen',
  'welcome.headline.chat': 'Beginne einen {word}',
  'welcome.headline.chatWord': 'Dialog',
  'welcome.subline.withTutor':
    'Chatte mit den führenden KI-Modellen oder lerne etwas mit einem Tutor.',
  'welcome.subline': 'Chatte mit den führenden KI-Modellen.',
  'welcome.connectTitle': 'Verbinde zuerst ein Modell',
  'welcome.connected': 'Verbunden',
  'setup.title': 'Modell verbinden',
  'setup.needsKey':
    '{model} läuft über {provider}. Füge deinen {provider}-Schlüssel hinzu, um es zu nutzen.',
  'connect.lead.openrouter':
    'Füge einen Schlüssel von OpenRouter ein. Ein Schlüssel öffnet fast alle Modelle, und du zahlst OpenRouter nur, was du nutzt.',
  'connect.lead.anthropic':
    'Füge einen Schlüssel von Anthropic ein, um Claude-Modelle zu nutzen. Du zahlst Anthropic nur, was du nutzt.',
  'connect.lead.local':
    'Füge die Adresse eines Modellservers ein, den du selbst betreibst, etwa Ollama oder LM Studio. Meist braucht es keinen Schlüssel.',
  'connect.steps.account': '{action} auf {link}.',
  'connect.steps.accountAction': 'Leg ein Konto an',
  'connect.steps.credit': '{action} unter {page}.',
  'connect.steps.creditAction': 'Lade etwas Guthaben auf',
  'connect.steps.key': '{action} unter {link}, kopiere ihn und füge ihn oben ein.',
  'connect.steps.keyAction': 'Erstelle einen Schlüssel',
  'connect.serverAddress': 'Serveradresse',
  'connect.submit': 'Verbinden',
  'connect.howToGetKey': 'Wie bekomme ich einen Schlüssel?',
  'connect.otherWays': 'Andere Wege, dich zu verbinden',
  'connect.privacy.key': 'Dein Schlüssel und deine Chats bleiben in diesem Browser.',
  'connect.privacy.server': 'Deine Chats bleiben in diesem Browser.',
  'connect.option.openrouter': 'OpenRouter-Schlüssel',
  'connect.option.openrouterNote': 'Fast alle Modelle, ein Schlüssel',
  'connect.option.anthropic': 'Anthropic-Schlüssel',
  'connect.option.anthropicNote': 'Nur Claude-Modelle',
  'connect.option.local': 'Dein eigener Server',
  'connect.option.localNote': 'Ollama, LM Studio und Ähnliches',
  'connect.keyRefused':
    '{provider} hat diesen Schlüssel nicht angenommen. Prüf, ob du ihn ganz kopiert hast, oder erstelle einen neuen.',
  'connect.serverSilent': 'Unter dieser Adresse kamen keine Modelle. Läuft der Server?',
  'connect.keyNotSaved':
    'Dieser Browser konnte deinen Schlüssel nicht speichern. Er funktioniert nur, bis du die Seite schließt.',
  'connect.invalidAddress':
    'Gib die vollständige Adresse ein, etwa http://localhost:11434/v1, mit http:// oder https:// am Anfang.',

  // Composer
  'composer.placeholder': 'Frag irgendwas',
  'composer.slashSuggestions': 'Befehlsvorschläge',
  'composer.stop': 'Antwort stoppen',
  'composer.writingElsewhere': 'Schreibt in einem anderen Tab …',
  'composer.attach': 'Dateien anhängen',
  'composer.memory.label': 'Diesen Chat aus dem Gedächtnis heraushalten',
  'composer.memory.on':
    'Gedächtnis: in diesem Chat an. Schalte es aus, um den Chat herauszuhalten.',
  'composer.memory.off': 'Gedächtnis: in diesem Chat aus. Nichts wird gelesen oder gemerkt.',
  'composer.memory.offLabel': 'Gedächtnis aus',
  'composer.sendLabel': 'Nachricht senden',
  'composer.send': 'Senden',
  'composer.sendFailed':
    'Die Nachricht konnte nicht gesendet werden. Dein Entwurf steht wieder im Eingabefeld.',
  'composer.sendFailedElsewhere':
    'Die Nachricht konnte nicht gesendet werden. Dein Entwurf steht wieder in seinem Chat.',

  // Thinking effort
  'effort.title': 'Denktiefe',
  'effort.buttonTitle': 'Denken: {level}',
  'effort.default': 'Standard',
  'effort.modelDefault': '{level} (Standard des Modells)',
  'effort.none': 'Aus',
  'effort.minimal': 'Minimal',
  'effort.low': 'Niedrig',
  'effort.medium': 'Mittel',
  'effort.high': 'Hoch',
  'effort.xhigh': 'Sehr hoch',
  'effort.max': 'Maximal',
  'effort.hint.none': 'Antwortet sofort',
  'effort.hint.minimal': 'Nur ein kurzer Gedanke',
  'effort.hint.low': 'Denkt kurz nach',
  'effort.hint.medium': 'Denkt es durch',
  'effort.hint.high': 'Denkt gründlich nach',
  'effort.hint.xhigh': 'Denkt sehr gründlich nach',
  'effort.hint.max': 'Nimmt sich alle Zeit, die es braucht',

  // Web search
  'search.title': 'Websuche',
  'search.short': 'Suche',
  'search.state.on': 'Websuche: an ({provider})',
  'search.state.off': 'Websuche: aus ({provider})',
  'search.builtIn': 'Eingebaut',
  'search.builtInDescription': 'Die eigene Suche des Modellanbieters',
  'search.toolDescription': 'Sucht, wenn nötig, und liest die gefundenen Seiten',
  'search.openrouter': 'OpenRouter-Suche',

  // Slash commands (the commands themselves stay in English)
  'slash.model': 'Mit einem anderen Modell antworten',
  'slash.search': 'Websuche an- oder ausschalten',
  'slash.reasoning': 'Wie lange das Modell nachdenkt',
  'slash.help': 'Was diese Befehle tun',
  'slash.typeModel': 'Modellnamen eingeben …',
  'slash.searchOn': 'Websuche ist in diesem Chat an.',
  'slash.searchOff': 'Websuche ist in diesem Chat aus.',
  'slash.searchOnNext': 'Websuche ist im nächsten Chat an.',
  'slash.searchOffNext': 'Websuche ist im nächsten Chat aus.',
  'slash.noThinking':
    'Dieses Modell antwortet ohne vorher nachzudenken, es gibt also nichts einzustellen.',
  'slash.effortUnavailable': 'Dieses Modell bietet die Stufe „{level}“ nicht an.',
  'slash.effortSet': 'Denktiefe auf „{level}“ gestellt.',
  'slash.noSuchModel': 'Kein Modell heißt {name}.',
  'slash.modelSet': 'Jetzt antwortet {name}.',
  'slash.helpText':
    'Tippe /model und einen Namen, um das Modell zu wechseln, /search on oder off für die Websuche und /reasoning mit einer Stufe wie low oder high.',

  // Chat
  'chat.opening': 'Chat wird geöffnet …',
  'chat.showEarlier': {
    one: 'Frühere Nachricht anzeigen ({count})',
    other: 'Frühere Nachrichten anzeigen ({count})',
  },
  'chat.scrollToBottom': 'Nach unten',

  // Sidebar and chats
  'chat.untitled': 'Neuer Chat',
  'chat.branchMark': '(Abzweig)',

  // A message and its actions
  'message.saveShortcut': '{key} Enter zum Speichern',
  'message.copy': 'Kopieren',
  'message.copied': 'Kopiert',
  'message.copyLabel': 'Nachricht kopieren',
  'message.edit': 'Bearbeiten',
  'message.editing': 'Wird bearbeitet …',
  'message.editMessage': 'Nachricht bearbeiten',
  'message.editReply': 'Antwort bearbeiten',
  'message.editPlaceholder': 'Deine Nachricht bearbeiten …',
  'message.editReplyPlaceholder': 'Die Antwort bearbeiten …',
  'message.showLess': 'Weniger anzeigen',
  'message.showAll': 'Alles anzeigen',
  'message.writing': 'Schreibt eine Antwort',
  'message.stillWorking': 'Arbeitet noch',
  'message.tryAgain': 'Nochmal versuchen',
  'message.branch': 'In neuem Chat abzweigen',
  'message.selectText': 'Text auswählen',
  'message.sheet.reply': 'Antwort',
  'message.sheet.yours': 'Deine Nachricht',
  'message.sheet.replyActions': 'Aktionen für die Antwort',
  'message.sheet.messageActions': 'Aktionen für die Nachricht',
  'message.filtered.title': 'Vom Sicherheitsfilter des Modells abgelehnt',
  'message.filtered.cutShort': 'Die Antwort wurde vom Sicherheitsfilter des Anbieters abgebrochen.',
  'message.filtered.blocked':
    'Ein Sicherheitsfilter hat diese Anfrage blockiert, bevor das Modell antworten konnte.',
  'message.filtered.reason': 'Angegebener Grund: {reason}.',
  'message.youSaid': 'Du:',

  // A reply's versions (Try again keeps the old one)
  'versions.label': 'Version {at} von {count}',
  'versions.labelWithModel': 'Version {at} von {count}, {model}',
  'versions.group': 'Versionen dieser Antwort',
  'versions.onlyLatest': 'Nur bei der neuesten Antwort lässt sich die Version wechseln',
  'versions.previous': 'Vorherige Version',
  'versions.next': 'Nächste Version',
  'versions.delete': 'Diese Version löschen',
  'versions.deleteNumbered': 'Version {at} von {count} löschen',
  'versions.deleteTitle': 'Diese Version löschen?',
  'versions.deleteBody':
    'Diese Version ist dann endgültig weg. Die Antwort bleibt und zeigt eine andere Version.',

  // The reasoning ledger: what the model thought and which tools it used
  'activity.thinking': 'Denkt nach',
  'activity.thought': 'Nachgedacht',
  'activity.thoughtFor': '{duration} lang',
  'activity.words': { one: '{count} Wort', other: '{count} Wörter' },
  'activity.tools': { one: '{count} Werkzeug', other: '{count} Werkzeuge' },
  'activity.searches': { one: '{count} Suche', other: '{count} Suchen' },
  'activity.waiting': 'Warte auf das Modell … {seconds} s',
  'activity.searchingWeb': 'Sucht im Web',
  'activity.searchingFor': 'Sucht: {query}',
  'activity.searchingSources': 'Sucht Quellen',
  'activity.searchFailed': 'Suche fehlgeschlagen',
  'activity.tool.fetch': 'Liest eine Seite',
  'activity.tool.memoryRead': 'Schaut ins Gedächtnis',
  'activity.tool.memorySave': 'Merkt sich etwas',
  'activity.tool.memoryForget': 'Vergisst eine Notiz',
  'activity.notFound': 'Nicht gefunden',
  'activity.notSaved': 'Nicht gespeichert',
  'activity.searching': 'Sucht',
  'activity.running': 'Läuft',
  'activity.notApplied': 'Nicht übernommen',
  'activity.stopped': 'Gestoppt',
  'activity.failed': 'Fehlgeschlagen',
  'activity.noResults': 'Keine Ergebnisse',
  'activity.copyThinking': 'Gedanken kopieren',
  'activity.turnFailed': 'Der Durchgang ist abgebrochen, bevor dieser Aufruf lief',
  'sources.found': { one: '{count} Quelle gefunden', other: '{count} Quellen gefunden' },
  'sources.looking': 'Sucht Quellen …',
  'sources.lookingFor': 'Sucht Quellen: {query} …',
  'sources.untitled': 'Quelle ohne Titel',

  // Ends with {title} in every language: the renderer knows a citation by the words before it.
  'sources.citation': 'Quelle {number}: {title}',

  // How a reply ended
  'ending.stopped': 'Vor dem Ende gestoppt.',
  'ending.failed': 'Vor dem Ende durch einen Fehler abgebrochen.',
  'ending.interrupted': 'Abgebrochen: Die Seite wurde geschlossen, während sie entstand.',
  'ending.nothing.stopped': 'Gestoppt, bevor die Antwort begann.',
  'ending.nothing.failed': 'Diese Antwort ist fehlgeschlagen.',
  'ending.nothing.interrupted': 'Die Seite wurde geschlossen, bevor die Antwort begann.',
  'ending.length': 'An der Längengrenze gestoppt.',
  'ending.announce.stopped': 'Antwort gestoppt',
  'ending.announce.failed': 'Antwort fehlgeschlagen',
  'ending.announce.length': 'Antwort an der Längengrenze gestoppt',
  'ending.announce.finished': 'Antwort fertig',

  // The line under a reply: model, speed, cost
  'colophon.firstWord': 'erstes Wort nach {time}',
  'colophon.tokens': { one: '{count} Token', other: '{count} Tokens' },
  'colophon.speed': '{rate} Tokens/s',
  'colophon.under': 'unter {amount}',

  // Attachments
  'attachments.openLarger': 'Größer öffnen',
  'attachments.image': 'Bild',
  'attachments.audio': 'Audio',
  'attachments.audioAttached': 'Audio angehängt',
  'attachments.pages': { one: '{count} Seite', other: '{count} Seiten' },
  'attachments.attachment': 'Anhang',
  'attachments.remove': 'Entfernen',
  'attachments.removeNamed': '{name} entfernen',
  'attachments.attachedAudio': 'Angehängt (mp3/wav)',
  'attachments.attachedPdf': 'Angehängt (in deinem Browser gelesen)',

  // Developer views (Settings › Appearance › Developer)
  'debug.request': 'Debug-Anfrage',
  'debug.toolActivity': 'Werkzeugaktivität',
  'debug.overview': 'Überblick',
  'debug.toolDefinitions': 'Werkzeugdefinitionen',
  'debug.plugins': 'Plugins',
  'debug.messages': 'Nachrichten',
  'debug.noContent': 'Kein sichtbarer Inhalt',
  'debug.toolCalls': 'Werkzeugaufrufe: {names}',
  'debug.rawJson': 'Roh-JSON der Anfrage',
  'debug.copyRequest': 'Anfrage kopieren',
  'toolLog.heading': 'Werkzeugaufrufe ({count})',
  'toolLog.input': 'Eingabe',
  'toolLog.output': 'Ausgabe',
  'toolLog.copy.input': 'Eingabe-JSON kopieren',
  'toolLog.copy.output': 'Ausgabe-JSON kopieren',
  'toolLog.metadata': 'Metadaten',
  'toolLog.category.search': 'Suche',
  'toolLog.category.tutor': 'Tutor',
  'toolLog.category.planning': 'Planung',
  'toolLog.category.system': 'System',
  'toolLog.category.other': 'Sonstiges',
  'toolLog.searchResults': {
    one: 'Websuche ({count} Ergebnis)',
    other: 'Websuche ({count} Ergebnisse)',
  },
  'toolLog.searchError': 'Fehler bei der Websuche',
  'toolLog.completed': 'Erledigt',
  'toolLog.pending': 'Ausstehend',
  'toolLog.round': 'Runde {round}',
  'toolLog.cached': 'Ergebnis aus dem Cache',
  'toolLog.usedInReply': 'In der Antwort verwendet',
  'toolLog.learnerUpdated': 'Lernstand aktualisiert',
  'toolLog.planUpdated': 'Plan aktualisiert',

  // Models
  'models.caps.reasoning': 'Denkt vor dem Antworten nach',
  'models.caps.vision': 'Liest Bilder',
  'models.caps.audio': 'Hört Audio',
  'models.caps.image': 'Erstellt Bilder',
  'models.caps.zdr': 'Speichert keine deiner Daten (Zero Data Retention)',
  'models.contextHint': 'Wie viel es auf einmal lesen kann',
  'models.contextTokens': { one: '{count} Token', other: '{count} Tokens' },
  'models.curated.claudeHaiku': 'Schnell, günstig und schreibt stark; neue Chats beginnen hier',
  'models.curated.gptLuna': 'Schnell, günstig und knapp; gut mit Werkzeugen',
  'models.curated.tutor':
    'Schnell, günstig und ein warmherziger, geduldiger Lehrer; der Standard-Tutor',
  'models.curated.gptSol': 'OpenAIs Hauptmodell, für schwierigeres Denken und Schreiben',
  'models.curated.claudeOpus': 'Sorgfältige, lange Arbeit; Anthropics empfohlener Standard',
  'models.curated.claudeFable': 'Das stärkste Claude, für die schwersten Probleme; das teuerste',
  'models.curated.geminiFlash': 'Googles neuestes; schnell bei Bildern und sehr langen Dokumenten',
  'models.curated.kimi': 'Offene Gewichte, stark bei Code, preiswert',
  'models.curated.grok': 'Das neueste Grok, für lange Arbeit mit Werkzeugen',
  'models.curated.image': 'Erstellt und bearbeitet Bilder',

  // Settings › Models
  'models.default.follows': 'Neue Chats nutzen das Modell, das du zuletzt gewählt hast.',
  'models.default.startsHere': 'Neue Chats beginnen hier, bis du in einem Chat ein Modell wählst.',
  'models.default.reset': 'Zurücksetzen',
  'models.default.refresh': 'Liste aktualisieren',
  'models.favorites.hint': 'Die Modelle, die die Auswahl neben ihren Empfehlungen anbietet.',
  'models.favorites.empty': 'Noch keine Favoriten.',
  'models.favorites.add': 'Modell hinzufügen',
  'models.zdr': 'Nur Zero Data Retention',
  'models.zdrHint': 'Nur Modelle von Anbietern zeigen, die deine Prompts nicht speichern.',
  'models.familyMoved':
    '{family} ist jetzt {model}: Neue Chats nutzen es, laufende Chats behalten ihres.',
  'models.defaultMissing':
    '{model} wird von deinen Anbietern nicht angeboten, deshalb beginnen neue Chats mit {fallback}.',
  'models.hiddenZdr':
    'Modelle von {server} sind ausgeblendet: Zero Data Retention ist an, und nur OpenRouter kann sie zusichern.',
  'models.unavailableKey': 'Modelle von {server} nicht verfügbar: Der Schlüssel wurde abgelehnt.',
  'models.unavailableLimited': 'Modelle von {server} nicht verfügbar: zu viele Anfragen.',
  'models.unreachable': '{server} ist nicht erreichbar.',
  'models.unavailable': 'Modelle von {server} sind gerade nicht verfügbar.',
  'pricing.free': 'Kostenlos',
  'pricing.in': 'Eingabe {rate}/M',
  'pricing.out': 'Ausgabe {rate}/M',
  'pricing.inFree': 'Eingabe kostenlos',
  'pricing.outFree': 'Ausgabe kostenlos',

  // The model picker
  'picker.choose': 'Modell wählen',
  'picker.search': 'Modelle suchen',
  'picker.results': 'Ergebnisse',
  'picker.recommended': 'Empfohlen',
  'picker.favorites': 'Deine Favoriten',
  'picker.servers': 'Deine Server',
  'picker.unavailableZdr': '{model}: nicht verfügbar, solange Zero Data Retention an ist',
  'picker.empty': 'Noch keine Modelle. Verbinde einen Anbieter, um aus seinen Modellen zu wählen.',
  'picker.noMatch': 'Kein Modell passt dazu.',
  'picker.noneFound': 'Keine Modelle gefunden',
  'picker.inUse': ', in Verwendung',
  'picker.removeFavorite': 'Aus den Favoriten entfernen',
  'picker.removeFavoriteNamed': '{model} aus den Favoriten entfernen',
  'regenerate.with': 'Nochmal versuchen mit',
  'regenerate.withAnother': 'Mit einem anderen Modell nochmal versuchen',
  'regenerate.sameModel': 'gleiches Modell',
  'sidebar.newChat': 'Neuer Chat',
  'sidebar.createFolder': 'Ordner erstellen',
  'sidebar.folders': 'Ordner',
  'sidebar.search': 'Chats durchsuchen',
  'sidebar.noMatch': 'Kein Chat passt zu „{query}“.',
  'sidebar.today': 'Heute',
  'sidebar.previous7': 'Letzte 7 Tage',
  'sidebar.previous30': 'Letzte 30 Tage',
  'sidebar.earlier': 'Früher',
  'chatRow.name': 'Name des Chats',
  'chatRow.tutoring': 'Lerneinheit:',
  'chatRow.rename': 'Umbenennen',
  'chatRow.renameNamed': '„{title}“ umbenennen',
  'chatRow.move': 'In Ordner verschieben',
  'chatRow.moveNamed': '„{title}“ in einen Ordner verschieben',
  'chatRow.deleteNamed': '„{title}“ löschen',
  'chatRow.actionsFor': 'Aktionen für {title}',
  'chatRow.deleteTitle': 'Diesen Chat löschen?',
  'chatRow.deleteBody': '„{title}“ und seine Nachrichten sind dann endgültig weg.',
  'folder.namePlaceholder': 'Ordnername',
  'folder.newName': 'Name des neuen Ordners',
  'folder.actionsFor': 'Ordneraktionen für {name}',
  'folder.rename': 'Ordner umbenennen',
  'folder.delete': 'Ordner löschen',
  'folder.deleteTitle': 'Diesen Ordner löschen?',
  'folder.deleteBodyChats': 'Die Chats in „{name}“ bleiben; sie wandern aus dem Ordner.',
  'folder.deleteBodyEmpty': '„{name}“ ist leer.',
  'folder.count': { one: '{count} Chat', other: '{count} Chats' },
  'folder.newDefault': 'Neuer Ordner',
  'move.label': '{title} in einen Ordner verschieben',
  'move.title': '„{title}“ verschieben',
  'move.noFolder': 'Kein Ordner',
  'move.newFolder': 'Neuer Ordner …',
  'move.heading': 'Verschieben nach',

  // Header, drawer and pages
  'nav.memory': 'Gedächtnis',
  'nav.settings': 'Einstellungen',
  'nav.learningHub': 'Lernpfad',
  'drawer.chats': 'Chats',
  'drawer.open': 'Chats öffnen',
  'header.toggleSidebar': 'Seitenleiste ein- oder ausblenden',
  'header.expandSidebar': 'Seitenleiste ausklappen',
  'header.collapseSidebar': 'Seitenleiste einklappen',
  'header.openMemory': 'Gedächtnis öffnen',
  'header.openSettings': 'Einstellungen öffnen',
  'header.tutorModel': 'Tutor-Modell: {model}. Änderbar in den Einstellungen.',
  'lightbox.label': 'Bildansicht',
  'lightbox.download': 'Herunterladen',
  'lightbox.previous': 'Vorheriges',
  'lightbox.next': 'Nächstes',

  // Settings › Chat
  'settings.chat.systemHint':
    'Was jeder neue Chat vor deiner ersten Nachricht gesagt bekommt. Eine Lerneinheit fügt ihre eigenen Anweisungen hinzu.',
  'settings.chat.savedPrompts': 'Gespeicherte Prompts',
  'settings.chat.savedPrompt': 'Gespeicherter Prompt',
  'settings.chat.namePrompt': 'Diesen Prompt benennen',
  'settings.chat.newName': 'Neuer Name',
  'settings.chat.newNameLabel': 'Neuer Name für diesen Prompt',
  'settings.chat.deletePrompt': '„{name}“ löschen?',
  'settings.chat.choosePrompt': 'Gespeicherten Prompt wählen …',
  'settings.chat.use': 'Verwenden',
  'settings.chat.saveCurrent': 'Aktuellen speichern',
  'settings.chat.renamePrompt': 'Prompt umbenennen',
  'settings.chat.deletePromptButton': 'Prompt löschen',
  'settings.chat.timestamps': 'Zeitstempel für Nachrichten',
  'settings.chat.timestampsHint':
    'Sagt dem Modell, wann jede Nachricht gesendet wurde, damit es das Datum kennt. Macht jede Nachricht etwas teurer.',
  'settings.chat.modelDefault': 'Standard des Modells',
  'settings.chat.effortHint':
    'Wie gründlich neue Chats standardmäßig nachdenken. Pro Chat änderbar im Eingabefeld; ein Modell ohne diese Stufe nimmt die nächstliegende.',
  'settings.chat.budget': 'Denkbudget',
  'settings.chat.automatic': 'Automatisch',
  'settings.chat.budgetInvalid':
    'Gib eine ganze Zahl über 0 ein oder lass das Feld leer. Nicht gespeichert.',
  'settings.chat.budgetHint':
    'Wie viel das Modell höchstens nachdenken darf, in Tokens (etwa drei Viertel eines Wortes pro Token), bei Modellen, die eine Grenze annehmen. Leer lassen, damit das Modell selbst entscheidet.',
  'settings.memory.use': 'Gedächtnis verwenden',
  'settings.memory.useHint':
    'Das Modell liest dein Gedächtnis bei jeder Nachricht und notiert, was es über dich erfährt. Was es liest, geht an den Anbieter des jeweiligen Chats. Um einen Chat herauszuhalten, schalte das Gedächtnis mit dem Lesezeichen in seinem Eingabefeld aus.',
  'settings.memory.sensitive': 'Sensible Themen einbeziehen',
  'settings.memory.sensitiveHint':
    'Das Modell darf Details wie gesundheitliche Beschwerden oder religiöse Überzeugungen notieren, ohne dass du darum bittest. Das Gedächtnis bleibt nur in diesem Browser und geht wie alles andere an den Anbieter des Chats. Ist es aus, speichert es solche Details nur, wenn du darum bittest.',
  'settings.memory.open': 'Gedächtnis öffnen',

  // Settings: pages and sections
  'settings.tab.connections': 'Verbindungen',
  'settings.tab.models': 'Modelle',
  'settings.tab.chat': 'Chat',
  'settings.tab.tutor': 'Tutor',
  'settings.tab.appearance': 'Darstellung',
  'settings.tab.data': 'Daten',
  'settings.section.providers': 'Anbieter',
  'settings.section.endpoints': 'Deine Server',
  'settings.section.web-search': 'Websuche',
  'settings.section.default-model': 'Standardmodell',
  'settings.section.favorites': 'Favoriten',
  'settings.section.privacy': 'Datenschutz',
  'settings.section.general': 'Systemprompt',
  'settings.section.memory': 'Gedächtnis',
  'settings.section.reasoning': 'Nachdenken',
  'settings.section.tutor': 'Tutor',
  'settings.section.theme': 'Design',
  'settings.section.language': 'Sprache',
  'settings.section.display': 'Anzeige',
  'settings.section.developer': 'Entwickler',
  'settings.section.data': 'Import und Export',

  // What each section shows and is about, so search finds it by the words on
  // screen as well as by its title. English words always find it too.
  'settings.keywords.providers':
    'openrouter schlüssel anthropic schlüssel api anbieter verbinden ersetzen entfernen workspace',
  'settings.keywords.endpoints':
    'dein eigener server lokal ollama lm studio llama.cpp vllm serveradresse url eigener endpunkt openai kompatibel schlüssel api modellnamen verbindung testen werkzeuge bilder denktiefe antwortkosten prompt caching chattitel entfernen selbst gehostet',
  'settings.keywords.web-search': 'tavily schlüssel suche web openrouter suche jina reader',
  'settings.keywords.default-model': 'neuer chat standardmodell zurücksetzen liste aktualisieren',
  'settings.keywords.favorites': 'favoriten stern modelle entfernen auswahl',
  'settings.keywords.privacy': 'nur zero data retention zdr datenschutz anbieter prompts',
  'settings.keywords.general':
    'systemprompt gespeicherte prompts vorlage aktuellen speichern umbenennen löschen zeitstempel datum uhrzeit',
  'settings.keywords.memory':
    'gedächtnis verwenden merken vergessen notizen über dich lernen sensible themen privat gesundheit gedächtnis öffnen lesezeichen',
  'settings.keywords.reasoning': 'denktiefe denkbudget nachdenken tokens stufe modell standard',
  'settings.keywords.tutor':
    'tutor modus immer lernen dem tutor folgen scrollen tutor modell lernplan lernen unterricht',
  'settings.keywords.theme': 'design farbe farbschema hell dunkel automatisch system',
  'settings.keywords.language':
    'sprache übersetzung automatisch english italiano français español deutsch português ελληνικά',
  'settings.keywords.display':
    'gedanken standardmäßig anzeigen antwortdetails anzeigen modell tempo kosten statistik anzeige',
  'settings.keywords.developer':
    'entwickler werkzeugaufrufe protokoll anfrageansicht roh json jede antwort debug prüfen argumente ergebnis',
  'settings.keywords.data': 'import export chats und einstellungen json datei backup daten',
  'settings.tutorSummary': 'Lerneinheiten und ihr Modell',
  'settings.search': 'Einstellungen durchsuchen',
  'settings.clearSearch': 'Suche löschen',
  'settings.noMatch': 'Keine Einstellung passt zu „{query}“.',
  'settings.pages': 'Seiten der Einstellungen',
  'settings.navigation': 'Navigation der Einstellungen',
  'settings.close': 'Einstellungen schließen',
  'settings.back': 'Zurück zu den Einstellungen',
  'settings.saveFailed':
    'Die Einstellungen konnten nicht gespeichert werden. Versuch die Änderung noch einmal.',

  // Settings › Connections
  'providers.rejected': 'Der Anbieter hat diesen Schlüssel abgelehnt. Füge einen neuen ein.',
  'providers.usingKey': 'Nutzt deinen Schlüssel',
  'providers.readyNoKey': 'Bereit (kein Schlüssel nötig)',
  'providers.needsAddress': 'Braucht eine Adresse',
  'providers.needsKey': 'Braucht einen Schlüssel',
  'providers.keysStay': 'Schlüssel bleiben in diesem Browser und werden nie exportiert.',
  'providers.workspace': 'Workspace-ID (optional)',
  'providers.workspaceHint':
    'Nur nötig, wenn Claude meldet, dass dein Schlüssel einen Workspace braucht. Kopiere die ID unter Workspaces in der Claude Console; sie beginnt mit wrkspc_.',
  'providers.workspaceInvalid': 'Eine Workspace-ID enthält nur Buchstaben, Ziffern, _ und -.',
  'apiKey.saved': '{key} gespeichert. Zum Ersetzen einfügen',
  'apiKey.replace': 'Ersetzen',
  'apiKey.removeNamed': '{label} entfernen',
  'apiKey.removeTitle': '{label} entfernen?',
  'apiKey.removeBody':
    'Er wird aus diesem Browser gelöscht. Um ihn später zu nutzen, füge ihn wieder ein.',
  'servers.removeTitle': '{name} entfernen?',
  'servers.removeBody':
    'Adresse, Schlüssel und Einstellungen verschwinden. Chats, die seine Modelle genutzt haben, behalten ihre Nachrichten.',
  'servers.notSaved': 'Nicht gespeichert.',
  'servers.addressHint': 'Die Adresse des Servers, z. B. http://localhost:11434/v1 für Ollama.',
  'servers.modelNames': 'Modellnamen',
  'servers.modelNamesHint':
    'Durch Kommas getrennt. Was dieser Server unter /models auflistet, kommt automatisch dazu.',
  'servers.keyOptional': 'Schlüssel (optional)',
  'servers.keyPlaceholder': 'Die meisten lokalen Server brauchen keinen',
  'servers.supports': 'Was dieser Server unterstützt',
  'servers.supportsHint':
    'Nichts, was nicht angehakt ist, wird je gesendet. Ein strenger Server lehnt die ganze Anfrage wegen eines einzigen unbekannten Felds ab.',
  'servers.titles': 'Chattitel',
  'servers.titlesChatModel': 'Das Modell des Chats verwenden',
  'servers.titlesOff': 'Keine Titel erzeugen',
  'servers.remove': 'Diesen Server entfernen',
  'servers.name': 'Servername',
  'servers.namePlaceholder': 'Name, z. B. Ollama',
  'servers.add': 'Hinzufügen',
  'servers.addHint':
    'Funktioniert mit Ollama, LM Studio, llama.cpp und vLLM. Die Funktionen sind zuerst aus; du schaltest sie ein.',
  'servers.noAddress': 'keine Adresse',
  'webSearch.hint':
    'Die eingebaute Suche des Modellanbieters braucht keinen weiteren Schlüssel und ist voreingestellt. Mit einem OpenRouter-Schlüssel kannst du im Eingabefeld auch die OpenRouter-Suche wählen: Das Modell sucht, wenn nötig, über dein OpenRouter-Guthaben, und Seiten werden mit Jina Reader gelesen. Deine Suchen gehen an den Suchpartner von OpenRouter, die Seitenadressen an Jina.',
  'webSearch.keyLabel': '{provider}-Schlüssel',
  'capability.tools': 'Werkzeuge',
  'capability.toolsHint': 'Das Modell darf Werkzeuge nutzen, etwa Suche und Gedächtnis.',
  'capability.vision': 'Bilder',
  'capability.visionHint': 'Bilder senden.',
  'capability.reasoningHint': 'Eine Denkstufe senden.',
  'capability.streamUsage': 'Antwortkosten',
  'capability.streamUsageHint': 'Melden, was jede Antwort gekostet hat.',
  'capability.parallelToolCalls': 'Mehrere Werkzeuge gleichzeitig',
  'capability.parallelToolCallsHint': 'Das Modell darf in einem Schritt mehrere Werkzeuge nutzen.',
  'capability.promptCaching': 'Prompt-Caching',
  'capability.promptCachingHint': 'Lange Prompts wiederverwenden, um Kosten zu sparen.',
  'probe.title': 'Verbindung testen',
  'probe.test': 'Verbindung testen',
  'probe.testAgain': 'Erneut testen',
  'probe.modelToTest': 'Modell für den Test',
  'probe.hint':
    'Schickt ein paar winzige Anfragen, um zu sehen, welche Felder dieser Server annimmt, damit die Kästchen unten nach einer Antwort gesetzt werden statt nach Gefühl.',
  'probe.hintModel':
    'Schickt ein paar winzige Anfragen an {model}, um zu sehen, welche Felder dieser Server annimmt, damit die Kästchen unten nach einer Antwort gesetzt werden statt nach Gefühl.',
  'probe.step.models': 'Modelle werden aufgelistet …',
  'probe.step.chat': 'Erste Nachricht wird gesendet …',
  'probe.step.tools': 'Werkzeuge werden geprüft …',
  'probe.step.parallelToolCalls': 'Mehrere Werkzeuge gleichzeitig werden geprüft …',
  'probe.step.reasoning': 'Denktiefe wird geprüft …',
  'probe.step.vision': 'Bilder werden geprüft …',
  'probe.step.streamUsage': 'Antwortkosten werden geprüft …',
  'probe.step.promptCaching': 'Prompt-Caching wird geprüft …',
  'probe.verdict.ok': 'Angenommen',
  'probe.verdict.no': 'Nicht unterstützt',
  'probe.verdict.unknown': 'Keine Antwort',
  'probe.verdict.skipped': 'Übersprungen',
  'probe.reachable': 'Erreichbar.',
  'probe.noModels': 'Er listet keine Modelle, also werden nur die eingetippten verwendet.',
  'probe.listsModels': { one: 'Er listet {count} Modell.', other: 'Er listet {count} Modelle.' },
  'probe.notApi': 'Unter {address} hat etwas geantwortet, aber kein OpenAI-kompatibler Server.',
  'probe.notApiHint':
    'Prüf die Adresse. Meist ist es die Wurzel des Servers mit /v1 dahinter, z. B. http://localhost:11434/v1 für Ollama.',
  'probe.noRoute': 'Hier gibt es kein /models, also werden nur die eingetippten verwendet.',
  'probe.unauthorized': 'Erreichbar, aber er will einen Schlüssel und hat deinen nicht angenommen.',
  'probe.unreachable': '{address} ist nicht erreichbar.',
  'probe.unreachableHint':
    'Prüf, ob der Server läuft und Anfragen von {origin} erlaubt. Bei Ollama muss OLLAMA_ORIGINS diese Herkunft enthalten, bei LM Studio muss CORS in den Servereinstellungen an sein.',
  'probe.listFailed': 'Erreichbar, aber das Auflisten der Modelle ist fehlgeschlagen.',
  'probe.replied': '{model} hat nach {time} geantwortet.',
  'probe.noAnswer': '{model} hat nicht geantwortet.',
  'probe.notTested': '{model} wurde nicht getestet.',
  'probe.noMessage': 'Es wurde keine Nachricht gesendet.',
  'probe.apply': 'Auf die Kästchen unten übertragen',
  'probe.applyHint': 'Schaltet ein, was angenommen, und aus, was abgelehnt wurde.',
  'probe.alreadyMatch':
    'Die Kästchen unten entsprechen schon dem, was dieser Server angenommen hat.',

  // Testing a server (the details under each line)
  'probe.canceled': 'Der Verbindungstest wurde abgebrochen.',
  'probe.timeout': 'Keine Antwort innerhalb von {seconds} s.',
  'probe.failedEarly': 'Die Anfrage ist fehlgeschlagen, bevor der Server geantwortet hat.',
  'probe.detail.unreachable': 'Der Server war nicht erreichbar.',
  'probe.detail.notApi': 'Unter dieser Adresse hat kein OpenAI-kompatibler Server geantwortet.',
  'probe.detail.noModel':
    'Kein Modell zum Testen. Gib oben einen Modellnamen ein oder sieh nach, was der Server auflistet.',
  'probe.detail.notStream':
    'Hat geantwortet, aber nicht als Token-Stream. Dialogia zeigt jede Antwort, während sie entsteht.',
  'probe.detail.firstFailed': 'Übersprungen, weil die erste Nachricht nicht durchkam.',
  'probe.detail.needsTools': 'Braucht Werkzeugaufrufe.',
  'probe.detail.noUsage':
    'Der Server hat das Feld angenommen, aber keinen Verbrauch zurückgeschickt.',

  // Settings › Data
  'data.label': 'Chats und Einstellungen',
  'data.hint': 'Alles in einer Datei. Deine Schlüssel sind nie dabei.',
  'data.import': 'Importieren',
  'data.export': 'Exportieren',
  'data.thisFile': 'diese Datei',
  'data.importTitle': '{name} importieren?',
  'data.importBody':
    'Chats aus der Datei ersetzen Chats hier mit derselben ID, und ihre Einstellungen ersetzen deine: Server, Favoriten und Chat-Voreinstellungen. Alles andere bleibt. Exportiere vorher, falls du zurückwillst.',
  'data.exportFailed': 'Der Export ist fehlgeschlagen. Versuch es noch einmal.',
  'data.importFailed': 'Der Import ist fehlgeschlagen. Versuch es noch einmal.',
  'data.nothing': 'Diese Datei enthält keine Chats oder Einstellungen von Dialogia.',
  'data.notJson': 'Diese Datei ist kein Dialogia-Export: Sie ist kein gültiges JSON.',
  'data.newerVersion':
    'Dieses Backup stammt aus einer neueren Version von Dialogia. Lade neu, um die App zu aktualisieren, und importiere es dann noch einmal.',
  'data.noneRead': 'Keiner der Chats in dieser Datei ließ sich lesen.',
  'data.imported.chats': { one: '{count} Chat importiert.', other: '{count} Chats importiert.' },
  'data.imported.settings': 'Deine Einstellungen wurden importiert.',
  'data.skipped.some': {
    one: '{count} ließ sich nicht lesen.',
    other: '{count} ließen sich nicht lesen.',
  },
  'data.skipped.chats': {
    one: '{count} Chat ließ sich nicht lesen.',
    other: '{count} Chats ließen sich nicht lesen.',
  },

  // Settings › Appearance
  'appearance.scheme': 'Farbschema',
  'appearance.schemeHint': 'Hell, dunkel oder wie dein System.',
  'appearance.light': 'Hell',
  'appearance.dark': 'Dunkel',
  'appearance.auto': 'Auto',
  'appearance.language': 'Sprache',
  'appearance.languageHint':
    'Die Wörter der App. Antworten folgen der Sprache, in der du schreibst.',
  'appearance.languageAuto': 'Automatisch ({language})',
  'appearance.showThinking': 'Gedanken immer anzeigen',
  'appearance.showThinkingHint':
    'Zeigt bei jeder Antwort, was das Modell gedacht hat, auch bei früheren.',
  'appearance.showStats': 'Antwortdetails anzeigen',
  'appearance.showStatsHint':
    'Eine Zeile unter jeder Antwort: welches Modell sie geschrieben hat, wie schnell und was sie gekostet hat.',
  'appearance.toolLog': 'Protokoll der Werkzeugaufrufe',
  'appearance.toolLogHint':
    'Über jeder Antwort, die Werkzeuge genutzt hat, jeder Aufruf mit seinen Argumenten und seinem Ergebnis.',
  'appearance.requestView': 'Anfrageansicht',
  'appearance.requestViewHint':
    'Über jeder Antwort die Anfrage, aus der sie entstand. Ab jetzt aufgezeichnet und bis zum Neuladen behalten.',
  'appearance.rawJson': 'Roh-JSON einbeziehen',
  'appearance.rawJsonHint': 'Die Anfrage genau so, wie sie gesendet wurde, bereit zum Kopieren.',

  // Code blocks and diagrams in replies
  'code.copy': 'Code kopieren',
  'code.wrap': 'Umbrechen',
  'code.unwrap': 'Nicht umbrechen',
  'code.enableWrap': 'Lange Zeilen umbrechen',
  'code.disableWrap': 'Lange Zeilen nicht umbrechen',
  'code.expand': 'Ausklappen',
  'code.collapse': 'Einklappen',
  'code.diagramFailed': 'Dieses Diagramm ließ sich nicht zeichnen.',

  // Memory
  'memory.close': 'Gedächtnis schließen',
  'memory.folders': 'Ordner im Gedächtnis',
  'memory.folder.about': 'Über dich',
  'memory.folder.aboutDescription': 'Wer du bist, wo du lebst, wie du Antworten magst',
  'memory.folder.learning': 'Lernen',
  'memory.folder.learningDescription':
    'Was du mit dem Tutor gelernt hast und wie du am besten lernst',
  'memory.aboutEmpty':
    'Hier landet, was das Modell über dich erfährt. Du kannst auch selbst eine Notiz hinzufügen.',
  'memory.folderEmpty': 'Noch keine Notizen in diesem Ordner.',
  'memory.forgotten': 'Kürzlich vergessen',
  'memory.forgottenHint':
    'Notizen, die du oder das Modell losgelassen habt. Jede wartet hier 30 Tage, dann ist sie endgültig weg.',
  'memory.forgottenFrom': 'Aus {folder} · vergessen am {date}',
  'memory.aFolder': 'einem Ordner',
  'memory.restore': 'Wiederherstellen',
  'memory.restoreNamed': 'Wiederherstellen: {note}',
  'memory.forgottenEmpty': 'Zuletzt nichts vergessen.',
  'memory.editHint': 'Enter zum Speichern · Esc zum Abbrechen',
  'memory.editHintTouch': 'Tippe auf Fertig, um zu speichern',
  'memory.byModel': 'Vom Modell geschrieben',
  'memory.editedByYou': 'Von dir bearbeitet',
  'memory.byYou': 'Von dir geschrieben',
  'memory.fromChat': 'aus {chat}',
  'memory.note': 'Notiz',
  'memory.forget': 'Vergessen',
  'memory.forgetNamed': 'Vergessen: {note}',
  'memory.newNote': 'Neue Notiz',
  'memory.newNotePlaceholder': 'Etwas, das das Modell wissen sollte',
  'memory.addNote': 'Notiz hinzufügen',
  'memory.folderHolds': 'Was in {folder} steht',
  'memory.folderLineHint':
    'Das Modell liest zuerst diese Zeile und öffnet den Ordner, wenn er passt.',
  'memory.folderLinePlaceholder': 'Beschreibe, was in diesem Ordner steht',
  'memory.consolidating': 'Wird aufgeräumt …',
  'memory.consolidate': 'Aufräumen',
  'memory.consolidateHint': 'Räumt das Gedächtnis mit {model} auf',
  'memory.addFirst': 'Füge zuerst eine Notiz hinzu',
  'memory.newToday': {
    one: '{count} neu seit dem Aufräumen heute',
    other: '{count} neu seit dem Aufräumen heute',
  },
  'memory.newSince': { one: '{count} neu seit {date}', other: '{count} neu seit {date}' },
  'memory.upToDate': 'Aufgeräumt',
  'memory.reportLabel': 'Was das Aufräumen geändert hat',
  'memory.consolidatedOn': 'Aufgeräumt am {date}',
  'memory.nothingChanged': 'Nichts geändert',
  'memory.alreadyTidy': 'Schon aufgeräumt',
  'memory.undo': 'Rückgängig',
  'memory.openInMemory': 'Im Gedächtnis öffnen',
  'memory.nothingNeeded': 'Es gab nichts zu ändern.',
  'memory.skippedSome': {
    one: 'Eine vorgeschlagene Änderung ließ sich nicht umsetzen und wurde übersprungen.',
    other: '{count} vorgeschlagene Änderungen ließen sich nicht umsetzen und wurden übersprungen.',
  },
  'memory.skippedAll': {
    one: 'Das Modell hat eine Änderung vorgeschlagen, aber sie ließ sich nicht umsetzen.',
    other: 'Das Modell hat {count} Änderungen vorgeschlagen, aber keine ließ sich umsetzen.',
  },
  'memory.writesLabel': 'Änderungen am Gedächtnis',
  'memory.takenBack': 'Zurückgenommen:',
  'memory.write.added': 'Gemerkt',
  'memory.write.updated': 'Aktualisiert',
  'memory.write.forgotten': 'Vergessen',
  'memory.was': '(vorher: {text})',
  'memory.undoNamed': 'Rückgängig: {note}',
  'memory.records': 'Lerneinheiten',
  'memory.recordsHint':
    'Lerneinheiten erscheinen hier von selbst, ihr Fortschritt direkt aus dem Chat gelesen.',
  'memory.record.finished': 'Abgeschlossen am {date}',
  'memory.record.progress': '{done} von {count} erledigt · zuletzt gelernt am {date}',

  // Notices: the toasts that say something went right or wrong
  'notice.invalidKey':
    'Dieser Schlüssel wurde abgelehnt. Prüf ihn unter Einstellungen › Verbindungen.',
  'notice.expiredKey':
    'Dieser Schlüssel ist abgelaufen. Füge unter Einstellungen › Verbindungen einen neuen hinzu.',
  'notice.rateLimited':
    'Der Anbieter bremst die Anfragen. Warte einen Moment und versuch es dann noch einmal.',
  'notice.missingSearchKey':
    'Diese Suche braucht einen Schlüssel. Füge ihn unter Einstellungen › Verbindungen hinzu.',
  'notice.searchUnavailable':
    'Die Websuche ist in diesem Chat nicht verfügbar; es wird ohne sie geantwortet.',
  'notice.unknownEndpoint':
    'Dieser Chat nutzt einen Server, den es nicht mehr gibt. Füge ihn unter Einstellungen › Verbindungen wieder hinzu oder wähle ein anderes Modell.',
  'notice.exportedChats': 'Deine Chats wurden exportiert.',
  'notice.planApplyFailed': 'Der Plan konnte nicht übernommen werden. Versuch es noch einmal.',
  'notice.planChangesFailed':
    'Dein Vorschlag konnte nicht gesendet werden. Versuch es noch einmal.',
  'notice.copyFailed': 'Kopieren nicht möglich: Der Browser hat die Zwischenablage blockiert.',
  'notice.replyInOtherTab':
    'Ein anderer Tab schreibt gerade eine Antwort in diesem Chat. Sende erst, wenn er fertig ist, damit beide Tabs denselben Chat zeigen.',
  'notice.saveFailed':
    'Die Antwort konnte nicht in diesem Browser gespeichert werden. Sie ist jetzt zu sehen, könnte aber nach dem Neuladen abgeschnitten sein.',
  'notice.consolidationFailed':
    'Das Gedächtnis konnte nicht aufgeräumt werden. Nichts wurde geändert; versuch es gleich noch einmal.',
  'notice.consolidationUnreadable':
    'Dieses Modell konnte keine Änderungen vorschlagen. Nichts wurde geändert. Versuch ein anderes Modell.',
  'notice.consolidationUndone': 'Aufräumen rückgängig gemacht.',
  'notice.consolidationStale':
    'Das Gedächtnis hat sich während des Aufräumens geändert, deshalb wurde nichts geändert. Räum noch einmal auf.',
  'notice.consolidationPartlyUndone':
    'Das Aufräumen wurde rückgängig gemacht, bis auf das, was sich seitdem geändert hat; das blieb, wie es ist.',
  'notice.memoryChangedSince':
    'Diese Notiz hat sich seitdem geändert. Bearbeite sie auf der Seite Gedächtnis.',
  'notice.memoryAlreadyForgotten':
    'Diese Notiz ist schon vergessen. Sie wartet unter Kürzlich vergessen auf der Seite Gedächtnis.',
  'notice.consolidationNoModel':
    'Verbinde unter Einstellungen › Verbindungen ein Modell, um das Gedächtnis aufzuräumen.',
  'notice.replacedReplyChangedMemory':
    'Die ersetzte Antwort hatte dein Gedächtnis geändert. Diese Notizen bleiben, wie sie sind; sieh sie dir auf der Seite Gedächtnis an.',
  'notice.unreachable':
    'Der Anbieter ist nicht erreichbar. Prüf deine Verbindung oder ob dein lokaler Server läuft.',
  'notice.timedOut': 'Die Anfrage hat zu lange gedauert. Versuch es noch einmal.',
  'notice.unknownError': 'Etwas ist schiefgegangen, und der Anbieter hat nicht gesagt, was.',
  'notice.tryAgainSoon': 'Versuch es gleich noch einmal.',
  'notice.providerError': 'Der Modellanbieter hat einen Fehler gemeldet',
  'notice.modelListFailed': 'Die Modellliste konnte nicht geladen werden',
  'notice.emptyResponse': 'Der Anbieter hat eine leere Antwort geschickt',
  'notice.kind.image': 'Bilder',
  'notice.kind.audio': 'Audio',
  'notice.kind.pdf': 'PDFs',
  'notice.droppedOne': 'Weggelassen, weil dieses Modell es nicht annimmt: {list}.',
  'notice.droppedMany': 'Weggelassen, weil dieses Modell sie nicht annimmt: {list}.',
  'notice.noModelsOffered': '{servers} hat keine Modelle angeboten.',
  'zdr.blocked':
    '{model} sichert keine Zero Data Retention zu. Wähle ein anderes Modell oder schalte „Nur Zero Data Retention“ unter Einstellungen › Modelle aus.',
  'zdr.unavailable':
    'Es ließ sich nicht prüfen, welche Anbieter keine Daten speichern. Prüf deine Verbindung oder schalte „Nur Zero Data Retention“ unter Einstellungen › Modelle aus.',

  // Attaching files
  'attach.kinds.all': 'Bilder, Audio (mp3/wav) oder PDFs',
  'attach.kinds.images': 'Bilder oder PDFs',
  'attach.kinds.audio': 'Audio (mp3/wav) oder PDFs',
  'attach.kinds.pdf': 'PDFs',
  'attach.aFile': 'eine Datei',
  'attach.tooLarge': 'zu groß, höchstens {max} MB',
  'attach.perMessage': 'höchstens {limit} pro Nachricht',
  'attach.pdfs': { one: '{count} PDF', other: '{count} PDFs' },
  'attach.images': { one: '{count} Bild', other: '{count} Bilder' },
  'attach.audioFiles': { one: '{count} Audiodatei', other: '{count} Audiodateien' },
  'attach.imageTypes': 'nur PNG-, JPEG-, WebP- oder GIF-Bilder',
  'attach.audioTypes': 'nur mp3- oder wav-Audio',
  'attach.modelTakes': 'dieses Modell nimmt {kinds}',
  'attach.notAttached': 'Nicht angehängt: {files}.',
  'attach.hint': '{kinds} anhängen',

  // Search errors, as the reasoning line shows them
  'searchError.failed': 'Die Suche ist fehlgeschlagen.',
  'searchError.tooLong': 'Die Suche hat zu lange gedauert.',
  'searchError.pageTooLong': 'Die Seite hat zu lange zum Laden gebraucht.',
  'searchError.unreachable': '{service} ist nicht erreichbar.',
  'searchError.openrouter.key':
    'OpenRouter hat den Schlüssel nicht angenommen. Prüf ihn unter Einstellungen › Verbindungen.',
  'searchError.openrouter.credit': 'Das OpenRouter-Konto hat kein Guthaben mehr.',
  'searchError.openrouter.limited':
    'OpenRouter bremst die Anfragen gerade. Versuch es gleich noch einmal.',
  'searchError.openrouter.trouble':
    'OpenRouter hat gerade Probleme. Versuch es später noch einmal.',
  'searchError.openrouter.failed': 'OpenRouter konnte diese Suche nicht ausführen.',
  'searchError.reader.busy':
    'Der kostenlose Seitenleser ist ausgelastet. Versuch es in einer Minute noch einmal.',
  'searchError.reader.forbidden': 'Der Seitenleser darf diese Seite nicht öffnen.',
  'searchError.reader.failed': 'Der Seitenleser konnte diese Seite nicht öffnen.',
  'searchError.reader.couldNot': 'Diese Seite ließ sich nicht lesen.',
  'searchError.reader.unreachable': 'Der Seitenleser ist nicht erreichbar.',
  'searchError.tavily.key':
    'Tavily hat den Suchschlüssel nicht angenommen. Prüf ihn unter Einstellungen › Verbindungen.',
  'searchError.tavily.limited': 'Tavily bremst die Suchen gerade. Versuch es gleich noch einmal.',
  'searchError.tavily.plan': 'Der Tavily-Tarif hat sein Suchlimit erreicht.',
  'searchError.tavily.trouble': 'Tavily hat gerade Probleme. Versuch es später noch einmal.',
  'searchError.tavily.search': 'Tavily konnte diese Suche nicht ausführen.',
  'searchError.tavily.fetch': 'Tavily konnte diese Seite nicht abrufen.',
};

export default messages;
