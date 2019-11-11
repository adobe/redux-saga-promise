/*
 * Mechanism for an action that works as a promise
 *
 * Create a promise action:
 *
 *     myAction = createPromiseAction('MY_ACTION')
 *
 * Dispatch it normally:
 *
 *     await dispatch(fetchInfo(payload))
 *
 * Resolve (or reject) it in a saga by
 *
 *     yield call(implementPromiseAction, action, function * () {
 *        // If this saga function succesfully returns a value, the promise will
 *        // resolve with that value.
 *        //
 *        // If this saga function throws an error, the promise will be rejected
 *        // with that error.
 *
 *        ... do some async stuff here ...
 *
 *        return value
 *      })
 *
 *     // Resolve the action with the given value
 *     yield call(resolvePromiseAction, action, value)
 *
 *     // Reject the action with the given error
 *     yield call(rejectPromiseAction, action, error)
 *
 * Also provide a convenience wrapper for dispatching in sagas.  This
 * provides dispatch() which behaves like call() -- it dispatches the
 * action, and if the action is a promise it waits for it to resolve:
 *
 *     yield dispatch(myAction, args...)
 *     yield dispatch(myAction(args...))
 *
 *     // => uses putResolve(action) for promiseActions and put(action) for other actions.
 *
 * Notes:
 *    myAction is actually a suite of FSA action creators
 *       myAction.trigger(payload)  // same as myAction(payload)
 *       myAction.resolved(result)  // dispatched by saga if promise resolves
 *       myAction.rejected(error)   // dispatched by saga if promise rejects
 *
 *     Uses https://redux-actions.js.org 's createAction() to define the action creators.
 *     You can also use its handleActions() to update state as the promise
 *     changes state, e.g.
 *         handleActions({
 *            [myAction.trigger]:  (state, {payload}) => {...state, loading: true}
 *            [myAction.resolved]: (state, {payload}) => {...state, info: payload, loading: false}
 *            [myAction.rejected]: (state, {payload}) => {...state, loading: false}
 *         })
 *
 *     Uses https://github.com/diegohaz/redux-saga-thunk to implement the
 *     promise mechanism.
 *
 *     The action creators are inspired by https://github.com/afitiskin/redux-saga-routines
 */

// External
import { call, put, putResolve } from 'redux-saga/effects'
import { createAction }          from 'redux-actions'
import isFunction                from 'lodash/isFunction'
import merge                     from 'lodash/merge'

const isTriggerAction = action => action.meta?.promise?.resolvedAction

export function createPromiseAction (prefix, payload, meta) {
  const stages = [
    {
      type: 'TRIGGER',
      payload,
      meta: (...args) => merge(meta?.(...args), { promise: { resolvedAction: suite.resolved, rejectedAction: suite.rejected } }),
    },
    {
      type: 'RESOLVED',
      payload,
      meta,
    },
    {
      type: 'REJECTED',
      payload,
      meta,
    },
  ]
  const createStage = ({ type, payload, meta }) => {
    const action = createAction(`${prefix}.${type}`, payload, meta)
    return action
  }
  const suite = createStage(stages[0])
  stages.forEach((stage) => {
    const actionCreator = createStage(stage)
    Object.assign(suite, {
      [stage.type.toLowerCase()]: actionCreator,
      [stage.type.toUpperCase()]: actionCreator.toString(),
    })
  })

  return suite
}

export function * implementPromiseAction (action, body) {
  try {
    const value = yield call(body)
    yield call(resolvePromiseAction, action, value)
  } catch (error) {
    yield call(rejectPromiseAction, action, error)
  }
}

export function * resolvePromiseAction (action, value) {
  if (!isTriggerAction(action)) {
    throw new Error(`redux-saga-promise: resolvePromiseAction: argument must be promise trigger action, got: ${action}`)
  }
  const promise = action.meta.promise
  yield put(promise.resolvedAction(value))
  promise.resolve(value)
}

export function * rejectPromiseAction (action, error) {
  if (!isTriggerAction(action)) {
    throw new Error(`redux-saga-promise: rejectPromiseAction: argument must be promise trigger action, got: ${action}`)
  }
  const promise = action.meta.promise
  yield put(promise.rejectedAction(error))
  promise.reject(error)
}

// Convenience redux-saga effect creator that chooses put() or putResolve()
// based on whether the action is a promise action.  Also allows passing
// the action creator and payload separately
export function dispatch (action, args) {
  if (isFunction(action)) {
    action = action(args)
  } else if (action == null) {
    throw new Error('redux-saga-promise: null action passed to dispatch()')
  } else if (args !== undefined) {
    throw new Error('redux-saga-promise: extra args passed to dispatch() effect creator')
  }
  return isTriggerAction(action) ? putResolve(action) : put(action)
}

export function promiseMiddleware (store) {
  return next => (action) => {
    if (isTriggerAction(action)) {
      return new Promise((resolve, reject) => next(merge(action, { meta: { promise: { resolve, reject } } })))
    }
    return next(action)
  }
}
