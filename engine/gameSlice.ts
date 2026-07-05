/**
 * Game Slice
 *
 * Redux slice for backgammon game state management.
 * Includes reducers for game actions and extraReducers
 * that handle sync thunk operations.
 */

import {
  createSlice,
  createSelector,
  type PayloadAction
} from '@reduxjs/toolkit'
import type {
  BoardState,
  DiceRoll,
  DoublingCubeState,
  GameAction,
  GameOptions,
  GameResult,
  GameState,
  Move,
  Player
} from './types'
import { getOpponent } from './types'
import {
  canProposeDouble,
  checkGameOver,
  getValidMoves,
  getRequiredMoves,
  filterMovesByDie,
  canEndTurn,
  createInitialBoard
} from './rules'
import { getRemainingMovesFromDice } from './dice'
import {
  performStartGame,
  performRollDice,
  performMove,
  performEndTurn,
  performUndoMove,
  performUndoAllMoves,
  performProposeDouble,
  performRespondToDouble,
  type StartGameAction,
  type RollDiceAction,
  type MakeMoveAction,
  type EndTurnAction,
  type UndoMoveAction,
  type UndoAllMovesAction,
  type ProposeDoubleAction,
  type RespondToDoubleAction
} from './operations'

/** State shape expected by selectors - apps must configure their store with { game: GameState } */
export type RootState = { game: GameState }

/**
 * Standard backgammon starting position
 */
const INITIAL_BOARD: BoardState = {
  points: [
    -2, 0, 0, 0, 0, 5, 0, 3, 0, 0, 0, -5, 5, 0, 0, 0, -3, 0, -5, 0, 0, 0, 0, 2
  ],
  bar: { white: 0, black: 0 },
  borneOff: { white: 0, black: 0 }
}

const initialState: GameState = {
  board: INITIAL_BOARD,
  currentPlayer: null,
  phase: 'not_started',
  diceRoll: null,
  remainingMoves: [],
  turnNumber: 0,
  movesThisTurn: [],
  result: null,
  history: [],
  actionHistory: [],
  doublingCube: null,
  doubleProposedBy: null
}

