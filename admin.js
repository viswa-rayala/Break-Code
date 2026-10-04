const token = localStorage.getItem('breakcodeToken');
const courseDialog = document.getElementById('courseDialog');
const courseForm = document.getElementById('courseForm');
const courseList = document.getElementById('courseList');
const statusMessage = document.getElementById('adminStatus');
const announcementInput = document.getElementById('announcementInput');
let courses = [];

async function apiRequest(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: {
            'Authorization': `Bearer ${token}`,
            ...(options.body ? { 'Content-Type': 'application/json' } : {}),
            ...options.headers
        }
    });
    const result = await response.json();
    if (response.status === 401 || response.status === 403) {
        if (response.status === 401) localStorage.removeItem('breakcodeToken');
        window.location.replace(response.status === 401 ? 'login.html' : 'dashboard.html');
        throw new Error(result.message || 'Access denied.');
    }
    if (!response.ok) throw new Error(result.message || 'The request could not be completed.');
    return result;
}

function setStatus(message, isError = false) {
    statusMessage.textContent = message;
    statusMessage.classList.toggle('status-error', isError);
}

function renderCourses() {
    const query = document.getElementById('courseSearch').value.trim().toLowerCase();
    const visibleCourses = courses.filter((course) => `${course.title} ${course.description}`.toLowerCase().includes(query));
    courseList.replaceChildren();
    document.getElementById('emptyCourses').hidden = visibleCourses.length > 0;

    visibleCourses.forEach((course) => {
        const row = document.createElement('article');
        row.className = 'admin-course-row';
        const info = document.createElement('div');
        info.className = 'admin-course-info';
        const title = document.createElement('strong');
        title.textContent = course.title;
        const description = document.createElement('span');
        description.textContent = `${course.lessons} lessons · ${course.hours} hours · ${course.level}`;
        info.append(title, description);

        const category = document.createElement('span');
        category.className = 'admin-course-category';
        category.textContent = { web: 'Web development', data: 'Data & AI', tools: 'Tools' }[course.category];
        const publishState = document.createElement('span');
        publishState.className = `publish-state${course.published ? ' is-published' : ''}`;
        publishState.textContent = course.published ? 'Published' : 'Draft';
        const actions = document.createElement('div');
        actions.className = 'admin-course-actions';
        const editButton = document.createElement('button');
        editButton.type = 'button';
        editButton.dataset.editCourse = course.id;
        editButton.textContent = 'Edit';
        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'delete-course';
        deleteButton.dataset.deleteCourse = course.id;
        deleteButton.textContent = 'Delete';
        actions.append(editButton, deleteButton);
        row.append(info, category, publishState, actions);
        courseList.append(row);
    });
}

function updateMetrics(overview) {
    document.getElementById('courseCount').textContent = overview.courseCount;
    document.getElementById('publishedCount').textContent = overview.publishedCount;
    document.getElementById('learnerCount').textContent = overview.userCount;
    document.getElementById('enrollmentCount').textContent = overview.enrollmentCount;
}

function openCourseEditor(course) {
    courseForm.reset();
    document.getElementById('courseId').value = course?.id || '';
    document.getElementById('courseTitle').value = course?.title || '';
    document.getElementById('courseDescription').value = course?.description || '';
    document.getElementById('courseCategory').value = course?.category || 'web';
    document.getElementById('courseLevel').value = course?.level || 'Beginner';
    document.getElementById('courseHours').value = course?.hours || 1;
    document.getElementById('courseLessons').value = course?.lessons || 1;
    document.getElementById('coursePublished').checked = course?.published ?? true;
    document.getElementById('courseDialogTitle').textContent = course ? 'Edit course' : 'Add course';
    courseDialog.showModal();
}

async function loadAdmin() {
    if (!token) {
        window.location.replace('login.html');
        return;
    }
    try {
        const { user } = await apiRequest('/api/me');
        if (!user.isAdmin) {
            window.location.replace('dashboard.html');
            return;
        }
        const [overview, catalog, content] = await Promise.all([
            apiRequest('/api/admin/overview'),
            apiRequest('/api/admin/courses'),
            apiRequest('/api/admin/content')
        ]);
        updateMetrics(overview);
        courses = catalog.courses;
        renderCourses();
        announcementInput.value = content.announcement;
        document.getElementById('announcementLength').textContent = `${announcementInput.value.length} / 220`;
    } catch (error) {
        setStatus(error.message, true);
    }
}

document.getElementById('addCourseButton').addEventListener('click', () => openCourseEditor());
document.getElementById('closeCourseDialog').addEventListener('click', () => courseDialog.close());
document.getElementById('cancelCourseEdit').addEventListener('click', () => courseDialog.close());
document.getElementById('courseSearch').addEventListener('input', renderCourses);

courseList.addEventListener('click', async (event) => {
    const editButton = event.target.closest('[data-edit-course]');
    if (editButton) {
        openCourseEditor(courses.find((course) => course.id === editButton.dataset.editCourse));
        return;
    }
    const deleteButton = event.target.closest('[data-delete-course]');
    if (!deleteButton) return;
    const course = courses.find((item) => item.id === deleteButton.dataset.deleteCourse);
    if (!course || !window.confirm(`Delete "${course.title}" and its learner progress?`)) return;
    try {
        await apiRequest(`/api/admin/courses/${course.id}`, { method: 'DELETE' });
        setStatus('Course deleted.');
        await loadAdmin();
    } catch (error) {
        setStatus(error.message, true);
    }
});

courseForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const courseId = document.getElementById('courseId').value;
    const course = {
        title: document.getElementById('courseTitle').value,
        description: document.getElementById('courseDescription').value,
        category: document.getElementById('courseCategory').value,
        level: document.getElementById('courseLevel').value,
        hours: Number(document.getElementById('courseHours').value),
        lessons: Number(document.getElementById('courseLessons').value),
        published: document.getElementById('coursePublished').checked
    };
    try {
        await apiRequest(courseId ? `/api/admin/courses/${courseId}` : '/api/admin/courses', {
            method: courseId ? 'PUT' : 'POST',
            body: JSON.stringify(course)
        });
        courseDialog.close();
        setStatus(courseId ? 'Course changes saved.' : 'Course added to the catalog.');
        await loadAdmin();
    } catch (error) {
        setStatus(error.message, true);
    }
});

announcementInput.addEventListener('input', () => {
    document.getElementById('announcementLength').textContent = `${announcementInput.value.length} / 220`;
});

document.getElementById('announcementForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
        await apiRequest('/api/admin/announcement', {
            method: 'PUT',
            body: JSON.stringify({ announcement: announcementInput.value })
        });
        setStatus('Dashboard announcement saved.');
    } catch (error) {
        setStatus(error.message, true);
    }
});

document.getElementById('adminLogout').addEventListener('click', () => {
    localStorage.removeItem('breakcodeToken');
    localStorage.removeItem('breakcodeUser');
    window.location.replace('login.html');
});

const themeToggle = document.getElementById('adminThemeToggle');
function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('breakcodeTheme', theme);
    const isDark = theme === 'dark';
    themeToggle.textContent = isDark ? '☀' : '☾';
    themeToggle.setAttribute('aria-label', `Switch to ${isDark ? 'light' : 'dark'} theme`);
}
setTheme(localStorage.getItem('breakcodeTheme') || 'light');
themeToggle.addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));

loadAdmin();