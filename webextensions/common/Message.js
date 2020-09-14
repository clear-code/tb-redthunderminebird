/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

import {
  configs
} from './common.js';
import * as DB from './db.js';
import * as Format from './format.js';

export class Message {
  constructor(message) {
    this.raw = message;
    this.$full = null;
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
    return parseInt(configs.mappedFolders[this.raw.folder.path] || configs.defaultProject || 0);
  }

  getSanitizedSubject() {
    const pattern = this.defaultTitleCleanupPattern;
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
      const value = rawHeaders[name.toLowerCase()] || '';
      const normalizedValue = (Array.isArray(value) ? value.join(', ') : value).trim();
      if (!normalizedValue)
        continue;
      headers.push(`${name}: ${normalizedValue}`);
    }
    return headers.join('\n').trim();
  }

  async getBody() {
    const full = await this.getFull();
    let lastMultipartPlaintext = '';
    let lastMultipartHTML = '';
    let lastPlaintext = '';
    let lastHTML;
    for (const part of full.parts.slice(0).reverse()) {
      switch (part.contentType.replace(/\s*;.*$/, '')) {
        case 'multipart/alternative':
          for (const subPart of part.parts) {
            switch (subPart.contentType.replace(/\s*;.*$/, '')) {
              case 'text/html':
                lastMultipartHTML = subPart.body;
                break;

              case 'text/plain':
                lastMultipartPlaintext = subPart.body;
                break;

              default:
                break;
            }
          }
          break;

        case 'text/plain':
          lastPlaintext = part.body;
          break;

        case 'text/html':
          lastHTML = part.body;
          break;

        default:
          break;
      }
    }
    const bodyText = lastMultipartHTML ? Format.htmlToPlaintext(lastMultipartHTML) : lastMultipartPlaintext || lastPlaintext;
    return (bodyText || Format.htmlToPlaintext(lastHTML)).replace(/\r\n?/g, '\n').trim();
  }

  async toRedmineParams() {
    const [issueId, body, rawHeaders] = await Promise.all([
      this.getIssueId(),
      this.getBody(),
      this.getFull().then(full => full.headers)
    ]);
    const description = this.fillTemplate(
      configs.descriptionTemplate,
      { body,
        headers: this.getHeadersSummary(rawHeaders, configs.defaultDescriptionHeaders) }
    );
    const note = this.fillTemplate(
      configs.notesTemplate,
      { body,
        headers: this.getHeadersSummary(rawHeaders, configs.defaultNotesHeaders) }
    );
    const params = {
      id:          issueId,
      subject:     this.getSanitizedSubject(),
      project_id:  this.getProjectId(),
      tracker_id:  configs.defaultTracker,
      description,
      note
    };

    const dueDays = parseInt(configs.defaultDueDate);
    if (!isNaN(dueDays) && dueDays > 0)
      params.due_date = Format.formatDate(new Date(), dueDays);

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