export const gameSlice = createSlice({
  name: 'game',
  initialState,
  reducers: {
    /** Transition to rolling_for_first phase to determine who goes first */
    startGame(state) {
      state.phase = 'rolling_for_first'
    },

    /** Set who goes first and transition to rolling phase */
    setFirstPlayer(state, action: PayloadAction<Player>) {
      state.currentPlayer = action.payload
      state.phase = 'rolling'
    },

    /** Set dice roll, compute remaining moves (4 if doubles), transition to moving */
    rollDice(state, action: PayloadAction<DiceRoll>) {
      const { die1, die2 } = action.payload
      state.diceRoll = action.payload
      state.phase = 'moving'

      if (die1 === die2) {
        state.remainingMoves = [die1, die1, die1, die1]
      } else {
        state.remainingMoves = [die1, die2]
      }
    },

    /** Execute a move, update board/bar/borneOff, consume die from remainingMoves */
    makeMove(state, action: PayloadAction<Move>) {
      const { from, to, dieUsed } = action.payload
      const player = state.currentPlayer
      if (!player) return

      // Remove checker from source
      if (from === 'bar') {
        state.board.bar[player]--
      } else {
        const fromIndex = from - 1
        if (player === 'white') {
          state.board.points[fromIndex]--
        } else {
          state.board.points[fromIndex]++
        }
      }

      // Place checker at destination
      if (to === 'off') {
        state.board.borneOff[player]++
      } else {
        const toIndex = to - 1
        const pointValue = state.board.points[toIndex]

        if (player === 'white' && pointValue === -1) {
          state.board.points[toIndex] = 1
          state.board.bar.black++
        } else if (player === 'black' && pointValue === 1) {
          state.board.points[toIndex] = -1
          state.board.bar.white++
        } else {
          if (player === 'white') {
            state.board.points[toIndex]++
          } else {
            state.board.points[toIndex]--
          }
        }
      }

      // Consume the used die value
      const dieIndex = state.remainingMoves.indexOf(dieUsed)
      if (dieIndex !== -1) {
        state.remainingMoves.splice(dieIndex, 1)
      }

      state.movesThisTurn.push(action.payload)

      const gameResult = checkGameOver({ state: state as GameState })
      if (gameResult) {
        state.result = gameResult
        state.phase = 'game_over'
      }
    },

    /** Archive turn to history, switch player, transition to rolling */
    endTurn(state) {
      if (state.currentPlayer && state.diceRoll) {
        state.history.push({
          player: state.currentPlayer,
          diceRoll: state.diceRoll,
          moves: [...state.movesThisTurn]
        })
      }

      state.currentPlayer = state.currentPlayer === 'white' ? 'black' : 'white'
      state.diceRoll = null
      state.remainingMoves = []
      state.movesThisTurn = []
      state.turnNumber++
      state.phase = 'rolling'
    },

    /** Set result and transition to game_over */
    endGame(state, action: PayloadAction<GameResult>) {
      state.result = action.payload
      state.phase = 'game_over'
    },

    /** Reset to initial state */
    resetGame() {
      return initialState
    }
  },
  extraReducers: builder => {
    // Handle performStartGame
    builder.addMatcher(
      performStartGame.match,
      (state, action: StartGameAction) => {
        const result = action.meta.result
        if (result?.ok) {
          const { firstPlayer, diceRoll } = result.value
          const options: GameOptions | void = action.payload
          const gameOptions = options || undefined
          const enableCube = (gameOptions?.enableDoublingCube ?? false) && !(gameOptions?.isCrawfordGame ?? false)

          const initialBoard = createInitialBoard()
          state.board.points = initialBoard.points
          state.board.bar.white = initialBoard.bar.white
          state.board.bar.black = initialBoard.bar.black
          state.board.borneOff.white = initialBoard.borneOff.white
          state.board.borneOff.black = initialBoard.borneOff.black
          state.currentPlayer = firstPlayer
          state.phase = 'moving'
          state.diceRoll = diceRoll
          state.remainingMoves = getRemainingMovesFromDice(diceRoll)
          state.turnNumber = 1
          state.movesThisTurn = []
          state.result = null
          state.history = []
          state.doublingCube = enableCube ? { value: 1, owner: 'centered' } : null
          state.doubleProposedBy = null

          // Append game_start action to history
          // diceRoll is arranged so die1 is the first player's (higher) roll
          const gameStartAction: GameAction = {
            type: 'game_start',
            firstPlayer,
            whiteRoll: firstPlayer === 'white' ? diceRoll.die1 : diceRoll.die2,
            blackRoll: firstPlayer === 'black' ? diceRoll.die1 : diceRoll.die2
          }
          state.actionHistory = [gameStartAction]
        }
      }
    )

    // Handle performRollDice
    builder.addMatcher(
      performRollDice.match,
      (state, action: RollDiceAction) => {
        const result = action.meta.result
        if (result?.ok && state.currentPlayer) {
          const { diceRoll, turnForfeited } = result.value
          const player = state.currentPlayer

          // Append dice_roll action to history
          const diceRollAction: GameAction = {
            type: 'dice_roll',
            player,
            roll: diceRoll,
            turnForfeited
          }
          state.actionHistory.push(diceRollAction)

          if (turnForfeited) {
            // No valid moves - stay in moving phase so caller can explicitly end turn
            state.diceRoll = diceRoll
            state.phase = 'moving'
            state.remainingMoves = []
            state.movesThisTurn = []
          } else {
            state.diceRoll = diceRoll
            state.phase = 'moving'
            state.remainingMoves = getRemainingMovesFromDice(diceRoll)
            state.movesThisTurn = []
          }
        }
      }
    )

    // Handle performMove
    builder.addMatcher(performMove.match, (state, action: MakeMoveAction) => {
      const result = action.meta.result
      if (result?.ok && state.currentPlayer) {
        const { move, hit, gameOver, remainingMoves } = result.value
        const player = state.currentPlayer
        const { from, to, dieUsed } = move

        // Append piece_move action to history
        const pieceMoveAction: GameAction = {
          type: 'piece_move',
          player,
          from,
          to,
          dieUsed,
          hit
        }
        state.actionHistory.push(pieceMoveAction)

        // Remove checker from source
        if (from === 'bar') {
          state.board.bar[player]--
        } else {
          const fromIndex = from - 1
          if (player === 'white') {
            state.board.points[fromIndex]--
          } else {
            state.board.points[fromIndex]++
          }
        }

        // Place checker at destination
        if (to === 'off') {
          state.board.borneOff[player]++
        } else {
          const toIndex = to - 1
          const pointValue = state.board.points[toIndex]

          if (player === 'white' && pointValue === -1) {
            state.board.points[toIndex] = 1
            state.board.bar.black++
          } else if (player === 'black' && pointValue === 1) {
            state.board.points[toIndex] = -1
            state.board.bar.white++
          } else {
            if (player === 'white') {
              state.board.points[toIndex]++
            } else {
              state.board.points[toIndex]--
            }
          }
        }

        // Update remaining moves
        state.remainingMoves = [...remainingMoves]
        state.movesThisTurn.push(move)

        if (gameOver) {
          state.result = gameOver
          state.phase = 'game_over'
        }
      }
    })

    // Handle performEndTurn
    builder.addMatcher(performEndTurn.match, (state, action: EndTurnAction) => {
      const result = action.meta.result
      if (result?.ok && state.currentPlayer) {
        const { nextPlayer, turnNumber } = result.value

        // Append turn_end action to history
        const turnEndAction: GameAction = {
          type: 'turn_end',
          player: state.currentPlayer
        }
        state.actionHistory.push(turnEndAction)

        if (state.diceRoll) {
          state.history.push({
            player: state.currentPlayer,
            diceRoll: state.diceRoll,
            moves: [...state.movesThisTurn]
          })
        }

        state.currentPlayer = nextPlayer
        state.diceRoll = null
        state.remainingMoves = []
        state.movesThisTurn = []
        state.turnNumber = turnNumber
        state.phase = 'rolling'
      }
    })

    // Handle performUndoMove
    builder.addMatcher(
      performUndoMove.match,
      (state, action: UndoMoveAction) => {
        const result = action.meta.result
        if (result?.ok && state.currentPlayer) {
          const { undoneMoves } = result.value
          const player = state.currentPlayer
          const opponent = getOpponent(player)

          for (let i = undoneMoves.length - 1; i >= 0; i--) {
            const { move, hit } = undoneMoves[i]
            const { from, to } = move

            // Remove checker from destination
            if (to === 'off') {
              state.board.borneOff[player]--
            } else {
              const toIndex = to - 1
              if (player === 'white') {
                state.board.points[toIndex]--
              } else {
                state.board.points[toIndex]++
              }

              // Restore hit opponent checker
              if (hit) {
                state.board.bar[opponent]--
                if (opponent === 'white') {
                  state.board.points[toIndex]++
                } else {
                  state.board.points[toIndex]--
                }
              }
            }

            // Restore checker to source
            if (from === 'bar') {
              state.board.bar[player]++
            } else {
              const fromIndex = from - 1
              if (player === 'white') {
                state.board.points[fromIndex]++
              } else {
                state.board.points[fromIndex]--
              }
            }

            // Restore die to remaining moves
            state.remainingMoves.push(move.dieUsed)

            // Pop from movesThisTurn
            state.movesThisTurn.pop()

            // Pop the piece_move from actionHistory
            for (let j = state.actionHistory.length - 1; j >= 0; j--) {
              if (state.actionHistory[j].type === 'piece_move') {
                state.actionHistory.splice(j, 1)
                break
              }
            }
          }

          // If game was over due to bearing off all, restore to moving phase
          if (state.phase === 'game_over') {
            state.phase = 'moving'
            state.result = null
          }
        }
      }
    )

    // Handle performUndoAllMoves
    builder.addMatcher(
      performUndoAllMoves.match,
      (state, action: UndoAllMovesAction) => {
        const result = action.meta.result
        if (result?.ok && state.currentPlayer) {
          const { undoneMoves } = result.value
          const player = state.currentPlayer
          const opponent = getOpponent(player)

          // Reverse all moves in reverse order
          for (let i = undoneMoves.length - 1; i >= 0; i--) {
            const { move, hit } = undoneMoves[i]
            const { from, to } = move

            // Remove checker from destination
            if (to === 'off') {
              state.board.borneOff[player]--
            } else {
              const toIndex = to - 1
              if (player === 'white') {
                state.board.points[toIndex]--
              } else {
                state.board.points[toIndex]++
              }

              // Restore hit opponent checker
              if (hit) {
                state.board.bar[opponent]--
                if (opponent === 'white') {
                  state.board.points[toIndex]++
                } else {
                  state.board.points[toIndex]--
                }
              }
            }

            // Restore checker to source
            if (from === 'bar') {
              state.board.bar[player]++
            } else {
              const fromIndex = from - 1
              if (player === 'white') {
                state.board.points[fromIndex]++
              } else {
                state.board.points[fromIndex]--
              }
            }

            // Restore die to remaining moves
            state.remainingMoves.push(move.dieUsed)
          }

          // Clear all moves this turn
          state.movesThisTurn = []

          // Remove all piece_move actions from this turn in actionHistory
          const moveCount = undoneMoves.length
          let removed = 0
          for (let j = state.actionHistory.length - 1; j >= 0 && removed < moveCount; j--) {
            if (state.actionHistory[j].type === 'piece_move') {
              state.actionHistory.splice(j, 1)
              removed++
            }
          }

          // If game was over due to bearing off all, restore to moving phase
          if (state.phase === 'game_over') {
            state.phase = 'moving'
            state.result = null
          }
        }
      }
    )

    // Handle performProposeDouble
    builder.addMatcher(
      performProposeDouble.match,
      (state, action: ProposeDoubleAction) => {
        const result = action.meta.result
        if (result?.ok && state.currentPlayer) {
          const { proposedBy, newCubeValue } = result.value

          state.phase = 'doubling_proposed'
          state.doubleProposedBy = proposedBy

          const doubleAction: GameAction = {
            type: 'double_proposed',
            player: proposedBy,
            newValue: newCubeValue
          }
          state.actionHistory.push(doubleAction)
        }
      }
    )

    // Handle performRespondToDouble
    builder.addMatcher(
      performRespondToDouble.match,
      (state, action: RespondToDoubleAction) => {
        const result = action.meta.result
        if (result?.ok && state.doubleProposedBy) {
          if (result.value.response === 'accept') {
            const { newCubeValue, newOwner } = result.value

            // Update cube
            state.doublingCube = { value: newCubeValue, owner: newOwner }
            state.doubleProposedBy = null
            state.phase = 'rolling'

            const acceptAction: GameAction = {
              type: 'double_accepted',
              player: newOwner,
              cubeValue: newCubeValue
            }
            state.actionHistory.push(acceptAction)
          } else {
            const { winner, gameResult } = result.value

            state.result = gameResult
            state.phase = 'game_over'
            state.doubleProposedBy = null

            const declineAction: GameAction = {
              type: 'double_declined',
              player: getOpponent(winner),
              cubeValue: gameResult.cubeValue
            }
            state.actionHistory.push(declineAction)
          }
        }
      }
    )
  }
})

