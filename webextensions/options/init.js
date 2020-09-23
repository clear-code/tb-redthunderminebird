/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

import {
  configs,
  appendContents,
  sanitizeForHTMLText
} from '/common/common.js';
import * as Constants from '/common/constants.js';
import Options from '/extlib/Options.js';
import '/extlib/l10n.js';

import * as Redmine from '/common/redmine.js';

const options = new Options(configs);

let mAccounts;

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
    projects = await Redmine.getProjects({ all: true });
  const visibleProjects = new Set(configs.visibleProjects.map(project => String(project)));
  const hiddenProjects = new Set(configs.hiddenProjects.map(project => String(project)));
  initCheckboxes(
    document.querySelector('#visibleProjectsCheckboxes'),
    projects,
    project => ({
      value: project.id,
      label: project.fullname,
      checked: visibleProjects.has(String(project.id)) || visibleProjects.has(project.identifier)
    })
  );
  initCheckboxes(
    document.querySelector('#hiddenProjectsCheckboxes'),
    projects,
    project => ({
      value: project.id,
      label: project.fullname,
      checked: hiddenProjects.has(String(project.id)) || hiddenProjects.has(project.identifier)
    })
  );
}

async function initTrackers() {
  const trackers = await Redmine.getTrackers();
  initSelect(
    document.querySelector('#defaultTracker'),
    [{ name: browser.i18n.getMessage('config_defaultTracker_blank_label'), value: '' }, ...trackers],
    tracker => ({ label: tracker.name, value: tracker.id })
  );
}

async function initFolderMappings(projects) {
  const rowsContainer = document.querySelector('#mappedFoldersRows');
  const range = document.createRange();
  range.selectNodeContents(rowsContainer);
  range.deleteContents();
  range.detach();

  const accounts = mAccounts || await browser.accounts.list();
  if (accounts.length > 0) {
    if (!projects)
      projects = await Redmine.getProjects();
    const allProjects = new Set(projects.map(project => String(project.id)));

    const defaultChooser = document.querySelector('#defaultProject');
    initSelect(
      defaultChooser,
      projects,
      project => ({ label: project.fullname, value: project.id })
    );
    defaultChooser.value = configs.defaultProject;

    const projectOptionsSource = [
      generateOptionSource({ label: browser.i18n.getMessage('config_mappedFolders_fallbackToDefault_label'), value: '' }),
      projects.map(project => generateOptionSource({ label: project.fullname, value: project.id }))
    ].join('');

    const addRow = (folder, parent) => {
      const readablePath = parent ? `${parent}/${folder.name}` : folder.name;
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
      if (configs.mappedFolders &&
          folder.path in configs.mappedFolders &&
          allProjects.has(configs.mappedFolders[folder.path]))
        projectChooser.value = configs.mappedFolders[folder.path];
      else
        projectChooser.value = '';

      for (const subFolder of folder.subFolders) {
        addRow(subFolder, readablePath);
      }
    };
    const account = accounts.find(account => account.id == configs.account) || accounts[0];
    account.folders.forEach(folder => addRow(folder));
  }
}

function onConfigChanged(key) {
  switch (key) {
    case 'debug':
      document.documentElement.classList.toggle('debugging', configs.debug);
      break;

    case 'redmineURL':
    case 'redmineAPIKey':
      onRedmineChanged();
      break;
  }
}
configs.$addObserver(onConfigChanged);

function onRedmineChanged() {
  if (onRedmineChanged.timer)
    clearTimeout(onRedmineChanged.timer);
  onRedmineChanged.timer = setTimeout(async () => {
    delete onRedmineChanged.timer;
    if (!document.querySelector('#redmineURL').value.trim() ||
        !document.querySelector('#redmineAPIKey').value.trim())
      return;
    const projects = await Redmine.getProjects({ all: true });
    initProjectVisibilityCheckboxes(projects);
    initTrackers();
    initFolderMappings(projects);
  }, 250);
}

