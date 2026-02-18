
import cron from 'node-cron';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function initScheduler() {
    console.log('--- Initializing Azure Price Scheduler ---');

    // Schedule: Every day at 00:00 (Midnight)
    // Format: minute hour day-of-month month day-of-week
    cron.schedule('0 0 * * *', () => {
        runSyncSequence();
    }, {
        timezone: 'Asia/Kolkata'
    });

    console.log('Scheduler Active: Nightly sync set for 00:00 IST');
}

async function runSyncSequence() {
    console.log(`[${new Date().toISOString()}] Starting Nightly Azure Sync Sequence...`);
    try {
        console.log('Step 1: Updating Currency Rates...');
        await runPythonScript('../scripts/update_currency_rates.py');

        console.log('Step 2: Updating Azure Prices (Incremental)...');
        await runPythonScript('../scripts/daily_sync.py');

        console.log(`[${new Date().toISOString()}] Nightly Sync Sequence Complete.`);
    } catch (err) {
        console.error('Critical failure in sync sequence:', err);
    }
}

function runPythonScript(relativeScriptPath) {
    return new Promise((resolve, reject) => {
        const scriptPath = path.join(__dirname, relativeScriptPath);
        const pythonProcess = spawn('python', [scriptPath]);
        const scriptName = path.basename(relativeScriptPath);

        pythonProcess.stdout.on('data', (data) => {
            process.stdout.write(`[${scriptName}] ${data}`);
        });

        pythonProcess.stderr.on('data', (data) => {
            console.error(`[${scriptName} Error] ${data}`);
        });

        pythonProcess.on('close', (code) => {
            console.log(`[${scriptName}] Process exited with code ${code}`);
            if (code === 0) resolve();
            else reject(new Error(`Script ${scriptName} failed with code ${code}`));
        });
    });
}
