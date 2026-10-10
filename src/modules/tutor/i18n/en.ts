// The tutor's source catalogue, in English (see src/lib/i18n/messages/en.ts
// for the conventions). Plain words for learners who are not technical: say
// every state as it is, keep percentages visible, no ornament to decode.

const en = {
  // How a topic stands
  'status.done': 'Done',
  'status.skipped': 'Skipped',
  'status.inProgress': 'In progress',
  'status.startsAfter': 'Starts after {topics}',
  'status.quoted': '“{name}”',
  'status.upNext': 'Up next',
  'status.notStarted': 'Not started',
  'idea.youThought': 'You thought {belief}',

  // The Learning Hub
  'hub.goal': 'Your goal',
  'hub.topicsDone': { one: '{done} of {count} topic done', other: '{done} of {count} topics done' },
  'hub.hours': { one: 'about {count} hour in all', other: 'about {count} hours in all' },
  'hub.hint':
    'Each percentage is the tutor’s estimate of how well you know that topic. Open a topic to see why.',
  'hub.hintCorrect':
    'Each percentage is the tutor’s estimate of how well you know that topic. Open a topic to see why, or to correct it.',
  'hub.toClear': { one: '{count} thing to clear up', other: '{count} things to clear up' },
  'hub.objectives': 'You’ll be able to',
  'hub.seemsWrong': 'Seems wrong?',
  'hub.correct': 'Correct the estimate',
  'hub.tooHigh': 'Too high',
  'hub.tooLow': 'Too low',
  'hub.toClearLabel': 'To clear up',
  'hub.gotIt': 'I’ve got this now',
  'hub.startsOnce': 'Starts once you’ve finished {topics}.',
  'hub.title': 'Learning Hub',
  'hub.open': 'Open Learning Hub',
  'hub.close': 'Close Learning Hub',
  'hub.labelWith': 'Learning Hub: {detail}',
  'hub.topicsOf': { one: '{done} of {count} topic', other: '{done} of {count} topics' },
  'hub.editing': 'Editing the plan',
  'hub.proposed': 'Proposed plan',
  'hub.done': 'Done',
  'hub.editPlan': 'Edit plan',
  'why.title': 'Why {percent}',
  'why.starting': 'Starting estimate',
  'why.carriedBefore': 'Carried over from before',
  'why.now': 'Now',
  'why.morePractice': 'You asked for more practice',
  'why.markedKnown': 'You marked it as known',
  'why.corrected': 'You corrected it',
  'why.told': 'You told the tutor',
  'why.byTutor': 'Set by the tutor',

  // Margin notes and "Why N%": what moved an estimate
  'carried.elsewhere': '{topic} in another learning session',
  'carried.inChat': '{topic} in {title}',
  'carried.plain': 'Carried over from {from} ({estimate}, {date}).',
  'carried.capped':
    'Carried over from {from} ({estimate}, {date}), capped at {cap} until you answer {questions} questions here.',
  'note.fromBefore': 'From what you said before the plan',
  'note.markedKnown': 'Marked as already known.',
  'note.you': 'You ',
  'note.quizRight': 'You answered a quiz question correctly: “{question}”',
  'note.quizWrong': 'You missed a quiz question: “{question}”',
  'note.checkRight': 'You answered a quick check question correctly: “{question}”',
  'note.checkWrong': 'You missed a quick check question: “{question}”',
  'note.quizOneRight': 'Got the quiz question right',
  'note.quizOneMissed': 'Missed the quiz question',
  'note.checkOneRight': 'Got the quick check question right',
  'note.checkOneMissed': 'Missed the quick check question',
  'note.quizScore': {
    one: 'Got {right} of {count} quiz question right',
    other: 'Got {right} of {count} quiz questions right',
  },
  'note.checkScore': {
    one: 'Got {right} of {count} quick check question right',
    other: 'Got {right} of {count} quick check questions right',
  },
  'note.feltHigh': 'You said the estimate felt too high',
  'note.feltLow': 'You said the estimate felt too low',
  'common.close': 'Close',
  'common.cancel': 'Cancel',
  'common.previous': 'Previous',
  'common.next': 'Next',

  // Learn: starting and leaving a learning session
  'learn.label': 'Learn',
  'learn.chat': 'Chat',
  'learn.mode': 'Mode',
  'learn.forcedHint': 'Every chat is a learning session (Settings › Tutor)',
  'learn.leaveHint': 'Leave this learning session. It stays in your history, and a new chat opens.',
  'learn.startHint':
    'Start a learning session. It opens as a new chat; this one stays in your history.',
  'learn.forced': 'Every chat is a learning session',
  'learn.tapToLeave': 'In a learning session; tap to leave',
  'learn.start': 'Start a learning session',

  // Editing the plan in the Hub
  'revise.hint': 'To add, remove or reorder topics, ask the tutor.',
  'revise.ask': 'Ask the tutor for changes',
  'revise.confirm': 'Skip it and move on?',
  'revise.skip': 'Skip it',
  'revise.next': 'Do this next',
  'revise.known': 'I know this',
  'revise.reopen': 'Take it up again',
  'plan.applying': 'Applying…',
  'plan.approve': 'Approve plan',
  'plan.suggest': 'Suggest changes',

  // A plan proposal
  'plan.approved': 'Approved',
  'plan.changesRequested': 'Changes requested',
  'plan.revisedBelow': 'Revised below',
  'plan.hours': { one: 'About {count} hour', other: 'About {count} hours' },
  'plan.recording': 'Recording…',
  'plan.viewFull': 'View full plan',

  // The end of a topic
  'chapter.label': 'End of topic: {name}',
  'chapter.kicker': 'Topic {at} of {count} finished',
  'chapter.estimate': 'You’re at {percent} on this topic.',
  'chapter.ready': 'Ready to move on?',
  'chapter.last': 'That was the last topic in the plan.',
  'chapter.goOn': 'Go on: {topic}',
  'chapter.morePractice': 'More practice first',
  'chapter.back': 'Back for more practice',
  'chapter.finishedAt': 'Finished at {percent}',
  'chapter.finished': 'Finished',
  'chapter.next': 'Next: {topic}',

  // Cards in a tutor's reply
  'cards.plan': 'Learning plan',
  'cards.revisedPlan': 'Revised plan',
  'cards.beforeStart': 'Before we start',
  'cards.exercises': 'Exercises',

  // Quizzes and the quick check
  'quiz.question': 'Question {at} of {count}',
  'quiz.questionNumber': 'Question {number}',
  'quiz.correct': 'Correct',
  'quiz.notQuite': 'Not quite',
  'diagnostic.title': 'A quick check on {topic}',
  'diagnostic.why': 'So the tutor knows where to start.',
  'diagnostic.score': { one: '{right} of {count} right', other: '{right} of {count} right' },

  // The opening questions
  'intake.title': 'Tell me about your goals',
  'intake.thanks': 'Thank you. The plan will be shaped around this.',
  'intake.skippedHint': 'Skipped. The tutor went on without these answers.',
  'intake.chooseAny': 'Choose any that fit you.',
  'intake.chooseOne': 'Choose one.',
  'intake.sent': 'Answers sent',
  'intake.skipped': 'Skipped',
  'intake.sending': 'Sending…',
  'intake.send': 'Send answers',

  // Margin notes beside a reply
  'margin.label': 'What the tutor noted',
  'margin.change': '{from} to {to}',
  'margin.more': { one: '+{count} more', other: '+{count} more' },
  'margin.now': 'Now {percent}.',

  // Asking the tutor to change the plan
  'feedback.title': 'Tell the tutor what to change',
  'feedback.about': 'About {topic}',
  'feedback.placeholderTopic':
    'Go deeper on something before moving on, reorder the topics, or add groundwork if {topic} feels too advanced.',
  'feedback.placeholder':
    'More practice on the fundamentals, skipping what you already know, or a different focus.',
  'feedback.hint': 'Your note appears in the chat, and the tutor answers with a revised plan.',
  'feedback.shortcut': '{key} Enter to send',
  'feedback.send': 'Send to tutor',

  // Settings › Tutor
  'settings.title': 'Tutor',
  'settings.newest': 'Always the newest release',
  'settings.offer': 'Offer Learn',
  'settings.offerHint':
    'Learn sits beside Chat: a tutor plans a short course with you, teaches it, and checks what you know with quick questions.',
  'settings.always': 'Always learn',
  'settings.alwaysHint': 'Every chat is a learning session. Chat is not offered.',
  'settings.follow': 'Follow the tutor',
  'settings.followHint': 'Scroll to the latest message while the tutor responds.',
  'settings.model': 'Tutor model',
  'settings.searchModel': 'Search for another model',
  'settings.searchModelLabel': 'Search for a tutor model',
  'settings.modelHint': 'Every learning session uses this model.',
  'settings.howItWorks':
    'Each learning session drafts a plan from your first message and keeps track of what you know as you go. The tutor moves on to the next topic when you are ready.',

  // The tutor's greeting at the top of a learning session
  'welcome.first':
    "Tell me what you want to learn, and why. I'll sketch a plan for us, you can reshape it, and as we work we'll keep track of what you know. If you have notes or readings, add them and I'll work from those too.",
  'welcome.goal': '"{goal}"',
  'welcome.back': 'Welcome back',
  'welcome.finished': "We've finished the plan for {goal}",
  'welcome.goBack': 'We can go back over any part of it, or set a new goal',
  'welcome.notesWelcome': 'New notes or readings are welcome too',
  'welcome.workingToward': "We're working toward {goal}",
  'welcome.nextWithDescription': 'Our next focus is {topic}: {description}',
  'welcome.next': 'Our next focus is {topic}',
  'welcome.ask': "Ask a question, or ask for practice, whenever you're ready",
  'welcome.addNotes': 'You can add notes or readings at any point',

  // The learner's actions, as lines in the transcript
  'ledger.score': { one: '{right} of {count} right', other: '{right} of {count} right' },
  'ledger.intake': 'Answered the opening questions',
  'ledger.quiz': 'Answered the quiz: {score}',
  'ledger.diagnostic': 'Finished the quick check: {score}',
  'ledger.approved': 'Approved the plan',
  'ledger.declined': 'Asked for changes to the plan: {feedback}',
  'ledger.goingOn': 'Going on: {topic}',
  'ledger.morePractice': 'Asked for more practice: {topic}',
  'ledger.started': 'Chose what comes next: {topic}',
  'ledger.reopened': 'Took a topic up again: {topic}',
  'ledger.markedKnown': 'Marked as known: {topic}',
  'ledger.tooHigh': 'Said the estimate felt too high: {topic}',
  'ledger.tooLow': 'Said the estimate felt too low: {topic}',
  'ledger.clearedUp': 'Marked as cleared up: {idea}',
  'notice.saveFailed':
    'Tutor progress could not be saved. It holds in this tab and will be retried with the next change.',
} as const;

export default en;
