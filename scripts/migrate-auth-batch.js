#!/usr/bin/env node
/**
 * Batch migration script for Auth functions
 * Converts all onRequest functions to onCall pattern
 */

const fs = require('fs');
const path = require('path');

const authFunctions = [
    {
        file: 'src/modules/auth/registerUser.ts',
        name: 'registerUser',
        type: 'complex-write',
        description: 'Create user with profile'
    },
    {
        file: 'src/modules/auth/registerSeller.ts',
        name: 'registerSeller',
        type: 'complex-write',
        description: 'Create seller with profile'
    },
    {
        file: 'src/modules/auth/logout.ts',
        name: 'logout',
        type: 'simple-write',
        description: 'Revoke refresh tokens'
    },
    {
        file: 'src/modules/auth/refreshToken.ts',
        name: 'refreshToken',
        type: 'simple-read',
        description: 'Get new ID token'
    },
    {
        file: 'src/modules/auth/deleteUser.ts',
        name: 'deleteUser',
        type: 'complex-write',
        description: 'Delete user and all data'
    },
    {
        file: 'src/modules/auth/deleteSeller.ts',
        name: 'deleteSeller',
        type: 'complex-write',
        description: 'Delete seller and all data'
    },
    {
        file: 'src/modules/auth/changePassword.ts',
        name: 'changePassword',
        type: 'simple-write',
        description: 'Update user password'
    },
    {
        file: 'src/modules/auth/requestPasswordReset.ts',
        name: 'requestPasswordReset',
        type: 'simple-write',
        description: 'Send password reset email'
    },
    {
        file: 'src/modules/auth/confirmPasswordReset.ts',
        name: 'confirmPasswordReset',
        type: 'simple-write',
        description: 'Confirm password reset'
    },
    {
        file: 'src/modules/auth/reauthenticate.ts',
        name: 'reauthenticate',
        type: 'simple-read',
        description: 'Re-verify user credentials'
    },
    {
        file: 'src/modules/auth/phoneLogin.ts',
        name: 'phoneLogin',
        type: 'complex-read',
        description: 'Login with phone number'
    }
];

console.log('📋 Auth Functions Migration Report');
console.log('==================================\n');

authFunctions.forEach((fn, idx) => {
    const fullPath = path.join('functions', fn.file);
    const exists = fs.existsSync(fullPath);
    console.log(`${idx + 1}. ${fn.name}`);
    console.log(`   File: ${fn.file}`);
    console.log(`   Type: ${fn.type}`);
    console.log(`   Status: ${exists ? '✅ Found' : '❌ Not found'}`);
    console.log(`   Task: ${fn.description}`);
    console.log('');
});

console.log('\n📊 Summary');
console.log('==========');
console.log(`Total Functions: ${authFunctions.length}`);
console.log(`Estimated Time: 3-4 hours`);
console.log(`Status: Ready to migrate\n`);

console.log('✨ Next Steps:');
console.log('1. npm run optimize:analyze - Check current state');
console.log('2. Run migration script to update all functions');
console.log('3. npm run optimize:build - Verify TypeScript compilation');
console.log('4. npm run optimize:test - Test converted functions');
console.log('5. npm run optimize:deploy - Deploy changes\n');
