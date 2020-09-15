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
import { Message } from '/common/Message.js';
import * as Redmine from '/common/redmine.js';
import { IssueEditor } from '/dialog/IssueEditor.js';

Dialog.setLogger(log);

let mParams;
let mMessage;
let mIssueEditor;

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

  mMessage = new Message(mParams.message);
  const redmineParams = await mMessage.toRedmineParams();
  log('mMessage: ', mMessage);
  log('redmineParams ', redmineParams);

  mIssueEditor = new IssueEditor(redmineParams);
  await mIssueEditor.initialized;

  Dialog.initButton(mAcceptButton, async _event => {
    mAcceptButton.disabled = mCancelButton.disabled = true;
    try {
      const issue = await createIssue();
      Dialog.accept(issue);
    }
    catch(error) {
      console.error(error);
    }
    finally {
      mAcceptButton.disabled = mCancelButton.disabled = false;
    }
  });
  Dialog.initCancelButton(mCancelButton);

  window.addEventListener('resize', _event => {
    configs.createIssueDialogWidth = window.outerWidth;
    configs.createIssueDialogHeight = window.outerHeight;
  });
  window.addEventListener(Dialog.TYPE_MOVED, event => {
    configs.createIssueDialogLeft = event.detail.left;
    configs.createIssueDialogTop = event.detail.top;
  });

  Dialog.notifyReady();
});

async function createIssue() {
  if (!document.querySelector('#project').value) {
    alert(browser.i18n.getMessage('dialog_createIssue_error_missingProjectId'));
    return;
  }

  const createParams = mIssueEditor.getRequestParams();

  const result = await Redmine.createIssue(createParams);
  const issue = result && result.issue;
  console.log('created issue: ', issue);

  if (issue && issue.id) {
    mIssueEditor.issueId = issue.id;
    await mIssueEditor.saveRelations();
  }

  return issue;
}
