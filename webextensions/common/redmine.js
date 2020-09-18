/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

import {
  configs,
  log
} from './common.js';
import * as Cache from './cache.js';

function getURL(path = '', params = {}) {
  const queryParams = new URLSearchParams();
  for (const name in params) {
    queryParams.set(name, params[name]);
  }
  return `${configs.redmineURL.replace(/\/$/, '')}/${path.replace(/^\//, '')}${Object.keys(params).length > 0 ? '?' : ''}${queryParams.toString()}`;
}

async function request({ method, path, params, data, type, response } = {}) {
  if (!method)
    method = 'GET';
  log('request:', method, path);

  if (!type)
    type = 'application/json';

  const url = getURL(path, {
    ...(params || {}),
    ...(method == 'GET' && data !== undefined ? data : {}),
    key: configs.redmineAPIKey
  });

  let body = '';
  if (method != 'GET' && data !== undefined) {
    switch (type) {
      case 'application/json':
        body = JSON.stringify(data);
        break;
      case 'application/octet-stream':
        body = data;
        break;
      default:
        throw new Error('undefined content-type');
    }
  }

  if (configs.dryRun && method != 'GET') {
    return response || {};
  }

  const request = new XMLHttpRequest();
  return new Promise((resolve, reject) => {
    try {
      log('request url:', url);
      request.open(method, url, true);
      request.setRequestHeader('Content-Type', type);
      request.addEventListener('readystatechange', _event => {
        if (request.readyState != XMLHttpRequest.DONE)
          return;

        log('request status:', request.status);
        log('request response:', request.responseText);

        if (request.status >= 300 && request.status != 422)
          return reject(request);

        //文字列なら(多分JSON文字列なので)オブジェクトにして返却
        let result = request.responseText;
        if (result != 0)
          result = JSON.parse(result);

        resolve(result);
      });
      log('request send:', body);
      request.send(body);
    }
    catch(error) {
      log('Redmine.request error: ' + String(error));
      reject(request);
    }
  });
}

export function getIssueURL(id, withAPIKey) {
  return getURL(
    `/issues/${id}`,
    withAPIKey ? { key: configs.redmineAPIKey } : {}
  );
}

export function getProjectURL(id, withAPIKey) {
  return getURL(
    `/projects/${id}`,
    withAPIKey ? { key: configs.redmineAPIKey } : {}
  );
}

export async function getCreationURL(message) {
  const allParams = await message.toRedmineParams();
  const params = {
    'issue[subject]':     allParams.subject,
    'issue[description]': allParams.description
  };
  if (allParams.project_id)
    return getURL(`/projects/${allParams.project_id}/issues/new`, params);
  else
    return getURL(`/issues/new`, params);
}

export async function ping() {
  // REST APIの対応可否やバージョンチェックをした方がいい
  return request({
    path: '/users/current.json'
  })
    .then(() => true)
    .catch(error => {
      log('Redmine.ping: ' + String(error));
      return false;
    });
}

/*
async function upload(file) {
  log('upload:', file.name, file.data.byteLength);
  const result = await request({
    method: 'POST',
    path:   'uploads.json',
    type:   'application/octet-stream',
    data:    file.data
  }).catch(_error => null);
  return {
    token:        result && result.upload.token,
    filename:     file.name,
    content_type: file.contentType,
    description:  ''
  };
}
*/

export async function createIssue(issue) {
  log('create:', issue);
  try {
    /*
    const files = issue.files;
    delete issue.files;
    if (files)
      issue.uploads = await Promise.all(files.map(file => upload(file)));
    */
    return request({
      method: 'POST',
      path:   'issues.json',
      data:   { issue },
      response: { issue: { id: 0, ...issue } }
    });
  }
  catch(error) {
    log('Redmine.create: ' + String(error));
    return {};
  }
}

export async function updateIssue(issue) {
  log('update:', issue);
  try {
    /*
    const files = issue.files;
    delete issue.files;
    if (files)
      issue.uploads = await Promise.all(files.map(file => upload(file)));
    */
    const result = await request({
      method: 'PUT',
      path:   `issues/${issue.id}.json`,
      data:   { issue },
      response: { issue }
    });
    //Cache.remove(`redmine:issue:${issue.id}`);
    return result;
  }
  catch(error) {
    log('Redmine.update: ' + String(error));
    throw error;
  }
}

export async function getIssue(id, params = {}) {
  log('issue:', id, params);
  try {
    const response = await Cache.getAndFallback(
      `redmine:issue:${id}`,
      () => {
        return request({
          path: `issues/${id}.json`,
          params
        });
      }
    );
    return response && response.issue || {};
  }
  catch(error) {
    log('Redmine.issue: ' + String(error));
    return {};
  }
}

export async function getIssues(projectId, { offset, limit } = {}) {
  log('issues:', projectId, offset, limit);
  try {
    const response = await Cache.getAndFallback(
      `redmine:issues:${projectId}:${offset}-${limit}`,
      () => {
        return request({
          path: `projects/${projectId}/issues.json`,
          data: { offset, limit }
        });
      }
    );
    return response.issues;
  }
  catch(error) {
    log('Redmine.issues: ' + String(error));
    return [];
  }
}


