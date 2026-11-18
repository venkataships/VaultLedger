# VaultLedger — Private Single-Owner Personal Finance UI

A manual, zero-bank-link personal finance web UI designed for **GitHub Pages** static hosting with **Supabase Postgres + Tight Single-Owner RLS + TOTP 2FA (`aal2`)**.

## Tracked Pillars
- **401(k) & Retirement**: Traditional/Roth 401(k), Roth/Traditional IRA, HSA, contribution & employer match tracking
- **Banks & Cash**: Checking, HYSA, CDs, Emergency Cash Runway (months of expenses covered)
- **Investments & Other Assets**: Brokerage, Treasuries/I-Bonds, RSUs, Real Estate equity
- **Credit Cards**: Revolving balances, per-card & aggregate Credit Utilization %, APR, due days
- **Active Loans**: Mortgage, Auto, Student, Personal, HELOC — Principal Paid Off %, APR, monthly debt service, and amortization payoff date + remaining interest calculator
- **Net Worth Trajectory**: Batch check-in drawer + per-account snapshot backfill with carry-forward historical charts
- **Monthly Expenses & Recurring Bills**: Monthly budget cap, net take-home savings rate %, 6-month Needs vs. Wants bar chart, 1-click recurring bill posting, CSV & JSON backup exports

## Security Architecture (Safe for Public GitHub Pages Hosting)
1. **Database-Level Single-Owner Lock (`private.vault_owner` + `auth.users` triggers)**:
   - Anonymous sessions (`is_anonymous = true`) are rejected by `BEFORE INSERT ON auth.users`.
   - The very first non-anonymous user who registers permanently claims `private.vault_owner`. Any second registration attempt is rejected directly by Postgres (`trg_enforce_single_owner_before`).
2. **Forced Row Level Security (`FORCE ROW LEVEL SECURITY`)**:
   - `anon` has zero table privileges (`REVOKE ALL`).
   - Every `SELECT`, `INSERT`, `UPDATE`, and `DELETE` policy requires `(select auth.uid()) = user_id AND (select private.can_access_vault())`.
3. **Database-Enforced TOTP 2FA (`aal2`)**:
   - Enroll any Authenticator app (1Password, Apple Passwords, Google Authenticator, Authy) inside **Security & 2FA**.
   - Once verified, `private.can_access_vault()` inspects `auth.mfa_factors` and blocks `aal1` (password-only) JWTs at the Postgres RLS layer until TOTP (`aal2`) is verified.

## Local Development

```bash
npm install
npm run dev
```

## Deploying to GitHub Pages

A ready-to-run GitHub Actions workflow is included at `.github/workflows/deploy.yml`:

1. Create a GitHub repository and push this folder:
   ```bash
   git init
   git add .
   git commit -m "Initial VaultLedger personal finance UI"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo>.git
   git push -u origin main
   ```
2. In your GitHub repo, go to **Settings → Secrets and variables → Actions → Variables** and add:
   - `VITE_SUPABASE_URL`: `https://ucrbocknokusjjayrgpf.supabase.co`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`: your `sb_publishable_...` key from `.env`
3. Go to **Settings → Pages** and set **Source** to **GitHub Actions**.
4. In your [Supabase Auth URL Configuration](https://supabase.com/dashboard/project/ucrbocknokusjjayrgpf/auth/url-configuration), set **Site URL** (and Redirect URLs) to `https://<your-username>.github.io/<your-repo>/`.
