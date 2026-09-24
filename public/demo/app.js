// Cliente demo do tempo real (JS puro, sem build). NÃO é um frontend de produção: o access
// token fica no localStorage apenas para sobreviver a um reload da página.
(() => {
  'use strict';

  const TOKEN_KEY = 'rtm-demo-token';
  const USER_KEY = 'rtm-demo-user';
  const TYPING_RENEW_MS = 1000;
  // Eventos em rajada (várias mensagens/conversas) não viram uma requisição cada: a lista é
  // recarregada via REST no máximo uma vez a cada 2s.
  const CONVERSATIONS_REFRESH_MS = 2000;

  const $ = (id) => document.getElementById(id);
  const state = {
    token: localStorage.getItem(TOKEN_KEY),
    user: JSON.parse(localStorage.getItem(USER_KEY) ?? 'null'),
    socket: null,
    conversations: [],
    current: null, // conversa aberta
    messages: [], // mensagens da conversa aberta, da mais antiga para a mais nova
    nextCursor: null,
    lastTypingAt: 0,
    typingTimer: null,
    lastRefreshAt: 0,
    refreshTimer: null,
    presence: new Map(), // userId → { state, lastSeenAt } (snapshot + presence:update)
    confirmedStatus: 'available', // último status confirmado pelo servidor
  };

  const PRESENCE_LABELS = { online: 'online', away: 'ausente', busy: 'ocupado', offline: 'offline' };

  // Sessão inválida (401 no REST, token expirado ou sessões revogadas): limpa e volta ao login.
  function endSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    state.socket?.disconnect();
    window.location.reload();
  }

  async function api(method, path, body) {
    const response = await fetch(`/api${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.status === 401 && state.token) {
      endSession();
      throw new Error('Sessão expirada');
    }
    if (response.status === 204) {
      return null;
    }
    const json = await response.json();
    if (!response.ok) {
      throw new Error(json.error?.message ?? json.message ?? `HTTP ${response.status}`);
    }
    return json.data;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) {
      node.className = className;
    }
    if (text !== undefined) {
      node.textContent = text; // nunca innerHTML com dados do usuário
    }
    return node;
  }

  function otherParticipant(conversation) {
    return conversation.participants.find((p) => p.id !== state.user.id);
  }

  function conversationTitle(conversation) {
    if (conversation.type === 'group') {
      return conversation.name ?? 'Grupo';
    }
    const other = otherParticipant(conversation);
    return other ? (other.displayName ?? other.username) : 'Conversa';
  }

  function presenceOf(userId) {
    return state.presence.get(userId) ?? { state: 'offline', lastSeenAt: null };
  }

  // "online", "ausente", "ocupado" ou "visto por último em 26/09 14:05" (vai para textContent).
  function presenceText(userId) {
    const { state: current, lastSeenAt } = presenceOf(userId);
    if (current !== 'offline' || !lastSeenAt) {
      return PRESENCE_LABELS[current];
    }
    const time = new Date(lastSeenAt).toLocaleString([], {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    return `visto por último em ${time}`;
  }

  function renderPresence() {
    renderConversations();
    const other = state.current?.type === 'direct' ? otherParticipant(state.current) : null;
    $('conversation-presence').textContent = other ? presenceText(other.id) : '';
  }

  function participantName(userId) {
    const participant = state.current?.participants.find((p) => p.id === userId);
    return participant ? (participant.displayName ?? participant.username) : 'alguém';
  }

  // ---------- sessão ----------

  function showChat() {
    $('login-view').hidden = true;
    $('chat-view').hidden = false;
    $('logout').hidden = false;
    $('status-label').hidden = false;
    $('message-search-form').hidden = false;
    $('me').textContent = state.user.displayName ?? state.user.username;
    connectSocket();
    void loadConversations();
  }

  $('login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    $('login-error').textContent = '';
    try {
      const data = await api('POST', '/auth/login', {
        email: form.get('email'),
        password: form.get('password'),
      });
      state.token = data.tokens.accessToken;
      state.user = data.user;
      localStorage.setItem(TOKEN_KEY, state.token);
      localStorage.setItem(USER_KEY, JSON.stringify(state.user));
      showChat();
    } catch (error) {
      $('login-error').textContent = error.message;
    }
  });

  $('logout').addEventListener('click', endSession);

  // Status manual (persiste entre reconexões); offline é só a desconexão.
  $('status').addEventListener('change', (event) => {
    const status = event.target.value;
    state.socket?.emit('presence:set', { status }, (ack) => {
      if (ack.ok) {
        state.confirmedStatus = status;
      } else {
        window.alert(`Falha ao mudar o status: ${ack.error.message}`);
        $('status').value = state.confirmedStatus;
      }
    });
  });

  // Mapeia estado da presença para valor do seletor (away/busy persistem, outros → available).
  function selectorValueFromState(presenceState) {
    return presenceState === 'away' || presenceState === 'busy' ? presenceState : 'available';
  }

  // Restaura o seletor de status com o valor do servidor após o snapshot (reconexão ou recarga).
  async function restoreStatusSelector() {
    try {
      const { items } = await api('GET', `/presence?userIds=${state.user.id}`);
      if (items.length > 0) {
        const { state: serverState } = items[0];
        const selectorValue = selectorValueFromState(serverState);
        $('status').value = selectorValue;
        state.confirmedStatus = selectorValue;
      }
    } catch {
      // Silenciosamente ignora falhas
    }
  }

  // ---------- socket ----------

  function connectSocket() {
    const socket = io({ auth: { token: state.token } });
    state.socket = socket;

    socket.on('connect', () => {
      $('connection').textContent = 'conectado';
      $('connection').classList.add('online');
      // Reconexão: o servidor restaura as rooms; o que chegou no intervalo vem pelo REST.
      if (state.current) {
        void openConversation(state.current.id);
      }
    });
    socket.on('disconnect', (reason) => {
      $('connection').classList.remove('online');
      // O servidor derruba o socket quando o token expira ou as sessões são revogadas; sem
      // refresh token na demo, a saída é logar de novo.
      if (reason === 'io server disconnect') {
        endSession();
        return;
      }
      $('connection').textContent = 'reconectando…';
    });
    socket.on('connect_error', (error) => {
      $('connection').textContent = `erro: ${error.message}`;
      if (error.message === 'UNAUTHORIZED') {
        endSession();
      }
    });

    socket.on('message:new', onMessageNew);
    socket.on('message:status', onMessageStatus);
    socket.on('message:deleted', ({ messageId }) => {
      const message = state.messages.find((m) => m.id === messageId);
      if (message) {
        message.content = null;
        message.deletedAt = new Date().toISOString();
        renderMessages();
      }
    });
    socket.on('typing:indicator', ({ conversationId, userId, isTyping }) => {
      // O próprio indicador (vindo de outra aba/dispositivo do mesmo usuário) é ignorado.
      if (userId === state.user.id) {
        return;
      }
      if (state.current?.id === conversationId) {
        $('typing').textContent = isTyping ? `${participantName(userId)} está digitando…` : '';
      }
    });
    // Presença: estado de quem o usuário observa ao conectar; depois, só as mudanças.
    socket.on('presence:snapshot', ({ states }) => {
      states.forEach((entry) => state.presence.set(entry.userId, entry));
      renderPresence();
      void restoreStatusSelector();
    });
    socket.on('presence:update', (entry) => {
      if (entry.userId === state.user.id) {
        // Status mudado em outra aba deste usuário.
        const selectorValue = selectorValueFromState(entry.state);
        $('status').value = selectorValue;
        state.confirmedStatus = selectorValue;
        return;
      }
      state.presence.set(entry.userId, entry);
      renderPresence();
    });
    socket.on('conversation:new', scheduleConversationsRefresh);
    socket.on('conversation:updated', scheduleConversationsRefresh);
    socket.on('conversation:deleted', ({ conversationId }) => {
      if (state.current?.id === conversationId) {
        state.current = null;
        $('conversation').hidden = true;
      }
      // Remoção local imediata; a lista completa vem no próximo refresh.
      state.conversations = state.conversations.filter((c) => c.id !== conversationId);
      renderConversations();
      scheduleConversationsRefresh();
    });
  }

  function onMessageNew(message) {
    const fromOther = message.senderId !== state.user.id;
    if (fromOther) {
      state.socket.emit('message:delivered', {
        conversationId: message.conversationId,
        messageId: message.id,
      });
    }
    bumpConversation(message.conversationId);

    if (state.current?.id !== message.conversationId) {
      return;
    }
    // Deduplica: o remetente também recebe message:new (e já tem a otimista pelo clientMessageId).
    const index = state.messages.findIndex(
      (m) =>
        m.id === message.id ||
        (message.clientMessageId !== null && m.clientMessageId === message.clientMessageId)
    );
    if (index === -1) {
      state.messages.push(message);
    } else {
      state.messages[index] = message;
    }
    renderMessages();
    if (fromOther) {
      markRead();
    }
  }

  function onMessageStatus(status) {
    if (state.current?.id !== status.conversationId) {
      return;
    }
    if (status.type === 'delivered') {
      const message = state.messages.find((m) => m.id === status.messageId);
      message?.status.deliveredTo.push({ userId: status.userId, at: status.at });
    } else {
      const upTo = state.messages.findIndex((m) => m.id === status.upToMessageId);
      state.messages.slice(0, upTo + 1).forEach((m) => {
        if (m.senderId !== status.userId && !m.status.readBy.some((r) => r.userId === status.userId)) {
          m.status.readBy.push({ userId: status.userId, at: status.at });
        }
      });
    }
    renderMessages();
  }

  // ---------- conversas ----------

  async function loadConversations() {
    state.lastRefreshAt = Date.now();
    const page = await api('GET', '/conversations?limit=100');
    state.conversations = page.items;
    renderConversations();
    void loadMissingPresence();
  }

  // Parceiros 1:1 que o snapshot não trouxe (ex.: conversa criada depois de conectar).
  async function loadMissingPresence() {
    const ids = state.conversations
      .filter((conversation) => conversation.type === 'direct')
      .map((conversation) => otherParticipant(conversation)?.id)
      .filter((id) => id && !state.presence.has(id))
      .slice(0, 100);
    if (ids.length === 0) {
      return;
    }
    const { items } = await api('GET', `/presence?userIds=${ids.join(',')}`);
    items.forEach((entry) => state.presence.set(entry.userId, entry));
    renderPresence();
  }

  function renderConversations() {
    $('conversations').replaceChildren(
      ...state.conversations.map((conversation) => {
        const item = el('li', state.current?.id === conversation.id ? 'active' : '');
        const other = conversation.type === 'direct' ? otherParticipant(conversation) : null;
        if (other) {
          const dot = el('span', `dot ${presenceOf(other.id).state}`);
          dot.title = presenceText(other.id);
          item.append(dot);
        }
        item.append(el('span', '', conversationTitle(conversation)));
        item.addEventListener('click', () => void openConversation(conversation.id));
        return item;
      })
    );
  }

  // No máximo um GET /conversations a cada CONVERSATIONS_REFRESH_MS (o último evento da rajada
  // sempre é refletido: o refresh atrasado busca o estado mais recente).
  function scheduleConversationsRefresh() {
    if (state.refreshTimer !== null) {
      return;
    }
    const wait = Math.max(0, state.lastRefreshAt + CONVERSATIONS_REFRESH_MS - Date.now());
    state.refreshTimer = setTimeout(() => {
      state.refreshTimer = null;
      void loadConversations();
    }, wait);
  }

  // Mensagem nova: sobe a conversa para o topo localmente, sem ir ao servidor; conversa
  // desconhecida (ainda não listada) agenda um refresh.
  function bumpConversation(conversationId) {
    const index = state.conversations.findIndex((c) => c.id === conversationId);
    if (index === -1) {
      scheduleConversationsRefresh();
      return;
    }
    const [conversation] = state.conversations.splice(index, 1);
    state.conversations.unshift(conversation);
    renderConversations();
  }

  async function openConversation(conversationId) {
    state.current = await api('GET', `/conversations/${conversationId}`);
    const page = await api('GET', `/conversations/${conversationId}/messages`);
    state.messages = page.messages.reverse();
    state.nextCursor = page.nextCursor;
    $('conversation').hidden = false;
    $('conversation-title').textContent = conversationTitle(state.current);
    renderPresence();
    $('typing').textContent = '';
    renderMessages(true);
    markRead();
    // Conversa recém-criada (busca de usuário) ainda não está na lista local.
    if (!state.conversations.some((c) => c.id === conversationId)) {
      scheduleConversationsRefresh();
    }
  }

  $('load-more').addEventListener('click', async () => {
    const page = await api(
      'GET',
      `/conversations/${state.current.id}/messages?before=${state.nextCursor}`
    );
    state.messages = [...page.messages.reverse(), ...state.messages];
    state.nextCursor = page.nextCursor;
    renderMessages();
  });

  $('search-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const query = new FormData(event.target).get('query');
    const users = await api('GET', `/users/search?query=${encodeURIComponent(query)}`);
    $('search-results').replaceChildren(
      ...users.map((user) => {
        const item = el('li', '', `+ ${user.displayName ?? user.username}`);
        item.addEventListener('click', async () => {
          const conversation = await api('POST', '/conversations/direct', { userId: user.id });
          $('search-results').replaceChildren();
          await openConversation(conversation.id);
        });
        return item;
      })
    );
  });

  // ---------- busca de mensagens ----------

  // Nome de quem enviou: só os já conhecidos pelas conversas carregadas (sem ir ao servidor).
  function knownUserName(userId) {
    if (userId === state.user.id) {
      return 'você';
    }
    for (const conversation of state.conversations) {
      const participant = conversation.participants.find((p) => p.id === userId);
      if (participant) {
        return participant.displayName ?? participant.username;
      }
    }
    return 'alguém';
  }

  function renderSearchResults({ items, total, tookMs }) {
    $('message-search').hidden = false;
    $('message-search-summary').textContent = `${total} resultado(s) · ${tookMs} ms`;
    $('message-search-results').replaceChildren(
      ...items.map(({ message, highlights }) => {
        const item = el('li');
        const conversation = state.conversations.find((c) => c.id === message.conversationId);
        const time = new Date(message.createdAt).toLocaleString([], {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        });
        const where = conversation ? conversationTitle(conversation) : 'Conversa';
        item.append(el('p', 'search-meta', `${where} · ${knownUserName(message.senderId)} · ${time}`));
        const fragment = el('p', 'fragment');
        if (highlights.length > 0) {
          // ÚNICO innerHTML da demo: o fragmento vem do Elasticsearch com encoder html (o texto do
          // usuário chega escapado) e só as tags <mark> são HTML de verdade.
          fragment.innerHTML = highlights.join(' … ');
        } else {
          fragment.textContent = message.content?.text ?? '';
        }
        item.append(fragment);
        item.addEventListener('click', () => void openConversation(message.conversationId));
        return item;
      })
    );
  }

  $('message-search-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const q = String(new FormData(event.target).get('q') ?? '').trim();
    if (!q) {
      return;
    }
    try {
      renderSearchResults(await api('GET', `/search/messages?q=${encodeURIComponent(q)}&limit=50`));
    } catch (error) {
      $('message-search').hidden = false;
      $('message-search-summary').textContent = `Falha na busca: ${error.message}`;
      $('message-search-results').replaceChildren();
    }
  });

  $('message-search-close').addEventListener('click', () => {
    $('message-search').hidden = true;
  });

  // ---------- mensagens ----------

  function ticks(message) {
    const others = state.current.participants.length - 1;
    if (message.status.readBy.length >= others) {
      return ['✓✓', 'ticks read'];
    }
    if (message.status.deliveredTo.length >= others) {
      return ['✓✓', 'ticks'];
    }
    return ['✓', 'ticks'];
  }

  function renderMessages(scrollToEnd = false) {
    const list = $('messages');
    const atBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 10;
    list.replaceChildren(
      ...state.messages.map((message) => {
        const mine = message.senderId === state.user.id;
        const classes = [mine ? 'mine' : '', message.pending ? 'pending' : '', message.deletedAt ? 'deleted' : ''];
        const item = el('li', classes.join(' ').trim());
        item.append(el('span', '', message.deletedAt ? 'mensagem apagada' : message.content.text));
        const time = new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        item.append(el('span', 'meta', time));
        if (mine && !message.pending) {
          const [symbol, className] = ticks(message);
          item.append(el('span', className, symbol));
        }
        return item;
      })
    );
    $('load-more').hidden = state.nextCursor === null;
    if (scrollToEnd || atBottom) {
      list.scrollTop = list.scrollHeight;
    }
  }

  function markRead() {
    const lastFromOthers = [...state.messages].reverse().find((m) => m.senderId !== state.user.id && !m.pending);
    if (lastFromOthers && document.visibilityState === 'visible') {
      state.socket.emit('message:read', {
        conversationId: state.current.id,
        messageId: lastFromOthers.id,
      });
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (state.current) {
      markRead();
    }
  });

  $('message-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const input = event.target.elements.text;
    const text = input.value.trim();
    if (!text || !state.current) {
      return;
    }
    input.value = '';
    stopTyping();

    const clientMessageId = crypto.randomUUID();
    const optimistic = {
      id: `pending-${clientMessageId}`,
      clientMessageId,
      senderId: state.user.id,
      conversationId: state.current.id,
      content: { type: 'text', text },
      createdAt: new Date().toISOString(),
      deletedAt: null,
      status: { deliveredTo: [], readBy: [] },
      pending: true,
    };
    state.messages.push(optimistic);
    renderMessages(true);

    state.socket.emit(
      'message:send',
      { conversationId: state.current.id, text, clientMessageId },
      (ack) => {
        const index = state.messages.findIndex((m) => m.clientMessageId === clientMessageId);
        if (ack.ok) {
          if (index !== -1) {
            state.messages[index] = ack.data;
          }
        } else {
          // index -1 (a otimista já saiu, ex.: conversa trocada): splice(-1, 1) apagaria a última.
          if (index !== -1) {
            state.messages.splice(index, 1);
          }
          window.alert(`Falha ao enviar: ${ack.error.message}`);
        }
        renderMessages();
      }
    );
  });

  // ---------- digitação (apenas 1:1) ----------

  function stopTyping() {
    if (state.typingTimer !== null) {
      clearTimeout(state.typingTimer);
      state.typingTimer = null;
      state.lastTypingAt = 0;
      state.socket.emit('typing:stop', { conversationId: state.current.id });
    }
  }

  $('message-form').elements.text.addEventListener('input', () => {
    if (!state.current || state.current.type !== 'direct') {
      return;
    }
    const now = Date.now();
    if (now - state.lastTypingAt > TYPING_RENEW_MS) {
      state.lastTypingAt = now;
      state.socket.emit('typing:start', { conversationId: state.current.id });
    }
    clearTimeout(state.typingTimer);
    state.typingTimer = setTimeout(stopTyping, 2 * TYPING_RENEW_MS);
  });

  if (state.token && state.user) {
    showChat();
  }
})();
