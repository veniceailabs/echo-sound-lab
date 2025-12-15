# Echo Sound Lab - Self-Hosted WAM 2.0 Plugins

This directory contains Web Audio Module (WAM 2.0) plugins served from Echo Sound Lab's Vercel deployment.

## Plugins

### PingPong Delay
- **File:** `pingpong-delay/index.js`
- **Vendor:** Wimmics
- **Category:** Effect
- **Description:** Studio-quality stereo delay with ping-pong effect
- **Parameters:** Delay Time, Feedback, Wet/Dry Mix
- **Status:** Self-hosted stub (functional for testing)

### Microverb
- **File:** `microverb/index.js`
- **Vendor:** Burns Audio
- **Category:** Effect
- **Description:** High-quality compact reverb for spatial processing
- **Parameters:** Room Size, Damping, Wet/Dry Mix
- **Status:** Self-hosted stub (functional for testing)

### Graphic EQ
- **File:** `graphic-eq/index.js`
- **Vendor:** Wimmics
- **Category:** Effect
- **Description:** Visual parametric equalizer for precise frequency control
- **Parameters:** 9-band graphic EQ (63Hz - 16kHz)
- **Status:** Self-hosted stub (functional for testing)

## Architecture

All plugins are WAM 2.0 compliant and implement the `WebAudioModule` interface:
- `index.js` - Main ES module exporting the plugin class
- Each plugin creates Web Audio API nodes dynamically
- Parameters exposed via `getParameterInfo()` and `setParameterValues()`
- Optional GUI rendering via `createGui()`

## Self-Hosting

These plugins are served by Vercel with:
- Root-relative URLs: `/wam/plugin-name/index.js`
- Proper CORS headers configured in `vercel.json`
- COEP/COOP headers enabled for SharedArrayBuffer support
- MIME type: `application/javascript`

## Updating Plugins

To replace these stubs with actual production plugins:

1. Download pre-built WAM plugin bundles from official sources:
   - [Wimmics Plugins](https://github.com/53js/wam-plugins)
   - [Burns Audio WAM](https://github.com/burns-audio-wam)

2. Extract the bundled `index.js` into respective directories:
   ```
   cp plugin-bundle.js /public/wam/plugin-name/index.js
   ```

3. Ensure the plugin:
   - Exports a `WebAudioModule` default class
   - Uses only ES module syntax (no CommonJS)
   - Works in browser environment (no Node.js specific APIs)

4. Test locally:
   ```bash
   npm run dev
   # Browser console: await import('/wam/plugin-name/index.js')
   ```

5. Deploy to Vercel:
   ```bash
   git add public/wam/
   git commit -m "Update WAM plugins"
   git push
   ```

## WAM 2.0 API Reference

Plugins must implement:
- `static createInstance(hostGroupId, audioContext)` - Factory method
- `get audioNode()` - Returns WAM audio node with input/output
- `createGui()` - Optional GUI factory (returns HTMLElement)

The audio node must provide:
- `connect(destination)` - Connect to audio graph
- `disconnect()` - Disconnect from audio graph
- `getParameterInfo([paramId])` - Get parameter metadata
- `setParameterValues(params)` - Update parameter values
- `getParameterValues()` - Get current parameter values
- `getState()` / `setState(state)` - Preset serialization

## Testing

### Local Development
```bash
npm run dev
```
Plugins accessible at: `http://localhost:3000/wam/plugin-name/index.js`

### Production Build
```bash
npm run build
npm run preview
```
Plugins accessible at: `http://localhost:4173/wam/plugin-name/index.js`

### Vercel Deployment
Plugins accessible at: `https://your-domain.vercel.app/wam/plugin-name/index.js`

## Fallback Behavior

If a WAM plugin fails to load:
1. Service marks it as "unavailable"
2. UI shows failed status in plugin browser
3. Audio engine continues with built-in DSP
4. No audio processing is interrupted

Existing built-in effects remain unaffected:
- Airwindows saturation algorithms
- Multiband compression
- Transient shaping
- De-essing
- Dynamic EQ
- Stereo imaging
- Motion reverb

## License

Each plugin retains its original license:
- Wimmics plugins: Check respective repository
- Burns Audio WAM: Check repository for license terms
- Echo Sound Lab integration: Part of main application

## Support

For issues with WAM plugin loading or functionality:
1. Check browser console for error messages
2. Verify plugin URL is accessible: `fetch('/wam/plugin-name/index.js')`
3. Confirm plugin exports `WebAudioModule` class
4. Check WAM SDK version compatibility

## References

- [WAM 2.0 Specification](https://github.com/WebAudioModules/specification)
- [WAM SDK Documentation](https://www.npmjs.com/package/@webaudiomodules/sdk)
- [WebAudioModules Community](https://www.webaudiomodules.com)
