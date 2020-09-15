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
  log,
  appendContents,
  sanitizeForHTMLText
} from '/common/common.js';
import { Message } from '/common/Message.js';
import * as Redmine from '/common/redmine.js';
import { ChooseIssue } from '/common/ChooseIssue.js';
import { RelationsField } from '/common/RelationsField.js';

Dialog.setLogger(log);

let mParams;
let mMessage;
let mRedmineParams;
let mIssueChooser;
let mRelationsField;

const mProjectField      = document.querySelector('#project');
const mParentIssueField  = document.querySelector('#parentIssue');
const mParentIssueSubjectField = document.querySelector('#parentIssueSubject');
const mStartDateEnabled  = document.querySelector('#startDateEnabled');
const mStartDateField    = document.querySelector('#startDate');
const mDueDateEnabled    = document.querySelector('#dueDateEnabled');
const mDueDateField      = document.querySelector('#dueDate');
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
  log('mParams: ', mParams);

  onConfigChange('debug');

  mMessage = new Message(mParams.message);
  mRedmineParams = await mMessage.toRedmineParams();
  log('mMessage: ', mMessage);
  log('mRedmineParams ', mRedmineParams);

  const [members, ] = await Promise.all([
    Redmine.getMembers(mRedmineParams.project_id),
    initProjects(),
    initTrackers(mRedmineParams.project_id),
    initStatuses(),
    initVersions(mRedmineParams.project_id)
  ]);
  await Promise.all([
    initAssignees(mRedmineParams.project_id, members),
    initWatchers(mRedmineParams.project_id, members)
  ]);

  applyFieldValues();

  for (const field of document.querySelectorAll('[data-field]')) {
    field.addEventListener('change', () => {
      onChangeFieldValue(field);
      if (field == mProjectField)
        reinitFieldsForProject();
    });
    if (field.matches('textarea, input[type="text"], input[type="number"]'))
      field.addEventListener('input', () => {
        onChangeFieldValue(field);
      });
  }

  mStartDateEnabled.checked = false;
  mStartDateEnabled.addEventListener('change', () => {
    mStartDateField.disabled = !mStartDateEnabled.checked;
  });
  mStartDateField.disabled = true;

  mDueDateEnabled.checked = false;
  mDueDateEnabled.addEventListener('change', () => {
    mDueDateField.disabled = !mDueDateEnabled.checked;
  });
  mDueDateField.disabled = true;

  mIssueChooser = new ChooseIssue({
    defaultId: 0,
    projectId: mProjectField.value
  });
  Dialog.initButton(document.querySelector('#parentIssueChoose'), async _event => {
    const issue = await mIssueChooser.show({
      defaultId: parseInt(mParentIssueField.value || 0),
      projectId: mProjectField.value
    });
    if (issue) {
      mParentIssueField.value = issue.id;
      mParentIssueSubjectField.value = issue.subject;
      onChangeFieldValue(mParentIssueField);
    }
  });

  mRelationsField = new RelationsField({
    container: document.querySelector('#relations'),
    projectId: () => mProjectField.value
  });

  Dialog.initButton(mAcceptButton, async _event => {
    mAcceptButton.disabled = mCancelButton.disabled = true;
    try {
      const issue = await createIssue();
      Dialog.accept(issue);
    }
    catch(error) {
      console.error(error);
    }
    finally {
      mAcceptButton.disabled = mCancelButton.disabled = false;
    }
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
  const oldValue = field.value;

  const range = document.createRange();
  range.selectNodeContents(field);
  range.deleteContents();
  range.detach();

  let hasOldValueOption = false;
  for (const item of items) {
    const translated = itemTranslator(item);
    if (!translated)
      continue;
    appendContents(field, `
      <option value=${JSON.stringify(sanitizeForHTMLText(translated.value))}
             >${sanitizeForHTMLText(translated.label)}</option>
    `);
    if (oldValue && translated.value == oldValue)
      hasOldValueOption = true;
  }

  if (oldValue && hasOldValueOption)
    field.value = oldValue;
  else
    field.value = '';
}

async function initProjects() {
  const projects = await Redmine.getProjects();
  initSelect(
    mProjectField,
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

async function initAssignees(projectId, cachedMembers) {
  const members = cachedMembers || await Redmine.getMembers(projectId);
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

async function initWatchers(projectId, cachedMembers) {
  const members = cachedMembers || await Redmine.getMembers(projectId);
  const container = document.querySelector('#watcherUsers');

  const range = document.createRange();
  range.selectNodeContents(container);
  range.deleteContents();
  range.detach();

  for (const member of members) {
    if (!member.user)
      continue;
    appendContents(container, `
      <label><input type="checkbox"
                    value=${JSON.stringify(sanitizeForHTMLText(member.user.id))}
                    data-field="watcher_user_ids[]"
                    data-value-type="integer"
                   >${sanitizeForHTMLText(member.user.name)}</label>
    `);
  }
}

async function reinitFieldsForProject() {
  const [members, ] = await Promise.all([
    Redmine.getMembers(mProjectField.value),
    initTrackers(mProjectField.value),
    initVersions(mProjectField.value)
  ]);
  await Promise.all([
    initAssignees(mProjectField.value, members),
    initWatchers(mProjectField.value, members)
  ]);
  applyFieldValues();
}

function applyFieldValues() {
  for (const field of document.querySelectorAll('[data-field]')) {
    if (!(field.dataset.field in mRedmineParams))
      continue;
    const name = field.dataset.field;
    const paramName = name.replace(/\[\]$/, '');
    const value = mRedmineParams[paramName];
    const values = name.endsWith('[]') ? (value || []) : null;
    if (field.matches('input[type="checkbox"]')) {
      if (values)
        field.checked = value.includes(field.value);
      else
        field.checked = !!value;
    }
    else {
      field.value = value;
    }
  }
}

function onChangeFieldValue(field) {
  if (field.$onChangeFieldValueTimer)
    clearTimeout(field.$onChangeFieldValueTimer);
  field.$onChangeFieldValueTimer = setTimeout(() => {
    delete field.$onChangeFieldValueTimer;
    const fieldValue = field.dataset.valueType == 'integer' ? parseInt(field.value || 0) : field.value;
    const name = field.dataset.field;
    const paramName = name.replace(/\[\]$/, '');
    const value = mRedmineParams[paramName];
    const values = name.endsWith('[]') ? (value || []) : null;
    if (field.matches('input[type="checkbox"]')) {
      if (values) {
        const valuesSet = new Set(value);
        if (field.checked)
          valuesSet.add(fieldValue);
        else
          valuesSet.remove(fieldValue);
        mRedmineParams[paramName] = Array.from(valuesSet);
      }
      else {
        mRedmineParams[paramName] = field.checked;
      }
    }
    else {
      mRedmineParams[paramName] = fieldValue;
    }
    log('field value changed: ', field, fieldValue, mRedmineParams);
  }, 150);
}

async function createIssue() {
  if (!mProjectField.value) {
    alert(browser.i18n.getMessage('dialog_createIssue_error_missingProjectId'));
    return;
  }

  const paramNames = new Set();
  for (const field of document.querySelectorAll('[data-field]')) {
    const name = field.dataset.field;
    paramNames.add(name.replace(/\[\]$/, ''));
  }
  const createParams = {};
  for (const paramName of paramNames) {
    createParams[paramName] = mRedmineParams[paramName];
  }
  createParams.start_date = mStartDateEnabled.checked ? mStartDateField.value : '';
  createParams.due_date = mDueDateEnabled.checked ? mDueDateField.value : '';

  const result = await Redmine.createIssue(createParams);
  const issue = result && result.issue;
  console.log('created issue: ', issue);
  if (issue && issue.id)
    await mRelationsField.save({ issueId: issue.id });

  return issue;
}
