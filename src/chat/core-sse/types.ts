import type { AnswerMetadata } from './answer.js';

export type RoundKind = 'ordinary' | 'opc';
export type WireFrame = Readonly<Record<string, unknown> & { type: string }>;

export interface TextPatch {
  readonly mode: 'replace' | 'append';
  readonly text: string;
}

export interface CoreContentBlock {
  readonly id: string;
  readonly type: string;
  readonly content?: string;
}

export interface FrameEvent {
  readonly kind: 'frame';
  readonly frame: WireFrame;
  readonly source: 'stream' | 'history';
  readonly text?: TextPatch;
  readonly order?: number;
}

export interface CustomContentEvent<T extends CoreContentBlock> {
  readonly kind: 'content';
  readonly block: T;
  readonly replyId?: string;
}

export interface InputEndEvent {
  readonly kind: 'input.end';
  readonly reason: 'closed' | 'cancelled' | 'failed';
  readonly error?: string;
}

export interface UserAnswerEvent {
  readonly kind: 'user.answer';
  readonly sourceId: string;
  readonly optionId?: string;
  readonly userMessage?: string;
}

export type RoundEvent<T extends CoreContentBlock = never> =
  | FrameEvent
  | CustomContentEvent<T>
  | InputEndEvent
  | UserAnswerEvent;

export type RoundTerminalStatus = 'success' | 'uncompleted' | 'cancelled' | 'timeout' | 'error';
export type RoundStatus = 'idle' | 'running' | RoundTerminalStatus;

export interface RoundCompletion {
  readonly status: RoundTerminalStatus;
  readonly message?: string;
  readonly durationSeconds?: number;
}

export interface RoundBase extends AnswerMetadata {
  readonly roundKey: string;
  readonly status: RoundStatus;
  readonly error?: string;
  readonly completion?: RoundCompletion;
}

export type RoundIntent = (
  { readonly type: 'browser.open'; readonly url: string } | { readonly type: 'browser.close' }
) & { readonly order?: number };

export interface RoundUpdate<S> {
  readonly state: S;
  readonly intents: readonly RoundIntent[];
}

export interface DecodeFrameOptions<T extends CoreContentBlock = never> {
  readonly source?: 'stream' | 'history';
  readonly mapCustomFrame?: (frame: WireFrame) => CustomContentEvent<T> | undefined;
}

export interface FrameIssue {
  readonly code: 'invalid_json' | 'invalid_frame' | 'unknown_frame';
  readonly frameType?: string;
}

export type DecodeFrameResult<T extends CoreContentBlock = never> =
  | { readonly ok: true; readonly event: FrameEvent | CustomContentEvent<T> }
  | { readonly ok: false; readonly issue: FrameIssue };

export interface RoundUsage {
  readonly input_tokens?: number;
  readonly output_tokens?: number;
  readonly total_tokens?: number;
  readonly usage_percentage?: number;
  readonly time?: number;
  readonly execution_time?: number;
  readonly start_time?: string;
  readonly end_time?: string;
  readonly context_length?: number;
}
