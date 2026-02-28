#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const BILLING = path.join(ROOT, 'app', '(dashboard)', 'billing');
const OUTPUT = path.join(__dirname, 'polish.patch');

const patches = [];

function generatePatch(relPath, oldContent, newContent) {
  if (oldContent === newContent) return;

  const filePath = 'app/(dashboard)/billing/' + relPath;
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');

  // Simple unified diff - find changed lines
  let patchContent = `--- a/${filePath}\n+++ b/${filePath}\n`;

  let i = 0;
  while (i < Math.max(oldLines.length, newLines.length)) {
    if (i < oldLines.length && i < newLines.length && oldLines[i] === newLines[i]) {
      i++;
      continue;
    }

    // Found a difference - output a hunk
    const startCtx = Math.max(0, i - 3);
    let endOld = i;
    let endNew = i;

    // Find end of changed section
    while (endOld < oldLines.length && endNew < newLines.length && oldLines[endOld] !== newLines[endNew]) {
      endOld++;
      endNew++;
    }
    // Also handle case where one has extra lines

    const endCtx = Math.min(Math.max(oldLines.length, newLines.length), Math.max(endOld, endNew) + 3);

    patchContent += `@@ -${startCtx + 1},${endCtx - startCtx} +${startCtx + 1},${endCtx - startCtx} @@\n`;

    for (let j = startCtx; j < endCtx; j++) {
      if (j >= i && j < endOld) {
        patchContent += `-${oldLines[j]}\n`;
      }
      if (j >= i && j < endNew) {
        patchContent += `+${newLines[j]}\n`;
      }
      if (j < i || j >= Math.max(endOld, endNew)) {
        patchContent += ` ${oldLines[j] || newLines[j]}\n`;
      }
    }

    i = Math.max(endOld, endNew);
  }

  patches.push(patchContent);
}

function readFile(relPath) {
  return fs.readFileSync(path.join(BILLING, relPath), 'utf8');
}

function processFile(relPath, transformFn) {
  const original = readFile(relPath);
  const modified = transformFn(original);
  generatePatch(relPath, original, modified);
  // Also write directly since we can
  fs.writeFileSync(path.join(BILLING, relPath), modified, 'utf8');
}

function addShadowToSummaryCards(content, marker, count) {
  const lines = content.split('\n');
  let inSection = false;
  let cardCount = 0;
  const result = [];
  for (const line of lines) {
    let modified = line;
    if (line.includes(marker)) { inSection = true; cardCount = 0; }
    if (inSection && line.trim() === '<Card>' && cardCount < count) {
      modified = line.replace('<Card>', '<Card className="shadow-sm">');
      cardCount++;
      if (cardCount >= count) inSection = false;
    }
    if (inSection && line.trim().startsWith('<Card className=') && !line.includes('shadow-sm') && cardCount < count) {
      modified = line.replace('<Card className="', '<Card className="shadow-sm ');
      cardCount++;
      if (cardCount >= count) inSection = false;
    }
    result.push(modified);
  }
  return result.join('\n');
}

