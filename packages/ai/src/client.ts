/**
 * Ponto de entrada seguro para componentes de cliente (navegador): só
 * constantes, tipos e funções puras. Nunca reexporte adaptadores/SDKs aqui —
 * importar `@lms/ai` num componente "use client" embute os SDKs da OpenAI e
 * da Anthropic no bundle do navegador.
 */
export { REVISION_FOCUS, REVISION_FOCUS_LABELS, CAPPED_REVISION_FOCUS, VOICE_REVISION_FOCUS, type RevisionFocus } from './schemas';
export { LESSON_CAPS, outlineTargets, type OutlineTargets } from './lesson-rules';
export * from './evaluation-schema';
export { VIDEO_CAPABILITIES, MAX_SHOT_WORDS, MIN_SHOT_WORDS, MAX_WIDE_SHOTS_PER_SCENE } from './capabilities';
/** comparação de falas por palavras (pontuação e caixa não contam) */
export { sameWords, spokenWords } from '@lms/course-schema';
export * from './assistant-schema';
export { promptSuggestions, computeNextSteps, MAX_NEXT_STEPS, MAX_PROMPT_SUGGESTIONS, NARRATION_VOICE_INSTRUCTION, type MediaQueueItem, type NextStepsOptions } from './next-steps';
