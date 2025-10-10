// Module: services/messagePipeline
// Responsibility: Backwards-compatible shim re-exporting agent pipeline helpers.

export { planTurn } from '@/lib/agent/planning';
export { streamFinal } from '@/lib/agent/streaming';
export { regenerate } from '@/lib/agent/regenerate';
export { setOpenRouterMocksForTests as __setOpenRouterMocksForTests } from '@/lib/agent/pipelineClient';
