import { asRecord, readId } from '../core-sse/protocol.js';
import type { WireFrame } from '../core-sse/types.js';

export interface DetailFrame {
  readonly frameIndex: number;
  readonly offset: number;
  readonly data: WireFrame;
}

export interface DetailFrameIssue {
  readonly code: 'invalid_json' | 'invalid_frame' | 'incomplete_frame';
  readonly frameIndex: number;
  readonly offset: number;
}

export interface DetailParseResult {
  readonly frames: readonly DetailFrame[];
  readonly issues: readonly DetailFrameIssue[];
}

const openTag = '<data>';

export function scanDetailFrames(
  answer: unknown,
  onFrame: (rawJson: string, frameIndex: number, offset: number) => boolean | void,
  onIssue?: (issue: DetailFrameIssue) => void,
): boolean {
  if (answer == null) return false;
  if (typeof answer !== 'string') {
    onIssue?.({ code: 'invalid_frame', frameIndex: 0, offset: 0 });
    return false;
  }

  const tokens = /<\/?data>|["\\]/gi;
  const afterString = /\s*(?=[:},\]]|<\/data>|$)/iy;
  let offset = -1;
  let frameIndex = 0;
  let quoted = false;
  let quotedClose = false;
  let recoveryOffset = -1;

  let token: RegExpExecArray | null;
  while ((token = tokens.exec(answer)) !== null) {
    const symbol = token[0];
    const position = token.index;
    const opening = symbol.length === openTag.length;
    if (offset < 0) {
      if (opening) offset = position;
      continue;
    }

    if (symbol === '\\') {
      if (quoted) {
        // Skip the escaped character, including any quote that starts a token.
        tokens.lastIndex = position + 2;
      }
      continue;
    }
    if (symbol === '"') {
      afterString.lastIndex = position + 1;
      if (quoted && recoveryOffset >= 0 && !afterString.test(answer)) {
        // A quote starting a subsequent frame cannot end the broken JSON string.
        onIssue?.({ code: 'invalid_json', frameIndex, offset });
        frameIndex += 1;
        offset = recoveryOffset;
      } else {
        quoted = !quoted;
      }
      quotedClose = false;
      recoveryOffset = -1;
      continue;
    }

    if (quoted) {
      if (opening) recoveryOffset = position;
      else quotedClose = true;
      continue;
    }
    if (opening) {
      onIssue?.({ code: 'incomplete_frame', frameIndex, offset });
      frameIndex += 1;
      offset = position;
      continue;
    }

    if (onFrame(answer.slice(offset + openTag.length, position), frameIndex, offset) === true) {
      return true;
    }
    frameIndex += 1;
    offset = -1;
  }

  if (offset >= 0) {
    onIssue?.({ code: quotedClose ? 'invalid_json' : 'incomplete_frame', frameIndex, offset });
  }
  return false;
}

export function parseDetailFrames(answer?: string | null): DetailParseResult {
  const frames: DetailFrame[] = [];
  const issues: DetailFrameIssue[] = [];
  scanDetailFrames(
    answer,
    (rawJson, frameIndex, offset) => {
      try {
        const data = asRecord(JSON.parse(rawJson));
        if (data && Object.prototype.hasOwnProperty.call(data, 'type') && readId(data.type)) {
          frames.push({ frameIndex, offset, data: data as WireFrame });
        } else {
          issues.push({ code: 'invalid_frame', frameIndex, offset });
        }
      } catch {
        issues.push({ code: 'invalid_json', frameIndex, offset });
      }
    },
    (issue) => issues.push(issue),
  );
  return { frames, issues };
}
