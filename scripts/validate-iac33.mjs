import { execSync } from 'node:child_process';

const commands = [
  ['typecheck', 'npm run typecheck'],
  ['build', 'npm run build'],
  ['test', 'npm test -- --run'],
];

let failed = false;
for (const [name, command] of commands) {
  console.log(`\n=== IAC33 ${name} ===`);
  try {
    execSync(command, { stdio: 'inherit' });
  } catch {
    failed = true;
    console.error(`IAC33 ${name} FAILED`);
  }
}

if (failed) process.exit(1);
console.log('\nIAC33 validation completed successfully.');
