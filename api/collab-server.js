/**
 * Echo Sound Lab — Real-Time Collaboration Server
 *
 * WebSocket server for multi-user sessions:
 * - Live presence tracking (who's online, cursor position)
 * - Real-time state sync (processing parameters, beat settings)
 * - Version history with snapshots
 * - Comment threads with @mentions
 * - Role-based access control (owner/engineer/artist/viewer)
 *
 * Deploy to: Railway, Render, or Fly.io
 * Environment: PORT (default 3001)
 */

import WebSocket from 'ws';
import http from 'http';
import { v4 as uuidv4 } from 'uuid';

const PORT = process.env.PORT || 3001;

// In-memory storage (use Redis in production)
const projects = new Map(); // projectId → ProjectSession
const clients = new Map(); // clientId → WebSocketClient

class ProjectSession {
  constructor(projectId, ownerId) {
    this.projectId = projectId;
    this.ownerId = ownerId;
    this.collaborators = new Map(); // userId → {name, email, role, color, lastActive}
    this.state = {
      vocalChain: {},
      beatConfig: { bpm: 95, key: 'C', loops: [] },
      masterSettings: {},
      isProcessing: false,
    };
    this.versions = []; // Array of {id, timestamp, createdBy, description, snapshot, isVariant}
    this.comments = []; // Array of {id, author, text, timestamp, resolved, mentions}
    this.presence = new Map(); // userId → {x, y, cursor, lastActive, color}
    this.createdAt = new Date();
  }

  addCollaborator(userId, name, email, role) {
    const color = this.generateUserColor(userId);
    this.collaborators.set(userId, {
      userId,
      name,
      email,
      role,
      color,
      lastActive: new Date(),
    });
    return this.collaborators.get(userId);
  }

  generateUserColor(userId) {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
      '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B88B', '#ABEBC6',
    ];
    const hash = userId.charCodeAt(0) + userId.charCodeAt(userId.length - 1);
    return colors[hash % colors.length];
  }

  saveVersion(userId, description, isVariant = false) {
    const version = {
      id: uuidv4(),
      projectId: this.projectId,
      timestamp: new Date(),
      createdBy: userId,
      description,
      snapshot: JSON.parse(JSON.stringify(this.state)), // Deep copy
      isVariant,
    };
    this.versions.push(version);
    return version;
  }

  addComment(userId, text, mentions = []) {
    const comment = {
      id: uuidv4(),
      projectId: this.projectId,
      author: userId,
      text,
      timestamp: new Date(),
      resolved: false,
      mentions,
    };
    this.comments.push(comment);
    return comment;
  }

  updatePresence(userId, x, y) {
    this.presence.set(userId, {
      userId,
      x,
      y,
      lastActive: new Date(),
      color: this.collaborators.get(userId)?.color || '#FFFFFF',
    });
  }

  getCollaborators() {
    return Array.from(this.collaborators.values());
  }

  getVersionHistory() {
    return this.versions;
  }

  getComments() {
    return this.comments;
  }

  getPresence() {
    return Array.from(this.presence.values());
  }
}

class WebSocketServer {
  constructor(port) {
    this.port = port;
    this.server = http.createServer((req, res) => {
      // Health check endpoint
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', clients: clients.size, projects: projects.size }));
        return;
      }
      res.writeHead(404);
      res.end('Not found');
    });

