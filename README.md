# BreakCode

BreakCode is a full-stack learning platform built with Node.js, Express, MongoDB, and static front-end pages. It includes authentication, course catalog management, learner progress tracking, a practice streak dashboard, and an allowlisted admin panel for content updates.

## Live demo

https://break-code.onrender.com

## What this app includes

- Sign up and login flow with password hashing
- Password reset with OTP and email delivery via Resend
- MongoDB-backed user, course, enrollment, and practice tracking
- Learner dashboard with course cards, progress state, announcements, and activity heatmap
- Admin content studio for creating, editing, publishing, and deleting courses
- Admin dashboard announcement editor for learner-facing updates
- Responsive HTML/CSS/JS interface for desktop and mobile layouts

## Tech stack

- Node.js
- Express
- MongoDB Atlas
- JWT authentication
- bcryptjs
- Zod validation
- Resend for email delivery
- HTML, CSS, and JavaScript

## Project structure

- `server.js` — backend server, database setup, auth, and API routes
- `dashboard.html` — learner dashboard UI
- `dashboard.css` — learner dashboard styling
- `admin.html` — admin page
- `admin.js` — admin client-side logic
- `admin.css` — admin styling
- `login.html`, `signup.html`, `forgot-password.html` — auth pages
- `logo.svg`, `favicon.svg` — branding assets
- `.env.example` — reference for required environment variables
- `render.yaml` — Render deployment configuration

## Features in detail

### Learner experience

- Browse published courses by category and search terms
- Enroll in any available course
- Track lessons completed and learning progress
- Log practice sessions and view streak data
- Receive dashboard announcements from admins
- Access a profile panel with activity tracking information

### Admin experience

- Admin access is controlled by `ADMIN_EMAILS`
- Admins can view overall metrics for courses, learners, and enrollments
- Admins can add new courses with title, description, category, level, lesson count, and publication state
- Admins can edit or delete existing courses
- Admins can publish or hide course content from the learner catalog
- Admins can update the dashboard banner shown to all learners

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a `.env` file in the project root with your environment variables:

   ```env
   MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority
   MONGODB_DATABASE=breakcode
   PORT=3000
   JWT_SECRET=replace-with-a-long-random-secret
   RESEND_API_KEY=your_resend_api_key
   EMAIL_FROM=BreakCode <onboarding@resend.dev>
   ADMIN_EMAILS=you@example.com
   ```

   Notes:
   - `ADMIN_EMAILS` is a comma-separated list of allowed admin emails.
   - Only users who sign up with one of these emails can access admin routes.
   - If `ADMIN_EMAILS` is empty, admin APIs remain disabled.

3. Start the application:

   ```bash
   npm start
   ```

4. Open the app in a browser:

   ```text
   http://localhost:3000
   ```

5. Sign up a user account, then sign in with one of the emails listed in `ADMIN_EMAILS` to open the admin page from the dashboard navigation.

## API overview

### Auth routes

- `GET /` — redirects to the login page
- `POST /api/signup` — create a new account
- `POST /api/login` — authenticate a user and return a JWT
- `POST /api/forgot-password/request` — send a one-time password reset code
- `POST /api/forgot-password/verify` — validate the OTP
- `POST /api/forgot-password/reset` — reset a password using the OTP
- `GET /api/me` — return the current authenticated user and admin state

### Learner routes

- `GET /api/dashboard` — load the signed-in user's dashboard data
- `POST /api/courses/:courseId/enroll` — enroll the user in a published course
- `POST /api/courses/:courseId/progress` — record a completed lesson
- `POST /api/practice` — save daily practice minutes

### Admin routes

- `GET /api/admin/overview` — fetch course, learner, and enrollment totals
- `GET /api/admin/courses` — fetch all courses for the admin panel
- `GET /api/admin/content` — fetch the current announcement text
- `POST /api/admin/courses` — create a new course
- `PUT /api/admin/courses/:courseId` — update a course
- `DELETE /api/admin/courses/:courseId` — delete a course
- `PUT /api/admin/announcement` — save the dashboard announcement

## Deployment

This project is designed to run as a single Node application on Render.

### Recommended deployment model

- Keep the frontend and backend together in one web service.
- Use one Render web service with `npm install` as the build command and `npm start` as the start command.
- Set the environment variables in the Render dashboard, including `MONGODB_URI`, `MONGODB_DATABASE`, `JWT_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, and `ADMIN_EMAILS`.

### Render note

- The free Render web tier sleeps after inactivity.
- That means first requests can take longer after a pause, but this is still the simplest deployment option for this project.
- If you split frontend and backend across Vercel and Render, it adds more moving parts without a strong benefit for the current architecture.

### Example Render setup

The repository already includes a `render.yaml` file for a free web service:

```yaml
services:
  - type: web
    name: break-code
    runtime: node
    region: oregon
    plan: free
    buildCommand: npm install
    startCommand: npm start
```

## Important notes

- The app connects to MongoDB Atlas using `MONGODB_URI`.
- `JWT_SECRET` should be set to a strong secret in production.
- Resend is used for password reset emails, so `RESEND_API_KEY` and `EMAIL_FROM` must be configured to use the forgot-password flow.
- Admin access is not automatic — the correct email must be present in `ADMIN_EMAILS`.
- The app seeds a default catalog when the `courses` collection is empty.

## License

This project is intended for educational and personal development use.
