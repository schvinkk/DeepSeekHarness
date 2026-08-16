/**
 * @deepseek-ai/dsh-plugin-suite — DeepSeek Harness Plugin Suite v2.95.27.
 */

import type { Service } from "@deepseek-ai/cordis";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";

/** Plugin configuration. */
export interface Config {
	/** File upload storage root; %TEMP% and %HOME% are expanded. */
	uploadDir: string;
	/** Maximum image bytes accepted by vision tools. */
	maxImageBytes: number;
	/** Context usage threshold (0..1) treated as "near full". */
	contextThreshold: number;
}

/** Register all plugin tools on the context. */
export declare function apply(ctx: any, config: Config): void;

/** Services required by the plugin suite. */
export declare const inject: string[];

/** Cordis plugin name. */
export declare const name: string;
