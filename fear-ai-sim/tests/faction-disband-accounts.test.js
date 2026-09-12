import { describe, it, expect } from '@jest/globals';
import FactionSystemDefault, {
    FactionSystem,
    INCIDENT_TYPES
} from '../packages/core/src/FactionSystem.js';
import { RetaliationModel } from '../packages/core/src/RetaliationModel.js';

const FS = FactionSystem || FactionSystemDefault;

// R34: disband closes retaliation accounts. Accounts are bilateral data
// like stances: a disbanded faction must leave neither an unbounded
// residue (CXLII) nor ghost grievance for a re-registered incarnation.

function twoFactions() {
    const fs = new FS();
    fs.registerFaction({ id: 'AX' });
    fs.registerFaction({ id: 'BX' });
    fs.registerFaction({ id: 'CX' });
    return fs;
}

describe('R34: disband closes retaliation accounts', () => {
    it('1. Disband drops every account involving the faction', () => {
        const fs = twoFactions();
        fs.recordIncident('AX', 'BX', INCIDENT_TYPES.RAID_CONFIRMED, {});
        fs.recordIncident('BX', 'AX', INCIDENT_TYPES.SKIRMISH_CASUALTY, {});
        expect(fs.retaliation.accounts.size).toBeGreaterThan(0);
        fs.disbandFaction('BX');
        expect(fs.retaliation.accounts.size).toBe(0);
        expect(fs.retaliation.recommend('AX', 'BX')).toMatchObject({
            intent: 'IGNORE',
            level: 0,
            grievance: 0
        });
    });

    it('2. Unrelated pairs survive the disband', () => {
        const fs = twoFactions();
        fs.recordIncident('AX', 'BX', INCIDENT_TYPES.RAID_CONFIRMED, {});
        fs.recordIncident('AX', 'CX', INCIDENT_TYPES.RAID_CONFIRMED, {});
        fs.disbandFaction('BX');
        expect(fs.retaliation.accounts.size).toBe(1);
        expect(fs.retaliation.recommend('AX', 'CX').grievance).toBeGreaterThan(0);
    });

    it('3. Re-registered incarnations start with a clean slate', () => {
        const fs = twoFactions();
        fs.recordIncident('AX', 'BX', INCIDENT_TYPES.RAID_CONFIRMED, {});
        fs.recordIncident('AX', 'BX', INCIDENT_TYPES.RAID_CONFIRMED, {});
        const haunted = fs.retaliation.recommend('AX', 'BX').grievance;
        expect(haunted).toBeGreaterThan(0);
        fs.disbandFaction('BX');
        fs.registerFaction({ id: 'BX' });
        expect(fs.retaliation.recommend('AX', 'BX').grievance).toBe(0);
    });

    it('4. close() counts closures and ignores garbage', () => {
        const ledger = new RetaliationModel();
        ledger.provoke('AX', 'BX', 'RAID');
        ledger.provoke('AX', 'CX', 'RAID');
        expect(ledger.close('BX')).toBe(1);
        expect(ledger.accounts.size).toBe(1);
        expect(ledger.close('GHOST')).toBe(0);
        expect(ledger.close('')).toBe(0);
        expect(ledger.close(null)).toBe(0);
    });

    it('5. Disbanding an unknown faction is still safe', () => {
        const fs = twoFactions();
        fs.recordIncident('AX', 'CX', INCIDENT_TYPES.RAID_CONFIRMED, {});
        expect(() => fs.disbandFaction('GHOST')).not.toThrow();
        expect(fs.retaliation.accounts.size).toBe(1);
    });
});