export const {
  startGame,
  setFirstPlayer,
  rollDice,
  makeMove,
  endTurn,
  endGame,
  resetGame
} = gameSlice.actions

// =============================================================================
// Selectors
// =============================================================================

export const selectBoard = (state: RootState): BoardState => state.game.board
export const selectCurrentPlayer = (state: RootState): Player | null =>
  state.game.currentPlayer
export const selectPhase = (state: RootState): GameState['phase'] =>
  state.game.phase
export const selectDiceRoll = (state: RootState): DiceRoll | null =>
  state.game.diceRoll
export const selectRemainingMoves = (
  state: RootState
): GameState['remainingMoves'] => state.game.remainingMoves
export const selectTurnNumber = (state: RootState): number =>
  state.game.turnNumber
export const selectMovesThisTurn = (state: RootState): readonly Move[] =>
  state.game.movesThisTurn
export const selectResult = (state: RootState): GameResult | null =>
  state.game.result
export const selectHistory = (state: RootState): GameState['history'] =>
  state.game.history
export const selectActionHistory = (
  state: RootState
): GameState['actionHistory'] => state.game.actionHistory
export const selectLastAction = (state: RootState): GameAction | null => {
  const { actionHistory } = state.game
  return actionHistory.length > 0
    ? actionHistory[actionHistory.length - 1]
    : null
}
export const selectBar = (state: RootState): BoardState['bar'] =>
  state.game.board.bar