function upgradeFontBold(content) {
  return content.replace(/("text-2xl font-bold)/g, '"text-2xl font-semibold tracking-tight');
}

function fixClickableRowHover(content) {
  return content.replace(
    /("cursor-pointer hover:bg-muted\/50")/g,
    '"cursor-pointer hover:bg-muted/60 transition-colors duration-150"'
  );
}

// INVOICES
console.log('Processing invoices/page.tsx...');
processFile('invoices/page.tsx', (c) => {
  c = addShadowToSummaryCards(c, '/* Summary Cards */', 4);
  c = upgradeFontBold(c);
  c = fixClickableRowHover(c);
  return c;
});

// UNBILLED
console.log('Processing unbilled/page.tsx...');
processFile('unbilled/page.tsx', (c) => {
  c = addShadowToSummaryCards(c, '/* Summary Cards */', 3);
  c = upgradeFontBold(c);
  c = c.replace('"cursor-pointer hover:bg-muted/50",', '"cursor-pointer hover:bg-muted/60 transition-colors duration-150",');
  return c;
});

// BILLING RUNS
console.log('Processing billing-runs/page.tsx...');
processFile('billing-runs/page.tsx', (c) => {
  c = addShadowToSummaryCards(c, '/* Summary Cards */', 4);
  c = upgradeFontBold(c);
  c = fixClickableRowHover(c);
  c = c.replace(/className=\{cn\(\s*"cursor-pointer",/g, 'className={cn(\n                          "cursor-pointer hover:bg-muted/50 transition-colors duration-150",');
  return c;
});

// RECEIVABLES
console.log('Processing receivables/page.tsx...');
processFile('receivables/page.tsx', (c) => {
  c = c.replace('<Card>\n                <CardHeader className="pb-2">\n                  <CardTitle className="text-sm font-medium text-muted-foreground">\n                    Current\n                  </CardTitle>', '<Card className="shadow-sm border-l-4 border-l-green-500">\n                <CardHeader className="pb-2">\n                  <CardTitle className="text-sm font-medium text-muted-foreground">\n                    Current\n                  </CardTitle>');
  c = c.replace('<Card>\n                <CardHeader className="pb-2">\n                  <CardTitle className="text-sm font-medium text-muted-foreground">\n                    1-30 Days\n                  </CardTitle>', '<Card className="shadow-sm border-l-4 border-l-green-500">\n                <CardHeader className="pb-2">\n                  <CardTitle className="text-sm font-medium text-muted-foreground">\n                    1-30 Days\n                  </CardTitle>');
  c = c.replace('<Card>\n                <CardHeader className="pb-2">\n                  <CardTitle className="text-sm font-medium text-muted-foreground">\n                    31-60 Days\n                  </CardTitle>', '<Card className="shadow-sm border-l-4 border-l-amber-500">\n                <CardHeader className="pb-2">\n                  <CardTitle className="text-sm font-medium text-muted-foreground">\n                    31-60 Days\n                  </CardTitle>');
  c = c.replace('<Card>\n                <CardHeader className="pb-2">\n                  <CardTitle className="text-sm font-medium text-muted-foreground">\n                    61-90 Days\n                  </CardTitle>', '<Card className="shadow-sm border-l-4 border-l-orange-500">\n                <CardHeader className="pb-2">\n                  <CardTitle className="text-sm font-medium text-muted-foreground">\n                    61-90 Days\n                  </CardTitle>');
  c = c.replace('<Card>\n                <CardHeader className="pb-2">\n                  <CardTitle className="text-sm font-medium text-muted-foreground">\n                    90+ Days\n                  </CardTitle>', '<Card className="shadow-sm border-l-4 border-l-red-500">\n                <CardHeader className="pb-2">\n                  <CardTitle className="text-sm font-medium text-muted-foreground">\n                    90+ Days\n                  </CardTitle>');
  c = c.replace('<Card className="bg-primary/5 border-primary/20">', '<Card className="shadow-sm bg-primary/5 border-primary/20">');
  c = c.replace(/"text-xl font-bold/g, '"text-xl font-semibold tracking-tight');
  c = c.replace('<TableRow key={invoice._id} className="group">', '<TableRow key={invoice._id} className="group hover:bg-muted/50 transition-colors duration-150">');
  c = c.replace('"cursor-pointer select-none hover:bg-muted/50 transition-colors"', '"group cursor-pointer select-none hover:bg-muted/50 transition-colors duration-150"');
  return c;
});

// REALIZATION
console.log('Processing realization/page.tsx...');
processFile('realization/page.tsx', (c) => {
  c = addShadowToSummaryCards(c, '/* Summary Cards */', 4);
  c = upgradeFontBold(c);
  c = c.replace('"text-3xl font-bold"', '"text-3xl font-semibold tracking-tight"');
  c = c.replace(/<TableRow key=\{client\.clientId\}>/g, '<TableRow key={client.clientId} className="hover:bg-muted/50 transition-colors duration-150">');
  c = c.replace(/<TableRow key=\{work\.workId\}>/g, '<TableRow key={work.workId} className="hover:bg-muted/50 transition-colors duration-150">');
  c = c.replace(/<TableRow key=\{member\.userId\}>/g, '<TableRow key={member.userId} className="hover:bg-muted/50 transition-colors duration-150">');
  c = c.replace(/<TableRow key=\{trend\.month\}>\n                                <TableCell className="font-medium">/g, '<TableRow key={trend.month} className="hover:bg-muted/50 transition-colors duration-150">\n                                <TableCell className="font-medium">');
  return c;
});

// FINANCE
console.log('Processing finance/page.tsx...');
processFile('finance/page.tsx', (c) => {
  c = addShadowToSummaryCards(c, '/* Summary Cards */', 4);
  c = upgradeFontBold(c);
  c = c.replace(/<TableRow key=\{client\.clientId\}>/g, '<TableRow key={client.clientId} className="hover:bg-muted/50 transition-colors duration-150">');
  c = c.replace('"cursor-pointer hover:bg-muted/50"', '"cursor-pointer hover:bg-muted/60 transition-colors duration-150"');
  return c;
});

// SOWS
console.log('Processing sows/page.tsx...');
processFile('sows/page.tsx', (c) => {
  c = addShadowToSummaryCards(c, '/* Summary Cards */', 4);
  c = upgradeFontBold(c);
  c = fixClickableRowHover(c);
  return c;
});

// SCOPE ANALYSIS
console.log('Processing scope-analysis/page.tsx...');
processFile('scope-analysis/page.tsx', (c) => {
  c = addShadowToSummaryCards(c, '/* Summary Cards */', 5);
  c = c.replace('<Card className={filteredTotals.scopeCreepValue > 0 ? "border-red-200 bg-red-50/50" : ""}>', '<Card className={cn("shadow-sm", filteredTotals.scopeCreepValue > 0 ? "border-red-200 bg-red-50/50" : "")}>');
  c = upgradeFontBold(c);
  c = c.replace('"cursor-pointer hover:bg-muted/50 transition-colors"', '"cursor-pointer hover:bg-muted/60 transition-colors duration-150"');
  return c;
});

// BILLING RUNS DETAIL
console.log('Processing billing-runs/[runId]/page.tsx...');
processFile('billing-runs/[runId]/page.tsx', (c) => {
  c = addShadowToSummaryCards(c, '/* Summary Cards */', 4);
  c = upgradeFontBold(c);
  c = c.replace('<TableRow key={invoice._id}>', '<TableRow key={invoice._id} className="hover:bg-muted/50 transition-colors duration-150">');
  return c;
});

// INVOICE DETAIL
console.log('Processing invoices/[invoiceId]/page.tsx...');
processFile('invoices/[invoiceId]/page.tsx', (c) => {
  c = addShadowToSummaryCards(c, '/* Invoice Details Cards */', 3);
  c = upgradeFontBold(c);
  c = c.replace('<TableRow key={item._id}>', '<TableRow key={item._id} className="hover:bg-muted/50 transition-colors duration-150">');
  c = c.replace('<TableRow key={payment._id}>', '<TableRow key={payment._id} className="hover:bg-muted/50 transition-colors duration-150">');
  return c;
});

// PAYMENTS
console.log('Processing payments/page.tsx...');
processFile('payments/page.tsx', (c) => {
  c = c.replace('"cursor-pointer select-none hover:bg-muted/50 transition-colors",', '"group cursor-pointer select-none hover:bg-muted/50 transition-colors duration-150",');
  c = c.replace('"cursor-pointer hover:bg-muted/50 transition-colors",', '"cursor-pointer hover:bg-muted/60 transition-colors duration-150",');
  return c;
});

// PAYMENT DETAIL
console.log('Processing payments/[paymentId]/page.tsx...');
processFile('payments/[paymentId]/page.tsx', (c) => {
  c = addShadowToSummaryCards(c, '/* Payment Details Cards */', 3);
  c = upgradeFontBold(c);
  return c;
});

// RECURRING BILLING
console.log('Processing recurring-billing/page.tsx...');
processFile('recurring-billing/page.tsx', (c) => {
  c = c.replace('"cursor-pointer select-none hover:bg-muted/50 transition-colors",', '"group cursor-pointer select-none hover:bg-muted/50 transition-colors duration-150",');
  c = c.replace('"cursor-pointer hover:bg-muted/50 transition-colors",', '"cursor-pointer hover:bg-muted/60 transition-colors duration-150",');
  return c;
});

console.log('\nAll billing pages updated!');
