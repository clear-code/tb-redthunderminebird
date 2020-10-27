/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

import {
  log,
  appendContents,
  sanitizeForHTMLText
} from '/common/common.js';
import { Redmine } from '/common/Redmine.js';
import * as DialogCommon from '/dialog/common.js';
import { IssueChooser } from '/dialog/IssueChooser.js';
import * as Dialog from '/extlib/dialog.js';
import EventListenerManager from '/extlib/EventListenerManager.js';

export class RelationsField {
  constructor({ container, accountId, issueId, projectId } = {}) {
    this.mAccountId = accountId;
    this.mIssueId = issueId;
    this.unavailableIds = new Set();

    this.mRedmine = new Redmine({ accountId: this.mAccountId });

    this.onValid = new EventListenerManager();
    this.onInvalid = new EventListenerManager();
    this.onSizeChanged = new EventListenerManager();

    if (typeof projectId == 'function')
      Object.defineProperty(this, 'mProjectId', {
        enumerable: true,
        configurable: true,
        get: projectId
      });
    else
      this.mProjectId = projectId;

    this.mRelationsToBeRemoved = new Set();
    this.mIssueChooser = new IssueChooser({
      accountId: this.mAccountId,
      defaultId: 0,
      projectId: this.mProjectId
    });

    appendContents(container, `
      <ul class="relations" class="flex-box column"></ul>
      <button class="add-relation">${sanitizeForHTMLText(browser.i18n.getMessage('dialog_relations_add_label'))}</button>
    `);
    this.mContainer = container.querySelector('.relations');
    this.mAddButton = container.querySelector('.add-relation');

    Dialog.initButton(this.mAddButton, _event => {
      this.addRow();
    });

    Dialog.initButton(this.mContainer, async event => {
      const button = event.target && event.target.closest('button');
      if (!button)
        return;
      const row = button.closest('li');
      if (button.matches('.choose-related-issue')) {
        const issueIdField = row.querySelector('.related-issue-id');
        const issueSubjectField = row.querySelector('.related-issue-subject');
        const issue = await this.mIssueChooser.show({
          accountId: this.mAccountId,
          defaultId: parseInt(issueIdField.value || 0),
          projectId: this.mProjectId
        });
        if (issue) {
          issueIdField.value = issue.id;
          issueSubjectField.value = issue.subject;
          this.validateFields();
        }
      }
      else if (button.matches('.remove-relation')) {
        if (row.dataset.id)
          this.mRelationsToBeRemoved.add(row.dataset.id);
        this.mContainer.removeChild(row);
        this.onSizeChanged.dispatch();
      }
    });

    this.mContainer.addEventListener('change', event => {
      this.showHideDelayFieldFor(event.target.closest('select'));
    });

    this.mContainer.addEventListener('input', event => {
      const idField = event.target.closest('input.related-issue-id');

      if (idField.onChangeRelatedIssueFieldValueTimer)
        clearTimeout(idField.onChangeRelatedIssueFieldValueTimer);

      idField.onChangeRelatedIssueFieldValueTimer = setTimeout(async () => {
        delete idField.onChangeRelatedIssueFieldValueTimer;
        this.fillSubjectFor(idField);
      }, 150);
    });

    if (this.mIssueId)
      this.reinit();
  }

  async fillSubjectFor(idField) {
    if (!idField)
      return;

    const issue = idField.value ? await this.mRedmine.getIssue(idField.value) : null;
    const subjectField = idField.closest('li').querySelector('input.related-issue-subject');
    subjectField.value = issue && issue.subject || '';
    this.validateFields();
  }

  showHideDelayFieldFor(select) {
    if (!select)
      return;
    const relationDelayFields = select.closest('li').querySelector('.relation-delay-fields');
    relationDelayFields.classList.toggle('hidden', select.value != 'precedes' && select.value != 'follows');
  }

