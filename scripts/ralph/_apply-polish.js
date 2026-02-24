#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const BILLING = path.join(ROOT, 'app', '(dashboard)', 'billing');

function readFile(relPath) {
  return fs.readFileSync(path.join(BILLING, relPath), 'utf8');
}

function writeFile(relPath, content) {
  fs.writeFileSync(path.join(BILLING, relPath), content, 'utf8');
}

// Helper: add shadow-sm to N <Card> elements after a marker comment
function addShadowToSummaryCards(content, marker, count) {
  const lines = content.split('\n');
  let inSection = false;
  let cardCount = 0;
  const result = [];

  for (const line of lines) {
    let modified = line;
    if (line.includes(marker)) {
      inSection = true;
      cardCount = 0;
    }
    if (inSection && line.trim() === '<Card>' && cardCount < count) {
      modified = line.replace('<Card>', '<Card className="shadow-sm">');
      cardCount++;
      if (cardCount >= count) inSection = false;
    }
    // Also handle cards with existing className but no shadow-sm
    if (inSection && line.trim().startsWith('<Card className=') && !line.includes('shadow-sm') && cardCount < count) {
      modified = line.replace('<Card className="', '<Card className="shadow-sm ');
      cardCount++;
      if (cardCount >= count) inSection = false;
    }
    result.push(modified);
  }
  return result.join('\n');
}

