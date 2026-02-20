import { createClient } from '@libsql/client';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

async function test() {
    console.log('Testing Turso connection...');
    console.log('URL:', process.env.TURSO_DATABASE_URL);

    // Test with https protocol forced
    const httpsUrl = process.env.TURSO_DATABASE_URL.replace('libsql://', 'https://');

    const db = createClient({
        url: httpsUrl,
        authToken: process.env.TURSO_AUTH_TOKEN
    });

    try {
        const res = await db.execute('SELECT 1');
        console.log('✅ Connection successful:', res);
    } catch (err) {
        console.error('❌ Connection failed:', err);
    }
}

test();
