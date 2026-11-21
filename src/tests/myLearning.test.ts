import { describe, expect, it } from 'vitest';
import { createSerialNoteSaveQueue, filterLearningResources, requiresUnsaveConfirmation, shouldQueueNoteSave } from '../features/learning/MyLearningPage';

const resources = [
  { id: 'saved', title: 'Saved' },
  { id: 'planned', title: 'Planned' },
  { id: 'viewed', title: 'Viewed' },
  { id: 'completed', title: 'Completed' },
  { id: 'untracked', title: 'Untracked' },
];
const state = {
  savedResourceIds: ['saved'],
  plannedResourceIds: ['planned', 'saved'],
  viewedResourceIds: ['viewed'],
  completedResourceIds: ['completed'],
};

describe('learning resource state', () => {
  it('includes all saved, planned, viewed, and completed resources in All', () => {
    expect(filterLearningResources(resources, state, 'all').map((item) => item.id)).toEqual(['saved', 'planned', 'viewed', 'completed']);
  });

  it('filters each tab from the corresponding Backend profile state', () => {
    expect(filterLearningResources(resources, state, 'saved').map((item) => item.id)).toEqual(['saved']);
    expect(filterLearningResources(resources, state, 'planned').map((item) => item.id)).toEqual(['saved', 'planned']);
    expect(filterLearningResources(resources, state, 'viewed').map((item) => item.id)).toEqual(['viewed']);
    expect(filterLearningResources(resources, state, 'completed').map((item) => item.id)).toEqual(['completed']);
  });

  it('requires confirmation only when unsaving removes the final tracked state', () => {
    expect(requiresUnsaveConfirmation('saved', state)).toBe(false);
    expect(requiresUnsaveConfirmation('only-saved', { ...state, savedResourceIds: ['only-saved'] })).toBe(true);
    expect(requiresUnsaveConfirmation('planned', { ...state, savedResourceIds: ['planned'], plannedResourceIds: ['planned'] })).toBe(false);
    expect(requiresUnsaveConfirmation('viewed', { ...state, savedResourceIds: ['viewed'], viewedResourceIds: ['viewed'] })).toBe(false);
    expect(requiresUnsaveConfirmation('completed', { ...state, savedResourceIds: ['completed'], completedResourceIds: ['completed'] })).toBe(false);
  });
});

describe('serial note saves', () => {
  it('queues a draft reverted to the old server value while an earlier save is pending', () => {
    expect(shouldQueueNoteSave('A', 'A', 0)).toBe(false);
    expect(shouldQueueNoteSave('A', 'A', 1)).toBe(true);
  });

  it('waits for the earlier note write before saving the latest draft', async () => {
    const calls: string[] = [];
    let releaseFirst!: () => void;
    let markFirstStarted!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const firstStarted = new Promise<void>((resolve) => { markFirstStarted = resolve; });
    const save = createSerialNoteSaveQueue(async (note) => {
      calls.push('start:' + note);
      if (note === 'B') {
        markFirstStarted();
        await firstGate;
      }
      calls.push('finish:' + note);
    });

    const first = save('B');
    const second = save('A');
    await firstStarted;
    expect(calls).toEqual(['start:B']);

    releaseFirst();
    await Promise.all([first, second]);
    expect(calls).toEqual(['start:B', 'finish:B', 'start:A', 'finish:A']);
  });

  it('reports a failed save and still lets a later retry complete', async () => {
    const calls: string[] = [];
    let fail = true;
    const save = createSerialNoteSaveQueue(async (note) => {
      calls.push(note);
      if (fail) return false;
    });

    await expect(save('draft')).rejects.toThrow('Ghi chú chưa được lưu.');
    fail = false;
    await expect(save('draft')).resolves.toBeUndefined();
    expect(calls).toEqual(['draft', 'draft']);
  });
});
