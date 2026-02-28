#!/bin/bash
set -e
BILLING="/Users/sampotashnick/Documents/practice-management/app/(dashboard)/billing"

# Helper: replace in file using perl (more reliable than sed on macOS)
rep() {
  perl -i -pe "$1" "$2"
}

echo "=== Invoices ==="
# Add shadow-sm to 4 summary cards after /* Summary Cards */
# The cards are just <Card> on their own lines
F="$BILLING/invoices/page.tsx"
perl -i -0777 -pe '
  my $count = 0;
  my $in_section = 0;
  s{^(.*?)$}{
    my $line = $&;
    if ($line =~ /\/\* Summary Cards \*\//) { $in_section = 1; $count = 0; }
    if ($in_section && $line =~ /^\s*<Card>$/ && $count < 4) {
      $line =~ s/<Card>/<Card className="shadow-sm">/;
      $count++;
      $in_section = 0 if $count >= 4;
    }
    $line;
  }gem;
' "$F"
# Upgrade font-bold to font-semibold tracking-tight for metric values
rep 's/"text-2xl font-bold/"text-2xl font-semibold tracking-tight/g' "$F"
# Fix clickable row hover
rep 's/"cursor-pointer hover:bg-muted\/50"/"cursor-pointer hover:bg-muted\/60 transition-colors duration-150"/g' "$F"
echo "  Done"

echo "=== Unbilled ==="
F="$BILLING/unbilled/page.tsx"
perl -i -0777 -pe '
  my $count = 0;
  my $in_section = 0;
  s{^(.*?)$}{
    my $line = $&;
    if ($line =~ /\/\* Summary Cards \*\//) { $in_section = 1; $count = 0; }
    if ($in_section && $line =~ /^\s*<Card>$/ && $count < 3) {
      $line =~ s/<Card>/<Card className="shadow-sm">/;
      $count++;
      $in_section = 0 if $count >= 3;
    }
    if ($in_section && $line =~ /<Card className="/ && $line !~ /shadow-sm/ && $count < 3) {
      $line =~ s/<Card className="/<Card className="shadow-sm /;
      $count++;
      $in_section = 0 if $count >= 3;
    }
    $line;
  }gem;
' "$F"
rep 's/"text-2xl font-bold/"text-2xl font-semibold tracking-tight/g' "$F"
rep 's/"cursor-pointer hover:bg-muted\/50",/"cursor-pointer hover:bg-muted\/60 transition-colors duration-150",/g' "$F"
echo "  Done"

echo "=== Billing Runs ==="
F="$BILLING/billing-runs/page.tsx"
perl -i -0777 -pe '
  my $count = 0;
  my $in_section = 0;
  s{^(.*?)$}{
    my $line = $&;
    if ($line =~ /\/\* Summary Cards \*\//) { $in_section = 1; $count = 0; }
    if ($in_section && $line =~ /^\s*<Card>$/ && $count < 4) {
      $line =~ s/<Card>/<Card className="shadow-sm">/;
      $count++;
      $in_section = 0 if $count >= 4;
    }
    $line;
  }gem;
' "$F"
rep 's/"text-2xl font-bold/"text-2xl font-semibold tracking-tight/g' "$F"
rep 's/"cursor-pointer hover:bg-muted\/50"/"cursor-pointer hover:bg-muted\/60 transition-colors duration-150"/g' "$F"
echo "  Done"

echo "=== Receivables ==="
F="$BILLING/receivables/page.tsx"
# Color-coded aging cards - Current
perl -i -0777 -pe 's|<Card>\n(\s+<CardHeader className="pb-2">\n\s+<CardTitle className="text-sm font-medium text-muted-foreground">\n\s+Current\n)|<Card className="shadow-sm border-l-4 border-l-green-500">\n$1|' "$F"
# 1-30 Days
perl -i -0777 -pe 's|<Card>\n(\s+<CardHeader className="pb-2">\n\s+<CardTitle className="text-sm font-medium text-muted-foreground">\n\s+1-30 Days\n)|<Card className="shadow-sm border-l-4 border-l-green-500">\n$1|' "$F"
# 31-60 Days
perl -i -0777 -pe 's|<Card>\n(\s+<CardHeader className="pb-2">\n\s+<CardTitle className="text-sm font-medium text-muted-foreground">\n\s+31-60 Days\n)|<Card className="shadow-sm border-l-4 border-l-amber-500">\n$1|' "$F"
# 61-90 Days
perl -i -0777 -pe 's|<Card>\n(\s+<CardHeader className="pb-2">\n\s+<CardTitle className="text-sm font-medium text-muted-foreground">\n\s+61-90 Days\n)|<Card className="shadow-sm border-l-4 border-l-orange-500">\n$1|' "$F"
# 90+ Days
perl -i -0777 -pe 's|<Card>\n(\s+<CardHeader className="pb-2">\n\s+<CardTitle className="text-sm font-medium text-muted-foreground">\n\s+90\+ Days\n)|<Card className="shadow-sm border-l-4 border-l-red-500">\n$1|' "$F"
# Total Outstanding card
rep 's/<Card className="bg-primary\/5 border-primary\/20">/<Card className="shadow-sm bg-primary\/5 border-primary\/20">/' "$F"
# Font upgrade
rep 's/"text-xl font-bold/"text-xl font-semibold tracking-tight/g' "$F"
# Table row hover
rep 's/<TableRow key=\{invoice._id\} className="group">/<TableRow key={invoice._id} className="group hover:bg-muted\/50 transition-colors duration-150">/' "$F"
# SortHeader group class
rep 's/"cursor-pointer select-none hover:bg-muted\/50 transition-colors"/"group cursor-pointer select-none hover:bg-muted\/50 transition-colors duration-150"/' "$F"
echo "  Done"

echo "=== Realization ==="
F="$BILLING/realization/page.tsx"
perl -i -0777 -pe '
  my $count = 0;
  my $in_section = 0;
  s{^(.*?)$}{
    my $line = $&;
    if ($line =~ /\/\* Summary Cards \*\//) { $in_section = 1; $count = 0; }
    if ($in_section && $line =~ /^\s*<Card>$/ && $count < 4) {
      $line =~ s/<Card>/<Card className="shadow-sm">/;
      $count++;
      $in_section = 0 if $count >= 4;
    }
    $line;
  }gem;
' "$F"
rep 's/"text-2xl font-bold/"text-2xl font-semibold tracking-tight/g' "$F"
rep 's/"text-3xl font-bold"/"text-3xl font-semibold tracking-tight"/g' "$F"
rep 's/<TableRow key=\{client\.clientId\}>/<TableRow key={client.clientId} className="hover:bg-muted\/50 transition-colors duration-150">/g' "$F"
rep 's/<TableRow key=\{work\.workId\}>/<TableRow key={work.workId} className="hover:bg-muted\/50 transition-colors duration-150">/g' "$F"
rep 's/<TableRow key=\{member\.userId\}>/<TableRow key={member.userId} className="hover:bg-muted\/50 transition-colors duration-150">/g' "$F"
perl -i -0777 -pe 's/<TableRow key=\{trend\.month\}>\n(\s+<TableCell className="font-medium">)/<TableRow key={trend.month} className="hover:bg-muted\/50 transition-colors duration-150">\n$1/g' "$F"
echo "  Done"

echo "=== Finance ==="
F="$BILLING/finance/page.tsx"
perl -i -0777 -pe '
  my $count = 0;
  my $in_section = 0;
  s{^(.*?)$}{
    my $line = $&;
    if ($line =~ /\/\* Summary Cards \*\//) { $in_section = 1; $count = 0; }
    if ($in_section && $line =~ /^\s*<Card>$/ && $count < 4) {
      $line =~ s/<Card>/<Card className="shadow-sm">/;
      $count++;
      $in_section = 0 if $count >= 4;
    }
    $line;
  }gem;
' "$F"
rep 's/"text-2xl font-bold/"text-2xl font-semibold tracking-tight/g' "$F"
rep 's/<TableRow key=\{client\.clientId\}>/<TableRow key={client.clientId} className="hover:bg-muted\/50 transition-colors duration-150">/g' "$F"
rep 's/"cursor-pointer hover:bg-muted\/50"/"cursor-pointer hover:bg-muted\/60 transition-colors duration-150"/' "$F"
echo "  Done"

echo "=== SOWs ==="
F="$BILLING/sows/page.tsx"
perl -i -0777 -pe '
  my $count = 0;
  my $in_section = 0;
  s{^(.*?)$}{
    my $line = $&;
    if ($line =~ /\/\* Summary Cards \*\//) { $in_section = 1; $count = 0; }
    if ($in_section && $line =~ /^\s*<Card>$/ && $count < 4) {
      $line =~ s/<Card>/<Card className="shadow-sm">/;
      $count++;
      $in_section = 0 if $count >= 4;
    }
    $line;
  }gem;
' "$F"
rep 's/"text-2xl font-bold/"text-2xl font-semibold tracking-tight/g' "$F"
rep 's/"cursor-pointer hover:bg-muted\/50"/"cursor-pointer hover:bg-muted\/60 transition-colors duration-150"/g' "$F"
echo "  Done"

echo "=== Scope Analysis ==="
F="$BILLING/scope-analysis/page.tsx"
perl -i -0777 -pe '
  my $count = 0;
  my $in_section = 0;
  s{^(.*?)$}{
    my $line = $&;
    if ($line =~ /\/\* Summary Cards \*\//) { $in_section = 1; $count = 0; }
    if ($in_section && $line =~ /^\s*<Card>$/ && $count < 5) {
      $line =~ s/<Card>/<Card className="shadow-sm">/;
      $count++;
      $in_section = 0 if $count >= 5;
    }
    $line;
  }gem;
' "$F"
# Scope creep card with conditional className
rep 's/<Card className=\{filteredTotals.scopeCreepValue > 0 \? "border-red-200 bg-red-50\/50" : ""\}>/<Card className={cn("shadow-sm", filteredTotals.scopeCreepValue > 0 ? "border-red-200 bg-red-50\/50" : "")}>/' "$F"
rep 's/"text-2xl font-bold/"text-2xl font-semibold tracking-tight/g' "$F"
rep 's/"cursor-pointer hover:bg-muted\/50 transition-colors"/"cursor-pointer hover:bg-muted\/60 transition-colors duration-150"/' "$F"
echo "  Done"

echo "=== Billing Runs Detail ==="
F="$BILLING/billing-runs/[runId]/page.tsx"
perl -i -0777 -pe '
  my $count = 0;
  my $in_section = 0;
  s{^(.*?)$}{
    my $line = $&;
    if ($line =~ /\/\* Summary Cards \*\//) { $in_section = 1; $count = 0; }
    if ($in_section && $line =~ /^\s*<Card>$/ && $count < 4) {
      $line =~ s/<Card>/<Card className="shadow-sm">/;
      $count++;
      $in_section = 0 if $count >= 4;
    }
    $line;
  }gem;
' "$F"
rep 's/"text-2xl font-bold/"text-2xl font-semibold tracking-tight/g' "$F"
rep 's/<TableRow key=\{invoice._id\}>/<TableRow key={invoice._id} className="hover:bg-muted\/50 transition-colors duration-150">/' "$F"
echo "  Done"

echo "=== Invoice Detail ==="
F="$BILLING/invoices/[invoiceId]/page.tsx"
perl -i -0777 -pe '
  my $count = 0;
  my $in_section = 0;
  s{^(.*?)$}{
    my $line = $&;
    if ($line =~ /\/\* Invoice Details Cards \*\//) { $in_section = 1; $count = 0; }
    if ($in_section && $line =~ /^\s*<Card>$/ && $count < 3) {
      $line =~ s/<Card>/<Card className="shadow-sm">/;
      $count++;
      $in_section = 0 if $count >= 3;
    }
    $line;
  }gem;
' "$F"
rep 's/"text-2xl font-bold/"text-2xl font-semibold tracking-tight/g' "$F"
rep 's/<TableRow key=\{item._id\}>/<TableRow key={item._id} className="hover:bg-muted\/50 transition-colors duration-150">/' "$F"
rep 's/<TableRow key=\{payment._id\}>/<TableRow key={payment._id} className="hover:bg-muted\/50 transition-colors duration-150">/' "$F"
echo "  Done"

echo ""
echo "All billing pages updated!"
