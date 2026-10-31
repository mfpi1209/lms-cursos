/**
 * Contratos de mídia. HeyGen/ElevenLabs/S3 são adapters separados, implementados
 * na fase C. No incremento 1 só existe o contrato — nenhuma integração está pronta.
 */
export type MediaJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled' | 'reconciliation_required';

export * from './storage';

export * from './heygen';
export * from './elevenlabs';
export * from './elevenlabs-sfx';
export * from './bumper-spec';
export * from './brand-tokens';
export * from './simulation';
export * from './scene';
export * from './sniff';
export * from './heygen-looks';
export * from './new-instructor';
export * from './pricing';
