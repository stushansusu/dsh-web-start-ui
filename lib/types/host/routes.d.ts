import type { IncomingMessage } from 'node:http';
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver';
import { type LaunchSkinCatalog } from '../skins-contract.ts';
/**
 * Whether the request arrived over loopback.
 *
 * IPv4 loopback, IPv6 loopback, and the IPv4-mapped form Node reports on a
 * dual-stack socket. Anything else (a LAN address, a tunnel) fails.
 */
export declare function isLoopbackRequest(req: IncomingMessage): boolean;
/** The whole catalog plus the selected id. */
export declare function catalog(): LaunchSkinCatalog;
/** The single prefix route: everything under /api/boot-animation. */
export declare function bootAnimationRoute(): WebRoute;
/** Directory custom skins are written to (exported for diagnostics/tests). */
export declare function customSkinsRoot(): string;
