import { migrateChangesLogToEvents, normalizeEventsJson } from '../src/events.js';

async function main() {
  try {
    migrateChangesLogToEvents();
  } catch (e) { console.error('migrate failed', e && e.message); }
  try {
    normalizeEventsJson();
  } catch (e) { console.error('normalize failed', e && e.message); }
  console.log('events migration complete');
}

main();
