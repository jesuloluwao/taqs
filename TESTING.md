# Testing the UI Locally

## Quick Start

### 1. Make sure Convex is running

In **Terminal 1**, run:
```bash
npx convex dev
```

This should show your Convex URL. Copy it - it looks like:
```
https://xxxxx.convex.cloud
```

### 2. Set up environment variables

Create `apps/web/.env.local` with:

```env
# Get this from root .env.local (created by Convex)
VITE_CONVEX_URL=https://xxxxx.convex.cloud

# Get this from Clerk dashboard: https://dashboard.clerk.com
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
```

**To get your Convex URL:**
```bash
# Check what Convex created
cat .env.local | grep CONVEX_URL
```

**To get your Clerk key:**
1. Go to https://dashboard.clerk.com
2. Select your app (or create one)
3. Go to **API Keys** in the sidebar
4. Copy the **Publishable key** (starts with `pk_test_...`)

### 3. Start the frontend

In **Terminal 2**, run:
```bash
npm run dev
```

This will start Vite dev server at `http://localhost:5173`

### 4. Open in browser

Visit: **http://localhost:5173**

## What to Test

1. **Landing Page** (`/`)
   - Should show the TaxAssist NG landing page
   - Click "Get Started" or "Sign In"

2. **Authentication** (`/sign-in`, `/sign-up`)
   - Sign up with Clerk (Google OAuth or email)
   - Should redirect to dashboard after sign-in

3. **Dashboard** (`/app/dashboard`)
   - Should show summary cards (initially all zeros)
   - Check sidebar navigation

4. **Income Page** (`/app/income`)
   - Click "Add Income"
   - Fill form and submit
   - Should appear in the list

5. **Expenses Page** (`/app/expenses`)
   - Click "Add Expense"
   - Fill form and submit
   - Should appear in the list

6. **Settings** (`/app/settings`)
   - Update your profile (userType, businessName, TIN)
   - Save and verify

7. **Reports** (`/app/reports`)
   - Should show "Coming soon" placeholder

## Troubleshooting

### "Missing VITE_CONVEX_URL"
- Make sure `apps/web/.env.local` exists
- Check that the URL is prefixed with `VITE_`
- Restart the dev server after creating/updating `.env.local`

### "Missing VITE_CLERK_PUBLISHABLE_KEY"
- Get your key from Clerk dashboard
- Add it to `apps/web/.env.local`
- Restart the dev server

### Auth not working
- Make sure Clerk is configured in Convex dashboard
- Check that `CLERK_JWT_ISSUER_DOMAIN` is set in Convex
- Verify your Clerk publishable key is correct

### Convex functions not found
- Make sure `npx convex dev` is running
- Check that Convex has generated types in `convex/_generated/`
- Restart both Convex and frontend servers

### Port already in use
- Vite uses port 5173 by default
- If busy, it will try 5174, 5175, etc.
- Check the terminal output for the actual port

## Quick Command Reference

```bash
# Terminal 1: Convex backend
npx convex dev

# Terminal 2: Frontend
npm run dev

# Or from root, run both (if you have a process manager)
npm run dev          # Frontend
npm run convex:dev   # Convex
```

