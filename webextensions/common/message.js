/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

import * as DB from './db.js';

export class Message {
  constructor(message) {
    this.$message = message;
    this.$full = null;
  }

  async getFull() {
    if (this.$full)
      return this.$full;
    return this.$full = await browser.messages.getFull(this.$message.id);
  }

  async getThreadMessageIds() {
    if (this.$messageIds)
      return this.$messageIds;
    return this.$messageIds = (await this.getFull()).headers.references[0].trim().split(/\s+/);
  }

  // Treat the most major ticket id in all thread messages is the ticket id of the thread itself.
  async getTicketId() {
    const messageIds = await this.getThreadMessageIds();
    const ticketIds = (await Promise.all(messageIds.map(DB.getRelatedTicketIdFromMessageId))).filter(id => !!id);
    if (ticketIds.length == 0)
      return null;

    const counts    = [];
    const countById = {};
    for (const id of ticketIds) {
      if (!(id in countById))
        counts.push(countById[id] = { id, count: 0 });
      countById[id].count++;
    }
    const greatestCount = counts.sort((a, b) => b.count - a.count)[0];
    return greatestCount.id;
  }

  async setTicketId(ticketId) {
    const messageIds = await this.getThreadMessageIds();
    return Promise.all(messageIds.map(messageId => DB.setMessageToTicketRelation(messageId, ticketId)));
  }
}
