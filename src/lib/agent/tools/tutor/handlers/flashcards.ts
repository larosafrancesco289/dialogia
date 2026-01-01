import { createQuizHandler } from '@/lib/agent/tools/tutor/handlers/quiz';
import { TutorFlashcardsToolSchema } from '@/lib/schemas/tutor';

export const flashcardsHandler = createQuizHandler('flashcards', TutorFlashcardsToolSchema);
