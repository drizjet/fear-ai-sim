/**
 * DataExporter - Export trajectories in multiple ML-ready formats
 * Supports: JSONL (raw), HDF5 (training), NPY (NumPy), CSV (summary)
 */

export class DataExporter {
    constructor(config = {}) {
        this.config = {
            outputDir: config.outputDir || './data',
            shardSize: config.shardSize || 1000, // Trajectories per file
            compression: config.compression || false,
            ...config
        };
        
        this.exportStats = {
            jsonlFiles: 0,
            hdf5Files: 0,
            npyFiles: 0,
            csvFiles: 0,
            totalTrajectories: 0
        };
    }
    
    /**
     * Export trajectories to all formats
     */
    async exportAll(trajectories, labels, features) {
        const results = {};
        
        // Export raw trajectories (JSONL)
        results.jsonl = await this.exportJSONL(trajectories, labels);
        
        // Export training data (HDF5 format using JSZip for now)
        // In production, would use h5wasm or server-side Python
        results.hdf5 = await this.exportHDF5Compatible(trajectories, labels, features);
        
        // Export NumPy arrays
        results.npy = await this.exportNPY(features);
        
        // Export summary CSV
        results.csv = await this.exportCSV(trajectories, labels);
        
        // Create manifest
        results.manifest = await this.createManifest(results);
        
        return results;
    }
    
    /**
     * Export raw trajectories to JSONL (JSON Lines format)
     */
    async exportJSONL(trajectories, labels) {
        const lines = [];
        
        for (let i = 0; i < trajectories.length; i++) {
            const traj = trajectories[i];
            const label = labels[i];
            
            const record = {
                metadata: {
                    trajectoryId: traj.id,
                    agentId: traj.agentId,
                    eventType: traj.eventType,
                    eventTick: traj.eventTick,
                    timestamp: Date.now()
                },
                seeds: traj.seeds || {},
                versions: traj.versions || {},
                timing: label?.timing || {},
                frames: traj.frames.map(f => ({
                    tick: f.tick,
                    position: f.position,
                    velocity: f.velocity,
                    fear: f.fear,
                    state: f.state,
                    energy: f.energy,
                    perception: f.perception
                })),
                labels: {
                    stateTransitions: label?.stateTransitions || {},
                    outcome: label?.outcome || {},
                    scenario: label?.scenario || {},
                    counterfactuals: label?.counterfactuals || {},
                    quality: label?.quality || {}
                }
            };
            
            lines.push(JSON.stringify(record));
        }
        
        const filename = `trajectories_${this._getTimestamp()}.jsonl`;
        const content = lines.join('\n');
        
        this._downloadFile(content, filename, 'application/jsonl');
        
        this.exportStats.jsonlFiles++;
        this.exportStats.totalTrajectories += trajectories.length;
        
        return { filename, count: trajectories.length };
    }
    
    /**
     * Export training data in HDF5-compatible format (using JSON for now)
     * In production, this would create actual HDF5 files
     */
    async exportHDF5Compatible(trajectories, labels, features) {
        // Create structured data compatible with HDF5 format
        const data = {
            metadata: {
                created: new Date().toISOString(),
                version: '1.0',
                trajectory_count: trajectories.length,
                feature_count: features[0]?.features[0]?.length || 0
            },
            trajectories: []
        };
        
        for (let i = 0; i < trajectories.length; i++) {
            const featureData = features[i];
            
            data.trajectories.push({
                id: trajectories[i].id,
                agent_id: trajectories[i].agentId,
                frame_count: featureData?.frameCount || 0,
                features: featureData?.features || [],
                labels: {
                    actions: labels[i]?.actions?.dominantAction || 'UNKNOWN',
                    outcome_survived: labels[i]?.outcome?.survived ? 1 : 0,
                    outcome_peak_fear: labels[i]?.outcome?.peakFear || 0,
                    scenario_type: labels[i]?.scenario?.type || 'UNKNOWN'
                }
            });
        }
        
        const filename = `training_data_${this._getTimestamp()}.json`;
        const content = JSON.stringify(data, null, 2);
        
        this._downloadFile(content, filename, 'application/json');
        
        this.exportStats.hdf5Files++;
        
        return { filename, count: trajectories.length };
    }
    
    /**
     * Export features as NumPy-compatible arrays (JSON format)
     * In production, would use actual .npy binary format
     */
    async exportNPY(features) {
        // Create arrays in NumPy-compatible structure
        const data = {
            description: 'Fear trajectory features for ML training',
            shape: [features.length, null, null], // [trajectories, timesteps, features]
            dtype: 'float32',
            trajectories: []
        };
        
        for (const featureData of features) {
            if (!featureData) continue;
            
            data.trajectories.push({
                id: featureData.trajectoryId,
                agent_id: featureData.agentId,
                frame_count: featureData.frameCount,
                feature_names: featureData.featureNames,
                feature_array: featureData.features
            });
        }
        
        const filename = `features_${this._getTimestamp()}.json`;
        const content = JSON.stringify(data);
        
        this._downloadFile(content, filename, 'application/json');
        
        this.exportStats.npyFiles++;
        
        return { filename, count: features.length };
    }
    
