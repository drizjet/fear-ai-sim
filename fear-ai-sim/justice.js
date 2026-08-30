const clamp = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

export class JusticeSystem {
    resolve({ legitimacy = 0.5, grievance = 0.5, reportedCrime = true, investigationQuality = 0.5, corruption = 0 } = {}) {
        const justiceAccess = clamp(investigationQuality * (1 - corruption));
        const nextLegitimacy = clamp(legitimacy + (justiceAccess - 0.5) * 0.4 - (reportedCrime ? corruption * 0.2 : 0));
        const nextGrievance = clamp(grievance + (reportedCrime ? (1 - justiceAccess) * 0.4 : 0) - justiceAccess * 0.1);
        const migrationPressure = clamp(nextGrievance * 0.7 + (1 - nextLegitimacy) * 0.3);
        return { legitimacy: nextLegitimacy, grievance: nextGrievance, migrationPressure, justiceAccess };
    }
}
