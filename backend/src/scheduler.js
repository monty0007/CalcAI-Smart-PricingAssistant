
import cron from 'node-cron';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// On Azure App Service (Linux) the binary may be 'python3'; fall back gracefully
const PYTHON_CMD = process.env.PYTHON_CMD || 'python';

export function initScheduler() {
    console.log('--- Initializing Azure Price Scheduler ---');

    // Schedule: Every day at 00:00 IST (18:30 UTC previous day)
    cron.schedule('0 0 * * *', () => {
        runSyncSequence();
    }, {
        timezone: 'Asia/Kolkata'
    });

    console.log('Scheduler Active: Nightly sync set for 00:00 IST');
}

async function runSyncSequence() {
    const start = new Date();
    console.log(`\n[Scheduler] ===== Nightly Sync Started at ${start.toISOString()} =====`);
    try {
        console.log('[Scheduler] Step 1/2 — Updating currency rates...');
        await runPythonScript('../scripts/update_currency_rates.py');

        console.log('[Scheduler] Step 2/2 — Updating Azure prices (incremental)...');
        await runPythonScript('../scripts/update_prices.py');

        const elapsed = ((Date.now() - start) / 1000 / 60).toFixed(1);
        console.log(`[Scheduler] ===== Nightly Sync Complete in ${elapsed}m =====\n`);
    } catch (err) {
        console.error('[Scheduler] ❌ Sync sequence failed:', err.message);
    }
}

function runPythonScript(relativeScriptPath) {
    return new Promise((resolve, reject) => {
        const scriptPath = path.join(__dirname, relativeScriptPath);
        const scriptName = path.basename(relativeScriptPath);

        // Try configured python command; if it fails with ENOENT try 'python3'
        function trySpawn(cmd) {
            const proc = spawn(cmd, [scriptPath]);

            proc.stdout.on('data', (data) => {
                process.stdout.write(`[${scriptName}] ${data}`);
            });

            proc.stderr.on('data', (data) => {
                process.stderr.write(`[${scriptName} ERR] ${data}`);
            });

            proc.on('error', (err) => {
                if (err.code === 'ENOENT' && cmd === PYTHON_CMD && cmd !== 'python3') {
                    console.warn(`[Scheduler] '${cmd}' not found, retrying with 'python3'...`);
                    trySpawn('python3');
                } else {
                    reject(new Error(`Failed to start ${scriptName}: ${err.message}`));
                }
            });

            proc.on('close', (code) => {
                console.log(`[${scriptName}] exited with code ${code}`);
                if (code === 0) resolve();
                else reject(new Error(`${scriptName} failed with exit code ${code}`));
            });
        }

        trySpawn(PYTHON_CMD);
    });
}
