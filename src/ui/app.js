import { weeklyView } from '../weekly-view.js';
import { factualOverview, courseCountText } from '../factual-overview.js';

const api = window.canvasWeekly;
let state;
let page = 'week';
let preview = false;
let noticeTimer;
let planningDraft = null;
let documentDraft = null;
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
function openSource(id) {
  const source = state.guide?.courses.flatMap(course => course.evidence || []).find(source => source.id === id);
  if (!source?.userProvided) return api.openSource(id);
  go('courses');
  const detail = [...main.querySelectorAll('[data-document-id]')].find(element => element.dataset.documentId === id);
  if (detail) { detail.parentElement.open = true; detail.open = true; detail.querySelector('summary').focus(); detail.scrollIntoView({ block: 'center' }); }
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
  if (state && JSON.stringify(state.settings.lastGuideAccount) !== JSON.stringify(next.settings.lastGuideAccount)) documentDraft = null;
  if (state && (JSON.stringify(state.settings.lastGuideAccount) !== JSON.stringify(next.settings.lastGuideAccount)
    || JSON.stringify(state.planningPreferences) !== JSON.stringify(next.planningPreferences))) planningDraft = null;
  if (next.canvas.error && next.canvas.error !== state?.canvas.error) announce(next.canvas.error, true);
  const runChanged = state && (state.run?.busy !== next.run?.busy || state.run?.message !== next.run?.message);
  const connectionChanged = state && (JSON.stringify(state.canvas) !== JSON.stringify(next.canvas) || ['connected', 'connecting', 'error', 'available'].some(key => state.ai[key] !== next.ai[key]) || JSON.stringify(state.ai.runtime) !== JSON.stringify(next.ai.runtime));
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
    element.setAttribute('aria-label', `${id === 'connection-status' ? 'Canvas' : 'ChatGPT'}: ${element.textContent}. Open connection settings`);
  }
  const collectionStatus = document.querySelector('#canvas-collection-status');
  collectionStatus.hidden = !state.canvas.collectionIssue && !(state.canvas.connected && state.canvas.collectionNotice);
  collectionStatus.textContent = state.canvas.collectionIssue ? 'Refresh paused' : 'Limited Canvas coverage';
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
    const refresh = button(state.run.busy ? 'Working…' : state.guide ? 'Refresh course information' : 'Collect course information', async () => { update(await api.updateGuide()); render(); }, state.guide ? '' : 'primary');
    refresh.disabled = state.run.busy || Boolean(state.canvas.collectionIssue);
    actions.append(refresh);
    if (state.run.busy) actions.append(button('Cancel', () => api.cancelRefresh()));
  }
  if (!preview && state.guide) actions.append(button(state.guide.aiGuide ? 'Open guide' : 'Open factual reference', () => api.openGuide()));
  header('This week', preview ? 'September 14 – 20, 2026' : state.guide ? `${state.guide.week.start} to ${state.guide.week.end}` : 'A clear plan for the week ahead', actions);
  if (!preview) {
    if (state.reading?.courses.some(course => course.requested === 'expanded')) main.append(node('p', 'muted', state.reading.available ? 'Expanded reading enabled for selected courses.' : 'Expanded reading requested. Limited reading is active pending safety validation.'));
    renderCollectionSummary();
  }
  if (preview) { renderPreview(); return; }
  if (state.canvas.collectionIssue) {
    const safety = card('Canvas refresh paused');
    safety.classList.add('callout', 'warning');
    safety.append(node('p', '', state.canvas.collectionIssue));
    safety.append(button('Open connection settings', () => go('settings')));
    main.append(safety);
  } else if (state.canvas.connected && state.canvas.collectionNotice) {
    const coverage = node('details', 'card coverage-notice');
    coverage.append(node('summary', '', 'Limited source coverage — review what is missing'), node('p', '', state.canvas.collectionNotice));
    main.append(coverage);
  }
  if (state.guide) {
    const sharing = card('Make your weekly study guide');
    sharing.append(node('p', 'muted', 'Choose how to turn your saved course information into a personal plan. Collecting information never starts an AI run.'));
    const routes = node('div', 'guide-routes');
    const manual = node('div', 'guide-route');
    manual.append(node('h3', '', 'Use your preferred AI chat'), node('p', '', 'Export a document, then upload it with the study prompt. Review it first: course text may contain personal information.'));
    const manualActions = node('div', 'actions');
    const exportButton = button('Export for AI', async () => { update(await api.exportForAI()); render(); });
    exportButton.disabled = state.run.busy;
    manualActions.append(exportButton, button('Copy study prompt', async () => { await api.copyStudyPrompt(); announce('Study prompt copied. Upload Course Information.md with it.'); }));
    manual.append(manualActions);
    const connected = node('div', 'guide-route');
    connected.append(node('h3', '', 'Use connected ChatGPT'), node('p', '', state.ai.connected ? 'Create a guide here with tasks, source links and questions to double-check. This sends saved course information to ChatGPT.' : 'Connect ChatGPT in Settings, then create your guide here using the saved course information.'));
    const generate = button('Create my weekly guide', async () => {
      if (!state.ai.connected) { go('settings'); return; }
      update(await api.generateGuide()); render();
    }, 'primary');
    generate.disabled = state.run.busy;
    const connectedActions = node('div', 'actions');
    connectedActions.append(generate);
    if (state.run.busy && !state.canvas.connected) connectedActions.append(button('Cancel', () => api.cancelRefresh()));
    connected.append(connectedActions);
    routes.append(manual, connected);
    sharing.append(routes);
    if (state.guide.aiGuide) sharing.append(node('p', 'footer-note', 'Refreshing replaces this week’s output with a fresh factual reference. Your previous generated files are kept in Revisions; create a new AI guide after collecting.'));
    const coverage = state.guide.planningCoverage;
    if (coverage && (coverage.omittedTexts || coverage.items || coverage.sources || coverage.courses || coverage.changes)) sharing.append(node('p', 'muted', `The last connected AI run omitted ${coverage.omittedTexts} full texts, ${coverage.items} assessment records, ${coverage.sources} material records, ${coverage.courses || 0} course summaries and ${coverage.changes || 0} changes because of input limits. The exported pack includes them; review it for a complete account of collected evidence.`));
    main.append(sharing);
    renderGuide(); return;
  }
  const welcome = card();
  welcome.classList.add('welcome');
  welcome.append(node('div', 'eyebrow', 'WELCOME TO CANVAS WEEKLY'), node('h2', '', 'Know what to focus on. Keep the details close.'), node('p', '', 'Bring deadlines, readings, and course updates into one weekly guide, with links back to the source.'));
  const steps = node('div', 'steps');
  [['Connect your courses', 'Choose your Canvas courses and any supported course websites.'], ['Collect course information', 'Save source material and deadlines locally. Check what is missing or needs confirmation.'], ['Create your study guide', 'Export for your preferred AI chat, or use connected ChatGPT. Files go to your Desktop, or a folder you choose.']].forEach(([title, description], index) => {
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
  main.append(node('p', 'footer-note', `${guide.aiGuide ? 'AI weekly guide' : 'Factual reference'} · Collected ${format(guide.generatedAt)} · ${guide.timeZone}`));
  if (guide.websiteRefreshedAt) main.append(node('p', 'footer-note', `Websites refreshed ${format(guide.websiteRefreshedAt)}. Canvas dates and submission status were not refreshed by that action.`));
  const weekly = weeklyView(guide);
  if (weekly) {
    const overview = card('Your AI weekly guide');
    overview.append(node('p', 'muted', weekly.note), node('small', '', `AI generated: ${format(weekly.generatedAt)}. Collection timestamp remains above.`));
    if (weekly.preferencesChanged) overview.append(node('p', 'muted', 'Study preferences changed after this guide was generated. Create a new guide to use the current preferences.'));
    const appendCited = (container, entry) => {
      container.append(node('p', '', entry.text));
      for (const source of entry.citations) container.append(button(source.title, () => openSource(source.id), 'link'));
    };
    for (const entry of weekly.overview) appendCited(overview, entry);
    main.append(overview);
    for (const course of weekly.courses) {
      const section = card(course.name);
      section.append(node('p', '', course.focus));
      for (const task of course.tasks) {
        const content = node('div', 'study-task');
        const body = node('div');
        if (task.localId) {
          const check = node('input'); check.type = 'checkbox'; check.checked = task.done; check.disabled = state.run.busy;
          check.setAttribute('aria-label', `Preparation done: ${task.action}`);
          check.addEventListener('change', () => perform(async () => { update(await api.setStudyTaskDone(task.localId, check.checked)); render(); }));
          content.append(check);
        }
        body.append(node('h3', '', task.action), node('p', '', task.reason));
        if (task.suggestedDate) body.append(node('p', 'muted', `Suggested study day: ${task.suggestedDate}`));
        for (const fact of task.recorded) body.append(node('small', '', fact));
        if (task.changedSinceDone) body.append(node('p', 'muted', 'Changed since you checked it off; review again.'));
        const steps = node('ul');
        for (const step of task.steps) {
          const item = node('li', '', `${step.kind === 'suggested' ? 'Suggested preparation' : `${step.kind} (AI interpretation)`}: ${step.text}`);
          if (step.quote) item.append(node('blockquote', '', step.quote));
          steps.append(item);
        }
        body.append(steps);
        for (const check of task.checks) body.append(node('p', 'muted', `Needs checking: ${check}`));
        for (const source of task.citations) body.append(button(source.userProvided ? 'View imported document' : 'Original source', () => openSource(source.id), 'link'));
        content.append(body); section.append(content);
      }
      main.append(section);
    }
    const questions = card('Questions to double-check');
    for (const entry of weekly.questions) appendCited(questions, entry);
    if (!weekly.questions.length) questions.append(node('p', 'muted', 'Review the source coverage below for collection gaps.'));
    main.append(questions);
  }
  if (guide.studyPlan && !weekly) {
    const recorded = factualOverview(guide);
    const reference = card('Recorded course work');
    reference.append(node('p', '', recorded.summary), node('p', 'muted', recorded.note));
    for (const course of recorded.courses) {
      const entry = node('div', 'recorded-course');
      entry.append(node('h3', '', course.name), node('p', '', courseCountText(course.counts)),
        node('small', '', `${course.counts.unknown} with unknown submission status; ${course.counts.stale} with last-known or unrefreshed fields.`),
        node('small', '', `Collected texts: ${course.sourceTexts}; coverage gaps: ${course.coverageGaps}; uncollected links: ${course.uncollectedLinks}.`));
      if (course.next) {
        const item = course.next;
        entry.append(node('p', '', `Earliest recorded outstanding deadline in this window: ${format(item.dueAt)}${item.stale || item.dueDateStale ? ' — last-known; recheck' : ''}`), button(item.title, () => api.openSource(item.id), 'link'));
        if (item.sharedDeadlineCount > 1) entry.append(node('p', 'muted', `${item.sharedDeadlineCount} outstanding items share this recorded due time. See the detailed records for each item.`));
      } else entry.append(node('p', 'muted', 'No outstanding dated item in this window was collected. Check undated work, course materials and coverage gaps.'));
      reference.append(entry);
    }
    main.append(reference);
    const plan = guide.studyPlan;
    const legacy = node('details', 'card legacy-plan');
    legacy.append(node('summary', '', 'Basic preparation checklist'), node('p', 'muted', 'These generic prompts are retained for local checkmarks. Use the recorded deadlines below and an AI guide for a personal plan.'));
    const overview = node('section');
    overview.append(node('p', '', plan.summary), node('p', 'muted', plan.note));
    const refined = plan.tasks.filter(task => task.ai).length;
    if (guide.priorities?.length) overview.append(node('p', 'muted', `ChatGPT refined ${refined} preparation task${refined === 1 ? '' : 's'}. Other tasks use basic prompts. Required/optional labels are AI interpretations with source quotes to check.`));
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
        if (task.posted) {
          for (const fact of task.posted.facts) content.append(node('small', '', fact));
          if (task.posted.needs.length) content.append(node('p', 'muted', `Needs checking: ${task.posted.needs.join('; ')}.`));
          for (const excerpt of task.posted.sources) {
            const posted = node('details');
            posted.append(node('summary', '', `${excerpt.title}${excerpt.stale ? ' (last-known; recheck)' : ''}`), node('p', 'muted', excerpt.note));
            if (excerpt.observedAt) posted.append(node('small', '', `Collected: ${format(excerpt.observedAt)}`));
            if (excerpt.text) posted.append(node('blockquote', '', excerpt.text));
            posted.append(button('Read original material', () => api.openSource(excerpt.sourceId), 'link'));
            content.append(posted);
          }
          if (task.posted.more) content.append(node('small', '', `${task.posted.more} more collected materials appear in Source details.`));
        }
        if (task.changedSinceDone) content.append(node('p', 'muted', 'Changed since you checked it off — review again.'));
        const details = node('details');
        details.append(node('summary', '', 'Suggested preparation'), node('p', '', task.reason));
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
        details.append(button('Open source', () => openSource(task.sourceId), 'link'));
        content.append(details); row.append(checkbox, content); day.append(row);
      }
      overview.append(day);
    }
    legacy.append(overview);
    const checks = card('Double-check before relying on this plan');
    if (!plan.checks.length) checks.append(node('p', 'muted', 'No specific gaps identified. Course information can still change.'));
    for (const check of plan.checks) {
      const details = node('details');
      details.append(node('summary', '', check.title), node('p', '', check.detail), button('Open source', () => openSource(check.sourceId), 'link'));
      checks.append(details);
    }
    legacy.append(checks);
    main.append(legacy);
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
      if (source.recovered) detail.append(node('p', 'muted', `Recovered from an older saved guide${source.recoveredFromGuideAt ? ` collected ${format(source.recoveredFromGuideAt)}` : ''}. Original source observation time is unavailable.`));
      if (source.author || source.postedAt) detail.append(node('p', 'muted', `${source.author || ''} ${source.postedAt ? format(source.postedAt) : ''}`));
      if (source.authorRoleUnverified && !source.authorUnverified) detail.append(node('p', 'muted', 'Sender name supplied by Canvas; course role not verified.'));
      if (source.coverageNote) detail.append(node('p', 'muted', source.coverageNote));
      if (source.importedAt) detail.append(node('p', 'muted', `Imported ${format(source.importedAt)}. Source ID: ${source.id}.`));
      if (source.startsAt) detail.append(node('p', '', `${format(source.startsAt)}${source.location ? ' · ' + source.location : ''}`));
      detail.append(node('p', 'source-body', source.body || 'Content not supplied.'), button(source.userProvided ? 'View imported document' : 'Open source', () => openSource(source.id), 'link'));
      group.append(detail);
    }
    information.append(group);
  }
  main.append(information);
  const coverage = card('Source coverage');
  coverage.id = 'source-coverage'; coverage.tabIndex = -1;
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
    renderCourseDocuments();
    renderCourseWebsites(state.courses);
    return;
  }
  if (state.guide) { renderCourseDocuments(); renderCourseWebsites(state.guide.courses); }
  const empty = card();
  empty.classList.add('empty');
  empty.append(node('h2', '', 'Your courses will appear here'), node('p', '', 'Connect Canvas to find your courses, including optional co-op or application work.'), button('Connection settings', () => go('settings'), 'primary'));
  main.append(empty);
}

