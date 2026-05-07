/**
 * ============================================
 * script-basic.js
 * Referencias del DOM - Elementos, botones, IDs
 * Proyecto: Mirexa AI Chatbot
 * ============================================
 */

// ============================================
// OVERLAY
// ============================================

/** @type {HTMLElement} Overlay del sidebar */
const sidebarOverlay = document.getElementById('sidebar-overlay');

// ============================================
// SIDEBAR
// ============================================

/** @type {HTMLElement} Sidebar lateral de historial */
const sidebar = document.getElementById('sidebar');

/** @type {HTMLElement} Contenedor de chips de historial */
const chipsContainer = document.getElementById('chips-container');

/** @type {HTMLElement} Estado vacío del sidebar */
const sidebarEmptyState = document.getElementById('sidebar-empty-state');

/** @type {HTMLButtonElement} Botón "Nuevo Chat" dentro del sidebar */
const newChatSidebarBtn = document.getElementById('new-chat-sidebar');

/** @type {HTMLButtonElement} Botón de configuración del sidebar */
const sidebarSettingsBtn = document.getElementById('sidebar-settings-btn');

// ============================================
// HEADER - DESKTOP
// ============================================

/** @type {HTMLButtonElement} Botón menú hamburguesa (desktop) */
const iconMenuDesktop = document.getElementById('icon-menu-desktop');

/** @type {HTMLButtonElement} Botón nuevo chat (desktop) */
const iconNewChatDesktop = document.getElementById('icon-newchat-desktop');

/** @type {HTMLButtonElement} Botón compartir (desktop) - oculto por defecto */
const iconShareDesktop = document.getElementById('icon-share-desktop');

// ============================================
// HEADER - MOBILE
// ============================================

/** @type {HTMLButtonElement} Botón menú hamburguesa (mobile) */
const iconMenuMobile = document.getElementById('icon-menu-mobile');

/** @type {HTMLButtonElement} Botón nuevo chat (mobile) */
const iconNewChatMobile = document.getElementById('icon-newchat-mobile');

/** @type {HTMLButtonElement} Botón compartir (mobile) - oculto por defecto */
const iconShareMobile = document.getElementById('icon-share-mobile');

// ============================================
// MAIN CHAT
// ============================================

/** @type {HTMLElement} Contenedor principal del chat */
const mainChatContainer = document.getElementById('main-chat-container');

/** @type {HTMLElement} Contenedor de burbujas de mensajes */
const messagesContainer = document.getElementById('messages-container');

// ============================================
// MESSAGE AREA INPUT
// ============================================

/** @type {HTMLElement} Contenedor del área de entrada de mensajes */
const messageAreaInput = document.getElementById('message-area-input');

/** @type {HTMLTextAreaElement} Textarea para escribir mensajes */
const messageTextarea = document.getElementById('message-textarea');

/** @type {HTMLButtonElement} Botón "Pensamiento Profundo" */
const btnDeepThink = document.getElementById('btn-deep-think');

/** @type {HTMLButtonElement} Botón "Búsqueda Inteligente" */
const btnSmartSearch = document.getElementById('btn-smart-search');

/** @type {HTMLButtonElement} Botón enviar mensaje */
const btnSendMessage = document.getElementById('btn-send-message');