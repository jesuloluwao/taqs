/**
 * Check pages for browser console errors (hydration, React, runtime errors).
 * Usage: node scripts/ralph/check-browser-errors.js [routes...]
 * Example: node scripts/ralph/check-browser-errors.js /tickets /settings/views
 * 
 * Requires auth state - run save-auth.js first if not done.
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const AUTH_FILE = path.join(__dirname, '.auth-state.json');
const PORT = process.env.PORT || 3002;
const BASE_URL = `http://localhost:${PORT}`;

// Error patterns to catch
const ERROR_PATTERNS = [
  /error/i,
  /hydration/i,
  /maximum update depth/i,
  /cannot.*nest/i,
  /invalid dom/i,
  /warning.*validatedomnesting/i,
  /uncaught/i,
  /unhandled/i,
  /failed/i,
  /typeerror/i,
  /referenceerror/i,
];

// Patterns to ignore (noisy but not actionable)
const IGNORE_PATTERNS = [
  /favicon/i,
  /clerk/i,  // Clerk auth logs
  /third-party cookie/i,
  /download the react devtools/i,
];

function shouldCapture(message) {
  const text = message.toLowerCase();
  
  // Check if it matches ignore patterns
  for (const pattern of IGNORE_PATTERNS) {
    if (pattern.test(message)) return false;
  }
  
  // Check if it matches error patterns
  for (const pattern of ERROR_PATTERNS) {
    if (pattern.test(message)) return true;
  }
  
  return false;
}

async function checkRoutes(routes) {
  // Check if auth state exists
  if (!fs.existsSync(AUTH_FILE)) {
    console.error('❌ No auth state found. Run this first:');
    console.error('   node scripts/ralph/save-auth.js\n');
    process.exit(1);
  }
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: AUTH_FILE });
  const page = await context.newPage();
  
  const errors = [];
  
  // Capture console errors
  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      const text = msg.text();
      if (shouldCapture(text)) {
        errors.push({
          type: msg.type(),
          text: text,
          location: msg.location()
        });
      }
    }
  });
  
  // Capture page errors (uncaught exceptions)
  page.on('pageerror', error => {
    errors.push({
      type: 'pageerror',
      text: error.message,
      stack: error.stack
    });
  });
  
  console.log(`Checking ${routes.length} route(s) for browser errors...\n`);
  
  for (const route of routes) {
    const url = `${BASE_URL}${route}`;
    console.log(`  Checking ${route}...`);
    
    const routeErrors = [];
    const errorHandler = (err) => routeErrors.push(err);
    
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      // Wait a bit for any async errors
      await page.waitForTimeout(2000);
    } catch (e) {
      errors.push({
        type: 'navigation',
        text: `Failed to load ${route}: ${e.message}`,
        route
      });
    }
  }
  
  await browser.close();
  
  // Report results
  console.log('');
  
  if (errors.length === 0) {
    console.log('✅ No browser errors detected');
    process.exit(0);
  } else {
    console.log(`❌ Found ${errors.length} error(s):\n`);
    
    for (const error of errors) {
      console.log(`[${error.type.toUpperCase()}]`);
      console.log(`  ${error.text}`);
      if (error.stack) {
        console.log(`  Stack: ${error.stack.split('\n')[0]}`);
      }
      if (error.location?.url) {
        console.log(`  At: ${error.location.url}:${error.location.lineNumber}`);
      }
      console.log('');
    }
    
    process.exit(1);
  }
}

// Parse routes from command line
const routes = process.argv.slice(2);
if (routes.length === 0) {
  console.log('Usage: node check-browser-errors.js /route1 /route2 ...');
  console.log('Example: node check-browser-errors.js /tickets /settings/views');
  process.exit(1);
}

checkRoutes(routes).catch(err => {
  console.error('Script error:', err);
  process.exit(1);
});