export const selectBorneOff = (state: RootState): BoardState['borneOff'] =>
  state.game.board.borneOff
export const selectIsGameOver = (state: RootState): boolean =>
  state.game.phase === 'game_over'
export const selectCanRoll = (state: RootState): boolean =>
  state.game.phase === 'rolling'
export const selectCanMove = (state: RootState): boolean =>
  state.game.phase === 'moving' && state.game.remainingMoves.length > 0
export const selectIsDoubles = (state: RootState): boolean =>
  state.game.diceRoll?.die1 === state.game.diceRoll?.die2
export const selectGameState = (state: RootState): GameState => state.game

export const selectValidMoves = createSelector([selectGameState], gameState => {
  if (gameState.phase !== 'moving' || gameState.remainingMoves.length === 0) {
    return []
  }
  const allMoves = getValidMoves({ state: gameState })
  const requirements = getRequiredMoves({ state: gameState })
  return requirements.requiredDie
    ? filterMovesByDie({ availableMoves: allMoves, dieValue: requirements.requiredDie })
    : allMoves
})

export const selectCanEndTurn = createSelector([selectGameState], gameState =>
  canEndTurn({ state: gameState })
)

export const selectCanUndo = (state: RootState): boolean =>
  (state.game.phase === 'moving' || state.game.phase === 'game_over') &&
  state.game.movesThisTurn.length > 0

export const selectDoublingCube = (state: RootState): DoublingCubeState | null =>
  state.game.doublingCube

export const selectCanDouble = createSelector([selectGameState], gameState =>
  canProposeDouble({ state: gameState })
)

export const selectDoubleProposedBy = (state: RootState): Player | null =>
  state.game.doubleProposedBy

export default gameSlice.reducer
