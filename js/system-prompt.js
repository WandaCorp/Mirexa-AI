/**
 * ============================================
 * system-prompt.js
 * Gestión de modos de respuesta del bot
 * Proyecto: Mirexa AI Chatbot
 * ============================================
 */

// ============================================
// MODOS DE RESPUESTA
// ============================================

/**
 * @typedef {Object} ResponseMode
 * @property {string} id - Identificador único
 * @property {string} label - Etiqueta visible en UI
 * @property {string} systemPrompt - Instrucción de sistema para la API
 */

/** @type {Object.<string, ResponseMode>} Modos de respuesta disponibles */
const RESPONSE_MODES = {
  standard: {
    id: 'standard',
    label: 'Respuesta Estándar',
    systemPrompt: 'Responde de forma libre, natural y útil. Adapta tu estilo de respuesta al contexto de la conversación.'
  },

  'result-only': {
    id: 'result-only',
    label: 'Solo Resultado',
    systemPrompt: `Responde ÚNICAMENTE con el resultado final o la respuesta directa.
    - No incluyas explicaciones, pasos intermedios, ni comentarios adicionales.
    - Sé conciso y directo. Entrega solo lo que se te pide, sin adornos ni introducciones.
    - No uses frases como "Aquí está", "El resultado es", ni similares. Solo el contenido solicitado.`
  },

  'result-explanation': {
    id: 'result-explanation',
    label: 'Resultado y explicación',
    systemPrompt: `Estructura tu respuesta en dos secciones claramente separadas:
    
    **📌 Resultado:**
    - Presenta primero el resultado final de forma clara y directa.

    **📝 Explicación:**
    - Luego, desarrolla una explicación detallada paso a paso de cómo llegaste a ese resultado.
    - Incluye razonamiento, metodología y cualquier detalle relevante para la comprensión.
    - Usa exactamente este formato con los encabezados indicados.`
  }
};

/** @constant {string} Clave para localStorage */
const RESPONSE_MODE_STORAGE_KEY = 'mirexa_response_mode';

/** @constant {string} Modo por defecto */
const DEFAULT_RESPONSE_MODE = 'standard';

// ============================================
// FUNCIONES DE GESTIÓN
// ============================================

/**
 * Obtiene el modo de respuesta actual desde localStorage
 * @returns {string} ID del modo de respuesta activo
 */
function getCurrentResponseMode() {
  const saved = localStorage.getItem(RESPONSE_MODE_STORAGE_KEY);
  if (saved && RESPONSE_MODES[saved]) {
    return saved;
  }
  return DEFAULT_RESPONSE_MODE;
}

/**
 * Establece el modo de respuesta y lo persiste
 * @param {string} modeId - ID del modo a activar
 * @returns {string} ID del modo establecido
 */
function setResponseMode(modeId) {
  if (RESPONSE_MODES[modeId]) {
    localStorage.setItem(RESPONSE_MODE_STORAGE_KEY, modeId);
    return modeId;
  }
  return getCurrentResponseMode();
}

/**
 * Obtiene el prompt de sistema según el modo actual
 * @param {string} [modeId] - ID del modo (opcional, usa el actual si no se especifica)
 * @returns {string} Prompt de sistema
 */
function getSystemPrompt(modeId) {
  const mode = modeId || getCurrentResponseMode();
  if (RESPONSE_MODES[mode]) {
    return RESPONSE_MODES[mode].systemPrompt;
  }
  return RESPONSE_MODES[DEFAULT_RESPONSE_MODE].systemPrompt;
}

/**
 * Inyecta el prompt de sistema al inicio del array de mensajes
 * @param {Array<{role: string, content: string}>} messages - Array de mensajes
 * @param {string} [modeId] - ID del modo (opcional)
 * @returns {Array<{role: string, content: string}>} Array con prompt de sistema inyectado
 */
function injectSystemPrompt(messages, modeId) {
  const systemPrompt = getSystemPrompt(modeId);
  return [
    { role: 'system', content: systemPrompt },
    ...messages
  ];
}

// ============================================
// EXPORTACIONES GLOBALES
// ============================================

window.RESPONSE_MODES = RESPONSE_MODES;
window.getCurrentResponseMode = getCurrentResponseMode;
window.setResponseMode = setResponseMode;
window.getSystemPrompt = getSystemPrompt;
window.injectSystemPrompt = injectSystemPrompt;