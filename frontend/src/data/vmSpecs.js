export const VM_SPECS = {
    // ── Entry-level A series (legacy) ──
    'Standard_A0': {
        vCpus: 1, memory: 0.75, type: 'General Purpose', score: 50,
        architecture: 'x64', hyperVGen: 'V1', acus: 50, gpus: 0,
        maxNics: 1, rdma: false, acceleratedNet: false,
        osDiskSize: '1023 GiB', resDiskSize: '20 GiB', maxDisks: 1, premiumDisk: false,
        uncachedIops: 500, uncacheThroughput: '10 MiB/s'
    },
    'Standard_A1': {
        vCpus: 1, memory: 1.75, type: 'General Purpose', score: 100,
        architecture: 'x64', hyperVGen: 'V1', acus: 100, gpus: 0,
        maxNics: 1, rdma: false, acceleratedNet: false,
        osDiskSize: '1023 GiB', resDiskSize: '70 GiB', maxDisks: 2, premiumDisk: false,
        uncachedIops: 500, uncacheThroughput: '10 MiB/s'
    },
    'Standard_A2': {
        vCpus: 2, memory: 3.5, type: 'General Purpose', score: 200,
        architecture: 'x64', hyperVGen: 'V1', acus: 100, gpus: 0,
        maxNics: 2, rdma: false, acceleratedNet: false,
        osDiskSize: '1023 GiB', resDiskSize: '135 GiB', maxDisks: 4, premiumDisk: false,
        uncachedIops: 1000, uncacheThroughput: '20 MiB/s'
    },
    'Standard_A3': {
        vCpus: 4, memory: 7, type: 'General Purpose', score: 400,
        architecture: 'x64', hyperVGen: 'V1', acus: 100, gpus: 0,
        maxNics: 4, rdma: false, acceleratedNet: false,
        osDiskSize: '1023 GiB', resDiskSize: '285 GiB', maxDisks: 8, premiumDisk: false,
        uncachedIops: 2000, uncacheThroughput: '40 MiB/s'
    },
    'Standard_A4': {
        vCpus: 8, memory: 14, type: 'General Purpose', score: 800,
        architecture: 'x64', hyperVGen: 'V1', acus: 100, gpus: 0,
        maxNics: 8, rdma: false, acceleratedNet: false,
        osDiskSize: '1023 GiB', resDiskSize: '605 GiB', maxDisks: 16, premiumDisk: false,
        uncachedIops: 4000, uncacheThroughput: '80 MiB/s'
    },
    'Standard_A5': {
        vCpus: 2, memory: 14, type: 'Memory Optimized', score: 250,
        architecture: 'x64', hyperVGen: 'V1', acus: 100, gpus: 0,
        maxNics: 4, rdma: false, acceleratedNet: false,
        osDiskSize: '1023 GiB', resDiskSize: '135 GiB', maxDisks: 4, premiumDisk: false,
        uncachedIops: 1000, uncacheThroughput: '20 MiB/s'
    },
    'Standard_A6': {
        vCpus: 4, memory: 28, type: 'Memory Optimized', score: 500,
        architecture: 'x64', hyperVGen: 'V1', acus: 100, gpus: 0,
        maxNics: 8, rdma: false, acceleratedNet: false,
        osDiskSize: '1023 GiB', resDiskSize: '285 GiB', maxDisks: 8, premiumDisk: false,
        uncachedIops: 2000, uncacheThroughput: '40 MiB/s'
    },
    'Standard_A7': {
        vCpus: 8, memory: 56, type: 'Memory Optimized', score: 1000,
        architecture: 'x64', hyperVGen: 'V1', acus: 100, gpus: 0,
        maxNics: 8, rdma: false, acceleratedNet: false,
        osDiskSize: '1023 GiB', resDiskSize: '605 GiB', maxDisks: 16, premiumDisk: false,
        uncachedIops: 4000, uncacheThroughput: '80 MiB/s'
    },
    'Standard_A2m_v2': {
        vCpus: 2, memory: 16, type: 'Memory Optimized', score: 220,
        architecture: 'x64', hyperVGen: 'V1', acus: 100, gpus: 0,
        maxNics: 2, rdma: false, acceleratedNet: false,
        osDiskSize: '1023 GiB', resDiskSize: '20 GiB', maxDisks: 4, premiumDisk: false,
        uncachedIops: 2000, uncacheThroughput: '20 MiB/s'
    },
    'Standard_A4m_v2': {
        vCpus: 4, memory: 32, type: 'Memory Optimized', score: 440,
        architecture: 'x64', hyperVGen: 'V1', acus: 100, gpus: 0,
        maxNics: 4, rdma: false, acceleratedNet: false,
        osDiskSize: '1023 GiB', resDiskSize: '40 GiB', maxDisks: 8, premiumDisk: false,
        uncachedIops: 4000, uncacheThroughput: '40 MiB/s'
    },
    'Standard_A8m_v2': {
        vCpus: 8, memory: 64, type: 'Memory Optimized', score: 880,
        architecture: 'x64', hyperVGen: 'V1', acus: 100, gpus: 0,
        maxNics: 8, rdma: false, acceleratedNet: false,
        osDiskSize: '1023 GiB', resDiskSize: '80 GiB', maxDisks: 16, premiumDisk: false,
        uncachedIops: 8000, uncacheThroughput: '80 MiB/s'
    },


    'Standard_A1_v2': {
        vCpus: 1, memory: 2, type: 'General Purpose', score: 100,
        architecture: 'x64', hyperVGen: 'V1', acus: 100, gpus: 0,
        maxNics: 2, rdma: false, acceleratedNet: false,
        osDiskSize: '1023 GiB', resDiskSize: '10 GiB', maxDisks: 2, premiumDisk: false,
        uncachedIops: 1000, uncacheThroughput: '10 MiB/s'
    },

    'Standard_A2_v2': {
        vCpus: 2, memory: 4, type: 'General Purpose', score: 200,
        architecture: 'x64', hyperVGen: 'V1', acus: 100, gpus: 0,
        maxNics: 2, rdma: false, acceleratedNet: false,
        osDiskSize: '1023 GiB', resDiskSize: '20 GiB', maxDisks: 4, premiumDisk: false,
        uncachedIops: 2000, uncacheThroughput: '20 MiB/s'
    },
    'Standard_A4_v2': {
        vCpus: 4, memory: 8, type: 'General Purpose', score: 400,
        architecture: 'x64', hyperVGen: 'V1', acus: 100, gpus: 0,
        maxNics: 4, rdma: false, acceleratedNet: false,
        osDiskSize: '1023 GiB', resDiskSize: '40 GiB', maxDisks: 8, premiumDisk: false,
        uncachedIops: 4000, uncacheThroughput: '40 MiB/s'
    },
    'Standard_A8_v2': {
        vCpus: 8, memory: 16, type: 'General Purpose', score: 800,
        architecture: 'x64', hyperVGen: 'V1', acus: 100, gpus: 0,
        maxNics: 8, rdma: true, acceleratedNet: true,
        osDiskSize: '1023 GiB', resDiskSize: '80 GiB', maxDisks: 16, premiumDisk: false,
        uncachedIops: 8000, uncacheThroughput: '80 MiB/s'
    },

    // B-Series (Burstable)
    'Standard_B1ls': { vCpus: 1, memory: 0.5, type: 'Burstable', score: 50, architecture: 'x64', premiumDisk: true },
    'Standard_B1s': { vCpus: 1, memory: 1, type: 'Burstable', score: 80, architecture: 'x64', premiumDisk: true },
    'Standard_B1ms': { vCpus: 1, memory: 2, type: 'Burstable', score: 100, architecture: 'x64', premiumDisk: true },
    'Standard_B2s': { vCpus: 2, memory: 4, type: 'Burstable', score: 200, architecture: 'x64', premiumDisk: true },
    'Standard_B2ms': { vCpus: 2, memory: 8, type: 'Burstable', score: 250, architecture: 'x64', premiumDisk: true },
    'Standard_B4ms': { vCpus: 4, memory: 16, type: 'Burstable', score: 500, architecture: 'x64', premiumDisk: true },
    'Standard_B8ms': { vCpus: 8, memory: 32, type: 'Burstable', score: 1000, architecture: 'x64', premiumDisk: true },

    // D-Series v3
    'Standard_D2s_v3': {
        vCpus: 2, memory: 8, type: 'General Purpose', score: 300,
        architecture: 'x64', hyperVGen: 'V1/V2', acus: 160, gpus: 0,
        maxNics: 2, rdma: false, acceleratedNet: true,
        osDiskSize: '1023 GiB', resDiskSize: '16 GiB', maxDisks: 4, premiumDisk: true,
        uncachedIops: 3200, uncacheThroughput: '48 MiB/s'
    },
    'Standard_D4s_v3': {
        vCpus: 4, memory: 16, type: 'General Purpose', score: 600,
        architecture: 'x64', hyperVGen: 'V1/V2', acus: 160, gpus: 0,
        maxNics: 2, rdma: false, acceleratedNet: true,
        osDiskSize: '1023 GiB', resDiskSize: '32 GiB', maxDisks: 8, premiumDisk: true,
        uncachedIops: 6400, uncacheThroughput: '96 MiB/s'
    },
    'Standard_D8s_v3': {
        vCpus: 8, memory: 32, type: 'General Purpose', score: 1200,
        architecture: 'x64', hyperVGen: 'V1/V2', acus: 160, gpus: 0,
        maxNics: 4, rdma: false, acceleratedNet: true,
        osDiskSize: '1023 GiB', resDiskSize: '64 GiB', maxDisks: 16, premiumDisk: true,
        uncachedIops: 12800, uncacheThroughput: '192 MiB/s'
    },
    'Standard_D16s_v3': {
        vCpus: 16, memory: 64, type: 'General Purpose', score: 2400,
        architecture: 'x64', hyperVGen: 'V1/V2', acus: 160, gpus: 0,
        maxNics: 8, rdma: false, acceleratedNet: true,
        osDiskSize: '1023 GiB', resDiskSize: '128 GiB', maxDisks: 32, premiumDisk: true,
        uncachedIops: 25600, uncacheThroughput: '384 MiB/s'
    },

    // D-Series v4
    'Standard_D2s_v4': { vCpus: 2, memory: 8, type: 'General Purpose', score: 320, architecture: 'x64', premiumDisk: true },
    'Standard_D4s_v4': { vCpus: 4, memory: 16, type: 'General Purpose', score: 640, architecture: 'x64', premiumDisk: true },
    'Standard_D8s_v4': { vCpus: 8, memory: 32, type: 'General Purpose', score: 1280, architecture: 'x64', premiumDisk: true },

    // D-Series v5
    'Standard_D2ds_v5': { vCpus: 2, memory: 8, type: 'General Purpose', score: 350, architecture: 'x64', premiumDisk: true, acceleratedNet: true },
    'Standard_D4ds_v5': { vCpus: 4, memory: 16, type: 'General Purpose', score: 700, architecture: 'x64', premiumDisk: true, acceleratedNet: true },

    // ── Compute Optimized (F series) ──
    'Standard_F2s_v2': { vCpus: 2, memory: 4, type: 'Compute Optimized', score: 350, architecture: 'x64', premiumDisk: true },
    'Standard_F4s_v2': { vCpus: 4, memory: 8, type: 'Compute Optimized', score: 700, architecture: 'x64', premiumDisk: true },
    'Standard_F8s_v2': { vCpus: 8, memory: 16, type: 'Compute Optimized', score: 1400, architecture: 'x64', premiumDisk: true },
    'Standard_F16s_v2': { vCpus: 16, memory: 32, type: 'Compute Optimized', score: 2800, architecture: 'x64', premiumDisk: true },

    // ── Memory Optimized (E series) ──
    'Standard_E2s_v3': { vCpus: 2, memory: 16, type: 'Memory Optimized', score: 300, architecture: 'x64', premiumDisk: true },
    'Standard_E4s_v3': { vCpus: 4, memory: 32, type: 'Memory Optimized', score: 600, architecture: 'x64', premiumDisk: true },
    'Standard_E8s_v3': { vCpus: 8, memory: 64, type: 'Memory Optimized', score: 1200, architecture: 'x64', premiumDisk: true },
    'Standard_E2s_v4': { vCpus: 2, memory: 16, type: 'Memory Optimized', score: 320, architecture: 'x64', premiumDisk: true },
    'Standard_E4s_v4': { vCpus: 4, memory: 32, type: 'Memory Optimized', score: 640, architecture: 'x64', premiumDisk: true },
    'Standard_E20s_v4': { vCpus: 20, memory: 160, type: 'Memory Optimized', score: 3200, architecture: 'x64', premiumDisk: true },

    // ── GPU (N series) ──
    'Standard_NC6': { vCpus: 6, memory: 56, type: 'GPU', score: 2000, gpu: '1x K80', architecture: 'x64' },
    'Standard_NC12': { vCpus: 12, memory: 112, type: 'GPU', score: 4000, gpu: '2x K80', architecture: 'x64' },
    'Standard_NC6s_v3': { vCpus: 6, memory: 112, type: 'GPU', score: 3000, gpu: '1x V100', architecture: 'x64' }
};
