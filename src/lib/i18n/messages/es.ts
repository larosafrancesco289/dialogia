// Español. Typed from the English source (en.ts); GLOSSARY.md keeps the words
// used throughout. Informal address, plain words, the app's warm voice.

import type en from './en';
import type { Translation } from '@/lib/i18n/catalogue';

const messages: Translation<typeof en> = {
  // Shared
  'common.notNow': 'Ahora no',
  'common.off': 'Desactivada',
  'common.cancel': 'Cancelar',
  'common.save': 'Guardar',
  'common.delete': 'Eliminar',
  'common.close': 'Cerrar',
  'common.dismiss': 'Cerrar',

  // Welcome and first run
  'welcome.headline.first': 'Te damos la bienvenida a {name}',
  'welcome.headline.learn': '¿Qué vas a {word}?',
  'welcome.headline.learnWord': 'aprender',
  'welcome.headline.chat': 'Empieza un {word}',
  'welcome.headline.chatWord': 'diálogo',
  'welcome.subline.withTutor': 'Habla con los mejores modelos de IA, o aprende algo con un tutor.',
  'welcome.subline': 'Habla con los mejores modelos de IA.',
  'welcome.connectTitle': 'Primero, conecta un modelo',
  'welcome.connected': 'Conectado',
  'setup.title': 'Conectar un modelo',
  'setup.needsKey': '{model} funciona con {provider}. Añade tu clave de {provider} para usarlo.',
  'connect.lead.openrouter':
    'Pega una clave de OpenRouter. Con una sola clave llegas a casi todos los modelos, y solo pagas a OpenRouter lo que uses.',
  'connect.lead.anthropic':
    'Pega una clave de Anthropic para usar los modelos Claude. Solo pagas a Anthropic lo que uses.',
  'connect.lead.local':
    'Pega la dirección de un servidor de modelos que tengas tú, como Ollama o LM Studio. La mayoría no necesita clave.',
  'connect.steps.what':
    'Una clave es como una contraseña: permite que Dialogia use tu cuenta de {provider}. Pagas a {provider} directamente por lo que uses.',
  'connect.steps.account': '{action} en {link}.',
  'connect.steps.accountAction': 'Crea una cuenta',
  'connect.steps.credit':
    '{action} en {page}. Necesitas una tarjeta, y unos pocos dólares bastan para empezar.',
  'connect.steps.creditAction': 'Añade un poco de saldo',
  'connect.steps.key': '{action} en {link}, cópiala y pégala arriba.',
  'connect.steps.keyAction': 'Crea una clave',
  'connect.steps.free':
    '¿Solo quieres probar? OpenRouter también tiene modelos gratuitos, con «(free)» en el nombre. No piden saldo, pero solo permiten un número limitado de mensajes al día.',
  'connect.serverAddress': 'Dirección del servidor',
  'connect.submit': 'Conectar',
  'connect.howToGetKey': '¿Cómo consigo una clave?',
  'connect.otherWays': 'Otras formas de conectarte',
  'connect.privacy.key': 'Tu clave y tus chats se quedan en este navegador.',
  'connect.privacy.server': 'Tus chats se quedan en este navegador.',
  'connect.option.openrouter': 'Clave de OpenRouter',
  'connect.option.openrouterNote': 'Casi todos los modelos, una clave',
  'connect.option.anthropic': 'Clave de Anthropic',
  'connect.option.anthropicNote': 'Solo modelos Claude',
  'connect.option.local': 'Tu propio servidor',
  'connect.option.localNote': 'Ollama, LM Studio y similares',
  'connect.keyRefused':
    '{provider} no ha aceptado esa clave. Comprueba que la copiaste entera, o crea una nueva.',
  'connect.serverSilent':
    'No llegó ningún modelo desde esa dirección. ¿Está encendido el servidor?',
  'connect.keyFormat':
    'Eso no parece una clave de {provider}: las claves de {provider} empiezan por {prefix}. Copia la clave entera y vuelve a pegarla.',
  'connect.serverUnreachable': 'No se pudo llegar a esa dirección.',
  'connect.keyNotSaved':
    'Este navegador no ha podido guardar tu clave, así que solo funciona hasta que cierres esta página.',
  'connect.invalidAddress':
    'Escribe la dirección completa, como http://localhost:11434/v1, con http:// o https:// al principio.',

  // Composer
  'composer.placeholder': 'Pregunta lo que quieras',
  'composer.slashSuggestions': 'Sugerencias de comandos',
  'composer.stop': 'Detener la respuesta',
  'composer.writingElsewhere': 'Escribiendo en otra pestaña…',
  'composer.attach': 'Adjuntar archivos',
  'composer.memory.label': 'Dejar este chat fuera de la memoria',
  'composer.memory.on':
    'Memoria: activada en este chat. Desactívala para dejarlo fuera de la memoria.',
  'composer.memory.off': 'Memoria: desactivada en este chat. No se lee ni se recuerda nada.',
  'composer.memory.offLabel': 'Sin memoria',
  'composer.sendLabel': 'Enviar mensaje',
  'composer.send': 'Enviar',
  'composer.sendFailed': 'No se pudo enviar el mensaje. Tu borrador ha vuelto al cuadro de texto.',
  'composer.sendFailedElsewhere': 'No se pudo enviar el mensaje. Tu borrador ha vuelto a su chat.',

  // Thinking effort
  'effort.title': 'Nivel de razonamiento',
  'effort.buttonTitle': 'Razonamiento: {level}',
  'effort.default': 'predeterminado',
  'effort.modelDefault': '{level} (predeterminado del modelo)',
  'effort.none': 'Ninguno',
  'effort.minimal': 'Mínimo',
  'effort.low': 'Bajo',
  'effort.medium': 'Medio',
  'effort.high': 'Alto',
  'effort.xhigh': 'Muy alto',
  'effort.max': 'Máximo',
  'effort.hint.none': 'Responde enseguida',
  'effort.hint.minimal': 'Apenas un pensamiento',
  'effort.hint.low': 'Lo piensa un momento',
  'effort.hint.medium': 'Lo piensa bien',
  'effort.hint.high': 'Lo piensa a fondo',
  'effort.hint.xhigh': 'Lo piensa muy a fondo',
  'effort.hint.max': 'Se toma todo el tiempo que necesite',

  // Web search
  'search.title': 'Búsqueda web',
  'search.short': 'Buscar',
  'search.state.on': 'Búsqueda web: activada ({provider})',
  'search.state.off': 'Búsqueda web: desactivada ({provider})',
  'search.builtIn': 'Integrada',
  'search.builtInDescription': 'La búsqueda del propio proveedor del modelo',
  'search.toolDescription': 'Busca cuando lo necesita y lee las páginas que encuentra',
  'search.openrouter': 'Búsqueda de OpenRouter',

  // Slash commands (the commands themselves stay in English)
  'slash.model': 'Responder con otro modelo',
  'slash.search': 'Activar o desactivar la búsqueda web',
  'slash.reasoning': 'Cuánto piensa el modelo',
  'slash.help': 'Qué hacen estos comandos',
  'slash.typeModel': 'Escribe el nombre de un modelo…',
  'slash.searchOn': 'La búsqueda web está activada en este chat.',
  'slash.searchOff': 'La búsqueda web está desactivada en este chat.',
  'slash.searchOnNext': 'La búsqueda web estará activada en el próximo chat.',
  'slash.searchOffNext': 'La búsqueda web estará desactivada en el próximo chat.',
  'slash.noThinking': 'Este modelo responde sin pensar antes, así que no hay nada que ajustar.',
  'slash.effortUnavailable': 'Este modelo no ofrece el nivel «{level}».',
  'slash.effortSet': 'Nivel de razonamiento: «{level}».',
  'slash.noSuchModel': 'Ningún modelo se llama {name}.',
  'slash.modelSet': 'Ahora responde {name}.',
  'slash.helpText':
    'Escribe /model y un nombre para cambiar de modelo, /search on u off para la búsqueda web, y /reasoning con un nivel como low o high.',

  // Chat
  'chat.opening': 'Abriendo el chat…',
  'chat.showEarlier': {
    one: 'Mostrar el mensaje anterior ({count})',
    other: 'Mostrar mensajes anteriores ({count})',
  },
  'chat.scrollToBottom': 'Ir al final',

  // Sidebar and chats
  'chat.untitled': 'Nuevo chat',
  'chat.branchMark': '(rama)',

  // A message and its actions
  'message.saveShortcut': '{key} Intro para guardar',
  'message.copy': 'Copiar',
  'message.copied': 'Copiado',
  'message.copyLabel': 'Copiar el mensaje',
  'message.edit': 'Editar',
  'message.editing': 'Editando…',
  'message.editMessage': 'Editar el mensaje',
  'message.editReply': 'Editar la respuesta',
  'message.editPlaceholder': 'Edita tu mensaje…',
  'message.editReplyPlaceholder': 'Edita la respuesta…',
  'message.showLess': 'Mostrar menos',
  'message.showAll': 'Mostrar todo',
  'message.writing': 'Escribiendo una respuesta',
  'message.stillWorking': 'Sigue trabajando',
  'message.tryAgain': 'Reintentar',
  'message.branch': 'Ramificar en un chat nuevo',
  'message.selectText': 'Seleccionar el texto',
  'message.sheet.reply': 'Respuesta',
  'message.sheet.yours': 'Tu mensaje',
  'message.sheet.replyActions': 'Acciones de la respuesta',
  'message.sheet.messageActions': 'Acciones del mensaje',
  'message.filtered.title': 'Rechazado por el filtro de seguridad del modelo',
  'message.filtered.cutShort': 'La respuesta se cortó por el filtro de seguridad del proveedor.',
  'message.filtered.blocked':
    'Un filtro de seguridad bloqueó esta petición antes de que el modelo pudiera responder.',
  'message.filtered.reason': 'Motivo indicado: {reason}.',
  'message.youSaid': 'Tú:',

  // A reply's versions (Try again keeps the old one)
  'versions.label': 'Versión {at} de {count}',
  'versions.labelWithModel': 'Versión {at} de {count}, {model}',
  'versions.group': 'Versiones de esta respuesta',
  'versions.onlyLatest': 'Solo la última respuesta puede cambiar de versión',
  'versions.previous': 'Versión anterior',
  'versions.next': 'Versión siguiente',
  'versions.delete': 'Eliminar esta versión',
  'versions.deleteNumbered': 'Eliminar la versión {at} de {count}',
  'versions.deleteTitle': '¿Eliminar esta versión?',
  'versions.deleteBody':
    'Esta versión desaparecerá para siempre. La respuesta se queda, con otra versión.',

  // The reasoning ledger: what the model thought and which tools it used
  'activity.thinking': 'Pensando',
  'activity.thought': 'Pensó',
  'activity.thoughtFor': 'durante {duration}',
  'activity.words': { one: '{count} palabra', other: '{count} palabras' },
  'activity.tools': { one: '{count} herramienta', other: '{count} herramientas' },
  'activity.searches': { one: '{count} búsqueda', other: '{count} búsquedas' },
  'activity.waiting': 'Esperando al modelo… {seconds} s',
  'activity.searchingWeb': 'Buscando en la web',
  'activity.searchingFor': 'Buscando: {query}',
  'activity.searchingSources': 'Buscando fuentes',
  'activity.searchFailed': 'La búsqueda falló',
  'activity.tool.fetch': 'Leyendo una página',
  'activity.tool.memoryRead': 'Consultando la memoria',
  'activity.tool.memorySave': 'Guardando en la memoria',
  'activity.tool.memoryForget': 'Olvidando una nota',
  'activity.notFound': 'No encontrado',
  'activity.notSaved': 'No guardado',
  'activity.searching': 'Buscando',
  'activity.running': 'En curso',
  'activity.notApplied': 'No aplicado',
  'activity.stopped': 'Detenido',
  'activity.failed': 'Falló',
  'activity.noResults': 'Sin resultados',
  'activity.copyThinking': 'Copiar el razonamiento',
  'activity.turnFailed': 'El turno falló antes de que se hiciera esta llamada',
  'sources.found': { one: '{count} fuente encontrada', other: '{count} fuentes encontradas' },
  'sources.looking': 'Buscando fuentes…',
  'sources.lookingFor': 'Buscando fuentes: {query}…',
  'sources.untitled': 'Fuente sin título',

  // Ends with {title} in every language: the renderer knows a citation by the words before it.
  'sources.citation': 'Fuente {number}: {title}',

  // How a reply ended
  'ending.stopped': 'Detenida antes del final.',
  'ending.failed': 'Cortada por un error antes del final.',
  'ending.interrupted': 'Cortada: la página se cerró mientras se escribía.',
  'ending.nothing.stopped': 'Detenida antes de que empezara la respuesta.',
  'ending.nothing.failed': 'Esta respuesta falló.',
  'ending.nothing.interrupted': 'La página se cerró antes de que empezara la respuesta.',
  'ending.details': 'Lo que dijo el proveedor',
  'ending.length': 'Detenida en el límite de longitud.',
  'ending.announce.stopped': 'Respuesta detenida',
  'ending.announce.failed': 'Respuesta fallida',
  'ending.announce.length': 'Respuesta detenida en el límite de longitud',
  'ending.announce.finished': 'Respuesta terminada',

  // The line under a reply: model, speed, cost
  'colophon.firstWord': 'primera palabra en {time}',
  'colophon.tokens': { one: '{count} token', other: '{count} tokens' },
  'colophon.speed': '{rate} tokens/s',
  'colophon.under': 'menos de {amount}',

  // Attachments
  'attachments.openLarger': 'Ver más grande',
  'attachments.image': 'imagen',
  'attachments.audio': 'Audio',
  'attachments.audioAttached': 'Audio adjunto',
  'attachments.pages': { one: '{count} página', other: '{count} páginas' },
  'attachments.attachment': 'adjunto',
  'attachments.remove': 'Quitar',
  'attachments.removeNamed': 'Quitar {name}',
  'attachments.attachedAudio': 'Adjunto (mp3/wav)',
  'attachments.attachedPdf': 'Adjunto (se lee en tu navegador)',

  // Developer views (Settings › Appearance › Developer)
  'debug.request': 'Petición de depuración',
  'debug.toolActivity': 'Actividad de herramientas',
  'debug.overview': 'Resumen',
  'debug.toolDefinitions': 'Definiciones de herramientas',
  'debug.plugins': 'Plugins',
  'debug.messages': 'Mensajes',
  'debug.noContent': 'Sin contenido visible',
  'debug.toolCalls': 'Llamadas a herramientas: {names}',
  'debug.rawJson': 'JSON en bruto de la petición',
  'debug.copyRequest': 'Copiar la petición',
  'toolLog.heading': 'Llamadas a herramientas ({count})',
  'toolLog.input': 'Entrada',
  'toolLog.output': 'Salida',
  'toolLog.copy.input': 'Copiar el JSON de entrada',
  'toolLog.copy.output': 'Copiar el JSON de salida',
  'toolLog.metadata': 'Metadatos',
  'toolLog.category.search': 'Búsqueda',
  'toolLog.category.tutor': 'Tutor',
  'toolLog.category.planning': 'Planificación',
  'toolLog.category.system': 'Sistema',
  'toolLog.category.other': 'Otro',
  'toolLog.searchResults': {
    one: 'Búsqueda web ({count} resultado)',
    other: 'Búsqueda web ({count} resultados)',
  },
  'toolLog.searchError': 'Error en la búsqueda web',
  'toolLog.completed': 'Completada',
  'toolLog.pending': 'Pendiente',
  'toolLog.round': 'Ronda {round}',
  'toolLog.cached': 'Resultado en caché',
  'toolLog.usedInReply': 'Usado en la respuesta',
  'toolLog.learnerUpdated': 'Perfil del estudiante actualizado',
  'toolLog.planUpdated': 'Plan actualizado',

  // Models
  'models.caps.reasoning': 'Piensa antes de responder',
  'models.caps.vision': 'Lee imágenes',
  'models.caps.audio': 'Escucha audio',
  'models.caps.image': 'Crea imágenes',
  'models.caps.zdr': 'No guarda ninguno de tus datos (retención cero)',
  'models.contextHint': 'Cuánto puede leer de una vez',
  'models.contextTokens': { one: '{count} token', other: '{count} tokens' },
  'models.curated.claudeHaiku':
    'Rápido, económico y escribe muy bien; los chats nuevos empiezan aquí',
  'models.curated.gptLuna': 'Rápido, económico y conciso; bueno con herramientas',
  'models.curated.tutor':
    'Rápido, económico y un profesor cercano y paciente; el tutor predeterminado',
  'models.curated.gptSol':
    'La gama principal de OpenAI, para razonar y escribir cosas más difíciles',
  'models.curated.claudeOpus':
    'Trabajo cuidadoso y de largo recorrido; el predeterminado que recomienda Anthropic',
  'models.curated.claudeFable':
    'El Claude más capaz, para los problemas más difíciles; el más caro',
  'models.curated.geminiFlash':
    'Lo más nuevo de Google; rápido con imágenes y documentos muy largos',
  'models.curated.kimi': 'Pesos abiertos, fuerte con el código, buena relación calidad-precio',
  'models.curated.grok': 'El Grok más reciente, para trabajos largos con herramientas',
  'models.curated.image': 'Crea y edita imágenes',

  // Settings › Models
  'models.default.follows': 'Los chats nuevos usan el último modelo que elegiste.',
  'models.default.startsHere':
    'Los chats nuevos empiezan aquí hasta que elijas un modelo en un chat.',
  'models.default.reset': 'Restablecer',
  'models.default.refresh': 'Actualizar la lista',
  'models.favorites.hint': 'Los modelos que el selector ofrece junto a sus recomendaciones.',
  'models.favorites.empty': 'Todavía no hay favoritos.',
  'models.favorites.add': 'Añadir un modelo',
  'models.zdr': 'Solo retención cero de datos',
  'models.zdrHint': 'Ofrecer solo modelos de proveedores que no guardan tus prompts.',
  'models.familyMoved':
    '{family} ahora es {model}: los chats nuevos lo usan, los que están en marcha conservan el suyo.',
  'models.defaultMissing':
    'Tus proveedores no ofrecen {model}, así que los chats nuevos empiezan con {fallback}.',
  'models.hiddenZdr':
    'Los modelos de {server} están ocultos: la retención cero está activada y solo OpenRouter puede garantizarla.',
  'models.unavailableKey': 'Modelos de {server} no disponibles: se rechazó la clave.',
  'models.unavailableLimited': 'Modelos de {server} no disponibles: demasiadas peticiones.',
  'models.unreachable': 'No se pudo conectar con {server}.',
  'models.unavailable': 'Modelos de {server} no disponibles ahora mismo.',
  'pricing.free': 'Gratis',
  'pricing.in': 'entrada {rate}/M',
  'pricing.out': 'salida {rate}/M',
  'pricing.inFree': 'entrada gratis',
  'pricing.outFree': 'salida gratis',

  // The model picker
  'picker.choose': 'Elegir un modelo',
  'picker.search': 'Buscar modelos',
  'picker.results': 'Resultados',
  'picker.recommended': 'Recomendados',
  'picker.favorites': 'Tus favoritos',
  'picker.servers': 'Tus servidores',
  'picker.unavailableZdr': '{model}: no disponible mientras la retención cero esté activada',
  'picker.empty': 'Todavía no hay modelos. Conecta un proveedor para elegir entre sus modelos.',
  'picker.noMatch': 'Ningún modelo coincide.',
  'picker.noneFound': 'No se encontraron modelos',
  'picker.inUse': ', en uso',
  'picker.removeFavorite': 'Quitar de favoritos',
  'picker.removeFavoriteNamed': 'Quitar {model} de favoritos',
  'regenerate.with': 'Reintentar con',
  'regenerate.withAnother': 'Reintentar con otro modelo',
  'regenerate.sameModel': 'mismo modelo',
  'sidebar.newChat': 'Nuevo chat',
  'sidebar.createFolder': 'Crear carpeta',
  'sidebar.folders': 'Carpetas',
  'sidebar.search': 'Buscar chats',
  'sidebar.noMatch': 'Ningún chat coincide con «{query}».',
  'sidebar.today': 'Hoy',
  'sidebar.previous7': 'Últimos 7 días',
  'sidebar.previous30': 'Últimos 30 días',
  'sidebar.earlier': 'Anteriores',
  'chatRow.name': 'Nombre del chat',
  'chatRow.tutoring': 'Sesión de estudio:',
  'chatRow.rename': 'Renombrar',
  'chatRow.renameNamed': 'Renombrar «{title}»',
  'chatRow.move': 'Mover a una carpeta',
  'chatRow.moveNamed': 'Mover «{title}» a una carpeta',
  'chatRow.deleteNamed': 'Eliminar «{title}»',
  'chatRow.actionsFor': 'Acciones para {title}',
  'chatRow.deleteTitle': '¿Eliminar este chat?',
  'chatRow.deleteBody': '«{title}» y sus mensajes desaparecerán para siempre.',
  'folder.namePlaceholder': 'Nombre de la carpeta',
  'folder.newName': 'Nombre de la carpeta nueva',
  'folder.actionsFor': 'Acciones de la carpeta {name}',
  'folder.rename': 'Renombrar la carpeta',
  'folder.delete': 'Eliminar la carpeta',
  'folder.deleteTitle': '¿Eliminar esta carpeta?',
  'folder.deleteBodyChats': 'Los chats de «{name}» se quedan; salen de la carpeta.',
  'folder.deleteBodyEmpty': '«{name}» está vacía.',
  'folder.count': { one: '{count} chat', other: '{count} chats' },
  'folder.newDefault': 'Carpeta nueva',
  'move.label': 'Mover {title} a una carpeta',
  'move.title': 'Mover «{title}»',
  'move.noFolder': 'Sin carpeta',
  'move.newFolder': 'Carpeta nueva…',
  'move.heading': 'Mover a',

  // Header, drawer and pages
  'nav.memory': 'Memoria',
  'nav.settings': 'Ajustes',
  'nav.learningHub': 'Recorrido',
  'drawer.chats': 'Chats',
  'drawer.open': 'Abrir los chats',
  'header.toggleSidebar': 'Mostrar u ocultar la barra lateral',
  'header.expandSidebar': 'Abrir la barra lateral',
  'header.collapseSidebar': 'Cerrar la barra lateral',
  'header.openMemory': 'Abrir la memoria',
  'header.openSettings': 'Abrir los ajustes',
  'learnTools.notice':
    '{model} no puede usar herramientas, así que en Aprender solo puede chatear: sin plan y sin quiz.',
  'learnTools.chooseModel': 'Elegir otro modelo',
  'learnTools.turnOnTools': 'Activar Herramientas en Ajustes',
  'header.tutorModel': 'Modelo del tutor: {model}. Se cambia en Ajustes.',
  'lightbox.label': 'Visor de imágenes',
  'lightbox.download': 'Descargar',
  'lightbox.previous': 'Anterior',
  'lightbox.next': 'Siguiente',

  // Settings › Chat
  'settings.chat.systemHint':
    'Lo que se le dice a cada chat nuevo antes de tu primer mensaje. Una sesión de estudio añade encima sus propias instrucciones.',
  'settings.chat.savedPrompts': 'Prompts guardados',
  'settings.chat.savedPrompt': 'Prompt guardado',
  'settings.chat.namePrompt': 'Ponle nombre a este prompt',
  'settings.chat.newName': 'Nombre nuevo',
  'settings.chat.newNameLabel': 'Nombre nuevo para este prompt',
  'settings.chat.deletePrompt': '¿Eliminar «{name}»?',
  'settings.chat.choosePrompt': 'Elige un prompt guardado…',
  'settings.chat.use': 'Usar',
  'settings.chat.saveCurrent': 'Guardar el actual',
  'settings.chat.renamePrompt': 'Renombrar el prompt',
  'settings.chat.deletePromptButton': 'Eliminar el prompt',
  'settings.chat.timestamps': 'Fecha y hora de los mensajes',
  'settings.chat.timestampsHint':
    'Le dice al modelo cuándo se envió cada mensaje, para que sepa la fecha. Encarece un poco cada mensaje.',
  'settings.chat.modelDefault': 'Predeterminado del modelo',
  'settings.chat.effortHint':
    'Cuánto piensan por defecto los chats nuevos. Cámbialo en cada chat desde el cuadro de texto; un modelo que no tenga un nivel usa el más cercano.',
  'settings.chat.budget': 'Presupuesto de razonamiento',
  'settings.chat.automatic': 'Automático',
  'settings.chat.budgetInvalid':
    'Escribe un número entero mayor que 0, o déjalo vacío. No se guardó.',
  'settings.chat.budgetHint':
    'Lo máximo que puede pensar el modelo, en tokens (unas tres cuartas partes de una palabra cada uno), en los modelos que aceptan un límite. Déjalo vacío para que decida el modelo.',
  'settings.memory.use': 'Usar la memoria',
  'settings.memory.useHint':
    'El modelo lee tu memoria con cada mensaje y apunta lo que aprende sobre ti. Lo que lee va al proveedor que use el chat. Para dejar un chat fuera, desactiva la memoria con el marcador de su cuadro de texto.',
  'settings.memory.sensitive': 'Incluir temas delicados',
  'settings.memory.sensitiveHint':
    'Deja que el modelo apunte detalles como problemas de salud o creencias religiosas sin que se lo pidas. La memoria se queda solo en este navegador y va al proveedor del chat como el resto. Si lo desactivas, solo los guarda cuando se lo pidas.',
  'settings.memory.open': 'Abrir la memoria',

  // Settings: pages and sections
  'settings.tab.connections': 'Conexiones',
  'settings.tab.models': 'Modelos',
  'settings.tab.chat': 'Chat',
  'settings.tab.tutor': 'Tutor',
  'settings.tab.appearance': 'Apariencia',
  'settings.tab.data': 'Datos',
  'settings.section.providers': 'Proveedores',
  'settings.section.endpoints': 'Tus servidores',
  'settings.section.web-search': 'Búsqueda web',
  'settings.section.default-model': 'Modelo predeterminado',
  'settings.section.favorites': 'Favoritos',
  'settings.section.privacy': 'Privacidad',
  'settings.section.general': 'Prompt del sistema',
  'settings.section.memory': 'Memoria',
  'settings.section.reasoning': 'Razonamiento',
  'settings.section.tutor': 'Tutor',
  'settings.section.theme': 'Tema',
  'settings.section.language': 'Idioma',
  'settings.section.display': 'Visualización',
  'settings.section.developer': 'Desarrolladores',
  'settings.section.data': 'Importar y exportar',

  // What each section shows and is about, so search finds it by the words on
  // screen as well as by its title. English words always find it too.
  'settings.keywords.providers':
    'clave openrouter clave anthropic api proveedor conectar reemplazar quitar espacio de trabajo workspace',
  'settings.keywords.endpoints':
    'tu propio servidor local ollama lm studio llama.cpp vllm dirección del servidor url endpoint personalizado compatible openai clave api nombres de modelos probar conexión herramientas imágenes nivel de razonamiento coste de las respuestas caché de prompts títulos de chats quitar autoalojado',
  'settings.keywords.web-search': 'tavily clave búsqueda web openrouter jina reader',
  'settings.keywords.default-model':
    'chat nuevo modelo predeterminado restablecer actualizar lista',
  'settings.keywords.favorites': 'favoritos estrella modelos quitar selector',
  'settings.keywords.privacy': 'solo retención cero de datos zdr privacidad proveedores prompts',
  'settings.keywords.general':
    'prompt del sistema prompts guardados elegir plantilla guardar el actual renombrar eliminar fecha y hora de los mensajes',
  'settings.keywords.memory':
    'usar la memoria recordar olvidar notas sobre ti estudio temas delicados privado salud abrir la memoria marcador',
  'settings.keywords.reasoning':
    'nivel de razonamiento presupuesto de razonamiento tokens nivel modelo predeterminado',
  'settings.keywords.tutor':
    'tutor modo aprender siempre seguir al tutor desplazamiento modelo del tutor plan de estudio estudiante enseñanza',
  'settings.keywords.theme': 'tema color claro oscuro automático sistema',
  'settings.keywords.language':
    'idioma traducción automático english italiano français español deutsch português ελληνικά',
  'settings.keywords.display':
    'mostrar el razonamiento siempre detalles de las respuestas modelo velocidad coste estadísticas visualización',
  'settings.keywords.developer':
    'desarrolladores registro de llamadas a herramientas vista de la petición json en bruto cada respuesta depurar inspeccionar argumentos resultado',
  'settings.keywords.data':
    'importar exportar chats y ajustes archivo json copia de seguridad datos',
  'settings.tutorSummary': 'Las sesiones de estudio y su modelo',
  'settings.search': 'Buscar en los ajustes',
  'settings.clearSearch': 'Borrar la búsqueda',
  'settings.noMatch': 'Ningún ajuste coincide con «{query}».',
  'settings.pages': 'Páginas de ajustes',
  'settings.navigation': 'Navegación de ajustes',
  'settings.close': 'Cerrar los ajustes',
  'settings.back': 'Volver a Ajustes',
  'settings.saveFailed': 'No se pudieron guardar los ajustes. Vuelve a hacer el cambio.',

  // Settings › Connections
  'providers.rejected': 'El proveedor rechazó esta clave. Pega una nueva.',
  'providers.usingKey': 'Usa tu clave',
  'providers.readyNoKey': 'Listo (no hace falta clave)',
  'providers.needsAddress': 'Falta una dirección',
  'providers.needsKey': 'Falta una clave',
  'providers.keysStay': 'Las claves se quedan en este navegador y nunca se exportan.',
  'providers.workspace': 'ID del espacio de trabajo (opcional)',
  'providers.workspaceHint':
    'Solo hace falta si Claude dice que tu clave necesita un espacio de trabajo. Copia el ID desde Workspaces en la Claude Console; empieza por wrkspc_.',
  'providers.workspaceInvalid': 'Un ID de espacio de trabajo solo tiene letras, números, _ y -.',
  'apiKey.saved': '{key} guardada. Pega para reemplazarla',
  'apiKey.replace': 'Reemplazar',
  'apiKey.removeNamed': 'Quitar: {label}',
  'apiKey.removeTitle': '¿Quitar «{label}»?',
  'apiKey.removeBody': 'Se borra de este navegador. Para volver a usarla, pégala otra vez.',
  'servers.removeTitle': '¿Quitar {name}?',
  'servers.removeBody':
    'Se van su dirección, su clave y sus ajustes. Los chats que usaron sus modelos conservan sus mensajes.',
  'servers.notSaved': 'No se guardó.',
  'servers.addressHint':
    'La dirección del servidor, por ejemplo http://localhost:11434/v1 para Ollama.',
  'servers.modelNames': 'Nombres de modelos',
  'servers.modelNamesHint':
    'Separados por comas. Lo que este servidor liste en /models se añade solo.',
  'servers.keyOptional': 'Clave (opcional)',
  'servers.keyPlaceholder': 'La mayoría de servidores locales no la necesitan',
  'servers.supports': 'Qué admite este servidor',
  'servers.supportsHint':
    'Nunca se envía nada que no esté marcado. Un servidor estricto rechaza la petición entera por un solo campo que no conoce.',
  'servers.titles': 'Títulos de los chats',
  'servers.titlesChatModel': 'Usar el modelo del chat',
  'servers.titlesOff': 'No generar títulos',
  'servers.remove': 'Quitar este servidor',
  'servers.name': 'Nombre del servidor',
  'servers.namePlaceholder': 'Nombre, ej. Ollama',
  'servers.add': 'Añadir',
  'servers.addHint':
    'Funciona con Ollama, LM Studio, llama.cpp y vLLM. Las funciones empiezan desactivadas; tú decides cuáles activar.',
  'servers.noAddress': 'sin dirección',
  'webSearch.hint':
    'La búsqueda integrada en el proveedor del modelo no necesita otra clave y es la predeterminada. Con una clave de OpenRouter también puedes elegir la búsqueda de OpenRouter en el cuadro de texto: el modelo busca cuando lo necesita, con tu saldo de OpenRouter, y las páginas se leen con Jina Reader. Tus búsquedas van al socio de búsqueda de OpenRouter, y las direcciones de las páginas a Jina.',
  'webSearch.keyLabel': 'Clave de {provider}',
  'capability.tools': 'Herramientas',
  'capability.toolsHint': 'Deja que el modelo use herramientas, como la búsqueda y la memoria.',
  'capability.vision': 'Imágenes',
  'capability.visionHint': 'Enviar imágenes.',
  'capability.reasoningHint': 'Enviar un nivel de razonamiento.',
  'capability.streamUsage': 'Coste de las respuestas',
  'capability.streamUsageHint': 'Indicar cuánto costó cada respuesta.',
  'capability.parallelToolCalls': 'Varias herramientas a la vez',
  'capability.parallelToolCallsHint': 'Deja que el modelo use más de una herramienta por paso.',
  'capability.promptCaching': 'Caché de prompts',
  'capability.promptCachingHint': 'Reutilizar los prompts largos para ahorrar.',
  'probe.title': 'Probar la conexión',
  'probe.test': 'Probar la conexión',
  'probe.testAgain': 'Probar otra vez',
  'probe.modelToTest': 'Modelo con el que probar',
  'probe.hint':
    'Envía unas pocas peticiones diminutas para ver qué campos acepta este servidor, y así las casillas de abajo se marcan según una respuesta y no a ojo.',
  'probe.hintModel':
    'Envía unas pocas peticiones diminutas a {model} para ver qué campos acepta este servidor, y así las casillas de abajo se marcan según una respuesta y no a ojo.',
  'probe.step.models': 'Listando modelos…',
  'probe.step.chat': 'Enviando un primer mensaje…',
  'probe.step.tools': 'Comprobando herramientas…',
  'probe.step.parallelToolCalls': 'Comprobando varias herramientas a la vez…',
  'probe.step.reasoning': 'Comprobando el nivel de razonamiento…',
  'probe.step.vision': 'Comprobando imágenes…',
  'probe.step.streamUsage': 'Comprobando el coste de las respuestas…',
  'probe.step.promptCaching': 'Comprobando la caché de prompts…',
  'probe.verdict.ok': 'Aceptado',
  'probe.verdict.no': 'No admitido',
  'probe.verdict.unknown': 'Sin respuesta',
  'probe.verdict.skipped': 'Omitido',
  'probe.reachable': 'Accesible.',
  'probe.noModels': 'No lista ningún modelo, así que solo se usan los que escribiste.',
  'probe.listsModels': { one: 'Lista {count} modelo.', other: 'Lista {count} modelos.' },
  'probe.notApi': 'Algo respondió en {address}, pero no como un servidor compatible con OpenAI.',
  'probe.notApiHint':
    'Revisa la dirección. Suele ser la raíz del servidor seguida de /v1, por ejemplo http://localhost:11434/v1 para Ollama.',
  'probe.noRoute': 'Aquí no hay ruta /models, así que solo se usan los que escribiste.',
  'probe.unauthorized': 'Accesible, pero pide una clave y no aceptó la tuya.',
  'probe.unreachable': 'No se pudo conectar con {address}.',
  'probe.unreachableHint':
    'Comprueba que el servidor esté encendido y que acepte peticiones de {origin}. Ollama necesita que OLLAMA_ORIGINS incluya ese origen, y LM Studio, tener CORS activado en los ajustes del servidor.',
  'probe.listFailed': 'Accesible, pero falló al listar los modelos.',
  'probe.replied': '{model} respondió en {time}.',
  'probe.noAnswer': '{model} no respondió.',
  'probe.notTested': '{model} no se probó.',
  'probe.noMessage': 'No se envió ningún mensaje.',
  'probe.apply': 'Aplicar a las casillas de abajo',
  'probe.applyHint': 'Activa lo que se aceptó y desactiva lo que se rechazó.',
  'probe.alreadyMatch': 'Las casillas de abajo ya coinciden con lo que aceptó este servidor.',

  // Testing a server (the details under each line)
  'probe.canceled': 'Se canceló la prueba de conexión.',
  'probe.timeout': 'Sin respuesta en {seconds} s.',
  'probe.failedEarly': 'La petición falló antes de que respondiera el servidor.',
  'probe.detail.unreachable': 'No se pudo conectar con el servidor.',
  'probe.detail.notApi': 'Ningún servidor compatible con OpenAI respondió en esta dirección.',
  'probe.detail.noModel':
    'No hay modelo con el que probar. Escribe un nombre de modelo arriba, o mira qué lista el servidor.',
  'probe.detail.notStream':
    'Respondió, pero no como un flujo de tokens. Dialogia muestra cada respuesta mientras se escribe.',
  'probe.detail.firstFailed': 'Omitido porque el primer mensaje no pasó.',
  'probe.detail.needsTools': 'Necesita llamadas a herramientas.',
  'probe.detail.noUsage': 'El servidor aceptó el campo pero no devolvió el consumo.',

  // Settings › Data
  'data.label': 'Chats y ajustes',
  'data.hint': 'Todo en un archivo. Tus claves nunca van incluidas.',
  'data.import': 'Importar',
  'data.export': 'Exportar',
  'data.thisFile': 'este archivo',
  'data.importTitle': '¿Importar {name}?',
  'data.importBody':
    'Los chats del archivo reemplazan a los de aquí con el mismo id, y sus ajustes reemplazan los tuyos: servidores, favoritos y ajustes de los chats. Todo lo demás se conserva. Exporta antes si puede que quieras volver atrás.',
  'data.exportFailed': 'La exportación falló. Inténtalo de nuevo.',
  'data.importFailed': 'La importación falló. Inténtalo de nuevo.',
  'data.importWhileReplying': 'Espera a que termine la respuesta y luego importa.',
  'data.nothing': 'Este archivo no tiene chats ni ajustes de Dialogia.',
  'data.notJson': 'Ese archivo no es una exportación de Dialogia: no es un JSON válido.',
  'data.newerVersion':
    'Esta copia se hizo con una versión más reciente de Dialogia. Recarga para actualizar la app y vuelve a importarla.',
  'data.noneRead': 'No se pudo leer ninguno de los chats de este archivo.',
  'data.imported.chats': { one: 'Se importó {count} chat.', other: 'Se importaron {count} chats.' },
  'data.imported.settings': 'Se importaron tus ajustes.',
  'data.skipped.some': { one: '{count} no se pudo leer.', other: '{count} no se pudieron leer.' },
  'data.skipped.chats': {
    one: '{count} chat no se pudo leer.',
    other: '{count} chats no se pudieron leer.',
  },

  'history.label': 'Chats de ChatGPT o Claude',
  'history.hint':
    'Pide a ChatGPT o a Claude una copia de tus datos. Elige el archivo .zip que recibas, o el archivo conversations.json que contiene.',
  'history.choose': 'Elegir archivo',
  'history.confirmBody':
    'Tus chats se añaden en una carpeta aparte, y no se reemplaza nada de lo que tienes aquí. Si eliges otra vez el mismo archivo, nada llega dos veces. Las imágenes y los archivos se quedan fuera; una nota marca dónde estaba cada uno.',
  'history.reading': 'Leyendo el archivo…',
  'history.progress': 'Importando desde {source}: {done} de {total}',
  'history.folder': 'De {source}',
  'history.imported': {
    one: 'Se importó {count} chat de {source}, en la carpeta «{folder}».',
    other: 'Se importaron {count} chats de {source}, en la carpeta «{folder}».',
  },
  'history.nothing': 'Esta exportación de {source} no tiene chats.',
  'history.zipMissing':
    'Este .zip no tiene ningún conversations.json. Elige la exportación de datos que recibiste de ChatGPT o Claude.',
  'history.zipUnreadable':
    'Este navegador no puede abrir ese .zip. Descomprímelo y elige el archivo conversations.json que contiene.',
  'history.isBackup':
    'Esto es una copia de seguridad de Dialogia. Usa Importar en «Chats y ajustes» para restaurarla.',
  'history.unknown':
    'Esto no es una exportación de ChatGPT ni de Claude. Elige su archivo conversations.json, o el .zip en el que llegó.',
  'history.placeholder.image': '[Imagen no incluida]',
  'history.placeholder.file': '[Archivo no incluido: {name}]',
  'history.placeholder.fileUnnamed': '[Archivo no incluido]',

  // Settings › Appearance
  'appearance.scheme': 'Colores',
  'appearance.schemeHint': 'Claro, oscuro o como tu sistema.',
  'appearance.light': 'Claro',
  'appearance.dark': 'Oscuro',
  'appearance.auto': 'Auto',
  'appearance.language': 'Idioma',
  'appearance.languageHint':
    'Las palabras de la app. Las respuestas siguen el idioma en que escribes.',
  'appearance.languageAuto': 'Automático ({language})',
  'appearance.showThinking': 'Mostrar siempre el razonamiento',
  'appearance.showThinkingHint':
    'Muestra lo que pensó el modelo en cada respuesta, también en las anteriores.',
  'appearance.showStats': 'Mostrar los detalles de las respuestas',
  'appearance.showStatsHint':
    'Una línea bajo cada respuesta: qué modelo la escribió, a qué velocidad y cuánto costó.',
  'appearance.toolLog': 'Registro de llamadas a herramientas',
  'appearance.toolLogHint':
    'Encima de cada respuesta que usó herramientas, cada llamada con sus argumentos y su resultado.',
  'appearance.requestView': 'Vista de la petición',
  'appearance.requestViewHint':
    'Encima de cada respuesta, la petición que la produjo. Se guarda desde ahora y hasta que recargues.',
  'appearance.rawJson': 'Incluir el JSON en bruto',
  'appearance.rawJsonHint': 'La petición tal como se envió, lista para copiar.',

  // Code blocks and diagrams in replies
  'code.copy': 'Copiar el código',
  'code.wrap': 'Ajustar',
  'code.unwrap': 'Sin ajuste',
  'code.enableWrap': 'Ajustar las líneas largas',
  'code.disableWrap': 'Dejar las líneas largas enteras',
  'code.expand': 'Expandir',
  'code.collapse': 'Contraer',
  'code.diagramFailed': 'No se pudo dibujar este diagrama.',

  // Memory
  'memory.close': 'Cerrar la memoria',
  'memory.folders': 'Carpetas de la memoria',
  'memory.folder.about': 'Sobre ti',
  'memory.folder.aboutDescription': 'Quién eres, dónde vives, cómo te gustan las respuestas',
  'memory.folder.learning': 'Estudio',
  'memory.folder.learningDescription': 'Lo que has estudiado con el tutor y cómo aprendes mejor',
  'memory.aboutEmpty':
    'Aquí va lo que el modelo aprende sobre ti. También puedes añadir una nota tú.',
  'memory.folderEmpty': 'Todavía no hay notas en esta carpeta.',
  'memory.forgotten': 'Olvidadas hace poco',
  'memory.forgottenHint':
    'Notas olvidadas por ti o por el modelo. Cada una espera aquí 30 días y luego desaparece para siempre.',
  'memory.forgottenFrom': 'De {folder} · olvidada el {date}',
  'memory.aFolder': 'una carpeta',
  'memory.restore': 'Restaurar',
  'memory.restoreNamed': 'Restaurar: {note}',
  'memory.forgottenEmpty': 'Nada olvidado últimamente.',
  'memory.editHint': 'Intro para guardar · Esc para cancelar',
  'memory.editHintTouch': 'Toca OK para guardar',
  'memory.byModel': 'Escrita por el modelo',
  'memory.editedByYou': 'Editada por ti',
  'memory.byYou': 'Escrita por ti',
  'memory.fromChat': 'de {chat}',
  'memory.note': 'Nota',
  'memory.forget': 'Olvidar',
  'memory.forgetNamed': 'Olvidar: {note}',
  'memory.newNote': 'Nota nueva',
  'memory.newNotePlaceholder': 'Algo que el modelo debería saber',
  'memory.addNote': 'Añadir una nota',
  'memory.folderHolds': 'Qué guarda {folder}',
  'memory.folderLineHint':
    'El modelo lee primero esta línea y abre la carpeta cuando viene al caso.',
  'memory.folderLinePlaceholder': 'Di qué guarda esta carpeta',
  'memory.consolidating': 'Ordenando…',
  'memory.consolidate': 'Ordenar',
  'memory.consolidateHint': 'Ordena la memoria con {model}',
  'memory.addFirst': 'Añade antes una nota',
  'memory.newToday': {
    one: '{count} nueva desde el orden de hoy',
    other: '{count} nuevas desde el orden de hoy',
  },
  'memory.newSince': {
    one: '{count} nueva desde el {date}',
    other: '{count} nuevas desde el {date}',
  },
  'memory.upToDate': 'Al día',
  'memory.reportLabel': 'Lo que cambió al ordenar',
  'memory.consolidatedOn': 'Ordenada el {date}',
  'memory.nothingChanged': 'No cambió nada',
  'memory.alreadyTidy': 'Ya estaba ordenada',
  'memory.undo': 'Deshacer',
  'memory.openInMemory': 'Abrir en la memoria',
  'memory.nothingNeeded': 'No hacía falta cambiar nada.',
  'memory.skippedSome': {
    one: 'Se omitió un cambio propuesto que no se podía hacer.',
    other: 'Se omitieron {count} cambios propuestos que no se podían hacer.',
  },
  'memory.skippedAll': {
    one: 'El modelo propuso un cambio, pero no se podía hacer.',
    other: 'El modelo propuso {count} cambios, pero no se podía hacer ninguno.',
  },
  'memory.writesLabel': 'Cambios en la memoria',
  'memory.takenBack': 'Deshecho:',
  'memory.write.added': 'Recordado',
  'memory.write.updated': 'Actualizado',
  'memory.write.forgotten': 'Olvidado',
  'memory.was': '(antes: {text})',
  'memory.undoNamed': 'Deshacer: {note}',
  'memory.records': 'Sesiones de estudio',
  'memory.recordsHint':
    'Las sesiones de estudio aparecen aquí solas, con su progreso leído en directo del chat.',
  'memory.record.finished': 'Terminada el {date}',
  'memory.record.progress': '{done} de {count} hechos · último estudio el {date}',

  // Notices: the toasts that say something went right or wrong
  'notice.invalidKey': 'Se rechazó esa clave. Revísala en Ajustes › Conexiones.',
  'notice.expiredKey': 'Esa clave ha caducado. Añade una nueva en Ajustes › Conexiones.',
  'notice.rateLimited':
    'El proveedor está limitando las peticiones. Espera un momento y vuelve a intentarlo.',
  'notice.missingSearchKey': 'Esta búsqueda necesita una clave. Añádela en Ajustes › Conexiones.',
  'notice.searchUnavailable':
    'La búsqueda web no está disponible en este chat; se responde sin ella.',
  'notice.unknownEndpoint':
    'Este chat usa un servidor que ya no existe. Vuelve a añadirlo en Ajustes › Conexiones, o elige otro modelo.',
  'notice.exportedChats': 'Se exportaron tus chats.',
  'notice.planApplyFailed': 'No se pudo aplicar el plan. Inténtalo de nuevo.',
  'notice.planChangesFailed': 'No se pudo enviar tu sugerencia. Inténtalo de nuevo.',
  'notice.copyFailed': 'No se pudo copiar: el navegador bloqueó el portapapeles.',
  'notice.replyInOtherTab':
    'Otra pestaña está escribiendo una respuesta en este chat. Envía cuando termine, para que las dos pestañas muestren el mismo chat.',
  'notice.saveFailed':
    'No se pudo guardar la respuesta en este navegador. Está en pantalla, pero podría quedar cortada al recargar.',
  'notice.consolidationFailed':
    'No se pudo ordenar la memoria. No cambió nada; inténtalo de nuevo en un momento.',
  'notice.consolidationUnreadable':
    'Este modelo no pudo proponer cambios. No cambió nada. Prueba con otro modelo.',
  'notice.consolidationUndone': 'Orden deshecho.',
  'notice.consolidationStale':
    'La memoria cambió mientras se ordenaba, así que no cambió nada. Vuelve a ordenarla.',
  'notice.consolidationPartlyUndone':
    'Se deshizo el orden, salvo lo que ha cambiado desde entonces, que se quedó como estaba.',
  'notice.memoryChangedSince':
    'Esta nota ha cambiado desde entonces. Edítala en la página Memoria.',
  'notice.memoryAlreadyForgotten':
    'Esta nota ya está olvidada. Espera en Olvidadas hace poco, en la página Memoria.',
  'notice.consolidationNoModel':
    'Conecta un modelo en Ajustes › Conexiones para ordenar la memoria.',
  'notice.replacedReplyChangedMemory':
    'La respuesta que reemplazaste había cambiado tu memoria. Esas notas se quedan como están; revísalas en la página Memoria.',
  'notice.unreachable':
    'No se pudo conectar con el proveedor. Revisa tu conexión, o que tu servidor local esté encendido.',
  'notice.timedOut': 'La petición tardó demasiado. Inténtalo de nuevo.',
  'notice.cutOff': 'La conexión se cerró antes de que terminara la respuesta. Inténtalo de nuevo.',
  'notice.stalled':
    'El proveedor dejó de enviar, así que la respuesta se detuvo. Inténtalo de nuevo.',
  'notice.unknownError': 'Algo salió mal y el proveedor no dijo qué.',
  'notice.outOfCredit':
    'Tu cuenta con el proveedor se quedó sin saldo. Añade saldo en su web y vuelve a intentarlo.',
  'notice.modelNotFound': 'El proveedor no tiene este modelo. Elige otro y vuelve a intentarlo.',
  'notice.providerDown':
    'El proveedor tuvo un problema por su parte. Inténtalo de nuevo en un momento, o elige otro modelo.',
  'notice.requestRefused':
    'El proveedor no pudo atender esta petición. Inténtalo de nuevo, o elige otro modelo.',
  'notice.tryAgainSoon': 'Inténtalo de nuevo en un momento.',
  'notice.providerError': 'El proveedor del modelo devolvió un error',
  'notice.modelListFailed': 'No se pudo cargar la lista de modelos',
  'notice.emptyResponse': 'El proveedor envió una respuesta vacía',
  'notice.kind.image': 'imágenes',
  'notice.kind.audio': 'audio',
  'notice.kind.pdf': 'PDF',
  'notice.droppedOne': 'Se dejó fuera porque este modelo no lo acepta: {list}.',
  'notice.droppedMany': 'Se dejaron fuera porque este modelo no los acepta: {list}.',
  'notice.noModelsOffered': '{servers} no ofreció ningún modelo.',
  'zdr.blocked':
    '{model} no garantiza la retención cero de datos. Elige otro modelo, o desactiva Solo retención cero de datos en Ajustes › Modelos.',
  'zdr.unavailable':
    'No se pudo comprobar qué proveedores no guardan datos. Revisa tu conexión, o desactiva Solo retención cero de datos en Ajustes › Modelos.',

  // Attaching files
  'attach.kinds.all': 'imágenes, audio (mp3/wav) o PDF',
  'attach.kinds.images': 'imágenes o PDF',
  'attach.kinds.audio': 'audio (mp3/wav) o PDF',
  'attach.kinds.pdf': 'PDF',
  'attach.aFile': 'un archivo',
  'attach.tooLarge': 'demasiado grande, máximo {max} MB',
  'attach.perMessage': 'como mucho {limit} por mensaje',
  'attach.pdfs': { one: '{count} PDF', other: '{count} PDF' },
  'attach.images': { one: '{count} imagen', other: '{count} imágenes' },
  'attach.audioFiles': { one: '{count} archivo de audio', other: '{count} archivos de audio' },
  'attach.imageTypes': 'solo imágenes PNG, JPEG, WebP o GIF',
  'attach.audioTypes': 'solo audio mp3 o wav',
  'attach.modelTakes': 'este modelo acepta {kinds}',
  'attach.notAttached': 'No adjuntados: {files}.',
  'attach.hint': 'Adjuntar {kinds}',

  // Search errors, as the reasoning line shows them
  'searchError.failed': 'La búsqueda falló.',
  'searchError.tooLong': 'La búsqueda tardó demasiado.',
  'searchError.pageTooLong': 'La página tardó demasiado en cargar.',
  'searchError.unreachable': 'No se pudo conectar con {service}.',
  'searchError.openrouter.key': 'OpenRouter no aceptó la clave. Revísala en Ajustes › Conexiones.',
  'searchError.openrouter.credit': 'La cuenta de OpenRouter se ha quedado sin saldo.',
  'searchError.openrouter.limited':
    'OpenRouter está limitando las peticiones ahora mismo. Inténtalo de nuevo en un momento.',
  'searchError.openrouter.trouble': 'OpenRouter tiene problemas ahora mismo. Inténtalo más tarde.',
  'searchError.openrouter.failed': 'OpenRouter no pudo hacer esta búsqueda.',
  'searchError.reader.busy': 'El lector de páginas gratuito está ocupado. Inténtalo en un minuto.',
  'searchError.reader.forbidden': 'El lector de páginas no tiene permiso para abrir esta página.',
  'searchError.reader.failed': 'El lector de páginas no pudo abrir esta página.',
  'searchError.reader.couldNot': 'No se pudo leer esta página.',
  'searchError.reader.unreachable': 'No se pudo conectar con el lector de páginas.',
  'searchError.tavily.key':
    'Tavily no aceptó la clave de búsqueda. Revísala en Ajustes › Conexiones.',
  'searchError.tavily.limited':
    'Tavily está limitando las búsquedas ahora mismo. Inténtalo de nuevo en un momento.',
  'searchError.tavily.plan': 'El plan de Tavily ha llegado a su límite de búsquedas.',
  'searchError.tavily.trouble': 'Tavily tiene problemas ahora mismo. Inténtalo más tarde.',
  'searchError.tavily.search': 'Tavily no pudo hacer esta búsqueda.',
  'searchError.tavily.fetch': 'Tavily no pudo traer esta página.',
};

export default messages;
