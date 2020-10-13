/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

import {
  configs,
  appendContents,
  sanitizeForHTMLText,
  clone
} from '/common/common.js';
import * as Constants from '/common/constants.js';
import * as Dialog from '/extlib/dialog.js';
import { Redmine } from '/common/Redmine.js';

let mRedmine;
let mAccountId;
let mAccountInfo;

let mProjects;
let mStatuses;

let mVisibleProjects;
let mHiddenProjects;
let mVisibleStatuses;
let mMappedFolders;

const mDialog =  new Dialog.InPageDialog();
appendContents(mDialog.buttons, `
  <button class="choose-issue-accept">${sanitizeForHTMLText(browser.i18n.getMessage('dialog_createIssue_accept_label'))}</button>
  <button class="choose-issue-cancel">${sanitizeForHTMLText(browser.i18n.getMessage('dialog_createIssue_cancel_label'))}</button>
`);

Dialog.initButton(mDialog.buttons.firstChild, async _event => {
  save();
  mDialog.hide();
});
Dialog.initButton(mDialog.buttons.lastChild, async _event => {
  mDialog.hide();
});
appendContents(mDialog.contents, `
  <h1></h1>

  <section>
  <h2>${sanitizeForHTMLText(browser.i18n.getMessage('config_base_caption'))}</h2>
  <p><label class="flex-box row">${sanitizeForHTMLText(browser.i18n.getMessage('config_redmineURL_label'))}
            <input type="text" class="flex-box column redmineURL"></label></p>
  <p><label class="flex-box row">${sanitizeForHTMLText(browser.i18n.getMessage('config_redmineAPIKey_label'))}
            <input type="text" class="flex-box column redmineAPIKey"></label></p>
  <p><label class="flex-box row">${sanitizeForHTMLText(browser.i18n.getMessage('config_customFields_label'))}
            <input type="text" class="flex-box column customFields"></label></p>
  </section>

  <section>
  <h2>${sanitizeForHTMLText(browser.i18n.getMessage('config_visibility_caption'))}</h2>
  <p><label>${sanitizeForHTMLText(browser.i18n.getMessage('config_projectsVisibilityMode_label'))}
            <select class="projectsVisibilityMode">
              <option value="1">${sanitizeForHTMLText(browser.i18n.getMessage('config_projectsVisibilityMode_showByDefault'))}</option>
              <option value="2">${sanitizeForHTMLText(browser.i18n.getMessage('config_projectsVisibilityMode_hideByDefault'))}</option>
            </select></label></p>
  <div class="sub hiddenProjectsContainer">
    <p><label class="flex-box row">${sanitizeForHTMLText(browser.i18n.getMessage('config_hiddenProjects_label'))}
              <input type="text" class="flex-box column hiddenProjectsText"></label></p>
    <p class="checkboxes-for-array-config hiddenProjectsCheckboxes"></p>
  </div>
  <div class="sub hidden mVisibleProjectsContainer">
    <p><label class="flex-box row">${sanitizeForHTMLText(browser.i18n.getMessage('config_visibleProjects_label'))}
              <input type="text" class="flex-box column visibleProjectsText"></label></p>
    <p class="checkboxes-for-array-config visibleProjectsCheckboxes"></p>
  </div>
  <p><label>${sanitizeForHTMLText(browser.i18n.getMessage('config_statusesVisibilityMode_label'))}
            <select class="statusesVisibilityMode">
              <option value="1">${sanitizeForHTMLText(browser.i18n.getMessage('config_statusesVisibilityMode_showByDefault'))}</option>
              <option value="2">${sanitizeForHTMLText(browser.i18n.getMessage('config_statusesVisibilityMode_hideByDefault'))}</option>
            </select></label></p>
  <div class="sub hidden mVisibleStatusesContainer">
    <p><label class="flex-box row">${sanitizeForHTMLText(browser.i18n.getMessage('config_visibleStatuses_label'))}
              <input type="text" class="flex-box column visibleStatusesText"></label></p>
    <p class="checkboxes-for-array-config visibleStatusesCheckboxes"></p>
  </div>
  <p><label>${sanitizeForHTMLText(browser.i18n.getMessage('config_visibleFields_label'))}</label></p>
  <div class="sub visibleFields">
    <p>
      <label><input type="checkbox" class="visible-field" data-field-name="project">
             ${sanitizeForHTMLText(browser.i18n.getMessage('dialog_createIssue_project_label'))}</label>
      <label><input type="checkbox" class="visible-field" data-field-name="tracker">
             ${sanitizeForHTMLText(browser.i18n.getMessage('dialog_createIssue_tracker_label'))}</label>
      <label><input type="checkbox" class="visible-field" data-field-name="subject">
             ${sanitizeForHTMLText(browser.i18n.getMessage('dialog_createIssue_subject_label'))}</label>
      <label><input type="checkbox" class="visible-field" data-field-name="description">
             ${sanitizeForHTMLText(browser.i18n.getMessage('dialog_createIssue_description_label'))}</label>
      <label><input type="checkbox" class="visible-field" data-field-name="parentIssue">
             ${sanitizeForHTMLText(browser.i18n.getMessage('dialog_createIssue_parentIssue_label'))}</label>
      <label><input type="checkbox" class="visible-field" data-field-name="status">
             ${sanitizeForHTMLText(browser.i18n.getMessage('dialog_createIssue_status_label'))}</label>
      <label><input type="checkbox" class="visible-field" data-field-name="assigned">
             ${sanitizeForHTMLText(browser.i18n.getMessage('dialog_createIssue_assigned_label'))}</label>
      <label><input type="checkbox" class="visible-field" data-field-name="watcher">
             ${sanitizeForHTMLText(browser.i18n.getMessage('dialog_createIssue_watcher_label'))}</label>
      <label><input type="checkbox" class="visible-field" data-field-name="version">
             ${sanitizeForHTMLText(browser.i18n.getMessage('dialog_createIssue_version_label'))}</label>
      <label><input type="checkbox" class="visible-field" data-field-name="period">
             ${sanitizeForHTMLText(browser.i18n.getMessage('dialog_createIssue_period_label'))}</label>
      <label><input type="checkbox" class="visible-field" data-field-name="file">
             ${sanitizeForHTMLText(browser.i18n.getMessage('dialog_createIssue_file_label'))}</label>
      <label><input type="checkbox" class="visible-field" data-field-name="relations">
             ${sanitizeForHTMLText(browser.i18n.getMessage('dialog_createIssue_relations_label'))}</label>
      <label><input type="checkbox" class="visible-field" data-field-name="other">
             ${sanitizeForHTMLText(browser.i18n.getMessage('dialog_createIssue_other_label'))}</label>
    </p>
    <p>
      <label><input type="checkbox" class="visible-field" data-field-name="issue">
             ${sanitizeForHTMLText(browser.i18n.getMessage('dialog_updateIssue_issue_label'))}</label>
      <label><input type="checkbox" class="visible-field" data-field-name="notes">
             ${sanitizeForHTMLText(browser.i18n.getMessage('dialog_updateIssue_notes_label'))}</label>
    </p>
  </div>
  </section>

  <section>
  <h2>${sanitizeForHTMLText(browser.i18n.getMessage('config_defaultValue_caption'))}</h2>
  <p><label>${sanitizeForHTMLText(browser.i18n.getMessage('config_defaultTracker_label'))}
            <select class="defaultTracker"></select></label></p>
  <p><label>${sanitizeForHTMLText(browser.i18n.getMessage('config_defaultDueDate_label'))}
            <input class="defaultDueDate" type="number"></label></p>
  <p><label class="flex-box row">${sanitizeForHTMLText(browser.i18n.getMessage('config_defaultTitleCleanupPattern_label'))}
            <input type="text" class="flex-box column defaultTitleCleanupPattern"></label></p>
  <!--
  <p><label><input class="defaultUploadAttachments" type="checkbox"/>
            ${sanitizeForHTMLText(browser.i18n.getMessage('config_defaultUploadAttachments_label'))}</label></p>
  -->
  </section>

  <section>
  <h2>${sanitizeForHTMLText(browser.i18n.getMessage('config_mappedFolders_caption'))}</h2>
  <p><label>${sanitizeForHTMLText(browser.i18n.getMessage('config_mappedFolders_default_label'))}
            <select class="defaultProject"><option value="">${sanitizeForHTMLText(browser.i18n.getMessage('config_mappedFolders_unmapped_label'))}</option></select></label></p>
  <p><label class="flex-box row">${sanitizeForHTMLText(browser.i18n.getMessage('config_visibleFolderPattern_label'))}
            <input type="text" class="flex-box column visibleFolderPattern"></label></p>
  <table>
    <thead>
      <tr>
        <th>${sanitizeForHTMLText(browser.i18n.getMessage('config_mappedFolders_folders_column'))}</th>
        <th>${sanitizeForHTMLText(browser.i18n.getMessage('config_mappedFolders_projects_column'))}</th>
      </tr>
    </thead>
    <tbody class="mappedFoldersRows"></tbody>
  </table>
  </section>

  <section>
  <h2>${sanitizeForHTMLText(browser.i18n.getMessage('config_template_caption'))}</h2>
  <fieldset>
    <legend>${sanitizeForHTMLText(browser.i18n.getMessage('config_descriptionTemplate_label'))}</legend>
    <textarea class="descriptionTemplate"></textarea>
  </fieldset>
  <fieldset>
    <legend>${sanitizeForHTMLText(browser.i18n.getMessage('config_notesTemplate_label'))}</legend>
    <textarea class="notesTemplate"></textarea>
  </fieldset>
  <p class="placeholders-description">${sanitizeForHTMLText(browser.i18n.getMessage('config_placeholders_description'))}</p>
  </section>
`);


