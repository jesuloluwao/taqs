# Quick Start Guide

## Terminal Commands to Run Locally

### 1. Install Dependencies
```bash
pnpm install
```

### 2. Set Up Environment Variables

Create `apps/web/.env.local`:
```env
VITE_CLERK_PUBLISHABLE_KEY=pk_test_your_key_here
VITE_CONVEX_URL=https://your-project.convex.cloud
```

### 3. Initialize Convex (First Time Only)

```bash
npx convex login
npx convex dev
```

This will:
- Create/link your Convex project
- Generate your deployment URL (copy this to `.env.local`)
- Start the Convex dev server

### 4. Configure Clerk in Convex

After Convex is running, configure Clerk authentication:

1. Go to your Convex dashboard: https://dashboard.convex.dev
2. Navigate to Settings → Auth
3. Add Clerk as an auth provider
4. Set the JWT issuer domain (from your Clerk dashboard, usually `https://your-app.clerk.accounts.dev`)
5. Or set via CLI:
   ```bash
   npx convex env set CLERK_JWT_ISSUER_DOMAIN "https://your-app.clerk.accounts.dev"
   ```

### 5. Run Development Servers

**Terminal 1 - Convex Backend:**
```bash
npx convex dev
```

**Terminal 2 - Frontend:**
```bash
pnpm dev
```

Visit `http://localhost:5173` in your browser.

## Environment Variables Summary

### Frontend (`apps/web/.env.local`)
- `VITE_CLERK_PUBLISHABLE_KEY` - From Clerk dashboard
- `VITE_CONVEX_URL` - From `npx convex dev` output

### Convex (set via dashboard or CLI)
- `CLERK_JWT_ISSUER_DOMAIN` - Your Clerk JWT issuer URL

## Key Files Map

### Routes
- `apps/web/src/App.tsx` - Main router configuration
- `apps/web/src/pages/` - All page components

### Backend
- `convex/schema.ts` - Database schema
- `convex/queries.ts` - Read operations
- `convex/mutations.ts` - Write operations
- `convex/auth.ts` - Auth helpers

### Shared
- `packages/shared/src/types.ts` - TypeScript types
- `packages/shared/src/schemas.ts` - Zod validation

## Troubleshooting

### "Missing VITE_CLERK_PUBLISHABLE_KEY"
- Create `apps/web/.env.local` with your Clerk key

### "Missing VITE_CONVEX_URL"
- Run `npx convex dev` and copy the URL to `.env.local`

### Auth not working
- Ensure Clerk is configured in Convex dashboard
- Check that `CLERK_JWT_ISSUER_DOMAIN` is set correctly
- Verify your Clerk publishable key is correct

### Convex functions not found
- Run `npx convex dev` to generate types
- Restart your frontend dev server

