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
import { IssueChooser } from '/dialog/IssueChooser.js';
import * as Dialog from '/extlib/dialog.js';

export class RelationsField {
  constructor({ container, issueId, projectId } = {}) {
    this.mIssueId = issueId;

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
    this.mContainer.addEventListener('change', event => {
      const select = event.target && event.target.closest('select');
      if (!select)
        return;
      const row = select.closest('li');
      const relationDelayFields = row.querySelector('.relation-delay-fields');
      const shouldShowDelayFields = select.value == 'precedes' || select.value == 'follows';
      relationDelayFields.style.display = shouldShowDelayFields ? '' : 'none';
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
          defaultId: parseInt(issueIdField.value || 0),
          projectId: this.mProjectId
        });
        if (issue) {
          issueIdField.value = issue.id;
          issueSubjectField.value = issue.subject;
        }
      }
      else if (button.matches('.remove-relation')) {
        if (row.dataset.id)
          this.mRelationsToBeRemoved.add(row.dataset.id);
        this.mContainer.removeChild(row);
      }
    });
  }

  addRow() {
    appendContents(this.mContainer, `
      <li class="flex-box row"
          data-id="">
        <select class="relation-type" value="relates">
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
        <input class="related-issue-id" type="number" data-value-type="integer">
        <span class="flex-box row">
          <input class="related-issue-subject" type="text" disabled="true">
          <label class="relation-delay-fields"
                 style="display:none"
                >${sanitizeForHTMLText(browser.i18n.getMessage('dialog_relation_delay_label_before'))}
                 <input class="relation-delay" type="number" data-value-type="integer" value="0" size="3">
                 ${sanitizeForHTMLText(browser.i18n.getMessage('dialog_relation_delay_label_after'))}</label>
        </span>
        <button class="choose-related-issue">${sanitizeForHTMLText(browser.i18n.getMessage('dialog_relation_chooseIssue'))}</button>
        <button class="remove-relation">${sanitizeForHTMLText(browser.i18n.getMessage('dialog_relation_remove'))}</button>
      </li>
    `);
  }

  async save({ issueId } = {}) {
    const requests = [];

    for (const id of this.mRelationsToBeRemoved) {
      requests.push(Redmine.deleteRelation(id));
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
          row.$originalRelation &&
          row.$originalRelation.relation_type == relation.relation_type &&
          row.$originalRelation.issue_to_id == relation.issue_to_id &&
          row.$originalRelation.delay == relation.delay)
        continue;

      if (relation.issue_to_id) {
        requests.push(Redmine.saveRelation(relation));
      }
      else {
        if (relation.id)
          requests.push(Redmine.deleteRelation(row.dataset.id));
        delete row.$originalRelation;
      }
    }

    const results = await Promise.all(requests);
    console.log('saved relations: ', results);
    return results;
  }
}
