'use strict';
const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');

const JWT_SECRET   = process.env.JWT_SECRET || 'todoi-ws-secret-key-2024';
const PORT         = process.env.PORT || 3001;
const USE_SUPABASE = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);

/* ── Storage backend ────────────────────────────────────────────
   • Render/production  → Supabase (set SUPABASE_URL + SUPABASE_SERVICE_KEY)
   • Local Electron     → workspace-data.json (no env vars needed)
──────────────────────────────────────────────────────────────── */
let sb = null;

if (USE_SUPABASE) {
  const { createClient } = require('@supabase/supabase-js');
  sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  console.log('[DB] Supabase connected');
} else {
  console.log('[DB] Using local JSON file (workspace-data.json)');
}

/* ── Local JSON fallback ────────────────────────────────────── */
const DATA_FILE = path.join(__dirname, 'workspace-data.json');
let ldb = { workspaces: [], users: [], tasks: [], invites: [] };

function loadLdb() {
  try { if (fs.existsSync(DATA_FILE)) ldb = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch (e) { console.error('[JSON]', e.message); }
}
function saveLdb() {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(ldb, null, 2)); }
  catch (e) { console.error('[JSON]', e.message); }
}
if (!USE_SUPABASE) loadLdb();

/* ── Shape converters (Supabase columns ↔ API shape) ────────── */
function dbToTask(r) {
  return {
    id:           r.id,
    workspace_id: r.workspace_id,
    title:        r.title,
    desc:         r.description || '',
    priority:     r.priority,
    start:        r.start_date  || null,
    due:          r.due_date    || null,
    status:       r.status,
    progress:     r.progress,
    created_by:   r.created_by,
    created:      r.created_at,
  };
}
function taskToDb(task, workspaceId, userId) {
  return {
    id:           task.id,
    workspace_id: workspaceId || task.workspace_id,
    title:        task.title,
    description:  task.desc  || '',
    priority:     task.priority  || 'middle',
    start_date:   task.start     || null,
    due_date:     task.due       || null,
    status:       task.status    || 'notstarted',
    progress:     task.progress  ?? 0,
    created_by:   userId         || task.created_by || null,
    created_at:   task.created   || new Date().toISOString(),
  };
}

/* ── Unified DB helpers ─────────────────────────────────────── */

// USERS
async function findUserByEmail(email) {
  if (USE_SUPABASE) {
    const { data } = await sb.from('users').select('*').eq('email', email).maybeSingle();
    return data;
  }
  return ldb.users.find(u => u.email === email) || null;
}
async function findUserById(id) {
  if (USE_SUPABASE) {
    const { data } = await sb.from('users').select('*').eq('id', id).maybeSingle();
    return data;
  }
  return ldb.users.find(u => u.id === id) || null;
}
async function createUser(user) {
  if (USE_SUPABASE) {
    const { data, error } = await sb.from('users').insert(user).select().single();
    if (error) throw error;
    return data;
  }
  ldb.users.push(user); saveLdb(); return user;
}
async function updateUser(id, fields) {
  if (USE_SUPABASE) {
    const { data } = await sb.from('users').update(fields).eq('id', id).select().single();
    return data;
  }
  const u = ldb.users.find(u => u.id === id);
  if (u) Object.assign(u, fields);
  saveLdb(); return u;
}

// WORKSPACES
async function findWorkspace(id) {
  if (USE_SUPABASE) {
    const { data } = await sb.from('workspaces').select('*').eq('id', id).maybeSingle();
    return data;
  }
  return ldb.workspaces.find(w => w.id === id) || null;
}
async function createWorkspace(ws) {
  if (USE_SUPABASE) {
    const { data, error } = await sb.from('workspaces').insert(ws).select().single();
    if (error) throw error;
    return data;
  }
  ldb.workspaces.push(ws); saveLdb(); return ws;
}
async function updateWorkspace(id, fields) {
  if (USE_SUPABASE) {
    await sb.from('workspaces').update(fields).eq('id', id);
  } else {
    const w = ldb.workspaces.find(w => w.id === id);
    if (w) Object.assign(w, fields);
    saveLdb();
  }
}

// MEMBERS
async function getMembersOfWorkspace(wsId) {
  if (USE_SUPABASE) {
    const { data } = await sb.from('users').select('id,name,email,role,created_at').eq('workspace_id', wsId);
    return data || [];
  }
  return ldb.users
    .filter(u => u.workspace_id === wsId)
    .map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role, created_at: u.created_at }));
}

