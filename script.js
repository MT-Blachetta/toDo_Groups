const standardList = document.getElementById('standard-list');
const addTaskBtn = document.getElementById('add-task-btn');
const newTaskText = document.getElementById('new-task-text');

const groupNameInput = document.getElementById('group-name');
const groupStartInput = document.getElementById('group-start');
const groupDurationDaysInput = document.getElementById('group-duration-days');
const groupDurationHoursInput = document.getElementById('group-duration-hours');
const groupDurationMinutesInput = document.getElementById('group-duration-minutes');
const addGroupBtn = document.getElementById('add-group-btn');
const groupsDiv = document.getElementById('groups');

let data = { standard: [], groups: [] };

function saveData() {
  localStorage.setItem('todo-data', JSON.stringify(data));
}

function loadData() {
  const saved = localStorage.getItem('todo-data');
  if (saved) {
    data = JSON.parse(saved);
    data.groups.forEach(g => {
      if (g.duration && g.duration.value !== undefined) {
        if (g.duration.unit === 'd') {
          g.duration = { days: g.duration.value, hours: 0, minutes: 0 };
        } else if (g.duration.unit === 'h') {
          g.duration = { days: 0, hours: g.duration.value, minutes: 0 };
        }
      }
    });
  }
}

function collectDuration() {
  const days = parseInt(groupDurationDaysInput.value, 10) || 0;
  const hours = parseInt(groupDurationHoursInput.value, 10) || 0;
  const minutes = parseInt(groupDurationMinutesInput.value, 10) || 0;
  return { days, hours, minutes };
}

function durationToMs(dur) {
  return ((dur.days * 24 + dur.hours) * 60 + dur.minutes) * 60 * 1000;
}

function formatDuration(dur) {
  if (dur.days === 1 && dur.hours === 0 && dur.minutes === 0) return 'daily';
  const parts = [];
  if (dur.days) parts.push(dur.days + 'd');
  if (dur.hours) parts.push(dur.hours + 'h');
  if (dur.minutes) parts.push(dur.minutes + 'm');
  if (parts.length === 0) parts.push('0m');
  return parts.join(' ');
}

function nextTime(startTime, duration) {
  const [h, m] = startTime.split(':').map(Number);
  const now = new Date();
  let base = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
  const durMs = durationToMs(duration);
  while (base.getTime() <= now.getTime()) {
    base = new Date(base.getTime() + durMs);
  }
  return base.getTime();
}

function renderStandard() {
  standardList.innerHTML = '';
  data.standard.forEach((task, idx) => {
    const li = document.createElement('li');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = task.done;
    cb.addEventListener('change', () => {
      task.done = cb.checked;
      if (task.done) {
        setTimeout(() => {
          data.standard.splice(idx, 1);
          renderStandard();
          saveData();
        }, 300);
      } else {
        saveData();
      }
    });
    const span = document.createElement('span');
    span.textContent = task.text;
    li.appendChild(cb);
    li.appendChild(span);
    standardList.appendChild(li);
  });
}

function renderGroups() {
  groupsDiv.innerHTML = '';
  data.groups.forEach((group, gidx) => {
    const box = document.createElement('div');
    box.className = 'group-box';
    const header = document.createElement('div');
    header.className = 'group-header';
    const title = document.createElement('span');
    title.textContent = group.name;
    const period = document.createElement('span');
    period.textContent = formatDuration(group.duration);
    header.appendChild(title);
    header.appendChild(period);
    box.appendChild(header);

    const list = document.createElement('ul');
    group.tasks.forEach((task, tidx) => {
      const li = document.createElement('li');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = task.done;
      cb.addEventListener('change', () => {
        task.done = cb.checked;
        updateGroupState(group, box);
        saveData();
      });
      const span = document.createElement('span');
      span.textContent = task.text;
      span.addEventListener('dblclick', () => {
        const txt = prompt('Edit task', task.text);
        if (txt !== null) {
          task.text = txt;
          renderGroups();
          saveData();
        }
      });
      const delBtn = document.createElement('button');
      delBtn.textContent = 'x';
      delBtn.addEventListener('click', () => {
        group.tasks.splice(tidx, 1);
        renderGroups();
        saveData();
      });
      li.appendChild(cb);
      li.appendChild(span);
      li.appendChild(delBtn);
      list.appendChild(li);
    });
    const addInput = document.createElement('input');
    addInput.type = 'text';
    addInput.placeholder = 'New task';
    const addBtn = document.createElement('button');
    addBtn.textContent = 'Add';
    addBtn.addEventListener('click', () => {
      if (addInput.value.trim()) {
        group.tasks.push({ text: addInput.value.trim(), done: false });
        addInput.value = '';
        renderGroups();
        saveData();
      }
    });
    box.appendChild(list);
    box.appendChild(addInput);
    box.appendChild(addBtn);

    updateGroupState(group, box);
    groupsDiv.appendChild(box);
  });
}

function updateGroupState(group, box) {
  const allDone = group.tasks.length > 0 && group.tasks.every(t => t.done);
  if (allDone) {
    box.classList.add('done');
  } else {
    box.classList.remove('done');
  }
}

addTaskBtn.addEventListener('click', () => {
  if (newTaskText.value.trim()) {
    data.standard.push({ text: newTaskText.value.trim(), done: false });
    newTaskText.value = '';
    renderStandard();
    saveData();
  }
});

addGroupBtn.addEventListener('click', () => {
  const name = groupNameInput.value.trim();
  const start = groupStartInput.value;
  const duration = collectDuration();
  if (name && start && durationToMs(duration) > 0) {
    data.groups.push({
      name,
      start,
      duration,
      tasks: [],
      next: nextTime(start, duration)
    });
    groupNameInput.value = '';
    groupStartInput.value = '';
    groupDurationDaysInput.value = '';
    groupDurationHoursInput.value = '';
    groupDurationMinutesInput.value = '';
    renderGroups();
    saveData();
  } else {
    alert('Please provide name, start time and a valid duration.');
  }
});

function checkRenewal() {
  const now = Date.now();
  data.groups.forEach(group => {
    if (now >= group.next) {
      group.tasks.forEach(t => { t.done = false; });
      group.next = nextTime(group.start, group.duration);
    }
  });
  renderGroups();
  saveData();
}

loadData();
renderStandard();
renderGroups();
setInterval(checkRenewal, 60000); // check every minute
