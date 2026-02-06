#!/usr/bin/env node

// # ============================================
// # OPTIMIZATION BUILD & DEPLOYMENT SCRIPT
// # ============================================
// # This script helps build and deploy optimized functions
// # Usage: npm run optimize [build|deploy|serve|analyze]
// # Or: node scripts/build-deploy.js [build|deploy|serve|analyze]

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';

const projectRoot = path.join(__dirname, '..');
const functionsDir = path.join(projectRoot, '../functions');

function print(msg, color = RESET) {
    console.log(`${color}${msg}${RESET}`);
}

function success(msg) {
    print(`✓ ${msg}`, GREEN);
}

function error(msg) {
    print(`✗ ${msg}`, RED);
}

function warning(msg) {
    print(`⚠ ${msg}`, YELLOW);
}

function info(msg) {
    print(`ℹ ${msg}`, BLUE);
}

function checkPrerequisites() {
    info('Checking prerequisites...');

    try {
        execSync('node --version', { stdio: 'pipe' });
        success('Node.js is installed');
    } catch {
        error('Node.js not found. Please install Node.js 20 or higher.');
        process.exit(1);
    }

    try {
        execSync('firebase --version', { stdio: 'pipe' });
        success('Firebase CLI is installed');
    } catch {
        error('Firebase CLI not found. Install it with: npm install -g firebase-tools');
        process.exit(1);
    }

    print('');
}

function buildFunctions() {
    info('Building TypeScript functions...');

    if (!fs.existsSync(functionsDir)) {
        error('functions directory not found');
        process.exit(1);
    }

    try {
        // Check if node_modules exists
        const nodeModulesPath = path.join(functionsDir, 'node_modules');
        if (!fs.existsSync(nodeModulesPath)) {
            warning('Installing dependencies...');
            execSync('npm install', { cwd: functionsDir, stdio: 'inherit' });
        }

        // Run lint
        info('Linting TypeScript...');
        try {
            execSync('npm run lint', { cwd: functionsDir, stdio: 'inherit' });
        } catch {
            warning('Lint errors found (continuing)');
        }

        // Build
        info('Compiling TypeScript...');
        execSync('npm run build', { cwd: functionsDir, stdio: 'inherit' });

        // Verify build
        const libDir = path.join(functionsDir, 'lib');
        if (!fs.existsSync(libDir) || fs.readdirSync(libDir).length === 0) {
            error('Build failed: lib directory is empty');
            process.exit(1);
        }

        success('Build successful');
    } catch (err) {
        error(`Build failed: ${err.message}`);
        process.exit(1);
    }

    print('');
}

function testFunctionsLocal() {
    info('Testing functions locally with Firebase Emulator...');
    print('');
    warning('Functions will be available at:');
    info('  • Emulator UI: http://localhost:4000');
    info('  • Functions: http://localhost:5001');
    print('');
    warning('Press Ctrl+C to stop the emulator');
    print('');

    try {
        execSync('npm run serve', { cwd: functionsDir, stdio: 'inherit' });
    } catch (err) {
        if (!err.killed) {
            error(`Emulator failed: ${err.message}`);
        }
    }
}

function analyzeFunctions() {
    info('Analyzing functions for optimization opportunities...');

    const helperScript = path.join(functionsDir, 'scripts/migration-helper.js');

    if (fs.existsSync(helperScript)) {
        try {
            execSync(`node "${helperScript}"`, {
                cwd: functionsDir,
                stdio: 'inherit'
            });
        } catch (err) {
            error(`Analysis failed: ${err.message}`);
        }
    } else {
        warning('Migration helper script not found');
    }

    print('');
}

function deployFunctions() {
    info('Deploying functions to Firebase...');
    print('');

    try {
        // Check if logged in
        try {
            execSync('firebase projects:list', { stdio: 'pipe' });
        } catch {
            error('Not logged in to Firebase. Run: firebase login');
            process.exit(1);
        }

        // Get current project
        let project;
        try {
            const output = execSync('firebase projects:list', {
                encoding: 'utf-8',
                stdio: 'pipe'
            });
            const lines = output.trim().split('\n');
            if (lines.length > 1) {
                project = lines[1].split(/\s+/)[0];
            }
        } catch {
            error('Could not determine Firebase project');
            process.exit(1);
        }

        if (!project) {
            error('No Firebase project set. Run: firebase use --add');
            process.exit(1);
        }

        success(`Current project: ${project}`);
        print('');

        // Deploy
        warning('Deploying functions...');
        execSync('npm run deploy', { cwd: functionsDir, stdio: 'inherit' });

        success('Deployment complete!');
        print('');
        info('View metrics in Firebase Console:');
        info('  https://console.firebase.google.com/functions');
        print('');
    } catch (err) {
        if (!err.killed) {
            error(`Deployment failed: ${err.message}`);
            process.exit(1);
        }
    }
}

function showDeploymentStatus() {
    info('Function Deployment Status');
    print('='.repeat(50));
    print('');

    try {
        execSync('firebase functions:list', {
            cwd: functionsDir,
            stdio: 'inherit'
        });
    } catch (err) {
        warning('Could not fetch deployment status');
    }

    print('');
}

function showPerformanceTips() {
    info('⚡ Performance Optimization Tips');
    print('='.repeat(50));
    print('');
    print('1. Monitor execution times in Firebase Console');
    print('2. Check logs for slow operations:');
    print('   firebase functions:log');
    print('');
    print('3. Ensure Firestore composite indexes are created');
    print('');
    print('4. Review the OPTIMIZATION_GUIDE.md for best practices');
    print('');
    print('5. Gradually migrate functions using MIGRATION_TEMPLATE.md');
    print('');
}

function showHelp() {
    print('Firebase Functions Optimization Script', BLUE);
    print('');
    print('Usage: node scripts/build-deploy.js [COMMAND]');
    print('Or via npm: npm run optimize -- [COMMAND]');
    print('');
    print('Commands:');
    print('  build              Build TypeScript functions');
    print('  test|serve|local   Build and run locally with Firebase emulator');
    print('  deploy             Build and deploy to Firebase');
    print('  analyze            Analyze functions for optimization opportunities');
    print('  status             Show deployed functions status');
    print('  tips               Show performance optimization tips');
    print('  help               Show this help message');
    print('');
    print('Examples:');
    print('  node scripts/build-deploy.js build');
    print('  node scripts/build-deploy.js test');
    print('  node scripts/build-deploy.js deploy');
    print('  npm run optimize -- analyze');
    print('');
    showPerformanceTips();
}

// Main command handler
const command = process.argv[2] || 'help';

try {
    switch (command) {
        case 'build':
            checkPrerequisites();
            buildFunctions();
            success('Ready to deploy!');
            break;

        case 'test':
        case 'serve':
        case 'local':
            checkPrerequisites();
            buildFunctions();
            testFunctionsLocal();
            break;

        case 'deploy':
            checkPrerequisites();
            buildFunctions();
            deployFunctions();
            showDeploymentStatus();
            break;

        case 'analyze':
            analyzeFunctions();
            break;

        case 'status':
            showDeploymentStatus();
            break;

        case 'tips':
            showPerformanceTips();
            break;

        case 'help':
        case '--help':
        case '-h':
            showHelp();
            break;

        default:
            error(`Unknown command: ${command}`);
            print('Run: node scripts/build-deploy.js help');
            process.exit(1);
    }
} catch (err) {
    error(`Script error: ${err.message}`);
    process.exit(1);
}
