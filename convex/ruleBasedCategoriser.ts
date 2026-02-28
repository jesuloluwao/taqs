// ============================================================================
// Rule-Based Transaction Categoriser for Nigerian Bank Statements
// Runs during import — zero API calls, instant classification.
// Maps patterns/vendors/keywords to the system category names defined in
// categories.ts.  Only high-confidence matches (≥0.7) are applied; the rest
// surface in Triage for AI or manual review.
//
// Bank-agnostic: works across GTBank, Access, Zenith, UBA, Kuda, OPay,
// Moniepoint, PalmPay, ALAT/Wema, First Bank, Stanbic, Sterling, etc.
// ============================================================================

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RuleBasedResult {
  categoryName: string | null;
  confidence: number;
  subcategory: string;
  vendor?: string;
  matchedBy: 'meta' | 'pattern' | 'hint' | 'fallback';
  flags: {
    isMetaCharge: boolean;
    isSelfTransfer: boolean;
    isReversal: boolean;
  };
}

interface Rule {
  pattern: RegExp;
  /** Must match a system category name exactly */
  categoryName: string;
  subcategory: string;
  confidence: number;
}

// ─── Normalisation helpers ───────────────────────────────────────────────────

function extractNarration(desc: string): string | undefined {
  const dashMatch = desc.match(/\s+-\s+(.+?)(?:\s+FROM\s+|$)/i);
  if (dashMatch) return dashMatch[1].trim();

  const parenMatch = desc.match(/\(([^)]+)\)\s*$/);
  if (parenMatch) return parenMatch[1].trim();

  return undefined;
}

function extractVendorName(desc: string): string | undefined {
  const toFrom = desc.match(/TRANSFER\s+TO\s+(.+?)\s+FROM\s+/i);
  if (toFrom) return toFrom[1].trim();

  const nipIncoming = desc.match(/^NIP:(.+?)(?:-|$)/i);
  if (nipIncoming) return nipIncoming[1].trim();

  const pos = desc.match(/(?:POS|WEB)\s*(?:\/\s*WEB)?\s*PURCHASE\s*-?\s*(.+)/i);
  if (pos) return pos[1].trim();

  return undefined;
}

// ─── TIER 0: META / BANK CHARGES ─────────────────────────────────────────────

const META_CHARGE_RULES: Rule[] = [
  { pattern: /^COMM\s/i, categoryName: 'Bank Charges', subcategory: 'Transfer Commission', confidence: 0.99 },
  { pattern: /\btransaction\s*fee\b/i, categoryName: 'Bank Charges', subcategory: 'Transfer Commission', confidence: 0.95 },
  { pattern: /^VAT\s/i, categoryName: 'Bank Charges', subcategory: 'VAT on Commission', confidence: 0.99 },
  { pattern: /STAMP\s*DUTY/i, categoryName: 'Bank Charges', subcategory: 'Stamp Duty', confidence: 0.99 },
  { pattern: /SMS\s*Alert\s*Charge/i, categoryName: 'Bank Charges', subcategory: 'SMS Alert Charges', confidence: 0.99 },
  { pattern: /SMS\s*(notification|charge|fee)/i, categoryName: 'Bank Charges', subcategory: 'SMS Alert Charges', confidence: 0.95 },
  { pattern: /account\s*maint|acct\s*maint|monthly\s*maint|COT\s*charge/i, categoryName: 'Bank Charges', subcategory: 'Account Maintenance', confidence: 0.95 },
  { pattern: /management\s*fee|ledger\s*fee/i, categoryName: 'Bank Charges', subcategory: 'Account Maintenance', confidence: 0.9 },
  { pattern: /card\s*(issuance|renewal|replacement|fee)|debit\s*card\s*fee|ATM\s*card\s*fee/i, categoryName: 'Bank Charges', subcategory: 'Card Fees', confidence: 0.95 },
  { pattern: /TOKEN\s*(charge|maintenance|fee)/i, categoryName: 'Bank Charges', subcategory: 'Token Charge', confidence: 0.95 },
  { pattern: /TRANSFER\s*FEE\s*REFUND/i, categoryName: 'Refund/Reimbursement', subcategory: 'Fee Refund', confidence: 0.99 },
  { pattern: /e-?\s*levy|electronic\s*transfer\s*levy/i, categoryName: 'Bank Charges', subcategory: 'E-Levy', confidence: 0.95 },
  { pattern: /interest\s*(charge|debit)|overdraft\s*interest/i, categoryName: 'Bank Charges', subcategory: 'Interest Charge', confidence: 0.9 },
];

// ─── TIER 1: REVERSALS & REFUNDS ────────────────────────────────────────────

const REVERSAL_RULES: Rule[] = [
  { pattern: /\breversal\b/i, categoryName: 'Refund/Reimbursement', subcategory: 'Transfer Reversal', confidence: 0.95 },
  { pattern: /\breversed\b/i, categoryName: 'Refund/Reimbursement', subcategory: 'Transfer Reversal', confidence: 0.95 },
  { pattern: /^Rev-/i, categoryName: 'Refund/Reimbursement', subcategory: 'Reversal', confidence: 0.95 },
  { pattern: /\brefund\b/i, categoryName: 'Refund/Reimbursement', subcategory: 'Refund', confidence: 0.9 },
  { pattern: /MFY\s*Refund/i, categoryName: 'Refund/Reimbursement', subcategory: 'Failed Transaction Reversal', confidence: 0.95 },
  { pattern: /chargeback|dispute\s*credit/i, categoryName: 'Refund/Reimbursement', subcategory: 'Chargeback', confidence: 0.9 },
  { pattern: /RVSL|TRFREV/i, categoryName: 'Refund/Reimbursement', subcategory: 'Transfer Reversal', confidence: 0.9 },
];

// ─── TIER 2: SELF TRANSFERS ─────────────────────────────────────────────────

