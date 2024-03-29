/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

import Configs from '/extlib/Configs.js';
import * as Constants from './constants.js';

const OVERRIDE_DEFAULT_CONFIGS = {}; /* Replace this for more customization on an enterprise use. */

export const configs = new Configs({
  // per-account configs
  accounts: null, // inheritDefaultAccount url, key, defaultProject, customFields, projectsVisibilityMode, statusesVisibilityMode, useGlobalVisibleFields, useGlobalDefaultFieldValues, defaultTracker, defaultDueDate, defaultTitleCleanupPattern, defaultDescriptionHeaders, defaultNotesHeaders, descriptionTemplate, notesTemplate, deleteLastQuotationBlockFromBody, visibleFolderPattern
  defaultAccount: '',
  accountMappedFolders: {},
  accountVisibleProjects: {},
  accountHiddenProjects: {},
  accountVisibleStatuses: {},
  accountVisibleFields: {},
  accountMappedFoldersDiverted: {},

  // default for per-account configs
  projectsVisibilityMode: Constants.PROJECTS_VISIBILITY_SHOW_BY_DEFAULT,
  statusesVisibilityMode: Constants.STATUSES_VISIBILITY_SHOW_BY_DEFAULT,
  visibleFolderPattern: '',
  fieldVisibility_project: true,
  fieldVisibility_tracker: true,
  fieldVisibility_subject: true,
  fieldVisibility_description: true,
  fieldVisibility_parentIssue: true,
  fieldVisibility_status: true,
  fieldVisibility_assigned: true,
  fieldVisibility_watcher: true,
  fieldVisibility_version: true,
  fieldVisibility_period: true,
  fieldVisibility_file: true,
  fieldVisibility_relations: true,
  fieldVisibility_other: true,
  fieldVisibility_issue: true,
  fieldVisibility_notes: true,
  fieldVisibility_timeEntry: true,
  defaultDueDate: 7,
  defaultTitleCleanupPattern: '((fwd:)|(re:))\s?',
  //defaultUploadAttachments: true,
  defaultDescriptionHeaders: ['Subject', 'From', 'Resent-From', 'Date', 'To', 'Cc', 'Newsgroups'],
  defaultNotesHeaders: ['Subject', 'From', 'Resent-From', 'Date', 'To', 'Cc', 'Newsgroups'],
  descriptionTemplate: '<pre>\n%headers%\n\n%body%\n</pre>',
  notesTemplate: '<pre>\n%headers%\n\n%body%\n</pre>',
  deleteLastQuotationBlockFromBody: false,
  assignMyselfByDefault: false,


  linkToIssueDialogWidth: 500,
  linkToIssueDialogHeight: 440,
  linkToIssueDialogLeft: null,
  linkToIssueDialogTop: null,

  createIssueDialogWidth: 640,
  createIssueDialogHeight: 440,
  createIssueDialogLeft: null,
  createIssueDialogTop: null,

  updateIssueDialogWidth: 640,
  updateIssueDialogHeight: 440,
  updateIssueDialogLeft: null,
  updateIssueDialogTop: null,


  contextMenuType: Constants.CONTEXT_MENU_ALL_COMMANDS,
  contextCommand_noProject: 'mappedProject',
  contextCommand_noIssue:   'createIssue',
  contextCommand_hasIssue:  'updateIssue',
  contextCommand_multiselected: 'linkToIssue',
  context_issueSubject: true,
  context_mappedProject: false,


  allowPartialThread: true,

  openInDefaultBrowser: true,

  configsVersion: 0,
  debug: false,
  dryRun: false,

  // obsolete, migrated to per-account configs
  account: '',
  redmineURL: '',
  redmineAPIKey: '',
  defaultProject: '',
  defaultTracker: null,
  mappedFolders: null,
  visibleProjects: [],
  hiddenProjects: [],
  visibleStatuses: [],
  customFields: '',

  ...OVERRIDE_DEFAULT_CONFIGS
}, {
  syncKeys: [] // sync storage values can be resolved with invalidly saved values, so we always ignmore sync storage...
  /*
  localKeys: [
    'configsVersion',
    'debug',
    'dryRun'
  ]
  */
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

export function appendContents(parent, source) {
  const range = document.createRange();
  range.selectNodeContents(parent);
  range.collapse(false);
  const fragment = range.createContextualFragment(source.trim());
  range.insertNode(fragment);
  range.detach();
}

export function sanitizeForHTMLText(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function clone(object) {
  return JSON.parse(JSON.stringify(object));
}

export async function openURL(url, { windowId } = {}) {
  return openURLs([url], { windowId });
}

export async function openURLs(urls, { windowId } = {}) {
  let active = true;
  const extraOptions = {};
  if (windowId)
    extraOptions.windowId = windowId;
  const promises = [];
  for (const url of urls) {
    if (typeof browser.windows.openDefaultBrowser == 'function' &&
        configs.openInDefaultBrowser) {
      promises.push(browser.windows.openDefaultBrowser(url));
    }
    else {
      promises.push(browser.tabs.create({
        active,
        url,
        ...extraOptions,
      }));
    }
    active = false;
  }
  return Promise.all(promises);
}