  addRow(relation = {}) {
    let anotherIssueId = relation && relation.issue_to_id || null;
    if (relation && anotherIssueId == this.mIssueId)
      anotherIssueId = relation.issue_id;
    appendContents(this.mContainer, `
      <li class="flex-box row"
          data-id=${JSON.stringify(String(relation.id || ''))}>
        <select class="relation-type">
          <option value="relates">${sanitizeForHTMLText(browser.i18n.getMessage('dialog_relations_type_relates'))}</option>
          <option value="duplicates">${sanitizeForHTMLText(browser.i18n.getMessage('dialog_relations_type_duplicates'))}</option>
          <option value="duplicated">${sanitizeForHTMLText(browser.i18n.getMessage('dialog_relations_type_duplicated'))}</option>
          <option value="blocks">${sanitizeForHTMLText(browser.i18n.getMessage('dialog_relations_type_blocks'))}</option>
          <option value="blocked">${sanitizeForHTMLText(browser.i18n.getMessage('dialog_relations_type_blocked'))}</option>
          <option value="precedes">${sanitizeForHTMLText(browser.i18n.getMessage('dialog_relations_type_precedes'))}</option>
          <option value="follows">${sanitizeForHTMLText(browser.i18n.getMessage('dialog_relations_type_follows'))}</option>
          <option value="copied_to">${sanitizeForHTMLText(browser.i18n.getMessage('dialog_relations_type_copiedTo'))}</option>
          <option value="copied_from">${sanitizeForHTMLText(browser.i18n.getMessage('dialog_relations_type_copiedFrom'))}</option>
        </select>
        <input class="related-issue-id issue-id auto-grow" type="number" min="0" data-value-type="integer"
               value=${JSON.stringify(String(anotherIssueId || ''))}>
        <input class="related-issue-subject flex-box column" type="text" disabled="true">
        <label class="relation-delay-fields hidden"
              >${sanitizeForHTMLText(browser.i18n.getMessage('dialog_relation_delay_label_before'))}
               <input class="relation-delay" type="number" data-value-type="integer" size="3"
                      value=${JSON.stringify(String(relation.delay || '0'))}>
               ${sanitizeForHTMLText(browser.i18n.getMessage('dialog_relation_delay_label_after'))}</label>
        <button class="choose-related-issue">${sanitizeForHTMLText(browser.i18n.getMessage('dialog_relation_chooseIssue'))}</button>
        <button class="remove-relation">${sanitizeForHTMLText(browser.i18n.getMessage('dialog_relation_remove'))}</button>
      </li>
    `);
    const row = this.mContainer.lastChild;
    row.$originalRelation = relation;

    const select = row.querySelector('.relation-type');
    select.value = relation.relation_type || 'relates';
    this.showHideDelayFieldFor(select);

    const idField = row.querySelector('.related-issue-id');
    DialogCommon.updateAutoGrowFieldSize(idField);
    this.onSizeChanged.dispatch();

    return this.fillSubjectFor(idField);
  }

  clearRows() {
    const range = document.createRange();
    range.selectNodeContents(this.mContainer);
    range.deleteContents();
    range.detach();
    this.onSizeChanged.dispatch();
  }

  async reinit({ issueId, relations } = {}) {
    if (issueId)
      this.mIssueId = issueId;
    if (!this.mIssueId)
      return;

    if (!relations)
      relations = await this.mRedmine.getRelations(this.mIssueId).catch(error => []);

    if (!relations)
      return;

    this.mRelationsToBeRemoved.clear();
    this.clearRows();

    await Promise.all(relations.map(relation => this.addRow(relation)));
  }

  async save({ issueId } = {}) {
    const requests = [];

    for (const id of this.mRelationsToBeRemoved) {
      requests.push(this.mRedmine.deleteRelation(id));
    }
    this.mRelationsToBeRemoved.clear();

    for (const row of this.mContainer.childNodes) {
      const relation = {
        relation_type: row.querySelector('.relation-type').value,
        issue_id:      issueId || this.mIssueId,
        issue_to_id:   parseInt(row.querySelector('.related-issue-id').value || 0)
      };
      if (row.dataset.id)
        relation.id = parseInt(row.dataset.id);
      if (relation.relation_type == 'precedes' ||
          relation.relation_type == 'follows')
        relation.delay = parseInt(row.querySelector('.relation-delay').value || 0);

      if (relation.id &&
          row.$originalRelation.relation_type == relation.relation_type &&
          (row.$originalRelation.issue_id == relation.issue_to_id ||
           row.$originalRelation.issue_to_id == relation.issue_to_id) &&
          row.$originalRelation.delay == relation.delay)
        continue;

      if (relation.issue_to_id) {
        requests.push(this.mRedmine.saveRelation(relation).then(() => {
          row.$originalRelation = relation;
        }));
      }
      else {
        if (relation.id)
          requests.push(this.mRedmine.deleteRelation(row.dataset.id));
        row.$originalRelation = {};
      }
    }

    const results = await Promise.all(requests);
    log('saved relations: ', results);
    return results;
  }

  validateFields() {
    const counts = new Map();
    for (const unavailableId of this.unavailableIds) {
      const count = counts.get(unavailableId) || 0;
      counts.set(unavailableId, count + 1);
    }

    const fields = this.mContainer.querySelectorAll('.related-issue-id');
    for (const field of fields) {
      const id = parseInt(field.value || 0);
      const count = counts.get(id) || 0;
      counts.set(id, count + 1);
    }

    counts.delete(0);

    for (const field of fields) {
      const count = counts.get(parseInt(field.value || 0)) || 0;
      field.classList.toggle('invalid', count > 1);
    }

    if (this.mContainer.querySelector('.invalid'))
      this.onInvalid.dispatch();
    else
      this.onValid.dispatch();
  }
}
