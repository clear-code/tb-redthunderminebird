/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

import {
  configs,
  log
} from './common.js';
import * as DB from './db.js';
import * as Format from './format.js';
import * as MessageBody from '/extlib/messageBody.js';

MessageBody.setLogger(log);

export const RAW_PROPERTIES_FOR_HEADERS = {
  subject: 'subject',
  from:    'author',
  to:      'recipients',
  cc:      'ccList',
  bcc:     'bccList'
};

export class Message {
  constructor(message) {
    this.raw = message;
    this.$full = null;
  }

  get _accountId() {
    return this.raw.folder.accountId;
  }

  get accountId() {
    return this.shouldInheritDefaultAccount ? configs.defaultAccount : this._accountId;
  }
  get accountInfo() {
    return this.shouldInheritDefaultAccount ? this.defaultAccountInfo : this.privateAccountInfo;
  }
  get privateAccountInfo() {
    return (configs.accounts || {})[this._accountId] || {};
  }
  get defaultAccountInfo() {
    return (configs.accounts || {})[configs.defaultAccount] || {};
  }
  get shouldInheritDefaultAccount() {
    const accountInfo = this.privateAccountInfo;
    return (
      accountInfo.inheritDefaultAccount !== false &&
      this._accountId != configs.defaultAccount &&
      configs.defaultAccount
    );
  }
  get mappedFolders() {
    return (
      this.shouldInheritDefaultAccount ?
        configs.accountMappedFoldersDiverted[this._accountId] :
        configs.accountMappedFolders[this._accountId]
    ) || {};
  }

  async getFull() {
    if (this.$full)
      return this.$full;
    return this.$full = await browser.messages.getFull(this.raw.id);
  }

  async getMessageId() {
    const headers = (await this.getFull()).headers;
    return this.$messageId = headers['message-id'][0];
  }

  async getThreadMessageIds() {
    if (this.$messageIds)
      return this.$messageIds;
    const headers = (await this.getFull()).headers;
    return this.$messageIds = headers.references ? headers.references[0].trim().split(/\s+/) : headers['message-id'];
  }

  // Treat the most major issue id in all thread messages is the issue id of the thread itself.
  async getIssueId() {
    const messageIds = await this.getThreadMessageIds();
    const issueIds = (await Promise.all(messageIds.map(DB.getRelatedIssueIdFromMessageId))).filter(id => !!id);
    if (issueIds.length == 0)
      return null;

    if (configs.allowPartialThread)
      return parseInt(issueIds[issueIds.length - 1]);

    // We should return the ID of the most root level message in the thread,
    // because issue information can be modified with a message middle of the thread.
    return parseInt(issueIds[0]);
  }

  async setIssueId(issueId) {
    const messageId = await this.getMessageId();
    return DB.setMessageToIssueRelation(messageId, issueId);
  }

  async setIssueIdToThread(issueId) {
    const messageIds = await this.getThreadMessageIds();
    return Promise.all(messageIds.reverse().map(async (messageId, index) => {
      if (index == 0 ||
          !configs.allowPartialThread ||
          !(await DB.getRelatedIssueIdFromMessageId(messageId)))
        DB.setMessageToIssueRelation(messageId, issueId);
    }));
  }

  getProjectId() {
    const mappedProject = this.mappedFolders[this.raw.folder.path];
    return parseInt(mappedProject || this.accountInfo.defaultProject || 0);
  }

  getSanitizedSubject() {
    const accountInfo = this.accountInfo;
    const useAccountValue = 'useGlobalDefaultFieldValues' in accountInfo && !accountInfo.useGlobalDefaultFieldValues;
    const pattern = useAccountValue && 'defaultTitleCleanupPattern' in accountInfo ? accountInfo.defaultTitleCleanupPattern : configs.defaultTitleCleanupPattern;
    if (pattern)
      return this.raw.subject.replace(new RegExp(pattern, 'gi'), '').trim();
    else
      return this.raw.subject.trim();
  }

