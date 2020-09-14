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

Dialog.setLogger(log);

let mParams;
let mMessage;
let mRedmineParams;
let mIssueChooser;

const mProjectField      = document.querySelector('#project');
const mDescriptionField  = document.querySelector('#description');
const mParentIssueField  = document.querySelector('#parentIssue');
const mParentIssueSubjectField = document.querySelector('#parentIssueSubject');
const mStartDateEnabled  = document.querySelector('#startDateEnabled');
const mStartDateField    = document.querySelector('#startDate');
const mDueDateEnabled    = document.querySelector('#dueDateEnabled');
const mDueDateField      = document.querySelector('#dueDate');
const mRelationsField    = document.querySelector('#relations');
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

  Dialog.initButton(document.querySelector('#addRelation'), _event => {
    addRelationRow();
  });
  mRelationsField.addEventListener('change', event => {
    const select = event.target && event.target.closest('select');
    if (!select)
      return;
    const row = select.closest('li');
    const relationDelayFields = row.querySelector('.relation-delay-fields');
    const shouldShowDelayFields = select.value == 'precedes' || select.value == 'follows';
    relationDelayFields.style.display = shouldShowDelayFields ? '' : 'none';
  });
  Dialog.initButton(mRelationsField, async event => {
    const button = event.target && event.target.closest('button');
    if (!button)
      return;
    const row = button.closest('li');
    if (button.matches('.choose-related-issue')) {
      const issueIdField = row.querySelector('.related-issue-id');
      const issueSubjectField = row.querySelector('.related-issue-subject');
      const issue = await mIssueChooser.show({
        defaultId: parseInt(issueIdField.value || 0),
        projectId: mProjectField.value
      });
      if (issue) {
        issueIdField.value = issue.id;
        issueSubjectField.value = issue.subject;
      }
    }
    else if (button.matches('.remove-relation')) {
      mRelationsField.removeChild(row);
    }
  });

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

  if (oldValue)
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

function addRelationRow() {
  appendContents(mRelationsField, `
    <li class="flex-box row">
      <select class="relation-type" value="relates">
        <option value="relates">${sanitizeForHTMLText(browser.i18n.getMessage('dialog_createIssue_relations_type_relates'))}</option>
        <option value="duplicates">${sanitizeForHTMLText(browser.i18n.getMessage('dialog_createIssue_relations_type_duplicates'))}</option>
        <option value="duplicated">${sanitizeForHTMLText(browser.i18n.getMessage('dialog_createIssue_relations_type_duplicated'))}</option>
        <option value="blocks">${sanitizeForHTMLText(browser.i18n.getMessage('dialog_createIssue_relations_type_blocks'))}</option>
        <option value="blocked">${sanitizeForHTMLText(browser.i18n.getMessage('dialog_createIssue_relations_type_blocked'))}</option>
        <option value="precedes">${sanitizeForHTMLText(browser.i18n.getMessage('dialog_createIssue_relations_type_precedes'))}</option>
        <option value="follows">${sanitizeForHTMLText(browser.i18n.getMessage('dialog_createIssue_relations_type_follows'))}</option>
        <option value="copied_to">${sanitizeForHTMLText(browser.i18n.getMessage('dialog_createIssue_relations_type_copiedTo'))}</option>
        <option value="copied_from">${sanitizeForHTMLText(browser.i18n.getMessage('dialog_createIssue_relations_type_copiedFrom'))}</option>
      </select>
      <input class="related-issue-id" type="number" data-value-type="integer">
      <span class="flex-box row">
        <input class="related-issue-subject" type="text" disabled="true">
        <label class="relation-delay-fields"
               style="display:none"
              >${sanitizeForHTMLText(browser.i18n.getMessage('dialog_createIssue_relation_delay_label_before'))}
               <input class="relation-delay" type="number" data-value-type="integer" value="0" size="3">
               ${sanitizeForHTMLText(browser.i18n.getMessage('dialog_createIssue_relation_delay_label_after'))}</label>
      </span>
      <button class="choose-related-issue">${sanitizeForHTMLText(browser.i18n.getMessage('dialog_createIssue_relation_chooseIssue'))}</button>
      <button class="remove-relation">${sanitizeForHTMLText(browser.i18n.getMessage('dialog_createIssue_relation_remove'))}</button>
    </li>
  `);
}
