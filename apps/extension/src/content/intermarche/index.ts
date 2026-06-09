// Content-script entry point for intermarche.com. All the DOM specifics live in
// `./retailer.ts`; the scan/render/observe loop is the shared engine runtime.
import { bootWhenReady } from '../engine/runtime.ts';
import { intermarcheRetailer } from './retailer.ts';

bootWhenReady(intermarcheRetailer);
