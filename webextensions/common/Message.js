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

    // We should return the ID of the most root level message in the thread,
    // because issue information can be modified with a message middle of the thread.
    return parseInt(issueIds[0]);
  }

  async setIssueId(issueId) {
    const messageIds = await this.getThreadMessageIds();
    return Promise.all(messageIds.map(messageId => DB.setMessageToIssueRelation(messageId, issueId)));
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
    log('getBody for ', this.raw);
    const full = await this.getFull();
    log(' full => ', full);
    const { lastPlaintext, lastHTML } = this._collectPlaintextAndHTMLBodies(full);
    const HTMLBody = lastHTML && Format.htmlToPlaintext(lastHTML, { withoutQuotation });
    const plaintextBody = withoutQuotation ?
      lastPlaintext.split('\n').reverse().join('\n').replace(/(\n|^)(?:>(?:.*)?\n)+\s*On.+, .+ wrote:\n/, '$1').split('\n').reverse().join('\n') :
      lastPlaintext;
    const body = (HTMLBody || plaintextBody).replace(/\r\n?/g, '\n').trim();
    log(' body: ', { body, HTMLBody, plaintextBody });
    return body;
  }
  _collectPlaintextAndHTMLBodies(part) {
    log(' _collectPlaintextAndHTMLBodies: ', { part });
    let lastPlaintext = '';
    let lastHTML;
    for (const subPart of part.parts.slice(0).reverse()) {
      log(' subPart.contentType: ', subPart.contentType);
      switch (subPart.contentType.replace(/\s*;.*$/, '')) {
        case 'multipart/alternative':
        case 'multipart/mixed':
        case 'multipart/related':
          const result = this._collectPlaintextAndHTMLBodies(subPart);
          if (!lastPlaintext && result.lastPlaintext)
            lastPlaintext = result.lastPlaintext;
          if (!lastHTML && result.lastHTML)
            lastHTML = result.lastHTML;
          break;

        case 'text/plain':
          if (!subPart.name)
            lastPlaintext = subPart.body.replace(/\r\n|\r/g, '\n');
          break;

        case 'text/html':
          if (!subPart.name)
            lastHTML = subPart.body.replace(/\r\n|\r/g, '\n');
          break;

        default:
          break;
      }
    }
    log(' _collectPlaintextAndHTMLBodies result: ', { part, lastPlaintext, lastHTML });
    return { lastPlaintext, lastHTML };
  }

  /*
  async getAttachments() {
    const full = await this.getFull();
    const attachments = [];
    for (const part of full.parts) {
      if (!part.name)
        continue;

      attachments.push({
        name: part.name,
        size: part.size
      });
    }
    return attachments;
  }
  */

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
