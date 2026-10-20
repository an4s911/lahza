// Note-body helpers and the "should we ask the model again?" rule.

const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/;

export function stripFrontmatter(content: string): string {
	return content.replace(FRONTMATTER, "");
}

export type DescribeDecision = "skip" | "baseline" | "describe";

export interface DescribeInput {
	bodyLength: number;
	hasDescription: boolean;
	untitled: boolean;
	/** Body length recorded the last time this note was described on this device. */
	lastLength?: number;
	minLength: number;
	/** Relative change in length that counts as "changed a lot". */
	changeRatio: number;
}

export function describeDecision(input: DescribeInput): DescribeDecision {
	if (input.bodyLength < input.minLength) return "skip";
	if (!input.hasDescription || input.untitled) return "describe";
	// Described elsewhere (e.g. on another device): remember the size, don't pay again.
	if (input.lastLength === undefined) return "baseline";
	const change = Math.abs(input.bodyLength - input.lastLength) / Math.max(input.lastLength, 1);
	return change >= input.changeRatio ? "describe" : "skip";
}
