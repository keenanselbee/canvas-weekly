const api = window.canvasWeekly;
let state;
let page = 'week';
let preview = false;
let noticeTimer;
const main = document.querySelector('main');

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
function button(label, callback, className = '') {
  const element = node('button', className, label);
  element.addEventListener('click', () => perform(callback));
  return element;
}
async function perform(callback) {
  try { await callback(); }
  catch (error) { announce(error.message, true); }
}
function announce(message, persistent = false) {
  clearTimeout(noticeTimer);
  const notice = document.querySelector('#notice');
  notice.replaceChildren(node('span', '', message), button('Dismiss', () => { notice.hidden = true; }, 'link'));
  notice.hidden = false;
  if (!persistent) noticeTimer = setTimeout(() => { notice.hidden = true; }, 4500);
}
function update(next) {
  if (next.canvas.error && next.canvas.error !== state?.canvas.error) announce(next.canvas.error, true);
  const runChanged = state && (state.run?.busy !== next.run?.busy || state.run?.message !== next.run?.message);
  const connectionChanged = state && (JSON.stringify(state.canvas) !== JSON.stringify(next.canvas) || JSON.stringify(state.ai) !== JSON.stringify(next.ai));
  state = next;
  document.documentElement.dataset.theme = state.appearance.dark ? 'dark' : 'light';
  document.querySelector('#connection-status').textContent = state.canvas.connected ? 'Canvas connected' : state.canvas.connecting ? 'Signing in to Canvas' : 'Canvas not connected';
  document.querySelector('#ai-status').textContent = state.ai.connected ? `ChatGPT via Codex connected${state.settings.aiEnabled ? '' : ' · Suggestions off'}` : state.ai.connecting ? 'ChatGPT sign-in in progress' : 'ChatGPT not connected';
  if (runChanged) { if (state.run.message) announce(state.run.message, state.run.busy); render(); }
  else if (connectionChanged) render();
}
function header(title, subtitle, action) {
  const header = node('header', 'page-header');
  const text = node('div');
  text.append(node('h1', '', title), node('p', '', subtitle));
  header.append(text);
  if (action) header.append(action);
  main.append(header);
}
function card(title) {
  const element = node('section', 'card');
  if (title) element.append(node('h2', '', title));
  return element;
}
function row(title, description, control) {
  const row = node('div', 'setting-row');
  const text = node('div');
  text.append(node('h3', '', title), node('p', '', description));
  row.append(text);
  if (control) row.append(control);
  return row;
}
function go(destination) { page = destination; render(); }

function renderWeek() {
  const actions = node('div', 'actions');
  if (!preview && state.canvas.connected) {
    const refresh = button(state.run.busy ? 'Updating…' : 'Update guide', async () => { update(await api.updateGuide()); render(); }, 'primary');
    refresh.disabled = state.run.busy;
    actions.append(refresh);
    if (state.run.busy) actions.append(button('Cancel', () => api.cancelRefresh()));
  }
  if (!preview && state.guide) actions.append(button('Open guide', () => api.openGuide()));
  header('This week', preview ? 'September 14 – 20, 2026' : state.guide ? `${state.guide.week.start} to ${state.guide.week.end}` : 'A clear plan for the week ahead', actions);
  if (preview) { renderPreview(); return; }
  if (state.guide) { renderGuide(); return; }
  const welcome = card();
  welcome.classList.add('welcome');
  welcome.append(node('div', 'eyebrow', 'WELCOME TO CANVAS WEEKLY'), node('h2', '', 'Know what to focus on. Keep the details close.'), node('p', '', 'Bring deadlines, readings, and course updates into one weekly guide, with links back to the source.'));
  const steps = node('div', 'steps');
  [['Connect your courses', 'Use your Canvas account to find the courses you want to follow.'], ['Choose where your guide lives', 'Weekly files go to your Desktop, or a folder you choose.'], ['Refresh as the week changes', 'Keep the same weekly guide up to date and see what changed.']].forEach(([title, description], index) => {
    const step = node('div', 'step');
    const text = node('div');
    text.append(node('h3', '', title), node('p', '', description));
    step.append(node('span', 'step-number', String(index + 1)), text);
    steps.append(step);
  });
  const welcomeActions = node('div', 'actions');
  welcomeActions.append(button(state.canvas.connected ? 'Choose courses' : 'Set up Canvas Weekly', () => go(state.canvas.connected ? 'courses' : 'settings'), 'primary'), button('Preview an example', () => { preview = true; render(); }));
  welcome.append(steps, welcomeActions);
  main.append(welcome, node('p', 'footer-note', 'Canvas Weekly gathers course information. It never starts quizzes, submits work, or sends messages.'));
}

