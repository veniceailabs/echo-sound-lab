// Resolves PortAudio include/library paths per platform for binding.gyp.
//
// Kept out of binding.gyp itself because gyp's <!() substitution can't express
// fallbacks, and a wrong path there fails with an unreadable error.
//
// Override either with environment variables:
//   PORTAUDIO_DIR  - prefix containing include/ and lib/
//   VCPKG_ROOT     - Windows, uses <root>/installed/x64-windows-static
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function firstExisting(candidates) {
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return null;
}

function brewPrefix() {
  try {
    return execSync('brew --prefix portaudio', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

function resolve() {
  const explicit = process.env.PORTAUDIO_DIR;

  if (process.platform === 'darwin') {
    const prefix = explicit || brewPrefix() || '/opt/homebrew/opt/portaudio' || '/usr/local/opt/portaudio';
    // Static archive: linking the dylib bakes an absolute Homebrew path into
    // the binary, which crashes on any machine without Homebrew.
    const lib = firstExisting([
      path.join(prefix, 'lib', 'libportaudio.a'),
      '/opt/homebrew/opt/portaudio/lib/libportaudio.a',
      '/usr/local/opt/portaudio/lib/libportaudio.a',
    ]);
    const inc = firstExisting([
      path.join(prefix, 'include'),
      '/opt/homebrew/opt/portaudio/include',
      '/usr/local/opt/portaudio/include',
    ]);
    if (!lib || !inc) {
      throw new Error('PortAudio not found. Install with `brew install portaudio`, or set PORTAUDIO_DIR.');
    }
    return { include: inc, library: lib };
  }

  if (process.platform === 'win32') {
    const vcpkg = process.env.VCPKG_ROOT
      ? path.join(process.env.VCPKG_ROOT, 'installed', 'x64-windows-static')
      : null;
    const prefix = firstExisting([explicit, vcpkg, 'C:\\vcpkg\\installed\\x64-windows-static']);
    if (!prefix) {
      throw new Error(
        'PortAudio not found. Install with `vcpkg install portaudio:x64-windows-static`, ' +
        'then set VCPKG_ROOT (or PORTAUDIO_DIR).');
    }
    const lib = firstExisting([
      path.join(prefix, 'lib', 'portaudio.lib'),
      path.join(prefix, 'lib', 'portaudio_static.lib'),
    ]);
    if (!lib) throw new Error(`PortAudio library not found under ${prefix}\\lib`);
    return { include: path.join(prefix, 'include'), library: lib };
  }

  // Linux: rely on the system package (-lportaudio), so only the header path
  // needs resolving.
  const inc = firstExisting([
    explicit && path.join(explicit, 'include'),
    '/usr/include',
    '/usr/local/include',
  ]) || '/usr/include';
  return { include: inc, library: '' };
}

module.exports = resolve();
