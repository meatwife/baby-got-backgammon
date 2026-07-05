/**
 * Sync Thunk - Synchronous thunk pattern for Redux
 *
 * Provides a way to execute business logic with access to state
 * and return typed results, all within the Redux action dispatch flow.
 *
 * Based on the pattern from https://github.com/sam-mfb/continuum
 */

import type { PayloadAction } from '@reduxjs/toolkit'

// =============================================================================
// Types
// =============================================================================

/**
 * The thunk API provided to payload creators.
 * Similar to Redux Toolkit's async thunk API but synchronous.
 */
export interface SyncThunkAPI<TState, TExtra> {
  getState: () => TState
  extra: TExtra
}

/**
 * A function that creates the result for a sync thunk action.
 */
export type PayloadCreator<TState, TExtra, TReturn, TArg> = (
  arg: TArg,
  thunkAPI: SyncThunkAPI<TState, TExtra>
) => TReturn

/**
 * Metadata attached to sync thunk actions.
 */
export interface SyncThunkMeta<TState, TExtra, TReturn, TArg> {
  payloadCreator: PayloadCreator<TState, TExtra, TReturn, TArg>
  result?: TReturn
}

/**
 * A sync thunk action - a PayloadAction with special metadata.
 */
export type SyncThunkAction<
  TState,
  TExtra,
  TReturn,
  TArg = void
> = PayloadAction<TArg, string, SyncThunkMeta<TState, TExtra, TReturn, TArg>>

/**
 * Type guard to check if an action is a sync thunk action.
 */
export function isSyncThunkAction(
  action: unknown
): action is SyncThunkAction<unknown, unknown, unknown, unknown> {
  if (typeof action !== 'object' || action === null) {
    return false
  }
  if (!('type' in action) || !('meta' in action)) {
    return false
  }
  const meta = (action as { meta?: unknown }).meta
  if (typeof meta !== 'object' || meta === null) {
    return false
  }
  return (
    typeof (meta as { payloadCreator?: unknown }).payloadCreator === 'function'
  )
}

/**
 * An action creator for a sync thunk.
 * When called, returns an action that the middleware will process.
 */
export interface SyncThunkActionCreator<TState, TExtra, TReturn, TArg = void> {
  (arg: TArg): SyncThunkAction<TState, TExtra, TReturn, TArg>
  type: string
  match: (
    action: unknown
  ) => action is SyncThunkAction<TState, TExtra, TReturn, TArg>
}

/**
 * Factory type for creating typed sync thunks.
 */
export type CreateSyncThunk<TState, TExtra> = <TReturn, TArg = void>(
  typePrefix: string,
  payloadCreator: PayloadCreator<TState, TExtra, TReturn, TArg>
) => SyncThunkActionCreator<TState, TExtra, TReturn, TArg>

// =============================================================================
// Factory
// =============================================================================

/**
 * Build a factory for creating sync thunks with typed state and extra argument.
 *
 * Usage:
 * ```ts
 * const createSyncThunk = buildCreateSyncThunk<RootState, ExtraArg>()
 *
 * const myThunk = createSyncThunk<Result<Data, Error>, InputArg>(
 *   'myThunk',
 *   (arg, { getState, extra }) => {
 *     const state = getState()
 *     // business logic here
 *     return ok(data)
 *   }
 * )
 * ```
 */
export function buildCreateSyncThunk<
  TState,
  TExtra = undefined
>(): CreateSyncThunk<TState, TExtra> {
  return function createSyncThunk<TReturn, TArg = void>(
    typePrefix: string,
    payloadCreator: PayloadCreator<TState, TExtra, TReturn, TArg>
  ): SyncThunkActionCreator<TState, TExtra, TReturn, TArg> {
    const type = typePrefix

    const actionCreator = ((
      arg: TArg
    ): SyncThunkAction<TState, TExtra, TReturn, TArg> => {
      return {
        type,
        payload: arg,
        meta: {
          payloadCreator
        }
      }
    }) as SyncThunkActionCreator<TState, TExtra, TReturn, TArg>

    actionCreator.type = type
    actionCreator.match = (
      action: unknown
    ): action is SyncThunkAction<TState, TExtra, TReturn, TArg> => {
      return (
        typeof action === 'object' &&
        action !== null &&
        'type' in action &&
        (action as { type: unknown }).type === type
      )
    }

    return actionCreator
  }
}
