/**
 * Where the host keeps custom launch skins.
 *
 * The Harness home is resolved the way the rest of the host does it: $DSH_HOME
 * when set, otherwise <user home>/.dsh. Custom skins live beside the user's
 * other Harness state (`<home>/launch-animations/<id>/`) rather than in browser
 * storage, so the choice survives clearing site data and the host can read it
 * before the shell exists (that is what lets a video start early).
 */
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Root directory of custom launch skins for one environment. */
export function launchAnimationsDir(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.DSH_HOME !== undefined && env.DSH_HOME.trim() !== '' ? env.DSH_HOME.trim() : undefined
  return join(configured ?? join(homedir(), '.dsh'), 'launch-animations')
}

/** File holding the selected skin id (`{ "active": string | null }`). */
export const ACTIVE_STATE_FILE = 'state.json'
