# Environment Setup Instructions

Convex has created a `.env.local` file in the root directory with your Convex URL.

## Step 1: Get Your Convex URL

Check your root `.env.local` file - it should have a line like:
```
CONVEX_URL=https://xxxxx.convex.cloud
```

## Step 2: Create Frontend Environment File

Create `apps/web/.env.local` with the following content:

```env
# Copy the CONVEX_URL value from root .env.local and prefix with VITE_
VITE_CONVEX_URL=https://xxxxx.convex.cloud

# Add your Clerk Publishable Key (get from https://dashboard.clerk.com)
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
```

**Important:** 
- The Convex URL must be prefixed with `VITE_` for Vite to expose it to the frontend
- Replace `https://xxxxx.convex.cloud` with your actual Convex URL from root `.env.local`
- Get your Clerk key from https://dashboard.clerk.com → Your App → API Keys

## Quick Command

You can copy the Convex URL from root to frontend like this:

```bash
# Read the Convex URL from root .env.local
CONVEX_URL=$(grep CONVEX_URL .env.local | cut -d '=' -f2)

# Create apps/web/.env.local with VITE_ prefix
echo "VITE_CONVEX_URL=$CONVEX_URL" > apps/web/.env.local
echo "VITE_CLERK_PUBLISHABLE_KEY=pk_test_..." >> apps/web/.env.local
```

Then edit `apps/web/.env.local` to add your Clerk key.

