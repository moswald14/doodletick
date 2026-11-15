// Disposable SDP for validation/state-machine tests, not a live candidate.
export function rtcDescription(label = 'doodleverse-v1', type = 'offer') {
  const sdp = ['v=0', 'o=- 1 1 IN IP4 127.0.0.1', 's=-', 't=0 0', 'a=group:BUNDLE 0',
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel', 'c=IN IP4 0.0.0.0', 'a=mid:0',
    'a=ice-ufrag:abcd', 'a=ice-pwd:' + 'a'.repeat(24),
    'a=fingerprint:sha-256 ' + Array(32).fill('AA').join(':'),
    'a=setup:' + (type === 'offer' ? 'actpass' : 'active'), 'a=sctp-port:5000',
    'a=candidate:1 1 udp 2122260223 192.0.2.1 50000 typ host', 'a=end-of-candidates', ''].join('\r\n');
  return { format: 'doodletick-webrtc-v1', type, label, iceComplete: true, sdp };
}
export class FakePeerConnection extends EventTarget {
  constructor(configuration) { super(); this.configuration = configuration; this.connectionState = 'new'; this.iceGatheringState = 'new'; }
  createDataChannel(label, options) { this.channel = { label, ...options, readyState: 'connecting', close() { this.readyState = 'closed'; } }; return this.channel; }
  createOffer() { return { type: 'offer', sdp: rtcDescription().sdp }; }
  createAnswer() { return { type: 'answer', sdp: rtcDescription('doodleverse-v1', 'answer').sdp }; }
  async setLocalDescription(description) {
    this.localDescription = description; this.iceGatheringState = 'gathering';
    if (!this.stalled) queueMicrotask(() => { if (this.connectionState !== 'closed') { this.iceGatheringState = 'complete'; this.dispatchEvent(new Event('icegatheringstatechange')); } });
  }
  async setRemoteDescription(description) { this.remoteDescription = description; }
  close() { this.connectionState = 'closed'; this.dispatchEvent(new Event('connectionstatechange')); }
}
