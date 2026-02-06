#!/bin/bash

# ============================================
# OPTIMIZATION BUILD & DEPLOYMENT SCRIPT
# ============================================
# This script helps build and deploy optimized functions
# Usage: bash scripts/build-deploy.sh [build|deploy|serve]

set -e

cd "$(dirname "$0")/.."

echo "🚀 Firebase Functions Optimization Build & Deploy"
echo "=================================================="
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    echo "📋 Checking prerequisites..."
    
    if ! command -v node &> /dev/null; then
        print_error "Node.js not found. Please install Node.js 20 or higher."
        exit 1
    fi
    
    if ! command -v firebase &> /dev/null; then
        print_error "Firebase CLI not found. Install it with: npm install -g firebase-tools"
        exit 1
    fi
    
    print_status "All prerequisites met"
    echo ""
}

# Build functions
build_functions() {
    echo "🔨 Building TypeScript functions..."
    
    if [ ! -d "functions" ]; then
        print_error "functions directory not found"
        exit 1
    fi
    
    cd functions
    
    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        print_warning "Installing dependencies..."
        npm install
    fi
    
    # Run lint (optional but recommended)
    echo "  → Linting..."
    npm run lint || print_warning "Lint errors found (non-blocking)"
    
    # Build
    echo "  → Compiling TypeScript..."
    npm run build
    
    # Verify build output
    if [ ! -d "lib" ] || [ -z "$(ls -A lib)" ]; then
        print_error "Build failed: lib directory is empty"
        exit 1
    fi
    
    print_status "Build successful"
    cd ..
    echo ""
}

# Test functions locally
test_functions_local() {
    echo "🧪 Testing functions locally..."
    
    cd functions
    
    echo "  → Starting Firebase emulator..."
    echo "  → Functions will be available at: http://localhost:5001"
    echo ""
    print_warning "Press Ctrl+C to stop the emulator"
    echo ""
    
    npm run serve
    
    cd ..
}

# Run analysis
analyze_functions() {
    echo "📊 Analyzing functions for optimization opportunities..."
    
    cd functions
    
    if [ -f "scripts/migration-helper.js" ]; then
        node scripts/migration-helper.js
    else
        print_warning "Migration helper not found"
    fi
    
    cd ..
    echo ""
}

# Deploy functions
deploy_functions() {
    echo "🚀 Deploying functions to Firebase..."
    
    # Check if user is logged in to Firebase
    if ! firebase projects:list &> /dev/null; then
        print_error "Not logged in to Firebase. Run: firebase login"
        exit 1
    fi
    
    # Get current project
    PROJECT=$(firebase projects:list | head -2 | tail -1 | awk '{print $1}')
    
    if [ -z "$PROJECT" ]; then
        print_error "No Firebase project set. Run: firebase use --add"
        exit 1
    fi
    
    print_status "Current project: $PROJECT"
    
    # Confirm deployment
    echo ""
    read -p "Deploy to $PROJECT? (yes/no): " -r CONFIRM
    
    if [[ ! $CONFIRM =~ ^[Yy][Ee][Ss]$ ]]; then
        print_warning "Deployment cancelled"
        exit 1
    fi
    
    echo ""
    print_warning "Deploying functions..."
    cd functions
    npm run deploy
    cd ..
    
    print_status "Deployment complete!"
    echo ""
    echo "📊 View metrics in Firebase Console:"
    echo "   https://console.firebase.google.com/functions"
    echo ""
}

# Show deployment status
show_deployment_status() {
    echo "📈 Function Deployment Status"
    echo "=============================="
    
    cd functions
    firebase functions:list
    cd ..
    echo ""
}

# Performance recommendations
show_performance_tips() {
    echo "⚡ Performance Optimization Tips"
    echo "================================="
    echo ""
    echo "1. Monitor execution times in Firebase Console"
    echo "2. Check logs for slow operations: firebase functions:log"
    echo "3. Ensure Firestore composite indexes are created"
    echo "4. Review the OPTIMIZATION_GUIDE.md for best practices"
    echo "5. Gradually migrate functions using MIGRATION_TEMPLATE.md"
    echo ""
}

# Main command handler
case "${1:-help}" in
    build)
        check_prerequisites
        build_functions
        ;;
    test|serve|local)
        check_prerequisites
        build_functions
        test_functions_local
        ;;
    deploy)
        check_prerequisites
        build_functions
        deploy_functions
        show_deployment_status
        ;;
    analyze)
        analyze_functions
        ;;
    status)
        show_deployment_status
        ;;
    tips|help|--help|-h)
        echo "Firebase Functions Optimization Script"
        echo ""
        echo "Usage: bash scripts/build-deploy.sh [COMMAND]"
        echo ""
        echo "Commands:"
        echo "  build              Build TypeScript functions"
        echo "  test|serve|local   Build and run locally with Firebase emulator"
        echo "  deploy             Build and deploy to Firebase"
        echo "  analyze            Analyze functions for optimization opportunities"
        echo "  status             Show deployed functions status"
        echo "  tips               Show performance optimization tips"
        echo "  help               Show this help message"
        echo ""
        echo "Examples:"
        echo "  bash scripts/build-deploy.sh build"
        echo "  bash scripts/build-deploy.sh test"
        echo "  bash scripts/build-deploy.sh deploy"
        echo ""
        show_performance_tips
        ;;
    *)
        print_error "Unknown command: $1"
        echo "Run 'bash scripts/build-deploy.sh help' for usage information"
        exit 1
        ;;
esac
