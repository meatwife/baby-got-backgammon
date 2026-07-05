/**
 * Baby Got Backgammon — a backgammon room for a human and their AI companion.
 * Engine: vendored from sam-mfb/backgammon-mcp (MIT, see engine/LICENSE-upstream).
 *
 * The human plays in a browser (phone-friendly); the agent plays via the same
 * REST API (see bgb.py). Names, colors, and flavor text live in config.json.
 */

import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { configureStore } from '@reduxjs/toolkit'
import {
  gameReducer,
  matchReducer,
  gameSyncThunkMiddleware,
  performStartGame,
  performRollDice,
  performMove,
  performEndTurn,
  performUndoMove,
  getValidMoves,
  getRequiredMoves,
  filterMovesByDie,
  type GameState,
  type Player,
  type MoveFrom,
  type MoveTo,
  type DieValue
} from './engine/index'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CONFIG_FILE = path.join(__dirname, 'config.json')
const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
const PORT = Number(process.env.BGB_PORT || config.port || 8642)
const STATE_FILE = path.join(__dirname, 'state.json')
const SECRETS_FILE = process.env.BGB_SECRETS || path.join(__dirname, 'secrets.json')

// ---------------------------------------------------------------------------
// Keys / players
// ---------------------------------------------------------------------------

interface Secrets {
  whiteKey: string
  blackKey: string
}
const secrets: Secrets = JSON.parse(fs.readFileSync(SECRETS_FILE, 'utf8'))

// White moves 24->1, black moves 1->24. Convention: human = white, agent = black.
const PLAYER_BY_KEY: Record<string, Player> = {
  [secrets.whiteKey]: 'white',
  [secrets.blackKey]: 'black'
}
const NAME_BY_PLAYER: Record<Player, string> = {
  white: config.players?.white || 'Player 1',
  black: config.players?.black || 'Player 2'
}

// ---------------------------------------------------------------------------
// Store with persistence
// ---------------------------------------------------------------------------

function loadPreloaded() {
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
    if (raw?.game) return raw
  } catch {
    /* fresh start */
  }
  return undefined
}

const store = configureStore({
  reducer: { game: gameReducer, match: matchReducer },
  preloadedState: loadPreloaded(),
  middleware: getDefault =>
    getDefault({
      serializableCheck: { ignoredActionPaths: ['meta.payloadCreator'] }
    }).concat(gameSyncThunkMiddleware)
})

function persist() {
  const { game, match } = store.getState()
  fs.writeFileSync(STATE_FILE, JSON.stringify({ game, match }))
}

// ---------------------------------------------------------------------------
// Snapshot for clients
// ---------------------------------------------------------------------------

function snapshot() {
  const game = store.getState().game as GameState
  let validMoves: unknown[] = []
  if (game.phase === 'moving') {
    const all = getValidMoves({ state: game })
    const req = getRequiredMoves({ state: game })
    validMoves = req.requiredDie
      ? filterMovesByDie({ availableMoves: all, dieValue: req.requiredDie })
      : all
  }
  return {
    points: game.board.points,
    bar: game.board.bar,
    borneOff: game.board.borneOff,
    currentPlayer: game.currentPlayer,
    currentPlayerName: game.currentPlayer ? NAME_BY_PLAYER[game.currentPlayer] : null,
    phase: game.phase,
    diceRoll: game.diceRoll,
    remainingMoves: game.remainingMoves,
    movesThisTurn: game.movesThisTurn,
    turnNumber: game.turnNumber,
    result: game.result,
    validMoves,
    players: NAME_BY_PLAYER
  }
}

// ---------------------------------------------------------------------------
// SSE
// ---------------------------------------------------------------------------

const sseClients = new Set<express.Response>()

function broadcast() {
  const data = `data: ${JSON.stringify(snapshot())}\n\n`
  for (const res of sseClients) res.write(data)
}

