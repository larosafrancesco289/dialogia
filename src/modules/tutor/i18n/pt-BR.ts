// Português (Brasil). Typed from the English source (en.ts); GLOSSARY.md keeps the words
// used throughout. Informal address, plain words, the app's warm voice.

import type en from './en';
import type { Translation } from '@/lib/i18n/catalogue';

const messages: Translation<typeof en> = {
  // How a topic stands
  'status.done': 'Concluído',
  'status.skipped': 'Deixado por ora',
  'status.inProgress': 'Em andamento',
  'status.startsAfter': 'Começa depois de {topics}',
  'status.quoted': '“{name}”',
  'status.upNext': 'O próximo',
  'status.notStarted': 'Não começado',
  'status.due': 'Para revisar',
  'idea.youThought': 'Você achava que {belief}',

  // The Learning Hub
  'hub.goal': 'Seu objetivo',
  'hub.topicsDone': {
    one: '{done} de {count} tema concluído',
    other: '{done} de {count} temas concluídos',
  },
  'hub.hours': { one: 'cerca de {count} hora no total', other: 'cerca de {count} horas no total' },
  'hub.hint':
    'Cada porcentagem é a estimativa do tutor de quanto você sabe daquele tema. Abra um tema para ver por quê.',
  'hub.hintCorrect':
    'Cada porcentagem é a estimativa do tutor de quanto você sabe daquele tema. Abra um tema para ver por quê, ou para corrigi-la.',
  'hub.toClear': { one: '{count} ponto para esclarecer', other: '{count} pontos para esclarecer' },
  'hub.objectives': 'Você vai conseguir',
  'hub.seemsWrong': 'Parece errado?',
  'hub.correct': 'Corrigir a estimativa',
  'hub.tooHigh': 'Alta demais',
  'hub.tooLow': 'Baixa demais',
  'hub.toClearLabel': 'Para esclarecer',
  'hub.gotIt': 'Agora entendi',
  'hub.startsOnce': 'Começa quando você terminar {topics}.',
  'hub.title': 'Trilha',
  'hub.open': 'Abrir a trilha',
  'hub.close': 'Fechar a trilha',
  'hub.labelWith': 'Trilha: {detail}',
  'hub.topicsOf': { one: '{done} de {count} tema', other: '{done} de {count} temas' },
  'hub.editing': 'Editando o plano',
  'hub.proposed': 'Plano proposto',
  'hub.done': 'Pronto',
  'hub.editPlan': 'Editar o plano',

  // Coming back to topics studied a while ago
  'review.title': 'Hora de revisar',
  'review.hint': 'Algumas perguntas rápidas agora ajudam você a guardar o que aprendeu.',
  'review.studiedToday': 'Estudado hoje',
  'review.studied': { one: 'Estudado há {count} dia', other: 'Estudado há {count} dias' },
  'review.now': 'Revisar agora',
  'why.title': 'Por que {percent}',
  'why.starting': 'Estimativa inicial',
  'why.carriedBefore': 'Trazida de antes',
  'why.now': 'Agora',
  'why.morePractice': 'Você pediu mais prática',
  'why.markedKnown': 'Você marcou como já sabido',
  'why.corrected': 'Você corrigiu',
  'why.told': 'Você contou ao tutor',
  'why.byTutor': 'Definida pelo tutor',

  // Margin notes and "Why N%": what moved an estimate
  'carried.elsewhere': '{topic} em outra sessão de estudo',
  'carried.inChat': '{topic} em {title}',
  'carried.plain': 'Trazida de {from} ({estimate}, {date}).',
  'carried.capped':
    'Trazida de {from} ({estimate}, {date}), limitada a {cap} até você responder {questions} perguntas aqui.',
  'note.fromBefore': 'Pelo que você disse antes do plano',
  'note.markedKnown': 'Marcado como já sabido.',
  'note.you': 'Você ',
  'note.quizRight': 'Você acertou uma pergunta do quiz: “{question}”',
  'note.quizWrong': 'Você errou uma pergunta do quiz: “{question}”',
  'note.checkRight': 'Você acertou uma pergunta da verificação rápida: “{question}”',
  'note.checkWrong': 'Você errou uma pergunta da verificação rápida: “{question}”',
  'note.quizOneRight': 'Acertou a pergunta do quiz',
  'note.quizOneMissed': 'Errou a pergunta do quiz',
  'note.checkOneRight': 'Acertou a pergunta da verificação rápida',
  'note.checkOneMissed': 'Errou a pergunta da verificação rápida',
  'note.quizScore': {
    one: 'Acertou {right} de {count} pergunta do quiz',
    other: 'Acertou {right} de {count} perguntas do quiz',
  },
  'note.checkScore': {
    one: 'Acertou {right} de {count} pergunta da verificação rápida',
    other: 'Acertou {right} de {count} perguntas da verificação rápida',
  },
  'note.feltHigh': 'Você disse que a estimativa parecia alta demais',
  'note.feltLow': 'Você disse que a estimativa parecia baixa demais',
  'common.close': 'Fechar',
  'common.cancel': 'Cancelar',
  'common.previous': 'Anterior',
  'common.next': 'Próxima',

  // Learn: starting and leaving a learning session
  'learn.label': 'Aprender',
  'learn.chat': 'Conversar',
  'learn.mode': 'Modo',
  'learn.forcedHint': 'Toda conversa é uma sessão de estudo (Configurações › Tutor)',
  'learn.leaveHint':
    'Sair desta sessão de estudo. Ela fica no seu histórico, e uma nova conversa abre.',
  'learn.startHint':
    'Começar uma sessão de estudo. Ela abre como uma nova conversa; esta fica no seu histórico.',
  'learn.forced': 'Toda conversa é uma sessão de estudo',
  'learn.tapToLeave': 'Em uma sessão de estudo; toque para sair',
  'learn.start': 'Começar uma sessão de estudo',

  // Editing the plan in the Hub
  'revise.hint': 'Para adicionar, tirar ou reordenar temas, peça ao tutor.',
  'revise.ask': 'Pedir mudanças ao tutor',
  'revise.confirm': 'Pular e seguir?',
  'revise.skip': 'Pular',
  'revise.next': 'Fazer este depois',
  'revise.known': 'Já sei isto',
  'revise.reopen': 'Retomar',
  'plan.applying': 'Aplicando…',
  'plan.approve': 'Aprovar o plano',
  'plan.suggest': 'Sugerir mudanças',

  // A plan proposal
  'plan.approved': 'Aprovado',
  'plan.changesRequested': 'Mudanças pedidas',
  'plan.revisedBelow': 'Revisado abaixo',
  'plan.hours': { one: 'Cerca de {count} hora', other: 'Cerca de {count} horas' },
  'plan.recording': 'Registrando…',
  'plan.viewFull': 'Ver o plano completo',

  // The end of a topic
  'chapter.label': 'Fim do tema: {name}',
  'chapter.kicker': 'Tema {at} de {count} concluído',
  'chapter.estimate': 'Você está em {percent} neste tema.',
  'chapter.ready': 'Vamos seguir?',
  'chapter.last': 'Esse era o último tema do plano.',
  'chapter.goOn': 'Seguir: {topic}',
  'chapter.morePractice': 'Antes, mais prática',
  'chapter.back': 'De volta para praticar mais',
  'chapter.finishedAt': 'Concluído em {percent}',
  'chapter.finished': 'Concluído',
  'chapter.next': 'Depois: {topic}',

  // Cards in a tutor's reply
  'cards.plan': 'Plano de estudo',
  'cards.revisedPlan': 'Plano revisado',
  'cards.beforeStart': 'Antes de começar',
  'cards.exercises': 'Exercícios',
  'cards.refresher': 'Revisão',

  // Quizzes and the quick check
  'quiz.question': 'Pergunta {at} de {count}',
  'quiz.questionNumber': 'Pergunta {number}',
  'quiz.correct': 'Certo',
  'quiz.notQuite': 'Não exatamente',
  'quiz.check': 'Verificar',
  'quiz.rightAnswer': 'Resposta certa',
  'quiz.yourAnswer': 'Sua resposta',
  'diagnostic.title': 'Uma verificação rápida sobre {topic}',
  'diagnostic.why': 'Para o tutor saber por onde começar.',
  'diagnostic.score': { one: '{right} de {count} certa', other: '{right} de {count} certas' },

  // The opening questions
  'intake.title': 'Me conte seus objetivos',
  'intake.thanks': 'Obrigado. O plano vai ser montado em cima disso.',
  'intake.skippedHint': 'Puladas. O tutor seguiu sem essas respostas.',
  'intake.chooseAny': 'Escolha todas as que combinam com você.',
  'intake.chooseOne': 'Escolha uma.',
  'intake.sent': 'Respostas enviadas',
  'intake.skipped': 'Puladas',
  'intake.sending': 'Enviando…',
  'intake.send': 'Enviar as respostas',

  // Margin notes beside a reply
  'margin.label': 'O que o tutor anotou',
  'margin.change': 'de {from} para {to}',
  'margin.more': { one: '+{count} a mais', other: '+{count} a mais' },
  'margin.now': 'Agora {percent}.',

  // Asking the tutor to change the plan
  'feedback.title': 'Diga ao tutor o que mudar',
  'feedback.about': 'Sobre {topic}',
  'feedback.placeholderTopic':
    'Aprofundar algo antes de seguir, reordenar os temas, ou incluir uma base se {topic} parecer avançado demais.',
  'feedback.placeholder': 'Mais prática no básico, pular o que você já sabe, ou um foco diferente.',
  'feedback.hint': 'Sua nota aparece na conversa, e o tutor responde com um plano revisado.',
  'feedback.shortcut': '{key} Enter para enviar',
  'feedback.send': 'Enviar ao tutor',

  // Settings › Tutor
  'settings.title': 'Tutor',
  'settings.newest': 'Sempre a versão mais nova',
  'settings.offer': 'Oferecer Aprender',
  'settings.offerHint':
    'Aprender fica ao lado de Conversar: um tutor monta com você um curso curto, ensina e confere o que você sabe com perguntas rápidas.',
  'settings.always': 'Sempre aprender',
  'settings.alwaysHint': 'Toda conversa é uma sessão de estudo. Conversar não é oferecido.',
  'settings.follow': 'Seguir o tutor',
  'settings.followHint': 'Rolar até a última mensagem enquanto o tutor responde.',
  'settings.model': 'Modelo do tutor',
  'settings.searchModel': 'Procurar outro modelo',
  'settings.searchModelLabel': 'Procurar um modelo para o tutor',
  'settings.modelHint': 'Todas as sessões de estudo usam este modelo.',
  'settings.howItWorks':
    'Cada sessão de estudo monta um plano a partir da sua primeira mensagem e acompanha o que você sabe ao longo do caminho. O tutor passa para o próximo tema quando você quiser.',

  // The tutor's greeting at the top of a learning session
  'welcome.first':
    'Me conte o que você quer aprender, e por quê. Vou esboçar um plano para nós, você pode mudá-lo, e enquanto trabalhamos vamos acompanhar o que você já sabe. Se tiver anotações ou leituras, adicione e eu trabalho com elas também.',
  'welcome.goal': '“{goal}”',
  'welcome.back': 'Que bom te ver de novo',
  'welcome.finished': 'Terminamos o plano para {goal}',
  'welcome.goBack': 'Podemos revisar qualquer parte, ou definir um novo objetivo',
  'welcome.notesWelcome': 'Novas anotações ou leituras também são bem-vindas',
  'welcome.workingToward': 'Estamos trabalhando rumo a {goal}',
  'welcome.nextWithDescription': 'O próximo foco é {topic}: {description}',
  'welcome.next': 'O próximo foco é {topic}',
  'welcome.ask': 'Faça uma pergunta, ou peça prática, quando quiser',
  'welcome.addNotes': 'Você pode adicionar anotações ou leituras a qualquer momento',

  // The learner's actions, as lines in the transcript
  'ledger.score': { one: '{right} de {count} certa', other: '{right} de {count} certas' },
  'ledger.intake': 'Respondi as perguntas iniciais',
  'ledger.quiz': 'Respondi o quiz: {score}',
  'ledger.diagnostic': 'Terminei a verificação rápida: {score}',
  'ledger.approved': 'Aprovei o plano',
  'ledger.declined': 'Pedi mudanças no plano: {feedback}',
  'ledger.goingOn': 'Seguindo: {topic}',
  'ledger.morePractice': 'Pedi mais prática: {topic}',
  'ledger.started': 'Escolhi o próximo: {topic}',
  'ledger.reopened': 'Retomei um tema: {topic}',
  'ledger.markedKnown': 'Marquei como já sabido: {topic}',
  'ledger.tooHigh': 'Disse que a estimativa parecia alta demais: {topic}',
  'ledger.tooLow': 'Disse que a estimativa parecia baixa demais: {topic}',
  'ledger.clearedUp': 'Marquei como esclarecido: {idea}',
  'ledger.review': 'Pedi para revisar: {topics}',
  'notice.saveFailed':
    'Não foi possível salvar o progresso do tutor. Ele fica nesta aba e vai ser salvo de novo na próxima mudança.',
};

export default messages;
