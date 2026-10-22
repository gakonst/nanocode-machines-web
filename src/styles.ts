import { style, variants } from "nanocode-ts/react/theme";

export const spend = style({ borderTop: "1px solid", borderTopColor: "rule", display: "flex", flexDirection: "column", overflowX: "auto", paddingBlock: "xs", paddingInline: "md", whiteSpace: "pre", selectors: { "& p": { margin: "0" } } });

export const title = style({ fontVariationSettings: '"wght" 700' });

export const accent = style({ color: "accent" });

export const dot = variants({ base: { opacity: "faint" }, variants: { live: { false: {}, true: { color: "accent", opacity: "1 !custom" } } }, defaultVariants: { live: false } });

export const empty = style({ fontStyle: "italic", opacity: "dim" });

export const spark = style({ color: "agent" });

export const calls = style({ opacity: "dim" });

export const device = style({ borderTop: "1px solid", borderTopColor: "rule", margin: "0", paddingBlock: "sm", paddingInline: "md", selectors: { "& b": { color: "accent", fontVariationSettings: '"wght" 700', fontWeight: "normal" } } });
