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
  clone,
  log,
} from '/common/common.js';
import * as Constants from '/common/constants.js';
import * as Dialog from '/extlib/dialog.js';
import { Redmine } from '/common/Redmine.js';
import EventListenerManager from '/extlib/EventListenerManager.js';

export const onShown = new EventListenerManager();
export const onHidden = new EventListenerManager();

let mRedmine;
let mAccountId;
let mAccountInfo;

let mProjects;
let mStatuses;

let mVisibleProjects;
let mHiddenProjects;
let mVisibleStatuses;
let mMappedFoldersDiverted;
let mMappedFolders;

const mDialog =  new Dialog.InPageDialog();
appendContents(mDialog.buttons, `
  <button class="choose-issue-accept">${sanitizeForHTMLText(browser.i18n.getMessage('dialog_createIssue_accept_label'))}</button>
  <button class="choose-issue-cancel">${sanitizeForHTMLText(browser.i18n.getMessage('dialog_createIssue_cancel_label'))}</button>
`);

Dialog.initButton(mDialog.buttons.firstChild, async _event => {
  save();
  hide();
});
Dialog.initButton(mDialog.buttons.lastChild, async _event => {
  hide();
});
appendContents(mDialog.contents, `
  <h1></h1>
  <p class="inheritDefaultAccountContainer"
    ><label><input type="checkbox"
                   class="inheritDefaultAccount"
                   data-lock-config-key="accounts">
             ${sanitizeForHTMLText(browser.i18n.getMessage('config_inheritDefaultAccount_label'))}</label></p>

  <section class="inheritableFromDefaultAccount">
  <h2>${sanitizeForHTMLText(browser.i18n.getMessage('config_base_caption'))}</h2>
  <p><label class="flex-box row">${sanitizeForHTMLText(browser.i18n.getMessage('config_redmineURL_label'))}
            <input type="text"
                   class="flex-box column redmineURL"
                   data-lock-config-key="accounts"></label></p>
  <p><label class="flex-box row">${sanitizeForHTMLText(browser.i18n.getMessage('config_redmineAPIKey_label'))}
            <input type="text"
                   class="flex-box column redmineAPIKey"
                   data-lock-config-key="accounts"></label></p>
  <p><label class="flex-box row">${sanitizeForHTMLText(browser.i18n.getMessage('config_customFields_label'))}
            <input type="text"
                   class="flex-box column customFields"
                   data-lock-config-key="accounts"></label></p>
  </section>

  <section class="inheritableFromDefaultAccount">
  <h2>${sanitizeForHTMLText(browser.i18n.getMessage('config_visibility_caption'))}</h2>
  <p><label>${sanitizeForHTMLText(browser.i18n.getMessage('config_projectsVisibilityMode_label'))}
            <select class="projectsVisibilityMode"
                    data-lock-config-key="accounts">
              <option value="1">${sanitizeForHTMLText(browser.i18n.getMessage('config_projectsVisibilityMode_showByDefault'))}</option>
              <option value="2">${sanitizeForHTMLText(browser.i18n.getMessage('config_projectsVisibilityMode_hideByDefault'))}</option>
            </select></label></p>
  <div class="sub hiddenProjectsContainer">
    <p><label class="flex-box row">${sanitizeForHTMLText(browser.i18n.getMessage('config_hiddenProjects_label'))}
              <input type="text"
                     class="flex-box column hiddenProjectsText"
                     data-lock-config-key="accountHiddenProjects"></label></p>
    <p class="checkboxes-for-array-config hiddenProjectsCheckboxes"></p>
  </div>
  <div class="sub hidden mVisibleProjectsContainer">
    <p><label class="flex-box row">${sanitizeForHTMLText(browser.i18n.getMessage('config_visibleProjects_label'))}
              <input type="text"
                     class="flex-box column visibleProjectsText"
                     data-lock-config-key="accountVisibleProjects"></label></p>
    <p class="checkboxes-for-array-config visibleProjectsCheckboxes"></p>
  </div>
  <p><label>${sanitizeForHTMLText(browser.i18n.getMessage('config_statusesVisibilityMode_label'))}
            <select class="statusesVisibilityMode"
                    data-lock-config-key="accounts">
              <option value="1">${sanitizeForHTMLText(browser.i18n.getMessage('config_statusesVisibilityMode_showByDefault'))}</option>
              <option value="2">${sanitizeForHTMLText(browser.i18n.getMessage('config_statusesVisibilityMode_hideByDefault'))}</option>
            </select></label></p>
  <div class="sub hidden mVisibleStatusesContainer">
    <p><label class="flex-box row">${sanitizeForHTMLText(browser.i18n.getMessage('config_visibleStatuses_label'))}
              <input type="text"
                     class="flex-box column visibleStatusesText"
                     data-lock-config-key="accountVisibleStatuses"></label></p>
    <p class="checkboxes-for-array-config visibleStatusesCheckboxes"></p>
  </div>
  <p><label>${sanitizeForHTMLText(browser.i18n.getMessage('config_visibleFields_label'))}</label>
     <label><input type="checkbox"
                   class="useGlobalVisibleFields"
                   data-lock-config-key="accounts">
             ${sanitizeForHTMLText(browser.i18n.getMessage('config_useGlobalVisibleFields_label'))}</label></p>
  <div class="sub visibleFields hidden">
    <p>
      <label><input type="checkbox" class="visible-field"
                    data-field-name="project"
                    data-lock-config-key="accountVisibleFields">
             ${sanitizeForHTMLText(browser.i18n.getMessage('dialog_createIssue_project_label'))}</label>
      <label><input type="checkbox" class="visible-field"
                    data-field-name="tracker"
                    data-lock-config-key="accountVisibleFields">
             ${sanitizeForHTMLText(browser.i18n.getMessage('dialog_createIssue_tracker_label'))}</label>
      <label><input type="checkbox" class="visible-field"
                    data-field-name="subject"
                    data-lock-config-key="accountVisibleFields">
             ${sanitizeForHTMLText(browser.i18n.getMessage('dialog_createIssue_subject_label'))}</label>
      <label><input type="checkbox" class="visible-field"
                    data-field-name="description"
                    data-lock-config-key="accountVisibleFields">
             ${sanitizeForHTMLText(browser.i18n.getMessage('dialog_createIssue_description_label'))}</label>
      <label><input type="checkbox" class="visible-field"
                    data-field-name="parentIssue"
                    data-lock-config-key="accountVisibleFields">
             ${sanitizeForHTMLText(browser.i18n.getMessage('dialog_createIssue_parentIssue_label'))}</label>
      <label><input type="checkbox" class="visible-field"
                    data-field-name="status"
                    data-lock-config-key="accountVisibleFields">
             ${sanitizeForHTMLText(browser.i18n.getMessage('dialog_createIssue_status_label'))}</label>
      <label><input type="checkbox" class="visible-field"
                    data-field-name="assigned"
                    data-lock-config-key="accountVisibleFields">
             ${sanitizeForHTMLText(browser.i18n.getMessage('dialog_createIssue_assigned_label'))}</label>
      <label><input type="checkbox" class="visible-field"
                    data-field-name="watcher"
                    data-lock-config-key="accountVisibleFields">
             ${sanitizeForHTMLText(browser.i18n.getMessage('dialog_createIssue_watcher_label'))}</label>
      <label><input type="checkbox" class="visible-field"
                    data-field-name="version"
                    data-lock-config-key="accountVisibleFields">
             ${sanitizeForHTMLText(browser.i18n.getMessage('dialog_createIssue_version_label'))}</label>
      <label><input type="checkbox" class="visible-field"
                    data-field-name="period"
                    data-lock-config-key="accountVisibleFields">
             ${sanitizeForHTMLText(browser.i18n.getMessage('dialog_createIssue_period_label'))}</label>
      <label><input type="checkbox" class="visible-field"
                    data-field-name="file"
                    data-lock-config-key="accountVisibleFields">
             ${sanitizeForHTMLText(browser.i18n.getMessage('dialog_createIssue_file_label'))}</label>
      <label><input type="checkbox" class="visible-field"
                    data-field-name="relations"
                    data-lock-config-key="accountVisibleFields">
             ${sanitizeForHTMLText(browser.i18n.getMessage('dialog_createIssue_relations_label'))}</label>
      <label><input type="checkbox" class="visible-field"
                    data-field-name="other"
                    data-lock-config-key="accountVisibleFields">
             ${sanitizeForHTMLText(browser.i18n.getMessage('dialog_createIssue_other_label'))}</label>
    </p>
    <p>
      <label><input type="checkbox" class="visible-field"
                    data-field-name="issue"
                    data-lock-config-key="accountVisibleFields">
             ${sanitizeForHTMLText(browser.i18n.getMessage('dialog_updateIssue_issue_label'))}</label>
      <label><input type="checkbox" class="visible-field"
                    data-field-name="notes"
                    data-lock-config-key="accountVisibleFields">
             ${sanitizeForHTMLText(browser.i18n.getMessage('dialog_updateIssue_notes_label'))}</label>
      <label><input type="checkbox" class="visible-field"
                    data-field-name="timeEntry"
                    data-lock-config-key="accountVisibleFields">
             ${sanitizeForHTMLText(browser.i18n.getMessage('dialog_updateIssue_timeEntry_label'))}</label>
    </p>
  </div>
  </section>

  <section class="inheritableFromDefaultAccount">
  <h2>${sanitizeForHTMLText(browser.i18n.getMessage('config_defaultValue_caption'))}</h2>
  <p><label>${sanitizeForHTMLText(browser.i18n.getMessage('config_defaultTracker_label'))}
            <select class="defaultTracker"
                    data-lock-config-key="accounts"></select></label></p>
  <p><label><input type="checkbox"
                   class="useGlobalDefaultFieldValues"
                   data-lock-config-key="accounts">
             ${sanitizeForHTMLText(browser.i18n.getMessage('config_useGlobalDefaultFieldValues_label'))}</label></p>
  <div class="defaultValues">
  <p><label>${sanitizeForHTMLText(browser.i18n.getMessage('config_defaultDueDate_label'))}
            <input type="number"
                   class="defaultDueDate"
                   data-lock-config-key="accounts"></label></p>
  <p><label class="flex-box row">${sanitizeForHTMLText(browser.i18n.getMessage('config_defaultTitleCleanupPattern_label'))}
            <input type="text"
                   class="flex-box column defaultTitleCleanupPattern"
                   data-lock-config-key="accounts"></label></p>
  <!--
  <p><label><input class="defaultUploadAttachments" type="checkbox"/>
            ${sanitizeForHTMLText(browser.i18n.getMessage('config_defaultUploadAttachments_label'))}</label></p>
  -->
  <fieldset>
    <legend>${sanitizeForHTMLText(browser.i18n.getMessage('config_descriptionTemplate_label'))}</legend>
    <textarea class="descriptionTemplate"
              data-lock-config-key="accounts"></textarea>
  </fieldset>
  <fieldset>
    <legend>${sanitizeForHTMLText(browser.i18n.getMessage('config_notesTemplate_label'))}</legend>
    <textarea class="notesTemplate"
              data-lock-config-key="accounts"></textarea>
  </fieldset>
  <p class="placeholders-description">${sanitizeForHTMLText(browser.i18n.getMessage('config_placeholders_description'))}</p>
  <p><label><input class="deleteLastQuotationBlockFromBody"
                   type="checkbox"
                   data-lock-config-key="accounts">
            ${sanitizeForHTMLText(browser.i18n.getMessage('dialog_deleteLastQuotationBlockFromBody_label'))}</label></p>
  </div>
  </section>

  <section>
  <h2>${sanitizeForHTMLText(browser.i18n.getMessage('config_mappedFolders_caption'))}</h2>
  <p class="inheritableFromDefaultAccount"
    ><label>${sanitizeForHTMLText(browser.i18n.getMessage('config_mappedFolders_default_label'))}
            <select class="defaultProject"
                    data-lock-config-key="accounts"><option value="">${sanitizeForHTMLText(browser.i18n.getMessage('config_mappedFolders_unmapped_label'))}</option></select></label></p>
  <p><label class="flex-box row">${sanitizeForHTMLText(browser.i18n.getMessage('config_visibleFolderPattern_label'))}
            <input type="text"
                   class="flex-box column visibleFolderPattern"
                   data-lock-config-key="accountMappedFolders"></label></p>
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
`);

