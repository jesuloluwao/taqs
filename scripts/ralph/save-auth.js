/**
 * Save authenticated browser state by connecting to your existing Chrome.
 * 
 * Step 1: Close Chrome completely, then start it with debugging:
 *   /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
 * 
 * Step 2: Log in to your app at http://localhost:3002 in that Chrome window
 * 
 * Step 3: Run this script:
 *   node scripts/ralph/save-auth.js
 */

const { chromium } = require('playwright');
const path = require('path');

const AUTH_FILE = path.join(__dirname, '.auth-state.json');
const CDP_URL = 'http://localhost:9222';

async function saveAuth() {
  console.log('Connecting to Chrome at', CDP_URL, '...\n');
  
  try {
    const browser = await chromium.connectOverCDP(CDP_URL);
    const contexts = browser.contexts();
    
    if (contexts.length === 0) {
      console.error('❌ No browser contexts found. Make sure Chrome is open with a tab.');
      process.exit(1);
    }
    
    const context = contexts[0];
    
    // Save the authenticated state
    await context.storageState({ path: AUTH_FILE });
    console.log(`✅ Auth state saved to ${AUTH_FILE}`);
    console.log('You can now run: node scripts/ralph/check-browser-errors.js /tickets');
    
    // Don't close - user's browser stays open
    await browser.close();
    
  } catch (err) {
    if (err.message.includes('ECONNREFUSED')) {
      console.error('❌ Could not connect to Chrome. Make sure to start Chrome with debugging:\n');
      console.error('   /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222\n');
      console.error('Then log in to your app and run this script again.');
    } else {
      console.error('Error:', err.message);
    }
    process.exit(1);
  }
}

saveAuth();
