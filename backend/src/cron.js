import cron from 'node-cron';
import { runFullSync } from './sync.js';

let cronJob = null;

/**
 * Start the nightly sync cron job
 */
export function startCron(schedule = '0 0 * * *') {
    if (cronJob) {
        cronJob.stop();
    }

    if (!cron.validate(schedule)) {
        console.error(`❌ Invalid cron schedule: ${schedule}`);
        return;
    }

    cronJob = cron.schedule(schedule, async () => {
        console.log(`⏰ Cron triggered at ${new Date().toISOString()}`);
        try {
            await runFullSync();
        } catch (err) {
            console.error('Cron sync failed:', err.message);
        }
    }, {
        timezone: 'Asia/Kolkata', // IST midnight
    });

    console.log(`⏰ Cron scheduled: "${schedule}" (IST)`);
}

/**
 * Stop the cron job
 */
export function stopCron() {
    if (cronJob) {
        cronJob.stop();
        cronJob = null;
        console.log('⏰ Cron stopped');
    }
}
