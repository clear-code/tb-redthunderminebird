/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

import '/extlib/l10n.js';
//import RichConfirm from '/extlib/RichConfirm.js';
import * as Dialog from '/extlib/dialog.js';

import {
  configs,
  log
} from '/common/common.js';
import { Message } from '/common/Message.js';
import * as Redmine from '/common/redmine.js';

let mParams;
let mMessage;

const mIssueIdField      = document.querySelector('#issueId');
const mFetchMoreButton   = document.querySelector('#fetchMore');
const mIssueIdsContainer = document.querySelector('#issueIds');
const mDescriptionField  = document.querySelector('#description');
const mAcceptButton      = document.querySelector('#accept');
const mCancelButton      = document.querySelector('#cancel');

configs.$loaded.then(async () => {
  mParams = await Dialog.getParams();

  mMessage = new Message(mParams.message);
  const params = await mMessage.toRedmineParams();

  mIssueIdField.value = params.id || '';
  mIssueIdField.addEventListener('input', _event => {
    if (mIssueIdField.throttled)
      clearTimeout(mIssueIdField.throttled);
    mIssueIdField.throttled = setTimeout(() => {
      mAcceptButton.disabled = !!mIssueIdField.value;
    }, 150);
  });

  Dialog.initButton(mFetchMoreButton, _event => {
  });

  mAcceptButton.disabled = !!params.id;
  Dialog.initButton(mAcceptButton, async _event => {
    if (!!mIssueIdField.value)
      return;
    await mMessage.setIssueId(mIssueIdField.value);
    Dialog.accept();
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