function renderGuide() {
  const guide = state.guide;
  const format = value => value ? new Intl.DateTimeFormat(undefined, { timeZone: guide.timeZone, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value)) : 'No date supplied';
  main.append(node('p', 'footer-note', `${guide.mode} · Updated ${format(guide.generatedAt)} · ${guide.timeZone}`));
  if (guide.studyPlan) {
    const plan = guide.studyPlan;
    const overview = card('Your study plan');
    overview.append(node('p', '', plan.summary), node('p', 'muted', plan.note));
    const refined = plan.tasks.filter(task => task.ai).length;
    if (guide.priorities?.length) overview.append(node('p', 'muted', `ChatGPT refined ${refined} preparation task${refined === 1 ? '' : 's'}. Other tasks use basic prompts. Required/optional labels are AI interpretations with source quotes to check.`));
    if (state.ai.connected && !state.settings.aiEnabled) overview.append(node('p', 'muted', 'ChatGPT is connected. Enable Study suggestions in Settings for more specific preparation advice.'));
    const dates = [...new Set(plan.tasks.map(task => task.suggestedDate))];
    for (const date of dates) {
      const day = node('details', 'study-day');
      const tasks = plan.tasks.filter(task => task.suggestedDate === date);
      day.open = date === dates[0];
      day.append(node('summary', '', `Suggested start: ${date} · ${tasks.filter(task => task.done).length}/${tasks.length} checked off`));
      for (const task of tasks) {
        const row = node('div', 'study-task');
        const checkbox = node('input');
        checkbox.type = 'checkbox'; checkbox.checked = task.done; checkbox.disabled = state.run.busy;
        checkbox.id = `study-${task.id}`;
        checkbox.setAttribute('aria-label', `Preparation done: ${task.title}`);
        checkbox.addEventListener('change', () => perform(async () => {
          update(await api.setStudyTaskDone(task.id, checkbox.checked)); render();
          document.getElementById(checkbox.id)?.focus();
        }));
        const content = node('div');
        const label = node('label', 'study-task-title', task.title); label.htmlFor = checkbox.id;
        content.append(label, node('small', '', `${task.courseName}${task.ai ? ' · AI suggestion' : ''}`));
        if (task.dueAt) content.append(node('small', '', `Recorded due: ${format(task.dueAt)}`));
        if (task.changedSinceDone) content.append(node('p', 'muted', 'Changed since you checked it off — review again.'));
        const details = node('details');
        details.append(node('summary', '', 'Preparation steps'), node('p', '', task.reason));
        const steps = node('ul');
        for (const step of task.steps) {
          const item = node('li');
          if (typeof step === 'string') item.textContent = step;
          else {
            item.append(node('span', '', step.text));
            item.append(node('small', '', `${step.conditional ? 'After confirming applicability · ' : ''}${step.kind === 'suggested' ? 'Suggested preparation' : `${step.kind === 'required' ? 'Required' : 'Optional'} (AI interpretation)`}`));
            if (step.quote) {
              const quote = node('details');
              quote.append(node('summary', '', 'Source quote'), node('p', '', step.quote)); item.append(quote);
            }
          }
          steps.append(item);
        }
        details.append(steps, button('Open source', () => api.openSource(task.sourceId), 'link'));
        content.append(details); row.append(checkbox, content); day.append(row);
      }
      overview.append(day);
    }
    main.append(overview);
    const checks = card('Double-check before relying on this plan');
    if (!plan.checks.length) checks.append(node('p', 'muted', 'No specific gaps identified. Course information can still change.'));
    for (const check of plan.checks) {
      const details = node('details');
      details.append(node('summary', '', check.title), node('p', '', check.detail), button('Open source', () => api.openSource(check.sourceId), 'link'));
      checks.append(details);
    }
    main.append(checks);
  }
  if (guide.priorities?.length && !guide.studyPlan) {
    const suggestions = card('Suggested focus');
    suggestions.append(node('p', 'muted', 'AI study suggestions based on your collected course information.'));
    for (const priority of guide.priorities) {
      const source = [...guide.items, ...guide.courses.flatMap(course => course.evidence || [])].find(item => item.id === priority.sourceId);
      suggestions.append(node('h3', '', priority.action), node('p', '', priority.reason), node('small', '', source ? `${source.courseName} · ${source.title}` : 'Source unavailable'));
    }
    main.append(suggestions);
  }
  if (guide.planningNote) main.append(node('p', 'muted', `AI suggestions unavailable: ${guide.planningNote}`));
  for (const [title, items] of [['This week and overdue', guide.inWeek], ['Looking ahead', guide.upcoming], ['Undated work', guide.undated]]) {
    const section = card(title);
    if (!items.length) section.append(node('p', 'muted', 'No matching dated or undated items identified here. Reading, preparation and unavailable sources may still require attention.'));
    for (const item of items) {
      const task = node('div', 'task');
      const content = node('div', 'task-content');
      content.append(node('h3', '', item.title), node('p', '', `${item.courseName}${item.stale ? ' · Last known information — recheck Canvas' : ''}`));
      const detail = node('details');
      detail.append(node('summary', '', 'Instructions and details'), node('p', '', item.instructions || 'No instructions supplied.'), node('p', '', `Submission: ${item.status}. Available until: ${format(item.closesAt)}.`));
      detail.append(button('Open source', () => api.openSource(item.id), 'link'));
      content.append(detail);
      task.append(node('span', 'task-marker'), content, node('time', '', format(item.dueAt)));
      section.append(task);
    }
    main.append(section);
  }
  const changes = card('What changed');
  if (!guide.changes.length) changes.append(node('p', 'muted', 'No changes detected in collected information.'));
  for (const change of guide.changes) changes.append(node('p', '', `${change.courseName} · ${change.title}: ${change.field === 'new' ? 'Newly observed' : ['instructions', 'course-information'].includes(change.field) ? 'Source content changed' : `${change.field}: ${change.before ?? 'Not supplied'} → ${change.after ?? 'Not supplied'}`}`));
  main.append(changes);
  const information = card('Course information');
  information.append(node('p', 'muted', 'Messages and announcements may qualify assignment dates. Review both when an instructor announces a change.'));
  for (const course of guide.courses) {
    const group = node('details');
    group.append(node('summary', '', course.name));
    for (const source of course.evidence || []) {
      const detail = node('details');
      detail.append(node('summary', '', `${source.title} · ${source.kind}${source.stale ? ' · Needs recheck' : ''}`));
      if (source.author || source.postedAt) detail.append(node('p', 'muted', `${source.author || ''} ${source.postedAt ? format(source.postedAt) : ''}`));
      if (source.startsAt) detail.append(node('p', '', `${format(source.startsAt)}${source.location ? ' · ' + source.location : ''}`));
      detail.append(node('p', 'source-body', source.body || 'Content not supplied.'), button('Open source', () => api.openSource(source.id), 'link'));
      group.append(detail);
    }
    information.append(group);
  }
  main.append(information);
  const coverage = card('Source coverage');
  for (const course of guide.courses) {
    coverage.append(node('h3', '', course.name));
    for (const source of course.coverage) coverage.append(node('small', '', `${source.source}: ${source.status}${source.message ? ` — ${source.message}` : ''}`));
  }
  coverage.append(node('p', 'footer-note', 'Linked files, message attachments and external tools may contain additional requirements. Your exported guide lists references and collection gaps.'));
  main.append(coverage);
}