mDialog.hide(); // reset tabIndex


const mProjectsVisibilityModeSelector = mDialog.contents.querySelector('.projectsVisibilityMode');
const mStatusesVisibilityModeSelector = mDialog.contents.querySelector('.statusesVisibilityMode');

async function getProjects() {
  const visibilityMode  = mRedmine.shouldInheritDefaultAccount ? (mRedmine.defaultAccountInfo.projectsVisibilityMode || configs.projectsVisibilityMode) : parseInt(mProjectsVisibilityModeSelector.value || 0);
  const visibleProjects = mRedmine.shouldInheritDefaultAccount ? (configs.accountVisibleProjects[configs.defaultAccount] || []).map(project => String(project)) : mVisibleProjects;
  const hiddenProjects  = mRedmine.shouldInheritDefaultAccount ? (configs.accountHiddenProjects[configs.defaultAccount] || []).map(project => String(project)) : mHiddenProjects;
  return mRedmine.getProjects({
    all: true,
    visibilityMode,
    visibleProjects,
    hiddenProjects
  }).catch(_error => []);
}

async function getStatuses() {
  const visibilityMode  = mRedmine.shouldInheritDefaultAccount ? (mRedmine.defaultAccountInfo.projectsVisibilityMode || configs.projectsVisibilityMode) : parseInt(mStatusesVisibilityModeSelector.value || 0);
  const visibleStatuses = mRedmine.shouldInheritDefaultAccount ? (configs.accountVisibleStatuses[configs.defaultAccount] || []).map(project => String(project)) : mVisibleStatuses;
  return mRedmine.getIssueStatuses({
    all: true,
    visibilityMode,
    visibleStatuses
  }).catch(_error => []);
}


