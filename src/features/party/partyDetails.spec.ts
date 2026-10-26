import { describe, expect, it } from 'vitest';
import { emptyDetails } from '../../../shared/details';
import { infoLines } from './partyDetails';

describe('infoLines', () => {
  it('lists only what the host filled in, in the fixed order', () => {
    const details = emptyDetails();
    details.info.entry = '18+';
    details.info.dress_code = ' All white ';
    details.info.bring = '   ';

    expect(
      infoLines(details).map(({ kind, label, text }) => ({
        kind,
        label,
        text,
      })),
    ).toEqual([
      { kind: 'dress_code', label: 'Dress code', text: 'All white' },
      { kind: 'entry', label: 'Entry', text: '18+' },
    ]);
  });

  it('has nothing to show for empty or missing details', () => {
    expect(infoLines(emptyDetails())).toEqual([]);
    expect(infoLines(undefined)).toEqual([]);
  });
});