  // headers compatible to forwarded mails
  getHeadersSummary(rawHeaders, fields) {
    const headers = [];
    for (const name of fields) {
      if (!name)
        continue;
      const normalizedName = name.toLowerCase();
      let value = (normalizedName in RAW_PROPERTIES_FOR_HEADERS) ?
        this.raw[RAW_PROPERTIES_FOR_HEADERS[normalizedName]] :
        (rawHeaders[normalizedName] || []);
      value = (Array.isArray(value) ? value.join(', ') : value).trim();
      if (!value)
        continue;
      headers.push(`${name}: ${value}`);
    }
    return headers.join('\n').trim();
  }

  async getBody({ withoutQuotation } = {}) {
    return MessageBody.getBody(this.raw.id, { withoutQuotation });
  }

  async getAttachments() {
    if (typeof browser.messages.listAttachments != 'function' ||
        typeof browser.messages.getAttachmentFile != 'function')
      return [];
    const attachments = await browser.messages.listAttachments(this.raw.id);
    return Promise.all(attachments.map(async attachment => {
      const file = await browser.messages.getAttachmentFile(this.raw.id, attachment.partName);
      attachment.file = file;
      return attachment;
    }));
  }

  async toRedmineParams() {
    const [issueId, body, bodyWithoutQuotation, rawHeaders] = await Promise.all([
      this.getIssueId(),
      this.getBody(),
      this.getBody({ withoutQuotation: true }),
      this.getFull().then(full => full.headers)
    ]);
    const accountInfo = this.accountInfo;
    const useAccountValue = ('useGlobalDefaultFieldValues' in accountInfo && !accountInfo.useGlobalDefaultFieldValues);
    const descriptionTemplate = useAccountValue && 'descriptionTemplate' in accountInfo ? accountInfo.descriptionTemplate : configs.descriptionTemplate;
    const descriptionHeaders = useAccountValue && 'defaultDescriptionHeaders' in accountInfo ? accountInfo.defaultDescriptionHeaders : configs.defaultDescriptionHeaders;
    const description = this.fillTemplate(
      descriptionTemplate,
      { body,
        headers: this.getHeadersSummary(rawHeaders, descriptionHeaders) }
    );
    const descriptionWithoutQuotation = this.fillTemplate(
      descriptionTemplate,
      { body:    bodyWithoutQuotation,
        headers: this.getHeadersSummary(rawHeaders, descriptionHeaders) }
    );
    const notesTemplate = useAccountValue && 'notesTemplate' in accountInfo ? accountInfo.notesTemplate : configs.notesTemplate;
    const notesHeaders = useAccountValue && 'defaultNotesHeaders' in accountInfo ? accountInfo.defaultNotesHeaders : configs.defaultNotesHeaders;
    const notes = this.fillTemplate(
      notesTemplate,
      { body,
        headers: this.getHeadersSummary(rawHeaders, notesHeaders) }
    );
    const notesWithoutQuotation = this.fillTemplate(
      notesTemplate,
      { body:    bodyWithoutQuotation,
        headers: this.getHeadersSummary(rawHeaders, notesHeaders) }
    );
    const defaultTracker = accountInfo.defaultTracker;
    const params = {
      id:          issueId,
      subject:     this.getSanitizedSubject(),
      project_id:  this.getProjectId(),
      tracker_id:  defaultTracker,
      description,
      descriptionWithoutQuotation,
      notes,
      notesWithoutQuotation
    };

    const now = new Date();
    params.start_date = Format.formatDate(now);

    const defaultDueDate = useAccountValue && 'defaultDueDate' in accountInfo ? accountInfo.defaultDueDate : configs.defaultDueDate;
    const dueDays = parseInt(defaultDueDate);
    if (!isNaN(dueDays) && dueDays > 0)
      params.due_date = Format.formatDate(now, dueDays);

    return params;
  }

  fillTemplate(template, { body, headers }) {
    const bodyForMarkdown = body.trim().replace(/^(.*)(\r\n|\r|\n)/mg, (matched, prefix, linebreak) => {
      if (matched.startsWith('>'))
        return matched;
      else
        return `${prefix}  ${linebreak}`;
    });
    return template
      .replace(/\%headers?\%/i, headers || '')
      .replace(/\%body_?for_?markdown\%/i, bodyForMarkdown || '')
      .replace(/\%body\%/i, body.trim() || '');
  }
}