    /**
     * Export summary statistics to CSV
     */
    async exportCSV(trajectories, labels) {
        const headers = [
            'trajectory_id',
            'agent_id',
            'event_type',
            'scenario_type',
            'frame_count',
            'duration_ticks',
            'survived',
            'peak_fear',
            'final_fear',
            'escaped',
            'dominant_action',
            'flee_quality',
            'optimal_path',
            'label_confidence',
            'valid'
        ];
        
        const rows = [headers.join(',')];
        
        for (let i = 0; i < trajectories.length; i++) {
            const traj = trajectories[i];
            const label = labels[i];
            
            const row = [
                traj.id,
                traj.agentId,
                traj.eventType,
                label?.scenario?.type || 'UNKNOWN',
                traj.frames.length,
                traj.frames[traj.frames.length - 1]?.tick - traj.frames[0]?.tick,
                label?.outcome?.survived ? 1 : 0,
                label?.outcome?.peakFear?.toFixed(3) || 0,
                label?.outcome?.finalFear?.toFixed(3) || 0,
                label?.outcome?.escaped ? 1 : 0,
                label?.actions?.dominantAction || 'UNKNOWN',
                label?.actions?.fleeQuality?.toFixed(3) || 0,
                label?.counterfactuals?.optimalPath ? 1 : 0,
                label?.quality?.labelConfidence?.toFixed(3) || 0,
                label?.quality?.valid ? 1 : 0
            ];
            
            rows.push(row.join(','));
        }
        
        const filename = `summary_${this._getTimestamp()}.csv`;
        const content = rows.join('\n');
        
        this._downloadFile(content, filename, 'text/csv');
        
        this.exportStats.csvFiles++;
        
        return { filename, count: trajectories.length };
    }
    
    /**
     * Create dataset manifest
     */
    async createManifest(exportResults) {
        const manifest = {
            created: new Date().toISOString(),
            version: '1.0',
            exports: exportResults,
            stats: this.exportStats,
            checksums: {} // Would add actual checksums in production
        };
        
        const filename = `manifest_${this._getTimestamp()}.json`;
        const content = JSON.stringify(manifest, null, 2);
        
        this._downloadFile(content, filename, 'application/json');
        
        return { filename, manifest };
    }
    
    /**
     * Export dataset split (train/val/test)
     */
    async exportSplit(trajectories, labels, features, splitRatios = [0.7, 0.15, 0.15]) {
        // Shuffle trajectories deterministically
        const shuffled = this._deterministicShuffle(trajectories.map((t, i) => i));
        
        const n = shuffled.length;
        const trainEnd = Math.floor(n * splitRatios[0]);
        const valEnd = trainEnd + Math.floor(n * splitRatios[1]);
        
        const splits = {
            train: shuffled.slice(0, trainEnd),
            val: shuffled.slice(trainEnd, valEnd),
            test: shuffled.slice(valEnd)
        };
        
        const results = {};
        
        for (const [splitName, indices] of Object.entries(splits)) {
            const splitTrajectories = indices.map(i => trajectories[i]);
            const splitLabels = indices.map(i => labels[i]);
            const splitFeatures = indices.map(i => features[i]);
            
            results[splitName] = await this.exportHDF5Compatible(
                splitTrajectories, 
                splitLabels, 
                splitFeatures
            );
            
            // Rename file to include split name
            results[splitName].filename = results[splitName].filename.replace(
                'training_data_',
                `${splitName}_`
            );
        }
        
        return results;
    }
    
    /**
     * Deterministic shuffle using seed
     */
    _deterministicShuffle(array, seed = 12345) {
        const result = [...array];
        let random = this._mulberry32(seed);
        
        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            [result[i], result[j]] = [result[j], result[i]];
        }
        
        return result;
    }
    
    /**
     * Simple PRNG for deterministic shuffle
     */
    _mulberry32(a) {
        return function() {
            let t = a += 0x6D2B79F5;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    
    /**
     * Trigger file download
     */
    _downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        URL.revokeObjectURL(url);
    }
    
    /**
     * Get timestamp string
     */
    _getTimestamp() {
        const now = new Date();
        return now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    }
    
    /**
     * Get export statistics
     */
    getStats() {
        return { ...this.exportStats };
    }
}
