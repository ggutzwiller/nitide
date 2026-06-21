// Content-script entry point for coursesu.com. All the DOM specifics live in
// `./retailer.ts`; the scan/render/observe loop is the shared engine runtime.
import { bootWhenReady } from '../engine/runtime.ts';
import { coursesuRetailer } from './retailer.ts';

bootWhenReady(coursesuRetailer);
