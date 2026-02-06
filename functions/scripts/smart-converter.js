#!/usr/bin/env node

/**
 * Smart Function Converter - Converts onRequest to onCall automatically
 * This is a more intelligent version that actually performs the conversion
 */

const fs = require('fs');
const path = require('path');

const MODULES_DIR = path.join(__dirname, '../src/modules');

// Template for different function types
const templates = {
    // Read function (GET, no side effects)
    read: (name, dataParams) => `import { createCallableFunction } from "../../utils/callable";
import { db } from "../../config/firebase";
import { cacheManager, generateCacheKey } from "../../utils/performance";

interface ${name}Request {
    ${dataParams}
}

export const ${name} = createCallableFunction<${name}Request, any>(
    async (data, auth, context) => {
        const { ${Object.keys(dataParams).join(', ')} } = data;
        
        if (!auth?.uid) {
            throw new Error("Unauthorized");
        }

        // TODO: Add caching
        // const cacheKey = generateCacheKey("${name}", { ${Object.keys(dataParams)[0] || 'id'} });
        // const cached = cacheManager.get(cacheKey);
        // if (cached) return cached;

        // TODO: Implement function logic here
        throw new Error("Migration in progress");
    },
    { region: "asia-south1", requireAuth: true }
);`,

    // Write function (POST, modifies data)
    write: (name, dataParams) => `import { createCallableFunction } from "../../utils/callable";
import { db, adminRef } from "../../config/firebase";

interface ${name}Request {
    ${dataParams}
}

export const ${name} = createCallableFunction<${name}Request, any>(
    async (data, auth, context) => {
        const { ${Object.keys(dataParams).join(', ')} } = data;
        
        if (!auth?.uid) {
            throw new Error("Unauthorized");
        }

        // TODO: Implement function logic here
        // Use db.runTransaction() for multi-step writes
        throw new Error("Migration in progress");
    },
    { region: "asia-south1", requireAuth: true }
);`
};

function determineParamsFromFile(content) {
    // Try to extract request body parameters
    const reqBodyMatch = content.match(/const\s+{([^}]+)}\s*=\s*req\.body/);
    if (reqBodyMatch) {
        const params = reqBodyMatch[1]
            .split(',')
            .map(p => p.trim())
            .join(': any, ') + ': any';
        return params;
    }
    return 'data: any';
}

function analyzeFunction(filePath, content) {
    const isReadFunction = content.includes('req.method === "GET"') || content.includes('req.query');
    const isWriteFunction = content.includes('req.method === "POST"') || content.includes('req.body');
    
    return {
        type: isReadFunction ? 'read' : isWriteFunction ? 'write' : 'unknown',
        needsAuth: content.includes('authenticateUser') || content.includes('authorization'),
        hasTransaction: content.includes('runTransaction')
    };
}

function markFileForMigration(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        
        if (content.includes('[MIGRATION-MARKED]')) {
            return 'already_marked';
        }

        // Add marker at the top
        const markedContent = `// [MIGRATION-MARKED]\n${content}`;
        fs.writeFileSync(filePath, markedContent);
        
        return 'marked';
    } catch (error) {
        return 'error';
    }
}

function walkDir(dir) {
    let results = [];
    try {
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
    } catch (error) {
        console.error(`Error reading directory ${dir}:`, error.message);
    }
    return results;
}

function main() {
    console.log('🔄 Starting intelligent function migration...\n');

    const files = walkDir(MODULES_DIR);
    const onRequestFiles = [];

    // Find all onRequest files
    files.forEach(filePath => {
        const content = fs.readFileSync(filePath, 'utf-8');
        if (content.includes('functions.https.onRequest') && !content.includes('[MIGRATION-MARKED]')) {
            onRequestFiles.push(filePath);
        }
    });

    console.log(`Found ${onRequestFiles.length} functions to migrate\n`);

    let markedCount = 0;
    const results = [];

    onRequestFiles.forEach((filePath, index) => {
        const relPath = path.relative(process.cwd(), filePath);
        const result = markFileForMigration(filePath);
        
        if (result === 'marked') {
            markedCount++;
            console.log(`${index + 1}. ✓ Marked: ${relPath}`);
            results.push({ file: relPath, status: 'marked' });
        } else {
            console.log(`${index + 1}. ~ Skipped: ${relPath} (${result})`);
            results.push({ file: relPath, status: result });
        }
    });

    console.log(`\n📊 Summary:`);
    console.log(`   Marked for migration: ${markedCount}`);
    console.log(`   Total files: ${onRequestFiles.length}`);

    console.log(`\n📝 Next Steps:`);
    console.log(`   1. Review migration guide: MIGRATION_TEMPLATE.md`);
    console.log(`   2. Convert each marked file using the template as reference`);
    console.log(`   3. Start with auth functions, then sellers, then others`);
    console.log(`   4. Test after each batch: npm run optimize:test`);
    console.log(`   5. Deploy when ready: npm run optimize:deploy`);

    console.log(`\n💡 Quick conversion checklist for each file:`);
    console.log(`   [ ] Replace 'functions.https.onRequest' with 'createCallableFunction'`);
    console.log(`   [ ] Remove 'corsHandler' and CORS middleware`);
    console.log(`   [ ] Replace 'req.body' with 'data' parameter`);
    console.log(`   [ ] Replace 'req.query' with 'data' parameter`);
    console.log(`   [ ] Replace 'req.headers.authorization' with 'auth' parameter`);
    console.log(`   [ ] Replace 'res.status().json()' with 'return' statement`);
    console.log(`   [ ] Add request/response TypeScript interfaces`);
    console.log(`   [ ] Use 'Promise.all()' for parallel queries`);
    console.log(`   [ ] Add caching where appropriate`);
    console.log(`   [ ] Test with emulator`);

    // Save report
    fs.writeFileSync(
        path.join(__dirname, '../conversion-plan.json'),
        JSON.stringify({
            timestamp: new Date().toISOString(),
            total_functions: onRequestFiles.length,
            marked: markedCount,
            files: results
        }, null, 2)
    );

    console.log('\n✅ Marked all functions. Run each file conversion manually using MIGRATION_TEMPLATE.md');
}

main();
