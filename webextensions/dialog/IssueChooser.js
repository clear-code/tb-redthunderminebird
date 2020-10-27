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
import { Redmine } from '/common/Redmine.js';
import * as Dialog from '/extlib/dialog.js';
import EventListenerManager from '/extlib/EventListenerManager.js';
import * as DialogCommon from '/dialog/common.js';

export class IssueChooser {
  constructor({ container, accountId, defaultId, projectId } = {}) {
    this.onChanged = new EventListenerManager();
    this.onChose = new EventListenerManager();

    this.mAccountId = accountId;
    this.mDefaultId = defaultId;
    if (typeof projectId == 'function')
      Object.defineProperty(this, 'mProjectId', {
        enumerable: true,
        configurable: true,
        get: projectId
      });
    else
      this.mProjectId = projectId;
    this.mLastOffset = 0;

    this.mRedmine = new Redmine({ accountId: this.mAccountId });

    if (!container)
      container = this.createDialog();

    appendContents(container, `
      <div><label>${sanitizeForHTMLText(browser.i18n.getMessage('dialog_chooseIssue_issueId_label'))}
                  <input class="choose-issue issue-id auto-grow" type="number" min="0"></label>
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
    this.mIssuesContainer.addEventListener('dblclick', event => {
      if (!event.target.closest('li') ||
          !this.issue)
        return;
      this.onChose.dispatch(this.issue);
      this.mDialog.hide();
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
    this.mDialog.show();
    return new Promise((resolve, _reject) => {
      const onChose = issue => {
        this.onChose.removeListener(onChose);
        resolve(issue);
      };
      this.onChose.addListener(onChose);
    });
  }

  hide() {
    this.mDialog.hide();
  }

  createDialog() {
    this.mDialog =  new Dialog.InPageDialog();
    appendContents(this.mDialog.buttons, `
      <button class="choose-issue-accept">${sanitizeForHTMLText(browser.i18n.getMessage('dialog_createIssue_accept_label'))}</button>
      <button class="choose-issue-cancel">${sanitizeForHTMLText(browser.i18n.getMessage('dialog_createIssue_cancel_label'))}</button>
    `);
    this.mDialog.hide(); // init tabIndex

    Dialog.initButton(this.mDialog.buttons.firstChild, async _event => {
      this.onChose.dispatch(this.issue);
      this.hide();
    });
    Dialog.initButton(this.mDialog.buttons.lastChild, async _event => {
      this.onChose.dispatch(null);
      this.hide();
    });

    return this.mDialog.contents;
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
    DialogCommon.updateAutoGrowFieldSize(this.mIssueIdField);

    const containerBox = this.mIssuesContainer.getBoundingClientRect();
    const itemBox      = checkedRadio.closest('li').getBoundingClientRect();
    if (containerBox.top > itemBox.top + itemBox.height)
      this.mIssuesContainer.scrollBy(0, itemBox.top - containerBox.top - itemBox.height);
    else if (containerBox.top + containerBox.height < itemBox.top)
      this.mIssuesContainer.scrollBy(0, itemBox.top - containerBox.top + itemBox.height);

    this.onChanged.dispatch(checkedRadio.$issue);
  }

  async fetchMore() {
    const lastIssue = this.issue;
    const issues = await this.mRedmine.getIssues(this.mProjectId, {
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
      DialogCommon.updateAutoGrowFieldSize(this.mIssuesContainer.lastChild.querySelector('input[type="number"].issue-id'));
    }
    this.mLastOffset += issues.length;

    if ((this.issue || {}).id != (lastIssue || {}).id)
      this.onIssueChange();
  }
}
