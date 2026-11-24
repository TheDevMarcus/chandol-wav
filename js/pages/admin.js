import { $, el, txt } from '../core/util.js';
import { on } from '../core/state.js';
import { isAdmin, apiCall, openAccount, avatarEl } from '../ui/account.js';
import { openProfile, badgesFor } from '../ui/profile.js';
import { toast } from '../ui/toast.js';

let q = '', timer = 0;

const ago = (t) => {
  if (!t) return 'never';
  const s = (Date.now() - t) / 1000;
  if (s < 90) return 'just now';
  if (s < 3600) return Math.round(s / 60) + ' min ago';
  if (s < 86400) return Math.round(s / 3600) + ' hr ago';
  return Math.round(s / 86400) + ' days ago';
};

function userRow(u) {
  const li = el('li', 'adrow' + (u.banned ? ' banned' : ''));
  const avb = avatarEl('aav plink', u); avb.title = 'See profile'; avb.onclick = () => openProfile(u); li.appendChild(avb);
  const mid = el('div', 'admid');
  const top = el('div', 'adname');
  top.appendChild(txt('b', null, u.username));
  top.appendChild(badgesFor(u));
  if (u.banned) top.appendChild(txt('span', 'adtag ban', 'Banned'));
  mid.appendChild(top);
  if (u.bio) mid.appendChild(txt('span', 'adbio', '“' + u.bio + '”'));
  const sub = 'Joined ' + new Date(u.created).toLocaleDateString() + ' · seen ' + ago(u.lastSeen) + (u.banned && u.reason ? ' · “' + u.reason + '”' : '');
  mid.appendChild(txt('span', null, sub));
  li.appendChild(mid);
  if (u.role !== 'admin') {
    const acts = el('div', 'adacts');
    const b = txt('button', 'adbtn' + (u.banned ? '' : ' warn'), u.banned ? 'Unban' : 'Ban');
    b.type = 'button';
    b.onclick = async () => {
      let reason = '';
      if (!u.banned) {
        reason = prompt('Ban ' + u.username + '? They’re logged out everywhere and can’t use the site.\n\nReason (optional):', '');
        if (reason === null) return;
      }
      const r = await apiCall('POST', '/admin/ban', { id: u.id, reason, ban: !u.banned });
      if (r.status !== 200) { toast(r.data.error || 'That didn’t work'); return; }
      toast(u.banned ? u.username + ' was unbanned' : u.username + ' was banned');
      load();
    };
    acts.appendChild(b);
    const d = txt('button', 'adbtn danger', 'Delete');
    d.type = 'button';
    d.onclick = async () => {
      if (!confirm('Delete ' + u.username + '’s account for good? This can’t be undone.')) return;
      const r = await apiCall('POST', '/admin/delete-user', { id: u.id });
      if (r.status !== 200) { toast(r.data.error || 'That didn’t work'); return; }
      toast(u.username + ' was deleted');
      load();
    };
    acts.appendChild(d);
    if (u.avatar || u.bio) {
      const cp = txt('button', 'adbtn', 'Clear profile');
      cp.type = 'button'; cp.title = 'Remove their picture and bio';
      cp.onclick = async () => {
        if (!confirm('Remove ' + u.username + '’s profile picture and bio?')) return;
        const r = await apiCall('POST', '/admin/clear-profile', { id: u.id });
        if (r.status !== 200) { toast(r.data.error || 'That didn’t work'); return; }
        toast('Profile cleared'); load();
      };
      acts.insertBefore(cp, acts.firstChild);
    }
    li.appendChild(acts);
  }
  return li;
}

async function load() {
  const list = $('adminView').querySelector('.adlist');
  if (!list) return;
  const r = await apiCall('GET', '/admin/users' + (q ? '?q=' + encodeURIComponent(q) : ''));
  if (r.status === 403 || r.status === 401) { render(); return; }
  if (r.status !== 200) { list.innerHTML = ''; list.appendChild(txt('li', 'rempty', r.data.error || 'Couldn’t load users.')); return; }
  $('adminView').querySelector('.adstat').textContent = r.data.total + ' accounts · ' + r.data.banned + ' banned';
  list.innerHTML = '';
  if (!r.data.users.length) list.appendChild(txt('li', 'rempty', 'No accounts match.'));
  r.data.users.forEach((u) => list.appendChild(userRow(u)));
}

function render() {
  const root = $('adminView');
  root.innerHTML = '';
  if (!isAdmin()) {
    const box = el('div', 'adlock');
    box.appendChild(txt('h2', null, 'Admins only'));
    box.appendChild(txt('p', null, 'Log in with an admin account to see this page.'));
    const b = txt('button', 'abtn pri', 'Log in');
    b.type = 'button';
    b.onclick = () => openAccount('login');
    box.appendChild(b);
    root.appendChild(box);
    return;
  }
  const head = el('div', 'rhead');
  head.appendChild(txt('h2', null, 'Admin panel'));
  head.appendChild(txt('span', 'rcount adstat', ''));
  root.appendChild(head);

  const users = el('section', 'adsec');
  users.appendChild(txt('h4', null, 'Accounts'));
  const search = el('div', 'rsearch');
  const input = el('input');
  input.type = 'search'; input.placeholder = 'Search usernames…'; input.value = q;
  input.oninput = () => { q = input.value.trim(); clearTimeout(timer); timer = setTimeout(load, 250); };
  search.appendChild(input);
  users.appendChild(search);
  users.appendChild(el('ul', 'adlist'));
  root.appendChild(users);
  load();
}

export function onShowAdmin() { render(); }
export function initAdmin() { on('account', () => { if (!$('adminView').hidden) render(); }); }
