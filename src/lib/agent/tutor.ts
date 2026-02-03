// Tutor mode: system preamble and tool definitions
// The tools are presentation-only: the model generates the content and
// supplies it as arguments, which the UI renders as interactive widgets.

import { TUTOR_PREAMBLE } from '@/lib/agent/prompts/tutorPreamble';

export { getTutorToolDefinitions } from '@/lib/tools/registry';
export { buildTutorContextSummary, buildTutorContextFull, getTutorContext } from '@/lib/tutor';

export function getTutorPreamble() {
  return TUTOR_PREAMBLE;
}

// A short, friendly, randomized greeting used when tutor mode is enabled.
export function getTutorGreeting(): string {
  const options = [
    'Hey! What are you working on today? Anything tricky I can help with?',
    'Hi there! How’s your day going? What’s on your plate learning‑wise?',
    'Welcome! What topic are you wrestling with? Feel free to paste notes or upload a PDF.',
    'Good to see you! What would you like to make progress on today?',
    'Howdy! What’s the goal for this session? I’ve got your back.',
    'Quick check‑in: what’s feeling confusing right now? If you have a problem set or slides, drop them in.',
    'Hello hello! What topic should we tackle first? Happy to go step‑by‑step.',
    'Let’s get rolling—what’s on your mind? PDF or examples welcome if that’s easier.',
    'We’ve got this! What are you aiming to understand today?',
    'Warm up question: what would make this session a win for you?',
  ];
  return options[Math.floor(Math.random() * options.length)];
}
