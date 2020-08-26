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

Dialog.setLogger(log);

let mParams;
let mMessage;
let mRedmineParams;

const mIssueIdField      = document.querySelector('#issueId');
const mFetchMoreButton   = document.querySelector('#fetchMore');
const mIssuesContainer   = document.querySelector('#issues');
const mDescriptionField  = document.querySelector('#description');
const mAcceptButton      = document.querySelector('#accept');
const mCancelButton      = document.querySelector('#cancel');

configs.$loaded.then(async () => {
  mParams = await Dialog.getParams();

  mMessage = new Message(mParams.message);
  mRedmineParams = await mMessage.toRedmineParams();

  mIssueIdField.addEventListener('input', _event => {
    if (mIssueIdField.throttled)
      clearTimeout(mIssueIdField.throttled);
    mIssueIdField.throttled = setTimeout(() => {
      mAcceptButton.disabled = !!mIssueIdField.value;
    }, 150);
  });
  mIssuesContainer.addEventListener('change', _event => {
    onIssueChange();
  });
  mAcceptButton.disabled = !!mRedmineParams.id;

  await fetchMore();
  onIssueChange();

  Dialog.initButton(mFetchMoreButton, _event => {
    fetchMore();
  });

  Dialog.initButton(mAcceptButton, async _event => {
    if (!mIssueIdField.value)
      return;
    try {
    await mMessage.setIssueId(mIssueIdField.value);
    Dialog.accept();
    }catch(error){console.log(error);}
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

function onIssueChange() {
  const checkedRadio = mIssuesContainer.querySelector('input[type="radio"]:checked');
  if (!checkedRadio)
    return;
  mDescriptionField.value = checkedRadio.closest('li').dataset.description;
  mIssueIdField.value = checkedRadio.value;
  mAcceptButton.disabled = false;
}

let mLastOffset = 0;

async function fetchMore() {
  const issues = await Redmine.getIssues(mRedmineParams.project_id, {
    offset: mLastOffset,
    limit:  10
  });
  const fragment = document.createDocumentFragment();
  for (const issue of issues) {
    fragment.appendChild(createItem(issue));
  }
  mIssuesContainer.appendChild(fragment);
  mLastOffset += issues.length;
}

function createItem(issue) {
  const row = document.createElement('li');
  row.dataset.description = issue.description.replace(/\r\n?/g, '\n');
  const label = row.appendChild(document.createElement('label'));
  const radio = label.appendChild(document.createElement('input'));
  radio.type = 'radio';
  radio.name = 'issueIds';
  radio.value = issue.id;
  radio.checked = issue.id == mRedmineParams.id;
  const subject = label.appendChild(document.createElement('span'));
  subject.classList.add('subject');
  subject.textContent = `#${issue.id} ${issue.subject}`;
  row.setAttribute('title', subject.textContent);
  return row;
}
