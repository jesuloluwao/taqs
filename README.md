# TaxAssist NG

A Nigerian tax filing assistant for freelancers and small businesses. Built with React, Convex, and Clerk.

## Prerequisites

- Node.js 18+ and pnpm 8+
- A Clerk account (for authentication)
- A Convex account (for backend)

## Project Structure

```
taxassist-ng/
├── apps/
│   └── web/              # Vite React frontend
├── packages/
│   └── shared/          # Shared types and validation schemas
├── convex/              # Convex backend (database, functions)
└── package.json         # Root workspace configuration
```

## Local Development Setup

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Set Up Clerk

1. Create a Clerk account at https://clerk.com
2. Create a new application
3. Enable Google OAuth (or other providers) in Clerk dashboard
4. Copy your **Publishable Key**

### 3. Set Up Convex

1. Install Convex CLI globally (if not already installed):
   ```bash
   npm install -g convex
   ```

2. Login to Convex:
   ```bash
   npx convex login
   ```

3. Initialize Convex project:
   ```bash
   npx convex dev
   ```
   This will:
   - Create a new Convex project (or link to existing)
   - Generate a deployment URL
   - Start the Convex dev server

4. Configure Clerk integration in Convex:
   - In your Convex dashboard, go to Settings → Auth
   - Add Clerk as an auth provider
   - You'll need your Clerk JWT issuer domain (usually `https://your-app.clerk.accounts.dev`)
   - Set the environment variable in Convex dashboard or via CLI:
     ```bash
     npx convex env set CLERK_JWT_ISSUER_DOMAIN "https://your-app.clerk.accounts.dev"
     ```

### 4. Environment Variables

Create `.env.local` in `apps/web/`:

```env
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_CONVEX_URL=https://your-project.convex.cloud
```

**Note:** The Convex URL will be provided when you run `npx convex dev`. It looks like `https://xxxxx.convex.cloud`.

### 5. Run Development Servers

In separate terminals:

**Terminal 1 - Convex backend:**
```bash
npx convex dev
```

**Terminal 2 - Frontend:**
```bash
pnpm dev
```

The frontend will be available at `http://localhost:5173`

## Key Files

### Frontend Routes
- `/` - Landing page
- `/sign-in` - Sign in page
- `/sign-up` - Sign up page
- `/app/dashboard` - Main dashboard (protected)
- `/app/income` - Income transactions (protected)
- `/app/expenses` - Expense transactions (protected)
- `/app/reports` - Tax reports (protected)
- `/app/settings` - User settings (protected)

### Backend Schema
- `convex/schema.ts` - Database schema definitions
- `convex/queries.ts` - Read operations
- `convex/mutations.ts` - Write operations
- `convex/auth.ts` - Authentication helpers

### Shared Types
- `packages/shared/src/types.ts` - TypeScript types
- `packages/shared/src/schemas.ts` - Zod validation schemas

## Database Schema

### Users
- `clerkUserId` - Clerk user ID (unique)
- `email` - User email
- `fullName` - User's full name
- `createdAt`, `updatedAt` - Timestamps

### Profiles
- `userId` - Reference to users table
- `userType` - "freelancer" | "business" | "mixed"
- `businessName` - Optional business name
- `tin` - Optional Tax Identification Number
- `currency` - Default currency (defaults to NGN)

### Transactions
- `userId` - Reference to users table
- `type` - "income" | "expense"
- `amountKobo` - Amount in kobo (to avoid float issues)
- `currency` - Currency code
- `category` - Transaction category
- `description` - Optional description
- `transactionDate` - Unix timestamp in milliseconds
- `source` - "manual" | "bank_import"

### Documents
- `userId` - Reference to users table
- `kind` - "receipt" | "invoice" | "statement" | "report"
- `storageId` - Convex file storage ID
- `filename` - Original filename

## Deployment

### Frontend (Vercel)

1. Push your code to GitHub
2. Import project in Vercel
3. Set environment variables:
   - `VITE_CLERK_PUBLISHABLE_KEY`
   - `VITE_CONVEX_URL`
4. Deploy

### Backend (Convex Cloud)

The backend is automatically deployed when you run:
```bash
npx convex deploy
```

Or it auto-deploys when using `npx convex dev` in production mode.

## Development Commands

```bash
# Install dependencies
pnpm install

# Run frontend dev server
pnpm dev

# Run Convex dev server
pnpm convex:dev

# Build frontend
pnpm build

# Lint code
pnpm lint

# Format code
pnpm format

# Deploy Convex
pnpm convex:deploy
```

## Next Steps

1. **Complete Clerk Integration**: Ensure Clerk tokens are properly passed to Convex
2. **Add Bank Import**: Implement bank statement parsing
3. **Tax Calculator**: Build the tax calculation engine based on Nigerian tax laws
4. **Report Generation**: Implement PDF/CSV export for tax returns
5. **NRS Integration**: Connect to Nigeria Revenue Service payment portal
6. **Multi-currency**: Add currency conversion support
7. **Receipt Upload**: Implement file upload for receipts and invoices

## Notes

- All monetary amounts are stored in **kobo** (smallest NGN unit) to avoid floating-point precision issues
- The app uses Clerk for authentication and Convex handles the auth token validation
- Protected routes require authentication via Clerk
- The Convex backend automatically creates user records on first access

## Support

For issues or questions, please refer to:
- [Convex Documentation](https://docs.convex.dev)
- [Clerk Documentation](https://clerk.com/docs)
- [React Router Documentation](https://reactrouter.com)

