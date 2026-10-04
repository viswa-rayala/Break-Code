const crypto = require('crypto');
const path = require('path');
const express = require('express');
const bcrypt = require('bcryptjs');
const { MongoClient } = require('mongodb');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const { Resend } = require('resend');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;
const mongoUri = process.env.MONGODB_URI;
const databaseName = process.env.MONGODB_DATABASE || 'breakcode';
const jwtSecret = process.env.JWT_SECRET || 'fallback_secret_for_development_only';
const resend = new Resend(process.env.RESEND_API_KEY);
const mongoClient = mongoUri ? new MongoClient(mongoUri, {
    serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 10000)
}) : null;
let users;
let passwordResets;
let courses;
let enrollments;
let siteContent;
const adminEmails = new Set((process.env.ADMIN_EMAILS || '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean));

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

const courseSchema = z.object({
    title: z.string().trim().min(3).max(80),
    description: z.string().trim().min(10).max(240),
    category: z.enum(['web', 'data', 'tools']),
    level: z.enum(['Beginner', 'Intermediate', 'All levels']),
    hours: z.number().int().min(1).max(200),
    lessons: z.number().int().min(1).max(500),
    published: z.boolean()
});

const announcementSchema = z.object({ announcement: z.string().trim().max(220) });
const practiceSchema = z.object({ minutes: z.number().int().min(5).max(180) });

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

const requireAdmin = (req, res, next) => {
    if (!adminEmails.has(String(req.user.email || '').toLowerCase())) {
        return res.status(403).json({ message: 'Administrator access is required.' });
    }
    next();
};

function serializeCourse(course, enrollment) {
    return {
        id: course._id.toString(),
        title: course.title,
        description: course.description,
        category: course.category,
        level: course.level,
        hours: course.hours,
        lessons: course.lessons,
        published: course.published,
        lessonsCompleted: enrollment?.lessonsCompleted || 0,
        enrolled: Boolean(enrollment),
        updatedAt: course.updatedAt
    };
}

function parseObjectId(value) {
    const { ObjectId } = require('mongodb');
    return ObjectId.isValid(value) ? new ObjectId(value) : null;
}

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
        return response.json({
            user: {
                id: user._id.toString(),
                name: user.name,
                email: user.email,
                isAdmin: adminEmails.has(user.email.toLowerCase())
            }
        });
    } catch (error) {
        console.error(error);
        return response.status(500).json({ message: 'Internal server error.' });
    }
});

app.get('/api/dashboard', authenticateToken, async (request, response) => {
    try {
        const userId = request.user.id;
        const sinceDate = new Date();
        sinceDate.setUTCDate(sinceDate.getUTCDate() - 83);
        sinceDate.setUTCHours(0, 0, 0, 0);
        const [courseList, userEnrollments, announcementSetting, sessions] = await Promise.all([
            courses.find({ published: true }).sort({ updatedAt: -1, createdAt: -1 }).toArray(),
            enrollments.find({ userId }).toArray(),
            siteContent.findOne({ key: 'announcement' }),
            practiceSessions.find({ userId, date: { $gte: sinceDate.toISOString().slice(0, 10) } }).sort({ date: 1 }).toArray()
        ]);
        const enrollmentByCourse = new Map(userEnrollments.map((item) => [item.courseId, item]));
        const visibleCourses = courseList.map((course) => serializeCourse(course, enrollmentByCourse.get(course._id.toString())));
        const completedLessons = userEnrollments.reduce((total, item) => total + item.lessonsCompleted, 0);
        const learningMinutes = userEnrollments.reduce((total, item) => {
            const course = courseList.find((candidate) => candidate._id.toString() === item.courseId);
            return total + (course ? Math.round((course.hours * 60 * item.lessonsCompleted) / course.lessons) : 0);
        }, 0);
        const practice = sessions.map((session) => ({ date: session.date, minutes: session.minutes }));
        const practicedDates = new Set(practice.map((session) => session.date));
        let streak = 0;
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        if (!practicedDates.has(today.toISOString().slice(0, 10))) today.setUTCDate(today.getUTCDate() - 1);
        while (practicedDates.has(today.toISOString().slice(0, 10))) {
            streak += 1;
            today.setUTCDate(today.getUTCDate() - 1);
        }

        return response.json({
            courses: visibleCourses,
            stats: {
                learningHours: Math.round((learningMinutes / 60) * 10) / 10,
                completedLessons,
                coursesInProgress: userEnrollments.filter((item) => item.lessonsCompleted < item.lessonCount).length
            },
            announcement: announcementSetting?.value || '',
            practice,
            streak
        });
    } catch (error) {
        console.error(error);
        return response.status(500).json({ message: 'Unable to load dashboard data.' });
    }
});

