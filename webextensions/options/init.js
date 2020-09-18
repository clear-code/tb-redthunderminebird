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

async function initTrackers() {
  const trackers = await Redmine.getTrackers();
  initSelect(
    document.querySelector('#defaultTracker'),
    [{ name: browser.i18n.getMessage('config_defaultTracker_blank_label'), value: '' },
     ...trackers],
    tracker => ({ label: tracker.name, value: tracker.id })
  );
}

async function initFolderMappings() {
  const rowsContainer = document.querySelector('#mappedFoldersRows');
  const range = document.createRange();
  range.selectNodeContents(rowsContainer);
  range.deleteContents();
  range.detach();

  const accounts = mAccounts || await browser.accounts.list();
  if (accounts.length > 0) {
    const projects = await Redmine.getProjects();
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
  onRedmineChanged.timer = setTimeout(() => {
    delete onRedmineChanged.timer;
    if (document.querySelector('#redmineURL:blank, #redmineAPIKey:blank'))
      return;
    initTrackers();
    initFolderMappings();
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

  for (const field of document.querySelectorAll('#redmineURL, #redmineAPIKey')) {
    field.addEventListener('change', () => onRedmineChanged());
  }

  document.documentElement.classList.add('initialized');
}, { once: true });
