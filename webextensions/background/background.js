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
import { Redmine } from '/common/Redmine.js';
import * as Migration from './migration.js';

Dialog.setLogger(log);

configs.$loaded.then(() => {
  Migration.migrateConfigs();
});

const mProjectItemIds = new Set();

const MENU_COMMON_PARAMS = {
  contexts: ['message_list']
};
const SUBMENU_COMMON_PARAMS = {
  ...MENU_COMMON_PARAMS,
  parentId: 'redmine',
  async shouldVisible(info, tab, message) {
    return !!(message && MENU_ITEMS.redmine.shouldEnable(info, tab)); // eslint-disable-line no-use-before-define
  }
};
const MENU_ITEMS = {
  redmine: {
    ...MENU_COMMON_PARAMS,
    title: browser.i18n.getMessage('menu_redmine_label'),
    async shouldEnable(info, _tab, message) {
      const accountId = (info.selectedFolder && info.selectedFolder.accountId) || (message && message.accountId);
      const accountInfo = configs.accounts[accountId];
      return !!(accountInfo && accountInfo.url && accountInfo.key);
    }
  },
  openWebUI: {
    ...SUBMENU_COMMON_PARAMS,
    title: browser.i18n.getMessage('menu_openWebUI_label')
  },
  linkToIssue: {
    ...SUBMENU_COMMON_PARAMS,
    title: browser.i18n.getMessage('menu_linkToIssue_label'),
    async shouldEnable(_info, _tab, message) {
      return !!(message && message.getProjectId());
    }
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
    async shouldEnable(info, _tab, _message) {
      return !!(await getContextIssueId(info));
    }
  },

  mappedProject: {
    ...MENU_COMMON_PARAMS,
    contexts: ['folder_pane'],
    title: browser.i18n.getMessage('menu_mappedProject_label'),
    shouldVisible: null,
    async shouldEnable(info, _tab, _message) {
      const accountId = info.selectedFolder && info.selectedFolder.accountId;
      const accountInfo = configs.accounts[accountId];
      return !!(accountInfo && accountInfo.url && accountInfo.key && mProjectItemIds.size > 0);
    },
    async shouldVisible(_info, _tab, _message) {
      return configs.context_mappedProject && MENU_ITEMS.redmine.shouldEnable(info, tab);
    }
  },

  mappedProjectSubSeparator: {
    ...SUBMENU_COMMON_PARAMS,
    contexts: ['message_list'],
    type: 'separator',
    async shouldVisible(_info, _tab, _message) {
      return configs.context_mappedProject && MENU_ITEMS.redmine.shouldEnable(info, tab);
    }
  },

  mappedProjectSub: {
    ...SUBMENU_COMMON_PARAMS,
    contexts: ['message_list'],
    title: browser.i18n.getMessage('menu_mappedProject_label'),
    shouldVisible: null,
    async shouldEnable(info, _tab, _message) {
      const accountId = info.selectedFolder && info.selectedFolder.accountId;
      const accountInfo = configs.accounts[accountId];
      return !!(accountInfo && accountInfo.url && accountInfo.key && mProjectItemIds.size > 0);
    },
    async shouldVisible(_info, _tab, _message) {
      return configs.context_mappedProject && MENU_ITEMS.redmine.shouldEnable(info, tab);
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
    type:     item.type || 'normal',
    title:    item.title
  };
  browser.menus.create(item.params);
}

browser.menus.onShown.addListener(async (info, tab) => {
  const messages = info.selectedMessages && info.selectedMessages.messages.map(message => new Message(message));
  const message = messages && messages.length > 0 ? messages[0] : null;
  const accountId = (info.selectedFolder && info.selectedFolder.accountId) || (message && message.accountId);
  const redmine = new Redmine({ accountId });

  let modificationCount = 0;
  const tasks = [];
  for (const [id, item] of Object.entries(MENU_ITEMS)) {
    tasks.push((async () => {
      const [enabled, visible] = await Promise.all([
        typeof item.shouldEnable == 'function' ? item.shouldEnable(info, tab, message) : true,
        typeof item.shouldVisible == 'function' ? item.shouldVisible(info, tab, message) : true
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

  const isFolderPane = info.contexts.includes('folder_pane');
  const isThreadPane = info.contexts.includes('message_list');
  const folder = info.selectedFolder || (message && message.raw.folder);
  if (configs.context_mappedProject &&
      (isFolderPane || isThreadPane) &&
      folder) {
    modificationCount++;
    tasks.push(redmine.getProjects().catch(_error => []).then(async projects => {
      if (projects.length == 0)
        return;

      const creatings = [];
      const mappedFolders = configs.accountMappedFolders[accountId] || {};
      const projectId = mappedFolders[folder.path];

      const suffix   = isFolderPane ? '' : ':sub';
      const parentId = isFolderPane ? 'mappedProject' : 'mappedProjectSub';
      const contexts = isFolderPane ? ['folder_pane'] : ['message_list'];

      mProjectItemIds.add(`map-to-project:${suffix}`);
      creatings.push(browser.menus.create({
        id:       `map-to-project:${suffix}`,
        title:    browser.i18n.getMessage('menu_mappedProject_unmapped_label'),
        type:     'radio',
        checked:  !projectId,
        parentId,
        contexts
      }));
      mProjectItemIds.add(`map-to-project-separator:${suffix}`);
      creatings.push(browser.menus.create({
        id:       `map-to-project-separator:${suffix}`,
        type:     'separator',
        parentId,
        contexts
      }));

      for (const project of projects) {
        const id = `map-to-project:${project.id}${suffix}`;
        mProjectItemIds.add(id);
        creatings.push(browser.menus.create({
          id,
          title:    project.indentedName,
          type:     'radio',
          checked:  project.id == projectId,
          parentId,
          contexts
        }));
      }
      await Promise.all(creatings);
      browser.menus.update(parentId, {
        enabled: true
      });
      MENU_ITEMS[parentId].lastEnabled = true;
      browser.menus.refresh();
    }));
  }

  await Promise.all(tasks);

  if (modificationCount > 0)
    browser.menus.refresh();
});

browser.menus.onHidden.addListener(async () => {
  if (mProjectItemIds.size > 0) {
    for (const id of mProjectItemIds) {
      browser.menus.remove(id);
    }
    mProjectItemIds.clear();
    if (MENU_ITEMS.mappedProject.lastEnabled) {
      browser.menus.update('mappedProject', {
        enabled: false
      });
      MENU_ITEMS.mappedProject.lastEnabled = false;
    }
    if (MENU_ITEMS.mappedProjectSub.lastEnabled) {
      browser.menus.update('mappedProjectSub', {
        enabled: false
      });
      MENU_ITEMS.mappedProjectSub.lastEnabled = false;
    }
    browser.menus.refresh();
  }
});

browser.menus.onClicked.addListener(async (info, tab) => {
  const messages = info.selectedMessages && info.selectedMessages.messages.map(message => new Message(message));
  const message = messages && messages.length ? messages[0] : null;
  const accountId = (info.selectedFolder && info.selectedFolder.accountId) || (message && message.accountId);
  const redmine = new Redmine({ accountId });
  switch (info.menuItemId) {
    case 'openWebUI': {
      if (!message)
        return;
      const url = await redmine.getCreationURL(message);
      browser.tabs.create({
        windowId: tab.windowId,
        active:   true,
        url
      });
    }; break;

    case 'linkToIssue':
      if (!message)
        return;
      runTask(async () => linkToIssue(message, { tab, accountId }));
      break;

    case 'createIssue':
      if (!message)
        return;
      runTask(async () => createIssue(message, { tab, accountId }));
      break;

    case 'updateIssue':
      if (!message)
        return;
      runTask(async () => updateIssue(message, { tab, accountId }));
      break;

    case 'openIssue': {
      if (!message)
        return;
      const issueId = await getContextIssueId(info);
      if (!issueId)
        return;
      const url = await redmine.getIssueURL(issueId, { withAPIKey: true });
      browser.tabs.create({
        windowId: tab.windowId,
        active:   true,
        url
      });
    }; break;

    default:
      const folder = info.selectedFolder || (message && message.raw.folder);
      if (/^map-to-project:([^:]*)(?::sub)?$/.test(info.menuItemId) &&
          folder) {
        const projectId = RegExp.$1 || null;
        const accountMappedFolders = JSON.parse(JSON.stringify(configs.accountMappedFolders));
        const mappedFolders = accountMappedFolders[accountId] || {};
        if (projectId)
          mappedFolders[folder.path] = projectId;
        else
          delete mappedFolders[folder.path];
        accountMappedFolders[accountId] = mappedFolders;
        configs.accountMappedFolders = accountMappedFolders;
      }
      break;
  }
});


async function linkToIssue(message, { tab, accountId } = {}) {
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
        { accountId,
          defaultId: await message.getIssueId(),
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

async function createIssue(message, { tab, accountId } = {}) {
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
      { accountId,
        message: message.raw }
    );
  }
  catch(_error) {
  }
}

async function updateIssue(message, { tab, accountId } = {}) {
  if (!(await message.getIssueId())) {
    await linkToIssue(message, { tab, accountId });
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
      { accountId,
        message: message.raw }
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
