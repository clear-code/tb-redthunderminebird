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
import * as Constants from '/common/constants.js';
import { Message } from '/common/Message.js';
import * as Redmine from '/common/redmine.js';

Dialog.setLogger(log);

const MENU_COMMON_PARAMS = {
  contexts: ['message_list']
};
const SUBMENU_COMMON_PARAMS = {
  ...MENU_COMMON_PARAMS,
  parentId: 'redmine',
  async shouldVisible(info, tab) {
    return MENU_ITEMS.redmine.shouldEnable(info, tab); // eslint-disable-line no-use-before-define
  }
};
const MENU_ITEMS = {
  redmine: {
    ...MENU_COMMON_PARAMS,
    title: browser.i18n.getMessage('menu_redmine_label'),
    async shouldEnable(_info, _tab) {
      return !!(configs.redmineURL && configs.redmineAPIKey);
    }
  },
  openWebUI: {
    ...SUBMENU_COMMON_PARAMS,
    title: browser.i18n.getMessage('menu_openWebUI_label')
  },
  linkToIssue: {
    ...SUBMENU_COMMON_PARAMS,
    title: browser.i18n.getMessage('menu_linkToIssue_label')
  },
  createIssue: {
    ...SUBMENU_COMMON_PARAMS,
    title: browser.i18n.getMessage('menu_createIssue_label')
  },
  updateIssue: {
    ...SUBMENU_COMMON_PARAMS,
    title: browser.i18n.getMessage('menu_updateIssue_label')
  },
  openIssue: {
    ...SUBMENU_COMMON_PARAMS,
    title: browser.i18n.getMessage('menu_openIssue_label'),
    async shouldEnable(info, _tab) {
      return !!(await getContextIssueId(info));
    }
  }
};

async function getContextIssueId(info) {
  const messages = info.selectedMessages && info.selectedMessages.messages.map(message => new Message(message));
  return (
    messages &&
    messages.length > 0 &&
    messages[0].getIssueId()
  ) || null;
}

for (const [id, item] of Object.entries(MENU_ITEMS)) {
  item.id = id;
  item.lastEnabled = true;
  item.lastVisible = true;
  item.params = {
    id,
    parentId: item.parentId,
    contexts: item.contexts,
    title:    item.title
  };
  browser.menus.create(item.params);
}

browser.menus.onShown.addListener(async (info, tab) => {
  let modificationCount = 0;
  const tasks = [];
  for (const [id, item] of Object.entries(MENU_ITEMS)) {
    tasks.push((async () => {
      const [enabled, visible] = await Promise.all([
        typeof item.shouldEnable == 'function' ? item.shouldEnable(info, tab) : true,
        typeof item.shouldVisible == 'function' ? item.shouldVisible(info, tab) : true
      ]);
      browser.menus.update(id, {
        enabled,
        visible
      });
      /* eslint-disable no-unused-expressions */
      (item.lastEnabled != enabled) && (item.lastEnabled = enabled, modificationCount++);
      (item.lastVisible != visible) && (item.lastVisible = visible, modificationCount++);
      /* eslint-enable no-unused-expressions */
    })());
  }
  await Promise.all(tasks);
  if (modificationCount > 0)
    browser.menus.refresh();
});

browser.menus.onClicked.addListener(async (info, tab) => {
  const messages = info.selectedMessages && info.selectedMessages.messages.map(message => new Message(message));
  if (!messages ||
      messages.length == 0)
    return;

  switch (info.menuItemId) {
    case 'openWebUI': {
      const url = await Redmine.getCreationURL(messages[0]);
      browser.tabs.create({
        windowId: tab.windowId,
        active:   true,
        url
      });
    }; break;

    case 'linkToIssue':
      runTask(async () => linkToIssue(messages[0], tab));
      break;

    case 'createIssue':
      runTask(async () => createIssue(messages[0], tab));
      break;

    case 'updateIssue':
      runTask(async () => updateIssue(messages[0], tab));
      break;

    case 'openIssue': {
      const issueId = await getContextIssueId(info);
      if (!issueId)
        return;
      const url = await Redmine.getIssueURL(issueId, true);
      browser.tabs.create({
        windowId: tab.windowId,
        active:   true,
        url
      });
    }; break;
  }
});


async function linkToIssue(message, tab) {
  try {
    const dialogParams = {
      url:    '/dialog/link-to-issue/link-to-issue.html',
      modal:  !configs.debug,
      opener: await browser.windows.get(tab.windowId),
      width:  configs.linkToIssueDialogWidth,
      height: configs.linkToIssueDialogHeight
    };
    if (typeof configs.linkToIssueDialogLeft == 'number')
      dialogParams.left = configs.linkToIssueDialogLeft;
    if (typeof configs.linkToIssueDialogTop == 'number')
      dialogParams.top = configs.linkToIssueDialogTop;
    try {
      const result = await Dialog.open(
        dialogParams,
        { defaultId: await message.getIssueId(),
          projectId: message.getProjectId() }
      );
      const issue = result && result.detail;
      log('chosen issue: ', issue);
      if (issue)
        await message.setIssueId(issue.id);
    }
    catch(_error) {
    }
  }
  catch(error) {
    console.error(error);
  }
}

async function createIssue(message, tab) {
  const dialogParams = {
    url:    '/dialog/create-issue/create-issue.html',
    modal:  !configs.debug,
    opener: await browser.windows.get(tab.windowId),
    width:  configs.createIssueDialogWidth,
    height: configs.createIssueDialogHeight
  };
  if (typeof configs.createIssueDialogLeft == 'number')
    dialogParams.left = configs.createIssueDialogLeft;
  if (typeof configs.createIssueDialogTop == 'number')
    dialogParams.top = configs.createIssueDialogTop;
  try {
    await Dialog.open(
      dialogParams,
      { message: message.raw }
    );
  }
  catch(_error) {
  }
}

async function updateIssue(message, tab) {
  if (!(await message.getIssueId())) {
    await linkToIssue(message, tab);
    if (!(await message.getIssueId()))
      return;
  }

  const dialogParams = {
    url:    '/dialog/update-issue/update-issue.html',
    modal:  !configs.debug,
    opener: await browser.windows.get(tab.windowId),
    width:  configs.updateIssueDialogWidth,
    height: configs.updateIssueDialogHeight
  };
  if (typeof configs.updateIssueDialogLeft == 'number')
    dialogParams.left = configs.updateIssueDialogLeft;
  if (typeof configs.updateIssueDialogTop == 'number')
    dialogParams.top = configs.updateIssueDialogTop;
  try {
    await Dialog.open(
      dialogParams,
      { message: message.raw }
    );
  }
  catch(_error) {
  }
}


let mInProgressTask;

async function runTask(asyncTask) {
  if (mInProgressTask) {
    browser.runtime.sendMessage({
      type: Constants.TYPE_NOTIFY_MULTIPLE_DIALOGS_REQUESTED
    });
    return;
  }

  mInProgressTask = asyncTask();
  try {
    await mInProgressTask;
  }
  catch(_error) {
  }
  mInProgressTask = null;
}
