/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

import '/extlib/l10n.js';
import * as Dialog from '/extlib/dialog.js';
import * as Constants from '/common/constants.js';
import { Message } from '/common/Message.js';

browser.runtime.sendMessage({ type: Constants.TYPE_GET_DISPLAYED_MESSAGE_STATUS }).then(async response => {
  if (!response)
    return;

  document.documentElement.classList.toggle('disabled', !response.available);
  if (response.available) {
    const messages = response.messages.map(rawMessage => new Message(rawMessage));
    const message = messages[0];
    for (const [id, status] of Object.entries(response.menuStatus)) {
      const button = document.getElementById(id);
      if (!button)
        continue;

      button.classList.toggle('hidden', !status.visible);
      button.disabled = !status.enabled;
      if (!button.disabled) {
        Dialog.initButton(button, async _event => {
          browser.runtime.sendMessage({
            type:    Constants.TYPE_DO_MESSAGE_COMMAND,
            id,
            messages: messages.map(message => message.raw)
          });
          window.close();
        });
      }
    }

    const issue = await browser.runtime.sendMessage({
      type:      Constants.TYPE_GET_ISSUE,
      id:        response.issueId,
      accountId: message.accountId
    });
    const subject = document.querySelector('#issueInfo');
    subject.style.maxWidth = `calc(${document.getElementById('commands').getBoundingClientRect().width}px - 2em)`;
    subject.firstChild.textContent = issue && issue.id ?
      `#${issue.id} ${issue.subject}` :
      browser.i18n.getMessage('menu_issueSubject_notFound');
    subject.setAttribute('title', subject.firstChild.textContent);
  }
});