// inherit from the default account

const mInheritDefaultAccountCheck = mDialog.contents.querySelector('.inheritDefaultAccount');
function onInheritDefaultAccountChanged() {
  mDialog.contents.classList.toggle('inherit-default-account', mInheritDefaultAccountCheck.checked);
}
mInheritDefaultAccountCheck.addEventListener('change', _event => {
  onInheritDefaultAccountChanged();
  onRedmineChanged();
});


// base settings

function onRedmineChanged() {
  if (onRedmineChanged.timer)
    clearTimeout(onRedmineChanged.timer);
  onRedmineChanged.timer = setTimeout(async () => {
    delete onRedmineChanged.timer;
    const defaultAccountInfo = configs.accounts[configs.defaultAccount] || {};
    const url = (mInheritDefaultAccountCheck.checked ? (defaultAccountInfo.url || '') : mDialog.contents.querySelector('.redmineURL').value).trim();
    const key = (mInheritDefaultAccountCheck.checked ? (defaultAccountInfo.key || '') : mDialog.contents.querySelector('.redmineAPIKey').value).trim();
    if (!url || !key)
      return;
    mRedmine = new Redmine({ accountId: mAccountId, url, key });
    mRedmine.recache();
    const [projects, statuses] = await Promise.all([getProjects(), getStatuses()])
    mProjects = projects;
    mStatuses = statuses;
    initProjectVisibilityCheckboxes(mProjects);
    initStatusVisibilityCheckboxes(mStatuses);
    initTrackers();
    initFolderMappings(mProjects);
  }, 250);
}

