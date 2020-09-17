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
import * as Redmine from '/common/redmine.js';
import { IssueEditor } from '/dialog/IssueEditor.js';

Dialog.setLogger(log);

let mParams;
let mMessage;
let mIssueEditor;

const mDescriptionToggler = document.querySelector('#toggleDescription');
const mDescriptionField  = document.querySelector('#description');
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

  mDescriptionField.disabled = true;
  mDescriptionToggler.addEventListener('click', event => {
    if (event.button != 0)
      return;
    event.preventDefault();
    event.stopPropagation();
    toggleDescriptionField();
  });
  mDescriptionToggler.addEventListener('keydown', event => {
    if (event.key != 'Enter' &&
        event.key != ' ')
      return;
    event.preventDefault();
    event.stopPropagation();
    toggleDescriptionField();
  });

  mIssueEditor = new IssueEditor(redmineParams);
  mIssueEditor.onValid.addListener(() => {
    mAcceptButton.disabled = false;
  });
  mIssueEditor.onInvalid.addListener(() => {
    mAcceptButton.disabled = true;
  });
  await mIssueEditor.initialized;

  Dialog.initButton(mAcceptButton, async _event => {
    mAcceptButton.disabled = mCancelButton.disabled = true;
    try {
      const issue = await updateIssue();
      if (issue) {
        const url = Redmine.getIssueURL(issue.id, true);
        const completedMessage = new Dialog.InPageDialog();
        appendContents(completedMessage.contents, `
          <p>${sanitizeForHTMLText(browser.i18n.getMessage('dialog_updateIssue_complete_message'))}</p>
          <p><a href=${JSON.stringify(sanitizeForHTMLText(url))}
               >${sanitizeForHTMLText(Redmine.getIssueURL(issue.id))}</a></p>
        `);
        appendContents(completedMessage.buttons, `
          <button>${sanitizeForHTMLText(browser.i18n.getMessage('dialog_updateIssue_complete_button_label'))}</button>
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

  window.addEventListener('resize', _event => {
    configs.updateIssueDialogWidth = window.outerWidth;
    configs.updateIssueDialogHeight = window.outerHeight;
  });
  window.addEventListener(Dialog.TYPE_MOVED, event => {
    configs.updateIssueDialogLeft = event.detail.left;
    configs.updateIssueDialogTop = event.detail.top;
  });

  Dialog.notifyReady();
});

function toggleDescriptionField() {
  mDescriptionField.disabled = !mDescriptionField.disabled;
  mDescriptionField.classList.toggle('shown', !mDescriptionField.disabled);
}

async function updateIssue() {
  if (!document.querySelector('#issue').value) {
    alert(browser.i18n.getMessage('dialog_updateIssue_error_missingIssueId'));
    return;
  }

  const updateParams = mIssueEditor.getRequestParams();
  const oldIssue = await Redmine.getIssue(updateParams.id);
  if (!oldIssue || !oldIssue.id) {
    alert(browser.i18n.getMessage('dialog_updateIssue_error_missingIssue', [updateParams.id]));
    return;
  }

  try {
    const result = await Redmine.updateIssue(updateParams);
    log('updated issue: ', result);
    await mIssueEditor.saveRelations();
    return Redmine.getIssue(updateParams.id);
  }
  catch(error) {
    log('update failed: ', error);
    return null;
  }
}
