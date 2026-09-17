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
- Forgot password request flow
- OTP verification
- Password reset success redirect to login
- Learning dashboard with course sections and profile panel
- Mobile responsive design

## Project Structure

- `server.js` — backend server and routes
- `login.html` — login page
- `signup.html` — signup page
- `forgot-password.html` — password recovery flow
- `dashboard.html` — user dashboard
- `dashboard.css` — dashboard styling
- `login.css` — authentication page styling
- `.env` — local environment variables
- `.env.example` — environment variable template

## Local Setup

1. Clone the project:

   ```bash
   git clone <your-repo-url>
   cd Break-Code
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a `.env` file with your MongoDB details:

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

- `MONGODB_URI`
- `MONGODB_DATABASE=breakcode`
- `PORT=3000`

### Build command

```bash
npm install
```

### Start command

```bash
npm start
```

## Important Notes

- The real `.env` file is not committed to Git.
- Use environment variables for secrets in deployment.
- This project is meant to be updated and improved over time as part of a student learning journey.

## License

This project is for educational learning and personal development.