// TASKS
async function getTasksForWorkspace(wsId) {
  if (USE_SUPABASE) {
    const { data } = await sb.from('tasks').select('*').eq('workspace_id', wsId);
    return (data || []).map(dbToTask);
  }
  return ldb.tasks.filter(t => t.workspace_id === wsId);
}
async function createTask(taskApi, wsId, userId) {
  if (USE_SUPABASE) {
    const row = taskToDb(taskApi, wsId, userId);
    const { data, error } = await sb.from('tasks').insert(row).select().single();
    if (error) throw error;
    return dbToTask(data);
  }
  const task = { ...taskApi, workspace_id: wsId, created_by: userId };
  ldb.tasks.push(task); saveLdb(); return task;
}
async function updateTask(id, wsId, fields) {
  if (USE_SUPABASE) {
    // Map API field names → DB column names
    const dbFields = {};
    if (fields.title     !== undefined) dbFields.title       = fields.title;
    if (fields.desc      !== undefined) dbFields.description = fields.desc;
    if (fields.priority  !== undefined) dbFields.priority    = fields.priority;
    if (fields.start     !== undefined) dbFields.start_date  = fields.start;
    if (fields.due       !== undefined) dbFields.due_date    = fields.due;
    if (fields.status    !== undefined) dbFields.status      = fields.status;
    if (fields.progress  !== undefined) dbFields.progress    = fields.progress;
    const { data, error } = await sb.from('tasks').update(dbFields).eq('id', id).eq('workspace_id', wsId).select().single();
    if (error) throw error;
    return dbToTask(data);
  }
  const t = ldb.tasks.find(t => t.id === id && t.workspace_id === wsId);
  if (t) Object.assign(t, fields);
  saveLdb(); return t;
}
async function deleteTask(id, wsId) {
  if (USE_SUPABASE) {
    await sb.from('tasks').delete().eq('id', id).eq('workspace_id', wsId);
  } else {
    ldb.tasks = ldb.tasks.filter(t => !(t.id === id && t.workspace_id === wsId));
    saveLdb();
  }
}

// INVITES
async function findInviteByToken(token) {
  if (USE_SUPABASE) {
    const { data } = await sb.from('invites').select('*').eq('token', token).eq('used', false).maybeSingle();
    return data;
  }
  return ldb.invites.find(i => i.token === token && !i.used) || null;
}
async function findActiveInvite(email, wsId) {
  if (USE_SUPABASE) {
    const { data } = await sb.from('invites').select('*').eq('email', email).eq('workspace_id', wsId).eq('used', false).maybeSingle();
    return data;
  }
  return ldb.invites.find(i => i.email === email && i.workspace_id === wsId && !i.used) || null;
}
async function createInvite(invite) {
  if (USE_SUPABASE) {
    const { data, error } = await sb.from('invites').insert(invite).select().single();
    if (error) throw error;
    return data;
  }
  ldb.invites.push(invite); saveLdb(); return invite;
}
async function markInviteUsed(id) {
  if (USE_SUPABASE) {
    await sb.from('invites').update({ used: true }).eq('id', id);
  } else {
    const i = ldb.invites.find(i => i.id === id);
    if (i) i.used = true;
    saveLdb();
  }
}

/* ── UUID helper (works without uuid package if needed) ─────── */
function newId() {
  try { return require('uuid').v4(); }
  catch { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  }); }
}

/* ── Express setup ──────────────────────────────────────────── */
const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '4mb' }));
app.use(express.static(path.join(__dirname)));

/* ── Auth middleware ─────────────────────────────────────────── */
function authMw(req, res, next) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try { req.user = jwt.verify(h.slice(7), JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid token' }); }
}

/* ── Register ───────────────────────────────────────────────── */
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password, workspaceName } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ error: 'Name, email and password are required' });
    if (await findUserByEmail(email))
      return res.status(409).json({ error: 'Email already registered' });

    const ws   = await createWorkspace({ id: newId(), name: workspaceName || 'My Workspace', created_at: new Date().toISOString() });
    const user = await createUser({ id: newId(), workspace_id: ws.id, email, name, role: 'Owner', password_hash: bcrypt.hashSync(password, 10), created_at: new Date().toISOString() });
    await updateWorkspace(ws.id, { owner_id: user.id });

    const token = jwt.sign({ userId: user.id, workspaceId: ws.id }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, name, email, role: 'Owner', workspace_id: ws.id } });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

