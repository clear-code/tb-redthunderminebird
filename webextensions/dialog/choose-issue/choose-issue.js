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
  log
} from '/common/common.js';
import * as ChooseIssue from '/common/choose-issue.js';

Dialog.setLogger(log);

let mParams;

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
  document.title = mParams.title || browser.i18n.getMessage('dialog_chooseIssue_title_general');

  onConfigChange('debug');

  await ChooseIssue.init(document.querySelector('choose-issues-container'), {
    defaultId: mParams.defaultId,
    projectId: mParams.projectId
  });
  ChooseIssue.onChanged.addListener(() => {
    mAcceptButton.disabled = !!ChooseIssue.getIssueId();
  });

  Dialog.initButton(mAcceptButton, async _event => {
    const id = ChooseIssue.getIssueId();
    if (!id)
      return;
    try {
      const radio = document.querySelector(`input[type="radio"][value="${id}"]`);
      Dialog.accept(radio && radio.$issue);
    }
    catch(error) {
      console.error(error);
    }
  });
  Dialog.initCancelButton(mCancelButton);

  window.addEventListener('resize', _event => {
    configs.chooseIssueDialogWidth = window.outerWidth;
    configs.chooseIssueDialogHeight = window.outerHeight;
  });
  window.addEventListener(Dialog.TYPE_MOVED, event => {
    configs.chooseIssueDialogLeft = event.detail.left;
    configs.chooseIssueDialogTop = event.detail.top;
  });

  Dialog.notifyReady();
});
