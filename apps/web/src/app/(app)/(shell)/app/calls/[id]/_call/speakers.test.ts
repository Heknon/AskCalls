import { describe, expect, it } from 'vitest';
import { speakerLabels } from './speakers';

const labels = { you: 'You', speaker: (n: number) => `Speaker ${n}` };
const seg = (speaker?: string) => ({ start: 0, end: 1, text: 'x', ...(speaker && { speaker }) });

describe('speaker labels', () => {
  it('keeps names, marks the user and numbers generic speakers in order', () => {
    expect(
      speakerLabels(
        [seg('spk_1'), seg('You'), seg('Dana'), seg('spk_0'), seg('spk_1'), seg()],
        labels,
      ),
    ).toEqual([
      { name: 'Speaker 1', isYou: false },
      { name: 'You', isYou: true },
      { name: 'Dana', isYou: false },
      { name: 'Speaker 2', isYou: false },
      { name: 'Speaker 1', isYou: false },
      { name: 'Speaker 3', isYou: false },
    ]);
  });
});
