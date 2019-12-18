import 'regenerator-runtime/runtime' // eslint-disable-line node/no-unpublished-import
import { applyMiddleware, createStore }           from 'redux' // eslint-disable-line node/no-extraneous-import
import { call, put, putResolve, take, takeEvery } from 'redux-saga/effects'
import { createAction, handleActions }            from 'redux-actions'
import createSagaMiddleware                       from 'redux-saga'
import isEqual                                    from 'lodash/isEqual'
import test                                       from 'ava' // eslint-disable-line node/no-unpublished-import

import {
  ArgumentError,
  createPromiseAction,
  dispatch,
  implementPromiseAction,
  promiseMiddleware,
  rejectPromiseAction,
  resolvePromiseAction,
} from '../dist'

/*
 * Test helper: Define sagas to test each of the library's exported sagas
 */
const sagas = {
  //
  // Saga that uses implementPromiseAction().
  //
  // It will resolve or reject when it receives a control action
  //
  implementSaga: function * (action) {
    yield call(implementPromiseAction, action, function * () {
      const { payload: { resolveValue, rejectMessage } } = yield take(sagas.controlAction)
      if (resolveValue) {
        return resolveValue
      } else {
        throw new Error(rejectMessage)
      }
    })
  },

  //
  // Saga that uses resolvePromiseAction().
  //
  // It will resolve when it receives controlAction
  //
  resolveSaga: function * (action) {
    const { payload: { resolveValue } } = yield take(sagas.controlAction)
    yield call(resolvePromiseAction, action, resolveValue)
  },

  //
  // Saga that uses rejectPromiseAction().
  //
  // It will reject when it receives controlAction
  //
  rejectSaga: function * (action) {
    const { payload: { rejectMessage } } = yield take(sagas.controlAction)
    yield call(rejectPromiseAction, action, new Error(rejectMessage))
  },

  //
  // Define the control action used by the sagas.
  //
  controlAction: createAction('controlAction'),
}

/*
 * Test helper:  Create a promise action, and create a store with
 * everything hooked up, including a reducer for that action's lifecycle,
 * and with a root saga that calls the given saga when the action is
 * dispatched.
 */
function setup (saga) {
  //
  // Define the promise action we'll use in our tests.  To avoid possible
  // contamination, create a new one for each test
  //
  const promiseAction = createPromiseAction('promiseAction')

  //
  // Define a reducer that records the payloads of each phase
  //
  const reducer = handleActions({
    [promiseAction.trigger]:  (state, { payload }) => ({ ...state, trigger: payload }),
    [promiseAction.resolved]: (state, { payload }) => ({ ...state, resolved: payload }),
    [promiseAction.rejected]: (state, { payload }) => ({ ...state, rejected: payload }),
  }, {})

  //
  // Create the store
  //
  let caughtError = null
  const caughtMiddlewareError = () => caughtError
  const sagaMiddleware        = createSagaMiddleware({ onError: error => (caughtError = error) })
  const store                 = createStore(reducer, {}, applyMiddleware(promiseMiddleware, sagaMiddleware))

  //
  // Run the passed saga
  //
  sagaMiddleware.run(function * () { yield takeEvery(promiseAction, saga) })

  return { caughtMiddlewareError, promiseAction, store }
}

/*
 * The tests
 */

test('implementPromiseAction-resolve', async (t) => {
  // Setup
  const { promiseAction, store } = setup(sagas.implementSaga)
  const triggerPayload           = 'triggerPayload'
  const resolveValue             = 'resolveValue'

  // Dispatch the promise action
  const promise = store.dispatch(promiseAction(triggerPayload))

  // Verify trigger payload has been reduced
  t.assert(store.getState().trigger === triggerPayload)

  // Dispatch control action
  store.dispatch(sagas.controlAction({ resolveValue }))

  // Verify promise resolution
  const resolvedWith = await promise
  t.assert(resolvedWith === resolveValue)

  // Verify reduced values
  t.assert(store.getState().trigger === triggerPayload)
  t.assert(store.getState().resolved === resolveValue)
  t.assert(store.getState().rejected == null)
})

