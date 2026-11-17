// SPDX-License-Identifier: GPL-3.0-only
// Original trio arrangements informed by genre features, not recorded songs.
// Clave: Berklee PULSE, Create Your Own Afro-Latin Groove.
// Cool/modal: Herbie Hancock Institute, Jazz in America lesson 6.
// Jazz funk: Trinity Rock & Pop, Improvising in a Fusion Style.
const genres = {
  swing: { name: 'Velvet swing', label: 'Swing', description: 'Walking bass, a swinging ride and a 32-bar song form.', tempo: 112, swing: 0.64, tonic: 10, bars: 32, mode: 'major', straight: false },
  blues: { name: 'Blue hour', label: 'Blues', description: 'A relaxed twelve-bar blues with dominant-color turnarounds.', tempo: 82, swing: 0.61, tonic: 5, bars: 12, mode: 'major', straight: false },
  bossa: { name: 'Bossa garden', label: 'Bossa', description: 'Minor-key Brazilian-inspired two-feel and interlocking straight rhythms.', tempo: 128, swing: 0.5, tonic: 2, bars: 16, mode: 'minor', straight: true },
  bebop: { name: 'Bebop', label: 'Bebop', description: 'Quick ii–V turns, secondary dominants and chromatic neighbors.', tempo: 168, swing: 0.58, tonic: 0, bars: 32, mode: 'major', straight: false },
  cool: { name: 'Cool jazz', label: 'Cool', description: 'Soft brushes, spacious comping and a restrained melodic conversation.', tempo: 96, swing: 0.58, tonic: 3, bars: 16, mode: 'major', straight: false },
  modal: { name: 'Modal jazz', label: 'Modal', description: 'Long Dorian vamps, open space and a grounded two-feel bass.', tempo: 108, swing: 0.56, tonic: 2, bars: 16, mode: 'minor', straight: false },
  latin: { name: 'Afro-Cuban jazz', label: 'Latin', description: 'A two-bar 2–3 son clave, anticipated bass and montuno-style comping.', tempo: 144, swing: 0.5, tonic: 0, bars: 16, mode: 'minor', straight: true },
  funk: { name: 'Jazz funk', label: 'Jazz funk', description: 'Short minor/dominant vamps, sixteenth syncopation and a firm backbeat.', tempo: 104, swing: 0.5, tonic: 4, bars: 16, mode: 'minor', straight: true }
};
export const DJ_GENRES = Object.freeze(Object.fromEntries(Object.entries(genres).map(([id, genre]) => [id, Object.freeze({ ...genre })])));
export const DJ_GENRE_IDS = Object.freeze(Object.keys(DJ_GENRES));

const one = (root, quality) => [{ root, quality, start: 0, beats: 4 }];
const two = (a, aq, b, bq) => [{ root: a, quality: aq, start: 0, beats: 2 }, { root: b, quality: bq, start: 2, beats: 2 }];

/** Return a fresh relative chart for one of the additional arrangements. */
export function djGenreChart(style) {
  if (style === 'bebop') {
    const a = [two(0, '6/9', 9, '7'), two(2, 'm9', 7, '13'), two(4, 'm9', 9, '7♭9'), two(2, 'm9', 7, '13'),
      two(0, 'maj9', 5, '9'), two(4, 'm9', 9, '7'), two(2, 'm9', 7, '7♭9'), one(0, '6/9')];
    const bridge = [one(4, '7'), one(9, '13'), one(2, '7'), one(7, '13'),
      two(4, 'm9', 9, '7'), two(2, 'm9', 7, '13'), two(0, '6/9', 9, '7'), two(2, 'm9', 7, '7♭9')];
    return [...a, ...a, ...bridge, ...a].map(bar => bar.map(chord => ({ ...chord })));
  }
  if (style === 'cool') return [
    one(0, 'maj9'), one(0, '6/9'), one(2, 'm9'), one(7, '13'), one(4, 'm9'), one(9, '7'), one(2, 'm9'), one(7, '13'),
    one(8, 'maj9'), one(8, 'maj9'), one(5, 'm9'), one(10, '13'), one(3, 'maj9'), one(6, '13'), two(2, 'm9', 7, '13'), one(0, '6/9')
  ];
  if (style === 'modal') return Array.from({ length: 16 }, (_, i) => one(i >= 8 && i < 12 ? 1 : 0, 'm9'));
  if (style === 'latin') return [
    one(0, 'm9'), one(0, 'm6'), one(5, 'm9'), one(7, '7♭9'), one(0, 'm9'), one(10, '13'), one(3, 'maj9'), one(8, 'maj9'),
    one(5, 'm9'), one(10, '13'), one(3, 'maj9'), one(8, '7'), one(2, 'ø7'), one(7, '7♭9'), two(0, 'm6', 7, '7♭9'), one(0, 'm9')
  ];
  if (style === 'funk') return [
    ...Array.from({ length: 4 }, () => one(0, 'm9')), one(5, '13'), one(5, '13'), one(0, 'm9'), one(0, 'm9'),
    one(10, '13'), one(10, '13'), one(5, '13'), one(5, '13'), one(0, 'm9'), one(0, 'm9'), one(7, '7♭9'), one(0, 'm9')
  ];
  return null;
}
