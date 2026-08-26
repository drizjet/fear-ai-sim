/**
 * Analytics Engine: Tracks time-series metrics over the simulation life
 * Includes Gen-over-Gen Behavioral Fingerprinting for evolutionary analysis
 */
export class Analytics {
    constructor() {
        this.history = {
            population: [],
            fearIndex: [],
            avgMorale: [],
            energy: [],
            deathCauses: { starvation: 0, predation: 0 },
            totalSST: 0,
            engagementCount: 0,
            timestamps: []
        };
        this.maxDataPoints = 500; // Increased for longer history
        
        // Gen-over-Gen Fingerprinting Data
        this.generationalData = []; // Array of generation snapshots
        this.currentGenerationTraits = {
            survivors: [],
            deaths: [],
            traitHistory: []
        };
        this.currentGenerationNumber = 1;
    }

    record(metrics) {
        const timestamp = Date.now();
        this.history.timestamps.push(timestamp);
        this.history.population.push(metrics.population);
        this.history.fearIndex.push(metrics.fearIndex);
        this.history.avgMorale.push(metrics.avgMorale);
        this.history.energy.push(metrics.avgEnergy);

        // Keep moving window — only shift the array fields, never the scalar/counter fields
        if (this.history.timestamps.length > this.maxDataPoints) {
            const arrayKeys = ['timestamps', 'population', 'fearIndex', 'avgMorale', 'energy'];
            for (const key of arrayKeys) {
                if (Array.isArray(this.history[key])) {
                    this.history[key].shift();
                }
            }
        }

        // Auto-save to LocalStorage every recording
        this.saveToDisk();
    }

    recordSurvival(sst) {
        this.history.totalSST += sst;
        this.history.engagementCount++;
    }

    /**
     * Record trait data for an agent during their lifetime
     * Call this periodically to build trait distribution
     */
    recordAgentTraits(traits, survived = true, age = 0) {
        const traitData = {
            fear: traits.fear,
            skill: traits.skill,
            curiosity: traits.curiosity,
            leadership: traits.leadership,
            resilience: traits.resilience,
            age: age
        };
        
        this.currentGenerationTraits.traitHistory.push(traitData);
        
        if (survived) {
            this.currentGenerationTraits.survivors.push(traitData);
        } else {
            this.currentGenerationTraits.deaths.push(traitData);
        }
    }

    /**
     * Called when a generation ends (evolution occurs)
     * Calculates correlations and stores generational fingerprint
     */
    endGeneration(generationNumber, finalAgents) {
        this.currentGenerationNumber = generationNumber;
        
        // Record final traits of surviving agents
        finalAgents.forEach(agent => {
            this.recordAgentTraits(agent.brain.traits, true, agent.age);
        });
        
        // Calculate trait statistics for this generation
        const fingerprint = this.calculateGenerationFingerprint();
        this.generationalData.push({
            generation: generationNumber,
            timestamp: Date.now(),
            population: finalAgents.length,
            fingerprint: fingerprint,
            rawData: {
                survivors: [...this.currentGenerationTraits.survivors],
                deaths: [...this.currentGenerationTraits.deaths]
            }
        });
        
        // Reset for next generation
        this.currentGenerationTraits = {
            survivors: [],
            deaths: [],
            traitHistory: []
        };
        
        this.saveToDisk();
    }

    /**
     * Calculate trait statistics and survival correlations for current generation
     */
    calculateGenerationFingerprint() {
        const allTraits = this.currentGenerationTraits.traitHistory;
        const survivors = this.currentGenerationTraits.survivors;
        const deaths = this.currentGenerationTraits.deaths;
        
        if (allTraits.length === 0) return null;
        
        const traitNames = ['fear', 'skill', 'curiosity', 'leadership', 'resilience'];
        const fingerprint = {};
        
        traitNames.forEach(trait => {
            const allValues = allTraits.map(t => t[trait]);
            const survivorValues = survivors.map(t => t[trait]);
            const deathValues = deaths.map(t => t[trait]);
            
            fingerprint[trait] = {
                // Population distribution
                mean: this.average(allValues),
                median: this.median(allValues),
                stdDev: this.stdDev(allValues),
                min: Math.min(...allValues),
                max: Math.max(...allValues),
                
                // Survival correlations
                survivorMean: survivorValues.length > 0 ? this.average(survivorValues) : 0,
                deathMean: deathValues.length > 0 ? this.average(deathValues) : 0,
                survivalAdvantage: survivorValues.length > 0 && deathValues.length > 0 
                    ? this.average(survivorValues) - this.average(deathValues)
                    : 0,
                
                // Survival correlation coefficient (-1 to 1)
                correlation: this.calculateSurvivalCorrelation(allTraits, trait)
            };
        });
        
        return fingerprint;
    }

    /**
     * Calculate correlation between a trait and survival
     * Returns value between -1 (negative correlation) and 1 (positive correlation)
     */
    calculateSurvivalCorrelation(allTraits, traitName) {
        const n = allTraits.length;
        if (n < 2) return 0;
        
        // Create binary survival array (1 = survived, 0 = died)
        // We approximate this by checking if agent reached high age
        const traitValues = allTraits.map(t => t[traitName]);
        const survivalValues = allTraits.map(t => t.age > 500 ? 1 : 0); // Survived if age > 500
        
        const traitMean = this.average(traitValues);
        const survivalMean = this.average(survivalValues);
        
        let numerator = 0;
        let traitDenom = 0;
        let survivalDenom = 0;
        
        for (let i = 0; i < n; i++) {
            const traitDiff = traitValues[i] - traitMean;
            const survivalDiff = survivalValues[i] - survivalMean;
            
            numerator += traitDiff * survivalDiff;
            traitDenom += traitDiff * traitDiff;
            survivalDenom += survivalDiff * survivalDiff;
        }
        
        const denominator = Math.sqrt(traitDenom * survivalDenom);
        return denominator === 0 ? 0 : numerator / denominator;
    }

