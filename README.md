# BreakCode

BreakCode is a full-stack learning platform built with Node.js, Express, Supabase (PostgreSQL), and static front-end pages. It includes authentication, course catalog management, learner progress tracking, a practice streak dashboard, and an allowlisted admin panel for content updates.

## Live demo

https://break-code.onrender.com

## What this app includes

- Sign up and login flow with password hashing
- Password reset with OTP and email delivery via Resend
- Supabase (PostgreSQL)-backed user, course, enrollment, and practice tracking
- Learner dashboard with course cards, progress state, announcements, and activity heatmap
- Admin content studio for creating, editing, publishing, and deleting courses
- Admin dashboard announcement editor for learner-facing updates
- Responsive HTML/CSS/JS interface for desktop and mobile layouts

## Tech stack

- **Runtime & Server**: Node.js, Express
- **Database**: Supabase (PostgreSQL) with Row-Level Security (RLS)
- **Auth & Tokens**: JWT (`jsonwebtoken`), bcrypt password hashing (`bcryptjs`)
- **Validation**: Zod schema validation
- **Email Delivery**: Resend API
- **Frontend**: Vanilla HTML5, CSS3, JavaScript (no framework overhead)
- **Deployment**: Render Web Service

## Project structure

- `server.js` — Express API server, Supabase connection handling, auth, routes
- `supabase-schema.sql` — PostgreSQL schema, indexes, RLS policies, and seed data for Supabase
- `dashboard.html` — Learner dashboard UI
- `dashboard.css` — Learner dashboard styling
- `admin.html` — Admin course and content management panel
- `admin.js` — Admin panel client-side logic
- `admin.css` — Admin panel styling
- `login.html`, `signup.html`, `forgot-password.html` — Authentication pages
- `logo.svg`, `favicon.svg` — Branding assets
- `.env.example` — Reference environment variable template
- `render.yaml` — Render deployment blueprint

---

## Supabase Database Setup

### 1. Create a Supabase Project

1. Visit [supabase.com](https://supabase.com) and create or open your project.
2. In the Supabase Dashboard, navigate to **Project Settings** -> **API**.
3. Copy your **Project URL** (`https://<project-ref>.supabase.co`) and your **service_role secret key** (under Project API keys).

### 2. Apply Database Schema

1. In your Supabase Dashboard, open the **SQL Editor** (`/project/<project-ref>/editor`).
2. Open the file [`supabase-schema.sql`](supabase-schema.sql) from this project.
3. Copy its entire content, paste it into the SQL Editor, and click **Run**.
4. This creates:
   - `public.users` (accounts and password hashes)
   - `public.courses` (learning catalog, pre-seeded with default courses)
   - `public.enrollments` (student course tracking)
   - `public.practice_sessions` (daily practice logs)
   - `public.site_content` (announcements)
   - `public.password_resets` (OTP tokens)
   - Indexes and Row Level Security policies

### 3. Add Supabase Credentials to `.env`

In your `.env` file, add:

```env
SUPABASE_URL=https://<your-project-id>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

---

## Local Development

1. Install dependencies:

   ```bash
   npm install
   ```

2. Configure `.env`:

   ```env
   # Supabase Configuration
   SUPABASE_URL=https://<your-project-id>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

   # Server & Auth Configuration
   PORT=3000
   JWT_SECRET=replace-with-a-long-random-secret

   # Resend Email Configuration
   RESEND_API_KEY=your_resend_api_key
   EMAIL_FROM=BreakCode <onboarding@resend.dev>

   # Administrator Access (Comma-separated emails)
   ADMIN_EMAILS=you@example.com
   ```

3. Start the application:

   ```bash
   npm start
   ```

4. Open the app in your browser:

   ```text
   http://localhost:3000
   ```

---

## API Overview

### Auth Routes
- `GET /` — Redirects to login page
- `POST /api/signup` — Create a new learner account
- `POST /api/login` — Authenticate user and issue JWT token
- `GET /api/me` — Return signed-in user profile and admin status
- `POST /api/forgot-password/request` — Send 6-digit OTP to user email
- `POST /api/forgot-password/verify` — Validate reset OTP
- `POST /api/forgot-password/reset` — Set new password with verified OTP

### Learner Routes
- `GET /api/dashboard` — Fetch courses, enrollment progress, practice stats, streak, and announcement
- `POST /api/courses/:courseId/enroll` — Enroll user in a course
- `POST /api/courses/:courseId/progress` — Record a completed lesson
- `POST /api/practice` — Log daily practice minutes

### Admin Routes
- `GET /api/admin/overview` — Course, learner, and enrollment metrics
- `GET /api/admin/courses` — List all courses for management
- `POST /api/admin/courses` — Create new course
- `PUT /api/admin/courses/:courseId` — Update course details
- `DELETE /api/admin/courses/:courseId` — Delete a course
- `GET /api/admin/content` — Get current announcement text
- `PUT /api/admin/announcement` — Update announcement banner

---

## Deployment on Render

1. Commit your changes and push to GitHub.
2. Link your repository in Render as a Web Service.
3. Configure the following environment variables in the Render Dashboard:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `JWT_SECRET`
   - `RESEND_API_KEY`
   - `EMAIL_FROM`
   - `ADMIN_EMAILS`
4. The service will build with `npm install` and run with `npm start`.

---

## License

This project is intended for educational and personal development use.
