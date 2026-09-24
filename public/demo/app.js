// Cliente demo do tempo real (JS puro, sem build). NÃO é um frontend de produção: o access
// token fica no localStorage apenas para sobreviver a um reload da página.
(() => {
  'use strict';

  const TOKEN_KEY = 'rtm-demo-token';
  const USER_KEY = 'rtm-demo-user';
  const TYPING_RENEW_MS = 1000;

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
  };

  async function api(method, path, body) {
    const response = await fetch(`/api${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
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

  function participantName(userId) {
    const participant = state.current?.participants.find((p) => p.id === userId);
    return participant ? (participant.displayName ?? participant.username) : 'alguém';
  }

  // ---------- sessão ----------

  function showChat() {
    $('login-view').hidden = true;
    $('chat-view').hidden = false;
    $('logout').hidden = false;
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

  $('logout').addEventListener('click', () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    state.socket?.disconnect();
    window.location.reload();
  });

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
    socket.on('disconnect', () => {
      $('connection').textContent = 'reconectando…';
      $('connection').classList.remove('online');
    });
    socket.on('connect_error', (error) => {
      $('connection').textContent = `erro: ${error.message}`;
      if (error.message === 'UNAUTHORIZED') {
        $('logout').click();
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
      if (state.current?.id === conversationId) {
        $('typing').textContent = isTyping ? `${participantName(userId)} está digitando…` : '';
      }
    });
    socket.on('conversation:new', () => void loadConversations());
    socket.on('conversation:updated', () => void loadConversations());
    socket.on('conversation:deleted', ({ conversationId }) => {
      if (state.current?.id === conversationId) {
        state.current = null;
        $('conversation').hidden = true;
      }
      void loadConversations();
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
    void loadConversations();

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
    const page = await api('GET', '/conversations?limit=100');
    state.conversations = page.items;
    const list = $('conversations');
    list.replaceChildren(
      ...page.items.map((conversation) => {
        const item = el('li', state.current?.id === conversation.id ? 'active' : '', conversationTitle(conversation));
        item.addEventListener('click', () => void openConversation(conversation.id));
        return item;
      })
    );
  }

  async function openConversation(conversationId) {
    state.current = await api('GET', `/conversations/${conversationId}`);
    const page = await api('GET', `/conversations/${conversationId}/messages`);
    state.messages = page.messages.reverse();
    state.nextCursor = page.nextCursor;
    $('conversation').hidden = false;
    $('conversation-title').textContent = conversationTitle(state.current);
    $('typing').textContent = '';
    renderMessages(true);
    markRead();
    void loadConversations();
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
          state.messages.splice(index, 1);
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