// base settings

function onRedmineChanged() {
  if (onRedmineChanged.timer)
    clearTimeout(onRedmineChanged.timer);
  onRedmineChanged.timer = setTimeout(async () => {
    delete onRedmineChanged.timer;
    if (!mDialog.contents.querySelector('.redmineURL').value.trim() ||
        !mDialog.contents.querySelector('.redmineAPIKey').value.trim())
      return;
    const [projects, statuses] = await Promise.all([
      mRedmine.getProjects({ all: true }).catch(_error => []),
      mRedmine.getIssueStatuses({ all: true }).catch(_error => [])
    ])
    mProjects = projects;
    mStatuses = statuses;
    initProjectVisibilityCheckboxes(mProjects);
    initStatusVisibilityCheckboxes(mStatuses);
    initTrackers();
    initFolderMappings(mProjects);
  }, 250);
}

for (const field of mDialog.contents.querySelectorAll('#redmineURL, #redmineAPIKey')) {
  field.addEventListener('change', () => onRedmineChanged());
}


// project visibility

const mProjectsVisibilityModeSelector = mDialog.contents.querySelector('.projectsVisibilityMode');
const mHiddenProjectsContaier = mDialog.contents.querySelector('.hiddenProjectsContainer');
const mVisibleProjectsContainer = mDialog.contents.querySelector('.mVisibleProjectsContainer');
function onProjectVisibilityModeChanged() {
  const showByDefault = mProjectsVisibilityModeSelector.value != Constants.PROJECTS_VISIBILITY_HIDE_BY_DEFAULT;
  mHiddenProjectsContaier.classList.toggle('hidden', !showByDefault);
  mVisibleProjectsContainer.classList.toggle('hidden', showByDefault);
}
mProjectsVisibilityModeSelector.addEventListener('change', onProjectVisibilityModeChanged);

