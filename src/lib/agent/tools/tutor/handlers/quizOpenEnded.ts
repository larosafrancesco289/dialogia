import { createQuizHandler } from '@/lib/agent/tools/tutor/handlers/quiz';
import { TutorQuizOpenEndedToolSchema } from '@/lib/schemas/tutor';

export const quizOpenEndedHandler = createQuizHandler('openEnded', TutorQuizOpenEndedToolSchema);
