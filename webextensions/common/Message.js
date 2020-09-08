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
    return issueIds[0];
  }

  async setIssueId(issueId) {
    const messageIds = await this.getThreadMessageIds();
    return Promise.all(messageIds.map(messageId => DB.setMessageToIssueRelation(messageId, issueId)));
  }

  getProjectId() {
    return configs.mappedFolders[this.raw.folder.path] || configs.defaultProject || null;
  }

  getSanitizedSubject() {
    const pattern = this.defaultTitleCleanupPattern;
    if (pattern)
      return this.raw.subject.replace(new RegExp(pattern, 'gi'), '').trim();
    else
      return this.raw.subject.trim();
  }

  async getBody() {
    const full = await this.getFull();
    let lastMultipartPlaintext = '';
    let lastMultipartHTML = '';
    let lastPlaintext = '';
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

        default:
          break;
      }
    }
    const bodyText = lastMultipartHTML ? Format.htmlToPlaintext(lastMultipartHTML) : lastMultipartPlaintext || lastPlaintext;
    return bodyText.replace(/\r\n?/g, '\n').trim();
  }

  async toRedmineParams() {
    const [issueId, body] = await Promise.all([
      this.getIssueId(),
      this.getBody()
    ]);
    const params = {
      id:          issueId,
      subject:     this.getSanitizedSubject(),
      project_id:  this.getProjectId(),
      tracker_id:  configs.defaultTracker,
      description: body,
      note:        body
    };

    const dueDays = parseInt(configs.defaultDueDate);
    if (!isNaN(dueDays) && dueDays > 0)
      params.due_date = Format.formatDate(new Date(), dueDays);

    return params;
  }
}
