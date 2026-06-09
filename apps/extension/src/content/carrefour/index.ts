// Content-script entry point for carrefour.fr. All the DOM specifics live in
// `./retailer.ts`; the scan/render/observe loop is the shared engine runtime.
import { bootWhenReady } from '../engine/runtime.ts';
import { carrefourRetailer } from './retailer.ts';

bootWhenReady(carrefourRetailer);
