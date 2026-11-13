import { describe, expect, it } from 'vitest';
import { deviceKindOf } from './device-kind';

describe('deviceKindOf', () => {
  it.each([
    ['askcalls agent', 'agent'],
    ['askcalls agent on studio-mac', 'agent'],
    ['Safari · iOS', 'phone'],
    ['Chrome on Android', 'phone'],
    ['Chrome · macOS', 'laptop'],
    ['Firefox on Linux', 'laptop'],
  ])('%s is %s', (label, kind) => expect(deviceKindOf(label)).toBe(kind));
});
