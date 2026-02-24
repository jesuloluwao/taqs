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
console.log('invoices...');
let invoices = readFile('invoices/page.tsx');
invoices = addShadowToSummaryCards(invoices, '/* Summary Cards */', 4);
invoices = upgradeFontBold(invoices);
invoices = fixClickableRowHover(invoices);
writeFile('invoices/page.tsx', invoices);

// UNBILLED
console.log('unbilled...');
let unbilled = readFile('unbilled/page.tsx');
unbilled = addShadowToSummaryCards(unbilled, '/* Summary Cards */', 3);
unbilled = upgradeFontBold(unbilled);
unbilled = unbilled.replace('"cursor-pointer hover:bg-muted/50",', '"cursor-pointer hover:bg-muted/60 transition-colors duration-150",');
writeFile('unbilled/page.tsx', unbilled);

// BILLING RUNS
console.log('billing-runs...');
let billingRuns = readFile('billing-runs/page.tsx');
billingRuns = addShadowToSummaryCards(billingRuns, '/* Summary Cards */', 4);
billingRuns = upgradeFontBold(billingRuns);
billingRuns = fixClickableRowHover(billingRuns);
billingRuns = billingRuns.replace(/className=\{cn\(\s*"cursor-pointer",/g, 'className={cn(\n                          "cursor-pointer hover:bg-muted/50 transition-colors duration-150",');
writeFile('billing-runs/page.tsx', billingRuns);

// RECEIVABLES
console.log('receivables...');
let receivables = readFile('receivables/page.tsx');
receivables = receivables.replace('<Card>\n                <CardHeader className="pb-2">\n                  <CardTitle className="text-sm font-medium text-muted-foreground">\n                    Current\n                  </CardTitle>', '<Card className="shadow-sm border-l-4 border-l-green-500">\n                <CardHeader className="pb-2">\n                  <CardTitle className="text-sm font-medium text-muted-foreground">\n                    Current\n                  </CardTitle>');
receivables = receivables.replace('<Card>\n                <CardHeader className="pb-2">\n                  <CardTitle className="text-sm font-medium text-muted-foreground">\n                    1-30 Days\n                  </CardTitle>', '<Card className="shadow-sm border-l-4 border-l-green-500">\n                <CardHeader className="pb-2">\n                  <CardTitle className="text-sm font-medium text-muted-foreground">\n                    1-30 Days\n                  </CardTitle>');
receivables = receivables.replace('<Card>\n                <CardHeader className="pb-2">\n                  <CardTitle className="text-sm font-medium text-muted-foreground">\n                    31-60 Days\n                  </CardTitle>', '<Card className="shadow-sm border-l-4 border-l-amber-500">\n                <CardHeader className="pb-2">\n                  <CardTitle className="text-sm font-medium text-muted-foreground">\n                    31-60 Days\n                  </CardTitle>');
receivables = receivables.replace('<Card>\n                <CardHeader className="pb-2">\n                  <CardTitle className="text-sm font-medium text-muted-foreground">\n                    61-90 Days\n                  </CardTitle>', '<Card className="shadow-sm border-l-4 border-l-orange-500">\n                <CardHeader className="pb-2">\n                  <CardTitle className="text-sm font-medium text-muted-foreground">\n                    61-90 Days\n                  </CardTitle>');
receivables = receivables.replace('<Card>\n                <CardHeader className="pb-2">\n                  <CardTitle className="text-sm font-medium text-muted-foreground">\n                    90+ Days\n                  </CardTitle>', '<Card className="shadow-sm border-l-4 border-l-red-500">\n                <CardHeader className="pb-2">\n                  <CardTitle className="text-sm font-medium text-muted-foreground">\n                    90+ Days\n                  </CardTitle>');
receivables = receivables.replace('<Card className="bg-primary/5 border-primary/20">', '<Card className="shadow-sm bg-primary/5 border-primary/20">');
receivables = receivables.replace(/"text-xl font-bold/g, '"text-xl font-semibold tracking-tight');
receivables = receivables.replace('<TableRow key={invoice._id} className="group">', '<TableRow key={invoice._id} className="group hover:bg-muted/50 transition-colors duration-150">');
receivables = receivables.replace('"cursor-pointer select-none hover:bg-muted/50 transition-colors"', '"group cursor-pointer select-none hover:bg-muted/50 transition-colors duration-150"');
writeFile('receivables/page.tsx', receivables);

// REALIZATION
console.log('realization...');
let realization = readFile('realization/page.tsx');
realization = addShadowToSummaryCards(realization, '/* Summary Cards */', 4);
realization = upgradeFontBold(realization);
realization = realization.replace('"text-3xl font-bold"', '"text-3xl font-semibold tracking-tight"');
realization = realization.replace(/<TableRow key=\{client\.clientId\}>/g, '<TableRow key={client.clientId} className="hover:bg-muted/50 transition-colors duration-150">');
realization = realization.replace(/<TableRow key=\{work\.workId\}>/g, '<TableRow key={work.workId} className="hover:bg-muted/50 transition-colors duration-150">');
realization = realization.replace(/<TableRow key=\{member\.userId\}>/g, '<TableRow key={member.userId} className="hover:bg-muted/50 transition-colors duration-150">');
realization = realization.replace(/<TableRow key=\{trend\.month\}>\n                                <TableCell className="font-medium">/g, '<TableRow key={trend.month} className="hover:bg-muted/50 transition-colors duration-150">\n                                <TableCell className="font-medium">');
writeFile('realization/page.tsx', realization);

// FINANCE
console.log('finance...');
let finance = readFile('finance/page.tsx');
finance = addShadowToSummaryCards(finance, '/* Summary Cards */', 4);
finance = upgradeFontBold(finance);
finance = finance.replace(/<TableRow key=\{client\.clientId\}>/g, '<TableRow key={client.clientId} className="hover:bg-muted/50 transition-colors duration-150">');
finance = finance.replace('"cursor-pointer hover:bg-muted/50"', '"cursor-pointer hover:bg-muted/60 transition-colors duration-150"');
writeFile('finance/page.tsx', finance);

// SOWS
console.log('sows...');
let sows = readFile('sows/page.tsx');
sows = addShadowToSummaryCards(sows, '/* Summary Cards */', 4);
sows = upgradeFontBold(sows);
sows = fixClickableRowHover(sows);
writeFile('sows/page.tsx', sows);

// SCOPE ANALYSIS
console.log('scope-analysis...');
let scope = readFile('scope-analysis/page.tsx');
scope = addShadowToSummaryCards(scope, '/* Summary Cards */', 5);
scope = scope.replace('<Card className={filteredTotals.scopeCreepValue > 0 ? "border-red-200 bg-red-50/50" : ""}>', '<Card className={cn("shadow-sm", filteredTotals.scopeCreepValue > 0 ? "border-red-200 bg-red-50/50" : "")}>');
scope = upgradeFontBold(scope);
scope = scope.replace('"cursor-pointer hover:bg-muted/50 transition-colors"', '"cursor-pointer hover:bg-muted/60 transition-colors duration-150"');
writeFile('scope-analysis/page.tsx', scope);

// BILLING RUNS DETAIL
console.log('billing-runs/[runId]...');
let runDetail = readFile('billing-runs/[runId]/page.tsx');
runDetail = addShadowToSummaryCards(runDetail, '/* Summary Cards */', 4);
runDetail = upgradeFontBold(runDetail);
runDetail = runDetail.replace('<TableRow key={invoice._id}>', '<TableRow key={invoice._id} className="hover:bg-muted/50 transition-colors duration-150">');
writeFile('billing-runs/[runId]/page.tsx', runDetail);

// INVOICE DETAIL
console.log('invoices/[invoiceId]...');
let invoiceDetail = readFile('invoices/[invoiceId]/page.tsx');
invoiceDetail = addShadowToSummaryCards(invoiceDetail, '/* Invoice Details Cards */', 3);
invoiceDetail = upgradeFontBold(invoiceDetail);
invoiceDetail = invoiceDetail.replace('<TableRow key={item._id}>', '<TableRow key={item._id} className="hover:bg-muted/50 transition-colors duration-150">');
invoiceDetail = invoiceDetail.replace('<TableRow key={payment._id}>', '<TableRow key={payment._id} className="hover:bg-muted/50 transition-colors duration-150">');
writeFile('invoices/[invoiceId]/page.tsx', invoiceDetail);

// PAYMENTS
console.log('payments...');
let payments = readFile('payments/page.tsx');
payments = payments.replace('"cursor-pointer select-none hover:bg-muted/50 transition-colors",', '"group cursor-pointer select-none hover:bg-muted/50 transition-colors duration-150",');
payments = payments.replace('"cursor-pointer hover:bg-muted/50 transition-colors",', '"cursor-pointer hover:bg-muted/60 transition-colors duration-150",');
writeFile('payments/page.tsx', payments);

// PAYMENT DETAIL
console.log('payments/[paymentId]...');
let paymentDetail = readFile('payments/[paymentId]/page.tsx');
paymentDetail = addShadowToSummaryCards(paymentDetail, '/* Payment Details Cards */', 3);
paymentDetail = upgradeFontBold(paymentDetail);
writeFile('payments/[paymentId]/page.tsx', paymentDetail);

// RECURRING BILLING
console.log('recurring-billing...');
let recurring = readFile('recurring-billing/page.tsx');
recurring = recurring.replace('"cursor-pointer select-none hover:bg-muted/50 transition-colors",', '"group cursor-pointer select-none hover:bg-muted/50 transition-colors duration-150",');
recurring = recurring.replace('"cursor-pointer hover:bg-muted/50 transition-colors",', '"cursor-pointer hover:bg-muted/60 transition-colors duration-150",');
writeFile('recurring-billing/page.tsx', recurring);

console.log('\nDone!');
