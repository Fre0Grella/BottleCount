import { describe, expect, it } from 'vitest';
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