const mHiddenProjectsTextField = mDialog.contents.querySelector('.hiddenProjectsText');
mHiddenProjectsContaier.addEventListener('change', event => {
  if (!event.target.matches('input[type="checkbox"]'))
    return;
  mHiddenProjects = Array.from(
    mHiddenProjectsContaier.querySelectorAll('input[type="checkbox"]:checked'),
    checkbox => parseInt(checkbox.value)
  );
  mHiddenProjectsTextField.value = mHiddenProjects.join(',');
});
mHiddenProjectsTextField.addEventListener('input', _event => {
  mHiddenProjects = mHiddenProjectsTextField.value.split(',').map(value => parseInt(value)).filter(value => value && !isNaN(value));
  initProjectVisibilityCheckboxes(mProjects);
});

const mVisibleProjectsTextField = mDialog.contents.querySelector('.visibleProjectsText');
mVisibleProjectsContainer.addEventListener('change', event => {
  if (!event.target.matches('input[type="checkbox"]'))
    return;
  mVisibleProjects = Array.from(
    mVisibleProjectsContainer.querySelectorAll('input[type="checkbox"]:checked'),
    checkbox => parseInt(checkbox.value)
  );
  mVisibleProjectsTextField.value = mVisibleProjects.join(',');
});
mVisibleProjectsTextField.addEventListener('input', _event => {
  mVisibleProjects = mVisibleProjectsTextField.value.split(',').map(value => parseInt(value)).filter(value => value && !isNaN(value));
  initProjectVisibilityCheckboxes(mProjects);
});