window.addEventListener('DOMContentLoaded', async () => {
  const [accounts, ] = await Promise.all([
    browser.accounts.list(),
    configs.$loaded
  ]);
  mAccounts = accounts;

  const accountsSelect = document.querySelector('#account');
  initSelect(
    accountsSelect,
    accounts,
    account => ({ label: account.name, value: account.id })
  );
  accountsSelect.value = configs.account || (accounts.length > 0 ? accounts[0].id : '');

  const projects = await Redmine.getProjects({ all: true });
  initProjectVisibilityCheckboxes(projects);
  initTrackers();
  initFolderMappings(projects);


  const projectVisibilityModeSelector = document.querySelector('#projectVisibilityMode');
  const hiddenProjects = document.querySelector('#hiddenProjectsCheckboxesContainer');
  const visibleProjects = document.querySelector('#visibleProjectsCheckboxesContainer');

  const onProjectVisibilityModeChanged = () => {
    const showByDefault = projectVisibilityModeSelector.value != Constants.PROJECTS_VISIBILITY_HIDE_BY_DEFAULT;
    hiddenProjects.classList.toggle('hidden', !showByDefault);
    visibleProjects.classList.toggle('hidden', showByDefault);
  };
  onProjectVisibilityModeChanged();
  projectVisibilityModeSelector.addEventListener('change', onProjectVisibilityModeChanged);

  const hiddenProjectsTextField = document.querySelector('#hiddenProjectsText');
  hiddenProjects.addEventListener('change', _event => {
    configs.hiddenProjects = Array.from(
      hiddenProjects.querySelectorAll('input[type="checkbox"]:checked'),
      checkbox => parseInt(checkbox.value)
    );
    hiddenProjectsTextField.value = configs.hiddenProjects.join(',');
  });
  hiddenProjectsTextField.addEventListener('input', _event => {
    configs.hiddenProjects = hiddenProjectsTextField.value.split(',').map(value => parseInt(value)).filter(value => value && !isNaN(value));
    initProjectVisibilityCheckboxes(projects);
  });
  hiddenProjectsTextField.value = configs.hiddenProjects.join(',');

  const visibleProjectsTextField = document.querySelector('#visibleProjectsText');
  visibleProjects.addEventListener('change', _event => {
    configs.visibleProjects = Array.from(
      visibleProjects.querySelectorAll('input[type="checkbox"]:checked'),
      checkbox => parseInt(checkbox.value)
    );
    visibleProjectsTextField.value = configs.visibleProjects.join(',');
  });
  visibleProjectsTextField.addEventListener('input', _event => {
    configs.visibleProjects = visibleProjectsTextField.value.split(',').map(value => parseInt(value)).filter(value => value && !isNaN(value));
    initProjectVisibilityCheckboxes(projects);
  });
  visibleProjectsTextField.value = configs.visibleProjects.join(',');


  const mappingRows = document.querySelector('#mappedFoldersRows');
  mappingRows.addEventListener('change', _event => {
    const mapping = {};
    for (const row of mappingRows.querySelectorAll('tr')) {
      mapping[row.dataset.folderPath] = row.querySelector('select').value;
    }
    configs.mappedFolders = mapping;
  });

  options.buildUIForAllConfigs(document.querySelector('#debug-configs'));
  onConfigChanged('debug');

  for (const container of document.querySelectorAll('section, fieldset, p, div')) {
    const allFields = container.querySelectorAll('input, textarea, select');
    if (allFields.length == 0)
      continue;
    const lockedFields = container.querySelectorAll('.locked input, .locked textarea, .locked select, input.locked, textarea.locked, select.locked');
    container.classList.toggle('locked', allFields.length == lockedFields.length);
  }

  for (const field of document.querySelectorAll('#redmineURL, #redmineAPIKey')) {
    field.addEventListener('change', () => onRedmineChanged());
  }

  document.documentElement.classList.add('initialized');
}, { once: true });
