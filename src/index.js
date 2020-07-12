/*
Copyright 2019 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

import { call, put, putResolve } from 'redux-saga/effects'
import { createAction }          from 'redux-actions'
import isFunction                from 'lodash/isFunction'
import merge                     from 'lodash/merge'

//
// Internal helpers
//
const isTriggerAction     = action => action.meta?.promise?.resolvedAction != null
const resolvePromise      = (action, value) => action.meta.promise.resolve(value)
const rejectPromise       = (action, error) => action.meta.promise.reject(error)
const verify = (action, method) => {
  if (!isTriggerAction(action)) throw new ArgumentError(`redux-saga-promise: ${method}: first argument must be promise trigger action, got ${action}`)
  if (!isFunction(action.meta.promise.resolve)) throw new ConfigurationError(`redux-saga-promise: ${method}: Unable to execute--it seems that promiseMiddleware has not been not included before SagaMiddleware`)
}

//
// Custom error class
//
export class ArgumentError      extends Error {}
export class ConfigurationError extends Error {}

//
// createPromiseAction() creates the suite of actions
//
// The trigger action uses the passed payloadCreator & metaCreator functions, and it
// appends a `promise` object to the meta.  The promise object includes the
// other lifecycle actions of the suite for use by the middleware; and
// later on the middleware will add to it functions to resolve and reject
// the promise.
//
export function createPromiseAction (prefix, payloadCreator, metaCreator) {
  const createStage = (type, payloadCreator, metaCreator) => createAction(`${prefix}.${type}`, payloadCreator, metaCreator)
  const resolvedAction = createStage('RESOLVED')
  const rejectedAction = createStage('REJECTED')
  const trigger        = createStage('TRIGGER', payloadCreator, (...args) => merge(metaCreator?.(...args), { promise: { resolvedAction, rejectedAction } }))
  const suite    = trigger
  suite.trigger  = trigger
  suite.resolved = resolvedAction
  suite.rejected = rejectedAction
  return suite
}

//
// Sagas to resolve & reject the promise
//
export function * implementPromiseAction (action, body) {
  verify(action, 'implementPromiseAction')
  try {
    resolvePromise(action, yield call(body))
  } catch (error) {
    rejectPromise(action, error)
  }
}

export function * resolvePromiseAction (action, value) {
  verify(action, 'resolvePromiseAction')
  resolvePromise(action, value)
}

export function * rejectPromiseAction (action, error) {
  verify(action, 'rejectPromiseAction')
  rejectPromise(action, error)
}

//
// dispatch() effect creator
//
// Convenience redux-saga effect creator that chooses put() or putResolve()
// based on whether the action is a promise action.  Also allows passing
// the action creator and payload separately
//
export function dispatch (action, args) {
  if (isFunction(action)) {
    action = action(args)
  } else if (action == null) {
    throw new ArgumentError('redux-saga-promise: null action passed to dispatch() effect creator')
  } else if (args !== undefined) {
    throw new ArgumentError('redux-saga-promise: extra args passed to dispatch() effect creator')
  }
  return isTriggerAction(action) ? putResolve(action) : put(action)
}

//
// promiseMiddleware
//
// For a trigger action a promise is created and returned, and the action's
// meta.promise is augmented with resolve and reject functions for use
// by the sagas.  (This middleware must come before sagaMiddleware so that
// the sagas will have those functions available.)
//
// Other actions are passed through unmolested
//
export const promiseMiddleware = store => next => (action) => {
  if (isTriggerAction(action)) {
    return new Promise((resolve, reject) => next(merge(action, {
      meta: {
        promise: {
          resolve: (value) => {
            resolve(value)
            store.dispatch(action.meta.promise.resolvedAction(value))
          },
          reject: (error) => {
            reject(error)
            store.dispatch(action.meta.promise.rejectedAction(error))
          },
        },
      },
    })))
  }
  return next(action)
}