// status visibility

const mStatusesVisibilityModeSelector = mDialog.contents.querySelector('.statusesVisibilityMode');
const mVisibleStatusesContainer = mDialog.contents.querySelector('.mVisibleStatusesContainer');
function onStatustVisibilityModeChanged() {
  const showByDefault = mStatusesVisibilityModeSelector.value != Constants.STATUSES_VISIBILITY_HIDE_BY_DEFAULT;
  mVisibleStatusesContainer.classList.toggle('hidden', showByDefault);
}
mStatusesVisibilityModeSelector.addEventListener('change', onStatustVisibilityModeChanged);

const mVisibleStatusesTextField = mDialog.contents.querySelector('.visibleStatusesText');
mVisibleStatusesContainer.addEventListener('change', event => {
  if (!event.target.matches('input[type="checkbox"]'))
    return;
  mVisibleStatuses = Array.from(
    mVisibleStatusesContainer.querySelectorAll('input[type="checkbox"]:checked'),
    checkbox => parseInt(checkbox.value)
  );
  mVisibleStatusesTextField.value = mVisibleStatuses.join(',');
});
mVisibleStatusesTextField.addEventListener('input', _event => {
  mVisibleStatuses = mVisibleStatusesTextField.value.split(',').map(value => parseInt(value)).filter(value => value && !isNaN(value));
  initStatusVisibilityCheckboxes(mStatuses);
});


// folder mapping

const mMappingRows = mDialog.contents.querySelector('.mappedFoldersRows');
mMappingRows.addEventListener('change', _event => {
  const mapping = {};
  for (const row of mMappingRows.querySelectorAll('tr')) {
    mapping[row.dataset.folderPath] = row.querySelector('select').value;
  }
  mMappedFolders = mapping;
});
const mVisibleFolderPatternField = mDialog.contents.querySelector('.visibleFolderPattern');
mVisibleFolderPatternField.addEventListener('input', () => {
  if (mVisibleFolderPatternField.timer)
    clearTimeout(mVisibleFolderPatternField.timer);
  mVisibleFolderPatternField.timer = setTimeout(async () => {
    delete mVisibleFolderPatternField.timer;
    initFolderMappings();
  }, 250);
});



