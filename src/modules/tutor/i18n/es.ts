// Español. Typed from the English source (en.ts); GLOSSARY.md keeps the words
// used throughout. Informal address, plain words, the app's warm voice.

import type en from './en';
import type { Translation } from '@/lib/i18n/catalogue';

const messages: Translation<typeof en> = {
  // How a topic stands
  'status.done': 'Hecho',
  'status.skipped': 'Saltado',
  'status.inProgress': 'En curso',
  'status.startsAfter': 'Empieza después de {topics}',
  'status.quoted': '«{name}»',
  'status.upNext': 'El siguiente',
  'status.notStarted': 'Sin empezar',
  'idea.youThought': 'Pensabas que {belief}',

  // The Learning Hub
  'hub.goal': 'Tu objetivo',
  'hub.topicsDone': {
    one: '{done} de {count} tema hecho',
    other: '{done} de {count} temas hechos',
  },
  'hub.hours': {
    one: 'aproximadamente {count} hora en total',
    other: 'unas {count} horas en total',
  },
  'hub.hint':
    'Cada porcentaje es la estimación del tutor de lo bien que conoces ese tema. Abre un tema para ver por qué.',
  'hub.hintCorrect':
    'Cada porcentaje es la estimación del tutor de lo bien que conoces ese tema. Abre un tema para ver por qué, o para corregirla.',
  'hub.toClear': { one: '{count} cosa por aclarar', other: '{count} cosas por aclarar' },
  'hub.objectives': 'Podrás',
  'hub.seemsWrong': '¿No te cuadra?',
  'hub.correct': 'Corregir la estimación',
  'hub.tooHigh': 'Demasiado alta',
  'hub.tooLow': 'Demasiado baja',
  'hub.toClearLabel': 'Por aclarar',
  'hub.gotIt': 'Ya lo tengo claro',
  'hub.startsOnce': 'Empieza cuando termines {topics}.',
  'hub.title': 'Recorrido',
  'hub.open': 'Abrir el recorrido',
  'hub.close': 'Cerrar el recorrido',
  'hub.labelWith': 'Recorrido: {detail}',
  'hub.topicsOf': { one: '{done} de {count} tema', other: '{done} de {count} temas' },
  'hub.editing': 'Editando el plan',
  'hub.proposed': 'Plan propuesto',
  'hub.done': 'Listo',
  'hub.editPlan': 'Editar el plan',
  'why.title': 'Por qué {percent}',
  'why.starting': 'Estimación inicial',
  'why.carriedBefore': 'Traída de antes',
  'why.now': 'Ahora',
  'why.morePractice': 'Pediste más práctica',
  'why.markedKnown': 'Lo marcaste como sabido',
  'why.corrected': 'La corregiste tú',
  'why.told': 'Se lo dijiste al tutor',
  'why.byTutor': 'La fijó el tutor',

  // Margin notes and "Why N%": what moved an estimate
  'carried.elsewhere': '{topic} en otra sesión de estudio',
  'carried.inChat': '{topic} en {title}',
  'carried.plain': 'Traída de {from} ({estimate}, {date}).',
  'carried.capped':
    'Traída de {from} ({estimate}, {date}), con tope en {cap} hasta que respondas aquí {questions} preguntas.',
  'note.fromBefore': 'Por lo que dijiste antes del plan',
  'note.markedKnown': 'Marcado como ya sabido.',
  'note.you': 'Tú ',
  'note.quizRight': 'Acertaste una pregunta del quiz: «{question}»',
  'note.quizWrong': 'Fallaste una pregunta del quiz: «{question}»',
  'note.checkRight': 'Acertaste una pregunta de la comprobación rápida: «{question}»',
  'note.checkWrong': 'Fallaste una pregunta de la comprobación rápida: «{question}»',
  'note.quizOneRight': 'Acertaste la pregunta del quiz',
  'note.quizOneMissed': 'Fallaste la pregunta del quiz',
  'note.checkOneRight': 'Acertaste la pregunta de la comprobación rápida',
  'note.checkOneMissed': 'Fallaste la pregunta de la comprobación rápida',
  'note.quizScore': {
    one: 'Acertaste {right} de {count} pregunta del quiz',
    other: 'Acertaste {right} de {count} preguntas del quiz',
  },
  'note.checkScore': {
    one: 'Acertaste {right} de {count} pregunta de la comprobación rápida',
    other: 'Acertaste {right} de {count} preguntas de la comprobación rápida',
  },
  'note.feltHigh': 'Dijiste que la estimación te parecía demasiado alta',
  'note.feltLow': 'Dijiste que la estimación te parecía demasiado baja',
  'common.close': 'Cerrar',
  'common.cancel': 'Cancelar',
  'common.previous': 'Anterior',
  'common.next': 'Siguiente',

  // Learn: starting and leaving a learning session
  'learn.label': 'Aprender',
  'learn.chat': 'Chat',
  'learn.mode': 'Modo',
  'learn.forcedHint': 'Cada chat es una sesión de estudio (Ajustes › Tutor)',
  'learn.leaveHint':
    'Salir de esta sesión de estudio. Se queda en tu historial y se abre un chat nuevo.',
  'learn.startHint':
    'Empezar una sesión de estudio. Se abre como un chat nuevo; este se queda en tu historial.',
  'learn.forced': 'Cada chat es una sesión de estudio',
  'learn.tapToLeave': 'En una sesión de estudio; toca para salir',
  'learn.start': 'Empezar una sesión de estudio',

  // Editing the plan in the Hub
  'revise.hint': 'Para añadir, quitar o reordenar temas, pídeselo al tutor.',
  'revise.ask': 'Pedir cambios al tutor',
  'revise.confirm': '¿Saltarlo y seguir?',
  'revise.skip': 'Saltarlo',
  'revise.next': 'Hacer este después',
  'revise.known': 'Ya lo sé',
  'revise.reopen': 'Retomarlo',
  'plan.applying': 'Aplicando…',
  'plan.approve': 'Aprobar el plan',
  'plan.suggest': 'Sugerir cambios',

  // A plan proposal
  'plan.approved': 'Aprobado',
  'plan.changesRequested': 'Cambios pedidos',
  'plan.revisedBelow': 'Revisado más abajo',
  'plan.hours': { one: 'Aproximadamente {count} hora', other: 'Unas {count} horas' },
  'plan.recording': 'Guardando…',
  'plan.viewFull': 'Ver el plan completo',

  // The end of a topic
  'chapter.label': 'Fin del tema: {name}',
  'chapter.kicker': 'Tema {at} de {count} terminado',
  'chapter.estimate': 'Vas por el {percent} en este tema.',
  'chapter.ready': '¿Seguimos?',
  'chapter.last': 'Era el último tema del plan.',
  'chapter.goOn': 'Seguir: {topic}',
  'chapter.morePractice': 'Antes, más práctica',
  'chapter.back': 'De vuelta para practicar más',
  'chapter.finishedAt': 'Terminado al {percent}',
  'chapter.finished': 'Terminado',
  'chapter.next': 'Después: {topic}',

  // Cards in a tutor's reply
  'cards.plan': 'Plan de estudio',
  'cards.revisedPlan': 'Plan revisado',
  'cards.beforeStart': 'Antes de empezar',
  'cards.exercises': 'Ejercicios',

  // Quizzes and the quick check
  'quiz.question': 'Pregunta {at} de {count}',
  'quiz.questionNumber': 'Pregunta {number}',
  'quiz.correct': 'Correcto',
  'quiz.notQuite': 'No exactamente',
  'diagnostic.title': 'Una comprobación rápida sobre {topic}',
  'diagnostic.why': 'Para que el tutor sepa por dónde empezar.',
  'diagnostic.score': { one: '{right} de {count} bien', other: '{right} de {count} bien' },

  // The opening questions
  'intake.title': 'Cuéntame tus objetivos',
  'intake.thanks': 'Gracias. El plan se ajustará a esto.',
  'intake.skippedHint': 'Omitidas. El tutor siguió sin estas respuestas.',
  'intake.chooseAny': 'Elige todas las que encajen contigo.',
  'intake.chooseOne': 'Elige una.',
  'intake.sent': 'Respuestas enviadas',
  'intake.skipped': 'Omitidas',
  'intake.sending': 'Enviando…',
  'intake.send': 'Enviar respuestas',

  // Margin notes beside a reply
  'margin.label': 'Lo que anotó el tutor',
  'margin.change': 'de {from} a {to}',
  'margin.more': { one: '+{count} más', other: '+{count} más' },
  'margin.now': 'Ahora {percent}.',

  // Asking the tutor to change the plan
  'feedback.title': 'Dile al tutor qué cambiar',
  'feedback.about': 'Sobre {topic}',
  'feedback.placeholderTopic':
    'Profundizar en algo antes de seguir, reordenar los temas, o añadir bases si {topic} te parece demasiado avanzado.',
  'feedback.placeholder':
    'Más práctica con lo básico, saltar lo que ya sabes, o un enfoque distinto.',
  'feedback.hint': 'Tu nota aparece en el chat y el tutor responde con un plan revisado.',
  'feedback.shortcut': '{key} Intro para enviar',
  'feedback.send': 'Enviar al tutor',

  // Settings › Tutor
  'settings.title': 'Tutor',
  'settings.newest': 'Siempre la versión más reciente',
  'settings.offer': 'Ofrecer Aprender',
  'settings.offerHint':
    'Aprender está junto a Chat: un tutor prepara contigo un curso corto, te lo enseña y comprueba lo que sabes con preguntas rápidas.',
  'settings.always': 'Aprender siempre',
  'settings.alwaysHint': 'Cada chat es una sesión de estudio. No se ofrece Chat.',
  'settings.follow': 'Seguir al tutor',
  'settings.followHint': 'Bajar hasta el último mensaje mientras responde el tutor.',
  'settings.model': 'Modelo del tutor',
  'settings.searchModel': 'Buscar otro modelo',
  'settings.searchModelLabel': 'Buscar un modelo para el tutor',
  'settings.modelHint': 'Todas las sesiones de estudio usan este modelo.',
  'settings.howItWorks':
    'Cada sesión de estudio prepara un plan a partir de tu primer mensaje y va siguiendo lo que sabes. El tutor pasa al siguiente tema cuando tú quieras.',

  // The tutor's greeting at the top of a learning session
  'welcome.first':
    'Cuéntame qué quieres aprender, y por qué. Esbozaré un plan para los dos, tú puedes cambiarlo, y mientras trabajamos llevaremos la cuenta de lo que sabes. Si tienes apuntes o lecturas, añádelos y trabajaré también con ellos.',
  'welcome.goal': '«{goal}»',
  'welcome.back': 'Hola de nuevo',
  'welcome.finished': 'Hemos terminado el plan para {goal}',
  'welcome.goBack': 'Podemos repasar cualquier parte, o fijar un objetivo nuevo',
  'welcome.notesWelcome': 'Los apuntes o lecturas nuevos también son bienvenidos',
  'welcome.workingToward': 'Estamos trabajando hacia {goal}',
  'welcome.nextWithDescription': 'Lo siguiente es {topic}: {description}',
  'welcome.next': 'Lo siguiente es {topic}',
  'welcome.ask': 'Haz una pregunta, o pide práctica, cuando quieras',
  'welcome.addNotes': 'Puedes añadir apuntes o lecturas en cualquier momento',

  // The learner's actions, as lines in the transcript
  'ledger.score': { one: '{right} de {count} bien', other: '{right} de {count} bien' },
  'ledger.intake': 'He respondido las preguntas iniciales',
  'ledger.quiz': 'He respondido el quiz: {score}',
  'ledger.diagnostic': 'He terminado la comprobación rápida: {score}',
  'ledger.approved': 'He aprobado el plan',
  'ledger.declined': 'He pedido cambios en el plan: {feedback}',
  'ledger.goingOn': 'Sigo con: {topic}',
  'ledger.morePractice': 'He pedido más práctica: {topic}',
  'ledger.started': 'He elegido lo siguiente: {topic}',
  'ledger.reopened': 'He retomado un tema: {topic}',
  'ledger.markedKnown': 'He marcado como sabido: {topic}',
  'ledger.tooHigh': 'He dicho que la estimación me parecía demasiado alta: {topic}',
  'ledger.tooLow': 'He dicho que la estimación me parecía demasiado baja: {topic}',
  'ledger.clearedUp': 'He marcado como aclarado: {idea}',
  'notice.saveFailed':
    'No se pudo guardar el progreso del tutor. Se mantiene en esta pestaña y se volverá a intentar con el próximo cambio.',
};

export default messages;
