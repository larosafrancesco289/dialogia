import { createQuizHandler } from '@/lib/agent/tools/tutor/handlers/quiz';
import { TutorQuizMcqToolSchema } from '@/lib/schemas/tutor';

export const quizMcqHandler = createQuizHandler('mcq', TutorQuizMcqToolSchema);
