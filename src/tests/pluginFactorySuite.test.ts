import { describe, expect, test } from 'vitest';
import { pluginRegistry } from '../services/plugins/pluginRegistry';

const REQUIRED_FACTORY_PLUGIN_IDS = [
  'echo.vocal.comp.fet',
  'echo.vocal.comp.opto',
  'echo.vocal.comp.vca',
  'echo.vocal.deesser',
  'echo.vocal.gate',
  'echo.vocal.rider',
  'echo.vocal.expander',
  'echo.vocal.harshness',
  'echo.vocal.eq.air',
  'echo.vocal.eq.presence',
  'echo.vocal.eq.mud',
  'echo.vocal.eq.telephone',
  'echo.vocal.eq.proximity',
  'echo.vocal.eq.tube',
  'echo.vocal.eq.clean',
  'echo.vocal.eq.tilt',
  'echo.space.reverb.plate',
  'echo.space.reverb.hall',
  'echo.space.reverb.room',
  'echo.space.reverb.spring',
  'echo.space.reverb.shimmer',
  'echo.space.reverb.chamber',
  'echo.mod.delay.slap',
  'echo.mod.delay.pingpong',
  'echo.mod.delay.tape',
  'echo.mod.doubler',
  'echo.mod.chorus',
  'echo.color.tube',
  'echo.color.tape',
  'echo.color.bitcrush',
  'echo.bus.glue',
  'echo.bus.smasher',
  'echo.bus.transient',
  'echo.bus.width',
  'echo.bus.tapemaster',
  'echo.master.limiter.brick',
  'echo.master.clipper',
  'echo.master.lufs',
  'echo.master.linear',
  'echo.master.multiband',
  'echo.fx.vinyl',
  'echo.fx.amp',
  'echo.fx.fuzz',
  'echo.fx.phaser',
  'echo.fx.flanger',
  'echo.fx.tremolo',
  'echo.fx.autowah',
  'echo.fx.sub',
  'echo.fx.rotary',
  'echo.fx.ringmod',
] as const;

describe('Plugin Factory Suite', () => {
  test('registers all required 50 plugin manifests for Epic 4.4', () => {
    for (const manifestId of REQUIRED_FACTORY_PLUGIN_IDS) {
      expect(pluginRegistry.getManifest(manifestId), `missing manifest ${manifestId}`).not.toBeNull();
    }
    expect(REQUIRED_FACTORY_PLUGIN_IDS.length).toBe(50);
  });
});
