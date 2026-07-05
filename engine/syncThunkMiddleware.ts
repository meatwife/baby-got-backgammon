/**
 * Sync Thunk Middleware
 *
 * Redux middleware that intercepts sync thunk actions,
 * executes their payload creators, and stores the result in the action's meta.
 */

import type { Middleware, UnknownAction } from '@reduxjs/toolkit'
import { isSyncThunkAction } from './syncThunk'

/**
 * Creates middleware that executes sync thunk payload creators.
 *
 * The middleware:
 * 1. Detects sync thunk actions (actions with payloadCreator in meta)
 * 2. Executes the payload creator with getState and extra
 * 3. Stores the result in action.meta.result
 * 4. Passes the action to the next middleware/reducer
 *
 * Reducers can then use extraReducers to react to sync thunk actions
 * and access the result via action.meta.result.
 *
 * @param extra - Extra argument to pass to payload creators (optional)
 */
export function createSyncThunkMiddleware(extra?: unknown): Middleware {
  const middleware: Middleware = api => next => (action: unknown) => {
    if (isSyncThunkAction(action)) {
      // Execute the payload creator and store the result
      const getState = (): unknown => api.getState()
      const result = action.meta.payloadCreator(action.payload, {
        getState,
        extra
      })
      action.meta.result = result
    }
    return next(action as UnknownAction)
  }

  return middleware
}

/**
 * Pre-configured middleware for game operations.
 * No extra argument needed for the game package.
 */
export const gameSyncThunkMiddleware = createSyncThunkMiddleware()