app.post('/api/practice', authenticateToken, async (request, response) => {
    const parsed = practiceSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ message: parsed.error.issues[0].message });
    const date = new Date().toISOString().slice(0, 10);
    await practiceSessions.updateOne(
        { userId: request.user.id, date },
        { $inc: { minutes: parsed.data.minutes }, $set: { updatedAt: new Date() }, $setOnInsert: { userId: request.user.id, date } },
        { upsert: true }
    );
    return response.json({ message: `Logged ${parsed.data.minutes} minutes of practice.` });
});

app.post('/api/courses/:courseId/enroll', authenticateToken, async (request, response) => {
    try {
        const courseId = parseObjectId(request.params.courseId);
        if (!courseId) return response.status(400).json({ message: 'Invalid course.' });
        const course = await courses.findOne({ _id: courseId, published: true });
        if (!course) return response.status(404).json({ message: 'Course not found.' });

        const enrollment = await enrollments.findOneAndUpdate(
            { userId: request.user.id, courseId: course._id.toString() },
            {
                $setOnInsert: {
                    userId: request.user.id,
                    courseId: course._id.toString(),
                    lessonsCompleted: 0,
                    enrolledAt: new Date()
                },
                $set: { updatedAt: new Date(), lessonCount: course.lessons }
            },
            { upsert: true, returnDocument: 'after' }
        );
        return response.json({ course: serializeCourse(course, enrollment) });
    } catch (error) {
        console.error(error);
        return response.status(500).json({ message: 'Unable to start this course.' });
    }
});

app.post('/api/courses/:courseId/progress', authenticateToken, async (request, response) => {
    try {
        const courseId = parseObjectId(request.params.courseId);
        if (!courseId) return response.status(400).json({ message: 'Invalid course.' });
        const course = await courses.findOne({ _id: courseId, published: true });
        if (!course) return response.status(404).json({ message: 'Course not found.' });
        const courseIdString = course._id.toString();
        const enrollment = await enrollments.findOne({ userId: request.user.id, courseId: courseIdString });
        if (!enrollment) return response.status(409).json({ message: 'Start this course before recording progress.' });

        const lessonsCompleted = Math.min(enrollment.lessonsCompleted + 1, course.lessons);
        await enrollments.updateOne(
            { _id: enrollment._id },
            { $set: { lessonsCompleted, lessonCount: course.lessons, updatedAt: new Date(), lastPracticedAt: new Date() } }
        );
        return response.json({ course: serializeCourse(course, { ...enrollment, lessonsCompleted, lessonCount: course.lessons }) });
    } catch (error) {
        console.error(error);
        return response.status(500).json({ message: 'Unable to save course progress.' });
    }
});

app.get('/api/admin/overview', authenticateToken, requireAdmin, async (request, response) => {
    try {
        const [courseCount, publishedCount, userCount, enrollmentCount] = await Promise.all([
            courses.countDocuments(),
            courses.countDocuments({ published: true }),
            users.countDocuments(),
            enrollments.countDocuments()
        ]);
        return response.json({ courseCount, publishedCount, userCount, enrollmentCount });
    } catch (error) {
        console.error(error);
        return response.status(500).json({ message: 'Unable to load admin overview.' });
    }
});

app.get('/api/admin/courses', authenticateToken, requireAdmin, async (request, response) => {
    const courseList = await courses.find({}).sort({ updatedAt: -1, createdAt: -1 }).toArray();
    return response.json({ courses: courseList.map((course) => serializeCourse(course)) });
});

app.get('/api/admin/content', authenticateToken, requireAdmin, async (request, response) => {
    const announcement = await siteContent.findOne({ key: 'announcement' });
    return response.json({ announcement: announcement?.value || '' });
});

app.post('/api/admin/courses', authenticateToken, requireAdmin, async (request, response) => {
    const parsed = courseSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ message: parsed.error.issues[0].message });
    const now = new Date();
    const result = await courses.insertOne({ ...parsed.data, createdAt: now, updatedAt: now });
    return response.status(201).json({ course: serializeCourse({ _id: result.insertedId, ...parsed.data, createdAt: now, updatedAt: now }) });
});

