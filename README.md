# BreakCode

A student project built to practice full-stack web development with authentication, protected routes, and a dashboard UI.

## Live Demo

https://break-code.onrender.com

This project includes:

- Signup and login flow
- Password reset using OTP
- MongoDB-backed user storage
- Responsive learning dashboard
- Simple deployment-ready Node.js setup

## Project Goal

BreakCode is a learning platform-inspired app created for practicing authentication, backend APIs, database integration, and front-end UI design.

It is a beginner-to-intermediate project and can be updated and improved over time as skills grow.

## Tech Stack

- Node.js
- Express
- MongoDB Atlas
- bcryptjs
- HTML
- CSS
- JavaScript

## Features

- User registration
- User login
 - MongoDB-backed course catalog, enrollments, lesson progress, and practice history
 - Allowlisted admin workspace for course publishing and dashboard announcements
- Mobile responsive design

## Project Structure

- `server.js` — backend server and routes
- `login.html` — login page
- `signup.html` — signup page
- `forgot-password.html` — password recovery flow
- `dashboard.html` — user dashboard
    ADMIN_EMAILS=admin@example.com
- `dashboard.css` — dashboard styling
- `login.css` — authentication page styling
- `.env` — local environment variables
- `.env.example` — environment variable template

## Local Setup
 - `admin.html` — administrator content studio
 - `admin.js` / `admin.css` — admin workspace behavior and styling
1. Clone the project:

   ```bash
 - `GET /api/dashboard` → Loads the signed-in learner's catalog and progress
 - `POST /api/courses/:courseId/enroll` → Starts a course
 - `POST /api/courses/:courseId/progress` → Records the next completed lesson
 - `POST /api/practice` → Logs a practice session
 - `/api/admin/*` → Admin-only course, catalog, and announcement management
   cd Break-Code
   ```

 - `ADMIN_EMAILS` — comma-separated emails permitted to manage course content
   npm install
   ```

 - Admins manage course and dashboard content in `/admin.html`; application source code is not editable from the browser.

   ```env
   MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority
   MONGODB_DATABASE=breakcode
   PORT=3000
   ```

4. Start the server:

   ```bash
   npm start
   ```

5. Open the app:

   ```text
   http://localhost:3000
   ```

## Main Routes

- `GET /` → Redirects to login page
- `POST /api/signup` → Creates a new user
- `POST /api/login` → Authenticates a user
- `POST /api/forgot-password/request` → Sends OTP request
- `POST /api/forgot-password/verify` → Verifies OTP
- `POST /api/forgot-password/reset` → Resets password

## Deployment

This project is set up to run as a single Node app on Render.

### Required environment variables

# BreakCode

A student project for practicing full-stack web development with authentication, protected routes, and a learning dashboard.

## Live Demo

https://break-code.onrender.com

## Features

- Signup, login, and password reset using an email OTP
- MongoDB-backed accounts and course catalog
- Course enrollment, lesson progress, practice history, and activity heatmap
- Responsive learner dashboard
- Admin workspace for course publishing and dashboard announcements

## Tech Stack

- Node.js and Express
- MongoDB Atlas
- HTML, CSS, and JavaScript
- bcryptjs and JWT authentication

## Project Structure

- `server.js` — backend server, authentication, and API routes
- `login.html`, `signup.html`, `forgot-password.html` — account workflows
- `dashboard.html`, `dashboard.css` — learner dashboard
- `admin.html`, `admin.js`, `admin.css` — admin content studio
- `.env` — local environment variables
- `.env.example` — environment variable template

## Local Setup

1. Install dependencies:

  ```bash
  npm install
  ```

2. Create a `.env` file with your MongoDB connection and admin email:

  ```env
  MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority
  MONGODB_DATABASE=breakcode
  PORT=3000
  ADMIN_EMAILS=admin@example.com
  ```

  Replace `admin@example.com` with the email of an account you control. Separate multiple administrator emails with commas. Create that account through signup; the allowlist grants it admin access.

3. Start the server:

  ```bash
  npm start
  ```

4. Open `http://localhost:3000`, sign in, and visit the Admin item in the dashboard navigation. The admin workspace can add, edit, publish, and delete courses and update the learner-facing announcement. Application source code is intentionally not editable from the browser.

## Main Routes

- `GET /` — redirects to login
- `POST /api/signup`, `POST /api/login` — account creation and authentication
- `POST /api/forgot-password/*` — password recovery
- `GET /api/dashboard` — signed-in learner catalog and progress
- `POST /api/courses/:courseId/enroll` — start a course
- `POST /api/courses/:courseId/progress` — record the next completed lesson
- `POST /api/practice` — log a practice session
- `/api/admin/*` — allowlisted course and announcement management

## Deployment

The app is configured for a single Node service on Render.

- Build command: `npm install`
- Start command: `npm start`
- Required variables: `MONGODB_URI`, `MONGODB_DATABASE`, `ADMIN_EMAILS`

Keep secrets in environment variables. The real `.env` file is not committed.

## License

This project is for educational learning and personal development.