export async function show(accountId) {
  mAccountId = accountId;
  mRedmine = new Redmine({ accountId: mAccountId });
  mAccountInfo = clone(mRedmine.accountInfo);

  const [projects, statuses, accounts] = await Promise.all([
    mRedmine.getProjects({ all: true }).catch(_error => []),
    mRedmine.getIssueStatuses({ all: true }).catch(_error => []),
    browser.accounts.list()
  ]);
  mProjects = projects;
  mStatuses = statuses;

  const account = accounts.find(account => account.id == mAccountId) || {};
  mDialog.contents.querySelector('h1').textContent = browser.i18n.getMessage('config_accountConfig_title', [account.name || '']);

  // base configs
  mDialog.contents.querySelector('.redmineURL').value = mAccountInfo.url || '';
  mDialog.contents.querySelector('.redmineAPIKey').value = mAccountInfo.key || '';

  // projects visibility
  mVisibleProjects = (configs.accountVisibleProjects[mAccountId] || []).map(project => String(project));
  mVisibleProjectsTextField.value = mVisibleProjects.join(',');
  mHiddenProjects = (configs.accountHiddenProjects[mAccountId] || []).map(project => String(project));
  mHiddenProjectsTextField.value = mHiddenProjects.join(',');
  mProjectsVisibilityModeSelector.value = mAccountInfo.projectsVisibilityMode || configs.projectsVisibilityMode;

  // status visibility
  mVisibleStatuses = (configs.accountVisibleStatuses[mAccountId] || []).map(status => String(status));
  mVisibleStatusesTextField.value = mVisibleStatuses.join(',');
  mStatusesVisibilityModeSelector.value = mAccountInfo.statusesVisibilityMode || configs.statusesVisibilityMode;

  // fields visibility
  const visibleFields = configs.accountVisibleFields[accountId] || {};
  for (const checkbox of mDialog.contents.querySelectorAll('input[type="checkbox"].visible-field')) {
    const name = checkbox.dataset.fieldName;
    checkbox.checked = !!(name in visibleFields ? visibleFields[name] : configs[`fieldVisibility_${name}`]);
  }

  mDialog.contents.querySelector('.defaultDueDate').value = 'defaultDueDate' in mAccountInfo ? mAccountInfo.defaultDueDate : configs.defaultDueDate;

  mVisibleFolderPatternField.value = 'visibleFolderPattern' in mAccountInfo ? mAccountInfo.visibleFolderPattern : configs.visibleFolderPattern;
  mDialog.contents.querySelector('.defaultTitleCleanupPattern').value = 'defaultTitleCleanupPattern' in mAccountInfo ? mAccountInfo.defaultTitleCleanupPattern : configs.defaultTitleCleanupPattern;
  mDialog.contents.querySelector('.customFields').value = mAccountInfo.customFields || '';

  mMappedFolders = clone(configs.accountMappedFolders[accountId] || {});

  mDialog.contents.querySelector('.descriptionTemplate').value = 'descriptionTemplate' in mAccountInfo ? mAccountInfo.descriptionTemplate : configs.descriptionTemplate;
  mDialog.contents.querySelector('.notesTemplate').value = 'notesTemplate' in mAccountInfo ? mAccountInfo.notesTemplate : configs.notesTemplate;

  await Promise.all([
    initProjectVisibilityCheckboxes(mProjects),
    initStatusVisibilityCheckboxes(mStatuses),
    initTrackers(),
    initFolderMappings(mProjects)
  ]);

  onProjectVisibilityModeChanged();
  onStatustVisibilityModeChanged();
  mDialog.contents.querySelector('.defaultTracker').value = mAccountInfo.defaultTracker || '';
  mDialog.contents.querySelector('.defaultProject').value = mAccountInfo.defaultProject || '';

  mDialog.show();
}

