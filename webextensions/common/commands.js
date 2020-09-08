/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

import * as Dialog from '/extlib/dialog.js';

import {
  configs,
  log
} from '/common/common.js';

export async function chooseIssue({ defaultId, projectId, openerWindowId }) {
  log('choose issue: ', { defaultId, projectId, openerWindowId });
  const dialogParams = {
    url:    '/dialog/choose-issue/choose-issue.html',
    modal:  !configs.debug,
    opener: await browser.windows.get(openerWindowId),
    width:  configs.chooseIssueDialogWidth,
    height: configs.chooseIssueDialogHeight
  };
  if (typeof configs.chooseIssueDialogLeft == 'number')
    dialogParams.left = configs.chooseIssueDialogLeft;
  if (typeof configs.chooseIssueDialogTop == 'number')
    dialogParams.top = configs.chooseIssueDialogTop;
  try {
    const result = await Dialog.open(
      dialogParams,
      { defaultId,
        projectId,
        title: browser.i18n.getMessage('dialog_chooseIssue_title_link') }
    );
    if (result && result.detail) {
      log('chosen issue: ', result.detail);
      return result.detail;
    }
  }
  catch(_error) {
  }
  return null;
}
