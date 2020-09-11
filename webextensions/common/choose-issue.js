/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

import {
  sanitizeForHTMLText
} from '/common/common.js';
import * as Redmine from '/common/redmine.js';
import * as Dialog from '/extlib/dialog.js';
import EventListenerManager from '/extlib/EventListenerManager.js';

let mDefaultId;
let mProjectId;
let mIssueIdField;
let mFetchMoreButton;
let mIssuesContainer;
let mDescriptionField;

export const onChanged = new EventListenerManager();

export async function init(container, { defaultId, projectId }) {
  mDefaultId = defaultId;
  mProjectId = projectId;

  const range = document.createRange();
  range.selectNodeContents(container);
  const fragment = range.createContextualFragment(`
    <div><label>${sanitizeForHTMLText(browser.i18n.getMessage('dialog_chooseIssue_issueId_label'))}
                <input class="choose-issues issue-id" type="number" style="width: 5em; text-align: right;"></label>
         <button class="choose-issues fetch-more">${sanitizeForHTMLText(browser.i18n.getMessage('dialog_chooseIssue_more_label'))}</button></div>
    <ul class="choose-issues issues flex-box column"></ul>
    <textarea class="choose-issues description" rows="10" readonly="true"></textarea>
  `.trim());
  range.insertNode(fragment);
  range.detach();
  mIssueIdField      = container.querySelector('.issue-id');
  mFetchMoreButton   = container.querySelector('.fetch-more');
  mIssuesContainer   = container.querySelector('.issues');
  mDescriptionField  = container.querySelector('.description');

  mIssueIdField.addEventListener('input', _event => {
    if (mIssueIdField.throttled)
      clearTimeout(mIssueIdField.throttled);
    mIssueIdField.throttled = setTimeout(() => {
      onChanged.dispatch();
    }, 150);
  });
  mIssuesContainer.addEventListener('change', _event => {
    onIssueChange();
  });

  Dialog.initButton(mFetchMoreButton, _event => {
    fetchMore();
  });

  await fetchMore();
  onIssueChange();
}

export function getIssueId() {
  return parseInt(mIssueIdField.value || 0);
}

function onIssueChange() {
  const checkedRadio = mIssuesContainer.querySelector('input[type="radio"]:checked');
  if (!checkedRadio)
    return;
  mDescriptionField.value = checkedRadio.closest('li').dataset.description;
  mIssueIdField.value = checkedRadio.value;
  onChanged.dispatch();
}

let mLastOffset = 0;

async function fetchMore() {
  const issues = await Redmine.getIssues(mProjectId, {
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
  row.classList.add('flex-box');
  row.classList.add('column');
  row.dataset.description = issue.description.replace(/\r\n?/g, '\n');
  const label = row.appendChild(document.createElement('label'));
  label.classList.add('flex-box');
  label.classList.add('row');
  const radio = label.appendChild(document.createElement('input'));
  radio.type = 'radio';
  radio.name = 'issueIds';
  radio.value = issue.id;
  radio.checked = issue.id == mDefaultId;
  radio.$issue = issue;
  const subject = label.appendChild(document.createElement('span'));
  subject.classList.add('subject');
  subject.textContent = `#${issue.id} ${issue.subject}`;
  row.setAttribute('title', subject.textContent);
  return row;
}
