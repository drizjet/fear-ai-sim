import { describe, expect, it } from '@jest/globals';
import { SocietyCore } from '../societycore.js';

// RESP-CRIME-JUSTICE-LEGITIMACY-LOOP-001 — the crime → report → justice → legitimacy →
// migration production loop. resolveCrime/reportCrime/accessToJustice/updateLegitimacy/
// shouldMigrate run as canonical parented events: every stage references its upstream event,
// settlement legitimacy carries the justice consequence into the migration decision, and the
// chain survives save/load and identical seeds.
// Mutants pinned: legitimacy write skipped; report primitive ignored; migration reads pre-justice
// legitimacy; chain parentage dropped.

const buildWorld = (legitimacy = .45) => {
    const core = new SocietyCore({ seed: 42 });
    core.addSettlement('home', { legitimacy, population: 80, capacity: 200, resources: 40 });
    return core;
};

const script = ({ friction = .5, risk = .5 } = {}) => [
    { kind: 'CRIME_COMMIT', actorId: 'thief', settlementId: 'home', reward: 10, desperation: 2, apprehension: 0, sanction: 5, fear: 0, moralCost: 1 },
    { kind: 'CRIME_REPORT', settlementId: 'home', trust: 1, duty: 1 },
    { kind: 'CRIME_JUSTICE', settlementId: 'home', remedy: 1, friction, risk },
    { kind: 'CRIME_MIGRATION', settlementId: 'home', destination: 'elsewhere', fear: .6, routeDanger: .7, foodSecurity: .54 },
];

const settlementEvents = core => ({
    crime: core.events.find(event => event.type === 'CRIME_COMMITTED'),
    report: core.events.find(event => event.type === 'CRIME_REPORTED'),
    justice: core.events.find(event => event.type === 'JUSTICE_RESOLUTION' && event.authority === 'SETTLEMENT'),
    migration: core.events.find(event => event.type === 'MIGRATION_EVALUATION' && event.authority === 'SETTLEMENT'),
});

