const api = window.canvasWeekly;
let state;
let page = 'week';
let preview = false;
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
  catch (error) { announce(error.message); }
}
function announce(message) {
  const notice = document.querySelector('#notice');
  notice.textContent = message;
  notice.hidden = false;
}
function update(next) {
  state = next;
  document.documentElement.dataset.theme = state.appearance.dark ? 'dark' : 'light';
  document.querySelector('#connection-status').textContent = state.canvas.connected ? 'Canvas connected' : state.canvas.connecting ? 'Signing in to Canvas' : 'Canvas not connected';
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
  header('This week', preview ? 'September 14 – 20, 2026' : 'A clear plan for the week ahead');
  if (preview) { renderPreview(); return; }
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
  const actions = node('div', 'actions');
  actions.append(button('Set up Canvas Weekly', () => go('settings'), 'primary'), button('Preview an example', () => { preview = true; render(); }));
  welcome.append(steps, actions);
  main.append(welcome, node('p', 'footer-note', 'Canvas Weekly gathers course information. It never starts quizzes, submits work, or sends messages.'));
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
  connections.append(advanced, row('ChatGPT', 'Optional. Add AI interpretation to your factual course guide.'));
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
