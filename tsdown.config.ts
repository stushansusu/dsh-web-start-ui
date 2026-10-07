/**
 * Standalone tsdown config for the startup-animation plugin.
 *
 * Uses the repo's shared client-bundle preset (shared/tsdown.client.ts -
 * closure-factory artifact for window.__ModuleLoader__, CSS Modules inlined,
 * externals resolved through the loader module table). The node half builds
 * from src (tsdown compiles TS directly).
 */
import { clientBundle } from '../../shared/tsdown.client.ts'

export default clientBundle('@linxin666/dsh-web-start-ui', ['src/index.ts'])
