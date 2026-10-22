import { describe, expect, it } from 'vitest';
import { normaliseDocument } from '../../../shared/collab';
import { parseDocument } from '../routes/partyInput';
import { aDocument } from './support/party';

function parsed(document: Record<string, unknown>) {
  return parseDocument({ localId: 1, document })?.document;
}

describe('parseDocument', () => {
  describe('barManaged', () => {
    // The document is rebuilt field by field, so a field this does not name is
    // silently dropped — and a co-organiser would never see the switch.
    it('keeps "the venue runs the bar"', () => {
      expect(parsed({ ...aDocument(), barManaged: false })?.barManaged).toBe(
        false,
      );
    });

    it('reads a document from before the switch as the host running the bar', () => {
      const { barManaged: _omitted, ...older } = aDocument();
      expect(parsed(older)?.barManaged).toBe(true);
    });

    it('treats anything but false as true', () => {
      expect(parsed({ ...aDocument(), barManaged: 'no' })?.barManaged).toBe(
        true,
      );
    });
  });
});

describe('normaliseDocument', () => {
  it('leaves a whole document as it was', () => {
    const document = {
      ...aDocument(),
      settings: { ...aDocument().settings, venue_fee_per_person: 2 },
    };
    expect(normaliseDocument(document)).toEqual(document);
  });

  it('makes a document out of anything at all', () => {
    for (const value of [null, undefined, 'party', 42, [], {}]) {
      const document = normaliseDocument(value);
      expect(document.settings.buffer).toBe(1);
      expect(document.venue).toEqual({ place: '', city: '', time: '' });
      expect(document.payment.paypal).toBe('');
    }
  });

  it('drops fields the document does not own', () => {
    expect(
      normaliseDocument({ ...aDocument(), owner: 'x' }),
    ).not.toHaveProperty('owner');
  });
});

describe('parseDocument', () => {
  it('refuses a document without a name', () => {
    expect(parsed({ ...aDocument(), name: '   ' })).toBeUndefined();
  });
});