function renderCourseDocuments() {
  const format = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString(undefined, { timeZone: state.guide.timeZone, dateStyle: 'medium', timeStyle: 'short' }) : 'date not recorded';
  const section = card('Course documents');
  section.append(node('p', 'muted', 'Add downloaded readings, schedules or instructions that collection could not reach. Review the extracted text before it enters your evidence pack. No Canvas request or AI upload is made.'));
  if (!state.guide?.outputPath) {
    section.append(node('p', '', 'Collect your selected courses once to attach documents to the saved collection.'));
    main.append(section); return;
  }
  section.append(node('p', 'muted', 'PDF, Word (.docx), UTF-8 text or Markdown; up to 2 MB per file. Images and scanned text need checking in the original. Adding, replacing or removing a document replaces the current AI guide with a factual reference; create a new AI guide afterwards.'));
  if (state.run.busy) section.append(button('Cancel current operation', () => api.cancelRefresh()));
  const choose = async (courseId, replaceId) => {
    documentDraft = await api.previewDocument(courseId, replaceId);
    if (documentDraft) Object.assign(documentDraft, { title: documentDraft.source.title, url: '' });
    render();
    const heading = main.querySelector('[data-document-preview]');
    heading?.focus(); heading?.scrollIntoView({ block: 'start' });
  };
  for (const course of state.guide.courses) {
    const documents = (course.evidence || []).filter(source => source.kind === 'document' && source.userProvided);
    const group = node('details', 'document-course');
    group.append(node('summary', '', `${course.code || course.name} · ${documents.length} added documents`));
    group.open = documentDraft?.source.courseId === course.id;
    const add = button('Choose document', () => choose(course.id)); add.disabled = state.run.busy;
    group.append(add);
    for (const source of documents) {
      const detail = node('details', 'document-copy');
      detail.dataset.documentId = source.id;
      detail.append(node('summary', '', source.title), node('p', 'muted', `Imported ${format(source.importedAt)}. ${source.coverageNote}`), node('p', 'source-body document-text', source.body));
      if (source.sourceUrl) detail.append(button('Provided source link', () => api.openSource(source.id), 'link'));
      const replace = button('Replace document', () => choose(course.id, source.id)); replace.disabled = state.run.busy;
      detail.append(replace);
      const removal = node('details');
      removal.append(node('summary', '', 'Remove document'), node('p', 'muted', 'Removes this text from the current evidence pack. Earlier exports, revisions and any uploads keep their copies. The original file is untouched.'));
      const remove = button('Remove from current pack', async () => { update(await api.removeDocument(course.id, source.id)); documentDraft = null; render(); });
      remove.disabled = state.run.busy; removal.append(remove); detail.append(removal);
      group.append(detail);
    }
    if (documentDraft?.source.courseId === course.id) {
      const draft = documentDraft;
      const review = node('section', 'document-review');
      const heading = node('h3', '', draft.replaceId ? 'Review replacement document' : 'Review document');
      heading.tabIndex = -1; heading.dataset.documentPreview = '';
      const title = node('input'); title.value = draft.title; title.maxLength = 180; title.setAttribute('aria-label', 'Document title');
      title.addEventListener('input', () => { draft.title = title.value; });
      const url = node('input'); url.type = 'url'; url.value = draft.url; url.maxLength = 2000; url.placeholder = 'Original HTTPS link (optional)'; url.setAttribute('aria-label', 'Original document link (optional)');
      url.addEventListener('input', () => { draft.url = url.value; });
      review.append(heading, node('p', 'muted', 'Review for missing content and personal details. Only the extracted text and source details are saved, not the original file or its path. Added text is included in future exports and explicit AI generation.'), title, url,
        node('p', 'muted', `${draft.source.body.length.toLocaleString()} extracted characters. ${draft.source.coverageNote}`), node('p', 'source-body document-text', draft.source.body));
      const actions = node('div', 'actions');
      const save = button(draft.replaceId ? 'Save replacement' : 'Add to evidence pack', async () => { update(await api.addDocument(draft.token, draft.title, draft.url)); documentDraft = null; render(); }, 'primary');
      const discard = button('Discard preview', async () => { await api.discardDocument(); documentDraft = null; render(); });
      save.disabled = discard.disabled = state.run.busy; actions.append(save, discard); review.append(actions); group.append(review);
    }
    section.append(group);
  }
  section.append(node('small', 'muted', 'Imported copies belong to this account’s saved collection and are never refreshed automatically. If you stop collecting a course, its documents leave the current pack; earlier files and revisions remain.'));
  main.append(section);
}

