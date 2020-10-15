/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

import * as Dialog from '/extlib/dialog.js';

import {
  configs,
  log,
  appendContents,
  sanitizeForHTMLText
} from '/common/common.js';
import { Redmine } from '/common/Redmine.js';
import { IssueChooser, updateIdFieldSize } from '/dialog/IssueChooser.js';
import { FilesField } from '/dialog/FilesField.js';
import { RelationsField } from '/dialog/RelationsField.js';
import EventListenerManager from '/extlib/EventListenerManager.js';

export class IssueEditor {
  constructor({ accountId, ...params } = {}) {
    this.mAccountId = accountId;
    this.params = params;
    this.completelyInitialized = false;

    this.mRedmine = new Redmine({ accountId: this.mAccountId });

    this.mProjectField      = document.querySelector('#project'); // create
    this.mIssueField        = document.querySelector('#issue'); // update
    this.mParentIssueField  = document.querySelector('#parentIssue');
    this.mParentIssueSubject = document.querySelector('#parentIssueSubject');
    this.mStartDateEnabled  = document.querySelector('#startDateEnabled');
    this.mStartDateField    = document.querySelector('#startDate');
    this.mDueDateEnabled    = document.querySelector('#dueDateEnabled');
    this.mDueDateField      = document.querySelector('#dueDate');
    this.mFieldsContainer   = document.querySelector('#fields');

    updateIdFieldSize(this.mIssueField);
    updateIdFieldSize(this.mParentIssueField);

    for (const row of document.querySelectorAll('[data-field-row]')) {
      row.classList.toggle('hidden', !this.isFieldVisible(row.dataset.fieldRow));
    }

    this.onValid = new EventListenerManager();
    this.onInvalid = new EventListenerManager();

    this.initialized = Promise.all([
      this.mRedmine.getMembers(this.params.project_id),
      this.mProjectField && this.initProjects(), // create
      this.mProjectField && this.initTrackers(this.params.project_id), // create
      this.initStatuses(),
      this.initVersions(this.params.project_id)
    ]).then(async ([members,]) => {
      log('IssueEditor initialization, members = ', members);
      await Promise.all([
        this.initAssignees(this.params.project_id, members),
        this.mProjectField && this.initWatchers(this.params.project_id, members) // create
      ]);
      log('IssueEditor assignees and watchers are initialized');

      if (!this.mIssueField) // create
        this.rebuildCustomFields();

      log('IssueEditor custom fileds are rebuilt');

      this.applyFieldValues();

      log('IssueEditor values are applied');

      for (const field of document.querySelectorAll('[data-field]')) {
        field.addEventListener('change', async () => {
          await this.onChangeFieldValue(field);
          if (field == this.mProjectField)
            this.reinitFieldsForProject();
        });
        if (field.matches('textarea, input[type="text"], input[type="number"]'))
          field.addEventListener('input', () => {
            this.onChangeFieldValue(field);
          });
      }

      this.completelyInitialized = true;
      log('IssueEditor initialization completed');
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
      accountId: this.mAccountId,
      defaultId: 0,
      projectId: this.params.project_id
    });

    const postInitializations = [];
    for (const chooser of document.querySelectorAll('.issue-chooser')) {
      const idField = chooser.querySelector('.issue-id');
      const subjectField = chooser.querySelector('.issue-subject');

      const onIssueChanged = async () => {
        const issue = idField.value ? await this.mRedmine.getIssue(idField.value) : null;
        subjectField.value = issue && issue.subject || '';
        updateIdFieldSize(idField);

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
          accountId: this.mAccountId,
          defaultId: parseInt(idField.value || 0),
          projectId: this.mProjectField ? this.mProjectField.value : this.params.project_id
        });
        if (issue) {
          idField.value = issue.id;
          updateIdFieldSize(idField);
          subjectField.value = issue.subject;
          this.onChangeFieldValue(idField);
        }
      });
    }

    if (this.isFieldVisible('relations')) {
      this.mRelationsField = new RelationsField({
        accountId: this.mAccountId,
        container: document.querySelector('#relations'),
        projectId: () => this.mProjectField ? this.mProjectField.value : this.params.project_id
      });
      this.mRelationsField.onValid.addListener(() => this.onValid.dispatch());
      this.mRelationsField.onInvalid.addListener(() => this.onInvalid.dispatch());
      this.mRelationsField.onSizeChanged.addListener(() => this.sizeToContent());
    }

    if (this.isFieldVisible('file')) {
      this.mFilesField = new FilesField({
        container: document.querySelector('#files')
      });
      this.mFilesField.onSizeChanged.addListener(() => this.sizeToContent());
      const ignoreDropTargets = 'input[type="text"], input[type="number"], textarea';
      document.addEventListener('dragenter', event => {
        if (event.target.closest(ignoreDropTargets))
          return;

        event.stopPropagation();
        event.preventDefault();
      });
      document.addEventListener('dragover', event => {
        if (event.target.closest(ignoreDropTargets))
          return;

        event.stopPropagation();
        event.preventDefault();

        const dt = event.dataTransfer;
        const hasFile = Array.from(dt.items, item => item.kind).some(kind => kind == 'file');
        dt.dropEffect = hasFile ? 'link' : 'none';
      });
      document.addEventListener('drop', event => {
        if (event.target.closest(ignoreDropTargets))
          return;

        event.stopPropagation();
        event.preventDefault();

        const dt = event.dataTransfer;
        const files = dt.files;
        if (files && files.length > 0)
          this.mFilesField.addFiles(files);
      });
    }

    const resizeObserver = new ResizeObserver(_entries => {
      this.sizeToContent();
    });
    for (const textarea of document.querySelectorAll('textarea')) {
      resizeObserver.observe(textarea);
    }

    if (postInitializations.length)
      this.initialized = Promise.all(postInitializations);
  }

  isFieldVisible(name) {
    const accountInfo = configs.accounts[this.mAccountId] || {};
    const useAccountValue = 'useGlobalVisibleFields' in accountInfo && !accountInfo.useGlobalVisibleFields;
    const fieldVisibility = configs.accountVisibleFields[this.mAccountId] || {};
    return useAccountValue ? !!fieldVisibility[name] : configs[`fieldVisibility_${name}`];
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
    const projects = await this.mRedmine.getProjects().catch(error => []);
    this.initSelect(
      this.mProjectField,
      projects,
      project => ({ label: project.indentedName, value: project.id })
    );
    document.querySelector('[data-field-row="project"]').classList.toggle('hidden', projects.length == 0 || !this.isFieldVisible('project'));
  }

  async initTrackers(projectId) {
    const trackers = await this.mRedmine.getTrackers(projectId).catch(error => []);
    this.initSelect(
      document.querySelector('#tracker'),
      trackers,
      tracker => ({ label: tracker.name, value: tracker.id })
    );
    document.querySelector('[data-field-row="tracker"]').classList.toggle('hidden', trackers.length == 0 || !this.isFieldVisible('tracker'));
  }

  async initStatuses() {
    const statuses = await this.mRedmine.getIssueStatuses().catch(error => []);
    this.initSelect(
      document.querySelector('#status'),
      statuses,
      status => ({ label: status.name, value: status.id })
    );
    document.querySelector('[data-field-row="status"]').classList.toggle('hidden', statuses.length == 0 || !this.isFieldVisible('status'));
  }

  async initVersions(projectId) {
    const versions = await this.mRedmine.getVersions(projectId).catch(error => []);
    this.initSelect(
      document.querySelector('#version'),
      versions,
      version => ({ label: version.name, value: version.id })
    );
    document.querySelector('[data-field-row="version"]').classList.toggle('hidden', versions.length == 0 || !this.isFieldVisible('version'));
  }

  async initAssignees(projectId, cachedMembers) {
    const members = cachedMembers || await this.mRedmine.getMembers(projectId).catch(error => []);
    this.initSelect(
      document.querySelector('#assigned'),
      members,
      member => {
        if (!member.user)
          return null;
        return { label: member.user.name, value: member.user.id };
      }
    );
    document.querySelector('[data-field-row="assigned"]').classList.toggle('hidden', members.length == 0 || !this.isFieldVisible('assigned'));
  }

  async initWatchers(projectId, cachedMembers) {
    const members = cachedMembers || await this.mRedmine.getMembers(projectId).catch(error => []);
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
                      data-field-is-array="true"
                      data-value-type="integer">
               ${sanitizeForHTMLText(member.user.name)}</label>
      `);
    }
    document.querySelector('[data-field-row="watcher"]').classList.toggle('hidden', members.length == 0 || !this.isFieldVisible('watcher'));
  }

  async reinitFieldsForProject() {
    const projectId = this.mProjectField ? this.mProjectField.value : this.params.project_id;
    log('reinitFieldsForProject ', projectId);
    const [members, ] = await Promise.all([
      this.mRedmine.getMembers(projectId),
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

    log('reinitFieldsForIssue ', issue.id, issue);

    this.params.id = issue.id;

    this.params.description = issue.description || '';
    this.params.status_id = issue.status && issue.status.id || null;
    this.params.assigned_to_id = issue.assigned_to && issue.assigned_to.id || null;
    this.params.fixed_version_id = issue.fixed_version && issue.fixed_version.id || null;

    if (issue.parent) {
      this.mParentIssueField.value = issue.parent.id;
      updateIdFieldSize(this.mParentIssueField);
      if (issue.parent.subject) {
        this.mParentIssueSubject.value = issue.parent.subject;
      }
      else {
        const parent = await this.mRedmine.getIssue(issue.parent.id);
        this.mParentIssueSubject.value = parent.subject;
      }
    }
    else {
      this.mParentIssueField.value = '';
      this.mParentIssueSubject.value = '';
    }

    this.params.start_date = issue.start_date || '';
    this.params.due_date = issue.due_date || '';

    if (this.mRelationsField)
      /*await */this.mRelationsField.reinit({
        accountId: this.mAccountId,
        issueId:   issue.id,
        relations: issue.relations
      }).then(() => this.sizeToContent());

    this.rebuildCustomFields(issue.custom_fields);

    this.applyFieldValues();
  }

  rebuildCustomFields(fields) {
    if (!fields) {
      try {
        const accountInfo = configs.accounts[this.mAccountId] || {};
        fields = JSON.parse(accountInfo.customFields || '[]');
        if (!Array.isArray(fields) && fields && fields.custom_fields)
          fields = fields.custom_fields;
      }
      catch(_error) {
        fields = [];
      }
    }
    log('rebuildCustomFields ', fields);

    for (const row of this.mFieldsContainer.querySelectorAll('.grid-row.custom-field')) {
      row.parentNode.removeChild(row);
    }

    for (const field of fields) {
      const source = `
        <div class="grid-row custom-field"
             data-field-id=${JSON.stringify(sanitizeForHTMLText(field.id))}
             data-field-format=${JSON.stringify(sanitizeForHTMLText(field.field_format) + (field.multiple ? '-multiple' : ''))}>
          <label for="custom-field-${sanitizeForHTMLText(field.id)}${field.multiple ? '-0' : ''}">${sanitizeForHTMLText(field.name)}</label>
          <span class="grid-column">${this.customFieldUISource(field)}</span>
        </div>
      `.trim();
      log(' => ', field, source);

      appendContents(this.mFieldsContainer, source);

      const select = this.mFieldsContainer.lastChild.querySelector('select');
      if (select) // selectbox need to be initialized with its property instead of attribute!
        select.value = ('value' in field ? field.value : field.default_value) || '';
    }
  }

  customFieldUISource(field) {
    const commonAttributes = `
      data-field="custom_fields[]"
      data-field-id=${JSON.stringify(sanitizeForHTMLText(field.id))}
    `;
    switch (field.field_format) {
      case 'date':
        return `
          <span>
            <input id="custom-field-${field.id}"
                   type="date"
                   value=${JSON.stringify(sanitizeForHTMLText('value' in field ? field.value : (field.default_value || '')))}
                   data-original-value=${JSON.stringify(sanitizeForHTMLText(field.value || ''))}
                   data-field-type="string"
                   ${commonAttributes}>
          </span>
        `.trim();

      case 'list':
        if (field.multiple) {
          return field.possible_values.map((value, index) => `
            <label><input id="custom-field-${field.id}-${index}"
                          type="checkbox"
                          value=${JSON.stringify(sanitizeForHTMLText(value.value || ''))}
                          data-field-type="string"
                          data-field-is-array="true"
                          ${commonAttributes}
                          ${Array.isArray(field.value) && field.value.includes(value.value) ? 'checked' : ''}>
                   ${sanitizeForHTMLText(value.label)}</label>
          `.trim()).join(' ');
        }
        else {
          const options = field.possible_values.map(value => `
            <option value=${JSON.stringify(sanitizeForHTMLText(value.value || ''))}>${sanitizeForHTMLText(value.label)}</option>
          `.trim()).join('');
          return `
            <select id="custom-field-${field.id}"
                    data-original-value=${JSON.stringify(sanitizeForHTMLText(field.value || ''))}
                    data-field-type="string"
                    ${commonAttributes}>${options}</select>
          `.trim();
        }

      default:
        return `
          <input id="custom-field-${field.id}"
                 type="text"
                 value=${JSON.stringify(sanitizeForHTMLText('value' in field ? field.value : (field.default_value || '')))}
                 data-original-value=${JSON.stringify(sanitizeForHTMLText(field.value || ''))}
                 data-field-type="string"
                 ${commonAttributes}>
        `.trim();
    }
  }

  applyFieldValues() {
    for (const field of document.querySelectorAll('[data-field]')) {
      const name = field.dataset.field;
      const paramName = name.replace(/\[\]$/, '');
      if (!(paramName in this.params))
        continue;

      const valueHolder = field.dataset.fieldId ? (this.params[paramName] || []).find(field => field.id == field.dataset.fieldId) : this.params[paramName];
      const value = field.dataset.fieldId ? (valueHolder && valueHolder.value) : valueHolder;
      if (field.matches('input[type="checkbox"]')) {
        if (field.dataset.fieldIsArray == 'true')
          field.checked = value.includes(field.value);
        else
          field.checked = !!value;
        log('applyFieldValues: ', field, name, value, field.checked);
      }
      else {
        if (field.localName != 'select' ||
            field.querySelector(`option[value=${JSON.stringify(sanitizeForHTMLText(String(value)))}]`))
          field.value = value;
        else if (name == 'project_id')
          field.value = ((configs.accounts || {})[this.mAccountId] || {}).defaultProject || '';
        else
          field.value = '';
        log('applyFieldValues: ', field, name, value, field.value);
      }
    }

    this.setDateFieldValeu(this.mStartDateField, this.params.start_date);
    this.setDateFieldValeu(this.mDueDateField, this.params.due_date);
  }
  setDateFieldValeu(field, value) {
    if (value || !field.disabled) {
      field.value = value;
      return;
    }
    field.disabled = false;
    field.value = '';
    field.disabled = true;
  }

  onChangeFieldValue(field) {
    if (field.$onChangeFieldValueTimer)
      clearTimeout(field.$onChangeFieldValueTimer);
    const resolvers = field.$onChangeFieldValueResolvers || new Set();
    return new Promise((resolve, _reject) => {
      resolvers.add(resolve);
      field.$onChangeFieldValueResolvers = resolvers;
      field.$onChangeFieldValueTimer = setTimeout(async () => {
        delete field.$onChangeFieldValueTimer;
        const resolvers = new Set(field.$onChangeFieldValueResolvers);
        field.$onChangeFieldValueResolvers.clear();
        this.validateFields();

        const name = field.dataset.field;
        const paramName = name.replace(/\[\]$/, '');
        if (paramName in this.params) {
          const value = this.getRequestParamValueFor(paramName);
          this.params[paramName] = value;
          log('onChangeFieldValue ', field, paramName, value);
        }
        for (const resolver of resolvers) {
          resolver();
        }
      }, 150);
    });
  }

  async validateFields() {
    this.mParentIssueField.classList.toggle('invalid', !!(this.params.id && this.mParentIssueField.value && (this.mParentIssueField.value == this.params.id)));

    if (this.mRelationsField) {
      this.mRelationsField.unavailableIds.clear();
      if (this.params.id)
        this.mRelationsField.unavailableIds.add(this.params.id);
      if (this.mParentIssueField.value)
        this.mRelationsField.unavailableIds.add(parseInt(this.mParentIssueField.value || 0));

      await this.mRelationsField.validateFields();
    }

    const valid = !document.querySelector('.invalid');
    if (valid)
      this.onValid.dispatch();
    else
      this.onInvalid.dispatch();
    return valid;
  }

  getRequestParams() {
    const paramNames = new Set();
    for (const field of document.querySelectorAll('[data-field]')) {
      if (field.disabled || field.closest('.hidden'))
        continue;
      const name = field.dataset.field;
      paramNames.add(name.replace(/\[\]$/, ''));
    }
    paramNames.delete('custom_fields');

    const params = {};
    for (const paramName of paramNames) {
      const value = this.getRequestParamValueFor(paramName);
      if (value !== null)
        params[paramName] = value;
    }

    const customFields = [];
    for (const customFieldRow of this.mFieldsContainer.querySelectorAll('.grid-row.custom-field')) {
      const id = parseInt(customFieldRow.dataset.fieldId);
      switch (customFieldRow.dataset.fieldFormat) {
        case 'list-multiple': {
          const checkboxes = customFieldRow.querySelectorAll(`[type="checkbox"]`);
          customFields.push({
            id,
            value: this.getRequestParamValueFromCheckboxes(checkboxes)
          });
        }; continue;

        default: {
          const field = customFieldRow.querySelector(`[data-field]`);
          const value = this.getRequestParamValueFromField(field);
          if (value !== null)
            customFields.push({ id, value });
        }; continue;
      }
    }
    if (customFields.length > 0)
      params.custom_fields = customFields;

    if (this.mFilesField)
      params.files = this.mFilesField.filesToBeUpload;

    return params;
  }

  getRequestParamValueFor(paramName) {
    const checkboxes = document.querySelectorAll(`[data-field=${JSON.stringify(paramName + '[]')}][type="checkbox"]`);
    if (checkboxes.length > 0)
      return this.getRequestParamValueFromCheckboxes(checkboxes);

    const field = document.querySelector(`[data-field=${JSON.stringify(paramName)}]`);
    if (field)
      return this.getRequestParamValueFromField(field);

    return null;
  }

  getRequestParamValueFromCheckboxes(checkboxes) {
    const checkedValues = Array.from(
      checkboxes,
      checkbox => !checkbox.checked ? null : (checkbox.dataset.valueType == 'integer' ? parseInt(checkbox.value || 0) : checkbox.value)
    );
    return Array.from(new Set(checkedValues.filter(value => value !== null)));
  }

  getRequestParamValueFromField(field) {
    if (field.value === '' &&
        (field.matches('input[data-value-type="integer"]') ||
         (field.matches('select') &&
          !field.querySelector('option[value=""]'))))
      return null;
    return (
      field.matches('input[type="checkbox"]') ? field.checked :
        field.dataset.valueType == 'integer' ? parseInt(field.value || 0) :
          field.value
    );
  }

  set issueId(issueId) {
    this.params.id = issueId;
  }

  saveRelations() {
    if (this.params.id && this.mRelationsField)
      return this.mRelationsField.save({ issueId: this.params.id });
  }

  sizeToContent() {
    if (!this.completelyInitialized)
      return;

    if (this.$sizeToContentTimer)
      clearTimeout(this.$sizeToContentTimer);
    this.$sizeToContentTimer = setTimeout(async () => {
      const box = document.querySelector('#form > *:first-child');
      const range = document.createRange();
      range.selectNodeContents(box);
      const delta = range.getBoundingClientRect().height - box.getBoundingClientRect().height;
      range.detach();

      const windowId = await Dialog.getWindowId();
      const win = await browser.windows.get(windowId);
      browser.windows.update(win.id, { height: Math.round(win.height + delta) });

      delete this.$sizeToContentTimer;
    }, 100);
  }
}
