/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

import * as Dialog from '/extlib/dialog.js';

import {
  log,
  appendContents,
  sanitizeForHTMLText
} from '/common/common.js';
import * as Redmine from '/common/redmine.js';
import { IssueChooser } from '/dialog/IssueChooser.js';
import { RelationsField } from '/dialog/RelationsField.js';

export class IssueEditor {
  constructor(params) {
    this.params = params;

    this.mProjectField      = document.querySelector('#project'); // create
    this.mIssueField        = document.querySelector('#issue'); // update
    this.mParentIssueField  = document.querySelector('#parentIssue');
    this.mParentIssueSubject = document.querySelector('#parentIssueSubject');
    this.mStartDateEnabled  = document.querySelector('#startDateEnabled');
    this.mStartDateField    = document.querySelector('#startDate');
    this.mDueDateEnabled    = document.querySelector('#dueDateEnabled');
    this.mDueDateField      = document.querySelector('#dueDate');

    this.initialized = Promise.all([
      Redmine.getMembers(this.params.project_id),
      this.mProjectField && this.initProjects(), // create
      this.mProjectField && this.initTrackers(this.params.project_id), // create
      this.initStatuses(),
      this.initVersions(this.params.project_id)
    ]).then(async ([members,]) => {
      await Promise.all([
        this.initAssignees(this.params.project_id, members),
        this.mProjectField && this.initWatchers(this.params.project_id, members) // create
      ]);

      if (this.params.id)
        await this.reinitFieldsForIssue(await Redmine.getIssue(this.params.id));
      else
        this.applyFieldValues();

      for (const field of document.querySelectorAll('[data-field]')) {
        field.addEventListener('change', () => {
          this.onChangeFieldValue(field);
          if (field == this.mProjectField)
            this.reinitFieldsForProject();
        });
        if (field.matches('textarea, input[type="text"], input[type="number"]'))
          field.addEventListener('input', () => {
            this.onChangeFieldValue(field);
          });
      }
    });

    this.mStartDateEnabled.checked = false;
    this.mStartDateEnabled.addEventListener('change', () => {
      this.mStartDateField.disabled = !this.mStartDateEnabled.checked;
    });
    this.mStartDateField.disabled = true;

    this.mDueDateEnabled.checked = false;
    this.mDueDateEnabled.addEventListener('change', () => {
      this.mDueDateField.disabled = !this.mDueDateEnabled.checked;
    });
    this.mDueDateField.disabled = true;

    this.mIssueChooser = new IssueChooser({
      defaultId: 0,
      projectId: this.params.project_id
    });
    for (const chooser of document.querySelectorAll('.issue-chooser')) {
      const idField = chooser.querySelector('.issue-id');
      const subjectField = chooser.querySelector('.issue-subject');

      const onIssueChanged = async () => {
        if (idField.value) {
          const issue = await Redmine.getIssue(idField.value);
          subjectField.value = issue.subject || '';
          if (idField.dataset.field == 'id')
            this.reinitFieldsForIssue(issue);
        }
        else {
          subjectField.value = '';
          if (idField.dataset.field == 'id')
            this.reinitFieldsForIssue();
        }
      };
      this.initialized.then(() => {
        onIssueChanged();
      });

      let onChangeFieldValueTimer;
      idField.addEventListener('input', () => {
        if (onChangeFieldValueTimer)
          clearTimeout(onChangeFieldValueTimer);
        onChangeFieldValueTimer = setTimeout(() => {
          onChangeFieldValueTimer = null;
          onIssueChanged();
        }, 150);
      });

      Dialog.initButton(chooser.querySelector('.issue-choose'), async _event => {
        const issue = await this.mIssueChooser.show({
          defaultId: parseInt(idField.value || 0),
          projectId: this.mProjectField ? this.mProjectField.value : this.params.project_id
        });
        if (issue) {
          idField.value = issue.id;
          subjectField.value = issue.subject;
          this.onChangeFieldValue(idField);
        }
      });
    }

    this.mRelationsField = new RelationsField({
      container: document.querySelector('#relations'),
      projectId: () => this.mProjectField ? this.mProjectField.value : this.params.project_id
    });
  }

  initSelect(field, items, itemTranslator) {
    const oldValue = field.value;

    const range = document.createRange();
    range.selectNodeContents(field);
    range.deleteContents();
    range.detach();

    let hasOldValueOption = false;
    for (const item of items) {
      const translated = itemTranslator(item);
      if (!translated)
        continue;
      appendContents(field, `
        <option value=${JSON.stringify(sanitizeForHTMLText(translated.value))}
               >${sanitizeForHTMLText(translated.label)}</option>
      `);
      if (oldValue && translated.value == oldValue)
        hasOldValueOption = true;
    }

    if (oldValue && hasOldValueOption)
      field.value = oldValue;
    else
      field.value = '';
  }

  async initProjects() {
    const projects = await Redmine.getProjects();
    this.initSelect(
      this.mProjectField,
      projects,
      project => ({ label: project.fullname, value: project.id })
    );
  }

  async initTrackers(projectId) {
    const trackers = await Redmine.getTrackers(projectId);
    this.initSelect(
      document.querySelector('#tracker'),
      trackers,
      tracker => ({ label: tracker.name, value: tracker.id })
    );
  }