function renderCourseWebsites(courses) {
  if (!state.settings.lastGuideAccount || !courses.length) return;
  const section = card('Course websites');
  section.append(node('p', 'muted', 'Connect a separate course site for its schedule, readings and lecture pages. Collection includes readable pages in the chosen site folder.'));
  const refresh = button('Refresh connected websites', async () => { update(await api.refreshWebsites()); render(); }, 'primary');
  refresh.disabled = state.run.busy || !state.guide?.outputPath || !(state.websites || []).some(site => state.guide.courses.some(course => course.id === site.courseId));
  section.append(refresh, node('p', 'muted', 'Updates websites for the courses in your saved collection without contacting Canvas or AI. Canvas dates and submission status keep their original collection time. A successful refresh replaces the current AI guide with a factual reference; generate a new guide afterwards.'));
  if (!state.guide?.outputPath) section.append(node('p', 'muted', 'Collect your Canvas courses once to enable a separate website refresh.'));
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
      if (site.hasCredentials || site.sessionOnly) {
        connection.append(node('p', 'muted', site.hasCredentials ? 'Login saved with Windows encryption.' : 'Login kept for this app session only.'));
        actions.append(button('Forget website login', async () => { update(await api.forgetWebsiteLogin(site.id)); render(); }));
      }
      for (const control of actions.children) control.disabled = state.run.busy;
      connection.append(actions);
      if (site.needsPassword) {
        connection.append(node('p', 'muted', 'Use the website login supplied by your course. Remembered logins are encrypted on this Windows computer.'));
        const remember = node('input'); remember.type = 'checkbox'; remember.checked = site.remember !== false;
        remember.setAttribute('aria-label', `Remember login for ${site.url}`);
        const rememberLabel = node('label', 'remember-login'); rememberLabel.append(remember, document.createTextNode(' Remember on this computer'));
        connection.append(rememberLabel);
        const username = node('input'); username.autocomplete = 'off'; username.placeholder = 'Website username'; username.setAttribute('aria-label', `Website username for ${site.url}`);
        const password = node('input'); password.type = 'password'; password.autocomplete = 'off'; password.placeholder = 'Website password'; password.setAttribute('aria-label', `Website password for ${site.url}`);
        const login = button('Connect website', async () => {
          const user = username.value; const secret = password.value; password.value = '';
          update(await api.connectWebsite(site.id, user, secret, remember.checked)); render();
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
    canvasActions.append(button('Choose courses', () => go('courses')));
  } else {
    canvasActions.append(button('Sign in to Canvas', async () => { update(await api.openCanvasLogin()); render(); }, 'primary'), button('Check connection', async () => { announce('Checking Canvas connection…'); update(await api.verifyCanvas()); announce('Canvas connected. Choose your courses.'); go('courses'); }));
  }
  if (state.canvas.canForget) canvasActions.append(button('Forget Canvas login', async () => { update(await api.disconnectCanvas()); render(); announce('Saved Canvas connection forgotten. Guide files are kept.'); }));
  const canvasSettings = row('Canvas', state.canvas.connected ? `Connected as ${state.canvas.name}` : 'Sign in in the Canvas window, then close it and check the connection.', canvasActions);
  canvasSettings.id = 'canvas-settings';
  connections.append(canvasSettings);
  const rememberCanvas = node('input'); rememberCanvas.type = 'checkbox'; rememberCanvas.checked = state.settings.rememberCanvas !== false;
  rememberCanvas.setAttribute('aria-label', 'Remember Canvas on this computer'); rememberCanvas.disabled = state.run.busy || state.canvas.connecting;
  rememberCanvas.addEventListener('change', () => perform(async () => {
    try { update(await api.setRememberCanvas(rememberCanvas.checked)); announce('Canvas login preference saved. Sign in to continue.'); }
    finally { update(await api.getState()); render(); }
  }));
  connections.append(row('Remember Canvas on this computer', 'Reuse your session until Canvas requires sign-in. Changing this signs you out locally; your guides are kept.', rememberCanvas));
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
  advanced.append(node('p', 'muted', 'Use an API token only if your institution provides one. Remembered tokens are encrypted on this Windows computer; with Remember off they stay in memory.'), addressRow, tokenRow);
  connections.append(advanced);
  const aiActions = node('div', 'actions');
  if (!state.ai.connected) aiActions.append(button(state.ai.connecting ? 'Sign-in open' : 'Connect ChatGPT', async () => { update(await api.connectChatGPT()); render(); }), button('Check sign-in', async () => { update(await api.checkChatGPT()); render(); }));
  if (state.ai.canForget) aiActions.append(button('Forget ChatGPT login', async () => { update(await api.disconnectChatGPT()); render(); announce('Saved ChatGPT connection forgotten.'); }));
  const aiSettings = row('ChatGPT via Codex', state.ai.connected ? 'Connected. Your account usage limits apply.' : state.ai.error || 'Sign in through the official ChatGPT page to create weekly study guides.', aiActions);
  aiSettings.id = 'ai-settings';
  connections.append(aiSettings);
  const rememberAI = node('input'); rememberAI.type = 'checkbox'; rememberAI.checked = state.settings.rememberChatGPT !== false;
  rememberAI.setAttribute('aria-label', 'Remember ChatGPT on this computer'); rememberAI.disabled = state.run.busy || state.ai.connecting;
  rememberAI.addEventListener('change', () => perform(async () => {
    try { update(await api.setRememberChatGPT(rememberAI.checked)); announce('ChatGPT login preference saved. Sign in to continue.'); }
    finally { update(await api.getState()); render(); }
  }));
  connections.append(row('Remember ChatGPT on this computer', 'Use Windows credential storage. Off keeps authorization in memory for this app session. Changing this signs you out.', rememberAI));
  connections.append(node('p', 'muted', 'ChatGPT runs only when you choose Create my weekly guide. Connecting or refreshing Canvas does not send course information to AI.'));
  const aiOptions = node('details', 'connection-options'); aiOptions.append(node('summary', '', 'ChatGPT connection options'));
  const runtime = state.ai.runtime;
  const runtimeTitle = state.ai.available ? 'Codex ready' : runtime?.detected ? 'Codex detected' : 'Codex not detected';
  const runtimeDescription = runtime?.detected || state.ai.available
    ? `${runtime?.source === 'manual' ? 'Using your manual selection.' : runtime?.source === 'bundled' ? 'Detected automatically. Included with Canvas Weekly.' : 'Detected automatically on this computer.'} ${state.ai.available ? 'The runtime is responding.' : state.ai.error ? 'It is not ready. Try reconnecting or choose another executable.' : 'It will start when you connect ChatGPT.'}`
    : 'Choose codex.exe manually to connect ChatGPT. Factual guides still work without it.';
  aiOptions.append(node('h3', '', runtimeTitle), node('p', 'muted', runtimeDescription));
  if (runtime?.path) aiOptions.append(node('p', 'muted', `Runtime location: ${runtime.path}`));
  aiOptions.append(button('Choose Codex executable', async () => { update(await api.chooseCodex()); render(); }, runtime?.detected || state.ai.available ? '' : 'primary'));
  connections.append(aiOptions);
  const output = card('Weekly files');
  output.append(row('Output folder', state.outputDirectory, button('Change folder', async () => { update(await api.chooseOutput()); render(); })), row('Open your files', 'Weekly guides and your notes stay in the folder you choose.', button('Open folder', () => api.openOutput())));
  const timeZone = node('select', 'timezone-select');
  timeZone.setAttribute('aria-label', 'Academic timezone');
  [...new Set([state.settings.timeZone, 'UTC', ...Intl.supportedValuesOf('timeZone')])].sort().forEach(value => {
    const option = node('option', '', value.replaceAll('_', ' ')); option.value = value; timeZone.append(option);
  });
  timeZone.value = state.settings.timeZone;
  const timing = node('div', 'actions');
  timing.append(timeZone, button('Save timezone', async () => {
    update(await api.setTimeZone(timeZone.value));
    announce('Timezone saved for the next guide update. Existing guides keep their original timezone.');
  }));
  output.append(row('Academic timezone', 'Use the timezone your courses follow, even when travelling. Weeks run Monday to Sunday. Changes apply on the next collection; saved guides keep their original dates and timezone.', timing));
  const appearance = card('Appearance');
  const select = node('select');
  select.setAttribute('aria-label', 'Theme');
  [['system', 'Use Windows setting'], ['light', 'Light'], ['dark', 'Dark']].forEach(([value, title]) => { const option = node('option', '', title); option.value = value; select.append(option); });
  select.value = state.settings.theme;
  select.addEventListener('change', () => perform(async () => { update(await api.setTheme(select.value)); }));
  appearance.append(row('Theme', 'Follow Windows, or choose a look for this app.', select));
  main.append(connections);
  const preferences = card('Study preferences');
  preferences.append(node('p', 'muted', 'Optional availability, priorities and guide length for this Canvas account. Saved on this device; included in AI exports and generation only when you enable sharing below.'));
  if (!state.guide) preferences.append(node('p', '', 'Collect course information before saving study preferences.'));
  else {
    const saved = planningDraft || state.planningPreferences;
    const availability = node('textarea'); availability.rows = 3; availability.maxLength = 1500; availability.value = saved.availability;
    availability.id = 'study-availability'; availability.placeholder = 'For example: Tuesday and Thursday evenings; about 6 hours this week.';
    const availabilityLabel = node('label', '', 'Available study time'); availabilityLabel.htmlFor = availability.id;
    const priorities = node('textarea'); priorities.rows = 3; priorities.maxLength = 1500; priorities.value = saved.priorities;
    priorities.id = 'study-priorities'; priorities.placeholder = 'For example: focus on SQL practice and prepare questions before each lab.';
    const prioritiesLabel = node('label', '', 'Priorities and preferences'); prioritiesLabel.htmlFor = priorities.id;
    const detail = node('select'); detail.setAttribute('aria-label', 'Guide length');
    for (const value of ['brief', 'standard', 'detailed']) { const option = node('option', '', value[0].toUpperCase() + value.slice(1)); option.value = value; detail.append(option); }
    detail.value = saved.detail;
    const share = node('input'); share.type = 'checkbox'; share.checked = saved.includeWithAI;
    const shareLabel = node('label', 'remember-login'); shareLabel.append(share, document.createTextNode(' Include these preferences with AI exports and generation'));
    share.setAttribute('aria-label', 'Include study preferences with AI');
    const fields = node('div', 'study-preferences'); fields.append(availabilityLabel, availability, prioritiesLabel, priorities, row('Guide length', '', detail), shareLabel);
    const actions = node('div', 'actions');
    const save = button('Save study preferences', async () => { update(await api.savePlanningPreferences({ availability: availability.value, priorities: priorities.value, detail: detail.value, includeWithAI: share.checked })); planningDraft = null; render(); });
    const clear = button('Clear study preferences', async () => { update(await api.savePlanningPreferences({ availability: '', priorities: '', detail: 'standard', includeWithAI: false })); planningDraft = null; render(); });
    save.disabled = state.run.busy; clear.disabled = state.run.busy || (!saved.availability && !saved.priorities && !saved.includeWithAI && saved.detail === 'standard');
    for (const field of [availability, priorities, detail, share]) field.disabled = state.run.busy;
    for (const field of [availability, priorities, detail, share]) field.addEventListener('input', () => {
      planningDraft = { availability: availability.value, priorities: priorities.value, detail: detail.value, includeWithAI: share.checked };
      clear.disabled = state.run.busy || (!planningDraft.availability && !planningDraft.priorities && !planningDraft.includeWithAI && planningDraft.detail === 'standard');
    });
    actions.append(save, clear); preferences.append(fields, actions);
  }
  main.append(preferences);
  renderReadingSettings();
  main.append(output, appearance);
}

function renderReadingSettings() {
  const section = card('Course reading');
  section.append(node('p', '', 'Limited reading is the default. Expanded reading may record views, satisfy view-based module requirements, or make subsequent material available. Assessment attempts, submissions, messages and explicit Mark done actions remain forbidden.'),
    node('p', 'muted', state.reading?.hold || 'Additional material reads are pending safety validation.'));
  if (!state.canvas.connected) {
    section.append(node('p', 'muted', 'Connect Canvas to choose reading preferences per course.')); main.append(section); return;
  }
  const consent = (state.settings.courseReading || []).find(entry => entry.origin === state.settings.canvasBaseUrl && entry.userId === state.settings.lastGuideAccount?.userId && entry.version === 1);
  const expanded = new Set(consent?.courseIds || []);
  for (const course of state.courses) {
    const choice = node('select'); choice.setAttribute('aria-label', `Course reading for ${course.name}`);
    for (const [value, label] of [['limited', 'Limited reading'], ['expanded', state.reading?.available ? 'Expanded course reading' : 'Expanded (pending validation)']]) {
      const option = node('option', '', label); option.value = value; choice.append(option);
    }
    choice.value = expanded.has(String(course.id)) ? 'expanded' : 'limited';
    choice.disabled = state.run.busy;
    choice.addEventListener('change', () => choice.value === 'expanded' ? expanded.add(String(course.id)) : expanded.delete(String(course.id)));
    section.append(row(course.name, '', choice));
  }
  const acknowledgement = node('input'); acknowledgement.type = 'checkbox'; acknowledgement.disabled = state.run.busy;
  acknowledgement.setAttribute('aria-label', 'I understand the possible viewing effects');
  const label = node('label', 'remember-login'); label.append(acknowledgement, document.createTextNode(' I understand the possible viewing effects. App access does not mean I studied the material.'));
  section.append(label, button('Save reading preferences', async () => {
    update(await api.setCourseReading([...expanded], acknowledgement.checked)); render();
    announce(state.reading?.available ? 'Course reading preferences saved.' : 'Preferences saved. Limited reading remains active while additional sources are reviewed.');
  }));
  main.append(section);
}

function renderCollectionSummary() {
  const latest = state.collectionHistory?.[0];
  if (!latest) return;
  const effects = latest.requests.filter(request => request.effectKind === 'possible-view');
  const summary = node('details', 'card collection-summary');
  summary.open = latest.status !== 'completed' || effects.length > 0;
  summary.append(node('summary', '', `Latest collection: ${latest.status}${effects.length ? ' — possible viewing effects' : ''}`));
  summary.append(node('p', '', `${new Date(latest.startedAt).toLocaleString()} · ${latest.status} · ${latest.requests.length} recorded requests`),
    node('p', 'muted', effects.length ? `${effects.length} requests may have affected viewing progress. A failed or cancelled update may still have reached Canvas.` : 'No expanded Canvas material reads were attempted. This is a request history, not proof that Canvas account state stayed unchanged.'),
    button('Review collection history', () => {
      go('privacy'); const target = document.getElementById('collection-history'); target?.scrollIntoView({ block: 'start' }); target?.focus({ preventScroll: true });
    }));
  main.append(summary);
  if (latest.failure) summary.append(node('p', '', `${latest.failure.reason} (${latest.failure.code}) Reconnect Canvas in Settings before trying again.`));
  if (Number.isSafeInteger(latest.changes)) summary.append(node('p', 'muted', `${latest.changes} new or changed information entries in the guide.`));
}

function renderCollectionHistory() {
  const section = card('Collection history'); section.id = 'collection-history'; section.tabIndex = -1;
  section.append(node('p', 'muted', 'Canvas requests for this account, recorded locally. Course website coverage is separate in your guide. Requests can reach Canvas even if collection fails. Viewing effects are not measured or undone; study checkmarks remain yours to control. Earlier app versions are not reconstructed here.'));
  if (!state.collectionHistory?.length) section.append(node('p', '', 'No collection runs recorded for this account yet.'));
  const operations = { profile: 'Verify account', accountscope: 'Check account permissions', metadataenrollments: 'Check student enrollment', metadataassignments: 'Read assignment metadata', metadataownsubmission: 'Read own submission status', coursesyllabus: 'Read syllabus text', courserubrics: 'Read rubric criteria', courseconversations: 'Find course messages', conversationtext: 'Read course message text', courses: 'List courses' };
  for (const run of state.collectionHistory || []) {
    const details = node('details', 'connection-options');
    details.append(node('summary', '', `${new Date(run.startedAt).toLocaleString()} · ${run.status} · ${run.requests.length} requests`));
    if (run.failure) details.append(node('p', '', `${run.failure.reason} (${run.failure.code})`));
    for (const course of run.courses) details.append(node('p', '', `${course.name}: ${course.effective} reading${course.requested !== course.effective ? ' (expanded requested; pending validation)' : ''}`));
    if (!run.requests.length) details.append(node('p', 'muted', 'No collector request intents were recorded. Collection may have stopped during local session verification.'));
    for (const request of run.requests) {
      const item = node('div', 'setting-row'); const text = node('div');
      const course = run.courses.find(course => course.courseId === request.courseId);
      text.append(node('h3', '', `${operations[request.operation] || request.operation}${course ? ` · ${course.name}` : ''}${request.itemId ? ` · Assignment ${request.itemId}` : ''}`),
        node('p', '', `${request.outcome}${request.httpStatus ? ` (HTTP ${request.httpStatus})` : ''}. ${request.effect}`));
      if (request.outcome === 'requested' || request.outcome === 'failed') text.append(node('p', 'muted', 'The request may have reached Canvas; its final server-side effect is unknown.'));
      item.append(text);
      if (course) item.append(button(request.itemId || request.operation === 'coursesyllabus' ? 'Open source' : 'Open course', () => api.openHistorySource(run.id, request.id)));
      details.append(item);
    }
    section.append(details);
  }
  main.append(section);
}

function renderPrivacy() {
  header('Data & privacy', 'Understand what is read, stored, and shared.');
  const grid = node('div', 'privacy-grid');
  const reads = card('What the app reads');
  reads.append(node('p', '', 'Selected courses, assignment titles and stored deadlines, submission status, available syllabus and rubric criterion text, and course messages with supplied sender names. Connected course websites can provide additional materials.'),
    node('p', '', 'You can also choose course documents stored on this computer. Their text is extracted locally and added only after your review. Document links are not followed.'),
    node('p', 'muted', 'Instructions and other materials may be missing or outdated. Check source coverage before relying on your guide.'));
  const storage = card('What is stored locally');
  storage.append(node('p', '', 'Settings, collected course information, guides, study checkmarks, and collection history are saved on this computer. History includes course names and item identifiers. Remembered logins use protected Windows storage.'),
    node('p', '', 'Added documents contribute extracted text, title, import date, file fingerprint and an optional source link. Original files and their paths are not copied into app storage. Removing a document affects the current pack; earlier exports and revisions keep their copies.'),
    node('p', 'muted', 'Course data and exported guides are not encrypted by the app. A cloud-synced output folder may sync your documents. Forgetting a login keeps your guides.'));
  const sharing = card('When information goes to AI');
  const sharingStatus = node('p', 'privacy-status', 'AI sharing: only when you create a guide');
  sharingStatus.id = 'privacy-sharing-status'; sharingStatus.setAttribute('role', 'status');
  sharing.append(sharingStatus, node('p', '', 'Create my weekly guide sends relevant saved course text, including course messages and supplied sender names, through Codex to your connected ChatGPT account. Canvas login credentials are not provided to the planner. Collection and export do not call AI.'),
    node('p', '', 'Export for AI creates Course Information.md locally. It includes collected course text, source coverage and changes, but excludes login storage, local notes and previous AI output. Review it before uploading to an AI chat: course text can contain personal information, and automatic credential filtering may miss unusual formats.'),
    node('p', 'muted', 'Study preferences are stored per Canvas account. With Include with AI enabled, availability, priorities and guide length are included in exports and AI input. Clearing or disabling them affects future exports and generation; it does not recall older documents or information already uploaded. Connecting ChatGPT alone does not send course information. Information sent to the AI service is subject to its data policies and your account settings.'));
  const changes = card('What the app can change');
  changes.append(node('p', '', 'Canvas Weekly does not start or resume quizzes, submit coursework, or send messages. Study checkmarks update your local guide only.'),
    node('p', 'muted', 'Collection uses restricted requests and stops when required safety checks fail. Opening an original source uses your browser, outside these collection protections.'));
  grid.append(reads, storage, sharing, changes);
  const protections = node('details', 'card privacy-details');
  protections.append(node('summary', '', 'How collection is protected'),
    node('p', '', 'The collector uses fixed, reviewed requests bound to your account and selected courses. Known reads that can affect module progress are excluded. The AI planner has no Canvas tools. Request logs record operations and outcomes, without credentials or response bodies.'),
    node('p', 'muted', 'Canvas may record sign-ins and access activity. Institutional behavior can vary; these safeguards do not prove that all server-side state or past progress stayed unchanged. Check flagged requirements and deadlines against the original source.'));
  const actions = node('div', 'actions');
  actions.append(button('Manage saved logins', () => go('settings')), button('Open output folder', () => api.openOutput()));
  const coverage = button('View source coverage', () => {
    preview = false; go('week');
    const target = document.getElementById('source-coverage');
    target?.scrollIntoView({ block: 'start' }); target?.focus({ preventScroll: true });
  });
  coverage.disabled = !state.guide;
  actions.append(coverage);
  main.append(grid, node('p', 'muted', 'Canvas may record sign-ins and access activity. Coverage varies; confirm flagged information at its source.'), protections, actions);
  if (!state.guide) main.append(node('p', 'muted', 'Source coverage is available after your first guide update.'));
  renderCollectionHistory();
}

function render() {
  main.replaceChildren();
  document.querySelectorAll('[data-page]').forEach(item => {
    item.classList.toggle('selected', item.dataset.page === page);
    if (item.dataset.page === page) item.setAttribute('aria-current', 'page'); else item.removeAttribute('aria-current');
  });
  ({ week: renderWeek, courses: renderCourses, settings: renderSettings, privacy: renderPrivacy })[page]();
}
document.querySelectorAll('[data-page]').forEach(item => item.addEventListener('click', () => go(item.dataset.page)));
document.querySelector('#connection-settings').addEventListener('click', () => go('settings'));
for (const [status, target] of [['connection-status', 'canvas-settings'], ['ai-status', 'ai-settings']]) {
  document.getElementById(status).addEventListener('click', () => {
    go('settings');
    const section = document.getElementById(target);
    section.scrollIntoView({ block: 'center' });
    section.querySelector('button').focus({ preventScroll: true });
  });
}
api.onStateChanged(update);
perform(async () => { update(await api.getState()); render(); });
