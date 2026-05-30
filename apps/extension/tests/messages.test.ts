import { describe, expect, it } from 'vitest';
import { DETAIL_CHANNEL, isDetailRequest } from '../src/shared/messages.ts';

describe('isDetailRequest', () => {
  it('accepts a well-formed detail request', () => {
    expect(isDetailRequest({ type: DETAIL_CHANNEL, ean: '3560070546879' })).toBe(true);
  });
  it('rejects other messages', () => {
    expect(isDetailRequest({ type: 'nitide:match', input: {} })).toBe(false);
    expect(isDetailRequest(null)).toBe(false);
    expect(isDetailRequest({ type: DETAIL_CHANNEL })).toBe(false);
  });
});
