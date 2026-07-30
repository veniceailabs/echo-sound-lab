import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { downloadText } from '../services/cueSheetExporter';
import {
  collaborationService,
  type Collaborator,
  type UserRole,
  type ProjectVersion,
  type Comment,
} from '../services/collaborationService';

interface CollaborationPanelProps {
  projectId: string;
  userId: string;
  isOwner: boolean;
}

const ROLE_COLORS: Record<UserRole, string> = {
  owner: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  engineer: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  artist: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
  viewer: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
};

export const CollaborationPanel: React.FC<CollaborationPanelProps> = ({ projectId, userId, isOwner }) => {
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [versions, setVersions] = useState<ProjectVersion[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [activeTab, setActiveTab] = useState<'collab' | 'versions' | 'comments'>('collab');
  const [isLoading, setIsLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('engineer');
  const [versionDescription, setVersionDescription] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [commentMentions, setCommentMentions] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const loadProjectData = useCallback(async () => {
    setIsLoading(true);
    setActionError(null);
    try {
      const [collaboratorData, versionData, commentData] = await Promise.all([
        collaborationService.getCollaborators(projectId),
        collaborationService.getVersionHistory(projectId),
        collaborationService.getComments(projectId),
      ]);
      setCollaborators(collaboratorData);
      setVersions(versionData);
      setComments(commentData);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to load collaboration state.');
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadProjectData();
  }, [loadProjectData]);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    try {
      await collaborationService.inviteCollaborator(projectId, inviteEmail.trim(), inviteRole);
      setInviteEmail('');
      await loadProjectData();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Invite failed.');
    }
  };

  const handleSaveVersion = async (isVariant = false) => {
    const description = versionDescription.trim();
    if (!description) return;
    try {
      collaborationService.saveVersion(projectId, userId, description, isVariant);
      setVersionDescription('');
      setSelectedVersionId(null);
      await loadProjectData();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to save version.');
    }
  };

  const handleReviewDecision = async (versionId: string, decision: 'approved' | 'changes-requested') => {
    const notes = reviewNotes.trim();
    try {
      const updated = decision === 'approved'
        ? collaborationService.approveVersion(projectId, versionId, userId, notes)
        : collaborationService.requestVersionChanges(projectId, versionId, userId, notes);
      if (!updated) {
        setActionError('Version review failed.');
        return;
      }
      setReviewNotes('');
      setSelectedVersionId(versionId);
      await loadProjectData();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to update review decision.');
    }
  };

  const exportReviewPackage = () => {
    const json = collaborationService.serializeReviewPackage(projectId);
    downloadText(json, `${projectId}-review-package.json`, 'application/json');
  };

  const handleAddComment = async () => {
    const text = commentText.trim();
    if (!text) return;
    const mentions = commentMentions
      .split(',')
      .map((mention) => mention.trim())
      .filter(Boolean);
    try {
      await collaborationService.addComment(projectId, userId, text, mentions);
      setCommentText('');
      setCommentMentions('');
      await loadProjectData();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to add comment.');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] backdrop-blur-xl overflow-hidden shadow-[0_16px_48px_rgba(0,0,0,0.6)]"
    >
      <div className="px-6 py-4 border-b border-white/[0.08]">
        <h2 className="text-lg font-semibold text-white">Collaboration</h2>
        <p className="text-xs text-white/40 mt-1">Work together on projects in real time</p>
      </div>

      <div className="px-6 py-3 border-b border-white/[0.08] flex gap-2">
        {(['collab', 'versions', 'comments'] as const).map((tab) => (
          <motion.button
            key={tab}
            whileTap={{ scale: 0.95 }}
            onClick={() => setActiveTab(tab)}
            className={
              `px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab
                  ? 'bg-blue-500/20 border border-blue-500/30 text-blue-300'
                  : 'bg-white/[0.04] border border-white/10 text-white/60 hover:bg-white/[0.08]'
              }`
            }
          >
            {tab === 'collab' ? 'Collaborators' : tab === 'versions' ? 'Versions' : 'Comments'}
          </motion.button>
        ))}
      </div>

      <div className="px-6 py-4">
        {actionError && (
          <div className="mb-3 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            {actionError}
          </div>
        )}

        {activeTab === 'collab' && (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium text-white/70 mb-3">Active Now</p>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {isLoading ? (
                  <p className="text-xs text-white/40">Loading...</p>
                ) : collaborators.length === 0 ? (
                  <p className="text-xs text-white/40">Just you for now</p>
                ) : (
                  collaborators.map((collab) => (
                    <motion.div
                      key={collab.userId}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={`p-3 rounded-lg border flex items-center gap-3 ${ROLE_COLORS[collab.role]}`}
                    >
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: collab.color }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{collab.name}</p>
                        <p className="text-[10px] opacity-70 capitalize">{collab.role}</p>
                      </div>
                      {collab.userId === userId && (
                        <span className="text-[10px] opacity-50">(you)</span>
                      )}
                    </motion.div>
                  ))
                )}
              </div>
            </div>

            {isOwner && (
              <div className="border-t border-white/10 pt-4">
                <p className="text-xs font-medium text-white/70 mb-3">Invite Collaborators</p>
                <div className="space-y-2">
                  <input
                    type="email"
                    placeholder="colleague@email.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleInvite();
                    }}
                    className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm placeholder-white/40"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as UserRole)}
                      className="px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-xs"
                    >
                      <option value="engineer">Engineer</option>
                      <option value="artist">Artist</option>
                      <option value="viewer">Viewer</option>
                    </select>
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={handleInvite}
                      disabled={!inviteEmail.trim()}
                      className={
                        `px-3 py-2 rounded-lg font-medium text-xs transition-all ${
                          inviteEmail.trim()
                            ? 'bg-blue-500/20 border border-blue-500/30 text-blue-300 hover:bg-blue-500/30'
                            : 'bg-white/[0.04] border border-white/10 text-white/40 cursor-not-allowed'
                        }`
                      }
                    >
                      Send
                    </motion.button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'versions' && (
          <div className="space-y-4 max-h-[28rem] overflow-y-auto pr-1">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <p className="text-xs font-medium text-white/70">Save version</p>
              <div className="mt-2 space-y-2">
                <input
                  type="text"
                  value={versionDescription}
                  onChange={(event) => setVersionDescription(event.target.value)}
                  placeholder="Describe the change, e.g. tightened vocal glue"
                  className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/35"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void handleSaveVersion(false)}
                    disabled={!versionDescription.trim()}
                    className="rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-cyan-100 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Save Snapshot
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSaveVersion(true)}
                    disabled={!versionDescription.trim()}
                    className="rounded-lg border border-fuchsia-400/30 bg-fuchsia-500/10 px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-fuchsia-100 hover:bg-fuchsia-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Save Variant
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <p className="text-xs font-medium text-white/70">Review controls</p>
              <div className="mt-2 space-y-2">
                <textarea
                  value={reviewNotes}
                  onChange={(event) => setReviewNotes(event.target.value)}
                  placeholder="Review notes for the selected version"
                  className="h-20 w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/35"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const targetVersionId = selectedVersionId || versions[0]?.id;
                      if (!targetVersionId) return;
                      void handleReviewDecision(targetVersionId, 'approved');
                    }}
                    disabled={!versions.length}
                    className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-emerald-100 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Approve Selected
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const targetVersionId = selectedVersionId || versions[0]?.id;
                      if (!targetVersionId) return;
                      void handleReviewDecision(targetVersionId, 'changes-requested');
                    }}
                    disabled={!versions.length}
                    className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-amber-100 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Request Changes
                  </button>
                  <button
                    type="button"
                    onClick={exportReviewPackage}
                    className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-slate-200 hover:bg-white/[0.08]"
                  >
                    Export Review Package
                  </button>
                </div>
              </div>
            </div>

            {versions.length === 0 ? (
              <p className="text-xs text-white/40 py-4">No versions yet</p>
            ) : (
              versions.map((version) => (
                <div key={version.id} className={`rounded-xl border p-3 transition-colors ${selectedVersionId === version.id ? 'border-cyan-400/40 bg-cyan-500/10' : 'border-white/10 bg-slate-900/60'}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">{version.description}</p>
                      <p className="text-[10px] uppercase tracking-[0.16em] text-white/40">
                        {version.createdBy} · {new Date(version.timestamp).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.16em] ${version.isVariant ? 'border-fuchsia-400/30 bg-fuchsia-500/10 text-fuchsia-100' : 'border-cyan-400/30 bg-cyan-500/10 text-cyan-100'}`}>
                        {version.isVariant ? 'Variant' : 'Snapshot'}
                      </span>
                      <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.16em] ${version.reviewDecision === 'approved' ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100' : version.reviewDecision === 'changes-requested' ? 'border-amber-400/30 bg-amber-500/10 text-amber-100' : 'border-white/10 bg-white/[0.04] text-white/60'}`}>
                        {version.reviewDecision}
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedVersionId(version.id)}
                      className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-slate-200 hover:bg-white/[0.08]"
                    >
                      Select
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleReviewDecision(version.id, 'approved')}
                      className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-emerald-100 hover:bg-emerald-500/20"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleReviewDecision(version.id, 'changes-requested')}
                      className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-amber-100 hover:bg-amber-500/20"
                    >
                      Changes
                    </button>
                  </div>
                  {version.reviewNotes && (
                    <p className="mt-2 text-[11px] text-slate-400">
                      Notes: {version.reviewNotes}
                    </p>
                  )}
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] uppercase tracking-[0.14em] text-slate-500">
                    <p>Compare: {version.compareVersionId || 'n/a'}</p>
                    <p>Reviewed by: {version.reviewedBy || 'pending'}</p>
                  </div>
                </div>
              ))
            )}
            <p className="text-[10px] text-white/30">
              Versions preserve snapshots for review, branch comparison, and release-proof accountability.
            </p>
          </div>
        )}

        {activeTab === 'comments' && (
          <div className="space-y-4 max-h-[28rem] overflow-y-auto pr-1">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <p className="text-xs font-medium text-white/70">Add comment</p>
              <textarea
                value={commentText}
                onChange={(event) => setCommentText(event.target.value)}
                placeholder="Comment on processing choices, edits, or export readiness"
                className="mt-2 h-24 w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/35"
              />
              <input
                type="text"
                value={commentMentions}
                onChange={(event) => setCommentMentions(event.target.value)}
                placeholder="Mentions separated by commas"
                className="mt-2 w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs text-white placeholder:text-white/35"
              />
              <button
                type="button"
                onClick={() => void handleAddComment()}
                disabled={!commentText.trim()}
                className="mt-2 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-emerald-100 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Post Comment
              </button>
            </div>
            {comments.length === 0 ? (
              <p className="text-xs text-white/40 py-4">No comments yet</p>
            ) : (
              comments.map((comment) => (
                <div key={comment.id} className="rounded-xl border border-white/10 bg-slate-900/60 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold text-white">{comment.author}</p>
                    <p className="text-[10px] uppercase tracking-[0.16em] text-white/40">
                      {new Date(comment.timestamp).toLocaleString()}
                    </p>
                  </div>
                  <p className="mt-2 text-sm text-white/80">{comment.text}</p>
                  {comment.mentions.length > 0 && (
                    <p className="mt-2 text-[10px] uppercase tracking-[0.16em] text-cyan-200/70">
                      Mentions: {comment.mentions.join(', ')}
                    </p>
                  )}
                </div>
              ))
            )}
            <p className="text-[10px] text-white/30">
              Comment on processing steps, EQ choices, or mixing decisions. @mention collaborators.
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default CollaborationPanel;