const SELF_TRANSFER_RULES: Rule[] = [
  { pattern: /SELF\s*TO\s*SELF/i, categoryName: 'Transfer (Own Account)', subcategory: 'Between Own Accounts (Same Bank)', confidence: 0.99 },
  { pattern: /SELF\s*TRANSFER/i, categoryName: 'Transfer (Own Account)', subcategory: 'Between Own Accounts', confidence: 0.95 },
  { pattern: /OWN\s*ACCOUNT\s*TRANSFER/i, categoryName: 'Transfer (Own Account)', subcategory: 'Between Own Accounts', confidence: 0.95 },
  { pattern: /\b-\s*me\s*$/i, categoryName: 'Transfer (Own Account)', subcategory: 'Between Own Accounts', confidence: 0.85 },
];

// ─── TIER 3: ATM & POS WITHDRAWALS ──────────────────────────────────────────

const WITHDRAWAL_RULES: Rule[] = [
  { pattern: /ATM\s*(\/\s*)?WDL|ATM\s*WITHDRAWAL|ATM\s*CASH/i, categoryName: 'Transfer (Own Account)', subcategory: 'ATM Cash Withdrawal', confidence: 0.99 },
  { pattern: /POS\s*(\/\s*)?WDL|POS\s*WITHDRAWAL|POS\s*CASH/i, categoryName: 'Transfer (Own Account)', subcategory: 'POS Cash Withdrawal', confidence: 0.95 },
  { pattern: /CASH\s*WITHDRAWAL/i, categoryName: 'Transfer (Own Account)', subcategory: 'Cash Withdrawal', confidence: 0.9 },
  { pattern: /CARDLESS\s*WITHDRAWAL/i, categoryName: 'Transfer (Own Account)', subcategory: 'Cardless Withdrawal', confidence: 0.95 },
];

// ─── TIER 4: AIRTIME & DATA ─────────────────────────────────────────────────

const AIRTIME_DATA_RULES: Rule[] = [
  { pattern: /Airtime\s*ALAT|AirtimeALAT/i, categoryName: 'Internet & Data', subcategory: 'Airtime Purchase', confidence: 0.95 },
  { pattern: /Data\s*ALAT|DataALAT/i, categoryName: 'Internet & Data', subcategory: 'Data Bundle', confidence: 0.95 },
  { pattern: /AIRTIME\s*(?:PURCHASE|RECHARGE|TOPUP|TOP-UP|VTU)/i, categoryName: 'Internet & Data', subcategory: 'Airtime Purchase', confidence: 0.9 },
  { pattern: /DATA\s*(?:PURCHASE|BUNDLE|PLAN|SUBSCRIPTION|VTU)/i, categoryName: 'Internet & Data', subcategory: 'Data Bundle', confidence: 0.9 },
  { pattern: /\b(MTN|GLO|AIRTEL|9MOBILE|ETISALAT)\b.*\b(airtime|data|recharge|VTU|topup)\b/i, categoryName: 'Internet & Data', subcategory: 'Airtime/Data', confidence: 0.85 },
  { pattern: /\b(airtime|data|recharge|VTU|topup)\b.*\b(MTN|GLO|AIRTEL|9MOBILE|ETISALAT)\b/i, categoryName: 'Internet & Data', subcategory: 'Airtime/Data', confidence: 0.85 },
  { pattern: /^(?:Airtime|Data).*\b(MTN|GLO|AIRTEL|9MOBILE)\b/i, categoryName: 'Internet & Data', subcategory: 'Airtime/Data', confidence: 0.9 },
  { pattern: /\b(VTPASS|BAXI|IRECHARGE|BUYPOWER.*airtime|QUICKTELLER.*airtime)\b/i, categoryName: 'Internet & Data', subcategory: 'Airtime Purchase', confidence: 0.8 },
];

// ─── TIER 5: ELECTRICITY ────────────────────────────────────────────────────

const ELECTRICITY_RULES: Rule[] = [
  { pattern: /\b(EKEDC|IKEDC|AEDC|BEDC|JEDC|KEDCO|PHED|EEDC|KAEDCO|IBEDC|YEDC)\b/i, categoryName: 'Electricity & Fuel', subcategory: 'Electricity (Disco)', confidence: 0.99 },
  { pattern: /BuyPower/i, categoryName: 'Electricity & Fuel', subcategory: 'Electricity (Prepaid)', confidence: 0.99 },
  { pattern: /prepaid\s*meter|postpaid\s*meter|electricity\s*(token|bill|payment|unit)/i, categoryName: 'Electricity & Fuel', subcategory: 'Electricity', confidence: 0.95 },
  { pattern: /power\s*purchase|power\s*token|electric\s*bill|NEPA|PHCN/i, categoryName: 'Electricity & Fuel', subcategory: 'Electricity', confidence: 0.9 },
  { pattern: /\b(BAXI|VTPASS|QUICKTELLER|IRECHARGE)\b.*\b(electric|power|disco)\b/i, categoryName: 'Electricity & Fuel', subcategory: 'Electricity', confidence: 0.85 },
];

// ─── TIER 6: CABLE TV ───────────────────────────────────────────────────────

const CABLE_TV_RULES: Rule[] = [
  { pattern: /\b(DSTV|GOTV|GOtv|STARTIMES|MULTICHOICE)\b/i, categoryName: 'Personal — Entertainment', subcategory: 'Cable TV', confidence: 0.95 },
  { pattern: /cable\s*tv|decoder\s*sub|tv\s*subscription/i, categoryName: 'Personal — Entertainment', subcategory: 'Cable TV', confidence: 0.9 },
];

// ─── TIER 7: INTERNET ───────────────────────────────────────────────────────

const INTERNET_RULES: Rule[] = [
  { pattern: /\b(SPECTRANET|SMILE\s*COMM|SWIFT\s*NETWORK|TIZETI|IPNX|COOLLINK|MAINONE|STARLINK|FIBERONE|LEGEND)\b/i, categoryName: 'Internet & Data', subcategory: 'ISP Subscription', confidence: 0.95 },
  { pattern: /internet\s*(subscription|bill|plan)|broadband|fibre\s*plan|wifi\s*(plan|sub|bill)/i, categoryName: 'Internet & Data', subcategory: 'Internet', confidence: 0.9 },
];

