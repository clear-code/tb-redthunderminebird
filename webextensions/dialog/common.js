/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

import {
  log
} from '/common/common.js';
import * as Constants from '/common/constants.js';
import * as Dialog from '/extlib/dialog.js';

Dialog.setLogger(log);

let mMultipleDialogsAlertMessage;

export async function registerMultipleDialogsAlertMessage(message) {
  mMultipleDialogsAlertMessage = message;
}

browser.runtime.onMessage.addListener((message, sender) => {
  if (!message ||
      typeof message != 'object' ||
      typeof message.type != 'string')
    return;

  switch (message.type) {
    case Constants.TYPE_NOTIFY_MULTIPLE_DIALOGS_REQUESTED:
      Dialog.getWindowId().then(windowId => {
        if (!windowId || !mAlertMessage)
          return;
        browser.windows.update(windowId, { focused: true });
        alert(mMultipleDialogsAlertMessage);
      });
      break;
  }
});

document.addEventListener('input', event => {
  if (event.target.matches('input.auto-grow'))
    updateAutoGrowFieldSize(event.target);
});

export function updateAutoGrowFieldSize(field) {
  if (!field)
    return;
  field.style.setProperty('--base-width', `${Math.max(3, String(field.value).length)}ch`);
}
