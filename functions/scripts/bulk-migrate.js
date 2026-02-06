#!/usr/bin/env node

/**
 * BULK MIGRATION SCRIPT - Convert onRequest to onCall
 * This script automatically converts functions from onRequest to onCall pattern
 * Usage: node scripts/bulk-migrate.js
 */

const fs = require('fs');
const path = require('path');

const MODULES_DIR = path.join(__dirname, '../src/modules');
let migratedCount = 0;
let errorCount = 0;

function convertOnRequestToOnCall(filePath) {
    try {
        let content = fs.readFileSync(filePath, 'utf-8');
        const originalContent = content;
        const fileName = path.basename(filePath);
        const functionName = fileName.replace('.ts', '');

        // Skip if already uses onCall
        if (content.includes('createCallableFunction') || (content.includes('functions.https.onCall') && !content.includes('onRequest'))) {
            return { status: 'skipped', reason: 'Already optimized' };
        }

        // Extract function details
        const exportMatch = content.match(/export const (\w+) = functions\.https\.onRequest\(/);
        if (!exportMatch) {
            return { status: 'error', reason: 'Could not extract function name' };
        }

        // Basic conversion template
        const newTemplate = `import { createCallableFunction } from "../../utils/callable";

// Request type
interface FunctionRequest {
    [key: string]: any;
}

export const ${exportMatch[1]} = createCallableFunction<FunctionRequest, any>(
    async (data, auth, context) => {
        // TODO: Implement function logic
        // 1. Extract data from 'data' parameter instead of req.body
        // 2. Use 'auth?.uid' instead of manual authentication
        // 3. Return result directly instead of res.status().json()
        
        throw new Error("Function migration in progress");
    },
    { region: "asia-south1", requireAuth: true }
);`;

        // For now, just mark files that need migration
        if (!content.includes('// [MIGRATION-REQUIRED]')) {
            // Add migration marker
            content = `// [MIGRATION-REQUIRED]\n${content}`;
            fs.writeFileSync(filePath, content);
            return { status: 'marked', file: filePath };
        }

        return { status: 'already_marked' };
    } catch (error) {
        return { status: 'error', reason: error.message };
    }
}

function walkDir(dir) {
    let results = [];
    const files = fs.readdirSync(dir);

    for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            results = results.concat(walkDir(filePath));
        } else if (file.endsWith('.ts') && !file.includes('.test.')) {
            results.push(filePath);
        }
    }

    return results;
}

function main() {
    console.log('🚀 Starting bulk migration from onRequest to onCall...\n');

    const files = walkDir(MODULES_DIR);
    const results = {
        marked: [],
        skipped: [],
        errors: []
    };

    files.forEach(file => {
        const result = convertOnRequestToOnCall(file);
        const relPath = path.relative(process.cwd(), file);

        if (result.status === 'marked') {
            results.marked.push(relPath);
            migratedCount++;
            console.log(`✓ Marked for migration: ${relPath}`);
        } else if (result.status === 'skipped') {
            results.skipped.push({ file: relPath, reason: result.reason });
        } else if (result.status === 'error') {
            results.errors.push({ file: relPath, error: result.reason });
            errorCount++;
            console.log(`✗ Error: ${relPath} - ${result.reason}`);
        }
    });

    console.log('\n📊 Migration Summary:');
    console.log(`   ✓ Marked for migration: ${migratedCount}`);
    console.log(`   ~ Skipped (already optimized): ${results.skipped.length}`);
    console.log(`   ✗ Errors: ${errorCount}\n`);

    console.log('Next Steps:');
    console.log('1. Review marked files: grep -r "// \\[MIGRATION-REQUIRED\\]" src/');
    console.log('2. For each marked file, convert using MIGRATION_TEMPLATE.md as reference');
    console.log('3. Test with: npm run optimize:test');
    console.log('4. Deploy with: npm run optimize:deploy');

    // Save report
    const report = {
        timestamp: new Date().toISOString(),
        summary: {
            marked: migratedCount,
            skipped: results.skipped.length,
            errors: errorCount,
            total: files.length
        },
        details: results
    };

    fs.writeFileSync(
        path.join(__dirname, '../bulk-migration-report.json'),
        JSON.stringify(report, null, 2)
    );

    console.log('\n✅ Report saved to bulk-migration-report.json');
}

main();
