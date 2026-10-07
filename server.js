const crypto = require('crypto');
const path = require('path');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const { Resend } = require('resend');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;
const jwtSecret = process.env.JWT_SECRET || 'fallback_secret_for_development_only';
const resend = new Resend(process.env.RESEND_API_KEY);
const adminEmails = new Set((process.env.ADMIN_EMAILS || '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean));

// Supabase Database Client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('⚠️  SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing from .env.');
    console.error('   Please configure your Supabase project credentials in .env.');
}

const supabase = createClient(
    supabaseUrl || 'https://placeholder.supabase.co',
    supabaseKey || 'placeholder'
);

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
        id: course.id,
        title: course.title,
        description: course.description,
        category: course.category,
        level: course.level,
        hours: course.hours,
        lessons: course.lessons,
        published: Boolean(course.published),
        lessonsCompleted: enrollment?.lessons_completed || 0,
        enrolled: Boolean(enrollment),
        updatedAt: course.updated_at
    };
}

// -----------------------------------------------------------------------------
// Authentication Endpoints
// -----------------------------------------------------------------------------
app.post('/api/signup', async (request, response) => {
    try {
        const validatedData = signupSchema.parse(request.body);
        const { name, email, password } = validatedData;
        const normalizedEmail = email.toLowerCase().trim();

        const { data: existingUser, error: checkError } = await supabase
            .from('users')
            .select('id')
            .eq('email', normalizedEmail)
            .maybeSingle();

        if (checkError) {
            console.error('Error checking existing user in Supabase:', checkError);
            return response.status(500).json({ message: 'Database error occurred.' });
        }

        if (existingUser) {
            return response.status(409).json({ message: 'An account with that email already exists.' });
        }

        const passwordHash = await bcrypt.hash(password, 12);
        const { error: insertError } = await supabase
            .from('users')
            .insert({
                name: name.trim(),
                email: normalizedEmail,
                password_hash: passwordHash,
                created_at: new Date().toISOString()
            });

        if (insertError) {
            console.error('Supabase signup insert error:', insertError);
            return response.status(500).json({ message: 'Failed to create account.' });
        }

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
        const normalizedEmail = email.toLowerCase().trim();

        const { data: user, error: findError } = await supabase
            .from('users')
            .select('*')
            .eq('email', normalizedEmail)
            .maybeSingle();

        if (findError) {
            console.error('Supabase user lookup error:', findError);
            return response.status(500).json({ message: 'Database connection error.' });
        }

        if (!user || !(await bcrypt.compare(password, user.password_hash))) {
            return response.status(401).json({ message: 'Invalid email or password.' });
        }

        const token = jwt.sign({ id: user.id, email: user.email }, jwtSecret, { expiresIn: '24h' });

        return response.json({
            message: 'Login successful.',
            token,
            user: { id: user.id, name: user.name, email: user.email }
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
        const { data: user, error } = await supabase
            .from('users')
            .select('id, name, email')
            .eq('email', request.user.email)
            .maybeSingle();

        if (error || !user) return response.status(404).json({ message: 'User not found' });

        return response.json({
            user: {
                id: user.id,
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

// -----------------------------------------------------------------------------
// Dashboard & Learning Endpoints
// -----------------------------------------------------------------------------
app.get('/api/dashboard', authenticateToken, async (request, response) => {
    try {
        const userId = request.user.id;
        const sinceDate = new Date();
        sinceDate.setUTCDate(sinceDate.getUTCDate() - 83);
        sinceDate.setUTCHours(0, 0, 0, 0);
        const sinceDateStr = sinceDate.toISOString().slice(0, 10);

        const [coursesRes, enrollmentsRes, announcementRes, practiceRes] = await Promise.all([
            supabase.from('courses').select('*').eq('published', true).order('updated_at', { ascending: false }).order('created_at', { ascending: false }),
            supabase.from('enrollments').select('*').eq('user_id', userId),
            supabase.from('site_content').select('*').eq('key', 'announcement').maybeSingle(),
            supabase.from('practice_sessions').select('*').eq('user_id', userId).gte('date', sinceDateStr).order('date', { ascending: true })
        ]);

        if (coursesRes.error) throw coursesRes.error;
        if (enrollmentsRes.error) throw enrollmentsRes.error;

        const courseList = coursesRes.data || [];
        const userEnrollments = enrollmentsRes.data || [];
        const announcementSetting = announcementRes.data;
        const sessions = practiceRes.data || [];

        const enrollmentByCourse = new Map(userEnrollments.map((item) => [item.course_id, item]));
        const visibleCourses = courseList.map((course) => serializeCourse(course, enrollmentByCourse.get(course.id)));
        const completedLessons = userEnrollments.reduce((total, item) => total + (item.lessons_completed || 0), 0);
        const learningMinutes = userEnrollments.reduce((total, item) => {
            const course = courseList.find((candidate) => candidate.id === item.course_id);
            return total + (course && course.lessons ? Math.round((course.hours * 60 * (item.lessons_completed || 0)) / course.lessons) : 0);
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
                coursesInProgress: userEnrollments.filter((item) => (item.lessons_completed || 0) < (item.lesson_count || 0)).length
            },
            announcement: announcementSetting?.value || '',
            practice,
            streak
        });
    } catch (error) {
        console.error('Dashboard load error:', error);
        return response.status(500).json({ message: 'Unable to load dashboard data.' });
    }
});

app.post('/api/practice', authenticateToken, async (request, response) => {
    const parsed = practiceSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ message: parsed.error.issues[0].message });
    const date = new Date().toISOString().slice(0, 10);
    const userId = request.user.id;
    const now = new Date().toISOString();

    const { data: existing } = await supabase
        .from('practice_sessions')
        .select('id, minutes')
        .eq('user_id', userId)
        .eq('date', date)
        .maybeSingle();

    const totalMinutes = (existing?.minutes || 0) + parsed.data.minutes;

    const { error: upsertErr } = await supabase
        .from('practice_sessions')
        .upsert({
            user_id: userId,
            date,
            minutes: totalMinutes,
            updated_at: now
        }, { onConflict: 'user_id,date' });

    if (upsertErr) {
        console.error('Supabase practice error:', upsertErr);
        return response.status(500).json({ message: 'Unable to log practice.' });
    }
    return response.json({ message: `Logged ${parsed.data.minutes} minutes of practice.` });
});

app.post('/api/courses/:courseId/enroll', authenticateToken, async (request, response) => {
    try {
        const courseId = request.params.courseId;
        if (!courseId) return response.status(400).json({ message: 'Invalid course.' });

        const { data: course, error: courseErr } = await supabase
            .from('courses')
            .select('*')
            .eq('id', courseId)
            .eq('published', true)
            .maybeSingle();

        if (courseErr || !course) return response.status(404).json({ message: 'Course not found.' });

        const now = new Date().toISOString();
        const { data: existingEnrollment } = await supabase
            .from('enrollments')
            .select('*')
            .eq('user_id', request.user.id)
            .eq('course_id', courseId)
            .maybeSingle();

        let enrollment;
        if (!existingEnrollment) {
            const { data: inserted, error: insertErr } = await supabase
                .from('enrollments')
                .insert({
                    user_id: request.user.id,
                    course_id: courseId,
                    lessons_completed: 0,
                    lesson_count: course.lessons,
                    enrolled_at: now,
                    updated_at: now
                })
                .select()
                .single();

            if (insertErr) throw insertErr;
            enrollment = inserted;
        } else {
            const { data: updated, error: updateErr } = await supabase
                .from('enrollments')
                .update({
                    lesson_count: course.lessons,
                    updated_at: now
                })
                .eq('id', existingEnrollment.id)
                .select()
                .single();

            if (updateErr) throw updateErr;
            enrollment = updated;
        }
        return response.json({ course: serializeCourse(course, enrollment) });
    } catch (error) {
        console.error('Course enrollment error:', error);
        return response.status(500).json({ message: 'Unable to start this course.' });
    }
});

app.post('/api/courses/:courseId/progress', authenticateToken, async (request, response) => {
    try {
        const courseId = request.params.courseId;
        if (!courseId) return response.status(400).json({ message: 'Invalid course.' });

        const { data: course, error: courseErr } = await supabase
            .from('courses')
            .select('*')
            .eq('id', courseId)
            .eq('published', true)
            .maybeSingle();

        if (courseErr || !course) return response.status(404).json({ message: 'Course not found.' });

        const { data: enrollment } = await supabase
            .from('enrollments')
            .select('*')
            .eq('user_id', request.user.id)
            .eq('course_id', courseId)
            .maybeSingle();

        if (!enrollment) return response.status(409).json({ message: 'Start this course before recording progress.' });

        const lessonsCompleted = Math.min((enrollment.lessons_completed || 0) + 1, course.lessons);
        const now = new Date().toISOString();

        const { data: updatedEnrollment, error: updateErr } = await supabase
            .from('enrollments')
            .update({
                lessons_completed: lessonsCompleted,
                lesson_count: course.lessons,
                updated_at: now,
                last_practiced_at: now
            })
            .eq('id', enrollment.id)
            .select()
            .single();

        if (updateErr) throw updateErr;
        return response.json({ course: serializeCourse(course, updatedEnrollment) });
    } catch (error) {
        console.error('Course progress error:', error);
        return response.status(500).json({ message: 'Unable to save course progress.' });
    }
});

// -----------------------------------------------------------------------------
// Admin Endpoints
// -----------------------------------------------------------------------------
app.get('/api/admin/overview', authenticateToken, requireAdmin, async (request, response) => {
    try {
        const [coursesCount, publishedCount, usersCount, enrollmentsCount] = await Promise.all([
            supabase.from('courses').select('*', { count: 'exact', head: true }),
            supabase.from('courses').select('*', { count: 'exact', head: true }).eq('published', true),
            supabase.from('users').select('*', { count: 'exact', head: true }),
            supabase.from('enrollments').select('*', { count: 'exact', head: true })
        ]);

        return response.json({
            courseCount: coursesCount.count || 0,
            publishedCount: publishedCount.count || 0,
            userCount: usersCount.count || 0,
            enrollmentCount: enrollmentsCount.count || 0
        });
    } catch (error) {
        console.error('Admin overview error:', error);
        return response.status(500).json({ message: 'Unable to load admin overview.' });
    }
});

app.get('/api/admin/courses', authenticateToken, requireAdmin, async (request, response) => {
    try {
        const { data: courseList, error } = await supabase
            .from('courses')
            .select('*')
            .order('updated_at', { ascending: false })
            .order('created_at', { ascending: false });

        if (error) throw error;
        return response.json({ courses: (courseList || []).map((course) => serializeCourse(course)) });
    } catch (error) {
        console.error('Admin courses fetch error:', error);
        return response.status(500).json({ message: 'Unable to load courses.' });
    }
});

app.get('/api/admin/content', authenticateToken, requireAdmin, async (request, response) => {
    try {
        const { data: announcement, error } = await supabase
            .from('site_content')
            .select('value')
            .eq('key', 'announcement')
            .maybeSingle();

        if (error) throw error;
        return response.json({ announcement: announcement?.value || '' });
    } catch (error) {
        console.error('Admin content fetch error:', error);
        return response.status(500).json({ message: 'Unable to load site content.' });
    }
});

app.post('/api/admin/courses', authenticateToken, requireAdmin, async (request, response) => {
    const parsed = courseSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ message: parsed.error.issues[0].message });
    const now = new Date().toISOString();

    try {
        const { data: newCourse, error } = await supabase
            .from('courses')
            .insert({
                ...parsed.data,
                created_at: now,
                updated_at: now
            })
            .select()
            .single();

        if (error) throw error;
        return response.status(201).json({ course: serializeCourse(newCourse) });
    } catch (error) {
        console.error('Admin create course error:', error);
        return response.status(500).json({ message: 'Unable to create course.' });
    }
});

app.put('/api/admin/courses/:courseId', authenticateToken, requireAdmin, async (request, response) => {
    const courseId = request.params.courseId;
    const parsed = courseSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ message: parsed.error.issues[0].message });
    const now = new Date().toISOString();

    try {
        const { data: updatedCourse, error } = await supabase
            .from('courses')
            .update({
                ...parsed.data,
                updated_at: now
            })
            .eq('id', courseId)
            .select()
            .maybeSingle();

        if (error || !updatedCourse) return response.status(404).json({ message: 'Course not found.' });

        await supabase
            .from('enrollments')
            .update({ lesson_count: parsed.data.lessons, updated_at: now })
            .eq('course_id', courseId);

        return response.json({ course: serializeCourse(updatedCourse) });
    } catch (error) {
        console.error('Admin update course error:', error);
        return response.status(500).json({ message: 'Unable to update course.' });
    }
});

app.delete('/api/admin/courses/:courseId', authenticateToken, requireAdmin, async (request, response) => {
    const courseId = request.params.courseId;

    try {
        const { error } = await supabase.from('courses').delete().eq('id', courseId);
        if (error) throw error;
        return response.json({ message: 'Course deleted.' });
    } catch (error) {
        console.error('Admin delete course error:', error);
        return response.status(500).json({ message: 'Unable to delete course.' });
    }
});

app.put('/api/admin/announcement', authenticateToken, requireAdmin, async (request, response) => {
    const parsed = announcementSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ message: parsed.error.issues[0].message });
    const now = new Date().toISOString();

    try {
        const { error } = await supabase.from('site_content').upsert({
            key: 'announcement',
            value: parsed.data.announcement,
            updated_at: now
        }, { onConflict: 'key' });

        if (error) throw error;
        return response.json({ announcement: parsed.data.announcement });
    } catch (error) {
        console.error('Admin announcement error:', error);
        return response.status(500).json({ message: 'Unable to update announcement.' });
    }
});

