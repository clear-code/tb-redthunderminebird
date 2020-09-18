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

async function initTrackers() {
  const trackers = await Redmine.getTrackers();
  initSelect(
    document.querySelector('#defaultTracker'),
    trackers,
    tracker => ({ label: tracker.name, value: tracker.id })
  );
}

async function initFolderMappings() {
  const defaultChooser = document.querySelector('#defaultProject');
  const rowsContainer = document.querySelector('#mappedFoldersRows');
  const range = document.createRange();

  range.selectNodeContents(defaultChooser);
  range.setStartAfter(defaultChooser.firstChild);
  range.deleteContents();

  range.selectNodeContents(rowsContainer);
  range.deleteContents();

  const accounts = mAccounts || await browser.accounts.list();
  if (accounts.length > 0) {
    const projects = await Redmine.getProjects();
    const allProjects = new Set(projects.map(project => String(project.id)));
    const projectsChooser = document.createElement('select');
    const defaultOption = projectsChooser.appendChild(document.createElement('option'));
    defaultOption.textContent = browser.i18n.getMessage('config_mappedFolders_fallbackToDefault_label');
    defaultOption.setAttribute('value', '');
    for (const project of projects) {
      const option = defaultChooser.appendChild(document.createElement('option'));
      option.textContent = project.fullname;
      option.setAttribute('value', project.id);
      projectsChooser.appendChild(option.cloneNode(true));
    }
    defaultChooser.value = configs.defaultProject;

    const rows = document.createDocumentFragment();
    const addRow = (folder, parent) => {
      const row = document.createElement('tr');
      row.dataset.folderPath = folder.path;

      const readablePath = parent ? `${parent}/${folder.name}` : folder.name;
      const chooserId = `folder-mapping-${encodeURIComponent(folder.path)}`;

      const folderCell = row.appendChild(document.createElement('td'));
      const label = folderCell.appendChild(document.createElement('label'));
      label.setAttribute('for', chooserId);
      label.textContent = readablePath;

      const projectsCell = row.appendChild(document.createElement('td'));
      const clonedProjectChooser = projectsCell.appendChild(projectsChooser.cloneNode(true));
      clonedProjectChooser.setAttribute('id', chooserId);
      if (configs.mappedFolders &&
          folder.path in configs.mappedFolders &&
          allProjects.has(configs.mappedFolders[folder.path]))
        clonedProjectChooser.value = configs.mappedFolders[folder.path];
      else
        clonedProjectChooser.value = '';

      rows.appendChild(row);

      for (const subFolder of folder.subFolders) {
        addRow(subFolder, readablePath);
      }
    };
    const account = accounts.find(account => account.id == configs.account) || accounts[0];
    account.folders.forEach(folder => addRow(folder));
    range.insertNode(rows);
  }

  range.detach();
}

function onConfigChanged(key) {
  switch (key) {
    case 'debug':
      document.documentElement.classList.toggle('debugging', configs.debug);
      break;
  }
}
configs.$addObserver(onConfigChanged);

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

  initTrackers();
  initFolderMappings();

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

  document.documentElement.classList.add('initialized');
}, { once: true });
