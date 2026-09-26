const crypto = require('crypto');
const path = require('path');
const express = require('express');
const bcrypt = require('bcryptjs');
const { MongoClient } = require('mongodb');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;
const mongoUri = process.env.MONGODB_URI;
const databaseName = process.env.MONGODB_DATABASE || 'breakcode';
const jwtSecret = process.env.JWT_SECRET || 'fallback_secret_for_development_only';

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.ethereal.email',
    port: process.env.SMTP_PORT || 587,
    auth: {
        user: process.env.SMTP_USER || 'ethereal_user',
        pass: process.env.SMTP_PASS || 'ethereal_pass'
    }
});
const mongoClient = mongoUri ? new MongoClient(mongoUri, {
    serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 10000)
}) : null;
let users;
let passwordResets;

app.use(express.json());
app.get('/', (request, response) => response.redirect('/login.html'));
app.use(express.static(__dirname));

// Validation Schemas
const signupSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters long')
});

const loginSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required')
});

const forgotPasswordRequestSchema = z.object({
    email: z.string().email('Invalid email address')
});

const forgotPasswordVerifySchema = z.object({
    email: z.string().email('Invalid email address'),
    otp: z.string().min(1, 'OTP is required')
});

const forgotPasswordResetSchema = z.object({
    email: z.string().email('Invalid email address'),
    otp: z.string().min(1, 'OTP is required'),
    password: z.string().min(8, 'Password must be at least 8 characters long')
});

// Middleware to verify JWT
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Authentication required' });

    jwt.verify(token, jwtSecret, (err, user) => {
        if (err) return res.status(403).json({ message: 'Invalid or expired token' });
        req.user = user;
        next();
    });
};

app.post('/api/signup', async (request, response) => {
    try {
        const validatedData = signupSchema.parse(request.body);
        const { name, email, password } = validatedData;
        const normalizedEmail = email.toLowerCase();

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
    } catch (error) {
        if (error instanceof z.ZodError) {
            return response.status(400).json({ message: error.errors[0].message });
        }
        console.error(error);
        return response.status(500).json({ message: 'Internal server error.' });
    }
});

app.post('/api/login', async (request, response) => {
    try {
        const validatedData = loginSchema.parse(request.body);
        const { email, password } = validatedData;
        const normalizedEmail = email.toLowerCase();
        const user = await users.findOne({ email: normalizedEmail });

        if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
            return response.status(401).json({ message: 'Invalid email or password.' });
        }

        const token = jwt.sign({ id: user._id.toString(), email: user.email }, jwtSecret, { expiresIn: '24h' });

        return response.json({
            message: 'Login successful.',
            token,
            user: { id: user._id.toString(), name: user.name, email: user.email }
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return response.status(400).json({ message: error.errors[0].message });
        }
        console.error(error);
        return response.status(500).json({ message: 'Internal server error.' });
    }
});

app.get('/api/me', authenticateToken, async (request, response) => {
    try {
        const user = await users.findOne({ email: request.user.email });
        if (!user) return response.status(404).json({ message: 'User not found' });
        return response.json({ user: { id: user._id.toString(), name: user.name, email: user.email } });
    } catch (error) {
        console.error(error);
        return response.status(500).json({ message: 'Internal server error.' });
    }
});

app.post('/api/forgot-password/request', async (request, response) => {
    try {
        const { email } = forgotPasswordRequestSchema.parse(request.body);
        const normalizedEmail = email.toLowerCase();
        const user = await users.findOne({ email: normalizedEmail });

        if (!user) {
            return response.status(404).json({ message: 'No account was found for that email.' });
        }

        const otp = crypto.randomInt(100000, 1000000).toString();
        const otpHash = bcrypt.hashSync(otp, 10);
        await passwordResets.updateMany({ email: normalizedEmail, used: false }, { $set: { used: true } });
        await passwordResets.insertOne({
            email: normalizedEmail,
            otpHash,
            expiresAt: new Date(Date.now() + 10 * 60 * 1000),
            createdAt: new Date(),
            used: false
        });

        const mailOptions = {
            from: process.env.EMAIL_FROM || '"BreakCode Support" <noreply@breakcode.com>',
            to: normalizedEmail,
            subject: 'Your Password Reset OTP',
            text: `Your OTP for password reset is: ${otp}. It is valid for 10 minutes.`,
            html: `<p>Your OTP for password reset is: <b>${otp}</b></p><p>It is valid for 10 minutes.</p>`
        };

        try {
            await transporter.sendMail(mailOptions);
        } catch (emailError) {
            console.error('Failed to send OTP email:', emailError);
            return response.status(500).json({ message: 'Failed to send OTP email. Please try again later.' });
        }

        console.log(`[development] OTP for ${normalizedEmail}: ${otp}`);
        return response.json({ message: 'OTP sent to your email.' });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return response.status(400).json({ message: error.errors[0].message });
        }
        console.error(error);
        return response.status(500).json({ message: 'Internal server error.' });
    }
});

app.post('/api/forgot-password/verify', async (request, response) => {
    try {
        const { email, otp } = forgotPasswordVerifySchema.parse(request.body);
        const normalizedEmail = email.toLowerCase();
        const reset = await passwordResets.findOne(
            { email: normalizedEmail, used: false, expiresAt: { $gt: new Date() } },
            { sort: { createdAt: -1 } }
        );

        if (!reset || !(await bcrypt.compare(otp, reset.otpHash))) {
            return response.status(400).json({ message: 'Invalid or expired OTP.' });
        }

        return response.json({ message: 'OTP verified. Enter a new password.' });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return response.status(400).json({ message: error.errors[0].message });
        }
        console.error(error);
        return response.status(500).json({ message: 'Internal server error.' });
    }
});

app.post('/api/forgot-password/reset', async (request, response) => {
    try {
        const { email, otp, password } = forgotPasswordResetSchema.parse(request.body);
        const normalizedEmail = email.toLowerCase();
        const reset = await passwordResets.findOne(
            { email: normalizedEmail, used: false, expiresAt: { $gt: new Date() } },
            { sort: { createdAt: -1 } }
        );

        if (!reset || !(await bcrypt.compare(otp, reset.otpHash))) {
            return response.status(400).json({ message: 'Invalid or expired OTP.' });
        }

        const passwordHash = await bcrypt.hash(password, 12);
        await users.updateOne({ email: normalizedEmail }, { $set: { passwordHash } });
        await passwordResets.updateOne({ _id: reset._id }, { $set: { used: true } });
        return response.json({ message: 'Password reset successfully. You can now log in.' });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return response.status(400).json({ message: error.errors[0].message });
        }
        console.error(error);
        return response.status(500).json({ message: 'Internal server error.' });
    }
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