/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

import '/extlib/l10n.js';
import * as Dialog from '/extlib/dialog.js';

import {
  configs,
  log
} from '/common/common.js';
import { Message } from '/common/Message.js';
import * as Redmine from '/common/redmine.js';

Dialog.setLogger(log);

let mParams;
let mMessage;
let mRedmineParams;

const mDescriptionField  = document.querySelector('#description');
const mParentIssueField  = document.querySelector('#parentIssue');
const mStartDateEnabled  = document.querySelector('#startDateEnabled');
const mStartDateField    = document.querySelector('#startDate');
const mDueDateEnabled    = document.querySelector('#dueDateEnabled');
const mDueDateField      = document.querySelector('#dueDate');
const mPrivateField      = document.querySelector('#private');
const mAcceptButton      = document.querySelector('#accept');
const mCancelButton      = document.querySelector('#cancel');

function onConfigChange(key) {
  const value = configs[key];
  switch (key) {
    case 'debug':
      document.documentElement.classList.toggle('debug', value);
      break;
  }
}
configs.$addObserver(onConfigChange);

configs.$loaded.then(async () => {
  mParams = await Dialog.getParams();

  onConfigChange('debug');

  mMessage = new Message(mParams.message);
  mRedmineParams = await mMessage.toRedmineParams();
  log('mMessage: ', mMessage);
  log('mRedmineParams ', mRedmineParams);

  await Promise.all([
    initProjects(),
    initTrackers(mRedmineParams.project_id),
    initStatuses(),
    initVersions(mRedmineParams.project_id),
    initAssignees(mRedmineParams.project_id)
  ]);

  for (const field of document.querySelectorAll('[data-field]')) {
    if (field.dataset.field in mRedmineParams)
      field.value = mRedmineParams[field.dataset.field];
  }

  Dialog.initButton(mAcceptButton, async _event => {
  });
  Dialog.initCancelButton(mCancelButton);

  window.addEventListener('resize', _event => {
    configs.createIssueDialogWidth = window.outerWidth;
    configs.createIssueDialogHeight = window.outerHeight;
  });
  window.addEventListener(Dialog.TYPE_MOVED, event => {
    configs.createIssueDialogLeft = event.detail.left;
    configs.createIssueDialogTop = event.detail.top;
  });

  Dialog.notifyReady();
});

function initSelect(field, items, itemTranslator) {
  const range = document.createRange();
  range.selectNodeContents(field);
  range.deleteContents();
  range.detach();

  const fragment = document.createDocumentFragment();
  for (const item of items) {
    const translated = itemTranslator(item);
    if (!translated)
      continue;
    const option = fragment.appendChild(document.createElement('option'));
    option.textContent = translated.label;
    option.value = translated.value;
  }
  field.appendChild(fragment);
}


async function initProjects() {
  const projects = await Redmine.getProjects();
  initSelect(
    document.querySelector('#project'),
    projects,
    project => ({ label: project.fullname, value: project.id })
  );
}

async function initTrackers(projectId) {
  const trackers = await Redmine.getTrackers(projectId);
  initSelect(
    document.querySelector('#tracker'),
    trackers,
    tracker => ({ label: tracker.name, value: tracker.id })
  );
}

async function initStatuses() {
  const statuses = await Redmine.getIssueStatuses();
  initSelect(
    document.querySelector('#status'),
    statuses,
    status => ({ label: status.name, value: status.id })
  );
}

async function initVersions(projectId) {
  const versions = await Redmine.getVersions(projectId);
  initSelect(
    document.querySelector('#version'),
    versions,
    version => ({ label: version.name, value: version.id })
  );
}

async function initAssignees(projectId) {
  const members = await Redmine.getMembers(projectId);
  initSelect(
    document.querySelector('#assigned'),
    members,
    member => {
      if (!member.user)
        return null;
      return { label: member.user.name, value: member.user.id };
    }
  );
}
