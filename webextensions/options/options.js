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
import Options from '/extlib/Options.js';
import * as Dialog from '/extlib/dialog.js';
import '/extlib/l10n.js';
import * as AccountConfig from './account-config.js';

const options = new Options(configs);

async function initAccounts() {
  const container = document.querySelector('#editAccountButtons');
  const range = document.createRange();
  range.selectNodeContents(container);
  range.deleteContents();
  range.detach();

  const accounts = await browser.accounts.list();
  const regularAccounts = accounts.filter(account => account.type != 'none');
  const localFolderAccounts = accounts.filter(account => account.type == 'none');
  for (const account of [...regularAccounts, ...localFolderAccounts]) {
    appendContents(container, `
      <li class="flex-box row"><button class="flex-box column" value=${JSON.stringify(sanitizeForHTMLText(account.id))}>${sanitizeForHTMLText(account.name)}</button></li>
    `);
  }
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
  await configs.$loaded;

  initAccounts();
  const editAccountButtons = document.querySelector('#editAccountButtons');
  Dialog.initButton(editAccountButtons, event => {
    const button = event.target.closest('button');
    const accountId = button.getAttribute('value');
    AccountConfig.show(accountId);
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