  async initStatuses() {
    const statuses = await Redmine.getIssueStatuses();
    this.initSelect(
      document.querySelector('#status'),
      statuses,
      status => ({ label: status.name, value: status.id })
    );
  }

  async initVersions(projectId) {
    const versions = await Redmine.getVersions(projectId);
    this.initSelect(
      document.querySelector('#version'),
      versions,
      version => ({ label: version.name, value: version.id })
    );
  }

  async initAssignees(projectId, cachedMembers) {
    const members = cachedMembers || await Redmine.getMembers(projectId);
    this.initSelect(
      document.querySelector('#assigned'),
      members,
      member => {
        if (!member.user)
          return null;
        return { label: member.user.name, value: member.user.id };
      }
    );
  }

  async initWatchers(projectId, cachedMembers) {
    const members = cachedMembers || await Redmine.getMembers(projectId);
    const container = document.querySelector('#watcherUsers');
  
    const range = document.createRange();
    range.selectNodeContents(container);
    range.deleteContents();
    range.detach();
  
    for (const member of members) {
      if (!member.user)
        continue;
      appendContents(container, `
        <label><input type="checkbox"
                      value=${JSON.stringify(sanitizeForHTMLText(member.user.id))}
                      data-field="watcher_user_ids[]"
                      data-value-type="integer"
                     >${sanitizeForHTMLText(member.user.name)}</label>
      `);
    }
  }

  async reinitFieldsForProject() {
    const projectId = this.mProjectField ? this.mProjectField.value : this.params.project_id;
    const [members, ] = await Promise.all([
      Redmine.getMembers(projectId),
      this.mProjectField && this.initTrackers(projectId), // create
      this.initVersions(projectId)
    ]);
    await Promise.all([
      this.initAssignees(projectId, members),
      this.mProjectField && this.initWatchers(projectId, members) // create
    ]);
    this.applyFieldValues();
  }

  async reinitFieldsForIssue(issue) {
    if (!issue || !issue.id)
      issue = {
        id: parseInt(this.mIssueField && this.mIssueField.value || 0)
      };

    this.params.id = issue.id;

    this.params.description = issue.description || '';
    this.params.status_id = issue.status && issue.status.id || null;
    this.params.assigned_to_id = issue.assigned_to && issue.assigned_to.id || null;
    this.params.fixed_version_id = issue.fixed_version && issue.fixed_version.id || null;

    if (issue.parent) {
      this.mParentIssueField.value = issue.parent.id;
      if (issue.parent.subject) {
        this.mParentIssueSubject.value = issue.parent.subject;
      }
      else {
        const parent = await Redmine.getIssue(issue.parent.id);
        this.mParentIssueSubject.value = parent.subject;
      }
    }
    else {
      this.mParentIssueField.value = '';
      this.mParentIssueSubject.value = '';
    }

    this.mStartDateField.value = issue.start_date || '';
    this.mDueDateField.value = issue.due_date || '';

    this.applyFieldValues();
  }

  applyFieldValues() {
    for (const field of document.querySelectorAll('[data-field]')) {
      if (!(field.dataset.field in this.params))
        continue;
      const name = field.dataset.field;
      const paramName = name.replace(/\[\]$/, '');
      const value = this.params[paramName];
      const values = name.endsWith('[]') ? (value || []) : null;
      if (field.matches('input[type="checkbox"]')) {
        if (values)
          field.checked = value.includes(field.value);
        else
          field.checked = !!value;
      }
      else {
        field.value = value;
      }
    }
  }

  onChangeFieldValue(field) {
    if (field.$onChangeFieldValueTimer)
      clearTimeout(field.$onChangeFieldValueTimer);
    field.$onChangeFieldValueTimer = setTimeout(() => {
      delete field.$onChangeFieldValueTimer;
      const fieldValue = field.dataset.valueType == 'integer' ? parseInt(field.value || 0) : field.value;
      const name = field.dataset.field;
      const paramName = name.replace(/\[\]$/, '');
      const value = this.params[paramName];
      const values = name.endsWith('[]') ? (value || []) : null;
      if (field.matches('input[type="checkbox"]')) {
        if (values) {
          const valuesSet = new Set(value);
          if (field.checked)
            valuesSet.add(fieldValue);
          else
            valuesSet.remove(fieldValue);
          this.params[paramName] = Array.from(valuesSet);
        }
        else {
          this.params[paramName] = field.checked;
        }
      }
      else {
        this.params[paramName] = fieldValue;
      }
      log('field value changed: ', field, fieldValue, this.params);
    }, 150);
  }

  getRequestParams() {
    const paramNames = new Set();
    for (const field of document.querySelectorAll('[data-field]')) {
      if (field.disabled)
        continue;
      const name = field.dataset.field;
      paramNames.add(name.replace(/\[\]$/, ''));
    }
    const params = {};
    for (const paramName of paramNames) {
      params[paramName] = this.params[paramName];
    }
    params.start_date = this.mStartDateEnabled.checked ? this.mStartDateField.value : '';
    params.due_date = this.mDueDateEnabled.checked ? this.mDueDateField.value : '';

    return params;
  }

  set issueId(issueId) {
    this.params.id = issueId;
  }

  saveRelations() {
    if (this.params.id)
      return this.mRelationsField.save({ issueId: this.params.id });
  }
}
