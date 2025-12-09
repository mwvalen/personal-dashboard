# Personal Dashboard

A personal productivity dashboard that aggregates GitHub pull requests and Linear issues into a single view, highlighting items that need your attention.

## Features

- **GitHub Integration**: Monitor open PRs across repositories, with smart filtering for "actionable" PRs
- **Linear Integration**: View assigned issues with priority, status, and state
- **Today's Dash**: AI-powered daily planning that estimates effort and scopes your workday to ~8 hours
- **Smart Sections**: Separate views for actionable items, drafts, and items in review
- **Magic Link Auth**: Passwordless authentication via Supabase (optional)
- **Daily Digest**: Slack notifications with your daily status (optional)

---

## Quick Start: Local Development

The fastest way to get started. No Supabase or Vercel required.

### 1. Clone and Install

```bash
git clone <repo-url>
cd personal-dashboard
npm install
```

### 2. Get API Keys

**GitHub:**
1. Go to [GitHub Settings > Developer Settings > Personal Access Tokens](https://github.com/settings/tokens)
2. Click "Generate new token (classic)"
3. Select the `repo` scope
4. Copy the token

**Linear:**
1. Go to [Linear Settings > API](https://linear.app/settings/api)
2. Click "Create key"
3. Copy the key

### 3. Create Environment File

```bash
cp .env.example .env.local
```

Edit `.env.local` with your API keys:

```env
GITHUB_PAT=ghp_your-github-token
LINEAR_API_KEY=lin_api_your-linear-key

# Optional: Enable AI-powered effort estimation for Today's Dash
OPENAI_API_KEY=sk_your-openai-key
```

### 4. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) - the dashboard loads directly without login.

### 5. Configure Repositories

Edit `src/lib/github/client.ts` and update the `MONITORED_REPOS` array to watch your repositories.

---

## Today's Dash: AI-Powered Daily Planning

The "Today's Dash" feature helps you scope your workday by estimating effort for each task and selecting items that fit within ~8 hours.

### How It Works

1. Click "Generate Today's Dash" in the Needs Your Action section
2. The system sends your tasks (with descriptions, comments, and story points) to OpenAI
3. GPT-4o-mini estimates hours for each task (0.5, 1, 2, 4, or 8 hours)
4. Tasks are selected by priority until ~8 hours is filled
5. Hover over the hour badge to see the AI's reasoning

### Features

- **Persisted locally**: Your daily plan survives page refreshes (stored in localStorage)
- **Same-day refresh warning**: Confirmation prompt if regenerating on the same day
- **Rich context**: Uses Linear issue descriptions, comments, and story points for better estimates
- **Fallback estimates**: Works without OpenAI key using heuristic-based estimates

### Setup

Add your OpenAI API key to `.env.local`:

```env
OPENAI_API_KEY=sk_your-openai-key
```

Get your key from [platform.openai.com/api-keys](https://platform.openai.com/api-keys)

---

## Production Deployment with Supabase Auth

Add authentication so only you can access the dashboard.

### 1. Create Supabase Project

1. Create a project at [supabase.com](https://supabase.com)
2. Go to **Settings > API** and copy:
   - Project URL
   - anon/public key
3. Go to **Authentication > URL Configuration** and add:
   - `http://localhost:3000/auth/callback`
4. Ensure **Email** provider is enabled under **Authentication > Providers**

### 2. Update Environment Variables

Add Supabase variables to your `.env.local`:

```env
GITHUB_PAT=ghp_your-github-token
LINEAR_API_KEY=lin_api_your-linear-key

# Add these for auth
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) and import your repository
2. Add environment variables in project settings:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `GITHUB_PAT`
   - `LINEAR_API_KEY`
3. Deploy

### 4. Update Supabase Redirect URLs

Add your Vercel URL to Supabase:

1. Go to **Authentication > URL Configuration**
2. Add to "Redirect URLs":
   - `https://your-project.vercel.app/auth/callback`

---

## Optional: Daily Digest Slack Notifications

Get a daily summary of your PRs and Linear issues in Slack.

### 1. Create Slack Webhook

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Create a new app (or use existing)
3. Enable **Incoming Webhooks**
4. Create a webhook for your channel
5. Copy the webhook URL

### 2. Add Environment Variables

In Vercel project settings, add:

```
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T.../B.../...
CRON_SECRET=<generate with: openssl rand -hex 32>
```

### 3. Deploy

The cron job is configured in `vercel.json` to run daily at 8am ET. After deploying, you can:

- View cron status: Vercel Dashboard > Settings > Cron Jobs
- Manually trigger: Click "Run" on the cron job
- Check logs: Vercel Dashboard > Deployments > Functions

### Daily Digest Format

```
Daily Status Report
───────────────────
PRs Needing Action: 2
• #123: Fix bug — Changes Requested
• #456: Add feature — Review Ready
───────────────────
Linear Issues: 35 total
• In Progress: 14
• To Do: 21
───────────────────
[View Dashboard]
```

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |

---

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_PAT` | Yes | GitHub Personal Access Token with `repo` scope |
| `LINEAR_API_KEY` | Yes | Linear API key |
| `OPENAI_API_KEY` | For Today's Dash | OpenAI API key for effort estimation |
| `NEXT_PUBLIC_SUPABASE_URL` | For auth | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | For auth | Supabase anon key |
| `SLACK_WEBHOOK_URL` | For digest | Slack incoming webhook URL |
| `CRON_SECRET` | For digest | Secret to secure cron endpoint |
| `SUPABASE_SERVICE_KEY` | For digest | Supabase service role key |

---

## Dashboard Sections

The dashboard organizes your work into distinct sections:

### Needs Your Action
Items requiring immediate attention:
- PRs where you're the author and changes are requested
- PRs you need to review
- Linear issues assigned to you (In Progress or To Do)

**Today's Dash** appears at the top, showing AI-scoped items for your workday.

### Drafts
Draft PRs you're working on.

### In Review
Linear issues currently in review state - visible but not requiring immediate action.

### All Open Pull Requests
Complete list of open PRs across monitored repositories.