for (const field of mDialog.contents.querySelectorAll('.redmineURL, .redmineAPIKey')) {
  field.addEventListener('change', () => onRedmineChanged());
}


// project visibility

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
  initFolderMappings();
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
  initFolderMappings();
});
mVisibleProjectsTextField.addEventListener('input', _event => {
  mVisibleProjects = mVisibleProjectsTextField.value.split(',').map(value => parseInt(value)).filter(value => value && !isNaN(value));
  initProjectVisibilityCheckboxes(mProjects);
});


// status visibility

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


// fields visibility
const mUseGlobalVisibleFieldsCheck = mDialog.contents.querySelector('.useGlobalVisibleFields');
const mVisibleFields = mDialog.contents.querySelector('.visibleFields');
mUseGlobalVisibleFieldsCheck.addEventListener('change', _event => {
  mVisibleFields.classList.toggle('hidden', mUseGlobalVisibleFieldsCheck.checked);
});


// default values
const mUseGlobalDefaultFieldValuesCheck = mDialog.contents.querySelector('.useGlobalDefaultFieldValues');
const mDefaultValues = mDialog.contents.querySelector('.defaultValues');
mUseGlobalDefaultFieldValuesCheck.addEventListener('change', _event => {
  mDefaultValues.classList.toggle('hidden', mUseGlobalDefaultFieldValuesCheck.checked);
});