    // Statistical helper methods
    average(arr) {
        if (arr.length === 0) return 0;
        return arr.reduce((a, b) => a + b, 0) / arr.length;
    }
    
    median(arr) {
        if (arr.length === 0) return 0;
        const sorted = [...arr].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }
    
    stdDev(arr) {
        if (arr.length < 2) return 0;
        const mean = this.average(arr);
        const variance = arr.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / arr.length;
        return Math.sqrt(variance);
    }

    /**
     * Get the latest generation fingerprint for visualization
     */
    getLatestFingerprint() {
        if (this.generationalData.length === 0) return null;
        return this.generationalData[this.generationalData.length - 1].fingerprint;
    }

    /**
     * Get comparison between two generations
     */
    getGenerationComparison(gen1, gen2) {
        const data1 = this.generationalData.find(g => g.generation === gen1);
        const data2 = this.generationalData.find(g => g.generation === gen2);
        
        if (!data1 || !data2) return null;
        
        const comparison = {};
        const traitNames = ['fear', 'skill', 'curiosity', 'leadership', 'resilience'];
        
        traitNames.forEach(trait => {
            const f1 = data1.fingerprint[trait];
            const f2 = data2.fingerprint[trait];
            
            comparison[trait] = {
                gen1Mean: f1.mean,
                gen2Mean: f2.mean,
                change: f2.mean - f1.mean,
                percentChange: ((f2.mean - f1.mean) / f1.mean * 100).toFixed(1)
            };
        });
        
        return comparison;
    }

    getMTTK() {
        if (this.history.engagementCount === 0) return 0;
        return (this.history.totalSST / this.history.engagementCount).toFixed(2);
    }

    saveToDisk() {
        const payload = JSON.stringify({
            history: this.history,
            generationalData: this.generationalData,
            currentGeneration: this.currentGenerationNumber,
            sessionDate: new Date().toISOString()
        });
        localStorage.setItem('fear_ai_analytics_latest', payload);
    } 

    loadFromDisk() {
        const data = localStorage.getItem('fear_ai_analytics_latest');
        if (data) {
            try {
                const parsed = JSON.parse(data);
                if (parsed.generationalData) {
                    this.generationalData = parsed.generationalData;
                }
                if (parsed.currentGeneration) {
                    this.currentGenerationNumber = parsed.currentGeneration;
                }
                return true;
            } catch (e) {
                console.error('Failed to load analytics data:', e);
            }
        }
        return false;
    }    

    getHistory() {
        return this.history;
    }

    exportJSON() {
        return JSON.stringify({
            history: this.history,
            generationalData: this.generationalData,
            currentGeneration: this.currentGenerationNumber,
            summary: this.generateSummary()
        }, null, 2);
    }

    /**
     * Generate a human-readable summary of trait evolution
     */
    generateSummary() {
        if (this.generationalData.length < 2) {
            return "Insufficient data for generational analysis.";
        }

        const latest = this.generationalData[this.generationalData.length - 1];
        const previous = this.generationalData[this.generationalData.length - 2];
        const comparison = this.getGenerationComparison(previous.generation, latest.generation);
        
        if (!comparison) return "Unable to generate comparison.";

        const traitNames = ['fear', 'skill', 'curiosity', 'leadership', 'resilience'];
        const lines = [
            `=== GENERATION ${latest.generation} BEHAVIORAL FINGERPRINT ===`,
            ``,
            `Population: ${latest.population}`,
            ``
        ];

        traitNames.forEach(trait => {
            const data = comparison[trait];
            const change = parseFloat(data.percentChange);
            const direction = change > 0 ? '↑' : change < 0 ? '↓' : '→';
            const significance = Math.abs(change) > 10 ? 'SIGNIFICANT' : Math.abs(change) > 5 ? 'MODERATE' : 'SLIGHT';
            
            lines.push(`${trait.toUpperCase().padEnd(12)} ${direction} ${Math.abs(change).toFixed(1)}% (${significance})`);
            lines.push(`  Mean: ${data.gen2Mean.toFixed(3)} (was ${data.gen1Mean.toFixed(3)})`);
        });

        // Find trait with highest survival correlation
        const correlations = traitNames.map(trait => ({
            trait,
            correlation: latest.fingerprint[trait].correlation
        })).sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));

        lines.push('');
        lines.push('=== SURVIVAL CORRELATIONS ===');
        correlations.forEach(({trait, correlation}) => {
            const strength = Math.abs(correlation) > 0.5 ? 'STRONG' : Math.abs(correlation) > 0.3 ? 'MODERATE' : 'WEAK';
            const direction = correlation > 0 ? 'positive' : 'negative';
            lines.push(`${trait.padEnd(12)} ${correlation.toFixed(3)} (${strength} ${direction})`);
        });

        return lines.join('\n');
    }
}
