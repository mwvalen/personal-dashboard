# Personal Dashboard

A personal productivity dashboard that aggregates GitHub pull requests and Linear issues into a single view, highlighting items that need your attention.

## Features

- **GitHub Integration**: Monitor open PRs across repositories, with smart filtering for "actionable" PRs (ones needing your review or attention)
- **Linear Integration**: View assigned issues with priority and status
- **Magic Link Auth**: Passwordless authentication via Supabase

## Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) account
- A [GitHub](https://github.com) account
- A [Linear](https://linear.app) account

## Setup

### 1. Clone and Install

```bash
git clone <repo-url>
cd personal-dashboard
npm install
```

### 2. Supabase Setup

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to **Settings > API** and copy:
   - Project URL
   - anon/public key
3. Go to **Authentication > URL Configuration** and add to "Redirect URLs":
   - `http://localhost:3000/auth/callback`
4. Ensure **Email** provider is enabled under **Authentication > Providers**

### 3. GitHub Setup

1. Go to [GitHub Settings > Developer Settings > Personal Access Tokens > Tokens (classic)](https://github.com/settings/tokens)
2. Click "Generate new token (classic)"
3. Select the `repo` scope (needed to read PR data from private repos)
4. Copy the generated token

### 4. Linear Setup

1. Go to [Linear Settings > Account > API](https://linear.app/settings/api)
2. Click "Create key"
3. Copy the generated API key

### 5. Environment Variables

Create a `.env.local` file in the project root:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
GITHUB_PAT=ghp_your-github-token
LINEAR_API_KEY=lin_api_your-linear-key
```

## Running Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Configuration

### Monitored Repositories

To change which GitHub repositories are monitored, edit `src/lib/github/client.ts` and update the `MONITORED_REPOS` array.

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## Deploying to Vercel

### 1. Connect Repository

1. Go to [vercel.com](https://vercel.com) and sign in
2. Click "Add New Project"
3. Import your GitHub repository

### 2. Configure Environment Variables

In the Vercel project settings, add the following environment variables:

- `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Your Supabase anon key
- `GITHUB_PAT` - Your GitHub personal access token
- `LINEAR_API_KEY` - Your Linear API key

### 3. Update Supabase Redirect URLs

Add your Vercel deployment URL to Supabase:

1. Go to **Authentication > URL Configuration** in your Supabase dashboard
2. Add to "Redirect URLs":
   - `https://your-project.vercel.app/auth/callback`
   - If using a custom domain: `https://your-domain.com/auth/callback`

### 4. Deploy

Vercel will automatically deploy on every push to main. You can also trigger manual deploys from the Vercel dashboard.
