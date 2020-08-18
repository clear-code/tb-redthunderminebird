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

const options = new Options(configs);

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


  const accounts = configs.accounts;
  const accountsSelect = document.querySelector('#account');
  for (const account of accounts) {
    const option = document.createElement('option');
    option.textContent = account.name;
    option.setAttribute('value', account.id);
    accountsSelect.appendChild(option);
  }
  accountsSelect.value = configs.account || (accounts.length > 0 ? accounts[0].id : '');


  for (const container of document.querySelectorAll('section, fieldset, p, div')) {
    const allFields = container.querySelectorAll('input, textarea, select');
    const lockedFields = container.querySelectorAll('.locked input, .locked textarea, .locked select, input.locked, textarea.locked, select.locked');
    container.classList.toggle('locked', allFields.length == lockedFields.length);
  }

  options.buildUIForAllConfigs(document.querySelector('#debug-configs'));
  onConfigChanged('debug');

  document.documentElement.classList.add('initialized');
}, { once: true });