describe('RESP-CRIME-JUSTICE-LEGITIMACY-LOOP-001: crime/justice/legitimacy/migration loop', () => {
    it('runs the full crime → report → justice → legitimacy → migration cycle in one turn', () => {
        const core = buildWorld();
        core.tick({ actions: script() });
        const { crime, report, justice, migration } = settlementEvents(core);
        expect(crime).toBeDefined();
        expect(report).toBeDefined();
        expect(justice).toBeDefined();
        expect(migration).toBeDefined();
        // stage 1: the crime pays — 10 + 2 - 0 - 0 - 1
        expect(crime.payoff).toBe(11);
        expect(crime.commits).toBe(true);
        // stage 2: the report links to the crime; certain here (legitimacy + trust + duty >= 1)
        expect(report.crimeId).toBe(crime.id);
        expect(report.parentId).toBe(crime.id);
        expect(report.reportProbability).toBe(1);
        expect(report.reported).toBe(true);
        // stage 3: inaccessible justice fails to solve — legitimacy drops .45 → .37
        expect(justice.reportId).toBe(report.id);
        expect(justice.parentId).toBe(report.id);
        expect(justice.crimeId).toBe(crime.id);
        expect(justice.solved).toBe(false);
        expect(justice.legitimacyBefore).toBe(.45);
        expect(justice.legitimacyAfter).toBeCloseTo(.37, 10);
        expect(core.settlements.get('home').legitimacy).toBeCloseTo(.37, 10);
        // stage 4: post-justice legitimacy feeds the migration decision — pressure > .6
        expect(migration.justiceId).toBe(justice.id);
        expect(migration.parentId).toBe(justice.id);
        expect(migration.crimeId).toBe(crime.id);
        expect(migration.legitimacy).toBe(justice.legitimacyAfter);
        expect(migration.pressure).toBeCloseTo(.605, 10);
        expect(migration.migrates).toBe(true);
    });

    it('the cycle is one validated causal lineage from the TURN to the migration decision', () => {
        const core = buildWorld();
        core.tick({ actions: script() });
        const { migration } = settlementEvents(core);
        const chain = core.causalChain(migration.id);
        expect(chain.event.id).toBe(migration.id);
        expect(chain.lineage.map(event => event.type)).toEqual(['TURN', 'CRIME_COMMITTED', 'CRIME_REPORTED', 'JUSTICE_RESOLUTION', 'MIGRATION_EVALUATION']);
        expect(chain.lineage.every((event, index, list) => index === 0 || list[index - 1].seq < event.seq)).toBe(true);
        const audit = core.auditEventGraph();
        expect(audit.ok).toBe(true);
        expect(audit.violations).toEqual([]);
    });

    it('every stage’s numbers come from the production primitives', () => {
        const core = buildWorld();
        core.tick({ actions: script() });
        const { crime, report, justice, migration } = settlementEvents(core);
        expect(crime.payoff).toBe(core.resolveCrime({ reward: 10, desperation: 2, apprehension: 0, sanction: 5, fear: 0, moralCost: 1 }));
        expect(report.reportProbability).toBe(core.reportCrime({ legitimacy: .45, trust: 1, duty: 1, retaliationFear: 0, corruption: 0, uncertainty: 0 }));
        expect(justice.remedy).toBe(core.accessToJustice({ remedy: 1, legitimacy: .45, friction: .5, risk: .5 }));
        expect(justice.legitimacyAfter).toBe(core.updateLegitimacy(.45, { cooperation: 0, injustice: justice.injustice, solved: justice.solved ? 1 : 0 }));
        expect(migration.migrates).toBe(core.shouldMigrate({ fear: .6, routeDanger: .7, foodSecurity: .54, legitimacy: migration.legitimacy }));
    });

    it('accessible justice raises legitimacy enough to stop the migration — the loop has teeth', () => {
        const unjust = buildWorld();
        unjust.tick({ actions: script({ friction: .5, risk: .5 }) });
        const just = buildWorld();
        just.tick({ actions: script({ friction: .1, risk: .1 }) });
        const a = settlementEvents(unjust);
        const b = settlementEvents(just);
        expect(a.justice.solved).toBe(false);
        expect(b.justice.solved).toBe(true);
        expect(b.justice.legitimacyAfter).toBeCloseTo(.48, 10);
        expect(a.migration.migrates).toBe(true);
        expect(b.migration.migrates).toBe(false);
        expect(a.migration.legitimacy).not.toBe(b.migration.legitimacy);
        expect(unjust.settlements.get('home').legitimacy).toBeLessThan(just.settlements.get('home').legitimacy);
    });

    it('an unreported crime never reaches justice — the cycle stops at the report gate', () => {
        const core = buildWorld(.5);
        core.tick({
            actions: [
                { kind: 'CRIME_COMMIT', actorId: 'thief', settlementId: 'home', reward: 10, desperation: 2, apprehension: 0, sanction: 5, fear: 0, moralCost: 1 },
                { kind: 'CRIME_REPORT', settlementId: 'home', trust: 0, duty: 0, retaliationFear: .6 },
            ],
        });
        const report = core.events.find(event => event.type === 'CRIME_REPORTED');
        expect(report.reportProbability).toBe(0);
        expect(report.reported).toBe(false);
        expect(() => core.tick({ actions: [{ kind: 'CRIME_JUSTICE', settlementId: 'home' }] })).toThrow(/No reported crime/);
        expect(core.events.some(event => event.type === 'JUSTICE_RESOLUTION' && event.authority === 'SETTLEMENT')).toBe(false);
        expect(core.settlements.get('home').legitimacy).toBe(.5);
    });

    it('the cross-tick chain and settlement legitimacy survive save/load, and the loop continues', () => {
        const core = buildWorld();
        const actions = script();
        core.tick({ actions: actions.slice(0, 2) }); // commit + report in tick 1
        core.tick({ actions: actions.slice(2) }); // justice + migration in tick 2
        const before = settlementEvents(core);
        expect(before.report.tick).toBe(1);
        expect(before.justice.tick).toBe(2);
        expect(before.justice.parentId).toBe(before.report.id);
        const restored = SocietyCore.deserialize(core.serialize());
        const after = settlementEvents(restored);
        expect(restored.events.map(event => event.id)).toEqual(core.events.map(event => event.id));
        expect(after.migration.id).toBe(before.migration.id);
        expect(restored.settlements.get('home').legitimacy).toBeCloseTo(.37, 10);
        expect(restored.auditEventGraph().ok).toBe(true);
        expect(restored.causalChain(after.migration.id).lineage.map(event => event.type)).toEqual(['TURN', 'CRIME_COMMITTED', 'CRIME_REPORTED', 'JUSTICE_RESOLUTION', 'MIGRATION_EVALUATION']);
        // a later stage resolves post-restore and parents to the pre-restore justice event
        restored.tick({ actions: [{ kind: 'CRIME_MIGRATION', settlementId: 'home', destination: 'elsewhere', fear: .6, routeDanger: .7, foodSecurity: .54 }] });
        const later = restored.events.filter(event => event.type === 'MIGRATION_EVALUATION' && event.authority === 'SETTLEMENT').at(-1);
        expect(later.parentId).toBe(after.justice.id);
        expect(later.migrates).toBe(true);
        expect(restored.auditEventGraph().ok).toBe(true);
    });

    it('identical seeds replay the loop bit-for-bit; different worlds diverge', () => {
        const a = buildWorld();
        a.tick({ actions: script() });
        const b = buildWorld();
        b.tick({ actions: script() });
        expect(b.serialize()).toEqual(a.serialize());
        const c = buildWorld(.9);
        c.tick({ actions: script({ friction: .1, risk: .1 }) });
        expect(c.serialize()).not.toEqual(a.serialize());
    });
});
