/**
 * Match Slice
 *
 * Redux slice for match play state management.
 * Tracks scoring across multiple games with Crawford rule enforcement.
 *
 * Match state is null when not in match mode (single game).
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { GameResult, Player } from './types'
import type { MatchConfig, MatchState } from './matchTypes'

/** State shape expected by match selectors */
export type MatchRootState = { match: MatchState | null }

const matchSlice = createSlice({
  name: 'match',
  initialState: null as MatchState | null,
  reducers: {
    /**
     * Start a new match with the given configuration.
     */
    startMatch(_state, action: PayloadAction<MatchConfig>): MatchState {
      const config = action.payload
      return {
        config,
        score: { white: 0, black: 0 },
        phase: 'in_progress',
        winner: null,
        gameNumber: 1,
        isCrawfordGame: false,
        crawfordGameUsed: false,
        gameHistory: []
      }
    },

    /**
     * Record a completed game result and update match state.
     * Handles score accumulation, winner detection, and Crawford rule.
     */
    recordGameResult(state, action: PayloadAction<GameResult>): void {
      if (!state || state.phase === 'completed') return

      const result = action.payload
      state.gameHistory = [...state.gameHistory, result]

      // Add points to the winner's score
      state.score = {
        ...state.score,
        [result.winner]: state.score[result.winner] + result.points
      }

      // If this was the Crawford game, mark it as used
      if (state.isCrawfordGame) {
        state.crawfordGameUsed = true
        state.isCrawfordGame = false
      }

      // Check if match is won
      if (state.score[result.winner] >= state.config.targetScore) {
        state.phase = 'completed'
        state.winner = result.winner
        return
      }

      // Check Crawford rule: if either player is now exactly 1 point away from winning
      // and Crawford hasn't been used yet, the next game is the Crawford game
      if (!state.crawfordGameUsed) {
        const whiteNeedsCrawford = state.score.white === state.config.targetScore - 1
        const blackNeedsCrawford = state.score.black === state.config.targetScore - 1
        if (whiteNeedsCrawford || blackNeedsCrawford) {
          state.isCrawfordGame = true
        }
      }

      // Increment game number for the next game
      state.gameNumber = state.gameNumber + 1
    },

    /**
     * Reset match state (return to single game mode).
     */
    resetMatch(): null {
      return null
    }
  }
})

export const { startMatch, recordGameResult, resetMatch } = matchSlice.actions

// =============================================================================
// Selectors
// =============================================================================

export const selectMatchState = (state: MatchRootState): MatchState | null =>
  state.match

export const selectMatchScore = (state: MatchRootState): MatchState['score'] | null =>
  state.match?.score ?? null

export const selectIsCrawfordGame = (state: MatchRootState): boolean =>
  state.match?.isCrawfordGame ?? false

export const selectMatchWinner = (state: MatchRootState): Player | null =>
  state.match?.winner ?? null

export const selectIsMatchInProgress = (state: MatchRootState): boolean =>
  state.match?.phase === 'in_progress'

export const selectMatchGameNumber = (state: MatchRootState): number =>
  state.match?.gameNumber ?? 0

export default matchSlice.reducer