/* ── Login ──────────────────────────────────────────────────── */
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await findUserByEmail(email);
    if (!user || !bcrypt.compareSync(password, user.password_hash))
      return res.status(401).json({ error: 'Invalid email or password' });
    const token = jwt.sign({ userId: user.id, workspaceId: user.workspace_id }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, workspace_id: user.workspace_id } });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

/* ── Me ─────────────────────────────────────────────────────── */
app.get('/api/me', authMw, async (req, res) => {
  try {
    const user = await findUserById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const ws = await findWorkspace(user.workspace_id);
    res.json({ id: user.id, name: user.name, email: user.email, role: user.role, workspace_id: user.workspace_id, workspaceName: ws?.name || 'Workspace' });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/me', authMw, async (req, res) => {
  try {
    const user = await updateUser(req.user.userId, { name: req.body.name?.trim() });
    res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

/* ── Workspace ───────────────────────────────────────────────── */
app.get('/api/workspace', authMw, async (req, res) => {
  try { res.json(await findWorkspace(req.user.workspaceId) || {}); }
  catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/workspace', authMw, async (req, res) => {
  try {
    if (!req.body.name) return res.status(400).json({ error: 'Name required' });
    await updateWorkspace(req.user.workspaceId, { name: req.body.name.trim() });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

/* ── Members ─────────────────────────────────────────────────── */
app.get('/api/members', authMw, async (req, res) => {
  try { res.json(await getMembersOfWorkspace(req.user.workspaceId)); }
  catch (e) { res.status(500).json({ error: 'Server error' }); }
});

/* ── Invites ─────────────────────────────────────────────────── */
app.post('/api/invite', authMw, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    const members = await getMembersOfWorkspace(req.user.workspaceId);
    if (members.find(m => m.email === email))
      return res.status(409).json({ error: 'User is already a member of this workspace' });

    let invite = await findActiveInvite(email, req.user.workspaceId);
    if (!invite) {
      invite = await createInvite({ id: newId(), workspace_id: req.user.workspaceId, email, token: newId(), invited_by: req.user.userId, created_at: new Date().toISOString(), used: false });
    }
    res.json({ token: invite.token, email });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/invite/:token', async (req, res) => {
  try {
    const inv = await findInviteByToken(req.params.token);
    if (!inv) return res.status(404).json({ error: 'Invalid or expired invite code' });
    const ws = await findWorkspace(inv.workspace_id);
    res.json({ email: inv.email, workspaceName: ws?.name || 'Workspace' });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/invite/:token/accept', async (req, res) => {
  try {
    const { name, password } = req.body;
    if (!name || !password) return res.status(400).json({ error: 'Name and password required' });
    const inv = await findInviteByToken(req.params.token);
    if (!inv) return res.status(404).json({ error: 'Invalid or expired invite code' });
    if (await findUserByEmail(inv.email))
      return res.status(409).json({ error: 'Email already registered — please log in instead' });

    const user = await createUser({ id: newId(), workspace_id: inv.workspace_id, email: inv.email, name, role: 'Member', password_hash: bcrypt.hashSync(password, 10), created_at: new Date().toISOString() });
    await markInviteUsed(inv.id);

    const token = jwt.sign({ userId: user.id, workspaceId: inv.workspace_id }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, name, email: inv.email, role: 'Member', workspace_id: inv.workspace_id } });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

/* ── Tasks ───────────────────────────────────────────────────── */
app.get('/api/tasks', authMw, async (req, res) => {
  try { res.json(await getTasksForWorkspace(req.user.workspaceId)); }
  catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/tasks', authMw, async (req, res) => {
  try {
    if (!req.body.title) return res.status(400).json({ error: 'Title required' });
    res.json(await createTask(req.body, req.user.workspaceId, req.user.userId));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/tasks/:id', authMw, async (req, res) => {
  try {
    const task = await updateTask(req.params.id, req.user.workspaceId, req.body);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.delete('/api/tasks/:id', authMw, async (req, res) => {
  try {
    await deleteTask(req.params.id, req.user.workspaceId);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

/* ── Export ──────────────────────────────────────────────────── */
app.get('/api/export', authMw, async (req, res) => {
  try {
    const wsId = req.user.workspaceId;
    res.json({
      version: 2,
      exported: new Date().toISOString(),
      workspace: await findWorkspace(wsId),
      tasks:    await getTasksForWorkspace(wsId),
      members:  await getMembersOfWorkspace(wsId),
    });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

/* ── Start ───────────────────────────────────────────────────── */
module.exports = { app, PORT };
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => console.log(`[Server] http://localhost:${PORT}`));
}
