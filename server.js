const crypto = require('crypto');
const path = require('path');
const express = require('express');
const bcrypt = require('bcryptjs');
const { MongoClient } = require('mongodb');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;
const mongoUri = process.env.MONGODB_URI;
const databaseName = process.env.MONGODB_DATABASE || 'breakcode';
const mongoClient = mongoUri ? new MongoClient(mongoUri, {
    serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 10000)
}) : null;
let users;
let passwordResets;

app.use(express.json());
app.get('/', (request, response) => response.redirect('/login.html'));
app.use(express.static(__dirname));

app.post('/api/signup', async (request, response) => {
    const { name, email, password } = request.body;
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

    if (!name?.trim() || !normalizedEmail || typeof password !== 'string' || password.length < 8) {
        return response.status(400).json({ message: 'Name, email, and a password of at least 8 characters are required.' });
    }

    const existingUser = await users.findOne({ email: normalizedEmail });
    if (existingUser) {
        return response.status(409).json({ message: 'An account with that email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await users.insertOne({
        name: name.trim(),
        email: normalizedEmail,
        passwordHash,
        createdAt: new Date()
    });

    return response.status(201).json({ message: 'Account created successfully.' });
});

app.post('/api/login', async (request, response) => {
    const { email, password } = request.body;
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const user = await users.findOne({ email: normalizedEmail });

    if (!user || typeof password !== 'string' || !(await bcrypt.compare(password, user.passwordHash))) {
        return response.status(401).json({ message: 'Invalid email or password.' });
    }

    return response.json({
        message: 'Login successful.',
        user: { id: user._id.toString(), name: user.name, email: user.email }
    });
});

app.post('/api/forgot-password/request', async (request, response) => {
    const email = typeof request.body.email === 'string' ? request.body.email.trim().toLowerCase() : '';
    const user = await users.findOne({ email });

    if (!user) {
        return response.status(404).json({ message: 'No account was found for that email.' });
    }

    const otp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = bcrypt.hashSync(otp, 10);
    await passwordResets.updateMany({ email, used: false }, { $set: { used: true } });
    await passwordResets.insertOne({
        email,
        otpHash,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        createdAt: new Date(),
        used: false
    });

    console.log(`[development] OTP for ${email}: ${otp}`);
    return response.json({ message: 'OTP generated. Check the server terminal in development.' });
});

app.post('/api/forgot-password/verify', async (request, response) => {
    const { email, otp } = request.body;
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const reset = await passwordResets.findOne(
        { email: normalizedEmail, used: false, expiresAt: { $gt: new Date() } },
        { sort: { createdAt: -1 } }
    );

    if (!reset || typeof otp !== 'string' || !(await bcrypt.compare(otp, reset.otpHash))) {
        return response.status(400).json({ message: 'Invalid or expired OTP.' });
    }

    return response.json({ message: 'OTP verified. Enter a new password.' });
});

app.post('/api/forgot-password/reset', async (request, response) => {
    const { email, otp, password } = request.body;
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const reset = await passwordResets.findOne(
        { email: normalizedEmail, used: false, expiresAt: { $gt: new Date() } },
        { sort: { createdAt: -1 } }
    );

    if (!reset || typeof otp !== 'string' || !(await bcrypt.compare(otp, reset.otpHash))) {
        return response.status(400).json({ message: 'Invalid or expired OTP.' });
    }

    if (typeof password !== 'string' || password.length < 8) {
        return response.status(400).json({ message: 'The new password must be at least 8 characters.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await users.updateOne({ email: normalizedEmail }, { $set: { passwordHash } });
    await passwordResets.updateOne({ _id: reset._id }, { $set: { used: true } });
    return response.json({ message: 'Password reset successfully. You can now log in.' });
});

async function startServer() {
    if (!mongoClient) {
        throw new Error('MONGODB_URI is missing. Add your MongoDB Atlas connection string to .env.');
    }

    try {
        await mongoClient.connect();
    } catch (error) {
        const message = error?.message || '';
        if (error?.name === 'MongoServerSelectionError' && /SSL|TLS|ENOTFOUND|ECONNREFUSED/i.test(message)) {
            throw new Error(
                'Could not reach MongoDB Atlas. Verify the cluster hostname, add this machine\'s public IP to Atlas Network Access, and check that the current network allows outbound TCP 27017. Original error: ' + message
            );
        }
        throw error;
    }
    const database = mongoClient.db(databaseName);
    users = database.collection('users');
    passwordResets = database.collection('passwordResets');
    await users.createIndex({ email: 1 }, { unique: true });
    await passwordResets.createIndex({ email: 1, used: 1, expiresAt: 1 });

    app.listen(port, () => {
        console.log(`BreakCode is running at http://localhost:${port}`);
        console.log(`Connected to MongoDB Atlas database: ${databaseName}`);
    });
}

startServer().catch((error) => {
    console.error(`Unable to start BreakCode: ${error.message}`);
    process.exit(1);
});