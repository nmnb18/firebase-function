#!/usr/bin/env node

/**
 * Firebase Functions Migration Helper
 * This script helps identify functions that need migration and provides refactoring patterns
 * 
 * Usage: node scripts/migration-helper.js
 */

const fs = require('fs');
const path = require('path');

const MODULES_DIR = path.join(__dirname, '../src/modules');

/**
 * @typedef {Object} FunctionInfo
 * @property {string} name
 * @property {string} filePath
 * @property {'onRequest' | 'onCall' | 'unknown'} type
 * @property {boolean} requiresAuth
 * @property {boolean} isSequential
 * @property {string[]} issues
 * @property {string[]} suggestions
 */

/**
 * Analyze a single function file
 * @param {string} filePath
 * @returns {FunctionInfo}
 */
function analyzeFunctionFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const fileName = path.basename(filePath);
    const functionName = fileName.replace('.ts', '');

    const info = {
        name: functionName,
        filePath: filePath,
        type: 'unknown',
        requiresAuth: false,
        isSequential: false,
        issues: [],
        suggestions: []
    };

    // Check for onRequest
    if (content.includes('functions.https.onRequest')) {
        info.type = 'onRequest';
        info.issues.push('Uses onRequest (should use onCall)');
    }

    // Check for onCall
    if (content.includes('functions.https.onCall')) {
        info.type = 'onCall';
    }

    // Check for CORS
    if (content.includes('cors') && info.type === 'onRequest') {
        info.issues.push('Manual CORS handling (onCall handles this automatically)');
    }

    // Check for auth
    if (content.includes('authenticateUser') || content.includes('authorization')) {
        info.requiresAuth = true;
        info.issues.push('Manual authentication (use context.auth in onCall)');
    }

    // Check for sequential queries
    const getPatterns = (content.match(/await\s+db\.collection/g) || []).length;
    if (getPatterns >= 3) {
        info.isSequential = true;
        info.issues.push(`Multiple sequential queries detected (${getPatterns} get calls)`);
        info.suggestions.push('Use Promise.all() to parallelize queries');
    }

    // Check for res.status patterns
    if (content.includes('res.status')) {
        info.issues.push('HTTP response handling (unnecessary with onCall)');
    }

    return info;
}

/**
 * Walk directory recursively
 * @param {string} dir
 * @returns {string[]}
 */
function walkDir(dir) {
    let results = [];
    const files = fs.readdirSync(dir);

    for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            results = results.concat(walkDir(filePath));
        } else if (file.endsWith('.ts')) {
            results.push(filePath);
        }
    }

    return results;
}

/**
 * Main analysis function
 */
function main() {
    console.log('🔍 Analyzing Firebase Functions...\n');

    const files = walkDir(MODULES_DIR);
    const functions = files
        .map(file => analyzeFunctionFile(file))
        .filter(f => f.type !== 'unknown');

    // Sort by priority
    functions.sort((a, b) => {
        const aScore = a.issues.length;
        const bScore = b.issues.length;
        return bScore - aScore;
    });

    // Group by type
    const onRequest = functions.filter(f => f.type === 'onRequest');
    const onCall = functions.filter(f => f.type === 'onCall');

    console.log(`📊 Summary:`);
    console.log(`   • Total functions: ${functions.length}`);
    console.log(`   • onRequest: ${onRequest.length} (need migration)`);
    console.log(`   • onCall: ${onCall.length} (already optimized)\n`);

    // Show priority list
    if (onRequest.length > 0) {
        console.log('🚀 Priority Migration List (High Impact First):\n');

        onRequest.forEach((fn, index) => {
            console.log(`${index + 1}. ${fn.name}`);
            console.log(`   📁 ${path.relative(process.cwd(), fn.filePath)}`);
            console.log(`   ⚠️  Issues:`);
            fn.issues.forEach(issue => console.log(`      • ${issue}`));
            if (fn.suggestions.length > 0) {
                console.log(`   💡 Suggestions:`);
                fn.suggestions.forEach(sug => console.log(`      • ${sug}`));
            }
            console.log();
        });
    }

    // Export for tracking
    const report = {
        timestamp: new Date().toISOString(),
        summary: {
            total: functions.length,
            onRequest: onRequest.length,
            onCall: onCall.length
        },
        onRequest: onRequest,
        onCall: onCall
    };

    fs.writeFileSync(
        path.join(__dirname, '../migration-report.json'),
        JSON.stringify(report, null, 2)
    );

    console.log(`\n✅ Report saved to migration-report.json`);
}