function renderPreview() {
  const banner = node('div', 'banner');
  banner.append(node('span', '', 'Example guide · Sample information, not your Canvas account.'), button('Close preview', () => { preview = false; render(); }, 'link'));
  main.append(banner);
  const priorities = card();
  const title = node('div', 'section-title');
  title.append(node('h2', '', 'Focus first'), node('span', 'badge', '3 priorities'));
  priorities.append(title);
  [['Database practice', 'COSC 304 · Several small assessments share a deadline. Start with the course notes.', 'Fri, Sep 18'], ['Reading questions', 'PHIL 331 · Read the assigned material before preparing your response.', 'Thu, Sep 17'], ['Team agreement', 'COSC 310 · Coordinate responsibilities and review the submission requirements.', 'Fri, Sep 18']].forEach(([name, description, due]) => {
    const task = node('div', 'task');
    const content = node('div', 'task-content');
    content.append(node('h3', '', name), node('p', '', description));
    task.append(node('span', 'task-marker'), content, node('time', '', due));
    priorities.append(task);
  });
  main.append(priorities);
  const columns = node('div', 'columns');
  const changes = card('What changed');
  changes.append(node('span', 'badge', 'Deadline updated'), node('p', '', 'Reading questions moved from Tuesday to Thursday.'), node('small', '', 'PHIL 331 · Instructor message'));
  const ahead = card('Looking ahead');
  ahead.append(node('h3', '', 'Project questions'), node('p', 'muted', 'Read the project description before writing your individual response.'), node('small', '', 'COSC 310 · Next week'));
  columns.append(changes, ahead);
  main.append(columns, node('p', 'footer-note', 'Your real guide will include source links, exact deadlines, and any information that needs confirmation.'));
}