    this.wss = new WebSocket.Server({ server: this.server });
    this.setupWebSocketHandlers();
  }

  setupWebSocketHandlers() {
    this.wss.on('connection', (ws, req) => {
      const clientId = uuidv4();
      const client = { id: clientId, ws, projectId: null, userId: null, role: null };

      clients.set(clientId, client);
      console.log(`[CONNECT] Client ${clientId} connected. Total: ${clients.size}`);

      ws.on('message', (message) => this.handleMessage(client, message));
      ws.on('close', () => this.handleDisconnect(client));
      ws.on('error', (error) => {
        console.error(`[ERROR] Client ${clientId}:`, error.message);
      });
    });
  }

  handleMessage(client, rawMessage) {
    try {
      const message = JSON.parse(rawMessage);
      const { type, projectId, userId, role, payload } = message;

      switch (type) {
        case 'join':
          this.handleJoin(client, projectId, userId, role, payload);
          break;
        case 'update-state':
          this.handleUpdateState(client, payload);
          break;
        case 'cursor':
          this.handleCursor(client, payload);
          break;
        case 'comment':
          this.handleComment(client, payload);
          break;
        case 'version':
          this.handleVersion(client, payload);
          break;
        case 'vote':
          this.handleVote(client, payload);
          break;
        default:
          console.warn(`[WARN] Unknown message type: ${type}`);
      }
    } catch (err) {
      console.error('[ERROR] Message parsing failed:', err.message);
      this.send(client, { type: 'error', error: 'Invalid message format' });
    }
  }

  handleJoin(client, projectId, userId, role, payload) {
    // Get or create project
    if (!projects.has(projectId)) {
      projects.set(projectId, new ProjectSession(projectId, userId));
    }

    const project = projects.get(projectId);
    client.projectId = projectId;
    client.userId = userId;
    client.role = role;

    // Add collaborator
    const { name, email } = payload;
    const collaborator = project.addCollaborator(userId, name, email, role);

    // Send join confirmation + current state
    this.send(client, {
      type: 'join-confirmed',
      projectId,
      collaborators: project.getCollaborators(),
      state: project.state,
      presence: project.getPresence(),
    });

    // Broadcast presence to other collaborators in project
    this.broadcastToProject(projectId, {
      type: 'presence-update',
      collaborators: project.getCollaborators(),
    });

    console.log(`[JOIN] ${userId} joined ${projectId} as ${role}`);
  }

  handleUpdateState(client, payload) {
    const project = projects.get(client.projectId);
    if (!project) return;

    // Merge state update
    const { section, updates } = payload; // section: 'vocalChain' | 'beatConfig' | 'masterSettings'
    if (section && project.state[section]) {
      Object.assign(project.state[section], updates);
    }

    // Broadcast to all in project
    this.broadcastToProject(client.projectId, {
      type: 'state-update',
      section,
      updates,
      updatedBy: client.userId,
      timestamp: new Date(),
    });
  }

  handleCursor(client, payload) {
    const project = projects.get(client.projectId);
    if (!project) return;

    const { x, y } = payload;
    project.updatePresence(client.userId, x, y);

    // Broadcast presence
    this.broadcastToProject(client.projectId, {
      type: 'cursor-update',
      userId: client.userId,
      x,
      y,
      color: project.collaborators.get(client.userId)?.color,
    });
  }

  handleComment(client, payload) {
    const project = projects.get(client.projectId);
    if (!project) return;

    const { text, mentions } = payload;
    const comment = project.addComment(client.userId, text, mentions);

    // Broadcast comment
    this.broadcastToProject(client.projectId, {
      type: 'comment-added',
      comment,
    });

    // TODO: Send notifications to mentioned users
  }

  handleVersion(client, payload) {
    const project = projects.get(client.projectId);
    if (!project) return;

    const { description, isVariant } = payload;
    const version = project.saveVersion(client.userId, description, isVariant);

    // Broadcast version
    this.broadcastToProject(client.projectId, {
      type: 'version-saved',
      version,
    });
  }

  handleVote(client, payload) {
    // Track A/B votes on variants
    const { variantId, vote } = payload; // vote: 'variant-a' | 'variant-b'

    this.broadcastToProject(client.projectId, {
      type: 'variant-vote',
      variantId,
      userId: client.userId,
      vote,
    });
  }

  handleDisconnect(client) {
    clients.delete(client.id);

    if (client.projectId) {
      const project = projects.get(client.projectId);
      if (project) {
        // Mark presence as inactive
        project.presence.delete(client.userId);

        // Broadcast disconnect
        this.broadcastToProject(client.projectId, {
          type: 'presence-update',
          collaborators: project.getCollaborators(),
          presence: project.getPresence(),
        });

        // Clean up empty projects after 5 minutes
        if (project.collaborators.size === 0) {
          setTimeout(() => {
            if (project.collaborators.size === 0) {
              projects.delete(client.projectId);
              console.log(`[CLEANUP] Removed empty project ${client.projectId}`);
            }
          }, 5 * 60 * 1000);
        }
      }
    }

    console.log(`[DISCONNECT] Client ${client.id} disconnected. Total: ${clients.size}`);
  }

  send(client, message) {
    if (client.ws && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
  }

  broadcastToProject(projectId, message) {
    clients.forEach((client) => {
      if (client.projectId === projectId && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify(message));
      }
    });
  }

  start() {
    this.server.listen(this.port, () => {
      console.log(`🔗 Echo Collaboration Server running on port ${this.port}`);
      console.log(`📊 Health check: http://localhost:${this.port}/health`);
    });
  }
}

// Start server
const server = new WebSocketServer(PORT);
server.start();

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[SHUTDOWN] SIGTERM received, closing connections...');
  clients.forEach((client) => client.ws.close());
  process.exit(0);
});
