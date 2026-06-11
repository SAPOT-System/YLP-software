import { Command } from 'commander';

const program = new Command();

program
  .name('seed-test-accounts')
  .description('Create N stress-test accounts in the Sapot FastAPI server')
  .requiredOption('--server-url <url>', 'FastAPI base URL (e.g. http://192.168.1.100:8000)')
  .requiredOption('--count <n>', 'number of accounts to create', parseInt)
  .option('--prefix <prefix>', 'username prefix', 'stress_peer_')
  .option('--password <password>', 'password for all accounts', 'StressTest@123')
  .action(async (opts: { serverUrl: string; count: number; prefix: string; password: string }) => {
    const { serverUrl, count, prefix, password } = opts;
    let created = 0;
    let skipped = 0;

    console.log(`Seeding ${count} accounts at ${serverUrl} (prefix: "${prefix}")...`);

    for (let i = 0; i < count; i++) {
      const username = `${prefix}${i}`;
      try {
        const res = await fetch(`${serverUrl}/auth/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username,
            first_name: 'Stress',
            last_name: `Peer${i}`,
            password,
            terms_accepted: true,
          }),
        });
        if (res.status === 201) { created++; }
        else if ([400, 409, 422].includes(res.status)) { skipped++; }
        else { console.error(`\nFailed for ${username}: ${res.status} ${await res.text()}`); }
        process.stdout.write(`\r  Created: ${created} | Skipped: ${skipped} | Progress: ${i + 1}/${count}`);
      } catch (err) {
        console.error(`\nRequest error for ${username}: ${(err as Error).message}`);
      }
    }

    console.log(`\nDone. Created: ${created}, Already existed: ${skipped}`);
  });

program.parse(process.argv);