function renderCourses() {
  header('Courses', 'Choose what belongs in your weekly guide');
  if (state.canvas.connected) {
    const list = card('Your courses');
    const selected = new Set(state.settings.selectedCourseIds);
    for (const course of state.courses) {
      const checkbox = node('input');
      checkbox.type = 'checkbox'; checkbox.value = String(course.id); checkbox.checked = selected.has(String(course.id));
      checkbox.setAttribute('aria-label', course.name || 'Unnamed course');
      checkbox.addEventListener('change', () => checkbox.checked ? selected.add(checkbox.value) : selected.delete(checkbox.value));
      list.append(row(course.name || 'Unnamed course', course.term?.name || course.course_code || 'Term not supplied', checkbox));
    }
    if (!state.courses.length) list.append(node('p', 'muted', 'No active student courses were returned by Canvas.'));
    list.append(button('Save course selection', async () => { update(await api.selectCourses([...selected])); announce('Course selection saved.'); }, 'primary'));
    main.append(list);
    return;
  }
  const empty = card();
  empty.classList.add('empty');
  empty.append(node('h2', '', 'Your courses will appear here'), node('p', '', 'Connect Canvas to find your courses, including optional co-op or application work.'), button('Connection settings', () => go('settings'), 'primary'));
  main.append(empty);
}