// -----------------------------------------------------------------------------
// Forgot Password Flow
// -----------------------------------------------------------------------------
app.post('/api/forgot-password/request', async (request, response) => {
    try {
        const { email } = forgotPasswordRequestSchema.parse(request.body);
        const normalizedEmail = email.toLowerCase().trim();

        const { data: user, error: userError } = await supabase
            .from('users')
            .select('id')
            .eq('email', normalizedEmail)
            .maybeSingle();

        if (userError || !user) {
            return response.status(404).json({ message: 'No account was found for that email.' });
        }

        const otp = crypto.randomInt(100000, 1000000).toString();
        const otpHash = bcrypt.hashSync(otp, 10);
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
        const now = new Date().toISOString();

        await supabase.from('password_resets').update({ used: true }).eq('email', normalizedEmail).eq('used', false);
        await supabase.from('password_resets').insert({
            email: normalizedEmail,
            otp_hash: otpHash,
            expires_at: expiresAt,
            created_at: now,
            used: false
        });

        try {
            const { error: emailError } = await resend.emails.send({
                from: process.env.EMAIL_FROM || 'BreakCode <onboarding@resend.dev>',
                to: normalizedEmail,
                subject: 'Your Password Reset OTP',
                text: `Your OTP for password reset is: ${otp}. It is valid for 10 minutes.`,
                html: `<p>Your OTP for password reset is: <b>${otp}</b></p><p>It is valid for 10 minutes.</p>`
            });

            if (emailError) {
                console.error('Failed to send OTP email via Resend:', emailError);
                return response.status(500).json({ message: emailError.message || 'Failed to send OTP email. Please try again later.' });
            }
        } catch (mailErr) {
            console.error('Failed to send OTP email:', mailErr);
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
        const normalizedEmail = email.toLowerCase().trim();

        const { data: resets } = await supabase
            .from('password_resets')
            .select('*')
            .eq('email', normalizedEmail)
            .eq('used', false)
            .gt('expires_at', new Date().toISOString())
            .order('created_at', { ascending: false })
            .limit(1);

        const reset = resets && resets[0];
        if (!reset || !(await bcrypt.compare(otp, reset.otp_hash))) {
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
        const normalizedEmail = email.toLowerCase().trim();

        const { data: resets } = await supabase
            .from('password_resets')
            .select('*')
            .eq('email', normalizedEmail)
            .eq('used', false)
            .gt('expires_at', new Date().toISOString())
            .order('created_at', { ascending: false })
            .limit(1);

        const reset = resets && resets[0];
        if (!reset || !(await bcrypt.compare(otp, reset.otp_hash))) {
            return response.status(400).json({ message: 'Invalid or expired OTP.' });
        }

        const passwordHash = await bcrypt.hash(password, 12);
        await supabase.from('users').update({ password_hash: passwordHash }).eq('email', normalizedEmail);
        await supabase.from('password_resets').update({ used: true }).eq('id', reset.id);
        return response.json({ message: 'Password reset successfully. You can now log in.' });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return response.status(400).json({ message: error.errors[0].message });
        }
        console.error(error);
        return response.status(500).json({ message: 'Internal server error.' });
    }
});

// -----------------------------------------------------------------------------
// Server Initialization
// -----------------------------------------------------------------------------
async function startServer() {
    if (!supabaseUrl || !supabaseKey) {
        throw new Error('Supabase configuration missing! Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to your .env file.');
    }

    console.log(`[Database] Connecting to Supabase at: ${supabaseUrl}`);
    const { error: testError } = await supabase.from('courses').select('id').limit(1);
    if (testError) {
        console.warn(`[Supabase Notice] Table query returned: ${testError.message}`);
        console.warn(`[Supabase Notice] Make sure you have executed supabase-schema.sql in your Supabase SQL Editor.`);
    } else {
        console.log(`[Database] Successfully verified connection to Supabase.`);
    }

    app.listen(port, () => {
        console.log(`BreakCode is running at http://localhost:${port}`);
        if (adminEmails.size === 0) console.warn('ADMIN_EMAILS is empty; admin endpoints are disabled until an email is configured.');
    });
}

startServer().catch((error) => {
    console.error(`Unable to start BreakCode: ${error.message}`);
    process.exit(1);
});