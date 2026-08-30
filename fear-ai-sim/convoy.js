const clamp = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

export function formConvoy(merchants = [], guards = [], { escortRatio = 1 } = {}) {
    const convoy = {
        id: `convoy-${merchants.map(m => m.id).join('-')}`,
        merchantIds: merchants.map(m => m.id),
        escortIds: guards.slice(0, Math.ceil(merchants.length * escortRatio)).map(g => g.id),
        cargo: merchants.reduce((sum, merchant) => sum + (Number.isFinite(merchant.cargo) ? merchant.cargo : 0), 0),
        routeId: null
    };
    merchants.forEach(merchant => { merchant.convoyId = convoy.id; });
    guards.slice(0, convoy.escortIds.length).forEach(guard => { guard.convoyId = convoy.id; });
    return convoy;
}

export function adaptBandits(bandit, { roadId, success = false, loss = 0 } = {}) {
    if (!bandit) return { ok: false, reason: 'NO_BANDIT' };
    if (success) bandit.lootExpectation = clamp((bandit.lootExpectation ?? 0.5) + 0.1);
    if (loss > 0) bandit.lootExpectation = clamp((bandit.lootExpectation ?? 0.5) - 0.1);
    if (roadId) bandit.lastRoadId = roadId;
    if (success && bandit.lootExpectation < 0.3 && bandit.alternateRoadId) bandit.roadId = bandit.alternateRoadId;
    return { ok: true, roadId: bandit.roadId, lootExpectation: bandit.lootExpectation };
}

export function resolveConvoyAmbush(convoy, bandit, { roadDanger = 0, escortStrength = 0, tick = 0 } = {}) {
    if (!convoy || !bandit) return { ok: false, reason: 'INVALID_AMBUSH' };
    const effectiveDanger = clamp(roadDanger - clamp(escortStrength) * 0.5);
    const lost = convoy.cargo * effectiveDanger;
    convoy.cargo -= lost;
    const survivors = convoy.merchantIds.length > 0;
    const result = { ok: true, convoyId: convoy.id, lost, survivors, tick, roadId: bandit.roadId };
    adaptBandits(bandit, { roadId: bandit.roadId, success: lost > 0, loss: 0 });
    return result;
}
