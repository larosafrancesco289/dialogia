import { createQuizHandler } from '@/lib/agent/tools/tutor/handlers/quiz';
import { TutorQuizFillBlankToolSchema } from '@/lib/schemas/tutor';

export const quizFillBlankHandler = createQuizHandler('fillBlank', TutorQuizFillBlankToolSchema);