function save() {
  mAccountInfo.url = mDialog.contents.querySelector('.redmineURL').value;
  mAccountInfo.key = mDialog.contents.querySelector('.redmineAPIKey').value;
  mAccountInfo.projectsVisibilityMode = parseInt(mProjectsVisibilityModeSelector.value);
  mAccountInfo.statusesVisibilityMode = parseInt(mStatusesVisibilityModeSelector.value);
  mAccountInfo.defaultProject = parseInt(mDialog.contents.querySelector('.defaultProject').value || 0);
  mAccountInfo.defaultTracker = parseInt(mDialog.contents.querySelector('.defaultTracker').value || 0);
  mAccountInfo.defaultDueDate = parseInt(mDialog.contents.querySelector('.defaultDueDate').value || configs.defaultDueDate);
  mAccountInfo.visibleFolderPattern = mVisibleFolderPatternField.value;
  mAccountInfo.defaultTitleCleanupPattern = mDialog.contents.querySelector('.defaultTitleCleanupPattern').value;
  mAccountInfo.customFields = mDialog.contents.querySelector('.customFields').value;
  mAccountInfo.descriptionTemplate = mDialog.contents.querySelector('.descriptionTemplate').value;
  mAccountInfo.notesTemplate = mDialog.contents.querySelector('.notesTemplate').value;
  saveAccountConfig('accounts', mAccountInfo);

  saveAccountConfig('accountVisibleProjects', mVisibleProjects);
  saveAccountConfig('accountHiddenProjects', mHiddenProjects);
  saveAccountConfig('accountVisibleStatuses', mVisibleStatuses);

  const visibleFields = {};
  for (const checkbox of mDialog.contents.querySelectorAll('input[type="checkbox"].visible-field')) {
    visibleFields[checkbox.dataset.fieldName] = checkbox.checked;
  }
  saveAccountConfig('accountVisibleFields', visibleFields);

  saveAccountConfig('accountMappedFolders', mMappedFolders);
}

function saveAccountConfig(key, value) {
  const values = clone(configs[key]);
  values[mRedmine.accountId] = value;
  configs[key] = values;
}


function initCheckboxes(container, items, itemTranslator) {
  const range = document.createRange();
  range.selectNodeContents(container);
  range.deleteContents();
  range.detach();

  for (const item of items) {
    const translated = itemTranslator ? itemTranslator(item) : item;
    if (!translated)
      continue;
    appendContents(container, `
      <label><input type="checkbox"
                    value=${JSON.stringify(sanitizeForHTMLText(translated.value))}
                    ${translated.checked ? 'checked' : ''}>
             ${sanitizeForHTMLText(translated.label)}</label>
    `);
  }
}

function initSelect(field, items, itemTranslator) {
  const oldValue = field.value;

  const range = document.createRange();
  range.selectNodeContents(field);
  range.deleteContents();
  range.detach();

  let hasOldValueOption = false;
  for (const item of items) {
    const translated = itemTranslator ? itemTranslator(item) : item;
    if (!translated)
      continue;
    appendContents(field, generateOptionSource(translated));
    if (oldValue && translated.value == oldValue)
      hasOldValueOption = true;
  }

  if (oldValue && hasOldValueOption)
    field.value = oldValue;
  else
    field.value = '';
}
function generateOptionSource(item) {
  return `
    <option value=${JSON.stringify(sanitizeForHTMLText(item.value))}
           >${sanitizeForHTMLText(item.label)}</option>
  `.trim();
}

async function initProjectVisibilityCheckboxes(projects) {
  if (!projects)
    projects = await mRedmine.getProjects({ all: true }).catch(_error => []);
  const visibleProjects = new Set(mVisibleProjects);
  const hiddenProjects = new Set(mHiddenProjects);
  initCheckboxes(
    mDialog.contents.querySelector('.visibleProjectsCheckboxes'),
    projects,
    project => ({
      value: project.id,
      label: project.fullname,
      checked: visibleProjects.has(String(project.id)) || visibleProjects.has(project.identifier)
    })
  );
  initCheckboxes(
    mDialog.contents.querySelector('.hiddenProjectsCheckboxes'),
    projects,
    project => ({
      value: project.id,
      label: project.fullname,
      checked: hiddenProjects.has(String(project.id)) || hiddenProjects.has(project.identifier)
    })
  );
}