// ─── TIER 8: WATER & WASTE ──────────────────────────────────────────────────

const WATER_WASTE_RULES: Rule[] = [
  { pattern: /water\s*(bill|board|rate|corp)|Lagos\s*water/i, categoryName: 'Personal — Housing & Utilities', subcategory: 'Water', confidence: 0.9 },
  { pattern: /\b(LAWMA|PSP)\b|waste\s*management/i, categoryName: 'Personal — Housing & Utilities', subcategory: 'Waste Management', confidence: 0.9 },
];

// ─── TIER 9: FUEL ───────────────────────────────────────────────────────────

const FUEL_RULES: Rule[] = [
  { pattern: /\b(ETERNA|NNPC|TOTAL\s*ENERGIES|TOTALENERGIES|OANDO|MOBIL|CONOIL|MRS\s*OIL|FORTE\s*OIL|ARDOVA|CAPITAL\s*OIL|AA\s*RANO|NIPCO|ENYO)\b/i, categoryName: 'Electricity & Fuel', subcategory: 'Petrol Station', confidence: 0.9 },
  { pattern: /fuel\s*station|petrol\s*station|filling\s*station|fuel\s*purchase/i, categoryName: 'Electricity & Fuel', subcategory: 'Fuel', confidence: 0.9 },
  { pattern: /\bdiesel\b|generator\s*fuel|gen\s*fuel/i, categoryName: 'Electricity & Fuel', subcategory: 'Diesel / Generator', confidence: 0.85 },
  { pattern: /cooking\s*gas|LPG|gas\s*refill|cylinder\s*refill/i, categoryName: 'Electricity & Fuel', subcategory: 'Cooking Gas / LPG', confidence: 0.9 },
];

// ─── TIER 10: HEALTH & MEDICAL ──────────────────────────────────────────────

const HEALTH_RULES: Rule[] = [
  { pattern: /\b(DUCHESS|REDDINGTON|EKO\s*HOSPITAL|LUTH|LASUTH|FIRST\s*CONSULTANT|EVERCARE|CEDARCREST|ST\.?\s*NICHOLAS|LAGOON|RAINBOW|LIFE\s*HOSPITAL)\b/i, categoryName: 'Personal — Health/Medical', subcategory: 'Hospital & Clinic', confidence: 0.95 },
  { pattern: /\b(MEDPLUS|HEALTHPLUS|MED-?PLUS|ALPHA\s*PHARMACY|NETT\s*PHARMACY)\b/i, categoryName: 'Personal — Health/Medical', subcategory: 'Pharmacy', confidence: 0.95 },
  { pattern: /\bdental\b|dentist|SMILE\s*360/i, categoryName: 'Personal — Health/Medical', subcategory: 'Dental', confidence: 0.9 },
  { pattern: /\b(hospital|clinic|medical\s*cent(re|er)|specialist|maternity)\b/i, categoryName: 'Personal — Health/Medical', subcategory: 'Hospital & Clinic', confidence: 0.85 },
  { pattern: /\b(pharmacy|pharma|drug\s*store|chemist)\b/i, categoryName: 'Personal — Health/Medical', subcategory: 'Pharmacy', confidence: 0.85 },
  { pattern: /\b(diagnostic|lab\s*test|patholog|radiology|scan\s*cent)/i, categoryName: 'Personal — Health/Medical', subcategory: 'Lab & Diagnostics', confidence: 0.85 },
  { pattern: /\b(optical|eye\s*clinic|optician|eye\s*care)\b/i, categoryName: 'Personal — Health/Medical', subcategory: 'Optical', confidence: 0.85 },
  { pattern: /\b(HMO|HYGEIA|RELIANCE\s*HMO|AXA\s*MANSARD.*health|LEADWAY\s*HEALTH)\b/i, categoryName: 'Personal — Health/Medical', subcategory: 'HMO / Health Insurance', confidence: 0.9 },
];

// ─── TIER 11: FOOD & DINING ─────────────────────────────────────────────────

