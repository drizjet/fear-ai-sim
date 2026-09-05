const clamp = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

export class JusticeSystem {
    resolve({ legitimacy = 0.5, grievance = 0.5, reportedCrime = true, investigationQuality = 0.5, corruption = 0, lawPenalty = 0, occupationPenalty = 0 } = {}) {
        const justiceAccess = clamp(investigationQuality * (1 - corruption));
        // Slice W: law-confirmed crime erodes legitimacy beyond the generic
        // reported-crime path. lawPenalty is the mean LAW_VIOLATED penalty in
        // the recent window (0 when no violation). The mean (not the sum)
        // carries severity while the event count already drives grievance via
        // reportedCrime, so volume is not double-counted. Bounded 0.15 keeps
        // the debit in the same order as the baseline drift (~0.076/tick).
        const lawDebit = clamp(lawPenalty) * 0.15;
        // E12: foreign rule erodes legitimacy like unredressed crime.
        // Same 0.15 bound and reported-crime gating as lawDebit: the
        // occupied are judged by an authority they did not choose.
        const occupationDebit = clamp(occupationPenalty) * 0.15;
        const nextLegitimacy = clamp(legitimacy + (justiceAccess - 0.5) * 0.4 - (reportedCrime ? corruption * 0.2 : 0) - (reportedCrime ? lawDebit : 0) - (reportedCrime ? occupationDebit : 0));
        const nextGrievance = clamp(grievance + (reportedCrime ? (1 - justiceAccess) * 0.4 : 0) - justiceAccess * 0.1);
        const migrationPressure = clamp(nextGrievance * 0.7 + (1 - nextLegitimacy) * 0.3);
        return { legitimacy: nextLegitimacy, grievance: nextGrievance, migrationPressure, justiceAccess };
    }
}
