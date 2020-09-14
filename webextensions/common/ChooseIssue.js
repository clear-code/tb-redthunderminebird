/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

import {
  appendContents,
  sanitizeForHTMLText
} from '/common/common.js';
import * as Redmine from '/common/redmine.js';
import * as Dialog from '/extlib/dialog.js';
import EventListenerManager from '/extlib/EventListenerManager.js';

export class ChooseIssue {
  constructor({ container, defaultId, projectId } = {}) {
    this.onChanged = new EventListenerManager();
    this.onAccepted = new EventListenerManager();

    this.mDefaultId = defaultId;
    this.mProjectId = projectId;
    this.mLastOffset = 0;

    if (!container)
      container = this.createDialog();

    appendContents(container, `
      <div><label>${sanitizeForHTMLText(browser.i18n.getMessage('dialog_chooseIssue_issueId_label'))}
                  <input class="choose-issue issue-id" type="number" style="width: 5em; text-align: right;"></label>
           <button class="choose-issue fetch-more">${sanitizeForHTMLText(browser.i18n.getMessage('dialog_chooseIssue_more_label'))}</button></div>
      <ul class="choose-issue issues flex-box column"></ul>
      <textarea class="choose-issue description" rows="10" readonly="true"></textarea>
    `);
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
  }

  async show({ defaultId, projectId } = {}) {
    if (defaultId)
      this.mDefaultId = defaultId;
    if (projectId)
      this.mProjectId = projectId;
    this.mLastOffset = 0;
    const range = document.createRange();
    range.selectNodeContents(this.mIssuesContainer);
    range.deleteContents();
    range.detach();
    await this.fetchMore();
    this.mDialog.classList.add('shown');
  }

  hide() {
    this.mDialog.classList.remove('shown');
  }

  createDialog() {
    appendContents(document.body, `
      <div class="choose-issue-dialog-container">
        <div class="choose-issue-dialog">
          <div class="choose-issue-dialog-contents-ui flex-box column"></div>
          <div class="dialog-buttons">
            <button class="choose-issue-accept">${sanitizeForHTMLText(browser.i18n.getMessage('dialog_createIssue_accept_label'))}</button>
            <button class="choose-issue-cancel">${sanitizeForHTMLText(browser.i18n.getMessage('dialog_createIssue_cancel_label'))}</button>
          </div>
        </div>
      </div>
    `);
    this.mDialog = document.body.lastChild;

    Dialog.initButton(this.mDialog.querySelector('.choose-issue-accept'), async _event => {
      this.onAccepted.dispatch(this.issue);
      this.hide();
    });
    Dialog.initButton(this.mDialog.querySelector('.choose-issue-cancel'), async _event => {
      this.hide();
    });

    return this.mDialog.querySelector('.choose-issue-dialog');
  }

  get issue() {
    const checkedRadio = this.mIssuesContainer.querySelector('input[type="radio"]:checked');
    return checkedRadio && checkedRadio.$issue || null;
  }

  get issueId() {
    return parseInt(this.mIssueIdField.value || 0);
  }

  onIssueChange() {
    const checkedRadio = this.mIssuesContainer.querySelector('input[type="radio"]:checked');
    if (!checkedRadio)
      return;
    this.mDescriptionField.value = checkedRadio.$issue.description.replace(/\r\n?/g, '\n');
    this.mIssueIdField.value = checkedRadio.value;
    this.onChanged.dispatch(checkedRadio.$issue);
  }

  async fetchMore() {
    const lastIssue = this.issue;
    const issues = await Redmine.getIssues(this.mProjectId, {
      offset: this.mLastOffset,
      limit:  10
    });
    for (const issue of issues) {
      appendContents(this.mIssuesContainer, `
        <li class="flex-box column"
            title=${JSON.stringify(sanitizeForHTMLText(issue.subject))}
           ><label class="flex-box row"
                  ><input type="radio"
                          name="issueIds"
                          value=${JSON.stringify(sanitizeForHTMLText(issue.id))}
                          ${issue.id == this.mDefaultId ? 'checked' : ''}
                         ><span class="subject"
                               >#${sanitizeForHTMLText(issue.id)} ${sanitizeForHTMLText(issue.subject)}</span></label></li>
      `);
      this.mIssuesContainer.lastChild.querySelector('input[type="radio"]').$issue = issue;
    }
    this.mLastOffset += issues.length;

    if ((this.issue || {}).id != (lastIssue || {}).id)
      this.onIssueChange();
  }
}
