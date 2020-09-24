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
import { IssueChooser } from '/dialog/IssueChooser.js';
import * as DialogCommon from '/dialog/common.js';

DialogCommon.registerMultipleDialogsAlertMessage(browser.i18n.getMessage('dialog_linkToIssue_multipleDialogsRequested_message'));

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

  const issueChooser = new IssueChooser({
    container: document.querySelector('#choose-issue-container'),
    defaultId: mParams.defaultId,
    projectId: mParams.projectId
  });
  issueChooser.onChanged.addListener(issue => {
    mAcceptButton.disabled = !issue;
  });
  await issueChooser.fetchMore(); // initial fetch

  Dialog.initButton(mAcceptButton, async _event => {
    mAcceptButton.disabled = mCancelButton.disabled = true;
    const issue = issueChooser.issue;
    try {
      if (!issue)
        return;
      Dialog.accept(issue);
    }
    catch(error) {
      console.error(error);
    }
    finally {
      mAcceptButton.disabled = !issue;
      mCancelButton.disabled = false;
    }
  });
  Dialog.initCancelButton(mCancelButton);

  await Dialog.notifyReady();

  window.addEventListener('resize', _event => {
    configs.linkToIssueDialogWidth = window.outerWidth;
    configs.linkToIssueDialogHeight = window.outerHeight;
  });
  window.addEventListener(Dialog.TYPE_MOVED, event => {
    configs.linkToIssueDialogLeft = event.detail.left;
    configs.linkToIssueDialogTop = event.detail.top;
  });
});
