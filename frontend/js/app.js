/**
 * Code Classroom - 前端应用核心
 * SPA 路由、API 通信、页面渲染
 */

// ═══════════════════════════════════════════════════════════
// API 通信层
// ═══════════════════════════════════════════════════════════
const API = {
    baseUrl: '/api',

    async request(method, path, data = null) {
        const opts = {
            method,
            headers: { 'Content-Type': 'application/json' },
        };
        if (API.token) {
            opts.headers['Authorization'] = `Bearer ${API.token}`;
        }
        if (data && method !== 'GET') {
            opts.body = JSON.stringify(data);
        }
        const res = await fetch(`${API.baseUrl}${path}`, opts);
        const json = await res.json();
        if (json.code !== 0 && json.code !== undefined) {
            // Token 过期：只有当前仍是登录状态才触发 logout，防止多个并发请求重复触发
            if (res.status === 401 && API.token) {
                API._handleUnauthorized();
                throw new Error('登录已过期，请重新登录');
            }
            throw new Error(json.message || '请求失败');
        }
        return json.data;
    },

    // 防止并发 401 多次触发 logout
    _unauthorizedTimer: null,
    _handleUnauthorized() {
        if (API._unauthorizedTimer) return; // 已经在处理中，忽略
        API._unauthorizedTimer = setTimeout(() => {
            API._unauthorizedTimer = null;
            if (API.token) { // 再次确认还是登录状态才 logout
                App.logout();
                showToast('登录已过期，请重新登录', 'error');
            }
        }, 100);
    },

    get(path, params = {}) {
        const query = new URLSearchParams(params).toString();
        return API.request('GET', query ? `${path}?${query}` : path);
    },
    post(path, data) { return API.request('POST', path, data); },
    put(path, data) { return API.request('PUT', path, data); },
    delete(path, data) { return API.request('DELETE', path, data || null); },


    // Execute API (direct run via /api/execute)
    async execute(code, language, input = '', timeLimit = 10) {
        const opts = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        };
        if (API.token) opts.headers['Authorization'] = `Bearer ${API.token}`;
        opts.body = JSON.stringify({ code, language, input, time_limit: timeLimit });
        const res = await fetch(`/api/execute`, opts);
        const json = await res.json();
        if (json.code === 0) return json.data;
        throw new Error(json.message || 'Execution failed');
    },

    token: null,
};


// ═══════════════════════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════════════════════
function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }
function html(str) { return str; } // 标记模板字面量为 HTML
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
function timeAgo(dateStr) {
    const now = new Date();
    const d = new Date(dateStr);
    const diff = Math.floor((now - d) / 1000);
    if (diff < 60) return '刚刚';
    if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
    return `${Math.floor(diff / 86400)} 天前`;
}
function statusText(s) {
    const map = {
        pending: '等待中', running: '运行中', accepted: '通过 ✅',
        wrong_answer: '答案错误 ❌', time_limit: '超时 ⏰',
        memory_limit: '内存超限', runtime_error: '运行错误',
        compile_error: '编译错误', system_error: '系统错误',
        code_check_failed: '代码检查不通过 🔍',
    };
    return map[s] || s;
}
function difficultyText(d) {
    return { easy: '简单', medium: '中等', hard: '困难' }[d] || d;
}
function languageIcon(l) {
    return { python: '🐍', javascript: '🟨', c: '🔵', cpp: '🔵' }[l] || '📄';
}
function fileIcon(name) {
    const ext = (name || '').split('.').pop().toLowerCase();
    const map = {
        pdf:'📕', doc:'📘', docx:'📘', xls:'📗', xlsx:'📗', ppt:'📙', pptx:'📙',
        jpg:'🖼️', jpeg:'🖼️', png:'🖼️', gif:'🖼️', svg:'🖼️', webp:'🖼️',
        mp4:'🎬', avi:'🎬', mkv:'🎬', mp3:'🎵', wav:'🎵',
        zip:'📦', rar:'📦', '7z':'📦', tar:'📦', gz:'📦',
        py:'🐍', js:'🟨', c:'🔵', cpp:'🔵', java:'☕',
        txt:'📄', md:'📝', csv:'📊', html:'🌐', css:'🎨',
    };
    return map[ext] || '📎';
}
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}
function _formatTime(isoStr) {
    if (!isoStr) return '-';
    const d = new Date(isoStr);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前';
    if (diff < 604800000) return Math.floor(diff / 86400000) + ' 天前';
    // 超过一周显示具体日期
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function downloadFile(fileId, fileName) {
    const a = document.createElement('a');
    a.href = '/api/files/' + fileId + '/download';
    a.download = fileName || 'download';
    a.style.display = 'none';
    // Fetch with auth header, then trigger download via blob
    fetch('/api/files/' + fileId + '/download', {
        headers: { 'Authorization': 'Bearer ' + (API.token || '') }
    }).then(r => {
        if (!r.ok) throw new Error('下载失败 (' + r.status + ')');
        return r.blob();
    }).then(blob => {
        const url = URL.createObjectURL(blob);
        a.href = url;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }).catch(e => {
        showToast('下载失败: ' + e.message, 'error');
    });
}

function previewFile(fileId) {
    window.open('/api/files/' + fileId + '/download?token=' + encodeURIComponent(API.token || ''), '_blank');
}

function showToast(msg, type = 'info') {
    const container = $('#toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(100%)'; setTimeout(() => toast.remove(), 300); }, 3000);
}

function showModal(content) {
    $('#modal-content').innerHTML = content;
    $('#modal-overlay').style.display = 'flex';
}

function hideModal() {
    $('#modal-overlay').style.display = 'none';
}

$('#modal-overlay').addEventListener('click', (e) => {
    if (e.target === $('#modal-overlay')) hideModal();
});


// ═══════════════════════════════════════════════════════════
// 主应用
// ═══════════════════════════════════════════════════════════
const App = {
    user: null,
    currentPage: 'dashboard',
    editor: null,

    // ── 初始化 ──────────────────────────────────────────
    async init() {
        // 检查 token
        const token = localStorage.getItem('cc_token');
        const userStr = localStorage.getItem('cc_user');
        if (token && userStr) {
            API.token = token;
            try {
                App.user = JSON.parse(userStr);
                // 验证 token 是否仍然有效（防止用过期 token 进入应用）
                const me = await fetch('/api/auth/me', {
                    headers: { 'Authorization': `Bearer ${token}` }
                }).then(r => r.json()).catch(() => ({ code: -1 }));

                if (me.code === 0) {
                    App.user = me.data || App.user;
                    App.enterApp();
                } else {
                    // token 无效/过期，清除并显示登录页
                    localStorage.removeItem('cc_token');
                    localStorage.removeItem('cc_user');
                    API.token = null;
                    App.user = null;
                    App.showAuth();
                }
            } catch {
                App.showAuth();
            }
        } else {
            App.showAuth();
        }
        // 隐藏 loading
        setTimeout(() => {
            $('#loading-screen').style.display = 'none';
        }, 800);
    },

    // ── 认证 ────────────────────────────────────────────
    showAuth() {
        $('#auth-page').style.display = 'flex';
        $('#app-layout').style.display = 'none';
    },

    // ── 插件路由注册表（插件通过 App.registerPage 注册自己的路由）──
    _pluginRenderers: {},

    registerPage(page, renderFn) {
        App._pluginRenderers[page] = renderFn;
    },

    enterApp() {
        $('#auth-page').style.display = 'none';
        $('#app-layout').style.display = 'flex';
        App.updateUserUI();
        App._loadPluginNav().then(() => App.navigate('dashboard'));
    },

    async _loadPluginNav() {
        try {
            const items = await API.get('/plugins/nav');
            if (!items || !items.length) return;
            const navContainer = document.querySelector('.sidebar-nav');
            // 找到"教师管理"分区之前的位置，插入插件 nav
            const teacherNav = document.getElementById('teacher-nav');
            const loadedPages = new Set();
            for (const item of items) {
                // 根据角色决定是否显示
                const role = item.role || 'all';
                const userRole = App.user ? App.user.role : 'student';
                if (role === 'teacher' && !['teacher','admin'].includes(userRole)) continue;
                if (role === 'admin' && userRole !== 'admin') continue;

                // 避免重复插入
                if (document.querySelector(`[data-page="${item.page}"][data-plugin]`)) continue;

                const a = document.createElement('a');
                a.href = '#';
                a.className = 'nav-item';
                a.dataset.page = item.page;
                a.dataset.plugin = item._plugin;
                a.innerHTML = `<span class="nav-icon">${item.icon || '🔌'}</span> <span>${item.label}</span>`;
                a.addEventListener('click', (e) => { e.preventDefault(); App.navigate(item.page); });
                navContainer.insertBefore(a, teacherNav);

                // 动态加载插件 JS（若未加载）
                if (item._js && !loadedPages.has(item._js)) {
                    loadedPages.add(item._js);
                    await new Promise((resolve) => {
                        if (document.querySelector(`script[src="${item._js}"]`)) { resolve(); return; }
                        const s = document.createElement('script');
                        s.src = item._js;
                        s.onload = () => {
                            // 等待 150ms，让插件内部的路由注册（如 setTimeout 轮询）完成
                            setTimeout(resolve, 150);
                        };
                        s.onerror = () => { console.warn('[Plugin] Failed to load', item._js); resolve(); };
                        document.body.appendChild(s);
                    });
                }
            }
        } catch (e) {
            console.warn('[Plugin] Failed to load nav items:', e.message);
        }
    },

    showLogin() {
        $('#login-form').style.display = 'block';
        $('#register-form').style.display = 'none';
    },

    showRegister() {
        $('#login-form').style.display = 'none';
        $('#register-form').style.display = 'block';
    },

    async login() {
        const username = $('#login-username').value.trim();
        const password = $('#login-password').value;
        if (!username || !password) { showToast('请输入用户名和密码', 'error'); return; }
        try {
            const data = await API.post('/auth/login', { username, password });
            API.token = data.token;
            App.user = data.user;
            localStorage.setItem('cc_token', data.token);
            localStorage.setItem('cc_user', JSON.stringify(data.user));
            showToast('登录成功！', 'success');
            App.enterApp();
        } catch (e) {
            showToast(e.message, 'error');
        }
    },

    async register() {
        const password = $('#reg-password').value;
        const password2 = $('#reg-password2').value;
        if (password !== password2) { showToast('两次密码输入不一致', 'error'); return; }
        const data = {
            username: $('#reg-username').value.trim(),
            email: $('#reg-email').value.trim(),
            password,
            student_number: $('#reg-student-number').value.trim(),
            class_name: $('#reg-class-name').value.trim(),
        };
        try {
            const res = await API.post('/auth/register', data);
            API.token = res.token;
            App.user = res.user;
            localStorage.setItem('cc_token', res.token);
            localStorage.setItem('cc_user', JSON.stringify(res.user));
            showToast('注册成功，欢迎加入！🎉', 'success');
            App.enterApp();
        } catch (e) {
            showToast(e.message, 'error');
        }
    },

    logout() {
        localStorage.removeItem('cc_token');
        localStorage.removeItem('cc_user');
        API.token = null;
        App.user = null;
        App.showAuth();
        showToast('已退出登录', 'info');
    },

    updateUserUI() {
        if (!App.user) return;
        const displayName = App.user.nickname || App.user.username;
        const initial = displayName.charAt(0).toUpperCase();
        $('#user-avatar').textContent = initial;
        $('#user-avatar').style.background = App.user.avatar || 'var(--primary)';
        $('#user-name').textContent = displayName;
        const roleMap = { student: '学生', teacher: '教师', admin: '管理员' };
        $('#user-role').textContent = roleMap[App.user.role] || App.user.role;

        // 根据角色显示/隐藏菜单
        const isTeacher = ['teacher', 'admin'].includes(App.user.role);
        const isAdmin = App.user.role === 'admin';
        $('#teacher-nav').style.display = isTeacher ? 'block' : 'none';
        $('#admin-nav').style.display = isAdmin ? 'block' : 'none';
    },

    toggleUserMenu() {
        const menu = $('#user-menu');
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    },

    toggleSidebar() {
        $('#sidebar').classList.toggle('open');
    },

    // ── 导航 ────────────────────────────────────────────
    navigate(page, params = {}) {
        App.currentPage = page;
        App.currentParams = params;

        // 更新侧边栏选中状态
        $$('.nav-item').forEach(el => {
            el.classList.toggle('active', el.dataset.page === page);
        });

        // 关闭移动端侧边栏
        $('#sidebar').classList.remove('open');

        // 关闭用户菜单
        $('#user-menu').style.display = 'none';

        const pageNames = {
            'dashboard': '学习概览', 'courses': '我的课程', 'exercises': '题库练习',
            'code-pool': '我的代码池', 'submissions': '提交记录',
            'manage-exercises': '题目管理', 'manage-users': '学生管理',
            'manage-courses': '课程管理', 'announcements': '公告管理',
            'profile': '个人信息', 'exercise-do': '做题', 'course-detail': '课程详情',
            'discussions': '班级讨论', 'discussion-view': '讨论区',
            'netdisk': '班级网盘', 'tasks': '作业任务', 'task-view': '任务详情',
            'manage-tasks': '任务管理', 'manage-users-admin': '用户管理',
            'manage-settings': '系统设置', 'manage-plugins': '插件管理',
            'manage-classes': '班级管理',
            'blog': '博客中心', 'blog-edit': '编辑文章', 'blog-detail': '文章详情',
            // 考试系统（由 exam.js 插件注入处理）
            'exam': '在线考试', 'exam-papers': '试卷管理', 'exam-paper-edit': '编辑试卷',
            'exam-do': '考试答题', 'exam-result': '成绩单', 'exam-submissions': '答卷列表',
            'exam-grade': '批改答卷', 'exam-stats': '成绩统计', 'exam-my-results': '我的成绩',
        };
        $('#breadcrumb').textContent = pageNames[page] || page;

        // 渲染页面
        const renderers = {
            'dashboard': Pages.dashboard,
            'courses': Pages.courses,
            'exercises': Pages.exercises,
            'code-pool': Pages.codePool,
            'submissions': Pages.submissions,
            'manage-exercises': Pages.manageExercises,
            'manage-users': Pages.manageUsers,
            'manage-courses': Pages.manageCourses,
            'announcements': Pages.announcements,
            'exercise-do': Pages.exerciseDo,
            'course-detail': Pages.courseDetail,
            'profile': Pages.profile,
            'discussions': Pages.discussions,
            'discussion-view': Pages.discussionView,
            'netdisk': Pages.netdisk,
            'tasks': Pages.tasks,
            'task-view': Pages.taskView,
            'manage-tasks': Pages.manageTasks,
            'manage-users-admin': Pages.manageUsersAdmin,
            'manage-settings': Pages.manageSettings,
            'manage-plugins': Pages.managePlugins,
            'manage-classes': Pages.manageClasses,
            'blog': Pages.blog,
            'blog-edit': Pages.blogEdit,
            'blog-detail': Pages.blogDetail,
        };

        if (renderers[page]) {
            renderers[page](params);
        } else if (App._pluginRenderers[page]) {
            App._pluginRenderers[page](params);
        } else {
            // 未知页面 - 可能插件还未加载完毕，0.3秒后重试一次
            setTimeout(() => {
                if (App._pluginRenderers[page]) {
                    App._pluginRenderers[page](params);
                } else {
                    $('#page-content').innerHTML = `<div class="empty-state"><div class="empty-icon">🔌</div><h3>页面未找到</h3><p>页面 "${escapeHtml(page)}" 不存在，或对应插件未正常加载。请刷新页面重试。</p></div>`;
                }
            }, 300);
        }
    },

    // ── Markdown 渲染 ──────────────────────────────────
    renderMarkdown(text) {
        if (typeof marked !== 'undefined') {
            return marked.parse(text);
        }
        // 简单回退
        return text.replace(/\n/g, '<br>');
    },

    // ── CodeMirror 编辑器 ──────────────────────────────
    createEditor(elementId, language = 'python', code = '') {
        const modeMap = { python: 'python', javascript: 'javascript', c: 'text/x-csrc', cpp: 'text/x-c++src' };
        if (App.editor) {
            App.editor.toTextArea();
        }
        const textarea = document.getElementById(elementId);
        if (!textarea) return null;
        App.editor = CodeMirror.fromTextArea(textarea, {
            mode: modeMap[language] || 'python',
            theme: 'dracula',
            lineNumbers: true,
            matchBrackets: true,
            autoCloseBrackets: true,
            styleActiveLine: true,
            indentUnit: 4,
            tabSize: 4,
            indentWithTabs: false,
            lineWrapping: true,
            viewportMargin: Infinity,
        });
        App.editor.setValue(code);
        return App.editor;
    },
};

// Enter 键登录
$('#login-password').addEventListener('keydown', (e) => { if (e.key === 'Enter') App.login(); });


