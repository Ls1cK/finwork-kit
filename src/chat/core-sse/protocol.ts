import type { RoundCompletion, RoundTerminalStatus, RoundUsage, WireFrame } from './types.js';

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

export function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function readId(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

export function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function isRoundTerminalStatus(value: unknown): value is RoundTerminalStatus {
  return value === 'success' || value === 'uncompleted' || value === 'cancelled' ||
    value === 'timeout' || value === 'error';
}

export function readCompletion(frame: WireFrame): RoundCompletion | undefined {
  if (!isRoundTerminalStatus(frame.status)) return undefined;
  return {
    status: frame.status,
    message: readId(frame.message),
    durationSeconds: readNumber(frame.duration_seconds),
  };
}

export function readUsage(value: unknown): RoundUsage | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const usage: RoundUsage = {
    input_tokens: readNumber(record.input_tokens),
    output_tokens: readNumber(record.output_tokens),
    total_tokens: readNumber(record.total_tokens),
    usage_percentage: readNumber(record.usage_percentage),
    time: readNumber(record.time),
    execution_time: readNumber(record.execution_time),
    start_time: readString(record.start_time),
    end_time: readString(record.end_time),
    context_length: readNumber(record.context_length),
  };
  return Object.values(usage).some((field) => field !== undefined) ? usage : undefined;
}

export function readSuggestedQuestions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const question = readString(asRecord(item)?.text)?.trim();
    return question ? [question] : [];
  });
}
