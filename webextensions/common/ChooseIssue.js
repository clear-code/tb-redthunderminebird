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

export class ChooseIssue {
  constructor({ container, defaultId, projectId } = {}) {
    this.onChanged = new EventListenerManager();

    this.mDefaultId = defaultId;
    this.mProjectId = projectId;
    this.mLastOffset = 0;

    const range = document.createRange();
    range.selectNodeContents(container);
    const fragment = range.createContextualFragment(`
      <div><label>${sanitizeForHTMLText(browser.i18n.getMessage('dialog_chooseIssue_issueId_label'))}
                  <input class="choose-issue issue-id" type="number" style="width: 5em; text-align: right;"></label>
           <button class="choose-issue fetch-more">${sanitizeForHTMLText(browser.i18n.getMessage('dialog_chooseIssue_more_label'))}</button></div  >
      <ul class="choose-issue issues flex-box column"></ul>
      <textarea class="choose-issue description" rows="10" readonly="true"></textarea>
    `.trim());
    range.insertNode(fragment);
    range.detach();
    this.mIssueIdField      = container.querySelector('.issue-id');
    this.mFetchMoreButton   = container.querySelector('.fetch-more');
    this.mIssuesContainer   = container.querySelector('.issues');
    this.mDescriptionField  = container.querySelector('.description');

    this.mIssueIdField.addEventListener('input', _event => {
      if (this.mIssueIdField.throttled)
        clearTimeout(this.mIssueIdField.throttled);
      this.mIssueIdField.throttled = setTimeout(() => {
        this.onChanged.dispatch();
      }, 150);
    });
    this.mIssuesContainer.addEventListener('change', _event => {
      this.onIssueChange();
    });

    Dialog.initButton(this.mFetchMoreButton, _event => {
      this.fetchMore();
    });

    this.fetchMore().then(() => this.onIssueChange());
  }

  show() {
    this.mDialog.classList.add('shown');
  }

  createDialog() {
    const range = document.createRange();
    range.selectNodeContents(document.body);
    range.collapse(false);
    const fragment = range.createContextualFragment(`
      <div id="choose-issue-dialog-container">
        <div id="choose-issue-dialog">
          <div id="choose-issue-dialog-contents-ui"></div>
          <div class="dialog-buttons">
            <button id="choose-issue-accept" type="submit">${sanitizeForHTMLText(browser.i18n.getMessage('dialog_createIssue_accept_label'))}</  button>
            <button id="choose-issue-cancel">${sanitizeForHTMLText(browser.i18n.getMessage('dialog_createIssue_cancel_label'))}</button>
          </div>
        </div>
      </div>
    `.trim());
    range.insertNode(fragment);
    range.detach();

    this.mDialog = document.body.lastChild;

    Dialog.initButton(this.mDialog.querySelector('.choose-issue-accept'), async _event => {
    });
    Dialog.initButton(this.mDialog.querySelector('.choose-issue-cancel'), async _event => {
    });
  }

  get issueId() {
    return parseInt(this.mIssueIdField.value || 0);
  }

  onIssueChange() {
    const checkedRadio = this.mIssuesContainer.querySelector('input[type="radio"]:checked');
    if (!checkedRadio)
      return;
    this.mDescriptionField.value = checkedRadio.closest('li').dataset.description;
    this.mIssueIdField.value = checkedRadio.value;
    this.onChanged.dispatch();
  }

  async fetchMore() {
    const issues = await Redmine.getIssues(this.mProjectId, {
      offset: this.mLastOffset,
      limit:  10
    });
    const fragment = document.createDocumentFragment();
    for (const issue of issues) {
      fragment.appendChild(this.createItem(issue));
    }
    this.mIssuesContainer.appendChild(fragment);
    this.mLastOffset += issues.length;
  }

  createItem(issue) {
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
    radio.checked = issue.id == this.mDefaultId;
    radio.$issue = issue;
    const subject = label.appendChild(document.createElement('span'));
    subject.classList.add('subject');
    subject.textContent = `#${issue.id} ${issue.subject}`;
    row.setAttribute('title', subject.textContent);
    return row;
  }
}