main();

function analyzeFunctionFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const fileName = path.basename(filePath);
    const functionName = fileName.replace('.ts', '');

    const info = {
        name: functionName,
        filePath: filePath,
        type: 'unknown',
        requiresAuth: false,
        isSequential: false,
        issues: [],
        suggestions: []
    };

    // Check for onRequest
    if (content.includes('functions.https.onRequest')) {
        info.type = 'onRequest';
        info.issues.push('Uses onRequest (should use onCall)');
    }

    // Check for onCall
    if (content.includes('functions.https.onCall')) {
        info.type = 'onCall';
    }

    // Check for CORS
    if (content.includes('cors') && info.type === 'onRequest') {
        info.issues.push('Manual CORS handling (onCall handles this automatically)');
    }

    // Check for auth
    if (content.includes('authenticateUser') || content.includes('authorization')) {
        info.requiresAuth = true;
        info.issues.push('Manual authentication (use context.auth in onCall)');
    }

    // Check for sequential queries
    const getPatterns = (content.match(/await\s+db\.collection/g) || []).length;
    if (getPatterns >= 3) {
        info.isSequential = true;
        info.issues.push(`Multiple sequential queries detected (${getPatterns} get calls)`);
        info.suggestions.push('Use Promise.all() to parallelize queries');
    }

    // Check for res.status patterns
    if (content.includes('res.status')) {
        info.issues.push('HTTP response handling (unnecessary with onCall)');
    }

    return info;
}

function walkDir(dir) {
    let results = [];
    const files = fs.readdirSync(dir);

    for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            results = results.concat(walkDir(filePath));
        } else if (file.endsWith('.ts')) {
            results.push(filePath);
        }
    }

    return results;
}

function main() {
    console.log('🔍 Analyzing Firebase Functions...\n');

    const files = walkDir(MODULES_DIR);
    const functions = files
        .map(file => analyzeFunctionFile(file))
        .filter(f => f.type !== 'unknown');

    // Sort by priority
    functions.sort((a, b) => {
        const aScore = a.issues.length;
        const bScore = b.issues.length;
        return bScore - aScore;
    });

    // Group by type
    const onRequest = functions.filter(f => f.type === 'onRequest');
    const onCall = functions.filter(f => f.type === 'onCall');

    console.log(`📊 Summary:`);
    console.log(`   • Total functions: ${functions.length}`);
    console.log(`   • onRequest: ${onRequest.length} (need migration)`);
    console.log(`   • onCall: ${onCall.length} (already optimized)\n`);

    // Show priority list
    if (onRequest.length > 0) {
        console.log('🚀 Priority Migration List (High Impact First):\n');

        onRequest.forEach((fn, index) => {
            console.log(`${index + 1}. ${fn.name}`);
            console.log(`   📁 ${path.relative(process.cwd(), fn.filePath)}`);
            console.log(`   ⚠️  Issues:`);
            fn.issues.forEach(issue => console.log(`      • ${issue}`));
            if (fn.suggestions.length > 0) {
                console.log(`   💡 Suggestions:`);
                fn.suggestions.forEach(sug => console.log(`      • ${sug}`));
            }
            console.log();
        });
    }

    // Export for tracking
    const report = {
        timestamp: new Date().toISOString(),
        summary: {
            total: functions.length,
            onRequest: onRequest.length,
            onCall: onCall.length
        },
        onRequest: onRequest,
        onCall: onCall
    };

    fs.writeFileSync(
        path.join(__dirname, '../migration-report.json'),
        JSON.stringify(report, null, 2)
    );

    console.log(`\n✅ Report saved to migration-report.json`);
}

main();
