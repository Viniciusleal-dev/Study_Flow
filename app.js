
  const firebaseConfig = {
    apiKey: "AIzaSyCVf599Of4qaCZTBl3vBhYto7cpQ6mSZv0",
    authDomain: "studyflow-62adb.firebaseapp.com",
    projectId: "studyflow-62adb",
    storageBucket: "studyflow-62adb.firebasestorage.app",
    messagingSenderId: "977715065835",
    appId: "1:977715065835:web:da25ae7e09c60551e85fae",
    measurementId: "G-ZXQ3EXMVCQ"
  };
  firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const db = firebase.firestore();

  let currentUser = null;
  let currentProfile = null;
  let currentGroupId = null;
  let currentDmId = null;
  let unsubDms = null;
  let unsubGroups = null;
  let unsubMessages = null;
  let unsubAdminGroups = null;
  let unsubJoinReqs = null;
  let unsubProfile = null;
  let groupsCache = {};

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = (str === undefined || str === null) ? '' : String(str);
    return div.innerHTML;
  }

  function traduzErro(err) {
    const map = {
      'auth/email-already-in-use': 'este e-mail já está cadastrado.',
      'auth/invalid-email': 'e-mail inválido.',
      'auth/weak-password': 'a senha deve ter pelo menos 6 caracteres.',
      'auth/missing-password': 'digite uma senha.',
      'auth/user-not-found': 'usuário não encontrado.',
      'auth/wrong-password': 'senha incorreta.',
      'auth/invalid-credential': 'e-mail ou senha incorretos.',
      'auth/too-many-requests': 'muitas tentativas. tente novamente mais tarde.'
    };
    return map[err.code] || err.message;
  }

 
  function showPage(id) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.page-app').forEach(p => p.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) {
      if (el.classList.contains('page-app')) {
        el.classList.add('active');
      } else {
        el.classList.add('active');
        window.scrollTo(0,0);
      }
      initFadeUp();
    }
  }

  function goApp(tab) {
    showPage('page-app-' + tab);
  }


  function doRegister() {
    const nome = document.getElementById('reg-nome').value.trim();
    const sobrenome = document.getElementById('reg-sobrenome').value.trim();
    let username = document.getElementById('reg-username').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const senha = document.getElementById('reg-senha').value;
    const confirmar = document.getElementById('reg-confirmar').value;

    if (!nome || !email || !senha) { alert('Preencha pelo menos nome, e-mail e senha.'); return; }
    if (senha.length < 6) { alert('A senha precisa ter no mínimo 6 caracteres.'); return; }
    if (senha !== confirmar) { alert('As senhas não coincidem.'); return; }
    if (!username) username = '@' + nome.toLowerCase().replace(/\s+/g, '');

    const dias = [...document.querySelectorAll('#reg-days .pill.selected')].map(p => p.textContent.trim());
    const materias = [...document.querySelectorAll('#reg-subjects .pill.selected')].map(p => p.textContent.trim());
    const materiaOutra = document.getElementById('reg-materia-outra').value.trim();
    if (materiaOutra) materias.push(materiaOutra);

    auth.createUserWithEmailAndPassword(email, senha)
      .then(cred => db.collection('users').doc(cred.user.uid).set({
        nome, sobrenome, username, email,
        dias, materias,
        horarioInicio: document.getElementById('reg-horario-ini').value,
        horarioFim: document.getElementById('reg-horario-fim').value,
        notificacoes: document.getElementById('reg-notif').checked,
        streak: 0,
        criadoEm: firebase.firestore.FieldValue.serverTimestamp()
      }))
      .then(() => showToast('🎉', 'Conta criada com sucesso!', 'Comece sua jornada no studyflow.'))
      .catch(err => alert('Erro ao criar conta: ' + traduzErro(err)));
  }

  function doLogin() {
    const email = document.getElementById('login-email').value.trim();
    const senha = document.getElementById('login-pass').value;
    if (!email || !senha) { alert('Preencha e-mail e senha.'); return; }
    auth.signInWithEmailAndPassword(email, senha)
      .then(() => showToast('👋', 'Bem-vindo de volta!', 'Continue sua jornada de estudos.'))
      .catch(err => alert('Erro ao entrar: ' + traduzErro(err)));
  }

  function loginWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider)
      .then(result => {
        const user = result.user;
        return db.collection('users').doc(user.uid).get().then(doc => {
          if (doc.exists) return;
          // primeiro login com Google: cria o perfil
          const nomeCompleto = (user.displayName || 'Usuário').trim();
          const partes = nomeCompleto.split(' ');
          const nome = partes[0];
          const sobrenome = partes.slice(1).join(' ');
          return db.collection('users').doc(user.uid).set({
            nome, sobrenome,
            username: '@' + nome.toLowerCase().replace(/\s+/g, ''),
            email: user.email || '',
            dias: [], materias: [],
            horarioInicio: '', horarioFim: '',
            notificacoes: true,
            streak: 0,
            criadoEm: firebase.firestore.FieldValue.serverTimestamp()
          });
        });
      })
      .then(() => showToast('👋', 'Bem-vindo!', 'Login com Google realizado com sucesso.'))
      .catch(err => {
        if (err.code === 'auth/popup-closed-by-user') return;
        if (err.code === 'auth/unauthorized-domain') {
          alert('Este domínio não está autorizado para login com Google. Se você abriu o arquivo direto (file://), publique o site (ex: Firebase Hosting) para usar este login.');
          return;
        }
        alert('Erro ao entrar com Google: ' + err.message);
      });
  }

  function logout() {
    if (unsubGroups) unsubGroups();
    if (unsubMessages) unsubMessages();
    if (unsubAdminGroups) unsubAdminGroups();
    if (unsubJoinReqs) unsubJoinReqs();
    if (unsubProfile) unsubProfile();
    if (unsubDms) unsubDms();
    currentGroupId = null;
    currentDmId = null;
    auth.signOut();
  }

  function applyProfileToUI() {
    const nome = (currentProfile && currentProfile.nome) || 'Usuário';
    const initial = nome.charAt(0).toUpperCase();
    document.querySelectorAll('.avatar-sm, .profile-big-avatar').forEach(el => el.textContent = initial);
    const nameEl = document.getElementById('profile-name');
    const handleEl = document.getElementById('profile-handle');
    if (nameEl) nameEl.textContent = nome + (currentProfile.sobrenome ? ' ' + currentProfile.sobrenome : '');
    if (handleEl) handleEl.textContent = currentProfile.username || '';
  }

  auth.onAuthStateChanged(user => {
    if (user) {
      currentUser = user;
      if (unsubProfile) unsubProfile();
      unsubProfile = db.collection('users').doc(user.uid).onSnapshot(doc => {
        currentProfile = doc.exists ? doc.data() : { nome: 'Usuário', username: '', materias: [], dias: [], streak: 0, studyLog: {} };
        applyProfileToUI();
        renderDashboard();
      }, err => console.error('Erro ao carregar perfil:', err));
      goApp('inicio');
      startGroupsListener();
      startAdminGroupsListener();
      startDirectListener();
    } else {
      currentUser = null;
      currentProfile = null;
      groupsCache = {};
      showPage('page-landing');
    }
  });


  function toggleTip(card) {
    card.classList.toggle('expanded');
  }


  function switchTab(el, tab) {
    document.querySelectorAll('.chat-tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    document.getElementById('groups-tab').style.display = tab === 'grupos' ? 'block' : 'none';
    document.getElementById('direto-tab').style.display = tab === 'direto' ? 'block' : 'none';
  }

  function startGroupsListener() {
    if (unsubGroups) unsubGroups();
    unsubGroups = db.collection('groups')
      .where('membros', 'array-contains', currentUser.uid)
      .onSnapshot(snap => {
        groupsCache = {};
        const list = document.getElementById('groups-tab');
        if (snap.empty) {
          list.innerHTML = '<div style="padding:24px 16px;text-align:center;color:var(--white-dim);font-size:0.82rem">você ainda não está em nenhum grupo.<br><br>toque em 🔍 para descobrir grupos públicos ou em ➕ para criar o seu!</div>';
          renderProfilePage();
          return;
        }
        list.innerHTML = '';
        snap.forEach(doc => {
          const g = doc.data();
          groupsCache[doc.id] = g;
          const item = document.createElement('div');
          item.className = 'chat-item' + (doc.id === currentGroupId ? ' active' : '');
          item.id = 'group-item-' + doc.id;
          item.onclick = () => openGroupChat(doc.id);
          const cor = g.cor || '#00C6C6';
          const visTxt = g.visibilidade === 'publico' ? 'Grupo público' : (g.visibilidade === 'pedido' ? 'Grupo c/ aprovação' : 'Grupo privado');
          item.innerHTML = `
            <div class="chat-avatar group" style="background:linear-gradient(135deg,${cor},#0080A0)">${escapeHtml((g.nome || '??').slice(0,2).toUpperCase())}</div>
            <div class="chat-info">
              <div class="chat-name">${escapeHtml(g.nome)}</div>
              <div class="chat-preview">${visTxt} • ${(g.membros || []).length} membros</div>
            </div>`;
          list.appendChild(item);
        });
        if (currentGroupId && groupsCache[currentGroupId]) {
          renderGroupHeader(currentGroupId);
        }
        renderProfilePage();
      }, err => console.error('Erro ao carregar grupos:', err));
  }

  function renderGroupHeader(groupId) {
    const g = groupsCache[groupId];
    if (!g) return;
    const visTxt = g.visibilidade === 'publico' ? 'Grupo público' : (g.visibilidade === 'pedido' ? 'Grupo com aprovação' : 'Grupo privado');
    document.getElementById('chat-hdr-name').textContent = g.nome;
    document.getElementById('chat-hdr-sub').textContent = visTxt + ' • ' + (g.membros || []).length + ' membros';
    const hdrAvatar = document.getElementById('chat-hdr-avatar');
    hdrAvatar.style.cssText = `background:linear-gradient(135deg,${g.cor || '#00C6C6'},#0080A0);border-radius:12px;width:42px;height:42px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:0.85rem;color:#0F1320`;
    hdrAvatar.textContent = (g.nome || '??').slice(0,2).toUpperCase();
    renderGroupInfo(groupId, g);
  }

  function renderGroupInfo(groupId, g) {
    document.getElementById('gi-nome').textContent = g.nome;
    document.getElementById('gi-desc').textContent = g.descricao || '';
    const badge = document.getElementById('gi-badge');
    if (g.visibilidade === 'publico') { badge.className = 'group-badge pub'; badge.textContent = '🌐 público'; }
    else if (g.visibilidade === 'pedido') { badge.className = 'group-badge priv'; badge.textContent = '🔑 entrada por aprovação'; }
    else { badge.className = 'group-badge priv'; badge.textContent = '🔒 privado'; }

    const codeEl = document.getElementById('gi-code');
    const isAdmin = (g.admins || []).includes(currentUser.uid);
    if (isAdmin && g.visibilidade !== 'publico' && g.codigo) {
      codeEl.innerHTML = `<div style="margin-top:8px;font-size:0.75rem;color:var(--white-dim)">código de convite: <strong style="color:var(--cyan)">${escapeHtml(g.codigo)}</strong></div>`;
    } else {
      codeEl.innerHTML = '';
    }

    document.getElementById('gi-membros-title').textContent = 'membros (' + (g.membros || []).length + ')';

    const memberList = document.getElementById('member-list');
    const membros = g.membros || [];
    const admins = g.admins || [];
    if (!membros.length) { memberList.innerHTML = ''; return; }

    db.collection('users').where(firebase.firestore.FieldPath.documentId(), 'in', membros.slice(0,30)).get()
      .then(snap => {
        const usersById = {};
        snap.forEach(d => usersById[d.id] = d.data());
        memberList.innerHTML = '';
        membros.forEach(uid => {
          const u = usersById[uid] || { nome: 'Usuário' };
          const initials = (u.nome || '??').slice(0,2).toUpperCase();
          const row = document.createElement('div');
          row.className = 'member-row';
          const isMe = uid === currentUser.uid;
          row.innerHTML = `
            <div class="member-avatar" style="background:linear-gradient(135deg,#00C6C6,#0080A0);cursor:${isMe ? 'default' : 'pointer'}" ${isMe ? '' : `onclick="openUserProfile('${uid}')"`}>${escapeHtml(initials)}</div>
            <div style="flex:1;cursor:${isMe ? 'default' : 'pointer'}" ${isMe ? '' : `onclick="openUserProfile('${uid}')"`}>
              <div class="member-name">${escapeHtml(u.nome || 'Usuário')}${isMe ? ' (você)' : ''}</div>
              <div class="member-role">${escapeHtml(u.username || '')}</div>
            </div>
            ${admins.includes(uid) ? '<span class="admin-badge">admin</span>' : ''}
            ${isMe ? '' : `<button class="btn-ghost" style="flex:0 0 auto;margin-left:6px" onclick="event.stopPropagation();startDM('${uid}','${escapeHtml(u.nome || 'Usuário').replace(/'/g,"\\'")}','${escapeHtml(u.username || '').replace(/'/g,"\\'")}')">mensagem</button>`}`;
          memberList.appendChild(row);
        });
      })
      .catch(err => console.error('Erro ao carregar membros:', err));
  }

  function openGroupChat(groupId) {
    currentGroupId = groupId;
    currentDmId = null;
    document.querySelectorAll('.chat-item').forEach(i => i.classList.remove('active'));
    const el = document.getElementById('group-item-' + groupId);
    if (el) el.classList.add('active');
    document.getElementById('msg-search-bar').style.display = 'none';
    document.getElementById('msg-search-input').value = '';
    renderGroupHeader(groupId);
    document.getElementById('group-panel').style.display = 'block';
    startMessagesListener(groupId);
  }

  function startMessagesListener(chatId, type) {
    type = type || 'group';
    if (unsubMessages) unsubMessages();
    const area = document.getElementById('messages-area');
    area.innerHTML = '<div style="text-align:center;color:var(--white-dim);font-size:0.85rem;padding:30px">carregando mensagens...</div>';
    const colRef = (type === 'dm')
      ? db.collection('dms').doc(chatId).collection('messages')
      : db.collection('groups').doc(chatId).collection('messages');
    unsubMessages = colRef
      .orderBy('criadoEm', 'asc')
      .limitToLast(150)
      .onSnapshot(snap => {
        const ativo = type === 'dm' ? (chatId === currentDmId) : (chatId === currentGroupId);
        if (!ativo) return;
        if (snap.empty) {
          area.innerHTML = '<div style="text-align:center;color:var(--white-dim);font-size:0.85rem;padding:30px">nenhuma mensagem ainda. diga olá! 👋</div>';
          return;
        }
        area.innerHTML = '';
        snap.forEach(doc => {
          const m = doc.data();
          const mine = m.autorUid === currentUser.uid;
          const time = m.criadoEm ? m.criadoEm.toDate().toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'}) : 'agora';
          const msg = document.createElement('div');
          msg.className = 'msg' + (mine ? ' mine' : '');
          msg.dataset.texto = (m.texto || '').toLowerCase();
          msg.dataset.id = doc.id;

          const editadoTxt = m.editado ? ' <span style="opacity:0.6">(editado)</span>' : '';
          const avatarHtml = `<div class="msg-avatar" style="background:linear-gradient(135deg,var(--cyan),#0080A0)"${mine ? '' : ` onclick="openUserProfile('${m.autorUid}')" style="background:linear-gradient(135deg,var(--cyan),#0080A0);cursor:pointer"`}>${escapeHtml(m.autorIniciais || '??')}</div>`;
          const senderHtml = `<div class="msg-sender"${mine ? '' : ` onclick="openUserProfile('${m.autorUid}')"`}>${mine ? 'você' : escapeHtml(m.autorNome || 'Usuário')}</div>`;
          const menuHtml = mine ? `
            <div class="msg-menu-btn" onclick="toggleMsgMenu(event,'${doc.id}')">⋮
              <div class="msg-menu-dropdown" id="msg-menu-${doc.id}">
                <button onclick="editMsg('${doc.id}')">✏️ editar</button>
                <button class="danger" onclick="deleteMsg('${doc.id}')">🗑️ apagar</button>
              </div>
            </div>` : '';

          msg.innerHTML = `
            ${avatarHtml}
            <div class="msg-body">
              ${senderHtml}
              <div class="msg-bubble" data-original="${escapeHtml(m.texto || '')}">${escapeHtml(filtrarTexto(m.texto))}${editadoTxt}</div>
              <div class="msg-time">${time}</div>
            </div>
            ${menuHtml}`;
          area.appendChild(msg);
        });
        area.scrollTop = area.scrollHeight;
      }, err => console.error('Erro ao carregar mensagens:', err));
  }


  function closeAllMsgMenus() {
    document.querySelectorAll('.msg-menu-dropdown').forEach(d => d.style.display = 'none');
    document.querySelectorAll('.msg-menu-btn').forEach(b => b.classList.remove('open'));
  }
  document.addEventListener('click', closeAllMsgMenus);

  function toggleMsgMenu(event, msgId) {
    event.stopPropagation();
    const dd = document.getElementById('msg-menu-' + msgId);
    const wasOpen = dd && dd.style.display === 'block';
    closeAllMsgMenus();
    if (dd && !wasOpen) {
      dd.style.display = 'block';
      dd.parentElement.classList.add('open');
    }
  }

  function getMessagesRef() {
    return currentDmId
      ? db.collection('dms').doc(currentDmId).collection('messages')
      : db.collection('groups').doc(currentGroupId).collection('messages');
  }

  function editMsg(msgId) {
    closeAllMsgMenus();
    const bubble = document.querySelector('.msg[data-id="' + msgId + '"] .msg-bubble');
    if (!bubble) return;
    const original = bubble.dataset.original || '';
    bubble.innerHTML = `<input type="text" class="edit-msg-input" id="edit-input-${msgId}" value="${escapeHtml(original)}" />`;
    const input = document.getElementById('edit-input-' + msgId);
    input.focus();
    input.select();
    let done = false;
    const salvar = () => {
      if (done) return;
      done = true;
      const novo = input.value.trim();
      if (novo && novo !== original) saveMsgEdit(msgId, novo);
    };
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); salvar(); input.blur(); }
    });
    input.addEventListener('blur', salvar);
  }

  function saveMsgEdit(msgId, novoTexto) {
    getMessagesRef().doc(msgId).update({ texto: novoTexto, editado: true })
      .catch(err => alert('Erro ao editar mensagem: ' + err.message));
  }

  function deleteMsg(msgId) {
    closeAllMsgMenus();
    if (!confirm('Apagar esta mensagem?')) return;
    getMessagesRef().doc(msgId).delete()
      .catch(err => alert('Erro ao apagar mensagem: ' + err.message));
  }

  function sendMsg() {
    const input = document.getElementById('msg-input');
    const text = input.value.trim();
    if (!text || !currentUser || (!currentGroupId && !currentDmId)) return;
    input.value = '';
    const nome = (currentProfile && currentProfile.nome) || 'Usuário';
    const payload = {
      texto: text,
      autorUid: currentUser.uid,
      autorNome: nome,
      autorIniciais: nome.slice(0,2).toUpperCase(),
      criadoEm: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (currentDmId) {
      db.collection('dms').doc(currentDmId).collection('messages').add(payload)
        .catch(err => alert('Erro ao enviar mensagem: ' + err.message));
      db.collection('dms').doc(currentDmId).update({
        ultimaMsg: text,
        atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
      }).catch(() => {});
    } else {
      db.collection('groups').doc(currentGroupId).collection('messages').add(payload)
        .catch(err => alert('Erro ao enviar mensagem: ' + err.message));
    }

    db.collection('users').doc(currentUser.uid).update({
      mensagensEnviadas: firebase.firestore.FieldValue.increment(1)
    }).catch(() => {});
  }


  function startDirectListener() {
    if (unsubDms) unsubDms();
    unsubDms = db.collection('dms')
      .where('participantes', 'array-contains', currentUser.uid)
      .onSnapshot(snap => {
        const list = document.getElementById('direto-tab');
        if (snap.empty) {
          list.innerHTML = '<div style="padding:24px 16px;text-align:center;color:var(--white-dim);font-size:0.82rem">você ainda não tem conversas diretas.<br><br>abra um grupo, clique em "ver membros" e toque em "mensagem" para começar uma conversa.</div>';
          return;
        }
        list.innerHTML = '';
        snap.forEach(doc => {
          const d = doc.data();
          const info = d.participantesInfo || {};
          const otherUid = (d.participantes || []).find(u => u !== currentUser.uid);
          const other = info[otherUid] || { nome: 'Usuário', username: '' };
          const item = document.createElement('div');
          item.className = 'chat-item' + (doc.id === currentDmId ? ' active' : '');
          item.id = 'dm-item-' + doc.id;
          item.onclick = () => openDMChat(doc.id, otherUid, other.nome, other.username);
          item.innerHTML = `
            <div class="chat-avatar" style="background:linear-gradient(135deg,#A87FFF,#6040C0)">${escapeHtml((other.nome || '??').slice(0,2).toUpperCase())}</div>
            <div class="chat-info">
              <div class="chat-name">${escapeHtml(other.nome || 'Usuário')}</div>
              <div class="chat-preview">${escapeHtml(d.ultimaMsg || 'conversa iniciada')}</div>
            </div>`;
          list.appendChild(item);
        });
      }, err => console.error('Erro ao carregar conversas diretas:', err));
  }

  function startDM(otherUid, otherNome, otherUsername) {
    if (!currentUser || otherUid === currentUser.uid) return;
    const dmId = [currentUser.uid, otherUid].sort().join('_');
    const info = {};
    info[currentUser.uid] = { nome: (currentProfile && currentProfile.nome) || 'Usuário', username: (currentProfile && currentProfile.username) || '' };
    info[otherUid] = { nome: otherNome, username: otherUsername };

    db.collection('dms').doc(dmId).set({
      participantes: [currentUser.uid, otherUid],
      participantesInfo: info,
      atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true }).then(() => {
      const dirTab = document.querySelector('.chat-tab[onclick*="direto"]');
      if (dirTab) switchTab(dirTab, 'direto');
      openDMChat(dmId, otherUid, otherNome, otherUsername);
    }).catch(err => alert('Erro: ' + err.message));
  }

  function openDMChat(dmId, otherUid, otherNome, otherUsername) {
    currentDmId = dmId;
    currentGroupId = null;
    document.querySelectorAll('.chat-item').forEach(i => i.classList.remove('active'));
    const el = document.getElementById('dm-item-' + dmId);
    if (el) el.classList.add('active');
    document.getElementById('msg-search-bar').style.display = 'none';
    document.getElementById('msg-search-input').value = '';
    document.getElementById('group-panel').style.display = 'none';

    document.getElementById('chat-hdr-name').textContent = otherNome || 'Usuário';
    document.getElementById('chat-hdr-sub').textContent = otherUsername || '';
    const hdrAvatar = document.getElementById('chat-hdr-avatar');
    hdrAvatar.style.cssText = 'background:linear-gradient(135deg,#A87FFF,#6040C0);border-radius:50%;width:42px;height:42px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:0.85rem;color:#0F1320';
    hdrAvatar.textContent = (otherNome || '??').slice(0,2).toUpperCase();

    startMessagesListener(dmId, 'dm');
  }

  function toggleMsgSearch() {
    const bar = document.getElementById('msg-search-bar');
    const input = document.getElementById('msg-search-input');
    const show = bar.style.display === 'none';
    bar.style.display = show ? 'flex' : 'none';
    if (show) {
      input.focus();
    } else {
      input.value = '';
      filterMessages('');
    }
  }

  function filterMessages(query) {
    const q = query.trim().toLowerCase();
    document.querySelectorAll('#messages-area .msg').forEach(msg => {
      const texto = msg.dataset.texto || '';
      msg.style.display = (!q || texto.includes(q)) ? 'flex' : 'none';
    });
  }

  function toggleGroupPanel() {
    const gp = document.getElementById('group-panel');
    gp.style.display = gp.style.display === 'none' ? 'block' : 'none';
  }

  // ── MODAIS ────────────────────────────────────
  function openModal(id) {
    document.getElementById(id).classList.add('open');
  }
  function closeModal(id) {
    document.getElementById(id).classList.remove('open');
  }

  document.querySelectorAll('.modal-overlay').forEach(mo => {
    mo.addEventListener('click', function(e) {
      if (e.target === this) this.classList.remove('open');
    });
  });

  function selectOpt(val) {
    ['pub','priv','req'].forEach(o => document.getElementById('opt-'+o).classList.remove('selected'));
    document.getElementById('opt-'+val).classList.add('selected');
  }

  function createGroup() {
    const name = document.getElementById('group-name').value.trim();
    const desc = document.getElementById('group-desc').value.trim();
    const subject = document.getElementById('group-subject').value.trim();
    if (!name) { alert('Digite um nome para o grupo'); return; }

    let vis = 'publico';
    if (document.getElementById('opt-priv').classList.contains('selected')) vis = 'privado';
    else if (document.getElementById('opt-req').classList.contains('selected')) vis = 'pedido';

    const cor = '#' + Math.floor(Math.random()*0xFFFFFF).toString(16).padStart(6,'0');
    const codigo = Math.random().toString(36).substring(2,8).toUpperCase();

    db.collection('groups').add({
      nome: name,
      descricao: desc,
      materia: subject,
      visibilidade: vis,
      cor,
      codigo: vis !== 'publico' ? codigo : null,
      criadorUid: currentUser.uid,
      membros: [currentUser.uid],
      admins: [currentUser.uid],
      criadoEm: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
      closeModal('modal-create-group');
      showToast('👥', 'Grupo criado!', '"' + name + '" está pronto para receber membros.');
      document.getElementById('group-name').value = '';
      document.getElementById('group-desc').value = '';
      document.getElementById('group-subject').value = '';
    }).catch(err => alert('Erro ao criar grupo: ' + err.message));
  }


  function openDiscoverModal() {
    openModal('modal-discover');
    const list = document.getElementById('discover-list');
    list.innerHTML = '<div style="text-align:center;color:var(--white-dim);font-size:0.82rem;padding:10px">carregando...</div>';
    db.collection('groups').where('visibilidade', 'in', ['publico', 'pedido']).get()
      .then(snap => {
        list.innerHTML = '';
        let any = false;
        snap.forEach(doc => {
          const g = doc.data();
          if ((g.membros || []).includes(currentUser.uid)) return;
          any = true;
          const row = document.createElement('div');
          row.style = 'display:flex;align-items:center;gap:12px;padding:10px;border:1px solid var(--border);border-radius:12px';
          const isPub = g.visibilidade === 'publico';
          row.innerHTML = `
            <div class="chat-avatar group" style="background:linear-gradient(135deg,${g.cor || '#00C6C6'},#0080A0)">${escapeHtml((g.nome || '??').slice(0,2).toUpperCase())}</div>
            <div style="flex:1">
              <div class="chat-name">${escapeHtml(g.nome)}</div>
              <div class="chat-preview">${isPub ? '🌐 público' : '🔑 c/ aprovação'} • ${(g.membros || []).length} membros</div>
            </div>
            <button class="modal-confirm" style="flex:0 0 auto;padding:8px 14px;font-size:0.8rem" onclick="requestJoinGroup('${doc.id}', ${isPub})">${isPub ? 'entrar' : 'pedir p/ entrar'}</button>`;
          list.appendChild(row);
        });
        if (!any) list.innerHTML = '<div style="text-align:center;color:var(--white-dim);font-size:0.82rem;padding:10px">nenhum grupo novo encontrado por aqui.</div>';
      })
      .catch(err => {
        list.innerHTML = '<div style="text-align:center;color:var(--white-dim);font-size:0.82rem;padding:10px">erro ao buscar grupos.</div>';
        console.error(err);
      });
  }

  function requestJoinGroup(groupId, isPublic) {
    if (isPublic) {
      db.collection('groups').doc(groupId).update({
        membros: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
      }).then(() => {
        closeModal('modal-discover');
        showToast('✅', 'Você entrou no grupo!', 'Bons estudos 📚');
      }).catch(err => alert('Erro: ' + err.message));
    } else {
      db.collection('joinRequests').add({
        groupId,
        userUid: currentUser.uid,
        userNome: (currentProfile && currentProfile.nome) || 'Usuário',
        status: 'pendente',
        criadoEm: firebase.firestore.FieldValue.serverTimestamp()
      }).then(() => {
        closeModal('modal-discover');
        showToast('🔔', 'Pedido enviado!', 'Aguarde a aprovação do administrador do grupo.');
      }).catch(err => alert('Erro: ' + err.message));
    }
  }

  function joinByCode() {
    const code = document.getElementById('join-code-input').value.trim().toUpperCase();
    if (!code) return;
    db.collection('groups').where('codigo', '==', code).get()
      .then(snap => {
        if (snap.empty) { alert('Código inválido ou expirado.'); return; }
        const doc = snap.docs[0];
        const g = doc.data();
        if ((g.membros || []).includes(currentUser.uid)) {
          closeModal('modal-discover');
          showToast('ℹ️', 'Você já está nesse grupo!', g.nome);
          return;
        }
        return db.collection('groups').doc(doc.id).update({
          membros: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
        }).then(() => {
          closeModal('modal-discover');
          document.getElementById('join-code-input').value = '';
          showToast('✅', 'Você entrou no grupo!', g.nome);
        });
      })
      .catch(err => alert('Erro: ' + err.message));
  }

  let pmTargetUid = null;
  let pmTargetNome = '';
  let pmTargetUsername = '';

  function openUserProfile(uid) {
    if (!uid || uid === currentUser.uid) return;
    pmTargetUid = uid;
    pmTargetNome = '';
    pmTargetUsername = '';

   
    document.getElementById('pm-avatar').textContent = '...';
    document.getElementById('pm-name').textContent = 'carregando...';
    document.getElementById('pm-handle').textContent = '';
    document.getElementById('pm-title').textContent = '';
    document.getElementById('pm-streak').textContent = '—';
    document.getElementById('pm-grupos').textContent = '—';
    document.getElementById('pm-conquistas').textContent = '—';
    document.getElementById('pm-topics').innerHTML = '';
    const bioEl = document.getElementById('pm-bio');
    if (bioEl) { bioEl.textContent = ''; bioEl.style.display = 'none'; }
    openModal('modal-profile');

  
    Promise.all([
      db.collection('users').doc(uid).get(),
      db.collection('groups').where('membros', 'array-contains', uid).get()
    ]).then(([userDoc, gruposSnap]) => {
      if (!userDoc.exists) { document.getElementById('pm-name').textContent = 'usuário não encontrado'; return; }
      const u = userDoc.data();
      pmTargetNome = u.nome || 'Usuário';
      pmTargetUsername = u.username || '';

      const streak = u.streak || 0;
      const studyLog = u.studyLog || {};
      const numGrupos = gruposSnap.size;
      const titulos = [
        { min: 0, emoji: '🌱', nome: 'Calouro' },
        { min: 1, emoji: '⚡', nome: 'Iniciante' },
        { min: 3, emoji: '📚', nome: 'Estudante' },
        { min: 7, emoji: '🔥', nome: 'Em chamas' },
        { min: 30, emoji: '🏆', nome: 'Maratonista' }
      ];
      let tAtual = titulos[0];
      if (u.tituloEscolhido) {
        const escolhido = titulos.find(t => t.nome === u.tituloEscolhido && streak >= t.min);
        if (escolhido) tAtual = escolhido;
      } else {
        titulos.forEach(t => { if (streak >= t.min) tAtual = t; });
      }
      const numConquistas = titulos.filter(t => streak >= t.min).length;
      const inicial = pmTargetNome.charAt(0).toUpperCase();

      document.getElementById('pm-avatar').textContent = inicial;
      document.getElementById('pm-avatar').style.background = 'linear-gradient(135deg,#00C6C6,#0080A0)';
      document.getElementById('pm-name').textContent = pmTargetNome + (u.sobrenome ? ' ' + u.sobrenome : '');
      document.getElementById('pm-handle').textContent = pmTargetUsername;
      document.getElementById('pm-title').textContent = tAtual.emoji + ' ' + tAtual.nome;
      document.getElementById('pm-streak').textContent = streak;
      document.getElementById('pm-grupos').textContent = numGrupos;
      document.getElementById('pm-conquistas').textContent = numConquistas;

      if (bioEl && u.bio) { bioEl.textContent = u.bio; bioEl.style.display = 'block'; }

      const tc = document.getElementById('pm-topics');
      const materias = u.materias || [];
      tc.innerHTML = materias.length
        ? materias.map(m => `<span class="profile-topic">${escapeHtml(m)}</span>`).join('')
        : '<span style="color:var(--white-dim);font-size:0.8rem">nenhuma matéria cadastrada</span>';
    }).catch(err => {
      document.getElementById('pm-name').textContent = 'erro ao carregar';
      console.error(err);
    });
  }

  function sendDMFromProfile() {
    if (!pmTargetUid) return;
    closeModal('modal-profile');
    startDM(pmTargetUid, pmTargetNome, pmTargetUsername);
    const dirTab = document.querySelector('.chat-tab[onclick*="direto"]');
    if (dirTab) switchTab(dirTab, 'direto');
    goApp('chat');
  }


  function openProfileModal(name, initials, c1, c2, handle, title, streak, topics) {
    pmTargetUid = null;
    document.getElementById('pm-avatar').textContent = initials;
    document.getElementById('pm-avatar').style.background = `linear-gradient(135deg,#${c1},#${c2})`;
    document.getElementById('pm-name').textContent = name;
    document.getElementById('pm-handle').textContent = handle;
    document.getElementById('pm-title').textContent = title;
    document.getElementById('pm-streak').textContent = streak;
    document.getElementById('pm-grupos').textContent = '—';
    document.getElementById('pm-conquistas').textContent = '—';
    const tc = document.getElementById('pm-topics');
    tc.innerHTML = topics.split(',').map(t => `<span class="profile-topic">${t.trim()}</span>`).join('');
    openModal('modal-profile');
  }


  function startAdminGroupsListener() {
    if (unsubAdminGroups) unsubAdminGroups();
    unsubAdminGroups = db.collection('groups')
      .where('admins', 'array-contains', currentUser.uid)
      .onSnapshot(snap => {
        const ids = snap.docs.map(d => d.id);
        const names = {};
        snap.forEach(d => names[d.id] = d.data().nome);
        listenJoinRequests(ids, names);
      }, err => console.error('Erro ao verificar grupos administrados:', err));
  }

  function listenJoinRequests(groupIds, groupNames) {
    if (unsubJoinReqs) unsubJoinReqs();
    const banner = document.getElementById('join-req');
    if (!groupIds.length) { banner.style.display = 'none'; banner.innerHTML = ''; return; }

    unsubJoinReqs = db.collection('joinRequests')
      .where('groupId', 'in', groupIds.slice(0, 30))
      .where('status', '==', 'pendente')
      .onSnapshot(snap => {
        if (snap.empty) { banner.style.display = 'none'; banner.innerHTML = ''; return; }
        banner.style.display = 'block';
        banner.innerHTML = '';
        snap.forEach(doc => {
          const r = doc.data();
          const row = document.createElement('div');
          row.className = 'join-request-banner';
          row.innerHTML = `
            <span>🔔 <strong style="color:var(--white)">${escapeHtml(r.userNome)}</strong> quer entrar em <strong style="color:var(--white)">${escapeHtml(groupNames[r.groupId] || '')}</strong></span>
            <div class="join-actions">
              <button class="join-accept" onclick="acceptJoin('${doc.id}','${r.groupId}','${r.userUid}')">aceitar</button>
              <button class="join-decline" onclick="declineJoin('${doc.id}')">recusar</button>
            </div>`;
          banner.appendChild(row);
        });
      }, err => console.error('Erro ao carregar pedidos de entrada:', err));
  }

  function acceptJoin(reqId, groupId, userUid) {
    db.collection('groups').doc(groupId).update({
      membros: firebase.firestore.FieldValue.arrayUnion(userUid)
    }).then(() => db.collection('joinRequests').doc(reqId).update({ status: 'aceito' }))
      .then(() => showToast('✅', 'Pedido aceito!', 'O novo membro já pode participar do grupo.'))
      .catch(err => alert('Erro: ' + err.message));
  }

  function declineJoin(reqId) {
    db.collection('joinRequests').doc(reqId).update({ status: 'rejeitado' })
      .catch(err => alert('Erro: ' + err.message));
  }

  // ── TOAST ─────────────────────────────────────
  function showToast(icon, title, body) {
    const t = document.getElementById('toast');
    document.getElementById('toast-icon').textContent = icon;
    document.getElementById('toast-title').textContent = title;
    document.getElementById('toast-body').textContent = body;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3500);
  }

  // ── FADE UP ───────────────────────────────────
  function initFadeUp() {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); }
      });
    }, { threshold: 0.1 });
    document.querySelectorAll('.fade-up:not(.visible)').forEach(el => obs.observe(el));
  }
  initFadeUp();


  function togglePill(el) {
    el.classList.toggle('selected');
  }


  const DIAS_SEMANA = ['dom','seg','ter','qua','qui','sex','sáb'];
  const DIAS_SEMANA_NOMES = ['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
  const DIAS_SEMANA_ABREV = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

  function dateStr(d) {
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }

  function blocksForDay(dayIndex) {
    const materias = (currentProfile && currentProfile.materias) || [];
    const dias = (currentProfile && currentProfile.dias) || [];
    if (!materias.length || !dias.includes(DIAS_SEMANA[dayIndex])) return [];
    const n = Math.min(2, materias.length);
    const blocks = [];
    for (let i = 0; i < n; i++) blocks.push(materias[(dayIndex * 2 + i) % materias.length]);
    return blocks;
  }

  function renderDashboard() {
    if (!currentProfile) return;
    applyConfigToUI();
    const nome = currentProfile.nome || 'Usuário';
    const streak = currentProfile.streak || 0;
    const studyLog = currentProfile.studyLog || {};

    document.querySelectorAll('.streak-badge').forEach(el => {
      el.textContent = '🔥 ' + streak + (streak === 1 ? ' dia' : ' dias');
    });

    const greetingTitle = document.getElementById('greeting-title');
    const greetingSub = document.getElementById('greeting-sub');
    if (greetingTitle) {
      greetingTitle.textContent = 'Olá, ' + nome + '! 👋';
      greetingSub.textContent = streak > 0
        ? 'Você está em uma sequência de ' + streak + (streak === 1 ? ' dia' : ' dias') + '. Continue assim!'
        : 'Comece hoje a construir sua sequência de estudos!';
    }

    const today = new Date();
    const todayIdx = today.getDay();
    const todayStr = dateStr(today);
    const todayDone = studyLog[todayStr] || [];

    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - todayIdx);

    let totalBlocks = 0, doneBlocks = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart); d.setDate(weekStart.getDate() + i);
      const blocks = blocksForDay(i);
      totalBlocks += blocks.length;
      const done = studyLog[dateStr(d)] || [];
      blocks.forEach(b => { if (done.includes(b)) doneBlocks++; });
    }

    const statsEl = document.getElementById('dash-stats-row');
    if (statsEl) {
      const diasEstudados = Object.keys(studyLog).length;
      const todayTotal = blocksForDay(todayIdx).length;
      statsEl.innerHTML = `
        <div class="dash-stat"><div class="num">🔥 ${streak}</div><div class="lbl">dias de streak</div></div>
        <div class="dash-stat"><div class="num">${diasEstudados}</div><div class="lbl">dias estudados</div></div>
        <div class="dash-stat"><div class="num">${todayDone.length}/${todayTotal}</div><div class="lbl">blocos hoje</div></div>
        <div class="dash-stat"><div class="num">${doneBlocks}/${totalBlocks}</div><div class="lbl">blocos da semana</div></div>`;
    }

    const grid = document.getElementById('schedule-grid');
    if (grid) {
      grid.innerHTML = '';
      for (let i = 0; i < 7; i++) {
        const d = new Date(weekStart); d.setDate(weekStart.getDate() + i);
        const ds = dateStr(d);
        const blocks = blocksForDay(i);
        const done = studyLog[ds] || [];
        const col = document.createElement('div');
        col.className = 'schedule-col';
        let html = `<div class="schedule-col-head${i === todayIdx ? ' today' : ''}">${DIAS_SEMANA_ABREV[i]}</div>`;
        if (!blocks.length) {
          html += '<div class="schedule-cell empty">—</div><div class="schedule-cell empty">—</div>';
        } else {
          blocks.forEach(b => {
            let status, icon;
            if (done.includes(b)) { status = 'feito'; icon = '✅'; }
            else if (ds < todayStr) { status = 'atrasado'; icon = '⚠️'; }
            else { status = 'pendente'; icon = '⏳'; }
            html += `<div class="schedule-cell ${status}"><span class="cell-icon">${icon}</span><span>${escapeHtml(b)}</span></div>`;
          });
        }
        col.innerHTML = html;
        grid.appendChild(col);
      }
    }

    const todayList = document.getElementById('today-list');
    const todayTitle = document.getElementById('today-card-title');
    if (todayList) {
      if (todayTitle) todayTitle.textContent = '⏰ hoje, ' + DIAS_SEMANA_NOMES[todayIdx];
      const blocks = blocksForDay(todayIdx);
      if (!blocks.length) {
        todayList.innerHTML = (currentProfile.materias || []).length
          ? '<div style="text-align:center;color:var(--white-dim);font-size:0.85rem;padding:16px">nenhum bloco programado para hoje. Aproveite para revisar ou descansar! 😌</div>'
          : '<div style="text-align:center;color:var(--white-dim);font-size:0.85rem;padding:16px">você ainda não escolheu matérias no seu perfil. Edite seu perfil para gerar seu cronograma!</div>';
      } else {
        todayList.innerHTML = '';
        blocks.forEach(b => {
          const isDone = todayDone.includes(b);
          const item = document.createElement('div');
          item.className = 'today-item';
          item.innerHTML = `
            <span class="subj-dot" style="background:${isDone ? '#50C878' : '#00C6C6'}"></span>
            <div class="today-item-body">
              <strong>${escapeHtml(b)}</strong>
              <span>${isDone ? 'concluído ✅' : 'não finalizado'}</span>
            </div>
            ${isDone ? '' : `<button class="btn-ghost" onclick="finalizarBloco('${b.replace(/'/g, "\\'")}')">finalizar</button>`}`;
          todayList.appendChild(item);
        });
      }
    }
    renderProfilePage();
    renderConquistasPage();
  }

  function renderConquistasPage() {
    if (!currentProfile) return;
    const streak = currentProfile.streak || 0;
    const studyLog = currentProfile.studyLog || {};
    const diasEstudados = Object.keys(studyLog).length;
    const numGrupos = Object.keys(groupsCache).length;
    const mensagens = currentProfile.mensagensEnviadas || 0;
    const today = new Date();

    const countEl = document.getElementById('conq-streak-count');
    if (countEl) countEl.textContent = streak;

    const daysRow = document.getElementById('conq-streak-days');
    if (daysRow) {
      let html = '';
      for (let i = 6; i >= 0; i--) {
        const d = new Date(today); d.setDate(today.getDate() - i);
        const ds = dateStr(d);
        const done = !!(studyLog[ds] && studyLog[ds].length);
        const cls = i === 0 ? (done ? 'today done' : 'today') : (done ? 'done' : 'miss');
        html += `<div class="streak-day ${cls}"><span>${DIAS_SEMANA_ABREV[d.getDay()].toLowerCase()}</span><strong>${d.getDate()}</strong></div>`;
      }
      daysRow.innerHTML = html;
    }

    const msgEl = document.getElementById('conq-streak-msg');
    if (msgEl) {
      const todayStr = dateStr(today);
      const estudouHoje = !!(studyLog[todayStr] && studyLog[todayStr].length);
      msgEl.textContent = estudouHoje
        ? 'Você já estudou hoje! Sua sequência está protegida. 🎉'
        : 'Continue estudando hoje para manter sua sequência! 💪';
    }

    const titlesGrid = document.getElementById('conq-titles-grid');
    if (titlesGrid) {
      const atual = tituloAtual(streak);
      titlesGrid.innerHTML = TITULOS.map(t => {
        const earned = streak >= t.min;
        if (earned) {
          const isAtual = t.nome === atual.nome;
          return `<div class="title-card earned" style="cursor:pointer" onclick="escolherTitulo('${t.nome}')" title="usar este título no perfil">
            <div class="title-icon">${t.emoji}</div>
            <div class="title-name">${t.nome}</div>
            <div class="title-desc">${t.min === 0 ? 'primeiros passos na jornada' : t.min + ' dias de streak'}</div>
            <div class="title-earned-badge">${isAtual ? 'atual' : 'usar este'}</div>
          </div>`;
        }
        const restantes = t.min - streak;
        return `<div class="title-card locked">
          <div class="title-icon">${t.emoji}</div>
          <div class="title-name">${t.nome}</div>
          <div class="title-desc">${t.min} dias de streak</div>
          <div style="margin-top:8px;font-size:0.68rem;color:var(--white-dim)">🔒 ${restantes} dia${restantes === 1 ? '' : 's'} restante${restantes === 1 ? '' : 's'}</div>
        </div>`;
      }).join('');
    }

    const list = document.getElementById('conq-achievements-list');
    if (list) {
      const items = [
        { icon: '🚀', nome: 'Primeiro Dia', desc: 'Complete sua primeira sessão de estudo', cur: diasEstudados, goal: 1 },
        { icon: '💬', nome: 'Comunicador', desc: 'Envie 10 mensagens em grupos de estudo', cur: mensagens, goal: 10 },
        { icon: '👥', nome: 'Construtor de Comunidade', desc: 'Participe de 5 grupos de estudo diferentes', cur: numGrupos, goal: 5 },
        { icon: '🎯', nome: 'Consistência Extrema', desc: 'Mantenha 30 dias de streak', cur: streak, goal: 30 },
        { icon: '📖', nome: 'Maratona de Estudos', desc: 'Estude por 50 dias no total', cur: diasEstudados, goal: 50 }
      ];
      list.innerHTML = items.map(a => {
        const cur = Math.min(a.cur, a.goal);
        const pct = Math.round((cur / a.goal) * 100);
        const done = cur >= a.goal;
        return `<div class="achievement-row${done ? ' earned' : ''}">
          <div class="achievement-icon">${a.icon}</div>
          <div class="achievement-body">
            <div class="achievement-name">${a.nome}</div>
            <div class="achievement-desc">${a.desc}</div>
            ${done ? '' : `<div class="achievement-progress"><div class="achievement-bar" style="width:${pct}%"></div></div>`}
          </div>
          <div class="achievement-status"${done ? ' style="color:var(--cyan);font-weight:700"' : ''}>${done ? '✓ conquistado' : cur + '/' + a.goal}</div>
        </div>`;
      }).join('');
    }
  }

  const TITULOS = [
    { min: 0,  emoji: '🌱', nome: 'Calouro' },
    { min: 1,  emoji: '⚡', nome: 'Iniciante' },
    { min: 3,  emoji: '📚', nome: 'Estudante' },
    { min: 7,  emoji: '🔥', nome: 'Em chamas' },
    { min: 30, emoji: '🏆', nome: 'Maratonista' }
  ];

  function tituloAtual(streak) {
    let maisAlto = TITULOS[0];
    TITULOS.forEach(t => { if (streak >= t.min) maisAlto = t; });

    const escolhido = currentProfile && currentProfile.tituloEscolhido;
    if (escolhido) {
      const t = TITULOS.find(t => t.nome === escolhido);
      if (t && streak >= t.min) return t;
    }
    return maisAlto;
  }

  function escolherTitulo(nome) {
    if (!currentUser) return;
    db.collection('users').doc(currentUser.uid).update({ tituloEscolhido: nome })
      .then(() => showToast('🎖️', 'Título alterado!', 'Agora você está usando "' + nome + '".'))
      .catch(err => alert('Erro: ' + err.message));
  }

  function renderProfilePage() {
    if (!currentProfile) return;
    const streak = currentProfile.streak || 0;
    const studyLog = currentProfile.studyLog || {};
    const diasEstudados = Object.keys(studyLog).length;
    const numGrupos = Object.keys(groupsCache).length;
    const desbloqueados = TITULOS.filter(t => streak >= t.min);
    const atual = tituloAtual(streak);

    const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setTxt('profile-stat-streak', streak);
    setTxt('profile-stat-dias', diasEstudados);
    setTxt('profile-stat-grupos', numGrupos);
    setTxt('profile-stat-conquistas', desbloqueados.length);

    const titleBadge = document.getElementById('profile-title-badge');
    if (titleBadge) titleBadge.textContent = atual.emoji + ' ' + atual.nome;

    const bioEl = document.getElementById('profile-bio');
    if (bioEl) bioEl.textContent = currentProfile.bio || 'conte um pouco sobre você em "editar perfil" 👋';

    const subjEl = document.getElementById('profile-subjects');
    if (subjEl) {
      const materias = currentProfile.materias || [];
      subjEl.innerHTML = materias.map(m =>
        `<span style="background:var(--bg-card2);border:1px solid var(--border);border-radius:8px;padding:4px 10px;font-size:0.75rem;color:var(--white-dim)">${escapeHtml(m)}</span>`
      ).join('');
    }

    const titlesEl = document.getElementById('profile-titles');
    if (titlesEl) {
      titlesEl.innerHTML = desbloqueados.map(t => {
        const ativo = t.nome === atual.nome;
        return `<div style="cursor:pointer;background:${ativo ? 'rgba(0,198,198,0.1)' : 'var(--bg)'};border:${ativo ? '1.5px solid rgba(0,198,198,0.4)' : '1px solid rgba(0,198,198,0.25)'};border-radius:10px;padding:10px 14px;display:flex;align-items:center;gap:8px" onclick="escolherTitulo('${t.nome}')" title="usar este título">
          <span>${t.emoji}</span><span style="font-size:0.82rem;font-weight:700${ativo ? ';color:var(--cyan)' : ''}">${escapeHtml(t.nome)}</span>
          ${ativo ? '<span style="font-size:0.65rem;color:var(--cyan);background:rgba(0,198,198,0.15);border-radius:6px;padding:2px 6px">ativo</span>' : ''}
        </div>`;
      }).join('');
    }
  }

  function openEditProfile() {
    if (!currentProfile) return;
    document.getElementById('ep-nome').value = currentProfile.nome || '';
    document.getElementById('ep-sobrenome').value = currentProfile.sobrenome || '';
    document.getElementById('ep-username').value = currentProfile.username || '';
    document.getElementById('ep-bio').value = currentProfile.bio || '';
    document.getElementById('ep-horario-ini').value = currentProfile.horarioInicio || '';
    document.getElementById('ep-horario-fim').value = currentProfile.horarioFim || '';
    document.getElementById('ep-materia-outra').value = '';

    const dias = currentProfile.dias || [];
    document.querySelectorAll('#ep-days .pill').forEach(p => {
      p.classList.toggle('selected', dias.includes(p.textContent.trim()));
    });

    const materias = currentProfile.materias || [];
    const padroes = [...document.querySelectorAll('#ep-subjects .pill')].map(p => p.textContent.trim());
    document.querySelectorAll('#ep-subjects .pill').forEach(p => {
      p.classList.toggle('selected', materias.includes(p.textContent.trim()));
    });
    const extras = materias.filter(m => !padroes.includes(m));
    if (extras.length) document.getElementById('ep-materia-outra').value = extras.join(', ');

    openModal('modal-edit-profile');
  }

  function saveProfile() {
    const nome = document.getElementById('ep-nome').value.trim();
    const sobrenome = document.getElementById('ep-sobrenome').value.trim();
    let username = document.getElementById('ep-username').value.trim();
    const bio = document.getElementById('ep-bio').value.trim();
    const horarioInicio = document.getElementById('ep-horario-ini').value;
    const horarioFim = document.getElementById('ep-horario-fim').value;

    if (!nome) { alert('O nome não pode ficar vazio.'); return; }
    if (!username) username = '@' + nome.toLowerCase().replace(/\s+/g, '');
    if (!username.startsWith('@')) username = '@' + username;

    const dias = [...document.querySelectorAll('#ep-days .pill.selected')].map(p => p.textContent.trim());
    const materias = [...document.querySelectorAll('#ep-subjects .pill.selected')].map(p => p.textContent.trim());
    const outras = document.getElementById('ep-materia-outra').value.trim();
    if (outras) outras.split(',').forEach(m => { m = m.trim(); if (m) materias.push(m); });

    db.collection('users').doc(currentUser.uid).update({
      nome, sobrenome, username, bio, dias, materias, horarioInicio, horarioFim
    }).then(() => {
      closeModal('modal-edit-profile');
      showToast('✅', 'Perfil atualizado!', 'Suas informações foram salvas.');
    }).catch(err => alert('Erro ao salvar: ' + err.message));
  }

  function finalizarBloco(materia) {
    if (!currentUser || !currentProfile) return;
    const today = new Date();
    const todayStr = dateStr(today);
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    const yesterdayStr = dateStr(yesterday);

    const studyLog = currentProfile.studyLog || {};
    const todayDone = studyLog[todayStr] || [];
    if (todayDone.includes(materia)) return;

    let novoStreak = currentProfile.streak || 0;
    const last = currentProfile.lastStudyDate;
    if (last === todayStr) {
      // já contabilizou o streak de hoje
    } else if (last === yesterdayStr) {
      novoStreak += 1;
    } else {
      novoStreak = 1;
    }

    db.collection('users').doc(currentUser.uid).update({
      ['studyLog.' + todayStr]: firebase.firestore.FieldValue.arrayUnion(materia),
      streak: novoStreak,
      lastStudyDate: todayStr
    }).then(() => showToast('✅', 'Bloco concluído!', 'Continue assim! 🔥'))
      .catch(err => alert('Erro: ' + err.message));
  }


  const studyMethods = {
    pomodoro:     { name: 'Pomodoro Clássico', focus: 25*60, brk: 5*60 },
    pomodoroLongo:{ name: 'Pomodoro Longo',    focus: 50*60, brk: 10*60 },
    flowtime:     { name: 'Foco Profundo (52/17)', focus: 52*60, brk: 17*60 },
    livre:        { name: 'Estudo Livre',      focus: 60*60, brk: 0 },
  };
  let currentMethod = 'pomodoro';
  let currentPhase = 'foco';
  let remaining = studyMethods[currentMethod].focus;
  let timerInterval = null;
  let timerRunning = false;

  function formatTime(s) {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  }

  function updateTimerDisplay() {
    const disp = document.getElementById('timer-display');
    const phaseEl = document.getElementById('timer-phase');
    if (!disp) return;
    disp.textContent = formatTime(remaining);
    phaseEl.textContent = currentPhase === 'foco' ? '🎯 foco' : '☕ pausa';
    document.getElementById('timer-circle').classList.toggle('running', timerRunning);
  }

  function selectMethod(key, el) {
    if (timerRunning) { pauseTimerInternal(); }
    currentMethod = key;
    currentPhase = 'foco';
    remaining = studyMethods[key].focus;
    document.querySelectorAll('.method-card').forEach(c => c.classList.remove('selected'));
    el.classList.add('selected');
    document.getElementById('timer-btn-toggle').textContent = 'iniciar';
    updateTimerDisplay();
  }

  function tick() {
    if (remaining > 0) {
      remaining--;
      updateTimerDisplay();
    } else {
      const m = studyMethods[currentMethod];
      if (currentMethod === 'livre') {
        pauseTimerInternal();
        showToast('🎉', 'Sessão concluída!', 'Ótimo trabalho! Hora de descansar um pouco.');
        return;
      }
      if (currentPhase === 'foco') {
        currentPhase = 'pausa';
        remaining = m.brk;
        showToast('☕', 'Hora da pausa!', 'Levante, alongue-se e descanse um pouco.');
      } else {
        currentPhase = 'foco';
        remaining = m.focus;
        showToast('🎯', 'Hora de focar!', 'Pausa terminada — volte para os estudos.');
      }
      updateTimerDisplay();
    }
  }

  function toggleTimer() {
    if (timerRunning) {
      pauseTimerInternal();
    } else {
      timerRunning = true;
      timerInterval = setInterval(tick, 1000);
      document.getElementById('timer-btn-toggle').textContent = 'pausar';
      updateTimerDisplay();
    }
  }

  function pauseTimerInternal() {
    timerRunning = false;
    clearInterval(timerInterval);
    const btn = document.getElementById('timer-btn-toggle');
    if (btn) btn.textContent = 'iniciar';
    updateTimerDisplay();
  }

  function resetTimer() {
    pauseTimerInternal();
    currentPhase = 'foco';
    remaining = studyMethods[currentMethod].focus;
    updateTimerDisplay();
  }

  function skipTimer() {
    const m = studyMethods[currentMethod];
    if (currentMethod === 'livre') { resetTimer(); return; }
    currentPhase = currentPhase === 'foco' ? 'pausa' : 'foco';
    remaining = currentPhase === 'foco' ? m.focus : m.brk;
    updateTimerDisplay();
  }


  const PALAVROES = ['porra','merda','caralho','puta','foda','fdp','cuzao','cuzão','arrombado','viado','bosta','idiota','imbecil','retardado'];

  function filtrarTexto(texto) {
    if (!texto) return texto;
    const filtroAtivo = !currentProfile || !currentProfile.config || currentProfile.config.filtroPalavroes !== false;
    if (!filtroAtivo) return texto;
    let resultado = texto;
    PALAVROES.forEach(p => {
      const re = new RegExp('\\b' + p + '\\w*', 'gi');
      resultado = resultado.replace(re, m => '*'.repeat(m.length));
    });
    return resultado;
  }

  function applyConfigToUI() {
    const cfg = (currentProfile && currentProfile.config) || {};
    const notif = document.getElementById('cfg-notif');
    const filtro = document.getElementById('cfg-filtro');
    const modoEscuro = document.getElementById('cfg-modo-escuro');
    const modoEscuroAtivo = cfg.modoEscuro !== false; // padrão = escuro
    if (notif) notif.checked = cfg.notificacoes !== false;
    if (filtro) filtro.checked = cfg.filtroPalavroes !== false;
    if (modoEscuro) modoEscuro.checked = modoEscuroAtivo;

    document.body.classList.toggle('light-theme', !modoEscuroAtivo);
  }

  function updateConfig(key, value) {
    if (!currentUser) return;
    db.collection('users').doc(currentUser.uid).update({ ['config.' + key]: value })
      .catch(err => alert('Erro ao salvar configuração: ' + err.message));
  }

  function confirmDeleteHistory() {
    if (confirm('Tem certeza que deseja excluir todo o histórico de conversas? Essa ação não pode ser desfeita.')) {
      showToast('🗑️', 'Histórico excluído', 'Todas as conversas foram removidas.');
    }
  }


