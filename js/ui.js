/**
 * ============================================
 * ui.js
 * Funcionalidad del chatbot - UI, sesiones,
 * burbujas, contexto, toolbars y acciones
 * Proyecto: Mirexa AI Chatbot
 * ============================================
 */

// ============================================
// CONSTANTES DE CONFIGURACIÓN
// ============================================

/** @constant {number} Máximo de mensajes en contexto */
const MAX_CONTEXT_MESSAGES = 15;

/** @constant {string} Clave para localStorage */
const STORAGE_KEY = 'mirexa_chat_sessions';

/** @constant {string} Título por defecto para nueva sesión */
const DEFAULT_SESSION_TITLE = 'Nuevo Chat';

// ============================================
// ESTADO GLOBAL DE LA APLICACIÓN
// ============================================

/**
 * @typedef {Object} Message
 * @property {string} id - Identificador único
 * @property {'user' | 'bot'} role - Rol del mensaje
 * @property {string} content - Contenido del mensaje
 * @property {number} timestamp - Marca de tiempo
 */

/**
 * @typedef {Object} Session
 * @property {string} id - Identificador único de sesión
 * @property {string} title - Título descriptivo
 * @property {Message[]} messages - Mensajes de la sesión
 * @property {number} createdAt - Fecha de creación
 * @property {number} updatedAt - Última actualización
 */

/** @type {Session[]} Todas las sesiones de chat */
let chatSessions = [];

/** @type {string} ID de la sesión activa actual */
let activeSessionId = null;

/** @type {AbortController|null} Controlador para cancelar streaming */
let currentStreamController = null;

/** @type {boolean} Indica si el bot está generando respuesta */
let isBotGenerating = false;

// ============================================
// UTILIDADES GENERALES
// ============================================

/**
 * Genera un ID único para sesiones y mensajes
 * @returns {string} ID único
 */
