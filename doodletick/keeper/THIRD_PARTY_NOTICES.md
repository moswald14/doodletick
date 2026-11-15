# Credits and third-party components

## Included Dot Wave code

The mushroom renderer uses these Dot Wave Studio modules, adapted to ES module filenames: `dot-effects-dsp.mjs`, `dot-amp-tone.mjs`, `dot-studio-dsp.mjs`, `dot-collision-audio.mjs`, `dot-wave-export.mjs`, `dot-mushroom-dsp.mjs`, and `dot-mushroom-motion.mjs`.

The project owner authorized the copies included here for distribution under GPL-3.0-only. Attribution is retained in the source and mushroom guide. Other Dot Wave Studio code, downloads and branding outside this repository are not covered by this grant.

## Runtime components

The desktop distribution contains project source, not a bundled Node.js or Tailscale installer. The Home Assistant Dockerfile refers to pinned official Node.js and Tailscale images and installs Debian networking utilities. Those components retain their own licenses and notices:

- [Node.js license and bundled notices](https://github.com/nodejs/node/blob/main/LICENSE)
- [Tailscale license](https://github.com/tailscale/tailscale/blob/main/LICENSE)
- Debian package copyright files in `/usr/share/doc` inside a built image

GitHub Actions used for validation run outside the distributed app and retain their upstream licenses. No third-party service endorsement is implied.

## User-created content

Project-code licensing does not change ownership or licenses of users' writing, recipes, sounds or shared files. Creative Commons metadata is handled separately by the app. Buying a mushroom generator transfers its in-app earning rights, not copyright in its recipe or sound.
