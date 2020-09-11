/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

import Configs from '/extlib/Configs.js';

const OVERRIDE_DEFAULT_CONFIGS = {}; /* Replace this for more customization on an enterprise use. */

export const configs = new Configs({
  redmineURL: '',
  redmineAPIKey: '',
  account: '',

  visibleProjects: [],
  hiddenProjects: [],
  visibleStatuses: [],
  visibleFolderPattern: '',
  visibleFields: [],
  customFields: '',

  defaultTracker: null,
  defaultDueDate: 7,
  defaultTitleCleanupPattern: '((fwd:)|(re:))\s?',
  defaultUploadAttachments: true,

  defaultProject: '',
  mappedFolders: null,

  descriptionTemplate: '```\n%headers%\n\n%body%\n```',
  notesTemplate: '```\n%headers%\n\n%body%\n```',


  chooseIssueDialogWidth: 500,
  chooseIssueDialogHeight: 440,
  chooseIssueDialogLeft: null,
  chooseIssueDialogTop: null,

  createIssueDialogWidth: 640,
  createIssueDialogHeight: 440,
  createIssueDialogLeft: null,
  createIssueDialogTop: null,


  configsVersion: 0,
  debug: false,

  ...OVERRIDE_DEFAULT_CONFIGS
}, {
  localKeys: [
    'configsVersion',
    'debug'
  ]
});

export function log(message, ...args) {
  if (!configs || !configs.debug)
    return;

  const nest   = (new Error()).stack.split('\n').length;
  let indent = '';
  for (let i = 0; i < nest; i++) {
    indent += ' ';
  }
  console.log(`redthunderminebird: ${indent}${message}`, ...args);
}

export function sanitizeForHTMLText(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