test('implementPromiseAction-reject', async (t) => {
  // Setup
  const { promiseAction, store } = setup(sagas.implementSaga)
  const triggerPayload = 'triggerPayload'
  const rejectMessage = 'rejectMessage'

  // Dispatch the promise action
  const promise = store.dispatch(promiseAction(triggerPayload))

  // Verify trigger payload has been reduced
  t.assert(store.getState().trigger === triggerPayload)

  // Dispatch control action
  store.dispatch(sagas.controlAction({ rejectMessage }))

  // Verify promise rejection
  const error = await promise.catch(error => error)
  t.assert(error.message === rejectMessage)

  // Verify reduced values
  t.assert(store.getState().trigger  === triggerPayload)
  t.assert(store.getState().resolved == null)
  t.assert(store.getState().rejected === error)
})

test('resolvePromiseAction', async (t) => {
  // Setup
  const { promiseAction, store } = setup(sagas.resolveSaga)
  const triggerPayload           = 'triggerPayload'
  const resolveValue             = 'resolveValue'

  // Dispatch the promise action, monitor resolution
  const promise = store.dispatch(promiseAction(triggerPayload))

  // Verify trigger payload has been reduced
  t.assert(store.getState().trigger === triggerPayload)

  // Dispatch control action
  store.dispatch(sagas.controlAction({ resolveValue }))

  // Verify promise resolution
  const resolvedWith = await promise
  t.assert(resolvedWith === resolveValue)

  // Verify reduced values
  t.assert(store.getState().trigger === triggerPayload)
  t.assert(store.getState().resolved === resolveValue)
  t.assert(store.getState().rejected == null)
})

test('rejectPromiseAction', async (t) => {
  // Setup
  const { promiseAction, store } = setup(sagas.rejectSaga)
  const triggerPayload           = 'triggerPayload'
  const rejectMessage            = 'rejectMessage'

  // Dispatch the promise action, monitor rejection
  const promise = store.dispatch(promiseAction(triggerPayload))

  // Verify trigger payload has been reduced
  t.assert(store.getState().trigger === triggerPayload)

  // Dispatch control action
  store.dispatch(sagas.controlAction({ rejectMessage }))

  // Verify promise rejection
  const error = await promise.catch(error => error)
  t.assert(error.message === rejectMessage)

  // Verify reduced values
  t.assert(store.getState().trigger === triggerPayload)
  t.assert(store.getState().resolved == null)
  t.assert(store.getState().rejected === error)
})

test('dispatch', t => {
  const promiseAction = createPromiseAction('testPromiseAction')
  const ordinaryAction = createAction('ordinaryAction')
  const payload = { test: 123 }

  t.assert(isEqual(dispatch(promiseAction, payload), putResolve(promiseAction(payload))))
  t.assert(isEqual(dispatch(promiseAction(payload)), putResolve(promiseAction(payload))))
  t.assert(isEqual(dispatch(ordinaryAction, payload), put(ordinaryAction(payload))))
  t.assert(isEqual(dispatch(ordinaryAction(payload)), put(ordinaryAction(payload))))
})

test('implementPromiseAction-ArgumentError', t => {
  const { caughtMiddlewareError, promiseAction, store } = setup(sagas.implementSaga)
  const bogusPromiseAction = () => ({ type: promiseAction.toString() }) // mimics promise action but doesn't have proper meta
  store.dispatch(bogusPromiseAction())
  t.assert(caughtMiddlewareError() instanceof ArgumentError)
})

test('resolvePromiseAction-ArgumentError', t => {
  const { caughtMiddlewareError, promiseAction, store } = setup(sagas.resolveSaga)
  const bogusPromiseAction = () => ({ type: promiseAction.toString() }) // mimics promise action but doesn't have proper meta
  store.dispatch(bogusPromiseAction())
  store.dispatch(sagas.controlAction({}))
  t.assert(caughtMiddlewareError() instanceof ArgumentError)
})

test('rejectPromiseAction-ArgumentError', t => {
  const { caughtMiddlewareError, promiseAction, store } = setup(sagas.rejectSaga)
  const bogusPromiseAction = () => ({ type: promiseAction.toString() }) // mimics promise action but doesn't have proper meta
  store.dispatch(bogusPromiseAction())
  store.dispatch(sagas.controlAction({}))
  t.assert(caughtMiddlewareError() instanceof ArgumentError)
})

test('dispatch-ArgumentError', t => {
  const promiseAction = createPromiseAction('testPromiseAction')
  t.throws(() => dispatch(promiseAction(), 'extra-arg'))
  t.throws(() => dispatch(null), ArgumentError)
})
