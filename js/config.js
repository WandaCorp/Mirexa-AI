/**
 * ============================================
 * config.js
 * Lógica del modal de configuración
 * Switches, radio buttons, eliminar historial
 * Proyecto: Mirexa AI Chatbot
 * ============================================
 */

// ============================================
// REFERENCIAS DEL DOM DEL MODAL
// ============================================

/** @type {HTMLElement} Overlay del modal de configuración */
const configOverlay = document.getElementById('config-overlay');

/** @type {HTMLElement} Modal de configuración */
const configModal = document.getElementById('config-modal');

/** @type {HTMLButtonElement} Botón cerrar modal */
const configCloseBtn = document.getElementById('config-close-btn');

/** @type {HTMLButtonElement} Switch "Enviar al presionar Enter" */
const switchEnterSend = document.getElementById('switch-enter-send');

/** @type {HTMLButtonElement} Switch "No guardar consultas en el historial" */
const switchNoHistory = document.getElementById('switch-no-history');

/** @type {HTMLButtonElement} Botón eliminar historial */
const btnDeleteHistory = document.getElementById('btn-delete-history');

// ============================================
// CONSTANTES DE CONFIGURACIÓN
// ============================================

/** @constant {string} Clave para switch Enter Send */
const ENTER_SEND_KEY = 'mirexa_enter_send';

/** @constant {string} Clave para switch No History */
const NO_HISTORY_KEY = 'mirexa_no_history';

// ============================================
// ESTADO DE CONFIGURACIÓN
// ============================================

/**
 * Obtiene el estado del switch Enter Send
 * @returns {boolean} true si Enter envía
 */
function isEnterSendEnabled() {
  const saved = localStorage.getItem(ENTER_SEND_KEY);
  // Por defecto: activado (true)
  if (saved === null) return true;
  return saved === 'true';
}

/**
 * Obtiene el estado del switch No History
 * @returns {boolean} true si NO se guarda historial
 */
function isNoHistoryEnabled() {
  const saved = localStorage.getItem(NO_HISTORY_KEY);
  // Por defecto: activado (true) — no guardar
  if (saved === null) return true;
  return saved === 'true';
}

// ============================================
// APERTURA / CIERRE DEL MODAL
// ============================================

/**
 * Abre el modal de configuración
 */
function openConfigModal() {
  configModal.classList.add('is-open');
  configOverlay.classList.add('is-visible');
  configOverlay.setAttribute('aria-hidden', 'false');
  configModal.setAttribute('aria-modal', 'true');
}

/**
 * Cierra el modal de configuración
 */
function closeConfigModal() {
  configModal.classList.remove('is-open');
  configOverlay.classList.remove('is-visible');
  configOverlay.setAttribute('aria-hidden', 'true');
}

// ============================================
// SINCRONIZACIÓN VISUAL DE SWITCHES
// ============================================

/**
 * Actualiza el aspecto visual de un switch según su estado
 * @param {HTMLButtonElement} switchBtn - Botón switch
 * @param {boolean} isActive - Estado activo
 */
function updateSwitchVisual(switchBtn, isActive) {
  if (isActive) {
    switchBtn.setAttribute('aria-checked', 'true');
  } else {
    switchBtn.setAttribute('aria-checked', 'false');
  }
}

/**
 * Sincroniza todos los switches con sus valores en localStorage
 */
function syncSwitchesFromStorage() {
  updateSwitchVisual(switchEnterSend, isEnterSendEnabled());
  updateSwitchVisual(switchNoHistory, isNoHistoryEnabled());
}

// ============================================
// TOGGLE DE SWITCHES
// ============================================

/**
 * Alterna el switch "Enviar al presionar Enter"
 */
function toggleEnterSend() {
  const currentValue = isEnterSendEnabled();
  const newValue = !currentValue;
  localStorage.setItem(ENTER_SEND_KEY, newValue.toString());
  updateSwitchVisual(switchEnterSend, newValue);
}

/**
 * Alterna el switch "No guardar consultas en el historial"
 */
function toggleNoHistory() {
  const currentValue = isNoHistoryEnabled();
  const newValue = !currentValue;
  localStorage.setItem(NO_HISTORY_KEY, newValue.toString());
  updateSwitchVisual(switchNoHistory, newValue);
}

// ============================================
// SINCRONIZACIÓN DE RADIO BUTTONS
// ============================================

/**
 * Sincroniza los radio buttons con el modo guardado en localStorage
 */
function syncRadioButtonsFromStorage() {
  const currentMode = getCurrentResponseMode();
  const radioInputs = document.querySelectorAll('input[name="response-mode"]');
  
  radioInputs.forEach(input => {
    if (input.value === currentMode) {
      input.checked = true;
    }
  });
}

/**
 * Maneja el cambio de modo de respuesta
 * @param {string} modeId - ID del modo seleccionado
 */
function handleResponseModeChange(modeId) {
  setResponseMode(modeId);
}

// ============================================
// ELIMINAR HISTORIAL
// ============================================

/**
 * Elimina todo el historial de consultas (sidebar y localStorage)
 */
function deleteAllHistory() {
  const confirmed = confirm(
    '¿Estás seguro de eliminar todo el historial de consultas?\n\nEsta acción no se puede deshacer.'
  );
  
  if (!confirmed) return;

  // Eliminar localStorage
  localStorage.removeItem(STORAGE_KEY);

  // Reiniciar array de sesiones a vacío (sin crear nueva)
  chatSessions = [];
  activeSessionId = null;

  // Re-renderizar UI — pantalla limpia
  renderSidebarChips();
  renderActiveSession();
  updateShareButtonVisibility();

  // Mostrar confirmación
  showToast('Historial eliminado correctamente');
}

// ============================================
// INICIALIZACIÓN
// ============================================

/**
 * Inicializa el módulo de configuración
 */
function initConfig() {
  // Sincronizar switches con localStorage
  syncSwitchesFromStorage();
  
  // Sincronizar radio buttons con localStorage
  syncRadioButtonsFromStorage();

  // Event listeners

  // Abrir modal desde botón de settings del sidebar
  if (sidebarSettingsBtn) {
    sidebarSettingsBtn.addEventListener('click', openConfigModal);
  }

  // Cerrar modal
  if (configCloseBtn) {
    configCloseBtn.addEventListener('click', closeConfigModal);
  }

  // Cerrar con overlay
  if (configOverlay) {
    configOverlay.addEventListener('click', closeConfigModal);
  }

  // Cerrar con tecla Escape
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && configModal && configModal.classList.contains('is-open')) {
      closeConfigModal();
    }
  });

  // Switches
  if (switchEnterSend) {
    switchEnterSend.addEventListener('click', toggleEnterSend);
  }

  if (switchNoHistory) {
    switchNoHistory.addEventListener('click', toggleNoHistory);
  }

  // Botón eliminar historial
  if (btnDeleteHistory) {
    btnDeleteHistory.addEventListener('click', deleteAllHistory);
  }

  // Radio buttons de modo de respuesta
  const radioInputs = document.querySelectorAll('input[name="response-mode"]');
  radioInputs.forEach(input => {
    input.addEventListener('change', () => {
      if (input.checked) {
        handleResponseModeChange(input.value);
      }
    });
  });

  console.log('✅ Configuración inicializada correctamente.');
}