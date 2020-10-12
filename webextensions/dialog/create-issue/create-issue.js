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
  log,
  appendContents,
  sanitizeForHTMLText
} from '/common/common.js';
import { Message } from '/common/Message.js';
import { Redmine } from '/common/Redmine.js';
import { IssueEditor } from '/dialog/IssueEditor.js';
import * as DialogCommon from '/dialog/common.js';

DialogCommon.registerMultipleDialogsAlertMessage(browser.i18n.getMessage('dialog_createIssue_multipleDialogsRequested_message'));

let mParams;
let mMessage;
let mRedmine;
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
  mRedmine = new Redmine({ accountId: mMessage.accountId });
  const redmineParams = await mMessage.toRedmineParams();
  log('mMessage: ', mMessage);
  log('redmineParams ', redmineParams);
  delete redmineParams.id; // force to create new issue

  log('init editor');
  mIssueEditor = new IssueEditor(redmineParams);
  mIssueEditor.onValid.addListener(() => {
    mAcceptButton.disabled = false;
  });
  mIssueEditor.onInvalid.addListener(() => {
    mAcceptButton.disabled = true;
  });
  await mIssueEditor.initialized;

  log('init buttons');
  Dialog.initButton(mAcceptButton, async _event => {
    mAcceptButton.disabled = mCancelButton.disabled = true;
    try {
      const issue = await createIssue();
      if (issue) {
        const url = mRedmine.getIssueURL(issue.id, { withAPIKey: true });
        const completedMessage = new Dialog.InPageDialog();
        appendContents(completedMessage.contents, `
          <p>${sanitizeForHTMLText(browser.i18n.getMessage('dialog_createIssue_complete_message'))}</p>
          <p><a href=${JSON.stringify(sanitizeForHTMLText(url))}
               >${sanitizeForHTMLText(mRedmine.getIssueURL(issue.id))}</a></p>
        `);
        appendContents(completedMessage.buttons, `
          <button>${sanitizeForHTMLText(browser.i18n.getMessage('dialog_createIssue_complete_button_label'))}</button>
        `);
        Dialog.initButton(completedMessage.buttons.firstChild, async _event => {
          Dialog.accept(issue);
        });
        const link = completedMessage.contents.querySelector('a');
        const openLink = event => {
          event.preventDefault();
          event.stopPropagation();
          browser.tabs.create({
            active: true,
            url
          });
        };
        link.addEventListener('click', event => {
          if (event.button != 0)
            return;
          openLink(event);
        });
        link.addEventListener('keydown', event => {
          if (event.key != 'Enter' &&
              event.key != ' ')
            return;
          openLink(event);
        });
        // delay is required to apply CSS transition
        setTimeout(() => completedMessage.show(), 0);
      }
    }
    catch(error) {
      console.error(error);
    }
    finally {
      mAcceptButton.disabled = mCancelButton.disabled = false;
    }
  });
  Dialog.initCancelButton(mCancelButton);

  log('notify ready');
  await Dialog.notifyReady();

  mIssueEditor.sizeToContent();

  log('start listening of window changes');
  window.addEventListener('resize', _event => {
    configs.createIssueDialogWidth = window.outerWidth;
    configs.createIssueDialogHeight = window.outerHeight;
  });
  window.addEventListener(Dialog.TYPE_MOVED, event => {
    configs.createIssueDialogLeft = event.detail.left;
    configs.createIssueDialogTop = event.detail.top;
  });
});

async function createIssue() {
  if (!document.querySelector('#project').value) {
    alert(browser.i18n.getMessage('dialog_createIssue_error_missingProjectId'));
    return;
  }

  const createParams = mIssueEditor.getRequestParams();

  const result = await mRedmine.createIssue(createParams);
  const issue = result && result.issue;
  log('created issue: ', issue);

  if (issue && issue.id) {
    mIssueEditor.issueId = issue.id;
    await Promise.all([
      mMessage.setIssueId(issue.id),
      mIssueEditor.saveRelations()
    ]);
  }

  return issue;
}
