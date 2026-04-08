'use strict';

const bcrypt  = require('bcryptjs');
const path    = require('path');
const fs      = require('fs');
const { app } = require('electron');

const SALT_ROUNDS = 12;

function getUsersFilePath() {
  return path.join(app.getPath('userData'), 'users.json');
}

function loadUsers() {
  const filePath = getUsersFilePath();
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw) || [];
  } catch {
    return [];
  }
}

function saveUsers(users) {
  const filePath = getUsersFilePath();
  fs.writeFileSync(filePath, JSON.stringify(users, null, 2), 'utf8');
}

function isFirstRun() {
  const users = loadUsers();
  return users.length === 0;
}

async function createSuperAdmin(username, password) {
  const users    = loadUsers();
  const existing = users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (existing) return { success: false, error: 'Username already exists' };

  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = {
    id:        require('uuid').v4(),
    username,
    password:  hash,
    role:      'super_admin',
    createdAt: new Date().toISOString()
  };
  users.push(user);
  saveUsers(users);
  return { success: true, user: sanitize(user) };
}

async function login(username, password) {
  const users = loadUsers();
  const user  = users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user) return { success: false, error: 'Invalid username or password' };

  const match = await bcrypt.compare(password, user.password);
  if (!match) return { success: false, error: 'Invalid username or password' };

  return { success: true, user: sanitize(user) };
}

async function createUser(username, password, role = 'admin') {
  if (!['admin', 'super_admin'].includes(role)) {
    return { success: false, error: 'Invalid role' };
  }
  const users    = loadUsers();
  const existing = users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (existing) return { success: false, error: 'Username already exists' };

  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = {
    id:        require('uuid').v4(),
    username,
    password:  hash,
    role,
    createdAt: new Date().toISOString()
  };
  users.push(user);
  saveUsers(users);
  return { success: true, user: sanitize(user) };
}

async function changePassword(userId, currentPassword, newPassword) {
  const users = loadUsers();
  const user  = users.find(u => u.id === userId);
  if (!user) return { success: false, error: 'User not found' };

  const match = await bcrypt.compare(currentPassword, user.password);
  if (!match) return { success: false, error: 'Current password is incorrect' };

  user.password = await bcrypt.hash(newPassword, SALT_ROUNDS);
  saveUsers(users);
  return { success: true };
}

function updateSelfProfile(userId, username) {
  const normalized = String(username || '').trim();
  if (!normalized) return { success: false, error: 'Display name is required' };

  const users = loadUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return { success: false, error: 'User not found' };
  if (user.role !== 'super_admin') {
    return { success: false, error: 'Only Super Admin can update this account profile' };
  }

  const existing = users.find(u => u.id !== userId && String(u.username || '').toLowerCase() === normalized.toLowerCase());
  if (existing) return { success: false, error: 'Username already exists' };

  user.username = normalized;
  saveUsers(users);
  return { success: true, user: sanitize(user) };
}

function deleteUser(userId, requesterId) {
  if (userId === requesterId) return { success: false, error: 'Cannot delete your own account' };
  const users  = loadUsers();
  const target = users.find(u => u.id === userId);
  if (!target)  return { success: false, error: 'User not found' };
  if (target.role === 'super_admin') return { success: false, error: 'Cannot delete Super Admin' };

  const updated = users.filter(u => u.id !== userId);
  saveUsers(updated);
  return { success: true };
}

function listUsers() {
  return loadUsers().map(sanitize);
}

function sanitize(user) {
  const { password, ...safe } = user;
  return safe;
}

module.exports = {
  isFirstRun,
  createSuperAdmin,
  login,
  createUser,
  updateSelfProfile,
  changePassword,
  deleteUser,
  listUsers
};
