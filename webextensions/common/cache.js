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

const mCache = new Map();

export function set(key, value, expireSecond) {
  log('set:', key);

  if (expireSecond === undefined)
    expireSecond = configs.debug ? 5 : 30;

  const oldValue = get(key);

  if (expireSecond <= 0)
    mCache.delete(key);
  else
    mCache.set(key, {
      value,
      expire: Date.now() + (expireSecond * 1000)
    });

  return oldValue;
}

export function get(key) {
  log('get:', key);

  if (!mCache.has(key)) {
    log('get:not cached ', key);
    return undefined;
  }

  const entry = mCache.get(key);
  if (entry && entry.expire >= Date.now())
    return entry.value;

  log('get:expired ', key);
  remove(key);
  return undefined;
}

export async function getAndFallback(key, getter, expireSecond) {
  log('getAndFallback:', key);

  const value = get(key);
  if (value !== undefined)
    return value;

  log('getAndFallback:call getter');
  const newValue = await getter();
  set(key, newValue, expireSecond);
  return newValue;
}

export function remove(key) {
  log('remove:', key);
  mCache.delete(key);
}

export function removeAll(pattern) {
  log('removes:', pattern.toString());

  for (const key of mCache.keys()) {
    if (pattern.test(key))
      remove(key);
  }
}

export function expire() {
  log('expire');
  const now = Date.now();
  for (const [key, value] of mCache.entries()) {
    if (!value || value.expire < now)
      remove(key);
  }
}
