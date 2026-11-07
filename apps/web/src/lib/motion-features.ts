/*
 * Motion's animation engine, loaded after the first paint (see LazyMotion in
 * main.tsx): the `m.*` components render straight away and start animating
 * as soon as this chunk arrives. Layout animations live in motion-layout.ts.
 */
export { domAnimation as default } from "motion/react";
