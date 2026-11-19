/*
 * Shred Slope: background worker that bakes the mountain's 50 m chunks off the main thread,
 * so riding never stutters while new parts of the course are built. See SS.makeChunkWorker.
 */
self.window = self;
importScripts('engine.js', 'world.js');
