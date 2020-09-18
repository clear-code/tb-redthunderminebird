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
import EventListenerManager from '/extlib/EventListenerManager.js';

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

    this.onValid = new EventListenerManager();
    this.onInvalid = new EventListenerManager();

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

    const postInitializations = [];
    for (const chooser of document.querySelectorAll('.issue-chooser')) {
      const idField = chooser.querySelector('.issue-id');
      const subjectField = chooser.querySelector('.issue-subject');

      const onIssueChanged = async () => {
        const issue = idField.value ? await Redmine.getIssue(idField.value) : null;
        subjectField.value = issue && issue.subject || '';

        switch (idField.dataset.field) {
          case 'id':
            await this.reinitFieldsForIssue(issue);
            break;
        }
        await this.validateFields();
      };
      postInitializations.push(
        this.initialized.then(() => onIssueChanged())
      );

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
    this.mRelationsField.onValid.addListener(() => this.onValid.dispatch());
    this.mRelationsField.onInvalid.addListener(() => this.onInvalid.dispatch());

    if (postInitializations.length)
      this.initialized = Promise.all(postInitializations);
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

    /*await */this.mRelationsField.reinit({
      issueId:   issue.id,
      relations: issue.relations
    });

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
    if (this.params.start_date)
      this.mStartDateField.value = this.params.start_date;
    if (this.params.due_date)
      this.mDueDateField.value = this.params.due_date;
  }

  onChangeFieldValue(field) {
    if (field.$onChangeFieldValueTimer)
      clearTimeout(field.$onChangeFieldValueTimer);
    field.$onChangeFieldValueTimer = setTimeout(() => {
      delete field.$onChangeFieldValueTimer;
      this.validateFields();
    }, 150);
  }

  async validateFields() {
    this.mParentIssueField.classList.toggle('invalid', !!(this.params.id && this.mParentIssueField.value && (this.mParentIssueField.value == this.params.id)));

    this.mRelationsField.unavailableIds.clear();
    if (this.params.id)
      this.mRelationsField.unavailableIds.add(this.params.id);
    if (this.mParentIssueField.value)
      this.mRelationsField.unavailableIds.add(parseInt(this.mParentIssueField.value || 0));

    await this.mRelationsField.validateFields();

    if (document.querySelector('.invalid'))
      this.onInvalid.dispatch();
    else
      this.onValid.dispatch();
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
      const field = document.querySelector(`[data-field=${JSON.stringify(paramName)}]`);
      const checkboxes = document.querySelectorAll(`[data-field=${JSON.stringify(paramName + '[]')}][type="checkbox"]`);
      if (checkboxes.length > 0) {
        const checkedValues = Array.from(
          checkboxes,
          checkbox => checkbox.dataset.valueType == 'integer' ? parseInt(checkbox.value || 0) : checkbox.value
        );
        params[paramName] = Array.from(new Set(checkedValues));
      }
      else if (field) {
        if (field.matches('select, input[data-value-type="integer"]') && field.value === '')
          continue;
        params[paramName] = (
          field.matches('input[type="checkbox"]') ? field.checked :
            field.dataset.valueType == 'integer' ? parseInt(field.value || 0) :
              field.value
        );
      }
    }

    if (this.mStartDateEnabled.checked)
      params.start_date = this.mStartDateField.value;
    else if (this.params.start_date)
      params.start_date = this.params.start_date;

    if (this.mDueDateEnabled.checked)
      params.due_date = this.mDueDateField.value;
    else if (this.params.due_date)
      params.due_date = this.params.due_date;

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