// folder mapping

const mMappingRows = mDialog.contents.querySelector('.mappedFoldersRows');
mMappingRows.addEventListener('change', _event => {
  const mapping = {};
  for (const row of mMappingRows.querySelectorAll('tr')) {
    mapping[row.dataset.folderPath] = row.querySelector('select').value;
  }
  if (mInheritDefaultAccountCheck.checked)
    mMappedFoldersDiverted = mapping;
  else
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
  log('AccountConfig::show ', accountId);

  mRedmine = new Redmine({ accountId: mAccountId });
  mAccountInfo = clone(mRedmine.privateAccountInfo);

  const isDefaultAccount = mAccountId == configs.defaultAccount;
  const inheritDefaultAccount = !isDefaultAccount && mAccountInfo.inheritDefaultAccount !== false;
  if (inheritDefaultAccount)
    mRedmine = new Redmine({
      accountId: mAccountId,
      url:       mRedmine.defaultAccountInfo.url,
      key:       mRedmine.defaultAccountInfo.key
    });

  mVisibleProjects = (configs.accountVisibleProjects[mAccountId] || []).map(project => String(project));
  mHiddenProjects = (configs.accountHiddenProjects[mAccountId] || []).map(project => String(project));
  mProjectsVisibilityModeSelector.value = mAccountInfo.projectsVisibilityMode || configs.projectsVisibilityMode;

  mVisibleStatuses = (configs.accountVisibleStatuses[mAccountId] || []).map(status => String(status));
  mStatusesVisibilityModeSelector.value = mAccountInfo.statusesVisibilityMode || configs.statusesVisibilityMode;

  const [projects, statuses, accounts] = await Promise.all([
    getProjects(),
    getStatuses(),
    browser.accounts.list()
  ]);
  mProjects = projects;
  mStatuses = statuses;

  const account = accounts.find(account => account.id == mAccountId) || {};
  mDialog.contents.querySelector('h1').textContent = browser.i18n.getMessage('config_accountConfig_title', [account.name || '']);

  mDialog.contents.querySelector('.inheritDefaultAccountContainer').classList.toggle('hidden', isDefaultAccount);
  mInheritDefaultAccountCheck.checked = inheritDefaultAccount;

  // base configs
  mDialog.contents.querySelector('.redmineURL').value = mAccountInfo.url || '';
  mDialog.contents.querySelector('.redmineAPIKey').value = mAccountInfo.key || '';
  mDialog.contents.querySelector('.customFields').value = mAccountInfo.customFields || '';
  onInheritDefaultAccountChanged();

  // projects visibility
  mVisibleProjectsTextField.value = mVisibleProjects.join(',');
  mHiddenProjectsTextField.value = mHiddenProjects.join(',');

  // status visibility
  mVisibleStatusesTextField.value = mVisibleStatuses.join(',');

  // fields visibility
  mUseGlobalVisibleFieldsCheck.checked = 'useGlobalVisibleFields' in mAccountInfo ? mAccountInfo.useGlobalVisibleFields : true;
  mVisibleFields.classList.toggle('hidden', mUseGlobalVisibleFieldsCheck.checked);
  const visibleFields = configs.accountVisibleFields[accountId] || {};
  for (const checkbox of mVisibleFields.querySelectorAll('input[type="checkbox"].visible-field')) {
    const name = checkbox.dataset.fieldName;
    checkbox.checked = !!(name in visibleFields ? visibleFields[name] : configs[`fieldVisibility_${name}`]);
  }

  mVisibleFolderPatternField.value = 'visibleFolderPattern' in mAccountInfo ? mAccountInfo.visibleFolderPattern : configs.visibleFolderPattern;
  mMappedFoldersDiverted = clone(configs.accountMappedFoldersDiverted[accountId] || {});
  mMappedFolders = clone(configs.accountMappedFolders[accountId] || {});

  // default values
  mUseGlobalDefaultFieldValuesCheck.checked = 'useGlobalDefaultFieldValues' in mAccountInfo ? mAccountInfo.useGlobalDefaultFieldValues : true;
  mDefaultValues.classList.toggle('hidden', mUseGlobalDefaultFieldValuesCheck.checked);

  mDialog.contents.querySelector('.defaultDueDate').value = 'defaultDueDate' in mAccountInfo ? mAccountInfo.defaultDueDate : configs.defaultDueDate;
  mDialog.contents.querySelector('.defaultTitleCleanupPattern').value = 'defaultTitleCleanupPattern' in mAccountInfo ? mAccountInfo.defaultTitleCleanupPattern : configs.defaultTitleCleanupPattern;
  mDialog.contents.querySelector('.descriptionTemplate').value = 'descriptionTemplate' in mAccountInfo ? mAccountInfo.descriptionTemplate : configs.descriptionTemplate;
  mDialog.contents.querySelector('.notesTemplate').value = 'notesTemplate' in mAccountInfo ? mAccountInfo.notesTemplate : configs.notesTemplate;
  mDialog.contents.querySelector('.deleteLastQuotationBlockFromBody').checked = !!('deleteLastQuotationBlockFromBody' in mAccountInfo ? mAccountInfo.deleteLastQuotationBlockFromBody : configs.deleteLastQuotationBlockFromBody);

  await Promise.all([
    initProjectVisibilityCheckboxes(mProjects),
    initStatusVisibilityCheckboxes(mStatuses),
    initTrackers(),
    initFolderMappings(mProjects)
  ]);

  onProjectVisibilityModeChanged();
  onStatustVisibilityModeChanged();
  mDialog.contents.querySelector('.defaultTracker').value = mAccountInfo.defaultTracker || '';
  const firstVisibleProject = mProjects.find(project => project.visible);
  mDialog.contents.querySelector('.defaultProject').value = mAccountInfo.defaultProject || firstVisibleProject && firstVisibleProject.id;

  for (const container of mDialog.contents.querySelectorAll('section, fieldset, p, div')) {
    const fields = container.querySelectorAll('input, textarea, select');
    if (fields.length == 0)
      continue;

    let lockedFieldsCount = 0;;
    for (const field of fields) {
      const key = field.dataset.lockConfigKey;
      if (!key)
        continue;
      const locked = configs.$isLocked(key);
      field.disabled = locked;
      const label = field.closest('label') || (field.id && field.ownerDocument.querySelector(`label[for="${field.id}"]`)) || field;
      if (label)
        label.classList.toggle('locked', locked);
      if (locked)
        lockedFieldsCount++;
    }
    container.classList.toggle('locked', fields.length == lockedFieldsCount);
  }

  mDialog.show();
  onShown.dispatch();
}

function hide() {
  mDialog.hide();
  onHidden.dispatch();
}

function save() {
  if (mAccountId != configs.defaultAccount)
    mAccountInfo.inheritDefaultAccount = mInheritDefaultAccountCheck.checked;
  mAccountInfo.url = mDialog.contents.querySelector('.redmineURL').value;
  mAccountInfo.key = mDialog.contents.querySelector('.redmineAPIKey').value;
  mAccountInfo.customFields = mDialog.contents.querySelector('.customFields').value;
  mAccountInfo.projectsVisibilityMode = parseInt(mProjectsVisibilityModeSelector.value);
  mAccountInfo.statusesVisibilityMode = parseInt(mStatusesVisibilityModeSelector.value);
  mAccountInfo.useGlobalVisibleFields = mUseGlobalVisibleFieldsCheck.checked;
  mAccountInfo.defaultTracker = parseInt(mDialog.contents.querySelector('.defaultTracker').value || 0);
  mAccountInfo.useGlobalDefaultFieldValues = mUseGlobalDefaultFieldValuesCheck.checked;
  if (!mAccountInfo.useGlobalDefaultFieldValues) {
    mAccountInfo.defaultDueDate = parseInt(mDialog.contents.querySelector('.defaultDueDate').value || configs.defaultDueDate);
    mAccountInfo.defaultTitleCleanupPattern = mDialog.contents.querySelector('.defaultTitleCleanupPattern').value;
    mAccountInfo.descriptionTemplate = mDialog.contents.querySelector('.descriptionTemplate').value;
    mAccountInfo.notesTemplate = mDialog.contents.querySelector('.notesTemplate').value;
    mAccountInfo.deleteLastQuotationBlockFromBody = mDialog.contents.querySelector('.deleteLastQuotationBlockFromBody').checked;
  }
  mAccountInfo.defaultProject = parseInt(mDialog.contents.querySelector('.defaultProject').value || 0);
  mAccountInfo.visibleFolderPattern = mVisibleFolderPatternField.value;
  saveAccountConfig('accounts', mAccountInfo);

  saveAccountConfig('accountVisibleProjects', mVisibleProjects);
  saveAccountConfig('accountHiddenProjects', mHiddenProjects);
  saveAccountConfig('accountVisibleStatuses', mVisibleStatuses);

  const visibleFields = {};
  for (const checkbox of mDialog.contents.querySelectorAll('input[type="checkbox"].visible-field')) {
    visibleFields[checkbox.dataset.fieldName] = checkbox.checked;
  }
  saveAccountConfig('accountVisibleFields', visibleFields);

  saveAccountConfig('accountMappedFoldersDiverted', mMappedFoldersDiverted);
  saveAccountConfig('accountMappedFolders', mMappedFolders);
}

function saveAccountConfig(key, value) {
  log('AccountConfig::saveAccountConfig ', key, mAccountId, value);
  const values = clone(configs[key]) || {};
  log('  old values: ', clone(values));
  // Don't use mRedmine.accountId because it can refer the default account!
  values[mAccountId] = value;
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
    const translated = item && itemTranslator ? itemTranslator(item) : item;
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
    projects = await getProjects();
  const visibleProjects = new Set(mVisibleProjects);
  const hiddenProjects = new Set(mHiddenProjects);
  initCheckboxes(
    mDialog.contents.querySelector('.visibleProjectsCheckboxes'),
    projects,
    project => configs.$isLocked('accountVisibleProjects') ? null : ({
      value: project.id,
      label: project.indentedName,
      checked: visibleProjects.has(project.id) || visibleProjects.has(String(project.id)) || visibleProjects.has(project.identifier)
    })
  );
  initCheckboxes(
    mDialog.contents.querySelector('.hiddenProjectsCheckboxes'),
    projects,
    project => configs.$isLocked('accountHiddenProjects') ? null : ({
      value: project.id,
      label: project.indentedName,
      checked: hiddenProjects.has(project.id) || hiddenProjects.has(String(project.id)) || hiddenProjects.has(project.identifier)
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
    status => configs.$isLocked('accountVisibleStatuses') ? null : ({
      value: status.id,
      label: status.name,
      checked: visibleStatuses.has(status.id) || visibleStatuses.has(String(status.id)) || visibleStatuses.has(status.name)
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
    projects = await getProjects();
  if (initFolderMappings.startedAt != startTime)
    return;
  const allProjects = new Set(projects.map(project => String(project.id)));

  const defaultChooser = mDialog.contents.querySelector('.defaultProject');
  initSelect(
    defaultChooser,
    projects,
    project => project.visible ? ({ label: project.indentedName, value: project.id }) : null
  );
  defaultChooser.value = 'defaultProject' in mAccountInfo ? mAccountInfo.defaultProject : configs.defaultProject;

  if (configs.$isLocked('accountMappedFolders'))
    return;

  const projectOptionsSource = [
    generateOptionSource({ label: browser.i18n.getMessage('config_mappedFolders_fallbackToDefault_label'), value: '' }),
    ...projects.map(project => project.visible ? generateOptionSource({ label: project.indentedName, value: project.id }) : null)
  ].join('');
  const mappedFolders = mInheritDefaultAccountCheck.checked ? mMappedFoldersDiverted : mMappedFolders;

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
      if (folder.path in mappedFolders &&
          allProjects.has(mappedFolders[folder.path]) &&
          projectChooser.querySelector(`option[value=${JSON.stringify(sanitizeForHTMLText(String(mappedFolders[folder.path])))}]`))
        projectChooser.value = mappedFolders[folder.path];
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