app.put('/api/admin/courses/:courseId', authenticateToken, requireAdmin, async (request, response) => {
    const courseId = parseObjectId(request.params.courseId);
    if (!courseId) return response.status(400).json({ message: 'Invalid course.' });
    const parsed = courseSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ message: parsed.error.issues[0].message });
    const result = await courses.updateOne({ _id: courseId }, { $set: { ...parsed.data, updatedAt: new Date() } });
    if (!result.matchedCount) return response.status(404).json({ message: 'Course not found.' });
    await enrollments.updateMany({ courseId: courseId.toString() }, { $set: { lessonCount: parsed.data.lessons } });
    return response.json({ course: serializeCourse({ _id: courseId, ...parsed.data, updatedAt: new Date() }) });
});

app.delete('/api/admin/courses/:courseId', authenticateToken, requireAdmin, async (request, response) => {
    const courseId = parseObjectId(request.params.courseId);
    if (!courseId) return response.status(400).json({ message: 'Invalid course.' });
    const result = await courses.deleteOne({ _id: courseId });
    if (!result.deletedCount) return response.status(404).json({ message: 'Course not found.' });
    await enrollments.deleteMany({ courseId: courseId.toString() });
    return response.json({ message: 'Course deleted.' });
});

app.put('/api/admin/announcement', authenticateToken, requireAdmin, async (request, response) => {
    const parsed = announcementSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ message: parsed.error.issues[0].message });
    await siteContent.updateOne(
        { key: 'announcement' },
        { $set: { value: parsed.data.announcement, updatedAt: new Date() }, $setOnInsert: { key: 'announcement' } },
        { upsert: true }
    );
    return response.json({ announcement: parsed.data.announcement });
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

        try {
            const { data, error } = await resend.emails.send({
                from: process.env.EMAIL_FROM || 'BreakCode <onboarding@resend.dev>',
                to: normalizedEmail,
                subject: 'Your Password Reset OTP',
                text: `Your OTP for password reset is: ${otp}. It is valid for 10 minutes.`,
                html: `<p>Your OTP for password reset is: <b>${otp}</b></p><p>It is valid for 10 minutes.</p>`
            });

            if (error) {
                console.error('Failed to send OTP email via Resend:', error);
                return response.status(500).json({ message: error.message || 'Failed to send OTP email. Please try again later.' });
            }
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
    courses = database.collection('courses');
    enrollments = database.collection('enrollments');
    practiceSessions = database.collection('practiceSessions');
    siteContent = database.collection('siteContent');
    await users.createIndex({ email: 1 }, { unique: true });
    await passwordResets.createIndex({ email: 1, used: 1, expiresAt: 1 });
    await enrollments.createIndex({ userId: 1, courseId: 1 }, { unique: true });
    await practiceSessions.createIndex({ userId: 1, date: 1 }, { unique: true });
    await siteContent.createIndex({ key: 1 }, { unique: true });

    if (await courses.countDocuments() === 0) {
        const now = new Date();
        await courses.insertMany([
            { title: 'HTML & CSS essentials', description: 'Build polished pages from the ground up.', category: 'web', level: 'Beginner', hours: 6, lessons: 24, published: true },
            { title: 'React in practice', description: 'Turn ideas into fast, flexible interfaces.', category: 'web', level: 'Intermediate', hours: 9, lessons: 31, published: true },
            { title: 'Python for data thinking', description: 'Learn to explore, shape and explain data.', category: 'data', level: 'Beginner', hours: 7, lessons: 20, published: true },
            { title: 'Git & GitHub workflow', description: 'Make version control part of your rhythm.', category: 'tools', level: 'All levels', hours: 3, lessons: 12, published: true },
            { title: 'Machine learning basics', description: 'Understand models without the mystery.', category: 'data', level: 'Intermediate', hours: 10, lessons: 28, published: true },
            { title: 'SQL from zero', description: 'Ask better questions of your data.', category: 'tools', level: 'Beginner', hours: 4, lessons: 15, published: true },
            { title: 'JavaScript foundations', description: 'Functions, arrays and the logic behind interactive experiences.', category: 'web', level: 'Beginner', hours: 8, lessons: 12, published: true }
        ].map((course) => ({ ...course, createdAt: now, updatedAt: now })));
    }

    app.listen(port, () => {
        console.log(`BreakCode is running at http://localhost:${port}`);
        console.log(`Connected to MongoDB Atlas database: ${databaseName}`);
        if (adminEmails.size === 0) console.warn('ADMIN_EMAILS is empty; admin endpoints are disabled until an email is configured.');
    });
}

startServer().catch((error) => {
    console.error(`Unable to start BreakCode: ${error.message}`);
    process.exit(1);
});