export async function getRelations(issueId /*, { offset, limit } */) {
  log('relations:', issueId /*, offset, limit */);
  try {
    const response = await Cache.getAndFallback(
      `redmine:relations:${issueId /* }:${offset}-${limit} */}`,
      () => {
        return request({
          path: `issues/${issueId}/relations.json` /*,
          data: { offset, limit } */
        });
      }
    );
    return response.relations;
  }
  catch(error) {
    log('Redmine.relations: ' + String(error));
    return [];
  }
}

export async function saveRelation(relation) {
  log('save relation:', relation);
  try {
    const data = {
      relation: {
        issue_to_id   : parseInt(relation.issue_to_id),
        relation_type : relation.relation_type,
        ...('delay' in relation ? { delay: relation.delay } : {})
      }
    };
    if (relation.id)
      await deleteRelation(relation.id);
    return request({
      method: 'POST',
      path:   `issues/${relation.issue_id}/relations.json`,
      data,
      response: {}
    });
  }
  catch(error) {
    log('Redmine.saveRelation: ' + String(error));
    return {};
  }
}

export async function deleteRelation(relationId) {
  log('delete relation:', relationId);
  try {
    return request({
      method: 'DELETE',
      path:   `relations/${relationId}.json`,
      response: {}
    });
  }
  catch(error) {
    log('Redmine.deleteRelation: ' + String(error));
    return {};
  }
}

export async function getMyself() {
  log('myself');
  const response = await Cache.getAndFallback(
    'redmine:myself',
    () => {
      return request({ path: 'users/current.json' });
    }
  );
  return response.user;
}

export async function getProject(projectId) {
  log('project:', projectId);
  const response = await Cache.getAndFallback(
    `redmine:project:${projectId}`,
    () => {
      return request({
        path: `projects/${projectId}.json`,
        data: { include: 'trackers' }
      });
    }
  );
  return response.project;
}

export async function getProjects() {
  log('projects');
  return Cache.getAndFallback(
    'redmine:projects',
    async () => {
      //識別子でフィルタ
      const visibleProjects = new Set(configs.visibleProjects);
      const hiddenProjects = new Set(configs.hiddenProjects);

      const projects = [];
      let offset = 0;
      let response;
      do {
        const limit = response && response.limit || 25;
        response = await request({
          path: 'projects.json',
          data: { offset, limit }
        });
        projects.push(...response.projects.filter(project => {
          const projectId = String(project.id);
          if (visibleProjects.size > 0 &&
              !visibleProjects.has(projectId) &&
              visibleProjects.has(project.identifier))
            return false;
          // fullnameプロパティを定義
          project.fullname = `${project.parent !== undefined ? project.parent.name + '/' : ''}${project.name}`;
          return !hiddenProjects.has(projectId) && !hiddenProjects.has(project.identifier);
        }));
        offset += limit;
      } while (response.offset + response.limit <= response.total_count);

      //fullnameでソートして返却
      return projects.sort((a, b) => (a.fullname > b.fullname) ? 1 : -1 );
    }
  );
}

export async function getMembers(projectId) {
  log('members:', projectId);
  //取得(権限の関係で例外が飛びやすい)
  try {
    const response = await Cache.getAndFallback(
      `redmine:members:${projectId}`,
      () => {
        return request({ path: `projects/${projectId}/memberships.json` });
      }
    );
    return response.memberships;
  }
  catch(error) {
    log('Redmine.members: ' + String(error));
    //気休めに自分自身を返す
    const myself = await getMyself();
    myself.name = myself.lastname;
    return [{ user: myself }];
  }
}

export async function getVersions(projectId) {
  log('versions:', projectId);
  return Cache.getAndFallback(
    `redmine:version:${projectId}`,
    async () => {
      const response = await request({ path: `projects/${projectId}/versions.json` });
      const versions = response.versions;
      return versions.filter(version => version.status === 'open');
    }
  );
}

export async function getTrackers(projectId) {
  if (projectId) {
    log(`trackers (project=${projectId})`);
    return (await getProject(projectId)).trackers || [];
  }
  else {
    log('trackers ');
    const response = await Cache.getAndFallback(
      `redmine:trackers`,
      () => {
        return request({ path: 'trackers.json' });
      }
    );
    return response.trackers;
  }
}

export async function getIssueStatuses() {
  log('issueStatuses');
  const response = await Cache.getAndFallback(
    'redmine:issueStatuses',
    () => {
      return request({ path: 'issue_statuses.json' });
    }
  );
  const visibleStatuses = new Set(configs.visibleStatuses);
  const statuses = response.issue_statuses.filter(status =>
    visibleStatuses.size == 0 ||
    visibleStatuses.has(String(status.id)) ||
    visibleStatuses.has(status.name)
  );
  return statuses;
}

export async function getCustomFields() {
  log('customFields');

  /*
  const response = await Cache.getAndFallback(
    'redmine:customFields',
    () => {
      return request({ path: 'custom_fields.json' });
    }
  );
  return response.issue_statuses.filter(field => {
    return field.customized_type == 'issue' && field.visible;
  });
*/
  const fields = JSON.parse(configs.customFields || '[]');
  if (!Array.isArray(fields) && fields.custom_fields)
    return fields.custom_fields;
  return fields;
}

export function recache() {
  log('recache');
  Cache.removeAll(/^redmine:/);
}