// Helper: upgrade font-bold to font-semibold tracking-tight for metric values
function upgradeFontBold(content) {
  // Only replace text-2xl font-bold (summary card metric values)
  return content.replace(/("text-2xl font-bold)/g, '"text-2xl font-semibold tracking-tight');
}

// Helper: ensure clickable table rows have proper hover
function fixClickableRowHover(content) {
  // Pattern: cursor-pointer hover:bg-muted/50 without transition-colors
  return content.replace(
    /("cursor-pointer hover:bg-muted\/50")/g,
    '"cursor-pointer hover:bg-muted/60 transition-colors duration-150"'
  );
}

// Helper: ensure non-clickable table rows have hover
function addHoverToTableRows(content) {
  // For TableRow without any hover class - add hover:bg-muted/50
  return content.replace(
    /<TableRow key=\{([^}]+)\}>/g,
    (match, key) => {
      if (!match.includes('hover:')) {
        return `<TableRow key={${key}} className="hover:bg-muted/50 transition-colors duration-150">`;
      }
      return match;
    }
  );
}

// Helper: fix transition-colors without duration
function ensureTransitionDuration(content) {
  // Add duration-150 where transition-colors exists but without duration
  return content.replace(
    /transition-colors(?!\s+duration-)/g,
    'transition-colors duration-150'
  );
}

// Helper: add group class to SortHeader parents that use group-hover
function fixGroupHover(content) {
  // If there's group-hover:opacity in the content, make sure parent has group class
  // The SortHeader component's TableHead needs group class
  if (content.includes('group-hover:opacity')) {
    // Add group class to the TableHead in SortHeader if not present
    content = content.replace(
      /className=\{cn\(\s*"cursor-pointer select-none hover:bg-muted\/50 transition-colors"/g,
      'className={cn(\n        "group cursor-pointer select-none hover:bg-muted/50 transition-colors"'
    );
    // Also handle the simpler pattern
    content = content.replace(
      /"cursor-pointer select-none hover:bg-muted\/50 transition-colors"/g,
      (match) => {
        if (!match.includes('group ')) {
          return '"group cursor-pointer select-none hover:bg-muted/50 transition-colors duration-150"';
        }
        return match;
      }
    );
  }
  return content;
}

// ========== INVOICES PAGE ==========
console.log('Processing invoices/page.tsx...');
let invoices = readFile('invoices/page.tsx');
invoices = addShadowToSummaryCards(invoices, '/* Summary Cards */', 4);
invoices = upgradeFontBold(invoices);
invoices = fixClickableRowHover(invoices);
writeFile('invoices/page.tsx', invoices);
console.log('  Done');

// ========== UNBILLED PAGE ==========
console.log('Processing unbilled/page.tsx...');
let unbilled = readFile('unbilled/page.tsx');
unbilled = addShadowToSummaryCards(unbilled, '/* Summary Cards */', 3);
unbilled = upgradeFontBold(unbilled);
// Unbilled table rows have cn() with conditional classes
unbilled = unbilled.replace(
  '"cursor-pointer hover:bg-muted/50",',
  '"cursor-pointer hover:bg-muted/60 transition-colors duration-150",'
);
writeFile('unbilled/page.tsx', unbilled);
console.log('  Done');

// ========== BILLING RUNS PAGE ==========
console.log('Processing billing-runs/page.tsx...');
let billingRuns = readFile('billing-runs/page.tsx');
billingRuns = addShadowToSummaryCards(billingRuns, '/* Summary Cards */', 4);
billingRuns = upgradeFontBold(billingRuns);
billingRuns = fixClickableRowHover(billingRuns);
// Also fix dialog table rows
billingRuns = billingRuns.replace(
  /className=\{cn\(\s*"cursor-pointer",/g,
  'className={cn(\n                          "cursor-pointer hover:bg-muted/50 transition-colors duration-150",'
);
writeFile('billing-runs/page.tsx', billingRuns);
console.log('  Done');

// ========== RECEIVABLES PAGE ==========
console.log('Processing receivables/page.tsx...');
let receivables = readFile('receivables/page.tsx');

// Add shadow-sm and color-coded left borders to aging cards
// Current card
receivables = receivables.replace(
  '<Card>\n                <CardHeader className="pb-2">\n                  <CardTitle className="text-sm font-medium text-muted-foreground">\n                    Current\n                  </CardTitle>',
  '<Card className="shadow-sm border-l-4 border-l-green-500">\n                <CardHeader className="pb-2">\n                  <CardTitle className="text-sm font-medium text-muted-foreground">\n                    Current\n                  </CardTitle>'
);

// 1-30 Days card
receivables = receivables.replace(
  '<Card>\n                <CardHeader className="pb-2">\n                  <CardTitle className="text-sm font-medium text-muted-foreground">\n                    1-30 Days\n                  </CardTitle>',
  '<Card className="shadow-sm border-l-4 border-l-green-500">\n                <CardHeader className="pb-2">\n                  <CardTitle className="text-sm font-medium text-muted-foreground">\n                    1-30 Days\n                  </CardTitle>'
);

// 31-60 Days card
receivables = receivables.replace(
  '<Card>\n                <CardHeader className="pb-2">\n                  <CardTitle className="text-sm font-medium text-muted-foreground">\n                    31-60 Days\n                  </CardTitle>',
  '<Card className="shadow-sm border-l-4 border-l-amber-500">\n                <CardHeader className="pb-2">\n                  <CardTitle className="text-sm font-medium text-muted-foreground">\n                    31-60 Days\n                  </CardTitle>'
);

// 61-90 Days card
receivables = receivables.replace(
  '<Card>\n                <CardHeader className="pb-2">\n                  <CardTitle className="text-sm font-medium text-muted-foreground">\n                    61-90 Days\n                  </CardTitle>',
  '<Card className="shadow-sm border-l-4 border-l-orange-500">\n                <CardHeader className="pb-2">\n                  <CardTitle className="text-sm font-medium text-muted-foreground">\n                    61-90 Days\n                  </CardTitle>'
);

// 90+ Days card
receivables = receivables.replace(
  '<Card>\n                <CardHeader className="pb-2">\n                  <CardTitle className="text-sm font-medium text-muted-foreground">\n                    90+ Days\n                  </CardTitle>',
  '<Card className="shadow-sm border-l-4 border-l-red-500">\n                <CardHeader className="pb-2">\n                  <CardTitle className="text-sm font-medium text-muted-foreground">\n                    90+ Days\n                  </CardTitle>'
);

// Total Outstanding card
receivables = receivables.replace(
  '<Card className="bg-primary/5 border-primary/20">',
  '<Card className="shadow-sm bg-primary/5 border-primary/20">'
);

// Update metric font (text-xl font-bold -> text-xl font-semibold tracking-tight)
receivables = receivables.replace(/"text-xl font-bold/g, '"text-xl font-semibold tracking-tight');

// Add hover to table rows
receivables = receivables.replace(
  '<TableRow key={invoice._id} className="group">',
  '<TableRow key={invoice._id} className="group hover:bg-muted/50 transition-colors duration-150">'
);

// Fix group-hover - add group class to SortHeader TableHead
receivables = receivables.replace(
  '"cursor-pointer select-none hover:bg-muted/50 transition-colors"',
  '"group cursor-pointer select-none hover:bg-muted/50 transition-colors duration-150"'
);

writeFile('receivables/page.tsx', receivables);
console.log('  Done');

// ========== REALIZATION PAGE ==========
console.log('Processing realization/page.tsx...');
let realization = readFile('realization/page.tsx');
realization = addShadowToSummaryCards(realization, '/* Summary Cards */', 4);
realization = upgradeFontBold(realization);
// Fix the text-3xl font-bold for realization rate
realization = realization.replace('"text-3xl font-bold"', '"text-3xl font-semibold tracking-tight"');
// Add hover to all table rows in realization tabs
realization = realization.replace(
  /<TableRow key=\{client\.clientId\}>/g,
  '<TableRow key={client.clientId} className="hover:bg-muted/50 transition-colors duration-150">'
);
realization = realization.replace(
  /<TableRow key=\{work\.workId\}>/g,
  '<TableRow key={work.workId} className="hover:bg-muted/50 transition-colors duration-150">'
);
realization = realization.replace(
  /<TableRow key=\{member\.userId\}>/g,
  '<TableRow key={member.userId} className="hover:bg-muted/50 transition-colors duration-150">'
);
realization = realization.replace(
  /<TableRow key=\{trend\.month\}>\n                                <TableCell className="font-medium">/g,
  '<TableRow key={trend.month} className="hover:bg-muted/50 transition-colors duration-150">\n                                <TableCell className="font-medium">'
);
writeFile('realization/page.tsx', realization);
console.log('  Done');

// ========== FINANCE PAGE ==========
console.log('Processing finance/page.tsx...');
let finance = readFile('finance/page.tsx');
finance = addShadowToSummaryCards(finance, '/* Summary Cards */', 4);
finance = upgradeFontBold(finance);
// Add hover to revenue by client table rows
finance = finance.replace(
  /<TableRow key=\{client\.clientId\}>/g,
  '<TableRow key={client.clientId} className="hover:bg-muted/50 transition-colors duration-150">'
);
// Fix clickable recent invoices table rows
finance = finance.replace(
  '"cursor-pointer hover:bg-muted/50"',
  '"cursor-pointer hover:bg-muted/60 transition-colors duration-150"'
);
writeFile('finance/page.tsx', finance);
console.log('  Done');

// ========== SOWS PAGE ==========
console.log('Processing sows/page.tsx...');
let sows = readFile('sows/page.tsx');
sows = addShadowToSummaryCards(sows, '/* Summary Cards */', 4);
sows = upgradeFontBold(sows);
sows = fixClickableRowHover(sows);
writeFile('sows/page.tsx', sows);
console.log('  Done');

// ========== SCOPE ANALYSIS PAGE ==========
console.log('Processing scope-analysis/page.tsx...');
let scope = readFile('scope-analysis/page.tsx');
scope = addShadowToSummaryCards(scope, '/* Summary Cards */', 5);
// Handle the scope creep card with conditional className
scope = scope.replace(
  '<Card className={filteredTotals.scopeCreepValue > 0 ? "border-red-200 bg-red-50/50" : ""}>',
  '<Card className={cn("shadow-sm", filteredTotals.scopeCreepValue > 0 ? "border-red-200 bg-red-50/50" : "")}>'
);
scope = upgradeFontBold(scope);
// The scope analysis already has transition-colors on its rows, just ensure duration
scope = scope.replace(
  '"cursor-pointer hover:bg-muted/50 transition-colors"',
  '"cursor-pointer hover:bg-muted/60 transition-colors duration-150"'
);
writeFile('scope-analysis/page.tsx', scope);
console.log('  Done');

// ========== BILLING RUNS DETAIL PAGE ==========
console.log('Processing billing-runs/[runId]/page.tsx...');
let runDetail = readFile('billing-runs/[runId]/page.tsx');
runDetail = addShadowToSummaryCards(runDetail, '/* Summary Cards */', 4);
runDetail = upgradeFontBold(runDetail);
// Add hover to invoice list table rows
runDetail = runDetail.replace(
  '<TableRow key={invoice._id}>',
  '<TableRow key={invoice._id} className="hover:bg-muted/50 transition-colors duration-150">'
);
writeFile('billing-runs/[runId]/page.tsx', runDetail);
console.log('  Done');

// ========== INVOICE DETAIL PAGE ==========
console.log('Processing invoices/[invoiceId]/page.tsx...');
let invoiceDetail = readFile('invoices/[invoiceId]/page.tsx');
// Add shadow-sm to detail cards (Client, Dates, Amount)
invoiceDetail = addShadowToSummaryCards(invoiceDetail, '/* Invoice Details Cards */', 3);
invoiceDetail = upgradeFontBold(invoiceDetail);
// Add hover to line items table rows
invoiceDetail = invoiceDetail.replace(
  '<TableRow key={item._id}>',
  '<TableRow key={item._id} className="hover:bg-muted/50 transition-colors duration-150">'
);
// Add hover to payment history table rows
invoiceDetail = invoiceDetail.replace(
  '<TableRow key={payment._id}>',
  '<TableRow key={payment._id} className="hover:bg-muted/50 transition-colors duration-150">'
);
writeFile('invoices/[invoiceId]/page.tsx', invoiceDetail);
console.log('  Done');

// ========== PAYMENTS PAGE ==========
console.log('Processing payments/page.tsx...');
let payments = readFile('payments/page.tsx');
// Fix group-hover in SortHeader - add group class
payments = payments.replace(
  '"cursor-pointer select-none hover:bg-muted/50 transition-colors",',
  '"group cursor-pointer select-none hover:bg-muted/50 transition-colors duration-150",'
);
// Ensure table rows have duration-150
payments = payments.replace(
  '"cursor-pointer hover:bg-muted/50 transition-colors",',
  '"cursor-pointer hover:bg-muted/60 transition-colors duration-150",'
);
writeFile('payments/page.tsx', payments);
console.log('  Done');

// ========== PAYMENT DETAIL PAGE ==========
console.log('Processing payments/[paymentId]/page.tsx...');
let paymentDetail = readFile('payments/[paymentId]/page.tsx');
// Add shadow-sm to detail cards
paymentDetail = addShadowToSummaryCards(paymentDetail, '/* Payment Details Cards */', 3);
paymentDetail = upgradeFontBold(paymentDetail);
writeFile('payments/[paymentId]/page.tsx', paymentDetail);
console.log('  Done');

// ========== RECURRING BILLING PAGE ==========
console.log('Processing recurring-billing/page.tsx...');
let recurring = readFile('recurring-billing/page.tsx');
// Fix group-hover in SortHeader
recurring = recurring.replace(
  '"cursor-pointer select-none hover:bg-muted/50 transition-colors",',
  '"group cursor-pointer select-none hover:bg-muted/50 transition-colors duration-150",'
);
// Ensure table rows have duration-150
recurring = recurring.replace(
  '"cursor-pointer hover:bg-muted/50 transition-colors",',
  '"cursor-pointer hover:bg-muted/60 transition-colors duration-150",'
);
writeFile('recurring-billing/page.tsx', recurring);
console.log('  Done');

console.log('\nAll billing pages updated!');
