/**
 * ============================================
 * api-config.js
 * Configuración y comunicación con Pollinations.ai
 * Basado en modelos reales del endpoint /v1/models
 * ============================================
 */

// ===== CONFIGURACIÓN PRINCIPAL =====
const API_CONFIG = {
  /** @type {string} API Key (entorno de prueba sk_) */
  apiKey: 'sk_ZkpCEOhkuwM4oFOeKpWJzqeInHM9aUjT',

  /** @type {string} URL base de Pollinations.ai */
  baseURL: 'https://gen.pollinations.ai',

  /**
   * IDs de modelos verificados contra /v1/models
   * Solo modelos de texto (chat completions)
   */
  models: {
    /** Modelo por defecto para conversación general */
    base: 'openai',
    /** Modelo activado con botón "Pensamiento Profundo" */
    reasoning: 'perplexity-reasoning',
    /** Modelo activado con botón "Búsqueda Inteligente" */
    search: 'gemini-search'
  },

  /**
   * Endpoints disponibles
   */
  endpoints: {
    chat: '/v1/chat/completions',
    models: '/v1/models',
    audio: '/audio'
  },

  /** Opciones por defecto para peticiones */
  defaultOptions: {
    temperature: 0.7,
    stream: true
  },

  /**
   * Headers para autenticación
   * @returns {Object} Headers HTTP
   */
  getHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`
    };
  }
};

// ===== ESTADO GLOBAL =====

/** @type {string} Modelo actualmente activo */
let currentModel = localStorage.getItem('mirexa_current_model') || API_CONFIG.models.base;

/**
 * Cambia el modelo activo
 * @param {string} modelKey - Clave del modelo ('base', 'reasoning', 'search') o ID directo
 * @returns {string} Nuevo modelo activo
 */
function setActiveModel(modelKey) {
  const modelMap = {
    'base': API_CONFIG.models.base,
    'reasoning': API_CONFIG.models.reasoning,
    'search': API_CONFIG.models.search,
    'think': API_CONFIG.models.reasoning,     // alias
    'deep': API_CONFIG.models.reasoning       // alias
  };

  currentModel = modelMap[modelKey] || modelKey || API_CONFIG.models.base;
  localStorage.setItem('mirexa_current_model', currentModel);
  return currentModel;
}

/**
 * Restaura el modelo por defecto (openai)
 * @returns {string} Modelo restaurado
 */
function resetModel() {
  currentModel = API_CONFIG.models.base;
  localStorage.setItem('mirexa_current_model', currentModel);
  return currentModel;
}

/**
 * Obtiene la temperatura actual desde localStorage
 * @returns {number} Temperatura (0-1)
 */
function getCurrentTemperature() {
  const saved = localStorage.getItem('mirexa_temperature');
  return saved ? parseFloat(saved) : API_CONFIG.defaultOptions.temperature;
}

/**
 * Establece la temperatura y la persiste
 * @param {number} temp - Nueva temperatura (0-1)
 */
function setTemperature(temp) {
  const clamped = Math.min(1, Math.max(0, temp));
  localStorage.setItem('mirexa_temperature', clamped.toString());
}

// ===== FUNCIÓN PRINCIPAL DE CHAT (STREAMING) =====

/**
 * Llama a la API de Pollinations.ai con streaming SSE
 * @param {Array<{role: string, content: string}>} messages - Historial de mensajes
 * @param {Function} onChunk - Callback con cada fragmento de texto recibido
 * @param {Object} [options] - Opciones adicionales
 * @param {number} [options.temperature] - Temperatura (0-1)
 * @param {AbortSignal} [options.signal] - Señal para cancelar petición
 * @returns {Promise<boolean>} true si la llamada fue exitosa
 */
async function callPollinationsAPI(messages, onChunk, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  const temperature = options.temperature || getCurrentTemperature();
  const signal = options.signal || controller.signal;

  try {
    const response = await fetch(
      `${API_CONFIG.baseURL}${API_CONFIG.endpoints.chat}`,
      {
        method: 'POST',
        headers: API_CONFIG.getHeaders(),
        // En callPollinationsAPI, agregar:
        body: JSON.stringify({
          model: currentModel,
          messages: injectSystemPrompt(messages),
          stream: true,
          temperature: temperature,
          thinking: { type: "enabled", budget_tokens: 2048 } // ← NUEVO
        }),
        signal: signal
      }
    );

    if (!response.ok) {
      let errorMsg = `Error ${response.status}`;
      try {
        const errorData = await response.json();
        errorMsg = errorData.error?.message || errorMsg;
      } catch (e) {
        // Si no se puede parsear JSON
      }
      throw new Error(errorMsg);
    }

    // Procesar stream SSE
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            let content = parsed.choices?.[0]?.delta?.content || '';
            // Filtrar tool calls internos de gemini-search
            if (content.startsWith('<tool_code') || content.includes('google_search')) { 
              content = '';
            }
            if (content && onChunk) {
              onChunk(content);
            }
          } catch (e) {
            // Ignorar líneas mal formadas
          }
        }
      }
    }

    clearTimeout(timeoutId);
    return true;

  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Tiempo de espera agotado. Verifica tu conexión.');
    }
    throw error;
  }
}

// ===== TTS — TEXTO A VOZ =====

/**
 * Genera audio TTS a partir de texto
 * Usa el endpoint /audio/{text} con voz 'nova' o 'alloy'
 * @param {string} text - Texto a convertir en voz
 * @param {Object} [options] - Opciones
 * @param {string} [options.voice='nova'] - Voz a utilizar
 * @returns {Promise<string>} URL del blob de audio
 */
async function generateSpeech(text, options = {}) {
  const voice = options.voice || 'nova';
  const encodedText = encodeURIComponent(text);
  const url = `${API_CONFIG.baseURL}${API_CONFIG.endpoints.audio}/${encodedText}?voice=${voice}`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${API_CONFIG.apiKey}`
    }
  });

  if (!response.ok) {
    throw new Error(`Error TTS (${response.status}): ${response.statusText}`);
  }

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

// ===== DESCUBRIMIENTO DE MODELOS =====

/**
 * Obtiene la lista de modelos disponibles desde la API
 * @returns {Promise<Array>} Lista de modelos
 */
async function fetchAvailableModels() {
  const response = await fetch(
    `${API_CONFIG.baseURL}${API_CONFIG.endpoints.models}`
  );

  if (!response.ok) {
    throw new Error(`Error obteniendo modelos (${response.status})`);
  }

  const data = await response.json();
  return data.data || [];
}

// ===== EXPORTACIONES GLOBALES =====
window.API_CONFIG = API_CONFIG;
window.currentModel = currentModel;
window.setActiveModel = setActiveModel;
window.resetModel = resetModel;
window.getCurrentTemperature = getCurrentTemperature;
window.setTemperature = setTemperature;
window.callPollinationsAPI = callPollinationsAPI;
window.generateSpeech = generateSpeech;
window.fetchAvailableModels = fetchAvailableModels;