function afterMutation() {
  persist()
  broadcast()
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

const app = express()
app.use(express.json())

// Tolerate a reverse-proxy mount prefix (e.g. tailscale serve path) whether
// or not the proxy strips it.
const MOUNT = config.mountPath || '/bgb'
app.use((req, _res, next) => {
  if (req.url.startsWith(MOUNT + '/') || req.url === MOUNT) {
    req.url = req.url.slice(MOUNT.length) || '/'
  }
  next()
})

// Key auth: ?k= query (sets cookie) or bgbk cookie or x-bgb-key header.
app.use((req, res, next) => {
  const cookieKey = /(?:^|;\s*)bgbk=([a-f0-9]+)/.exec(req.headers.cookie || '')?.[1]
  const key =
    (req.query.k as string) || (req.headers['x-bgb-key'] as string) || cookieKey || ''
  const player = PLAYER_BY_KEY[key]
  if (!player) {
    res.status(403).send(`${config.title || 'Baby Got Backgammon'}: key required. Ask your opponent for your link.`)
    return
  }
  if (req.query.k && req.query.k !== cookieKey) {
    res.setHeader('Set-Cookie', `bgbk=${key}; Path=/; Max-Age=31536000; SameSite=Lax; Secure; HttpOnly`)
  }
  ;(req as any).player = player
  next()
})

app.use(express.static(path.join(__dirname, 'public')))

app.get('/api/config', (_req, res) => {
  const { title, subtitle, badgeImage, flavor, theme } = config
  res.json({ title, subtitle, badgeImage, flavor, theme, players: NAME_BY_PLAYER })
})

app.get('/api/state', (req, res) => {
  res.json({ you: (req as any).player, ...snapshot() })
})

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()
  res.write(`data: ${JSON.stringify(snapshot())}\n\n`)
  sseClients.add(res)
  req.on('close', () => sseClients.delete(res))
})

function requireTurn(req: express.Request, res: express.Response): boolean {
  const game = store.getState().game as GameState
  if (game.currentPlayer && game.currentPlayer !== (req as any).player) {
    res.status(409).json({ error: `Not your turn — it's ${NAME_BY_PLAYER[game.currentPlayer]}'s.` })
    return false
  }
  return true
}

app.post('/api/new', (_req, res) => {
  const action = store.dispatch(performStartGame())
  const result = (action as any).meta.result
  if (result?.ok !== true) {
    res.status(500).json({ error: 'Failed to start game' })
    return
  }
  afterMutation()
  res.json({ ok: true, ...snapshot() })
})

app.post('/api/roll', (req, res) => {
  if (!requireTurn(req, res)) return
  const action = store.dispatch(performRollDice())
  const result = (action as any).meta.result
  if (result?.ok !== true) {
    res.status(400).json({ error: result?.error?.message || 'Roll failed' })
    return
  }
  afterMutation()
  res.json({ ok: true, turnForfeited: result.value.turnForfeited, ...snapshot() })
})

app.post('/api/move', (req, res) => {
  if (!requireTurn(req, res)) return
  const { from, to } = req.body as { from: MoveFrom; to: MoveTo }
  let dieUsed = req.body.dieUsed as DieValue | undefined
  if (dieUsed === undefined) {
    // pick a matching legal move so clients don't have to know die bookkeeping
    const entry = (snapshot().validMoves as any[]).find(m => m.from === from)
    const dest = entry?.destinations?.find((d: any) => d.to === to)
    dieUsed = dest?.dieValue
  }
  if (dieUsed === undefined) {
    res.status(400).json({ error: `No legal move from ${from} to ${to}` })
    return
  }
  const action = store.dispatch(performMove({ from, to, dieUsed }))
  const result = (action as any).meta.result
  if (result?.ok !== true) {
    res.status(400).json({ error: result?.error?.message || 'Illegal move' })
    return
  }
  afterMutation()
  res.json({ ok: true, ...snapshot() })
})

app.post('/api/endturn', (req, res) => {
  if (!requireTurn(req, res)) return
  const action = store.dispatch(performEndTurn())
  const result = (action as any).meta.result
  if (result?.ok !== true) {
    res.status(400).json({ error: result?.error?.message || 'Cannot end turn' })
    return
  }
  afterMutation()
  res.json({ ok: true, ...snapshot() })
})

app.post('/api/undo', (req, res) => {
  if (!requireTurn(req, res)) return
  const action = store.dispatch(performUndoMove())
  const result = (action as any).meta.result
  if (result?.ok !== true) {
    res.status(400).json({ error: result?.error?.message || 'Nothing to undo' })
    return
  }
  afterMutation()
  res.json({ ok: true, ...snapshot() })
})

app.listen(PORT, '127.0.0.1', () => {
  console.log(`${config.title || 'Baby Got Backgammon'} listening on 127.0.0.1:${PORT}`)
})