function generateId() {
  return `id_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Formatea una fecha para mostrar en timestamps
 * @param {number} timestamp - Marca de tiempo en milisegundos
 * @returns {string} Etiqueta descriptiva (Hoy, Ayer, etc.)
 */
function formatTimestamp(timestamp) {
  const now = new Date();
  const date = new Date(timestamp);
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Hoy';
  if (diffDays === 1) return 'Ayer';
  if (diffDays <= 7) return `Hace ${diffDays} días`;
  if (diffDays <= 30) {
    const weeks = Math.floor(diffDays / 7);
    return `Hace ${weeks} ${weeks === 1 ? 'semana' : 'semanas'}`;
  }
  if (diffDays <= 365) {
    const months = Math.floor(diffDays / 30);
    return `Hace ${months} ${months === 1 ? 'mes' : 'meses'}`;
  }
  const years = Math.floor(diffDays / 365);
  return `Hace ${years} ${years === 1 ? 'año' : 'años'}`;
}

/**
 * Genera un título automático basado en el primer mensaje del usuario
 * @param {string} content - Contenido del primer mensaje
 * @returns {string} Título truncado
 */
function generateSessionTitle(content) {
  const cleanText = content.trim().replace(/\s+/g, ' ');
  return cleanText.length > 50 ? cleanText.substring(0, 47) + '...' : cleanText;
}

// ============================================
// GESTIÓN DE ALMACENAMIENTO (localStorage)
// ============================================

/**
 * Guarda todas las sesiones en localStorage
 */
function saveSessionsToStorage() {
  // Si "No guardar historial" está activado, no persistir
  if (typeof isNoHistoryEnabled === 'function' && isNoHistoryEnabled()) {
    return;
  }
  
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chatSessions));
  } catch (error) {
    console.error('Error guardando sesiones en localStorage:', error);
  }
}

/**
 * Carga las sesiones desde localStorage
 * @returns {Session[]} Sesiones almacenadas
 */
function loadSessionsFromStorage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Error cargando sesiones de localStorage:', error);
    return [];
  }
}

// ============================================
// GESTIÓN DE SESIONES
// ============================================

/**
 * Crea una nueva sesión vacía
 * @param {string} [title] - Título de la sesión
 * @returns {Session} Nueva sesión creada
 */
function createSession(title = DEFAULT_SESSION_TITLE) {
  const session = {
    id: generateId(),
    title: title,
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  chatSessions.unshift(session);
  saveSessionsToStorage();
  return session;
}

/**
 * Establece una sesión como activa
 * @param {string} sessionId - ID de la sesión a activar
 */
function setActiveSession(sessionId) {
  activeSessionId = sessionId;
  renderActiveSession();
  renderSidebarChips();
}

/**
 * Obtiene la sesión activa actual
 * @returns {Session|undefined} Sesión activa
 */
function getActiveSession() {
  return chatSessions.find(session => session.id === activeSessionId);
}

/**
 * Elimina una sesión y sus datos
 * @param {string} sessionId - ID de la sesión a eliminar
 */
function deleteSession(sessionId) {
  chatSessions = chatSessions.filter(session => session.id !== sessionId);
  saveSessionsToStorage();

  if (activeSessionId === sessionId) {
    if (chatSessions.length > 0) {
      setActiveSession(chatSessions[0].id);
    } else {
      const newSession = createSession();
      setActiveSession(newSession.id);
    }
  }
}

/**
 * Actualiza el título de una sesión
 * @param {string} sessionId - ID de la sesión
 * @param {string} title - Nuevo título
 */
function updateSessionTitle(sessionId, title) {
  const session = chatSessions.find(s => s.id === sessionId);
  if (session) {
    session.title = title;
    session.updatedAt = Date.now();
    saveSessionsToStorage();
  }
}

// ============================================
// SISTEMA DE CONTEXTO DEL BOT
// ============================================

/**
 * Obtiene el contexto de mensajes para enviar a la API
 * Limita a MAX_CONTEXT_MESSAGES, eliminando los más antiguos si es necesario
 * @param {Session} session - Sesión activa
 * @returns {Array<{role: string, content: string}>} Contexto para la API
 */
function getContextMessages(session) {
  let messages = [...session.messages];

  // Limitar a MAX_CONTEXT_MESSAGES totales
  if (messages.length > MAX_CONTEXT_MESSAGES) {
    messages = messages.slice(messages.length - MAX_CONTEXT_MESSAGES);
  }

  return messages.map(msg => ({
    role: msg.role === 'user' ? 'user' : 'assistant',
    content: msg.content
  }));
}

// ============================================
// RENDERIZADO DE BURBUJAS
// ============================================

/**
 * Crea una burbuja de mensaje de usuario en el DOM
 * @param {string} content - Contenido del mensaje
 * @param {string} messageId - ID del mensaje
 * @returns {HTMLElement} Elemento DOM de la burbuja
 */
function createUserBubble(content, messageId) {
  const wrapper = document.createElement('div');
  wrapper.className = 'message-wrapper message-wrapper--user';
  wrapper.dataset.messageId = messageId;
  // Convertir saltos de línea en <br> para respetar el formato del usuario
  const formattedContent = escapeHTML(content).replace(/\n/g, '<br>');
  
  wrapper.innerHTML = `
    <div class="message-bubble message-bubble--user">
      <p>${formattedContent}</p>
    </div>
    <div class="message-actions message-actions--user">
      <button class="message-actions__btn" aria-label="Editar mensaje" title="Editar" data-action="edit">
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" data-iconid="499600" data-svgname="Edit">
          <path fill-rule="evenodd" clip-rule="evenodd" d="M13.1739 3.5968C13.8662 3.2047 14.686 3.10369 15.4528 3.31598C15.7928 3.41011 16.0833 3.57409 16.3571 3.7593C16.6172 3.9352 16.9155 4.16808 17.2613 4.43799L17.3117 4.47737C17.6575 4.74728 17.9559 4.98016 18.1897 5.18977C18.4358 5.41046 18.6654 5.65248 18.8393 5.95945C19.2314 6.65177 19.3324 7.47151 19.1201 8.23831C19.026 8.5783 18.862 8.86883 18.6768 9.14267C18.5009 9.40276 18.268 9.70112 17.998 10.0469L10.8953 19.1462C10.8773 19.1692 10.8596 19.1919 10.8421 19.2144C10.5087 19.6419 10.2566 19.9651 9.9445 20.2306C9.68036 20.4553 9.38811 20.6447 9.07512 20.794C8.70535 20.9704 8.30733 21.0685 7.78084 21.1983C7.75324 21.2051 7.72528 21.212 7.69696 21.219L5.57214 21.7435C5.42499 21.7799 5.25702 21.8215 5.10885 21.8442C4.94367 21.8696 4.68789 21.8926 4.40539 21.8022C4.06579 21.6934 3.77603 21.4672 3.58809 21.1642C3.43175 20.9121 3.39197 20.6584 3.3765 20.492C3.36262 20.3427 3.36213 20.1697 3.3617 20.0181C3.36167 20.0087 3.36165 19.9994 3.36162 19.9902L3.35475 17.8295C3.35465 17.8003 3.35455 17.7715 3.35445 17.7431C3.3525 17.2009 3.35103 16.7909 3.4324 16.3894C3.50128 16.0495 3.61406 15.72 3.76791 15.4093C3.94967 15.0421 4.20204 14.7191 4.53586 14.2918C4.55336 14.2694 4.57109 14.2467 4.58905 14.2237L11.6918 5.12435C11.9617 4.77856 12.1946 4.48019 12.4042 4.2464C12.6249 4.00025 12.8669 3.77065 13.1739 3.5968ZM14.9191 5.24347C14.6635 5.17271 14.3903 5.20638 14.1595 5.33708C14.1203 5.35928 14.0459 5.41135 13.8934 5.5815C13.7348 5.75836 13.5438 6.00211 13.2487 6.38018L16.4018 8.84145C16.697 8.46338 16.887 8.21896 17.0201 8.02221C17.1482 7.83291 17.1806 7.74808 17.1926 7.70467C17.2634 7.44907 17.2297 7.17583 17.099 6.94505C17.0768 6.90586 17.0247 6.83145 16.8546 6.6789C16.6777 6.52033 16.434 6.32938 16.0559 6.03426C15.6778 5.73914 15.4334 5.54904 15.2367 5.41597C15.0474 5.28794 14.9625 5.25549 14.9191 5.24347ZM15.1712 10.418L12.0181 7.95674L6.16561 15.4543C5.75585 15.9792 5.6403 16.135 5.56031 16.2966C5.48339 16.452 5.42699 16.6167 5.39256 16.7866C5.35675 16.9633 5.35262 17.1572 5.35474 17.8231L5.36082 19.7357L7.2176 19.2773C7.86411 19.1177 8.05119 19.0666 8.21391 18.9889C8.37041 18.9143 8.51653 18.8196 8.64861 18.7072C8.78593 18.5904 8.90897 18.4405 9.31872 17.9156L15.1712 10.418ZM12 21C12 20.4477 12.4477 20 13 20H20C20.5523 20 21 20.4477 21 21C21 21.5523 20.5523 22 20 22H13C12.4477 22 12 21.5523 12 21Z" fill="currentColor"></path>
        </svg>
      </button>
      <button class="message-actions__btn" aria-label="Copiar mensaje" title="Copiar" data-action="copy">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" data-iconid="473858" data-svgname="Copy">
          <g id="style=stroke">
            <g id="copy">
              <path id="rec (Stroke)" fill-rule="evenodd" clip-rule="evenodd" d="M6.25 5.25C6.25 2.50265 8.43733 0.25 11.1667 0.25H17.8333C20.5627 0.25 22.75 2.50265 22.75 5.25V13.75C22.75 16.4974 20.5627 18.75 17.8333 18.75C17.4191 18.75 17.0833 18.4142 17.0833 18C17.0833 17.5858 17.4191 17.25 17.8333 17.25C19.7064 17.25 21.25 15.6971 21.25 13.75V5.25C21.25 3.30293 19.7064 1.75 17.8333 1.75H11.1667C9.29363 1.75 7.75 3.30293 7.75 5.25C7.75 5.66421 7.41421 6 7 6C6.58579 6 6.25 5.66421 6.25 5.25Z" fill="currentColor"></path>
              <path id="rec (Stroke)_2" fill-rule="evenodd" clip-rule="evenodd" d="M1.25 10.25C1.25 7.50265 3.43733 5.25 6.16667 5.25H12.8333C15.5627 5.25 17.75 7.50265 17.75 10.25V18.75C17.75 21.4974 15.5627 23.75 12.8333 23.75H6.16667C3.43733 23.75 1.25 21.4974 1.25 18.75V10.25ZM6.16667 6.75C4.29363 6.75 2.75 8.30293 2.75 10.25V18.75C2.75 20.6971 4.29363 22.25 6.16667 22.25H12.8333C14.7064 22.25 16.25 20.6971 16.25 18.75V10.25C16.25 8.30293 14.7064 6.75 12.8333 6.75H6.16667Z" fill="currentColor"></path>
            </g>
          </g>
        </svg>
      </button>
    </div>
  `;

  // Event listeners para botones de acción
  const editBtn = wrapper.querySelector('[data-action="edit"]');
  const copyBtn = wrapper.querySelector('[data-action="copy"]');

  editBtn.addEventListener('click', () => handleEditMessage(messageId));
  copyBtn.addEventListener('click', () => handleCopyMessage(content));

  return wrapper;
}

/**
 * Crea una burbuja de mensaje del bot en el DOM
 * @param {string} content - Contenido del mensaje (Markdown)
 * @param {string} messageId - ID del mensaje
 * @returns {HTMLElement} Elemento DOM de la burbuja
 */
function createBotBubble(content, messageId) {
  const wrapper = document.createElement('div');
  wrapper.className = 'message-wrapper message-wrapper--bot';
  wrapper.dataset.messageId = messageId;

  wrapper.innerHTML = `
    <div class="message-bubble message-bubble--bot">
      <div class="bot-content">${parseMarkdown(content)}</div>
    </div>
    <div class="message-actions message-actions--bot">
      <button class="message-actions__btn" aria-label="Copiar mensaje" title="Copiar" data-action="copy">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" data-iconid="473858" data-svgname="Copy">
          <g id="style=stroke">
            <g id="copy">
              <path id="rec (Stroke)" fill-rule="evenodd" clip-rule="evenodd" d="M6.25 5.25C6.25 2.50265 8.43733 0.25 11.1667 0.25H17.8333C20.5627 0.25 22.75 2.50265 22.75 5.25V13.75C22.75 16.4974 20.5627 18.75 17.8333 18.75C17.4191 18.75 17.0833 18.4142 17.0833 18C17.0833 17.5858 17.4191 17.25 17.8333 17.25C19.7064 17.25 21.25 15.6971 21.25 13.75V5.25C21.25 3.30293 19.7064 1.75 17.8333 1.75H11.1667C9.29363 1.75 7.75 3.30293 7.75 5.25C7.75 5.66421 7.41421 6 7 6C6.58579 6 6.25 5.66421 6.25 5.25Z" fill="currentColor"></path>
              <path id="rec (Stroke)_2" fill-rule="evenodd" clip-rule="evenodd" d="M1.25 10.25C1.25 7.50265 3.43733 5.25 6.16667 5.25H12.8333C15.5627 5.25 17.75 7.50265 17.75 10.25V18.75C17.75 21.4974 15.5627 23.75 12.8333 23.75H6.16667C3.43733 23.75 1.25 21.4974 1.25 18.75V10.25ZM6.16667 6.75C4.29363 6.75 2.75 8.30293 2.75 10.25V18.75C2.75 20.6971 4.29363 22.25 6.16667 22.25H12.8333C14.7064 22.25 16.25 20.6971 16.25 18.75V10.25C16.25 8.30293 14.7064 6.75 12.8333 6.75H6.16667Z" fill="currentColor"></path>
            </g>
          </g>
        </svg>
      </button>
      <button class="message-actions__btn" aria-label="Generar nueva respuesta" title="Regenerar" data-action="regenerate">
        <svg fill="currentColor" width="17" height="17" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" data-iconid="305556" data-svgname="Refresh outline">
          <g data-name="Layer 2">
            <g data-name="refresh">
              <rect width="24" height="24" opacity="0"></rect>
                <path d="M20.3 13.43a1 1 0 0 0-1.25.65A7.14 7.14 0 0 1 12.18 19 7.1 7.1 0 0 1 5 12a7.1 7.1 0 0 1 7.18-7 7.26 7.26 0 0 1 4.65 1.67l-2.17-.36a1 1 0 0 0-1.15.83 1 1 0 0 0 .83 1.15l4.24.7h.17a1 1 0 0 0 .34-.06.33.33 0 0 0 .1-.06.78.78 0 0 0 .2-.11l.09-.11c0-.05.09-.09.13-.15s0-.1.05-.14a1.34 1.34 0 0 0 .07-.18l.75-4a1 1 0 0 0-2-.38l-.27 1.45A9.21 9.21 0 0 0 12.18 3 9.1 9.1 0 0 0 3 12a9.1 9.1 0 0 0 9.18 9A9.12 9.12 0 0 0 21 14.68a1 1 0 0 0-.7-1.25z"></path>
            </g>
          </g>
        </svg>
      </button>
      <button class="message-actions__btn" aria-label="Compartir mensaje" title="Compartir" data-action="share">
        <svg width="20" height="20" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" data-iconid="326484" data-svgname="Arrow redo outline"><path d="M448,256,272,88v96C103.57,184,64,304.77,64,424c48.61-62.24,91.6-96,208-96v96Z" style="fill:none;stroke:currentColor;stroke-linejoin:round;stroke-width:32px"></path></svg>
      </button>
      <button class="message-actions__btn" aria-label="Escuchar mensaje" title="Texto a voz" data-action="tts">
        <span class="message-actions__icon-wrap">
          <svg class="message-actions__icon-svg" fill="currentColor" width="26" height="26" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" data-iconid="379309" data-svgname="Voice">
            <path fill-rule="evenodd" d="M8,2 C8.55228475,2 9,2.44771525 9,3 L9,21 C9,21.5522847 8.55228475,22 8,22 C7.44771525,22 7,21.5522847 7,21 L7,3 C7,2.44771525 7.44771525,2 8,2 Z M20,4 C20.5522847,4 21,4.44771525 21,5 L21,19 C21,19.5522847 20.5522847,20 20,20 C19.4477153,20 19,19.5522847 19,19 L19,5 C19,4.44771525 19.4477153,4 20,4 Z M12,6 C12.5522847,6 13,6.44771525 13,7 L13,17 C13,17.5522847 12.5522847,18 12,18 C11.4477153,18 11,17.5522847 11,17 L11,7 C11,6.44771525 11.4477153,6 12,6 Z M4,9 C4.55228475,9 5,9.44771525 5,10 L5,14 C5,14.5522847 4.55228475,15 4,15 C3.44771525,15 3,14.5522847 3,14 L3,10 C3,9.44771525 3.44771525,9 4,9 Z M16,10 C16.5522847,10 17,10.4477153 17,11 L17,13 C17,13.5522847 16.5522847,14 16,14 C15.4477153,14 15,13.5522847 15,13 L15,11 C15,10.4477153 15.4477153,10 16,10 Z"></path>
          </svg>
          <span class="message-actions__spinner" style="display:none;"></span>
        </span>
      </button>
    </div>
  `;

  // Event listeners para botones de acción
  // IMPORTANTE: Todos obtienen el contenido del DOM en el momento del clic,
  // no del closure, para funcionar correctamente con streaming
  const copyBtn = wrapper.querySelector('[data-action="copy"]');
  const regenerateBtn = wrapper.querySelector('[data-action="regenerate"]');
  const shareBtn = wrapper.querySelector('[data-action="share"]');
  const ttsBtn = wrapper.querySelector('[data-action="tts"]');

  copyBtn.addEventListener('click', () => {
    const currentContent = getBotBubbleContent(wrapper);
    handleCopyMessage(currentContent);
  });

  regenerateBtn.addEventListener('click', () => {
    handleRegenerateMessage(messageId);
  });

  shareBtn.addEventListener('click', () => {
    const currentContent = getBotBubbleContent(wrapper);
    handleShareMessage(currentContent);
  });

  ttsBtn.addEventListener('click', (event) => {
    const currentContent = getBotBubbleContent(wrapper);
    handleTextToSpeech(currentContent, event);
  });

  return wrapper;
}

/**
 * Obtiene el contenido textual actual de una burbuja del bot
 * Extrae el texto del DOM, no del closure
 * @param {HTMLElement} wrapper - El elemento wrapper de la burbuja
 * @returns {string} Contenido textual limpio
 */
function getBotBubbleContent(wrapper) {
  const contentDiv = wrapper.querySelector('.bot-content');
  if (!contentDiv) return '';
  return contentDiv.textContent || contentDiv.innerText || '';
}

/**
 * Crea un spinner animado de espera para el bot
 * @returns {HTMLElement} Elemento DOM del spinner
 */
function createBotSpinner() {
  const wrapper = document.createElement('div');
  wrapper.className = 'message-wrapper message-wrapper--bot';
  wrapper.dataset.spinner = 'true';

  wrapper.innerHTML = `
    <div class="message-bubble message-bubble--bot">
      <div class="bot-spinner">
        <span class="bot-spinner__dot"></span>
        <span class="bot-spinner__dot"></span>
        <span class="bot-spinner__dot"></span>
      </div>
    </div>
    <div class="message-actions message-actions--bot" style="display: none;"></div>
  `;

  return wrapper;
}

/**
 * Renderiza la sesión activa en el contenedor de mensajes
 */
function renderActiveSession() {
  const session = getActiveSession();
  messagesContainer.innerHTML = '';

  if (!session || session.messages.length === 0) {
    showEmptyState();
    return;
  }

  hideEmptyState();

  session.messages.forEach(message => {
  let bubble;
  if (message.role === 'user') {
    bubble = createUserBubble(message.content, message.id);
  } else {
    bubble = createBotBubble(message.content, message.id);
    // Configurar code-wrappers y highlight.js en burbujas de bot renderizadas
    setupCodeCopyButtons(bubble);
    bubble.querySelectorAll('.code-wrapper__body pre code').forEach(block => {
      hljs.highlightElement(block);
    });
  }
  messagesContainer.appendChild(bubble);
});

  scrollToBottom();
}

/**
 * Muestra el estado vacío del chat
 */
function showEmptyState() {
  sidebarEmptyState.style.display = 'flex';
}

/**
 * Oculta el estado vacío del chat
 */
function hideEmptyState() {
  sidebarEmptyState.style.display = 'none';
}

/**
 * Hace scroll al final del contenedor de mensajes
 */
function scrollToBottom() {
  requestAnimationFrame(() => {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  });
}

// ============================================
// RENDERIZADO DEL SIDEBAR
// ============================================

/**
 * Renderiza los chips de sesiones en el sidebar
 */
function renderSidebarChips() {
  // Limpiar contenedor (excepto empty state)
  const existingGroups = chipsContainer.querySelectorAll('.sidebar__timestamp-group');
  existingGroups.forEach(group => group.remove());

  if (chatSessions.length === 0) {
    newChatSidebarBtn.style.display = 'inline-flex';
    return;
  }

  // Ocultar botón "Nuevo Chat" si hay sesiones con mensajes
  const hasAnyMessages = chatSessions.some(session => session.messages.length > 0);
  if (hasAnyMessages) {
    newChatSidebarBtn.style.display = 'none';
  } else {
    newChatSidebarBtn.style.display = 'inline-flex';
  }

  // Agrupar sesiones por timestamp
  const grouped = groupSessionsByTimestamp(chatSessions);

  Object.entries(grouped).forEach(([label, sessions]) => {
    const groupDiv = document.createElement('div');
    groupDiv.className = 'sidebar__timestamp-group';

    const timeLabel = document.createElement('time');
    timeLabel.className = 'sidebar__timestamp';
    timeLabel.textContent = label;
    timeLabel.setAttribute('datetime', new Date(sessions[0].updatedAt).toISOString());
    groupDiv.appendChild(timeLabel);

    const chatList = document.createElement('ul');
    chatList.className = 'sidebar__chat-list';

    sessions.forEach(session => {
      const chip = document.createElement('li');
      chip.className = 'sidebar__chat-chip';
      if (session.id === activeSessionId) {
        chip.classList.add('sidebar__chat-chip--active');
      }

      chip.innerHTML = `
        <span class="sidebar__chat-title">${escapeHTML(session.title)}</span>
      `;

      chip.addEventListener('click', () => {
        setActiveSession(session.id);
        closeSidebar();
      });

      chatList.appendChild(chip);
    });

    groupDiv.appendChild(chatList);
    chipsContainer.appendChild(groupDiv);
  });
}

/**
 * Agrupa sesiones por etiqueta de timestamp
 * @param {Session[]} sessions - Sesiones a agrupar
 * @returns {Object} Sesiones agrupadas por etiqueta
 */
function groupSessionsByTimestamp(sessions) {
  const grouped = {};

  sessions.forEach(session => {
    const label = formatTimestamp(session.updatedAt);
    if (!grouped[label]) {
      grouped[label] = [];
    }
    grouped[label].push(session);
  });

  return grouped;
}

// ============================================
// GESTIÓN DEL SIDEBAR
// ============================================

/**
 * Abre el sidebar
 */
function openSidebar() {
  sidebar.classList.add('is-open');
  sidebarOverlay.classList.add('is-visible');
  sidebarOverlay.setAttribute('aria-hidden', 'false');
}

/**
 * Cierra el sidebar
 */
function closeSidebar() {
  sidebar.classList.remove('is-open');
  sidebarOverlay.classList.remove('is-visible');
  sidebarOverlay.setAttribute('aria-hidden', 'true');
}

/**
 * Alterna la visibilidad del sidebar
 */
function toggleSidebar() {
  if (sidebar.classList.contains('is-open')) {
    closeSidebar();
  } else {
    openSidebar();
  }
}

// ============================================
// GESTIÓN DE MENSAJES
// ============================================

/**
 * Envía un mensaje del usuario y obtiene respuesta del bot
 * @param {string} content - Contenido del mensaje
 */
async function sendUserMessage(content) {
  if (!content.trim() || isBotGenerating) return;

  let session = getActiveSession();

// Si no hay sesión activa (primera vez del usuario), crear una nueva
if (!session) {
  session = createSession();
  activeSessionId = session.id;
  // No llamamos a setActiveSession() para evitar doble render
  // Solo asignamos el ID
  saveSessionsToStorage();
  renderSidebarChips();
  hideEmptyState();
}

  // Si es el primer mensaje, actualizar título automáticamente
  const isFirstMessage = session.messages.length === 0;
  if (isFirstMessage) {
    updateSessionTitle(session.id, generateSessionTitle(content));
    hideEmptyState();
    // Ocultar permanentemente botón "Nuevo Chat" del sidebar
    newChatSidebarBtn.style.display = 'none';
  }

  // Crear mensaje de usuario
  const userMessage = {
    id: generateId(),
    role: 'user',
    content: content,
    timestamp: Date.now()
  };

  session.messages.push(userMessage);
  session.updatedAt = Date.now();
  saveSessionsToStorage();
  
  // Actualizar visibilidad del botón compartir
  updateShareButtonVisibility();
  
  // Renderizar burbuja de usuario
  const userBubble = createUserBubble(content, userMessage.id);
  messagesContainer.appendChild(userBubble);
  scrollToBottom();

  // Limpiar textarea
  messageTextarea.value = '';
  messageTextarea.style.height = 'auto';
  updateSendButtonState();

  // Crear spinner del bot
  const spinner = createBotSpinner();
  messagesContainer.appendChild(spinner);
  scrollToBottom();

  // Obtener y renderizar respuesta del bot
  await fetchBotResponse(session, spinner);
}

/**
 * Obtiene respuesta del bot desde la API con streaming
 * @param {Session} session - Sesión activa
 * @param {HTMLElement} spinner - Elemento spinner a reemplazar
 */
async function fetchBotResponse(session, spinner) {
  isBotGenerating = true;

  // Crear AbortController para posible cancelación
  currentStreamController = new AbortController();

  try {
    const contextMessages = getContextMessages(session);

    // Crear burbuja del bot vacía
    const botMessageId = generateId();
    let botContent = '';
    let botBubble = null;
    let isFirstChunk = true;

    await callPollinationsAPI(
      contextMessages,
      // onChunk — llamado con cada fragmento de texto
      (chunk) => {
        botContent += chunk;

        if (isFirstChunk) {
          // Reemplazar spinner por burbuja real
          spinner.remove();
          botBubble = createBotBubble(botContent, botMessageId);
          // Ocultar acciones mientras se completa el stream
          const actionsDiv = botBubble.querySelector('.message-actions');
          if (actionsDiv) actionsDiv.style.display = 'none';
          messagesContainer.appendChild(botBubble);
          isFirstChunk = false;
        } else if (botBubble) {
          // Actualizar contenido de la burbuja existente
          const contentDiv = botBubble.querySelector('.bot-content');
          if (contentDiv) {
            contentDiv.innerHTML = parseMarkdown(botContent);
          }
        }
        scrollToBottom();
      },
      // options
      {
        signal: currentStreamController.signal
      }
    );

    // Stream completado
    // Guardar mensaje del bot
    const botMessage = {
      id: botMessageId,
      role: 'bot',
      content: botContent,
      timestamp: Date.now()
    };
    session.messages.push(botMessage);
    session.updatedAt = Date.now();
    saveSessionsToStorage();

    // Mostrar acciones del bot
    if (botBubble) {
      const actionsDiv = botBubble.querySelector('.message-actions');
      if (actionsDiv) actionsDiv.style.display = 'flex';

      // Configurar code-wrappers
      setupCodeCopyButtons(botBubble);

      // Highlight.js
      botBubble.querySelectorAll('.code-wrapper__body pre code').forEach(block => {
        hljs.highlightElement(block);
      });
    }

    // Si el stream terminó sin crear burbuja
    if (!botBubble && isFirstChunk) {
      spinner.remove();
      const emptyBubble = createBotBubble('_(Sin respuesta del modelo)_', botMessageId);
      messagesContainer.appendChild(emptyBubble);
    }

    // Actualizar sidebar
    renderSidebarChips();
    scrollToBottom();

  } catch (error) {
    console.error('Error obteniendo respuesta del bot:', error);

    // Remover spinner si aún existe
    if (spinner && spinner.parentNode) {
      spinner.remove();
    }

    // Mostrar mensaje de error
    if (error.name !== 'AbortError') {
      const errorBubble = createBotBubble(
        `>Error al obtener respuesta\n\n_${error.message}_`,
        generateId()
      );
      messagesContainer.appendChild(errorBubble);
      scrollToBottom();
    }
  } finally {
    isBotGenerating = false;
    currentStreamController = null;
  }
}

// ============================================
// ACCIONES DE BURBUJAS - BOT
// ============================================

/**
 * Copia un mensaje al portapapeles
 * @param {string} content - Contenido a copiar
 */
async function handleCopyMessage(content) {
  try {
    await navigator.clipboard.writeText(content);
    showToast('Copiado al portapapeles');
  } catch (error) {
    console.error('Error copiando al portapapeles:', error);
    showToast('No se pudo copiar');
  }
}

/**
 * Regenera la respuesta del bot para un mensaje específico
 * @param {string} messageId - ID del mensaje del bot a regenerar
 */
async function handleRegenerateMessage(messageId) {
  if (isBotGenerating) return;

  const session = getActiveSession();
  if (!session) return;

  // Encontrar índice del mensaje del bot
  const botMsgIndex = session.messages.findIndex(msg => msg.id === messageId);
  if (botMsgIndex === -1) return;

  // Verificar que haya un mensaje de usuario antes
  if (botMsgIndex === 0) return;

  // Eliminar todos los mensajes desde el bot hacia adelante (incluyendo el bot)
  // pero guardar el contenido del usuario previo para reenviar contexto
  session.messages = session.messages.slice(0, botMsgIndex);
  saveSessionsToStorage();

  // Re-renderizar sesión
  renderActiveSession();

  // Crear spinner y reenviar contexto
  const spinner = createBotSpinner();
  messagesContainer.appendChild(spinner);
  scrollToBottom();

  await fetchBotResponse(session, spinner);
}

/**
 * Comparte un mensaje individual del bot
 * @param {string} content - Contenido a compartir
 */
async function handleShareMessage(content) {
  try {
    await navigator.share({
      title: 'Respuesta de Mirexa AI',
      text: content
    });
  } catch (error) {
    if (error.name !== 'AbortError') {
      console.error('Error compartiendo mensaje:', error);
    }
  }
}

/**
 * Convierte texto a voz usando TTS
 * @param {string} text - Texto a convertir
 * @param {Event} event - Evento del clic para acceder al botón
 */
async function handleTextToSpeech(text, event) {
  const button = event.currentTarget;
  const iconSvg = button.querySelector('.message-actions__icon-svg');
  const spinnerSpan = button.querySelector('.message-actions__spinner');

  // Ocultar SVG, mostrar spinner
  if (iconSvg) iconSvg.style.display = 'none';
  if (spinnerSpan) {
    spinnerSpan.style.display = 'inline-block';
    spinnerSpan.style.width = '18px';
    spinnerSpan.style.height = '18px';
    spinnerSpan.style.border = '2px solid #777';
    spinnerSpan.style.borderTopColor = 'transparent';
    spinnerSpan.style.borderRadius = '50%';
    spinnerSpan.style.animation = 'spin 0.8s linear infinite';
  }
  button.disabled = true;

  try {
    const audioUrl = await generateSpeech(text);
    const audio = new Audio(audioUrl);
    await audio.play();

    audio.addEventListener('ended', () => {
      URL.revokeObjectURL(audioUrl);
    });

  } catch (error) {
    console.error('Error en TTS:', error);
    showToast('Texto a voz ha fallado');
  } finally {
    // Restaurar SVG, ocultar spinner
    if (iconSvg) iconSvg.style.display = '';
    if (spinnerSpan) {
      spinnerSpan.style.display = 'none';
      spinnerSpan.style.animation = '';
    }
    button.disabled = false;
  }
}
// ============================================
// ACCIONES DE BURBUJAS - USUARIO
// ============================================

/**
 * Edita un mensaje del usuario
 * @param {string} messageId - ID del mensaje a editar
 */
function handleEditMessage(messageId) {
  if (isBotGenerating) return;

  const session = getActiveSession();
  if (!session) return;

  // Encontrar índice del mensaje
  const msgIndex = session.messages.findIndex(msg => msg.id === messageId);
  if (msgIndex === -1) return;

  const message = session.messages[msgIndex];

  // Cargar contenido en textarea
  messageTextarea.value = message.content;
  messageTextarea.focus();
  updateSendButtonState();

  // Eliminar mensajes desde este punto en adelante
  session.messages = session.messages.slice(0, msgIndex);
  saveSessionsToStorage();
  renderActiveSession();

  // Solicitar al usuario que reenvíe el mensaje
  showToast('Mensaje cargado. Edítalo y reenvíalo.');
}

// ============================================
// COMPARTIR SESIÓN COMPLETA
// ============================================

/**
 * Comparte la sesión activa completa
 */
async function shareFullSession() {
  const session = getActiveSession();
  if (!session || session.messages.length === 0) return;

  // Formatear conversación como texto
  let shareText = `📝 Conversación con Mirexa AI\n\n`;
  session.messages.forEach(msg => {
    const role = msg.role === 'user' ? '👤 Yo' : '🤖 Mirexa';
    shareText += `${role}:\n${msg.content}\n\n`;
  });

  try {
    await navigator.share({
      title: session.title,
      text: shareText
    });
  } catch (error) {
    if (error.name !== 'AbortError') {
      console.error('Error compartiendo sesión:', error);
    }
  }
}

// ============================================
// TOOLBARS
// ============================================

/**
 * Alterna el estado de Pensamiento Profundo
 */
function toggleDeepThink() {
  const isActive = btnDeepThink.classList.contains('active');

  if (isActive) {
    btnDeepThink.classList.remove('active');
    resetModel();
  } else {
    btnDeepThink.classList.add('active');
    btnSmartSearch.classList.remove('active');
    setActiveModel('reasoning');
  }
}

/**
 * Alterna el estado de Búsqueda Inteligente
 */
function toggleSmartSearch() {
  const isActive = btnSmartSearch.classList.contains('active');

  if (isActive) {
    btnSmartSearch.classList.remove('active');
    resetModel();
  } else {
    btnSmartSearch.classList.add('active');
    btnDeepThink.classList.remove('active');
    setActiveModel('search');
  }
}

/**
 * Actualiza el estado visual del botón enviar
 */
function updateSendButtonState() {
  const hasText = messageTextarea.value.trim().length > 0;
  if (hasText) {
    btnSendMessage.classList.add('has-text');
  } else {
    btnSendMessage.classList.remove('has-text');
  }
}

/**
 * Ajusta automáticamente la altura del textarea
 * Respeta min-height (45px) y max-height (200px)
 */
function autoResizeTextarea() {
  // Resetear altura para obtener scrollHeight real
  messageTextarea.style.height = 'auto';
  
  // Calcular nueva altura (entre 45px y 200px)
  const minHeight = 45;
  const maxHeight = 200;
  const newHeight = Math.min(Math.max(messageTextarea.scrollHeight, minHeight), maxHeight);
  
  messageTextarea.style.height = newHeight + 'px';
}

/**
 * Maneja el envío de mensaje desde el textarea
 */
function handleSendMessage() {
  const content = messageTextarea.value.trim();
  if (!content || isBotGenerating) return;
  sendUserMessage(content);
}

// ============================================
// TOAST DE NOTIFICACIONES
// ============================================

/**
 * Muestra un toast temporal
 * @param {string} message - Mensaje a mostrar
 * @param {number} [duration=2500] - Duración en milisegundos
 */
function showToast(message, duration = 2500) {
  // Eliminar toast existente
  const existingToast = document.querySelector('.toast');
  if (existingToast) existingToast.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;

  document.body.appendChild(toast);

  // Forzar reflow para la animación
  void toast.offsetWidth;
  toast.classList.add('toast--visible');

  setTimeout(() => {
    toast.classList.remove('toast--visible');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ============================================
// UTILIDADES DE TEXTO
// ============================================

/**
 * Escapa HTML para prevenir XSS
 * @param {string} text - Texto a escapar
 * @returns {string} Texto escapado
 */
function escapeHTML(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Parsea Markdown a HTML usando el parser global (marked)
 * y envuelve los bloques de código en code-wrapper personalizado
 * @param {string} markdown - Texto en Markdown
 * @returns {string} HTML resultante
 */
function parseMarkdown(markdown) {
  if (typeof marked !== 'undefined') {
    const html = marked.parse(markdown);
    return wrapCodeBlocks(html);
  }
  // Fallback: convertir saltos de línea en <br>
  return escapeHTML(markdown).replace(/\n/g, '<br>');
}

/**
 * Envuelve los bloques <pre><code> en un code-wrapper personalizado
 * con header que muestra el lenguaje y botón de copiar
 * @param {string} html - HTML con bloques de código
 * @returns {string} HTML con code-wrappers
 */
function wrapCodeBlocks(html) {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;

  const preBlocks = tempDiv.querySelectorAll('pre');
  
  preBlocks.forEach(pre => {
    const code = pre.querySelector('code');
    if (!code) return;

    // Extraer lenguaje
    let language = '';
    const classList = code.className.split(' ');
    for (const cls of classList) {
      if (cls.startsWith('language-')) {
        language = cls.replace('language-', '');
        break;
      }
    }
    if (!language) language = 'code';

    // Obtener código crudo (textContent mantiene el texto original sin interpretar)
    const codeText = code.textContent || '';

    // Escapar para atributo data-code
    const escapedForAttribute = codeText
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Escapar para contenido HTML
    const escapedForDisplay = codeText
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Crear el code-wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'code-wrapper';

    wrapper.innerHTML = `
      <div class="code-wrapper__header">
        <span class="code-wrapper__language">${escapeHTML(language)}</span>
        <button class="code-wrapper__copy-btn" data-code="${escapedForAttribute}">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" data-iconid="473858" data-svgname="Copy">
            <g id="style=stroke">
            <g id="copy">
              <path id="rec (Stroke)" fill-rule="evenodd" clip-rule="evenodd" d="M6.25 5.25C6.25 2.50265 8.43733 0.25 11.1667 0.25H17.8333C20.5627 0.25 22.75 2.50265 22.75 5.25V13.75C22.75 16.4974 20.5627 18.75 17.8333 18.75C17.4191 18.75 17.0833 18.4142 17.0833 18C17.0833 17.5858 17.4191 17.25 17.8333 17.25C19.7064 17.25 21.25 15.6971 21.25 13.75V5.25C21.25 3.30293 19.7064 1.75 17.8333 1.75H11.1667C9.29363 1.75 7.75 3.30293 7.75 5.25C7.75 5.66421 7.41421 6 7 6C6.58579 6 6.25 5.66421 6.25 5.25Z" fill="currentColor"></path>
              <path id="rec (Stroke)_2" fill-rule="evenodd" clip-rule="evenodd" d="M1.25 10.25C1.25 7.50265 3.43733 5.25 6.16667 5.25H12.8333C15.5627 5.25 17.75 7.50265 17.75 10.25V18.75C17.75 21.4974 15.5627 23.75 12.8333 23.75H6.16667C3.43733 23.75 1.25 21.4974 1.25 18.75V10.25ZM6.16667 6.75C4.29363 6.75 2.75 8.30293 2.75 10.25V18.75C2.75 20.6971 4.29363 22.25 6.16667 22.25H12.8333C14.7064 22.25 16.25 20.6971 16.25 18.75V10.25C16.25 8.30293 14.7064 6.75 12.8333 6.75H6.16667Z" fill="currentColor"></path>
            </g>
            </g>
          </svg>
          <span>Copiar</span>
        </button>
      </div>
      <div class="code-wrapper__body">
        <pre><code class="${classList}">${escapedForDisplay}</code></pre>
      </div>
    `;

    // Reemplazar el <pre> original por el wrapper
    pre.parentNode.replaceChild(wrapper, pre);
  });

  return tempDiv.innerHTML;
}

/**
 * Configura los event listeners de los botones copiar en code-wrappers
 * Se llama después de renderizar burbujas del bot
 */
function setupCodeCopyButtons(container) {
  const copyButtons = container.querySelectorAll('.code-wrapper__copy-btn');
  
  copyButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
      const code = btn.getAttribute('data-code');
      
      try {
        await navigator.clipboard.writeText(code);
        
        // Feedback visual
        btn.classList.add('copied');
        const labelSpan = btn.querySelector('span:last-child');
        const originalText = labelSpan.textContent;
        labelSpan.textContent = '¡Copiado!';
        
        setTimeout(() => {
          btn.classList.remove('copied');
          labelSpan.textContent = originalText;
        }, 2000);
        
      } catch (error) {
        console.error('Error copiando código:', error);
        showToast('No se pudo copiar el código');
      }
    });
  });
}

// ============================================
// INICIALIZACIÓN
// ============================================

/**
 * Inicializa la aplicación
 */
function initApp() {
  // Verificación de elementos críticos
  if (!chipsContainer) {
    console.error('❌ Elemento #chips-container no encontrado. Verifica el HTML.');
    return;
  }
  if (!messagesContainer) {
    console.error('❌ Elemento #messages-container no encontrado. Verifica el HTML.');
    return;
  }
  if (!sidebarEmptyState) {
    console.error('❌ Elemento #sidebar-empty-state no encontrado. Verifica el HTML.');
    return;
  }

// Cargar sesiones desde localStorage
// Si "No guardar historial" está activo, ignorar sesiones guardadas
if (typeof isNoHistoryEnabled === 'function' && isNoHistoryEnabled()) {
  chatSessions = [];
  localStorage.removeItem(STORAGE_KEY);
} else {
  chatSessions = loadSessionsFromStorage();
}

// Si hay sesiones previas, activar la más reciente
// Si NO hay sesiones (primera vez), NO crear ninguna — pantalla limpia
if (chatSessions.length > 0) {
  activeSessionId = chatSessions[0].id;
} else {
  activeSessionId = null;
}

  // Renderizar UI inicial
  renderSidebarChips();
  renderActiveSession();
  updateShareButtonVisibility();
  
  // Inicializar configuración (switches, radio buttons, modal)
  initConfig();

  // Configurar event listeners
  setupEventListeners();
  
  console.log('✅ Mirexa AI inicializada correctamente.');
}

/**
 * Configura todos los event listeners de la UI
 */
function setupEventListeners() {
  // Header - Desktop
  if (iconMenuDesktop) iconMenuDesktop.addEventListener('click', toggleSidebar);
  if (iconNewChatDesktop) iconNewChatDesktop.addEventListener('click', handleNewChat);

  // Header - Mobile
  if (iconMenuMobile) iconMenuMobile.addEventListener('click', toggleSidebar);
  if (iconNewChatMobile) iconNewChatMobile.addEventListener('click', handleNewChat);

  // Header - Compartir sesión
  if (iconShareDesktop) iconShareDesktop.addEventListener('click', shareFullSession);
  if (iconShareMobile) iconShareMobile.addEventListener('click', shareFullSession);

  // Sidebar
  if (sidebarOverlay) sidebarOverlay.addEventListener('click', closeSidebar);
  if (newChatSidebarBtn) newChatSidebarBtn.addEventListener('click', handleNewChat);

  // Textarea
if (messageTextarea) {
  messageTextarea.addEventListener('input', () => {
    updateSendButtonState();
    autoResizeTextarea();
  });
  messageTextarea.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      if (isEnterSendEnabled()) {
        event.preventDefault();
        handleSendMessage();
      }
    }
  });
}

  // Botón enviar
  if (btnSendMessage) btnSendMessage.addEventListener('click', handleSendMessage);

  // Toolbars
  if (btnDeepThink) btnDeepThink.addEventListener('click', toggleDeepThink);
  if (btnSmartSearch) btnSmartSearch.addEventListener('click', toggleSmartSearch);

  // Cerrar sidebar con tecla Escape
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && sidebar && sidebar.classList.contains('is-open')) {
      closeSidebar();
    }
  });
}

/**
 * Maneja la creación de un nuevo chat
 */
function handleNewChat() {
  const newSession = createSession();
  setActiveSession(newSession.id);
  messageTextarea.value = '';
  messageTextarea.style.height = 'auto';
  updateSendButtonState();
  resetModel();
  btnDeepThink.classList.remove('active');
  btnSmartSearch.classList.remove('active');
  closeSidebar();
  hideEmptyState();
  messageTextarea.focus();
  hideEmptyState();
}

/**
 * Actualiza la visibilidad del botón compartir según la sesión activa
 */
function updateShareButtonVisibility() {
  const session = getActiveSession();
  const hasMessages = session && session.messages.length > 0;

  if (hasMessages) {
    iconShareDesktop.classList.remove('is-hidden');
    iconShareMobile.classList.remove('is-hidden');
  } else {
    iconShareDesktop.classList.add('is-hidden');
    iconShareMobile.classList.add('is-hidden');
  }
}


// Sobrescribir setActiveSession para incluir actualización de botón compartir
const originalSetActiveSession = setActiveSession;
setActiveSession = function (sessionId) {
  originalSetActiveSession(sessionId);
  updateShareButtonVisibility();
};

// ============================================
// ARRANQUE DE LA APLICACIÓN
// ============================================

document.addEventListener('DOMContentLoaded', initApp);