async function initStatusVisibilityCheckboxes(statuses) {
  if (!statuses)
    statuses = await mRedmine.getIssueStatuses({ all: true }).catch(_error => []);
  const visibleStatuses = new Set(mVisibleStatuses);
  initCheckboxes(
    mDialog.contents.querySelector('.visibleStatusesCheckboxes'),
    statuses,
    status => ({
      value: status.id,
      label: status.name,
      checked: visibleStatuses.has(String(status.id)) || visibleStatuses.has(status.name)
    })
  );
}

async function initTrackers() {
  const trackers = await mRedmine.getTrackers().catch(_error => []);
  initSelect(
    mDialog.contents.querySelector('.defaultTracker'),
    [{ name: browser.i18n.getMessage('config_defaultTracker_blank_label'), value: '' }, ...trackers],
    tracker => ({ label: tracker.name, value: tracker.id })
  );
}

async function initFolderMappings(projects) {
  const startTime = Date.now();
  initFolderMappings.startedAt = startTime;
  const rowsContainer = mDialog.contents.querySelector('.mappedFoldersRows');
  const range = document.createRange();
  range.selectNodeContents(rowsContainer);
  range.deleteContents();
  range.detach();

  const unmappableFolderPathMatcher = /^\/(Archives|Drafts|Sent|Templates|Trash)($|\/)/;
  let folderFilter = null;
  try {
    const visibleFolderPattern = mVisibleFolderPatternField.value || configs.visibleFolderPattern;
    folderFilter = visibleFolderPattern ? new RegExp(visibleFolderPattern, 'i') : null;
  }
  catch(_error) {
  }

  if (!projects)
    projects = await mRedmine.getProjects({ all: true }).catch(_error => []);
  if (initFolderMappings.startedAt != startTime)
    return;
  const allProjects = new Set(projects.map(project => String(project.id)));

  const defaultChooser = mDialog.contents.querySelector('.defaultProject');
  initSelect(
    defaultChooser,
    projects,
    project => ({ label: project.fullname, value: project.id })
  );
  defaultChooser.value = 'defaultProject' in mAccountInfo ? mAccountInfo.defaultProject : configs.defaultProject;

  const projectOptionsSource = [
    generateOptionSource({ label: browser.i18n.getMessage('config_mappedFolders_fallbackToDefault_label'), value: '' }),
    projects.map(project => generateOptionSource({ label: project.fullname, value: project.id }))
  ].join('');

  const addRow = (folder, parent) => {
    if (unmappableFolderPathMatcher.test(folder.path))
      return;
    const readablePath = parent ? `${parent}/${folder.name}` : folder.name;
    if (!folderFilter || folderFilter.test(folder.name)) {
      const chooserId = `folder-mapping-${encodeURIComponent(folder.path)}`;
      appendContents(rowsContainer, `
        <tr data-folder-path=${JSON.stringify(sanitizeForHTMLText(folder.path))}>
          <td><label for=${JSON.stringify(sanitizeForHTMLText(chooserId))}
                    >${sanitizeForHTMLText(readablePath)}</label></td>
          <td><select id=${JSON.stringify(sanitizeForHTMLText(chooserId))}
                     >${projectOptionsSource}</select></td>
        </tr>
      `);
      const projectChooser = rowsContainer.lastChild.querySelector('select');
      if (folder.path in mMappedFolders &&
          allProjects.has(mMappedFolders[folder.path]))
        projectChooser.value = mMappedFolders[folder.path];
      else
        projectChooser.value = '';
    }

    for (const subFolder of folder.subFolders) {
      addRow(subFolder, readablePath);
    }
  };

  const accounts = await browser.accounts.list();
  const account = accounts.find(account => account.id == mAccountId) || accounts[0];
  account.folders.forEach(folder => addRow(folder));
}
