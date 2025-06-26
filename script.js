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
const clearDataBtn = document.getElementById('clear-data-btn'); // New: Clear Data Button

let data = { standard: [], groups: [] };

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function patchTasks(tasks) {
  tasks.forEach(task => {
    if (!task.id) {
      task.id = generateId();
    }
    if (!task.subtasks) {
      task.subtasks = [];
    }
    if (task.subtasks.length > 0 && task.isExpanded === undefined) {
      // Default to expanded for older data
      task.isExpanded = true;
    }
    if (task.subtasks.length > 0) {
      patchTasks(task.subtasks);
    }
  });
}

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
    // Patch for tasks without id/subtasks for backwards compatibility
    patchTasks(data.standard);
    data.groups.forEach(g => patchTasks(g.tasks));
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

function findTaskWithContext(taskId, tasks, parent = null) {
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    if (task.id === taskId) {
      return { task, parent, list: tasks, index: i };
    }
    if (task.subtasks && task.subtasks.length > 0) {
      const found = findTaskWithContext(taskId, task.subtasks, task);
      if (found) return found;
    }
  }
  return null;
}

function findTaskById(taskId) {
  let result = findTaskWithContext(taskId, data.standard);
  if (result) return result;
  for (const group of data.groups) {
    result = findTaskWithContext(taskId, group.tasks);
    if (result) return result;
  }
  return null;
}

function propagateStateDown(task, isDone) {
  task.done = isDone;
  task.subtasks.forEach(sub => propagateStateDown(sub, isDone));
}

function propagateStateUp(childId) {
  let context = findTaskById(childId);
  let parent = context ? context.parent : null;

  while (parent) {
    if (parent.subtasks && parent.subtasks.length > 0) {
      const allChildrenDone = parent.subtasks.every(s => s.done);
      if (parent.done === allChildrenDone) {
        break;
      }
      parent.done = allChildrenDone;
    } else {
      break;
    }
    const parentContext = findTaskById(parent.id);
    parent = parentContext ? parentContext.parent : null;
  }
}

let draggedTaskId = null;

function handleDragStart(e) {
  draggedTaskId = this.dataset.taskId;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', draggedTaskId);
  setTimeout(() => {
    this.classList.add('dragging');
  }, 0);
}

function handleDragEnd() {
  this.classList.remove('dragging');
  document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
  draggedTaskId = null;
}

function handleDragOver(e) {
  e.preventDefault();
  const targetLi = e.target.closest('li');
  if (targetLi && targetLi.dataset.taskId !== draggedTaskId) {
    e.dataTransfer.dropEffect = 'move';
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    targetLi.classList.add('drag-over');
  }
}

function handleDragLeave(e) {
  const targetLi = e.target.closest('li');
  if (targetLi) {
    targetLi.classList.remove('drag-over');
  }
}

function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();

  const targetLi = e.target.closest('li');
  if (!targetLi) return;

  targetLi.classList.remove('drag-over');
  const targetTaskId = targetLi.dataset.taskId;
  const sourceTaskId = e.dataTransfer.getData('text/plain');

  if (!sourceTaskId || sourceTaskId === targetTaskId) return;

  const sourceContext = findTaskById(sourceTaskId);
  const targetContext = findTaskById(targetTaskId);

  if (sourceContext && targetContext && sourceContext.list === targetContext.list) {
    const [removed] = sourceContext.list.splice(sourceContext.index, 1);
    const newTargetIndex = targetContext.list.indexOf(targetContext.task);
    targetContext.list.splice(newTargetIndex, 0, removed);
    saveData();
    renderAll();
  }
}

function makeTaskEditable(span, task) {
  const li = span.parentElement;
  if (!li || li.querySelector('.edit-task-input')) return;

  const input = document.createElement('input');
  input.type = 'text';
  input.value = task.text;
  input.className = 'edit-task-input';

  const finishEditing = () => {
    const newText = input.value.trim();
    if (newText) {
      task.text = newText;
      saveData();
    }
    renderAll();
  };

  input.addEventListener('blur', finishEditing);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      input.blur();
    } else if (e.key === 'Escape') {
      renderAll();
    }
  });

  li.replaceChild(input, span);
  input.focus();
  input.select();
}

function renderAll() {
  renderStandard();
  renderGroups();
}

