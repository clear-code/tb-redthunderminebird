/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

import {
  configs,
  //sendToHost
} from '/common/common.js';
import * as Constants from '/common/constants.js';
import Options from '/extlib/Options.js';
import '/extlib/l10n.js';

import * as Redmine from '/common/redmine.js';

const options = new Options(configs);

async function initFolderMappings(givenAccounts) {
  const rowsContainer = document.getElementById('mappedFoldersRows');
  const range = document.createRange();
  range.selectNodeContents(rowsContainer);
  range.deleteContents();

  const accounts = givenAccounts || await browser.accounts.list();
  if (accounts.length > 0) {
    const projects = await Redmine.getProjects();
    const projectsChooser = document.createElement('select');
    for (const project of projects) {
      const option = projectsChooser.appendChild(document.createElement('option'));
      option.textContent = project.fullname;
      option.setAttribute('value', project.id);
    }

    const rows = document.createDocumentFragment();
    const addRow = (folder, parent) => {
      const row = document.createElement('tr');
      const folderCell = row.appendChild(document.createElement('td'));
      folderCell.textContent = parent ? `${parent}/${folder.name}` : folder.name;
      const projectsCell = row.appendChild(document.createElement('td'));
      projectsCell.appendChild(projectsChooser.cloneNode(true));
      rows.appendChild(row);
      for (const subFolder of folder.subFolders) {
        addRow(subFolder, folderCell.textContent);
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

  const accountsSelect = document.querySelector('#account');
  for (const account of accounts) {
    const option = document.createElement('option');
    option.textContent = account.name;
    option.setAttribute('value', account.id);
    accountsSelect.appendChild(option);
  }
  accountsSelect.value = configs.account || (accounts.length > 0 ? accounts[0].id : '');


  initFolderMappings(accounts);


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
