import { describe, expect, it } from 'vitest';
import {
  DESCRIPTION_MAX,
  INFO_MAX,
  emptyDetails,
  normaliseDetails,
} from './details';

describe('normaliseDetails', () => {
  it('keeps what the host wrote', () => {
    const details = {
      description: 'Sunset on the roof.\nBring friends.',
      info: {
        dress_code: 'All white',
        bring: 'A towel',
        getting_there: 'Tram 9',
        entry: '18+',
      },
    };
    expect(normaliseDetails(details)).toEqual(details);
  });

  // A party stored before the field existed, or a patch that deleted it.
  it('makes empty details out of anything at all', () => {
    for (const value of [undefined, null, 'party', 42, [], {}, { info: 7 }]) {
      expect(normaliseDetails(value)).toEqual(emptyDetails());
    }
  });

  it('fills in the kinds a partial document is missing', () => {
    expect(normaliseDetails({ info: { bring: 'Ice' } }).info).toEqual({
      ...emptyDetails().info,
      bring: 'Ice',
    });
  });

  it('drops kinds it does not know, and anything that is not text', () => {
    const { info } = normaliseDetails({
      info: { dress_code: 3, pets: 'Dogs welcome' },
    });
    expect(info).toEqual(emptyDetails().info);
    expect(info).not.toHaveProperty('pets');
  });

  // Everything here is public to anyone with the link.
  it('bounds every string', () => {
    const long = 'x'.repeat(5000);
    const details = normaliseDetails({
      description: long,
      info: { entry: long },
    });
    expect(details.description).toHaveLength(DESCRIPTION_MAX);
    expect(details.info.entry).toHaveLength(INFO_MAX);
  });
});
