/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

import * as Constants from '/common/constants.js';
import * as Dialog from '/extlib/dialog.js';

let mAlertMessage;

export async function registerAlertMessage(message) {
  mAlertMessage = message;
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
        alert(mAlertMessage);
      });
      break;
  }
});
