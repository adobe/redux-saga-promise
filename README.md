# @adobe/redux-saga-promise

Simple clean utility to define actions that return promises, for use with [redux-saga](https://redux-saga.js.org)

# Overview

The library provides:

* An action creator, `createPromiseAction()` that you can use to define actions which return promises.  We call an action that returns a promise a *promise action*.
 
* Saga helpers `implementPromiseAction()`, `resolvePromiseAction()`, and`rejectPromiseAction()` that you use to resolve or reject a promise action's promise.

* Lifecyle actions `promise.trigger`, `promise.resolved`, and `promise.rejected` that you can use in reducers (or wherever)

* Middleware that makes it work.

* For convenience, an optional saga "effect creator" `dispatch()` to simplify dispatching promise actions and ordinary actions from within sagas.

These are described in detail below.

# Installation

As usual, install via:

```
npm install @adobe/redux-saga-promise
```

# Usage

## Including the middleware:

You must include include `promiseMiddleware` in the middleware chain, and it must come *before* `sagaMiddleware`:

```js
import { applyMiddleware, createStore } from 'redux'
import { promiseMiddleware }            from '@adobe/redux-saga-promise'
import createSagaMiddleware             from 'redux-saga'

// ...assuming rootReducer and rootSaga are defined
const sagaMiddleware = createSagaMiddleware()
const store          = createStore(rootReducer, {}, applyMiddleware(promiseMiddleware, sagaMiddleware))
sagaMiddleware.run(rootSaga)
```

## Creating a promise action:

Create a promise action using `createPromiseAction`, analogous to  [`createAction`](https://redux-actions.js.org/api/createaction#createaction) of [redux-actions](https://redux-actions.js.org):

```js
import { createPromiseAction } from '@adobe/redux-saga-promise'

export const myAction = createPromiseAction('MY_ACTION')
```

Behind the scenes, `createPromiseAction` uses `createAction` to define
[FSA](https://github.com/acdlite/flux-standard-action)-compliant actions.
It also accepts `payload` and `meta` as optional second and third
arguments, same as `createAction`.  (And, like `createAction`, technically
`createPromiseAction` returns an action *creator* rather than an action.)

## Dispatching a promise action:

Dispatch a promise action normally, and `dispatch()` will return a promise:

```js
import myAction from './myAction'

// In an ordinary function...
function () {
  ...
  dispatch(myAction(payload)).then(value => ...).catch(error => ...)
  ...
}

// In an async function....
async function () {
  try {
    const value = await dispatch(myAction(payload))
    ...
  } catch (error) {
    ...
  }
}
```

## Resolving/rejecting the action in a saga:

It is up to you as the implementer to resolve or reject the promise's action
in a saga.  There are three helpers you can use as needed:

### `implementPromiseAction(action, saga)`

The most convenient way!  You give this helper a saga function which it
will execute.  If the saga function succesfully returns a value, the promise will
resolve with that value.   If the saga function throws an error, the promise
will be rejected with that error.  For example:

```js
import { call, takeEvery }        from 'redux-saga/effects'
import { promises as fsPromises } from 'fs'
import { implementPromiseAction } from '@adobe/redux-saga-promise'

import myAction from './myAction'

//
// Asynchronously read a file, resolving the promise with the file's
// contents, or rejecting the promise if the file can't be read.
//
function * handleMyAction (action) {
  yield call(implementPromiseAction, action, function * () {
    // 
    // Implemented as a simple wrapper around fsPromises.readFile.
    // Rejection happens implicilty if fsPromises.readFile fails.
    //
    const { path } = action.payload
    return yield call(fsPromises.readFile, path, { encoding: 'utf8' })
  })
}

export function * rootSaga () {
  yield takeEvery(myAction, handleMyAction)
})
```

If you call `implementPromiseAction()` with a first argument that is not a
promise action, it will throw an error (see [Argument Validation](#argument-validation) below).

### `resolvePromiseAction(action, value)`

Sometimes you may want finer control, or want to be more explicit when you know an
operation won't fail.  This helper causes the promise to resolve with the
passed value.  For example:

```js
import { call, delay, takeEvery } from 'redux-saga/effects'
import { resolvePromiseAction }   from '@adobe/redux-saga-promise'

import myAction from './myAction'

//
// Delay a given number of seconds then resolve with the given value.
//
function * handleMyAction (action) {
  const { seconds, value } = action.payload
  yield delay(seconds*1000)
  yield call(resolvePromiseAction, action, value)
}

function * rootSaga () {
  yield takeEvery(myAction, handleMyAction)
})
```

If you call `resolvePromiseAction()` with a first argument that is not a
promise action, it will throw an error (see [Argument Validation](#argument-validation) below).

### `rejectPromiseAction(action, value)`

Sometimes you may want finer control, or want to explicitly fail without needing to `throw`. This helper causes the promise to reject with the
passed value, which typically should be an `Error`.  For example:

```js
import { call, takeEvery }     from 'redux-saga/effects'
import { rejectPromiseAction } from '@adobe/redux-saga-promise'

import myAction from './myAction'

//
// TODO: Implement this!   Failing for now
//
function * handleMyAction (action) {
  yield call(rejectPromiseAction, action, new Error("Sorry, myAction is not implemented yet")
}

function * rootSaga () {
  yield takeEvery(myAction, handleMyAction)
})
```

If you call `rejectPromiseAction()` with a first argument that is not a
promise action, it will throw an error (see [Argument Validation](#ArgumentValidation) below).


## Action lifecycle -- reducing the promise action:

Commonly you want the redux store to reflect the status of a promise action:
whether it's pending, what the resolved value is, or what the rejected error
is.

Behind the scenes, `myAction = createPromiseAction('MY_ACTION')` actually
creates a suite of three actions:

* `myAction.trigger`: An alias for `myAction`, which is what you dispatch that then creates the promise.

* `myAction.resolved`: Dispatched automatically by `promiseMiddleware` when the promise is resolved; its payload is the resolved value of the promise

* `myAction.rejected`: Dispatched automatically by `promiseMiddleware` when the promise is rejected; its payload is the rejection error of the promise

You can easily use them in `handleActions` of [redux-actions](https://redux-actions.js.org):

```js
import { handleActions } from 'redux-actions'

import myAction from './myAction'

//
// For the readFile wrapper described above, we can keep track of the file in the store
//
export const reducer = handleActions({
    [myAction.trigger]:  (state, { payload: { path } }) => ({ ...state, file: { path, status: 'reading'} }),
    [myAction.resolved]: (state, { payload: contents }) => ({ ...state, file: { path: state.file.path, status: 'read', contents } }),
    [myAction.rejected]: (state, { payload: error })    => ({ ...state, file: { path: state.file.path, status: 'failed', error } }),
  }, {})
```

## Dispatching a promise action in a saga

In the sagas that perform your business logic, you may at times want to dispatch a promise action and wait for it to resolve.  You can do that using redux-saga's [`putResolve`](http://redux-saga.js.org/docs/api/#putresolveaction) Effect:

```const result = yield putResolve(myPromiseAction)```

This dispatches the action and waits for the promise to resolve, returning the resolved  value.  Or if the promise rejects it will bubble up an error.

*Caution!* If you use [`put()`](http://redux-saga.js.org/docs/api/#putaction`) instead of `putResolve()`, the saga will continue execution immediately without waiting for the promise to resolve.

### Helper for dispatching actions in sagas

*TL;dr:  The `dispatch()` helper is entirely optional.  You can ignore this section.  But for sagas that dispatch promise actions,
you can use it if you think it will make your code cleaner or more robust.*

In sagas that perform your business logic if you dispatch a mix of ordinary actions and promise actions, you must remember use `put()` vs `putResolve()` appropriately.  E.g., you might have:


```js
import { call, put, putResolve } from 'redux-saga/effects'

function * myBusinessLogic () {
  yield putResolve(myPromiseAction({ c:3, d: 4 })) // Wait for promise to resolve
  yield put(someOrdinaryAction({ a: 1, b: 2}))     // Don't wait
  yield call(someAsyncFunction, { e: 5 })          // Waits for promise to resolve
  yield call(someOrdinaryFunction, { f: 6 })       // Doesn't wait
}
```

Unfortunately it's easy to accidentally use `put()` instead of `putResolve()` which means the saga will immediately continue without waiting for your promise to resolve -- in many
cases causing subtle errors.  (Voice of experience here!)

To avoid that error, and for consistency, `redux-saga-promise` provides an "effect creator" named `dispatch`.  Use it via:

* `yield dispatch(action)`, passing an action
* `yield dispatch(actionCreator, ...args)`, passing an actionCreator and optional args, which `dispatch()` will to produce an action.

The behavior mimics that of [`call()`](https://redux-saga.js.org/docs/api/#callfn-args) -- 
if the action is a promise action, `yield dispatch()` will dispatch it and block until the
promise resolves then return the resolved value (or will bubble up an error if
the promise rejects).  For any other action, `yield dispatch()` will simply
dispatch it normally and return whatever `store.dispatch` returns.

This lets you use `yield dispatch(action, ...args)` everywhere to dispatch
actions, like you can use `yield call(function, ...args)` to call functions. You then doesn't need to worry about which actions are promise actions and which aren't.  I.e. the above saga then becomes:

```js
import { call }     from 'redux-saga/effects'
import { dispatch } from '@adobe/redux-saga-promise'

function * myBusinessLogic () {
  yield dispatch(myPromiseAction, { c:3, d: 4 })    // Waits for promise to resolve
  yield dispatch(someOrdinaryAction, { a: 1, b: 2}) // Doesn't wait
  yield call(someAsyncFunction, { e: 5 })           // Waits for promise to resolve
  yield call(someOrdinaryFunction, { f: 6 })        // Doesn't wait
}
```

Behind the scenes, `dispatch()` simply returns `put(action)` or
`putResolve(action)` based on whether the action was created by
`createPromiseAction`.

If you call `dispatch()` with a first argument that is `null`, or the first argument is not a function but you provide extra `...args` anyway, it will throw
an error (see [Argument Validation](#argument-validation) below)

## <a name='argument-validation'></a> Argument Validation

To avoid accidental confusion, all the helper functions validate their
arguments and will throw a custom `Error` subclass `ArgumentError` in case
of error.  This error will be bubbled up by redux-saga as usual, and as usual you can catch it in a saga otherwise it will will bubble up to the [`onError`](https://redux-saga.js.org/docs/api/#createsagamiddlewareoptions) hook.  If you want to, you can test the error type, e.g.:

```js
import { applyMiddleware, compose, createStore } from 'redux'
import { ArgumentError, promiseMiddleware }      from '@adobe/redux-saga-promise'
import createSagaMiddleware                      from 'redux-saga'

// ...assuming rootReducer and rootSaga are defined
const sagaMiddleware = createSagaMiddleware({ onError: (error) => {
  if (error instanceof ArgumentError) {
    console.log('Oops, programmer error! I called redux-saga-promise incorrectly:', error)
  } else {
    // ...
  }
})
const store = createStore(rootReducer, {}, compose(applyMiddleware(promiseMiddleware, sagaMiddleware)))
sagaMiddleware.run(rootSaga)
```

Additionally, all the helper functions will throw a custom `Error` subclass `ConfigurationError` if `promiseMiddleware` was not properly included in the store.

# Contributing

Contributions are welcomed! Read the [Contributing Guide](./CONTRIBUTING.md) for more information.

### Building & Testing

`package.json` defines the usual scripts:

* `npm build`: transpiles the source, placing the result in `dist/index.js`
* `npm test`: builds, and then runs the test suite.

The tests are written using the [AVA](https://github.com/avajs/ava) test runner.


# Licensing

This project is licensed under the Apache V2 License. See [LICENSE](./LICENSE) for more information.
