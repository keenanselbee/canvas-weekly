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
  const connectionChanged = state && (JSON.stringify(state.canvas) !== JSON.stringify(next.canvas) || ['connected', 'connecting', 'error', 'available'].some(key => state.ai[key] !== next.ai[key]));
  state = next;
  document.documentElement.dataset.theme = state.appearance.dark ? 'dark' : 'light';
  renderConnections();
  if (runChanged) { if (state.run.message) announce(state.run.message, state.run.busy); render(); }
  else if (connectionChanged) render();
}
function renderConnections() {
  for (const [id, connection] of [['connection-status', state.canvas], ['ai-status', state.ai]]) {
    const element = document.getElementById(id);
    element.textContent = connection.connecting ? 'Signing in…' : connection.connected ? 'Connected' : 'Not connected';
    element.dataset.status = connection.connecting ? 'connecting' : connection.connected ? 'connected' : 'disconnected';
  }
  const collectionStatus = document.querySelector('#canvas-collection-status');
  collectionStatus.hidden = !state.canvas.collectionIssue && !(state.canvas.connected && state.canvas.collectionNotice);
  collectionStatus.textContent = state.canvas.collectionIssue ? 'Refresh paused' : 'Limited Canvas coverage';
  document.querySelector('#suggestions-status').textContent = state.settings.aiEnabled ? (state.ai.connected ? 'On' : 'Sign in') : 'Off';
  const usage = state.ai.usage;
  const tokens = usage?.tokens;
  const format = value => value.toLocaleString();
  document.querySelector('#ai-token-count').textContent = tokens ? format(tokens.totalTokens) : '—';
  const caption = !usage ? 'No AI run this session' : usage.status === 'running' ? 'Current AI run · so far' : 'Latest AI run · this session';
  document.querySelector('#ai-usage-caption').textContent = caption;
  document.querySelector('#ai-usage-scope').textContent = !usage ? caption : `${caption}. ${usage.status === 'running' ? 'Planning in progress.' : usage.status === 'completed' ? 'Completed.' : 'Did not finish; reported usage may be partial.'}${tokens ? '' : ' Token usage not reported.'}`;
  const breakdown = document.querySelector('#ai-usage-breakdown');
  breakdown.hidden = !tokens;
  breakdown.replaceChildren();
  if (tokens) for (const [label, key] of [['Input', 'inputTokens'], ['Cached input', 'cachedInputTokens'], ['Output', 'outputTokens'], ['Reasoning', 'reasoningOutputTokens']]) {
    const item = node('div'); item.append(node('dt', '', label), node('dd', '', format(tokens[key]))); breakdown.append(item);
  }
  document.querySelector('#ai-usage-subtotals').hidden = !tokens;
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
    refresh.disabled = state.run.busy || Boolean(state.canvas.collectionIssue);
    actions.append(refresh);
    if (state.run.busy) actions.append(button('Cancel', () => api.cancelRefresh()));
  }
  if (!preview && state.guide) actions.append(button('Open guide', () => api.openGuide()));
  header('This week', preview ? 'September 14 – 20, 2026' : state.guide ? `${state.guide.week.start} to ${state.guide.week.end}` : 'A clear plan for the week ahead', actions);
  if (preview) { renderPreview(); return; }
  if (state.canvas.collectionIssue) {
    const safety = card('Canvas refresh paused');
    safety.append(node('p', '', state.canvas.collectionIssue));
    main.append(safety);
  } else if (state.canvas.connected && state.canvas.collectionNotice) {
    const coverage = card('Check source coverage');
    coverage.append(node('p', '', state.canvas.collectionNotice));
    main.append(coverage);
  }
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
    if (plan.focus?.length) {
      overview.append(node('h3', '', 'Start here'), node('p', 'muted', plan.focusNote));
      for (const focus of plan.focus) {
        const entry = node('div', 'setting-row');
        const content = node('div');
        content.append(node('h3', '', `${focus.courseName}: ${focus.title}`), node('p', '', focus.reason), node('p', 'muted', `Suggested start: ${focus.suggestedDate}`));
        if (focus.dueAt) content.append(node('p', '', `Recorded due time: ${format(focus.dueAt)}`));
        if (focus.closesAt) content.append(node('p', '', `Available until: ${format(focus.closesAt)}`));
        if (focus.deadlineNote) content.append(node('p', '', focus.deadlineNote));
        entry.append(content, button('View task', () => {
          const target = document.getElementById(`study-${focus.taskId}`);
          for (let parent = target?.parentElement; parent; parent = parent.parentElement) if (parent.tagName === 'DETAILS') parent.open = true;
          target?.scrollIntoView({ block: 'center' }); target?.focus({ preventScroll: true });
        }));
        overview.append(entry);
      }
      overview.append(node('h3', '', 'Full preparation checklist'));
    }
    const dates = [...new Set(plan.tasks.map(task => task.suggestedDate).filter(Boolean))];
    const groups = dates.map(date => ({ title: `Suggested start: ${date}`, open: date === dates[0], tasks: plan.tasks.filter(task => task.suggestedDate === date) }));
    groups.push(...(plan.reviewGroups || []).map(group => ({ title: `Timing to confirm: ${group.courseName}`, open: false, review: true, tasks: group.tasks })));
    let reviewIntro = false;
    for (const group of groups) {
      if (group.review && !reviewIntro) { overview.append(node('h3', '', 'Timing to confirm'), node('p', 'muted', plan.reviewNote)); reviewIntro = true; }
      const day = node('details', 'study-day');
      const tasks = group.tasks;
      day.open = group.open;
      day.append(node('summary', '', `${group.title} · ${tasks.filter(task => task.done).length}/${tasks.length} checked off`));
      for (const task of tasks) {
        const row = node('div', 'study-task');
        const checkbox = node('input');
        checkbox.type = 'checkbox'; checkbox.checked = task.done; checkbox.disabled = state.run.busy;
        checkbox.id = `study-${task.id}`;
        checkbox.setAttribute('aria-label', `Preparation done: ${task.title}`);
        checkbox.addEventListener('change', () => perform(async () => {
          update(await api.setStudyTaskDone(task.id, checkbox.checked)); render();
          const restored = document.getElementById(checkbox.id);
          for (let parent = restored?.parentElement; parent; parent = parent.parentElement) if (parent.tagName === 'DETAILS') parent.open = true;
          restored?.focus();
        }));
        const content = node('div');
        const label = node('label', 'study-task-title', task.title); label.htmlFor = checkbox.id;
        content.append(label, node('small', '', `${task.courseName}${task.ai ? ' · AI suggestion' : ''}`));
        if (task.dueAt) content.append(node('small', '', `Recorded due: ${format(task.dueAt)}`));
        if (task.closesAt) content.append(node('small', '', `Available until: ${format(task.closesAt)}`));
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
        details.append(steps);
        for (const check of task.checks || []) details.append(node('p', 'muted', `${check.title}: ${check.detail}`));
        details.append(button('Open source', () => api.openSource(task.sourceId), 'link'));
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
      if (item.metadataOnly && !item.stale) content.append(node('p', 'muted', 'Assignment metadata refreshed; instructions not rechecked.'));
      if (item.dueDateStale) content.append(node('p', 'muted', 'Deadline needs confirmation; any displayed date is last-known.'));
      const detail = node('details');
      detail.append(node('summary', '', 'Instructions and details'));
      if (item.metadataOnly) detail.append(node('p', 'muted', `Deadline source: ${item.dueDateStale ? 'stored student deadline unavailable' : 'Canvas stored student deadline'}. Date last observed ${format(item.dueDateObservedAt)}.`));
      if (item.availabilityStale) detail.append(node('p', 'muted', `Availability dates were not refreshed. Any displayed dates are last-known, observed ${format(item.availabilityObservedAt)}. Confirm the current window.`));
      if (item.instructionsStale) detail.append(node('p', 'muted', `Last-known instructions, observed ${format(item.instructionsObservedAt)}. Recheck the current source.`));
      if (item.quizDetailsStale) detail.append(node('p', 'muted', `Quiz details were last observed ${format(item.quizDetailsObservedAt)} and were not refreshed.`));
      detail.append(node('p', '', item.instructions || 'No instructions supplied.'), node('p', '', `Submission: ${item.status}. Available until: ${format(item.closesAt)}.`));
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
    renderCourseWebsites(state.courses);
    return;
  }
  if (state.guide) renderCourseWebsites(state.guide.courses);
  const empty = card();
  empty.classList.add('empty');
  empty.append(node('h2', '', 'Your courses will appear here'), node('p', '', 'Connect Canvas to find your courses, including optional co-op or application work.'), button('Connection settings', () => go('settings'), 'primary'));
  main.append(empty);
}

