/**
 * Pipeline de vídeo dirigido (planos -> clipes -> montagem). Exposto em
 * `@lms/media/compose` (subcaminho) para que o app web não carregue satori/resvg.
 */
export * from './ffmpeg';
export * from './slides';
export * from './audio';
export * from './compose';
export * from './captions';
export * from './layout';
export * from './place';
export * from './bumper';
export * from './watermark';
export * from './panel';
export * from './zones';
export * from './loudness';