// ═══════════════════════════════════════════════════════════
// 页面渲染器
// ═══════════════════════════════════════════════════════════
const Pages = {

    // ── 学习概览 ────────────────────────────────────────
    async dashboard() {
        const container = $('#page-content');
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">⏳</div><h3>加载中...</h3></div>';

        try {
            const stats = await API.get('/dashboard');
            const isStudent = App.user.role === 'student';

            let statsHTML = '';
            if (isStudent) {
                statsHTML = `
                    <div class="stats-grid">
                        <div class="stat-card"><div class="stat-icon blue">📝</div><div class="stat-info"><div class="stat-value">${stats.total_exercises}</div><div class="stat-label">题目总数</div></div></div>
                        <div class="stat-card"><div class="stat-icon green">✅</div><div class="stat-info"><div class="stat-value">${stats.solved_count}</div><div class="stat-label">已通过</div></div></div>
                        <div class="stat-card"><div class="stat-icon purple">📋</div><div class="stat-info"><div class="stat-value">${stats.total_submissions}</div><div class="stat-label">提交次数</div></div></div>
                        <div class="stat-card"><div class="stat-icon cyan">🗂️</div><div class="stat-info"><div class="stat-value">${stats.saved_codes}</div><div class="stat-label">已保存代码</div></div></div>
                        <div class="stat-card"><div class="stat-icon orange">📚</div><div class="stat-info"><div class="stat-value">${stats.course_count}</div><div class="stat-label">已选课程</div></div></div>
                    </div>
                `;
            } else {
                const statCards = isStudent ? '' : `
                    <div class="stats-grid">
                        <div class="stat-card"><div class="stat-icon blue">👥</div><div class="stat-info"><div class="stat-value">${stats.total_students}</div><div class="stat-label">学生总数</div></div></div>
                        <div class="stat-card"><div class="stat-icon green">✅</div><div class="stat-info"><div class="stat-value">${stats.total_accepted || 0}</div><div class="stat-label">通过提交</div></div></div>
                        <div class="stat-card"><div class="stat-icon purple">📝</div><div class="stat-info"><div class="stat-value">${stats.total_submissions}</div><div class="stat-label">总提交数</div></div></div>
                        <div class="stat-card"><div class="stat-icon orange">📊</div><div class="stat-info"><div class="stat-value">${stats.today_submissions || 0}</div><div class="stat-label">今日提交</div></div></div>
                    </div>
                `;
                statsHTML = `
                    <div class="stats-grid">
                        <div class="stat-card"><div class="stat-icon blue">📚</div><div class="stat-info"><div class="stat-value">${stats.total_courses || stats.my_courses}</div><div class="stat-label">课程数</div></div></div>
                        <div class="stat-card"><div class="stat-icon green">📝</div><div class="stat-info"><div class="stat-value">${stats.total_exercises || stats.my_exercises}</div><div class="stat-label">题目数</div></div></div>
                        <div class="stat-card"><div class="stat-icon purple">👥</div><div class="stat-info"><div class="stat-value">${stats.total_students || stats.total_users}</div><div class="stat-label">学生数</div></div></div>
                        <div class="stat-card"><div class="stat-icon orange">📋</div><div class="stat-info"><div class="stat-value">${stats.total_submissions}</div><div class="stat-label">提交数</div></div></div>
                    </div>
                `;
            }

            // 获取公告
            let announcementsHTML = '';
            try {
                const announcements = await API.get('/announcements');
                if (announcements && announcements.length > 0) {
                    announcementsHTML = `
                        <div class="card" style="margin-bottom:1.5rem;">
                            <div class="card-header"><span class="card-title">📢 最新公告</span></div>
                            ${announcements.slice(0, 3).map(a => `
                                <div class="announcement-item">
                                    <div class="announcement-title">${escapeHtml(a.title)}</div>
                                    <div class="announcement-content">${escapeHtml(a.content).substring(0, 100)}${a.content.length > 100 ? '...' : ''}</div>
                                    <div class="announcement-time">${timeAgo(a.created_at)}</div>
                                </div>
                            `).join('')}
                        </div>
                    `;
                }
            } catch (e) {}

            // 最近提交
            let recentHTML = '';
            try {
                const recent = await API.get('/submissions', { page: 1, page_size: 5 });
                if (recent.items && recent.items.length > 0) {
                    recentHTML = `
                        <div class="card">
                            <div class="card-header">
                                <span class="card-title">📋 最近提交</span>
                                <button class="btn btn-sm btn-outline" onclick="App.navigate('submissions')">查看全部</button>
                            </div>
                            <div class="table-container">
                                <table>
                                    <thead><tr><th>题目</th><th>语言</th><th>状态</th><th>得分</th><th>时间</th></tr></thead>
                                    <tbody>
                                        ${recent.items.map(s => `
                                            <tr>
                                                <td>${escapeHtml(s.exercise_title)}</td>
                                                <td>${languageIcon(s.language)} ${s.language}</td>
                                                <td><span class="badge badge-${s.status}">${statusText(s.status)}</span></td>
                                                <td>${s.score !== null ? s.score + '分' : '-'}</td>
                                                <td>${timeAgo(s.submitted_at)}</td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    `;
                }
            } catch (e) {}

            container.innerHTML = `
                <h2 style="margin-bottom:1.25rem;">
                    ${isStudent ? '👋 欢迎回来，' + escapeHtml(App.user.username) + '！' : '📊 管理概览'}
                </h2>
                ${statsHTML}
                ${announcementsHTML}
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1.25rem;">
                    ${recentHTML}
                    <div class="card">
                        <div class="card-header"><span class="card-title">🚀 快速开始</span></div>
                        <div style="padding:0.5rem 0;">
                            <button class="btn btn-primary btn-lg" style="width:100%;margin-bottom:0.75rem;" onclick="App.navigate('exercises')">
                                📝 去做题
                            </button>
                            <button class="btn btn-outline btn-lg" style="width:100%;margin-bottom:0.75rem;" onclick="App.navigate('code-pool')">
                                🗂️ 我的代码池
                            </button>
                            <button class="btn btn-outline btn-lg" style="width:100%;" onclick="App.navigate('courses')">
                                📚 浏览课程
                            </button>
                        </div>
                    </div>
                </div>
            `;
        } catch (e) {
            container.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><h3>加载失败</h3><p>${escapeHtml(e.message)}</p></div>`;
        }
    },

    // ── 我的课程 ────────────────────────────────────────
    async courses() {
        const container = $('#page-content');
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">⏳</div><h3>加载中...</h3></div>';

        try {
            const data = await API.get('/courses', { page: 1, page_size: 50 });
            const courses = data.items || [];
            const isStudent = App.user && App.user.role === 'student';

            const icons = ['🐍', '🌐', '⚙️', '🤖', '📊', '🎮'];

            container.innerHTML = `
                <div class="toolbar">
                    <div style="display:flex;gap:0.5rem;">
                        <button class="filter-btn active" onclick="App.navigate('courses')">全部课程</button>
                        <button class="filter-btn" onclick="App.navigate('courses',{my:'1'})">我的课程</button>
                    </div>
                    ${isStudent ? `<button class="btn btn-primary" onclick="Pages._enrollWithPassword()">🔑 凭密码选课</button>` : ''}
                </div>
                <div class="course-grid">
                    ${courses.map((c, i) => `
                        <div class="course-card" onclick="App.navigate('course-detail',{id:${c.id}, name:'${escapeHtml(c.name)}'})">
                            <div class="course-cover" style="background:linear-gradient(${135 + i * 30}deg, #${['667eea','764ba2','f093fb','4facfe','43e97b','fa709a'][i % 6]} 0%, #${['764ba2','667eea','f5576c','00f2fe','38f9d7','fee140'][i % 6]} 100%);">
                                ${icons[i % icons.length]}
                            </div>
                            <div class="course-info">
                                <h3>${escapeHtml(c.name)}</h3>
                                <p>${escapeHtml(c.description || '').substring(0, 60)}...</p>
                                <div class="course-meta">
                                    <span>👨‍🏫 ${escapeHtml(c.teacher_name || '教师')}</span>
                                    <span>📝 ${c.exercise_count || 0} 题</span>
                                    <span>👥 ${c.student_count || 0} 人</span>
                                    ${c.enrolled ? '<span style="color:var(--success);">✓ 已选</span>' : (isStudent ? '<span style="color:var(--text-muted);">未选</span>' : '')}
                                </div>
                            </div>
                        </div>
                    `).join('')}
                    ${courses.length === 0 ? '<div class="empty-state"><div class="empty-icon">📚</div><h3>暂无课程</h3></div>' : ''}
                </div>
            `;
        } catch (e) {
            container.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><h3>加载失败</h3><p>${escapeHtml(e.message)}</p></div>`;
        }
    },

    // 学生凭密码选课弹窗
    _enrollWithPassword() {
        showModal(`
            <div class="modal-header"><h3>🔑 凭密码选课</h3><button class="modal-close" onclick="hideModal()">✕</button></div>
            <div class="modal-body">
                <p style="color:var(--text-muted);font-size:0.9rem;margin-bottom:1rem;">请向教师索取课程ID和选课密码后填入。</p>
                <div class="form-group">
                    <label>课程 ID *</label>
                    <input type="number" id="enroll-cid" class="form-control" placeholder="请输入课程ID数字">
                </div>
                <div class="form-group">
                    <label>选课密码 *</label>
                    <input type="password" id="enroll-pwd" class="form-control" placeholder="请输入选课密码">
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-outline" onclick="hideModal()">取消</button>
                <button class="btn btn-primary" onclick="Pages._submitEnrollWithPassword()">确认选课</button>
            </div>
        `);
    },

    async _submitEnrollWithPassword() {
        const cid = parseInt($('#enroll-cid').value);
        const pwd = $('#enroll-pwd').value.trim();
        if (!cid || !pwd) { showToast('请填写课程ID和密码', 'error'); return; }
        try {
            await API.post('/enrollments', { course_id: cid, password: pwd });
            hideModal();
            showToast('选课成功！', 'success');
            Pages.courses();
        } catch (e) {
            showToast(e.message, 'error');
        }
    },



    // ── 课程详情 ────────────────────────────────────────
    async courseDetail(params) {
        const container = $('#page-content');
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">⏳</div><h3>加载中...</h3></div>';

        try {
            // 并行加载课程详情数据
            const [exercisesRes, announcementsRes, learningRes] = await Promise.all([
                API.get('/courses/' + params.id + '/exercises', { page: 1, page_size: 100 }),
                API.get('/courses/' + params.id + '/announcements').catch(() => ({data: []})),
                API.get('/courses/' + params.id + '/learning').catch(() => ({files: [], folder: null})),
            ]);

            const exercises = exercisesRes.items || [];
            const exercisesTotal = exercisesRes.total || 0;
            const announcements = announcementsRes.data || [];
            const learningFiles = learningRes.files || [];
            const learningFolder = learningRes.folder || null;

            container.innerHTML = `
                <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:1.25rem;">
                    <button class="btn btn-ghost" onclick="App.navigate('courses')">← 返回</button>
                    <h2>${escapeHtml(params.name)}</h2>
                </div>

                <!-- 标签页导航 -->
                <div class="tabs" style="margin-bottom:1.25rem;">
                    <button class="tab-btn active" data-tab="exercises" onclick="Pages._switchCourseTab('exercises', ${params.id})">
                        📝 练习题 (${exercisesTotal})
                    </button>
                    <button class="tab-btn" data-tab="announcements" onclick="Pages._switchCourseTab('announcements', ${params.id})">
                        📢 公告 (${announcements.length})
                    </button>
                    <button class="tab-btn" data-tab="learning" onclick="Pages._switchCourseTab('learning', ${params.id})">
                        📖 学习资源 (${learningFiles.length})
                    </button>
                </div>

                <!-- 标签页内容容器 -->
                <div id="course-tab-content">
                    ${Pages._renderCourseExercisesTab(exercises)}
                </div>
            `;

            // 保存数据供标签切换使用
            const isTeacher = ['teacher','admin'].includes(App.user.role);
            App._courseDetailData = {
                courseId: params.id,
                courseName: params.name,
                exercises,
                exercisesTotal,
                announcements,
                learningFiles,
                learningFolder,
                isTeacher
            };
        } catch (e) {
            container.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><h3>加载失败</h3><p>${escapeHtml(e.message)}</p></div>`;
        }
    },

    _switchCourseTab(tabName, courseId) {
        // 更新标签按钮状态
        document.querySelectorAll('.tabs .tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        // 渲染对应标签内容
        const data = App._courseDetailData;
        const container = $('#course-tab-content');
        
        switch(tabName) {
            case 'exercises':
                container.innerHTML = Pages._renderCourseExercisesTab(data.exercises);
                break;
            case 'announcements':
                container.innerHTML = Pages._renderCourseAnnouncementsTab(data.announcements);
                break;
            case 'learning':
                container.innerHTML = Pages._renderCourseLearningTab(data.learningFiles, courseId, data.learningFolder);
                break;
        }
    },

    _renderCourseExercisesTab(exercises) {
        const data = App._courseDetailData;
        const isTeacher = data && data.isTeacher;
        if (!exercises || exercises.length === 0) {
            return `<div class="card"><div class="card-header">
                ${isTeacher ? `<span class="card-title">📝 练习题管理</span>
                <div style="display:flex;gap:0.5rem;">
                    <button class="btn btn-primary btn-sm" onclick="Pages._createCourseExercise(${data.courseId})">+ 新建题目</button>
                    <button class="btn btn-outline btn-sm" onclick="Pages._uploadCourseExercises(${data.courseId})">📤 批量上传</button>
                </div>` : '<span class="card-title">📝 练习题</span>'}
            </div><div class="empty-state"><div class="empty-icon">📝</div><h3>暂无练习题</h3>
            ${isTeacher ? '<p>点击上方按钮创建题目或批量上传</p>' : ''}</div></div>`;
        }
        return `
            <div class="card">
                <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
                    <span class="card-title">📝 练习题 (${exercises.length})</span>
                    ${isTeacher ? `<div style="display:flex;gap:0.5rem;">
                        <button class="btn btn-primary btn-sm" onclick="Pages._createCourseExercise(${data.courseId})">+ 新建</button>
                        <button class="btn btn-outline btn-sm" onclick="Pages._uploadCourseExercises(${data.courseId})">📤 批量上传</button>
                        <button class="btn btn-outline btn-sm" onclick="Pages._exportCourseExercises(${data.courseId})">📥 导出</button>
                    </div>` : ''}
                </div>
                <div class="table-container">
                    <table>
                        <thead><tr><th>#</th><th>题目</th><th>分类</th><th>难度</th><th>语言</th>${isTeacher ? '' : '<th>状态</th>'}<th>操作</th></tr></thead>
                        <tbody>
                            ${exercises.map((e, i) => `
                                <tr>
                                    <td>${i + 1}</td>
                                    <td><strong>${escapeHtml(e.title)}</strong>${e.check_code ? ' <span style="color:var(--warning);font-size:0.75rem;" title="开启检查代码">🔍</span>' : ''}</td>
                                    <td>${escapeHtml(e.category_name || '-')}</td>
                                    <td><span class="badge badge-${e.difficulty}">${difficultyText(e.difficulty)}</span></td>
                                    <td>${languageIcon(e.language)} ${e.language}</td>
                                    ${isTeacher ? '' : `<td>${e.my_status ? `<span class="badge badge-${e.my_status.status}">${statusText(e.my_status.status)}</span>` : '<span style="color:var(--text-muted);">未做</span>'}</td>`}
                                    <td style="display:flex;gap:0.25rem;flex-wrap:wrap;">
                                        <button class="btn btn-sm btn-primary" onclick="App.navigate('exercise-do',{id:${e.id}})">${isTeacher ? '预览' : '做题'}</button>
                                        ${isTeacher && e.course_id ? `
                                            <button class="btn btn-sm btn-outline" onclick="Pages._moveExercise(${data.courseId},${e.id},'up')" title="上移" ${!e.course_id ? 'disabled style="opacity:0.4;cursor:not-allowed;"' : ''}>⬆</button>
                                            <button class="btn btn-sm btn-outline" onclick="Pages._moveExercise(${data.courseId},${e.id},'down')" title="下移" ${!e.course_id ? 'disabled style="opacity:0.4;cursor:not-allowed;"' : ''}>⬇</button>
                                            <button class="btn btn-sm" style="color:#e74c3c;border-color:#e74c3c;" onclick="Pages._deleteCourseExercise(${data.courseId},${e.id},'${escapeHtml(e.title)}')">删除</button>
                                        ` : ''}
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    // ── 课程题目管理方法（教师/管理员） ──────────
    _createCourseExercise(cid) {
        showModal(`
            <div class="modal-title">📝 新建练习题</div>
            <div style="max-height:65vh;overflow-y:auto;">
                <div class="form-group"><label>题目标题 *</label><input type="text" id="ce-title" placeholder="如：Hello World"></div>
                <div class="form-row">
                    <div class="form-group"><label>难度</label><select id="ce-diff"><option value="easy">简单</option><option value="medium">中等</option><option value="hard">困难</option></select></div>
                    <div class="form-group"><label>语言</label><select id="ce-lang"><option value="python">Python</option><option value="javascript">JavaScript</option><option value="c">C</option><option value="cpp">C++</option></select></div>
                </div>
                <div class="form-group"><label>题目描述 (Markdown) *</label><textarea id="ce-desc" rows="5" placeholder="支持 Markdown 格式"></textarea></div>
                <div class="form-group"><label>代码模板</label><textarea id="ce-template" rows="4" style="font-family:var(--font-mono);" placeholder="# 代码模板"></textarea></div>
                <div class="form-group"><label>测试用例 (JSON 格式) *</label><textarea id="ce-tests" rows="4" style="font-family:var(--font-mono);" placeholder='[{"input":"4\\n","output":"even\\n"}]'></textarea></div>
                <div style="margin-bottom:0.5rem;">
                    <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;">
                        <input type="checkbox" id="ce-check-code" onchange="document.getElementById('ce-ref-code-group').style.display=this.checked?'block':'none'">
                        🔍 检查代码（提交前比对参考代码）
                    </label>
                </div>
                <div id="ce-ref-code-group" style="display:none;margin-bottom:0.5rem;">
                    <div class="form-group"><label>参考代码</label><textarea id="ce-ref-code" rows="6" style="font-family:var(--font-mono);"></textarea>
                    <small style="color:var(--text-muted);">学生提交的代码必须与此完全一致，否则判0分</small></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label>时间限制(秒)</label><input type="number" id="ce-time" value="10"></div>
                    <div class="form-group"><label>内存限制(MB)</label><input type="number" id="ce-mem" value="256"></div>
                </div>
            </div>
            <div style="display:flex;gap:0.5rem;justify-content:flex-end;margin-top:1rem;">
                <button class="btn btn-outline" onclick="hideModal()">取消</button>
                <button class="btn btn-primary" onclick="Pages._saveCourseExercise(${cid})">创建</button>
            </div>
        `);
    },

    async _saveCourseExercise(cid) {
        try {
            let tests = [];
            try { tests = JSON.parse($('#ce-tests').value); } catch { showToast('测试用例 JSON 格式错误', 'error'); return; }
            const checkCode = $('#ce-check-code') ? $('#ce-check-code').checked : false;
            const refCode = checkCode && $('#ce-ref-code') ? $('#ce-ref-code').value : null;
            if (checkCode && !refCode) { showToast('开启检查代码后必须填写参考代码', 'error'); return; }
            await API.post('/courses/' + cid + '/exercises', {
                title: $('#ce-title').value,
                difficulty: $('#ce-diff').value,
                language: $('#ce-lang').value,
                description: $('#ce-desc').value,
                template_code: $('#ce-template').value,
                test_cases: tests,
                check_code: checkCode,
                reference_code: refCode,
                time_limit: parseInt($('#ce-time').value) || 10,
                memory_limit: parseInt($('#ce-mem').value) || 256,
            });
            hideModal();
            showToast('题目创建成功！', 'success');
            App.navigate('course-detail', { id: cid, name: App._courseDetailData.courseName });
        } catch (e) { showToast(e.message, 'error'); }
    },

    _uploadCourseExercises(cid) {
        showModal(`
            <div class="modal-title">📤 批量上传练习题</div>
            <div class="modal-body" style="max-height:65vh;overflow-y:auto;">
                <div class="form-group">
                    <label>上传 JSON 文件</label>
                    <input type="file" id="ce-upload-file" accept=".json" style="margin-bottom:0.5rem;">
                    <small style="color:var(--text-muted);">JSON 格式：<code>[{"title":"...","description":"...","test_cases":[...], ...}]</code></small>
                </div>
                <div class="form-group">
                    <label>或直接粘贴 JSON</label>
                    <textarea id="ce-upload-json" rows="8" style="font-family:var(--font-mono);" placeholder='[{"title":"题目","description":"描述","test_cases":[{"input":"4","output":"even"}]}]'></textarea>
                </div>
                <div style="background:var(--bg-secondary);padding:0.75rem;border-radius:0.5rem;font-size:0.8rem;color:var(--text-muted);">
                    <strong>支持的字段：</strong>title(必填), description(必填), difficulty, language, template_code, test_cases(必填), reference_code, check_code, time_limit, memory_limit
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-outline" onclick="hideModal()">取消</button>
                <button class="btn btn-primary" onclick="Pages._doUploadExercises(${cid})">上传</button>
            </div>
        `);
        // 文件选择事件
        setTimeout(() => {
            const fileInput = document.getElementById('ce-upload-file');
            if (fileInput) fileInput.addEventListener('change', function(e) {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = function(ev) { document.getElementById('ce-upload-json').value = ev.target.result; };
                reader.readAsText(file);
            });
        }, 100);
    },

    async _doUploadExercises(cid) {
        try {
            let exercises = [];
            const jsonText = $('#ce-upload-json').value.trim();
            if (!jsonText) { showToast('请选择文件或粘贴 JSON', 'error'); return; }
            try { exercises = JSON.parse(jsonText); } catch { showToast('JSON 格式错误', 'error'); return; }
            if (!Array.isArray(exercises)) { showToast('JSON 必须是数组格式', 'error'); return; }
            const result = await API.post('/courses/' + cid + '/exercises/batch', { exercises });
            hideModal();
            let msg = `成功导入 ${result.created.length} 道题目`;
            if (result.errors.length > 0) msg += `，${result.errors.length} 个失败`;
            showToast(msg, result.errors.length > 0 ? 'warning' : 'success');
            App.navigate('course-detail', { id: cid, name: App._courseDetailData.courseName });
        } catch (e) { showToast(e.message, 'error'); }
    },

    async _exportCourseExercises(cid) {
        try {
            const data = await API.get('/courses/' + cid + '/exercises/export');
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `course_${cid}_exercises.json`; a.click();
            URL.revokeObjectURL(url);
            showToast('导出成功', 'success');
        } catch (e) { showToast(e.message, 'error'); }
    },

    async _moveExercise(cid, eid, direction) {
        try {
            await API.put('/courses/' + cid + '/exercises/' + eid + '/move', { direction });
            App.navigate('course-detail', { id: cid, name: App._courseDetailData.courseName });
        } catch (e) { showToast(e.message, 'error'); }
    },

    async _deleteCourseExercise(cid, eid, title) {
        if (!confirm(`确定删除题目「${title}」？该题目的所有提交记录也会被删除。`)) return;
        try {
            await API.delete('/courses/' + cid + '/exercises/' + eid);
            showToast('题目已删除', 'success');
            App.navigate('course-detail', { id: cid, name: App._courseDetailData.courseName });
        } catch (e) { showToast(e.message, 'error'); }
    },

    _renderCourseAnnouncementsTab(announcements) {
        if (!announcements || announcements.length === 0) {
            return `<div class="card"><div class="empty-state"><div class="empty-icon">📢</div><h3>暂无公告</h3></div></div>`;
        }
        return `
            <div class="card">
                <div class="card-header"><span class="card-title">📢 课程公告</span></div>
                ${announcements.map(a => `
                    <div class="announcement-item" style="padding:1rem;border-bottom:1px solid var(--border-light);">
                        <div class="announcement-title" style="font-weight:600;margin-bottom:0.5rem;">${escapeHtml(a.title)}</div>
                        <div class="announcement-content" style="color:var(--text-secondary);margin-bottom:0.5rem;">${escapeHtml(a.content)}</div>
                        <div class="announcement-time" style="font-size:0.8rem;color:var(--text-muted);">${timeAgo(a.created_at)} · ${escapeHtml(a.author_name || '管理员')}</div>
                    </div>
                `).join('')}
            </div>
        `;
    },

    _renderCourseLearningTab(files, courseId, learningFolder) {
        // 从 localStorage 获取用户信息（更可靠）
        let userRole = null;
        try {
            const userStr = localStorage.getItem('cc_user');
            if (userStr) {
                const user = JSON.parse(userStr);
                userRole = user.role;
            }
        } catch (e) {}
        
        // 如果 localStorage 没有，尝试从 App.user 获取
        if (!userRole && App.user) {
            userRole = App.user.role;
        }
        
        const isTeacherOrAdmin = userRole === 'teacher' || userRole === 'admin';
        
        // 每个课程有默认的学习目录，直接使用
        const folder = learningFolder || `course_${courseId}`;
        
        // 构建按钮组
        const actionBtns = isTeacherOrAdmin 
            ? `<button class="btn btn-sm btn-primary" onclick="Pages._showLearningUploadModal('${escapeHtml(folder)}', ${courseId})">📤 上传资料</button>`
            : '';

        if (!files || files.length === 0) {
            return `
                <div class="card">
                    <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
                        <span class="card-title">📖 学习资源</span>
                        <div style="display:flex;gap:0.5rem;">${actionBtns}</div>
                    </div>
                    <div class="empty-state" style="padding:2rem;">
                        <div class="empty-icon">📖</div>
                        <h3>暂无学习资源</h3>
                        <p>该课程尚未上传学习资料</p>
                    </div>
                </div>
            `;
        }
        return `
            <div class="card">
                <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
                    <span class="card-title">📖 学习资源</span>
                    <div style="display:flex;gap:0.5rem;">${actionBtns}</div>
                </div>
                <div style="padding:1rem;">
                    ${files.map(f => {
                        const extIcon = { '.html': '🌐', '.json': '📋', '.md': '📝' }[f.ext] || '📄';
                        const deleteBtn = isTeacherOrAdmin 
                            ? `<button class="btn btn-sm" style="color:#e74c3c;padding:0.25rem 0.5rem;" onclick="event.stopPropagation();Pages._deleteLearningFile('${escapeHtml(f.path)}', ${courseId})" title="删除">🗑️</button>` 
                            : '';
                        return `
                            <div class="learning-file-item" 
                                onclick="Pages._loadCourseLearningFile('${escapeHtml(f.path)}', '${escapeHtml(f.name)}', '${escapeHtml(f.ext)}', ${courseId})"
                                style="padding:0.75rem 1rem;border-bottom:1px solid var(--border-light);cursor:pointer;display:flex;align-items:center;gap:0.75rem;transition:background 0.15s;"
                                onmouseenter="this.style.background='var(--bg-secondary)'"
                                onmouseleave="this.style.background=''">
                                <span style="font-size:1.25rem;">${extIcon}</span>
                                <span style="flex:1;font-weight:500;">${escapeHtml(f.name)}</span>
                                <span style="font-size:0.8rem;color:var(--text-muted);">${formatFileSize(f.size)}</span>
                                ${deleteBtn}
                                <span style="color:var(--text-muted);">›</span>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
            <div id="course-learning-preview" style="margin-top:1rem;"></div>
        `;
    },

    async _deleteLearningFile(filepath, courseId) {
        if (!confirm('确定要删除这个学习资料吗？此操作不可恢复。')) {
            return;
        }
        try {
            await API.delete(`/learning/file/${encodeURIComponent(filepath)}`);
            showToast('删除成功', 'success');
            // 刷新文件列表
            const learningRes = await API.get('/courses/' + courseId + '/learning');
            App._courseDetailData.learningFiles = learningRes.data || [];
            App._courseDetailData.learningFolder = learningRes.folder || null;
            Pages._switchCourseTab('learning', courseId);
        } catch (e) {
            showToast(e.message, 'error');
        }
    },

    _showLearningUploadModal(folder, courseId) {
        showModal(`
            <div class="modal-header"><h3>📤 上传学习资料</h3><button class="modal-close" onclick="hideModal()">✕</button></div>
            <div class="modal-body">
                <div class="form-group">
                    <label>目标目录</label>
                    <input type="text" class="form-control" value="${escapeHtml(folder)}" disabled>
                    <small style="color:var(--text-muted);">文件将上传到 learning/${escapeHtml(folder)}/ 目录</small>
                </div>
                <div class="form-group">
                    <label>选择文件 *</label>
                    <input type="file" id="learning-upload-file" class="form-control" accept=".html,.json,.md">
                    <small style="color:var(--text-muted);">支持 .html / .json / .md 格式</small>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-outline" onclick="hideModal()">取消</button>
                <button class="btn btn-primary" onclick="Pages._uploadLearningFile('${escapeHtml(folder)}', ${courseId})">上传</button>
            </div>
        `);
    },

    async _uploadLearningFile(folder, courseId) {
        const fileInput = $('#learning-upload-file');
        if (!fileInput.files || fileInput.files.length === 0) {
            showToast('请选择要上传的文件', 'error');
            return;
        }
        const file = fileInput.files[0];
        const ext = file.name.split('.').pop().toLowerCase();
        if (!['html', 'json', 'md'].includes(ext)) {
            showToast('仅支持 .html / .json / .md 文件', 'error');
            return;
        }

        const formData = new FormData();
        formData.append('file', file);
        formData.append('folder', folder);

        try {
            const res = await fetch('/api/learning/upload', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${API.token}` },
                body: formData
            });
            const json = await res.json();
            if (json.code === 0) {
                showToast('上传成功！', 'success');
                hideModal();
                // 刷新当前页面以显示新上传的文件
                Pages._switchCourseTab('learning', courseId);
                // 更新数据
                const learningRes = await API.get('/courses/' + courseId + '/learning');
                App._courseDetailData.learningFiles = learningRes.data || [];
                App._courseDetailData.learningFolder = learningRes.folder || null;
            } else {
                throw new Error(json.message || '上传失败');
            }
        } catch (e) {
            showToast(e.message, 'error');
        }
    },

    async _loadCourseLearningFile(path, name, ext, courseId) {
        const preview = $('#course-learning-preview');
        preview.innerHTML = '<div class="card" style="padding:2rem;text-align:center;"><div class="spinner"></div><p>加载中...</p></div>';

        try {
            const res = await API.get(`/learning/file/${encodeURIComponent(path)}`);
            const { content, filename } = res;

            let contentHtml = '';
            if (ext === '.html') {
                const blob = new Blob([content], { type: 'text/html;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                contentHtml = `<iframe src="${url}" style="width:100%;height:500px;border:none;border-radius:0.5rem;" onload="URL.revokeObjectURL('${url}')"></iframe>`;
            } else if (ext === '.json') {
                let parsed;
                try { parsed = JSON.parse(content); } catch { parsed = null; }
                if (parsed && (parsed.title || parsed.chapters || parsed.sections)) {
                    contentHtml = Pages._renderJsonCourse(parsed, name);
                } else {
                    contentHtml = `<pre style="background:var(--bg-secondary);padding:1rem;border-radius:0.5rem;overflow:auto;">${escapeHtml(JSON.stringify(parsed||content, null, 2))}</pre>`;
                }
            } else if (ext === '.md') {
                const html = App.renderMarkdown(content);
                contentHtml = `<div class="markdown-body" style="padding:1rem;">${html}</div>`;
            }

            preview.innerHTML = `
                <div class="card">
                    <div class="card-header" style="display:flex;align-items:center;gap:0.75rem;">
                        <span class="card-title">${escapeHtml(name)}</span>
                        <span style="margin-left:auto;font-size:0.8rem;color:var(--text-muted);">${filename}</span>
                        <button class="btn btn-sm btn-outline" onclick="$('#course-learning-preview').innerHTML=''">关闭</button>
                    </div>
                    <div style="max-height:600px;overflow:auto;">${contentHtml}</div>
                </div>
            `;
        } catch (e) {
            preview.innerHTML = `<div class="card" style="padding:2rem;text-align:center;color:#e74c3c;">❌ 加载失败：${escapeHtml(e.message)}</div>`;
        }
    },

    // ── 题库练习 ────────────────────────────────────────
    async exercises(params = {}) {
        const container = $('#page-content');
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">⏳</div><h3>加载中...</h3></div>';

        try {
            const data = await API.get('/exercises', { page: 1, page_size: 100, ...params });

            container.innerHTML = `
                <div class="toolbar">
                    <div class="search-box">
                        <input type="text" placeholder="搜索题目..." id="exercise-search" value="${escapeHtml(params.search || '')}" onkeydown="if(event.key==='Enter')Pages.exercises({...App.currentParams, search:this.value})">
                    </div>
                    <div class="filter-group">
                        <button class="filter-btn ${!params.difficulty ? 'active' : ''}" onclick="Pages.exercises({...App.currentParams, difficulty:''})">全部</button>
                        <button class="filter-btn ${params.difficulty==='easy' ? 'active' : ''}" onclick="Pages.exercises({...App.currentParams, difficulty:'easy'})">简单</button>
                        <button class="filter-btn ${params.difficulty==='medium' ? 'active' : ''}" onclick="Pages.exercises({...App.currentParams, difficulty:'medium'})">中等</button>
                        <button class="filter-btn ${params.difficulty==='hard' ? 'active' : ''}" onclick="Pages.exercises({...App.currentParams, difficulty:'hard'})">困难</button>
                    </div>
                    <div class="filter-group">
                        <button class="filter-btn ${!params.language ? 'active' : ''}" onclick="Pages.exercises({...App.currentParams, language:''})">全部</button>
                        <button class="filter-btn ${params.language==='python' ? 'active' : ''}" onclick="Pages.exercises({...App.currentParams, language:'python'})">🐍 Python</button>
                        <button class="filter-btn ${params.language==='javascript' ? 'active' : ''}" onclick="Pages.exercises({...App.currentParams, language:'javascript'})">🟨 JS</button>
                    </div>
                </div>
                <div class="card">
                    <div class="table-container">
                        <table>
                            <thead><tr><th>#</th><th>题目</th><th>分类</th><th>难度</th><th>语言</th><th>时间</th><th>内存</th><th>状态</th><th>操作</th></tr></thead>
                            <tbody>
                                ${data.items.map((e, i) => `
                                    <tr>
                                        <td>${i + 1}</td>
                                        <td><strong>${escapeHtml(e.title)}</strong></td>
                                        <td>${escapeHtml(e.category_name || '-')}</td>
                                        <td><span class="badge badge-${e.difficulty}">${difficultyText(e.difficulty)}</span></td>
                                        <td><span class="badge badge-${e.language}">${languageIcon(e.language)} ${e.language}</span></td>
                                        <td>${e.time_limit}s</td>
                                        <td>${e.memory_limit}MB</td>
                                        <td>${e.my_status ? `<span class="badge badge-${e.my_status.status}">${statusText(e.my_status.status)} ${e.my_status.best_score}分</span>` : '-'}</td>
                                        <td><button class="btn btn-sm btn-primary" onclick="App.navigate('exercise-do',{id:${e.id}})">做题</button></td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                    ${data.total === 0 ? '<div class="empty-state"><div class="empty-icon">📝</div><h3>暂无匹配的题目</h3></div>' : ''}
                </div>
            `;
        } catch (e) {
            container.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><h3>加载失败</h3><p>${escapeHtml(e.message)}</p></div>`;
        }
    },

    // ── 做题界面 ────────────────────────────────────────
    async exerciseDo(params) {
        const container = $('#page-content');
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">⏳</div><h3>加载题目中...</h3></div>';

        try {
            const exercise = await API.get('/exercises/' + params.id);
            const code = exercise.template_code || `# ${exercise.title}\n`;

            container.innerHTML = `
                <div class="exercise-layout">
                    <div class="exercise-desc">
                        <div class="exercise-desc-header">
                            <h3>${escapeHtml(exercise.title)}</h3>
                            <div style="display:flex;gap:0.5rem;align-items:center;">
                                <span class="badge badge-${exercise.difficulty}">${difficultyText(exercise.difficulty)}</span>
                                <span class="badge badge-${exercise.language}">${languageIcon(exercise.language)} ${exercise.language}</span>
                                <span style="font-size:0.8rem;color:var(--text-muted);">⏱ ${exercise.time_limit}s &nbsp; 💾 ${exercise.memory_limit}MB</span>
                            </div>
                        </div>
                        <div class="exercise-desc-body md-content">
                            ${App.renderMarkdown(exercise.description)}
                        </div>
                    </div>
                    <div class="exercise-code">
                        <div class="code-header">
                            <span style="color:#cdd6f4;font-size:0.85rem;">${languageIcon(exercise.language)} 代码编辑器</span>
                            <select id="lang-select" onchange="Pages._switchLang(this.value)">
                                <option value="python" ${exercise.language === 'python' ? 'selected' : ''}>Python</option>
                                <option value="javascript" ${exercise.language === 'javascript' ? 'selected' : ''}>JavaScript</option>
                                <option value="c" ${exercise.language === 'c' ? 'selected' : ''}>C</option>
                                <option value="cpp" ${exercise.language === 'cpp' ? 'selected' : ''}>C++</option>
                            </select>
                            <div class="code-actions">
                                <button class="btn btn-run" onclick="Pages._runCode(${params.id})">▶ 运行</button>
                                <button class="btn btn-submit" onclick="Pages._submitCode(${params.id})">✓ 提交</button>
                            </div>
                        </div>
                        <div class="code-editor-wrap">
                            <textarea id="code-editor">${escapeHtml(code)}</textarea>
                        </div>
                        <div class="code-output" id="code-output-area">
                            <div class="output-tabs">
                                <div class="output-tab active" onclick="Pages._switchTab('output',this)">输出</div>
                                <div class="output-tab" onclick="Pages._switchTab('testcases',this)">测试结果</div>
                            </div>
                            <div class="output-content" id="output-content">点击「运行」查看输出结果</div>
                            <div class="output-content" id="testcases-content" style="display:none;">提交后查看测试结果</div>
                            <div class="output-status" id="output-status" style="display:none;"></div>
                        </div>
                    </div>
                </div>
            `;

            // 初始化 CodeMirror
            setTimeout(() => {
                App.createEditor('code-editor', exercise.language, code);
            }, 50);
        } catch (e) {
            container.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><h3>加载失败</h3><p>${escapeHtml(e.message)}</p><button class="btn btn-primary" onclick="App.navigate('exercises')">返回题库</button></div>`;
        }
    },

    _switchLang(lang) {
        if (App.editor) {
            const modeMap = { python: 'python', javascript: 'javascript', c: 'text/x-csrc', cpp: 'text/x-c++src' };
            App.editor.setOption('mode', modeMap[lang] || 'python');
        }
    },

    _switchTab(tab, el) {
        $$('.output-tab').forEach(t => t.classList.remove('active'));
        el.classList.add('active');
        $('#output-content').style.display = tab === 'output' ? 'block' : 'none';
        $('#testcases-content').style.display = tab === 'testcases' ? 'block' : 'none';
    },

    async _runCode(exerciseId) {
        if (!App.editor) return;
        const code = App.editor.getValue();
        const language = $('#lang-select').value;
        const outputEl = $('#output-content');
        const statusEl = $('#output-status');

        outputEl.textContent = '运行中...';
        outputEl.className = 'output-content';
        statusEl.style.display = 'block';
        statusEl.className = 'output-status running';
        statusEl.textContent = '⏳ 正在执行...';

        try {
            const result = await API.execute(code, language);
            outputEl.textContent = result.stdout || '(无输出)';
            outputEl.className = result.exit_code === 0 ? 'output-content success' : 'output-content error';
            if (result.stderr) {
                outputEl.textContent += '\n--- 错误输出 ---\n' + result.stderr;
            }
            statusEl.className = result.exit_code === 0 ? 'output-status accepted' : 'output-status wrong';
            statusEl.textContent = result.exit_code === 0
                ? `✅ 运行成功 (${result.time_ms}ms)`
                : `❌ 运行错误 (退出码: ${result.exit_code})`;
        } catch (e) {
            outputEl.textContent = '执行失败: ' + e.message;
            outputEl.className = 'output-content error';
            statusEl.className = 'output-status wrong';
            statusEl.textContent = '❌ 连接失败';
        }
    },

    async _submitCode(exerciseId) {
        if (!App.editor) return;
        const code = App.editor.getValue();
        const language = $('#lang-select').value;
        const statusEl = $('#output-status');
        const tcEl = $('#testcases-content');

        statusEl.style.display = 'block';
        statusEl.className = 'output-status running';
        statusEl.textContent = '📤 提交评测中...';

        // 切换到测试结果标签页
        $$('.output-tab')[1].click();

        try {
            // 同步提交 - 结果直接返回
            const result = await API.post('/submissions', {
                exercise_id: exerciseId,
                code,
                language,
            });

            // 立即显示结果
            statusEl.className = result.status === 'accepted' ? 'output-status accepted' : 'output-status wrong';
            statusEl.textContent = result.status === 'accepted'
                ? `✅ 全部通过！得分: ${result.score}分 (${result.execution_time}ms)`
                : `${statusText(result.status)} 得分: ${result.score || 0}分`;

            // 代码检查结果提示
            let codeCheckHtml = '';
            if (result.code_check) {
                if (result.code_check.passed) {
                    codeCheckHtml = '<div style="padding:0.5rem;margin-bottom:0.5rem;background:rgba(166,227,161,0.15);border:1px solid #a6e3a1;border-radius:0.5rem;font-size:0.85rem;color:#a6e3a1;">🔍 代码检查：通过 ✅ 代码与参考答案一致</div>';
                } else {
                    codeCheckHtml = `<div style="padding:0.5rem;margin-bottom:0.5rem;background:rgba(243,139,168,0.15);border:1px solid #f38ba8;border-radius:0.5rem;font-size:0.85rem;color:#f38ba8;">
                        🔍 代码检查：不通过 ❌ ${escapeHtml(result.code_check.message)}
                    </div>`;
                }
            }

            if (result.test_results && result.test_results.length > 0) {
                tcEl.innerHTML = codeCheckHtml + result.test_results.map(t => `
                    <div style="padding:0.4rem 0;border-bottom:1px solid #313244;">
                        ${t.status === 'code_check_failed'
                            ? '<span>🔍 代码检查不通过</span>'
                            : `<span>${t.status === 'accepted' ? '✅ 通过' : '❌ 未通过'} 测试用例 #${t.test}</span>`}
                        <span style="float:right;color:#a6adc8;">${t.time_ms}ms</span>
                        ${t.status === 'code_check_failed' ? `<div style="color:#f38ba8;font-size:0.78rem;margin-top:0.2rem;white-space:pre-wrap;">${escapeHtml(t.actual)}</div>` : ''}
                        ${t.status !== 'accepted' && t.status !== 'code_check_failed' ? `<div style="color:#f38ba8;font-size:0.78rem;margin-top:0.2rem;">期望输出: ${escapeHtml(t.expected).substring(0,60)}</div><div style="color:#f38ba8;font-size:0.78rem;">实际输出: ${escapeHtml(t.actual).substring(0,60)}</div>` : ''}
                    </div>
                `).join('');
            } else {
                tcEl.innerHTML = codeCheckHtml + (result.stdout || '');
                if (result.stderr) tcEl.innerHTML += '\n--- 错误输出 ---\n' + result.stderr;
            }

        } catch (e) {
            statusEl.className = 'output-status wrong';
            statusEl.textContent = '❌ 提交失败: ' + e.message;
            showToast(e.message, 'error');
        }
    },

    // ── 代码池 ──────────────────────────────────────────
    _poolEditorId: null,
    _poolEditor: null,

    async codePool() {
        const container = $('#page-content');
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">⏳</div><h3>加载中...</h3></div>';

        // Destroy old editor if any
        if (this._poolEditor) {
            try { this._poolEditor.toTextArea(); } catch(e) {}
            this._poolEditor = null;
            this._poolEditorId = null;
        }

        try {
            const data = await API.get('/code-pool', { page: 1, page_size: 50 });
            const codes = data.items || [];

            container.innerHTML = `
                <div class="toolbar">
                    <h3>🗂️ 我的代码池 (${data.total} 份代码)</h3>
                    <div style="margin-left:auto;display:flex;gap:0.5rem;">
                        <div class="search-box">
                            <input type="text" placeholder="搜索代码..." id="pool-search">
                        </div>
                        <button class="btn btn-primary" onclick="Pages._newCode()">+ 新建代码</button>
                    </div>
                </div>
                <div id="pool-list" class="code-pool-grid">
                    ${codes.map(c => Pages._renderCodeCard(c)).join('')}
                    ${codes.length === 0 ? '<div class="empty-state"><div class="empty-icon">🗂️</div><h3>代码池为空</h3><p>开始做题后，你的代码会自动保存在这里</p></div>' : ''}
                </div>
                <div id="pool-editor-panel" style="display:none;"></div>
            `;

            // 搜索过滤
            const searchInput = $('#pool-search');
            if (searchInput) {
                searchInput.addEventListener('input', () => {
                    const q = searchInput.value.toLowerCase();
                    document.querySelectorAll('#pool-list .code-card').forEach(card => {
                        const text = card.textContent.toLowerCase();
                        card.style.display = text.includes(q) ? '' : 'none';
                    });
                });
            }
        } catch (e) {
            container.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><h3>加载失败</h3><p>${escapeHtml(e.message)}</p></div>`;
        }
    },

    _renderCodeCard(c) {
        const lang = c.language || 'python';
        return `
            <div class="code-card" data-id="${c.id}"
                 onclick="event.stopPropagation(); Pages._poolEditCode(${c.id})"
                 ondblclick="event.stopPropagation(); Pages._poolCopyCode(${c.id})"
                 oncontextmenu="event.preventDefault();"
                 title="单击：编辑并运行 | 双击：复制代码">
                <div class="code-card-header">
                    <span class="code-card-title">${escapeHtml(c.title)}</span>
                    <span class="badge badge-${lang}">${languageIcon(lang)} ${lang}</span>
                </div>
                ${c.exercise_title ? `<div class="code-card-meta">关联题目：${escapeHtml(c.exercise_title)}</div>` : ''}
                <pre class="code-card-preview"><code>${escapeHtml(c.code.substring(0, 300))}${c.code.length > 300 ? '\n...' : ''}</code></pre>
                <div class="code-card-footer">
                    <span class="code-card-meta">${c.is_saved ? '💾 已保存' : '📝 草稿'} · ${timeAgo(c.updated_at)}</span>
                    <div class="code-card-actions">
                        <button class="btn btn-sm btn-run" onclick="event.stopPropagation(); Pages._poolRunCode(${c.id})" title="运行代码">▶ 运行</button>
                        <button class="btn btn-sm btn-copy" onclick="event.stopPropagation(); Pages._poolCopyCode(${c.id})" title="复制代码">📋 复制</button>
                        <button class="btn btn-sm btn-outline" onclick="event.stopPropagation(); Pages._poolEditCode(${c.id})" title="编辑代码">✏️ 编辑</button>
                        <button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); Pages._poolDeleteCode(${c.id})" title="删除">🗑️</button>
                    </div>
                </div>
            </div>
        `;
    },

    async _poolCopyCode(id) {
        try {
            const code = await API.get('/code-pool/' + id);
            await navigator.clipboard.writeText(code.code || code.data.code || '');
            showToast('代码已复制到剪贴板', 'success');
        } catch (e) {
            showToast('复制失败: ' + e.message, 'error');
        }
    },

    async _poolDeleteCode(id) {
        if (!confirm('确定要删除这份代码吗？')) return;
        try {
            await API.delete('/code-pool/' + id);
            showToast('代码已删除', 'success');
            Pages.codePool();
        } catch (e) {
            showToast(e.message, 'error');
        }
    },

    async _poolRunCode(id) {
        try {
            const code = await API.get('/code-pool/' + id);
            const codeText = code.code || code.data.code || '';
            const lang = code.language || code.data.language || 'python';
            // Show inline result in a toast or mini-output
            showToast('正在运行...', 'info');
            const result = await API.execute(codeText, lang);
            if (result.exit_code === 0) {
                showToast(`✅ 运行成功 (${result.time_ms}ms)\n${(result.stdout || '').substring(0, 100)}`, 'success');
            } else {
                showToast(`❌ 运行错误\n${(result.stderr || '').substring(0, 100)}`, 'error');
            }
        } catch (e) {
            showToast('运行失败: ' + e.message, 'error');
        }
    },

    async _poolEditCode(id) {
        try {
            const code = await API.get('/code-pool/' + id);
            const c = code.data || code;
            this._poolEditorId = id;

            const listEl = $('#pool-list');
            const editorEl = $('#pool-editor-panel');
            if (listEl) listEl.style.display = 'none';
            if (editorEl) {
                editorEl.style.display = 'block';
                editorEl.innerHTML = `
                    <div class="pool-ide">
                        <div class="pool-ide-header">
                            <button class="btn btn-ghost" onclick="Pages._poolBackToList()">← 返回列表</button>
                            <input type="text" id="pool-ide-title" value="${escapeHtml(c.title)}" style="flex:1;margin:0 0.75rem;padding:0.35rem 0.6rem;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg-card);color:var(--text);font-size:0.9rem;font-weight:600;">
                            <select id="pool-ide-lang" style="padding:0.35rem 0.5rem;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg-card);color:var(--text);">
                                <option value="python" ${c.language==='python'?'selected':''}>Python</option>
                                <option value="javascript" ${c.language==='javascript'?'selected':''}>JavaScript</option>
                                <option value="c" ${c.language==='c'?'selected':''}>C</option>
                                <option value="cpp" ${c.language==='cpp'?'selected':''}>C++</option>
                            </select>
                        </div>
                        <div class="pool-ide-editor">
                            <textarea id="pool-editor-textarea">${escapeHtml(c.code)}</textarea>
                        </div>
                        <div class="pool-ide-output" id="pool-ide-output" style="display:none;">
                            <div class="pool-ide-output-header">
                                <span>输出结果</span>
                                <button class="btn btn-sm btn-ghost" onclick="document.getElementById('pool-ide-output').style.display='none'">✕ 关闭</button>
                            </div>
                            <pre id="pool-ide-output-text"></pre>
                        </div>
                        <div class="pool-ide-actions">
                            <span id="pool-ide-status" style="font-size:0.8rem;color:var(--text-muted);"></span>
                            <div style="display:flex;gap:0.5rem;margin-left:auto;">
                                <button class="btn btn-run" onclick="Pages._poolIDERun()">▶ 运行</button>
                                <button class="btn btn-primary" onclick="Pages._poolIDESave()">💾 保存</button>
                            </div>
                        </div>
                    </div>
                `;

                // Destroy old editor
                if (this._poolEditor) {
                    try { this._poolEditor.toTextArea(); } catch(e) {}
                }
                // Create CodeMirror
                setTimeout(() => {
                    const modeMap = { python: 'python', javascript: 'javascript', c: 'text/x-csrc', cpp: 'text/x-c++src' };
                    const ta = document.getElementById('pool-editor-textarea');
                    if (ta) {
                        this._poolEditor = CodeMirror.fromTextArea(ta, {
                            mode: modeMap[c.language] || 'python',
                            theme: 'dracula',
                            lineNumbers: true,
                            matchBrackets: true,
                            autoCloseBrackets: true,
                            styleActiveLine: true,
                            indentUnit: 4,
                            tabSize: 4,
                            indentWithTabs: false,
                            lineWrapping: true,
                            viewportMargin: Infinity,
                        });
                        this._poolEditor.setValue(c.code);
                    }
                }, 50);
            }
        } catch (e) {
            showToast('加载代码失败: ' + e.message, 'error');
        }
    },

    _poolBackToList() {
        if (this._poolEditor) {
            // Check if code changed
            try {
                const currentCode = this._poolEditor.getValue();
                if (currentCode !== this._poolEditorOrigCode) {
                    if (!confirm('代码已修改但未保存，确定要返回吗？')) return;
                }
            } catch(e) {}
            try { this._poolEditor.toTextArea(); } catch(e) {}
            this._poolEditor = null;
        }
        this._poolEditorId = null;
        const listEl = $('#pool-list');
        const editorEl = $('#pool-editor-panel');
        if (listEl) listEl.style.display = '';
        if (editorEl) editorEl.style.display = 'none';
    },

    async _poolIDERun() {
        if (!this._poolEditor) return;
        const code = this._poolEditor.getValue();
        const lang = $('#pool-ide-lang').value;
        const outputEl = $('#pool-ide-output');
        const outputText = $('#pool-ide-output-text');
        const statusEl = $('#pool-ide-status');

        if (outputEl) outputEl.style.display = 'block';
        if (outputText) outputText.textContent = '运行中...';
        if (statusEl) statusEl.textContent = '⏳ 正在执行...';

        try {
            const result = await API.execute(code, lang);
            if (outputText) {
                let output = result.stdout || '(无输出)';
                if (result.stderr) output += '\n--- 错误输出 ---\n' + result.stderr;
                outputText.textContent = output;
                outputText.style.color = result.exit_code === 0 ? '#a6e3a1' : '#f38ba8';
            }
            if (statusEl) statusEl.textContent = result.exit_code === 0
                ? `✅ 运行成功 (${result.time_ms}ms)`
                : `❌ 运行错误 (退出码: ${result.exit_code})`;
        } catch (e) {
            if (outputText) { outputText.textContent = '执行失败: ' + e.message; outputText.style.color = '#f38ba8'; }
            if (statusEl) statusEl.textContent = '❌ 连接失败';
        }
    },

    async _poolIDESave() {
        if (!this._poolEditor || !this._poolEditorId) return;
        const code = this._poolEditor.getValue();
        const title = $('#pool-ide-title').value.trim() || '未命名代码';
        const language = $('#pool-ide-lang').value;
        const statusEl = $('#pool-ide-status');

        try {
            await API.put('/code-pool/' + this._poolEditorId, { title, code, language });
            // Record the saved code to detect future changes
            try { this._poolEditorOrigCode = code; } catch(e) {}
            if (statusEl) { statusEl.textContent = '💾 已保存'; statusEl.style.color = '#a6e3a1'; }
            showToast('代码已保存', 'success');
        } catch (e) {
            showToast('保存失败: ' + e.message, 'error');
            if (statusEl) { statusEl.textContent = '❌ 保存失败'; statusEl.style.color = '#f38ba8'; }
        }
    },

    _newCode() {
        // Open inline editor with new blank code
        this._poolEditorId = null;
        const listEl = $('#pool-list');
        const editorEl = $('#pool-editor-panel');
        if (listEl) listEl.style.display = 'none';
        if (editorEl) {
            editorEl.style.display = 'block';
            editorEl.innerHTML = `
                <div class="pool-ide">
                    <div class="pool-ide-header">
                        <button class="btn btn-ghost" onclick="Pages._poolBackToList()">← 返回列表</button>
                        <input type="text" id="pool-ide-title" value="未命名代码" style="flex:1;margin:0 0.75rem;padding:0.35rem 0.6rem;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg-card);color:var(--text);font-size:0.9rem;font-weight:600;">
                        <select id="pool-ide-lang" style="padding:0.35rem 0.5rem;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg-card);color:var(--text);">
                            <option value="python">Python</option>
                            <option value="javascript">JavaScript</option>
                            <option value="c">C</option>
                            <option value="cpp">C++</option>
                        </select>
                    </div>
                    <div class="pool-ide-editor">
                        <textarea id="pool-editor-textarea"># 在这里编写代码\nprint("Hello, World!")</textarea>
                    </div>
                    <div class="pool-ide-output" id="pool-ide-output" style="display:none;">
                        <div class="pool-ide-output-header">
                            <span>输出结果</span>
                            <button class="btn btn-sm btn-ghost" onclick="document.getElementById('pool-ide-output').style.display='none'">✕ 关闭</button>
                        </div>
                        <pre id="pool-ide-output-text"></pre>
                    </div>
                    <div class="pool-ide-actions">
                        <span id="pool-ide-status" style="font-size:0.8rem;color:var(--text-muted);">📝 新建代码</span>
                        <div style="display:flex;gap:0.5rem;margin-left:auto;">
                            <button class="btn btn-run" onclick="Pages._poolIDERun()">▶ 运行</button>
                            <button class="btn btn-primary" onclick="Pages._poolIDENewSave()">💾 保存到代码池</button>
                        </div>
                    </div>
                </div>
            `;
            // Destroy old editor
            if (this._poolEditor) {
                try { this._poolEditor.toTextArea(); } catch(e) {}
            }
            setTimeout(() => {
                const ta = document.getElementById('pool-editor-textarea');
                if (ta) {
                    this._poolEditor = CodeMirror.fromTextArea(ta, {
                        mode: 'python', theme: 'dracula',
                        lineNumbers: true, matchBrackets: true, autoCloseBrackets: true,
                        styleActiveLine: true, indentUnit: 4, tabSize: 4,
                        indentWithTabs: false, lineWrapping: true, viewportMargin: Infinity,
                    });
                    this._poolEditorOrigCode = this._poolEditor.getValue();
                }
            }, 50);
        }
    },

    async _poolIDENewSave() {
        if (!this._poolEditor) return;
        const code = this._poolEditor.getValue();
        if (!code.trim()) { showToast('代码不能为空', 'error'); return; }
        const title = $('#pool-ide-title').value.trim() || '未命名代码';
        const language = $('#pool-ide-lang').value;
        try {
            const result = await API.post('/code-pool', { title, code, language });
            this._poolEditorId = result.data.id;
            try { this._poolEditorOrigCode = code; } catch(e) {}
            showToast('代码已保存', 'success');
            const statusEl = $('#pool-ide-status');
            if (statusEl) { statusEl.textContent = '💾 已保存'; statusEl.style.color = '#a6e3a1'; }
        } catch (e) {
            showToast('保存失败: ' + e.message, 'error');
        }
    },

    async _poolCopyCode(id) {
        try {
            const code = await API.get('/code-pool/' + id);
            const codeText = code.code || code.data.code || '';
            await navigator.clipboard.writeText(codeText);
            showToast('代码已复制到剪贴板', 'success');
        } catch (e) {
            showToast('复制失败: ' + e.message, 'error');
        }
    },

    async _poolDeleteCode(id) {
        if (!confirm('确定要删除这份代码吗？')) return;
        try {
            await API.delete('/code-pool/' + id);
            showToast('代码已删除', 'success');
            Pages.codePool();
        } catch (e) {
            showToast(e.message, 'error');
        }
    },

    // ── 提交记录 ────────────────────────────────────────
    async submissions() {
        const container = $('#page-content');
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">⏳</div><h3>加载中...</h3></div>';

        try {
            const data = await API.get('/submissions', { page: 1, page_size: 30 });

            container.innerHTML = `
                <div class="card">
                    <div class="card-header">
                        <span class="card-title">📋 提交记录 (${data.total})</span>
                    </div>
                    <div class="table-container">
                        <table>
                            <thead>
                                <tr><th>#</th><th>题目</th><th>语言</th><th>状态</th><th>得分</th><th>耗时</th><th>提交时间</th><th>操作</th></tr>
                            </thead>
                            <tbody>
                                ${data.items.map(s => `
                                    <tr>
                                        <td>${s.id}</td>
                                        <td><strong>${escapeHtml(s.exercise_title)}</strong></td>
                                        <td>${languageIcon(s.language)} ${s.language}</td>
                                        <td><span class="badge badge-${s.status}">${statusText(s.status)}</span></td>
                                        <td><strong>${s.score !== null ? s.score : '-'}</strong></td>
                                        <td>${s.execution_time ? s.execution_time + 'ms' : '-'}</td>
                                        <td>${timeAgo(s.submitted_at)}</td>
                                        <td><button class="btn btn-sm btn-outline" onclick="Pages._viewSubmission(${s.id})">详情</button></td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                    ${data.total === 0 ? '<div class="empty-state"><div class="empty-icon">📋</div><h3>暂无提交记录</h3></div>' : ''}
                </div>
            `;
        } catch (e) {
            container.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><h3>加载失败</h3><p>${escapeHtml(e.message)}</p></div>`;
        }
    },

    async _viewSubmission(id) {
        try {
            const sub = await API.get('/submissions/' + id);
            showModal(`
                <div class="modal-title">提交详情 #${sub.id}</div>
                <div style="margin-bottom:1rem;">
                    <strong>题目：</strong>${escapeHtml(sub.exercise_title)}<br>
                    <strong>语言：</strong>${sub.language}<br>
                    <strong>状态：</strong><span class="badge badge-${sub.status}">${statusText(sub.status)}</span><br>
                    <strong>得分：</strong>${sub.score !== null ? sub.score + '分' : '-'}<br>
                    <strong>耗时：</strong>${sub.execution_time ? sub.execution_time + 'ms' : '-'}
                </div>
                ${sub.test_results ? `
                    <div style="margin-bottom:1rem;">
                        <strong>测试结果：</strong>
                        ${JSON.parse(sub.test_results).map(t => `
                            <div style="padding:0.3rem;font-size:0.85rem;">
                                ${t.status === 'accepted' ? '✅' : '❌'} #${t.test_case} (${t.time_ms}ms)
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
                <div style="margin-bottom:0.5rem;"><strong>代码：</strong></div>
                <pre style="background:#1e1e2e;color:#cdd6f4;padding:0.75rem;border-radius:var(--radius);max-height:200px;overflow:auto;font-family:var(--font-mono);font-size:0.82rem;">${escapeHtml(sub.code)}</pre>
                ${sub.stdout ? `<div style="margin-top:0.75rem;"><strong>输出：</strong><pre style="background:#1e1e2e;color:#a6e3a1;padding:0.5rem;border-radius:var(--radius);font-family:var(--font-mono);font-size:0.82rem;">${escapeHtml(sub.stdout)}</pre></div>` : ''}
                ${sub.stderr ? `<div style="margin-top:0.75rem;"><strong>错误：</strong><pre style="background:#1e1e2e;color:#f38ba8;padding:0.5rem;border-radius:var(--radius);font-family:var(--font-mono);font-size:0.82rem;">${escapeHtml(sub.stderr)}</pre></div>` : ''}
                <div style="text-align:right;margin-top:1rem;">
                    <button class="btn btn-outline" onclick="hideModal()">关闭</button>
                </div>
            `);
        } catch (e) {
            showToast(e.message, 'error');
        }
    },

    // ── 教师管理页面 ────────────────────────────────────
    async manageExercises() {
        const container = $('#page-content');
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">⏳</div><h3>加载中...</h3></div>';

        try {
            const data = await API.get('/exercises', { page: 1, page_size: 100 });

            container.innerHTML = `
                <div class="toolbar">
                    <h3>🔧 题目管理 (${data.total})</h3>
                    <button class="btn btn-primary" onclick="Pages._createExercise()">+ 新建题目</button>
                </div>
                <div class="card">
                    <div class="table-container">
                        <table>
                            <thead><tr><th>ID</th><th>题目</th><th>分类</th><th>难度</th><th>语言</th><th>测试数</th><th>操作</th></tr></thead>
                            <tbody>
                                ${data.items.map(e => `
                                    <tr>
                                        <td>${e.id}</td>
                                        <td><strong>${escapeHtml(e.title)}</strong></td>
                                        <td>${escapeHtml(e.category_name || '-')}</td>
                                        <td><span class="badge badge-${e.difficulty}">${difficultyText(e.difficulty)}</span></td>
                                        <td>${languageIcon(e.language)} ${e.language}</td>
                                        <td>${e.test_case_count || 0}</td>
                                        <td>
                                            <button class="btn btn-sm btn-outline" onclick="App.navigate('exercise-do',{id:${e.id}})">预览</button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        } catch (e) {
            container.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><h3>${escapeHtml(e.message)}</h3></div>`;
        }
    },

    _createExercise() {
        showModal(`
            <div class="modal-title">📝 新建题目</div>
            <div style="max-height:65vh;overflow-y:auto;">
                <div class="form-group"><label>题目标题 *</label><input type="text" id="ex-title" placeholder="如：Hello World"></div>
                <div class="form-row">
                    <div class="form-group"><label>难度</label><select id="ex-diff"><option value="easy">简单</option><option value="medium">中等</option><option value="hard">困难</option></select></div>
                    <div class="form-group"><label>语言</label><select id="ex-lang"><option value="python">Python</option><option value="javascript">JavaScript</option><option value="c">C</option><option value="cpp">C++</option></select></div>
                </div>
                <div class="form-group"><label>题目描述 (Markdown) *</label><textarea id="ex-desc" rows="5" placeholder="支持 Markdown 格式"></textarea></div>
                <div class="form-group"><label>代码模板</label><textarea id="ex-template" rows="4" style="font-family:var(--font-mono);" placeholder="# 在此编写代码模板"></textarea></div>
                <div class="form-group"><label>测试用例 (JSON 格式) *</label><textarea id="ex-tests" rows="4" style="font-family:var(--font-mono);" placeholder='[{"input":"4\\n","output":"even\\n"}]'></textarea></div>
                <div class="form-row" style="align-items:center;">
                    <div class="form-group" style="margin-bottom:0;">
                        <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;">
                            <input type="checkbox" id="ex-check-code" onchange="document.getElementById('ex-ref-code-group').style.display=this.checked?'block':'none'">
                            🔍 检查代码（提交前比对参考代码）
                        </label>
                    </div>
                </div>
                <div class="form-group" id="ex-ref-code-group" style="display:none;">
                    <label>参考代码（学生必须与此一致）</label>
                    <textarea id="ex-ref-code" rows="6" style="font-family:var(--font-mono);" placeholder="教师的标准答案代码"></textarea>
                    <small style="color:var(--text-muted);">开启后，学生提交的代码必须与此完全一致，否则判0分</small>
                </div>
                <div class="form-row">
                    <div class="form-group"><label>时间限制(秒)</label><input type="number" id="ex-time" value="10"></div>
                    <div class="form-group"><label>内存限制(MB)</label><input type="number" id="ex-mem" value="256"></div>
                </div>
            </div>
            <div style="display:flex;gap:0.5rem;justify-content:flex-end;margin-top:1rem;">
                <button class="btn btn-outline" onclick="hideModal()">取消</button>
                <button class="btn btn-primary" onclick="Pages._saveExercise()">创建</button>
            </div>
        `);
    },

    async _saveExercise() {
        try {
            let tests = [];
            try { tests = JSON.parse($('#ex-tests').value); } catch { showToast('测试用例 JSON 格式错误', 'error'); return; }
            const checkCode = $('#ex-check-code') ? $('#ex-check-code').checked : false;
            const refCode = checkCode && $('#ex-ref-code') ? $('#ex-ref-code').value : null;
            if (checkCode && !refCode) { showToast('开启检查代码后必须填写参考代码', 'error'); return; }
            await API.post('/exercises', {
                title: $('#ex-title').value,
                difficulty: $('#ex-diff').value,
                language: $('#ex-lang').value,
                description: $('#ex-desc').value,
                template_code: $('#ex-template').value,
                test_cases: tests,
                check_code: checkCode,
                reference_code: refCode,
                time_limit: parseInt($('#ex-time').value) || 10,
                memory_limit: parseInt($('#ex-mem').value) || 256,
            });
            hideModal();
            showToast('题目创建成功！', 'success');
            Pages.manageExercises();
        } catch (e) {
            showToast(e.message, 'error');
        }
    },

    // ── 学生管理 ────────────────────────────────────────
    async manageUsers() {
        const container = $('#page-content');
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">⏳</div><h3>加载中...</h3></div>';

        try {
            const data = await API.get('/users', { page: 1, page_size: 100, role: 'student' });

            container.innerHTML = `
                <div class="toolbar">
                    <h3>👥 学生管理 (${data.total})</h3>
                </div>
                <div class="card">
                    <div class="table-container">
                        <table>
                            <thead><tr><th>ID</th><th>用户名</th><th>学号</th><th>班级</th><th>提交数</th><th>通过数</th><th>注册时间</th></tr></thead>
                            <tbody>
                                ${data.items.map(u => `
                                    <tr>
                                        <td>${u.id}</td>
                                        <td><strong>${escapeHtml(u.username)}</strong></td>
                                        <td>${escapeHtml(u.student_number || '-')}</td>
                                        <td>${escapeHtml(u.class_name || '-')}</td>
                                        <td>${u.submission_count}</td>
                                        <td>${u.solved_count}</td>
                                        <td>${timeAgo(u.created_at)}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        } catch (e) {
            container.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><h3>${escapeHtml(e.message)}</h3></div>`;
        }
    },

    // ── 课程管理 ────────────────────────────────────────
    async manageCourses() {
        const container = $('#page-content');
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">⏳</div><h3>加载中...</h3></div>';

        try {
            const data = await API.get('/courses', { page: 1, page_size: 100 });

            container.innerHTML = `
                <div class="toolbar">
                    <h3>📖 课程管理 (${data.total})</h3>
                    <button class="btn btn-primary" onclick="Pages._createCourse()">+ 新建课程</button>
                </div>
                <div class="card">
                    <div class="table-container">
                        <table>
                            <thead><tr><th>ID</th><th>课程名</th><th>教师</th><th>学生数</th><th>题目数</th><th>选课密码</th><th>操作</th></tr></thead>
                            <tbody>
                                ${data.items.map(c => `
                                    <tr>
                                        <td>${c.id}</td>
                                        <td><strong>${escapeHtml(c.name)}</strong></td>
                                        <td>${escapeHtml(c.teacher_name || '-')}</td>
                                        <td>
                                            <a href="javascript:void(0)" style="color:var(--primary);"
                                               onclick="Pages._manageCourseStudents(${c.id},'${escapeHtml(c.name)}')"
                                            >${c.student_count} 人</a>
                                        </td>
                                        <td>${c.exercise_count}</td>
                                        <td>
                                            ${c.enroll_password
                                                ? `<span style="font-family:monospace;background:var(--bg-secondary);padding:2px 6px;border-radius:4px;">${escapeHtml(c.enroll_password)}</span>`
                                                : '<span style="color:var(--text-muted);font-size:0.85rem;">未设置（管理员分配）</span>'}
                                        </td>
                                        <td style="white-space:nowrap;">
                                            <button class="btn btn-sm btn-outline" onclick="Pages._editCourse(${c.id},'${escapeHtml(c.name)}','${escapeHtml(c.description||'')}','${escapeHtml(c.enroll_password||'')}')">✏️ 编辑</button>
                                            <button class="btn btn-sm btn-outline" style="margin-left:4px;" onclick="Pages._manageCourseStudents(${c.id},'${escapeHtml(c.name)}')">👥 学生</button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        } catch (e) {
            container.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><h3>${escapeHtml(e.message)}</h3></div>`;
        }
    },

    _editCourse(id, name, desc, enrollPwd) {
        showModal(`
            <div class="modal-header"><h3>✏️ 编辑课程</h3><button class="modal-close" onclick="hideModal()">✕</button></div>
            <div class="modal-body">
                <div class="form-group">
                    <label>课程名称 *</label>
                    <input type="text" id="edit-course-name" class="form-control" value="${escapeHtml(name)}">
                </div>
                <div class="form-group">
                    <label>课程描述</label>
                    <textarea id="edit-course-desc" class="form-control" rows="2">${escapeHtml(desc)}</textarea>
                </div>
                <div class="form-group">
                    <label>选课密码</label>
                    <input type="text" id="edit-course-pwd" class="form-control" value="${escapeHtml(enrollPwd)}" placeholder="留空则学生不能自主选课，只能由管理员分配">
                    <small style="color:var(--text-muted);">设置密码后，学生可在「课程」页面凭此密码自主选课</small>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-outline" onclick="hideModal()">取消</button>
                <button class="btn btn-primary" onclick="Pages._saveEditCourse(${id})">保存</button>
            </div>
        `);
    },

    async _saveEditCourse(id) {
        try {
            await API.put('/courses/' + id, {
                name: $('#edit-course-name').value.trim(),
                description: $('#edit-course-desc').value.trim(),
                enroll_password: $('#edit-course-pwd').value.trim() || null,
            });
            hideModal();
            showToast('课程已更新', 'success');
            Pages.manageCourses();
        } catch (e) { showToast(e.message, 'error'); }
    },

    async _manageCourseStudents(cid, cname) {
        // 同时获取该课程的学生列表和所有学生列表
        let enrolled = [], allStudents = [];
        try {
            enrolled = await API.get('/courses/' + cid + '/students');
            const sd = await API.get('/users', { page: 1, page_size: 500, role: 'student' });
            allStudents = sd.items || [];
        } catch (e) { showToast(e.message, 'error'); return; }

        const enrolledIds = new Set(enrolled.map(s => s.id));
        const unenrolled = allStudents.filter(s => !enrolledIds.has(s.id));

        showModal(`
            <div class="modal-header"><h3>👥 管理课程学生 — ${escapeHtml(cname)}</h3><button class="modal-close" onclick="hideModal()">✕</button></div>
            <div class="modal-body" style="max-height:60vh;overflow:auto;">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                    <!-- 已选课学生 -->
                    <div>
                        <div style="font-weight:600;margin-bottom:0.5rem;color:var(--success);">✅ 已选课 (${enrolled.length})</div>
                        <div style="max-height:40vh;overflow-y:auto;border:1px solid var(--border-color);border-radius:0.5rem;">
                            ${enrolled.length === 0
                                ? '<div style="padding:1rem;text-align:center;color:var(--text-muted);">暂无学生</div>'
                                : enrolled.map(s => `
                                    <div style="display:flex;align-items:center;padding:0.5rem 0.75rem;border-bottom:1px solid var(--border-color);">
                                        <div style="flex:1;">
                                            <div style="font-size:0.9rem;">${escapeHtml(s.nickname || s.username)}</div>
                                            <div style="font-size:0.75rem;color:var(--text-muted);">${escapeHtml(s.student_number||'')} ${escapeHtml(s.class_name||'')}</div>
                                        </div>
                                        <button class="btn btn-sm" style="color:#e74c3c;border-color:#e74c3c;" onclick="Pages._kickStudent(${cid},${s.id},'${escapeHtml(cname)}')">移除</button>
                                    </div>`).join('')}
                        </div>
                    </div>
                    <!-- 未选课学生 -->
                    <div>
                        <div style="font-weight:600;margin-bottom:0.5rem;color:var(--primary);">➕ 添加学生 (${unenrolled.length})</div>
                        <div style="margin-bottom:0.5rem;">
                            <input type="text" class="form-control" id="add-student-search" placeholder="搜索学生..." oninput="Pages._filterAddStudentList(this.value)">
                        </div>
                        <div id="add-student-list" style="max-height:35vh;overflow-y:auto;border:1px solid var(--border-color);border-radius:0.5rem;">
                            ${unenrolled.length === 0
                                ? '<div style="padding:1rem;text-align:center;color:var(--text-muted);">所有学生均已选课</div>'
                                : unenrolled.map(s => `
                                    <div class="add-student-item" style="display:flex;align-items:center;padding:0.5rem 0.75rem;border-bottom:1px solid var(--border-color);"
                                         data-name="${escapeHtml((s.nickname||s.username)+' '+(s.student_number||'')+' '+(s.class_name||'')).toLowerCase()}">
                                        <div style="flex:1;">
                                            <div style="font-size:0.9rem;">${escapeHtml(s.nickname || s.username)}</div>
                                            <div style="font-size:0.75rem;color:var(--text-muted);">${escapeHtml(s.student_number||'')} ${escapeHtml(s.class_name||'')}</div>
                                        </div>
                                        <button class="btn btn-sm btn-primary" onclick="Pages._addStudentToCourse(${cid},${s.id},'${escapeHtml(cname)}')">+ 添加</button>
                                    </div>`).join('')}
                        </div>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-outline" onclick="hideModal()">关闭</button>
            </div>
        `);
    },

    _filterAddStudentList(keyword) {
        const kw = keyword.toLowerCase();
        document.querySelectorAll('.add-student-item').forEach(el => {
            el.style.display = (!kw || el.dataset.name.includes(kw)) ? '' : 'none';
        });
    },

    async _addStudentToCourse(cid, studentId, cname) {
        try {
            await API.post('/enrollments', { course_id: cid, student_id: studentId });
            showToast('添加成功', 'success');
            Pages._manageCourseStudents(cid, cname);
        } catch (e) { showToast(e.message, 'error'); }
    },

    async _kickStudent(cid, studentId, cname) {
        try {
            await API.post('/enrollments/remove', { course_id: cid, student_id: studentId });
            showToast('已移除学生', 'success');
            Pages._manageCourseStudents(cid, cname);
        } catch (e) { showToast(e.message, 'error'); }
    },



    _createCourse() {
        showModal(`
            <div class="modal-header"><h3>📖 新建课程</h3><button class="modal-close" onclick="hideModal()">✕</button></div>
            <div class="modal-body">
                <div class="form-group"><label>课程名称 *</label><input type="text" id="course-name" class="form-control" placeholder="如：Python 程序设计"></div>
                <div class="form-group"><label>课程描述</label><textarea id="course-desc" class="form-control" rows="2" placeholder="课程简介..."></textarea></div>
                <div class="form-group">
                    <label>选课密码</label>
                    <input type="text" id="course-enroll-pwd" class="form-control" placeholder="留空则仅管理员可分配学生">
                    <small style="color:var(--text-muted);">设置后，学生凭此密码可自主选课</small>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-outline" onclick="hideModal()">取消</button>
                <button class="btn btn-primary" onclick="Pages._saveCourse()">创建</button>
            </div>
        `);
    },

    async _saveCourse() {
        try {
            await API.post('/courses', {
                name: $('#course-name').value.trim(),
                description: $('#course-desc').value.trim(),
                enroll_password: $('#course-enroll-pwd').value.trim() || null,
            });
            hideModal();
            showToast('课程创建成功！', 'success');
            Pages.manageCourses();
        } catch (e) {
            showToast(e.message, 'error');
        }
    },



    // ── 公告管理 ────────────────────────────────────────
    async announcements() {
        const container = $('#page-content');
        try {
            const data = await API.get('/announcements');
            container.innerHTML = `
                <div class="toolbar">
                    <h3>📢 公告管理</h3>
                    <button class="btn btn-primary" onclick="Pages._createAnnouncement()">+ 发布公告</button>
                </div>
                <div class="card">
                    ${(data || []).map(a => `
                        <div class="announcement-item">
                            <div class="announcement-title">${escapeHtml(a.title)}</div>
                            <div class="announcement-content">${escapeHtml(a.content)}</div>
                            <div class="announcement-time">by ${escapeHtml(a.author_name)} · ${timeAgo(a.created_at)}</div>
                        </div>
                    `).join('') || '<div class="empty-state"><p>暂无公告</p></div>'}
                </div>
            `;
        } catch (e) {
            container.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><h3>${escapeHtml(e.message)}</h3></div>`;
        }
    },

    _createAnnouncement() {
        showModal(`
            <div class="modal-title">📢 发布公告</div>
            <div class="form-group"><label>标题 *</label><input type="text" id="ann-title" placeholder="公告标题"></div>
            <div class="form-group"><label>内容 *</label><textarea id="ann-content" rows="4" placeholder="公告内容..."></textarea></div>
            <div style="display:flex;gap:0.5rem;justify-content:flex-end;margin-top:1rem;">
                <button class="btn btn-outline" onclick="hideModal()">取消</button>
                <button class="btn btn-primary" onclick="Pages._saveAnnouncement()">发布</button>
            </div>
        `);
    },

    async _saveAnnouncement() {
        try {
            await API.post('/announcements', {
                title: $('#ann-title').value,
                content: $('#ann-content').value,
            });
            hideModal();
            showToast('公告发布成功！', 'success');
            Pages.announcements();
        } catch (e) {
            showToast(e.message, 'error');
        }
    },

    // ── 个人信息 ────────────────────────────────────────
    async profile() {
        const container = $('#page-content');
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">⏳</div><h3>加载中...</h3></div>';
        try {
            const me = await API.get('/auth/me');
            App.user = me;
            localStorage.setItem('cc_user', JSON.stringify(me));
            App.updateUserUI();
            const roleMap = { student: '学生', teacher: '教师', admin: '管理员' };
            const avatarColor = me.avatar || 'var(--primary)';
            container.innerHTML = `
                <h2 style="margin-bottom:1.25rem;">👤 个人信息</h2>
                <div style="max-width:600px;">
                    <div class="card" style="margin-bottom:1.25rem;">
                        <div style="display:flex;align-items:center;gap:1.25rem;margin-bottom:1.5rem;">
                            <div style="width:80px;height:80px;border-radius:50%;background:${avatarColor};color:#fff;display:flex;align-items:center;justify-content:center;font-size:2rem;font-weight:700;">
                                ${(me.nickname || me.username).charAt(0).toUpperCase()}
                            </div>
                            <div>
                                <div style="font-size:1.3rem;font-weight:700;">${escapeHtml(me.nickname || me.username)}</div>
                                <div style="color:var(--text-muted);">@${escapeHtml(me.username)} · ${roleMap[me.role] || me.role}</div>
                            </div>
                        </div>
                        <div class="form-group"><label>昵称</label><input type="text" id="prof-nickname" value="${escapeHtml(me.nickname || '')}" placeholder="设置你的昵称"></div>
                        <div class="form-group"><label>邮箱</label><input type="email" id="prof-email" value="${escapeHtml(me.email || '')}"></div>
                        <div class="form-row">
                            <div class="form-group"><label>学号</label><input type="text" id="prof-sno" value="${escapeHtml(me.student_number || '')}"></div>
                            <div class="form-group"><label>班级</label><input type="text" id="prof-class" value="${escapeHtml(me.class_name || '')}"></div>
                        </div>
                        <div class="form-group"><label>头像颜色</label>
                            <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
                                ${['#6366f1','#8b5cf6','#ec4899','#f43f5e','#f97316','#eab308','#22c55e','#14b8a6','#06b6d4','#3b82f6','#ef4444','#64748b'].map(c =>
                                    `<div class="avatar-color-opt ${me.avatar===c?'selected':''}" data-color="${c}" style="width:36px;height:36px;border-radius:50%;background:${c};cursor:pointer;border:3px solid ${me.avatar===c?'var(--text)':'transparent'};" onclick="Pages._pickColor(this,'${c}')"></div>`
                                ).join('')}
                            </div>
                        </div>
                        <button class="btn btn-primary" onclick="Pages._saveProfile()">💾 保存修改</button>
                    </div>
                    <div class="card">
                        <div class="card-title" style="margin-bottom:1rem;">🔒 修改密码</div>
                        <div class="form-group"><label>当前密码</label><input type="password" id="prof-oldpw" placeholder="输入当前密码"></div>
                        <div class="form-group"><label>新密码</label><input type="password" id="prof-newpw" placeholder="至少 6 个字符"></div>
                        <div class="form-group"><label>确认新密码</label><input type="password" id="prof-newpw2" placeholder="再次输入新密码"></div>
                        <button class="btn btn-outline" onclick="Pages._changePassword()">🔑 修改密码</button>
                    </div>
                </div>
            `;
        } catch (e) {
            container.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><h3>加载失败</h3><p>${escapeHtml(e.message)}</p></div>`;
        }
    },

    _pickedColor: null,
    _pickColor(el, color) {
        this._pickedColor = color;
        $$('.avatar-color-opt').forEach(e => e.style.border = '3px solid transparent');
        el.style.border = '3px solid var(--text)';
    },

    async _saveProfile() {
        try {
            const data = {
                nickname: $('#prof-nickname').value.trim(),
                email: $('#prof-email').value.trim(),
                student_number: $('#prof-sno').value.trim(),
                class_name: $('#prof-class').value.trim(),
            };
            if (Pages._pickedColor) data.avatar = Pages._pickedColor;
            await API.put('/profile', data);
            showToast('个人信息已更新！', 'success');
            Pages.profile();
        } catch (e) {
            showToast(e.message, 'error');
        }
    },

    async _changePassword() {
        const oldPw = $('#prof-oldpw').value;
        const newPw = $('#prof-newpw').value;
        const newPw2 = $('#prof-newpw2').value;
        if (!oldPw || !newPw) { showToast('请填写密码', 'error'); return; }
        if (newPw !== newPw2) { showToast('两次新密码不一致', 'error'); return; }
        if (newPw.length < 6) { showToast('新密码至少 6 个字符', 'error'); return; }
        try {
            await API.put('/change-password', { old_password: oldPw, new_password: newPw });
            showToast('密码修改成功！', 'success');
            $('#prof-oldpw').value = '';
            $('#prof-newpw').value = '';
            $('#prof-newpw2').value = '';
        } catch (e) {
            showToast(e.message, 'error');
        }
    },

    // ── 班级讨论区 ──────────────────────────────────────
    async discussions() {
        const container = $('#page-content');
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">⏳</div><h3>加载中...</h3></div>';
        try {
            const list = await API.get('/discussions');
            const isAdmin = ['teacher', 'admin'].includes(App.user.role);
            container.innerHTML = `
                <div class="toolbar">
                    <h3>💬 班级讨论区</h3>
                    ${isAdmin ? '<button class="btn btn-primary" onclick="Pages._createDiscussion()">+ 新建讨论区</button>' : ''}
                </div>
                <div class="discussion-list">
                    ${list.map(d => {
                        const scopeTag = d.scope === 'class' ? `🏫 ${escapeHtml(d.class_name||'班级')}` : d.scope === 'personal' ? '🔒 个人' : '🌐 全局';
                        const memberTag = d.my_role ? (d.my_role === 'admin' ? '👑 管理员' : '成员') : '访客';
                        return `
                        <div class="discussion-card" onclick="App.navigate('discussion-view',{id:${d.id},title:'${escapeHtml(d.title)}'})">
                            <div class="discussion-card-icon">💬</div>
                            <div class="discussion-card-info">
                                <h3>${escapeHtml(d.title)}</h3>
                                <p>${escapeHtml(d.description || '').substring(0, 80)}${(d.description || '').length > 80 ? '...' : ''}</p>
                                <div class="discussion-card-meta">
                                    <span title="范围" style="background:var(--bg-alt);padding:0.1rem 0.4rem;border-radius:4px;font-size:0.8rem;">${scopeTag}</span>
                                    <span>👥 ${d.member_count} 人</span>
                                    <span>📝 ${d.post_count} 帖</span>
                                    ${d.is_muted ? '<span style="color:var(--danger);">🔇 已禁言</span>' : ''}
                                    <span style="color:var(--text-muted);">${memberTag}</span>
                                </div>
                            </div>
                            ${isAdmin ? `<button class="btn btn-sm" style="color:var(--danger);border-color:var(--danger);flex-shrink:0;" onclick="event.stopPropagation();Pages._deleteDiscussion(${d.id},'${escapeHtml(d.title)}')">🗑 删除</button>` : '<span style="color:var(--text-muted);font-size:0.85rem;">›</span>'}
                        </div>`;
                    }).join('')}
                    ${list.length === 0 ? '<div class="empty-state"><div class="empty-icon">💬</div><h3>暂无讨论区</h3></div>' : ''}
                </div>
            `;
        } catch (e) {
            container.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><h3>加载失败</h3><p>${escapeHtml(e.message)}</p></div>`;
        }
    },

    async _deleteDiscussion(id, title) {
        if (!confirm(`确定删除讨论区「${title}」？\n所有帖子和成员关系也会一并删除，且不可恢复。`)) return;
        try {
            await API.delete(`/discussions/${id}`);
            showToast('讨论区已删除', 'success');
            Pages.discussions();
        } catch (e) { showToast(e.message, 'error'); }
    },

    async _createDiscussion() {
        // 先加载班级列表
        let classOptions = '<option value="">-- 不关联班级 --</option>';
        try {
            const classes = await API.get('/classes');
            classOptions += classes.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
        } catch(e) {}
        showModal(`
            <div class="modal-title">💬 新建讨论区</div>
            <div class="form-group"><label>讨论区名称 *</label><input type="text" id="disc-title" placeholder="如：CS2401 班级讨论区"></div>
            <div class="form-group"><label>描述</label><textarea id="disc-desc" rows="3" placeholder="讨论区简介..."></textarea></div>
            <div class="form-group"><label>可见范围</label>
                <select id="disc-scope" onchange="Pages._onDiscScopeChange()">
                    <option value="global">🌐 全局（所有人可见）</option>
                    <option value="class">🏫 班级（仅指定班级成员）</option>
                    <option value="personal">🔒 个人（仅创建者）</option>
                </select>
            </div>
            <div class="form-group" id="disc-class-group" style="display:none"><label>关联班级</label>
                <select id="disc-class-id">${classOptions}</select>
            </div>
            <div style="display:flex;gap:0.5rem;justify-content:flex-end;margin-top:1rem;">
                <button class="btn btn-outline" onclick="hideModal()">取消</button>
                <button class="btn btn-primary" onclick="Pages._saveDiscussion()">创建</button>
            </div>
        `);
    },

    _onDiscScopeChange() {
        const scope = $('#disc-scope').value;
        const grp = $('#disc-class-group');
        if (grp) grp.style.display = scope === 'class' ? '' : 'none';
    },

    async _saveDiscussion() {
        const scope = $('#disc-scope')?.value || 'global';
        const classId = scope === 'class' ? (parseInt($('#disc-class-id')?.value) || null) : null;
        try {
            await API.post('/discussions', {
                title: $('#disc-title').value,
                description: $('#disc-desc').value,
                scope,
                class_id: classId,
            });
            hideModal(); showToast('讨论区创建成功！', 'success'); Pages.discussions();
        } catch (e) { showToast(e.message, 'error'); }
    },

    async discussionView(params) {
        const container = $('#page-content');
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">⏳</div><h3>加载中...</h3></div>';
        try {
            const data = await API.get(`/discussions/${params.id}/posts`);
            const { items: posts, total, my_role, is_muted } = data;
            const isAdmin = my_role === 'admin';
            const isTeacher = ['teacher', 'admin'].includes(App.user.role);

            container.innerHTML = `
                <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:1.25rem;">
                    <button class="btn btn-ghost" onclick="App.navigate('discussions')">← 返回</button>
                    <h2>${escapeHtml(params.title)}</h2>
                    ${isAdmin ? '<button class="btn btn-sm btn-outline" onclick="Pages._manageMembers(' + params.id + ')">👥 成员管理</button>' : ''}
                </div>
                ${is_muted ? '<div class="card" style="margin-bottom:1rem;padding:0.75rem 1rem;background:var(--danger-bg);color:var(--danger);border-color:var(--danger);">🔇 你已被禁言，无法发帖</div>' : ''}
                <div class="card" style="margin-bottom:1rem;">
                    <textarea id="post-content" rows="3" placeholder="说点什么..." style="width:100%;padding:0.6rem;border:1.5px solid var(--border);border-radius:var(--radius);resize:vertical;font-family:inherit;outline:none;" ${is_muted ? 'disabled' : ''}></textarea>
                    <div style="display:flex;align-items:center;gap:0.5rem;margin-top:0.5rem;">
                        <label class="btn btn-sm btn-outline" style="cursor:pointer;">
                            📎 ${['teacher','admin'].includes(App.user.role) ? '上传文件 (无限制)' : '上传文件 (≤10MB)'}
                            <input type="file" id="post-file" style="display:none;" onchange="Pages._onFileSelected(this)">
                        </label>
                        <span id="file-name" style="font-size:0.8rem;color:var(--text-muted);"></span>
                        <button class="btn btn-primary" style="margin-left:auto;" onclick="Pages._submitPost(${params.id})" ${is_muted ? 'disabled' : ''}>📤 发帖</button>
                    </div>
                </div>
                <div class="card">
                    <div class="card-header"><span class="card-title">📝 帖子 (${total})</span></div>
                    <div id="posts-list">
                        ${posts.map(p => Pages._renderPost(p, params.id, isAdmin)).join('')}
                        ${posts.length === 0 ? '<div class="empty-state"><p>还没有帖子，来发表第一条吧！</p></div>' : ''}
                    </div>
                </div>
            `;
        } catch (e) {
            container.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><h3>加载失败</h3><p>${escapeHtml(e.message)}</p></div>`;
        }
    },

    _selectedFile: null,
    _onFileSelected(input) {
        const file = input.files[0];
        if (!file) return;
        if (App.user.role === 'student' && file.size > 10 * 1024 * 1024) { showToast('文件大小不能超过 10MB', 'error'); input.value = ''; return; }
        this._selectedFile = file;
        $('#file-name').textContent = `📎 ${file.name} (${(file.size / 1024).toFixed(1)}KB)`;
    },

    async _submitPost(did) {
        const content = $('#post-content').value.trim();
        if (!content && !this._selectedFile) { showToast('请输入内容或选择文件', 'error'); return; }
        try {
            let fileId = null;
            if (this._selectedFile) {
                const form = new FormData();
                form.append('file', this._selectedFile);
                const res = await fetch(`/api/discussions/${did}/files`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${API.token}` },
                    body: form,
                });
                const json = await res.json();
                if (json.code !== 0) throw new Error(json.message || 'Upload failed');
                fileId = json.data.id;
            }
            await API.post(`/discussions/${did}/posts`, { content, file_id: fileId });
            showToast('发帖成功！', 'success');
            this._selectedFile = null;
            Pages.discussionView({ id: did, title: $('#breadcrumb').textContent });
        } catch (e) { showToast(e.message, 'error'); }
    },

    _renderPost(p, did, canManage) {
        const displayName = p.nickname || p.username;
        const initial = displayName.charAt(0).toUpperCase();
        const isAdminOrOwner = canManage || p.username === (App.user && App.user.username);
        const isTeacherOrAdmin = ['teacher', 'admin'].includes(App.user && App.user.role);
        const color = p.avatar || 'var(--primary)';
        return `
            <div class="post-item">
                <div class="post-header">
                    <div class="post-avatar" style="background:${color};">${initial}</div>
                    <div class="post-meta">
                        <strong>${escapeHtml(displayName)}</strong>
                        ${p.user_role === 'admin' ? '<span class="badge badge-pending">👑 管理员</span>' : ''}
                        ${p.user_role === 'teacher' ? '<span class="badge badge-pending">👨‍🏫 教师</span>' : ''}
                        <span class="post-time">${timeAgo(p.created_at)}</span>
                    </div>
                    <div style="display:flex;gap:0.3rem;">
                        ${isTeacherOrAdmin ? `<button class="btn btn-sm btn-danger" onclick="event.stopPropagation();Pages._deletePost(${did},${p.id})" title="删除帖子">🗑️</button>` : ''}
                        ${canManage && p.username !== (App.user && App.user.username) ? `<button class="btn btn-sm btn-outline" onclick="event.stopPropagation();Pages._postActions(${did},${p.id},'${escapeHtml(p.username)}')">⋯</button>` : ''}
                    </div>
                </div>
                <div class="post-content-text">${escapeHtml(p.content).replace(/\\n/g, '<br>')}</div>
                ${p.file_id ? `<div class="post-file">
                    <span class="file-info"><a href="javascript:void(0)" onclick="previewFile(${p.file_id})" title="预览">${fileIcon(p.file_name)} ${escapeHtml(p.file_name)}</a> <span class="file-size">(${(p.file_size / 1024).toFixed(1)}KB)</span></span>
                    <a class="btn btn-sm btn-download" href="javascript:void(0)" onclick="downloadFile(${p.file_id},'${escapeHtml(p.file_name)}')" title="下载">⬇ 下载</a>
                </div>` : ''}
                <div class="post-actions">
                    <button class="btn btn-sm btn-ghost" onclick="Pages._loadReplies(${did},${p.id})">💬 回复 (${p.reply_count || 0})</button>
                </div>
                <div id="replies-${p.id}" style="display:none;"></div>
                <div class="reply-box" id="reply-box-${p.id}" style="display:none;">
                    <textarea id="reply-content-${p.id}" rows="2" placeholder="写下你的回复..." style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:var(--radius);resize:vertical;font-family:inherit;outline:none;"></textarea>
                    <button class="btn btn-sm btn-primary" style="margin-top:0.3rem;" onclick="Pages._submitReply(${did},${p.id})">发送</button>
                </div>
            </div>
        `;
    },

    async _deletePost(did, pid) {
        if (!confirm('确定要删除这条帖子吗？其所有回复也会被删除。')) return;
        try {
            await API.delete(`/discussions/${did}/posts/${pid}`);
            showToast('帖子已删除', 'success');
            // Reload the discussion view
            Pages.discussionView({ id: did, title: $('#breadcrumb').textContent });
        } catch (e) { showToast(e.message, 'error'); }
    },

    async _loadReplies(did, pid) {
        const el = $(`#replies-${pid}`);
        const box = $(`#reply-box-${pid}`);
        if (el.style.display === 'none') {
            el.style.display = 'block';
            box.style.display = 'block';
            el.innerHTML = '<div style="padding:0.5rem;color:var(--text-muted);">加载中...</div>';
            try {
                const replies = await API.get(`/discussions/${did}/posts/${pid}/replies`);
                el.innerHTML = replies.map(r => `
                    <div class="reply-item">
                        <div class="post-avatar small" style="background:${r.avatar || 'var(--primary)'};">${(r.nickname || r.username).charAt(0).toUpperCase()}</div>
                        <div class="reply-content">
                            <strong>${escapeHtml(r.nickname || r.username)}</strong>
                            <span class="post-time">${timeAgo(r.created_at)}</span>
                            <div>${escapeHtml(r.content).replace(/\\n/g, '<br>')}</div>
                            ${r.file_id ? `<div class="post-file">
                                <span class="file-info"><a href="javascript:void(0)" onclick="previewFile(${r.file_id})" title="预览">📎 ${escapeHtml(r.file_name)}</a></span>
                                <a class="btn btn-sm btn-download" href="javascript:void(0)" onclick="downloadFile(${r.file_id},'${escapeHtml(r.file_name)}')" title="下载">⬇</a>
                            </div>` : ''}
                        </div>
                    </div>
                `).join('') || '<div style="padding:0.5rem;color:var(--text-muted);">暂无回复</div>';
            } catch (e) { el.innerHTML = `<div style="padding:0.5rem;color:var(--danger);">加载失败: ${escapeHtml(e.message)}</div>`; }
        } else {
            el.style.display = 'none';
            box.style.display = 'none';
        }
    },

    async _submitReply(did, pid) {
        const content = $(`#reply-content-${pid}`).value.trim();
        if (!content) { showToast('请输入回复内容', 'error'); return; }
        try {
            await API.post(`/discussions/${did}/posts`, { content, parent_id: pid });
            $(`#reply-content-${pid}`).value = '';
            showToast('回复成功！', 'success');
            Pages._loadReplies(did, pid);
            // Reload by clicking twice (toggle off then on)
            Pages._loadReplies(did, pid);
        } catch (e) { showToast(e.message, 'error'); }
    },

    _postActions(did, pid, username) {
        showModal(`
            <div class="modal-title">帖子操作</div>
            <p style="margin-bottom:1rem;color:var(--text-secondary);">用户: <strong>@${escapeHtml(username)}</strong></p>
            <div style="display:flex;flex-direction:column;gap:0.5rem;">
                <button class="btn btn-warning" onclick="Pages._muteUser(${did},'${escapeHtml(username)}')">🔇 禁言该用户</button>
                <button class="btn btn-danger" onclick="Pages._kickUser(${did},'${escapeHtml(username)}')">🚫 将该用户踢出讨论区</button>
            </div>
            <div style="text-align:right;margin-top:1rem;"><button class="btn btn-outline" onclick="hideModal()">关闭</button></div>
        `);
    },

    async _manageMembers(did) {
        try {
            const members = await API.get(`/discussions/${did}/members`);
            showModal(`
                <div class="modal-title">👥 成员管理</div>
                <div style="max-height:50vh;overflow-y:auto;">
                    ${members.map(m => `
                        <div style="display:flex;align-items:center;gap:0.75rem;padding:0.5rem 0;border-bottom:1px solid var(--border-light);">
                            <div class="post-avatar small" style="background:${m.avatar || 'var(--primary)'};">${(m.nickname || m.username).charAt(0).toUpperCase()}</div>
                            <div style="flex:1;">
                                <strong>${escapeHtml(m.nickname || m.username)}</strong>
                                <span style="font-size:0.8rem;color:var(--text-muted);">@${escapeHtml(m.username)}</span>
                                <span class="badge ${m.role === 'admin' ? 'badge-pending' : 'badge-accepted'}" style="margin-left:0.3rem;">${m.role === 'admin' ? '管理员' : '成员'}</span>
                                ${m.muted ? '<span class="badge badge-wrong_answer">已禁言</span>' : ''}
                            </div>
                            ${m.role !== 'admin' ? `
                                <button class="btn btn-sm btn-outline" onclick="Pages._toggleMuteMember(${did},${m.user_id},${m.muted ? 0 : 1})">${m.muted ? '🔇 解除禁言' : '🔇 禁言'}</button>
                                <button class="btn btn-sm btn-danger" onclick="Pages._kickMember(${did},${m.user_id},'${escapeHtml(m.nickname || m.username)}')">踢出</button>
                            ` : ''}
                        </div>
                    `).join('')}
                </div>
                <div style="margin-top:1rem;padding-top:1rem;border-top:1px solid var(--border);">
                    <div class="form-group"><label>添加成员</label><input type="text" id="add-member-username" placeholder="输入用户名"></div>
                    <button class="btn btn-primary" onclick="Pages._addMember(${did})">+ 添加</button>
                </div>
                <div style="text-align:right;margin-top:0.75rem;"><button class="btn btn-outline" onclick="hideModal()">关闭</button></div>
            `);
        } catch (e) { showToast(e.message, 'error'); }
    },

    async _muteUser(did, username) {
        hideModal();
        try {
            // First find the user_id by looking up users (admin only)
            const users = await API.get('/users', { page: 1, page_size: 100, search: username });
            const target = users.items.find(u => u.username === username);
            if (!target) { showToast('用户未找到', 'error'); return; }
            await API.put(`/discussions/${did}/members/${target.id}/mute`, { muted: true });
            showToast(`已禁言 @${username}`, 'success');
        } catch (e) { showToast(e.message, 'error'); }
    },

    async _kickUser(did, username) {
        hideModal();
        try {
            const users = await API.get('/users', { page: 1, page_size: 100, search: username });
            const target = users.items.find(u => u.username === username);
            if (!target) { showToast('用户未找到', 'error'); return; }
            await API.delete(`/discussions/${did}/members/${target.id}`);
            showToast(`已将 @${username} 移出讨论区`, 'success');
        } catch (e) { showToast(e.message, 'error'); }
    },

    async _toggleMuteMember(did, uid, muted) {
        try {
            await API.put(`/discussions/${did}/members/${uid}/mute`, { muted });
            showToast(muted ? '已禁言' : '已解除禁言', 'success');
            Pages._manageMembers(did);
        } catch (e) { showToast(e.message, 'error'); }
    },

    async _kickMember(did, uid, name) {
        if (!confirm(`确定要将 ${name} 移出讨论区吗？`)) return;
        try {
            await API.delete(`/discussions/${did}/members/${uid}`);
            showToast(`已将 ${name} 移出`, 'success');
            Pages._manageMembers(did);
        } catch (e) { showToast(e.message, 'error'); }
    },

    async _addMember(did) {
        const username = $('#add-member-username').value.trim();
        if (!username) { showToast('请输入用户名', 'error'); return; }
        try {
            const users = await API.get('/users', { page: 1, page_size: 100, search: username });
            const target = users.items.find(u => u.username === username);
            if (!target) { showToast('用户未找到', 'error'); return; }
            await API.post(`/discussions/${did}/members`, { user_id: target.id });
            showToast(`已添加 @${username}`, 'success');
            Pages._manageMembers(did);
        } catch (e) { showToast(e.message, 'error'); }
    },

    // ── 班级网盘 ──────────────────────────────────────
    async netdisk(params = {}) {
        const container = $('#page-content');
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">⏳</div><h3>加载中...</h3></div>';
        try {
            const folders = await API.get('/netdisk');
            const isTeacher = ['teacher', 'admin'].includes(App.user.role);
            if (params.folderId) {
                return Pages._netdiskFolder(params.folderId, folders);
            }
            const isAdmin = App.user.role === 'admin';
            container.innerHTML = `
                <div class="toolbar">
                    <h3>💾 班级网盘</h3>
                    ${isTeacher ? '<button class="btn btn-primary" onclick="Pages._createNetdiskFolder()">+ 新建网盘</button>' : ''}
                </div>
                <div class="netdisk-grid">
                    ${folders.map(f => {
                        const usedMB = (f.used_size / (1024*1024)).toFixed(1);
                        const maxMB = (f.max_size / (1024*1024)).toFixed(0);
                        const pct = f.max_size > 0 ? Math.min(100, (f.used_size / f.max_size * 100)).toFixed(0) : 0;
                        const scopeTag = f.scope === 'class' ? `🏫 ${escapeHtml(f.class_name||'班级')}` : f.scope === 'personal' ? '🔒 个人' : '🌐 全局';
                        return `
                            <div class="netdisk-folder-card" onclick="App.navigate('netdisk',{folderId:${f.id},name:'${escapeHtml(f.name)}'})">
                                <div class="netdisk-folder-icon">📁</div>
                                <div class="netdisk-folder-info">
                                    <h4>${escapeHtml(f.name)}</h4>
                                    <p style="font-size:0.8rem;color:var(--text-muted);">${scopeTag}${f.discussion_name ? ' · ' + escapeHtml(f.discussion_name) : ''}</p>
                                    <div class="netdisk-quota">
                                        <div class="quota-bar"><div class="quota-fill" style="width:${pct}%"></div></div>
                                        <span>${usedMB} / ${maxMB} MB (${f.file_count} 文件)</span>
                                    </div>
                                </div>
                                <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end;flex-shrink:0;">
                                    ${isTeacher ? `<span class="quota-edit" onclick="event.stopPropagation();Pages._editQuota(${f.id},${f.max_size})" title="修改配额">⚙️</span>` : ''}
                                    ${isTeacher ? `<button class="btn btn-sm" style="color:var(--danger);border-color:var(--danger);padding:2px 6px;font-size:0.75rem;" onclick="event.stopPropagation();Pages._deleteNetdisk(${f.id},'${escapeHtml(f.name)}')">🗑</button>` : ''}
                                </div>
                            </div>`;
                    }).join('')}
                    ${folders.length === 0 ? '<div class="empty-state"><div class="empty-icon">💾</div><h3>暂无网盘</h3></div>' : ''}
                </div>`;
        } catch (e) {
            container.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><h3>加载失败</h3><p>${escapeHtml(e.message)}</p></div>`;
        }
    },

    async _netdiskFolder(folderId, folders) {
        const container = $('#page-content');
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">⏳</div><h3>加载中...</h3></div>';
        try {
            const files = await API.get(`/netdisk/${folderId}/files`);
            const folder = folders.find(f => f.id === folderId);
            const isTeacher = ['teacher', 'admin'].includes(App.user.role);
            container.innerHTML = `
                <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:1.25rem;">
                    <button class="btn btn-ghost" onclick="App.navigate('netdisk')">← 返回</button>
                    <h3>📁 ${escapeHtml(folder ? folder.name : '网盘')}</h3>
                </div>
                ${isTeacher ? `
                    <div class="card" style="margin-bottom:1rem;padding:0.75rem 1rem;">
                        <label class="btn btn-sm btn-primary" style="cursor:pointer;">📤 上传文件
                            <input type="file" id="nd-upload-file" style="display:none;" onchange="Pages._ndFileSelected(this)">
                        </label>
                        <span id="nd-file-name" style="font-size:0.8rem;color:var(--text-muted);margin-left:0.5rem;"></span>
                        <button class="btn btn-sm btn-primary" style="margin-left:auto;display:none;" id="nd-upload-btn" onclick="Pages._ndUpload(${folderId})">确认上传</button>
                    </div>` : ''}
                <div class="card">
                    <div class="card-header"><span class="card-title">📄 文件列表 (${files.length})</span></div>
                    ${files.length > 0 ? `
                        <div class="table-container"><table>
                            <thead><tr><th>文件名</th><th>大小</th><th>上传者</th><th>下载次数</th><th>上传时间</th><th>操作</th></thead>
                            <tbody>${files.map(f => `
                                <tr>
                                    <td><a href="javascript:void(0)" onclick="previewFile(${f.id})" title="预览文件">${fileIcon(f.original_name)} ${escapeHtml(f.original_name)}</a></td>
                                    <td>${formatFileSize(f.file_size)}</td>
                                    <td>${escapeHtml(f.nickname || f.username)}</td>
                                    <td>${f.download_count}</td>
                                    <td>${timeAgo(f.created_at)}</td>
                                    <td style="white-space:nowrap;">
                                        <a class="btn btn-sm btn-download" href="javascript:void(0)" onclick="downloadFile(${f.id},'${escapeHtml(f.original_name)}')" title="下载文件">⬇ 下载</a>
                                        ${isTeacher ? `<button class="btn btn-sm btn-danger" onclick="Pages._ndDelete(${f.id},'${escapeHtml(f.original_name)}')">删除</button>` : ''}
                                    </td>
                                </tr>`).join('')}</tbody>
                        </table></div>` : '<div class="empty-state"><p>网盘为空</p></div>'}
                </div>`;
        } catch (e) {
            container.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><h3>加载失败</h3><p>${escapeHtml(e.message)}</p></div>`;
        }
    },

    _ndFileInput: null,
    _ndFileSelected(input) {
        const file = input.files[0];
        if (!file) return;
        this._ndFileInput = file;
        $('#nd-file-name').textContent = `📎 ${file.name} (${(file.size / 1024).toFixed(1)}KB)`;
        const btn = $('#nd-upload-btn');
        if (btn) btn.style.display = 'inline-flex';
    },

    async _ndUpload(folderId) {
        if (!this._ndFileInput) return;
        try {
            const form = new FormData();
            form.append('file', this._ndFileInput);
            const res = await fetch(`/api/netdisk/${folderId}/upload`, {
                method: 'POST', headers: { 'Authorization': `Bearer ${API.token}` }, body: form,
            });
            const json = await res.json();
            if (json.code !== 0) throw new Error(json.message || 'Upload failed');
            showToast('文件上传成功！', 'success');
            this._ndFileInput = null;
            App.navigate('netdisk', { folderId });
        } catch (e) { showToast(e.message, 'error'); }
    },

    async _ndDelete(fileId, name) {
        if (!confirm(`确定要删除文件「${name}」吗？`)) return;
        try {
            await API.delete(`/netdisk/files/${fileId}`);
            showToast('文件已删除', 'success');
            App.navigate('netdisk', { folderId: App.currentParams.folderId });
        } catch (e) { showToast(e.message, 'error'); }
    },

    async _deleteNetdisk(id, name) {
        if (!confirm(`确定删除网盘「${name}」？\n该网盘内所有文件也会一并删除，且不可恢复。`)) return;
        try {
            await API.delete(`/netdisk/${id}`);
            showToast('网盘已删除', 'success');
            Pages.netdisk();
        } catch (e) { showToast(e.message, 'error'); }
    },

    async _createNetdiskFolder() {
        let classOptions = '<option value="">-- 不关联班级 --</option>';
        try {
            const classes = await API.get('/classes');
            classOptions += classes.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
        } catch(e) {}
        showModal(`
            <div class="modal-title">💾 新建网盘</div>
            <div class="form-group"><label>名称 *</label><input type="text" id="nd-name" placeholder="网盘名称"></div>
            <div class="form-group"><label>描述</label><input type="text" id="nd-desc" placeholder="描述（可选）"></div>
            <div class="form-group"><label>可见范围</label>
                <select id="nd-scope" onchange="Pages._onNdScopeChange()">
                    <option value="global">🌐 全局（所有人可见）</option>
                    <option value="class">🏫 班级</option>
                    <option value="personal">🔒 个人</option>
                </select>
            </div>
            <div class="form-group" id="nd-class-group" style="display:none"><label>关联班级</label>
                <select id="nd-class-id">${classOptions}</select>
            </div>
            <div class="form-group"><label>容量 (MB)</label><input type="number" id="nd-maxsize" value="200" min="10" max="10240"></div>
            <div style="display:flex;gap:0.5rem;justify-content:flex-end;margin-top:1rem;">
                <button class="btn btn-outline" onclick="hideModal()">取消</button>
                <button class="btn btn-primary" onclick="Pages._saveNetdiskFolder()">创建</button>
            </div>`);
    },

    _onNdScopeChange() {
        const scope = $('#nd-scope')?.value;
        if ($('#nd-class-group')) $('#nd-class-group').style.display = scope === 'class' ? '' : 'none';
    },

    async _saveNetdiskFolder() {
        const scope = $('#nd-scope')?.value || 'global';
        const classId = scope === 'class' ? (parseInt($('#nd-class-id')?.value) || null) : null;
        const maxMB = parseInt($('#nd-maxsize')?.value) || 200;
        try {
            await API.post('/netdisk', {
                name: $('#nd-name').value,
                description: $('#nd-desc').value,
                scope, class_id: classId,
                max_size: maxMB * 1024 * 1024,
            });
            hideModal(); showToast('网盘创建成功！', 'success'); Pages.netdisk();
        } catch (e) { showToast(e.message, 'error'); }
    },

    _editQuota(folderId, currentSize) {
        const currentMB = (currentSize / (1024*1024)).toFixed(0);
        showModal(`
            <div class="modal-title">⚙️ 修改网盘配额</div>
            <div class="form-group"><label>最大容量 (MB)</label><input type="number" id="quota-mb" value="${currentMB}" min="10"></div>
            <div style="display:flex;gap:0.5rem;justify-content:flex-end;margin-top:1rem;">
                <button class="btn btn-outline" onclick="hideModal()">取消</button>
                <button class="btn btn-primary" onclick="Pages._saveQuota(${folderId})">保存</button>
            </div>`);
    },

    async _saveQuota(folderId) {
        const mb = parseInt($('#quota-mb').value) || 200;
        try {
            await API.put(`/admin/netdisk/${folderId}/quota`, { max_size: mb * 1024 * 1024 });
            hideModal(); showToast('配额已更新', 'success'); Pages.netdisk();
        } catch (e) { showToast(e.message, 'error'); }
    },

    // ── 作业任务 ──────────────────────────────────────
    async tasks() {
        const container = $('#page-content');
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">⏳</div><h3>加载中...</h3></div>';
        try {
            const data = await API.get('/tasks', { page: 1, page_size: 50 });
            const isStudent = App.user.role === 'student';
            const isTeacher = ['teacher', 'admin'].includes(App.user.role);
            const statusMap = { pending: '待提交', submitted: '已提交', graded: '已批改' };
            container.innerHTML = `
                <div class="toolbar">
                    <h3>📋 作业任务 (${data.total})</h3>
                    ${isTeacher ? '<button class="btn btn-primary" onclick="Pages._createTask()">+ 发布任务</button>' : ''}
                </div>
                <div class="task-list">
                    ${data.items.map(t => {
                        const isOverdue = t.deadline && new Date(t.deadline) < new Date();
                        const myStatus = isStudent ? (t.my_status || 'pending') : '';
                        const scopeTag = t.scope === 'class' ? `🏫 ${escapeHtml(t.class_name||'班级')}` : t.scope === 'course' ? `📚 ${escapeHtml(t.course_name||'课程')}` : '🌐 全局';
                        return `
                            <div class="task-card ${isOverdue && myStatus === 'pending' ? 'overdue' : ''}" onclick="App.navigate('task-view',{id:${t.id},title:'${escapeHtml(t.title)}'})">
                                <div class="task-card-header">
                                    <h4>${escapeHtml(t.title)}</h4>
                                    <span class="badge" style="background:var(--bg-alt);color:var(--text-muted);font-size:0.78rem;">${scopeTag}</span>
                                    ${isStudent ? `<span class="badge ${myStatus === 'graded' ? 'badge-accepted' : myStatus === 'submitted' ? 'badge-pending' : ''}">${statusMap[myStatus] || '待提交'}</span>` : ''}
                                    ${!isStudent ? `<span class="task-stat">📊 ${t.submission_count||0}提交 / ${t.graded_count||0}批改</span>` : ''}
                                </div>
                                <div class="task-card-meta">
                                    <span>👨‍🏫 ${escapeHtml(t.author_nickname || t.author_name || '')}</span>
                                    ${t.deadline ? `<span class="${isOverdue ? 'text-danger' : ''}">📅 ${t.deadline.substring(0,16)} ${isOverdue ? '(已截止)' : ''}</span>` : ''}
                                    ${isStudent && t.my_score !== null ? `<span>得分: <strong>${t.my_score}</strong></span>` : ''}
                                    <span>${timeAgo(t.created_at)}</span>
                                </div>
                            </div>`;
                    }).join('')}
                    ${data.items.length === 0 ? '<div class="empty-state"><div class="empty-icon">📋</div><h3>暂无任务</h3></div>' : ''}
                </div>`;
        } catch (e) {
            container.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><h3>加载失败</h3><p>${escapeHtml(e.message)}</p></div>`;
        }
    },

    async _createTask() {
        let classOptions = '<option value="">-- 不关联班级 --</option>';
        let courseOptions = '<option value="">-- 不关联课程 --</option>';
        try {
            const classes = await API.get('/classes');
            classOptions += classes.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
            const courses = await API.get('/courses', { page: 1, page_size: 50 });
            courseOptions += (courses.items||[]).map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
        } catch(e) {}
        showModal(`
            <div class="modal-title">📋 发布任务</div>
            <div style="max-height:70vh;overflow-y:auto;">
                <div class="form-group"><label>任务标题 *</label><input type="text" id="task-title" placeholder="如：Python 基础作业"></div>
                <div class="form-group"><label>发布范围</label>
                    <select id="task-scope" onchange="Pages._onTaskScopeChange()">
                        <option value="global">🌐 全局（所有学生可见）</option>
                        <option value="course">📚 课程（仅选课学生）</option>
                        <option value="class">🏫 班级（仅指定班级）</option>
                    </select>
                </div>
                <div class="form-group" id="task-course-group" style="display:none"><label>关联课程</label>
                    <select id="task-course-id">${courseOptions}</select>
                </div>
                <div class="form-group" id="task-class-group" style="display:none"><label>关联班级</label>
                    <select id="task-class-id">${classOptions}</select>
                </div>
                <div class="form-group"><label>内容 (Markdown) *</label><textarea id="task-content" rows="8" placeholder="任务描述，支持 Markdown..."></textarea></div>
                <div class="form-group"><label>截止时间</label><input type="datetime-local" id="task-deadline"></div>
            </div>
            <div style="display:flex;gap:0.5rem;justify-content:flex-end;margin-top:1rem;">
                <button class="btn btn-outline" onclick="hideModal()">取消</button>
                <button class="btn btn-primary" onclick="Pages._saveTask()">发布</button>
            </div>`);
    },

    _onTaskScopeChange() {
        const scope = $('#task-scope')?.value;
        if ($('#task-course-group')) $('#task-course-group').style.display = scope === 'course' ? '' : 'none';
        if ($('#task-class-group')) $('#task-class-group').style.display = scope === 'class' ? '' : 'none';
    },

    async _saveTask() {
        const scope = $('#task-scope')?.value || 'global';
        const courseId = scope === 'course' ? (parseInt($('#task-course-id')?.value) || null) : null;
        const classId = scope === 'class' ? (parseInt($('#task-class-id')?.value) || null) : null;
        try {
            await API.post('/tasks', {
                title: $('#task-title').value,
                content: $('#task-content').value,
                scope,
                course_id: courseId,
                class_id: classId,
                deadline: $('#task-deadline').value ? $('#task-deadline').value.replace('T', ' ') + ':00' : null,
            });
            hideModal(); showToast('任务发布成功！', 'success'); Pages.tasks();
        } catch (e) { showToast(e.message, 'error'); }
    },

    async taskView(params) {
        const container = $('#page-content');
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">⏳</div><h3>加载中...</h3></div>';
        try {
            const task = await API.get(`/tasks/${params.id}`);
            window._currentTaskData = task; // 供批改弹窗读取学生提交内容
            const isStudent = App.user.role === 'student';
            const isTeacher = ['teacher', 'admin'].includes(App.user.role);
            const isOverdue = task.deadline && new Date(task.deadline) < new Date();
            const sub = task.my_submission || null;
            let submitHTML = '';
            if (isStudent) {
                if (sub && sub.status === 'graded') {
                    submitHTML = `<div class="card" style="margin-bottom:1rem;">
                        <div class="card-title" style="margin-bottom:0.5rem;">✅ 批改结果</div>
                        <p><strong>得分: ${sub.score !== null ? sub.score + '分' : '未评分'}</strong></p>
                        ${sub.feedback ? `<p style="margin-top:0.5rem;color:var(--text-secondary);"><strong>反馈:</strong> ${escapeHtml(sub.feedback)}</p>` : ''}
                        <p style="font-size:0.8rem;color:var(--text-muted);margin-top:0.3rem;">提交: ${sub.submitted_at} | 批改: ${sub.graded_at || '-'}</p>
                    </div>`;
                }
                submitHTML += `<div class="card" style="margin-bottom:1rem;">
                    <div class="card-title" style="margin-bottom:0.5rem;">📝 提交任务</div>
                    ${sub && sub.status === 'pending' ? '<div style="margin-bottom:0.5rem;padding:0.4rem 0.6rem;background:var(--warning-bg);border-radius:var(--radius);font-size:0.85rem;">⏳ 等待批改中</div>' : ''}
                    <textarea id="task-submit-content" rows="5" placeholder="输入你的答案或笔记..." style="width:100%;padding:0.6rem;border:1.5px solid var(--border);border-radius:var(--radius);resize:vertical;font-family:inherit;outline:none;">${sub ? escapeHtml(sub.content || '') : ''}</textarea>
                    <button class="btn btn-primary" style="margin-top:0.5rem;" onclick="Pages._submitTask(${params.id})" ${isOverdue && !sub ? 'disabled title="已截止"' : ''}>${sub ? '🔄 重新提交' : '📤 提交任务'}</button>
                </div>`;
            }
            let gradeHTML = '';
            if (isTeacher && task.submissions) {
                gradeHTML = `<div class="card"><div class="card-header"><span class="card-title">📊 提交记录 (${task.submissions.length})</span></div>
                    <div class="table-container"><table>
                        <thead><tr><th>学生</th><th>学号</th><th>班级</th><th>状态</th><th>得分</th><th>提交时间</th><th>操作</th></tr></thead>
                        <tbody>${task.submissions.map(s => `
                            <tr>
                                <td>${escapeHtml(s.nickname || s.username)}</td>
                                <td>${escapeHtml(s.student_number || '-')}</td>
                                <td>${escapeHtml(s.class_name || '-')}</td>
                                <td><span class="badge ${s.status==='graded'?'badge-accepted':'badge-pending'}">${s.status==='graded'?'已批改':'待批改'}</span></td>
                                <td>${s.score !== null ? s.score+'分' : '-'}</td>
                                <td>${timeAgo(s.submitted_at)}</td>
                                <td><button class="btn btn-sm btn-outline" onclick="Pages._gradeTask(${s.student_id},${params.id})">批改</button></td>
                            </tr>`).join('')}
                        </tbody></table></div>`;
                // 学生作业内容预览（折叠式）
                gradeHTML += `<div style="margin-top:0.75rem;">${task.submissions.map((s, i) => `
                    <details class="submission-preview" style="margin-bottom:0.5rem;border:1px solid var(--border-light);border-radius:var(--radius);overflow:hidden;">
                        <summary style="padding:0.5rem 0.75rem;background:var(--bg-card);cursor:pointer;font-size:0.88rem;display:flex;align-items:center;gap:0.5rem;user-select:none;">
                            <span style="font-weight:600;">${escapeHtml(s.nickname || s.username)}</span>
                            ${s.student_number ? `<span style="color:var(--text-muted);font-size:0.8rem;">${escapeHtml(s.student_number)}</span>` : ''}
                            ${s.status === 'graded' ? '<span class="badge badge-accepted" style="font-size:0.7rem;margin-left:auto;">已评 ' + (s.score !== null ? s.score + '分' : '') + '</span>' : '<span class="badge badge-pending" style="font-size:0.7rem;margin-left:auto;">待批改</span>'}
                        </summary>
                        <div style="padding:0.75rem;border-top:1px solid var(--border-light);">
                            <div style="font-size:0.82rem;color:var(--text-muted);margin-bottom:0.4rem;">📝 作业内容：</div>
                            <div class="md-content" style="max-height:400px;overflow-y:auto;font-size:0.9rem;line-height:1.6;">${App.renderMarkdown(s.content || '<em style="color:var(--text-muted)">(未填写内容)</em>')}</div>
                        </div>
                    </details>`).join('')}</div>`;
                gradeHTML += `</div>`;
            }
            container.innerHTML = `
                <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:1.25rem;">
                    <button class="btn btn-ghost" onclick="App.navigate('tasks')">← 返回</button>
                    <h3>${escapeHtml(task.title)}</h3>
                    ${isTeacher ? `<button class="btn btn-sm btn-danger" onclick="Pages._deleteTask(${params.id},'${escapeHtml(task.title)}')">🗑️ 删除</button>` : ''}
                </div>
                <div class="card" style="margin-bottom:1rem;">
                    <div class="task-detail-meta">
                        <span>👨‍🏫 ${escapeHtml(task.author_nickname || task.author_name || '')}</span>
                        ${task.course_name ? `<span>📚 ${escapeHtml(task.course_name)}</span>` : ''}
                        ${task.deadline ? `<span class="${isOverdue ? 'text-danger' : ''}">📅 截止: ${task.deadline.substring(0,16)} ${isOverdue ? '(已截止!)' : ''}</span>` : ''}
                        <span>${timeAgo(task.created_at)}</span>
                    </div>
                    <div class="md-content task-content-body">${App.renderMarkdown(task.content || '')}</div>
                </div>
                ${submitHTML}${gradeHTML}`;
        } catch (e) {
            container.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><h3>加载失败</h3><p>${escapeHtml(e.message)}</p></div>`;
        }
    },

    async _submitTask(taskId) {
        const content = $('#task-submit-content').value.trim();
        if (!content) { showToast('请输入内容', 'error'); return; }
        try {
            await API.post(`/tasks/${taskId}/submit`, { content });
            showToast('任务提交成功！', 'success');
            App.navigate('task-view', { id: taskId, title: $('#breadcrumb').textContent });
        } catch (e) { showToast(e.message, 'error'); }
    },

    _gradeTask(studentId, taskId) {
        // 找到该学生的提交内容
        const taskData = window._currentTaskData;
        const submission = (taskData && taskData.submissions) ? taskData.submissions.find(s => s.student_id === studentId) : null;
        showModal(`
            <div class="modal-title">📊 批改任务</div>
            <div class="form-group">
                <label>📝 学生作业</label>
                <div id="grade-submission-content" style="max-height:300px;overflow-y:auto;padding:0.75rem;border:1px solid var(--border-light);border-radius:var(--radius);background:var(--bg-card);font-size:0.9rem;line-height:1.6;white-space:pre-wrap;">${submission ? escapeHtml(submission.content || '(未填写内容)') : '<em style="color:var(--text-muted)">(未找到提交记录)</em>'}</div>
            </div>
            <div class="form-group"><label>得分</label><input type="number" id="grade-score" min="0" max="100" placeholder="0-100" value="${submission && submission.score != null ? submission.score : ''}"></div>
            <div class="form-group"><label>反馈</label><textarea id="grade-feedback" rows="3" placeholder="给学生反馈...">${submission && submission.feedback ? escapeHtml(submission.feedback) : ''}</textarea></div>
            <div style="display:flex;gap:0.5rem;justify-content:flex-end;margin-top:1rem;">
                <button class="btn btn-outline" onclick="hideModal()">取消</button>
                <button class="btn btn-primary" onclick="Pages._saveGrade(${studentId},${taskId})">确认批改</button>
            </div>`);
    },

    async _saveGrade(studentId, taskId) {
        try {
            await API.put(`/tasks/${taskId}/grade`, {
                student_id: studentId, score: parseInt($('#grade-score').value) || 0,
                feedback: $('#grade-feedback').value,
            });
            hideModal(); showToast('批改完成', 'success');
            App.navigate('task-view', { id: taskId, title: $('#breadcrumb').textContent });
        } catch (e) { showToast(e.message, 'error'); }
    },

    async _deleteTask(taskId, title) {
        if (!confirm(`确定删除任务「${title}」吗？`)) return;
        try {
            await API.delete(`/tasks/${taskId}`);
            showToast('任务已删除', 'success');
            App.navigate('tasks');
        } catch (e) { showToast(e.message, 'error'); }
    },

    // ── 管理员：任务管理 ──────────────────────────────
    async manageTasks() {
        const container = $('#page-content');
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">⏳</div><h3>加载中...</h3></div>';
        try {
            const data = await API.get('/tasks', { page: 1, page_size: 50 });
            container.innerHTML = `
                <div class="toolbar"><h3>📋 任务管理 (${data.total})</h3>
                    <button class="btn btn-primary" onclick="Pages._createTask()">+ 发布任务</button></div>
                <div class="card"><div class="table-container"><table>
                    <thead><tr><th>ID</th><th>标题</th><th>课程</th><th>截止时间</th><th>提交/批改</th><th>操作</th></tr></thead>
                    <tbody>${data.items.map(t => `
                        <tr><td>${t.id}</td><td><strong>${escapeHtml(t.title)}</strong></td><td>${escapeHtml(t.course_name||'公共')}</td>
                        <td>${t.deadline ? t.deadline.substring(0,16) : '无'}</td>
                        <td>${t.submission_count||0} / ${t.graded_count||0}</td>
                        <td><button class="btn btn-sm btn-outline" onclick="App.navigate('task-view',{id:${t.id},title:'${escapeHtml(t.title)}'})">查看</button>
                        <button class="btn btn-sm btn-danger" onclick="Pages._deleteTask(${t.id},'${escapeHtml(t.title)}')">删除</button></td></tr>`).join('')}
                    </tbody></table></div></div>`;
        } catch (e) {
            container.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><h3>${escapeHtml(e.message)}</h3></div>`;
        }
    },

    // ── 管理员：用户管理 ──────────────────────────────
    async manageUsersAdmin() {
        const container = $('#page-content');
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">⏳</div><h3>加载中...</h3></div>';
        try {
            const data = await API.get('/users', { page: 1, page_size: 100, role: '' });
            const roleMap = { student: '学生', teacher: '教师', admin: '管理员' };
            container.innerHTML = `
                <div class="toolbar"><h3>👤 用户管理 (${data.total})</h3>
                    <div style="display:flex;gap:0.5rem;">
                        <button class="btn btn-primary btn-sm" onclick="Pages._showCreateUser()">➕ 注册账号</button>
                        <button class="btn btn-outline btn-sm" onclick="Pages._showBatchCreateUsers()">📦 批量注册</button>
                    </div>
                </div>
                <div class="card"><div class="table-container"><table>
                    <thead><tr><th>ID</th><th>用户名</th><th>昵称</th><th>角色</th><th>提交</th><th>通过</th><th>操作</th></tr></thead>
                    <tbody>${data.items.map(u => `
                        <tr><td>${u.id}</td><td><strong>${escapeHtml(u.username)}</strong></td><td>${escapeHtml(u.nickname||'-')}</td>
                        <td><select onchange="Pages._changeRole(${u.id},this.value)" ${u.id===App.user.id?'disabled':''}>
                            ${['student','teacher','admin'].map(r=>`<option value="${r}" ${u.role===r?'selected':''}>${roleMap[r]}</option>`).join('')}
                        </select></td>
                        <td>${u.submission_count}</td><td>${u.solved_count}</td>
                        <td><button class="btn btn-sm btn-danger" onclick="Pages._deleteUser(${u.id},'${escapeHtml(u.username)}')">删除</button>
                        <button class="btn btn-sm btn-outline" onclick="Pages._resetPassword(${u.id},'${escapeHtml(u.username)}')">重置密码</button></td></tr>`).join('')}
                    </tbody></table></div></div>`;
        } catch (e) {
            container.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><h3>${escapeHtml(e.message)}</h3></div>`;
        }
    },

    _showCreateUser() {
        showModal(`
            <div class="modal-title">➕ 注册新账号</div>
            <div class="form-row">
                <div class="form-group"><label>用户名 *</label><input type="text" id="cu-username" placeholder="3-20 个字符"></div>
                <div class="form-group"><label>邮箱 *</label><input type="email" id="cu-email" placeholder="user@example.com"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label>密码 *</label><input type="password" id="cu-password" placeholder="至少 6 个字符"></div>
                <div class="form-group"><label>角色 *</label>
                    <select id="cu-role"><option value="student">学生</option><option value="teacher">教师</option></select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group"><label>昵称</label><input type="text" id="cu-nickname" placeholder="选填"></div>
                <div class="form-group"><label>学号</label><input type="text" id="cu-student-number" placeholder="选填"></div>
            </div>
            <div class="form-group"><label>班级</label><input type="text" id="cu-class-name" placeholder="选填"></div>
            <div style="display:flex;gap:0.5rem;justify-content:flex-end;margin-top:1rem;">
                <button class="btn btn-outline" onclick="hideModal()">取消</button>
                <button class="btn btn-primary" onclick="Pages._doCreateUser()">确认注册</button>
            </div>`);
    },

    async _doCreateUser() {
        const username = $('#cu-username').value.trim();
        const email = $('#cu-email').value.trim();
        const password = $('#cu-password').value;
        const role = $('#cu-role').value;
        const nickname = $('#cu-nickname').value.trim();
        const student_number = $('#cu-student-number').value.trim();
        const class_name = $('#cu-class-name').value.trim();
        if (!username || !email || !password) { showToast('用户名、邮箱、密码为必填项', 'error'); return; }
        if (username.length < 3) { showToast('用户名至少 3 个字符', 'error'); return; }
        if (password.length < 6) { showToast('密码至少 6 个字符', 'error'); return; }
        try {
            const res = await API.post('/admin/users/batch-create', {
                password,
                users: [{ username, email, role, nickname, student_number, class_name }]
            });
            hideModal();
            if (res.errors && res.errors.length > 0) {
                showToast(`注册完成，${res.created_count} 成功，${res.error_count} 失败: ${res.errors.join('; ')}`, 'warning');
            } else {
                showToast('注册成功！', 'success');
            }
            Pages.manageUsersAdmin();
        } catch (e) { showToast(e.message, 'error'); }
    },

    _showBatchCreateUsers() {
        showModal(`
            <div class="modal-title">📦 批量注册账号</div>
            <div style="margin-bottom:0.75rem;">
                <p style="color:var(--text-secondary);font-size:0.85rem;margin-bottom:0.5rem;">
                    💡 每行一个账号，格式：<code>用户名,邮箱,角色,学号,班级</code>（角色和学号、班级可选，角色默认为 student）
                </p>
                <p style="color:var(--text-secondary);font-size:0.85rem;">
                    示例：<code>zhangsan,zhangsan@stu.edu</code> 或 <code>lisi,lisi@stu.edu,student,2024003,CS2401</code>
                </p>
            </div>
            <div class="form-group">
                <label>默认密码 *</label>
                <input type="password" id="bc-password" placeholder="所有账号使用同一密码（至少6字符）" value="password123">
            </div>
            <div class="form-group">
                <label>默认角色</label>
                <select id="bc-role"><option value="student">学生</option><option value="teacher">教师</option></select>
            </div>
            <div class="form-group">
                <label>账号列表（每行一个）</label>
                <textarea id="bc-list" rows="8" placeholder="zhangsan,zhangsan@stu.edu,student,2024003,CS2401&#10;lisi,lisi@stu.edu,student,2024004,CS2401&#10;wangwu,wangwu@stu.edu" style="font-family:'JetBrains Mono',monospace;font-size:0.85rem;"></textarea>
            </div>
            <div style="display:flex;gap:0.5rem;justify-content:flex-end;margin-top:1rem;">
                <button class="btn btn-outline" onclick="hideModal()">取消</button>
                <button class="btn btn-primary" onclick="Pages._doBatchCreate()">开始批量注册</button>
            </div>`);
    },

    async _doBatchCreate() {
        const password = $('#bc-password').value;
        const defaultRole = $('#bc-role').value;
        const raw = $('#bc-list').value.trim();
        if (!raw) { showToast('请输入账号列表', 'error'); return; }
        if (password.length < 6) { showToast('密码至少 6 个字符', 'error'); return; }

        const lines = raw.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
        const users = [];
        for (const line of lines) {
            const parts = line.split(',').map(s => s.trim());
            if (parts.length < 2) continue;
            users.push({
                username: parts[0],
                email: parts[1],
                role: parts[2] || defaultRole,
                student_number: parts[3] || '',
                class_name: parts[4] || '',
                nickname: '',
            });
        }
        if (users.length === 0) { showToast('未解析到有效账号', 'error'); return; }
        if (users.length > 50) { showToast('单次最多 50 个账号', 'error'); return; }

        try {
            const btn = event.target;
            btn.disabled = true; btn.textContent = '注册中...';
            const res = await API.post('/admin/users/batch-create', { password, users });
            hideModal();
            let msg = `批量注册完成：成功 ${res.created_count} 个`;
            if (res.error_count > 0) msg += `，失败 ${res.error_count} 个`;
            showToast(msg, res.error_count > 0 ? 'warning' : 'success');
            if (res.created && res.created.length > 0) {
                const names = res.created.map(u => u.username).join(', ');
                console.log('[BatchCreate] Created:', names);
            }
            if (res.errors && res.errors.length > 0) {
                console.warn('[BatchCreate] Errors:', res.errors);
            }
            Pages.manageUsersAdmin();
        } catch (e) { showToast(e.message, 'error'); }
    },

    async _changeRole(uid, role) {
        try { await API.put(`/admin/users/${uid}/role`, { role }); showToast('角色已更新', 'success'); Pages.manageUsersAdmin(); }
        catch (e) { showToast(e.message, 'error'); }
    },

    async _deleteUser(uid, username) {
        if (!confirm(`确定要删除用户 "${username}" 吗？该用户的所有数据（代码、提交记录、讨论帖子等）将被永久删除，此操作不可恢复！`)) return;
        try { await API.delete(`/admin/users/${uid}`); showToast(`用户 "${username}" 已删除`, 'success'); Pages.manageUsersAdmin(); }
        catch (e) { showToast(e.message, 'error'); }
    },

    _resetPassword(uid, username) {
        showModal(`
            <div class="modal-title">🔑 重置密码</div>
            <p style="margin-bottom:1rem;">用户: <strong>@${escapeHtml(username)}</strong></p>
            <div class="form-group"><label>新密码 *</label><input type="password" id="reset-pw" placeholder="至少 6 个字符"></div>
            <div style="display:flex;gap:0.5rem;justify-content:flex-end;margin-top:1rem;">
                <button class="btn btn-outline" onclick="hideModal()">取消</button>
                <button class="btn btn-primary" onclick="Pages._doResetPassword(${uid})">确认重置</button>
            </div>`);
    },

    async _doResetPassword(uid) {
        const pw = $('#reset-pw').value;
        if (pw.length < 6) { showToast('密码至少 6 个字符', 'error'); return; }
        try { await API.put(`/admin/users/${uid}/reset-password`, { password: pw }); hideModal(); showToast('密码已重置', 'success'); }
        catch (e) { showToast(e.message, 'error'); }
    },

    // ── 管理员：系统设置 ──────────────────────────────
    async manageSettings() {
        const container = $('#page-content');
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">⏳</div><h3>加载中...</h3></div>';
        try {
            const settings = await API.get('/admin/settings');
            container.innerHTML = `
                <h3 style="margin-bottom:1.25rem;">⚙️ 系统设置</h3>
                <div class="card" style="max-width:600px;">
                    <div class="form-group"><label>站点名称</label><input type="text" id="set-site-name" value="${escapeHtml(settings.site_name||'')}"></div>
                    <div class="form-group"><label>站点描述</label><input type="text" id="set-site-desc" value="${escapeHtml(settings.site_description||'')}"></div>
                    <div class="form-group"><label>注册开关</label>
                        <select id="set-register"><option value="1" ${settings.register_enabled!=='0'?'selected':''}>允许注册</option><option value="0" ${settings.register_enabled==='0'?'selected':''}>禁止注册</option></select>
                    </div>
                    <div class="form-group"><label>默认网盘配额 (MB)</label><input type="number" id="set-quota" value="${Math.round(parseInt(settings.default_netdisk_quota||'209715200') / (1024*1024))}" min="10" max="10240"></div>
                    <button class="btn btn-primary" onclick="Pages._saveSettings()">💾 保存设置</button>
                </div>`;
        } catch (e) {
            container.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><h3>${escapeHtml(e.message)}</h3></div>`;
        }
    },

    async _saveSettings() {
        try {
            await API.put('/admin/settings', {
                site_name: $('#set-site-name').value, site_description: $('#set-site-desc').value,
                register_enabled: $('#set-register').value, default_netdisk_quota: parseInt($('#set-quota').value) * 1024 * 1024,
            });
            showToast('设置已保存', 'success');
        } catch (e) { showToast(e.message, 'error'); }
    },

    // ── 管理员：插件管理 ──────────────────────────────
    async managePlugins() {
        const container = $('#page-content');
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">⏳</div><h3>加载中...</h3></div>';
        try {
            const plugins = await API.get('/admin/plugins');
            container.innerHTML = `
                <h3 style="margin-bottom:1.25rem;">🧩 插件管理</h3>
                <div class="card" style="margin-bottom:1rem;padding:1rem;">
                    <p style="color:var(--text-secondary);margin-bottom:0.5rem;">💡 将插件文件夹放入 <code>plugins/</code> 目录，每个插件需包含 <code>plugin.py</code> 和可选的 <code>plugin.json</code> 元数据。服务器启动时自动加载。</p>
                </div>
                <div class="card">
                    <div class="card-header"><span class="card-title">已加载插件 (${plugins.length})</span></div>
                    ${plugins.length > 0 ? plugins.map(p => `
                        <div style="display:flex;align-items:center;gap:1rem;padding:0.75rem 0;border-bottom:1px solid var(--border-light);">
                            <span style="font-size:1.5rem;">${p.status === 'loaded' ? '✅' : '❌'}</span>
                            <div style="flex:1;"><strong>${escapeHtml(p.name)}</strong> <span style="font-size:0.8rem;color:var(--text-muted);">v${escapeHtml(p.version)}</span>
                                <p style="font-size:0.85rem;color:var(--text-secondary);margin-top:0.2rem;">${escapeHtml(p.description)}</p></div>
                            <span class="badge ${p.status === 'loaded' ? 'badge-accepted' : 'badge-wrong_answer'}">${p.status === 'loaded' ? '正常' : '错误'}</span>
                        </div>`).join('') : '<div class="empty-state"><p>暂无插件</p></div>'}
                </div>`;
        } catch (e) {
            container.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><h3>${escapeHtml(e.message)}</h3></div>`;
        }
    },

    _renderJsonCourse(data, fallbackName) {
        const title = data.title || fallbackName;
        const desc = data.description || '';
        const chapters = data.chapters || data.sections || [];
        let chapHtml = '';
        for (const [ci, ch] of chapters.entries()) {
            const chTitle = ch.title || `第 ${ci+1} 节`;
            const chContent = ch.content || ch.text || '';
            const chCode = ch.code || ch.example || '';
            const chTip = ch.tip || ch.note || '';
            chapHtml += `
<div class="card" style="margin-bottom:1.5rem;">
    <h3 style="margin:0 0 0.75rem;color:var(--primary);">第 ${ci+1} 节 · ${escapeHtml(chTitle)}</h3>
    ${chContent ? `<div style="white-space:pre-wrap;line-height:1.8;margin-bottom:1rem;">${escapeHtml(chContent)}</div>` : ''}
    ${chCode ? `
    <div style="margin:1rem 0;">
        <div style="font-size:0.85rem;color:var(--text-muted);margin-bottom:0.4rem;">💻 示例代码：</div>
        <pre style="background:#1e1e1e;color:#d4d4d4;padding:1rem;border-radius:0.5rem;overflow:auto;font-size:0.88rem;line-height:1.6;">${escapeHtml(chCode)}</pre>
    </div>` : ''}
    ${chTip ? `<div style="background:#fef9e7;border-left:4px solid #f39c12;padding:0.75rem 1rem;border-radius:0 0.4rem 0.4rem 0;font-size:0.9rem;">💡 ${escapeHtml(chTip)}</div>` : ''}
    ${ch.quiz ? `<div style="margin-top:1rem;padding:0.75rem;background:var(--bg-secondary);border-radius:0.5rem;font-size:0.9rem;">🤔 思考题：${escapeHtml(ch.quiz)}</div>` : ''}
</div>`;
        }
        return `
<div style="padding:0.75rem 1rem;border-bottom:1px solid var(--border-color);">
    <b>📋 ${escapeHtml(title)}</b>
    ${desc ? `<span style="margin-left:1rem;font-size:0.85rem;color:var(--text-muted);">${escapeHtml(desc)}</span>` : ''}
</div>
<div style="flex:1;overflow:auto;padding:1.5rem;">
    <div style="max-width:800px;margin:0 auto;">
        <h2 style="margin-bottom:0.5rem;">${escapeHtml(title)}</h2>
        ${desc ? `<p style="color:var(--text-muted);margin-bottom:2rem;">${escapeHtml(desc)}</p>` : ''}
        ${chapHtml || '<p style="color:var(--text-muted);">（此文件没有 chapters 字段）</p>'}
    </div>
</div>`;
    },

    // ── 班级管理 ──────────────────────────────────────
    async manageClasses() {
        const container = $('#page-content');
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">⏳</div><h3>加载中...</h3></div>';
        try {
            const classes = await API.get('/classes');
            const isAdmin = ['teacher','admin'].includes(App.user.role);
            container.innerHTML = `
                <div class="toolbar">
                    <h3>🏫 班级管理 (${classes.length})</h3>
                    ${isAdmin ? '<button class="btn btn-primary" onclick="Pages._createClass()">+ 新建班级</button>' : ''}
                </div>
                <div class="card">
                    <div class="table-container"><table>
                        <thead><tr><th>ID</th><th>班级名称</th><th>描述</th><th>学生数</th><th>讨论区数</th><th>创建人</th><th>操作</th></tr></thead>
                        <tbody>${classes.length > 0 ? classes.map(c => `
                            <tr>
                                <td>${c.id}</td>
                                <td><strong>${escapeHtml(c.name)}</strong></td>
                                <td>${escapeHtml(c.description || '—')}</td>
                                <td>${c.student_count || 0}</td>
                                <td>${c.discussion_count || 0}</td>
                                <td>${escapeHtml(c.creator_name || '—')}</td>
                                <td>
                                    <button class="btn btn-sm btn-outline" onclick="Pages._manageClassStudents(${c.id},'${escapeHtml(c.name)}')">👥 学生</button>
                                    <button class="btn btn-sm btn-outline" onclick="Pages._editClass(${c.id},'${escapeHtml(c.name)}','${escapeHtml(c.description||'')}')">编辑</button>
                                    ${App.user.role === 'admin' ? `<button class="btn btn-sm btn-danger" onclick="Pages._deleteClass(${c.id},'${escapeHtml(c.name)}')">删除</button>` : ''}
                                </td>
                            </tr>`).join('') : '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);">暂无班级</td></tr>'}
                        </tbody>
                    </table></div>
                </div>`;
        } catch (e) {
            container.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><h3>加载失败</h3><p>${escapeHtml(e.message)}</p></div>`;
        }
    },

    async _manageClassStudents(cid, cname) {
        let classStudents = [], availableStudents = [];
        try {
            [classStudents, availableStudents] = await Promise.all([
                API.get('/classes/' + cid + '/students'),
                API.get('/classes/' + cid + '/available-students'),
            ]);
        } catch (e) { showToast(e.message, 'error'); return; }

        // 过滤掉已经在当前班级的学生，避免重复显示
        const classStudentIds = new Set(classStudents.map(s => s.id));
        const filteredAvailable = availableStudents.filter(s => !classStudentIds.has(s.id));

        showModal(`
            <div class="modal-header"><h3>👥 管理班级学生 — ${escapeHtml(cname)}</h3><button class="modal-close" onclick="hideModal()">✕</button></div>
            <div class="modal-body" style="max-height:60vh;overflow:auto;">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                    <div>
                        <div style="font-weight:600;margin-bottom:0.5rem;color:var(--success);">✅ 班级学生 (${classStudents.length})</div>
                        <div style="max-height:40vh;overflow-y:auto;border:1px solid var(--border-color);border-radius:0.5rem;">
                            ${classStudents.length === 0
                                ? '<div style="padding:1rem;text-align:center;color:var(--text-muted);">暂无学生</div>'
                                : classStudents.map(s => `
                                    <div style="display:flex;align-items:center;padding:0.5rem 0.75rem;border-bottom:1px solid var(--border-color);">
                                        <div style="flex:1;">
                                            <div style="font-size:0.9rem;">${escapeHtml(s.nickname || s.username)}</div>
                                            <div style="font-size:0.75rem;color:var(--text-muted);">${escapeHtml(s.student_number||'')} ${escapeHtml(s.email||'')}</div>
                                        </div>
                                        <button class="btn btn-sm" style="color:#e74c3c;border-color:#e74c3c;" onclick="Pages._removeClassStudent(${cid},${s.id},'${escapeHtml(cname)}')">移除</button>
                                    </div>`).join('')}
                        </div>
                    </div>
                    <div>
                        <div style="font-weight:600;margin-bottom:0.5rem;color:var(--primary);">➕ 添加学生</div>
                        <div style="margin-bottom:0.5rem;">
                            <input type="text" class="form-control" id="cls-add-search" placeholder="搜索学生..." oninput="Pages._filterClassStudentList(this.value)">
                        </div>
                        <div id="cls-add-list" style="max-height:35vh;overflow-y:auto;border:1px solid var(--border-color);border-radius:0.5rem;">
                            ${filteredAvailable.length === 0
                                ? '<div style="padding:1rem;text-align:center;color:var(--text-muted);">没有可添加的学生</div>'
                                : filteredAvailable.map(s => `
                                    <div class="cls-add-item" style="display:flex;align-items:center;padding:0.5rem 0.75rem;border-bottom:1px solid var(--border-color);"
                                         data-name="${escapeHtml((s.nickname||s.username)+' '+(s.student_number||'')+' '+(s.email||'')).toLowerCase()}">
                                        <div style="flex:1;">
                                            <div style="font-size:0.9rem;">${escapeHtml(s.nickname || s.username)}${s.class_name ? ` <span style="font-size:0.7rem;color:#e67e22;background:#fef3e2;padding:1px 6px;border-radius:3px;margin-left:4px;">${escapeHtml(s.class_name)}</span>` : ''}</div>
                                            <div style="font-size:0.75rem;color:var(--text-muted);">${escapeHtml(s.student_number||'')} ${escapeHtml(s.email||'')}</div>
                                        </div>
                                        <button class="btn btn-sm btn-primary" onclick="Pages._addClassStudent(${cid},${s.id},'${escapeHtml(cname)}')">+ 添加</button>
                                    </div>`).join('')}
                        </div>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-outline" onclick="hideModal()">关闭</button>
            </div>
        `);
    },

    _filterClassStudentList(keyword) {
        const kw = keyword.toLowerCase();
        document.querySelectorAll('.cls-add-item').forEach(el => {
            el.style.display = (!kw || el.dataset.name.includes(kw)) ? '' : 'none';
        });
    },

    async _addClassStudent(cid, sid, cname) {
        try {
            await API.post('/classes/' + cid + '/students', { student_ids: [sid] });
            showToast('添加成功', 'success');
            Pages._manageClassStudents(cid, cname);
        } catch (e) { showToast(e.message, 'error'); }
    },

    async _removeClassStudent(cid, sid, cname) {
        try {
            await API.delete('/classes/' + cid + '/students/' + sid);
            showToast('已从班级移除', 'success');
            Pages._manageClassStudents(cid, cname);
        } catch (e) { showToast(e.message, 'error'); }
    },

    _createClass() {
        showModal(`
            <div class="modal-title">🏫 新建班级</div>
            <div class="form-group"><label>班级名称 *</label><input type="text" id="cls-name" placeholder="如：CS2401"></div>
            <div class="form-group"><label>描述</label><textarea id="cls-desc" rows="3" placeholder="班级简介（可选）..."></textarea></div>
            <div style="display:flex;gap:0.5rem;justify-content:flex-end;margin-top:1rem;">
                <button class="btn btn-outline" onclick="hideModal()">取消</button>
                <button class="btn btn-primary" onclick="Pages._saveClass()">创建</button>
            </div>`);
    },

    async _saveClass(id) {
        const name = $('#cls-name').value.trim();
        if (!name) { showToast('请输入班级名称', 'error'); return; }
        try {
            if (id) {
                await API.put(`/classes/${id}`, { name, description: $('#cls-desc').value });
            } else {
                await API.post('/classes', { name, description: $('#cls-desc').value });
            }
            hideModal(); showToast(id ? '班级已更新' : '班级创建成功！', 'success'); Pages.manageClasses();
        } catch (e) { showToast(e.message, 'error'); }
    },

    _editClass(id, name, desc) {
        showModal(`
            <div class="modal-title">✏️ 编辑班级</div>
            <div class="form-group"><label>班级名称 *</label><input type="text" id="cls-name" value="${escapeHtml(name)}"></div>
            <div class="form-group"><label>描述</label><textarea id="cls-desc" rows="3">${escapeHtml(desc)}</textarea></div>
            <div style="display:flex;gap:0.5rem;justify-content:flex-end;margin-top:1rem;">
                <button class="btn btn-outline" onclick="hideModal()">取消</button>
                <button class="btn btn-primary" onclick="Pages._saveClass(${id})">保存</button>
            </div>`);
    },

    async _deleteClass(id, name) {
        if (!confirm(`确定删除班级"${name}"？关联的讨论区和网盘不会自动删除。`)) return;
        try {
            await API.delete(`/classes/${id}`);
            showToast('班级已删除', 'success'); Pages.manageClasses();
        } catch (e) { showToast(e.message, 'error'); }
    },

    // ═══════════════════════════════════════════
    // 博客中心 Blog
    // ═══════════════════════════════════════════

    async blog() {
        const isAuthor = ['teacher','admin'].includes(App.user.role);
        const container = $('#page-content');
        container.innerHTML = '<div class="empty-state"><div class="nav-icon">📰</div><h3>加载中...</h3></div>';

        try {
            const data = await API.get('/blog?limit=20');
            const list = data.list || [];
            const total = data.total || 0;

            let html = `
            <div class="page-header-row">
                <h2>📰 博客中心</h2>
                ${isAuthor ? `<button class="btn btn-primary" onclick="Pages.blogEdit()">✏️ 写文章</button>` : ''}
                <div class="search-box" style="margin-left:auto;">
                    <input type="text" id="blog-search" placeholder="搜索文章..." onkeyup="if(event.key==='Enter')Pages._blogSearch()">
                    <button class="btn btn-outline btn-sm" onclick="Pages._blogSearch()">搜索</button>
                </div>
            </div>
            <div class="blog-filter-bar">
                <button class="filter-btn active" data-status="" onclick="Pages._blogFilter(this,'')">全部 (${total})</button>
                ${isAuthor ? `<button class="filter-btn" data-status="published" onclick="Pages._blogFilter(this,'published')">🌍 已发布</button>
                <button class="filter-btn" data-status="draft" onclick="Pages._blogFilter(this,'draft')">📝 草稿</button>` : ''}
            </div>
            `;

            if (list.length === 0) {
                html += `<div class="empty-state"><div class="empty-icon">📝</div><h3>暂无文章</h3>
                         <p>${isAuthor ? '点击上方「写文章」开始创作吧！' : '还没有发布文章哦~'}</p></div>`;
            } else {
                html += '<div class="blog-list">';
                for (const a of list) {
                    const statusBadge = a.status === 'published'
                        ? '<span class="badge badge-success">已发布</span>'
                        : '<span class="badge badge-secondary">草稿</span>';
                    const coverStyle = a.cover_image ? `style="background-image:url(${escapeHtml(a.cover_image)});background-size:cover;background-position:center;"` : '';
                    html += `
                    <article class="blog-card" onclick="App.navigate('blog-detail',{id:${a.id}})">
                        <div class="blog-card-cover" ${coverStyle}>
                            ${a.cover_image ? '' : '<div class="blog-cover-placeholder">📰</div>'}
                            ${isAuthor ? `<span class="blog-card-actions"><span onclick="event.stopPropagation();Pages.blogEdit({id:${a.id}})" title="编辑">✏️</span>
                                <span onclick="event.stopPropagation();Pages._deleteBlog(${a.id},'${escapeHtml(a.title)}')" title="删除">🗑️</span></span>` : ''}
                        </div>
                        <div class="blog-card-body">
                            <div class="blog-card-meta">${statusBadge} ${_formatTime(a.created_at)}
                                <span style="float:right;">👁 ${a.view_count || 0}</span>
                            </div>
                            <h3 class="blog-card-title">${escapeHtml(a.title)}</h3>
                            <p class="blog-card-summary">${escapeHtml(a.summary || a.content_preview)}</p>
                            <div class="blog-card-footer">
                                <span class="author-tag">${escapeHtml(a.author_name || '未知')}</span>
                                ${(a.attachment_count > 0) ? `<span>📎 ${a.attachment_count} 个附件</span>` : ''}
                            </div>
                        </div>
                    </article>`;
                }
                html += '</div>';
            }

            container.innerHTML = html;
            Pages._blogCurrentData = data;
        } catch (e) {
            showToast(e.message, 'error');
        }
    },

    async _blogFilter(btn, status) {
        $$('.blog-filter-bar .filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const container = $('#page-content');
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">⏳</div><h3>加载中...</h3></div>';
        try {
            const qs = status ? `?status=${status}&limit=20` : '?limit=20';
            const data = await API.get('/blog' + qs);
            Pages._renderBlogList(data);
        } catch (e) { showToast(e.message, 'error'); }
    },

    _renderBlogList(data) {
        const isAuthor = ['teacher','admin'].includes(App.user.role);
        const list = data.list || [];
        let html = `
        <div class="page-header-row">
            <h2>📰 博客中心</h2>
            ${isAuthor ? `<button class="btn btn-primary" onclick="Pages.blogEdit()">✏️ 写文章</button>` : ''}
            <div class="search-box" style="margin-left:auto;"><input type="text" id="blog-search" placeholder="搜索文章..." onkeyup="if(event.key==='Enter')Pages._blogSearch()">
            <button class="btn btn-outline btn-sm" onclick="Pages._blogSearch()">搜索</button></div>
        </div>`;
        if (list.length === 0) {
            html += `<div class="empty-state"><div class="empty-icon">📝</div><h3>暂无文章</h3></div>`;
        } else {
            html += '<div class="blog-list">';
            for (const a of list) {
                const statusBadge = a.status === 'published' ? '<span class="badge badge-success">已发布</span>' : '<span class="badge badge-secondary">草稿</span>';
                html += `<article class="blog-card" onclick="App.navigate('blog-detail',{id:${a.id}})">
                    <div class="blog-card-body">
                        <div class="blog-card-meta">${statusBadge} ${_formatTime(a.created_at)} <span style="float:right;">👁 ${a.view_count||0}</span></div>
                        <h3 class="blog-card-title">${escapeHtml(a.title)}</h3>
                        <p class="blog-card-summary">${escapeHtml(a.summary || a.content_preview)}</p>
                        <div class="blog-card-footer"><span>${escapeHtml(a.author_name||'')}</span>${(a.attachment_count>0)?' 📎'+a.attachment_count+'个附件':''}</div>
                    </div>
                </article>`;
            }
            html += '</div>';
        }
        $('#page-content').innerHTML = html;
    },

    async _blogSearch() {
        const kw = $('#blog-search').value.trim();
        if (!kw) return Pages.blog();
        try {
            const data = await API.get('/blog?keyword=' + encodeURIComponent(kw) + '&limit=20');
            Pages._renderBlogList(data);
        } catch (e) { showToast(e.message, 'error'); }
    },

    async blogEdit(params = {}) {
        const editId = params && params.id;
        const isEdit = !!editId;

        const container = $('#page-content');
        container.innerHTML = `
        <div class="page-header-row">
            <h2>${isEdit ? '✏️ 编辑文章' : '✏️ 写文章'}</h2>
            <button class="btn btn-outline" onclick="App.navigate('blog')">← 返回列表</button>
        </div>
        <div class="blog-editor-wrap">
            <div class="form-group">
                <label>标题 *</label>
                <input type="text" id="blog-title" placeholder="请输入文章标题..." value="">
            </div>
            <div class="form-group">
                <label>摘要（可选，留空则自动截取）</label>
                <input type="text" id="blog-summary" placeholder="一句话描述这篇文章...">
            </div>
            <div class="form-group">
                <label>封面图 URL（可选）</label>
                <input type="text" id="blog-cover" placeholder="https://... 留空使用默认样式">
            </div>
            <div class="form-group">
                <label>正文内容（Markdown）*</label>
                <textarea id="blog-content-easymde"></textarea>
            </div>

            <!-- 附件区域 -->
            <div id="blog-attach-area" style="display:none;margin-top:1.5rem;padding:1rem;background:var(--bg-secondary);border-radius:8px;border:1px solid var(--border-color);">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem;">
                    <strong>📎 附件管理</strong>
                    <div>
                        <label class="btn btn-sm btn-primary" style="cursor:pointer;position:relative;">
                            ⬆ 上传附件
                            <input type="file" id="blog-file-input" multiple style="display:none;" onchange="Pages._uploadBlogAttach()">
                        </label>
                    </div>
                </div>
                <div id="blog-attach-list"></div>
            </div>

            <div class="form-row" style="margin-top:1.5rem;display:flex;gap:1rem;align-items:center;">
                <label style="font-size:0.9rem;color:var(--text-muted);display:flex;align-items:center;gap:0.4rem;">
                    <input type="checkbox" id="blog-pub-check" ${!isEdit ? '' : ''}> 直接发布
                </label>
                <div style="flex:1;"></div>
                <button class="btn btn-outline" onclick="App.navigate('blog')">取消</button>
                <button class="btn btn-success" id="blog-save-draft" onclick="Pages._saveBlog('draft')">💾 保存草稿</button>
                <button class="btn btn-primary" id="blog-save-publish" onclick="Pages._saveBlog('publish')">🚀 发布文章</button>
            </div>
        </div>`;

        // 如果是编辑模式，加载文章数据并填充
        if (editId) {
            try {
                const art = await API.get(`/blog/${editId}`);
                $('#blog-title').value = art.title || '';
                $('#blog-summary').value = art.summary || '';
                $('#blog-cover').value = art.cover_image || '';
                $('#blog-pub-check').checked = art.status === 'published';
                // 存储 content，等 EasyMDE 初始化后填入
                Pages._blogEditContent = art.content || '';

                // 显示附件区域
                $('#blog-attach-area').style.display = 'block';
                Pages._currentBlogId = editId;
                // 渲染已有附件
                if (art.attachments && art.attachments.length > 0) {
                    Pages._renderBlogAttachments(art.attachments);
                }
            } catch (e) {
                showToast(e.message, 'error'); return;
            }
        }

        // 初始化 EasyMDE 编辑器
        setTimeout(() => {
            if (typeof EasyMDE === 'undefined') {
                console.warn('[Blog] EasyMDE not loaded, falling back to textarea');
                const ta = document.getElementById('blog-content-easymde');
                if (ta) { ta.value = Pages._blogEditContent || ''; ta.style.minHeight = '400px'; ta.style.width='100%';ta.style.padding='1rem';ta.style.border='1px solid var(--border-color)';ta.style.borderRadius='8px';ta.style.fontFamily='monospace';return; }
            }

            const easyMDE = new EasyMDE({
                element: document.getElementById('blog-content-easymde'),
                placeholder: '在这里用 Markdown 撰写你的文章...',
                minHeight: '450px',
                maxHeight: '80vh',
                autofocus: !isEdit,
                autoDownloadFontAwesome: false,
                spellChecker: false,
                toolbar: [
                    'bold', 'italic', 'strikethrough', 'heading', '|',
                    'quote', 'unordered-list', 'ordered-list', '|',
                    'link', 'image', '|',
                    'code', 'table', 'horizontal-rule', '|',
                    'preview', 'side-by-side', 'fullscreen', '|',
                    'undo', 'redo',
                    {
                        name: 'upload-attach',
                        action: (editor) => {
                            document.getElementById('blog-file-input').click();
                        },
                        className: 'fa fa-paperclip',
                        title: '上传附件到文章',
                    },
                ],
                imageUploadFunction: async function(file, onSuccess, onError) {
                    // 图片上传：先临时保存为附件关联到当前文章
                    // 对于新文章，先保存草稿获取 ID
                    try {
                        if (!Pages._currentBlogId) {
                            const title = $('#blog-title').value.trim() || '未命名草稿';
                            const res = await API.post('/blog', { title, content: editor.value(), status: 'draft' });
                            Pages._currentBlogId = res.id;
                            showToast(`已自动创建草稿 #${res.id}`, 'info');
                            $('#blog-attach-area').style.display = 'block';
                        }
                        const formData = new FormData();
                        formData.append('file', file);
                        const token = localStorage.getItem('cc_token');
                        const attRes = await fetch(`${API.baseUrl}/blog/${Pages._currentBlogId}/attachments`, {
                            method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData,
                        });
                        const j = await attRes.json();
                        if (j.code !== 0) throw new Error(j.message || '上传失败');
                        // 返回下载 URL
                        onSuccess(`${API.baseUrl}/blog/attachments/${j.data.id}/preview`);
                        // 刷新附件列表
                        const detail = await API.get(`/blog/${Pages._currentBlogId}`);
                        if (detail.attachments) Pages._renderBlogAttachments(detail.attachments);
                    } catch (err) {
                        onError(err.message || '图片上传失败');
                    }
                },
                uploadImage: true,
                imagePathAbsolute: true,
            });

            // 填充内容（编辑模式）
            if (Pages._blogEditContent) {
                easyMDE.value(Pages._blogEditContent);
                Pages._blogEditContent = null;
            }
            Pages._easyMDEInstance = easyMDE;
        }, 100);
    },

    async _saveBlog(action) {
        const title = ($('#blog-title').value || '').trim();
        if (!title) { showToast('请输入标题', 'error'); return; }

        const content = Pages._easyMDEInstance ? Pages._easyMDEInstance.value() : ($('#blog-content-easymde')?.value || '');
        const summary = ($('#blog-summary')?.value || '').trim();
        const coverImage = ($('#blog-cover')?.value || '').trim();
        const pubCheck = $('#blog-pub-check')?.checked;
        const status = action === 'publish' || pubCheck ? 'published' : 'draft';

        const body = { title, content, summary, cover_image: coverImage, status };

        try {
            if (Pages._currentBlogId) {
                await API.put(`/blog/${Pages._currentBlogId}`, body);
                showToast(status === 'published' ? '文章已发布 ✨' : '草稿已保存 💾', 'success');
            } else {
                const res = await API.post('/blog', body);
                Pages._currentBlogId = res.id;
                showToast(status === 'published' ? '文章已发布 ✨' : '草稿已保存 💾', 'success');
            }
            App.navigate('blog');
        } catch (e) { showToast(e.message, 'error'); }
    },

    async _uploadBlogAttach() {
        const input = document.getElementById('blog-file-input');
        if (!input.files.length) return;

        // 如果是新文章，先自动保存草稿以获取 ID
        if (!Pages._currentBlogId) {
            const title = ($('#blog-title').value || '').trim() || '未命名草稿';
            const content = Pages._easyMDEInstance ? Pages._easyMDEInstance.value() : '';
            try {
                const res = await API.post('/blog', { title, content, status: 'draft' });
                Pages._currentBlogId = res.id;
                showToast(`已自动创建草稿 #${res.id}`, 'info');
                $('#blog-attach-area').style.display = 'block';
            } catch (e) { showToast(e.message, 'error'); return; }
        }

        const files = input.files;
        let successCount = 0;
        const token = localStorage.getItem('cc_token');

        for (const f of files) {
            try {
                const fd = new FormData();
                fd.append('file', f);
                const r = await fetch(`${API.baseUrl}/blog/${Pages._currentBlogId}/attachments`, {
                    method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: fd,
                });
                const j = await r.json();
                if (j.code === 0) successCount++;
                else showToast(`${f.name}: ${j.message}`, 'error');
            } catch (e) { showToast(`${f.name}: 上传失败`, 'error'); }
        }

        if (successCount > 0) {
            showToast(`成功上传 ${successCount} 个文件`, 'success');
            // 刷新附件列表
            try {
                const detail = await API.get(`/blog/${Pages._currentBlogId}`);
                if (detail.attachments) Pages._renderBlogAttachments(detail.attachments);
            } catch (e) {}
        }
        input.value = ''; // 清除选择
    },

    _renderBlogAttachments(atts) {
        const el = document.getElementById('blog-attach-list');
        if (!el) return;
        if (!atts || atts.length === 0) { el.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">暂无附件</p>'; return; }

        let h = '';
        for (const a of atts) {
            h += `
            <div class="blog-att-item" data-id="${a.id}">
                <span class="att-icon">${fileIcon(a.original_name)}</span>
                <span class="att-name" title="${escapeHtml(a.original_name)}">${escapeHtml(a.original_name)}</span>
                <span class="att-size">${formatFileSize(a.file_size)}</span>
                <span class="att-actions">
                    <a href="${API.baseUrl}/blog/attachments/${a.id}/download" target="_blank" title="下载" onclick="event.stopPropagation()">⬇</a>
                    <a href="${API.baseUrl}/blog/attachments/${a.id}/preview" target="_blank" title="预览" onclick="event.stopPropagation()">👁</a>
                    <span title="删除" onclick="event.stopPropagation();Pages._removeAttach(${a.id})" style="cursor:pointer;color:var(--danger);">✕</span>
                </span>
            </div>`;
        }
        el.innerHTML = h;
    },

    async _removeAttach(attId) {
        if (!confirm('确定删除此附件？')) return;
        try {
            await API.delete(`/blog/attachments/${attId}`);
            showToast('附件已删除', 'success');
            // 刷新
            if (Pages._currentBlogId) {
                const d = await API.get(`/blog/${Pages._currentBlogId}`);
                Pages._renderBlogAttachments(d.attachments || []);
            }
        } catch (e) { showToast(e.message, 'error'); }
    },

    async blogDetail(params = {}) {
        const bid = params && params.id;
        if (!bid) { App.navigate('blog'); return; }
        const container = $('#page-content');
        const isAuthor = ['teacher','admin'].includes(App.user.role);

        container.innerHTML = '<div class="empty-state"><div class="empty-icon">⏳</div><h3>加载文章...</h3></div>';

        try {
            const art = await API.get(`/blog/${bid}`);
            // 渲染 Markdown 内容为 HTML
            const renderedContent = App.renderMarkdown(art.content || '');

            let attachHtml = '';
            if (art.attachments && art.attachments.length > 0) {
                attachHtml = `
                <div class="blog-detail-att-section">
                    <h4>📎 附件（${art.attachments.length} 个文件）</h4>
                    <div class="blog-att-grid">`;
                for (const a of art.attachments) {
                    attachHtml += `
                    <div class="blog-att-card">
                        <div class="blog-att-icon-lg">${fileIcon(a.original_name)}</div>
                        <div class="blog-att-info">
                            <div class="blog-att-name" title="${escapeHtml(a.original_name)}">${escapeHtml(a.original_name)}</div>
                            <div class="blog-att-meta">${formatFileSize(a.file_size)} · 下载 ${a.download_count||0} 次</div>
                        </div>
                        <div class="blog-att-btns">
                            <a href="${API.baseUrl}/blog/attachments/${a.id}/preview" target="_blank" class="btn btn-sm btn-outline" title="预览">👁 预览</a>
                            <a href="${API.baseUrl}/blog/attachments/${a.id}/download" target="_blank" class="btn btn-sm btn-primary" title="下载">⬇ 下载</a>
                        </div>
                    </div>`;
                }
                attachHtml += '</div></div>';
            }

            container.innerHTML = `
            <div class="page-header-row">
                <button class="btn btn-outline" onclick="App.navigate('blog')">← 返回博客中心</button>
                <div style="margin-left:auto;">
                    ${isAuthor && (art.author_id == App.user.id || App.user.role == 'admin') ?
                        `<button class="btn btn-outline" onclick="Pages.blogEdit({id:${art.id}})">✏️ 编辑</button>` : ''}
                </div>
            </div>

            <article class="blog-article">
                <header class="blog-art-header">
                    ${art.cover_image ? `<img src="${escapeHtml(art.cover_image)}" alt="封面" class="blog-cover-img" onerror="this.style.display='none';">` : ''}
                    <h1 class="blog-art-title">${escapeHtml(art.title)}</h1>
                    <div class="blog-art-meta">
                        <span class="author-tag">${escapeHtml(art.author_name || '')}</span>
                        <span>·</span>
                        <span>${_formatTime(art.created_at)}</span>
                        ${art.updated_at !== art.created_at ? `<span>· 更新于 ${_formatTime(art.updated_at)}</span>` : ''}
                        <span>·</span>
                        <span>👁 ${art.view_count || 0} 阅读</span>
                    </div>
                </header>

                <div class="blog-art-body markdown-body">${renderedContent}</div>

                ${attachHtml}

                <footer class="blog-art-footer" style="margin-top:2rem;padding-top:1rem;border-top:1px solid var(--border-color);color:var(--text-muted);font-size:0.85rem;">
                    发布于 ${art.published_at ? _formatTime(art.published_at) : (art.status === 'draft' ? '草稿箱' : '-')}
                </footer>
            </article>`;
        } catch (e) {
            if (e.message.includes('不存在')) {
                container.innerHTML = `<div class="empty-state"><div class="empty-icon">🚫</div><h3>文章不存在或已被删除</h3><button class="btn btn-primary" onclick="App.navigate('blog')">返回列表</button></div>`;
            } else {
                showToast(e.message, 'error');
            }
        }
    },

    async _deleteBlog(id, title) {
        if (!confirm(`确定删除文章"${title}"？\n\n此操作不可恢复，相关附件也会一并删除！`)) return;
        try {
            await API.delete(`/blog/${id}`);
            showToast('文章已删除', 'success');
            Pages.blog();
        } catch (e) { showToast(e.message, 'error'); }
    },
};


// ═══════════════════════════════════════════════════════════
// 启动应用
// ═══════════════════════════════════════════════════════════
// 等待 vendor-loader.js 加载完所有第三方依赖后再初始化
// 如果 vendor-loader 不存在（降级方案），则在 DOMContentLoaded 时直接启动
if (typeof VendorLoader !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        VendorLoader.init(() => {
            App.init();
        });
    });
} else {
    document.addEventListener('DOMContentLoaded', App.init.bind(App));
}
