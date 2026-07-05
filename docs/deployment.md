# Deployment

This project is intended to deploy to Vercel from the GitHub repository.

## Required Environment Variables

Set these in Vercel Project Settings under Environment Variables for Production, Preview, and Development as needed:

- `SUPABASE_PROJECT_ID`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_URL`
- `VITE_SUPABASE_PROJECT_ID`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_URL`

Do not commit local `.env` files. Use `.env.example` as the committed template.

## Local Verification

Run the project verification before deploying:

```bash
npm test
```

The `test` script runs Vitest, ESLint, and the production build.

## Vercel

Use the Vercel dashboard or CLI to import `tayayayait/Earn-your-own-points` and deploy the default branch. The default build command should use the project `build` script:

```bash
npm run build
```
