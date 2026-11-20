// Script to generate bcrypt hashes for seed accounts
// Run with: node scripts/generate-password-hashes.js

import bcrypt from 'bcryptjs';

const accounts = [
  {
    name: 'Test User',
    email: 'alimind.pipeline.test@example.com',
    password: 'DishGen-Lab!2026-Basil-Mango',
    role: 'user'
  },
  {
    name: 'Reviewer Account',
    email: 'reviewer@example.com',
    password: 'ReviewFlow!2026-Secure',
    role: 'reviewer'
  }
];

console.log('Generating bcrypt hashes...\n');

for (const account of accounts) {
  const hash = bcrypt.hashSync(account.password, 10);
  console.log(`-- ${account.name} (${account.role})`);
  console.log(`-- Email: ${account.email}`);
  console.log(`-- Password: ${account.password}`);
  console.log(`-- Hash: ${hash}\n`);
}
