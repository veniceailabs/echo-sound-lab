import { ProcessingAction, ProcessingConfig } from '../types';

const getParamValue = (params: any[], name: string, defaultValue: any): any => {
  if (!Array.isArray(params)) {
    console.warn('[ProcessingActionUtils] Invalid params input, expected array:', typeof params);
    return defaultValue;
  }
  const param = params.find(p => p?.name === name);
  return param?.value ?? defaultValue;
};

export const actionsToConfig = (actions: ProcessingAction[]): ProcessingConfig => {
  const config: ProcessingConfig = {};
  const enabledActions = Array.isArray(actions) ? actions.filter(action => action?.isEnabled) : [];

  if (!Array.isArray(actions)) {
    console.warn('[ProcessingActionUtils] Invalid actions input, expected array:', typeof actions);
    return config;
  }

  actions.forEach(action => {
    if (!action.isEnabled) return;

    if (action.refinementType === 'bands' && Array.isArray(action.bands) && action.bands.length > 0) {
      if (!config.eq) config.eq = [];
      config.eq.push(
        ...action.bands.map(b => ({
          frequency: b.freqHz,
          gain: b.gainDb,
          type: (b.type as any) || 'peaking',
          q: b.q || 0.7,
        }))
      );
    }

    if (action.refinementType === 'parameters' && Array.isArray(action.params) && action.params.length > 0) {
      if (action.type === 'Compression') {
        config.compression = {
          threshold: getParamValue(action.params, 'threshold', -12),
          ratio: getParamValue(action.params, 'ratio', 2.0),
          attack: getParamValue(action.params, 'attack', 0.02),
          release: getParamValue(action.params, 'release', 0.15),
          makeupGain: 0,
        };
      }

      if (action.type === 'Limiter') {
        config.limiter = {
          threshold: getParamValue(action.params, 'threshold', -1),
          release: getParamValue(action.params, 'release', 0.1),
        };
      }

      if (action.type === 'Dynamics') {
        config.compression = {
          threshold: getParamValue(action.params, 'threshold', -18),
          ratio: getParamValue(action.params, 'ratio', 1.5),
          attack: getParamValue(action.params, 'attack', 0.02),
          release: getParamValue(action.params, 'release', 0.2),
          makeupGain: 0,
        };
      }

      const inputGain = getParamValue(action.params, 'inputGain', undefined);
      if (inputGain !== undefined) {
        config.inputTrimDb = inputGain as number;
      }
    }

    if (action.refinementType === 'parameters' && Array.isArray(action.params) && action.params.length > 0) {
      if (action.type === 'Saturation' || action.type === 'Exciter') {
        config.saturation = {
          type: getParamValue(action.params, 'type', 'tape'),
          amount: getParamValue(action.params, 'amount', 0.08),
          mix: getParamValue(action.params, 'mix', 0.35),
          analogFloor: getParamValue(action.params, 'analogFloor', 0),
        };
      }

      if (action.type === 'Stereo' || action.type === 'Imaging') {
        const widthFromParam = getParamValue(action.params, 'width', undefined);
        const lowWidth = getParamValue(action.params, 'lowWidth', undefined);
        const midWidth = getParamValue(action.params, 'midWidth', undefined);
        const highWidth = getParamValue(action.params, 'highWidth', undefined);
        const widthCandidates = [widthFromParam, lowWidth, midWidth, highWidth].filter(val => typeof val === 'number');
        const width = widthCandidates.length > 0
          ? (widthCandidates.reduce((sum, val) => sum + val, 0) / widthCandidates.length)
          : 1.06;
        config.stereoImager = {
          lowWidth: width,
          midWidth: width,
          highWidth: width,
          crossovers: [
            getParamValue(action.params, 'lowCrossover', 250),
            getParamValue(action.params, 'highCrossover', 5000),
          ],
          vocalShield: {
            enabled: true,
            lowHz: getParamValue(action.params, 'vocalShieldLowHz', 1000),
            highHz: getParamValue(action.params, 'vocalShieldHighHz', 4000),
            reduction: getParamValue(action.params, 'vocalShieldReduction', 0.2),
          },
        };
      }
    }
  });

  const hasToneOrDynamics = enabledActions.some(action =>
    ['EQ', 'Dynamic EQ', 'Compression', 'Dynamics', 'Limiter'].includes(action.type)
  );
  const hasSaturation = !!config.saturation;
  const hasImager = !!config.stereoImager;

  // Auto-expand chain when suggestions exist: add subtle saturation + width
  if (enabledActions.length > 0 && hasToneOrDynamics) {
    if (!hasSaturation) {
      config.saturation = { type: 'tape', amount: 0.08, mix: 0.35 };
    }
    if (!hasImager) {
      const width = 1.05;
      config.stereoImager = {
        lowWidth: width,
        midWidth: width,
        highWidth: width,
        crossovers: [250, 5000],
        vocalShield: {
          enabled: true,
          lowHz: 1000,
          highHz: 4000,
          reduction: 0.2,
        },
      };
    }
  }

  return config;
};
