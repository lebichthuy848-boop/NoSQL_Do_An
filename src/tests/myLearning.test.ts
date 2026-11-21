import { describe, expect, it } from 'vitest';
import { createSerialNoteSaveQueue } from '../features/learning/MyLearningPage';

describe('serial note saves', () => {
  it('waits for the earlier note write before saving the latest draft', async () => {
    const calls: string[] = [];
    let releaseFirst!: () => void;
    let markFirstStarted!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const firstStarted = new Promise<void>((resolve) => { markFirstStarted = resolve; });
    const save = createSerialNoteSaveQueue(async (note) => {
      calls.push('start:' + note);
      if (note === 'first') {
        markFirstStarted();
        await firstGate;
      }
      calls.push('finish:' + note);
    });

    const first = save('first');
    const second = save('latest');
    await firstStarted;
    expect(calls).toEqual(['start:first']);

    releaseFirst();
    await Promise.all([first, second]);
    expect(calls).toEqual(['start:first', 'finish:first', 'start:latest', 'finish:latest']);
  });
});