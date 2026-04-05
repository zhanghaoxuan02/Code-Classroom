/**
 * 考试系统插件 - 前端模块
 * 自动注入到主应用，通过 ExamPages 命名空间提供所有页面渲染函数
 * 依赖：全局 API、App、$、$$、showToast、showModal、hideModal、escapeHtml、timeAgo
 */

// ═══════════════════════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════════════════════
function examFormatTime(seconds) {
    if (!seconds || seconds <= 0) return '不限时';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function examQTypeLabel(type) {
    return { single:'单选题', multi:'多选题', judge:'判断题', fill:'填空题', code:'代码题', operation:'实操题' }[type] || type;
}

function examQTypeBadge(type) {
    const colors = { single:'#4f87f0', multi:'#9b59b6', judge:'#27ae60', fill:'#e67e22', code:'#e74c3c', operation:'#1abc9c' };
    return `<span style="background:${colors[type]||'#999'};color:#fff;padding:2px 8px;border-radius:12px;font-size:0.75rem;">${examQTypeLabel(type)}</span>`;
}

function examStatusBadge(status) {
    const map = {
        draft:     ['草稿',    '#999',   '#f5f5f5'],
        published: ['已发布',  '#27ae60','#eafaf1'],
        closed:    ['已关闭',  '#e74c3c','#fdecea'],
        pending:   ['待开始',  '#f39c12','#fef9e7'],
        active:    ['进行中',  '#27ae60','#eafaf1'],
        in_progress:['答题中', '#4f87f0','#eaf2fb'],
        submitted: ['待批改',  '#f39c12','#fef9e7'],
        graded:    ['已批改',  '#27ae60','#eafaf1'],
    };
    const [text, color, bg] = map[status] || [status,'#999','#f5f5f5'];
    return `<span style="background:${bg};color:${color};border:1px solid ${color};padding:2px 8px;border-radius:12px;font-size:0.75rem;">${text}</span>`;
}

// ═══════════════════════════════════════════════════════════
// 考试系统主命名空间
// ═══════════════════════════════════════════════════════════
const ExamPages = {

    // ─── 【学生/教师】考试列表 ────────────────────────────────
    async examList(params = {}) {
        const container = document.getElementById('page-content');
        container.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>加载中...</p></div>';
        const isTeacher = App.user && App.user.role !== 'student';

        try {
            const data = await API.get('/exam/sessions');
            const sessions = data.sessions || [];

            container.innerHTML = `
<div class="page-header">
    <h2>📝 在线考试</h2>
    <div style="display:flex;gap:0.5rem;">
        ${isTeacher ? `
        <button class="btn btn-outline" onclick="ExamPages.paperManager()">📄 试卷管理</button>
        <button class="btn btn-primary" onclick="ExamPages.createSessionModal()">+ 新建考试</button>
        ` : `
        <button class="btn btn-outline" onclick="ExamPages.myResults()">📊 我的成绩</button>
        `}
    </div>
</div>

<div class="card-grid" id="exam-session-list">
${sessions.length === 0 ? `
    <div class="empty-state" style="grid-column:1/-1">
        <div class="empty-icon">📝</div>
        <h3>暂无考试</h3>
        <p>${isTeacher ? '点击右上角新建考试安排' : '当前没有可参加的考试'}</p>
    </div>
` : sessions.map(s => ExamPages._sessionCard(s, isTeacher)).join('')}
</div>`;
        } catch (e) {
            container.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><h3>加载失败</h3><p>${escapeHtml(e.message)}</p></div>`;
        }
    },

    _sessionCard(s, isTeacher) {
        const now = new Date();
        const start = s.start_time ? new Date(s.start_time) : null;
        const end = s.end_time ? new Date(s.end_time) : null;
        let timeInfo = '不限时间';
        if (start && end) timeInfo = `${s.start_time.slice(0,16)} ~ ${s.end_time.slice(0,16)}`;
        else if (start) timeInfo = `${s.start_time.slice(0,16)} 开始`;
        else if (end) timeInfo = `截止 ${s.end_time.slice(0,16)}`;

        const canStart = (s.status === 'active') && (!start || now >= start) && (!end || now <= end || s.allow_late);
        const myStatus = s.my_status;
        const scopeTag = s.scope === 'class' ? `🏫 班级` : s.scope === 'personal' ? '🔒 个人' : '🌐 全局';

        return `
<div class="card" style="cursor:default;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0.75rem;">
        <div>
            <h3 style="margin:0 0 0.25rem;">${escapeHtml(s.title)}</h3>
            <p style="margin:0;color:var(--text-muted);font-size:0.85rem;">${escapeHtml(s.paper_title||'')} &nbsp;<span style="background:var(--bg-alt);padding:0.1rem 0.4rem;border-radius:4px;font-size:0.78rem;">${scopeTag}</span></p>
        </div>
        ${examStatusBadge(s.status)}
    </div>
    <div style="color:var(--text-muted);font-size:0.85rem;margin-bottom:1rem;">
        <div>🕐 ${timeInfo}</div>
        <div>👤 ${escapeHtml(s.creator_name||'')}</div>
        ${myStatus ? `<div>我的状态：${examStatusBadge(myStatus)} ${s.my_score !== null && s.my_score !== undefined ? `<b style="color:#27ae60"> ${s.my_score} 分</b>` : ''}</div>` : ''}
    </div>
    <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
        ${isTeacher ? `
            <button class="btn btn-sm btn-outline" onclick="ExamPages.sessionSubmissions('${s.id}','${escapeHtml(s.title)}')">查看答卷</button>
            ${s.pending_grade_count > 0 ? `<button class="btn btn-sm btn-primary" style="background:#e67e22;border-color:#e67e22;" onclick="ExamPages.sessionSubmissions('${s.id}','${escapeHtml(s.title)}')">✍️ 待批改 ${s.pending_grade_count} 份</button>` : ''}
            <button class="btn btn-sm btn-outline" onclick="ExamPages.sessionStats('${s.id}','${escapeHtml(s.title)}')">成绩统计</button>
            <button class="btn btn-sm btn-outline" onclick="ExamPages.editSessionModal('${s.id}')">编辑</button>
            <button class="btn btn-sm btn-danger" onclick="ExamPages.deleteSession('${s.id}')">删除</button>
        ` : canStart && !myStatus ? `
            <button class="btn btn-sm btn-primary" onclick="ExamPages.startExam('${s.id}','${escapeHtml(s.title)}')">开始考试</button>
        ` : myStatus === 'in_progress' ? `
            <button class="btn btn-sm btn-primary" onclick="ExamPages.startExam('${s.id}','${escapeHtml(s.title)}')">继续作答</button>
        ` : myStatus === 'submitted' ? `
            <span style="color:#f39c12;font-size:0.85rem;">📋 等待批改</span>
        ` : myStatus === 'graded' && s.my_submission_id ? `
            <button class="btn btn-sm btn-outline" onclick="ExamPages.reviewSubmission('${s.my_submission_id}')">查看成绩单</button>
        ` : `
            <span style="color:var(--text-muted);font-size:0.85rem;">${s.status === 'pending' ? '⏳ 尚未开放' : s.status === 'closed' ? '🔒 已关闭' : '暂无权限'}</span>
        `}
    </div>
</div>`;
    },

    // ─── 【教师】试卷管理列表 ────────────────────────────────
    async paperManager(params = {}) {
        App.navigate('exam-papers');
    },

    async _renderPaperManager() {
        const container = document.getElementById('page-content');
        container.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>加载中...</p></div>';
        try {
            const data = await API.get('/exam/papers');
            const papers = data.papers || [];
            container.innerHTML = `
<div class="page-header">
    <div style="display:flex;align-items:center;gap:1rem;">
        <button class="btn btn-ghost" onclick="App.navigate('exam')">← 返回</button>
        <h2>📄 试卷管理</h2>
    </div>
    <div style="display:flex;gap:0.5rem;">
        <button class="btn btn-outline" onclick="ExamPages.importPaperModal()">📥 导入 JSON</button>
        <button class="btn btn-primary" onclick="ExamPages.createPaperModal()">+ 新建试卷</button>
    </div>
</div>
<div class="table-container">
<table>
    <thead><tr>
        <th>试卷名称</th><th>题目数</th><th>满分</th><th>判卷方式</th><th>状态</th><th>创建者</th><th>操作</th>
    </tr></thead>
    <tbody>
    ${papers.length === 0 ? `<tr><td colspan="7" class="text-center text-muted">暂无试卷</td></tr>` :
      papers.map(p => `
        <tr>
            <td><b>${escapeHtml(p.title)}</b><br><small style="color:var(--text-muted)">${escapeHtml(p.description||'')}</small></td>
            <td>${p.question_count||'-'}</td>
            <td>${p.total_score} 分</td>
            <td>${p.grading_mode === 'auto' ? '🤖 自动' : p.grading_mode === 'manual' ? '✍️ 人工' : '🔀 混合'}</td>
            <td>${examStatusBadge(p.status)}</td>
            <td>${escapeHtml(p.creator_name||'')}</td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="ExamPages.editPaper('${p.id}','${escapeHtml(p.title)}')">编辑题目</button>
                <button class="btn btn-sm btn-outline" onclick="ExamPages.exportPaper('${p.id}','${escapeHtml(p.title)}')">导出</button>
                <button class="btn btn-sm btn-danger" onclick="ExamPages.deletePaper('${p.id}')">删除</button>
            </td>
        </tr>`).join('')}
    </tbody>
</table>
</div>`;
        } catch (e) {
            container.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><h3>加载失败</h3><p>${escapeHtml(e.message)}</p></div>`;
        }
    },

    // ─── 新建试卷弹窗 ─────────────────────────────────────
    createPaperModal() {
        showModal(`
<div class="modal-header"><h3>📄 新建试卷</h3><button class="modal-close" onclick="hideModal()">✕</button></div>
<div class="modal-body">
    <div class="form-group"><label>试卷名称 *</label><input id="pm-title" class="form-control" placeholder="请输入试卷名称"></div>
    <div class="form-group"><label>描述</label><textarea id="pm-desc" class="form-control" rows="2" placeholder="考试说明（选填）"></textarea></div>
    <div class="form-row">
        <div class="form-group"><label>考试时限（分钟，0=不限）</label><input id="pm-time" class="form-control" type="number" value="0" min="0"></div>
        <div class="form-group"><label>满分</label><input id="pm-total" class="form-control" type="number" value="100" min="1"></div>
        <div class="form-group"><label>及格分</label><input id="pm-pass" class="form-control" type="number" value="60" min="0"></div>
    </div>
    <div class="form-row">
        <div class="form-group">
            <label>判卷方式</label>
            <select id="pm-grading" class="form-control">
                <option value="auto">🤖 全自动（选择/判断/填空/代码用例）</option>
                <option value="manual">✍️ 全人工</option>
                <option value="mixed">🔀 混合（自动+人工）</option>
            </select>
        </div>
        <div class="form-group"><label>
            <input type="checkbox" id="pm-review" checked> 允许完成后查看答案
        </label></div>
    </div>
    <div class="form-row">
        <div class="form-group"><label><input type="checkbox" id="pm-shuffle-q"> 随机题目顺序</label></div>
        <div class="form-group"><label><input type="checkbox" id="pm-shuffle-o"> 随机选项顺序</label></div>
    </div>
</div>
<div class="modal-footer">
    <button class="btn btn-ghost" onclick="hideModal()">取消</button>
    <button class="btn btn-primary" onclick="ExamPages._doCreatePaper()">创建</button>
</div>`);
    },

    async _doCreatePaper() {
        const title = document.getElementById('pm-title').value.trim();
        if (!title) { showToast('请输入试卷名称', 'error'); return; }
        try {
            const res = await API.post('/exam/papers', {
                title,
                description: document.getElementById('pm-desc').value,
                time_limit: parseInt(document.getElementById('pm-time').value) * 60,
                total_score: parseInt(document.getElementById('pm-total').value),
                pass_score: parseInt(document.getElementById('pm-pass').value),
                grading_mode: document.getElementById('pm-grading').value,
                allow_review: document.getElementById('pm-review').checked,
                shuffle_questions: document.getElementById('pm-shuffle-q').checked,
                shuffle_options: document.getElementById('pm-shuffle-o').checked,
            });
            hideModal();
            showToast('试卷创建成功！', 'success');
            ExamPages.editPaper(res.id, title);
        } catch (e) { showToast(e.message, 'error'); }
    },

    // ─── 试卷题目编辑页 ───────────────────────────────────
    async editPaper(paperId, paperTitle) {
        App.currentParams = { paperId, paperTitle };
        App.navigate('exam-paper-edit', { paperId, paperTitle });
    },

    async _renderPaperEdit(params) {
        const { paperId, paperTitle } = params;
        const container = document.getElementById('page-content');
        container.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';
        try {
            const paper = await API.get(`/exam/papers/${paperId}`);
            const questions = paper.questions || [];
            ExamPages._currentQuestions = questions; // 供编辑弹窗查找数据

            container.innerHTML = `
<div class="page-header">
    <div style="display:flex;align-items:center;gap:1rem;">
        <button class="btn btn-ghost" onclick="App.navigate('exam-papers')">← 返回</button>
        <h2>✏️ ${escapeHtml(paper.title)}</h2>
        ${examStatusBadge(paper.status)}
    </div>
    <div style="display:flex;gap:0.5rem;">
        <button class="btn btn-outline" onclick="ExamPages.addQuestionModal('${paperId}')">+ 添加题目</button>
        <button class="btn btn-outline" onclick="ExamPages._togglePaperStatus('${paperId}','${paper.status}')">
            ${paper.status === 'published' ? '📦 收回草稿' : '🚀 发布试卷'}
        </button>
    </div>
</div>
<div style="color:var(--text-muted);font-size:0.85rem;margin-bottom:1rem;display:flex;gap:1.5rem;">
    <span>📊 共 ${questions.length} 题</span>
    <span>🏆 满分 ${paper.total_score} 分</span>
    <span>⏰ ${paper.time_limit ? Math.floor(paper.time_limit/60)+'分钟' : '不限时'}</span>
    <span>判卷：${paper.grading_mode==='auto'?'自动':paper.grading_mode==='manual'?'人工':'混合'}</span>
</div>
<div id="question-list">
${questions.length === 0 ?
    '<div class="empty-state"><div class="empty-icon">📋</div><h3>暂无题目</h3><p>点击"添加题目"开始组卷</p></div>' :
    questions.map((q, i) => ExamPages._questionCard(q, i, paperId)).join('')
}
</div>`;
        } catch (e) {
            container.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><h3>加载失败</h3><p>${escapeHtml(e.message)}</p></div>`;
        }
    },

    _questionCard(q, idx, paperId) {
        const optionsHtml = Array.isArray(q.options) && q.options.length > 0
            ? q.options.map((opt, i) => {
                const letter = String.fromCharCode(65 + i);
                const isCorrect = (q.type === 'single' && q.correct_answer === letter) ||
                    (q.type === 'multi' && (q.correct_answer || '').includes(letter));
                return `<div style="padding:2px 0;color:${isCorrect?'#27ae60':'inherit'}">${letter}. ${escapeHtml(opt)} ${isCorrect?'✓':''}</div>`;
              }).join('')
            : '';

        return `
<div class="card" style="margin-bottom:0.75rem;" id="q-card-${q.id}">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div style="flex:1;">
            <div style="margin-bottom:0.5rem;">${examQTypeBadge(q.type)} <b>第 ${idx+1} 题</b> <span style="color:var(--text-muted);font-size:0.85rem;">${q.score} 分</span></div>
            <div style="white-space:pre-wrap;margin-bottom:0.5rem;">${escapeHtml(q.content)}</div>
            ${optionsHtml ? `<div style="font-size:0.9rem;margin-bottom:0.5rem;">${optionsHtml}</div>` : ''}
            ${q.type === 'fill' || q.type === 'judge' ? `<div style="font-size:0.85rem;color:#27ae60;">✓ 答案：${escapeHtml(q.correct_answer||'')}</div>` : ''}
            ${q.explanation ? `<div style="font-size:0.85rem;color:#888;margin-top:0.25rem;">💡 解析：${escapeHtml(q.explanation)}</div>` : ''}
        </div>
        <div style="display:flex;gap:0.5rem;margin-left:1rem;flex-shrink:0;">
            <button class="btn btn-sm btn-outline" onclick="ExamPages.editQuestionModal('${q.id}','${paperId}')">编辑</button>
            <button class="btn btn-sm btn-danger" onclick="ExamPages.deleteQuestion('${q.id}','${paperId}')">删除</button>
        </div>
    </div>
</div>`;
    },

    async _togglePaperStatus(paperId, currentStatus) {
        const newStatus = currentStatus === 'published' ? 'draft' : 'published';
        try {
            await API.put(`/exam/papers/${paperId}`, { status: newStatus });
            showToast(newStatus === 'published' ? '试卷已发布' : '已收回为草稿', 'success');
            App.navigate('exam-paper-edit', App.currentParams);
        } catch (e) { showToast(e.message, 'error'); }
    },

    // ─── 添加/编辑题目弹窗 ───────────────────────────────
    addQuestionModal(paperId) {
        ExamPages._questionModal(null, paperId);
    },

    async editQuestionModal(questionId, paperId) {
        // 从已加载的题目数据中查找
        const q = (ExamPages._currentQuestions || []).find(q => String(q.id) === String(questionId));
        ExamPages._questionModal(questionId, paperId, q || null);
    },

    _questionModal(questionId, paperId, prefill = null) {
        const q = prefill || {};
        showModal(`
<div class="modal-header">
    <h3>${questionId ? '✏️ 编辑题目' : '➕ 添加题目'}</h3>
    <button class="modal-close" onclick="hideModal()">✕</button>
</div>
<div class="modal-body" style="max-height:70vh;overflow-y:auto;">
    <div class="form-row">
        <div class="form-group">
            <label>题目类型 *</label>
            <select id="qm-type" class="form-control" onchange="ExamPages._onQTypeChange()">
                <option value="single"  ${q.type==='single' ?'selected':''}>单选题</option>
                <option value="multi"   ${q.type==='multi'  ?'selected':''}>多选题</option>
                <option value="judge"   ${q.type==='judge'  ?'selected':''}>判断题</option>
                <option value="fill"    ${q.type==='fill'   ?'selected':''}>填空题</option>
                <option value="code"    ${q.type==='code'   ?'selected':''}>代码题</option>
                <option value="operation" ${q.type==='operation'?'selected':''}>实操题</option>
            </select>
        </div>
        <div class="form-group">
            <label>分值</label>
            <input id="qm-score" class="form-control" type="number" value="${q.score||5}" min="1">
        </div>
    </div>
    <div class="form-group">
        <label>题目内容 *</label>
        <textarea id="qm-content" class="form-control" rows="4" placeholder="请输入题目内容...">${escapeHtml(q.content||'')}</textarea>
    </div>

    <!-- 选项区（单选/多选） -->
    <div id="qm-options-section">
        <label style="font-weight:500;">选项（A/B/C/D...，点击行尾 + 添加）</label>
        <div id="qm-options-list">
            ${ExamPages._buildOptionsHtml(q.options||['','','',''])}
        </div>
        <button class="btn btn-sm btn-outline" style="margin-top:0.5rem;" onclick="ExamPages._addOptionRow()">+ 添加选项</button>
    </div>

    <!-- 正确答案 -->
    <div id="qm-answer-section" class="form-group">
        <label>正确答案</label>
        <div id="qm-answer-input">${ExamPages._buildAnswerInput(q.type||'single', q.correct_answer||'', q.options||[])}</div>
    </div>

    <!-- 判断题专用 -->
    <div id="qm-judge-section" style="display:none;" class="form-group">
        <label>正确答案</label>
        <div style="display:flex;gap:1rem;">
            <label><input type="radio" name="qm-judge-ans" value="true" ${q.correct_answer==='true'?'checked':''}> 正确 ✓</label>
            <label><input type="radio" name="qm-judge-ans" value="false" ${q.correct_answer==='false'?'checked':''} > 错误 ✗</label>
        </div>
    </div>

    <!-- 填空题答案 -->
    <div id="qm-fill-section" style="display:none;" class="form-group">
        <label>参考答案（精确匹配）</label>
        <input id="qm-fill-ans" class="form-control" value="${escapeHtml(q.type==='fill'?q.correct_answer||'':'')}" placeholder="输入标准答案">
    </div>

    <!-- 代码题测试用例 -->
    <div id="qm-code-section" style="display:none;">
        <div class="form-group">
            <label>代码语言</label>
            <select id="qm-code-lang" class="form-control">
                <option value="python" ${q.code_lang==='python'?'selected':''}>Python</option>
                <option value="javascript" ${q.code_lang==='javascript'?'selected':''}>JavaScript</option>
                <option value="c" ${q.code_lang==='c'?'selected':''}>C</option>
                <option value="cpp" ${q.code_lang==='cpp'?'selected':''}>C++</option>
            </select>
        </div>
        <div class="form-group">
            <label>测试用例（JSON 数组，留空则人工判卷）</label>
            <textarea id="qm-testcases" class="form-control" rows="5" placeholder='[{"input":"5\\n3","expected":"8","lang":"python"},{"input":"10\\n2","expected":"12","lang":"python"}]'>${
                q.type==='code' ? escapeHtml(q.correct_answer||'') : ''
            }</textarea>
            <small style="color:var(--text-muted)">每个用例：input（标准输入），expected（期望输出），lang（语言）</small>
        </div>
    </div>

    <!-- 实操题说明 -->
    <div id="qm-op-section" style="display:none;">
        <div class="form-group">
            <label>操作要求（Markdown）</label>
            <textarea id="qm-op-req" class="form-control" rows="4" placeholder="描述学生需要完成的操作步骤...">${
                q.type==='operation' ? escapeHtml(q.correct_answer||'') : ''
            }</textarea>
        </div>
    </div>

    <div class="form-group">
        <label>解析/说明（选填）</label>
        <textarea id="qm-explanation" class="form-control" rows="2" placeholder="可选：答案解析">${escapeHtml(q.explanation||'')}</textarea>
    </div>
</div>
<div class="modal-footer">
    <button class="btn btn-ghost" onclick="hideModal()">取消</button>
    <button class="btn btn-primary" onclick="ExamPages._doSaveQuestion('${questionId||''}','${paperId}')">保存</button>
</div>`);
        ExamPages._onQTypeChange();
    },

    _buildOptionsHtml(options) {
        return (options||['','','']).map((opt, i) => {
            const letter = String.fromCharCode(65 + i);
            return `<div class="option-row" style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.4rem;">
                <span style="width:1.5rem;font-weight:bold;color:#4f87f0;">${letter}.</span>
                <input class="form-control qm-opt" style="flex:1;" value="${escapeHtml(opt)}" placeholder="选项内容">
                <button onclick="this.parentElement.remove()" style="background:none;border:none;color:#e74c3c;cursor:pointer;font-size:1.1rem;">✕</button>
            </div>`;
        }).join('');
    },

    _buildAnswerInput(type, correctAnswer, options) {
        if (type === 'single') {
            const letters = (options||[]).map((_, i) => String.fromCharCode(65+i));
            return letters.map(l => `<label style="margin-right:1rem;"><input type="radio" name="qm-single-ans" value="${l}" ${correctAnswer===l?'checked':''}> ${l}</label>`).join('');
        }
        if (type === 'multi') {
            const letters = (options||[]).map((_, i) => String.fromCharCode(65+i));
            const selected = Array.isArray(correctAnswer) ? correctAnswer : (correctAnswer||'').split('');
            return letters.map(l => `<label style="margin-right:1rem;"><input type="checkbox" class="qm-multi-ans" value="${l}" ${selected.includes(l)?'checked':''}> ${l}</label>`).join('');
        }
        return '';
    },

    _addOptionRow() {
        const list = document.getElementById('qm-options-list');
        const count = list.querySelectorAll('.option-row').length;
        const letter = String.fromCharCode(65 + count);
        const div = document.createElement('div');
        div.className = 'option-row';
        div.style.cssText = 'display:flex;align-items:center;gap:0.5rem;margin-bottom:0.4rem;';
        div.innerHTML = `
            <span style="width:1.5rem;font-weight:bold;color:#4f87f0;">${letter}.</span>
            <input class="form-control qm-opt" style="flex:1;" placeholder="选项内容">
            <button onclick="this.parentElement.remove()" style="background:none;border:none;color:#e74c3c;cursor:pointer;font-size:1.1rem;">✕</button>`;
        list.appendChild(div);
    },

    _onQTypeChange() {
        const type = document.getElementById('qm-type')?.value;
        if (!type) return;
        const show = (id, v) => { const el = document.getElementById(id); if (el) el.style.display = v ? '' : 'none'; };
        show('qm-options-section', ['single','multi'].includes(type));
        show('qm-answer-section', ['single','multi'].includes(type));
        show('qm-judge-section', type === 'judge');
        show('qm-fill-section', type === 'fill');
        show('qm-code-section', type === 'code');
        show('qm-op-section', type === 'operation');
    },

    async _doSaveQuestion(questionId, paperId) {
        const type = document.getElementById('qm-type').value;
        const content = document.getElementById('qm-content').value.trim();
        if (!content) { showToast('请输入题目内容', 'error'); return; }

        // 收集选项
        const optEls = document.querySelectorAll('.qm-opt');
        const options = Array.from(optEls).map(el => el.value.trim()).filter(Boolean);

        // 正确答案
        let correctAnswer = '';
        if (type === 'single') {
            const r = document.querySelector('input[name="qm-single-ans"]:checked');
            correctAnswer = r ? r.value : '';
        } else if (type === 'multi') {
            const checked = document.querySelectorAll('.qm-multi-ans:checked');
            correctAnswer = JSON.stringify(Array.from(checked).map(el => el.value));
        } else if (type === 'judge') {
            const r = document.querySelector('input[name="qm-judge-ans"]:checked');
            correctAnswer = r ? r.value : 'true';
        } else if (type === 'fill') {
            correctAnswer = document.getElementById('qm-fill-ans').value;
        } else if (type === 'code') {
            correctAnswer = document.getElementById('qm-testcases').value.trim();
        } else if (type === 'operation') {
            correctAnswer = document.getElementById('qm-op-req').value.trim();
        }

        const payload = {
            type, content, options, correct_answer: correctAnswer,
            score: parseInt(document.getElementById('qm-score').value) || 5,
            explanation: document.getElementById('qm-explanation').value,
        };

        try {
            if (questionId) {
                await API.put(`/exam/questions/${questionId}`, payload);
                showToast('题目更新成功', 'success');
            } else {
                await API.post(`/exam/papers/${paperId}/questions`, payload);
                showToast('题目添加成功', 'success');
            }
            hideModal();
            App.navigate('exam-paper-edit', App.currentParams);
        } catch (e) { showToast(e.message, 'error'); }
    },

    async deleteQuestion(questionId, paperId) {
        if (!confirm('确定删除这道题目？')) return;
        try {
            await API.delete(`/exam/questions/${questionId}`);
            showToast('删除成功', 'success');
            App.navigate('exam-paper-edit', App.currentParams);
        } catch (e) { showToast(e.message, 'error'); }
    },

    // ─── 导出/导入试卷 ────────────────────────────────────
    async exportPaper(paperId, title) {
        try {
            const data = await API.get(`/exam/papers/${paperId}/export`);
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `${title||'试卷'}.json`;
            document.body.appendChild(a); a.click();
            document.body.removeChild(a); URL.revokeObjectURL(url);
            showToast('导出成功', 'success');
        } catch (e) { showToast(e.message, 'error'); }
    },

    importPaperModal() {
        showModal(`
<div class="modal-header"><h3>📥 导入试卷</h3><button class="modal-close" onclick="hideModal()">✕</button></div>
<div class="modal-body">
    <p style="color:var(--text-muted);font-size:0.9rem;">支持导入由本系统导出的 JSON 格式试卷文件，或按格式手动编写。</p>
    <div class="form-group">
        <label>选择 JSON 文件</label>
        <input type="file" id="import-file" class="form-control" accept=".json">
    </div>
    <div class="form-group">
        <label>或直接粘贴 JSON 内容</label>
        <textarea id="import-json" class="form-control" rows="10" placeholder='{"title":"试卷名","questions":[...]}'></textarea>
    </div>
</div>
<div class="modal-footer">
    <button class="btn btn-ghost" onclick="hideModal()">取消</button>
    <button class="btn btn-primary" onclick="ExamPages._doImportPaper()">导入</button>
</div>`);

        document.getElementById('import-file').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => { document.getElementById('import-json').value = ev.target.result; };
            reader.readAsText(file);
        });
    },

    async _doImportPaper() {
        const text = document.getElementById('import-json').value.trim();
        if (!text) { showToast('请选择文件或粘贴 JSON', 'error'); return; }
        try {
            const paper = JSON.parse(text);
            await API.post('/exam/papers/import', { paper });
            hideModal();
            showToast('试卷导入成功！', 'success');
            App.navigate('exam-papers');
        } catch (e) { showToast('导入失败：' + e.message, 'error'); }
    },

    async deletePaper(paperId) {
        if (!confirm('确定删除这套试卷？所有题目和考试记录将一并删除，不可恢复！')) return;
        try {
            await API.delete(`/exam/papers/${paperId}`);
            showToast('删除成功', 'success');
            App.navigate('exam-papers');
        } catch (e) { showToast(e.message, 'error'); }
    },

    // ─── 新建/编辑考试安排弹窗 ───────────────────────────
    async createSessionModal(prefill = null) {
        const papers = (await API.get('/exam/papers').catch(() => ({ papers: [] }))).papers || [];
        let classOptions = '<option value="">-- 不限定班级 --</option>';
        try {
            const classes = await API.get('/classes');
            classOptions += classes.map(c => `<option value="${c.id}" ${(prefill && prefill.class_id == c.id) ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('');
        } catch(e) {}
        const s = prefill || {};
        const scope = s.scope || 'global';
        showModal(`
<div class="modal-header"><h3>${prefill ? '✏️ 编辑考试' : '📅 新建考试安排'}</h3><button class="modal-close" onclick="hideModal()">✕</button></div>
<div class="modal-body">
    <div class="form-group">
        <label>考试标题 *</label>
        <input id="sm-title" class="form-control" value="${escapeHtml(s.title||'')}" placeholder="如：期末考试">
    </div>
    <div class="form-group">
        <label>选择试卷 *</label>
        <select id="sm-paper" class="form-control">
            <option value="">-- 请选择试卷 --</option>
            ${papers.map(p => `<option value="${p.id}" ${s.paper_id===p.id?'selected':''}>${escapeHtml(p.title)}</option>`).join('')}
        </select>
    </div>
    <div class="form-group">
        <label>考试范围</label>
        <select id="sm-scope" class="form-control" onchange="ExamPages._onScopeChange()">
            <option value="global" ${scope==='global'?'selected':''}>🌐 全局（所有学生可参加）</option>
            <option value="class" ${scope==='class'?'selected':''}>🏫 班级（仅指定班级）</option>
            <option value="personal" ${scope==='personal'?'selected':''}>🔒 个人（手动指定参与者）</option>
        </select>
    </div>
    <div class="form-group" id="sm-class-group" style="display:${scope==='class'?'':'none'}">
        <label>关联班级</label>
        <select id="sm-class-id" class="form-control">${classOptions}</select>
    </div>
    <div class="form-row">
        <div class="form-group"><label>开始时间（选填）</label><input id="sm-start" type="datetime-local" class="form-control" value="${s.start_time?s.start_time.slice(0,16):''}"></div>
        <div class="form-group"><label>结束时间（选填）</label><input id="sm-end" type="datetime-local" class="form-control" value="${s.end_time?s.end_time.slice(0,16):''}"></div>
    </div>
    <div class="form-row">
        <div class="form-group">
            <label>状态</label>
            <select id="sm-status" class="form-control">
                <option value="pending" ${s.status==='pending'?'selected':''}>待开始</option>
                <option value="active" ${s.status==='active'?'selected':''}>进行中</option>
                <option value="closed" ${s.status==='closed'?'selected':''}>已关闭</option>
            </select>
        </div>
        <div class="form-group"><label><input type="checkbox" id="sm-late" ${s.allow_late?'checked':''}> 允许迟交</label></div>
    </div>
</div>
<div class="modal-footer">
    <button class="btn btn-ghost" onclick="hideModal()">取消</button>
    <button class="btn btn-primary" onclick="ExamPages._doSaveSession('${s.id||''}')">保存</button>
</div>`);
    },

    _onScopeChange() {
        const scope = document.getElementById('sm-scope')?.value;
        const grp = document.getElementById('sm-class-group');
        if (grp) grp.style.display = scope === 'class' ? '' : 'none';
    },



    async editSessionModal(sessionId) {
        // 直接取考试安排（从列表）
        try {
            const data = await API.get('/exam/sessions');
            const s = (data.sessions || []).find(x => x.id === sessionId);
            if (s) ExamPages.createSessionModal(s);
            else showToast('未找到考试安排', 'error');
        } catch (e) { showToast(e.message, 'error'); }
    },

    async _doSaveSession(sessionId) {
        const title = document.getElementById('sm-title').value.trim();
        const paper_id = document.getElementById('sm-paper').value;
        if (!title) { showToast('请输入考试标题', 'error'); return; }
        if (!paper_id && !sessionId) { showToast('请选择试卷', 'error'); return; }
        const scope = document.getElementById('sm-scope')?.value || 'global';
        const classId = scope === 'class' ? (parseInt(document.getElementById('sm-class-id')?.value) || null) : null;
        const payload = {
            title, paper_id,
            scope, class_id: classId,
            start_time: document.getElementById('sm-start').value || null,
            end_time: document.getElementById('sm-end').value || null,
            status: document.getElementById('sm-status').value,
            allow_late: document.getElementById('sm-late').checked,
        };
        try {
            if (sessionId) {
                await API.put(`/exam/sessions/${sessionId}`, payload);
                showToast('更新成功', 'success');
            } else {
                await API.post('/exam/sessions', payload);
                showToast('考试安排已创建', 'success');
            }
            hideModal();
            App.navigate('exam');
        } catch (e) { showToast(e.message, 'error'); }
    },

    async deleteSession(sessionId) {
        if (!confirm('确定删除此次考试安排？')) return;
        try {
            await API.delete(`/exam/sessions/${sessionId}`);
            showToast('删除成功', 'success');
            App.navigate('exam');
        } catch (e) { showToast(e.message, 'error'); }
    },

    // ─── 【学生】进入考试 / 答题 ──────────────────────────
    async startExam(sessionId, sessionTitle) {
        try {
            const res = await API.post(`/exam/sessions/${sessionId}/start`, {});
            App.navigate('exam-do', { submissionId: res.submission_id, sessionId, sessionTitle });
        } catch (e) { showToast(e.message, 'error'); }
    },

    // 答题页
    async _renderExamDo(params) {
        const { submissionId, sessionId, sessionTitle } = params;
        const container = document.getElementById('page-content');
        container.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';

        try {
            // 获取答卷（含题目）
            const sub = await API.get(`/exam/submissions/${submissionId}`);
            if (sub.status !== 'in_progress') {
                ExamPages.reviewSubmission(submissionId);
                return;
            }

            const paper = await API.get(`/exam/papers/${sub.paper_id}`, { with_questions: true });
            const questions = paper.questions || [];
            const savedAnswers = sub.answers || {};

            // 存到全局，方便答题时使用
            window._examState = { submissionId, paper, questions, answers: { ...savedAnswers }, startTime: Date.now(), timeLimit: paper.time_limit };

            container.innerHTML = `
<div style="max-width:860px;margin:0 auto;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
        <div>
            <h2>📝 ${escapeHtml(paper.title)}</h2>
            <p style="color:var(--text-muted);font-size:0.85rem;">${escapeHtml(sessionTitle)}</p>
        </div>
        <div style="text-align:right;">
            ${paper.time_limit ? `<div id="exam-timer" style="font-size:1.5rem;font-weight:bold;color:#e74c3c;">--:--</div>` : ''}
            <div id="exam-save-status" style="font-size:0.8rem;color:var(--text-muted);">未保存</div>
        </div>
    </div>

    <!-- 题目导航 -->
    <div style="display:flex;flex-wrap:wrap;gap:0.4rem;margin-bottom:1.5rem;padding:1rem;background:var(--card-bg);border-radius:0.5rem;">
        ${questions.map((q, i) => `
            <button id="nav-btn-${i}" class="btn btn-sm ${savedAnswers[q.id]?'btn-primary':'btn-outline'}"
                onclick="ExamPages._scrollToQ(${i})" style="min-width:2.2rem;">${i+1}</button>
        `).join('')}
    </div>

    <!-- 题目列表 -->
    <div id="exam-questions">
        ${questions.map((q, i) => ExamPages._renderExamQuestion(q, i, savedAnswers)).join('')}
    </div>

    <!-- 提交按钮 -->
    <div style="text-align:center;padding:2rem 0;">
        <button class="btn btn-primary btn-lg" onclick="ExamPages._submitExam()">📤 提交答卷</button>
        <button class="btn btn-outline btn-lg" style="margin-left:1rem;" onclick="ExamPages._saveExamProgress()">💾 保存进度</button>
    </div>
</div>`;

            // 倒计时
            if (paper.time_limit) {
                const deadline = new Date(sub.started_at).getTime() + paper.time_limit * 1000;
                window._examTimer = setInterval(() => {
                    const remaining = Math.max(0, Math.floor((deadline - Date.now()) / 1000));
                    const timerEl = document.getElementById('exam-timer');
                    if (timerEl) timerEl.textContent = examFormatTime(remaining);
                    if (remaining <= 0) {
                        clearInterval(window._examTimer);
                        showToast('时间到！自动提交', 'warning');
                        ExamPages._submitExam(true);
                    }
                }, 1000);
            }

            // 自动保存（每30秒）
            window._examAutoSave = setInterval(() => ExamPages._saveExamProgress(true), 30000);

        } catch (e) {
            container.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><h3>加载失败</h3><p>${escapeHtml(e.message)}</p></div>`;
        }
    },

    _renderExamQuestion(q, idx, savedAnswers) {
        const userAns = savedAnswers[q.id] || '';
        let answerHtml = '';

        if (q.type === 'single') {
            const opts = Array.isArray(q.options) ? q.options : [];
            answerHtml = opts.map((opt, i) => {
                const letter = String.fromCharCode(65+i);
                return `<label style="display:block;padding:0.5rem;margin:0.3rem 0;border:1px solid var(--border-color);border-radius:0.4rem;cursor:pointer;">
                    <input type="radio" name="ans-${q.id}" value="${letter}" ${userAns===letter?'checked':''}
                        onchange="ExamPages._recordAnswer('${q.id}',this.value)">
                    <b style="color:#4f87f0;">${letter}.</b> ${escapeHtml(opt)}
                </label>`;
            }).join('');
        } else if (q.type === 'multi') {
            const opts = Array.isArray(q.options) ? q.options : [];
            let selected = [];
            try { selected = typeof userAns === 'string' && userAns.startsWith('[') ? JSON.parse(userAns) : (userAns ? userAns.split(',') : []); } catch {}
            answerHtml = opts.map((opt, i) => {
                const letter = String.fromCharCode(65+i);
                return `<label style="display:block;padding:0.5rem;margin:0.3rem 0;border:1px solid var(--border-color);border-radius:0.4rem;cursor:pointer;">
                    <input type="checkbox" class="multi-ans-${q.id}" value="${letter}" ${selected.includes(letter)?'checked':''}
                        onchange="ExamPages._recordMultiAnswer('${q.id}')">
                    <b style="color:#9b59b6;">${letter}.</b> ${escapeHtml(opt)}
                </label>`;
            }).join('') + `<small style="color:var(--text-muted);">多选题，可选多个</small>`;
        } else if (q.type === 'judge') {
            answerHtml = `
                <label style="margin-right:2rem;"><input type="radio" name="ans-${q.id}" value="true" ${userAns==='true'?'checked':''}
                    onchange="ExamPages._recordAnswer('${q.id}',this.value)"> ✓ 正确</label>
                <label><input type="radio" name="ans-${q.id}" value="false" ${userAns==='false'?'checked':''}
                    onchange="ExamPages._recordAnswer('${q.id}',this.value)"> ✗ 错误</label>`;
        } else if (q.type === 'fill') {
            answerHtml = `<input class="form-control" id="ans-fill-${q.id}" value="${escapeHtml(userAns)}"
                placeholder="请输入答案..." onchange="ExamPages._recordAnswer('${q.id}',this.value)">`;
        } else if (q.type === 'code') {
            answerHtml = `<textarea class="form-control" id="ans-code-${q.id}" rows="10"
                style="font-family:monospace;"
                oninput="ExamPages._recordAnswer('${q.id}',this.value)"
                placeholder="请在此处编写代码...">${escapeHtml(userAns)}</textarea>`;
        } else if (q.type === 'operation') {
            answerHtml = `<textarea class="form-control" id="ans-op-${q.id}" rows="5"
                oninput="ExamPages._recordAnswer('${q.id}',this.value)"
                placeholder="请描述你的操作步骤或粘贴截图说明...">${escapeHtml(userAns)}</textarea>`;
        }

        return `
<div class="card" id="exam-q-${idx}" style="margin-bottom:1rem;">
    <div style="margin-bottom:0.75rem;">
        ${examQTypeBadge(q.type)}
        <b>第 ${idx+1} 题</b>
        <span style="color:var(--text-muted);font-size:0.85rem;margin-left:0.5rem;">${q.score} 分</span>
    </div>
    <div style="white-space:pre-wrap;margin-bottom:1rem;font-size:1rem;">${escapeHtml(q.content)}</div>
    <div class="exam-answer-area">${answerHtml}</div>
</div>`;
    },

    _scrollToQ(idx) {
        const el = document.getElementById(`exam-q-${idx}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },

    _recordAnswer(qid, value) {
        if (!window._examState) return;
        window._examState.answers[qid] = value;
        ExamPages._updateNavBtn(qid, !!value);
        document.getElementById('exam-save-status').textContent = '未保存（有改动）';
    },

    _recordMultiAnswer(qid) {
        const checked = document.querySelectorAll(`.multi-ans-${qid}:checked`);
        const vals = Array.from(checked).map(el => el.value);
        const value = JSON.stringify(vals);
        ExamPages._recordAnswer(qid, value);
    },

    _updateNavBtn(qid, hasAnswer) {
        const state = window._examState;
        if (!state) return;
        const idx = state.questions.findIndex(q => q.id === qid);
        if (idx >= 0) {
            const btn = document.getElementById(`nav-btn-${idx}`);
            if (btn) {
                btn.className = `btn btn-sm ${hasAnswer ? 'btn-primary' : 'btn-outline'}`;
            }
        }
    },

    async _saveExamProgress(silent = false) {
        const state = window._examState;
        if (!state) return;
        try {
            await API.put(`/exam/submissions/${state.submissionId}/save`, { answers: state.answers });
            const el = document.getElementById('exam-save-status');
            if (el) el.textContent = '已保存 ' + new Date().toLocaleTimeString();
            if (!silent) showToast('进度已保存', 'success');
        } catch (e) {
            if (!silent) showToast('保存失败：' + e.message, 'error');
        }
    },

    async _submitExam(autoSubmit = false) {
        if (!autoSubmit && !confirm('确定提交答卷？提交后不可修改。')) return;
        const state = window._examState;
        if (!state) return;

        // 停止定时器
        if (window._examTimer) { clearInterval(window._examTimer); window._examTimer = null; }
        if (window._examAutoSave) { clearInterval(window._examAutoSave); window._examAutoSave = null; }

        try {
            const res = await API.post(`/exam/submissions/${state.submissionId}/submit`, { answers: state.answers });
            showModal(`
<div class="modal-header"><h3>✅ 提交成功</h3></div>
<div class="modal-body" style="text-align:center;padding:2rem;">
    <div style="font-size:3rem;margin-bottom:1rem;">🎉</div>
    <h3>答卷已提交！</h3>
    ${res.needs_manual_grading && res.needs_manual_grading.length > 0
        ? `<p>包含 ${res.needs_manual_grading.length} 道人工判卷题目，请等待老师批改。</p><p>自动判分部分：<b>${res.auto_score}</b> 分</p>`
        : `<p>已自动判卷完成！</p><p>得分：<b style="font-size:1.5rem;color:#27ae60;">${res.auto_score}</b> 分</p>`}
</div>
<div class="modal-footer">
    <button class="btn btn-primary" onclick="hideModal();ExamPages.reviewSubmission('${state.submissionId}')">查看成绩单</button>
    <button class="btn btn-ghost" onclick="hideModal();App.navigate('exam')">返回考试列表</button>
</div>`);
        } catch (e) { showToast(e.message, 'error'); }
    },

    // ─── 成绩单（学生/教师都可用） ───────────────────────
    async reviewSubmission(submissionId) {
        App.navigate('exam-result', { submissionId });
    },

    async _renderExamResult(params) {
        const { submissionId } = params;
        const container = document.getElementById('page-content');
        container.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';
        try {
            const sub = await API.get(`/exam/submissions/${submissionId}`);
            const questions = sub.questions || [];
            const isTeacher = App.user && App.user.role !== 'student';

            container.innerHTML = `
<div style="max-width:860px;margin:0 auto;">
    <div class="page-header">
        <div style="display:flex;align-items:center;gap:1rem;">
            <button class="btn btn-ghost" onclick="App.navigate('exam')">← 返回</button>
            <h2>📊 成绩单</h2>
        </div>
    </div>

    <!-- 总分卡片 -->
    <div class="card" style="text-align:center;padding:2rem;margin-bottom:1.5rem;">
        <div style="font-size:3rem;font-weight:bold;color:${sub.graded_score >= (sub.pass_score||60) ? '#27ae60':'#e74c3c'};">
            ${sub.graded_score || sub.auto_score || 0}
        </div>
        <div style="color:var(--text-muted);font-size:0.9rem;margin-top:0.5rem;">
            ${examStatusBadge(sub.status)}
            ${sub.submitted_at ? `&nbsp; 提交时间：${sub.submitted_at.slice(0,16)}` : ''}
        </div>
        ${sub.feedback ? `<div style="margin-top:1rem;padding:1rem;background:var(--bg-secondary);border-radius:0.5rem;text-align:left;">
            <b>教师评语：</b>${escapeHtml(sub.feedback)}
        </div>` : ''}
    </div>

    <!-- 逐题分析 -->
    <h3 style="margin-bottom:1rem;">📋 逐题分析</h3>
    ${questions.map((q, i) => ExamPages._renderResultQuestion(q, i)).join('')}
</div>`;
        } catch (e) {
            container.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><h3>加载失败</h3><p>${escapeHtml(e.message)}</p></div>`;
        }
    },

    _renderResultQuestion(q, idx) {
        const userAns = q.user_answer || '（未作答）';
        const autoGrade = q.auto_grade;
        const manualScore = q.manual_score;
        const isCorrect = autoGrade !== null && autoGrade === q.score;
        const isManual = autoGrade === null;

        let displayScore = isManual ? (manualScore ? manualScore.score : '待批改') : autoGrade;
        let scoreColor = isCorrect ? '#27ae60' : (isManual ? '#f39c12' : '#e74c3c');

        return `
<div class="card" style="margin-bottom:0.75rem;border-left:4px solid ${scoreColor};">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div style="flex:1;">
            <div style="margin-bottom:0.5rem;">${examQTypeBadge(q.type)} <b>第 ${idx+1} 题</b></div>
            <div style="white-space:pre-wrap;margin-bottom:0.75rem;">${escapeHtml(q.content)}</div>
            <div style="font-size:0.9rem;">
                <div><b>我的答案：</b><span style="color:${isCorrect?'#27ae60':isManual?'#f39c12':'#e74c3c'}">${escapeHtml(String(userAns))}</span></div>
                ${q.correct_answer !== undefined ? `<div><b>正确答案：</b><span style="color:#27ae60">${escapeHtml(String(q.correct_answer))}</span></div>` : ''}
                ${q.grade_comment ? `<div><b>判卷说明：</b>${escapeHtml(q.grade_comment)}</div>` : ''}
                ${q.explanation ? `<div style="margin-top:0.5rem;color:#888;">💡 解析：${escapeHtml(q.explanation)}</div>` : ''}
                ${manualScore ? `<div><b>教师评语：</b>${escapeHtml(manualScore.comment||'')}</div>` : ''}
            </div>
        </div>
        <div style="font-size:1.5rem;font-weight:bold;color:${scoreColor};margin-left:1rem;text-align:right;">
            ${displayScore}<span style="font-size:0.85rem;font-weight:normal;color:var(--text-muted)">/${q.score}</span>
        </div>
    </div>
</div>`;
    },

    // ─── 【教师】查看某次考试的所有答卷 ──────────────────
    async sessionSubmissions(sessionId, sessionTitle) {
        App.navigate('exam-submissions', { sessionId, sessionTitle });
    },

    async _renderSessionSubmissions(params) {
        const { sessionId, sessionTitle } = params;
        const container = document.getElementById('page-content');
        container.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';
        try {
            const data = await API.get(`/exam/sessions/${sessionId}/submissions`);
            const subs = data.submissions || [];
            const needGrade = subs.filter(s => s.status === 'submitted').length;
            const graded = subs.filter(s => s.status === 'graded').length;

            container.innerHTML = `
<div class="page-header">
    <div style="display:flex;align-items:center;gap:1rem;">
        <button class="btn btn-ghost" onclick="App.navigate('exam')">← 返回</button>
        <h2>📋 ${escapeHtml(sessionTitle)} - 答卷列表</h2>
    </div>
    <div style="display:flex;gap:0.5rem;">
        <button class="btn btn-outline" onclick="ExamPages.sessionStats('${sessionId}','${escapeHtml(sessionTitle)}')">📊 成绩统计</button>
    </div>
</div>

<!-- 统计卡片 -->
<div style="display:flex;gap:1rem;margin-bottom:1.5rem;flex-wrap:wrap;">
    <div class="card" style="flex:1;min-width:120px;text-align:center;padding:1rem;">
        <div style="font-size:1.8rem;font-weight:bold;">${subs.length}</div>
        <div style="color:var(--text-muted);font-size:0.85rem;">参考人数</div>
    </div>
    <div class="card" style="flex:1;min-width:120px;text-align:center;padding:1rem;${needGrade > 0 ? 'border:2px solid #e67e22;' : ''}">
        <div style="font-size:1.8rem;font-weight:bold;color:${needGrade > 0 ? '#e67e22' : 'inherit'};">${needGrade}</div>
        <div style="color:var(--text-muted);font-size:0.85rem;">待人工批改</div>
    </div>
    <div class="card" style="flex:1;min-width:120px;text-align:center;padding:1rem;">
        <div style="font-size:1.8rem;font-weight:bold;color:#27ae60;">${graded}</div>
        <div style="color:var(--text-muted);font-size:0.85rem;">已批改</div>
    </div>
    <div class="card" style="flex:1;min-width:120px;text-align:center;padding:1rem;">
        <div style="font-size:1.8rem;font-weight:bold;">${subs.length - needGrade - graded}</div>
        <div style="color:var(--text-muted);font-size:0.85rem;">自动已判</div>
    </div>
</div>

${needGrade > 0 ? `
<div style="background:#fef9e7;border:1px solid #e67e22;border-radius:0.5rem;padding:1rem;margin-bottom:1.5rem;display:flex;align-items:center;justify-content:space-between;">
    <div>⚠️ 有 <b>${needGrade}</b> 份答卷需要人工批改（含填空/代码/实操题）</div>
    <button class="btn btn-sm btn-primary" style="background:#e67e22;border-color:#e67e22;"
        onclick="ExamPages._gradeNextPending(${JSON.stringify(subs.filter(s=>s.status==='submitted').map(s=>({id:s.id,name:s.real_name||s.username})))})">
        ✍️ 开始批改
    </button>
</div>` : ''}

<div class="table-container">
<table>
    <thead><tr><th>学生</th><th>提交时间</th><th>状态</th><th>自动分</th><th>最终分</th><th>操作</th></tr></thead>
    <tbody>
    ${subs.length === 0 ? `<tr><td colspan="6" class="text-center text-muted">暂无答卷</td></tr>` :
      subs.map(s => `<tr style="${s.status==='submitted'?'background:#fef9e7;':''}">
        <td><b>${escapeHtml(s.real_name||s.username)}</b></td>
        <td>${s.submitted_at ? s.submitted_at.slice(0,16) : '未提交'}</td>
        <td>${examStatusBadge(s.status)}</td>
        <td>${s.auto_score ?? '-'}</td>
        <td>${s.status==='graded' ? `<b style="color:#27ae60;">${s.graded_score}</b>` : '-'}</td>
        <td style="white-space:nowrap;">
            <button class="btn btn-sm btn-outline" onclick="ExamPages.reviewSubmission('${s.id}')">查看</button>
            ${s.status==='submitted'
                ? `<button class="btn btn-sm btn-primary" style="background:#e67e22;border-color:#e67e22;" onclick="ExamPages.gradeSubmission('${s.id}','${escapeHtml(s.real_name||s.username)}')">✍️ 批改</button>`
                : s.status==='graded'
                    ? `<button class="btn btn-sm btn-outline" onclick="ExamPages.gradeSubmission('${s.id}','${escapeHtml(s.real_name||s.username)}')">✏️ 重批</button>`
                    : ''}
        </td>
      </tr>`).join('')}
    </tbody>
</table>
</div>`;
        } catch (e) {
            container.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><h3>加载失败</h3><p>${escapeHtml(e.message)}</p></div>`;
        }
    },

    // 批量批改：逐个跳转到待批改答卷
    _gradeNextPending(pendingList) {
        if (!pendingList || pendingList.length === 0) { showToast('没有待批改的答卷了', 'success'); return; }
        window._gradePendingQueue = pendingList.slice(1);
        window._gradePendingCallback = () => {
            if (window._gradePendingQueue && window._gradePendingQueue.length > 0) {
                const next = window._gradePendingQueue.shift();
                ExamPages.gradeSubmission(next.id, next.name);
            } else {
                showToast('✅ 全部批改完成！', 'success');
                App.navigate('exam');
            }
        };
        const first = pendingList[0];
        ExamPages.gradeSubmission(first.id, first.name);
    },

    // ─── 【教师】人工批改 ─────────────────────────────────
    async gradeSubmission(submissionId, studentName) {
        App.navigate('exam-grade', { submissionId, studentName });
    },

    async _renderGrade(params) {
        const { submissionId, studentName } = params;
        const container = document.getElementById('page-content');
        container.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';
        try {
            const sub = await API.get(`/exam/submissions/${submissionId}`);
            const questions = sub.questions || [];
            const manualQs = questions.filter(q => q.auto_grade === null);

            window._gradeState = { submissionId, scores: {} };

            container.innerHTML = `
<div style="max-width:860px;margin:0 auto;">
    <div class="page-header">
        <div style="display:flex;align-items:center;gap:1rem;">
            <button class="btn btn-ghost" onclick="history.back()">← 返回</button>
            <h2>✍️ 批改 - ${escapeHtml(studentName||'')}</h2>
        </div>
    </div>
    <div class="card" style="margin-bottom:1rem;background:var(--bg-secondary);">
        <b>自动判卷得分：${sub.auto_score || 0} 分</b>（需人工批改 ${manualQs.length} 题）
    </div>

    ${manualQs.map((q, i) => `
    <div class="card" style="margin-bottom:1rem;">
        <div style="margin-bottom:0.75rem;">${examQTypeBadge(q.type)} <b>需人工批改：${escapeHtml(q.content.slice(0,80))}</b></div>
        <div style="margin-bottom:0.75rem;">
            <b>学生答案：</b>
            <div style="background:var(--bg-secondary);padding:0.75rem;border-radius:0.4rem;white-space:pre-wrap;font-family:monospace;font-size:0.9rem;">${escapeHtml(q.user_answer||'（未作答）')}</div>
        </div>
        ${q.type === 'operation' && q.correct_answer ? `<div style="margin-bottom:0.75rem;"><b>操作要求：</b><div style="color:var(--text-muted);">${escapeHtml(q.correct_answer)}</div></div>` : ''}
        <div class="form-row">
            <div class="form-group">
                <label>得分（满分 ${q.score} 分）</label>
                <input id="grade-score-${q.id}" type="number" class="form-control" min="0" max="${q.score}"
                    value="${q.manual_score ? q.manual_score.score : 0}"
                    onchange="window._gradeState.scores['${q.id}']={score:parseInt(this.value)||0,comment:document.getElementById('grade-comment-${q.id}').value}">
            </div>
            <div class="form-group">
                <label>评语（选填）</label>
                <input id="grade-comment-${q.id}" class="form-control" value="${q.manual_score ? escapeHtml(q.manual_score.comment||'') : ''}"
                    oninput="window._gradeState.scores['${q.id}']={score:parseInt(document.getElementById('grade-score-${q.id}').value)||0,comment:this.value}">
            </div>
        </div>
    </div>`).join('')}

    <div class="card" style="margin-bottom:1rem;">
        <div class="form-group">
            <label>总体评语</label>
            <textarea id="grade-feedback" class="form-control" rows="3" placeholder="给学生的总体评价（选填）">${escapeHtml(sub.feedback||'')}</textarea>
        </div>
    </div>

    <div style="text-align:center;padding:1rem 0;">
        <button class="btn btn-primary btn-lg" onclick="ExamPages._doGrade()">✅ 提交批改</button>
        <button class="btn btn-ghost btn-lg" style="margin-left:1rem;" onclick="history.back()">取消</button>
    </div>
</div>`;
        } catch (e) {
            container.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><h3>加载失败</h3><p>${escapeHtml(e.message)}</p></div>`;
        }
    },

    async _doGrade() {
        const state = window._gradeState;
        if (!state) return;
        const feedback = document.getElementById('grade-feedback').value;
        // 收集所有分数输入
        document.querySelectorAll('[id^="grade-score-"]').forEach(el => {
            const qid = el.id.replace('grade-score-', '');
            const comment = document.getElementById(`grade-comment-${qid}`)?.value || '';
            state.scores[qid] = { score: parseInt(el.value) || 0, comment };
        });
        try {
            await API.post(`/exam/submissions/${state.submissionId}/grade`, {
                scores: state.scores,
                feedback,
            });
            showToast('批改已提交！', 'success');
            // 如果有批量批改队列，继续下一个
            if (window._gradePendingCallback) {
                const cb = window._gradePendingCallback;
                window._gradePendingCallback = null;
                cb();
            } else {
                history.back();
            }
        } catch (e) { showToast(e.message, 'error'); }
    },

    // ─── 成绩统计 ─────────────────────────────────────────
    async sessionStats(sessionId, sessionTitle) {
        App.navigate('exam-stats', { sessionId, sessionTitle });
    },

    async _renderStats(params) {
        const { sessionId, sessionTitle } = params;
        const container = document.getElementById('page-content');
        container.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';
        try {
            const stats = await API.get(`/exam/sessions/${sessionId}/stats`);
            container.innerHTML = `
<div style="max-width:860px;margin:0 auto;">
    <div class="page-header">
        <div style="display:flex;align-items:center;gap:1rem;">
            <button class="btn btn-ghost" onclick="App.navigate('exam')">← 返回</button>
            <h2>📊 成绩统计 - ${escapeHtml(sessionTitle)}</h2>
        </div>
    </div>
    <div class="card-grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr));margin-bottom:1.5rem;">
        ${[
            ['参加人数', stats.count, '👥'],
            ['已批改', stats.graded_count, '✅'],
            ['待批改', stats.pending_count, '⏳'],
            ['平均分', stats.avg, '📈'],
            ['最高分', stats.max, '🏆'],
            ['最低分', stats.min, '📉'],
            ['及格率', stats.pass_rate + '%', '🎯'],
        ].map(([label, val, icon]) => `
            <div class="card" style="text-align:center;">
                <div style="font-size:1.5rem;">${icon}</div>
                <div style="font-size:1.5rem;font-weight:bold;">${val}</div>
                <div style="font-size:0.85rem;color:var(--text-muted);">${label}</div>
            </div>`).join('')}
    </div>

    <!-- 分数分布 -->
    <div class="card">
        <h3 style="margin-bottom:1rem;">📊 分数段分布</h3>
        ${stats.distribution && stats.distribution.length > 0 ? `
        <div style="display:flex;align-items:flex-end;gap:0.5rem;height:120px;padding:0 0.5rem;">
            ${stats.distribution.map(b => {
                const maxCount = Math.max(...stats.distribution.map(x => x.count), 1);
                const pct = Math.round(b.count / maxCount * 100);
                return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:0.25rem;">
                    <span style="font-size:0.75rem;color:var(--text-muted);">${b.count}</span>
                    <div style="width:100%;background:#4f87f0;height:${pct}%;min-height:${b.count>0?4:0}px;border-radius:2px 2px 0 0;"></div>
                    <span style="font-size:0.7rem;color:var(--text-muted);">${b.range}</span>
                </div>`;
            }).join('')}
        </div>` : '<p style="color:var(--text-muted);">暂无数据</p>'}
    </div>
</div>`;
        } catch (e) {
            container.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><h3>加载失败</h3><p>${escapeHtml(e.message)}</p></div>`;
        }
    },

    // ─── 我的成绩（学生） ─────────────────────────────────
    async myResults() {
        App.navigate('exam-my-results');
    },

    async _renderMyResults() {
        const container = document.getElementById('page-content');
        container.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';
        try {
            const data = await API.get('/exam/my-results');
            const results = data.results || [];
            container.innerHTML = `
<div class="page-header">
    <div style="display:flex;align-items:center;gap:1rem;">
        <button class="btn btn-ghost" onclick="App.navigate('exam')">← 返回</button>
        <h2>📊 我的成绩</h2>
    </div>
</div>
<div class="table-container">
<table>
    <thead><tr><th>考试</th><th>试卷</th><th>提交时间</th><th>状态</th><th>得分</th><th>满分</th><th>操作</th></tr></thead>
    <tbody>
    ${results.length === 0 ? `<tr><td colspan="7" class="text-center text-muted">暂无考试记录</td></tr>` :
      results.map(r => `<tr>
        <td>${escapeHtml(r.session_title)}</td>
        <td>${escapeHtml(r.paper_title)}</td>
        <td>${r.submitted_at ? r.submitted_at.slice(0,16) : '-'}</td>
        <td>${examStatusBadge(r.status)}</td>
        <td><b style="color:${r.graded_score >= r.pass_score ? '#27ae60' : '#e74c3c'}">${r.status==='graded' ? r.graded_score : r.auto_score||0}</b></td>
        <td>${r.total_score}</td>
        <td><button class="btn btn-sm btn-outline" onclick="ExamPages.reviewSubmission('${r.id}')">成绩单</button></td>
      </tr>`).join('')}
    </tbody>
</table>
</div>`;
        } catch (e) {
            container.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><h3>加载失败</h3><p>${escapeHtml(e.message)}</p></div>`;
        }
    },
};

// ═══════════════════════════════════════════════════════════
// 通过 App.registerPage 注册路由（新插件规范，无需 monkey-patch）
// ═══════════════════════════════════════════════════════════
function _doRegisterExamRoutes() {
    App.registerPage('exam',             (p) => ExamPages.examList(p));
    App.registerPage('exam-papers',      (p) => ExamPages._renderPaperManager(p));
    App.registerPage('exam-paper-edit',  (p) => ExamPages._renderPaperEdit(p));
    App.registerPage('exam-do',          (p) => ExamPages._renderExamDo(p));
    App.registerPage('exam-result',      (p) => ExamPages._renderExamResult(p));
    App.registerPage('exam-submissions', (p) => ExamPages._renderSessionSubmissions(p));
    App.registerPage('exam-grade',       (p) => ExamPages._renderGrade(p));
    App.registerPage('exam-stats',       (p) => ExamPages._renderStats(p));
    App.registerPage('exam-my-results',  (p) => ExamPages._renderMyResults(p));
    console.log('[ExamPlugin] Routes registered via App.registerPage.');
}

if (typeof App !== 'undefined' && typeof App.registerPage === 'function') {
    _doRegisterExamRoutes();
} else {
    // 兜底：app.js 还没加载完，轮询等待
    (function waitForApp() {
        if (typeof App !== 'undefined' && typeof App.registerPage === 'function') {
            _doRegisterExamRoutes();
        } else {
            setTimeout(waitForApp, 30);
        }
    })();
}
