import { describe, expect, it } from 'vitest';
import { routeScrollTop } from '../utils/scrollRestoration';

describe('route scroll restoration policy', () => {
  it('starts a newly pushed or replaced route at the top', () => {
    expect(routeScrollTop('PUSH', 420)).toBe(0);
    expect(routeScrollTop('REPLACE', 420)).toBe(0);
  });

  it('restores the saved location on Back and defaults to the top when none exists', () => {
    expect(routeScrollTop('POP', 420)).toBe(420);
    expect(routeScrollTop('POP')).toBe(0);
  });
});
