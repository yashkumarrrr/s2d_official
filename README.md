# Step2Dev — ARIA AI Senior DevOps Engineer

A complete, production-ready Next.js 14 SaaS app with ARIA — an AI that acts as a 40-year Senior DevOps Engineer.

## Stack
- **Framework**: Next.js 14.2.3, App Router, TypeScript strict
- **Database**: PostgreSQL via Neon (free tier), Prisma 5.x
- **Auth**: Passwordless — name + email only, JWT cookie
- **AI**: Groq SDK, llama3-70b-8192 (free tier)
- **Styling**: Pure CSS variables — no Tailwind, no CSS modules

---

## 5-Minute Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Set up environment
```bash
cp .env.local.example .env.local
```

Edit `.env.local` and fill in:

| Variable | Where to get it |
|----------|----------------|
| `DATABASE_URL` | [console.neon.tech](https://console.neon.tech) → New project → Connection string |
| `JWT_SECRET` | Run: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `GROQ_API_KEY` | [console.groq.com](https://console.groq.com) → API Keys → Create key (free) |

**Important for Neon**: Use the direct connection URL, NOT the pooler URL.
- ✅ `ep-silent-moon-123456.us-east-2.neon.tech`
- ❌ `ep-silent-moon-123456-pooler.us-east-2.neon.tech`

### 3. Push database schema
```bash
npx prisma db push
```

### 4. Start the dev server
```bash
npm run dev
```

### 5. Open the app
```
http://localhost:3000
```

You'll be redirected to `/auth/register`. Create an account, then land on ARIA at `/dashboard/aria`.

---

## ARIA Features

### 💬 Chat Mode
- Persistent conversations saved to PostgreSQL
- **Short-term memory**: Last 20 messages loaded as context
- **Long-term memory**: 4 weeks of auto-generated conversation summaries
- Auto-summarizes every 10 messages
- Quick-start suggestion prompts
- `Enter` to send, `Shift+Enter` for new line
- Real-time SSE streaming

### 🔴 Error Analyzer
- Paste any error, stack trace, or log output
- Auto-detects error type: Node.js, Python, Docker, Nginx, OOM, SSL/TLS, Permissions, PostgreSQL, Redis, Kubernetes, CI/CD, Go, Java, MySQL, Network
- Optional server context injection
- Structured response format: What Happened → Root Cause → Fix Now (copy-paste commands) → Verify → Prevent Forever
- Past error pattern memory

### 🖥️ Server Analyzer
- Select any server from your DB
- Live metric cards: CPU%, RAM%, Disk%, Status, OS
- Full health diagnosis with priority-ordered issues
- Ask specific questions or run full health check
- References past server conversations from memory

### 📦 Repo Analyzer
- Paste any public GitHub repo URL
- Fetches: `package.json`, `Dockerfile`, `docker-compose.yml`, `nginx.conf`, `.github/workflows/*`, `requirements.txt`, `go.mod`, `Makefile`, and more
- Grades A–F: 🔒 Security | ⚡ Performance | 🚀 CI/CD | 📦 Dependencies | 🐳 Containerization | 📋 Best Practices
- Identifies top critical issues with exact fix commands
- Progress bar while scanning

---

## File Structure

```
step2dev/
├── app/
│   ├── layout.tsx                         Root layout (Inter + JetBrains Mono fonts)
│   ├── page.tsx                           Root → redirect to dashboard or login
│   ├── globals.css                        All styles — zero inline CSS
│   ├── auth/
│   │   ├── login/page.tsx                 Passwordless login
│   │   └── register/page.tsx             Register
│   ├── dashboard/
│   │   ├── layout.tsx                     Auth guard (server component)
│   │   ├── page.tsx                       Redirect to /dashboard/aria
│   │   └── aria/
│   │       ├── page.tsx                   Main ARIA page (all 4 modes)
│   │       ├── loading.tsx               Skeleton loader
│   │       └── error.tsx                 Error boundary
│   └── api/
│       ├── auth/
│       │   ├── register/route.ts          POST — create account + set JWT cookie
│       │   ├── login/route.ts             POST — login + set JWT cookie
│       │   ├── logout/route.ts            POST — clear cookie + delete sessions
│       │   └── me/route.ts                GET — return current user
│       ├── servers/route.ts               GET list / POST create
│       └── aria/
│           ├── chat/route.ts              POST — streaming chat with memory
│           ├── analyze-error/route.ts     POST — error analysis stream
│           ├── analyze-server/route.ts    POST — server diagnosis stream
│           ├── analyze-repo/route.ts      POST — GitHub repo scan stream
│           └── conversations/
│               ├── route.ts               GET — list all conversations
│               └── [id]/route.ts          GET one / DELETE
├── components/aria/
│   ├── ConversationSidebar.tsx            History sidebar with groups + delete
│   ├── MessageRenderer.tsx               Full markdown renderer
│   └── TypingDots.tsx                    Bouncing dots animation
├── lib/
│   ├── auth.ts                            JWT, cookies, getCurrentUser, requireAuth
│   ├── prisma.ts                          Singleton Prisma client
│   ├── env.ts                             Safe env loader (never throws)
│   └── aria-constants.ts                 ARIA persona, error detector, memory helpers
├── middleware.ts                          JWT guard — /dashboard/* only, never /api/*
├── prisma/schema.prisma                   Complete DB schema
├── next.config.js
├── tsconfig.json
├── .env.local.example
└── .gitignore
```

---

## Database Schema

```
User
├── Session[]            — JWT sessions
├── Server[]             — servers to monitor
└── AriaConversation[]
    └── AriaMessage[]    — full message history
```

---

## Deploying to Production

### Vercel (recommended)
```bash
npm install -g vercel
vercel
```

Add environment variables in Vercel dashboard → Settings → Environment Variables.

### Self-hosted (Docker)
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm ci
RUN npx prisma generate
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

---

## Adding Servers

After signing in, go to `/dashboard/aria`, switch to **Server Analyzer**, and you'll see a dropdown. Add servers via the API:

```bash
curl -X POST http://localhost:3000/api/servers \
  -H "Content-Type: application/json" \
  -H "Cookie: step2dev_auth=YOUR_JWT" \
  -d '{"name":"prod-web-01","host":"10.0.0.1","port":22,"username":"ubuntu"}'
```

---

## Groq Free Tier Limits

As of mid-2025:
- **llama3-70b-8192**: 6,000 tokens/min, 500,000 tokens/day
- No credit card required
- Generous enough for dozens of active users

If you hit limits, swap `GROQ_MODEL` in `lib/aria-constants.ts` to `mixtral-8x7b-32768` or `gemma-7b-it`.

---

## GitHub Token (Optional)

Without a token, the GitHub API allows 60 requests/hour per IP. For production with many users analyzing repos:

1. Go to [github.com/settings/tokens](https://github.com/settings/tokens)
2. Generate new token (classic)
3. Select `public_repo` scope
4. Add to `.env.local`: `GITHUB_TOKEN=ghp_xxx`

This raises the limit to 5,000 requests/hour.

---

## The 15 Production Laws (all enforced)

1. ✅ Zero `<style>{...}</style>` in any .tsx file
2. ✅ `secure: process.env.NODE_ENV === 'production'` in cookie
3. ✅ Middleware matcher: `/dashboard/:path*` only — never `/api/*`
4. ✅ Identical JWT secret logic in auth.ts and middleware.ts
5. ✅ Session token = `randomBytes(32).toString('hex')` — never 'pending'
6. ✅ 200ms delay before redirect after login/register
7. ✅ Dashboard calls `getCurrentUser()` — no hardcoded demo users
8. ✅ Neon direct URL (no `-pooler`)
9. ✅ Crypto never throws — graceful fallback
10. ✅ No bcrypt, no passwords — passwordless only
11. ✅ `suppressHydrationWarning` on `<html>` and `<body>`
12. ✅ `serverExternalPackages` at top level of next.config.js
13. ✅ `lib/env.ts` uses `console.warn` only, never throws
14. ✅ All Prisma relations are bidirectional
15. ✅ All `loading.tsx` files use `className="skeleton"` only
