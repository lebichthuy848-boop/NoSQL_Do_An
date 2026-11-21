import { describe, expect, it } from 'vitest';
import { RequestGeneration } from '../utils/requestGeneration';

describe('stale request protection', () => {
  it('ignores earlier responses after a newer request starts or a page unmounts', () => {
    const generation = new RequestGeneration();
    const first = generation.next();
    const second = generation.next();

    expect(generation.isCurrent(first)).toBe(false);
    expect(generation.isCurrent(second)).toBe(true);
    generation.invalidate();
    expect(generation.isCurrent(second)).toBe(false);
  });
});
