// SPDX-License-Identifier: GPL-3.0-only
import { DJRenderer } from './jazz-core.mjs';
class DoodleJazzProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const { bank, config } = options.processorOptions;
    this.renderer = new DJRenderer(sampleRate, bank, config, info => this.port.postMessage(info));
    this.port.onmessage = event => this.renderer.configure(event.data);
  }
  process(inputs, outputs) {
    const output = outputs[0];
    if (output && output.length >= 2) this.renderer.render(output[0], output[1]);
    return true;
  }
}
registerProcessor('doodle-jazz', DoodleJazzProcessor);