function renderCourseWebsites(courses) {
  if (!state.settings.lastGuideAccount || !courses.length) return;
  const section = card('Course websites');
  section.append(node('p', 'muted', 'Connect a separate course site for its schedule, readings and lecture pages. The next guide update includes readable pages in the chosen site folder.'));
  if (state.run.busy) section.append(button('Cancel current operation', () => api.cancelRefresh()));
  for (const course of courses) {
    const id = String(course.id);
    const group = node('details', 'website-course');
    const connected = (state.websites || []).filter(site => site.courseId === id);
    const connectionLabel = connected.length ? connected.some(site => site.status !== 'ok') ? 'Needs attention' : connected.length === 1 ? 'Website connected' : `${connected.length} websites connected` : 'Add a website';
    group.append(node('summary', '', `${course.name || course.course_code || course.code} · ${connectionLabel}`));
    group.open = connected.some(site => site.status !== 'ok');
    for (const site of connected) {
      const connection = node('section', 'website-connection');
      connection.append(node('h3', '', site.url), node('p', '', site.message || 'Not checked yet.'), node('small', 'muted', `Collection folder: ${site.scope}`));
      const actions = node('div', 'actions');
      actions.append(button('Check website', async () => { update(await api.checkWebsite(site.id)); render(); }),
        button('Remove website', async () => { update(await api.removeWebsite(site.id)); render(); }));
      for (const control of actions.children) control.disabled = state.run.busy;
      connection.append(actions);
      if (site.needsPassword) {
        connection.append(node('p', 'muted', 'Use the website login supplied by your course, which may differ from your Canvas login. It is encrypted on this Windows computer.'));
        const username = node('input'); username.autocomplete = 'off'; username.placeholder = 'Website username'; username.setAttribute('aria-label', `Website username for ${site.url}`);
        const password = node('input'); password.type = 'password'; password.autocomplete = 'off'; password.placeholder = 'Website password'; password.setAttribute('aria-label', `Website password for ${site.url}`);
        const login = button('Connect website', async () => {
          const user = username.value; const secret = password.value; password.value = '';
          update(await api.connectWebsite(site.id, user, secret)); render();
        }, 'primary');
        login.disabled = state.run.busy;
        const fields = node('div', 'actions'); fields.append(username, password, login); connection.append(fields);
      }
      group.append(connection);
    }
    const address = node('input'); address.type = 'url'; address.placeholder = 'https://course.example.edu/course/'; address.setAttribute('aria-label', `Course website for ${course.name || id}`);
    const candidates = (state.guide?.courses.find(item => item.id === id)?.references || []).filter(reference => {
      try { return new URL(reference.sourceUrl).origin !== state.settings.canvasBaseUrl; } catch { return false; }
    });
    if (candidates.length) {
      const select = node('select'); select.setAttribute('aria-label', `Discovered website for ${course.name || id}`);
      const placeholder = node('option', '', 'Choose a link found in Canvas, or enter an address'); placeholder.value = ''; select.append(placeholder);
      for (const reference of candidates) { const option = node('option', '', reference.sourceUrl); option.value = reference.sourceUrl; select.append(option); }
      select.addEventListener('change', () => { address.value = select.value; }); group.append(select);
    }
    const add = button('Add website', async () => { update(await api.addWebsite(id, address.value)); render(); });
    add.disabled = state.run.busy;
    const fields = node('div', 'actions'); fields.append(address, add);
    group.append(fields, node('small', 'muted', 'HTML, text, PDF and Word documents are supported within read limits. Figures, scanned pages and sites needing browser sign-in may require checking the original source.'));
    section.append(group);
  }
  main.append(section);
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
document.querySelector('#connection-settings').addEventListener('click', () => go('settings'));
api.onStateChanged(update);
perform(async () => { update(await api.getState()); render(); });
