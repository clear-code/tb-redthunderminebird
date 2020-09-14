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
import { ChooseIssue } from '/common/ChooseIssue.js';

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

  onConfigChange('debug');

  const issueChooser = new ChooseIssue({
    container: document.querySelector('#choose-issue-container'),
    defaultId: mParams.defaultId,
    projectId: mParams.projectId
  });
  issueChooser.onChanged.addListener(issue => {
    mAcceptButton.disabled = !issue;
  });

  Dialog.initButton(mAcceptButton, async _event => {
    const issue = issueChooser.issue;
    if (!issue)
      return;
    try {
      Dialog.accept(issue);
    }
    catch(error) {
      console.error(error);
    }
  });
  Dialog.initCancelButton(mCancelButton);

  window.addEventListener('resize', _event => {
    configs.linkToIssueDialogWidth = window.outerWidth;
    configs.linkToIssueDialogHeight = window.outerHeight;
  });
  window.addEventListener(Dialog.TYPE_MOVED, event => {
    configs.linkToIssueDialogLeft = event.detail.left;
    configs.linkToIssueDialogTop = event.detail.top;
  });

  Dialog.notifyReady();
});