function renderSettings() {
  header('Settings', 'Make Canvas Weekly work for you');
  const connections = card('Connections');
  const canvasActions = node('div', 'actions');
  if (state.canvas.connected) {
    canvasActions.append(button('Choose courses', () => go('courses')), button('Disconnect', async () => { update(await api.disconnectCanvas()); render(); }));
  } else {
    canvasActions.append(button('Sign in to Canvas', async () => { update(await api.openCanvasLogin()); render(); }, 'primary'), button('Check connection', async () => { announce('Checking Canvas connection…'); update(await api.verifyCanvas()); announce('Canvas connected. Choose your courses.'); go('courses'); }));
  }
  connections.append(row('Canvas', state.canvas.connected ? `Connected as ${state.canvas.name}` : 'Sign in in the Canvas window, then close it and check the connection.', canvasActions));
  const advanced = node('details', 'connection-options');
  advanced.append(node('summary', '', 'Canvas connection options'));
  const origin = node('input'); origin.type = 'url'; origin.value = state.settings.canvasBaseUrl; origin.setAttribute('aria-label', 'Canvas address');
  const addressRow = node('div', 'actions');
  addressRow.append(origin, button('Save address', async () => { update(await api.setCanvasOrigin(origin.value)); render(); }));
  const token = node('input'); token.type = 'password'; token.autocomplete = 'off'; token.placeholder = 'Institution-issued API token'; token.setAttribute('aria-label', 'Canvas API token');
  const tokenRow = node('div', 'actions');
  tokenRow.append(token, button('Connect with token', async () => {
    const value = token.value; token.value = '';
    announce('Checking Canvas connection…');
    update(await api.connectCanvasToken(value)); announce('Canvas connected. Choose your courses.'); go('courses');
  }));
  advanced.append(node('p', 'muted', 'Use an API token only if your institution provides one. It is encrypted on this Windows computer.'), addressRow, tokenRow);
  connections.append(advanced);
  const aiActions = node('div', 'actions');
  if (state.ai.connected) aiActions.append(button('Disconnect', async () => { update(await api.disconnectChatGPT()); render(); }));
  else aiActions.append(button(state.ai.connecting ? 'Sign-in open' : 'Connect ChatGPT', async () => { update(await api.connectChatGPT()); render(); }), button('Check sign-in', async () => { update(await api.checkChatGPT()); render(); }));
  connections.append(row('ChatGPT via Codex', state.ai.connected ? 'Connected. Your account usage limits apply.' : state.ai.error || 'Sign in through the official ChatGPT page to add study suggestions.', aiActions));
  const aiToggle = node('input'); aiToggle.type = 'checkbox'; aiToggle.checked = Boolean(state.settings.aiEnabled); aiToggle.setAttribute('aria-label', 'Use ChatGPT suggestions');
  aiToggle.addEventListener('change', () => perform(async () => { update(await api.setAIEnabled(aiToggle.checked)); }));
  connections.append(row('Study suggestions', 'When enabled, selected course text is sent to ChatGPT. Factual guides work without it.', aiToggle));
  const aiOptions = node('details', 'connection-options'); aiOptions.append(node('summary', '', 'ChatGPT connection options'));
  aiOptions.append(node('p', 'muted', state.settings.codexExecutable || 'Uses an installed Codex runtime. If it cannot be found, choose codex.exe.'), button('Choose Codex executable', async () => { update(await api.chooseCodex()); render(); }));
  connections.append(aiOptions);
  const output = card('Weekly files');
  output.append(row('Output folder', state.outputDirectory, button('Change folder', async () => { update(await api.chooseOutput()); render(); })), row('Open your files', 'Weekly guides and your notes stay in the folder you choose.', button('Open folder', () => api.openOutput())));
  const appearance = card('Appearance');
  const select = node('select');
  select.setAttribute('aria-label', 'Theme');
  [['system', 'Use Windows setting'], ['light', 'Light'], ['dark', 'Dark']].forEach(([value, title]) => { const option = node('option', '', title); option.value = value; select.append(option); });
  select.value = state.settings.theme;
  select.addEventListener('change', () => perform(async () => { update(await api.setTheme(select.value)); }));
  appearance.append(row('Theme', 'Follow Windows, or choose a look for this app.', select));
  main.append(connections, output, appearance);
}

function render() {
  main.replaceChildren();
  document.querySelectorAll('[data-page]').forEach(item => {
    item.classList.toggle('selected', item.dataset.page === page);
    if (item.dataset.page === page) item.setAttribute('aria-current', 'page'); else item.removeAttribute('aria-current');
  });
  ({ week: renderWeek, courses: renderCourses, settings: renderSettings })[page]();
}
document.querySelectorAll('[data-page]').forEach(item => item.addEventListener('click', () => go(item.dataset.page)));
api.onStateChanged(update);
perform(async () => { update(await api.getState()); render(); });
