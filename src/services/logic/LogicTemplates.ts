/**
 * LOGIC PRO X SCRIPT TEMPLATES
 * Maps abstract actions (GAIN_ADJUSTMENT, LIMITING, etc.) to concrete AppleScript.
 *
 * Each template is a function that takes parameters and returns valid AppleScript code.
 */

const escapeAppleScriptString = (value: string) =>
  value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, ' ');

export const LogicTemplates = {
  /**
   * Sets the volume fader of a specific track.
   * Assumes standard Logic Pro track naming and fader assignment.
   */
  setTrackVolume: (trackName: string, dbValue: number) => `
    tell application "Logic Pro X"
      set t to track "${escapeAppleScriptString(trackName)}"
      set automation mode of t to Read
      set volume of t to ${dbValue}
    end tell
  `,

  /**
   * Toggles mute on a track.
   */
  setTrackMute: (trackName: string, muted: boolean) => `
    tell application "Logic Pro X"
      set t to track "${escapeAppleScriptString(trackName)}"
      set mute of t to ${muted}
    end tell
  `,

  /**
   * Applies limiting (gain reduction) to a track.
   */
  applyLimiting: (trackName: string, threshold: number) => `
    tell application "Logic Pro X"
      set t to track "${escapeAppleScriptString(trackName)}"
      -- Placeholder: In real implementation, this would insert a compressor
      -- and set threshold. For now, log the action.
      log "Apply limiting to ${escapeAppleScriptString(trackName)} at threshold ${threshold}dB"
    end tell
  `,

  /**
   * Normalizes track gain (NORMALIZATION action).
   */
  normalizeTrack: (trackName: string, targetLevel: number) => `
    tell application "Logic Pro X"
      set t to track "${escapeAppleScriptString(trackName)}"
      -- Placeholder: Real normalization would analyze peak and adjust
      set volume of t to ${targetLevel}
    end tell
  `,

  /**
   * Removes DC offset from track (DC_REMOVAL action).
   */
  removeDCOffset: (trackName: string) => `
    tell application "Logic Pro X"
      set t to track "${escapeAppleScriptString(trackName)}"
      -- Placeholder: Real DC removal would apply a high-pass filter
      log "Remove DC offset from ${escapeAppleScriptString(trackName)}"
    end tell
  `,

  /**
   * Renames a track (Non-destructive test action).
   */
  renameTrack: (currentName: string, newName: string) => `
    tell application "Logic Pro X"
      set name of track "${escapeAppleScriptString(currentName)}" to "${escapeAppleScriptString(newName)}"
    end tell
  `,

  /**
   * Logs deterministic timeline actions (non-destructive routing shim).
   */
  logTimelineAction: (actionType: string, payload: Record<string, unknown>) => `
    tell application "Logic Pro X"
      log "Timeline action ${escapeAppleScriptString(actionType)}: ${escapeAppleScriptString(JSON.stringify(payload))}"
    end tell
  `
};

/**
 * Maps ExecutionPayload.actionType to Template functions.
 * Each key corresponds to an APL proposal action type.
 */
export const ProposalMapper: Record<string, (params: Record<string, any>) => string> = {
  'GAIN_ADJUSTMENT': (params: any) => LogicTemplates.setTrackVolume(params.track || 'Main', params.value || 0),
  'LIMITING': (params: any) => LogicTemplates.applyLimiting(params.track || 'Main', params.threshold || -1),
  'NORMALIZATION': (params: any) => LogicTemplates.normalizeTrack(params.track || 'Main', params.targetLevel || -14),
  'DC_REMOVAL': (params: any) => LogicTemplates.removeDCOffset(params.track || 'Main'),
  'MUTE_TOGGLE': (params: any) => LogicTemplates.setTrackMute(params.track || 'Main', params.muted || false),
  'RENAME': (params: any) => LogicTemplates.renameTrack(params.track || 'Main', params.newName || 'Renamed'),
  'ADD_TRACK': (params: any) => LogicTemplates.logTimelineAction('ADD_TRACK', params),
  'ADD_REGION': (params: any) => LogicTemplates.logTimelineAction('ADD_REGION', params),
  'MOVE_REGION': (params: any) => LogicTemplates.logTimelineAction('MOVE_REGION', params),
  'SPLIT_REGION': (params: any) => LogicTemplates.logTimelineAction('SPLIT_REGION', params),
  'SET_TRACK_GROUP': (params: any) => LogicTemplates.logTimelineAction('SET_TRACK_GROUP', params),
  'SET_REGION_GAIN': (params: any) => LogicTemplates.logTimelineAction('SET_REGION_GAIN', params),
  'ADD_MARKER': (params: any) => LogicTemplates.logTimelineAction('ADD_MARKER', params),
  'UPDATE_MARKER': (params: any) => LogicTemplates.logTimelineAction('UPDATE_MARKER', params),
  'REMOVE_MARKER': (params: any) => LogicTemplates.logTimelineAction('REMOVE_MARKER', params),
  'CREATE_COMP_LANE': (params: any) => LogicTemplates.logTimelineAction('CREATE_COMP_LANE', params),
  'SET_COMP_LANE_ACTIVE': (params: any) => LogicTemplates.logTimelineAction('SET_COMP_LANE_ACTIVE', params),
  'COLLAPSE_COMP_LANE_TO_ACTIVE': (params: any) => LogicTemplates.logTimelineAction('COLLAPSE_COMP_LANE_TO_ACTIVE', params),
  'RENAME_COMP_LANE': (params: any) => LogicTemplates.logTimelineAction('RENAME_COMP_LANE', params),
  'REORDER_COMP_LANE_TAKE': (params: any) => LogicTemplates.logTimelineAction('REORDER_COMP_LANE_TAKE', params),
  'SET_AUTOMATION_POINT': (params: any) => LogicTemplates.logTimelineAction('SET_AUTOMATION_POINT', params),
  'ADD_PLUGIN': (params: any) => LogicTemplates.logTimelineAction('ADD_PLUGIN', params),
  'REMOVE_PLUGIN': (params: any) => LogicTemplates.logTimelineAction('REMOVE_PLUGIN', params),
  'REORDER_PLUGIN': (params: any) => LogicTemplates.logTimelineAction('REORDER_PLUGIN', params),
  'SET_PLUGIN_PARAM': (params: any) => LogicTemplates.logTimelineAction('SET_PLUGIN_PARAM', params),
};
