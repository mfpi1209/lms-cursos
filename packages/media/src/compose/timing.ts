/**
 * Tempos da cena SEM desenho nem ffmpeg (funções puras): legenda WebVTT -> palavras com tempo, passos da tela simulada
 * no ritmo da fala, divisão da narração entre as telas e agenda do painel de tópicos. Exposto em `@lms/media/timing`
 * para o estúdio (revisão "Assistir e marcar") usar a MESMA conta da montagem sem carregar satori/resvg/ffmpeg.
 */
export { parseWebVtt, wordsFromCues, type CaptionCue, type CaptionWord } from './captions';
export * from './screen-mock-schedule';
export { MOCK_MIN_SEC, splitMockDurations } from './screen-split';
export { ZONE_PANEL, scheduleZonePanel, zonePanelDrift, type ZonePanelStep, type ZonePanelTopic } from './zone-panel-schedule';