function renderTaskTree(tasks, container, onTaskChange, onTaskDelete) {
  tasks.forEach(task => {
    const li = document.createElement('li');
    li.dataset.taskId = task.id;
    li.setAttribute('draggable', true);

    li.addEventListener('dragstart', handleDragStart);
    li.addEventListener('dragover', handleDragOver);
    li.addEventListener('dragleave', handleDragLeave);
    li.addEventListener('drop', handleDrop);
    li.addEventListener('dragend', handleDragEnd);

    if (task.subtasks && task.subtasks.length > 0) {
      const toggle = document.createElement('span');
      toggle.className = 'toggle';
      toggle.textContent = task.isExpanded ? '▾' : '▸';
      toggle.addEventListener('click', () => {
        task.isExpanded = !task.isExpanded;
        saveData();
        renderAll();
      });
      li.appendChild(toggle);
    } else {
      // Add a placeholder for alignment with parent tasks
      const placeholder = document.createElement('span');
      placeholder.className = 'toggle-placeholder';
      li.appendChild(placeholder);
    }

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = task.done;
    cb.addEventListener('change', () => {
      propagateStateDown(task, cb.checked);
      propagateStateUp(task.id);
      onTaskChange();
    });

    const span = document.createElement('span');
    span.textContent = task.text;
    span.className = 'task-text';
    span.addEventListener('click', () => {
      window.location.href = `subtask.html?taskId=${task.id}`;
    });
    span.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      makeTaskEditable(span, task);
    });

    li.appendChild(cb);
    li.appendChild(span);

    if (onTaskDelete) {
      const delBtn = document.createElement('button');
      delBtn.textContent = 'x';
      delBtn.addEventListener('click', () => onTaskDelete(task.id));
      li.appendChild(delBtn);
    }

    container.appendChild(li);

    if (task.isExpanded && task.subtasks && task.subtasks.length > 0) {
      const sublist = document.createElement('ul');
      sublist.style.paddingLeft = '25px';
      li.appendChild(sublist);
      renderTaskTree(task.subtasks, sublist, onTaskChange, null);
    }
  });
}

function renderStandard() {
  standardList.innerHTML = '';
  const onTaskChange = () => {
    saveData();
    renderAll();
  };
  const onTaskDelete = (taskId) => {
    const context = findTaskById(taskId);
    if (context) {
      context.list.splice(context.index, 1);
      saveData();
      renderAll();
    }
  };
  renderTaskTree(data.standard, standardList, onTaskChange, onTaskDelete);
}

function allTasksDone(tasks) {
  return tasks.every(t => t.done && allTasksDone(t.subtasks));
}

function updateGroupState(group, box) {
  const allDone = group.tasks.length > 0 && allTasksDone(group.tasks);
  if (allDone) {
    box.classList.add('done');
  } else {
    box.classList.remove('done');
  }
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

    const headerRight = document.createElement('div');
    headerRight.style.display = 'flex';
    headerRight.style.alignItems = 'center';

    const period = document.createElement('span');
    period.textContent = formatDuration(group.duration);
    period.style.marginRight = '10px';

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Delete Group';
    deleteBtn.addEventListener('click', () => {
      if (confirm(`Are you sure you want to delete the group "${group.name}"?`)) {
        data.groups.splice(gidx, 1);
        saveData();
        renderAll();
      }
    });

    headerRight.appendChild(period);
    headerRight.appendChild(deleteBtn);

    header.appendChild(title);
    header.appendChild(headerRight);
    box.appendChild(header);

    const list = document.createElement('ul');
    const onTaskChange = () => {
      updateGroupState(group, box);
      saveData();
      renderAll();
    };
    const onTaskDelete = (taskId) => {
      const context = findTaskById(taskId);
      if (context) {
        context.list.splice(context.index, 1);
        saveData();
        renderAll();
      }
    };
    renderTaskTree(group.tasks, list, onTaskChange, onTaskDelete);

    const addInput = document.createElement('input');
    addInput.type = 'text';
    addInput.placeholder = 'New task';
    const addBtn = document.createElement('button');
    addBtn.textContent = 'Add';
    addBtn.addEventListener('click', () => {
      if (addInput.value.trim()) {
        group.tasks.push({ id: generateId(), text: addInput.value.trim(), done: false, subtasks: [] });
        addInput.value = '';
        saveData();
        renderAll();
      }
    });
    box.appendChild(list);
    box.appendChild(addInput);
    box.appendChild(addBtn);

    updateGroupState(group, box);
    groupsDiv.appendChild(box);
  });
}

addTaskBtn.addEventListener('click', () => {
  if (newTaskText.value.trim()) {
    data.standard.push({ id: generateId(), text: newTaskText.value.trim(), done: false, subtasks: [] });
    newTaskText.value = '';
    saveData();
    renderAll();
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
    saveData();
    renderAll();
  } else {
    alert('Please provide name, start time and a valid duration.');
  }
});

function checkRenewal() {
  const now = Date.now();
  data.groups.forEach(group => {
    if (now >= group.next) {
      group.tasks.forEach(t => { propagateStateDown(t, false); });
      group.next = nextTime(group.start, group.duration);
    }
  });
  saveData();
  renderAll();
}

// New: Clear All Data Functionality
clearDataBtn.addEventListener('click', () => {
  if (confirm('Are you sure you want to clear ALL your To-Do data? This action cannot be undone.')) {
    localStorage.removeItem('todo-data');
    // If you were using cookies, you would clear them here as well.
    // Example: document.cookie.split(";").forEach(function(c) { document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/"); });
    data = { standard: [], groups: [] }; // Reset in-memory data
    renderAll(); // Re-render with empty data
    alert('All data has been cleared.');
  }
});

loadData();
renderAll();
setInterval(checkRenewal, 60000); // check every minute
