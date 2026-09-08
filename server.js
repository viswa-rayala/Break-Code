const path = require('path');
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');

const app = express();
const port = process.env.PORT || 3000;
const database = new Database(path.join(__dirname, 'break-code.db'));

database.pragma('journal_mode = WAL');
database.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS password_resets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL COLLATE NOCASE,
        otp_hash TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        used INTEGER NOT NULL DEFAULT 0
    );
`);

app.use(express.json());
app.use(express.static(__dirname));

app.post('/api/signup', async (request, response) => {
    const { name, email, password } = request.body;
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

    if (!name?.trim() || !normalizedEmail || typeof password !== 'string' || password.length < 8) {
        return response.status(400).json({ message: 'Name, email, and a password of at least 8 characters are required.' });
    }

    const existingUser = database.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
    if (existingUser) {
        return response.status(409).json({ message: 'An account with that email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    database.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)').run(
        name.trim(),
        normalizedEmail,
        passwordHash
    );

    return response.status(201).json({ message: 'Account created successfully.' });
});

app.post('/api/login', async (request, response) => {
    const { email, password } = request.body;
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const user = database.prepare('SELECT id, name, email, password_hash FROM users WHERE email = ?').get(normalizedEmail);

    if (!user || typeof password !== 'string' || !(await bcrypt.compare(password, user.password_hash))) {
        return response.status(401).json({ message: 'Invalid email or password.' });
    }

    return response.json({
        message: 'Login successful.',
        user: { id: user.id, name: user.name, email: user.email }
    });
});

app.post('/api/forgot-password/request', (request, response) => {
    const email = typeof request.body.email === 'string' ? request.body.email.trim().toLowerCase() : '';
    const user = database.prepare('SELECT id FROM users WHERE email = ?').get(email);

    if (!user) {
        return response.status(404).json({ message: 'No account was found for that email.' });
    }

    const otp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = bcrypt.hashSync(otp, 10);
    database.prepare('UPDATE password_resets SET used = 1 WHERE email = ? AND used = 0').run(email);
    database.prepare('INSERT INTO password_resets (email, otp_hash, expires_at) VALUES (?, ?, ?)').run(
        email,
        otpHash,
        Date.now() + 10 * 60 * 1000
    );

    console.log(`[development] OTP for ${email}: ${otp}`);
    return response.json({ message: 'OTP generated. Check the server terminal in development.' });
});

app.post('/api/forgot-password/verify', async (request, response) => {
    const { email, otp } = request.body;
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const reset = database.prepare(
        'SELECT id, otp_hash FROM password_resets WHERE email = ? AND used = 0 AND expires_at > ? ORDER BY id DESC LIMIT 1'
    ).get(normalizedEmail, Date.now());

    if (!reset || typeof otp !== 'string' || !(await bcrypt.compare(otp, reset.otp_hash))) {
        return response.status(400).json({ message: 'Invalid or expired OTP.' });
    }

    return response.json({ message: 'OTP verified. Enter a new password.' });
});

app.post('/api/forgot-password/reset', async (request, response) => {
    const { email, otp, password } = request.body;
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const reset = database.prepare(
        'SELECT id, otp_hash FROM password_resets WHERE email = ? AND used = 0 AND expires_at > ? ORDER BY id DESC LIMIT 1'
    ).get(normalizedEmail, Date.now());

    if (!reset || typeof otp !== 'string' || !(await bcrypt.compare(otp, reset.otp_hash))) {
        return response.status(400).json({ message: 'Invalid or expired OTP.' });
    }

    if (typeof password !== 'string' || password.length < 8) {
        return response.status(400).json({ message: 'The new password must be at least 8 characters.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    database.prepare('UPDATE users SET password_hash = ? WHERE email = ?').run(passwordHash, normalizedEmail);
    database.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').run(reset.id);
    return response.json({ message: 'Password reset successfully. You can now log in.' });
});

app.listen(port, () => {
    console.log(`BreakCode is running at http://localhost:${port}`);
});