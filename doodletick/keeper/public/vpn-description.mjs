// These are transient connection descriptions, not saved identity or ledger
// formats. Signed SDP binds the native WebRTC DTLS certificate to the pairing.
export const RTC_FORMAT = 'doodletick-webrtc-v1';
export const RTC_LABELS = ['doodleverse-v1', 'doodletick-files-v1'];
export function validRtcDescription(description, type, label) {
  if (!description || description.format !== RTC_FORMAT || !['offer', 'answer'].includes(description.type) ||
      type && description.type !== type || !RTC_LABELS.includes(description.label) || label && description.label !== label ||
      description.iceComplete !== true || typeof description.sdp !== 'string' || description.sdp.length > 48000) return false;
  const lines = description.sdp.split(/\r?\n/);
  // Only one data channel media section: no implicit microphone/camera track.
  const media = lines.filter(line => line.startsWith('m='));
  if (media.length !== 1 || !/^m=application \d+ (?:UDP\/DTLS\/SCTP|DTLS\/SCTP) (?:webrtc-datachannel|\d+)$/.test(media[0])) return false;
  const fingerprints = lines.filter(line => line.startsWith('a=fingerprint:'));
  if (!fingerprints.length || fingerprints.some(line => !/^a=fingerprint:sha-256 (?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/i.test(line)) ||
      new Set(fingerprints.map(line => line.toLowerCase())).size !== 1) return false;
  return lines.some(line => /^a=ice-ufrag:[A-Za-z0-9+/]{4,256}$/.test(line)) &&
    lines.some(line => /^a=ice-pwd:[A-Za-z0-9+/]{22,256}$/.test(line)) &&
    lines.some(line => /^a=candidate:[^\r\n]{1,1500}$/.test(line)) &&
    lines.some(line => /^a=setup:(actpass|active|passive)$/.test(line));
}