const FOOD_RULES: Rule[] = [
  { pattern: /\b(CHICKEN\s*REPUBLIC|KILIMANJARO|THE\s*PLACE|MR\.?\s*BIGGS|TANTALIZER|SWEET\s*SENSATION|BUKKA\s*HUT|NKOYO|TERRA\s*KULTURE)\b/i, categoryName: 'Personal — Groceries', subcategory: 'Restaurants & Fast Food', confidence: 0.95 },
  { pattern: /\b(DOMINO'?S|KFC|BURGER\s*KING|COLD\s*STONE|JOHNNY\s*ROCKETS|BARCELOS|DEBONAIRS|PIZZA\s*HUT|SUBWAY)\b/i, categoryName: 'Personal — Groceries', subcategory: 'Restaurants & Fast Food', confidence: 0.95 },
  { pattern: /\bsuya\s*(spot)?|shawarma|amala|EWA\s*AGONYIN|MAMA\s*PUT|BUKA\b/i, categoryName: 'Personal — Groceries', subcategory: 'Local Food Vendors', confidence: 0.85 },
  { pattern: /\b(CHOWDECK|GLOVO|BOLT\s*FOOD|JUMIA\s*FOOD|EDEN\s*LIFE\s*FOOD)\b/i, categoryName: 'Personal — Groceries', subcategory: 'Food Delivery', confidence: 0.95 },
  { pattern: /\b(cafe|café|coffee\s*shop|ARTCAFE|BOGOBIRI|CAFENNEO|WHEATBAKER)\b/i, categoryName: 'Personal — Groceries', subcategory: 'Cafe', confidence: 0.8 },
  { pattern: /\b(restaurant|eatery|grill|kitchen|bistro|diner|canteen|food\s*court)\b/i, categoryName: 'Personal — Groceries', subcategory: 'Restaurant', confidence: 0.8 },
];

// ─── TIER 12: GROCERIES ─────────────────────────────────────────────────────

const GROCERY_RULES: Rule[] = [
  { pattern: /\b(SHOPRITE|SPAR|JUSTRITE|EBEANO|NEXT\s*CASH|PRINCE\s*EBEANO|MARKET\s*SQUARE|ADDIDE|HUBMART|GAME\s*STORE)\b/i, categoryName: 'Personal — Groceries', subcategory: 'Supermarket', confidence: 0.95 },
  { pattern: /\bsupermarket|super\s*market|grocery|groceries\b/i, categoryName: 'Personal — Groceries', subcategory: 'Supermarket', confidence: 0.85 },
];

// ─── TIER 13: TRANSPORTATION ─────────────────────────────────────────────────

const TRANSPORT_RULES: Rule[] = [
  { pattern: /\b(UBER|BOLT|INDRIVE|TAXIFY|LYFT)\b/i, categoryName: 'Personal — Transport', subcategory: 'Ride-Hailing', confidence: 0.9 },
  { pattern: /\bLCC\b.*toll|toll.*\bLCC\b|lekki\s*toll|toll\s*gate/i, categoryName: 'Personal — Transport', subcategory: 'Tolls', confidence: 0.95 },
  { pattern: /\b(BRT|LAMATA|ferry|cowry\s*card)\b/i, categoryName: 'Personal — Transport', subcategory: 'Public Transit', confidence: 0.9 },
  { pattern: /\bmechanic|car\s*wash|auto\s*repair|panel\s*beat|spare\s*parts|tyre|tire\s*shop\b/i, categoryName: 'Personal — Transport', subcategory: 'Vehicle Maintenance', confidence: 0.85 },
  { pattern: /\bparking\b/i, categoryName: 'Personal — Transport', subcategory: 'Parking', confidence: 0.8 },
];

// ─── TIER 14: CHILDCARE ─────────────────────────────────────────────────────

const CHILDCARE_RULES: Rule[] = [
  { pattern: /baby\s*store|baby\s*shop|CELINA\s*BABY/i, categoryName: 'Personal — Other', subcategory: 'Baby Supplies', confidence: 0.9 },
  { pattern: /\b(creche|daycare|nanny|baby\s*sitter|babysitter|child\s*care|pampers|diaper)\b/i, categoryName: 'Personal — Other', subcategory: 'Childcare', confidence: 0.9 },
];

// ─── TIER 15: LAUNDRY ───────────────────────────────────────────────────────

const LAUNDRY_RULES: Rule[] = [
  { pattern: /\blaundry|laundr|dry\s*clean/i, categoryName: 'Personal — Other', subcategory: 'Laundry & Dry Cleaning', confidence: 0.9 },
  { pattern: /\bcleaning\s*service|home\s*cleaning|fumigat/i, categoryName: 'Personal — Other', subcategory: 'Cleaning Service', confidence: 0.85 },
];

// ─── TIER 16: EVENTS ────────────────────────────────────────────────────────

const EVENT_RULES: Rule[] = [
  { pattern: /naming\s*ceremony/i, categoryName: 'Personal — Other', subcategory: 'Naming Ceremony', confidence: 0.95 },
  { pattern: /\b(wedding|bridal|nuptial)\b/i, categoryName: 'Personal — Other', subcategory: 'Wedding', confidence: 0.9 },
  { pattern: /happy\s*married\s*life/i, categoryName: 'Personal — Other', subcategory: 'Wedding Gift', confidence: 0.95 },
  { pattern: /\b(burial|funeral|fidau|janazah)\b/i, categoryName: 'Personal — Other', subcategory: 'Funeral', confidence: 0.9 },
  { pattern: /\b(birthday\s*party|owambe|aso\s*ebi)\b/i, categoryName: 'Personal — Other', subcategory: 'Celebration', confidence: 0.85 },
  { pattern: /\bevent\s*(planner|planning|centre|center|hall)\b/i, categoryName: 'Personal — Other', subcategory: 'Event Venue / Planning', confidence: 0.85 },
];

// ─── TIER 17: HOUSING ───────────────────────────────────────────────────────

const HOUSING_RULES: Rule[] = [
  { pattern: /RESIDENTS?\s*ASSOCIATION|ESTATE\s*DUES/i, categoryName: 'Personal — Housing & Utilities', subcategory: 'Residents Association', confidence: 0.95 },
  { pattern: /\brent\s*(payment|due|renewal)\b|house\s*rent|annual\s*rent/i, categoryName: 'Personal — Housing & Utilities', subcategory: 'Rent', confidence: 0.9 },
  { pattern: /service\s*charge|estate\s*management|estate\s*levy/i, categoryName: 'Personal — Housing & Utilities', subcategory: 'Service Charge', confidence: 0.9 },
  { pattern: /\b(hotel|short.?let|airbnb|booking\.com|agoda)\b/i, categoryName: 'Personal — Housing & Utilities', subcategory: 'Accommodation', confidence: 0.85 },
  { pattern: /\b(caretaker|landlord|property\s*agent|agency\s*fee)\b/i, categoryName: 'Personal — Housing & Utilities', subcategory: 'Rent', confidence: 0.8 },
];

// ─── TIER 18: HOME IMPROVEMENT ──────────────────────────────────────────────

const HOME_RULES: Rule[] = [
  { pattern: /aluminium\s*and\s*glass|aluminium\s*work|window\s*frame/i, categoryName: 'Personal — Other', subcategory: 'Aluminium & Glass', confidence: 0.85 },
  { pattern: /\b(furniture|carpenter|upholster|curtain|blinds|interior\s*decor)\b/i, categoryName: 'Personal — Other', subcategory: 'Furniture & Fittings', confidence: 0.8 },
  { pattern: /\b(plumber|plumbing|electrician|electrical\s*work|painter|painting|tiler|tiling)\b/i, categoryName: 'Personal — Other', subcategory: 'Repairs & Maintenance', confidence: 0.8 },
];

// ─── TIER 19: SOLAR & ENERGY ────────────────────────────────────────────────

const ENERGY_RULES: Rule[] = [
  { pattern: /solar\s*(installation|panel|power|system)/i, categoryName: 'Electricity & Fuel', subcategory: 'Solar Installation', confidence: 0.9 },
  { pattern: /\b(SOLAFLIX|RENSOURCE|ARNERGY|LUMOS|DAYSTAR\s*POWER)\b/i, categoryName: 'Electricity & Fuel', subcategory: 'Solar Provider', confidence: 0.95 },
  { pattern: /\b(inverter|power\s*backup|solar\s*battery)\b/i, categoryName: 'Electricity & Fuel', subcategory: 'Inverter & Battery', confidence: 0.85 },
];

// ─── TIER 20: SOFTWARE SUBSCRIPTIONS ─────────────────────────────────────────

const SOFTWARE_RULES: Rule[] = [
  { pattern: /\b(GOOGLE\s*(CLOUD|WORKSPACE|ONE|STORAGE)|GSUITE)\b/i, categoryName: 'Software Subscriptions', subcategory: 'Google Services', confidence: 0.9 },
  { pattern: /\b(MICROSOFT|OFFICE\s*365|AZURE|GITHUB)\b/i, categoryName: 'Software Subscriptions', subcategory: 'Microsoft / GitHub', confidence: 0.9 },
  { pattern: /\b(APPLE\.COM|ICLOUD|APP\s*STORE)\b/i, categoryName: 'Software Subscriptions', subcategory: 'Apple Services', confidence: 0.85 },
  { pattern: /\b(NOTION|FIGMA|CANVA|SLACK|ZOOM|TRELLO|ASANA|MONDAY\.COM)\b/i, categoryName: 'Software Subscriptions', subcategory: 'Productivity Tools', confidence: 0.9 },
  { pattern: /\b(AWS|AMAZON\s*WEB\s*SERVICES|HEROKU|VERCEL|NETLIFY|DIGITAL\s*OCEAN|DIGITALOCEAN|RAILWAY)\b/i, categoryName: 'Software Subscriptions', subcategory: 'Cloud / Hosting', confidence: 0.9 },
  { pattern: /\b(OPENAI|ANTHROPIC|CHATGPT)\b/i, categoryName: 'Software Subscriptions', subcategory: 'AI Services', confidence: 0.9 },
  { pattern: /\b(ADOBE|CREATIVE\s*CLOUD|PHOTOSHOP|LIGHTROOM)\b/i, categoryName: 'Software Subscriptions', subcategory: 'Design Software', confidence: 0.9 },
  { pattern: /\b(MAILCHIMP|SENDGRID|TWILIO|HUBSPOT)\b/i, categoryName: 'Software Subscriptions', subcategory: 'Marketing / Comms', confidence: 0.85 },
  { pattern: /\b(NAMECHEAP|GODADDY|CLOUDFLARE|DOMAIN)\b/i, categoryName: 'Software Subscriptions', subcategory: 'Domain / DNS', confidence: 0.85 },
];

// ─── TIER 21: TECH & ELECTRONICS ─────────────────────────────────────────────

const TECH_RULES: Rule[] = [
  { pattern: /wifi\s*(extender|router)|networking\s*equipment|modem/i, categoryName: 'Internet & Data', subcategory: 'Networking Equipment', confidence: 0.85 },
  { pattern: /\b(laptop|macbook|iphone|samsung|tecno|infinix|redmi|phone\s*purchase)\b/i, categoryName: 'Personal — Shopping/Clothing', subcategory: 'Phones & Laptops', confidence: 0.8 },
  { pattern: /\b(SLOT|3CHUB|POINTEK|FINET)\b/i, categoryName: 'Personal — Shopping/Clothing', subcategory: 'Electronics Store', confidence: 0.85 },
];

// ─── TIER 22: RELIGIOUS & CHARITY ────────────────────────────────────────────

const RELIGIOUS_RULES: Rule[] = [
  { pattern: /\b(mosque|masjid|MSQ)\b/i, categoryName: 'Gift (Non-Taxable)', subcategory: 'Mosque', confidence: 0.9 },
  { pattern: /\b(tithe|offering|church|parish|ministry|bishop|pastor|RCCG|WINNERS|MFM|COZA|DAYSTAR\s*CHURCH)\b/i, categoryName: 'Gift (Non-Taxable)', subcategory: 'Church / Tithe', confidence: 0.85 },
  { pattern: /\b(zakat|sadaqah|ramadan|eid|fidau|islamic\s*foundation)\b/i, categoryName: 'Gift (Non-Taxable)', subcategory: 'Islamic Giving', confidence: 0.9 },
  { pattern: /\b(charity|donation|NGO|red\s*cross|UNICEF)\b/i, categoryName: 'Gift (Non-Taxable)', subcategory: 'Charity', confidence: 0.8 },
];

// ─── TIER 23: GOVERNMENT & TAXES ─────────────────────────────────────────────

const GOVERNMENT_RULES: Rule[] = [
  { pattern: /Remita/i, categoryName: 'Personal — Other', subcategory: 'Remita Payment', confidence: 0.7 },
  { pattern: /\b(FIRS|LIRS|IRAS|state\s*revenue|withholding\s*tax|tax\s*payment)\b/i, categoryName: 'Personal — Other', subcategory: 'Tax Payment', confidence: 0.9 },
  { pattern: /\b(passport|NIN|immigration|driver'?s?\s*licen[cs]e|vehicle\s*papers|plate\s*number|FRSC|VIO)\b/i, categoryName: 'Personal — Other', subcategory: 'Government Fees', confidence: 0.85 },
  { pattern: /land\s*use\s*charge|tenement\s*rate|ground\s*rent/i, categoryName: 'Personal — Other', subcategory: 'Property Levy', confidence: 0.9 },
];

// ─── TIER 24: SHOPPING & E-COMMERCE ──────────────────────────────────────────

const SHOPPING_RULES: Rule[] = [
  { pattern: /\b(JUMIA|KONGA|JIJI|PAYPORTE|KARA|HUBMART)\b/i, categoryName: 'Personal — Shopping/Clothing', subcategory: 'Online / E-commerce', confidence: 0.9 },
  { pattern: /\b(AMAZON|ALIEXPRESS|SHEIN|TEMU|EBAY)\b/i, categoryName: 'Personal — Shopping/Clothing', subcategory: 'International E-commerce', confidence: 0.9 },
  { pattern: /POS\s*(?:\/\s*WEB\s*)?PURCHASE/i, categoryName: 'Personal — Shopping/Clothing', subcategory: 'POS Purchase', confidence: 0.5 },
  { pattern: /WEB\s*PURCHASE/i, categoryName: 'Personal — Shopping/Clothing', subcategory: 'Online Purchase', confidence: 0.5 },
];

// ─── TIER 25: ENTERTAINMENT ──────────────────────────────────────────────────

const ENTERTAINMENT_RULES: Rule[] = [
  { pattern: /\b(NETFLIX|SPOTIFY|YOUTUBE\s*PREMIUM|SHOWMAX|DISNEY|APPLE\s*TV|PRIME\s*VIDEO|DEEZER)\b/i, categoryName: 'Personal — Entertainment', subcategory: 'Streaming', confidence: 0.95 },
  { pattern: /\b(FILMHOUSE|GENESIS\s*CINEMA|SILVERBIRD|cinema|movie)\b/i, categoryName: 'Personal — Entertainment', subcategory: 'Cinema', confidence: 0.9 },
];

// ─── TIER 26: BETTING & GAMING ───────────────────────────────────────────────

const BETTING_RULES: Rule[] = [
  { pattern: /\b(SPORTYBET|BET9JA|1XBET|BETKING|BETWAY|NAIRABET|MERRYBET|BETLAND|BETBONANZA|BETPAWA|MSPORT|22BET)\b/i, categoryName: 'Personal — Entertainment', subcategory: 'Sports Betting', confidence: 0.99 },
  { pattern: /\b(PLAYSTATION\s*STORE|STEAM|XBOX|game\s*credit)\b/i, categoryName: 'Personal — Entertainment', subcategory: 'Gaming', confidence: 0.85 },
];

// ─── TIER 27: EDUCATION ──────────────────────────────────────────────────────

const EDUCATION_RULES: Rule[] = [
  { pattern: /\b(school\s*fee|tuition|university|polytechnic|college\s*of|faculty)\b/i, categoryName: 'Personal — Other', subcategory: 'School Fees', confidence: 0.9 },
  { pattern: /\b(WAEC|JAMB|NECO|NABTEB|exam\s*fee)\b/i, categoryName: 'Personal — Other', subcategory: 'Exam Fees', confidence: 0.9 },
  { pattern: /\b(UDEMY|COURSERA|PLURALSIGHT|SKILLSHARE|bootcamp|training\s*fee)\b/i, categoryName: 'Professional Development', subcategory: 'Online Learning', confidence: 0.85 },
];

// ─── TIER 28: INVESTMENT ─────────────────────────────────────────────────────

const INVESTMENT_RULES: Rule[] = [
  { pattern: /\b(PIGGYVEST|COWRYWISE|RISEVEST|BAMBOO|CHAKA|TROVE|TRACTION)\b/i, categoryName: 'Savings/Investment Transfer', subcategory: 'Investment Platform', confidence: 0.9 },
  { pattern: /\b(mutual\s*fund|money\s*market|treasury\s*bill|fixed\s*deposit)\b/i, categoryName: 'Savings/Investment Transfer', subcategory: 'Savings Product', confidence: 0.85 },
];

// ─── TIER 29: LOAN ───────────────────────────────────────────────────────────

const LOAN_RULES: Rule[] = [
  { pattern: /\b(FAIRMONEY|CARBON|PALMCREDIT|BRANCH|AELLA|RENMONEY|QUICKCHECK|ZEDVANCE|MIGO|SPECTA|KIAKIA)\b/i, categoryName: 'Loan Repayment', subcategory: 'Loan App', confidence: 0.85 },
  { pattern: /loan\s*(repayment|disbursement|payment)|EMI\s*payment/i, categoryName: 'Loan Repayment', subcategory: 'Loan Repayment', confidence: 0.85 },
];

// ─── TIER 30: INSURANCE ──────────────────────────────────────────────────────

const INSURANCE_RULES: Rule[] = [
  { pattern: /\b(LEADWAY|AXA\s*MANSARD|AIICO|CUSTODIAN|CORNERSTONE|STACO)\b.*\b(insurance|assurance|premium)\b/i, categoryName: 'Personal — Other', subcategory: 'Insurance Premium', confidence: 0.9 },
  { pattern: /\b(car|auto|vehicle|motor|third\s*party)\s*insurance\b/i, categoryName: 'Personal — Other', subcategory: 'Auto Insurance', confidence: 0.9 },
  { pattern: /\b(life\s*insurance|pension|PFA|PENCOM)\b/i, categoryName: 'Personal — Other', subcategory: 'Life / Pension', confidence: 0.85 },
];

// ─── TIER 31: CRYPTO ─────────────────────────────────────────────────────────

const CRYPTO_RULES: Rule[] = [
  { pattern: /\b(BINANCE|LUNO|QUIDAX|PATRICIA|BYBIT|ROQQU|BUSHA|YELLOWCARD|BUNDLE)\b/i, categoryName: 'Savings/Investment Transfer', subcategory: 'Crypto Exchange', confidence: 0.9 },
];

// ─── TIER 32: BEAUTY & GROOMING ──────────────────────────────────────────────

const BEAUTY_RULES: Rule[] = [
  { pattern: /\b(barber|barbing|salon|hair\s*studio|braiding|weav)/i, categoryName: 'Personal — Other', subcategory: 'Hair / Barber', confidence: 0.85 },
  { pattern: /\b(spa|massage|wellness\s*cent)/i, categoryName: 'Personal — Other', subcategory: 'Spa & Wellness', confidence: 0.85 },
  { pattern: /\b(nail\s*studio|pedicure|manicure)\b/i, categoryName: 'Personal — Other', subcategory: 'Nails', confidence: 0.85 },
];

// ─── TIER 33: FREELANCE & BUSINESS INCOME (credits) ─────────────────────────

const INCOME_RULES: Rule[] = [
  { pattern: /WISE\s*PAYMENTS/i, categoryName: 'Foreign Income', subcategory: 'International Income (Wise)', confidence: 0.95 },
  { pattern: /\b(PAYONEER|REMITLY|WORLDREMIT|SENDWAVE|CHIPPER)\b/i, categoryName: 'Foreign Income', subcategory: 'International Remittance', confidence: 0.9 },
  { pattern: /\b(UPWORK|FIVERR|TOPTAL|TURING|ANDELA|DEEL|REMOTE\.COM)\b/i, categoryName: 'Freelance/Client Income', subcategory: 'Freelance Platform', confidence: 0.9 },
  { pattern: /\bsalary\b|payroll|monthly\s*pay|staff\s*salary/i, categoryName: 'Salary/PAYE', subcategory: 'Salary', confidence: 0.9 },
  { pattern: /interest\s*(credit|earned|payment)|dividend/i, categoryName: 'Investment Returns', subcategory: 'Interest & Dividends', confidence: 0.85 },
  { pattern: /\b(PAYSTACK|FLUTTERWAVE)\b.*\b(settlement|payout)\b/i, categoryName: 'Business Revenue', subcategory: 'Payment Gateway Settlement', confidence: 0.9 },
  { pattern: /\b(rental|rent)\s*(income|received|credit)\b/i, categoryName: 'Rental Income', subcategory: 'Rent Received', confidence: 0.85 },
];

// ─── TIER 34: PROFESSIONAL SERVICES ──────────────────────────────────────────

const PROFESSIONAL_RULES: Rule[] = [
  { pattern: /\b(lawyer|solicitor|legal\s*fee|barrister|attorney|law\s*firm)\b/i, categoryName: 'Professional Services', subcategory: 'Legal Fees', confidence: 0.85 },
  { pattern: /\b(accountant|audit|tax\s*consultant|book\s*keep)\b/i, categoryName: 'Professional Services', subcategory: 'Accounting', confidence: 0.85 },
  { pattern: /\b(consultant|consulting\s*fee|advisory\s*fee)\b/i, categoryName: 'Professional Services', subcategory: 'Consulting', confidence: 0.8 },
];

// ─── TIER 35: MARKETING & ADVERTISING ────────────────────────────────────────

const MARKETING_RULES: Rule[] = [
  { pattern: /\b(FACEBOOK\s*ADS|META\s*ADS|INSTAGRAM\s*ADS|GOOGLE\s*ADS|TIKTOK\s*ADS)\b/i, categoryName: 'Marketing & Advertising', subcategory: 'Online Ads', confidence: 0.9 },
  { pattern: /\b(advertising|advert|billboard|flyer|printing\s*press)\b/i, categoryName: 'Marketing & Advertising', subcategory: 'Advertising', confidence: 0.8 },
];

// ─── TIER 36: PAYMENT GATEWAYS (low confidence — need secondary signals) ────

const GATEWAY_RULES: Rule[] = [
  { pattern: /PAYSTACK\s*CHECKOUT/i, categoryName: 'Personal — Shopping/Clothing', subcategory: 'Online Purchase (via Paystack)', confidence: 0.4 },
  { pattern: /\b(CORALPAY|FLUTTERWAVE|INTERSWITCH|SQUAD|REMITA\s*CHECKOUT)\b/i, categoryName: 'Personal — Shopping/Clothing', subcategory: 'Online Purchase (via Gateway)', confidence: 0.35 },
];

// ─── NARRATION HINT OVERRIDES ────────────────────────────────────────────────
// When the transfer narration (text after '-') contains these, override category

const NARRATION_HINTS: Rule[] = [
  { pattern: /naming\s*ceremony/i, categoryName: 'Personal — Other', subcategory: 'Naming Ceremony', confidence: 0.95 },
  { pattern: /wedding|married\s*life|bride|groom/i, categoryName: 'Personal — Other', subcategory: 'Wedding', confidence: 0.95 },
  { pattern: /birthday/i, categoryName: 'Personal — Other', subcategory: 'Birthday', confidence: 0.9 },
  { pattern: /burial|funeral|condolence/i, categoryName: 'Personal — Other', subcategory: 'Funeral', confidence: 0.9 },
  { pattern: /laundry|laundr/i, categoryName: 'Personal — Other', subcategory: 'Laundry', confidence: 0.9 },
  { pattern: /\bcleaning\b/i, categoryName: 'Personal — Other', subcategory: 'Cleaning', confidence: 0.85 },
  { pattern: /wifi\s*extender|router|modem/i, categoryName: 'Internet & Data', subcategory: 'Networking', confidence: 0.9 },
  { pattern: /solar\s*install/i, categoryName: 'Electricity & Fuel', subcategory: 'Solar Installation', confidence: 0.95 },
  { pattern: /school\s*fee|tuition/i, categoryName: 'Personal — Other', subcategory: 'School Fees', confidence: 0.95 },
  { pattern: /\brent\b/i, categoryName: 'Personal — Housing & Utilities', subcategory: 'Rent', confidence: 0.85 },
  { pattern: /\bfood\b|lunch|dinner|breakfast/i, categoryName: 'Personal — Groceries', subcategory: 'Food', confidence: 0.8 },
  { pattern: /hospital|medical/i, categoryName: 'Personal — Health/Medical', subcategory: 'Medical', confidence: 0.9 },
  { pattern: /tithe|offering/i, categoryName: 'Gift (Non-Taxable)', subcategory: 'Tithe / Offering', confidence: 0.9 },
  { pattern: /electricity|NEPA|power\s*bill/i, categoryName: 'Electricity & Fuel', subcategory: 'Electricity', confidence: 0.9 },
  { pattern: /fuel|petrol|diesel/i, categoryName: 'Electricity & Fuel', subcategory: 'Fuel', confidence: 0.85 },
  { pattern: /Gift\s*to\s*Baby/i, categoryName: 'Personal — Other', subcategory: 'Baby Gift', confidence: 0.9 },
  { pattern: /airtime|data\s*bundle/i, categoryName: 'Internet & Data', subcategory: 'Airtime / Data', confidence: 0.85 },
  { pattern: /insurance|premium/i, categoryName: 'Personal — Other', subcategory: 'Insurance', confidence: 0.8 },
  { pattern: /invest|saving|piggyvest|cowrywise/i, categoryName: 'Savings/Investment Transfer', subcategory: 'Investment', confidence: 0.8 },
  { pattern: /loan\s*repay/i, categoryName: 'Loan Repayment', subcategory: 'Loan Repayment', confidence: 0.85 },
  { pattern: /\bdues\b/i, categoryName: 'Personal — Other', subcategory: 'Dues & Membership', confidence: 0.8 },
];

// ─── Combined rule tiers (priority order) ────────────────────────────────────

const ALL_RULES: Rule[] = [
  ...META_CHARGE_RULES,
  ...REVERSAL_RULES,
  ...SELF_TRANSFER_RULES,
  ...WITHDRAWAL_RULES,
  ...AIRTIME_DATA_RULES,
  ...ELECTRICITY_RULES,
  ...CABLE_TV_RULES,
  ...INTERNET_RULES,
  ...WATER_WASTE_RULES,
  ...FUEL_RULES,
  ...HEALTH_RULES,
  ...FOOD_RULES,
  ...GROCERY_RULES,
  ...TRANSPORT_RULES,
  ...CHILDCARE_RULES,
  ...LAUNDRY_RULES,
  ...EVENT_RULES,
  ...HOUSING_RULES,
  ...HOME_RULES,
  ...ENERGY_RULES,
  ...SOFTWARE_RULES,
  ...TECH_RULES,
  ...RELIGIOUS_RULES,
  ...GOVERNMENT_RULES,
  ...SHOPPING_RULES,
  ...ENTERTAINMENT_RULES,
  ...BETTING_RULES,
  ...EDUCATION_RULES,
  ...INVESTMENT_RULES,
  ...LOAN_RULES,
  ...INSURANCE_RULES,
  ...CRYPTO_RULES,
  ...BEAUTY_RULES,
  ...INCOME_RULES,
  ...PROFESSIONAL_RULES,
  ...MARKETING_RULES,
  ...GATEWAY_RULES,
];

// ─── Main categorisation function ────────────────────────────────────────────

export function categorise(
  description: string,
  amount: number,
  direction: 'credit' | 'debit',
): RuleBasedResult {
  const desc = description.trim();
  const vendor = extractVendorName(desc);
  const narration = extractNarration(desc);

  const result: RuleBasedResult = {
    categoryName: null,
    subcategory: 'Uncategorised',
    confidence: 0,
    vendor: vendor || undefined,
    matchedBy: 'fallback',
    flags: {
      isMetaCharge: false,
      isSelfTransfer: false,
      isReversal: false,
    },
  };

  // --- Pass 1: Narration hints (highest signal from user-written notes) ---
  if (narration) {
    for (const hint of NARRATION_HINTS) {
      if (hint.pattern.test(narration)) {
        result.categoryName = hint.categoryName;
        result.subcategory = hint.subcategory;
        result.confidence = hint.confidence;
        result.matchedBy = 'hint';
        break;
      }
    }
  }

  // --- Pass 2: Pattern rules on the full description ---
  for (const rule of ALL_RULES) {
    if (rule.pattern.test(desc) && rule.confidence > result.confidence) {
      result.categoryName = rule.categoryName;
      result.subcategory = rule.subcategory;
      result.confidence = rule.confidence;
      result.matchedBy = rule === META_CHARGE_RULES[0] ? 'meta' : 'pattern';

      if (META_CHARGE_RULES.includes(rule)) {
        result.flags.isMetaCharge = true;
      }
      if (SELF_TRANSFER_RULES.includes(rule)) {
        result.flags.isSelfTransfer = true;
      }
      if (REVERSAL_RULES.includes(rule)) {
        result.flags.isReversal = true;
      }

      if (result.confidence >= 0.95) break;
    }
  }

  // --- Pass 3: Credit-side income detection ---
  if (direction === 'credit' && result.confidence < 0.7) {
    for (const rule of INCOME_RULES) {
      if (rule.pattern.test(desc)) {
        result.categoryName = rule.categoryName;
        result.subcategory = rule.subcategory;
        result.confidence = rule.confidence;
        result.matchedBy = 'pattern';
        break;
      }
    }
    if (result.confidence < 0.5) {
      result.categoryName = 'Other Taxable Income';
      result.subcategory = 'Incoming Transfer';
      result.confidence = 0.4;
      result.matchedBy = 'fallback';
    }
  }

  // --- Pass 4: Debit-side generic transfer fallback ---
  if (direction === 'debit' && result.confidence < 0.5) {
    if (/TRANSFER\s*TO|NIP.*TO/i.test(desc)) {
      result.categoryName = null;
      result.subcategory = 'Outgoing Transfer';
      result.confidence = 0.3;
      result.matchedBy = 'fallback';
    }
  }

  return result;
}

// ─── Batch helper ────────────────────────────────────────────────────────────

export function categoriseAll(
  transactions: { description: string; amount: number; direction: 'credit' | 'debit' }[],
): RuleBasedResult[] {
  return transactions.map((tx) => categorise(tx.description, tx.amount, tx.direction));
}
